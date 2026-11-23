import { test } from "node:test";
import assert from "node:assert/strict";
import { MASK, isSecretColumn, maskRow } from "../lib/mask.ts";
import { browseQuery } from "../lib/browse.ts";
import { likePattern, quoteIdent, safeHref } from "../lib/sql.ts";

test("secret-looking column names are detected", () => {
  for (const c of ["token", "access_token", "refresh_token", "GMAIL_REFRESH", "client_secret", "password", "passwd", "api_key", "key", "batch_key", "private_key", "session_cookie"]) {
    assert.equal(isSecretColumn(c), true, c);
  }
  for (const c of ["id", "name", "email", "company", "summary", "linkedin_url", "why_line", "status"]) {
    assert.equal(isSecretColumn(c), false, c);
  }
});

test("maskRow hides values but keeps nulls", () => {
  assert.deepEqual(maskRow({ id: 1, token: "abc", api_key: null, name: "x" }), { id: 1, token: MASK, api_key: null, name: "x" });
});

test("browse query masks in SQL, never searches or sorts by secret columns", () => {
  const b = browseQuery({
    table: "scout_watchlist",
    columns: [{ name: "id", type: "integer" }, { name: "company", type: "text" }, { name: "token", type: "text" }, { name: "stats", type: "jsonb" }],
    sort: "token", dir: "asc", search: "50%_off", limit: 50, offset: 100,
  });
  assert.deepEqual(b.masked, ["token"]);
  assert.deepEqual(b.searchable, ["company", "stats"]);
  assert.equal(b.sort, "id");
  assert.match(b.text, /CASE WHEN "token" IS NULL THEN NULL ELSE '.+' END AS "token"/);
  assert.doesNotMatch(b.text, /"token"::text ILIKE/);
  assert.match(b.text, /FROM public\."scout_watchlist" WHERE "company"::text ILIKE \$1 OR "stats"::text ILIKE \$1 ORDER BY "id" ASC NULLS LAST LIMIT 50 OFFSET 100$/);
  assert.deepEqual(b.params, ["%50\\%\\_off%"]);
});

test("browse query clamps limits and ignores unknown sort columns", () => {
  const b = browseQuery({ table: 'we"ird', columns: [{ name: "a", type: "integer" }], sort: "a; drop table x", limit: 10_000, offset: -5 });
  assert.equal(b.sort, null);
  assert.match(b.text, /FROM public\."we""ird" LIMIT 200 OFFSET 0$/);
  const none = browseQuery({ table: "t", columns: [{ name: "a", type: "integer" }], search: "x", limit: 10, offset: 0 });
  assert.match(none.text, /WHERE FALSE/);
});

test("helpers", () => {
  assert.equal(quoteIdent('a"b'), '"a""b"');
  assert.equal(likePattern("  "), null);
  assert.equal(likePattern("a\\b"), "%a\\\\b%");
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("data:text/html,x"), null);
  assert.equal(safeHref("https://jobs.example.com/1"), "https://jobs.example.com/1");
  assert.equal(safeHref(null), null);
});
