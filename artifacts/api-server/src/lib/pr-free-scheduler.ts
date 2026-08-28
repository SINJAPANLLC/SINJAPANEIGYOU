import cron from "node-cron";
import { db, businessesTable, prArticlesTable } from "@workspace/db";
import { eq, and, gte, inArray, desc, sql } from "drizzle-orm";
import OpenAI from "openai";
import { logger } from "./logger";
import { postToPrFreePlaywright } from "./pr-free-playwright";
import { isPrFreePublicTitleMatch } from "./pr-free-publication";

const openaiApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "";
const openaiBaseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const openai = new OpenAI({
  apiKey: openaiApiKey,
  ...(openaiBaseURL ? { baseURL: openaiBaseURL } : {}),
});

const FIXED_CONTACT = {
  teamname: "合同会社SIN JAPAN",
  name: "大谷",
  email: "info@sinjapan.jp",
};

const AUTOMATIC_ARTICLE_FORBIDDEN = /導入実績|累計|突破|業務提携|提携を締結|料金プラン|新機能|正式リリース|ベータ版|アプリ版|無料トライアル|全国(?:47都道府県)?対応|初期費用(?:ゼロ|0円)|業界最安|高収入|\d[\d,.]*\s*(?:社|件|人|%|％|倍)/;

function detectCategory(bizName: string): string {
  if (/TikTok|SNS|動画|広告|マーケ/i.test(bizName)) return "広告・マーケティング";
  if (/チャットレディ|在宅.*ワーク|女性.*求人/i.test(bizName)) return "教育・資格・人材";
  if (/人材|採用|求人|スタッフ|SAIYOU|ドライバー募集/i.test(bizName)) return "教育・資格・人材";
  if (/物流|配送|貨物|運輸|軽貨物|一般貨物|KEI|TRA/i.test(bizName)) return "素材・化学・エネルギー・運輸";
  if (/コンサル|営業|フルコミ/i.test(bizName)) return "コンサルティング・シンクタンク";
  if (/\bAI\b|DX|テック|\bIT\b|システム/i.test(bizName)) return "ＩＴ・通信";
  return "その他";
}

