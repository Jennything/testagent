export type SourceKind = "lab" | "press" | "hackernews" | "reddit" | "x";

export interface RawItem {
  id: string; // stable hash of url
  source: string; // e.g. "openai-blog", "hackernews", "reddit:artificial"
  sourceKind: SourceKind;
  title: string;
  url: string;
  imageUrl?: string; // article/post photo, used as the card's background image when present
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

export interface CarouselPoint {
  point: string; // short summary point, shown on the summary slide
  detail: string; // 1-2 sentence expansion, shown on its own detail slide
}

export interface Draft {
  itemId: string;
  templateId: "news_card" | "meme_card" | "breaking_card";
  headline: string;
  subhead?: string;
  bullets: string[];
  points?: CarouselPoint[]; // news_card only — exactly 3, powers the carousel's summary + detail slides
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
  imagePaths: string[]; // local rendered PNG path(s) — 1 for meme/breaking, 5 for a news carousel (cover, summary, 3 detail slides)
  imageUrls?: string[]; // public URL(s) once hosted, same order as imagePaths
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
