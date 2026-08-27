import { Router, type IRouter } from "express";
import crypto from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  assistantMemoriesTable,
  assistantMessagesTable,
  assistantNotesTable,
  assistantProfilesTable,
  assistantReportsTable,
  assistantResearchItemsTable,
  assistantTodosTable,
  db,
} from "@workspace/db";
import { getUserId, requireAuth } from "../lib/auth";
import { getAssistantDate, generateDailyReport, getOrCreateAssistantProfile, processAssistantMessage, searchAssistantKnowledge } from "../lib/assistant-service";
import { isLineConfigured, replyLineText, safePushLineText, verifyLineSignature } from "../lib/line-client";
import { getAirtableStatus } from "../lib/airtable-client";

const router: IRouter = Router();

router.post("/assistant/line/webhook", async (req, res): Promise<void> => {
  const rawBody = (req as any).rawBody || JSON.stringify(req.body);
  if (!verifyLineSignature(rawBody, req.header("x-line-signature"))) {
    res.status(401).json({ error: "Invalid LINE signature" });
    return;
  }
  res.status(200).json({ ok: true });
  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  for (const event of events) {
    try {
      if (event.type !== "message" || event.message?.type !== "text" || !event.source?.userId) continue;
      const lineUserId = String(event.source.userId);
      const text = String(event.message.text || "").trim();
      const profiles = await db.select().from(assistantProfilesTable);
      const linked = profiles.find((profile) => profile.lineUserId === lineUserId);
      if (linked) {
        const result = await processAssistantMessage(linked.userId, text, "line", event.message?.id);
        if (!result.duplicate && event.replyToken) await replyLineText(event.replyToken, result.reply);
        continue;
      }
      const codeMatch = text.match(/(?:連携コード|リンクコード|link code)\s*[:：]?\s*([A-Z0-9]{8})/i);
      const candidate = codeMatch ? profiles.find((profile) => !profile.lineUserId && profile.linkCode === codeMatch[1].toUpperCase()) : null;
      if (candidate) {
        const [claimed] = await db.update(assistantProfilesTable)
          .set({ lineUserId, lineDisplayName: event.source?.displayName || null, linkCode: `USED${candidate.id}X` })
          .where(and(eq(assistantProfilesTable.id, candidate.id), isNull(assistantProfilesTable.lineUserId)))
          .returning();
        if (claimed) {
          if (event.replyToken) await replyLineText(event.replyToken, "連携が完了しました。これからあなた専用のAI秘書として利用できます。まずは「今日のTODOを教えて」と話しかけてください。");
        } else if (event.replyToken) {
          await replyLineText(event.replyToken, "連携コードはすでに使用されています。ダッシュボードで新しい連携コードを確認してください。");
        }
      } else if (event.replyToken) {
        await replyLineText(event.replyToken, "このAI秘書は本人専用です。ダッシュボードの「公式LINE」画面で表示される連携コードを送信してください。");
      }
    } catch (error) {
      req.log?.error({ err: error }, "LINE assistant webhook event failed");
    }
  }
});

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try {
    const parsed = JSON.parse(value || "");
    return parsed as T;
  } catch {
    return fallback;
  }
}

function presentProfile(profile: typeof assistantProfilesTable.$inferSelect) {
  return {
    ...profile,
    reportTopics: parseJson<string[]>(profile.reportTopics, []),
    lineConfigured: isLineConfigured(),
    linked: Boolean(profile.lineUserId),
    webhookUrl: `${process.env.APP_URL || `https://${process.env.REPLIT_DEV_DOMAIN || "your-domain"}`}/api/assistant/line/webhook`,
  };
}

function nextLinkCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(8), (byte) => alphabet[byte % alphabet.length]).join("");
}

router.get("/assistant/state", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const profile = await getOrCreateAssistantProfile(userId);
  const [memories, todos, notes, reports] = await Promise.all([
    db.select().from(assistantMemoriesTable).where(and(eq(assistantMemoriesTable.userId, userId), eq(assistantMemoriesTable.isActive, true))).orderBy(desc(assistantMemoriesTable.updatedAt)),
    db.select().from(assistantTodosTable).where(eq(assistantTodosTable.userId, userId)).orderBy(desc(assistantTodosTable.createdAt)),
    db.select().from(assistantNotesTable).where(and(eq(assistantNotesTable.userId, userId), eq(assistantNotesTable.isArchived, false))).orderBy(desc(assistantNotesTable.updatedAt)),
    db.select().from(assistantReportsTable).where(eq(assistantReportsTable.userId, userId)).orderBy(desc(assistantReportsTable.createdAt)).limit(12),
  ]);
  res.json({
    profile: presentProfile(profile),
    memories,
    todos,
    notes,
    reports,
  });
});

