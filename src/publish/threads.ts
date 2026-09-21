import axios from "axios";
import { logger } from "../utils/logger";

const THREADS_BASE = "https://graph.threads.net/v1.0";

/**
 * Publishes an image + text post to Threads via the Threads API.
 * Requires its own Meta developer app + OAuth (separate from the IG Graph API app).
 * Two-step flow, same shape as Instagram: create container, then publish.
 * Docs: https://developers.facebook.com/docs/threads
 */
export async function publishToThreads(imageUrl: string, text: string): Promise<string> {
  const accessToken = process.env.THREADS_ACCESS_TOKEN;
  const userId = process.env.THREADS_USER_ID;
  if (!accessToken || !userId) {
    throw new Error("THREADS_ACCESS_TOKEN / THREADS_USER_ID not set");
  }

  const containerResp = await axios.post(`${THREADS_BASE}/${userId}/threads`, null, {
    params: {
      media_type: "IMAGE",
      image_url: imageUrl,
      text,
      access_token: accessToken,
    },
  });
  const creationId = containerResp.data.id;
  logger.info(`Threads media container created: ${creationId}`);

  // Threads recommends a short wait before publishing.
  await new Promise((r) => setTimeout(r, 5000));

  const publishResp = await axios.post(`${THREADS_BASE}/${userId}/threads_publish`, null, {
    params: { creation_id: creationId, access_token: accessToken },
  });

  const postId = publishResp.data.id;
  logger.info(`Published to Threads: ${postId}`);
  return postId;
}
