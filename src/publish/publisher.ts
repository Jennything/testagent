import dotenv from "dotenv";
import cron from "node-cron";
import { db, nowIso } from "../db";
import { QueueEntry } from "../types";
import { publishImageUrl } from "../visuals/imageStore";
import { publishToInstagram, publishCarouselToInstagram } from "./instagram";
import { publishToThreads } from "./threads";
import { logger } from "../utils/logger";

dotenv.config();

// Threads credentials are optional — until THREADS_ACCESS_TOKEN/THREADS_USER_ID
// are set, we publish to Instagram only rather than treating a missing
// integration as a failure on every single post.
const threadsConfigured = !!(process.env.THREADS_ACCESS_TOKEN && process.env.THREADS_USER_ID);

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
      const imageUrls = entry.imageUrls || (await Promise.all(entry.imagePaths.map((p) => publishImageUrl(p))));
      const isCarousel = imageUrls.length > 1;

      const jobs: Array<Promise<["instagram" | "threads", string]>> = [
        (isCarousel
          ? publishCarouselToInstagram(imageUrls, entry.draft.captionInstagram)
          : publishToInstagram(imageUrls[0], entry.draft.captionInstagram)
        ).then((id) => ["instagram", id]),
      ];
      if (threadsConfigured) {
        // Threads publishing here is single-image only — carousels post their cover slide.
        jobs.push(publishToThreads(imageUrls[0], entry.draft.captionThreads).then((id) => ["threads", id]));
      }

      const results = await Promise.allSettled(jobs);
      const publishedPostIds: { instagram?: string; threads?: string } = {};
      const errors: string[] = [];

      for (const result of results) {
        if (result.status === "fulfilled") {
          const [platform, id] = result.value;
          publishedPostIds[platform] = id;
        } else {
          errors.push(result.reason?.message || String(result.reason));
        }
      }

      const anyPublished = !!(publishedPostIds.instagram || publishedPostIds.threads);
      db.get("queue")
        .find({ queueId: entry.queueId })
        .assign({
          status: anyPublished ? "published" : "failed",
          imageUrls,
          publishedPostIds,
          reviewNote: errors.length ? errors.join(" | ") : entry.reviewNote,
          updatedAt: nowIso(),
        })
        .write();

      if (errors.length) logger.warn(`Partial publish failure for ${entry.queueId}: ${errors.join(" | ")}`);
      else logger.info(`Published ${entry.queueId} to ${threadsConfigured ? "both platforms" : "Instagram"}.`);
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
  logger.info(
    `Publisher worker started (Threads ${threadsConfigured ? "enabled" : "disabled — add THREADS_ACCESS_TOKEN/THREADS_USER_ID later to turn it on"}). Draining any approved items now, then checking every 10 minutes.`
  );
  drainApprovedQueue();
  cron.schedule("*/10 * * * *", () => drainApprovedQueue(), { timezone });
}
