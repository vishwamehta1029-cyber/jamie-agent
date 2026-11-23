import Link from "next/link";
import { safeHref } from "@/lib/sql";
import { fmtNum } from "@/lib/format";

export type Params = Record<string, string | number | undefined | null>;

export function hrefWith(path: string, params: Params, changes: Params = {}): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...changes })) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `${path}?${s}` : path;
}

export function Stat({ label, today, week, hint }: { label: string; today: unknown; week?: unknown; hint?: string }) {
  return (
    <div className="stat" title={hint}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{fmtNum(today)}</div>
      {week !== undefined ? <div className="stat-sub">{fmtNum(week)} in 7 days</div> : null}
    </div>
  );
}

const TONE: Record<string, string> = {
  submitted: "good", sent: "good", shortlisted: "good", applied: "good", replied: "good", interviewing: "good", offer: "good", done: "good", confirmed: "good",
  handoff: "warn", in_progress: "info", sending: "info", new: "info", awaiting_approval: "warn", retry: "warn", no_verified_email: "warn", saved: "info", guessed: "warn",
  failed: "bad", blocked: "bad", bounced: "bad", rejected: "bad", dead_end: "bad", wrong: "bad", expired: "bad",
};

export function Badge({ value }: { value: unknown }) {
  if (value == null || value === "") return null;
  const v = String(value);
  return <span className={`badge ${TONE[v] ?? ""}`}>{v.replace(/_/g, " ")}</span>;
}

export function Ext({ href, children }: { href: unknown; children?: React.ReactNode }) {
  const h = safeHref(href);
  if (!h) return <>{children ?? null}</>;
  return <a href={h} target="_blank" rel="noopener noreferrer nofollow">{children ?? "link"}</a>;
}

export function ErrorBox({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return <div className="error">Could not load this part: {error}</div>;
}

export function Pager({ path, params, page, pageSize, total }: { path: string; params: Params; page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="pager">
      <span className="muted">{total ? `${fmtNum(from)} to ${fmtNum(to)} of ${fmtNum(total)}` : "No rows"}</span>
      <span className="links">
        {page > 1 ? <Link href={hrefWith(path, params, { page: page - 1 })}>Previous</Link> : <span className="disabled">Previous</span>}
        <span className="muted" style={{ padding: "5px 4px" }}>Page {page} of {pages}</span>
        {page < pages ? <Link href={hrefWith(path, params, { page: page + 1 })}>Next</Link> : <span className="disabled">Next</span>}
      </span>
    </div>
  );
}

/** Column header that sorts by this column; clicking again flips the direction. */
export function SortTh({ path, params, col, label, sort, dir, className }: { path: string; params: Params; col: string; label: string; sort: string; dir: string; className?: string }) {
  const active = sort === col;
  const next = active && dir === "desc" ? "asc" : "desc";
  return (
    <th className={className} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={hrefWith(path, params, { sort: col, dir: next, page: 1 })}>
        {label}{active ? (dir === "asc" ? " ↑" : " ↓") : ""}
      </Link>
    </th>
  );
}
