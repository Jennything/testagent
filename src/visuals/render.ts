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

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

async function renderSlide(templateFile: string, replacements: Record<string, string>, outName: string): Promise<string> {
  const templatePath = path.join(templatesDir, templateFile);
  let html = fs.readFileSync(templatePath, "utf-8");
  for (const [token, value] of Object.entries(replacements)) {
    html = html.split(token).join(value);
  }

  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  await page.setContent(html, { waitUntil: "networkidle" });

  const outPath = path.join(outputDir, outName);
  await page.screenshot({ path: outPath });
  await page.close();

  return outPath;
}

// A short "deck" line under the cover headline — the subhead if we have one,
// else the first point's short summary, capped so it never overflows the
// fixed-height panel.
function buildDeck(draft: Draft): string {
  const fallback = draft.points?.[0]?.point || draft.bullets[0] || "";
  let deck = (draft.subhead || fallback).trim();
  if (deck.length > 130) deck = deck.slice(0, 127).trimEnd() + "…";
  return deck;
}

function pointsHtml(points: { point: string }[]): string {
  return points
    .map(
      (p, i) => `<div class="point-row"><div class="point-num">${pad2(i + 1)}</div><div class="point-text">${escapeHtml(p.point)}</div></div>`
    )
    .join("\n");
}

function coverTemplate(item: ScoredItem): string {
  const ageHours = (Date.now() - new Date(item.publishedAt).getTime()) / 3600000;
  return item.score >= 90 && ageHours <= 3 ? "breaking_card.html" : "news_card.html";
}

/**
 * Renders the given item+draft into one or more 1080x1350 PNG slides:
 * - meme_card: a single image.
 * - news_card: a 5-slide carousel (cover, 3-point summary, one detail slide per point).
 * Returns the slide paths in display order.
 */
export async function renderCard(item: ScoredItem, draft: Draft): Promise<string[]> {
  const hasImage = !!item.imageUrl;
  const imageTag = hasImage ? `<img class="bg-photo" src="${escapeHtml(item.imageUrl!)}" />` : "";
  const stamp = Date.now();

  if (draft.templateId === "meme_card") {
    const out = await renderSlide(
      "meme_card.html",
      {
        "{{HEADLINE}}": escapeHtml(draft.headline),
        "{{DECK}}": escapeHtml(buildDeck(draft)),
        "{{BRAND_NAME}}": escapeHtml(brandConfig.name),
        "{{PHOTO_CLASS}}": hasImage ? "" : "no-photo",
        "{{IMAGE_TAG}}": imageTag,
      },
      `${item.id}-${stamp}-1.png`
    );
    return [out];
  }

  // news_card → 5-slide carousel.
  const points = draft.points && draft.points.length === 3 ? draft.points : [];

  const coverPath = await renderSlide(
    coverTemplate(item),
    {
      "{{HEADLINE}}": escapeHtml(draft.headline),
      "{{DECK}}": escapeHtml(buildDeck(draft)),
      "{{BRAND_NAME}}": escapeHtml(brandConfig.name),
      "{{PHOTO_CLASS}}": hasImage ? "" : "no-photo",
      "{{IMAGE_TAG}}": imageTag,
    },
    `${item.id}-${stamp}-1.png`
  );

  const summaryPath = await renderSlide(
    "summary_slide.html",
    {
      "{{HEADLINE}}": escapeHtml(draft.headline),
      "{{BRAND_NAME}}": escapeHtml(brandConfig.name),
      "{{POINTS_HTML}}": pointsHtml(points),
    },
    `${item.id}-${stamp}-2.png`
  );

  const detailPaths: string[] = [];
  for (let i = 0; i < points.length; i++) {
    const detailPath = await renderSlide(
      "detail_slide.html",
      {
        "{{BRAND_NAME}}": escapeHtml(brandConfig.name),
        "{{DETAIL_INDEX}}": pad2(i + 1),
        "{{DETAIL_TOTAL}}": pad2(points.length),
        "{{POINT_TEXT}}": escapeHtml(points[i].point),
        "{{DETAIL_TEXT}}": escapeHtml(points[i].detail),
      },
      `${item.id}-${stamp}-${3 + i}.png`
    );
    detailPaths.push(detailPath);
  }

  return [coverPath, summaryPath, ...detailPaths];
}
