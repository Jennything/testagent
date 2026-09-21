import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import cron from "node-cron";
import fs from "fs";
import { db, nowIso } from "../db";
import { QueueEntry } from "../types";
import { logger } from "../utils/logger";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
if (!token || !chatId) {
  throw new Error("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID must be set in .env");
}

const bot = new TelegramBot(token, { polling: true });

function scoreLine(entry: QueueEntry): string {
  const b = entry.item.scoreBreakdown;
  return `score ${entry.item.score} (recency ${b.recency} · cred ${b.credibility} · social ${b.social} · fit ${b.brandFit} · novelty ${b.novelty})`;
}

function captionPreview(entry: QueueEntry): string {
  return [
    `*${entry.draft.templateId.toUpperCase()}* — ${entry.item.category}`,
    `${entry.draft.headline}`,
    ``,
    `_${scoreLine(entry)}_`,
    `Source: ${entry.item.source} — ${entry.item.url}`,
    ``,
    `IG caption: ${entry.draft.captionInstagram}`,
    ``,
    `Threads caption: ${entry.draft.captionThreads}`,
  ].join("\n");
}

async function sendForApproval(entry: QueueEntry): Promise<void> {
  const keyboard = {
    inline_keyboard: [
      [
        { text: "✅ Approve", callback_data: `approve:${entry.queueId}` },
        { text: "✏️ Edit caption", callback_data: `edit:${entry.queueId}` },
        { text: "❌ Reject", callback_data: `reject:${entry.queueId}` },
      ],
    ],
  };

  try {
    const sent = await bot.sendPhoto(chatId!, fs.createReadStream(entry.imagePath), {
      caption: captionPreview(entry).slice(0, 1024),
      parse_mode: "Markdown",
      reply_markup: keyboard as any,
    });
    db.get("queue")
      .find({ queueId: entry.queueId })
      .assign({ telegramMessageId: sent.message_id, updatedAt: nowIso() })
      .write();
  } catch (err) {
    logger.error(`Failed to send queue entry ${entry.queueId} to Telegram:`, (err as Error).message);
  }
}

export async function pollAndSendPending(): Promise<void> {
  const pending: QueueEntry[] = db
    .get("queue")
    .filter((q: QueueEntry) => q.status === "pending_approval" && !q.telegramMessageId)
    .value();

  if (pending.length === 0) {
    logger.info("No new items awaiting approval.");
    return;
  }

  logger.info(`Sending ${pending.length} card(s) to Telegram for approval.`);
  for (const entry of pending) {
    await sendForApproval(entry);
    await new Promise((r) => setTimeout(r, 1200)); // gentle rate limit
  }
}

// Track queueIds currently waiting on a text reply for an edit.
const awaitingEdit = new Set<string>();

bot.on("callback_query", async (query) => {
  if (!query.data) return;
  const [action, queueId] = query.data.split(":");
  const entry: QueueEntry | undefined = db.get("queue").find({ queueId }).value();
  if (!entry) {
    await bot.answerCallbackQuery(query.id, { text: "Item not found (maybe already processed)." });
    return;
  }

  if (action === "approve") {
    db.get("queue").find({ queueId }).assign({ status: "approved", updatedAt: nowIso() }).write();
    await bot.answerCallbackQuery(query.id, { text: "Approved — queued for publishing." });
    if (query.message) {
      await bot.editMessageCaption(`✅ APPROVED\n\n${captionPreview(entry)}`.slice(0, 1024), {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: "Markdown",
      });
    }
  } else if (action === "reject") {
    db.get("queue").find({ queueId }).assign({ status: "rejected", updatedAt: nowIso() }).write();
    await bot.answerCallbackQuery(query.id, { text: "Rejected." });
    if (query.message) {
      await bot.editMessageCaption(`❌ REJECTED\n\n${captionPreview(entry)}`.slice(0, 1024), {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: "Markdown",
      });
    }
  } else if (action === "edit") {
    awaitingEdit.add(queueId);
    await bot.answerCallbackQuery(query.id, { text: "Reply to this photo with the new Instagram caption text." });
  }
});

bot.on("message", async (msg) => {
  if (!msg.text || !msg.reply_to_message) return;
  const repliedId = msg.reply_to_message.message_id;
  const entry: QueueEntry | undefined = db
    .get("queue")
    .find((q: QueueEntry) => q.telegramMessageId === repliedId)
    .value();
  if (!entry || !awaitingEdit.has(entry.queueId)) return;

  db.get("queue")
    .find({ queueId: entry.queueId })
    .assign({
      status: "approved",
      updatedAt: nowIso(),
      reviewNote: "caption manually edited",
      draft: { ...entry.draft, captionInstagram: msg.text, captionThreads: msg.text.split("\n")[0] },
    })
    .write();
  awaitingEdit.delete(entry.queueId);
  await bot.sendMessage(msg.chat.id, "Caption updated and approved for publishing. ✅");
});

const timezone = process.env.TIMEZONE || "Asia/Seoul";
// Two review batches a day: 09:00 and 19:00.
cron.schedule("0 9 * * *", () => pollAndSendPending(), { timezone });
cron.schedule("0 19 * * *", () => pollAndSendPending(), { timezone });

logger.info("Telegram approval bot running. Checking for anything already pending...");
pollAndSendPending();
