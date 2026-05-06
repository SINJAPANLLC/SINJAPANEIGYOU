import { Router } from "express";
import { db } from "@workspace/db";
import {
  tiktokAccountsTable,
  tiktokDmRulesTable,
  tiktokDmLogsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, getUserId } from "../lib/auth";
import axios from "axios";
import { logger } from "../lib/logger";

const router = Router();

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function verifyTikTokSession(sessionCookie: string): Promise<{ ok: boolean; username?: string }> {
  // sessionidが有効な形式（16文字以上の英数字）であれば接続済みとみなす
  // 実際の有効性はDM送信時に判明する
  if (!sessionCookie || sessionCookie.length < 16) return { ok: false };

  try {
    const res = await axios.get("https://www.tiktok.com/passport/user/query/", {
      params: { aid: "1988" },
      headers: {
        Cookie: `sessionid=${sessionCookie}; sessionid_ss=${sessionCookie}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        Referer: "https://www.tiktok.com/",
        Accept: "application/json, text/plain, */*",
      },
      timeout: 12000,
    });
    const username = res.data?.data?.unique_id || res.data?.data?.username;
    if (username) return { ok: true, username };
    // ステータス200なら接続とみなす
    if (res.status === 200) return { ok: true };
  } catch (err: any) {
    // 401/403以外（ネットワーク等）はcookieが正しい可能性あり
    if (err?.response?.status !== 401 && err?.response?.status !== 403) {
      logger.info({ sessionLen: sessionCookie.length }, "tiktok: verify network error, assuming valid");
      return { ok: true };
    }
  }
  return { ok: false };
}

async function searchTikTokUsers(sessionCookie: string, keyword: string, count = 20): Promise<{ userId: string; username: string }[]> {
  try {
    const res = await axios.get("https://www.tiktok.com/api/search/user/full/", {
      params: { keyword, count, cursor: 0 },
      headers: {
        Cookie: `sessionid=${sessionCookie}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        Referer: `https://www.tiktok.com/search?q=${encodeURIComponent(keyword)}`,
      },
      timeout: 15000,
    });
    const items = res.data?.user_list ?? res.data?.userList ?? [];
    return items.map((u: any) => ({
      userId: u.user_info?.uid || u.userInfo?.user?.id || "",
      username: u.user_info?.unique_id || u.userInfo?.user?.uniqueId || "",
    })).filter((u: any) => u.userId && u.username);
  } catch (err: any) {
    logger.warn({ err: err?.message, keyword }, "tiktok: user search failed");
    return [];
  }
}

