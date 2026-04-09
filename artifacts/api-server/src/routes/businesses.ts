import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, businessesTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import {
  CreateBusinessBody,
  UpdateBusinessBody,
  UpdateBusinessParams,
  GetBusinessParams,
  DeleteBusinessParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/businesses", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const businesses = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.userId, userId))
    .orderBy(businessesTable.createdAt);
  res.json(businesses);
});

router.post("/businesses", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const parsed = CreateBusinessBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [business] = await db
    .insert(businessesTable)
    .values({ ...parsed.data, userId })
    .returning();
  res.status(201).json(business);
});

router.get("/businesses/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = GetBusinessParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [business] = await db
    .select()
    .from(businessesTable)
    .where(and(eq(businessesTable.id, params.data.id), eq(businessesTable.userId, userId)));
  if (!business) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  res.json(business);
});

router.patch("/businesses/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = UpdateBusinessParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateBusinessBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [business] = await db
    .update(businessesTable)
    .set(parsed.data)
    .where(and(eq(businessesTable.id, params.data.id), eq(businessesTable.userId, userId)))
    .returning();
  if (!business) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  res.json(business);
});

router.delete("/businesses/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = DeleteBusinessParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [business] = await db
    .delete(businessesTable)
    .where(and(eq(businessesTable.id, params.data.id), eq(businessesTable.userId, userId)))
    .returning();
  if (!business) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
