import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, leadsTable, businessesTable, emailLogsTable, unsubscribesTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import {
  CreateLeadBody,
  UpdateLeadBody,
  UpdateLeadParams,
  GetLeadParams,
  DeleteLeadParams,
  ListLeadsQueryParams,
} from "@workspace/api-zod";
import { sendEmail } from "../lib/mailer";
import { v4 as uuidv4 } from "uuid";

function buildUnsubscribeLink(token: string) {
  const base = process.env.APP_URL || `https://${process.env.REPLIT_DEV_DOMAIN || "localhost"}`;
  return `${base}/api/unsubscribe/${token}`;
}

const router: IRouter = Router();

async function ownsBusiness(userId: string, businessId: number): Promise<boolean> {
  const [b] = await db.select().from(businessesTable).where(
    and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId))
  );
  return !!b;
}

router.get("/leads", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const queryParams = ListLeadsQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const { businessId, status } = queryParams.data;

  let query = db
    .select({ lead: leadsTable })
    .from(leadsTable)
    .innerJoin(businessesTable, eq(leadsTable.businessId, businessesTable.id))
    .where(eq(businessesTable.userId, userId));

  const leads = await query.orderBy(leadsTable.createdAt);
  let result = leads.map((r) => r.lead);

  if (businessId != null) {
    result = result.filter((l) => l.businessId === businessId);
  }
  if (status != null) {
    result = result.filter((l) => l.status === status);
  }

  res.json(result);
});

router.post("/leads", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const parsed = CreateLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!(await ownsBusiness(userId, parsed.data.businessId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [lead] = await db.insert(leadsTable).values({
    ...parsed.data,
    status: parsed.data.status ?? "unsent",
  }).returning();
  res.status(201).json(lead);
});

router.get("/leads/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = GetLeadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select({ lead: leadsTable })
    .from(leadsTable)
    .innerJoin(businessesTable, eq(leadsTable.businessId, businessesTable.id))
    .where(and(eq(leadsTable.id, params.data.id), eq(businessesTable.userId, userId)));
  if (!row) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  res.json(row.lead);
});

router.patch("/leads/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = UpdateLeadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Verify ownership
  const [existing] = await db
    .select({ lead: leadsTable })
    .from(leadsTable)
    .innerJoin(businessesTable, eq(leadsTable.businessId, businessesTable.id))
    .where(and(eq(leadsTable.id, params.data.id), eq(businessesTable.userId, userId)));
  if (!existing) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  const [lead] = await db
    .update(leadsTable)
    .set(parsed.data)
    .where(eq(leadsTable.id, params.data.id))
    .returning();
  res.json(lead);
});

router.post("/leads/bulk-send", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const { leadIds, subject, html } = req.body as { leadIds: number[]; subject: string; html: string };
  if (!Array.isArray(leadIds) || leadIds.length === 0 || !subject || !html) {
    res.status(400).json({ error: "leadIds, subject, html are required" });
    return;
  }

  const rows = await db
    .select({ lead: leadsTable, business: businessesTable })
    .from(leadsTable)
    .innerJoin(businessesTable, eq(leadsTable.businessId, businessesTable.id))
    .where(and(
      inArray(leadsTable.id, leadIds),
      eq(businessesTable.userId, userId),
    ));

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const { lead, business } of rows) {
    if (!lead.email) { skipped++; continue; }

    const company = lead.companyName || "御社";
    const finalSubject = subject.replace(/{{company_name}}/g, company).replace(/{{service_name}}/g, business.name).replace(/{{service_url}}/g, business.serviceUrl || "");
    const token = uuidv4();
    await db.insert(unsubscribesTable).values({ leadId: lead.id, token }).onConflictDoNothing();
    const unsubLink = `<p style="font-size:12px;color:#999;margin-top:20px;">配信停止は<a href="${buildUnsubscribeLink(token)}">こちら</a></p>`;
    const finalHtml = html
      .replace(/{{company_name}}/g, company)
      .replace(/{{service_name}}/g, business.name)
      .replace(/{{service_url}}/g, business.serviceUrl || "")
      + unsubLink
      + (business.signatureHtml || "");

    const fromEmail = process.env.SMTP_USER || business.senderEmail || "";
    const fromName = business.senderName || business.name;

    const result = await sendEmail({
      from: `"${fromName}" <${fromEmail}>`,
      to: lead.email,
      subject: finalSubject,
      html: finalHtml,
    });

    if (result.success) {
      sent++;
      await db.update(leadsTable).set({ status: "sent" }).where(eq(leadsTable.id, lead.id));
      await db.insert(emailLogsTable).values({ leadId: lead.id, subject: finalSubject, html: finalHtml, status: "sent", sentAt: new Date() });
    } else {
      failed++;
      await db.insert(emailLogsTable).values({ leadId: lead.id, subject: finalSubject, html: finalHtml, status: "failed", error: result.error });
    }
  }

  res.json({ sent, failed, skipped });
});

router.delete("/leads/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = DeleteLeadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db
    .select({ lead: leadsTable })
    .from(leadsTable)
    .innerJoin(businessesTable, eq(leadsTable.businessId, businessesTable.id))
    .where(and(eq(leadsTable.id, params.data.id), eq(businessesTable.userId, userId)));
  if (!existing) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  await db.delete(leadsTable).where(eq(leadsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
