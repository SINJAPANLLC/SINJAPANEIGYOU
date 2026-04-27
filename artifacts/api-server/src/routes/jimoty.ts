import { Router, type IRouter } from "express";
import { eq, desc, and, isNull, or } from "drizzle-orm";
import { db, jimotyPostsTable, businessesTable, jimotyAccountsTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import {
  jimotyGenerateAndPost,
  jimotyPersonalPost,
  getJimotySettings,
  updateJimotySettings,
  generateJimotyPreview,
  generatePersonalJimotyPreview,
} from "../lib/jimoty-scheduler";

const router: IRouter = Router();

async function ownsBusiness(userId: string, businessId: number) {
  const [b] = await db.select({ id: businessesTable.id }).from(businessesTable).where(
    and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId))
  );
  return b;
}

// ─── Settings ────────────────────────────────────────────────────────────────
router.get("/jimoty/settings", requireAuth, async (_req, res): Promise<void> => {
  const settings = await getJimotySettings();
  res.json(settings);
});

router.patch("/jimoty/settings", requireAuth, async (req, res): Promise<void> => {
  const { area, cronExpression } = req.body;
  if (cronExpression !== undefined) {
    const cron = await import("node-cron");
    if (!cron.validate(cronExpression)) {
      res.status(400).json({ error: "無効なCRON式です" }); return;
    }
  }
  await updateJimotySettings({ area, cronExpression });
  res.json({ success: true });
});

// ─── Accounts ────────────────────────────────────────────────────────────────
router.get("/jimoty/accounts", requireAuth, async (_req, res): Promise<void> => {
  const accounts = await db.select({
    id: jimotyAccountsTable.id,
    label: jimotyAccountsTable.label,
    email: jimotyAccountsTable.email,
    isDefault: jimotyAccountsTable.isDefault,
    accountType: jimotyAccountsTable.accountType,
    defaultArea: jimotyAccountsTable.defaultArea,
    createdAt: jimotyAccountsTable.createdAt,
  }).from(jimotyAccountsTable).orderBy(jimotyAccountsTable.createdAt);
  res.json(accounts);
});

router.post("/jimoty/accounts", requireAuth, async (req, res): Promise<void> => {
  const { label, email, password, isDefault, accountType, defaultArea } = req.body;
  if (!label || !email || !password) {
    res.status(400).json({ error: "label, email, password は必須です" }); return;
  }
  if (isDefault) await db.update(jimotyAccountsTable).set({ isDefault: false });
  const [account] = await db.insert(jimotyAccountsTable)
    .values({ label, email, password, isDefault: !!isDefault, accountType: accountType ?? "business", defaultArea: defaultArea ?? null })
    .returning({ id: jimotyAccountsTable.id, label: jimotyAccountsTable.label, email: jimotyAccountsTable.email, isDefault: jimotyAccountsTable.isDefault, accountType: jimotyAccountsTable.accountType, defaultArea: jimotyAccountsTable.defaultArea, createdAt: jimotyAccountsTable.createdAt });
  res.json(account);
});

router.patch("/jimoty/accounts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { label, email, password, isDefault, accountType, defaultArea } = req.body;
  if (isDefault) await db.update(jimotyAccountsTable).set({ isDefault: false });
  const updates: Record<string, unknown> = {};
  if (label !== undefined) updates.label = label;
  if (email !== undefined) updates.email = email;
  if (password !== undefined && password !== "") updates.password = password;
  if (isDefault !== undefined) updates.isDefault = isDefault;
  if (accountType !== undefined) updates.accountType = accountType;
  if (defaultArea !== undefined) updates.defaultArea = defaultArea || null;
  await db.update(jimotyAccountsTable).set(updates).where(eq(jimotyAccountsTable.id, id));
  res.json({ success: true });
});

router.delete("/jimoty/accounts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.update(businessesTable).set({ jimotyAccountId: null }).where(eq(businessesTable.jimotyAccountId, id));
  await db.delete(jimotyAccountsTable).where(eq(jimotyAccountsTable.id, id));
  res.json({ success: true });
});

