// Smoke test: renders a 5-slide news carousel and a single-image meme card
// with dummy data, no API keys required. Run with: npm run test:render
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
  // News carousel — has a photo, exercises cover + summary + 3 detail slides.
  const newsItem = makeItem({ imageUrl: "https://picsum.photos/seed/ainews-openai/1080/900" });
  const newsDraft: Draft = {
    itemId: newsItem.id,
    templateId: "news_card",
    headline: "OpenAI's New Model Is 40% Faster",
    subhead: "And it costs less per token than GPT-5.",
    bullets: [],
    points: [
      {
        point: "40% faster inference than the previous model",
        detail: "OpenAI says the new model responds noticeably faster in both the API and ChatGPT, especially on longer prompts.",
      },
      {
        point: "Cheaper per token for API customers",
        detail: "Input token pricing drops alongside the speed bump, making high-volume use cases meaningfully cheaper to run.",
      },
      {
        point: "Rolling out to API and ChatGPT this week",
        detail: "The update ships gradually across regions this week — no action needed, existing integrations pick it up automatically.",
      },
    ],
    sourceLabel: "OpenAI Blog",
    captionInstagram: "OpenAI just shipped a faster, cheaper model. Here's what changed. Follow for the fastest AI news, no fluff. #AI #OpenAI #TechNews",
    captionThreads: "OpenAI's new model is 40% faster and cheaper. Here's the breakdown.",
    hashtags: ["#AI", "#OpenAI", "#TechNews"],
    createdAt: new Date().toISOString(),
  };

  // Meme card — single image, no photo, exercises the gradient fallback.
  const memeItem = makeItem({
    category: "meme",
    title: "Every AI startup pitch deck in 2026",
    source: "reddit:artificial",
    sourceKind: "reddit",
  });
  const memeDraft: Draft = {
    itemId: memeItem.id,
    templateId: "meme_card",
    headline: "Every AI Pitch Deck: 'Uber For X, But With Agents'",
    bullets: ["Slide 1: Problem. Slide 2: Agents. Slide 3: $50M ask."],
    sourceLabel: "r/artificial",
    captionInstagram: "We've all seen this deck. Follow @AiNewsYouNeed — we explain the news, then we laugh about it. #AI #startups",
    captionThreads: "Every AI pitch deck, 2026 edition.",
    hashtags: ["#AI", "#startups"],
    createdAt: new Date().toISOString(),
  };

  console.log("Rendering news carousel (cover + summary + 3 detail slides)...");
  const newsPaths = await renderCard(newsItem, newsDraft);
  newsPaths.forEach((p) => console.log("  →", p));

  console.log("Rendering meme card (single image, gradient fallback)...");
  const memePaths = await renderCard(memeItem, memeDraft);
  memePaths.forEach((p) => console.log("  →", p));

  await closeRenderer();
  console.log(`\nDone. ${newsPaths.length + memePaths.length} slide(s) total — open the PNGs above to verify:`);
  console.log(path.dirname(newsPaths[0]));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
