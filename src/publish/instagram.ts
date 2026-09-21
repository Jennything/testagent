import axios from "axios";
import { logger } from "../utils/logger";

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/**
 * Publishes an image post to Instagram via the Meta Graph API.
 * Two-step flow: create a media container, then publish it.
 * Docs: https://developers.facebook.com/docs/instagram-platform/content-publishing
 */
export async function publishToInstagram(imageUrl: string, caption: string): Promise<string> {
  const accessToken = process.env.IG_ACCESS_TOKEN;
  const igUserId = process.env.IG_BUSINESS_ACCOUNT_ID;
  if (!accessToken || !igUserId) {
    throw new Error("IG_ACCESS_TOKEN / IG_BUSINESS_ACCOUNT_ID not set");
  }

  const containerResp = await axios.post(`${GRAPH_BASE}/${igUserId}/media`, null, {
    params: {
      image_url: imageUrl,
      caption,
      access_token: accessToken,
    },
  });
  const creationId = containerResp.data.id;
  logger.info(`Instagram media container created: ${creationId}`);

  // Poll container status until it's ready to publish (usually near-instant for images).
  await waitUntilReady(creationId, accessToken);

  const publishResp = await axios.post(`${GRAPH_BASE}/${igUserId}/media_publish`, null, {
    params: { creation_id: creationId, access_token: accessToken },
  });

  const postId = publishResp.data.id;
  logger.info(`Published to Instagram: ${postId}`);
  return postId;
}

/**
 * Publishes a multi-image carousel post to Instagram.
 * Three-step flow: create a CAROUSEL_ITEM container per image (no caption on
 * these), then a parent CAROUSEL container referencing all of them (caption
 * goes here), then publish the parent.
 * Docs: https://developers.facebook.com/docs/instagram-platform/content-publishing#carousel-posts
 */
export async function publishCarouselToInstagram(imageUrls: string[], caption: string): Promise<string> {
  const accessToken = process.env.IG_ACCESS_TOKEN;
  const igUserId = process.env.IG_BUSINESS_ACCOUNT_ID;
  if (!accessToken || !igUserId) {
    throw new Error("IG_ACCESS_TOKEN / IG_BUSINESS_ACCOUNT_ID not set");
  }
  if (imageUrls.length < 2 || imageUrls.length > 10) {
    throw new Error(`Instagram carousels need 2-10 images, got ${imageUrls.length}`);
  }

  const childIds: string[] = [];
  for (const imageUrl of imageUrls) {
    const resp = await axios.post(`${GRAPH_BASE}/${igUserId}/media`, null, {
      params: { image_url: imageUrl, is_carousel_item: true, access_token: accessToken },
    });
    await waitUntilReady(resp.data.id, accessToken);
    childIds.push(resp.data.id);
  }
  logger.info(`Instagram carousel children created: ${childIds.join(", ")}`);

  const parentResp = await axios.post(`${GRAPH_BASE}/${igUserId}/media`, null, {
    params: {
      media_type: "CAROUSEL",
      children: childIds.join(","),
      caption,
      access_token: accessToken,
    },
  });
  const creationId = parentResp.data.id;
  await waitUntilReady(creationId, accessToken);

  const publishResp = await axios.post(`${GRAPH_BASE}/${igUserId}/media_publish`, null, {
    params: { creation_id: creationId, access_token: accessToken },
  });

  const postId = publishResp.data.id;
  logger.info(`Published Instagram carousel: ${postId}`);
  return postId;
}

async function waitUntilReady(creationId: string, accessToken: string, maxAttempts = 10): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const statusResp = await axios.get(`${GRAPH_BASE}/${creationId}`, {
      params: { fields: "status_code", access_token: accessToken },
    });
    if (statusResp.data.status_code === "FINISHED") return;
    if (statusResp.data.status_code === "ERROR") {
      throw new Error(`Instagram media container failed processing: ${creationId}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  // For static images this almost never triggers, but don't hang forever.
  logger.warn(`Instagram container ${creationId} still processing after max attempts, publishing anyway.`);
}
