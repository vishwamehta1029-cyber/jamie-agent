// Columns whose names look like they hold a secret are masked entirely in the database browser.
// The value is replaced inside the SQL itself, so it never leaves the database.
export const SECRET_COLUMN = /(token|secret|passw(or)?d|pwd|key|refresh|credential|private|cookie|session)/i;
export const MASK = "•••••• (hidden)";

export function isSecretColumn(name: string): boolean {
  return SECRET_COLUMN.test(name);
}

/** Masks secret-looking fields in an already fetched row (a second line of defence). */
export function maskRow<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = isSecretColumn(k) ? (v == null ? null : MASK) : v;
  return out as T;
}
