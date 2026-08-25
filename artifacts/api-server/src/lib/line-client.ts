import crypto from "crypto";
import { logger } from "./logger";

const LINE_API = "https://api.line.me/v2/bot";

export function isLineConfigured() {
  return Boolean(process.env.LINE_CHANNEL_SECRET && process.env.LINE_CHANNEL_ACCESS_TOKEN);
}

export function verifyLineSignature(rawBody: string, signature: string | undefined) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const expected = Buffer.from(digest);
  const received = Buffer.from(signature);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

async function lineRequest(path: string, body: unknown) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured");
  const response = await fetch(`${LINE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LINE API ${response.status}: ${detail.slice(0, 400)}`);
  }
}

function splitMessage(text: string, maxLength = 4500) {
  if (text.length <= maxLength) return [text];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    const splitAt = Math.max(remaining.lastIndexOf("\n", maxLength), remaining.lastIndexOf("。", maxLength));
    const index = splitAt > Math.floor(maxLength * 0.55) ? splitAt + 1 : maxLength;
    parts.push(remaining.slice(0, index));
    remaining = remaining.slice(index);
  }
  if (remaining) parts.push(remaining);
  return parts;
}

export async function pushLineText(userId: string, text: string) {
  for (const part of splitMessage(text)) {
    await lineRequest("/message/push", {
      to: userId,
      messages: [{ type: "text", text: part }],
    });
  }
}

export async function replyLineText(replyToken: string, text: string) {
  for (const part of splitMessage(text)) {
    await lineRequest("/message/reply", {
      replyToken,
      messages: [{ type: "text", text: part }],
    });
  }
}

export async function safePushLineText(userId: string, text: string) {
  try {
    await pushLineText(userId, text);
    return { ok: true as const };
  } catch (error) {
    logger.error({ err: error }, "LINE push failed");
    return { ok: false as const, error: error instanceof Error ? error.message : "LINE送信に失敗しました" };
  }
}