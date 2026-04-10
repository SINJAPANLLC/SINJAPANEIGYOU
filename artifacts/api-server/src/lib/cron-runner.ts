import cron from "node-cron";
import { eq, and } from "drizzle-orm";
import { db, cronJobsTable, businessesTable, leadsTable, templatesTable, emailLogsTable, unsubscribesTable } from "@workspace/db";
import { searchAndCrawlLeads } from "./search";
import { sendEmail } from "./mailer";
import { logger } from "./logger";
import { v4 as uuidv4 } from "uuid";

const activeTasks = new Map<number, cron.ScheduledTask>();

function buildUnsubscribeLink(token: string) {
  const base = process.env.APP_URL || `https://${process.env.REPLIT_DEV_DOMAIN || "localhost"}`;
  return `${base}/api/unsubscribe/${token}`;
}

async function runLeadSearch(jobId: number, businessId: number, config: Record<string, unknown>) {
  const keyword = String(config.keyword || "");
  const location = config.location ? String(config.location) : null;
  const maxResults = Number(config.maxResults || 10);

  if (!keyword) {
    logger.warn({ jobId }, "cron:lead_search skipped — no keyword");
    return;
  }

  logger.info({ jobId, keyword, location, maxResults }, "cron:lead_search start");
  try {
    const results = await searchAndCrawlLeads(keyword, location, maxResults);
    let saved = 0;
    for (const r of results) {
      if (r.websiteUrl) {
        const existing = await db.select().from(leadsTable).where(
          and(eq(leadsTable.businessId, businessId), eq(leadsTable.websiteUrl, r.websiteUrl))
        );
        if (existing.length > 0) continue;
      }
      await db.insert(leadsTable).values({
        businessId,
        companyName: r.companyName ?? null,
        websiteUrl: r.websiteUrl,
        email: r.email ?? null,
        contactUrl: r.contactUrl ?? null,
        phone: r.phone ?? null,
        address: r.address ?? null,
        status: "unsent",
        score: r.score,
      });
      saved++;
    }
    logger.info({ jobId, found: results.length, saved }, "cron:lead_search done");
  } catch (err) {
    logger.error({ err, jobId }, "cron:lead_search error");
  }
}

async function runEmailSend(jobId: number, businessId: number, config: Record<string, unknown>) {
  logger.info({ jobId, businessId }, "cron:email_send start");
  try {
    const [business] = await db.select().from(businessesTable).where(eq(businessesTable.id, businessId));
    if (!business) return;

    const templateId = config.templateId ? Number(config.templateId) : null;
    let template = null;
    if (templateId) {
      const [t] = await db.select().from(templatesTable).where(eq(templatesTable.id, templateId));
      template = t ?? null;
    } else {
      const [t] = await db.select().from(templatesTable).where(eq(templatesTable.businessId, businessId));
      template = t ?? null;
    }
    if (!template) {
      logger.warn({ jobId }, "cron:email_send no template found");
      return;
    }

    const leads = await db.select().from(leadsTable).where(
      and(eq(leadsTable.businessId, businessId), eq(leadsTable.status, "unsent"))
    );
    const leadsWithEmail = leads.filter(l => l.email);

    const fromEmail = process.env.SMTP_USER || business.senderEmail || "";
    const fromName = business.senderName || business.name;
    let sent = 0;

    for (const lead of leadsWithEmail) {
      const company = lead.companyName || "御社";
      const subject = template.subjectTemplate
        .replace(/{{company_name}}/g, company)
        .replace(/{{service_name}}/g, business.name)
        .replace(/{{service_url}}/g, business.serviceUrl || "");

      const token = uuidv4();
      await db.insert(unsubscribesTable).values({ leadId: lead.id, token }).onConflictDoNothing();
      const unsubLink = `<p style="font-size:12px;color:#999;margin-top:20px;">配信停止は<a href="${buildUnsubscribeLink(token)}">こちら</a></p>`;

      const html = template.htmlTemplate
        .replace(/{{company_name}}/g, company)
        .replace(/{{service_name}}/g, business.name)
        .replace(/{{service_url}}/g, business.serviceUrl || "")
        + unsubLink
        + (business.signatureHtml || "");

      const result = await sendEmail({ from: `"${fromName}" <${fromEmail}>`, to: lead.email!, subject, html });
      if (result.success) {
        sent++;
        await db.update(leadsTable).set({ status: "sent" }).where(eq(leadsTable.id, lead.id));
        await db.insert(emailLogsTable).values({ leadId: lead.id, subject, html, status: "sent", sentAt: new Date() });
      }
    }
    logger.info({ jobId, sent }, "cron:email_send done");
  } catch (err) {
    logger.error({ err, jobId }, "cron:email_send error");
  }
}

