import cron from "node-cron";
import { eq, and, lt } from "drizzle-orm";
import { db, cronJobsTable, businessesTable, leadsTable, templatesTable, emailLogsTable, unsubscribesTable } from "@workspace/db";
import { searchAndCrawlLeads, detectPersona, type PersonaType } from "./search";
import { sendEmail } from "./mailer";
import { logger } from "./logger";
import { v4 as uuidv4 } from "uuid";
import { nextCronRun } from "./cron-utils";
import { renderEmail, auditEmail } from "./email-renderer";
import { buildUnsubscribeUrl } from "./unsubscribe-url";

const activeTasks = new Map<number, { task: ReturnType<typeof cron.schedule>; fingerprint: string }>();
const COMPANY_WEBSITE = process.env.COMPANY_WEBSITE || "https://sinjapan.work";

// 1日あたりの全ジョブ合計メール送信上限（環境変数 DAILY_EMAIL_LIMIT で変更可能）
const DAILY_EMAIL_LIMIT = parseInt(process.env.DAILY_EMAIL_LIMIT || "100");
let dailyEmailsSent = 0;
let dailyResetDate = new Date().toDateString();

function checkAndIncrementDailyLimit(): boolean {
  const today = new Date().toDateString();
  if (today !== dailyResetDate) {
    dailyEmailsSent = 0;
    dailyResetDate = today;
    logger.info({ DAILY_EMAIL_LIMIT }, "cron: daily email counter reset");
  }
  if (dailyEmailsSent >= DAILY_EMAIL_LIMIT) {
    logger.warn({ dailyEmailsSent, DAILY_EMAIL_LIMIT }, "cron: daily email limit reached, skipping send");
    return false;
  }
  dailyEmailsSent++;
  return true;
}

// 同時に実行できるリード検索ジョブは1つだけ（Yahoo Japan への並列リクエストを防ぐ）
let searchLock = false;
async function acquireSearchLock(jobId: number, timeoutMs = 10 * 60 * 1000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (searchLock) {
    if (Date.now() > deadline) {
      logger.warn({ jobId }, "cron: search lock timeout, skipping job");
      return false;
    }
    await new Promise(r => setTimeout(r, 5000)); // 5秒ごとに再チェック
  }
  searchLock = true;
  return true;
}
function releaseSearchLock() { searchLock = false; }

// フッターのMailアドレス行の直後にサイトURLを挿入する
function injectWebsiteIntoFooter(html: string, websiteUrl: string): string {
  if (!websiteUrl || html.includes(websiteUrl)) return html;
  const siteRow = `<tr><td style="color:#93c5fd;font-size:11px;padding:3px 0;white-space:nowrap;width:60px;">サイト</td><td style="font-size:11px;padding:3px 0;"><a href="${websiteUrl}" style="color:#bfdbfe;text-decoration:none;" target="_blank">${websiteUrl}</a></td></tr>`;
  // 許認可行の前に挿入（フッターテーブル内）
  if (html.includes("許認可")) {
    return html.replace(/(<tr>[^<]*<td[^>]*>許認可<\/td>)/i, `${siteRow}$1`);
  }
  // Mailアドレス行の直後に挿入
  const mailRowEnd = "</tr>";
  const mailIdx = html.lastIndexOf("info@sinjapan.jp");
  if (mailIdx !== -1) {
    const afterMail = html.indexOf(mailRowEnd, mailIdx);
    if (afterMail !== -1) {
      return html.slice(0, afterMail + mailRowEnd.length) + siteRow + html.slice(afterMail + mailRowEnd.length);
    }
  }
  return html;
}

async function runLeadSearch(jobId: number, businessId: number, config: Record<string, unknown>) {
  const keyword = String(config.keyword || "");
  const location = config.location ? String(config.location) : null;
  const maxResults = Number(config.maxResults || 10);
  const persona = config.persona ? String(config.persona) as PersonaType : detectPersona(keyword);
  const targetEmailCount = Number(config.targetEmailCount || maxResults);

  if (!keyword) {
    logger.warn({ jobId }, "cron:lead_search skipped — no keyword");
    return;
  }

  logger.info({ jobId, keyword, location, maxResults, persona, targetEmailCount }, "cron:lead_search start");
  if (!await acquireSearchLock(jobId)) return;
  try {
    const results = await searchAndCrawlLeads(keyword, location, maxResults, persona, targetEmailCount);
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
    throw err;
  } finally {
    releaseSearchLock();
  }
}

