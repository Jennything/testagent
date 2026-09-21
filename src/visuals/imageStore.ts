import path from "path";
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";
import { logger } from "../utils/logger";

dotenv.config();

let cloudinaryConfigured = false;
function ensureCloudinary() {
  if (cloudinaryConfigured) return;
  if (!process.env.CLOUDINARY_URL) {
    throw new Error("CLOUDINARY_URL not set but IMAGE_HOST=cloudinary");
  }
  // cloudinary SDK reads CLOUDINARY_URL from env automatically.
  cloudinaryConfigured = true;
}

/**
 * Returns a public URL for the rendered card PNG.
 * - IMAGE_HOST=cloudinary → uploads to Cloudinary, returns their CDN URL.
 * - IMAGE_HOST=local (default) → assumes src/server/index.ts is serving
 *   /public as static files behind BASE_PUBLIC_URL (must be a real public
 *   domain for the Graph API to fetch it, e.g. via ngrok in dev or a real
 *   deploy in prod).
 */
export async function publishImageUrl(localPath: string): Promise<string> {
  const mode = process.env.IMAGE_HOST || "local";

  if (mode === "cloudinary") {
    ensureCloudinary();
    const result = await cloudinary.uploader.upload(localPath, { folder: "ai-pulse-cards" });
    logger.info(`Uploaded card to Cloudinary: ${result.secure_url}`);
    return result.secure_url;
  }

  const base = process.env.BASE_PUBLIC_URL || "http://localhost:8787";
  const filename = path.basename(localPath);
  const url = `${base}/cards/${filename}`;
  logger.info(`Card available at local static URL: ${url}`);
  return url;
}
