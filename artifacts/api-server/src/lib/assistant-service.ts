import OpenAI from "openai";
import crypto from "crypto";
import { TwitterApi } from "twitter-api-v2";
import { and, desc, eq, gt, gte, ilike, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import {
  assistantMemoriesTable,
  assistantMessagesTable,
  assistantNotesTable,
  assistantProfilesTable,
  assistantReportsTable,
  assistantResearchItemsTable,
  assistantTodosTable,
  businessesTable,
  cronJobsTable,
  db,
  emailLogsTable,
  leadsTable,
  sinJapanDriverGroupsTable,
  sinJapanDriverLinkCodesTable,
  sinJapanDriverReportsTable,
  sinJapanDriversTable,
  sinJapanDailyReportsTable,
  sinJapanEscalationsTable,
  sinJapanResourcesTable,
  sinJapanUnlinkedGroupReportsTable,
  xAccountsTable,
} from "@workspace/db";
import { logger } from "./logger";
import { isLineConfigured, safePushLineText } from "./line-client";
import { searchAirtable, type AirtableSearchOptions } from "./airtable-client";

const DEFAULT_TOPICS = [
  "日本と世界の経済ニュース 今日",
  "SNSで話題のニュースとトレンド 今日",
  "物流・人材業界の最新ニュース",
  "中小企業と営業活動に影響するニュース",
];
const DAILY_REPORT_SCHEDULE = { morning: 9, evening: 19 } as const;
const SIN_JAPAN_MANAGER_REPORT_HOURS = [9, 12, 17] as const;
const DAILY_REPORT_TEMPLATE = [
  "おはようございます。",
  "本日の目標・タスク・状況を共有します。",
  "",
  "【KGI】",
  "・キャッシュ1,000万円｜エンジェル投資",
  "・月商1,000万円｜＋500万円",
  "・ストック月100万円｜自社車両30台",
  "",
  "【数字】",
  "・キャッシュ｜現在： ／ 目標：1,000万円",
  "・売上｜現在： ／ 目標：1,000万円",
  "・自社車両｜現在： ／ 目標：30台",
  "",
  "【今日の最優先】",
  "・",
  "",
  "【今日のTODO】",
  "・月末処理",
  "・営業アプリの開発",
  "",
  "【営業｜人が欲しいものを提供】",
  "・金｜営業アプリ",
  "・案件｜営業アプリ → オプチャ → Chat LOGI",
  "・人｜営業アプリ → オプチャ → KEI SAIYOU",
  "・車｜営業アプリ → オプチャ → Chat VAN",
  "",
  "【組織】",
  "・秘書より対応事項を取得",
  "",
  "【連絡・確認】",
  "・LINE：",
  "・電話：",
  "・メール：",
  "・メモ：",
  "",
  "【家・家族】",
  "・今日やること：",
  "・確認事項：",
  "",
  "【体】",
  "・睡眠：",
  "・体調：",
  "・食事：",
  "・運動：",
  "",
  "【人】",
  "・今日会う人：",
  "・連絡する人：",
  "",
  "【勉強】",
  "・今日学ぶこと：",
  "・学んだこと：",
  "・仕事・生活への活用：",
  "",
  "【楽しみ】",
  "・今日：",
  "・今週：",
  "",
  "【今日の情報】",
  "・海外｜",
  "・日本｜",
  "・経済｜",
  "・ビジネス｜",
  "・話題｜",
  "",
  "以上が本日の状況です。",
  "仕事・生活・学びを積み上げながら、今日の最優先から進めていきましょう。",
].join("\n");
const EVENING_REPORT_TEMPLATE = [
  "こんばんは。",
  "本日の振り返りと、明日の準備を共有します。",
  "",
  "【今日できたこと】",
  "・",
  "",
  "【未完了TODO】",
  "・",
  "",
  "【問題・確認事項】",
  "・",
  "",
  "【今日の学び】",
  "・",
  "",
  "【明日の最優先】",
  "・",
  "",
  "【明日のTODO】",
  "・",
  "",
  "【今日の情報】",
  "・海外｜",
  "・日本｜",
  "・経済｜",
  "・ビジネス｜",
  "・話題｜",
  "",
  "今日もお疲れさまでした。明日は最優先の一つから始めましょう。",
].join("\n");
const MAX_CONTEXT_ITEMS = 20;

function sinJapanPublicBaseUrl() {
  const configured = process.env.APP_URL?.trim() || process.env.REPLIT_DEV_DOMAIN?.trim();
  if (!configured) return "";
  return (configured.startsWith("http://") || configured.startsWith("https://") ? configured : `https://${configured}`).replace(/\/+$/u, "");
}

function sinJapanDefaultResources() {
  const baseUrl = sinJapanPublicBaseUrl();
  const guideUrl = (slug: string) => `${baseUrl}/api/assistant/sin-japan-line/guides/${slug}.pdf`;
  return [
    {
      title: "面談資料｜報酬・契約・車両レンタル",
      url: guideUrl("driver-start"),
      phase: "hired",
      description: "報酬・契約条件と車両レンタルについてご確認いただく資料です。",
    },
    {
      title: "Amazon業務資料｜配送と研修",
      url: guideUrl("amazon-delivery"),
      phase: "hired",
      description: "配送の流れ、安全運転、研修、稼働開始までの準備をご確認いただく資料です。",
    },
    {
      title: "Amazon Flex",
      url: "https://apps.apple.com/app/id1454725763",
      phase: "onboarding",
      description: "iPhone: https://apps.apple.com/app/id1454725763\nAndroid: https://play.google.com/store/apps/details?id=com.amazon.flex.rabbit",
    },
    {
      title: "Disprz",
      url: "https://apps.apple.com/app/id1458716803",
      phase: "onboarding",
      description: "iPhone: https://apps.apple.com/app/id1458716803\nAndroid: https://play.google.com/store/apps/details?id=com.disprz",
    },
    {
      title: "Mentor DDP",
      url: "https://apps.apple.com/app/id1535552014",
      phase: "onboarding",
      description: "iPhone: https://apps.apple.com/app/id1535552014\nAndroid: https://play.google.com/store/apps/details?id=com.edriving.mentor.ddpeu",
    },
  ];
}

export async function ensureSinJapanDefaultResources(ownerUserId: string) {
  const current = await db.select({ title: sinJapanResourcesTable.title })
    .from(sinJapanResourcesTable)
    .where(eq(sinJapanResourcesTable.ownerUserId, ownerUserId));
  const existingTitles = new Set(current.map((resource) => resource.title));
  const missing = sinJapanDefaultResources()
    .filter((resource) => resource.url && !existingTitles.has(resource.title))
    .map((resource) => ({ ownerUserId, ...resource }));
  if (missing.length) await db.insert(sinJapanResourcesTable).values(missing);
}

function formatAssistantReply(reply: string) {
  return reply
    .replace(/\r\n/g, "\n")
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const DRIVER_CREDENTIAL_PATTERN = /パスワード|password|passcode|暗証番号|認証コード|ワンタイム(?:パス)?コード|otp|verification\s*code|ログイン情報|二段階認証|2fa|(?:^|[\s\n])(?:pw|pass|login\s*id|user(?:name)?|id|メール|e-?mail)\s*[:：=]/iu;
const STANDALONE_OTP_PATTERN = /^\s*\d{6,8}\s*$/u;
const STANDALONE_EMAIL_PATTERN = /^\s*[^\s@]+@[^\s@]+\.[^\s@]+\s*$/u;

export function containsDriverCredential(text: string) {
  return DRIVER_CREDENTIAL_PATTERN.test(text) || STANDALONE_OTP_PATTERN.test(text) || STANDALONE_EMAIL_PATTERN.test(text);
}

export function driverCredentialSafetyReply() {
  return "【大切なお願い】\n恐れ入りますが、パスワード・認証コード・ログイン情報はLINEへお送りにならないようお願いいたします。\nAmazonや各アプリの操作はご本人の端末で行っていただき、こちらでは「ログイン確認済み」などの状態のみお知らせくださいませ。";
}

function getOpenAIClient() {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  return new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
}

function parseTopics(raw: string | null | undefined) {
  try {
    const value = JSON.parse(raw || "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && Boolean(v.trim())).slice(0, 10) : [];
  } catch {
    return [];
  }
}

function localDate(timezone: string, date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function localClock(timezone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  return { hour: Number(parts.find((p) => p.type === "hour")?.value || 0), minute: Number(parts.find((p) => p.type === "minute")?.value || 0) };
}

function reportDateLabel(timezone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", weekday: "short", timeZone: timezone }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";
  const weekday = parts.find((part) => part.type === "weekday")?.value || "";
  return `${month}/${day} ${weekday}`;
}

export function getAssistantDate(timezone = "Asia/Tokyo") {
  return localDate(timezone);
}

export async function getOrCreateAssistantProfile(userId: string) {
  const existing = await db.select().from(assistantProfilesTable).where(eq(assistantProfilesTable.userId, userId));
  if (existing[0]) return existing[0];
  const code = cryptoRandomCode();
  const [created] = await db.insert(assistantProfilesTable).values({ userId, linkCode: code }).returning();
  return created;
}

function cryptoRandomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export async function buildAssistantContext(userId: string) {
  const profile = await getOrCreateAssistantProfile(userId);
  const [memories, todos, completedTodos, messages, notes, businesses] = await Promise.all([
    db.select().from(assistantMemoriesTable).where(and(eq(assistantMemoriesTable.userId, userId), eq(assistantMemoriesTable.isActive, true))).orderBy(desc(assistantMemoriesTable.updatedAt)).limit(MAX_CONTEXT_ITEMS),
    db.select().from(assistantTodosTable).where(and(eq(assistantTodosTable.userId, userId), eq(assistantTodosTable.status, "open"))).orderBy(desc(assistantTodosTable.createdAt)).limit(MAX_CONTEXT_ITEMS),
    db.select().from(assistantTodosTable).where(and(eq(assistantTodosTable.userId, userId), eq(assistantTodosTable.status, "completed"))).orderBy(desc(assistantTodosTable.completedAt)).limit(MAX_CONTEXT_ITEMS),
    db.select().from(assistantMessagesTable).where(eq(assistantMessagesTable.userId, userId)).orderBy(desc(assistantMessagesTable.createdAt)).limit(12),
    db.select().from(assistantNotesTable).where(and(eq(assistantNotesTable.userId, userId), eq(assistantNotesTable.isArchived, false))).orderBy(desc(assistantNotesTable.updatedAt)).limit(MAX_CONTEXT_ITEMS),
    db.select().from(businessesTable).where(eq(businessesTable.userId, userId)),
  ]);
  const businessIds = businesses.map((b) => b.id);
  let sales = { leads: 0, sentEmails: 0, activeSchedules: 0 };
  if (businessIds.length) {
    const [leadCount, emailCount, scheduleCount] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(leadsTable).where(inArray(leadsTable.businessId, businessIds)),
      db.select({ count: sql<number>`count(*)` }).from(emailLogsTable).where(inArray(emailLogsTable.leadId, (await db.select({ id: leadsTable.id }).from(leadsTable).where(inArray(leadsTable.businessId, businessIds))).map((r) => r.id))),
      db.select({ count: sql<number>`count(*)` }).from(cronJobsTable).where(and(inArray(cronJobsTable.businessId, businessIds), eq(cronJobsTable.isActive, true))),
    ]);
    sales = { leads: Number(leadCount[0]?.count || 0), sentEmails: Number(emailCount[0]?.count || 0), activeSchedules: Number(scheduleCount[0]?.count || 0) };
  }
  return { profile, memories, todos, completedTodos, notes, messages: messages.reverse(), sales };
}

type AssistantAction =
  | { type: "create_todo"; title: string; details?: string; priority?: string }
  | { type: "create_note"; title: string; content: string; category?: string }
  | { type: "complete_todo"; id?: number; title?: string }
  | { type: "save_memory"; content: string; category?: string }
  | { type: "forget_memory"; id?: number; content?: string };

function fallbackResponse(text: string, context: Awaited<ReturnType<typeof buildAssistantContext>>, driverMode = false) {
  if (driverMode) return { reply: "かしこまりました。担当情報を確認いたします。", actions: [] as AssistantAction[] };
  const actions: AssistantAction[] = [];
  const isWallBatting = /壁打ち|整理して|整理したい|アイデア|悩み|考えをまとめ/.test(text);
  const todo = text.match(/(?:TODO|todo|タスク|やること)(?:に|を)?\s*(.+?)(?:追加|登録|。|$)/i);
  if (todo?.[1]) actions.push({ type: "create_todo", title: todo[1].trim() });
  if (/覚えて|記憶して|記録して/.test(text)) {
    const memory = text.replace(/.*?(覚えて|記憶して|記録して)[：:\s]*/u, "").trim();
    if (memory) actions.push({ type: "save_memory", content: memory });
  }
  if (isWallBatting) {
    actions.push({
      type: "create_note",
      category: /アイデア/.test(text) ? "idea" : "temporary",
      title: "壁打ちメモ",
      content: text.replace(/^壁打ち[：:\s]*/u, "").trim(),
    });
  }
  const reply = actions.length
    ? actions.map((a) => {
      if (a.type === "create_todo") return `TODOに追加しました：「${a.title}」`;
      if (a.type === "save_memory") return `長期記憶に保存しました：「${a.content}」`;
      if (a.type === "create_note") return "壁打ち内容を一時メモに整理しました。";
      return "ご依頼を反映しました。";
    }).join("\n")
    : `承知しました。現在、未完了TODOは${context.todos.length}件、登録済みの営業リードは${context.sales.leads}件です。OpenAIを接続すると、より詳しい整理と提案ができます。`;
  return { reply, actions };
}

export async function searchAssistantKnowledge(userId: string, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const pattern = `%${trimmed}%`;
  const [notes, memories, messages, todos, reports] = await Promise.all([
    db.select({ title: assistantNotesTable.title, content: assistantNotesTable.content, category: assistantNotesTable.category, createdAt: assistantNotesTable.createdAt })
      .from(assistantNotesTable)
      .where(and(eq(assistantNotesTable.userId, userId), eq(assistantNotesTable.isArchived, false), or(ilike(assistantNotesTable.title, pattern), ilike(assistantNotesTable.content, pattern))))
      .limit(10),
    db.select({ title: sql<string>`'長期記憶'`, content: assistantMemoriesTable.content, category: assistantMemoriesTable.category, createdAt: assistantMemoriesTable.createdAt })
      .from(assistantMemoriesTable)
      .where(and(eq(assistantMemoriesTable.userId, userId), eq(assistantMemoriesTable.isActive, true), ilike(assistantMemoriesTable.content, pattern)))
      .limit(10),
    db.select({ title: sql<string>`case when ${assistantMessagesTable.role} = 'user' then '会話' else 'AI秘書の返信' end`, content: assistantMessagesTable.content, category: sql<string>`'conversation'`, createdAt: assistantMessagesTable.createdAt })
      .from(assistantMessagesTable)
      .where(and(eq(assistantMessagesTable.userId, userId), ilike(assistantMessagesTable.content, pattern)))
      .orderBy(desc(assistantMessagesTable.createdAt))
      .limit(10),
    db.select({ title: assistantTodosTable.title, content: sql<string>`coalesce(${assistantTodosTable.details}, '')`, category: sql<string>`'todo'`, createdAt: assistantTodosTable.createdAt })
      .from(assistantTodosTable)
      .where(and(eq(assistantTodosTable.userId, userId), or(ilike(assistantTodosTable.title, pattern), ilike(assistantTodosTable.details, pattern))))
      .limit(10),
    db.select({ id: assistantReportsTable.id, content: assistantReportsTable.content, createdAt: assistantReportsTable.createdAt })
      .from(assistantReportsTable)
      .where(eq(assistantReportsTable.userId, userId))
      .orderBy(desc(assistantReportsTable.createdAt))
      .limit(20),
  ]);
  const reportIds = reports.map((report) => report.id);
  const research = reportIds.length
    ? await db.select({ title: assistantResearchItemsTable.title, content: assistantResearchItemsTable.snippet, category: assistantResearchItemsTable.topic, createdAt: assistantResearchItemsTable.createdAt })
      .from(assistantResearchItemsTable)
      .where(and(inArray(assistantResearchItemsTable.reportId, reportIds), or(ilike(assistantResearchItemsTable.title, pattern), ilike(assistantResearchItemsTable.snippet, pattern))))
      .limit(10)
    : [];
  return [
    ...notes.map((item) => ({ ...item, source: "note" })),
    ...memories.map((item) => ({ ...item, source: "memory" })),
    ...messages.map((item) => ({ ...item, source: "conversation" })),
    ...todos.map((item) => ({ ...item, source: "todo" })),
    ...research.map((item) => ({ ...item, source: "research" })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 20);
}

type AssistantProcessOptions = {
  airtable?: AirtableSearchOptions;
  driverName?: string;
  driverWorkflow?: string;
  amazonAccountStatus?: string;
  appsStatus?: string;
  groupType?: "onboarding" | "operation";
  resources?: Array<{ title: string; url: string; description: string | null }>;
};

export async function processAssistantMessage(userId: string, text: string, source = "line", lineMessageId?: string, options: AssistantProcessOptions = {}) {
  const inserted = await db.insert(assistantMessagesTable).values({ userId, source, role: "user", content: text, lineMessageId: lineMessageId || null }).onConflictDoNothing().returning();
  if (!inserted.length) {
    return {
      reply: "",
      actions: [] as AssistantAction[],
      duplicate: true,
      needsManagerConfirmation: false,
      managerConfirmationReason: "",
    };
  }
  const driverMode = source === "sin-japan-driver";
  const context = await buildAssistantContext(userId);
  const searchResults = driverMode ? [] : await searchAssistantKnowledge(userId, text);
  const airtableResult = source === "sin-japan-line" || driverMode ? await searchAirtable(text, options.airtable) : null;
  const notesForAssistant = context.notes.map((note) => ({
    id: note.id,
    category: note.category,
    title: note.title,
    content: note.content,
  }));
  const searchForAssistant = searchResults.map((result) => ({
    source: result.source,
    category: result.category,
    title: result.title,
    content: result.content,
  }));
  const client = getOpenAIClient();
  let reply: string;
  let actions: AssistantAction[] = [];
  let needsManagerConfirmation = false;
  let managerConfirmationReason = "";
  if (!client) {
    ({ reply, actions } = fallbackResponse(text, context, driverMode));
    if (driverMode) {
      needsManagerConfirmation = true;
      managerConfirmationReason = "AI応答を生成できないため";
      reply = "お問い合わせありがとうございます。内容を確認のうえ、管理者様からご案内いたします。";
    }
    if (airtableResult?.error) {
      reply = `Airtable検索に失敗しました（${airtableResult.error}）。\n\n${reply}`;
    } else if (airtableResult?.records.length) {
      reply = `【Airtableから見つかった情報】\n${airtableResult.records.slice(0, 3).map((record) => `・${record.title}\n${record.content}`).join("\n\n")}\n\n${reply}`;
    }
    if (searchResults.length) {
      reply = `【見つかった情報】\n${searchResults.slice(0, 3).map((result) => `・${result.title}: ${result.content}`).join("\n")}\n\n${reply}`;
    }
  } else {
    const system = `${driverMode
      ? `あなたは日本語で応答する、女性のSIN JAPAN物流事業向け業務秘書です。
とても丁寧で柔らかく、安心感のある敬語でお話しください。業務上の正確さを保ちながら、冷たくならない親身な表現にしてください。
ドライバーには担当する配車・案件と会社共通の運用案内だけを案内してください。他のドライバーの案件、報酬、個人情報、全社の不要な情報は絶対に開示しないでください。
個人用AI秘書の記憶、TODO、過去会話、営業情報は使用しないでください。Airtable検索結果にない事実は推測せず、管理者確認が必要と伝えてください。
回答に必要な根拠が不足している場合は、needs_manager_confirmationをtrueにし、管理者へ確認する旨だけを丁寧に返してください。manager_reasonには管理者が確認すべき要点を短く記載してください。
この会話ではactionsは必ず空配列にしてください。`
      : `あなたは日本語で応答する、女性の本人専用AI秘書です。
とても丁寧で柔らかく、上品で安心感のある敬語でお話しください。`}
外部に影響する操作（メール送信、電話、SNS投稿、予約、購入）は絶対に実行せず、必要なら確認を取って下書き・提案だけします。
「覚えて」「記憶して」と明示された内容だけ長期記憶に保存し、「忘れて」と明示された場合だけ削除候補にします。
次のJSONだけを返してください。replyはユーザーにそのまま見せる自然な日本語、actionsは必要な時だけ使用します。needs_manager_confirmationはドライバー対応で管理者確認が必要な場合だけtrueにし、それ以外はfalseにしてください。
{"reply":"...", "actions":[{"type":"create_todo","title":"...", "details":"...", "priority":"high|normal|low"},{"type":"create_note","title":"...", "content":"...", "category":"todo|idea|decision|person_company|sales|reference|temporary"},{"type":"complete_todo","id":1},{"type":"save_memory","content":"...", "category":"preference|goal|business|general"},{"type":"forget_memory","id":1}], "needs_manager_confirmation":false, "manager_reason":""}
壁打ち、アイデア、悩み、情報整理の依頼では、replyに【要点】【論点】【決まっていること】【未決定のこと】【次に考えること】【TODO候補】【確認すること】を必要な範囲で含め、actionsにcreate_noteを追加してください。create_noteは長期記憶ではなく、分類付きの整理メモです。通常の雑談や明確な依頼には不要です。
LINEで読むことを前提に、返信は短く読みやすく整えてください。女性の秘書らしい、やわらかく非常に丁寧な敬語を必ず使ってください。1文を短くし、段落の間に空行を入れてください。重要な項目は【見出し】、複数項目は「・」の箇条書きを使ってください。Markdownの表、長い一段落、過剰な前置きは避け、原則300文字以内にまとめてください。
利用可能なコンテキスト:
${driverMode ? `ドライバー名: ${options.driverName || "登録済みドライバー"}
グループ用途: ${options.groupType === "operation" ? "稼働用グループ" : "採用後・準備用グループ"}
進捗: ${options.driverWorkflow || "採用後準備中"}
Amazonアカウント確認: ${options.amazonAccountStatus || "未確認"}
アプリ設定確認: ${options.appsStatus || "未確認"}` : `記憶: ${JSON.stringify(context.memories.map((m) => ({ id: m.id, category: m.category, content: m.content })))}
未完了TODO: ${JSON.stringify(context.todos.map((t) => ({ id: t.id, title: t.title, priority: t.priority })))}
営業概要: ${JSON.stringify(context.sales)}
整理メモ: ${JSON.stringify(notesForAssistant)}
検索一致: ${JSON.stringify(searchForAssistant)}`}
${airtableResult ? `SIN JAPAN物流Airtable検索結果: ${JSON.stringify(airtableResult)}
この検索結果にない事実は推測せず「Airtableでは確認できません」と伝えてください。返答では、参照した情報がAirtable由来と分かるようにしてください。` : ""}
${driverMode ? `現在の進捗に対応する案内リンク: ${JSON.stringify(options.resources || [])}
資料、フォーム、マニュアル、契約書を尋ねられた場合は、上記の案内リンクだけを使ってください。リンクがない場合は管理者へ確認するよう案内してください。` : ""}
直近会話: ${driverMode ? "[]" : JSON.stringify(context.messages.map((m) => ({ role: m.role, content: m.content })))}`;
    try {
      const result = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: system }, { role: "user", content: text }],
        response_format: { type: "json_object" },
      });
      const parsed = JSON.parse(result.choices[0]?.message?.content || "{}");
      reply = typeof parsed.reply === "string" ? parsed.reply : "承知しました。";
      actions = Array.isArray(parsed.actions) ? parsed.actions : [];
      needsManagerConfirmation = driverMode && parsed.needs_manager_confirmation === true;
      managerConfirmationReason = typeof parsed.manager_reason === "string" ? parsed.manager_reason.trim().slice(0, 240) : "";
    } catch (error) {
      logger.error({ err: error }, "assistant response generation failed");
      ({ reply, actions } = fallbackResponse(text, context, driverMode));
      if (airtableResult?.error) {
        reply = `Airtable検索に失敗しました（${airtableResult.error}）。\n\n${reply}`;
      } else if (airtableResult?.records.length) {
        reply = `【Airtableから見つかった情報】\n${airtableResult.records.slice(0, 3).map((record) => `・${record.title}\n${record.content}`).join("\n\n")}\n\n${reply}`;
      }
    }
  }
  if (driverMode) actions = [];
  if (driverMode && needsManagerConfirmation && !reply.includes("管理者")) {
    reply = `${reply}\n\n確認が必要な内容です。管理者様へ確認のうえ、ご案内いたします。`;
  }
  reply = formatAssistantReply(reply);
  await applyAssistantActions(userId, actions);
  await db.insert(assistantMessagesTable).values({ userId, source, role: "assistant", content: reply });
  return { reply, actions, airtable: airtableResult, needsManagerConfirmation, managerConfirmationReason };
}

