import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, secretUsable, sessionKeyMaterial, verifySession } from "./session";

export function authConfig(): { ok: true; material: string } | { ok: false; problem: string } {
  const secret = process.env.DASHBOARD_SESSION_SECRET;
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return { ok: false, problem: "DASHBOARD_PASSWORD is not set" };
  if (!secretUsable(secret)) return { ok: false, problem: "DASHBOARD_SESSION_SECRET is missing or shorter than 32 characters" };
  return { ok: true, material: sessionKeyMaterial(secret, password) };
}

/** Second check behind the proxy: every page calls this before reading data. */
export async function requireAuth(): Promise<void> {
  const cfg = authConfig();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cfg.ok || !(await verifySession(token, cfg.material))) redirect("/login");
}
