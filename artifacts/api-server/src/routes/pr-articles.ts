import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, prArticlesTable, businessesTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import OpenAI from "openai";

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
  if (!businessId) { res.status(400).json({ error: "businessId is required" }); return; }
  if (!(await ownsBusiness(userId, businessId))) { res.status(403).json({ error: "Forbidden" }); return; }

  const articles = await db.select().from(prArticlesTable)
    .where(eq(prArticlesTable.businessId, businessId))
    .orderBy(desc(prArticlesTable.createdAt));
  res.json(articles);
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

export default router;
