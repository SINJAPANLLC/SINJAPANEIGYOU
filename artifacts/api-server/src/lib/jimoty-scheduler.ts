import cron from "node-cron";
import axios from "axios";
import * as cheerio from "cheerio";
import { db, businessesTable, jimotyPostsTable, jimotyAccountsTable, jimotySettingsTable } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import OpenAI from "openai";
import { logger } from "./logger";

const openaiApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "";
const openaiBaseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const openai = new OpenAI({
  apiKey: openaiApiKey,
  ...(openaiBaseURL ? { baseURL: openaiBaseURL } : {}),
});

const JIMOTY_BASE = "https://jmty.jp";
const DEFAULT_AREA = process.env.JIMOTY_AREA || "osaka-fu";
const DEFAULT_KIND = "biz-partner";

export async function getJimotySettings(): Promise<{ area: string; cronExpression: string }> {
  const rows = await db.select().from(jimotySettingsTable).limit(1);
  if (rows.length > 0) return { area: rows[0].area, cronExpression: rows[0].cronExpression };
  const [created] = await db.insert(jimotySettingsTable).values({}).returning();
  return { area: created.area, cronExpression: created.cronExpression };
}

export async function updateJimotySettings(updates: { area?: string; cronExpression?: string }): Promise<void> {
  const rows = await db.select().from(jimotySettingsTable).limit(1);
  if (rows.length === 0) {
    await db.insert(jimotySettingsTable).values({ area: updates.area ?? DEFAULT_AREA, cronExpression: updates.cronExpression ?? "0 2 * * *" });
  } else {
    const set: Record<string, string> = {};
    if (updates.area !== undefined) set.area = updates.area;
    if (updates.cronExpression !== undefined) set.cronExpression = updates.cronExpression;
    await db.update(jimotySettingsTable).set(set).where(eq(jimotySettingsTable.id, rows[0].id));
  }
  if (updates.cronExpression !== undefined) {
    reschedule(updates.cronExpression);
  }
}

export async function generateJimotyPreview(businessId: number): Promise<{ title: string; body: string }> {
  const [biz] = await db.select().from(businessesTable).where(eq(businessesTable.id, businessId));
  if (!biz) throw new Error("ビジネスが見つかりません");
  return generateJimotyPost(biz.name);
}

export async function generatePersonalJimotyPreview(): Promise<{ title: string; body: string }> {
  return generatePersonalJimotyPost();
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function extractCookies(headers: Record<string, string | string[] | undefined>): string {
  const raw = headers["set-cookie"];
  if (!raw) return "";
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map((c: string) => c.split(";")[0]).join("; ");
}

function mergeCookies(existing: string, newCookies: string): string {
  const map: Record<string, string> = {};
  for (const pair of existing.split(";")) {
    const [k, v] = pair.trim().split("=");
    if (k) map[k.trim()] = v?.trim() ?? "";
  }
  for (const pair of newCookies.split(";")) {
    const [k, v] = pair.trim().split("=");
    if (k) map[k.trim()] = v?.trim() ?? "";
  }
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join("; ");
}

export async function loginToJimoty(email: string, password: string): Promise<string> {
  const loginPageResp = await axios.get(`${JIMOTY_BASE}/users/sign_in`, {
    headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml" },
    maxRedirects: 5,
  });

  let cookies = extractCookies(loginPageResp.headers as Record<string, string | string[]>);
  const $login = cheerio.load(loginPageResp.data);
  const csrfToken = $login('input[name="authenticity_token"]').first().val() as string;

  if (!csrfToken) throw new Error("ジモティーのCSRFトークンが取得できませんでした");

  const loginResp = await axios.post(
    `${JIMOTY_BASE}/users/sign_in`,
    new URLSearchParams({
      authenticity_token: csrfToken,
      "user[email]": email,
      "user[password]": password,
      commit: "ログイン",
    }).toString(),
    {
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": cookies,
        "Referer": `${JIMOTY_BASE}/users/sign_in`,
        "Accept": "text/html,application/xhtml+xml",
      },
      maxRedirects: 0,
      validateStatus: (s) => s < 400,
    }
  );

  const newCookies = extractCookies(loginResp.headers as Record<string, string | string[]>);
  cookies = mergeCookies(cookies, newCookies);

  if (loginResp.status !== 302 && loginResp.status !== 200) {
    throw new Error(`ログイン失敗: status=${loginResp.status}`);
  }

  if (!cookies.includes("_jmty_session") && !cookies.includes("remember_user_token")) {
    const cookieKeys = cookies.split(";").map(c => c.trim().split("=")[0]).filter(Boolean).slice(0, 10).join(", ");
    throw new Error(`ログイン失敗: セッションクッキーなし (status=${loginResp.status}, cookies=[${cookieKeys || "none"}])`);
  }

  return cookies;
}

