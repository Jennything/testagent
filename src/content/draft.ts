import { ScoredItem, Draft, CarouselPoint } from "../types";
import { askClaudeJSON } from "../utils/claudeClient";
import { buildSystemPrompt } from "./brandVoice";
import { logger } from "../utils/logger";
import brandConfig from "../../config/brand.json";

interface ClaudeDraftResponse {
  headline: string;
  subhead?: string;
  bullets: string[];
  points?: CarouselPoint[];
  sourceLabel: string;
  captionInstagram: string;
  captionThreads: string;
  hashtags: string[];
}

function fallbackDraft(item: ScoredItem, templateId: Draft["templateId"]): ClaudeDraftResponse {
  const summarySentence = item.summary ? item.summary.slice(0, 140) : item.title;
  return {
    headline: item.title.slice(0, 90),
    bullets: item.summary ? [summarySentence] : [],
    points:
      templateId === "news_card"
        ? [
            { point: "Read the full story at the source.", detail: summarySentence },
            { point: item.source, detail: `Originally reported by ${item.source}.` },
            { point: "More coverage to follow.", detail: "This is a fallback summary — the AI draft step failed for this item." },
          ]
        : undefined,
    sourceLabel: item.source,
    captionInstagram: `${item.title}\n\n${brandConfig.cta.news}`,
    captionThreads: item.title,
    hashtags: brandConfig.hashtags.core.slice(0, 4),
  };
}

export async function draftForItem(item: ScoredItem): Promise<Draft> {
  const system = buildSystemPrompt();
  const templateId = item.category === "meme" ? "meme_card" : "news_card";

  const jsonShape =
    templateId === "news_card"
      ? `{"headline": "...", "subhead": "optional one-liner or omit", "points": [{"point": "...", "detail": "..."}, {"point": "...", "detail": "..."}, {"point": "...", "detail": "..."}], "sourceLabel": "outlet or account name", "captionInstagram": "...", "captionThreads": "...", "hashtags": ["#...", "#..."]}`
      : `{"headline": "...", "bullets": ["...", "..."], "sourceLabel": "outlet or account name", "captionInstagram": "...", "captionThreads": "...", "hashtags": ["#...", "#..."]}`;

  const user = `Write a ${templateId} for this item. Respond ONLY with JSON matching:
${jsonShape}

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
    parsed = await askClaudeJSON<ClaudeDraftResponse>(system, user, 1200);
  } catch (err) {
    logger.error(`Draft generation failed for item ${item.id}, using fallback:`, (err as Error).message);
    parsed = fallbackDraft(item, templateId);
  }

  if (templateId === "news_card" && (!parsed.points || parsed.points.length !== 3)) {
    logger.warn(`Claude didn't return exactly 3 points for item ${item.id}, using fallback points.`);
    parsed.points = fallbackDraft(item, templateId).points;
  }

  return {
    itemId: item.id,
    templateId,
    headline: parsed.headline,
    subhead: parsed.subhead,
    bullets: parsed.bullets || [],
    points: templateId === "news_card" ? parsed.points : undefined,
    sourceLabel: parsed.sourceLabel || item.source,
    captionInstagram: parsed.captionInstagram,
    captionThreads: parsed.captionThreads,
    hashtags: parsed.hashtags || brandConfig.hashtags.core.slice(0, 4),
    createdAt: new Date().toISOString(),
  };
}
