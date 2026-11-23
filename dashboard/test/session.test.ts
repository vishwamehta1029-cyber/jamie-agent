import { test } from "node:test";
import assert from "node:assert/strict";
import { SESSION_TTL_SECONDS, secretUsable, sessionKeyMaterial, signSession, verifySession } from "../lib/session.ts";
import { passwordMatches, loginLocked, noteLoginFailure, noteLoginSuccess } from "../lib/password.ts";

const KEY = sessionKeyMaterial("x".repeat(40), "correct horse");

test("a freshly signed session verifies", async () => {
  const t = await signSession(KEY);
  assert.match(t, /^v1\.\d+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(await verifySession(t, KEY), true);
});

test("expires after 7 days", async () => {
  const now = Date.UTC(2026, 10, 23);
  const t = await signSession(KEY, now);
  assert.equal(await verifySession(t, KEY, now + (SESSION_TTL_SECONDS - 60) * 1000), true);
  assert.equal(await verifySession(t, KEY, now + (SESSION_TTL_SECONDS + 1) * 1000), false);
});

test("a wrong secret or a changed password rejects the cookie", async () => {
  const t = await signSession(KEY);
  assert.equal(await verifySession(t, sessionKeyMaterial("y".repeat(40), "correct horse")), false);
  assert.equal(await verifySession(t, sessionKeyMaterial("x".repeat(40), "new password")), false);
});

test("tampering with any part fails", async () => {
  const t = await signSession(KEY);
  const [v, exp, nonce, sig] = t.split(".");
  assert.equal(await verifySession(`${v}.${Number(exp) + 60}.${nonce}.${sig}`, KEY), false);
  assert.equal(await verifySession(`${v}.${exp}.${nonce}x.${sig}`, KEY), false);
  const flipped = sig.slice(0, -2) + (sig.at(-2) === "A" ? "B" : "A") + sig.at(-1);
  assert.equal(await verifySession(`${v}.${exp}.${nonce}.${flipped}`, KEY), false);
  assert.equal(await verifySession(`v2.${exp}.${nonce}.${sig}`, KEY), false);
  for (const bad of ["", "garbage", "v1.1.2", "v1.abc.n.s", `v1.${exp}.${nonce}.!!!`, null, undefined]) {
    assert.equal(await verifySession(bad as any, KEY), false);
  }
});

test("a far-future expiry is refused even if it were signed", async () => {
  const now = Date.now();
  const t = await signSession(KEY, now + 30 * 24 * 3600 * 1000);
  assert.equal(await verifySession(t, KEY, now), false);
});

test("short secrets are not usable", () => {
  assert.equal(secretUsable("short"), false);
  assert.equal(secretUsable(undefined), false);
  assert.equal(secretUsable("z".repeat(32)), true);
});

test("password compare", () => {
  assert.equal(passwordMatches("correct horse", "correct horse"), true);
  assert.equal(passwordMatches("correct hors", "correct horse"), false);
  assert.equal(passwordMatches("", "correct horse"), false);
  assert.equal(passwordMatches(null, "correct horse"), false);
  assert.equal(passwordMatches("anything", ""), false);
  assert.equal(passwordMatches("anything", undefined), false);
});

test("five failures lock an address for 15 minutes", () => {
  const ip = "203.0.113.9";
  const now = 1_000_000;
  for (let i = 0; i < 4; i++) noteLoginFailure(ip, now + i);
  assert.equal(loginLocked(ip, now + 10), 0);
  noteLoginFailure(ip, now + 20);
  assert.ok(loginLocked(ip, now + 30) > 0);
  assert.equal(loginLocked(ip, now + 20 + 15 * 60 * 1000 + 1), 0);
  noteLoginSuccess(ip);
  assert.equal(loginLocked(ip, now), 0);
});
