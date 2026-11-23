import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { runEntrepreneur } from "../src/entrepreneur.js";

export const config = { maxDuration: 60 };

// Vercel Cron calls this with "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set in the project.
function authorized(req: IncomingMessage): boolean {
  const want = process.env.CRON_SECRET;
  const got = String(req.headers.authorization ?? "");
  if (!want || want.length < 16) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(`Bearer ${want}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (!authorized(req)) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: "unauthorized" }));
  }
  try {
    const out = await runEntrepreneur({ trigger: "cron" });
    res.statusCode = 200;
    res.end(JSON.stringify({ ...out, previews: Array.isArray((out as any).previews) ? (out as any).previews.length : undefined }));
  } catch (e: any) {
    console.error(e);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(e?.message ?? "error").slice(0, 300) }));
  }
}
