import cron from "node-cron";
import { db, businessesTable, prArticlesTable } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import OpenAI from "openai";
import { logger } from "./logger";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const openaiApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "";
const openaiBaseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const openai = new OpenAI({
  apiKey: openaiApiKey,
  ...(openaiBaseURL ? { baseURL: openaiBaseURL } : {}),
});

const PR_FREE_CF7_ENDPOINT =
  "https://pr-free.jp/wp-json/contact-form-7/v1/contact-forms/25868/feedback";

const FIXED_CONTACT = {
  teamname: "合同会社SIN JAPAN",
  name: "大谷",
  email: "info@sinjapan.jp",
  companyname: "合同会社SIN JAPAN",
};

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
    return "軽貨物ドライバーと荷主をダイレクトにマッチングするBtoBプラットフォーム。仲介業者を介さない直接契約モデルで、ドライバー側の報酬向上と荷主側のコスト削減を同時に実現。全国対応でスマホから案件確認・応募が完結し、完全成果報酬型のため初期費用ゼロで導入できる軽貨物専門のマッチングサービス。";
  if (/TRA MATCH/i.test(n))
    return "一般貨物（大型・中型トラック）の運送会社と荷主をダイレクトにマッチングするBtoBプラットフォーム。仲介なしの直接契約で傭車コストを削減し、運送会社の安定稼働を支援。全国対応で新規取引先開拓をスムーズに実現する一般貨物専門のマッチングサービス。";
  if (/KEI SAIYOU/i.test(n))
    return "軽貨物ドライバーの採用に特化した求人・採用支援サービス。独立開業を目指すドライバーや副業ドライバーの獲得から、軽貨物事業者向けの採用コンサルティングまでワンストップで対応。採用コストを抑えながら即戦力ドライバーを確保できる軽貨物採用専門サービス。";
  if (/SIN JAPAN AI/i.test(n))
    return "合同会社SIN JAPANが提供する営業DX・業務自動化AIソリューション。リード獲得からメール送信・フォローアップまでの営業プロセスをAIで自動化し、中小企業の営業効率を劇的に向上させる。ChatGPT・AIを活用した日本語対応の営業自動化プラットフォーム。";
  if (/TikTok/i.test(n))
    return "TikTok ONE公認代理店として、TikTok広告の企画・運用代行とTikTokクリエイターを活用したPR施策を提供。中小企業から大手企業まで予算規模を問わず対応し、TikTokの短尺動画広告で新規顧客獲得と認知拡大を実現する広告代理サービス。";
  if (/フルコミ|フル・コミ/i.test(n))
    return "完全成果報酬型（フルコミッション）の営業代理人・営業パートナーを獲得・マッチングするサービス。固定給不要で即戦力の営業人材を確保でき、営業組織の立ち上げコストをゼロに抑えながら売上拡大を実現。中小企業向けのフルコミ営業パートナー獲得支援サービス。";
  if (/軽貨物.*ドライバー|ドライバー.*軽貨物/i.test(n))
    return "軽貨物ドライバーの求人・採用に特化した人材採用サービス。未経験・経験者問わず応募でき、週払い・日払い対応で安定した高収入が得られる。個人事業主として独立開業を目指す方や副業として軽貨物配送を始めたい方を広く募集。合同会社SIN JAPANが運営する軽貨物ドライバー専門の採用プラットフォーム。";
  if (/チャットレディ/i.test(n))
    return "在宅・店舗でできるチャットレディのお仕事を紹介する女性向け求人サービス。スマートフォン1台で始められ、時間・場所を選ばない柔軟な働き方が可能。未経験者でも安心のサポート体制を完備し、高収入・在宅ワークを希望する女性を積極採用。合同会社SIN JAPANが運営するチャットレディ専門の求人プラットフォーム。";
  if (/軽貨物.*案件|案件.*軽貨物/i.test(n))
    return "軽貨物ドライバー・軽貨物事業者向けの運送案件獲得支援サービス。直接契約の高単価案件を継続的に紹介し、不安定な稼働問題を解消。個人事業主から法人まで対応し、軽貨物ビジネスの安定収益化をサポートする案件獲得プラットフォーム。";
  if (/軽貨物.*協力|協力.*軽貨物/i.test(n))
    return "軽貨物配送の協力会社・傭車パートナーを効率的に獲得できるマッチングサービス。急増する配送需要に対応するための協力会社ネットワーク構築を支援。全国の軽貨物事業者とのマッチングで、繁忙期の対応力強化と安定した配送体制を実現。";
  if (/一般貨物.*案件|案件.*一般貨物/i.test(n))
    return "一般貨物（大型・中型トラック）運送会社向けの運送案件獲得支援サービス。直接契約の高単価長距離・チャーター案件を継続紹介し、空車率の削減と安定稼働を実現。一般貨物事業者の新規荷主開拓をサポートする案件獲得プラットフォーム。";
  if (/一般貨物.*協力|協力.*一般貨物/i.test(n))
    return "一般貨物運送の協力会社・傭車パートナーを効率的に獲得するマッチングサービス。全国の一般貨物事業者とのネットワーク構築で、急な運送依頼にも柔軟に対応できる協力体制を整備。物流会社の傭車コスト削減と対応力向上を支援。";
  if (/人材.*案件|案件.*人材/i.test(n))
    return "人材紹介・人材派遣会社向けの求人案件・クライアント企業獲得支援サービス。人材業界の新規取引先開拓を効率化し、安定した求人案件のパイプラインを構築。人材会社の営業コストを削減しながら継続的な案件獲得を実現するBtoBマッチングサービス。";
  if (/人材.*協力|協力.*人材/i.test(n))
    return "人材業界の協力会社・業務提携パートナーを獲得するマッチングサービス。人材紹介・派遣各社のネットワーク拡充を支援し、紹介しきれない候補者の連携対応や合同案件への対応力を強化。人材会社間のパートナーシップ構築を促進するサービス。";
  return `合同会社SIN JAPANが提供する「${bizName}」サービス。`;
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

