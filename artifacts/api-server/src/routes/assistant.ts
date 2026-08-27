import { Router, type IRouter } from "express";
import crypto from "crypto";
import { existsSync } from "node:fs";
import path from "path";
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
  sinJapanDriverGroupsTable,
  sinJapanDriverReportsTable,
  sinJapanDriversTable,
  sinJapanEscalationsTable,
  sinJapanResourcesTable,
} from "@workspace/db";
import { getUserId, requireAuth } from "../lib/auth";
import { buildSinJapanDailyReport, buildSinJapanOnboardingGuide, containsDriverCredential, createSinJapanDriverLinkCode, driverCredentialSafetyReply, ensureSinJapanDefaultResources, generateDailyReport, getAssistantDate, getOrCreateAssistantProfile, getSinJapanDriverGroup, linkSinJapanDriverGroup, notifySinJapanManager, notifySinJapanManagerConfirmation, processAssistantMessage, processSinJapanDriverMessage, recordSinJapanDriverReport, searchAssistantKnowledge, sendSinJapanDailyReport } from "../lib/assistant-service";
import { isLineConfigured, isSinJapanLineConfigured, replyLineText, replySinJapanLineText, safePushLineText, safePushSinJapanLineText, verifyLineSignature, verifySinJapanLineSignature } from "../lib/line-client";
import { getAirtableDriverDetails, getAirtableStatus, searchAirtableLookupCandidates } from "../lib/airtable-client";

const router: IRouter = Router();
const sinJapanGuideFiles = {
  "driver-start": {
    fileName: "SIN_JAPAN_採用面談資料260730_1787836512411.pdf",
    downloadName: "SIN_JAPAN_Interview_Guide.pdf",
  },
  "amazon-delivery": {
    fileName: "SIN_JAPAN_Amazon資料260730_1787836512411.pdf",
    downloadName: "SIN_JAPAN_Amazon_Delivery_Guide.pdf",
  },
} as const;

