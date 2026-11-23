import "server-only";
import pg from "pg";
import { withReadOnly, type ReadQuery } from "./readonly";

// Read only by construction: there is no write helper in this app. Prefer a read-only Postgres role
// (DASHBOARD_DATABASE_URL); otherwise the same DATABASE_URL as jamie-mcp, still inside READ ONLY transactions.
let pool: pg.Pool | null = null;

export function databaseUrl(): string | undefined {
  return process.env.DASHBOARD_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

function getPool(): pg.Pool {
  if (!pool) {
    const url = databaseUrl();
    if (!url) throw new Error("No database configured: set DASHBOARD_DATABASE_URL or DATABASE_URL");
    const local = /localhost|127\.0\.0\.1/.test(url);
    pool = new pg.Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      application_name: "jamie-dashboard",
      ssl: local ? undefined : { rejectUnauthorized: false },
    });
    pool.on("error", () => { /* idle client dropped by the server; the pool replaces it */ });
  }
  return pool;
}

export function ro<T>(fn: (q: ReadQuery) => Promise<T>): Promise<T> {
  return withReadOnly(() => getPool().connect(), fn);
}

/** Run one section; a failure (for example a table that does not exist yet) shows up in place instead of breaking the page. */
export async function section<T>(fn: (q: ReadQuery) => Promise<T>): Promise<{ data: T; error: null } | { data: null; error: string }> {
  try {
    return { data: await ro(fn), error: null };
  } catch (e: any) {
    return { data: null, error: String(e?.message ?? e).slice(0, 300) };
  }
}

/** Public tables that exist right now (some agents create theirs on first use). */
export async function existingTables(q: ReadQuery): Promise<Set<string>> {
  const rows = await q<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
  );
  return new Set(rows.map((r) => r.table_name));
}

export type { ReadQuery };