interface GeneratedArticle {
  title: string;
  subtitle: string;
  content: string;
}

// ニュースフックをランダムに選ぶ（毎回違うニュース角度で審査通過率アップ）
const NEWS_HOOKS = [
  { hook: "正式リリース", detail: "本日より正式サービスを開始いたしました。" },
  { hook: "ベータ版提供開始", detail: "先行ベータ版の一般提供を開始し、登録受付中です。" },
  { hook: "導入実績100社突破", detail: "導入企業が100社を突破し、サービス拡充を図ります。" },
  { hook: "新機能追加", detail: "ユーザーの声を反映した新機能を実装し、利便性をさらに向上させました。" },
  { hook: "春の無料トライアルキャンペーン開始", detail: "期間限定で30日間の無料トライアルを提供いたします。" },
  { hook: "業務提携締結", detail: "新たなパートナー企業との業務提携を締結し、サービス提供エリアを拡大します。" },
  { hook: "料金プラン改定", detail: "より多くの中小企業に導入いただけるよう、料金プランを見直しました。" },
  { hook: "累計マッチング件数1,000件突破", detail: "累計マッチング件数が1,000件を突破し、順調に成長を続けています。" },
  { hook: "全国対応エリア拡大", detail: "これまでの主要都市圏に加え、全国47都道府県への対応を完了しました。" },
  { hook: "スマートフォンアプリ版リリース", detail: "iOS・Android対応のスマートフォンアプリ版を新たにリリースしました。" },
];

function pickNewsHook(): typeof NEWS_HOOKS[number] {
  return NEWS_HOOKS[Math.floor(Math.random() * NEWS_HOOKS.length)];
}

// 今日の日付（JST）
function getTodayJST(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}