router.get("/assistant/sin-japan-line/guides/:slug.pdf", async (req, res): Promise<void> => {
  const guide = sinJapanGuideFiles[req.params.slug as keyof typeof sinJapanGuideFiles];
  if (!guide) {
    res.status(404).json({ error: "資料が見つかりません" });
    return;
  }
  const guideRoots = [
    path.resolve(process.cwd(), "attached_assets"),
    path.resolve(process.cwd(), "../../attached_assets"),
  ];
  const root = guideRoots.find((candidate) => existsSync(candidate)) || guideRoots[0];
  const filePath = path.resolve(root, guide.fileName);
  if (!filePath.startsWith(`${root}${path.sep}`)) {
    res.status(400).json({ error: "不正な資料パスです" });
    return;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${guide.downloadName}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.sendFile(filePath, (error) => {
    if (error && !res.headersSent) res.status((error as any).statusCode || 404).json({ error: "資料を配信できません" });
  });
});

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

router.post("/assistant/sin-japan-line/webhook", async (req, res): Promise<void> => {
  const rawBody = (req as any).rawBody || JSON.stringify(req.body);
  if (!verifySinJapanLineSignature(rawBody, req.header("x-line-signature"))) {
    res.status(401).json({ error: isSinJapanLineConfigured() ? "Invalid LINE signature" : "SIN JAPAN LINE is not configured" });
    return;
  }
  res.status(200).json({ ok: true });
  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  for (const event of events) {
    try {
      const groupId = typeof event.source?.groupId === "string" ? event.source.groupId : "";
      if (!groupId) continue;
      if (event.type === "join") continue;
      if (event.type !== "message" || event.message?.type !== "text") continue;
      const text = String(event.message.text || "").trim();
      if (!text) continue;
      const codeMatch = text.match(/^(?:登録|連携|紐付け)\s*[:：]?\s*(\d{6})$/u);
      if (codeMatch) {
        try {
          const group = await linkSinJapanDriverGroup(groupId, codeMatch[1]);
          if (group.groupType === "onboarding" && event.replyToken) {
            await replySinJapanLineText(event.replyToken, await buildSinJapanOnboardingGuide(group.ownerUserId, group.driverId));
          }
        } catch (error) {
          req.log?.warn({ err: error, groupId }, "SIN JAPAN group linking failed");
        }
        continue;
      }
      const relation = await getSinJapanDriverGroup(groupId);
      if (!relation) continue;
      if (containsDriverCredential(text)) {
        if (relation.group.groupType === "onboarding" && event.replyToken) await replySinJapanLineText(event.replyToken, driverCredentialSafetyReply());
        continue;
      }
      if (relation.group.groupType === "onboarding" && !relation.group.onboardingGuideSentAt) {
        const [marked] = await db.update(sinJapanDriverGroupsTable)
          .set({ onboardingGuideSentAt: new Date() })
          .where(and(eq(sinJapanDriverGroupsTable.id, relation.group.id), isNull(sinJapanDriverGroupsTable.onboardingGuideSentAt)))
          .returning();
        if (marked && event.replyToken) {
          await replySinJapanLineText(event.replyToken, await buildSinJapanOnboardingGuide(relation.driver.ownerUserId, relation.driver.id));
        }
        continue;
      }
      const received = await recordSinJapanDriverReport({
        ownerUserId: relation.driver.ownerUserId,
        driverId: relation.driver.id,
        groupId,
        text,
        lineMessageId: event.message?.id,
      });
      if (received.duplicate) continue;
      if (received.escalation) await notifySinJapanManager(relation.driver.ownerUserId, received.escalation);
      if (relation.group.groupType === "operation") continue;
      const result = await processSinJapanDriverMessage(relation.driver.ownerUserId, relation.driver.id, text, event.message?.id, relation.group.groupType === "operation" ? "operation" : "onboarding");
      if (event.replyToken && !result.duplicate) await replySinJapanLineText(event.replyToken, result.reply);
      if (result.needsManagerConfirmation) {
        try {
          await notifySinJapanManagerConfirmation({
            ownerUserId: relation.driver.ownerUserId,
            driverId: relation.driver.id,
            groupId,
            question: text,
            reason: result.managerConfirmationReason,
          });
        } catch (error) {
          req.log?.error({ err: error, groupId }, "SIN JAPAN manager confirmation notification failed");
        }
      }
    } catch (error) {
      req.log?.error({ err: error }, "SIN JAPAN LINE webhook event failed");
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

function parseRouteId(value: string | string[]) {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
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
  res.json({
    ...await getAirtableStatus(),
    lineConfigured: isSinJapanLineConfigured(),
    managerLineConfigured: isLineConfigured(),
    webhookUrl: `${process.env.APP_URL || `https://${process.env.REPLIT_DEV_DOMAIN || "your-domain"}`}/api/assistant/sin-japan-line/webhook`,
  });
});

router.post("/assistant/sin-japan-line/chat", requireAuth, async (req, res): Promise<void> => {
  const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
  if (!text) { res.status(400).json({ error: "text is required" }); return; }
  const result = await processAssistantMessage(getUserId(req), text, "sin-japan-line");
  res.json(result);
});

router.get("/assistant/sin-japan-line/drivers", requireAuth, async (req, res): Promise<void> => {
  const drivers = await db.select().from(sinJapanDriversTable).where(and(
    eq(sinJapanDriversTable.ownerUserId, getUserId(req)),
    eq(sinJapanDriversTable.status, "active"),
  )).orderBy(desc(sinJapanDriversTable.createdAt));
  const groups = await db.select().from(sinJapanDriverGroupsTable).where(eq(sinJapanDriverGroupsTable.ownerUserId, getUserId(req)));
  res.json(drivers.map((driver) => ({ ...driver, groups: groups.filter((group) => group.driverId === driver.id) })));
});

router.get("/assistant/sin-japan-line/driver-candidates", requireAuth, async (req, res): Promise<void> => {
  const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
  if (!query) { res.json({ candidates: [], error: null }); return; }
  res.json(await searchAirtableLookupCandidates(query));
});

router.post("/assistant/sin-japan-line/drivers", requireAuth, async (req, res): Promise<void> => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const airtableLookupKey = typeof req.body.airtableLookupKey === "string" && req.body.airtableLookupKey.trim()
    ? req.body.airtableLookupKey.trim()
    : name;
  const airtableTableName = typeof req.body.airtableTableName === "string" ? req.body.airtableTableName.trim() : "";
  const airtableRecordId = typeof req.body.airtableRecordId === "string" ? req.body.airtableRecordId.trim() : "";
  if (!name || !airtableTableName || !airtableRecordId) {
    res.status(400).json({ error: "Airtable候補を選択してからドライバーを登録してください" });
    return;
  }
  try {
    const details = await getAirtableDriverDetails(airtableLookupKey, airtableTableName, airtableRecordId);
    const [driver] = await db.insert(sinJapanDriversTable).values({
      ownerUserId: getUserId(req),
      name: details.name,
      airtableLookupKey,
      airtableTableName: details.table,
      airtableRecordId: details.recordId,
      registrationFormUrl: details.registrationFormUrl,
      contractUrl: details.contractUrl,
      lineUserId: typeof req.body.lineUserId === "string" && req.body.lineUserId.trim() ? req.body.lineUserId.trim() : null,
    }).returning();
    res.status(201).json(driver);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Airtableのドライバー情報を確認できません" });
  }
});

router.patch("/assistant/sin-japan-line/drivers/:id", requireAuth, async (req, res): Promise<void> => {
  const driverId = parseRouteId(req.params.id);
  if (!driverId) { res.status(400).json({ error: "Invalid driver id" }); return; }
  const updates: Partial<typeof sinJapanDriversTable.$inferInsert> = {};
  if (typeof req.body.name === "string" && req.body.name.trim()) updates.name = req.body.name.trim();
  if (typeof req.body.airtableLookupKey === "string" && req.body.airtableLookupKey.trim()) updates.airtableLookupKey = req.body.airtableLookupKey.trim();
  if (typeof req.body.lineUserId === "string") updates.lineUserId = req.body.lineUserId.trim() || null;
  if (req.body.status === "active" || req.body.status === "inactive") updates.status = req.body.status;
  if (["hired", "onboarding", "ready", "operating", "inactive"].includes(req.body.workflowStatus)) updates.workflowStatus = req.body.workflowStatus;
  if (["not_required", "pending", "verified", "needs_help"].includes(req.body.amazonAccountStatus)) updates.amazonAccountStatus = req.body.amazonAccountStatus;
  if (["pending", "verified", "needs_help"].includes(req.body.appsStatus)) updates.appsStatus = req.body.appsStatus;
  if (typeof req.body.contractUrl === "string") {
    const value = req.body.contractUrl.trim();
    if (value) {
      try {
        const parsed = new URL(value);
        if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("invalid protocol");
      } catch {
        res.status(400).json({ error: "契約書の参照URLが正しくありません" });
        return;
      }
    }
    updates.contractUrl = value || null;
  }
  if (["not_sent", "sent", "confirmed", "needs_follow_up"].includes(req.body.contractStatus)) {
    updates.contractStatus = req.body.contractStatus;
    if (req.body.contractStatus === "sent") updates.contractSentAt = new Date();
    if (req.body.contractStatus === "confirmed") updates.contractConfirmedAt = new Date();
  }
  if (typeof req.body.trainingGuidance === "string") updates.trainingGuidance = req.body.trainingGuidance.trim().slice(0, 4000) || null;
  if (typeof req.body.vehiclePreparationGuidance === "string") updates.vehiclePreparationGuidance = req.body.vehiclePreparationGuidance.trim().slice(0, 4000) || null;
  if (typeof req.body.firstOperationDate === "string") updates.firstOperationDate = req.body.firstOperationDate.trim() || null;
  const [driver] = await db.update(sinJapanDriversTable).set(updates).where(and(eq(sinJapanDriversTable.id, driverId), eq(sinJapanDriversTable.ownerUserId, getUserId(req)))).returning();
  if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }
  res.json(driver);
});

router.delete("/assistant/sin-japan-line/drivers/:id", requireAuth, async (req, res): Promise<void> => {
  const driverId = parseRouteId(req.params.id);
  if (!driverId) { res.status(400).json({ error: "Invalid driver id" }); return; }
  await db.update(sinJapanDriversTable).set({ status: "inactive", lineUserId: null }).where(and(eq(sinJapanDriversTable.id, driverId), eq(sinJapanDriversTable.ownerUserId, getUserId(req))));
  res.status(204).send();
});

router.post("/assistant/sin-japan-line/drivers/:id/link-code", requireAuth, async (req, res): Promise<void> => {
  const driverId = parseRouteId(req.params.id);
  const groupType = req.body.groupType === "operation" ? "operation" : "onboarding";
  if (!driverId) { res.status(400).json({ error: "Invalid driver id" }); return; }
  try {
    res.status(201).json(await createSinJapanDriverLinkCode(getUserId(req), driverId, groupType));
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "認証コードを発行できません" });
  }
});

