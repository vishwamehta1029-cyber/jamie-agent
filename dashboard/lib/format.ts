const TZ = "America/Los_Angeles";

export function fmtDate(v: unknown, withTime = true): string {
  if (v == null || v === "") return "";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("en-US", {
    timeZone: TZ, month: "short", day: "numeric", year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

export function fmtNum(v: unknown): string {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toLocaleString("en-US") : String(v);
}

/** Text for one database cell in the browser. */
export function cellText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export const TODAY_SQL = "(date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'America/Los_Angeles')";
