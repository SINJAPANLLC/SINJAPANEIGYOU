import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, campaignsTable, businessesTable, leadsTable, templatesTable, emailLogsTable, unsubscribesTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import {
  CreateCampaignBody,
  UpdateCampaignBody,
  UpdateCampaignParams,
  GetCampaignParams,
  DeleteCampaignParams,
  ListCampaignsQueryParams,
  SendCampaignParams,
  SendTestEmailParams,
  SendTestEmailBody,
} from "@workspace/api-zod";
import { sendEmail, sleep } from "../lib/mailer";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../lib/logger";
import { renderEmail, auditEmail } from "../lib/email-renderer";
import { buildUnsubscribeUrl } from "../lib/unsubscribe-url";

const router: IRouter = Router();

async function ownsBusiness(userId: string, businessId: number) {
  const [b] = await db.select().from(businessesTable).where(
    and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId))
  );
  return b;
}

async function ownsCampaign(userId: string, campaignId: number) {
  const [row] = await db
    .select({ campaign: campaignsTable, business: businessesTable })
    .from(campaignsTable)
    .innerJoin(businessesTable, eq(campaignsTable.businessId, businessesTable.id))
    .where(and(eq(campaignsTable.id, campaignId), eq(businessesTable.userId, userId)));
  return row;
}

router.get("/campaigns", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const queryParams = ListCampaignsQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  let rows = await db
    .select({ campaign: campaignsTable })
    .from(campaignsTable)
    .innerJoin(businessesTable, eq(campaignsTable.businessId, businessesTable.id))
    .where(eq(businessesTable.userId, userId))
    .orderBy(campaignsTable.createdAt);

  let result = rows.map((r) => r.campaign);
  if (queryParams.data.businessId != null) {
    result = result.filter((c) => c.businessId === queryParams.data.businessId);
  }

  res.json(result);
});

router.post("/campaigns", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const parsed = CreateCampaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!(await ownsBusiness(userId, parsed.data.businessId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { scheduledAt, ...rest } = parsed.data;
  const [campaign] = await db.insert(campaignsTable).values({
    ...rest,
    status: "draft",
    ...(scheduledAt != null ? { scheduledAt: new Date(scheduledAt) } : {}),
  }).returning();
  res.status(201).json(campaign);
});

router.get("/campaigns/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = GetCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const row = await ownsCampaign(userId, params.data.id);
  if (!row) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  res.json(row.campaign);
});

router.patch("/campaigns/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = UpdateCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateCampaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!(await ownsCampaign(userId, params.data.id))) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  const { scheduledAt: updScheduledAt, ...updateRest } = parsed.data;
  const [campaign] = await db
    .update(campaignsTable)
    .set({
      ...updateRest,
      ...(updScheduledAt !== undefined
        ? { scheduledAt: updScheduledAt != null ? new Date(updScheduledAt) : null }
        : {}),
    })
    .where(eq(campaignsTable.id, params.data.id))
    .returning();
  res.json(campaign);
});

router.delete("/campaigns/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = DeleteCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await ownsCampaign(userId, params.data.id))) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  await db.delete(campaignsTable).where(eq(campaignsTable.id, params.data.id));
  res.sendStatus(204);
});

