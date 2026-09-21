import path from "path";
import fs from "fs";
import { chromium, Browser } from "playwright";
import { Draft, ScoredItem } from "../types";
import brandConfig from "../../config/brand.json";

const templatesDir = path.join(__dirname, "..", "..", "templates");
const outputDir = path.join(__dirname, "..", "..", "public", "cards");
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

let browserPromise: Promise<Browser> | null = null;
function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    // In some deploy environments the preinstalled browser build predates
    // the `playwright` package version pinned in package.json, so the
    // default lookup path can 404. Fall back to the known-good local
    // install if present.
    const pinnedExecutable = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
    const launchOpts: Parameters<typeof chromium.launch>[0] = { args: ["--no-sandbox"] };
    if (fs.existsSync(pinnedExecutable)) {
      launchOpts.executablePath = pinnedExecutable;
    }
    browserPromise = chromium.launch(launchOpts);
  }
  return browserPromise;
}

export async function closeRenderer(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pickTemplate(item: ScoredItem, draft: Draft): string {
  const ageHours = (Date.now() - new Date(item.publishedAt).getTime()) / 3600000;
  if (draft.templateId === "meme_card") return "meme_card.html";
  if (item.score >= 90 && ageHours <= 3) return "breaking_card.html";
  return "news_card.html";
}

// A short "deck" line under the headline (see the evolving.ai-style reference
// layout) — the subhead if we have one, else the first bullet or two,
// capped so it never overflows the fixed-height panel.
function buildDeck(draft: Draft): string {
  const parts = [draft.subhead, ...draft.bullets].filter((s): s is string => !!s && s.trim().length > 0);
  let deck = parts.join(" ").trim();
  if (deck.length > 130) deck = deck.slice(0, 127).trimEnd() + "…";
  return deck;
}

export async function renderCard(item: ScoredItem, draft: Draft): Promise<string> {
  const file = pickTemplate(item, draft);
  const templatePath = path.join(templatesDir, file);
  let html = fs.readFileSync(templatePath, "utf-8");

  const hasImage = !!item.imageUrl;
  const imageTag = hasImage ? `<img class="bg-photo" src="${escapeHtml(item.imageUrl!)}" />` : "";

  const replacements: Record<string, string> = {
    "{{HEADLINE}}": escapeHtml(draft.headline),
    "{{DECK}}": escapeHtml(buildDeck(draft)),
    "{{BRAND_NAME}}": escapeHtml(brandConfig.name),
    "{{PHOTO_CLASS}}": hasImage ? "" : "no-photo",
    "{{IMAGE_TAG}}": imageTag,
  };
  for (const [token, value] of Object.entries(replacements)) {
    html = html.split(token).join(value);
  }

  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  await page.setContent(html, { waitUntil: "networkidle" });

  const outPath = path.join(outputDir, `${item.id}-${Date.now()}.png`);
  await page.screenshot({ path: outPath });
  await page.close();

  return outPath;
}
