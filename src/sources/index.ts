import { RawItem } from "../types";
import { fetchRssItems } from "./rss";
import { fetchHackerNewsItems } from "./hackernews";
import { fetchRedditItems } from "./reddit";
import { fetchTwitterItems } from "./twitter";
import { logger } from "../utils/logger";

export async function collectAllSources(): Promise<RawItem[]> {
  const [rss, hn, reddit, x] = await Promise.all([
    fetchRssItems(),
    fetchHackerNewsItems(),
    fetchRedditItems(),
    fetchTwitterItems(),
  ]);

  const all = [...rss, ...hn, ...reddit, ...x];

  // De-dupe exact same URL across sources, keep the one with the higher social signal.
  const byId = new Map<string, RawItem>();
  for (const item of all) {
    const existing = byId.get(item.id);
    if (!existing || item.socialSignal > existing.socialSignal) {
      byId.set(item.id, item);
    }
  }

  const unique = Array.from(byId.values());
  logger.info(
    `Collected ${all.length} raw items (${unique.length} unique) — rss:${rss.length} hn:${hn.length} reddit:${reddit.length} x:${x.length}`
  );
  return unique;
}
