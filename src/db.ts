import path from "path";
import fs from "fs";
import low from "lowdb";
import FileSync from "lowdb/adapters/FileSync";
import { DbSchema } from "./types";

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbFile = path.join(dataDir, "db.json");
const adapter = new FileSync<DbSchema>(dbFile);
export const db = low(adapter);

db.defaults({
  rawItems: [],
  queue: [],
  insights: [],
  sourcePerformance: {},
}).write();

export function nowIso(): string {
  return new Date().toISOString();
}
