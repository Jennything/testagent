import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import cron from "node-cron";
import { db, nowIso } from "../db";
import { QueueEntry } from "../types";
import { logger } from "../utils/logger";

dotenv.config();

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_APP_PASSWORD = process.env.EMAIL_APP_PASSWORD;
const EMAIL_TO = process.env.EMAIL_TO || EMAIL_USER;

if (!EMAIL_USER || !EMAIL_APP_PASSWORD) {
  throw new Error("EMAIL_USER / EMAIL_APP_PASSWORD must be set in .env (a dedicated Gmail account + app password).");
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: EMAIL_USER, pass: EMAIL_APP_PASSWORD },
});

const SUBJECT_ID_RE = /\(ID:([a-f0-9-]{6,36})\)/i;

function categoryLabel(entry: QueueEntry): string {
  return entry.item.category === "meme" ? "밈" : "뉴스";
}

function buildEmailBody(entry: QueueEntry): string {
  const b = entry.item.scoreBreakdown;
  return [
    `카테고리: ${categoryLabel(entry)} (${entry.draft.templateId})`,
    `헤드라인: ${entry.draft.headline}`,
    `소스: ${entry.item.source} — ${entry.item.url}`,
    `점수: ${entry.item.score} (최신성 ${b.recency} · 신뢰도 ${b.credibility} · 화제성 ${b.social} · 적합도 ${b.brandFit} · 참신성 ${b.novelty})`,
    ``,
    `[인스타그램 캡션]`,
    entry.draft.captionInstagram,
    ``,
    `[쓰레드 캡션]`,
    entry.draft.captionThreads,
    ``,
    `카드 이미지는 첨부파일로 함께 보냈습니다.`,
    ``,
    `────────────────────────────────`,
    `이 메일에 그대로 "답장(Reply)"해서 알려주세요. 제목은 그대로 두세요.`,
    ``,
    `1) 승인하려면 → 답장 첫 줄에 딱 "승인" 이라고만 적어서 보내세요.`,
    `2) 반려하려면 → 답장 첫 줄에 딱 "반려" 이라고만 적어서 보내세요.`,
    `3) 캡션을 고치고 싶다면 → 답장 첫 줄에 "수정" 이라고 적고, 둘째 줄부터 새 인스타그램 캡션 전체를 적어서 보내세요.`,
  ].join("\n");
}

async function sendForApproval(entry: QueueEntry): Promise<void> {
  const subject = `[검토 필요 · ${categoryLabel(entry)}] ${entry.draft.headline} (ID:${entry.queueId})`;
  try {
    await transporter.sendMail({
      from: `"AI News You Need 검토봇" <${EMAIL_USER}>`,
      to: EMAIL_TO,
      subject,
      text: buildEmailBody(entry),
      attachments: [{ filename: "card.png", path: entry.imagePath }],
    });
    db.get("queue").find({ queueId: entry.queueId }).assign({ reviewEmailSent: true, updatedAt: nowIso() }).write();
    logger.info(`Sent review email for ${entry.queueId}: "${entry.draft.headline}"`);
  } catch (err) {
    logger.error(`Failed to send review email for ${entry.queueId}:`, (err as Error).message);
  }
}

export async function pollAndSendPending(): Promise<void> {
  const pending: QueueEntry[] = db
    .get("queue")
    .filter((q: QueueEntry) => q.status === "pending_approval" && !q.reviewEmailSent)
    .value();

  if (pending.length === 0) {
    logger.info("No new items awaiting approval.");
    return;
  }

  logger.info(`Emailing ${pending.length} card(s) for approval.`);
  for (const entry of pending) {
    await sendForApproval(entry);
    await new Promise((r) => setTimeout(r, 1000)); // gentle rate limit
  }
}

function firstNonEmptyLine(text: string): { line: string; rest: string } {
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  const line = (lines[i] || "").trim();
  const rest = lines
    .slice(i + 1)
    .join("\n")
    .trim();
  return { line, rest };
}

// Strips quoted "On ... wrote:" trailers that most mail clients append to replies.
function stripQuotedReply(text: string): string {
  const markers = [/^On .+wrote:$/m, /^-{2,}\s*Original Message\s*-{2,}/m, /^>{1}/m];
  let cut = text.length;
  for (const marker of markers) {
    const m = marker.exec(text);
    if (m && m.index < cut) cut = m.index;
  }
  return text.slice(0, cut).trim();
}

export async function checkReplies(): Promise<void> {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: EMAIL_USER!, pass: EMAIL_APP_PASSWORD! },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  let processed = 0;

  try {
    const uids = await client.search({ seen: false });
    if (!uids || uids.length === 0) {
      logger.info("No new reply emails.");
      return;
    }

    for (const uid of uids) {
      const msg = await client.fetchOne(uid, { source: true }, { uid: true });
      if (!msg || !msg.source) continue;

      const parsed = await simpleParser(msg.source);
      const subject = parsed.subject || "";
      const idMatch = SUBJECT_ID_RE.exec(subject);

      if (!idMatch) {
        // Not a reply to one of our review emails — leave it unread for a human to see.
        continue;
      }

      const queueId = idMatch[1];
      const entry: QueueEntry | undefined = db.get("queue").find({ queueId }).value();
      await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });

      if (!entry) {
        logger.warn(`Reply email referenced unknown queue id ${queueId}, ignoring.`);
        continue;
      }
      if (entry.status !== "pending_approval") {
        logger.info(`Reply email for ${queueId} arrived but it's already ${entry.status}, ignoring.`);
        continue;
      }

      const bodyText = stripQuotedReply(parsed.text || "");
      const { line, rest } = firstNonEmptyLine(bodyText);
      const normalized = line.toLowerCase();

      if (line === "승인" || normalized === "approve") {
        db.get("queue").find({ queueId }).assign({ status: "approved", updatedAt: nowIso() }).write();
        logger.info(`Approved via email reply: ${queueId}`);
      } else if (line === "반려" || normalized === "reject") {
        db.get("queue").find({ queueId }).assign({ status: "rejected", updatedAt: nowIso() }).write();
        logger.info(`Rejected via email reply: ${queueId}`);
      } else if (line === "수정" || normalized === "edit") {
        if (!rest) {
          logger.warn(`Edit reply for ${queueId} had no new caption text, ignoring.`);
          continue;
        }
        db.get("queue")
          .find({ queueId })
          .assign({
            status: "approved",
            updatedAt: nowIso(),
            reviewNote: "caption manually edited via email",
            draft: { ...entry.draft, captionInstagram: rest, captionThreads: rest.split("\n")[0] },
          })
          .write();
        logger.info(`Approved with edited caption via email reply: ${queueId}`);
      } else {
        logger.warn(`Reply email for ${queueId} didn't start with 승인/반려/수정 (got "${line}"), ignoring.`);
      }
      processed++;
    }
  } finally {
    lock.release();
    await client.logout();
  }

  if (processed > 0) logger.info(`Processed ${processed} reply email(s).`);
}

if (require.main === module) {
  const timezone = process.env.TIMEZONE || "Asia/Seoul";
  logger.info("Email approval bot started.");

  // Two review batches a day, same cadence as the pipeline.
  cron.schedule("0 9 * * *", () => pollAndSendPending(), { timezone });
  cron.schedule("0 19 * * *", () => pollAndSendPending(), { timezone });

  // Check for replies every 5 minutes so approvals go out fast.
  cron.schedule("*/5 * * * *", () => checkReplies(), { timezone });

  pollAndSendPending();
  checkReplies();
}
