import cron from "node-cron";
import { flushSinJapanUnlinkedGroupDigests, retrySinJapanManagerNotifications, runAssistantScheduler, runSinJapanDailyReporter } from "./assistant-service";
import { logger } from "./logger";

let running = false;
let digestRunning = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    await Promise.all([runAssistantScheduler(), runSinJapanDailyReporter(), retrySinJapanManagerNotifications()]);
  } catch (error) {
    logger.error({ err: error }, "assistant scheduler tick failed");
  } finally {
    running = false;
  }
}

async function digestTick() {
  if (digestRunning) return;
  digestRunning = true;
  try {
    await flushSinJapanUnlinkedGroupDigests();
  } catch (error) {
    logger.error({ err: error }, "SIN JAPAN unlinked group digest failed");
  } finally {
    digestRunning = false;
  }
}

export function startAssistantScheduler() {
  void tick();
  cron.schedule("* * * * *", () => void tick(), { timezone: "Asia/Tokyo" });
  cron.schedule("*/5 * * * *", () => void digestTick(), { timezone: "Asia/Tokyo" });
  logger.info("assistant: daily briefing scheduler started");
}