function getServiceDescription(bizName: string, serviceUrl: string): string {
  const n = bizName;
  if (/KEI MATCH/i.test(n))
    return "軽貨物ドライバーと配送案件を探す事業者をつなぐ、軽貨物業界向けのマッチングサービスです。";
  if (/TRA MATCH/i.test(n))
    return "一般貨物の運送会社と荷主をつなぎ、取引先探しを支援する事業者向けマッチングサービスです。";
  if (/KEI SAIYOU/i.test(n))
    return "軽貨物ドライバーを採用したい事業者の求人・採用活動を支援するサービスです。";
  if (/SIN JAPAN AI/i.test(n))
    return "営業活動や日常業務の整理・自動化を支援する、日本語対応のAIサービスです。";
  if (/TikTok/i.test(n))
    return "TikTok広告の企画・運用と、クリエイターを活用したPR施策を支援するサービスです。";
  if (/フルコミ|フル・コミ/i.test(n))
    return "営業人材を必要とする企業と営業パートナーをつなぐ、営業活動の支援サービスです。";
  if (/軽貨物.*ドライバー|ドライバー.*軽貨物/i.test(n))
    return "軽貨物ドライバーの仕事探しと、配送事業者の採用活動を支援する求人サービスです。";
  if (/チャットレディ/i.test(n))
    return "チャットを通じた仕事を探す方へ、求人情報と応募機会を案内するサービスです。";
  if (/軽貨物.*案件|案件.*軽貨物/i.test(n))
    return "軽貨物ドライバーや軽貨物事業者の配送案件探しを支援するサービスです。";
  if (/軽貨物.*協力|協力.*軽貨物/i.test(n))
    return "軽貨物配送の協力会社を探す事業者と、仕事を探す軽貨物事業者をつなぐサービスです。";
  if (/一般貨物.*案件|案件.*一般貨物/i.test(n))
    return "一般貨物の運送会社が配送案件や取引先を探すための支援サービスです。";
  if (/一般貨物.*協力|協力.*一般貨物/i.test(n))
    return "一般貨物運送の協力会社を探す事業者同士をつなぐマッチングサービスです。";
  if (/人材.*案件|案件.*人材/i.test(n))
    return "人材紹介・人材派遣会社の求人案件や取引先探しを支援する事業者向けサービスです。";
  if (/人材.*協力|協力.*人材/i.test(n))
    return "人材紹介・人材派遣会社同士の協力先探しを支援する事業者向けサービスです。";
  return `合同会社SIN JAPANが提供する「${bizName}」サービス。`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function shouldSkipAutomaticPost(businessId: number): Promise<boolean> {
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const startOfDayJST = new Date(nowJST);
  startOfDayJST.setUTCHours(0, 0, 0, 0);
  startOfDayJST.setTime(startOfDayJST.getTime() - 9 * 60 * 60 * 1000);

  const attemptedToday = await db
    .select({ id: prArticlesTable.id })
    .from(prArticlesTable)
    .where(
      and(
        eq(prArticlesTable.businessId, businessId),
        gte(prArticlesTable.createdAt, startOfDayJST),
      ),
    )
    .limit(1);

  if (attemptedToday.length > 0) return true;

  const acceptedSubmission = await db
    .select({ id: prArticlesTable.id })
    .from(prArticlesTable)
    .where(and(
      eq(prArticlesTable.businessId, businessId),
      inArray(prArticlesTable.status, ["submitted", "published", "unknown", "posted"]),
    ))
    .limit(1);
  return acceptedSubmission.length > 0;
}

interface GeneratedArticle {
  title: string;
  subtitle: string;
  content: string;
}

function getTodayJST(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}

function cleanTitle(title: string, bizName: string): string {
  return title
    .replace(/^合同会社SIN JAPAN[、／:：\s-]*/i, "")
    .replace(new RegExp(`^${bizName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[、／:：\\s-]*`, "i"), "")
    .trim()
    .slice(0, 60);
}

export async function generatePrFreeArticle(
  biz: typeof businessesTable.$inferSelect,
  verifiedTopic?: string,
): Promise<GeneratedArticle> {
  const siteUrl = biz.serviceUrl || "https://sinjapan.work";
  const serviceDesc = getServiceDescription(biz.name, siteUrl);
  const todayJST = getTodayJST();

  const prompt = `
あなたはプロの日本語プレスリリースライターです。
PR-FREEの審査担当者が読みやすい、事実に基づくサービス紹介文を作成してください。

【発表日】${todayJST}

【サービス情報】
サービス名: ${biz.name}
会社名: 合同会社SIN JAPAN
サービスURL: ${siteUrl}
サービス説明: ${serviceDesc}

【今回伝える内容】
${verifiedTopic || `${biz.name}がどのような利用者の、どのような課題を支援するサービスかを紹介する`}

【作成にあたっての注意事項】
- 入力情報にない実績、件数、利用者数、提携、受賞、料金、対応地域、開始日、新機能、アプリ提供などを絶対に創作しない
- 「正式リリース」「突破」「業務提携」「料金改定」「全国対応」など、入力情報にないニュースを作らない
- サービス名・サービス内容を正確に反映し、断定できない効果は「支援する」「目指す」と表現する
- 宣伝文句（「最高の」「業界最安値」など根拠のない表現）は避ける
- ビジネスニュースとして自然な文体（PR TIMESレベル）で書く
- テンプレートっぽい文章・箇条書きの羅列は避け、流れのある文章にする
- タイトルには「合同会社SIN JAPAN」やサービス名を入れない（フォーム側でサービス名が先頭に付くため）

【出力フォーマット（必ずこの形式で出力）】
タイトル: （20〜30文字。サービス名・会社名を繰り返さない）
サブタイトル: （20〜30文字の補足タイトル）
---
（本文：700〜900字。リード文→背景→サービス詳細→今後の展開→お問い合わせの構成で）

【お問い合わせ】
会社名: 合同会社SIN JAPAN
担当: 大谷
メール: info@sinjapan.jp
URL: ${siteUrl}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.75,
  });

  const rawText = completion.choices[0].message.content || "";
  const titleMatch = rawText.match(/タイトル[:：]\s*(.+)/);
  const subtitleMatch = rawText.match(/サブタイトル[:：]\s*(.+)/);
  const title = cleanTitle(titleMatch ? titleMatch[1].trim() : "事業者向けサービスの提供内容を紹介", biz.name);
  const subtitle = subtitleMatch ? subtitleMatch[1].trim() : "";
  const content = rawText
    .replace(/タイトル[:：]\s*.+\n?/, "")
    .replace(/サブタイトル[:：]\s*.+\n?/, "")
    .replace(/^-{3,}\n?/, "")
    .trim();

  if (!verifiedTopic && AUTOMATIC_ARTICLE_FORBIDDEN.test(`${title}\n${subtitle}\n${content}`)) {
    throw new Error("事実確認できない実績・提携・料金・機能などが生成されたため投稿を中止しました");
  }
  if (content.length < 300) throw new Error("PR-FREEの最低文字数を満たさないため投稿を中止しました");

  return { title, subtitle, content };
}

export async function generateAndPost(biz: typeof businessesTable.$inferSelect): Promise<void> {
  const bizId = biz.id;
  const category = detectCategory(biz.name);
  const siteUrl = biz.serviceUrl || "https://sinjapan.work";

  logger.info({ bizId, bizName: biz.name, category }, "pr-free: start generate+post (Playwright)");

  if (await shouldSkipAutomaticPost(bizId)) {
    logger.info({ bizId, bizName: biz.name }, "pr-free: recent attempt or accepted submission exists, skip");
    return;
  }

  const article = await generatePrFreeArticle(biz);

  const [savedArticle] = await db
    .insert(prArticlesTable)
    .values({ businessId: bizId, title: article.title, content: article.content, status: "draft" })
    .returning();

  const result = await postToPrFreePlaywright({
    teamname: FIXED_CONTACT.teamname,
    name: FIXED_CONTACT.name,
    email: FIXED_CONTACT.email,
    url: siteUrl,
    category,
    companyname: biz.name.slice(0, 30),
    title: article.title,
    subtitle: article.subtitle,
    content: article.content,
  });

  if (result.success) {
    await db
      .update(prArticlesTable)
      .set({
        status: "submitted",
        submittedAt: new Date(),
        submissionMessage: result.message,
        lastCheckedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(prArticlesTable.id, savedArticle.id));
    logger.info(
      { bizId, bizName: biz.name, articleId: savedArticle.id, message: result.message },
      "pr-free: submission accepted via Playwright; awaiting review",
    );
  } else {
    await db
      .update(prArticlesTable)
      .set({ status: "failed", submissionMessage: result.message, updatedAt: new Date() })
      .where(eq(prArticlesTable.id, savedArticle.id));
    logger.warn(
      { bizId, bizName: biz.name, message: result.message },
      "pr-free: post failed via Playwright",
    );
  }
}

type PrFreeSearchResult = { title?: string; url?: string };

export async function checkPrFreePublication(articleId: number) {
  const [article] = await db.select().from(prArticlesTable).where(eq(prArticlesTable.id, articleId));
  if (!article) throw new Error("記事が見つかりません");
  if (!["submitted", "unknown", "posted"].includes(article.status)) {
    throw new Error("審査待ちの記事だけ公開確認できます");
  }
  const [business] = await db
    .select({ name: businessesTable.name })
    .from(businessesTable)
    .where(eq(businessesTable.id, article.businessId));
  if (!business) throw new Error("記事に紐づくサービスが見つかりません");

  const checkedAt = new Date();
  try {
    const queries = [article.title, business.name];
    const results: PrFreeSearchResult[] = [];
    for (const query of queries) {
      const url = `https://pr-free.jp/wp-json/wp/v2/search?search=${encodeURIComponent(query)}&per_page=100`;
      const response = await fetch(url, {
        headers: { "User-Agent": "SIN-JAPAN-PR-Publication-Checker/1.0" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`PR-FREE公開検索 HTTP ${response.status}`);
      results.push(...await response.json() as PrFreeSearchResult[]);
    }
    const match = results.find((item) =>
      item.url && isPrFreePublicTitleMatch(item.title || "", article.title, business.name)
    );

    if (match?.url) {
      await db.update(prArticlesTable).set({
        status: "published",
        publicationUrl: match.url,
        postedAt: checkedAt,
        lastCheckedAt: checkedAt,
        updatedAt: checkedAt,
      }).where(eq(prArticlesTable.id, articleId));
      return { published: true, publicationUrl: match.url };
    }

    const submittedAt = article.submittedAt || article.createdAt;
    const reviewWindowExpired = checkedAt.getTime() - submittedAt.getTime() > 3 * 24 * 60 * 60 * 1000;
    await db.update(prArticlesTable).set({
      status: reviewWindowExpired ? "unknown" : "submitted",
      lastCheckedAt: checkedAt,
      updatedAt: checkedAt,
    }).where(eq(prArticlesTable.id, articleId));
    return { published: false, publicationUrl: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "公開確認に失敗しました";
    await db.update(prArticlesTable).set({
      status: "unknown",
      submissionMessage: article.submissionMessage
        ? `${article.submissionMessage}\n公開確認: ${message}`
        : `公開確認: ${message}`,
      lastCheckedAt: checkedAt,
      updatedAt: checkedAt,
    }).where(eq(prArticlesTable.id, articleId));
    throw error;
  }
}

export async function verifyPendingPrFreePublications() {
  const pending = await db
    .select({ id: prArticlesTable.id })
    .from(prArticlesTable)
    .where(inArray(prArticlesTable.status, ["submitted", "unknown", "posted"]))
    .orderBy(sql`${prArticlesTable.lastCheckedAt} asc nulls first`, desc(prArticlesTable.createdAt))
    .limit(10);
  for (const article of pending) {
    try {
      await checkPrFreePublication(article.id);
    } catch (error) {
      logger.warn({ articleId: article.id, error }, "pr-free: publication check failed");
    }
    await sleep(500);
  }
}

export async function runPrFreeDailyNow() {
  logger.info("pr-free: manual daily run triggered (Playwright)");
  const businesses = await db.select().from(businessesTable);
  for (let i = 0; i < businesses.length; i++) {
    const biz = businesses[i];
    try {
      const shouldSkip = await shouldSkipAutomaticPost(biz.id);
      if (shouldSkip) {
        logger.info({ bizId: biz.id, bizName: biz.name }, "pr-free: recent attempt or accepted submission exists, skip");
        continue;
      }
      await generateAndPost(biz);
    } catch (err) {
      logger.error({ err, bizId: biz.id, bizName: biz.name }, "pr-free: error processing business");
    }
    if (i < businesses.length - 1) await sleep(3 * 60 * 1000);
  }
  logger.info("pr-free: manual daily run finished");
}

export function startPrFreeScheduler() {
  // 9:00 JST (00:00 UTC) 開始、ビジネスごとに45分間隔で順次投稿
  cron.schedule("0 0 * * *", async () => {
    logger.info("pr-free: daily scheduler started (Playwright)");
    const businesses = await db.select().from(businessesTable);
    logger.info({ count: businesses.length }, "pr-free: processing businesses");
    for (let i = 0; i < businesses.length; i++) {
      const biz = businesses[i];
      try {
        const shouldSkip = await shouldSkipAutomaticPost(biz.id);
        if (shouldSkip) {
          logger.info({ bizId: biz.id, bizName: biz.name }, "pr-free: recent attempt or accepted submission exists, skip");
          continue;
        }
        await generateAndPost(biz);
      } catch (err) {
        logger.error({ err, bizId: biz.id, bizName: biz.name }, "pr-free: error processing business");
      }
      if (i < businesses.length - 1) await sleep(45 * 60 * 1000);
    }
    logger.info("pr-free: daily scheduler finished");
  }, { timezone: "UTC" });

  cron.schedule("10 * * * *", async () => {
    logger.info("pr-free: scheduled publication verification started");
    await verifyPendingPrFreePublications();
  }, { timezone: "UTC" });

  logger.info("pr-free: scheduler registered (毎日9:00 JST開始、Playwright投稿、45分間隔、公開確認は毎時10分)");
}
