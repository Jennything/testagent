// Smoke test: renders one news card and one meme card with dummy data,
// no API keys required. Run with: npm run test:render
import path from "path";
import { renderCard, closeRenderer } from "../src/visuals/render";
import { ScoredItem, Draft } from "../src/types";

function makeItem(overrides: Partial<ScoredItem>): ScoredItem {
  return {
    id: "test-" + Math.random().toString(36).slice(2, 8),
    source: "openai-blog",
    sourceKind: "lab",
    title: "OpenAI ships GPT-5.1 with 40% faster inference",
    url: "https://openai.com/blog/example",
    summary: "OpenAI announced a new model with faster inference and lower cost per token.",
    publishedAt: new Date().toISOString(),
    socialSignal: 500,
    credibility: 95,
    fetchedAt: new Date().toISOString(),
    score: 92,
    scoreBreakdown: { recency: 100, credibility: 95, social: 80, brandFit: 90, novelty: 85 },
    category: "news",
    reasoning: "Major lab release, high novelty.",
    ...overrides,
  };
}

async function main() {
  const newsItem = makeItem({});
  const newsDraft: Draft = {
    itemId: newsItem.id,
    templateId: "news_card",
    headline: "OpenAI's New Model Is 40% Faster",
    subhead: "And it costs less per token than GPT-5.",
    bullets: [
      "Inference latency down 40% vs. previous model",
      "Pricing cut for input tokens",
      "Rolling out to API and ChatGPT this week",
    ],
    sourceLabel: "OpenAI Blog",
    captionInstagram: "OpenAI just shipped a faster, cheaper model. Here's what changed. Follow for the fastest AI news, no fluff. #AI #OpenAI #TechNews",
    captionThreads: "OpenAI's new model is 40% faster and cheaper. Here's the breakdown.",
    hashtags: ["#AI", "#OpenAI", "#TechNews"],
    createdAt: new Date().toISOString(),
  };

  const memeItem = makeItem({
    category: "meme",
    title: "Every AI startup pitch deck in 2026",
    source: "reddit:artificial",
    sourceKind: "reddit",
  });
  const memeDraft: Draft = {
    itemId: memeItem.id,
    templateId: "meme_card",
    headline: "Every AI Pitch Deck In 2026: 'We're The Uber For X, But With Agents'",
    bullets: ["Slide 1: Problem. Slide 2: Agents. Slide 3: $50M ask."],
    sourceLabel: "r/artificial",
    captionInstagram: "We've all seen this deck. Follow @ai.pulse — we explain the news, then we laugh about it. #AI #startups",
    captionThreads: "Every AI pitch deck, 2026 edition.",
    hashtags: ["#AI", "#startups"],
    createdAt: new Date().toISOString(),
  };

  console.log("Rendering news card...");
  const newsPath = await renderCard(newsItem, newsDraft);
  console.log("  →", newsPath);

  console.log("Rendering meme card...");
  const memePath = await renderCard(memeItem, memeDraft);
  console.log("  →", memePath);

  console.log("Rendering breaking card...");
  const breakingItem = makeItem({ score: 95, publishedAt: new Date().toISOString() });
  const breakingDraft: Draft = { ...newsDraft, templateId: "news_card", headline: "BREAKING: Model Outage Hits ChatGPT Worldwide" };
  const breakingPath = await renderCard(breakingItem, breakingDraft);
  console.log("  →", breakingPath);

  await closeRenderer();
  console.log("\nDone. Open the PNGs above to verify the templates render correctly:");
  console.log(path.dirname(newsPath));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
