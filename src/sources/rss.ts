import Parser from "rss-parser";
import { RawItem } from "../types";
import { idFromUrl } from "./hash";
import { logger } from "../utils/logger";
import sourcesConfig from "../../config/sources.json";

const parser = new Parser({
  timeout: 15000,
  customFields: {
    item: [["media:content", "mediaContent"], ["media:thumbnail", "mediaThumbnail"], "content:encoded"],
  },
});

interface RssSourceConfig {
  id: string;
  url: string;
  credibility: number;
  kind: "lab" | "press";
}

function extractImage(entry: any): string | undefined {
  if (entry.enclosure?.url && /^https?:\/\//.test(entry.enclosure.url)) return entry.enclosure.url;

  const media = entry.mediaContent || entry.mediaThumbnail;
  if (media) {
    const node = Array.isArray(media) ? media[0] : media;
    const url = node?.$?.url || node?.url;
    if (url) return url;
  }

  const html: string = entry["content:encoded"] || entry.content || entry.summary || "";
  const match = /<img[^>]+src="([^">]+)"/i.exec(html);
  if (match) return match[1];

  return undefined;
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
            imageUrl: extractImage(entry),
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