export async function processSinJapanDriverMessage(ownerUserId: string, driverId: number, text: string, lineMessageId?: string, groupType?: "onboarding" | "operation") {
  if (groupType === "operation") {
    return {
      reply: "",
      actions: [] as AssistantAction[],
      airtable: null,
      duplicate: false,
      readOnly: true,
      needsManagerConfirmation: false,
      managerConfirmationReason: "",
    };
  }
  if (containsDriverCredential(text)) {
    return {
      reply: driverCredentialSafetyReply(),
      actions: [] as AssistantAction[],
      airtable: null,
      duplicate: false,
      blocked: true,
      needsManagerConfirmation: false,
      managerConfirmationReason: "",
    };
  }
  const [driver] = await db.select().from(sinJapanDriversTable).where(and(eq(sinJapanDriversTable.id, driverId), eq(sinJapanDriversTable.ownerUserId, ownerUserId), eq(sinJapanDriversTable.status, "active")));
  if (!driver) throw new Error("有効なドライバーが見つかりません");
  const commonTables = (process.env.AIRTABLE_COMMON_TABLES || "会社案内,運用案内,マニュアル,お知らせ")
    .split(/[\n,]/).map((name) => name.trim()).filter(Boolean);
  const resources = await db.select({
    title: sinJapanResourcesTable.title,
    url: sinJapanResourcesTable.url,
    description: sinJapanResourcesTable.description,
  }).from(sinJapanResourcesTable).where(and(
    eq(sinJapanResourcesTable.ownerUserId, ownerUserId),
    eq(sinJapanResourcesTable.isActive, true),
    or(eq(sinJapanResourcesTable.phase, "all"), eq(sinJapanResourcesTable.phase, driver.workflowStatus)),
  ));
  const driverSafeFields = (process.env.AIRTABLE_DRIVER_SAFE_FIELDS || "").split(/[\n,]/).map((field) => field.trim()).filter(Boolean);
  const driverLookupField = process.env.AIRTABLE_DRIVER_LOOKUP_FIELD?.trim() || "";
  const driverTenantField = process.env.AIRTABLE_DRIVER_TENANT_FIELD?.trim() || "";
  const driverTenantValue = process.env.AIRTABLE_DRIVER_TENANT_VALUE?.trim() || "";
  return processAssistantMessage(ownerUserId, text, "sin-japan-driver", lineMessageId, {
    driverName: driver.name,
    driverWorkflow: driver.workflowStatus,
    amazonAccountStatus: driver.amazonAccountStatus,
    appsStatus: driver.appsStatus,
    groupType,
    resources,
    airtable: { driverLookupKey: driver.airtableLookupKey, driverLookupField, driverSafeFields, driverTenantField, driverTenantValue, commonTables },
  });
}

