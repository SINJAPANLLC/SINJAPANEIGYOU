import { Router } from "express";
import { db } from "@workspace/db";
import {
  tiktokAccountsTable,
  tiktokDmRulesTable,
  tiktokDmLogsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, getUserId } from "../lib/auth";
import { logger } from "../lib/logger";
import { runTikTokDmCampaign } from "../lib/tiktok-dm-playwright";

const router = Router();

function verifyTikTokSession(sessionCookie: string): { ok: boolean } {
  // sessionidが有効な形式（16文字以上）であれば登録可とみなす
  // 実際の有効性はPlaywrightでDM送信時に判明する
  if (!sessionCookie || sessionCookie.length < 16) return { ok: false };
  return { ok: true };
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
    const maxCount = Math.min(remaining, 20);
    const sent = await runTikTokDmCampaign(
      acc.sessionCookie!,
      keyword,
      rule.messageTemplate,
      maxCount,
      async (username, ok, error) => {
        await db.insert(tiktokDmLogsTable).values({
          accountId: id,
          targetUsername: username,
          targetUserId: "",
          message: rule.messageTemplate.replace(/\{\{username\}\}/g, `@${username}`),
          status: ok ? "success" : "failed",
          errorMessage: error ?? null,
        });
      },
    );
    await db.update(tiktokDmRulesTable)
      .set({ executedToday: rule.executedToday + sent, lastRunAt: new Date() })
      .where(eq(tiktokDmRulesTable.id, rule.id));
    logger.info({ accountId: id, sent }, "tiktok: DM run complete");
  })().catch(err => logger.error({ err }, "tiktok: DM run error"));
});

export default router;
