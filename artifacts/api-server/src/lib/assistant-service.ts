import OpenAI from "openai";
import crypto from "crypto";
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
} from "@workspace/db";
import { logger } from "./logger";
import { searchYahooJapan } from "./search";
import { isLineConfigured, safePushLineText } from "./line-client";
import { searchAirtable, type AirtableSearchOptions } from "./airtable-client";

const DEFAULT_TOPICS = [
  "日本と世界の経済ニュース 今日",
  "SNSで話題のニュースとトレンド 今日",
  "物流・人材業界の最新ニュース",
  "中小企業と営業活動に影響するニュース",
];
const MAX_CONTEXT_ITEMS = 20;

function formatAssistantReply(reply: string) {
  return reply
    .replace(/\r\n/g, "\n")
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .trim();
}

const DRIVER_CREDENTIAL_PATTERN = /パスワード|password|passcode|暗証番号|認証コード|ワンタイム(?:パス)?コード|otp|verification\s*code|ログイン情報|二段階認証|2fa|(?:^|[\s\n])(?:pw|pass|login\s*id|user(?:name)?|id|メール|e-?mail)\s*[:：=]/iu;
const STANDALONE_OTP_PATTERN = /^\s*\d{6,8}\s*$/u;
const STANDALONE_EMAIL_PATTERN = /^\s*[^\s@]+@[^\s@]+\.[^\s@]+\s*$/u;

export function containsDriverCredential(text: string) {
  return DRIVER_CREDENTIAL_PATTERN.test(text) || STANDALONE_OTP_PATTERN.test(text) || STANDALONE_EMAIL_PATTERN.test(text);
}

