// Every dashboard query runs inside BEGIN TRANSACTION READ ONLY ... ROLLBACK, with a statement timeout.
// Postgres itself then refuses any INSERT, UPDATE, DELETE, DDL or nextval, whatever the SQL says.
// Queries always go through the extended protocol with parameters, which allows one statement per call.

export type PgLikeClient = {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
  release(err?: boolean | Error): void;
};

export type ReadQuery = <R = any>(text: string, params?: unknown[]) => Promise<R[]>;

const TX_CONTROL = /^\s*(begin|start|commit|end|rollback|abort|savepoint|release|prepare|set\s+(session\s+)?(characteristics|transaction)|reset|discard)\b/i;

export class ReadOnlyViolation extends Error {}

export async function withReadOnly<T>(
  connect: () => Promise<PgLikeClient>,
  fn: (q: ReadQuery) => Promise<T>,
  opts: { timeoutMs?: number } = {}
): Promise<T> {
  const timeout = Math.max(1000, Math.min(60000, Math.floor(opts.timeoutMs ?? 15000)));
  const client = await connect();
  let failed = false;
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${timeout}`);
    const q: ReadQuery = async (text, params = []) => {
      if (TX_CONTROL.test(text) || text.includes(";")) throw new ReadOnlyViolation("transaction control and multiple statements are not allowed");
      return (await client.query(text, params)).rows;
    };
    const out = await fn(q);
    await client.query("ROLLBACK");
    return out;
  } catch (e) {
    failed = true;
    try { await client.query("ROLLBACK"); } catch { /* connection is discarded below */ }
    throw e;
  } finally {
    client.release(failed ? true : undefined);
  }
}
