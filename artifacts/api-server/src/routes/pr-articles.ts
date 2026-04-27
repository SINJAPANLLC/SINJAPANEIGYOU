import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, prArticlesTable, businessesTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import OpenAI from "openai";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router: IRouter = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
        postedAt: prArticlesTable.postedAt,
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
        postedAt: prArticlesTable.postedAt,
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

  const prompt = `
あなたは日本語のプレスリリース（PR TIMES FREE向け）ライターです。
以下のビジネス情報をもとに、PR TIMES FREEに投稿できるプレスリリース記事を作成してください。

ビジネス名: ${biz.name}
会社名: ${biz.companyName || "合同会社SIN JAPAN"}
${topic ? `テーマ・トピック: ${topic}` : ""}

【フォーマット】
タイトル: （キャッチーで検索されやすい20〜40文字）
---
本文:
（リード文：2〜3行でニュースの要点を伝える）

【サービス概要】
（ビジネスのサービス内容を300〜400字で説明）

【特徴・強み】
・（箇条書き3〜5項目）

【お問い合わせ】
会社名: ${biz.companyName || "合同会社SIN JAPAN"}
メール: info@sinjapan.jp
${biz.serviceUrl ? `URL: ${biz.serviceUrl}` : ""}

記事全体で500〜800字程度で作成してください。PR TIMESのルールに沿ったビジネスライクな文体で。
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
  });

  const rawText = completion.choices[0].message.content || "";
  const titleMatch = rawText.match(/タイトル[:：]\s*(.+)/);
  const title = titleMatch ? titleMatch[1].trim() : `${biz.name} プレスリリース`;
  const content = rawText.replace(/タイトル[:：]\s*.+\n?-{3,}\n?/, "").trim();

  const [article] = await db.insert(prArticlesTable).values({
    businessId,
    title,
    content,
    status: "draft",
  }).returning();

  res.json(article);
});

router.patch("/pr-articles/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const id = Number(req.params.id);
  const { title, content, status, scheduledAt } = req.body;

  const [article] = await db.select().from(prArticlesTable).where(eq(prArticlesTable.id, id));
  if (!article) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await ownsBusiness(userId, article.businessId))) { res.status(403).json({ error: "Forbidden" }); return; }

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

  const biz = await ownsBusiness(userId, article.businessId);
  if (!biz) { res.status(403).json({ error: "Forbidden" }); return; }

  if (!PR_FREE_CATEGORIES.includes(category)) {
    res.status(400).json({ error: "Invalid category" }); return;
  }

  const siteUrl = biz.serviceUrl || "https://sinjapan-sales.site";

  const formData = new FormData();
  formData.append("_wpcf7", "25868");
  formData.append("_wpcf7_version", "5.2");
  formData.append("_wpcf7_locale", "ja");
  formData.append("_wpcf7_unit_tag", "wpcf7-f25868-p2821-o1");
  formData.append("_wpcf7_container_post", "2821");
  formData.append("_wpcf7_posted_data_hash", "");
  formData.append("your-teamname", "合同会社SIN JAPAN");
  formData.append("your-name", "大谷");
  formData.append("your-email", "info@sinjapan.jp");
  formData.append("url-adress", siteUrl);
  formData.append("category", category);
  formData.append("companyname", "合同会社SIN JAPAN");
  formData.append("your-subject", article.title.slice(0, 140));
  formData.append("subtitle", "");
  formData.append("your-message", article.content);

  try {
    const logoBuffer = readFileSync(join(__dirname, "../lib/sinjapan-logo.jpg"));
    formData.append("file-img1", new Blob([logoBuffer], { type: "image/jpeg" }), "sinjapan-logo.jpg");
  } catch {
    // ロゴなしで続行
  }

  const cfRes = await fetch(
    "https://pr-free.jp/wp-json/contact-form-7/v1/contact-forms/25868/feedback",
    {
      method: "POST",
      headers: {
        "Referer": "https://pr-free.jp/prform/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Origin": "https://pr-free.jp",
      },
      body: formData,
    }
  );

  const cfJson = await cfRes.json() as { status: string; message?: string };

  if (cfJson.status === "mail_sent") {
    await db.update(prArticlesTable).set({
      status: "posted",
      postedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(prArticlesTable.id, id));
    res.json({ ok: true, message: cfJson.message || "投稿成功" });
  } else {
    res.status(422).json({ error: cfJson.message || "PR-FREE送信失敗", detail: cfJson });
  }
});

router.post("/pr-articles/run-daily", requireAuth, async (req, res): Promise<void> => {
  const { runPrFreeDailyNow } = await import("../lib/pr-free-scheduler");
  res.json({ ok: true, message: "PR-FREE一括投稿を開始しました（バックグラウンド実行）" });
  runPrFreeDailyNow().catch(() => {});
});

export { PR_FREE_CATEGORIES };
export default router;
