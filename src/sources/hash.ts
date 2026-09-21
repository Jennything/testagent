import crypto from "crypto";

export function idFromUrl(url: string): string {
  return crypto.createHash("sha1").update(url.trim().toLowerCase()).digest("hex").slice(0, 16);
}
