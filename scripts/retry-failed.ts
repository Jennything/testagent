// Resets any "failed" queue entries back to "approved" so the next
// `npm run dev:publisher` (or the publisher worker's next 10-minute tick)
// picks them up and retries. Run with: npm run retry-failed
import { db, nowIso } from "../src/db";
import { QueueEntry } from "../src/types";

const failed: QueueEntry[] = db.get("queue").filter({ status: "failed" }).value();

if (failed.length === 0) {
  console.log("No failed items to retry.");
  process.exit(0);
}

for (const entry of failed) {
  db.get("queue").find({ queueId: entry.queueId }).assign({ status: "approved", updatedAt: nowIso() }).write();
  console.log(`Reset to approved: "${entry.draft.headline}" (${entry.queueId})`);
}

console.log(`\n${failed.length} item(s) reset. Run "npm run dev:publisher" to retry.`);