async function runEmailSend(jobId: number, businessId: number, config: Record<string, unknown>) {
  const maxPerRun = Number(config.maxPerRun || 30);
  logger.info({ jobId, businessId, maxPerRun }, "cron:email_send start");
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
    if (!template || template.businessId !== businessId) {
      logger.warn({ jobId }, "cron:email_send no template found");
      return;
    }

    const leads = await db.select().from(leadsTable).where(
      and(eq(leadsTable.businessId, businessId), eq(leadsTable.status, "unsent"))
    );
    const leadsWithEmail = leads.filter(l => l.email).slice(0, maxPerRun);

    const fromEmail = process.env.SMTP_USER || business.senderEmail || "";
    const fromName = business.senderName || business.name;
    let sent = 0;

    for (const lead of leadsWithEmail) {
      const company = lead.companyName || "御社";
      const token = uuidv4();
      await db.insert(unsubscribesTable).values({ leadId: lead.id, token }).onConflictDoNothing();
      const unsubUrl = buildUnsubscribeUrl(token);
      const fallbackUnsubLink = `<p style="font-size:12px;color:#999;margin-top:20px;">配信停止は<a href="${unsubUrl}">こちら</a></p>`;
      const rendered = renderEmail(template.subjectTemplate, template.htmlTemplate, { companyName: company, serviceName: business.name, serviceUrl: business.serviceUrl || "", unsubscribeUrl: unsubUrl });
      const subject = rendered.subject;
      const replaced = rendered.html;
      const withSite = injectWebsiteIntoFooter(replaced, COMPANY_WEBSITE);
      const html = withSite
        + (withSite.includes(unsubUrl) ? "" : fallbackUnsubLink)
        + (business.signatureHtml || "");

      if (!checkAndIncrementDailyLimit()) break;
      const claimed = await db.update(leadsTable).set({ status: "sending" }).where(and(eq(leadsTable.id, lead.id), eq(leadsTable.status, "unsent"))).returning();
      if (!claimed.length) continue;
      const audit = auditEmail(subject, html);
      const result = audit.valid ? await sendEmail({ from: `"${fromName}" <${fromEmail}>`, to: lead.email!, subject, html }) : { success: false, error: audit.errors.join(" / ") };
      if (result.success) {
        sent++;
        await db.update(leadsTable).set({ status: "sent" }).where(eq(leadsTable.id, lead.id));
        await db.insert(emailLogsTable).values({ leadId: lead.id, subject, html, status: "sent", sentAt: new Date(), toEmail: lead.email, fromEmail, fromName, templateId: template.id, providerMessageId: result.messageId, attempt: 1 });
        await new Promise(r => setTimeout(r, 3000));
      } else { await db.update(leadsTable).set({ status: "failed" }).where(eq(leadsTable.id, lead.id)); await db.insert(emailLogsTable).values({ leadId: lead.id, subject, html, status: "failed", error: result.error, toEmail: lead.email, fromEmail, fromName, templateId: template.id, attempt: 1 }); }
    }
    logger.info({ jobId, sent, maxPerRun, dailyTotal: dailyEmailsSent, dailyLimit: DAILY_EMAIL_LIMIT }, "cron:email_send done");
  } catch (err) {
    logger.error({ err, jobId }, "cron:email_send error");
    throw err;
  }
}

