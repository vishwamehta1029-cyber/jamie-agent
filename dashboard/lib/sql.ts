/** Quote an identifier that was already checked against information_schema. */
export function quoteIdent(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/** ILIKE pattern for a user search term, with %, _ and backslash escaped. Null for an empty term. */
export function likePattern(term: string | undefined | null): string | null {
  const t = (term ?? "").trim().slice(0, 200);
  if (!t) return null;
  return `%${t.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

/** Only http(s) links are rendered as links (no javascript: or data: URLs from the database). */
export function safeHref(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function pageNumber(v: unknown): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 && n < 100000 ? n : 1;
}

export function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  const s = Array.isArray(v) ? v[0] : v;
  return (allowed as readonly string[]).includes(String(s)) ? (s as T) : fallback;
}

export function str(v: unknown): string {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" ? s.slice(0, 200) : "";
}