function driverLinkCode() {
  return String(crypto.randomInt(100000, 1000000));
}

export async function createSinJapanDriverLinkCode(ownerUserId: string, driverId: number, groupType: "onboarding" | "operation") {
  const [driver] = await db.select().from(sinJapanDriversTable).where(and(eq(sinJapanDriversTable.id, driverId), eq(sinJapanDriversTable.ownerUserId, ownerUserId), eq(sinJapanDriversTable.status, "active")));
  if (!driver) throw new Error("有効なドライバーが見つかりません");
  const code = driverLinkCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await db.update(sinJapanDriverLinkCodesTable).set({ usedAt: new Date() }).where(and(
    eq(sinJapanDriverLinkCodesTable.ownerUserId, ownerUserId),
    eq(sinJapanDriverLinkCodesTable.driverId, driverId),
    eq(sinJapanDriverLinkCodesTable.groupType, groupType),
    isNull(sinJapanDriverLinkCodesTable.usedAt),
  ));
  const [created] = await db.insert(sinJapanDriverLinkCodesTable).values({ ownerUserId, driverId, groupType, code, expiresAt }).returning();
  return { ...created, driverName: driver.name };
}

export async function linkSinJapanDriverGroup(groupId: string, code: string) {
  const [link] = await db.select().from(sinJapanDriverLinkCodesTable).where(and(eq(sinJapanDriverLinkCodesTable.code, code), isNull(sinJapanDriverLinkCodesTable.usedAt), gt(sinJapanDriverLinkCodesTable.expiresAt, new Date())));
  if (!link) throw new Error("認証コードが無効または期限切れです");
  const [existing] = await db.select().from(sinJapanDriverGroupsTable).where(eq(sinJapanDriverGroupsTable.groupId, groupId));
  if (existing) throw new Error("このグループはすでに紐付け済みです");
  const [claimed] = await db.update(sinJapanDriverLinkCodesTable)
    .set({ usedAt: new Date() })
    .where(and(eq(sinJapanDriverLinkCodesTable.id, link.id), isNull(sinJapanDriverLinkCodesTable.usedAt)))
    .returning();
  if (!claimed) throw new Error("認証コードはすでに使用されています");
  const [group] = await db.insert(sinJapanDriverGroupsTable).values({
    ownerUserId: link.ownerUserId,
    driverId: link.driverId,
    groupId,
    groupType: link.groupType,
    onboardingGuideSentAt: link.groupType === "onboarding" ? new Date() : null,
  }).returning();
  return group;
}

