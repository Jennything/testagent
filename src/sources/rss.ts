import Parser from "rss-parser";
import { RawItem } from "../types";
import { idFromUrl } from "./hash";
import { logger } from "../utils/logger";
import sourcesConfig from "../../config/sources.json";

const parser = new Parser({ timeout: 15000 });

interface RssSourceConfig {
  id: string;
  url: string;
  credibility: number;
  kind: "lab" | "press";
}

export async function fetchRssItems(): Promise<RawItem[]> {
  const feeds = sourcesConfig.rss as RssSourceConfig[];
  const results: RawItem[] = [];

  await Promise.all(
    feeds.map(async (feed) => {
      try {
        const parsed = await parser.parseURL(feed.url);
        for (const entry of parsed.items.slice(0, 15)) {
          if (!entry.link || !entry.title) continue;
          const publishedAt = entry.isoDate || entry.pubDate || new Date().toISOString();
          results.push({
            id: idFromUrl(entry.link),
            source: feed.id,
            sourceKind: feed.kind,
            title: entry.title.trim(),
            url: entry.link,
            summary: (entry.contentSnippet || entry.content || "").slice(0, 500),
            publishedAt,
            socialSignal: 0,
            credibility: feed.credibility,
            fetchedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        logger.warn(`RSS fetch failed for ${feed.id} (${feed.url}):`, (err as Error).message);
      }
    })
  );

  return results;
}
