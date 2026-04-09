import { Router, type IRouter } from "express";
import { eq, count, desc } from "drizzle-orm";
import { db, leadsTable, campaignsTable, emailLogsTable, businessesTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import {
  GetDashboardStatsQueryParams,
  GetRecentActivityQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/stats", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const queryParams = GetDashboardStatsQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  // Get all businesses for user
  const businesses = await db.select().from(businessesTable).where(eq(businessesTable.userId, userId));
  const businessIds = businesses.map((b) => b.id);

  if (businessIds.length === 0) {
    res.json({
      totalLeads: 0,
      unsentLeads: 0,
      sentLeads: 0,
      repliedLeads: 0,
      ngLeads: 0,
      unsubscribedLeads: 0,
      totalCampaigns: 0,
      totalEmailsSent: 0,
      replyRate: 0,
    });
    return;
  }

  // Get leads for user's businesses
  let leadsQuery = db.select().from(leadsTable);
  const leads = await leadsQuery;
  const userLeads = leads.filter((l) => {
    let bid = queryParams.data.businessId;
    if (bid != null) return l.businessId === bid && businessIds.includes(l.businessId);
    return businessIds.includes(l.businessId);
  });

  const totalLeads = userLeads.length;
  const unsentLeads = userLeads.filter((l) => l.status === "unsent").length;
  const sentLeads = userLeads.filter((l) => l.status === "sent").length;
  const repliedLeads = userLeads.filter((l) => l.status === "replied").length;
  const ngLeads = userLeads.filter((l) => l.status === "ng").length;
  const unsubscribedLeads = userLeads.filter((l) => l.status === "unsubscribed").length;

  const campaigns = await db.select().from(campaignsTable);
  const userCampaigns = campaigns.filter((c) => businessIds.includes(c.businessId));
  const totalCampaigns = queryParams.data.businessId
    ? userCampaigns.filter((c) => c.businessId === queryParams.data.businessId).length
    : userCampaigns.length;

  const emailLogs = await db.select().from(emailLogsTable);
  const userLeadIds = new Set(userLeads.map((l) => l.id));
  const userLogs = emailLogs.filter((l) => userLeadIds.has(l.leadId) && l.status === "sent");
  const totalEmailsSent = userLogs.length;

  const replyRate = sentLeads > 0 ? (repliedLeads / (sentLeads + repliedLeads)) * 100 : 0;

  res.json({
    totalLeads,
    unsentLeads,
    sentLeads,
    repliedLeads,
    ngLeads,
    unsubscribedLeads,
    totalCampaigns,
    totalEmailsSent,
    replyRate: Math.round(replyRate * 10) / 10,
  });
});

router.get("/dashboard/recent-activity", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const queryParams = GetRecentActivityQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const limit = queryParams.data.limit ?? 20;

  const rows = await db
    .select({ log: emailLogsTable, lead: leadsTable })
    .from(emailLogsTable)
    .innerJoin(leadsTable, eq(emailLogsTable.leadId, leadsTable.id))
    .innerJoin(businessesTable, eq(leadsTable.businessId, businessesTable.id))
    .where(eq(businessesTable.userId, userId))
    .orderBy(desc(emailLogsTable.createdAt))
    .limit(limit);

  const activity = rows.map((r) => ({
    id: r.log.id,
    type: "email",
    leadId: r.log.leadId,
    companyName: r.lead.companyName,
    subject: r.log.subject,
    status: r.log.status,
    createdAt: r.log.createdAt.toISOString(),
  }));

  res.json(activity);
});

export default router;