export async function postToJimoty(
  cookies: string,
  title: string,
  body: string,
  area: string = DEFAULT_AREA,
  kind: string = DEFAULT_KIND,
  contactInfo: string = "info@sinjapan.jp",
): Promise<string> {
  const newArticleResp = await axios.get(`${JIMOTY_BASE}/articles/new`, {
    headers: {
      "User-Agent": UA,
      "Cookie": cookies,
      "Accept": "text/html,application/xhtml+xml",
    },
    maxRedirects: 5,
  });

  const newCookies = extractCookies(newArticleResp.headers as Record<string, string | string[]>);
  cookies = mergeCookies(cookies, newCookies);

  const $ = cheerio.load(newArticleResp.data);
  const csrfToken = $('input[name="authenticity_token"]').first().val() as string;

  if (!csrfToken) throw new Error("記事フォームのCSRFトークンが取得できませんでした");

  const postResp = await axios.post(
    `${JIMOTY_BASE}/articles`,
    new URLSearchParams({
      authenticity_token: csrfToken,
      "article[title]": title,
      "article[body]": body,
      "article[kind]": kind,
      "article[area_code]": area,
      "article[contact_info]": contactInfo,
      commit: "投稿する",
    }).toString(),
    {
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": cookies,
        "Referer": `${JIMOTY_BASE}/articles/new`,
        "Accept": "text/html,application/xhtml+xml",
      },
      maxRedirects: 0,
      validateStatus: (s) => s < 500,
    }
  );

  const location = postResp.headers["location"] as string | undefined;
  if (postResp.status === 302 && location) {
    return location.startsWith("http") ? location : `${JIMOTY_BASE}${location}`;
  }

  if (postResp.status === 200) {
    const $post = cheerio.load(postResp.data);
    const canonical = $post('link[rel="canonical"]').attr("href") ?? "";
    if (canonical.includes("/articles/")) return canonical;
    const articleLink = $post('a[href*="/articles/"]').first().attr("href") ?? "";
    if (articleLink) return articleLink.startsWith("http") ? articleLink : `${JIMOTY_BASE}${articleLink}`;
  }

  throw new Error(`投稿失敗: status=${postResp.status}`);
}

function getJimotyDescription(bizName: string): string {
  const n = bizName;
  if (/KEI MATCH/i.test(n)) return "【軽貨物マッチング】ドライバー・荷主の直接契約を実現。仲介なし・完全成果報酬型。初期費用ゼロで案件獲得・協力会社募集をサポート。合同会社SIN JAPAN";
  if (/TRA MATCH/i.test(n)) return "【一般貨物マッチング】トラック運送会社と荷主をダイレクト接続。傭車コスト削減・新規取引先開拓に。合同会社SIN JAPAN";
  if (/KEI SAIYOU/i.test(n)) return "【軽貨物ドライバー採用】独立・副業ドライバー獲得に特化した採用支援。採用コスト削減で即戦力確保。合同会社SIN JAPAN";
  if (/SIN JAPAN AI/i.test(n)) return "【営業DX・AI自動化】リード獲得からメール送信まで営業プロセスをAI自動化。中小企業の営業効率を大幅改善。合同会社SIN JAPAN";
  if (/TikTok/i.test(n)) return "【TikTok ONE公認代理店】TikTok広告運用・クリエイターPR施策を代行。中小企業からの依頼歓迎。合同会社SIN JAPAN";
  if (/フルコミ|フル・コミ/i.test(n)) return "【フルコミ営業パートナー募集】完全成果報酬型の営業代理人を求む。固定費ゼロで即戦力営業人材確保。合同会社SIN JAPAN";
  if (/軽貨物.*案件|案件.*軽貨物/i.test(n)) return "【軽貨物案件獲得支援】安定した高単価案件を継続紹介。個人事業主・法人どちらも対応。合同会社SIN JAPAN";
  if (/軽貨物.*協力|協力.*軽貨物/i.test(n)) return "【軽貨物協力会社募集】配送需要拡大につき協力会社・傭車パートナーを募集中。合同会社SIN JAPAN";
  if (/一般貨物.*案件|案件.*一般貨物/i.test(n)) return "【一般貨物案件獲得】長距離・チャーター高単価案件を継続紹介。空車率削減・安定稼働を実現。合同会社SIN JAPAN";
  if (/一般貨物.*協力|協力.*一般貨物/i.test(n)) return "【一般貨物協力会社募集】急な運送依頼に対応できる傭車パートナーを全国募集。合同会社SIN JAPAN";
  if (/人材.*案件|案件.*人材/i.test(n)) return "【人材案件獲得支援】人材紹介・派遣会社向けに新規クライアント企業を継続紹介。合同会社SIN JAPAN";
  if (/人材.*協力|協力.*人材/i.test(n)) return "【人材協力会社募集】業務提携・候補者連携パートナーを募集。人材会社間のネットワーク拡充を支援。合同会社SIN JAPAN";
  return `【${bizName}】合同会社SIN JAPANのサービスです。詳細はお問い合わせください。`;
}