async function runLeadSearchAndSend(jobId: number, businessId: number, config: Record<string, unknown>) {
  const keyword = String(config.keyword || "");
  const location = config.location ? String(config.location) : null;
  const maxResults = Number(config.maxResults || 10);

  if (!keyword) {
    logger.warn({ jobId }, "cron:lead_search_and_send skipped — no keyword");
    return;
  }

  logger.info({ jobId, keyword, location, maxResults }, "cron:lead_search_and_send start");

  const [business] = await db.select().from(businessesTable).where(eq(businessesTable.id, businessId));
  if (!business) return;

  const templateId = config.templateId ? Number(config.templateId) : null;
  let template = null;
  if (templateId) {
    const [t] = await db.select().from(templatesTable).where(eq(templatesTable.id, templateId));
    template = t ?? null;
  } else {
    const [t] = await db.select().from(templatesTable).where(eq(templatesTable.businessId, businessId));
    template = t ?? null;
  }

  let results;
  try {
    results = await searchAndCrawlLeads(keyword, location, maxResults);
  } catch (err) {
    logger.error({ err, jobId }, "cron:lead_search_and_send search error");
    return;
  }

  const newLeads = [];
  for (const r of results) {
    if (r.websiteUrl) {
      const existing = await db.select().from(leadsTable).where(
        and(eq(leadsTable.businessId, businessId), eq(leadsTable.websiteUrl, r.websiteUrl))
      );
      if (existing.length > 0) continue;
    }
    const [lead] = await db.insert(leadsTable).values({
      businessId,
      companyName: r.companyName ?? null,
      websiteUrl: r.websiteUrl,
      email: r.email ?? null,
      contactUrl: r.contactUrl ?? null,
      phone: r.phone ?? null,
      address: r.address ?? null,
      status: "unsent",
      score: r.score,
    }).returning();
    newLeads.push(lead);
  }

  logger.info({ jobId, found: results.length, saved: newLeads.length }, "cron:lead_search_and_send leads done");

  if (!template) {
    logger.warn({ jobId }, "cron:lead_search_and_send no template, skipping email");
    return;
  }

  const leadsWithEmail = newLeads.filter(l => l.email);
  const fromEmail = process.env.SMTP_USER || business.senderEmail || "";
  const fromName = business.senderName || business.name;
  let sent = 0;

  for (const lead of leadsWithEmail) {
    const company = lead.companyName || "御社";
    const subject = template.subjectTemplate
      .replace(/{{company_name}}/g, company)
      .replace(/{{service_name}}/g, business.name)
      .replace(/{{service_url}}/g, business.serviceUrl || "");

    const token = uuidv4();
    await db.insert(unsubscribesTable).values({ leadId: lead.id, token }).onConflictDoNothing();
    const unsubLink = `<p style="font-size:12px;color:#999;margin-top:20px;">配信停止は<a href="${buildUnsubscribeLink(token)}">こちら</a></p>`;

    const html = template.htmlTemplate
      .replace(/{{company_name}}/g, company)
      .replace(/{{service_name}}/g, business.name)
      .replace(/{{service_url}}/g, business.serviceUrl || "")
      + unsubLink
      + (business.signatureHtml || "");

    const result = await sendEmail({ from: `"${fromName}" <${fromEmail}>`, to: lead.email!, subject, html });
    if (result.success) {
      sent++;
      await db.update(leadsTable).set({ status: "sent" }).where(eq(leadsTable.id, lead.id));
      await db.insert(emailLogsTable).values({ leadId: lead.id, subject, html, status: "sent", sentAt: new Date() });
    }
  }

  logger.info({ jobId, sent }, "cron:lead_search_and_send emails done");
}

async function syncJobs() {
  try {
    const jobs = await db.select().from(cronJobsTable);

    const activeIds = new Set(jobs.filter(j => j.isActive).map(j => j.id));
    const scheduledIds = new Set(activeTasks.keys());

    for (const id of scheduledIds) {
      if (!activeIds.has(id)) {
        activeTasks.get(id)?.stop();
        activeTasks.delete(id);
        logger.info({ jobId: id }, "cron: unscheduled job");
      }
    }

    for (const job of jobs) {
      if (!job.isActive) continue;
      if (activeTasks.has(job.id)) continue;

      if (!cron.validate(job.cronExpression)) {
        logger.warn({ jobId: job.id, expr: job.cronExpression }, "cron: invalid expression, skipping");
        continue;
      }

      const businessId = job.businessId;
      let config: Record<string, unknown> = {};
      try { config = JSON.parse(job.config || "{}"); } catch { config = {}; }

      const task = cron.schedule(job.cronExpression, async () => {
        logger.info({ jobId: job.id, type: job.type }, "cron: running job");
        await db.update(cronJobsTable).set({ lastRunAt: new Date() }).where(eq(cronJobsTable.id, job.id));

        if (job.type === "lead_search") {
          await runLeadSearch(job.id, businessId, config);
        } else if (job.type === "email_send") {
          await runEmailSend(job.id, businessId, config);
        } else if (job.type === "lead_search_and_send") {
          await runLeadSearchAndSend(job.id, businessId, config);
        }
      });

      activeTasks.set(job.id, task);
      logger.info({ jobId: job.id, expr: job.cronExpression, type: job.type }, "cron: scheduled job");
    }
  } catch (err) {
    logger.error({ err }, "cron: syncJobs error");
  }
}

export function startCronRunner() {
  syncJobs();
  cron.schedule("*/5 * * * *", syncJobs);
  logger.info("cron: runner started");
}