export async function buildSinJapanOnboardingGuide(ownerUserId: string, driverId: number) {
  await ensureSinJapanDefaultResources(ownerUserId);
  const [driver] = await db.select({
    name: sinJapanDriversTable.name,
    registrationFormUrl: sinJapanDriversTable.registrationFormUrl,
    contractStatus: sinJapanDriversTable.contractStatus,
    trainingGuidance: sinJapanDriversTable.trainingGuidance,
    vehiclePreparationGuidance: sinJapanDriversTable.vehiclePreparationGuidance,
  }).from(sinJapanDriversTable).where(and(
    eq(sinJapanDriversTable.id, driverId),
    eq(sinJapanDriversTable.ownerUserId, ownerUserId),
    eq(sinJapanDriversTable.status, "active"),
  ));
  const resources = await db.select({
    title: sinJapanResourcesTable.title,
    url: sinJapanResourcesTable.url,
    description: sinJapanResourcesTable.description,
  }).from(sinJapanResourcesTable).where(and(
    eq(sinJapanResourcesTable.ownerUserId, ownerUserId),
    eq(sinJapanResourcesTable.isActive, true),
    or(eq(sinJapanResourcesTable.phase, "all"), eq(sinJapanResourcesTable.phase, "hired")),
  ));
  const resourceLines = resources.slice(0, 8).map((resource) => [
    `・${resource.title}`,
    resource.description ? `  ${resource.description}` : "",
    `  ${resource.url}`,
  ].filter(Boolean).join("\n"));
  const formatGuidance = (value: string | null | undefined, fallback: string) =>
    value ? value.replace(/\n+/g, "\n  ") : fallback;
  const contractNotice = driver?.contractStatus === "sent"
    ? "管理者様から送付済みです。内容をご確認ください。"
    : driver?.contractStatus === "confirmed"
      ? "ご確認済みです。"
      : "管理者様から個別にご案内いたします。";
  return formatAssistantReply([
    "【SIN JAPAN｜採用面談後のご案内】",
    "",
    `${driver?.name || "ドライバー"}様`,
    "本日は採用面談にご参加いただき、ありがとうございました。",
    "今後のお手続きを、下記の順番でご案内いたします。",
    "",
    "━━━━━━━━━━━━",
    "■ 1．面談資料の確認",
    "報酬・契約条件・車両レンタルについてご確認ください。",
    "━━━━━━━━━━━━",
    "",
    "■ 2．登録フォームの入力",
    driver?.registrationFormUrl
      ? `以下のフォームへご入力ください。\n${driver.registrationFormUrl}`
      : "登録フォームは、管理者様からの案内をお待ちください。",
    "",
    "━━━━━━━━━━━━",
    "■ 3．研修・契約・車両の準備",
    `・研修\n  ${formatGuidance(driver?.trainingGuidance, "管理者様からの案内をご確認ください。")}`,
    `・契約書\n  ${contractNotice}`,
    `・車両準備\n  ${formatGuidance(driver?.vehiclePreparationGuidance, "準備内容を管理者様にご確認ください。")}`,
    "━━━━━━━━━━━━",
    "",
    "■ 4．アカウント・アプリの確認",
    "Amazon Flex・Disprz・Mentor DDPの準備状況をご確認ください。",
    "AmazonのIDには、ご自身の業務用メールアドレスをご利用ください。",
    "",
    resourceLines.length ? `【参考資料・リンク】\n${resourceLines.join("\n\n")}` : "",
    "",
    "━━━━━━━━━━━━",
    "■ ご質問・ご相談",
    "「登録フォームを教えて」「研修について教えて」のように、このLINEへお送りください。",
    "",
    "■ 大切なお願い",
    "パスワード・認証コード・ログイン情報は、このLINEへ送らないでください。",
  ].filter(Boolean).join("\n"));
}

export async function getSinJapanDriverGroup(groupId: string) {
  const [group] = await db.select().from(sinJapanDriverGroupsTable).where(and(eq(sinJapanDriverGroupsTable.groupId, groupId), eq(sinJapanDriverGroupsTable.status, "active")));
  if (!group) return null;
  const [driver] = await db.select().from(sinJapanDriversTable).where(and(eq(sinJapanDriversTable.id, group.driverId), eq(sinJapanDriversTable.ownerUserId, group.ownerUserId), eq(sinJapanDriversTable.status, "active")));
  return driver ? { group, driver } : null;
}

export function classifySinJapanDriverMessage(text: string) {
  if (/事故|怪我|けが|破損|クレーム|警察|救急|車両.*動かない|故障/u.test(text)) {
    return { reportType: "incident", urgency: "urgent", category: "事故・トラブル" };
  }
  if (/欠勤|休み|体調|遅刻|遅延|配車.*変更|変更.*配車/u.test(text)) {
    return { reportType: "attendance", urgency: "high", category: "稼働・配車確認" };
  }
  if (/納品.*完了|配送.*完了|稼働.*終了|終わりました|完了しました/u.test(text)) {
    return { reportType: "shift_end", urgency: "normal", category: "稼働終了報告" };
  }
  if (/到着|出発|集荷/u.test(text)) {
    return { reportType: "milestone", urgency: "normal", category: "稼働進捗" };
  }
  return { reportType: "question", urgency: "normal", category: "ドライバー相談" };
}

export async function recordSinJapanDriverReport(params: {
  ownerUserId: string;
  driverId: number;
  groupId: string;
  text: string;
  lineMessageId?: string;
}) {
  if (containsDriverCredential(params.text)) {
    return { report: null, escalation: undefined, classification: null, blocked: true, duplicate: false };
  }
  const classification = classifySinJapanDriverMessage(params.text);
  const [report] = await db.insert(sinJapanDriverReportsTable).values({
    ownerUserId: params.ownerUserId,
    driverId: params.driverId,
    groupId: params.groupId,
    lineMessageId: params.lineMessageId || null,
    reportType: classification.reportType,
    urgency: classification.urgency,
    content: params.text,
  }).onConflictDoNothing().returning();
  if (!report) return { report: null, escalation: undefined, classification, blocked: false, duplicate: true };
  let escalation: typeof sinJapanEscalationsTable.$inferSelect | undefined;
  if (classification.urgency === "urgent" || classification.urgency === "high") {
    [escalation] = await db.insert(sinJapanEscalationsTable).values({
      ownerUserId: params.ownerUserId,
      driverId: params.driverId,
      groupId: params.groupId,
      category: classification.category,
      urgency: classification.urgency,
      summary: params.text.slice(0, 180),
      details: params.text,
    }).returning();
  }
  return { report, escalation, classification, blocked: false, duplicate: false };
}

