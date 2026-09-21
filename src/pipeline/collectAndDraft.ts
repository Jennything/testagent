import dotenv from "dotenv";
import { v4 as uuid } from "uuid";
import { collectAllSources } from "../sources";
import { filterAlreadyCovered } from "../curation/dedupe";
import { scoreItems, applyThreshold } from "../curation/score";
import { draftForItem } from "../content/draft";
import { renderCard } from "../visuals/render";
import { db, nowIso } from "../db";
import { QueueEntry, ScoredItem, RawItem } from "../types";
import { logger } from "../utils/logger";
import brandConfig from "../../config/brand.json";

dotenv.config();

const RUNS_PER_DAY = 3; // matches the cron schedule in runScheduler.ts
const BUFFER_FACTOR = 1.5; // draft a few extra so rejections don't starve the daily quota

function selectContentMix(scored: ScoredItem[], count: number, memeRatio: number): ScoredItem[] {
  const news = scored.filter((s) => s.category === "news");
  const memes = scored.filter((s) => s.category === "meme");
  const memeSlots = Math.max(memeRatio > 0 ? 1 : 0, Math.round(count * memeRatio));
  const newsSlots = count - memeSlots;

  const picked = [...news.slice(0, newsSlots), ...memes.slice(0, memeSlots)];
  // Backfill from whichever pool has leftovers if the other ran dry.
  if (picked.length < count) {
    const remaining = scored.filter((s) => !picked.includes(s));
    picked.push(...remaining.slice(0, count - picked.length));
  }
  return picked.slice(0, count).sort((a, b) => b.score - a.score);
}

export async function runCollectAndDraft(): Promise<void> {
  logger.info("=== Pipeline run: collect → curate → draft → render → queue ===");

  const raw = await collectAllSources();
  db.get("rawItems")
    .push(...raw.filter((r: RawItem) => !db.get("rawItems").find({ id: r.id }).value()))
    .write();

  const fresh = filterAlreadyCovered(raw);
  logger.info(`${fresh.length}/${raw.length} items are not already covered.`);
  if (fresh.length === 0) return;

  const scored = await scoreItems(fresh);
  const candidates = applyThreshold(scored);
  logger.info(`${candidates.length} candidates cleared the quality threshold.`);
  if (candidates.length === 0) return;

  const dailyTarget = Number(process.env.DAILY_POST_TARGET || brandConfig.content_mix.daily_post_minimum);
  const itemsThisRun = Math.max(1, Math.round((dailyTarget / RUNS_PER_DAY) * BUFFER_FACTOR));
  const selected = selectContentMix(candidates, Math.min(itemsThisRun, candidates.length), brandConfig.content_mix.meme_ratio);

  logger.info(`Drafting + rendering ${selected.length} card(s) this run.`);

  for (const item of selected) {
    try {
      const draft = await draftForItem(item);
      const imagePath = await renderCard(item, draft);

      const entry: QueueEntry = {
        queueId: uuid(),
        item,
        draft,
        imagePath,
        status: "pending_approval",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      db.get("queue").push(entry).write();
      logger.info(`Queued for approval: "${draft.headline}" [${item.category}, score ${item.score}]`);
    } catch (err) {
      logger.error(`Failed to draft/render item ${item.id} ("${item.title}"):`, (err as Error).message);
    }
  }
}

if (require.main === module) {
  runCollectAndDraft()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error("Pipeline run failed:", err);
      process.exit(1);
    });
}
