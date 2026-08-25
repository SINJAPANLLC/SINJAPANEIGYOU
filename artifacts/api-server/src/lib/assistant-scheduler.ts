import cron from "node-cron";
import { runAssistantScheduler } from "./assistant-service";
import { logger } from "./logger";

let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    await runAssistantScheduler();
  } catch (error) {
    logger.error({ err: error }, "assistant scheduler tick failed");
  } finally {
    running = false;
  }
}

export function startAssistantScheduler() {
  void tick();
  cron.schedule("* * * * *", () => void tick(), { timezone: "Asia/Tokyo" });
  logger.info("assistant: daily briefing scheduler started");
}