router.post("/assistant/sin-japan-line/drivers/:id/airtable/refresh", requireAuth, async (req, res): Promise<void> => {
  const driverId = parseRouteId(req.params.id);
  if (!driverId) { res.status(400).json({ error: "Invalid driver id" }); return; }
  const userId = getUserId(req);
  const [driver] = await db.select().from(sinJapanDriversTable).where(and(
    eq(sinJapanDriversTable.id, driverId),
    eq(sinJapanDriversTable.ownerUserId, userId),
  ));
  if (!driver?.airtableTableName || !driver.airtableRecordId) {
    res.status(400).json({ error: "Airtable候補の選択情報がありません" });
    return;
  }
  try {
    const details = await getAirtableDriverDetails(driver.airtableLookupKey, driver.airtableTableName, driver.airtableRecordId);
    const [updated] = await db.update(sinJapanDriversTable).set({
      registrationFormUrl: details.registrationFormUrl,
      airtableTableName: details.table,
      airtableRecordId: details.recordId,
    }).where(and(eq(sinJapanDriversTable.id, driverId), eq(sinJapanDriversTable.ownerUserId, userId))).returning();
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "登録フォームを更新できません" });
  }
});

router.post("/assistant/sin-japan-line/drivers/:id/onboarding-guide/send", requireAuth, async (req, res): Promise<void> => {
  const driverId = parseRouteId(req.params.id);
  if (!driverId) { res.status(400).json({ error: "Invalid driver id" }); return; }
  const userId = getUserId(req);
  const [group] = await db.select().from(sinJapanDriverGroupsTable).where(and(
    eq(sinJapanDriverGroupsTable.ownerUserId, userId),
    eq(sinJapanDriverGroupsTable.driverId, driverId),
    eq(sinJapanDriverGroupsTable.groupType, "onboarding"),
    eq(sinJapanDriverGroupsTable.status, "active"),
  ));
  if (!group) {
    res.status(400).json({ error: "採用・面談用グループを先に紐付けてください" });
    return;
  }
  const sent = await safePushSinJapanLineText(group.groupId, await buildSinJapanOnboardingGuide(userId, driverId));
  if (!sent.ok) {
    res.status(400).json(sent);
    return;
  }
  await db.update(sinJapanDriverGroupsTable).set({ onboardingGuideSentAt: new Date() }).where(eq(sinJapanDriverGroupsTable.id, group.id));
  res.json({ ok: true });
});