export function driverCredentialSafetyReply() {
  return "【大切なお願い】\nパスワード、認証コード、ログイン情報はLINEに送らないでください。\nAmazon・各アプリの操作はご本人の端末で行い、ここでは「ログイン確認済み」などの状態だけをお知らせください。";
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
  const [memories, todos, messages, notes, businesses] = await Promise.all([
    db.select().from(assistantMemoriesTable).where(and(eq(assistantMemoriesTable.userId, userId), eq(assistantMemoriesTable.isActive, true))).orderBy(desc(assistantMemoriesTable.updatedAt)).limit(MAX_CONTEXT_ITEMS),
    db.select().from(assistantTodosTable).where(and(eq(assistantTodosTable.userId, userId), eq(assistantTodosTable.status, "open"))).orderBy(desc(assistantTodosTable.createdAt)).limit(MAX_CONTEXT_ITEMS),
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
  return { profile, memories, todos, notes, messages: messages.reverse(), sales };
}

type AssistantAction =
  | { type: "create_todo"; title: string; details?: string; priority?: string }
  | { type: "create_note"; title: string; content: string; category?: string }
  | { type: "complete_todo"; id?: number; title?: string }
  | { type: "save_memory"; content: string; category?: string }
  | { type: "forget_memory"; id?: number; content?: string };

function fallbackResponse(text: string, context: Awaited<ReturnType<typeof buildAssistantContext>>, driverMode = false) {
  if (driverMode) return { reply: "確認します。Airtableの担当情報を検索しました。", actions: [] as AssistantAction[] };
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
  if (!inserted.length) return { reply: "", actions: [] as AssistantAction[], duplicate: true };
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
  if (!client) {
    ({ reply, actions } = fallbackResponse(text, context, driverMode));
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
      ? `あなたは日本語で応答する、SIN JAPAN物流事業のドライバー向け業務秘書です。
ドライバーには担当する配車・案件と会社共通の運用案内だけを案内してください。他のドライバーの案件、報酬、個人情報、全社の不要な情報は絶対に開示しないでください。
個人用AI秘書の記憶、TODO、過去会話、営業情報は使用しないでください。Airtable検索結果にない事実は推測せず、管理者確認が必要と伝えてください。
この会話ではactionsは必ず空配列にしてください。`
      : `あなたは日本語で応答する、本人専用のAI秘書です。`}
外部に影響する操作（メール送信、電話、SNS投稿、予約、購入）は絶対に実行せず、必要なら確認を取って下書き・提案だけします。
「覚えて」「記憶して」と明示された内容だけ長期記憶に保存し、「忘れて」と明示された場合だけ削除候補にします。
次のJSONだけを返してください。replyはユーザーにそのまま見せる自然な日本語、actionsは必要な時だけ使用します。
{"reply":"...", "actions":[{"type":"create_todo","title":"...", "details":"...", "priority":"high|normal|low"},{"type":"create_note","title":"...", "content":"...", "category":"todo|idea|decision|person_company|sales|reference|temporary"},{"type":"complete_todo","id":1},{"type":"save_memory","content":"...", "category":"preference|goal|business|general"},{"type":"forget_memory","id":1}]}
壁打ち、アイデア、悩み、情報整理の依頼では、replyに【要点】【論点】【決まっていること】【未決定のこと】【次に考えること】【TODO候補】【確認すること】を必要な範囲で含め、actionsにcreate_noteを追加してください。create_noteは長期記憶ではなく、分類付きの整理メモです。通常の雑談や明確な依頼には不要です。
LINEで読むことを前提に、返信は短く読みやすく整えてください。1文を短くし、段落の間に空行を入れてください。重要な項目は【見出し】、複数項目は「・」の箇条書きを使ってください。Markdownの表、長い一段落、過剰な前置きは避け、原則300文字以内にまとめてください。
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
  reply = formatAssistantReply(reply);
  await applyAssistantActions(userId, actions);
  await db.insert(assistantMessagesTable).values({ userId, source, role: "assistant", content: reply });
  return { reply, actions, airtable: airtableResult };
}

export async function processSinJapanDriverMessage(ownerUserId: string, driverId: number, text: string, lineMessageId?: string, groupType?: "onboarding" | "operation") {
  if (containsDriverCredential(text)) {
    return { reply: driverCredentialSafetyReply(), actions: [] as AssistantAction[], airtable: null, duplicate: false, blocked: true };
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
  const driverTenantField = process.env.AIRTABLE_DRIVER_TENANT_FIELD?.trim() || "";
  const driverTenantValue = process.env.AIRTABLE_DRIVER_TENANT_VALUE?.trim() || "";
  return processAssistantMessage(ownerUserId, text, "sin-japan-driver", lineMessageId, {
    driverName: driver.name,
    driverWorkflow: driver.workflowStatus,
    amazonAccountStatus: driver.amazonAccountStatus,
    appsStatus: driver.appsStatus,
    groupType,
    resources,
    airtable: { driverRecordId: driver.airtableRecordId, driverSafeFields, driverTenantField, driverTenantValue, commonTables },
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
  const [group] = await db.insert(sinJapanDriverGroupsTable).values({ ownerUserId: link.ownerUserId, driverId: link.driverId, groupId, groupType: link.groupType }).returning();
  return group;
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

export async function notifySinJapanManager(ownerUserId: string, escalation: typeof sinJapanEscalationsTable.$inferSelect) {
  const profile = await getOrCreateAssistantProfile(ownerUserId);
  if (!profile.lineUserId) return { ok: false as const, error: "管理者の公式LINEが連携されていません" };
  const [driver] = await db.select().from(sinJapanDriversTable).where(and(eq(sinJapanDriversTable.id, escalation.driverId), eq(sinJapanDriversTable.ownerUserId, ownerUserId)));
  const sent = await safePushLineText(profile.lineUserId, `【要確認｜SIN JAPAN LINE】\nドライバー：${driver?.name || "不明"}\n分類：${escalation.category}\n内容：${escalation.summary}`);
  if (sent.ok) await db.update(sinJapanEscalationsTable).set({ managerNotifiedAt: new Date() }).where(eq(sinJapanEscalationsTable.id, escalation.id));
  return sent;
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
  if (missingReports.length) lines.push("", "■ 未報告ドライバー", ...missingReports.map((driver) => `・${driver.name}`));
  if (incidents.length) {
    lines.push("", "⚠️ 事故・トラブル", ...incidents.slice(0, 5).map((item) => `・${nameOf(item.driverId)}：${item.content.slice(0, 100)}`));
  }
  return { content: lines.join("\n"), reports, escalations };
}

export async function sendSinJapanDailyReport(ownerUserId: string) {
  const profile = await getOrCreateAssistantProfile(ownerUserId);
  if (!profile.lineUserId) return { ok: false as const, error: "管理者の公式LINEが連携されていません" };
  const report = await buildSinJapanDailyReport(ownerUserId);
  const sent = await safePushLineText(profile.lineUserId, report.content);
  return sent.ok ? { ok: true as const, content: report.content } : sent;
}

export async function runSinJapanDailyReporter() {
  const { hour } = localClock("Asia/Tokyo");
  if (hour < 19 || !isLineConfigured()) return;
  const reportDate = localDate("Asia/Tokyo");
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

async function gatherResearch(topics: string[]) {
  const items: Array<{ topic: string; title: string; url: string; snippet: string }> = [];
  for (const topic of topics.slice(0, 5)) {
    try {
      const results = await searchYahooJapan(topic, 3);
      for (const result of results) {
        items.push({ topic, title: result.title || topic, url: result.url, snippet: result.snippet || "" });
      }
    } catch (error) {
      logger.warn({ err: error, topic }, "assistant research failed");
    }
  }
  return items;
}

function buildDailyReportDraft(timezone: string, context: Awaited<ReturnType<typeof buildAssistantContext>>, research: Array<{ topic: string; title: string; url: string; snippet: string }>) {
  const topTodos = context.todos.slice(0, 3);
  const oldTodos = context.todos.filter((todo) => todo.createdAt.getTime() < Date.now() - 24 * 60 * 60 * 1000).slice(0, 4);
  const goals = context.memories.filter((memory) => memory.category === "goal").slice(0, 2);
  const organizationNotes = context.notes.filter((note) => ["idea", "decision", "person_company", "reference"].includes(note.category)).slice(0, 4);
  const date = reportDateLabel(timezone);
  const bullets = (items: string[], empty: string) => items.length ? items.map((item) => `・${item}`).join("\n") : `・${empty}`;
  return `🌅 おはようございます（${date}）\n\n🎯 今日の目的\n${bullets(goals.map((goal) => goal.content), "今日の最優先タスクを1つ決めて、着手する")}\n\n🧠 TODO（受け取った内容を要約）\n${bullets(topTodos.map((todo) => `${todo.title}${todo.priority === "high" ? "（重要）" : ""}`), "未完了のTODOはありません")}\n\n💰 売上タスク\n${bullets([`営業リード ${context.sales.leads}件`, `送信済みメール ${context.sales.sentEmails}件`, `有効な営業スケジュール ${context.sales.activeSchedules}件`], "営業タスクはありません")}\n\n🏢 組織タスク\n${bullets(organizationNotes.map((note) => `${note.title}: ${note.content}`), "整理中の組織タスクはありません")}\n\n📞 電話確認\n・電話連携は未接続です\n\n✉️ メール確認\n・個人メールは未接続です\n・営業メールの送信状況を確認してください（送信済み ${context.sales.sentEmails}件）\n\n💬 LINE確認\n・AI秘書のLINE連携：${context.profile.lineUserId ? "連携済み" : "未連携"}\n\n📝 メモ・注意事項\n${bullets(oldTodos.map((todo) => `未処理の可能性：${todo.title}`), "特にありません")}\n\n⚠️ 注意すべきリスク\n・期限が近いTODOと返信待ちの案件を確認してください\n\n⏰ 次のチェック\n・11:00に進捗確認\n\n📰 今日の情報\n${bullets(research.slice(0, 5).map((item) => `${item.title}\\n  ${item.url}`), "新しい情報はありません")}`;
}

export async function generateDailyReport(userId: string, options: { deliver?: boolean; force?: boolean } = {}) {
  const context = await buildAssistantContext(userId);
  const topics = parseTopics(context.profile.reportTopics);
  const research = await gatherResearch(topics.length ? topics : DEFAULT_TOPICS);
  const reportDate = localDate(context.profile.timezone);
  let [report] = await db.select().from(assistantReportsTable).where(and(eq(assistantReportsTable.userId, userId), eq(assistantReportsTable.reportDate, reportDate)));
  if (report?.status === "running") return { report, delivered: false };
  if (report?.status === "delivered" && !options.force) return { report, delivered: true };
  if (report?.status === "completed" && report.content && !options.force) {
    if (options.deliver && context.profile.lineUserId) {
      const sent = await safePushLineText(context.profile.lineUserId, report.content);
      if (!sent.ok) {
        const [failed] = await db.update(assistantReportsTable).set({ status: "failed", error: sent.error }).where(eq(assistantReportsTable.id, report.id)).returning();
        return { report: failed, delivered: false };
      }
      const [delivered] = await db.update(assistantReportsTable).set({ status: "delivered", deliveredAt: new Date(), error: null }).where(eq(assistantReportsTable.id, report.id)).returning();
      return { report: delivered, delivered: true };
    }
    return { report, delivered: false };
  }
  if (!report) {
    const created = await db.insert(assistantReportsTable).values({ userId, reportDate, status: "running", attemptCount: 1, startedAt: new Date() }).onConflictDoNothing().returning();
    if (!created.length) {
      const [existing] = await db.select().from(assistantReportsTable).where(and(eq(assistantReportsTable.userId, userId), eq(assistantReportsTable.reportDate, reportDate)));
      return { report: existing!, delivered: Boolean(existing?.deliveredAt) };
    }
    report = created[0]!;
  } else {
    [report] = await db.update(assistantReportsTable).set({ status: "running", attemptCount: report.attemptCount + 1, startedAt: new Date(), error: null }).where(eq(assistantReportsTable.id, report.id)).returning();
  }
  try {
    const sourceSummary = research.map((item) => `${item.topic}: ${item.title} (${item.url})`).join("\n");
    const client = getOpenAIClient();
    let content = buildDailyReportDraft(context.profile.timezone, context, research);
    if (client) {
      const result = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
          role: "system",
          content: "あなたは本人専用の日本語AI秘書です。以下のテンプレートの順番と見出しを必ず守り、内容だけを最新情報に置き換えてください。絵文字はそのまま使い、可愛く親しみやすいが、仕事で読みやすい文章にしてください。情報がない項目も削除せず「ありません」「未接続」と明記してください。個人メール・カレンダーは認証されていない限り推測せず、外部操作は提案に留めます。情報源URLは改変しないでください。\n🌅 おはようございます（M/D 曜日）\n🎯 今日の目的\n🧠 TODO（受け取った内容を要約）\n💰 売上タスク\n🏢 組織タスク\n📞 電話確認\n✉️ メール確認\n💬 LINE確認\n📝 メモ・注意事項\n⚠️ 注意すべきリスク\n⏰ 次のチェック\n📰 今日の情報",
        }, {
          role: "user",
          content: `日付: ${reportDate}\n未完了TODO: ${JSON.stringify(context.todos)}\n営業状況: ${JSON.stringify(context.sales)}\n整理メモ: ${JSON.stringify(context.notes)}\n記憶: ${JSON.stringify(context.memories)}\n収集情報: ${sourceSummary}`,
        }],
      });
      content = result.choices[0]?.message?.content?.trim() || content;
    }
    await db.delete(assistantResearchItemsTable).where(eq(assistantResearchItemsTable.reportId, report.id));
    if (research.length) await db.insert(assistantResearchItemsTable).values(research.map((item) => ({ reportId: report.id, ...item })));
    const [completed] = await db.update(assistantReportsTable).set({ status: "completed", content, sourceSummary, completedAt: new Date(), deliveredAt: null, error: null }).where(eq(assistantReportsTable.id, report.id)).returning();
    if (options.deliver && context.profile.lineUserId) {
      if (!isLineConfigured()) throw new Error("LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN が未設定です");
      const result = await safePushLineText(context.profile.lineUserId, content);
      if (!result.ok) throw new Error(result.error);
      const [delivered] = await db.update(assistantReportsTable).set({ status: "delivered", deliveredAt: new Date() }).where(eq(assistantReportsTable.id, report.id)).returning();
      return { report: delivered, delivered: true };
    }
    return { report: completed, delivered: Boolean(completed.deliveredAt) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "レポート生成に失敗しました";
    const [failed] = await db.update(assistantReportsTable).set({ status: "failed", error: message, completedAt: new Date() }).where(eq(assistantReportsTable.id, report.id)).returning();
    logger.error({ err: error, userId }, "daily assistant report failed");
    return { report: failed, delivered: false };
  }
}

export async function runAssistantScheduler() {
  const profiles = await db.select().from(assistantProfilesTable).where(and(eq(assistantProfilesTable.reportsEnabled, true), sql`${assistantProfilesTable.lineUserId} is not null`));
  for (const profile of profiles) {
    const clock = localClock(profile.timezone);
    if (clock.hour !== profile.reportHour || clock.minute !== profile.reportMinute) continue;
    const date = localDate(profile.timezone);
    const [existing] = await db.select().from(assistantReportsTable).where(and(eq(assistantReportsTable.userId, profile.userId), eq(assistantReportsTable.reportDate, date)));
    if (existing && (existing.status === "delivered" || existing.attemptCount >= 3)) continue;
    await generateDailyReport(profile.userId, { deliver: true });
  }
}