async function generateArticle(biz: typeof businessesTable.$inferSelect): Promise<GeneratedArticle> {
  const siteUrl = biz.serviceUrl || "https://sinjapan.work";
  const serviceDesc = getServiceDescription(biz.name, siteUrl);
  const newsHook = pickNewsHook();
  const todayJST = getTodayJST();

  const prompt = `
あなたはプロの日本語プレスリリースライターです。
編集者が「これは本物のニュースだ」と判断できる、ニュース性の高いプレスリリースを作成してください。

【発表日】${todayJST}

【サービス情報】
サービス名: ${biz.name}
会社名: 合同会社SIN JAPAN
サービスURL: ${siteUrl}
サービス説明: ${serviceDesc}

【今回のニュース角度】
${newsHook.hook}：${newsHook.detail}

【作成にあたっての注意事項】
- 冒頭は「〇〇（会社名）は、${todayJST}、〜を発表しました」という形式で始める
- サービス名・サービス内容を正確に反映する（他サービスと混同しない）
- 具体的な数字・事実・ユーザーメリットを盛り込む
- 宣伝文句（「最高の」「業界最安値」など根拠のない表現）は避ける
- ビジネスニュースとして自然な文体（PR TIMESレベル）で書く
- テンプレートっぽい文章・箇条書きの羅列は避け、流れのある文章にする

【出力フォーマット（必ずこの形式で出力）】
タイトル: （25〜45文字。「〇〇、〜を〜」という第三者視点のニュースタイトル）
サブタイトル: （20〜35文字の補足タイトル）
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
  const title = titleMatch ? titleMatch[1].trim() : `${biz.name} プレスリリース`;
  const subtitle = subtitleMatch ? subtitleMatch[1].trim() : "";
  const content = rawText
    .replace(/タイトル[:：]\s*.+\n?/, "")
    .replace(/サブタイトル[:：]\s*.+\n?/, "")
    .replace(/^-{3,}\n?/, "")
    .trim();

  return { title, subtitle, content };
}

function buildFormData(
  biz: typeof businessesTable.$inferSelect,
  article: GeneratedArticle,
  category: string,
  logoBuffer: Buffer,
): FormData {
  const siteUrl = biz.serviceUrl || "https://sinjapan.work";
  const formData = new FormData();

  formData.append("_wpcf7", "25868");
  formData.append("_wpcf7_version", "5.2");
  formData.append("_wpcf7_locale", "ja");
  formData.append("_wpcf7_unit_tag", "wpcf7-f25868-p2821-o1");
  formData.append("_wpcf7_container_post", "2821");
  formData.append("_wpcf7_posted_data_hash", "");

  formData.append("your-teamname", FIXED_CONTACT.teamname);
  formData.append("your-name", FIXED_CONTACT.name);
  formData.append("your-email", FIXED_CONTACT.email);
  formData.append("url-adress", siteUrl);
  formData.append("category", category);
  formData.append("companyname", FIXED_CONTACT.companyname);
  formData.append("your-subject", article.title.slice(0, 140));
  formData.append("subtitle", article.subtitle.slice(0, 140));
  formData.append("your-message", article.content);

  const logoBlob = new Blob([logoBuffer], { type: "image/jpeg" });
  formData.append("file-img1", logoBlob, "sinjapan-logo.jpg");

  return formData;
}

export async function generateAndPost(biz: typeof businessesTable.$inferSelect): Promise<void> {
  const bizId = biz.id;
  const category = detectCategory(biz.name);

  logger.info({ bizId, bizName: biz.name, category }, "pr-free: start generate+post");

  const article = await generateArticle(biz);

  const [savedArticle] = await db
    .insert(prArticlesTable)
    .values({ businessId: bizId, title: article.title, content: article.content, status: "draft" })
    .returning();

  let logoBuffer: Buffer;
  try {
    logoBuffer = readFileSync(join(__dirname, "sinjapan-logo.jpg"));
  } catch {
    logger.warn({ bizId }, "pr-free: logo not found, sending without image");
    logoBuffer = Buffer.alloc(0);
  }

  const formData = buildFormData(biz, article, category, logoBuffer);

  const cfRes = await fetch(PR_FREE_CF7_ENDPOINT, {
    method: "POST",
    headers: {
      Referer: "https://pr-free.jp/prform/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      Origin: "https://pr-free.jp",
    },
    body: formData,
  });

  const cfJson = (await cfRes.json()) as { status: string; message?: string };

  if (cfJson.status === "mail_sent") {
    await db
      .update(prArticlesTable)
      .set({ status: "posted", postedAt: new Date(), updatedAt: new Date() })
      .where(eq(prArticlesTable.id, savedArticle.id));
    logger.info({ bizId, bizName: biz.name, articleId: savedArticle.id }, "pr-free: posted successfully");
  } else {
    logger.warn({ bizId, bizName: biz.name, cfStatus: cfJson.status, cfMessage: cfJson.message }, "pr-free: post failed");
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
  // 9:00 JST (00:00 UTC) 開始、ビジネスごとに45分間隔で順次投稿
  cron.schedule("0 0 * * *", async () => {
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
      if (i < businesses.length - 1) await sleep(45 * 60 * 1000); // 45分間隔
    }
    logger.info("pr-free: daily scheduler finished");
  }, { timezone: "UTC" });

  logger.info("pr-free: scheduler registered (毎日9:00 JST開始、45分間隔で全件投稿)");
}