// ─── Businesses ──────────────────────────────────────────────────────────────
router.get("/jimoty/businesses", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const businesses = await db.select({
    id: businessesTable.id,
    name: businessesTable.name,
    jimotyAccountId: businessesTable.jimotyAccountId,
  }).from(businessesTable).where(eq(businessesTable.userId, userId));
  res.json(businesses);
});

router.patch("/jimoty/businesses/:bizId/account", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const bizId = Number(req.params.bizId);
  const { accountId } = req.body;
  if (!(await ownsBusiness(userId, bizId))) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.update(businessesTable).set({ jimotyAccountId: accountId ?? null }).where(eq(businessesTable.id, bizId));
  res.json({ success: true });
});

// ─── Preview ─────────────────────────────────────────────────────────────────
router.post("/jimoty/preview/:bizId", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const bizId = Number(req.params.bizId);
  if (!(await ownsBusiness(userId, bizId))) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const result = await generateJimotyPreview(bizId);
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "生成失敗" });
  }
});

router.post("/jimoty/preview-personal", requireAuth, async (_req, res): Promise<void> => {
  try {
    const result = await generatePersonalJimotyPreview();
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "生成失敗" });
  }
});

// ─── Posting ─────────────────────────────────────────────────────────────────
router.post("/jimoty/generate-and-post/:businessId", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const businessId = Number(req.params.businessId);
  const overrideAccountId: number | undefined = req.body?.accountId ? Number(req.body.accountId) : undefined;
  const overrideArea: string | undefined = req.body?.area;
  const previewTitle: string | undefined = req.body?.title;
  const previewBody: string | undefined = req.body?.body;

  if (!(await ownsBusiness(userId, businessId))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const result = await jimotyGenerateAndPost(businessId, overrideAccountId, overrideArea, previewTitle, previewBody);
  res.status(result.success ? 200 : 400).json(result);
});

router.post("/jimoty/personal-post/:accountId", requireAuth, async (req, res): Promise<void> => {
  const accountId = Number(req.params.accountId);
  const overrideArea: string | undefined = req.body?.area;
  const previewTitle: string | undefined = req.body?.title;
  const previewBody: string | undefined = req.body?.body;
  const result = await jimotyPersonalPost(accountId, overrideArea, previewTitle, previewBody);
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

// ─── Posts ───────────────────────────────────────────────────────────────────
router.get("/jimoty/posts", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const userBizIds = (await db.select({ id: businessesTable.id }).from(businessesTable)
    .where(eq(businessesTable.userId, userId))).map(b => b.id);

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
    .leftJoin(businessesTable, eq(jimotyPostsTable.businessId, businessesTable.id))
    .where(or(
      isNull(jimotyPostsTable.businessId),
      ...(userBizIds.length > 0 ? [eq(businessesTable.userId, userId)] : [])
    ))
    .orderBy(desc(jimotyPostsTable.createdAt));

  res.json(posts);
});

router.delete("/jimoty/posts/:id", requireAuth, async (req, res): Promise<void> => {
  const postId = Number(req.params.id);
  await db.delete(jimotyPostsTable).where(eq(jimotyPostsTable.id, postId));
  res.json({ success: true });
});

// ─── Status ──────────────────────────────────────────────────────────────────
router.get("/jimoty/status", requireAuth, async (_req, res): Promise<void> => {
  const accounts = await db.select().from(jimotyAccountsTable);
  const hasEnvCreds = !!(process.env.JIMOTY_EMAIL && process.env.JIMOTY_PASSWORD);
  const configured = accounts.length > 0 || hasEnvCreds;
  const settings = await getJimotySettings();
  res.json({ configured, accountCount: accounts.length, hasEnvCreds, scheduledTime: "11:00 JST", cronExpression: settings.cronExpression, area: settings.area });
});

export default router;
