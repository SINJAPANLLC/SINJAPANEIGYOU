import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, jimotyPostsTable, businessesTable, jimotyAccountsTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import { jimotyGenerateAndPost } from "../lib/jimoty-scheduler";

const router: IRouter = Router();

async function ownsBusiness(userId: string, businessId: number) {
  const [b] = await db.select().from(businessesTable).where(
    and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId))
  );
  return b;
}

router.get("/jimoty/accounts", requireAuth, async (_req, res): Promise<void> => {
  const accounts = await db.select({
    id: jimotyAccountsTable.id,
    label: jimotyAccountsTable.label,
    email: jimotyAccountsTable.email,
    isDefault: jimotyAccountsTable.isDefault,
    createdAt: jimotyAccountsTable.createdAt,
  }).from(jimotyAccountsTable).orderBy(jimotyAccountsTable.createdAt);
  res.json(accounts);
});

router.post("/jimoty/accounts", requireAuth, async (req, res): Promise<void> => {
  const { label, email, password, isDefault } = req.body;
  if (!label || !email || !password) {
    res.status(400).json({ error: "label, email, password は必須です" }); return;
  }

  if (isDefault) {
    await db.update(jimotyAccountsTable).set({ isDefault: false });
  }

  const [account] = await db.insert(jimotyAccountsTable)
    .values({ label, email, password, isDefault: !!isDefault })
    .returning({ id: jimotyAccountsTable.id, label: jimotyAccountsTable.label, email: jimotyAccountsTable.email, isDefault: jimotyAccountsTable.isDefault, createdAt: jimotyAccountsTable.createdAt });

  res.json(account);
});

router.patch("/jimoty/accounts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { label, email, password, isDefault } = req.body;

  if (isDefault) {
    await db.update(jimotyAccountsTable).set({ isDefault: false });
  }

  const updates: Record<string, unknown> = {};
  if (label !== undefined) updates.label = label;
  if (email !== undefined) updates.email = email;
  if (password !== undefined && password !== "") updates.password = password;
  if (isDefault !== undefined) updates.isDefault = isDefault;

  await db.update(jimotyAccountsTable).set(updates).where(eq(jimotyAccountsTable.id, id));
  res.json({ success: true });
});

router.delete("/jimoty/accounts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.update(businessesTable).set({ jimotyAccountId: null }).where(eq(businessesTable.jimotyAccountId, id));
  await db.delete(jimotyAccountsTable).where(eq(jimotyAccountsTable.id, id));
  res.json({ success: true });
});

router.patch("/jimoty/businesses/:bizId/account", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const bizId = Number(req.params.bizId);
  const { accountId } = req.body;

  if (!(await ownsBusiness(userId, bizId))) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.update(businessesTable)
    .set({ jimotyAccountId: accountId ?? null })
    .where(eq(businessesTable.id, bizId));

  res.json({ success: true });
});

router.get("/jimoty/businesses", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const businesses = await db.select({
    id: businessesTable.id,
    name: businessesTable.name,
    jimotyAccountId: businessesTable.jimotyAccountId,
  }).from(businessesTable).where(eq(businessesTable.userId, userId));
  res.json(businesses);
});

router.get("/jimoty/posts", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const userBizIds = (await db.select({ id: businessesTable.id }).from(businessesTable)
    .where(eq(businessesTable.userId, userId))).map(b => b.id);

  if (userBizIds.length === 0) { res.json([]); return; }

  const posts = await db
    .select({
      id: jimotyPostsTable.id,
      businessId: jimotyPostsTable.businessId,
      businessName: businessesTable.name,
      accountId: jimotyPostsTable.accountId,
      title: jimotyPostsTable.title,
      body: jimotyPostsTable.body,
      status: jimotyPostsTable.status,
      postedAt: jimotyPostsTable.postedAt,
      jimotyUrl: jimotyPostsTable.jimotyUrl,
      errorMsg: jimotyPostsTable.errorMsg,
      createdAt: jimotyPostsTable.createdAt,
    })
    .from(jimotyPostsTable)
    .innerJoin(businessesTable, eq(jimotyPostsTable.businessId, businessesTable.id))
    .where(eq(businessesTable.userId, userId))
    .orderBy(desc(jimotyPostsTable.createdAt));

  res.json(posts);
});

router.delete("/jimoty/posts/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const postId = Number(req.params.id);

  const [post] = await db.select().from(jimotyPostsTable)
    .innerJoin(businessesTable, eq(jimotyPostsTable.businessId, businessesTable.id))
    .where(and(eq(jimotyPostsTable.id, postId), eq(businessesTable.userId, userId)));

  if (!post) { res.status(404).json({ error: "Not found" }); return; }

  await db.delete(jimotyPostsTable).where(eq(jimotyPostsTable.id, postId));
  res.json({ success: true });
});

router.post("/jimoty/generate-and-post/:businessId", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const businessId = Number(req.params.businessId);

  if (!(await ownsBusiness(userId, businessId))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const result = await jimotyGenerateAndPost(businessId);
  res.status(result.success ? 200 : 400).json(result);
});

router.post("/jimoty/run-daily", requireAuth, async (_req, res): Promise<void> => {
  const businesses = await db.select().from(businessesTable);
  res.json({ message: `日次投稿をバックグラウンドで開始しました (${businesses.length}件)` });

  (async () => {
    for (const biz of businesses) {
      await jimotyGenerateAndPost(biz.id).catch(() => {});
      await new Promise(r => setTimeout(r, 3 * 60 * 1000));
    }
  })();
});

router.get("/jimoty/status", requireAuth, async (_req, res): Promise<void> => {
  const accounts = await db.select().from(jimotyAccountsTable);
  const hasEnvCreds = !!(process.env.JIMOTY_EMAIL && process.env.JIMOTY_PASSWORD);
  const configured = accounts.length > 0 || hasEnvCreds;
  res.json({
    configured,
    accountCount: accounts.length,
    hasEnvCreds,
    scheduledTime: "11:00 JST",
  });
});

export default router;
