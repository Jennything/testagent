import { ScoredItem, Draft } from "../types";
import { askClaudeJSON } from "../utils/claudeClient";
import { buildSystemPrompt } from "./brandVoice";
import { logger } from "../utils/logger";
import brandConfig from "../../config/brand.json";

interface ClaudeDraftResponse {
  headline: string;
  subhead?: string;
  bullets: string[];
  sourceLabel: string;
  captionInstagram: string;
  captionThreads: string;
  hashtags: string[];
}

function fallbackDraft(item: ScoredItem): ClaudeDraftResponse {
  return {
    headline: item.title.slice(0, 90),
    bullets: item.summary ? [item.summary.slice(0, 140)] : [],
    sourceLabel: item.source,
    captionInstagram: `${item.title}\n\n${brandConfig.cta.news}`,
    captionThreads: item.title,
    hashtags: brandConfig.hashtags.core.slice(0, 4),
  };
}

export async function draftForItem(item: ScoredItem): Promise<Draft> {
  const system = buildSystemPrompt();
  const templateId = item.category === "meme" ? "meme_card" : "news_card";

  const user = `Write a ${templateId} for this item. Respond ONLY with JSON matching:
{"headline": "...", "subhead": "optional one-liner or omit", "bullets": ["...", "..."], "sourceLabel": "outlet or account name", "captionInstagram": "...", "captionThreads": "...", "hashtags": ["#...", "#..."]}

Item:
Title: ${item.title}
Source: ${item.source}
URL: ${item.url}
Summary: ${item.summary || "(no summary available, use the title)"}
Category: ${item.category}
Curator reasoning: ${item.reasoning}

Available hashtags to pick from (use ones that fit, don't invent unrelated ones): ${[
    ...brandConfig.hashtags.core,
    ...brandConfig.hashtags.rotating,
  ].join(" ")}`;

  let parsed: ClaudeDraftResponse;
  try {
    parsed = await askClaudeJSON<ClaudeDraftResponse>(system, user, 800);
  } catch (err) {
    logger.error(`Draft generation failed for item ${item.id}, using fallback:`, (err as Error).message);
    parsed = fallbackDraft(item);
  }

  return {
    itemId: item.id,
    templateId,
    headline: parsed.headline,
    subhead: parsed.subhead,
    bullets: parsed.bullets || [],
    sourceLabel: parsed.sourceLabel || item.source,
    captionInstagram: parsed.captionInstagram,
    captionThreads: parsed.captionThreads,
    hashtags: parsed.hashtags || brandConfig.hashtags.core.slice(0, 4),
    createdAt: new Date().toISOString(),
  };
}
