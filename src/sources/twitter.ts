import axios from "axios";
import { RawItem } from "../types";
import { idFromUrl } from "./hash";
import { logger } from "../utils/logger";
import sourcesConfig from "../../config/sources.json";

// X (Twitter) API is paid and optional. Disabled by default in config/sources.json.
// Wire it up once you have a Basic/Pro tier bearer token + a curated List ID
// (e.g. a list of OpenAI/Anthropic/Google DeepMind researchers and AI journalists).
export async function fetchTwitterItems(): Promise<RawItem[]> {
  const cfg = sourcesConfig.x;
  const bearer = process.env.X_BEARER_TOKEN;
  if (!cfg.enabled || !bearer || !cfg.listId) return [];

  const results: RawItem[] = [];
  try {
    const resp = await axios.get(
      `https://api.twitter.com/2/lists/${cfg.listId}/tweets`,
      {
        timeout: 15000,
        headers: { Authorization: `Bearer ${bearer}` },
        params: {
          "tweet.fields": "created_at,public_metrics",
          max_results: 30,
        },
      }
    );
    const tweets = resp.data?.data || [];
    for (const t of tweets) {
      const url = `https://x.com/i/web/status/${t.id}`;
      const metrics = t.public_metrics || {};
      const social = (metrics.like_count || 0) + (metrics.retweet_count || 0) * 2 + (metrics.reply_count || 0);
      results.push({
        id: idFromUrl(url),
        source: "x:list",
        sourceKind: "x",
        title: (t.text || "").slice(0, 140),
        url,
        summary: t.text,
        publishedAt: t.created_at || new Date().toISOString(),
        socialSignal: social,
        credibility: 65,
        fetchedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    logger.warn("X (Twitter) fetch failed:", (err as Error).message);
  }
  return results;
}