router.post("/assistant/sin-japan-line/driver-chat", requireAuth, async (req, res): Promise<void> => {
  const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
  const driverId = Number(req.body.driverId);
  if (!text) { res.status(400).json({ error: "text is required" }); return; }
  if (!Number.isInteger(driverId) || driverId <= 0) { res.status(400).json({ error: "driverId is required" }); return; }
  try {
    res.json(await processSinJapanDriverMessage(getUserId(req), driverId, text));
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "ドライバー対応を開始できません" });
  }
});

router.get("/assistant/sin-japan-line/resources", requireAuth, async (req, res): Promise<void> => {
  await ensureSinJapanDefaultResources(getUserId(req));
  const resources = await db.select().from(sinJapanResourcesTable).where(and(eq(sinJapanResourcesTable.ownerUserId, getUserId(req)), eq(sinJapanResourcesTable.isActive, true))).orderBy(desc(sinJapanResourcesTable.createdAt));
  res.json(resources);
});

router.post("/assistant/sin-japan-line/resources", requireAuth, async (req, res): Promise<void> => {
  const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
  const url = typeof req.body.url === "string" ? req.body.url.trim() : "";
  const phase = ["all", "hired", "onboarding", "ready", "operating"].includes(req.body.phase) ? req.body.phase : "onboarding";
  if (!title || !url) { res.status(400).json({ error: "title and url are required" }); return; }
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("invalid protocol");
  } catch {
    res.status(400).json({ error: "有効なURLを入力してください" });
    return;
  }
  const [resource] = await db.insert(sinJapanResourcesTable).values({
    ownerUserId: getUserId(req),
    title,
    url,
    phase,
    description: typeof req.body.description === "string" && req.body.description.trim() ? req.body.description.trim() : null,
  }).returning();
  res.status(201).json(resource);
});

