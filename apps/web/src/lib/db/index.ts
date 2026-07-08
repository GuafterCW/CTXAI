import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const dbPath = process.env.DATABASE_PATH ?? "./data/ctxai.db";
mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

// Apply pending migrations on boot so self-hosters never run a manual step.
// Skipped during `next build`: page-data collection imports route modules in
// parallel worker processes, and concurrent migrations race on a fresh DB
// ("table already exists"). At runtime there is exactly one server process.
const migrationsFolder = path.join(process.cwd(), "drizzle");
if (
  process.env.NEXT_PHASE !== "phase-production-build" &&
  existsSync(migrationsFolder)
) {
  migrate(db, { migrationsFolder });
}

export { schema };
