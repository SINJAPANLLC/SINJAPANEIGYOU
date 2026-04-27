import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, jimotyPostsTable, businessesTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import { jimotyGenerateAndPost } from "../lib/jimoty-scheduler";

const router: IRouter = Router();

async function ownsBusiness(userId: string, businessId: number) {
  const [b] = await db.select().from(businessesTable).where(
    and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId))
  );
  return b;
}

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
  const hasCredentials = !!(process.env.JIMOTY_EMAIL && process.env.JIMOTY_PASSWORD);
  res.json({
    configured: hasCredentials,
    email: hasCredentials ? process.env.JIMOTY_EMAIL!.replace(/(.{2}).*(@.*)/, "$1***$2") : null,
    scheduledTime: "11:00 JST",
  });
});

export default router;
