import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time password check. Both sides are hashed first so their lengths never leak. */
export function passwordMatches(given: unknown, expected: string | undefined | null): boolean {
  if (typeof expected !== "string" || expected.length === 0) return false;
  const a = createHash("sha256").update(typeof given === "string" ? given : "").digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b) && typeof given === "string";
}

// Failed-login limiter. In memory, so it is per server instance: on Vercel it slows guessing rather than
// guaranteeing a global limit. Every failure also waits about a second before answering.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const fails = new Map<string, { n: number; first: number; until: number }>();

export function loginLocked(ip: string, now: number = Date.now()): number {
  const f = fails.get(ip);
  if (!f) return 0;
  if (f.until > now) return f.until - now;
  if (now - f.first > WINDOW_MS) fails.delete(ip);
  return 0;
}

export function noteLoginFailure(ip: string, now: number = Date.now()): void {
  if (fails.size > 5000) fails.clear();
  const f = fails.get(ip);
  if (!f || now - f.first > WINDOW_MS) {
    fails.set(ip, { n: 1, first: now, until: 0 });
    return;
  }
  f.n++;
  if (f.n >= MAX_FAILS) f.until = now + LOCK_MS;
}

export function noteLoginSuccess(ip: string): void {
  fails.delete(ip);
}

export function failureDelayMs(): number {
  return 900 + Math.floor(Math.random() * 400);
}
