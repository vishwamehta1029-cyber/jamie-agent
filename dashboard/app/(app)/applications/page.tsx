import Link from "next/link";
import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { section } from "@/lib/db";
import { fmtDate, fmtNum, truncate } from "@/lib/format";
import { likePattern, pageNumber, pick, str } from "@/lib/sql";
import { Badge, ErrorBox, Ext, Pager, SortTh, hrefWith } from "@/components/ui";

export const metadata: Metadata = { title: "Applications" };
export const dynamic = "force-dynamic";

const PAGE = 50;
const PATH = "/applications";
const SORT = { updated: "a.updated_at", submitted: "a.submitted_at", created: "a.created_at", company: "lower(a.company)", status: "a.status" } as const;

export default async function Applications({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAuth();
  const sp = await searchParams;
  const q = str(sp.q);
  const status = str(sp.status) || "all";
  const sort = pick(sp.sort, Object.keys(SORT) as (keyof typeof SORT)[], "updated");
  const dir = pick(sp.dir, ["asc", "desc"] as const, "desc");
  const page = pageNumber(sp.page);
  const params = { q, status, sort, dir };

  const counts = await section((run) => run<{ status: string; n: number }>("SELECT status, count(*)::int n FROM applications GROUP BY 1 ORDER BY 2 DESC"));
  const all = (counts.data ?? []).reduce((s, r) => s + r.n, 0);

  const res = await section((run) =>
    run(
      `SELECT a.id, a.company, a.role, a.url, a.location, a.ats, a.tier, a.status, a.source, a.resume_used, a.autopilot,
         a.handoff_reason, a.notes, a.submitted_at, a.updated_at, count(*) OVER ()::int AS total
       FROM applications a
       WHERE ($1::text IS NULL OR a.company ILIKE $1 OR a.role ILIKE $1 OR a.location ILIKE $1 OR a.notes ILIKE $1 OR a.handoff_reason ILIKE $1)
         AND ($2::text = 'all' OR a.status = $2)
       ORDER BY ${SORT[sort]} ${dir === "asc" ? "ASC" : "DESC"} NULLS LAST, a.id DESC
       LIMIT $3 OFFSET $4`,
      [likePattern(q), status, PAGE, (page - 1) * PAGE]
    )
  );
  const rows = res.data ?? [];
  const total = rows[0]?.total ?? 0;

  return (
    <>
      <div className="page-head">
        <h1>Applications</h1>
        <div className="muted">Everything Administrator and Vishwa logged in the applications table.</div>
      </div>
      <div className="chips" aria-label="Status">
        <Link href={hrefWith(PATH, { ...params, status: "all", page: 1 })} className={`chip ${status === "all" ? "active" : ""}`}>all {fmtNum(all)}</Link>
        {(counts.data ?? []).map((r) => (
          <Link key={r.status} href={hrefWith(PATH, { ...params, status: r.status, page: 1 })} className={`chip ${status === r.status ? "active" : ""}`}>
            {r.status.replace(/_/g, " ")} {fmtNum(r.n)}
          </Link>
        ))}
      </div>
      <form className="filters" method="get" action={PATH}>
        <input type="hidden" name="status" value={status} />
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
        <input type="search" name="q" defaultValue={q} placeholder="Search company, role, location, notes" aria-label="Search applications" />
        <button className="btn" type="submit">Search</button>
        {q ? <Link className="btn secondary" href={hrefWith(PATH, { ...params, q: "" })}>Clear</Link> : null}
      </form>
      <ErrorBox error={res.error ?? counts.error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortTh path={PATH} params={params} col="company" label="Company" sort={sort} dir={dir} />
              <th>Role</th>
              <SortTh path={PATH} params={params} col="status" label="Status" sort={sort} dir={dir} />
              <th>Details</th>
              <SortTh path={PATH} params={params} col="submitted" label="Submitted" sort={sort} dir={dir} />
              <SortTh path={PATH} params={params} col="updated" label="Updated" sort={sort} dir={dir} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id}>
                <td><strong>{r.company}</strong>{r.location ? <div className="faint">{r.location}</div> : null}</td>
                <td className="wide">{r.url ? <Ext href={r.url}>{r.role}</Ext> : r.role}<div className="faint">{[r.tier, r.ats, r.source, r.autopilot ? "autopilot" : null].filter(Boolean).join(" · ")}</div></td>
                <td><Badge value={r.status} /></td>
                <td className="wide">
                  {r.handoff_reason ? <div><strong>Handoff:</strong> {r.handoff_reason}</div> : null}
                  {r.resume_used ? <div className="faint">Resume: {r.resume_used}</div> : null}
                  {r.notes ? <div className="faint" title={r.notes}>{truncate(r.notes, 160)}</div> : null}
                </td>
                <td className="nowrap">{fmtDate(r.submitted_at)}</td>
                <td className="nowrap">{fmtDate(r.updated_at)}</td>
              </tr>
            ))}
            {!rows.length && !res.error ? <tr><td colSpan={6} className="muted">No applications match.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Pager path={PATH} params={params} page={page} pageSize={PAGE} total={total} />
    </>
  );
}
