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

function pickTemplate(item: ScoredItem, draft: Draft): { file: string; badge: string } {
  const ageHours = (Date.now() - new Date(item.publishedAt).getTime()) / 3600000;
  if (draft.templateId === "meme_card") {
    return { file: "meme_card.html", badge: "MEME" };
  }
  if (item.score >= 90 && ageHours <= 3) {
    return { file: "breaking_card.html", badge: "BREAKING" };
  }
  return { file: "news_card.html", badge: "NEWS" };
}

function bulletsHtml(bullets: string[], dotted: boolean): string {
  return bullets
    .map((b) =>
      dotted
        ? `<div class="bullet"><div class="bullet-dot"></div><div>${escapeHtml(b)}</div></div>`
        : `<div class="bullet">${escapeHtml(b)}</div>`
    )
    .join("\n");
}

export async function renderCard(item: ScoredItem, draft: Draft): Promise<string> {
  const { file, badge } = pickTemplate(item, draft);
  const templatePath = path.join(templatesDir, file);
  let html = fs.readFileSync(templatePath, "utf-8");

  const dotted = file !== "meme_card.html";
  const dateLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const replacements: Record<string, string> = {
    "{{HEADLINE}}": escapeHtml(draft.headline),
    "{{SUBHEAD}}": escapeHtml(draft.subhead || ""),
    "{{BULLETS_HTML}}": bulletsHtml(draft.bullets, dotted),
    "{{SOURCE_LABEL}}": escapeHtml(draft.sourceLabel),
    "{{BADGE}}": badge,
    "{{BRAND_NAME}}": escapeHtml(brandConfig.name),
    "{{BRAND_HANDLE}}": escapeHtml(brandConfig.handle_instagram),
    "{{DATE}}": dateLabel,
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