async function generatePersonalJimotyPost(): Promise<{ title: string; body: string }> {
  const themes = [
    "異業種交流会や勉強会に参加したい",
    "ビジネスパートナーや仲間を探している",
    "地元で友人・仲間を作りたい",
    "起業仲間や副業に興味がある人と繋がりたい",
    "趣味や仕事を通じた人脈を広げたい",
    "地域のコミュニティやイベント仲間を探している",
  ];
  const theme = themes[Math.floor(Math.random() * themes.length)];

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "あなたはジモティーの「一緒にやろう・仲間募集」カテゴリへの投稿文を作成するアシスタントです。個人として人脈・つながりを広げたい人の自然な投稿文を作成してください。個人名・メールアドレス・会社名は一切含めないでください。",
      },
      {
        role: "user",
        content: `テーマ「${theme}」でジモティーに投稿する文章を作成してください。\n\n要件:\n- タイトル: 20〜30文字、親しみやすく自然な文体\n- 本文: 150〜300文字、個人として気軽に声をかけたい雰囲気\n- 個人名・メールアドレス・会社名・電話番号は一切含めない\n- 「ジモティーのメッセージ機能でご連絡ください」のみ連絡手段として記載\n- 宣伝っぽくない、自然な個人の投稿文として\n\n以下のJSON形式で返してください:\n{"title": "...", "body": "..."}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.85,
  });

  const raw = completion.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(raw);
  return {
    title: parsed.title ?? "一緒に活動しませんか",
    body: parsed.body ?? "人脈を広げたいと思っています。お気軽にメッセージください。",
  };
}

async function generateJimotyPost(bizName: string): Promise<{ title: string; body: string }> {
  const desc = getJimotyDescription(bizName);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "あなたはジモティーの掲示板投稿文を作成するアシスタントです。ジモティーは地域の掲示板サービスです。ビジネス募集・お知らせカテゴリに投稿するための、簡潔で実用的な日本語の投稿文を作成してください。",
      },
      {
        role: "user",
        content: `以下のサービスについてジモティーへの投稿文を作成してください。\n\nサービス情報: ${desc}\n\n要件:\n- タイトル: 30文字以内、具体的で目を引く内容\n- 本文: 200〜400文字、サービス内容・メリット・連絡先(info@sinjapan.jp)を含める\n- 宣伝っぽすぎず、実際の募集・お知らせとして自然な文体\n\n以下のJSON形式で返してください:\n{"title": "...", "body": "..."}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const raw = completion.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(raw);
  return {
    title: parsed.title ?? bizName,
    body: parsed.body ?? desc,
  };
}

async function hasPostedTodayJST(businessId: number): Promise<boolean> {
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const startOfDayJST = new Date(nowJST);
  startOfDayJST.setUTCHours(0, 0, 0, 0);
  startOfDayJST.setTime(startOfDayJST.getTime() - 9 * 60 * 60 * 1000);

  const rows = await db
    .select({ id: jimotyPostsTable.id })
    .from(jimotyPostsTable)
    .where(
      and(
        eq(jimotyPostsTable.businessId, businessId),
        eq(jimotyPostsTable.status, "posted"),
        gte(jimotyPostsTable.postedAt, startOfDayJST)
      )
    );
  return rows.length > 0;
}

interface AccountCredential {
  id: number | null;
  label: string;
  email: string;
  password: string;
}

