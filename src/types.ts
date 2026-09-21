export type SourceKind = "lab" | "press" | "hackernews" | "reddit" | "x";

export interface RawItem {
  id: string; // stable hash of url
  source: string; // e.g. "openai-blog", "hackernews", "reddit:artificial"
  sourceKind: SourceKind;
  title: string;
  url: string;
  summary?: string;
  publishedAt: string; // ISO
  socialSignal: number; // upvotes / points / reactions, normalized later
  credibility: number; // 0-100, from config/sources.json
  fetchedAt: string;
}

export interface ScoredItem extends RawItem {
  score: number;
  scoreBreakdown: {
    recency: number;
    credibility: number;
    social: number;
    brandFit: number;
    novelty: number;
  };
  category: "news" | "meme";
  reasoning: string;
}

export interface Draft {
  itemId: string;
  templateId: "news_card" | "meme_card" | "breaking_card";
  headline: string;
  subhead?: string;
  bullets: string[];
  sourceLabel: string;
  captionInstagram: string;
  captionThreads: string;
  hashtags: string[];
  createdAt: string;
}

export type QueueStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "edited"
  | "publishing"
  | "published"
  | "failed";

export interface QueueEntry {
  queueId: string;
  item: ScoredItem;
  draft: Draft;
  imagePath: string; // local rendered PNG path
  imageUrl?: string; // public URL once hosted
  status: QueueStatus;
  reviewEmailSent?: boolean;
  createdAt: string;
  updatedAt: string;
  publishedPostIds?: { instagram?: string; threads?: string };
  reviewNote?: string;
}

export interface InsightRecord {
  queueId: string;
  platform: "instagram" | "threads";
  postId: string;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  impressions: number;
  fetchedAt: string;
}

export interface DbSchema {
  rawItems: RawItem[];
  queue: QueueEntry[];
  insights: InsightRecord[];
  sourcePerformance: Record<string, number>; // source id -> multiplier
}
