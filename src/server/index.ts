import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import express from "express";
import { db } from "../db";
import { logger } from "../utils/logger";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 8787);

const publicDir = path.join(__dirname, "..", "..", "public");
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

// Serves rendered card PNGs at /cards/<file>.png — this is the URL the
// Instagram/Threads Graph APIs fetch from (see src/visuals/imageStore.ts,
// IMAGE_HOST=local). BASE_PUBLIC_URL must point at wherever this process
// is actually reachable from the internet.
app.use("/cards", express.static(path.join(publicDir, "cards")));

app.get("/health", (_req, res) => {
  const queue = db.get("queue").value();
  res.json({
    ok: true,
    pending: queue.filter((q) => q.status === "pending_approval").length,
    approved: queue.filter((q) => q.status === "approved").length,
    published: queue.filter((q) => q.status === "published").length,
    failed: queue.filter((q) => q.status === "failed").length,
  });
});

app.listen(port, () => {
  logger.info(`Image/health server listening on port ${port}`);
});
