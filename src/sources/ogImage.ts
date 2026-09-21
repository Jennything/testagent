import axios from "axios";
import { logger } from "../utils/logger";

const OG_IMAGE_RE = [
  /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
  /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
];

/**
 * Best-effort fallback for items whose RSS entry had no image: fetches the
 * article page itself and pulls its og:image/twitter:image meta tag. Only
 * called for the handful of items actually selected for a post (not the
 * full raw batch) to keep this cheap.
 */
export async function fetchOgImage(url: string): Promise<string | undefined> {
  try {
    const resp = await axios.get<string>(url, {
      timeout: 8000,
      responseType: "text",
      maxContentLength: 2_000_000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AINewsYouNeedToKnowBot/1.0)" },
    });
    const html = resp.data;
    for (const re of OG_IMAGE_RE) {
      const match = re.exec(html);
      if (match && /^https?:\/\//.test(match[1])) return match[1];
    }
    return undefined;
  } catch (err) {
    logger.warn(`og:image fetch failed for ${url}:`, (err as Error).message);
    return undefined;
  }
}
