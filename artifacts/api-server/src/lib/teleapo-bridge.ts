/**
 * Teleapo WebSocket bridge: Twilio Media Streams <-> OpenAI Realtime API
 *
 * Flow:
 *   Twilio connects via WS → we open WS to OpenAI Realtime API
 *   Audio from caller (μ-law 8kHz) → re-encoded to PCM16 24kHz → OpenAI
 *   OpenAI audio response (PCM16 24kHz) → μ-law 8kHz → Twilio → caller
 */

import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { IncomingMessage } from "http";
import type * as http from "http";
import { db } from "@workspace/db";
import { teleapoCallsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const REALTIME_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-realtime";

/** Active call sessions keyed by Twilio CallSid */
const sessions = new Map<
  string,
  {
    callId: number;
    systemPrompt: string;
    openaiWs: WebSocket;
    streamSid: string | null;
    transcriptItems: { role: string; text: string; ts: number }[];
    latencySamples: number[];
    speechStoppedAt: number | null;
  }
>();

export function setupTeleapoWebSocket(server: http.Server) {
  const wss = new WebSocketServer({ server, path: "/api/teleapo/stream" });

  wss.on("connection", (twilioWs: WebSocket, req: IncomingMessage) => {
    // callId and systemPrompt passed via query string
    const url = new URL(req.url ?? "", "http://localhost");
    const callId = Number(url.searchParams.get("callId") ?? "0");
    const systemPrompt =
      decodeURIComponent(url.searchParams.get("prompt") ?? "") ||
      "あなたは日本語を話す営業担当AIです。丁寧に、簡潔に応答してください。";

    logger.info({ callId }, "teleapo: twilio ws connected");

    // Open connection to OpenAI Realtime
    const openaiWs = new WebSocket(REALTIME_URL, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
    });

    const session = {
      callId,
      systemPrompt,
      openaiWs,
      streamSid: null as string | null,
      transcriptItems: [] as { role: string; text: string; ts: number }[],
      latencySamples: [] as number[],
      speechStoppedAt: null as number | null,
    };

    openaiWs.on("open", () => {
      logger.info({ callId }, "teleapo: openai ws connected");

      // Send session config
      openaiWs.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "realtime",
            instructions: systemPrompt,
          },
        }),
      );
    });

    openaiWs.on("message", (data: RawData) => {
      try {
        const event = JSON.parse(data.toString()) as Record<string, unknown>;
        const type = event.type as string;

        // Forward audio delta back to Twilio (GA API: response.output_audio.delta)
        if (type === "response.output_audio.delta" && session.streamSid) {
          // Measure latency from speech_stopped to first audio chunk
          if (session.speechStoppedAt !== null) {
            const latency = Date.now() - session.speechStoppedAt;
            session.latencySamples.push(latency);
            session.speechStoppedAt = null;
            logger.info({ callId, latencyMs: latency }, "teleapo: ai latency");
          }

          const audioDelta = event.delta as string;
          if (session.streamSid && twilioWs.readyState === WebSocket.OPEN) {
            twilioWs.send(
              JSON.stringify({
                event: "media",
                streamSid: session.streamSid,
                media: { payload: audioDelta },
              }),
            );
          }
        }

        // Track when AI finishes speaking (for barge-in clear) (GA API: response.output_audio.done)
        if (type === "response.output_audio.done" && session.streamSid) {
          if (twilioWs.readyState === WebSocket.OPEN) {
            twilioWs.send(
              JSON.stringify({ event: "clear", streamSid: session.streamSid }),
            );
          }
        }

        // Capture transcripts (GA API event names)
        if (type === "conversation.item.input_audio_transcription.completed") {
          const text = (event.transcript as string) ?? "";
          if (text.trim()) {
            session.transcriptItems.push({ role: "user", text: text.trim(), ts: Date.now() });
          }
        }
        if (type === "response.output_audio_transcript.done") {
          const text = (event.transcript as string) ?? "";
          if (text.trim()) {
            session.transcriptItems.push({ role: "assistant", text: text.trim(), ts: Date.now() });
          }
        }

        // Detect speech stopped → start latency timer
        if (type === "input_audio_buffer.speech_stopped") {
          session.speechStoppedAt = Date.now();
        }
      } catch {
        // ignore parse errors
      }
    });

    openaiWs.on("error", (err) => {
      logger.error({ err: err.message, callId }, "teleapo: openai ws error");
    });

    openaiWs.on("close", () => {
      logger.info({ callId }, "teleapo: openai ws closed");
    });

    // Handle messages from Twilio
    twilioWs.on("message", (data: RawData) => {
      try {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        const event = msg.event as string;

        if (event === "start") {
          const start = msg.start as Record<string, unknown>;
          session.streamSid = start.streamSid as string;
          const callSid = start.callSid as string;
          sessions.set(callSid, session);
          logger.info({ callId, streamSid: session.streamSid }, "teleapo: stream started");

          // Update call status in DB
          db.update(teleapoCallsTable)
            .set({ status: "in-progress", startedAt: new Date() })
            .where(eq(teleapoCallsTable.id, callId))
            .execute()
            .catch(() => {});
        }

        if (event === "media" && openaiWs.readyState === WebSocket.OPEN) {
          const media = msg.media as Record<string, unknown>;
          openaiWs.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: media.payload,
            }),
          );
        }

        if (event === "stop") {
          logger.info({ callId }, "teleapo: twilio stream stopped");
          finishCall(callId, session);
          openaiWs.close();
        }
      } catch {
        // ignore
      }
    });

    twilioWs.on("close", () => {
      logger.info({ callId }, "teleapo: twilio ws closed");
      finishCall(callId, session);
      if (openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
    });
  });

  logger.info("teleapo: WebSocket server ready at /api/teleapo/stream");
}

async function finishCall(
  callId: number,
  session: {
    transcriptItems: { role: string; text: string; ts: number }[];
    latencySamples: number[];
  },
) {
  if (!callId) return;
  try {
    const avgLatency =
      session.latencySamples.length > 0
        ? Math.round(
            session.latencySamples.reduce((a, b) => a + b, 0) /
              session.latencySamples.length,
          )
        : null;

    const transcript = JSON.stringify(session.transcriptItems);

    await db
      .update(teleapoCallsTable)
      .set({
        status: "completed",
        endedAt: new Date(),
        transcript,
        avgLatencyMs: avgLatency,
      })
      .where(eq(teleapoCallsTable.id, callId));
  } catch (err: unknown) {
    logger.error({ err, callId }, "teleapo: finishCall error");
  }
}
