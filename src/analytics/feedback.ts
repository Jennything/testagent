import { db } from "../db";
import { QueueEntry, InsightRecord } from "../types";
import { logger } from "../utils/logger";

const MIN_MULTIPLIER = 0.6;
const MAX_MULTIPLIER = 1.4;
const SMOOTHING = 0.3; // how much a fresh signal can move the multiplier per run

function engagementScore(insight: InsightRecord): number {
  return insight.likes + insight.comments * 2 + insight.shares * 3 + insight.saves * 2;
}

/**
 * Recomputes db.sourcePerformance: a per-source multiplier applied to future
 * curation scores (src/curation/score.ts). Sources whose posts consistently
 * out-perform the account average get boosted; underperformers get dampened.
 * This is the loop that lets the account learn "our audience loves Anthropic
 * safety posts but ignores generic funding-round news" over time.
 */
export async function updateSourcePerformance(): Promise<void> {
  const insights: InsightRecord[] = db.get("insights").value();
  const queue: QueueEntry[] = db.get("queue").value();
  if (insights.length === 0) return;

  const queueById = new Map(queue.map((q) => [q.queueId, q]));

  const bySource = new Map<string, number[]>();
  let globalTotal = 0;
  let globalCount = 0;

  for (const insight of insights) {
    const entry = queueById.get(insight.queueId);
    if (!entry) continue;
    const source = entry.item.source;
    const score = engagementScore(insight);
    if (!bySource.has(source)) bySource.set(source, []);
    bySource.get(source)!.push(score);
    globalTotal += score;
    globalCount += 1;
  }

  if (globalCount === 0) return;
  const globalAvg = globalTotal / globalCount;
  if (globalAvg === 0) return;

  const current: Record<string, number> = db.get("sourcePerformance").value() || {};

  for (const [source, scores] of bySource) {
    const sourceAvg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const relative = sourceAvg / globalAvg; // 1.0 = average
    const prev = current[source] ?? 1.0;
    const next = prev + (relative - prev) * SMOOTHING;
    current[source] = Math.max(MIN_MULTIPLIER, Math.min(MAX_MULTIPLIER, next));
  }

  db.set("sourcePerformance", current).write();
  logger.info(`Updated source performance multipliers: ${JSON.stringify(current)}`);
}