router.patch("/assistant/profile", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  await getOrCreateAssistantProfile(userId);
  const updates: Partial<typeof assistantProfilesTable.$inferInsert> = {};
  if (typeof req.body.reportsEnabled === "boolean") updates.reportsEnabled = req.body.reportsEnabled;
  if (Number.isInteger(req.body.reportHour) && req.body.reportHour >= 0 && req.body.reportHour <= 23) updates.reportHour = req.body.reportHour;
  if (Number.isInteger(req.body.reportMinute) && req.body.reportMinute >= 0 && req.body.reportMinute <= 59) updates.reportMinute = req.body.reportMinute;
  if (Array.isArray(req.body.reportTopics)) updates.reportTopics = JSON.stringify(req.body.reportTopics.filter((topic: unknown) => typeof topic === "string" && topic.trim()).slice(0, 10));
  if (req.body.timezone === "Asia/Tokyo") updates.timezone = req.body.timezone;
  const [profile] = await db.update(assistantProfilesTable).set(updates).where(eq(assistantProfilesTable.userId, userId)).returning();
  res.json(presentProfile(profile));
});

router.post("/assistant/chat", requireAuth, async (req, res): Promise<void> => {
  const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
  if (!text) { res.status(400).json({ error: "text is required" }); return; }
  const result = await processAssistantMessage(getUserId(req), text, "dashboard");
  res.json(result);
});

router.get("/assistant/sin-japan-line/status", requireAuth, async (_req, res): Promise<void> => {
  res.json(await getAirtableStatus());
});

router.post("/assistant/sin-japan-line/chat", requireAuth, async (req, res): Promise<void> => {
  const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
  if (!text) { res.status(400).json({ error: "text is required" }); return; }
  const result = await processAssistantMessage(getUserId(req), text, "sin-japan-line");
  res.json(result);
});

router.post("/assistant/memories", requireAuth, async (req, res): Promise<void> => {
  const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
  if (!content) { res.status(400).json({ error: "content is required" }); return; }
  const [memory] = await db.insert(assistantMemoriesTable).values({
    userId: getUserId(req), content, category: req.body.category || "general", source: "dashboard",
  }).returning();
  res.status(201).json(memory);
});

router.delete("/assistant/memories/:id", requireAuth, async (req, res): Promise<void> => {
  await db.update(assistantMemoriesTable).set({ isActive: false }).where(and(eq(assistantMemoriesTable.id, Number(req.params.id)), eq(assistantMemoriesTable.userId, getUserId(req))));
  res.status(204).send();
});

router.post("/assistant/notes", requireAuth, async (req, res): Promise<void> => {
  const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
  if (!content) { res.status(400).json({ error: "content is required" }); return; }
  const title = typeof req.body.title === "string" && req.body.title.trim() ? req.body.title.trim() : "整理メモ";
  const categories = ["todo", "idea", "decision", "person_company", "sales", "reference", "temporary"];
  const category = categories.includes(req.body.category) ? req.body.category : "temporary";
  const [note] = await db.insert(assistantNotesTable).values({ userId: getUserId(req), title, content, category, source: "dashboard" }).returning();
  res.status(201).json(note);
});

router.patch("/assistant/notes/:id", requireAuth, async (req, res): Promise<void> => {
  const updates: Partial<typeof assistantNotesTable.$inferInsert> = {};
  if (typeof req.body.title === "string" && req.body.title.trim()) updates.title = req.body.title.trim();
  if (typeof req.body.content === "string" && req.body.content.trim()) updates.content = req.body.content.trim();
  if (["todo", "idea", "decision", "person_company", "sales", "reference", "temporary"].includes(req.body.category)) updates.category = req.body.category;
  const [note] = await db.update(assistantNotesTable).set(updates).where(and(eq(assistantNotesTable.id, Number(req.params.id)), eq(assistantNotesTable.userId, getUserId(req)))).returning();
  if (!note) { res.status(404).json({ error: "Note not found" }); return; }
  res.json(note);
});

router.delete("/assistant/notes/:id", requireAuth, async (req, res): Promise<void> => {
  await db.update(assistantNotesTable).set({ isArchived: true }).where(and(eq(assistantNotesTable.id, Number(req.params.id)), eq(assistantNotesTable.userId, getUserId(req))));
  res.status(204).send();
});