router.post("/campaigns/:id/send", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = SendCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const row = await ownsCampaign(userId, params.data.id);
  if (!row) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  const { campaign, business } = row;
  const [template] = await db.select().from(templatesTable).where(eq(templatesTable.id, campaign.templateId));
  if (!template) {
    res.status(400).json({ error: "Template not found" });
    return;
  }
  if (template.businessId !== campaign.businessId) {
    res.status(400).json({ error: "Template does not belong to campaign business" });
    return;
  }

  // Get unsent leads for this business that have emails
  const leads = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.businessId, campaign.businessId), eq(leadsTable.status, "unsent")));

  const leadsWithEmail = leads.filter((l) => l.email);

  let sent = 0;
  let failed = 0;
  let skipped = leads.length - leadsWithEmail.length;
  const errors: string[] = [];

  // Claim the campaign atomically so concurrent requests cannot start it twice.
  const claimedCampaign = await db.update(campaignsTable).set({ status: "running" })
    .where(and(eq(campaignsTable.id, campaign.id), eq(campaignsTable.status, "draft"))).returning();
  if (!claimedCampaign.length) {
    res.status(409).json({ error: "Campaign is already running or has already been sent" });
    return;
  }

  try {
  for (const lead of leadsWithEmail) {
    // Create unsubscribe token
    const token = uuidv4();
    await db.insert(unsubscribesTable).values({ leadId: lead.id, token }).onConflictDoNothing();

    const unsubscribeLink = buildUnsubscribeUrl(token);

    const rendered = renderEmail(template.subjectTemplate, template.htmlTemplate, {
      companyName: lead.companyName || "御社", serviceName: business.name,
      serviceUrl: business.serviceUrl || "", unsubscribeUrl: unsubscribeLink,
    });
    const subject = rendered.subject;
    const html = rendered.html
      + (rendered.html.includes(unsubscribeLink) ? "" : `<p style="font-size:12px;color:#999;margin-top:20px;">このメールの配信を停止するには<a href="${unsubscribeLink}">こちら</a>をクリックしてください。</p>`)
      + (business.signatureHtml || "");

    const fromEmail = business.senderEmail || process.env.SMTP_USER || "";
    const fromName = business.senderName || business.name;

    const audit = auditEmail(subject, html);
    if (!audit.valid) {
      failed++;
      const error = audit.errors.join(" / ");
      errors.push(`${lead.email}: ${error}`);
      await db.update(leadsTable).set({ status: "failed" }).where(eq(leadsTable.id, lead.id));
      await db.insert(emailLogsTable).values({ leadId: lead.id, campaignId: campaign.id, subject, html, status: "failed", error, toEmail: lead.email, fromEmail, fromName, templateId: template.id, attempt: 1 });
      continue;
    }
    // Claim only after all deterministic pre-send work has succeeded.
    const claimedLead = await db.update(leadsTable).set({ status: "sending" })
      .where(and(eq(leadsTable.id, lead.id), eq(leadsTable.status, "unsent"))).returning();
    if (!claimedLead.length) { skipped++; continue; }
    const result = await sendEmail({
      from: `"${fromName}" <${fromEmail}>`,
      to: lead.email!,
      subject,
      html,
    });

    if (result.success) {
      sent++;
      await db.update(leadsTable).set({ status: "sent" }).where(eq(leadsTable.id, lead.id));
      await db.insert(emailLogsTable).values({
        leadId: lead.id,
        campaignId: campaign.id,
        subject,
        html,
        status: "sent",
        sentAt: new Date(), toEmail: lead.email, fromEmail, fromName, templateId: template.id, providerMessageId: result.messageId, attempt: 1,
      });
    } else {
      failed++;
      errors.push(`${lead.email}: ${result.error}`);
      await db.insert(emailLogsTable).values({
        leadId: lead.id,
        campaignId: campaign.id,
        subject,
        html,
        status: "failed",
        error: result.error,
        toEmail: lead.email, fromEmail, fromName, templateId: template.id, attempt: 1,
      });
      await db.update(leadsTable).set({ status: "failed" }).where(eq(leadsTable.id, lead.id));
    }

    // Anti-spam delay
    if (leadsWithEmail.indexOf(lead) < leadsWithEmail.length - 1) {
      await sleep(10000);
    }
  }

  await db.update(campaignsTable).set({ status: "completed" }).where(eq(campaignsTable.id, campaign.id));
  } catch (err: any) {
    logger.error({ err, campaignId: campaign.id }, "Campaign send failed");
    await db.update(campaignsTable).set({ status: "failed" }).where(eq(campaignsTable.id, campaign.id));
    res.status(500).json({ error: err?.message || "Campaign delivery failed" });
    return;
  }

  res.json({ sent, failed, skipped, errors });
});

router.post("/campaigns/:id/send-test", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = SendTestEmailParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = SendTestEmailBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const row = await ownsCampaign(userId, params.data.id);
  if (!row) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  const { campaign, business } = row;
  const [template] = await db.select().from(templatesTable).where(eq(templatesTable.id, campaign.templateId));
  if (!template) {
    res.status(400).json({ error: "Template not found" });
    return;
  }
  if (template.businessId !== campaign.businessId) { res.status(400).json({ error: "Template does not belong to campaign business" }); return; }

  let lead = null;
  if (body.data.leadId) {
    const rows = await db.select().from(leadsTable).where(eq(leadsTable.id, body.data.leadId));
    lead = rows[0] || null;
    if (lead && lead.businessId !== campaign.businessId) { res.status(403).json({ error: "Lead does not belong to campaign business" }); return; }
  }

  if (!lead) {
    res.status(400).json({ error: "有効な配信停止リンクを作成するため、同一ビジネスのleadIdが必要です" });
    return;
  }
  const token = uuidv4();
  await db.insert(unsubscribesTable).values({ leadId: lead.id, token }).onConflictDoNothing();
  const companyName = lead.companyName || "テスト企業";
  const rendered = renderEmail(template.subjectTemplate, template.htmlTemplate, {
    companyName, serviceName: business.name, serviceUrl: business.serviceUrl || "",
    unsubscribeUrl: buildUnsubscribeUrl(token),
  });
  const subject = rendered.subject;
  const html = rendered.html;
  const audit = auditEmail(subject, html);
  if (!audit.valid) {
    res.status(422).json({ error: "安全確認に失敗したため送信しません", details: audit.errors });
    return;
  }

  const fromEmail = business.senderEmail || process.env.SMTP_USER || "";
  const fromName = business.senderName || business.name;

  const result = await sendEmail({
    from: `"${fromName}" <${fromEmail}>`,
    to: body.data.toEmail,
    subject: `[TEST] ${subject}`,
    html,
  });

  if (result.success) {
    res.json({ success: true, message: `テストメールを ${body.data.toEmail} に送信しました` });
  } else {
    res.json({ success: false, message: result.error || "送信に失敗しました" });
  }
});

export default router;
