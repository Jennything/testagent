import { RawItem, QueueEntry } from "../types";
import { db } from "../db";
import scoringConfig from "../../config/scoring.json";

// Cheap token-overlap similarity — good enough to catch "same story, different outlet".
function titleSimilarity(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let overlap = 0;
  for (const tok of setA) if (setB.has(tok)) overlap++;
  return overlap / Math.max(setA.size, setB.size);
}

export function filterAlreadyCovered(items: RawItem[]): RawItem[] {
  const lookbackHours = scoringConfig.dedupe.lookbackHours;
  const threshold = scoringConfig.dedupe.titleSimilarityThreshold;
  const cutoff = Date.now() - lookbackHours * 3600 * 1000;

  const recentQueue: QueueEntry[] = (db.get("queue").value() as QueueEntry[]).filter(
    (q) => new Date(q.createdAt).getTime() > cutoff
  );
  const recentTitles = recentQueue.map((q) => q.item.title);

  const seenInBatch: string[] = [];
  const kept: RawItem[] = [];

  for (const item of items) {
    const dupInQueue = recentTitles.some((t) => titleSimilarity(t, item.title) >= threshold);
    const dupInBatch = seenInBatch.some((t) => titleSimilarity(t, item.title) >= threshold);
    if (dupInQueue || dupInBatch) continue;
    seenInBatch.push(item.title);
    kept.push(item);
  }

  return kept;
}
