"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authConfig } from "@/lib/auth";
import { failureDelayMs, loginLocked, noteLoginFailure, noteLoginSuccess, passwordMatches } from "@/lib/password";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/session";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Only same-site paths, never "//host" or "/\host". */
function safeFrom(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") && !s.startsWith("/login") && s.length < 300 ? s : "/";
}

function back(code: string, from: string): never {
  redirect(`/login?e=${code}${from !== "/" ? `&from=${encodeURIComponent(from)}` : ""}`);
}

export async function login(formData: FormData): Promise<void> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  const from = safeFrom(formData.get("from"));
  const cfg = authConfig();
  if (!cfg.ok) {
    await sleep(failureDelayMs());
    back("config", from);
  }
  if (loginLocked(ip) > 0) {
    await sleep(failureDelayMs());
    back("locked", from);
  }
  if (!passwordMatches(formData.get("password"), process.env.DASHBOARD_PASSWORD)) {
    noteLoginFailure(ip);
    await sleep(failureDelayMs());
    back(loginLocked(ip) > 0 ? "locked" : "bad", from);
  }
  noteLoginSuccess(ip);
  (await cookies()).set(SESSION_COOKIE, await signSession(cfg.material), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  redirect(from);
}

export async function logout(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  redirect("/login");
}
