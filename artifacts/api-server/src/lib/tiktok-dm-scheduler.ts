import cron from "node-cron";
import { db, tiktokAccountsTable, tiktokDmRulesTable, tiktokDmLogsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { runTikTokDmCampaign, type DmCampaignOptions } from "./tiktok-dm-playwright";

function getJSTHour(): number {
  const now = new Date();
  const jst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  return jst.getHours();
}

async function runScheduledDm() {
  const jstHour = getJSTHour();
  logger.info({ jstHour }, "tiktok-dm-scheduler: 実行チェック開始");

  // enabled なルールを全件取得
  const rules = await db.select().from(tiktokDmRulesTable).where(eq(tiktokDmRulesTable.enabled, true));

  for (const rule of rules) {
    // scheduleTimes に現在の時刻が含まれるか確認
    const hours = rule.scheduleTimes
      ? rule.scheduleTimes.split(",").map(Number).filter(Number.isFinite)
      : [];
    if (!hours.includes(jstHour)) continue;

    // 日次上限チェック
    const remaining = rule.dailyLimit - rule.executedToday;
    if (remaining <= 0) {
      logger.info({ accountId: rule.accountId, executedToday: rule.executedToday }, "tiktok-dm-scheduler: 本日の上限達成 → スキップ");
      continue;
    }

    // アカウント情報取得
    const [acc] = await db.select().from(tiktokAccountsTable).where(
      and(eq(tiktokAccountsTable.id, rule.accountId), eq(tiktokAccountsTable.isConnected, true))
    );
    if (!acc?.sessionCookie) {
      logger.warn({ accountId: rule.accountId }, "tiktok-dm-scheduler: アカウント未接続 → スキップ");
      continue;
    }

    const keyword = rule.targetHashtag || rule.targetKeyword;
    if (!keyword || !rule.messageTemplate) {
      logger.warn({ accountId: rule.accountId }, "tiktok-dm-scheduler: キーワードまたはテンプレート未設定 → スキップ");
      continue;
    }

    logger.info({ accountId: rule.accountId, keyword, remaining, jstHour }, "tiktok-dm-scheduler: DM送信開始");

    const opts: DmCampaignOptions = {
      minFollowers: rule.minFollowers ?? 0,
      genderFilter: (rule.genderFilter as "any" | "female" | "male") ?? "any",
    };

    try {
      const sent = await runTikTokDmCampaign(
        acc.sessionCookie,
        keyword,
        rule.messageTemplate,
        Math.min(remaining, 20),
        async (username, ok, skipped, error) => {
          await db.insert(tiktokDmLogsTable).values({
            accountId: rule.accountId,
            targetUsername: username,
            targetUserId: "",
            message: skipped ? null : rule.messageTemplate.replace(/\{\{username\}\}/g, `@${username}`),
            status: skipped ? "skipped" : (ok ? "success" : "failed"),
            errorMessage: error ?? null,
          });
        },
        opts,
      );

      await db.update(tiktokDmRulesTable)
        .set({ executedToday: rule.executedToday + sent, lastRunAt: new Date() })
        .where(eq(tiktokDmRulesTable.id, rule.id));

      logger.info({ accountId: rule.accountId, sent, jstHour }, "tiktok-dm-scheduler: DM送信完了");
    } catch (err) {
      logger.error({ err, accountId: rule.accountId }, "tiktok-dm-scheduler: DM送信エラー");
    }
  }
}

async function resetDailyCounters() {
  await db.update(tiktokDmRulesTable).set({ executedToday: 0 });
  logger.info("tiktok-dm-scheduler: 日次カウンターリセット完了");
}

export function startTikTokDmScheduler() {
  // 毎時0分にスケジュール確認（JST時間で判定）
  cron.schedule("0 * * * *", () => {
    runScheduledDm().catch(err => logger.error({ err }, "tiktok-dm-scheduler: uncaught error"));
  }, { timezone: "Asia/Tokyo" });

  // 毎日0:00 JST（15:00 UTC）に日次カウンターをリセット
  cron.schedule("0 15 * * *", () => {
    resetDailyCounters().catch(err => logger.error({ err }, "tiktok-dm-scheduler: reset error"));
  }, { timezone: "UTC" });

  logger.info("tiktok-dm-scheduler: スケジューラー起動完了（毎時チェック / 深夜0時リセット）");
}
