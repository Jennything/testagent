import dotenv from "dotenv";
import cron from "node-cron";
import { db, nowIso } from "../db";
import { QueueEntry } from "../types";
import { publishImageUrl } from "../visuals/imageStore";
import { publishToInstagram } from "./instagram";
import { publishToThreads } from "./threads";
import { logger } from "../utils/logger";

dotenv.config();

export async function drainApprovedQueue(): Promise<void> {
  const approved: QueueEntry[] = db.get("queue").filter({ status: "approved" }).value();

  if (approved.length === 0) {
    logger.info("Nothing approved and waiting to publish.");
    return;
  }

  for (const entry of approved) {
    logger.info(`Publishing queue entry ${entry.queueId}: "${entry.draft.headline}"`);
    db.get("queue").find({ queueId: entry.queueId }).assign({ status: "publishing", updatedAt: nowIso() }).write();

    try {
      const imageUrl = entry.imageUrl || (await publishImageUrl(entry.imagePath));

      const results = await Promise.allSettled([
        publishToInstagram(imageUrl, entry.draft.captionInstagram),
        publishToThreads(imageUrl, entry.draft.captionThreads),
      ]);

      const [igResult, threadsResult] = results;
      const publishedPostIds: { instagram?: string; threads?: string } = {};
      const errors: string[] = [];

      if (igResult.status === "fulfilled") publishedPostIds.instagram = igResult.value;
      else errors.push(`Instagram: ${igResult.reason?.message || igResult.reason}`);

      if (threadsResult.status === "fulfilled") publishedPostIds.threads = threadsResult.value;
      else errors.push(`Threads: ${threadsResult.reason?.message || threadsResult.reason}`);

      const anyPublished = !!(publishedPostIds.instagram || publishedPostIds.threads);
      db.get("queue")
        .find({ queueId: entry.queueId })
        .assign({
          status: anyPublished ? "published" : "failed",
          imageUrl,
          publishedPostIds,
          reviewNote: errors.length ? errors.join(" | ") : entry.reviewNote,
          updatedAt: nowIso(),
        })
        .write();

      if (errors.length) logger.warn(`Partial publish failure for ${entry.queueId}: ${errors.join(" | ")}`);
      else logger.info(`Published ${entry.queueId} to both platforms.`);
    } catch (err) {
      logger.error(`Publish failed entirely for ${entry.queueId}:`, (err as Error).message);
      db.get("queue")
        .find({ queueId: entry.queueId })
        .assign({ status: "failed", reviewNote: (err as Error).message, updatedAt: nowIso() })
        .write();
    }
  }
}

if (require.main === module) {
  const timezone = process.env.TIMEZONE || "Asia/Seoul";
  logger.info("Publisher worker started. Draining any approved items now, then checking every 10 minutes.");
  drainApprovedQueue();
  cron.schedule("*/10 * * * *", () => drainApprovedQueue(), { timezone });
}
