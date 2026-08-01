import { Router } from "express";
import { db } from "@workspace/db";
import { teleapoCampaignsTable, teleapoCallsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, getUserId } from "../lib/auth";
import { logger } from "../lib/logger";

const router = Router();

// ── Campaigns ────────────────────────────────────────────────────────────────

router.get("/teleapo/campaigns", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const rows = await db
    .select()
    .from(teleapoCampaignsTable)
    .where(eq(teleapoCampaignsTable.userId, userId))
    .orderBy(desc(teleapoCampaignsTable.createdAt));
  res.json(rows);
});

router.post("/teleapo/campaigns", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const {
    name, systemPrompt, firstMessage, targetNumbers,
    excludeNumbers, maxCallsPerDay, scheduleStart, scheduleEnd,
  } = req.body as Record<string, unknown>;

  const [row] = await db
    .insert(teleapoCampaignsTable)
    .values({
      userId,
      name: String(name ?? "新規キャンペーン"),
      systemPrompt: String(systemPrompt ?? ""),
      firstMessage: String(firstMessage ?? ""),
      targetNumbers: JSON.stringify(Array.isArray(targetNumbers) ? targetNumbers : []),
      excludeNumbers: JSON.stringify(Array.isArray(excludeNumbers) ? excludeNumbers : []),
      maxCallsPerDay: Number(maxCallsPerDay ?? 10),
      scheduleStart: String(scheduleStart ?? "09:00"),
      scheduleEnd: String(scheduleEnd ?? "18:00"),
    })
    .returning();
  res.status(201).json(row);
});

router.put("/teleapo/campaigns/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const id = Number(req.params.id);
  const [existing] = await db
    .select()
    .from(teleapoCampaignsTable)
    .where(and(eq(teleapoCampaignsTable.id, id), eq(teleapoCampaignsTable.userId, userId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const {
    name, systemPrompt, firstMessage, targetNumbers,
    excludeNumbers, maxCallsPerDay, scheduleStart, scheduleEnd, enabled,
  } = req.body as Record<string, unknown>;

  const [updated] = await db
    .update(teleapoCampaignsTable)
    .set({
      ...(name !== undefined && { name: String(name) }),
      ...(systemPrompt !== undefined && { systemPrompt: String(systemPrompt) }),
      ...(firstMessage !== undefined && { firstMessage: String(firstMessage) }),
      ...(targetNumbers !== undefined && { targetNumbers: JSON.stringify(Array.isArray(targetNumbers) ? targetNumbers : []) }),
      ...(excludeNumbers !== undefined && { excludeNumbers: JSON.stringify(Array.isArray(excludeNumbers) ? excludeNumbers : []) }),
      ...(maxCallsPerDay !== undefined && { maxCallsPerDay: Number(maxCallsPerDay) }),
      ...(scheduleStart !== undefined && { scheduleStart: String(scheduleStart) }),
      ...(scheduleEnd !== undefined && { scheduleEnd: String(scheduleEnd) }),
      ...(enabled !== undefined && { enabled: Boolean(enabled) }),
    })
    .where(eq(teleapoCampaignsTable.id, id))
    .returning();
  res.json(updated);
});

router.delete("/teleapo/campaigns/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const id = Number(req.params.id);
  await db
    .delete(teleapoCampaignsTable)
    .where(and(eq(teleapoCampaignsTable.id, id), eq(teleapoCampaignsTable.userId, userId)));
  res.json({ ok: true });
});

// ── Calls ────────────────────────────────────────────────────────────────────

router.get("/teleapo/calls", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = req.query.campaignId ? Number(req.query.campaignId) : undefined;
  const rows = await db
    .select()
    .from(teleapoCallsTable)
    .where(
      campaignId
        ? and(eq(teleapoCallsTable.userId, userId), eq(teleapoCallsTable.campaignId, campaignId))
        : eq(teleapoCallsTable.userId, userId),
    )
    .orderBy(desc(teleapoCallsTable.createdAt))
    .limit(100);
  res.json(rows);
});

router.post("/teleapo/calls", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const { campaignId, phoneNumber } = req.body as { campaignId?: number; phoneNumber: string };
  if (!phoneNumber) { res.status(400).json({ error: "phoneNumber required" }); return; }

  const [call] = await db
    .insert(teleapoCallsTable)
    .values({ userId, campaignId: campaignId ?? null, phoneNumber, status: "pending" })
    .returning();

  res.status(201).json(call);
});