async function runLeadSearchAndSend(jobId: number, businessId: number, config: Record<string, unknown>) {
  const keyword = String(config.keyword || "");
  const location = config.location ? String(config.location) : null;
  const maxResults = Number(config.maxResults || 10);
  const maxPerRun = Number(config.maxPerRun || 30);
  const persona = config.persona ? String(config.persona) as PersonaType : detectPersona(keyword);
  // メール送信するので、メールあり件数をmaxResultsに合わせて確保
  const targetEmailCount = Number(config.targetEmailCount || maxResults);

  if (!keyword) {
    logger.warn({ jobId }, "cron:lead_search_and_send skipped — no keyword");
    return;
  }

  logger.info({ jobId, keyword, location, maxResults, persona, targetEmailCount }, "cron:lead_search_and_send start");
  if (!await acquireSearchLock(jobId)) return;

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

  let results;
  try {
    results = await searchAndCrawlLeads(keyword, location, maxResults, persona, targetEmailCount);
  } catch (err) {
    logger.error({ err, jobId }, "cron:lead_search_and_send search error");
    throw err;
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

  if (!template || template.businessId !== businessId) {
    logger.warn({ jobId }, "cron:lead_search_and_send no template, skipping email");
    return;
  }

  const leadsWithEmail = newLeads.filter(l => l.email).slice(0, maxPerRun);
  const fromEmail = process.env.SMTP_USER || business.senderEmail || "";
  const fromName = business.senderName || business.name;
  let sent = 0;

  for (const lead of leadsWithEmail) {
    const company = lead.companyName || "御社";
    const token = uuidv4();
    await db.insert(unsubscribesTable).values({ leadId: lead.id, token }).onConflictDoNothing();
    const unsubUrl = buildUnsubscribeUrl(token);
    const fallbackUnsubLink = `<p style="font-size:12px;color:#999;margin-top:20px;">配信停止は<a href="${unsubUrl}">こちら</a></p>`;
    const rendered = renderEmail(template.subjectTemplate, template.htmlTemplate, { companyName: company, serviceName: business.name, serviceUrl: business.serviceUrl || "", unsubscribeUrl: unsubUrl });
    const subject = rendered.subject;
    const replaced = rendered.html;
    const withSite = injectWebsiteIntoFooter(replaced, COMPANY_WEBSITE);
    const html = withSite
      + (withSite.includes(unsubUrl) ? "" : fallbackUnsubLink)
      + (business.signatureHtml || "");

    const audit = auditEmail(subject, html);
    if (!audit.valid) {
      const error = audit.errors.join(" / ");
      await db.update(leadsTable).set({ status: "failed" }).where(eq(leadsTable.id, lead.id));
      await db.insert(emailLogsTable).values({ leadId: lead.id, subject, html, status: "failed", error, toEmail: lead.email, fromEmail, fromName, templateId: template.id, attempt: 1 });
      continue;
    }
    if (!checkAndIncrementDailyLimit()) break;
    const claimed = await db.update(leadsTable).set({ status: "sending" }).where(and(eq(leadsTable.id, lead.id), eq(leadsTable.status, "unsent"))).returning();
    if (!claimed.length) continue;
    const result = await sendEmail({ from: `"${fromName}" <${fromEmail}>`, to: lead.email!, subject, html });
    if (result.success) {
      sent++;
      await db.update(leadsTable).set({ status: "sent" }).where(eq(leadsTable.id, lead.id));
      await db.insert(emailLogsTable).values({ leadId: lead.id, subject, html, status: "sent", sentAt: new Date(), toEmail: lead.email, fromEmail, fromName, templateId: template.id, providerMessageId: result.messageId, attempt: 1 });
      await new Promise(r => setTimeout(r, 3000));
    } else { await db.update(leadsTable).set({ status: "failed" }).where(eq(leadsTable.id, lead.id)); await db.insert(emailLogsTable).values({ leadId: lead.id, subject, html, status: "failed", error: result.error, toEmail: lead.email, fromEmail, fromName, templateId: template.id, attempt: 1 }); }
  }

  logger.info({ jobId, sent, maxPerRun, dailyTotal: dailyEmailsSent, dailyLimit: DAILY_EMAIL_LIMIT }, "cron:lead_search_and_send emails done");
  } finally { releaseSearchLock(); }
}

