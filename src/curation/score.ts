import { RawItem, ScoredItem } from "../types";
import { askClaudeJSON } from "../utils/claudeClient";
import { db } from "../db";
import { logger } from "../utils/logger";
import scoringConfig from "../../config/scoring.json";
import brandConfig from "../../config/brand.json";

interface ClaudeJudgement {
  id: string;
  brandFit: number; // 0-100: how well this fits an AI-news-with-memes account
  novelty: number; // 0-100: how fresh/non-generic vs "yet another model release"
  category: "news" | "meme";
  reasoning: string;
}

function recencyScore(publishedAt: string, halfLifeHours: number): number {
  const ageHours = (Date.now() - new Date(publishedAt).getTime()) / 3600000;
  if (ageHours < 0) return 100;
  // Exponential decay, 100 at t=0, 50 at t=halfLife.
  return Math.round(100 * Math.pow(0.5, ageHours / halfLifeHours));
}

function socialScoreNormalized(items: RawItem[]): Map<string, number> {
  const max = Math.max(1, ...items.map((i) => i.socialSignal));
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(item.id, Math.round((item.socialSignal / max) * 100));
  }
  return map;
}

async function judgeWithClaude(items: RawItem[]): Promise<Map<string, ClaudeJudgement>> {
  const system = `You are the curation editor for "${brandConfig.name}", an AI news + meme media account.
Positioning: ${brandConfig.positioning}
Voice rules: ${brandConfig.voice.rules.join(" ")}

For each item, judge:
- brandFit (0-100): does this fit an account that covers AI news fast & accurately, occasionally with memes? Genuinely important AI news scores high. Off-topic, low-signal, or purely promotional items score low.
- novelty (0-100): is this a fresh angle, or the 10th "model X beats benchmark Y" post this week? Breaking/exclusive/surprising = high. Generic/incremental = low.
- category: "news" if this should become a straight news card, "meme" if the item itself is meme/humor-worthy material (a funny AI fail, an absurd AI-generated output, a relatable dev complaint about AI tools, etc).
- reasoning: one short sentence.

Return ONLY a JSON array, one object per item, in the same order given: [{"id": "...", "brandFit": 0-100, "novelty": 0-100, "category": "news"|"meme", "reasoning": "..."}]`;

  const user = JSON.stringify(
    items.map((i) => ({ id: i.id, title: i.title, summary: i.summary?.slice(0, 300), source: i.source }))
  );

  try {
    const judgements = await askClaudeJSON<ClaudeJudgement[]>(system, user, 2048);
    const map = new Map<string, ClaudeJudgement>();
    for (const j of judgements) map.set(j.id, j);
    return map;
  } catch (err) {
    logger.error("Claude curation scoring failed, falling back to neutral scores:", (err as Error).message);
    const map = new Map<string, ClaudeJudgement>();
    for (const i of items) {
      map.set(i.id, { id: i.id, brandFit: 50, novelty: 50, category: "news", reasoning: "fallback (Claude call failed)" });
    }
    return map;
  }
}

export async function scoreItems(items: RawItem[]): Promise<ScoredItem[]> {
  if (items.length === 0) return [];

  const weights = scoringConfig.weights;
  const socialMap = socialScoreNormalized(items);
  const sourcePerf: Record<string, number> = db.get("sourcePerformance").value() || {};

  // Claude judges brandFit/novelty/category in batches of 15 to keep prompts small.
  const BATCH = 15;
  const judgements = new Map<string, ClaudeJudgement>();
  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH);
    const chunkJudgements = await judgeWithClaude(chunk);
    for (const [k, v] of chunkJudgements) judgements.set(k, v);
  }

  const scored: ScoredItem[] = items.map((item) => {
    const judgement = judgements.get(item.id) || {
      id: item.id,
      brandFit: 50,
      novelty: 50,
      category: "news" as const,
      reasoning: "no judgement returned",
    };
    const recency = recencyScore(item.publishedAt, weights.recencyHours.halfLifeHours);
    const social = socialMap.get(item.id) || 0;
    const credibility = item.credibility;
    const perfMultiplier = sourcePerf[item.source] ?? 1.0;

    const rawScore =
      recency * weights.recencyHours.weight +
      credibility * weights.sourceCredibility.weight +
      social * weights.socialSignal.weight +
      judgement.brandFit * weights.brandFit.weight +
      judgement.novelty * weights.novelty.weight;

    const finalScore = Math.round(Math.min(100, rawScore * perfMultiplier));

    return {
      ...item,
      score: finalScore,
      scoreBreakdown: { recency, credibility, social, brandFit: judgement.brandFit, novelty: judgement.novelty },
      category: judgement.category,
      reasoning: judgement.reasoning,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export function applyThreshold(scored: ScoredItem[]): ScoredItem[] {
  const { minScoreToQueue, topNPerRun } = scoringConfig.threshold;
  return scored.filter((s) => s.score >= minScoreToQueue).slice(0, topNPerRun);
}