function unlinkedGroupNotification(report: typeof sinJapanUnlinkedGroupReportsTable.$inferSelect) {
  return [
    "【SIN JAPAN｜未紐付けグループ報告】",
    `グループID：${report.groupId}`,
    `分類：${report.reportType}`,
    `緊急度：${report.urgency}`,
    `内容：${report.content}`,
    "",
    "このグループはドライバーと未紐付けです。",
    "確認後、管理画面で発行した6桁コードをグループへ送信して紐付けてください。",
  ].join("\n");
}

export async function recordSinJapanUnlinkedGroupReport(params: {
  adminUserId: string;
  groupId: string;
  sourceUserId?: string;
  text: string;
  lineMessageId?: string;
}) {
  const classification = classifySinJapanDriverMessage(params.text);
  const safeContent = containsDriverCredential(params.text)
    ? "認証情報らしき内容を受信したため、本文は安全上保存・転送していません。"
    : params.text;
  const profile = await getOrCreateAssistantProfile(params.adminUserId);
  const [report] = await db.insert(sinJapanUnlinkedGroupReportsTable).values({
    adminUserId: params.adminUserId,
    groupId: params.groupId,
    sourceUserId: params.sourceUserId || null,
    lineMessageId: params.lineMessageId || null,
    reportType: classification.reportType,
    urgency: classification.urgency,
    content: safeContent,
    status: profile.lineUserId ? "sending" : "pending",
  }).onConflictDoNothing().returning();
  if (!report) return { report: null, duplicate: true, notified: false };

  if (!profile.lineUserId) {
    return { report, duplicate: false, notified: false, error: "管理者の公式LINEが連携されていません" };
  }
  const sent = await safePushLineText(profile.lineUserId, unlinkedGroupNotification(report));
  if (sent.ok) {
    await db.update(sinJapanUnlinkedGroupReportsTable)
      .set({ status: "notified", adminNotifiedAt: new Date() })
      .where(eq(sinJapanUnlinkedGroupReportsTable.id, report.id));
    return { report, duplicate: false, notified: true };
  }
  await db.update(sinJapanUnlinkedGroupReportsTable)
    .set({ status: "delivery_unknown" })
    .where(eq(sinJapanUnlinkedGroupReportsTable.id, report.id));
  return { report, duplicate: false, notified: false, error: sent.error };
}

export async function notifySinJapanManager(ownerUserId: string, escalation: typeof sinJapanEscalationsTable.$inferSelect) {
  const profile = await getOrCreateAssistantProfile(ownerUserId);
  if (!profile.lineUserId) return { ok: false as const, error: "管理者の公式LINEが連携されていません" };
  const [driver] = await db.select().from(sinJapanDriversTable).where(and(eq(sinJapanDriversTable.id, escalation.driverId), eq(sinJapanDriversTable.ownerUserId, ownerUserId)));
  const summary = formatAssistantReply(escalation.summary).slice(0, 180);
  const sent = await safePushLineText(profile.lineUserId, `【要確認｜SIN JAPAN LINE】\nドライバー：${driver?.name || "不明"}\n分類：${escalation.category}\n内容：${summary}`);
  if (sent.ok) await db.update(sinJapanEscalationsTable).set({ managerNotifiedAt: new Date() }).where(eq(sinJapanEscalationsTable.id, escalation.id));
  return sent;
}

export async function notifySinJapanManagerConfirmation(params: {
  ownerUserId: string;
  driverId: number;
  groupId: string;
  question: string;
  reason?: string;
}) {
  const question = formatAssistantReply(params.question).slice(0, 180);
  const reason = params.reason ? formatAssistantReply(params.reason).slice(0, 240) : "";
  const [escalation] = await db.insert(sinJapanEscalationsTable).values({
    ownerUserId: params.ownerUserId,
    driverId: params.driverId,
    groupId: params.groupId,
    category: "ドライバー質問・管理者確認",
    urgency: "normal",
    summary: question,
    details: reason ? `確認事項：${reason}\n\n質問：${question}` : question,
  }).returning();
  const profile = await getOrCreateAssistantProfile(params.ownerUserId);
  if (!profile.lineUserId) return { ok: false as const, error: "管理者の公式LINEが連携されていません", escalation };
  const [driver] = await db.select().from(sinJapanDriversTable).where(and(
    eq(sinJapanDriversTable.id, params.driverId),
    eq(sinJapanDriversTable.ownerUserId, params.ownerUserId),
  ));
  const message = [
    "【管理者確認｜SIN JAPAN LINE】",
    `ドライバー：${driver?.name || "不明"}`,
    "ドライバーからの質問に確認が必要です。",
    `内容：${question}`,
    reason ? `確認事項：${reason}` : "",
  ].filter(Boolean).join("\n");
  const sent = await safePushLineText(profile.lineUserId, message);
  if (sent.ok) {
    await db.update(sinJapanEscalationsTable)
      .set({ managerNotifiedAt: new Date() })
      .where(eq(sinJapanEscalationsTable.id, escalation.id));
  }
  return { ...sent, escalation };
}

export async function retrySinJapanManagerNotifications() {
  if (!isLineConfigured()) return;
  const pending = await db.select().from(sinJapanEscalationsTable).where(and(isNull(sinJapanEscalationsTable.managerNotifiedAt), eq(sinJapanEscalationsTable.status, "open"))).orderBy(desc(sinJapanEscalationsTable.createdAt)).limit(20);
  for (const escalation of pending) {
    try {
      await notifySinJapanManager(escalation.ownerUserId, escalation);
    } catch (error) {
      logger.warn({ err: error, escalationId: escalation.id }, "SIN JAPAN escalation notification retry failed");
    }
  }
  const pendingUnlinked = await db.select().from(sinJapanUnlinkedGroupReportsTable)
    .where(and(
      isNull(sinJapanUnlinkedGroupReportsTable.adminNotifiedAt),
      eq(sinJapanUnlinkedGroupReportsTable.status, "pending"),
    ))
    .orderBy(desc(sinJapanUnlinkedGroupReportsTable.createdAt))
    .limit(20);
  for (const report of pendingUnlinked) {
    try {
      const profile = await getOrCreateAssistantProfile(report.adminUserId);
      if (!profile.lineUserId) continue;
      const [reserved] = await db.update(sinJapanUnlinkedGroupReportsTable)
        .set({ status: "sending" })
        .where(and(
          eq(sinJapanUnlinkedGroupReportsTable.id, report.id),
          eq(sinJapanUnlinkedGroupReportsTable.status, "pending"),
        ))
        .returning();
      if (!reserved) continue;
      const sent = await safePushLineText(profile.lineUserId, unlinkedGroupNotification(reserved));
      if (sent.ok) {
        await db.update(sinJapanUnlinkedGroupReportsTable)
          .set({ status: "notified", adminNotifiedAt: new Date() })
          .where(eq(sinJapanUnlinkedGroupReportsTable.id, report.id));
      } else {
        await db.update(sinJapanUnlinkedGroupReportsTable)
          .set({ status: "delivery_unknown" })
          .where(eq(sinJapanUnlinkedGroupReportsTable.id, report.id));
      }
    } catch (error) {
      logger.warn({ err: error, reportId: report.id }, "SIN JAPAN unlinked group notification retry failed");
    }
  }
}

function japanDailyStart() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts();
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return new Date(Date.UTC(year, month - 1, day - 1, 15, 0, 0));
}