async function syncJobs() {
  try {
    await db.update(leadsTable)
      .set({ status: "failed" })
      .where(and(
        eq(leadsTable.status, "sending"),
        lt(leadsTable.updatedAt, new Date(Date.now() - 60 * 60 * 1000)),
      ));
    const jobs = await db.select().from(cronJobsTable);

    const activeIds = new Set(jobs.filter(j => j.isActive).map(j => j.id));
    const scheduledIds = new Set(activeTasks.keys());

    for (const id of scheduledIds) {
      if (!activeIds.has(id)) {
        activeTasks.get(id)?.task.stop();
        activeTasks.delete(id);
        logger.info({ jobId: id }, "cron: unscheduled job");
      }
    }

    for (const job of jobs) {
      if (!job.isActive) continue;
      const fingerprint = JSON.stringify([job.cronExpression, job.type, job.config, job.isActive]);
      const current = activeTasks.get(job.id);
      if (current?.fingerprint === fingerprint) continue;
      if (current) { current.task.stop(); activeTasks.delete(job.id); }

      if (!cron.validate(job.cronExpression)) {
        logger.warn({ jobId: job.id, expr: job.cronExpression }, "cron: invalid expression, skipping");
        continue;
      }

      const businessId = job.businessId;
      let config: Record<string, unknown> = {};
      try { config = JSON.parse(job.config || "{}"); } catch { config = {}; }

      const timezone = typeof config.timezone === "string" ? config.timezone : "Asia/Tokyo";
      const task = cron.schedule(job.cronExpression, () => {
        void executeJob(job.id).catch((err) => {
          logger.error({ err, jobId: job.id }, "cron: scheduled execution failed");
        });
      }, { timezone });

      activeTasks.set(job.id, { task, fingerprint });
      logger.info({ jobId: job.id, expr: job.cronExpression, type: job.type }, "cron: scheduled job");
    }
  } catch (err) {
    logger.error({ err }, "cron: syncJobs error");
  }
}

async function executeJob(jobId: number): Promise<{ ok: boolean; message: string }> {
  const [job] = await db.select().from(cronJobsTable).where(eq(cronJobsTable.id, jobId));
  if (!job) return { ok: false, message: "Job not found" };
  // DB conditional update protects concurrent cron ticks/manual triggers.
  const started = await db.update(cronJobsTable).set({
    runStatus: "running", startedAt: new Date(), finishedAt: null, lastError: null,
    attemptCount: job.attemptCount + 1, lastRunAt: new Date(),
  }).where(and(eq(cronJobsTable.id, jobId), eq(cronJobsTable.runStatus, "idle"))).returning();
  if (!started.length) return { ok: false, message: "Job is already running" };
  try {
    let config: Record<string, unknown> = {};
    try { config = JSON.parse(job.config || "{}"); } catch { throw new Error("Invalid job config JSON"); }
    if (job.type === "lead_search") await runLeadSearch(job.id, job.businessId, config);
    else if (job.type === "email_send") await runEmailSend(job.id, job.businessId, config);
    else if (job.type === "lead_search_and_send") await runLeadSearchAndSend(job.id, job.businessId, config);
    else throw new Error("Unsupported job type");
    await db.update(cronJobsTable).set({ runStatus: "idle", lastResult: "success", finishedAt: new Date(), nextRunAt: nextCronRun(job.cronExpression) }).where(eq(cronJobsTable.id, jobId));
    return { ok: true, message: `Job ${jobId} completed` };
  } catch (err: any) {
    await db.update(cronJobsTable).set({ runStatus: "idle", lastResult: "failed", lastError: err?.message || "Unknown error", finishedAt: new Date(), nextRunAt: nextCronRun(job.cronExpression) }).where(eq(cronJobsTable.id, jobId));
    throw err;
  }
}

export function startCronRunner() {
  syncJobs();
  cron.schedule("*/5 * * * *", syncJobs);
  logger.info("cron: runner started");
}

// ジョブを即時実行（APIからのマニュアルトリガー用）
export async function runJobById(jobId: number): Promise<{ ok: boolean; message: string }> {
  try {
    return await executeJob(jobId);
  } catch (err: any) {
    logger.error({ err, jobId }, "runJobById error");
    return { ok: false, message: err?.message || "Unknown error" };
  }
}
