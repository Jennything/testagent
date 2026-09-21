import axios from "axios";
import { RawItem } from "../types";
import { idFromUrl } from "./hash";
import { logger } from "../utils/logger";
import sourcesConfig from "../../config/sources.json";

interface HnHit {
  objectID: string;
  title: string | null;
  url: string | null;
  points: number | null;
  created_at: string;
  story_text?: string | null;
}

export async function fetchHackerNewsItems(): Promise<RawItem[]> {
  const cfg = sourcesConfig.hackernews;
  if (!cfg.enabled) return [];

  const results: RawItem[] = [];
  try {
    // Algolia HN Search API — no key required.
    const query = encodeURIComponent(cfg.keywords.join(" OR "));
    const resp = await axios.get(
      `https://hn.algolia.com/api/v1/search_by_date?query=${query}&tags=story&numericFilters=points%3E${cfg.minPoints}`,
      { timeout: 15000 }
    );
    const hits: HnHit[] = resp.data.hits || [];
    for (const hit of hits.slice(0, 20)) {
      const url = hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`;
      if (!hit.title) continue;
      const lowerTitle = hit.title.toLowerCase();
      const matchesKeyword = cfg.keywords.some((k: string) => lowerTitle.includes(k.toLowerCase()));
      if (!matchesKeyword) continue;
      results.push({
        id: idFromUrl(url),
        source: "hackernews",
        sourceKind: "hackernews",
        title: hit.title,
        url,
        summary: hit.story_text ? hit.story_text.slice(0, 500) : undefined,
        publishedAt: hit.created_at,
        socialSignal: hit.points || 0,
        credibility: 70,
        fetchedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    logger.warn("Hacker News fetch failed:", (err as Error).message);
  }
  return results;
}