async function resolveAccount(businessId: number): Promise<AccountCredential | null> {
  const [biz] = await db.select().from(businessesTable).where(eq(businessesTable.id, businessId));
  if (!biz) return null;

  if (biz.jimotyAccountId) {
    const [acct] = await db.select().from(jimotyAccountsTable).where(eq(jimotyAccountsTable.id, biz.jimotyAccountId));
    if (acct) return { id: acct.id, label: acct.label, email: acct.email, password: acct.password };
  }

  const defaultAccounts = await db.select().from(jimotyAccountsTable).where(eq(jimotyAccountsTable.isDefault, true));
  if (defaultAccounts.length > 0) {
    const acct = defaultAccounts[0];
    return { id: acct.id, label: acct.label, email: acct.email, password: acct.password };
  }

  const allAccounts = await db.select().from(jimotyAccountsTable);
  if (allAccounts.length > 0) {
    const acct = allAccounts[0];
    return { id: acct.id, label: acct.label, email: acct.email, password: acct.password };
  }

  const envEmail = process.env.JIMOTY_EMAIL;
  const envPassword = process.env.JIMOTY_PASSWORD;
  if (envEmail && envPassword) {
    return { id: null, label: "環境変数", email: envEmail, password: envPassword };
  }

  return null;
}

export async function jimotyGenerateAndPost(
  businessId: number,
  overrideAccountId?: number,
  overrideArea?: string,
  previewTitle?: string,
  previewBody?: string,
): Promise<{ success: boolean; message: string; url?: string; accountLabel?: string }> {
  const [biz] = await db.select().from(businessesTable).where(eq(businessesTable.id, businessId));
  if (!biz) return { success: false, message: "ビジネスが見つかりません" };

  let account: AccountCredential | null = null;
  if (overrideAccountId != null) {
    const [acct] = await db.select().from(jimotyAccountsTable).where(eq(jimotyAccountsTable.id, overrideAccountId));
    if (acct) account = { id: acct.id, label: acct.label, email: acct.email, password: acct.password };
  }
  if (!account) account = await resolveAccount(businessId);
  if (!account) {
    return { success: false, message: "ジモティーアカウントが設定されていません" };
  }

  const [record] = await db
    .insert(jimotyPostsTable)
    .values({ businessId, accountId: account.id, title: previewTitle ?? "生成中...", body: previewBody ?? "", status: "draft" })
    .returning();

  try {
    let title = previewTitle;
    let body = previewBody;
    if (!title || !body) {
      const generated = await generateJimotyPost(biz.name);
      title = generated.title;
      body = generated.body;
    }

    await db.update(jimotyPostsTable)
      .set({ title, body })
      .where(eq(jimotyPostsTable.id, record.id));

    const settings = await getJimotySettings();
    const area = overrideArea ?? settings.area;

    logger.info({ businessId, bizName: biz.name, accountLabel: account.label }, "jimoty: ログイン中");
    const cookies = await loginToJimoty(account.email, account.password);

    logger.info({ businessId }, "jimoty: 投稿中");
    const url = await postToJimoty(cookies, title, body, area);

    await db.update(jimotyPostsTable)
      .set({ status: "posted", postedAt: new Date(), jimotyUrl: url })
      .where(eq(jimotyPostsTable.id, record.id));

    logger.info({ businessId, url, accountLabel: account.label }, "jimoty: 投稿完了");
    return { success: true, message: "投稿完了", url, accountLabel: account.label };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ businessId, err: msg }, "jimoty: 投稿失敗");

    await db.update(jimotyPostsTable)
      .set({ status: "failed", errorMsg: msg })
      .where(eq(jimotyPostsTable.id, record.id));

    return { success: false, message: msg };
  }
}

