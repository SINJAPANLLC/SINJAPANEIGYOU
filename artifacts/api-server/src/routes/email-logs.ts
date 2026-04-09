import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, emailLogsTable, leadsTable, businessesTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import {
  ListEmailLogsQueryParams,
  GetEmailLogParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/email-logs", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const queryParams = ListEmailLogsQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const rows = await db
    .select({ log: emailLogsTable })
    .from(emailLogsTable)
    .innerJoin(leadsTable, eq(emailLogsTable.leadId, leadsTable.id))
    .innerJoin(businessesTable, eq(leadsTable.businessId, businessesTable.id))
    .where(eq(businessesTable.userId, userId))
    .orderBy(desc(emailLogsTable.createdAt));

  let result = rows.map((r) => r.log);

  if (queryParams.data.businessId != null) {
    const bid = queryParams.data.businessId;
    // Re-filter via join data — we need to fetch with business info
    const withBiz = await db
      .select({ log: emailLogsTable, lead: leadsTable })
      .from(emailLogsTable)
      .innerJoin(leadsTable, eq(emailLogsTable.leadId, leadsTable.id))
      .innerJoin(businessesTable, eq(leadsTable.businessId, businessesTable.id))
      .where(and(eq(businessesTable.userId, userId), eq(leadsTable.businessId, bid)))
      .orderBy(desc(emailLogsTable.createdAt));
    result = withBiz.map((r) => r.log);
  }

  if (queryParams.data.leadId != null) {
    result = result.filter((l) => l.leadId === queryParams.data.leadId);
  }

  res.json(result);
});

router.get("/email-logs/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = GetEmailLogParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select({ log: emailLogsTable })
    .from(emailLogsTable)
    .innerJoin(leadsTable, eq(emailLogsTable.leadId, leadsTable.id))
    .innerJoin(businessesTable, eq(leadsTable.businessId, businessesTable.id))
    .where(and(eq(emailLogsTable.id, params.data.id), eq(businessesTable.userId, userId)));
  if (!row) {
    res.status(404).json({ error: "Email log not found" });
    return;
  }
  res.json(row.log);
});

export default router;
