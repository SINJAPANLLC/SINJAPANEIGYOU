import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, prArticlesTable, businessesTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import { postToPrFreePlaywright } from "../lib/pr-free-playwright";

const router: IRouter = Router();
async function ownsBusiness(userId: string, businessId: number) {
  const [b] = await db.select().from(businessesTable).where(
    and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId))
  );
  return b;
}

router.get("/pr-articles", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const businessId = req.query.businessId ? Number(req.query.businessId) : null;

  if (businessId) {
    if (!(await ownsBusiness(userId, businessId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const articles = await db
      .select({
        id: prArticlesTable.id,
        businessId: prArticlesTable.businessId,
        businessName: businessesTable.name,
        title: prArticlesTable.title,
        content: prArticlesTable.content,
        status: prArticlesTable.status,
        scheduledAt: prArticlesTable.scheduledAt,
        submittedAt: prArticlesTable.submittedAt,
        postedAt: prArticlesTable.postedAt,
        publicationUrl: prArticlesTable.publicationUrl,
        submissionMessage: prArticlesTable.submissionMessage,
        lastCheckedAt: prArticlesTable.lastCheckedAt,
        createdAt: prArticlesTable.createdAt,
      })
      .from(prArticlesTable)
      .innerJoin(businessesTable, eq(prArticlesTable.businessId, businessesTable.id))
      .where(eq(prArticlesTable.businessId, businessId))
      .orderBy(desc(prArticlesTable.createdAt));
    res.json(articles);
  } else {
    // 全ビジネスの記事を返す
    const userBizIds = (await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.userId, userId))).map(b => b.id);
    if (userBizIds.length === 0) { res.json([]); return; }
    const articles = await db
      .select({
        id: prArticlesTable.id,
        businessId: prArticlesTable.businessId,
        businessName: businessesTable.name,
        title: prArticlesTable.title,
        content: prArticlesTable.content,
        status: prArticlesTable.status,
        scheduledAt: prArticlesTable.scheduledAt,
        submittedAt: prArticlesTable.submittedAt,
        postedAt: prArticlesTable.postedAt,
        publicationUrl: prArticlesTable.publicationUrl,
        submissionMessage: prArticlesTable.submissionMessage,
        lastCheckedAt: prArticlesTable.lastCheckedAt,
        createdAt: prArticlesTable.createdAt,
      })
      .from(prArticlesTable)
      .innerJoin(businessesTable, eq(prArticlesTable.businessId, businessesTable.id))
      .where(eq(businessesTable.userId, userId))
      .orderBy(desc(prArticlesTable.createdAt));
    res.json(articles);
  }
});

router.post("/pr-articles/generate", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const { businessId, topic } = req.body;
  if (!businessId) { res.status(400).json({ error: "businessId is required" }); return; }

  const biz = await ownsBusiness(userId, businessId);
  if (!biz) { res.status(403).json({ error: "Forbidden" }); return; }

  const { generatePrFreeArticle } = await import("../lib/pr-free-scheduler");
  const generated = await generatePrFreeArticle(biz, typeof topic === "string" && topic.trim() ? topic.trim() : undefined);

  const [article] = await db.insert(prArticlesTable).values({
    businessId,
    title: generated.title,
    content: generated.content,
    status: "draft",
  }).returning();

  res.json(article);
});

router.patch("/pr-articles/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const id = Number(req.params.id);
  const { title, content, status, scheduledAt } = req.body;
  const allowedStatuses = ["draft", "scheduled"];
  if (status !== undefined && !allowedStatuses.includes(status)) {
    res.status(400).json({ error: "この状態には手動変更できません" }); return;
  }

  const [article] = await db.select().from(prArticlesTable).where(eq(prArticlesTable.id, id));
  if (!article) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await ownsBusiness(userId, article.businessId))) { res.status(403).json({ error: "Forbidden" }); return; }
  if (!["draft", "failed", "scheduled"].includes(article.status)) {
    res.status(409).json({ error: "送信後の記事は編集できません。修正する場合は新しい下書きを作成してください" }); return;
  }

  const [updated] = await db.update(prArticlesTable).set({
    ...(title !== undefined && { title }),
    ...(content !== undefined && { content }),
    ...(status !== undefined && { status }),
    ...(scheduledAt !== undefined && { scheduledAt: scheduledAt ? new Date(scheduledAt) : null }),
    updatedAt: new Date(),
  }).where(eq(prArticlesTable.id, id)).returning();

  res.json(updated);
});

