import OpenAI from "openai";
import crypto from "crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  assistantMemoriesTable,
  assistantMessagesTable,
  assistantProfilesTable,
  assistantReportsTable,
  assistantResearchItemsTable,
  assistantTodosTable,
  businessesTable,
  cronJobsTable,
  db,
  emailLogsTable,
  leadsTable,
} from "@workspace/db";
import { logger } from "./logger";
import { searchYahooJapan } from "./search";
import { isLineConfigured, safePushLineText } from "./line-client";

const DEFAULT_TOPICS = [
  "日本と世界の経済ニュース 今日",
  "SNSで話題のニュースとトレンド 今日",
  "物流・人材業界の最新ニュース",
  "中小企業と営業活動に影響するニュース",
];
const MAX_CONTEXT_ITEMS = 20;

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
  const [memories, todos, messages, businesses] = await Promise.all([
    db.select().from(assistantMemoriesTable).where(and(eq(assistantMemoriesTable.userId, userId), eq(assistantMemoriesTable.isActive, true))).orderBy(desc(assistantMemoriesTable.updatedAt)).limit(MAX_CONTEXT_ITEMS),
    db.select().from(assistantTodosTable).where(and(eq(assistantTodosTable.userId, userId), eq(assistantTodosTable.status, "open"))).orderBy(desc(assistantTodosTable.createdAt)).limit(MAX_CONTEXT_ITEMS),
    db.select().from(assistantMessagesTable).where(eq(assistantMessagesTable.userId, userId)).orderBy(desc(assistantMessagesTable.createdAt)).limit(12),
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
  return { profile, memories, todos, messages: messages.reverse(), sales };
}

type AssistantAction =
  | { type: "create_todo"; title: string; details?: string; priority?: string }
  | { type: "complete_todo"; id?: number; title?: string }
  | { type: "save_memory"; content: string; category?: string }
  | { type: "forget_memory"; id?: number; content?: string };

function fallbackResponse(text: string, context: Awaited<ReturnType<typeof buildAssistantContext>>) {
  const actions: AssistantAction[] = [];
  const todo = text.match(/(?:TODO|todo|タスク|やること)(?:に|を)?\s*(.+?)(?:追加|登録|。|$)/i);
  if (todo?.[1]) actions.push({ type: "create_todo", title: todo[1].trim() });
  if (/覚えて|記憶して|記録して/.test(text)) {
    const memory = text.replace(/.*?(覚えて|記憶して|記録して)[：:\s]*/u, "").trim();
    if (memory) actions.push({ type: "save_memory", content: memory });
  }
  const reply = actions.length
    ? actions.map((a) => {
      if (a.type === "create_todo") return `TODOに追加しました：「${a.title}」`;
      if (a.type === "save_memory") return `長期記憶に保存しました：「${a.content}」`;
      return "ご依頼を反映しました。";
    }).join("\n")
    : `承知しました。現在、未完了TODOは${context.todos.length}件、登録済みの営業リードは${context.sales.leads}件です。OpenAIを接続すると、より詳しい整理と提案ができます。`;
  return { reply, actions };
}

export async function processAssistantMessage(userId: string, text: string, source = "line", lineMessageId?: string) {
  const inserted = await db.insert(assistantMessagesTable).values({ userId, source, role: "user", content: text, lineMessageId: lineMessageId || null }).onConflictDoNothing().returning();
  if (!inserted.length) return { reply: "", actions: [] as AssistantAction[], duplicate: true };
  const context = await buildAssistantContext(userId);
  const client = getOpenAIClient();
  let reply: string;
  let actions: AssistantAction[] = [];
  if (!client) {
    ({ reply, actions } = fallbackResponse(text, context));
  } else {
    const system = `あなたは日本語で応答する、本人専用のAI秘書です。
外部に影響する操作（メール送信、電話、SNS投稿、予約、購入）は絶対に実行せず、必要なら確認を取って下書き・提案だけします。
「覚えて」「記憶して」と明示された内容だけ長期記憶に保存し、「忘れて」と明示された場合だけ削除候補にします。
次のJSONだけを返してください。replyはユーザーにそのまま見せる自然な日本語、actionsは必要な時だけ使用します。
{"reply":"...", "actions":[{"type":"create_todo","title":"...", "details":"...", "priority":"high|normal|low"},{"type":"complete_todo","id":1},{"type":"save_memory","content":"...", "category":"preference|goal|business|general"},{"type":"forget_memory","id":1}]}
利用可能なコンテキスト:
記憶: ${JSON.stringify(context.memories.map((m) => ({ id: m.id, category: m.category, content: m.content })))}
未完了TODO: ${JSON.stringify(context.todos.map((t) => ({ id: t.id, title: t.title, priority: t.priority })))}
営業概要: ${JSON.stringify(context.sales)}
直近会話: ${JSON.stringify(context.messages.map((m) => ({ role: m.role, content: m.content })))}`;
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
      ({ reply, actions } = fallbackResponse(text, context));
    }
  }
  await applyAssistantActions(userId, actions);
  await db.insert(assistantMessagesTable).values({ userId, source, role: "assistant", content: reply });
  return { reply, actions };
}

async function applyAssistantActions(userId: string, actions: AssistantAction[]) {
  for (const action of actions) {
    if (action.type === "create_todo" && action.title?.trim()) {
      await db.insert(assistantTodosTable).values({ userId, title: action.title.trim(), details: action.details || null, priority: action.priority || "normal", source: "assistant" });
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
    let content = `おはようございます。${reportDate}の秘書レポートです。\n\n【TODO】\n${context.todos.length ? context.todos.map((t) => `・${t.title}${t.priority === "high" ? " [重要]" : ""}`).join("\n") : "・未完了のTODOはありません"}\n\n【営業状況】\n・営業リード ${context.sales.leads}件 / 送信済みメール ${context.sales.sentEmails}件 / 有効スケジュール ${context.sales.activeSchedules}件`;
    if (research.length) content += `\n\n【今日の情報】\n${research.slice(0, 10).map((r) => `・${r.title}\n  ${r.url}`).join("\n")}`;
    if (client) {
      const result = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
          role: "system",
          content: "あなたは本人専用の日本語AI秘書です。簡潔で実行しやすい朝の報告に整えてください。見出しは【今日の要点】【TODO】【営業・業務状況】【情報収集】【今日の一歩】を使い、情報源URLは改変せず残してください。外部操作は提案に留めます。",
        }, {
          role: "user",
          content: `日付: ${reportDate}\n未完了TODO: ${JSON.stringify(context.todos)}\n営業状況: ${JSON.stringify(context.sales)}\n記憶: ${JSON.stringify(context.memories)}\n収集情報: ${sourceSummary}`,
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