export async function buildSinJapanDailyReport(ownerUserId: string) {
  const drivers = await db.select().from(sinJapanDriversTable).where(and(eq(sinJapanDriversTable.ownerUserId, ownerUserId), eq(sinJapanDriversTable.status, "active")));
  const driverIds = drivers.map((driver) => driver.id);
  const unlinkedReports = await db.select().from(sinJapanUnlinkedGroupReportsTable)
    .where(and(
      eq(sinJapanUnlinkedGroupReportsTable.adminUserId, ownerUserId),
      gte(sinJapanUnlinkedGroupReportsTable.createdAt, japanDailyStart()),
    ))
    .orderBy(desc(sinJapanUnlinkedGroupReportsTable.createdAt))
    .limit(20);
  const reports = driverIds.length
    ? await db.select().from(sinJapanDriverReportsTable).where(and(eq(sinJapanDriverReportsTable.ownerUserId, ownerUserId), inArray(sinJapanDriverReportsTable.driverId, driverIds), gte(sinJapanDriverReportsTable.createdAt, japanDailyStart()))).orderBy(desc(sinJapanDriverReportsTable.createdAt)).limit(100)
    : [];
  const escalations = driverIds.length
    ? await db.select().from(sinJapanEscalationsTable).where(and(eq(sinJapanEscalationsTable.ownerUserId, ownerUserId), inArray(sinJapanEscalationsTable.driverId, driverIds), eq(sinJapanEscalationsTable.status, "open"))).orderBy(desc(sinJapanEscalationsTable.createdAt)).limit(20)
    : [];
  const nameOf = (driverId: number) => drivers.find((driver) => driver.id === driverId)?.name || "不明なドライバー";
  const completed = reports.filter((report) => report.reportType === "shift_end").length;
  const incidents = reports.filter((report) => report.urgency === "urgent");
  const pending = reports.filter((report) => report.status === "received" && report.reportType !== "question");
  const operatingDrivers = drivers.filter((driver) => driver.workflowStatus === "operating");
  const reportedDriverIds = new Set(reports.map((report) => report.driverId));
  const missingReports = operatingDrivers.filter((driver) => !reportedDriverIds.has(driver.id));
  const lines = [
    "【SIN JAPAN｜本日のドライバー報告】",
    "",
    `■ 稼働報告：${completed}件`,
    `■ 受信報告：${reports.length}件`,
    `■ 未報告：${missingReports.length}名`,
    `■ 未処理エスカレーション：${escalations.length}件`,
    "",
    "■ 要確認",
    ...(escalations.length ? escalations.slice(0, 8).map((item) => `・${nameOf(item.driverId)}：${item.summary}`) : ["・現在、未処理のエスカレーションはありません"]),
    "",
    "■ 本日の主な報告",
    ...(pending.length ? pending.slice(0, 8).map((item) => `・${nameOf(item.driverId)}：${item.content.slice(0, 100)}`) : ["・報告はありません"]),
  ];
  lines.push(
    "",
    "■ 未紐付けグループからの報告",
    ...(unlinkedReports.length
      ? unlinkedReports.slice(0, 8).map((item) => `・${item.groupId}｜${item.content.slice(0, 100)}`)
      : ["・未紐付けグループからの報告はありません"]),
  );
  if (missingReports.length) lines.push("", "■ 未報告ドライバー", ...missingReports.map((driver) => `・${driver.name}`));
  if (incidents.length) {
    lines.push("", "【事故・トラブル】", ...incidents.slice(0, 5).map((item) => `・${nameOf(item.driverId)}：${item.content.slice(0, 100)}`));
  }
  return { content: formatAssistantReply(lines.join("\n")), reports, escalations };
}

export async function sendSinJapanDailyReport(ownerUserId: string) {
  const profile = await getOrCreateAssistantProfile(ownerUserId);
  if (!profile.lineUserId) return { ok: false as const, error: "管理者の公式LINEが連携されていません" };
  const report = await buildSinJapanDailyReport(ownerUserId);
  const sent = await safePushLineText(profile.lineUserId, report.content);
  return sent.ok ? { ok: true as const, content: report.content } : sent;
}

export async function runSinJapanDailyReporter() {
  const timezone = "Asia/Tokyo";
  const { hour, minute } = localClock(timezone);
  if (
    minute !== 0
    || !SIN_JAPAN_MANAGER_REPORT_HOURS.includes(hour as (typeof SIN_JAPAN_MANAGER_REPORT_HOURS)[number])
    || !isLineConfigured()
  ) return;
  const reportDate = `${localDate(timezone)}-${String(hour).padStart(2, "0")}:00`;
  const profiles = await db.select().from(assistantProfilesTable).where(isNotNull(assistantProfilesTable.lineUserId));
  for (const profile of profiles) {
    const [existing] = await db.select().from(sinJapanDailyReportsTable).where(and(eq(sinJapanDailyReportsTable.ownerUserId, profile.userId), eq(sinJapanDailyReportsTable.reportDate, reportDate)));
    if (existing?.status === "delivered") continue;
    const [driver] = await db.select({ id: sinJapanDriversTable.id }).from(sinJapanDriversTable).where(and(eq(sinJapanDriversTable.ownerUserId, profile.userId), eq(sinJapanDriversTable.status, "active"))).limit(1);
    if (!driver) continue;
    const report = await buildSinJapanDailyReport(profile.userId);
    const [reserved] = existing
      ? await db.update(sinJapanDailyReportsTable).set({ status: "sending", attemptCount: sql`${sinJapanDailyReportsTable.attemptCount} + 1`, error: null, content: report.content }).where(and(
        eq(sinJapanDailyReportsTable.id, existing.id),
        or(
          eq(sinJapanDailyReportsTable.status, "failed"),
          and(eq(sinJapanDailyReportsTable.status, "sending"), lt(sinJapanDailyReportsTable.updatedAt, new Date(Date.now() - 10 * 60 * 1000))),
        ),
      )).returning()
      : await db.insert(sinJapanDailyReportsTable).values({ ownerUserId: profile.userId, reportDate, content: report.content, status: "sending", attemptCount: 1 }).onConflictDoNothing().returning();
    if (!reserved) continue;
    const sent = await safePushLineText(profile.lineUserId!, report.content);
    if (sent.ok) {
      await db.update(sinJapanDailyReportsTable).set({ status: "delivered", sentAt: new Date(), error: null }).where(eq(sinJapanDailyReportsTable.id, reserved.id));
      logger.info({ ownerUserId: profile.userId, reportDate }, "SIN JAPAN daily report delivered");
    } else {
      await db.update(sinJapanDailyReportsTable).set({ status: "failed", error: sent.error }).where(eq(sinJapanDailyReportsTable.id, reserved.id));
      logger.warn({ ownerUserId: profile.userId, error: sent.error }, "SIN JAPAN daily report was not delivered");
    }
  }
}

async function applyAssistantActions(userId: string, actions: AssistantAction[]) {
  for (const action of actions) {
    if (action.type === "create_todo" && action.title?.trim()) {
      await db.insert(assistantTodosTable).values({ userId, title: action.title.trim(), details: action.details || null, priority: action.priority || "normal", source: "assistant" });
    } else if (action.type === "create_note" && action.content?.trim()) {
      await db.insert(assistantNotesTable).values({
        userId,
        title: action.title?.trim() || "整理メモ",
        content: action.content.trim(),
        category: action.category || "temporary",
        source: "assistant",
      });
    } else if (action.type === "complete_todo") {
      const where = action.id
        ? and(eq(assistantTodosTable.id, action.id), eq(assistantTodosTable.userId, userId))
        : and(eq(assistantTodosTable.userId, userId), eq(assistantTodosTable.title, action.title || ""));
      await db.update(assistantTodosTable).set({ status: "completed", completedAt: new Date() }).where(where);
    } else if (action.type === "save_memory" && action.content?.trim()) {
      await db.insert(assistantMemoriesTable).values({ userId, content: action.content.trim(), category: action.category || "general", source: "assistant" });
    } else if (action.type === "forget_memory") {
      const where = action.id
        ? and(eq(assistantMemoriesTable.id, action.id), eq(assistantMemoriesTable.userId, userId))
        : and(eq(assistantMemoriesTable.userId, userId), eq(assistantMemoriesTable.content, action.content || ""));
      await db.update(assistantMemoriesTable).set({ isActive: false }).where(where);
    }
  }
}

type ResearchItem = { topic: string; title: string; url: string; snippet: string };
type ResearchBundle = { items: ResearchItem[]; errors: string[] };

function describeXResearchError(error: unknown): { message: string; terminal: boolean; code?: number } {
  const apiError = error as { code?: number; data?: { detail?: string; title?: string } };
  const code = apiError?.code;
  const detail = apiError?.data?.detail?.toLowerCase() || "";
  if (code === 402 || detail.includes("credits depleted")) {
    return { message: "X APIクレジット残高不足", terminal: true, code };
  }
  if (code === 401) return { message: "X APIの認証に失敗しました", terminal: true, code };
  if (code === 403) return { message: "X APIに投稿検索の権限がありません", terminal: true, code };
  if (code === 429) return { message: "X APIの利用上限に達しました", terminal: true, code };
  return {
    message: error instanceof Error ? error.message : "X検索に失敗しました",
    terminal: false,
    code,
  };
}

async function gatherResearch(userId: string, topics: string[]): Promise<ResearchBundle> {
  const items: ResearchItem[] = [];
  const errors: string[] = [];
  const [account] = await db.select().from(xAccountsTable).where(and(
    eq(xAccountsTable.userId, userId),
    eq(xAccountsTable.isConnected, true),
  )).orderBy(desc(xAccountsTable.updatedAt)).limit(1);
  if (!account?.apiKey || !account.apiSecret || !account.accessToken || !account.accessTokenSecret) {
    return { items, errors: ["X未接続：接続済みのXアカウントがありません"] };
  }

  let client: TwitterApi;
  try {
    client = new TwitterApi({
      appKey: account.apiKey,
      appSecret: account.apiSecret,
      accessToken: account.accessToken,
      accessSecret: account.accessTokenSecret,
    });
  } catch (error) {
    logger.warn({ err: error }, "assistant X client initialization failed");
    return { items, errors: ["X検索失敗：X APIクライアントを初期化できませんでした"] };
  }

  for (const topic of topics.slice(0, 5)) {
    try {
      const results = await client.v2.search(topic, {
        max_results: 10,
        "tweet.fields": ["author_id", "created_at"],
        expansions: ["author_id"],
        "user.fields": ["name", "username"],
      });
      const users = new Map((results.data.includes?.users || []).map((user) => [user.id, user]));
      for (const post of results.data.data || []) {
        const author = post.author_id ? users.get(post.author_id) : undefined;
        const authorLabel = author?.username ? `@${author.username}` : "Xユーザー";
        items.push({
          topic,
          title: `${authorLabel}の投稿`,
          url: `https://x.com/${author?.username || "i/web"}/status/${post.id}`,
          snippet: post.text,
        });
      }
    } catch (error) {
      const failure = describeXResearchError(error);
      errors.push(`${topic}: ${failure.message}`);
      logger.warn({ code: failure.code, message: failure.message, topic }, "assistant X research failed");
      if (failure.terminal) break;
    }
  }
  return { items, errors };
}

