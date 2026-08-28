import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, cronJobsTable, businessesTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import { runJobById } from "../lib/cron-runner";
import { isValidCronExpression, nextCronRun } from "../lib/cron-utils";
import { getSmtpReadiness, verifySmtpConnection } from "../lib/mailer";

const router: IRouter = Router();

// Authentication is required; credentials and transporter configuration are
// never included in this response.
router.post("/smtp/verify", requireAuth, async (_req, res): Promise<void> => {
  const result = await verifySmtpConnection();
  if (result.success) { res.json({ success: true }); return; }
  res.status(502).json({ success: false, error: "SMTP authentication or connection failed" });
});

router.get("/smtp/status", requireAuth, async (_req, res): Promise<void> => {
  res.json(await getSmtpReadiness());
});

async function ownsBusiness(userId: string, businessId: number) {
  const [b] = await db.select().from(businessesTable).where(
    and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId))
  );
  return b;
}

router.get("/cron-jobs", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const businessId = req.query.businessId ? Number(req.query.businessId) : null;
  if (!businessId) { res.status(400).json({ error: "businessId is required" }); return; }
  if (!(await ownsBusiness(userId, businessId))) { res.status(403).json({ error: "Forbidden" }); return; }

  const jobs = await db.select().from(cronJobsTable).where(eq(cronJobsTable.businessId, businessId));
  res.json(jobs);
});

router.post("/cron-jobs", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const { businessId, name, type, cronExpression, config, isActive } = req.body;
  if (!businessId || !name || !type || !cronExpression) {
    res.status(400).json({ error: "Missing required fields" }); return;
  }
  if (!isValidCronExpression(cronExpression)) { res.status(400).json({ error: "Invalid 5-field cron expression" }); return; }
  if (!(await ownsBusiness(userId, Number(businessId)))) { res.status(403).json({ error: "Forbidden" }); return; }

  const [job] = await db.insert(cronJobsTable).values({
    businessId: Number(businessId),
    name,
    type,
    cronExpression,
    config: JSON.stringify(config ?? {}),
    isActive: isActive !== false,
    nextRunAt: nextCronRun(cronExpression),
  }).returning();
  res.status(201).json(job);
});

router.patch("/cron-jobs/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const id = Number(req.params.id);

  const [existing] = await db.select().from(cronJobsTable).where(eq(cronJobsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await ownsBusiness(userId, existing.businessId))) { res.status(403).json({ error: "Forbidden" }); return; }

  const updates: Partial<typeof cronJobsTable.$inferInsert> = {};
  if (req.body.name !== undefined) updates.name = req.body.name;
  if (req.body.cronExpression !== undefined) {
    if (!isValidCronExpression(req.body.cronExpression)) { res.status(400).json({ error: "Invalid 5-field cron expression" }); return; }
    updates.cronExpression = req.body.cronExpression;
    updates.nextRunAt = nextCronRun(req.body.cronExpression);
  }
  if (req.body.type !== undefined) updates.type = req.body.type;
  if (req.body.config !== undefined) updates.config = JSON.stringify(req.body.config);
  if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;

  const [updated] = await db.update(cronJobsTable).set(updates).where(eq(cronJobsTable.id, id)).returning();
  res.json(updated);
});

// マニュアル即時実行（バックグラウンドで走らせてすぐ202を返す）
router.post("/cron-jobs/:id/run", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const id = Number(req.params.id);

  const [existing] = await db.select().from(cronJobsTable).where(eq(cronJobsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await ownsBusiness(userId, existing.businessId))) { res.status(403).json({ error: "Forbidden" }); return; }

  // 即時に202を返してバックグラウンドで実行
  res.status(202).json({ ok: true, message: `Job ${id} started in background` });
  runJobById(id).catch(() => {});
});

router.delete("/cron-jobs/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const id = Number(req.params.id);

  const [existing] = await db.select().from(cronJobsTable).where(eq(cronJobsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await ownsBusiness(userId, existing.businessId))) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(cronJobsTable).where(eq(cronJobsTable.id, id));
  res.status(204).send();
});

export default router;