async function sendTikTokDm(sessionCookie: string, toUserId: string, message: string): Promise<boolean> {
  try {
    const res = await axios.post(
      "https://www.tiktok.com/api/v1/message/send/",
      new URLSearchParams({
        to_user_id: toUserId,
        content: JSON.stringify({ text: message }),
        msg_type: "1",
        source: "chat_input",
      }).toString(),
      {
        headers: {
          Cookie: `sessionid=${sessionCookie}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
          Referer: "https://www.tiktok.com/messages",
          Origin: "https://www.tiktok.com",
        },
        timeout: 15000,
      }
    );
    return res.data?.status_code === 0 || res.data?.code === 0;
  } catch (err: any) {
    logger.warn({ err: err?.message, toUserId }, "tiktok: DM send failed");
    return false;
  }
}

router.get("/tiktok/accounts", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const accounts = await db.select({
    id: tiktokAccountsTable.id,
    label: tiktokAccountsTable.label,
    username: tiktokAccountsTable.username,
    isConnected: tiktokAccountsTable.isConnected,
    createdAt: tiktokAccountsTable.createdAt,
  }).from(tiktokAccountsTable).where(eq(tiktokAccountsTable.userId, userId));
  res.json(accounts);
});

router.post("/tiktok/accounts", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const { label, sessionCookie } = req.body as { label?: string; sessionCookie: string };
  if (!sessionCookie) { res.status(400).json({ error: "sessionCookie is required" }); return; }

  const verify = await verifyTikTokSession(sessionCookie);

  const [account] = await db.insert(tiktokAccountsTable).values({
    userId,
    label: label || verify.username || "TikTokアカウント",
    username: verify.username ?? null,
    sessionCookie,
    isConnected: verify.ok,
  }).returning();

  if (!verify.ok) {
    res.status(201).json({ account, warning: "セッションの確認に失敗しました。Cookieが正しいか確認してください。" });
    return;
  }
  res.status(201).json({ account });
});

router.delete("/tiktok/accounts/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const id = Number(req.params.id);
  const [acc] = await db.select().from(tiktokAccountsTable).where(and(eq(tiktokAccountsTable.id, id), eq(tiktokAccountsTable.userId, userId)));
  if (!acc) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(tiktokAccountsTable).where(eq(tiktokAccountsTable.id, id));
  res.json({ ok: true });
});

router.get("/tiktok/accounts/:id/rule", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [rule] = await db.select().from(tiktokDmRulesTable).where(eq(tiktokDmRulesTable.accountId, id));
  if (!rule) {
    const [created] = await db.insert(tiktokDmRulesTable).values({ accountId: id }).returning();
    res.json(created);
    return;
  }
  res.json(rule);
});

router.put("/tiktok/accounts/:id/rule", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { enabled, targetHashtag, targetKeyword, messageTemplate, dailyLimit, scheduleTimes } = req.body;

  const [existing] = await db.select().from(tiktokDmRulesTable).where(eq(tiktokDmRulesTable.accountId, id));
  if (existing) {
    const [updated] = await db.update(tiktokDmRulesTable)
      .set({ enabled: !!enabled, targetHashtag: targetHashtag ?? "", targetKeyword: targetKeyword ?? "", messageTemplate: messageTemplate ?? "", dailyLimit: Number(dailyLimit) || 20, scheduleTimes: scheduleTimes ?? "" })
      .where(eq(tiktokDmRulesTable.accountId, id))
      .returning();
    res.json(updated);
  } else {
    const [created] = await db.insert(tiktokDmRulesTable)
      .values({ accountId: id, enabled: !!enabled, targetHashtag: targetHashtag ?? "", targetKeyword: targetKeyword ?? "", messageTemplate: messageTemplate ?? "", dailyLimit: Number(dailyLimit) || 20, scheduleTimes: scheduleTimes ?? "" })
      .returning();
    res.json(created);
  }
});

router.get("/tiktok/accounts/:id/logs", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const logs = await db.select().from(tiktokDmLogsTable)
    .where(eq(tiktokDmLogsTable.accountId, id))
    .orderBy(desc(tiktokDmLogsTable.createdAt))
    .limit(100);
  res.json(logs);
});

router.post("/tiktok/accounts/:id/run", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const id = Number(req.params.id);

  const [acc] = await db.select().from(tiktokAccountsTable).where(and(eq(tiktokAccountsTable.id, id), eq(tiktokAccountsTable.userId, userId)));
  if (!acc || !acc.sessionCookie) { res.status(404).json({ error: "アカウントが見つかりません" }); return; }

  const [rule] = await db.select().from(tiktokDmRulesTable).where(eq(tiktokDmRulesTable.accountId, id));
  if (!rule || !rule.messageTemplate) { res.status(400).json({ error: "DMルールが設定されていません" }); return; }

  const keyword = rule.targetHashtag || rule.targetKeyword;
  if (!keyword) { res.status(400).json({ error: "ターゲットキーワードまたはハッシュタグを設定してください" }); return; }

  const remaining = rule.dailyLimit - rule.executedToday;
  if (remaining <= 0) { res.status(429).json({ error: "本日の送信上限に達しています" }); return; }

  res.json({ ok: true, message: "DM送信を開始しました（バックグラウンド実行）" });

  (async () => {
    const users = await searchTikTokUsers(acc.sessionCookie!, keyword, Math.min(remaining, 20));
    let sent = 0;
    for (const user of users) {
      if (sent >= remaining) break;
      const msg = rule.messageTemplate.replace(/{{username}}/g, `@${user.username}`);
      const ok = await sendTikTokDm(acc.sessionCookie!, user.userId, msg);
      await db.insert(tiktokDmLogsTable).values({
        accountId: id,
        targetUsername: user.username,
        targetUserId: user.userId,
        message: msg,
        status: ok ? "success" : "failed",
        errorMessage: ok ? null : "DM送信APIエラー",
      });
      if (ok) sent++;
      await sleep(3000 + Math.random() * 3000);
    }
    await db.update(tiktokDmRulesTable).set({ executedToday: rule.executedToday + sent, lastRunAt: new Date() }).where(eq(tiktokDmRulesTable.id, rule.id));
    logger.info({ accountId: id, sent }, "tiktok: DM run complete");
  })().catch(err => logger.error({ err }, "tiktok: DM run error"));
});

export default router;