export async function jimotyPersonalPost(
  accountId: number,
  overrideArea?: string,
  previewTitle?: string,
  previewBody?: string,
): Promise<{ success: boolean; message: string; url?: string; accountLabel?: string }> {
  const [acct] = await db.select().from(jimotyAccountsTable).where(eq(jimotyAccountsTable.id, accountId));
  if (!acct) return { success: false, message: "アカウントが見つかりません" };

  const [record] = await db
    .insert(jimotyPostsTable)
    .values({ businessId: null as any, accountId: acct.id, title: previewTitle ?? "生成中...", body: previewBody ?? "", status: "draft" })
    .returning();

  try {
    let title = previewTitle;
    let body = previewBody;
    if (!title || !body) {
      const generated = await generatePersonalJimotyPost();
      title = generated.title;
      body = generated.body;
    }

    await db.update(jimotyPostsTable)
      .set({ title, body })
      .where(eq(jimotyPostsTable.id, record.id));

    const settings = await getJimotySettings();
    const area = overrideArea ?? settings.area;

    logger.info({ accountLabel: acct.label }, "jimoty: 個人投稿 ログイン中");
    const cookies = await loginToJimoty(acct.email, acct.password);

    logger.info({ accountLabel: acct.label }, "jimoty: 個人投稿 投稿中");
    const url = await postToJimoty(cookies, title, body, area, "friend", "");

    await db.update(jimotyPostsTable)
      .set({ status: "posted", postedAt: new Date(), jimotyUrl: url })
      .where(eq(jimotyPostsTable.id, record.id));

    logger.info({ url, accountLabel: acct.label }, "jimoty: 個人投稿 完了");
    return { success: true, message: "投稿完了", url, accountLabel: acct.label };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ accountId, err: msg }, "jimoty: 個人投稿 失敗");

    await db.update(jimotyPostsTable)
      .set({ status: "failed", errorMsg: msg })
      .where(eq(jimotyPostsTable.id, record.id));

    return { success: false, message: msg };
  }
}

async function runDailyJimoty() {
  logger.info("jimoty: 日次自動投稿開始");

  const businesses = await db.select().from(businessesTable);
  const accountSessions: Record<string, string> = {};

  for (let i = 0; i < businesses.length; i++) {
    const biz = businesses[i];

    if (await hasPostedTodayJST(biz.id)) {
      logger.info({ bizId: biz.id, name: biz.name }, "jimoty: 本日投稿済み → スキップ");
      continue;
    }

    const account = await resolveAccount(biz.id);
    if (!account) {
      logger.warn({ bizId: biz.id }, "jimoty: アカウント未設定 → スキップ");
      continue;
    }

    const sessionKey = account.email;
    if (!accountSessions[sessionKey]) {
      try {
        accountSessions[sessionKey] = await loginToJimoty(account.email, account.password);
        logger.info({ accountLabel: account.label }, "jimoty: ログイン成功");
      } catch (err) {
        logger.error({ err, accountLabel: account.label }, "jimoty: ログイン失敗");
        continue;
      }
    }

    const [record] = await db
      .insert(jimotyPostsTable)
      .values({ businessId: biz.id, accountId: account.id, title: "生成中...", body: "", status: "draft" })
      .returning();

    try {
      const { title, body } = await generateJimotyPost(biz.name);
      await db.update(jimotyPostsTable).set({ title, body }).where(eq(jimotyPostsTable.id, record.id));

      const url = await postToJimoty(accountSessions[sessionKey], title, body);

      await db.update(jimotyPostsTable)
        .set({ status: "posted", postedAt: new Date(), jimotyUrl: url })
        .where(eq(jimotyPostsTable.id, record.id));

      logger.info({ bizId: biz.id, url, account: account.label }, "jimoty: 投稿完了");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ bizId: biz.id, err: msg }, "jimoty: 投稿失敗");
      await db.update(jimotyPostsTable)
        .set({ status: "failed", errorMsg: msg })
        .where(eq(jimotyPostsTable.id, record.id));
    }

    if (i < businesses.length - 1) {
      await new Promise((r) => setTimeout(r, 3 * 60 * 1000));
    }
  }

  logger.info("jimoty: 日次自動投稿完了");
}

let currentTask: cron.ScheduledTask | null = null;

function reschedule(expression: string) {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }
  if (!cron.validate(expression)) {
    logger.error({ expression }, "jimoty: 無効なCRON式 → スキップ");
    return;
  }
  currentTask = cron.schedule(expression, () => {
    runDailyJimoty().catch((err) =>
      logger.error({ err }, "jimoty: scheduler uncaught error")
    );
  }, { timezone: "UTC" });
  logger.info({ expression }, "jimoty: scheduler 再スケジュール完了");
}

export async function startJimotyScheduler() {
  const settings = await getJimotySettings().catch(() => ({ area: DEFAULT_AREA, cronExpression: "0 2 * * *" }));
  reschedule(settings.cronExpression);
  logger.info({ expr: settings.cronExpression }, "jimoty: scheduler registered");
}
