import axios from "axios";
import { RawItem } from "../types";
import { idFromUrl } from "./hash";
import { logger } from "../utils/logger";
import sourcesConfig from "../../config/sources.json";

interface RedditPost {
  data: {
    title: string;
    url: string;
    permalink: string;
    ups: number;
    created_utc: number;
    selftext?: string;
    post_hint?: string;
    preview?: { images?: Array<{ source?: { url?: string } }> };
    thumbnail?: string;
  };
}

function extractImage(d: RedditPost["data"]): string | undefined {
  const previewUrl = d.preview?.images?.[0]?.source?.url;
  if (previewUrl) return previewUrl.replace(/&amp;/g, "&");
  if (d.post_hint === "image" && /^https?:\/\//.test(d.url)) return d.url;
  if (/\.(jpg|jpeg|png|gif|webp)$/i.test(d.url)) return d.url;
  if (d.thumbnail && /^https?:\/\//.test(d.thumbnail)) return d.thumbnail;
  return undefined;
}

export async function fetchRedditItems(): Promise<RawItem[]> {
  const cfg = sourcesConfig.reddit;
  if (!cfg.enabled) return [];

  const results: RawItem[] = [];

  await Promise.all(
    cfg.subreddits.map(async (sub: string) => {
      try {
        const resp = await axios.get(`https://www.reddit.com/r/${sub}/${cfg.sort}.json?limit=15`, {
          timeout: 15000,
          headers: { "User-Agent": "ai-pulse-media-bot/0.1 (source monitoring)" },
        });
        const posts: RedditPost[] = resp.data?.data?.children || [];
        for (const post of posts) {
          const d = post.data;
          if (!d || d.ups < cfg.minUpvotes) continue;
          const url = d.url && d.url.startsWith("http") ? d.url : `https://reddit.com${d.permalink}`;
          results.push({
            id: idFromUrl(`https://reddit.com${d.permalink}`),
            source: `reddit:${sub}`,
            sourceKind: "reddit",
            title: d.title,
            url,
            imageUrl: extractImage(d),
            summary: d.selftext ? d.selftext.slice(0, 500) : undefined,
            publishedAt: new Date(d.created_utc * 1000).toISOString(),
            socialSignal: d.ups,
            credibility: 60,
            fetchedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        logger.warn(`Reddit fetch failed for r/${sub}:`, (err as Error).message);
      }
    })
  );

  return results;
}
