import crypto from "crypto";
import { logger } from "./logger";

const LINE_API = "https://api.line.me/v2/bot";

export function isLineConfigured() {
  return Boolean(process.env.LINE_CHANNEL_SECRET && process.env.LINE_CHANNEL_ACCESS_TOKEN);
}

function verifySignature(rawBody: string, signature: string | undefined, secret: string | undefined) {
  if (!secret || !signature) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const expected = Buffer.from(digest);
  const received = Buffer.from(signature);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

export function verifyLineSignature(rawBody: string, signature: string | undefined) {
  return verifySignature(rawBody, signature, process.env.LINE_CHANNEL_SECRET);
}

export function isSinJapanLineConfigured() {
  return Boolean(process.env.SIN_JAPAN_LINE_CHANNEL_SECRET && process.env.SIN_JAPAN_LINE_CHANNEL_ACCESS_TOKEN);
}

export function verifySinJapanLineSignature(rawBody: string, signature: string | undefined) {
  return verifySignature(rawBody, signature, process.env.SIN_JAPAN_LINE_CHANNEL_SECRET);
}

async function lineRequest(path: string, body: unknown, token = process.env.LINE_CHANNEL_ACCESS_TOKEN) {
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

async function lineGetJson<T>(path: string, token: string | undefined, timeoutMs = 1500): Promise<T> {
  if (!token) throw new Error("LINE channel access token is not configured");
  const response = await fetch(`${LINE_API}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LINE API ${response.status}: ${detail.slice(0, 400)}`);
  }
  return await response.json() as T;
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
  await lineRequest("/message/reply", {
    replyToken,
    messages: splitMessage(text).slice(0, 5).map((part) => ({ type: "text", text: part })),
  });
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

export async function pushSinJapanLineText(targetId: string, text: string) {
  const token = process.env.SIN_JAPAN_LINE_CHANNEL_ACCESS_TOKEN;
  for (const part of splitMessage(text)) {
    await lineRequest("/message/push", {
      to: targetId,
      messages: [{ type: "text", text: part }],
    }, token);
  }
}

export async function replySinJapanLineText(replyToken: string, text: string) {
  await lineRequest("/message/reply", {
    replyToken,
    messages: splitMessage(text).slice(0, 5).map((part) => ({ type: "text", text: part })),
  }, process.env.SIN_JAPAN_LINE_CHANNEL_ACCESS_TOKEN);
}

export async function safePushSinJapanLineText(targetId: string, text: string) {
  try {
    await pushSinJapanLineText(targetId, text);
    return { ok: true as const };
  } catch (error) {
    logger.error({ err: error }, "SIN JAPAN LINE push failed");
    return { ok: false as const, error: error instanceof Error ? error.message : "SIN JAPAN LINE送信に失敗しました" };
  }
}

export async function getSinJapanGroupSummary(groupId: string) {
  try {
    return await lineGetJson<{ groupId: string; groupName: string; pictureUrl?: string }>(
      `/group/${encodeURIComponent(groupId)}/summary`,
      process.env.SIN_JAPAN_LINE_CHANNEL_ACCESS_TOKEN,
    );
  } catch (error) {
    logger.warn({ err: error, groupId }, "SIN JAPAN LINE group summary unavailable");
    return null;
  }
}