router.post("/teleapo/calls/:id/dial", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const callId = Number(req.params.id);

  const [call] = await db
    .select()
    .from(teleapoCallsTable)
    .where(and(eq(teleapoCallsTable.id, callId), eq(teleapoCallsTable.userId, userId)));
  if (!call) { res.status(404).json({ error: "Not found" }); return; }

  // Check Twilio config
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!accountSid || !authToken || !fromNumber) {
    res.status(503).json({ error: "Twilio未設定。TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER を設定してください。" });
    return;
  }

  // Get campaign for system prompt
  let systemPrompt = "あなたは日本語を話す営業担当AIです。丁寧に、簡潔に応答してください。";
  if (call.campaignId) {
    const [campaign] = await db
      .select()
      .from(teleapoCampaignsTable)
      .where(eq(teleapoCampaignsTable.id, call.campaignId));
    if (campaign?.systemPrompt) systemPrompt = campaign.systemPrompt;
  }

  try {
    const { default: twilio } = await import("twilio");
    const client = twilio(accountSid, authToken);

    const host = process.env.REPLIT_DEV_DOMAIN ?? process.env.REPLIT_DOMAINS?.split(",")[0] ?? "";
    const webhookUrl = `https://${host}/api/teleapo/webhook/voice?callId=${callId}&prompt=${encodeURIComponent(systemPrompt)}`;

    const twilioCall = await client.calls.create({
      to: call.phoneNumber,
      from: fromNumber,
      url: webhookUrl,
      statusCallback: `https://${host}/api/teleapo/webhook/status?callId=${callId}`,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    });

    await db
      .update(teleapoCallsTable)
      .set({ status: "dialing", twilioCallSid: twilioCall.sid })
      .where(eq(teleapoCallsTable.id, callId));

    logger.info({ callId, twilioSid: twilioCall.sid }, "teleapo: call initiated");
    res.json({ ok: true, twilioSid: twilioCall.sid });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, callId }, "teleapo: dial error");
    await db.update(teleapoCallsTable).set({ status: "failed" }).where(eq(teleapoCallsTable.id, callId));
    res.status(500).json({ error: msg });
  }
});

router.patch("/teleapo/calls/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const id = Number(req.params.id);
  const { outcome, callbackAt, summary } = req.body as Record<string, unknown>;

  await db
    .update(teleapoCallsTable)
    .set({
      ...(outcome !== undefined && { outcome: String(outcome) }),
      ...(callbackAt !== undefined && { callbackAt: callbackAt ? new Date(String(callbackAt)) : null }),
      ...(summary !== undefined && { summary: String(summary) }),
    })
    .where(and(eq(teleapoCallsTable.id, id), eq(teleapoCallsTable.userId, userId)));
  res.json({ ok: true });
});

// ── Twilio Webhooks (no auth - Twilio calls these) ───────────────────────────

/** TwiML: connect call to OpenAI Realtime via Media Streams */
router.post("/teleapo/webhook/voice", async (req, res): Promise<void> => {
  const callId = req.query.callId as string ?? "0";
  const prompt = req.query.prompt as string ?? "";
  const host = req.headers.host ?? "";
  const wsProto = "wss";
  const streamUrl = `${wsProto}://${host}/api/teleapo/stream?callId=${callId}&prompt=${encodeURIComponent(prompt)}`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" />
  </Connect>
</Response>`;

  res.type("text/xml").send(twiml);
  logger.info({ callId, streamUrl }, "teleapo: webhook/voice responded");
});

/** Twilio status callbacks */
router.post("/teleapo/webhook/status", async (req, res): Promise<void> => {
  const callId = Number(req.query.callId ?? "0");
  const { CallStatus, CallDuration } = req.body as Record<string, string>;

  const statusMap: Record<string, string> = {
    initiated: "dialing",
    ringing: "dialing",
    answered: "in-progress",
    "no-answer": "no-answer",
    busy: "busy",
    failed: "failed",
    completed: "completed",
  };
  const mapped = statusMap[CallStatus] ?? CallStatus;

  await db
    .update(teleapoCallsTable)
    .set({
      status: mapped,
      ...(CallDuration && { durationSec: Number(CallDuration) }),
      ...((mapped === "completed" || mapped === "failed") && { endedAt: new Date() }),
    })
    .where(eq(teleapoCallsTable.id, callId))
    .catch(() => {});

  res.sendStatus(204);
});

export default router;