router.delete("/pr-articles/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const id = Number(req.params.id);

  const [article] = await db.select().from(prArticlesTable).where(eq(prArticlesTable.id, id));
  if (!article) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await ownsBusiness(userId, article.businessId))) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(prArticlesTable).where(eq(prArticlesTable.id, id));
  res.json({ ok: true });
});

const PR_FREE_CATEGORIES = [
  "ＩＴ・通信", "流通", "芸能", "スポーツ", "映画・音楽",
  "出版・アート・カルチャー", "ゲーム・ホビー", "デジタル製品・家電",
  "インテリア・雑貨", "自動車・バイク", "ファッション", "飲食・食品・飲料",
  "美容・医療・健康", "コンサルティング・シンクタンク", "金融",
  "広告・マーケティング", "教育・資格・人材", "ホテル・レジャー",
  "建設・住宅・空間デザイン", "素材・化学・エネルギー・運輸", "自然・環境", "SDGs", "その他",
];

router.post("/pr-articles/:id/auto-post", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const id = Number(req.params.id);
  const { category = "その他" } = req.body;

  const [article] = await db.select().from(prArticlesTable).where(eq(prArticlesTable.id, id));
  if (!article) { res.status(404).json({ error: "Not found" }); return; }
  if (!["draft", "failed", "scheduled"].includes(article.status)) {
    res.status(409).json({ error: "審査待ちまたは公開済みの記事は再送できません" }); return;
  }

  const biz = await ownsBusiness(userId, article.businessId);
  if (!biz) { res.status(403).json({ error: "Forbidden" }); return; }

  if (!PR_FREE_CATEGORIES.includes(category)) {
    res.status(400).json({ error: "Invalid category" }); return;
  }

  const siteUrl = biz.serviceUrl || "https://sinjapan.work";

  const result = await postToPrFreePlaywright({
    teamname: "合同会社SIN JAPAN",
    name: "大谷",
    email: "info@sinjapan.jp",
    url: siteUrl,
    category,
    companyname: biz.name.slice(0, 30),
    title: article.title,
    subtitle: "",
    content: article.content,
  });

  if (result.success) {
    await db.update(prArticlesTable).set({
      status: "submitted",
      submittedAt: new Date(),
      submissionMessage: result.message,
      lastCheckedAt: null,
      updatedAt: new Date(),
    }).where(eq(prArticlesTable.id, id));
    res.json({ ok: true, message: result.message || "送信を受け付けました。現在は審査待ちです。" });
  } else {
    await db.update(prArticlesTable).set({
      status: "failed",
      submissionMessage: result.message,
      updatedAt: new Date(),
    }).where(eq(prArticlesTable.id, id));
    res.status(422).json({ error: result.message || "PR-FREE送信失敗", detail: result });
  }
});

router.post("/pr-articles/:id/check-publication", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const id = Number(req.params.id);
  const [article] = await db.select().from(prArticlesTable).where(eq(prArticlesTable.id, id));
  if (!article) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await ownsBusiness(userId, article.businessId))) { res.status(403).json({ error: "Forbidden" }); return; }
  if (!["submitted", "unknown", "posted"].includes(article.status)) {
    res.status(409).json({ error: "審査待ちの記事だけ公開確認できます" }); return;
  }

  try {
    const { checkPrFreePublication } = await import("../lib/pr-free-scheduler");
    const result = await checkPrFreePublication(id);
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "公開確認に失敗しました" });
  }
});

router.post("/pr-articles/run-daily", requireAuth, async (req, res): Promise<void> => {
  const { runPrFreeDailyNow } = await import("../lib/pr-free-scheduler");
  res.json({ ok: true, message: "PR-FREE一括投稿を開始しました（バックグラウンド実行）" });
  runPrFreeDailyNow().catch(() => {});
});

router.post("/pr-articles/generate-and-post/:businessId", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const businessId = Number(req.params.businessId);

  const biz = await ownsBusiness(userId, businessId);
  if (!biz) { res.status(403).json({ error: "Forbidden" }); return; }

  const { generateAndPost } = await import("../lib/pr-free-scheduler");
  res.json({ ok: true, message: `${biz.name} の記事生成・投稿を開始しました` });
  generateAndPost(biz).catch(() => {});
});

export { PR_FREE_CATEGORIES };
export default router;
