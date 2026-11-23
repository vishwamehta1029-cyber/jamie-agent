import { test } from "node:test";
import assert from "node:assert/strict";
import { withReadOnly, ReadOnlyViolation, type PgLikeClient } from "../lib/readonly.ts";

function fakeClient(fail?: (sql: string) => boolean) {
  const log: string[] = [];
  let released: unknown = "not released";
  const client: PgLikeClient = {
    async query(text: string, params?: unknown[]) {
      log.push(params?.length ? `${text} ${JSON.stringify(params)}` : text);
      if (fail?.(text)) throw new Error("boom");
      return { rows: [{ ok: 1 }] };
    },
    release(err?: boolean | Error) { released = err; },
  };
  return { client, log, released: () => released };
}

test("wraps work in a READ ONLY transaction with a timeout and always rolls back", async () => {
  const f = fakeClient();
  const rows = await withReadOnly(async () => f.client, (q) => q("SELECT $1::int AS ok", [1]));
  assert.deepEqual(rows, [{ ok: 1 }]);
  assert.deepEqual(f.log, ["BEGIN TRANSACTION READ ONLY", "SET LOCAL statement_timeout = 15000", 'SELECT $1::int AS ok [1]', "ROLLBACK"]);
  assert.equal(f.released(), undefined);
});

test("rolls back and discards the connection on error", async () => {
  const f = fakeClient((s) => s.startsWith("SELECT"));
  await assert.rejects(withReadOnly(async () => f.client, (q) => q("SELECT 1")), /boom/);
  assert.equal(f.log.at(-1), "ROLLBACK");
  assert.equal(f.released(), true);
});

test("refuses transaction control and multiple statements, so READ ONLY cannot be escaped", async () => {
  for (const sql of ["COMMIT", "  rollback", "BEGIN", "END", "SET TRANSACTION READ WRITE", "set session characteristics as transaction read write", "SELECT 1; DELETE FROM sends", "reset all"]) {
    const f = fakeClient();
    await assert.rejects(withReadOnly(async () => f.client, (q) => q(sql)), ReadOnlyViolation, sql);
    assert.deepEqual(f.log, ["BEGIN TRANSACTION READ ONLY", "SET LOCAL statement_timeout = 15000", "ROLLBACK"], sql);
  }
});

test("statement timeout is clamped to an integer between 1 and 60 seconds", async () => {
  const f = fakeClient();
  await withReadOnly(async () => f.client, async () => null, { timeoutMs: 9e9 });
  assert.equal(f.log[1], "SET LOCAL statement_timeout = 60000");
});
