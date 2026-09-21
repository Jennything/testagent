import dotenv from "dotenv";
import cron from "node-cron";
import { runCollectAndDraft } from "./collectAndDraft";
import { logger } from "../utils/logger";
import { closeRenderer } from "../visuals/render";

dotenv.config();

const timezone = process.env.TIMEZONE || "Asia/Seoul";

// Three collection runs a day, spread out so "breaking" news doesn't sit
// for 24h and so the Telegram approval batches (09:00 / 19:00, see
// src/approval/telegramBot.ts) always have something fresh to review.
const SCHEDULE = ["0 7 * * *", "0 12 * * *", "0 17 * * *"];

async function runOnce() {
  try {
    await runCollectAndDraft();
  } catch (err) {
    logger.error("Scheduled pipeline run threw:", err);
  }
}

logger.info(`Scheduler starting. Timezone=${timezone}. Runs at: ${SCHEDULE.join(", ")}`);

for (const expr of SCHEDULE) {
  cron.schedule(expr, runOnce, { timezone });
}

// Kick off one run immediately on boot so a fresh deploy isn't idle all day.
runOnce();

process.on("SIGINT", async () => {
  await closeRenderer();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await closeRenderer();
  process.exit(0);
});
