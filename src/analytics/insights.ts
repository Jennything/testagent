import dotenv from "dotenv";
import axios from "axios";
import cron from "node-cron";
import { db, nowIso } from "../db";
import { QueueEntry, InsightRecord } from "../types";
import { logger } from "../utils/logger";
import { updateSourcePerformance } from "./feedback";

dotenv.config();

const GRAPH_VERSION = "v21.0";

async function fetchInstagramInsights(mediaId: string): Promise<Partial<InsightRecord>> {
  const accessToken = process.env.IG_ACCESS_TOKEN;
  const resp = await axios.get(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}/insights`, {
    params: { metric: "likes,comments,shares,saved,impressions", access_token: accessToken },
  });
  const values: Record<string, number> = {};
  for (const m of resp.data.data || []) {
    values[m.name] = m.values?.[0]?.value ?? 0;
  }
  return {
    likes: values.likes || 0,
    comments: values.comments || 0,
    shares: values.shares || 0,
    saves: values.saved || 0,
    impressions: values.impressions || 0,
  };
}

async function fetchThreadsInsights(mediaId: string): Promise<Partial<InsightRecord>> {
  const accessToken = process.env.THREADS_ACCESS_TOKEN;
  const resp = await axios.get(`https://graph.threads.net/v1.0/${mediaId}/insights`, {
    params: { metric: "likes,replies,reposts,quotes,views", access_token: accessToken },
  });
  const values: Record<string, number> = {};
  for (const m of resp.data.data || []) {
    values[m.name] = m.values?.[0]?.value ?? m.total_value?.value ?? 0;
  }
  return {
    likes: values.likes || 0,
    comments: values.replies || 0,
    shares: values.reposts || 0,
    saves: values.quotes || 0,
    impressions: values.views || 0,
  };
}

export async function collectInsights(): Promise<void> {
  const published: QueueEntry[] = db.get("queue").filter({ status: "published" }).value();
  if (published.length === 0) {
    logger.info("No published posts to fetch insights for yet.");
    return;
  }

  for (const entry of published) {
    const ids = entry.publishedPostIds;
    if (!ids) continue;

    try {
      if (ids.instagram) {
        const metrics = await fetchInstagramInsights(ids.instagram);
        saveInsight(entry.queueId, "instagram", ids.instagram, metrics);
      }
    } catch (err) {
      logger.warn(`Instagram insights fetch failed for ${entry.queueId}:`, (err as Error).message);
    }

    try {
      if (ids.threads) {
        const metrics = await fetchThreadsInsights(ids.threads);
        saveInsight(entry.queueId, "threads", ids.threads, metrics);
      }
    } catch (err) {
      logger.warn(`Threads insights fetch failed for ${entry.queueId}:`, (err as Error).message);
    }
  }

  await updateSourcePerformance();
}

function saveInsight(queueId: string, platform: "instagram" | "threads", postId: string, metrics: Partial<InsightRecord>) {
  const record: InsightRecord = {
    queueId,
    platform,
    postId,
    likes: metrics.likes || 0,
    comments: metrics.comments || 0,
    shares: metrics.shares || 0,
    saves: metrics.saves || 0,
    impressions: metrics.impressions || 0,
    fetchedAt: nowIso(),
  };
  db.get("insights").push(record).write();
}

if (require.main === module) {
  const timezone = process.env.TIMEZONE || "Asia/Seoul";
  logger.info("Analytics worker started. Collecting insights now, then daily at 23:30.");
  collectInsights();
  cron.schedule("30 23 * * *", () => collectInsights(), { timezone });
}
