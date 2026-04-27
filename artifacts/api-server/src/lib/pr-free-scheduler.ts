import cron from "node-cron";
import { db, businessesTable, prArticlesTable } from "@workspace/db";
import { eq, and, gte, desc } from "drizzle-orm";
import OpenAI from "openai";
import { logger } from "./logger";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PR_FREE_CF7_ENDPOINT =
  "https://pr-free.jp/wp-json/contact-form-7/v1/contact-forms/25868/feedback";

function detectCategory(bizName: string): string {
  const n = bizName;
  if (/AI|DX|テック|IT|システム/i.test(n)) return "ＩＴ・通信";
  if (/TikTok|SNS|動画|広告|マーケ/i.test(n)) return "広告・マーケティング";
  if (/人材|採用|求人|スタッフ/i.test(n)) return "教育・資格・人材";
  if (/物流|配送|貨物|運輸|軽貨物|一般貨物|KEI|TRA/i.test(n)) return "素材・化学・エネルギー・運輸";
  if (/コンサル|営業|フルコミ/i.test(n)) return "コンサルティング・シンクタンク";
  return "その他";
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function hasPostedTodayJST(businessId: number): Promise<boolean> {
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const startOfDayJST = new Date(nowJST);
  startOfDayJST.setUTCHours(0, 0, 0, 0);
  startOfDayJST.setTime(startOfDayJST.getTime() - 9 * 60 * 60 * 1000);

  const rows = await db
    .select({ id: prArticlesTable.id })
    .from(prArticlesTable)
    .where(
      and(
        eq(prArticlesTable.businessId, businessId),
        eq(prArticlesTable.status, "posted"),
        gte(prArticlesTable.postedAt, startOfDayJST),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

async function generateAndPost(biz: typeof businessesTable.$inferSelect): Promise<void> {
  const bizId = biz.id;
  const category = detectCategory(biz.name);

  logger.info({ bizId, bizName: biz.name, category }, "pr-free: start generate+post");

  const prompt = `
あなたは日本語のプレスリリース（PR FREE向け）ライターです。
以下のビジネス情報をもとに、PR FREEに投稿できるプレスリリース記事を作成してください。

ビジネス名: ${biz.name}
会社名: ${biz.companyName || "合同会社SIN JAPAN"}

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
メール: ${biz.senderEmail}
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

  const [article] = await db
    .insert(prArticlesTable)
    .values({ businessId: bizId, title, content, status: "draft" })
    .returning();

  const siteUrl = biz.serviceUrl || "https://sinjapan-sales.site";

  const formBody = new URLSearchParams({
    _wpcf7: "25868",
    _wpcf7_version: "5.2",
    _wpcf7_locale: "ja",
    _wpcf7_unit_tag: "wpcf7-f25868-p2821-o1",
    _wpcf7_container_post: "2821",
    _wpcf7_posted_data_hash: "",
    "your-teamname": biz.name,
    "your-name": biz.senderName,
    "your-email": biz.senderEmail,
    "url-adress": siteUrl,
    category,
    companyname: biz.companyName || "合同会社SIN JAPAN",
    "your-subject": title.slice(0, 140),
    subtitle: "",
    "your-message": content,
  });

  const cfRes = await fetch(PR_FREE_CF7_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: "https://pr-free.jp/prform/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      Origin: "https://pr-free.jp",
    },
    body: formBody.toString(),
  });

  const cfJson = (await cfRes.json()) as { status: string; message?: string };

  if (cfJson.status === "mail_sent") {
    await db
      .update(prArticlesTable)
      .set({ status: "posted", postedAt: new Date(), updatedAt: new Date() })
      .where(eq(prArticlesTable.id, article.id));
    logger.info({ bizId, bizName: biz.name, articleId: article.id }, "pr-free: posted successfully");
  } else {
    logger.warn({ bizId, bizName: biz.name, cfStatus: cfJson.status, cfMessage: cfJson.message }, "pr-free: post failed");
    await db
      .update(prArticlesTable)
      .set({ status: "draft", updatedAt: new Date() })
      .where(eq(prArticlesTable.id, article.id));
  }
}

export async function runPrFreeDailyNow() {
  logger.info("pr-free: manual daily run triggered");
  const businesses = await db.select().from(businessesTable);
  for (let i = 0; i < businesses.length; i++) {
    const biz = businesses[i];
    try {
      const alreadyPosted = await hasPostedTodayJST(biz.id);
      if (alreadyPosted) {
        logger.info({ bizId: biz.id, bizName: biz.name }, "pr-free: already posted today, skip");
        continue;
      }
      await generateAndPost(biz);
    } catch (err) {
      logger.error({ err, bizId: biz.id, bizName: biz.name }, "pr-free: error processing business");
    }
    if (i < businesses.length - 1) await sleep(2 * 60 * 1000);
  }
  logger.info("pr-free: manual daily run finished");
}

export function startPrFreeScheduler() {
  // 毎朝 01:00 UTC = 10:00 JST
  cron.schedule("0 1 * * *", async () => {
    logger.info("pr-free: daily scheduler started");

    const businesses = await db.select().from(businessesTable);
    logger.info({ count: businesses.length }, "pr-free: processing businesses");

    for (let i = 0; i < businesses.length; i++) {
      const biz = businesses[i];
      try {
        const alreadyPosted = await hasPostedTodayJST(biz.id);
        if (alreadyPosted) {
          logger.info({ bizId: biz.id, bizName: biz.name }, "pr-free: already posted today, skip");
          continue;
        }

        await generateAndPost(biz);
      } catch (err) {
        logger.error({ err, bizId: biz.id, bizName: biz.name }, "pr-free: error processing business");
      }

      // 2分待機（次のビジネスまで）
      if (i < businesses.length - 1) {
        await sleep(2 * 60 * 1000);
      }
    }

    logger.info("pr-free: daily scheduler finished");
  }, {
    timezone: "UTC",
  });

  logger.info("pr-free: scheduler registered (daily 10:00 JST)");
}