router.delete("/assistant/sin-japan-line/resources/:id", requireAuth, async (req, res): Promise<void> => {
  const resourceId = parseRouteId(req.params.id);
  if (!resourceId) { res.status(400).json({ error: "Invalid resource id" }); return; }
  await db.update(sinJapanResourcesTable).set({ isActive: false }).where(and(eq(sinJapanResourcesTable.id, resourceId), eq(sinJapanResourcesTable.ownerUserId, getUserId(req))));
  res.status(204).send();
});

router.get("/assistant/sin-japan-line/reports", requireAuth, async (req, res): Promise<void> => {
  const reports = await db.select().from(sinJapanDriverReportsTable).where(eq(sinJapanDriverReportsTable.ownerUserId, getUserId(req))).orderBy(desc(sinJapanDriverReportsTable.createdAt)).limit(100);
  res.json(reports);
});

router.get("/assistant/sin-japan-line/escalations", requireAuth, async (req, res): Promise<void> => {
  const escalations = await db.select().from(sinJapanEscalationsTable).where(and(eq(sinJapanEscalationsTable.ownerUserId, getUserId(req)), eq(sinJapanEscalationsTable.status, "open"))).orderBy(desc(sinJapanEscalationsTable.createdAt)).limit(50);
  res.json(escalations);
});

router.patch("/assistant/sin-japan-line/escalations/:id", requireAuth, async (req, res): Promise<void> => {
  const escalationId = parseRouteId(req.params.id);
  if (!escalationId) { res.status(400).json({ error: "Invalid escalation id" }); return; }
  if (!["open", "acknowledged", "in_progress", "resolved"].includes(req.body.status)) { res.status(400).json({ error: "Invalid escalation status" }); return; }
  const status = req.body.status as string;
  const [escalation] = await db.update(sinJapanEscalationsTable).set({
    status,
    acknowledgedAt: status === "acknowledged" || status === "in_progress" || status === "resolved" ? new Date() : null,
    resolvedAt: status === "resolved" ? new Date() : null,
  }).where(and(eq(sinJapanEscalationsTable.id, escalationId), eq(sinJapanEscalationsTable.ownerUserId, getUserId(req)))).returning();
  if (!escalation) { res.status(404).json({ error: "Escalation not found" }); return; }
  res.json(escalation);
});

router.get("/assistant/sin-japan-line/daily-report", requireAuth, async (req, res): Promise<void> => {
  res.json(await buildSinJapanDailyReport(getUserId(req)));
});

router.post("/assistant/sin-japan-line/daily-report/send", requireAuth, async (req, res): Promise<void> => {
  const result = await sendSinJapanDailyReport(getUserId(req));
  if (!result.ok) { res.status(400).json(result); return; }
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