function buildResearchLines(research: ResearchItem[], researchErrors: string[], patterns: Array<[string, RegExp]>) {
  const newsFor = (matchers: RegExp[]) => research.find((item) => matchers.some((pattern) => pattern.test(`${item.topic} ${item.title}`)));
  const newsLine = (label: string, matchers: RegExp[]) => {
    const item = newsFor(matchers);
    return item ? `・${label}｜${item.title}\n  ${item.url}` : `・${label}｜`;
  };
  const status = researchErrors.length
    ? `・X検索：${researchErrors.join(" / ")}`
    : research.length
      ? "・X検索：投稿を取得済み（本文・投稿者・元投稿リンクを反映）"
      : "・X検索：該当する投稿は見つかりませんでした";
  return [status, ...patterns.map(([label, pattern]) => newsLine(label, [pattern]))].join("\n");
}

function buildDailyReportDraft(
  timezone: string,
  context: Awaited<ReturnType<typeof buildAssistantContext>>,
  research: ResearchItem[],
  researchErrors: string[],
) {
  const topTodos = context.todos.slice(0, 3);
  const goals = context.memories.filter((memory) => memory.category === "goal").slice(0, 2);
  const organizationNotes = context.notes.filter((note) => ["idea", "decision", "person_company", "reference"].includes(note.category)).slice(0, 4);
  const date = reportDateLabel(timezone);
  const bullets = (items: string[], empty: string) => items.length ? items.map((item) => `・${item}`).join("\n") : `・${empty}`;
  const todoItems = topTodos.length
    ? topTodos.map((todo) => `${todo.title}${todo.priority === "high" ? "（重要）" : ""}`)
    : ["月末処理", "営業アプリの開発"];
  const organizationItems = [
    "秘書より対応事項を取得",
    ...organizationNotes.map((note) => `${note.title}: ${note.content}`),
  ];
  return formatAssistantReply(`おはようございます。
本日の目標・タスク・状況を共有します。（${date}）

【KGI】
・キャッシュ1,000万円｜エンジェル投資
・月商1,000万円｜＋500万円
・ストック月100万円｜自社車両30台

【数字】
・キャッシュ｜現在： ／ 目標：1,000万円
・売上｜現在： ／ 目標：1,000万円
・自社車両｜現在： ／ 目標：30台

【今日の最優先】
${bullets(goals.slice(0, 1).map((goal) => goal.content), "")}

【今日のTODO】
${bullets(todoItems, "未完了のTODOはありません")}

【営業｜人が欲しいものを提供】
・金｜営業アプリ
・案件｜営業アプリ → オプチャ → Chat LOGI
・人｜営業アプリ → オプチャ → KEI SAIYOU
・車｜営業アプリ → オプチャ → Chat VAN

【組織】
${bullets(organizationItems, "秘書より対応事項を取得")}

【連絡・確認】
・LINE：
・電話：
・メール：
・メモ：

【家・家族】
・今日やること：
・確認事項：

【体】
・睡眠：
・体調：
・食事：
・運動：

【人】
・今日会う人：
・連絡する人：

【勉強】
・今日学ぶこと：
・学んだこと：
・仕事・生活への活用：

【楽しみ】
・今日：
・今週：

【今日の情報】
${buildResearchLines(research, researchErrors, [
  ["海外", /海外|世界|global|international/iu],
  ["日本", /日本|国内|japan/iu],
  ["経済", /経済|金融|市場|economy|finance/iu],
  ["ビジネス", /ビジネス|企業|営業|business/iu],
  ["話題", /話題|トレンド|ニュース|trend/iu],
])}

以上が本日の状況です。
仕事・生活・学びを積み上げながら、今日の最優先から進めていきましょう。`);
}

function buildEveningReportDraft(
  timezone: string,
  context: Awaited<ReturnType<typeof buildAssistantContext>>,
  research: ResearchItem[],
  researchErrors: string[],
) {
  const reportDate = localDate(timezone);
  const completedToday = context.completedTodos
    .filter((todo) => todo.completedAt && localDate(timezone, todo.completedAt) === reportDate)
    .slice(0, 8);
  const todayMessages = context.messages
    .filter((message) => localDate(timezone, message.createdAt) === reportDate && message.role === "user")
    .slice(-6);
  const todayNotes = context.notes
    .filter((note) => localDate(timezone, note.createdAt) === reportDate)
    .slice(0, 6);
  const completed = completedToday.map((todo) => todo.title);
  const learning = todayNotes.filter((note) => note.category === "reference" || note.category === "idea").map((note) => `${note.title}: ${note.content}`);
  const issues = todayNotes.filter((note) => note.category === "temporary" || note.category === "decision").map((note) => `${note.title}: ${note.content}`);
  const messages = todayMessages.map((message) => message.content);
  const openTodos = context.todos.slice(0, 8).map((todo) => `${todo.title}${todo.priority === "high" ? "（重要）" : ""}`);
  const nextPriority = context.todos[0]?.title || "";
  const bullets = (items: string[], empty: string) => items.length ? items.map((item) => `・${item}`).join("\n") : `・${empty}`;
  return formatAssistantReply(`こんばんは。
本日の振り返りと、明日の準備を共有します。（${reportDateLabel(timezone)}）

【今日できたこと】
${bullets(completed, "完了として記録されたTODOはありません")}

【未完了TODO】
${bullets(openTodos, "未完了のTODOはありません")}

【問題・確認事項】
${bullets(issues.length ? issues : messages.slice(0, 3), "現時点で記録された問題・確認事項はありません")}

【今日の学び】
${bullets(learning, "今日の学びとして保存された内容はありません")}

【明日の最優先】
・${nextPriority}

【明日のTODO】
${bullets(openTodos, "明日のTODOはありません")}

【今日の情報】
${buildResearchLines(research, researchErrors, [
  ["海外", /海外|世界|global|international/iu],
  ["日本", /日本|国内|japan/iu],
  ["経済", /経済|金融|市場|economy|finance/iu],
  ["ビジネス", /ビジネス|企業|営業|business/iu],
  ["話題", /話題|トレンド|ニュース|trend/iu],
])}

今日もお疲れさまでした。明日は最優先の一つから始めましょう。`);
}

export type AssistantReportSlot = keyof typeof DAILY_REPORT_SCHEDULE;

async function loadEveningEvidence(userId: string, timezone: string, reportDate: string) {
  const [completedTodos, messages, notes] = await Promise.all([
    db.select().from(assistantTodosTable).where(and(
      eq(assistantTodosTable.userId, userId),
      eq(assistantTodosTable.status, "completed"),
      sql`(${assistantTodosTable.completedAt} AT TIME ZONE ${timezone})::date = ${reportDate}::date`,
    )).orderBy(desc(assistantTodosTable.completedAt)).limit(100),
    db.select().from(assistantMessagesTable).where(and(
      eq(assistantMessagesTable.userId, userId),
      sql`(${assistantMessagesTable.createdAt} AT TIME ZONE ${timezone})::date = ${reportDate}::date`,
    )).orderBy(assistantMessagesTable.createdAt).limit(100),
    db.select().from(assistantNotesTable).where(and(
      eq(assistantNotesTable.userId, userId),
      eq(assistantNotesTable.isArchived, false),
      sql`(${assistantNotesTable.createdAt} AT TIME ZONE ${timezone})::date = ${reportDate}::date`,
    )).orderBy(desc(assistantNotesTable.createdAt)).limit(100),
  ]);
  return { completedTodos, messages, notes };
}

async function deliverAssistantReport(
  report: typeof assistantReportsTable.$inferSelect,
  lineUserId: string,
) {
  if (!isLineConfigured()) {
    const [failed] = await db.update(assistantReportsTable)
      .set({ status: "failed", error: "LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN が未設定です" })
      .where(and(eq(assistantReportsTable.id, report.id), eq(assistantReportsTable.status, "completed")))
      .returning();
    return { report: failed || report, delivered: false };
  }
  const [reserved] = await db.update(assistantReportsTable)
    .set({ status: "sending", error: null })
    .where(and(
      eq(assistantReportsTable.id, report.id),
      eq(assistantReportsTable.status, "completed"),
      isNull(assistantReportsTable.deliveredAt),
    ))
    .returning();
  if (!reserved) {
    const [current] = await db.select().from(assistantReportsTable).where(eq(assistantReportsTable.id, report.id));
    return { report: current || report, delivered: current?.status === "delivered" };
  }
  const sent = await safePushLineText(lineUserId, reserved.content || "");
  if (!sent.ok) {
    const definitelyRejected = (reserved.content?.length || 0) <= 4500 && /^LINE API 4\d\d:/u.test(sent.error);
    const [failed] = await db.update(assistantReportsTable)
      .set({
        status: definitelyRejected ? "failed" : "delivery_unknown",
        error: definitelyRejected ? sent.error : `送信結果を確認できません。重複防止のため自動再送を停止しました。${sent.error}`,
      })
      .where(and(eq(assistantReportsTable.id, reserved.id), eq(assistantReportsTable.status, "sending")))
      .returning();
    return { report: failed || reserved, delivered: false };
  }
  const [delivered] = await db.update(assistantReportsTable)
    .set({ status: "delivered", deliveredAt: new Date(), error: null })
    .where(and(eq(assistantReportsTable.id, reserved.id), eq(assistantReportsTable.status, "sending")))
    .returning();
  return { report: delivered || reserved, delivered: Boolean(delivered) };
}

