import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authConfig } from "@/lib/auth";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { login } from "./actions";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  bad: "That password is not right.",
  locked: "Too many tries. Wait 15 minutes and try again.",
  config: "The dashboard is not set up yet: add DASHBOARD_PASSWORD and DASHBOARD_SESSION_SECRET in Vercel, then redeploy.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const cfg = authConfig();
  if (cfg.ok && (await verifySession((await cookies()).get(SESSION_COOKIE)?.value, cfg.material))) redirect("/");
  const e = typeof sp.e === "string" ? sp.e : "";
  const from = typeof sp.from === "string" ? sp.from : "/";
  const msg = MESSAGES[e] ?? (!cfg.ok ? MESSAGES.config : "");
  return (
    <div className="login-wrap">
      <div className="card login">
        <h1>Jamie Dashboard</h1>
        <p className="muted" style={{ margin: 0 }}>Private and read only.</p>
        <form action={login}>
          <input type="hidden" name="from" value={from} />
          <label htmlFor="password" className="faint">Password</label>
          <input id="password" className="input" type="password" name="password" autoComplete="current-password" required autoFocus />
          {msg ? <div className="error" role="alert">{msg}</div> : null}
          <button className="btn" type="submit">Sign in</button>
        </form>
      </div>
    </div>
  );
}
