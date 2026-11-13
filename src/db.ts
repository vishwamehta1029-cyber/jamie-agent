import pg from "pg";
import { SCHEMA } from "./schema.js";

let pool: pg.Pool | null = null;
let migrated: Promise<void> | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const local = /localhost|127\.0\.0\.1/.test(url);
    pool = new pg.Pool({
      connectionString: url,
      max: 3,
      ssl: local ? undefined : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function ensureSchema(): Promise<void> {
  if (!migrated) {
    migrated = getPool()
      .query(SCHEMA)
      .then(() => undefined)
      .catch((e) => {
        migrated = null;
        throw e;
      });
  }
  return migrated;
}

export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const res = await getPool().query(text, params);
  return res.rows as T[];
}

export async function one<T = any>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

export async function getSetting<T = any>(key: string): Promise<T> {
  const row = await one<{ value: T }>("SELECT value FROM settings WHERE key = $1", [key]);
  return row?.value as T;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await q(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [key, JSON.stringify(value)]
  );
}

export function tsOr(text: string): string | null {
  const words = (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 2);
  if (!words.length) return null;
  return Array.from(new Set(words)).join(" | ");
}