export async function generateDailyReport(
  userId: string,
  options: { deliver?: boolean; force?: boolean; slot?: AssistantReportSlot } = {},
) {
  const slot: AssistantReportSlot = options.slot === "evening" ? "evening" : "morning";
  let context = await buildAssistantContext(userId);
  const topics = parseTopics(context.profile.reportTopics);
  const reportDate = localDate(context.profile.timezone);
  if (slot === "evening") {
    const evidence = await loadEveningEvidence(userId, context.profile.timezone, reportDate);
    context = { ...context, ...evidence };
  }
  let [report] = await db.select().from(assistantReportsTable).where(and(
    eq(assistantReportsTable.userId, userId),
    eq(assistantReportsTable.reportDate, reportDate),
    eq(assistantReportsTable.reportSlot, slot),
  ));
  const generationLeaseExpiredAt = new Date(Date.now() - 10 * 60 * 1000);
  if (report?.status === "sending") return { report, delivered: false };
  if (report?.status === "delivery_unknown") return { report, delivered: false };
  if (report?.status === "running" && report.updatedAt >= generationLeaseExpiredAt) return { report, delivered: false };
  if (report?.status === "delivered" && !options.force) return { report, delivered: true };
  if (report?.status === "completed" && report.content && !options.force) {
    if (options.deliver && context.profile.lineUserId) {
      return deliverAssistantReport(report, context.profile.lineUserId);
    }
    return { report, delivered: false };
  }
  if (!report) {
    const generationToken = crypto.randomUUID();
    const created = await db.insert(assistantReportsTable).values({ userId, reportDate, reportSlot: slot, generationToken, status: "running", attemptCount: 1, startedAt: new Date() }).onConflictDoNothing().returning();
    if (!created.length) {
      const [existing] = await db.select().from(assistantReportsTable).where(and(
        eq(assistantReportsTable.userId, userId),
        eq(assistantReportsTable.reportDate, reportDate),
        eq(assistantReportsTable.reportSlot, slot),
      ));
      return { report: existing!, delivered: Boolean(existing?.deliveredAt) };
    }
    report = created[0]!;
  } else {
    const eligibleStatus = options.force
      ? or(
        eq(assistantReportsTable.status, "failed"),
        eq(assistantReportsTable.status, "completed"),
        eq(assistantReportsTable.status, "delivered"),
        and(eq(assistantReportsTable.status, "running"), lt(assistantReportsTable.updatedAt, generationLeaseExpiredAt)),
      )
      : or(
        eq(assistantReportsTable.status, "failed"),
        and(eq(assistantReportsTable.status, "running"), lt(assistantReportsTable.updatedAt, generationLeaseExpiredAt)),
      );
    const generationToken = crypto.randomUUID();
    const [reserved] = await db.update(assistantReportsTable)
      .set({ status: "running", generationToken, attemptCount: report.attemptCount + 1, startedAt: new Date(), error: null })
      .where(and(eq(assistantReportsTable.id, report.id), eligibleStatus))
      .returning();
    if (!reserved) {
      const [current] = await db.select().from(assistantReportsTable).where(eq(assistantReportsTable.id, report.id));
      return { report: current || report, delivered: current?.status === "delivered" };
    }
    report = reserved;
  }
    const researchBundle = await gatherResearch(userId, topics.length ? topics : DEFAULT_TOPICS);
  const research = researchBundle.items;
  const researchErrors = researchBundle.errors;
  try {
    const sourceSummary = [
      ...research.map((item) => `${item.topic}: ${item.title} — ${item.snippet} (${item.url})`),
      ...researchErrors.map((error) => `X検索状態: ${error}`),
    ].join("\n");
    const client = getOpenAIClient();
    let content = slot === "evening"
      ? buildEveningReportDraft(context.profile.timezone, context, research, researchErrors)
      : buildDailyReportDraft(context.profile.timezone, context, research, researchErrors);
    if (client) {
      const template = slot === "evening" ? EVENING_REPORT_TEMPLATE : DAILY_REPORT_TEMPLATE;
      const result = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
          role: "system",
          content: `あなたは本人専用の日本語AI秘書です。以下のテンプレートの順番と見出しを必ず守り、内容だけを最新情報に置き換えてください。絵文字は使わず、親しみやすく仕事で読みやすい文章にしてください。情報がない項目も削除せず、空欄のまま残してください。確認できない数字・予定・健康・家族情報は推測しないでください。個人メール・カレンダーは認証されていない限り推測せず、外部操作は提案に留めます。収集情報のタイトル・概要・元記事URLは改変せず、検索失敗は「未接続」または「取得失敗」と明示してください。
${template}`,
        }, {
          role: "user",
          content: `日付: ${reportDate}\nレポート種別: ${slot === "evening" ? "夜の振り返り" : "朝の計画"}\n未完了TODO: ${JSON.stringify(context.todos)}\n今日完了したTODO: ${JSON.stringify(context.completedTodos)}\n当日の会話: ${JSON.stringify(context.messages)}\n営業状況: ${JSON.stringify(context.sales)}\n整理メモ: ${JSON.stringify(context.notes)}\n記憶: ${JSON.stringify(context.memories)}\n収集情報: ${sourceSummary || "X検索結果はありません"}`,
        }],
      });
      content = result.choices[0]?.message?.content?.trim() || content;
    }
    content = formatAssistantReply(content);
    if (researchErrors.length) {
      const unavailable = researchErrors.some((error) => error.includes("未接続"));
      const depleted = researchErrors.some((error) => error.includes("クレジット残高不足"));
      const statusLine = unavailable
        ? "未接続：接続済みのXアカウントをご確認ください。"
        : depleted
          ? "取得停止：X APIのクレジット残高が不足しています。"
          : "取得失敗：X APIの接続と投稿検索権限をご確認ください。";
      content = `${content}\n\n【X検索の状態】\n・${statusLine}`;
    }
    const generationToken = report.generationToken;
    const completed = generationToken
      ? await db.transaction(async (tx) => {
        const [reserved] = await tx.update(assistantReportsTable)
          .set({ status: "completed", content, sourceSummary, completedAt: new Date(), deliveredAt: null, error: null })
          .where(and(
            eq(assistantReportsTable.id, report.id),
            eq(assistantReportsTable.status, "running"),
            eq(assistantReportsTable.generationToken, generationToken),
          ))
          .returning();
        if (!reserved) return null;
        await tx.delete(assistantResearchItemsTable).where(eq(assistantResearchItemsTable.reportId, report.id));
        if (research.length) await tx.insert(assistantResearchItemsTable).values(research.map((item) => ({ reportId: report.id, ...item })));
        return reserved;
      })
      : null;
    if (!completed) {
      const [current] = await db.select().from(assistantReportsTable).where(eq(assistantReportsTable.id, report.id));
      return { report: current || report, delivered: current?.status === "delivered" };
    }
    if (options.deliver && context.profile.lineUserId) {
      return deliverAssistantReport(completed, context.profile.lineUserId);
    }
    return { report: completed, delivered: Boolean(completed.deliveredAt) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "レポート生成に失敗しました";
    const [failed] = report.generationToken
      ? await db.update(assistantReportsTable)
        .set({ status: "failed", error: message, completedAt: new Date() })
        .where(and(
          eq(assistantReportsTable.id, report.id),
          eq(assistantReportsTable.status, "running"),
          eq(assistantReportsTable.generationToken, report.generationToken),
        ))
        .returning()
      : [];
    logger.error({ err: error, userId }, "daily assistant report failed");
    if (failed) return { report: failed, delivered: false };
    const [current] = await db.select().from(assistantReportsTable).where(eq(assistantReportsTable.id, report.id));
    return { report: current || report, delivered: current?.status === "delivered" };
  }
}

export async function runAssistantScheduler() {
  const profiles = await db.select().from(assistantProfilesTable).where(and(eq(assistantProfilesTable.reportsEnabled, true), sql`${assistantProfilesTable.lineUserId} is not null`));
  for (const profile of profiles) {
    const clock = localClock("Asia/Tokyo");
    const slot = clock.hour === DAILY_REPORT_SCHEDULE.morning
      ? "morning"
      : clock.hour === DAILY_REPORT_SCHEDULE.evening
        ? "evening"
        : null;
    if (!slot || clock.minute !== 0) continue;
    const date = localDate(profile.timezone);
    const [existing] = await db.select().from(assistantReportsTable).where(and(
      eq(assistantReportsTable.userId, profile.userId),
      eq(assistantReportsTable.reportDate, date),
      eq(assistantReportsTable.reportSlot, slot),
    ));
    if (existing && (existing.status === "delivered" || existing.attemptCount >= 3)) continue;
    await generateDailyReport(profile.userId, { deliver: true, slot });
  }
}