router.get("/assistant/search", requireAuth, async (req, res): Promise<void> => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!query) { res.status(400).json({ error: "q is required" }); return; }
  res.json({ query, results: await searchAssistantKnowledge(getUserId(req), query) });
});

router.post("/assistant/todos", requireAuth, async (req, res): Promise<void> => {
  const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
  if (!title) { res.status(400).json({ error: "title is required" }); return; }
  const [todo] = await db.insert(assistantTodosTable).values({
    userId: getUserId(req), title, details: req.body.details || null, priority: req.body.priority || "normal", source: "dashboard",
  }).returning();
  res.status(201).json(todo);
});

router.patch("/assistant/todos/:id", requireAuth, async (req, res): Promise<void> => {
  const updates: Partial<typeof assistantTodosTable.$inferInsert> = {};
  if (typeof req.body.title === "string" && req.body.title.trim()) updates.title = req.body.title.trim();
  if (typeof req.body.status === "string" && ["open", "completed", "dismissed"].includes(req.body.status)) {
    updates.status = req.body.status;
    updates.completedAt = req.body.status === "completed" ? new Date() : null;
  }
  if (["high", "normal", "low"].includes(req.body.priority)) updates.priority = req.body.priority;
  const [todo] = await db.update(assistantTodosTable).set(updates).where(and(eq(assistantTodosTable.id, Number(req.params.id)), eq(assistantTodosTable.userId, getUserId(req)))).returning();
  if (!todo) { res.status(404).json({ error: "TODO not found" }); return; }
  res.json(todo);
});

router.delete("/assistant/todos/:id", requireAuth, async (req, res): Promise<void> => {
  await db.delete(assistantTodosTable).where(and(eq(assistantTodosTable.id, Number(req.params.id)), eq(assistantTodosTable.userId, getUserId(req))));
  res.status(204).send();
});

router.post("/assistant/line/claim", requireAuth, async (req, res): Promise<void> => {
  const profile = await getOrCreateAssistantProfile(getUserId(req));
  res.json({ code: profile.linkCode, webhookUrl: `${process.env.APP_URL || `https://${process.env.REPLIT_DEV_DOMAIN || "your-domain"}`}/api/assistant/line/webhook`, configured: isLineConfigured(), linked: Boolean(profile.lineUserId) });
});

router.post("/assistant/line/test", requireAuth, async (req, res): Promise<void> => {
  const profile = await getOrCreateAssistantProfile(getUserId(req));
  if (!profile.lineUserId) { res.status(400).json({ error: "LINEユーザーがまだ連携されていません" }); return; }
  const result = await safePushLineText(profile.lineUserId, "AI秘書の接続テストです。これから毎朝9:00にレポートをお届けします。");
  if (!result.ok) { res.status(502).json({ error: result.error }); return; }
  res.json({ ok: true });
});

router.post("/assistant/line/unlink", requireAuth, async (req, res): Promise<void> => {
  await db.update(assistantProfilesTable).set({ lineUserId: null, lineDisplayName: null, linkCode: nextLinkCode() }).where(eq(assistantProfilesTable.userId, getUserId(req)));
  res.json({ ok: true });
});

router.get("/assistant/reports", requireAuth, async (req, res): Promise<void> => {
  const reports = await db.select().from(assistantReportsTable).where(eq(assistantReportsTable.userId, getUserId(req))).orderBy(desc(assistantReportsTable.createdAt)).limit(20);
  res.json(reports);
});

router.get("/assistant/reports/:id", requireAuth, async (req, res): Promise<void> => {
  const [report] = await db.select().from(assistantReportsTable).where(and(eq(assistantReportsTable.id, Number(req.params.id)), eq(assistantReportsTable.userId, getUserId(req))));
  if (!report) { res.status(404).json({ error: "Report not found" }); return; }
  const sources = await db.select().from(assistantResearchItemsTable).where(eq(assistantResearchItemsTable.reportId, report.id));
  res.json({ ...report, sources });
});

router.post("/assistant/reports/preview", requireAuth, async (req, res): Promise<void> => {
  const result = await generateDailyReport(getUserId(req), { deliver: false, force: false });
  res.json({ report: result.report, delivered: false });
});

router.post("/assistant/reports/run", requireAuth, async (req, res): Promise<void> => {
  const result = await generateDailyReport(getUserId(req), { deliver: req.body.deliver !== false, force: false });
  if (result.report.status === "failed") { res.status(502).json(result); return; }
  res.json(result);
});

export default router;