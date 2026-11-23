import Link from "next/link";
import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { section } from "@/lib/db";
import { fmtDate, fmtNum, truncate } from "@/lib/format";
import { likePattern, pageNumber, pick, str } from "@/lib/sql";
import { Badge, ErrorBox, Ext, Pager, SortTh, hrefWith } from "@/components/ui";

export const metadata: Metadata = { title: "Entrepreneur" };
export const dynamic = "force-dynamic";

const PAGE = 50;
const PATH = "/entrepreneur";

const COMPANY_SORT = {
  discovered: "c.discovered_at", name: "lower(c.name)", batch: "c.batch_key", team: "c.team_size", founders: "founders", location: "lower(c.location)",
} as const;
const COMPANY_FILTERS = ["all", "contacted", "not_contacted", "no_founders", "founders_error"] as const;

const FOUNDER_SORT = {
  updated: "f.updated_at", contacted: "f.contacted_at", name: "lower(f.name)", company: "lower(c.name)", status: "f.email_status", created: "f.created_at",
} as const;
const FOUNDER_STATUS = ["all", "new", "sending", "sent", "no_verified_email", "blocked", "bounced", "replied"] as const;

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function EntrepreneurPage({ searchParams }: { searchParams: SP }) {
  await requireAuth();
  const sp = await searchParams;
  const tab = pick(sp.tab, ["companies", "founders"] as const, "companies");
  return (
    <>
      <div className="page-head">
        <h1>Entrepreneur</h1>
        <div className="muted">US YC startups building agents, their founders, and the coffee-chat emails.</div>
      </div>
      <nav className="tabs" aria-label="Entrepreneur views">
        <Link href="/entrepreneur?tab=companies" className={tab === "companies" ? "active" : ""}>Companies</Link>
        <Link href="/entrepreneur?tab=founders" className={tab === "founders" ? "active" : ""}>Founders</Link>
      </nav>
      {tab === "companies" ? <Companies sp={sp} /> : <Founders sp={sp} />}
    </>
  );
}

async function Companies({ sp }: { sp: Awaited<SP> }) {
  const q = str(sp.q);
  const status = pick(sp.status, COMPANY_FILTERS, "all");
  const sort = pick(sp.sort, Object.keys(COMPANY_SORT) as (keyof typeof COMPANY_SORT)[], "discovered");
  const dir = pick(sp.dir, ["asc", "desc"] as const, "desc");
  const page = pageNumber(sp.page);
  const params = { tab: "companies", q, status, sort, dir };

  const res = await section((run) =>
    run(
      `SELECT c.id, c.name, c.batch, c.one_liner, c.location, c.team_size, c.discovered_at, c.yc_url, c.website, c.founders_error,
         (SELECT count(*)::int FROM ent_founders f WHERE f.company_id = c.id) AS founders,
         (SELECT count(*)::int FROM ent_founders f WHERE f.company_id = c.id AND f.contacted_at IS NOT NULL) AS contacted,
         count(*) OVER ()::int AS total
       FROM ent_companies c
       WHERE ($1::text IS NULL OR c.name ILIKE $1 OR c.one_liner ILIKE $1 OR c.location ILIKE $1 OR c.batch ILIKE $1 OR c.domain ILIKE $1)
         AND CASE $2::text
           WHEN 'contacted' THEN EXISTS (SELECT 1 FROM ent_founders f WHERE f.company_id = c.id AND f.contacted_at IS NOT NULL)
           WHEN 'not_contacted' THEN NOT EXISTS (SELECT 1 FROM ent_founders f WHERE f.company_id = c.id AND f.contacted_at IS NOT NULL)
           WHEN 'no_founders' THEN NOT EXISTS (SELECT 1 FROM ent_founders f WHERE f.company_id = c.id)
           WHEN 'founders_error' THEN c.founders_error IS NOT NULL
           ELSE TRUE END
       ORDER BY ${COMPANY_SORT[sort]} ${dir === "asc" ? "ASC" : "DESC"} NULLS LAST, c.id DESC
       LIMIT $3 OFFSET $4`,
      [likePattern(q), status, PAGE, (page - 1) * PAGE]
    )
  );
  const rows = res.data ?? [];
  const total = rows[0]?.total ?? 0;

  return (
    <>
      <form className="filters" method="get" action={PATH}>
        <input type="hidden" name="tab" value="companies" />
        <input type="search" name="q" defaultValue={q} placeholder="Search name, one-liner, location, batch" aria-label="Search companies" />
        <select name="status" defaultValue={status} aria-label="Filter">
          <option value="all">All companies</option>
          <option value="contacted">At least one founder emailed</option>
          <option value="not_contacted">No founder emailed yet</option>
          <option value="no_founders">No founders saved</option>
          <option value="founders_error">Founder fetch error</option>
        </select>
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
        <button className="btn" type="submit">Apply</button>
        {q || status !== "all" ? <Link className="btn secondary" href="/entrepreneur?tab=companies">Clear</Link> : null}
      </form>
      <ErrorBox error={res.error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortTh path={PATH} params={params} col="name" label="Company" sort={sort} dir={dir} />
              <SortTh path={PATH} params={params} col="batch" label="Batch" sort={sort} dir={dir} />
              <th>One-liner</th>
              <SortTh path={PATH} params={params} col="location" label="Location" sort={sort} dir={dir} />
              <SortTh path={PATH} params={params} col="team" label="Team" sort={sort} dir={dir} className="num" />
              <SortTh path={PATH} params={params} col="founders" label="Founders" sort={sort} dir={dir} className="num" />
              <SortTh path={PATH} params={params} col="discovered" label="Discovered" sort={sort} dir={dir} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id}>
                <td><Link href={`/entrepreneur/${r.id}`}><strong>{r.name}</strong></Link>{r.founders_error ? <div className="faint">{truncate(r.founders_error, 80)}</div> : null}</td>
                <td className="nowrap">{r.batch}</td>
                <td className="wide">{r.one_liner}</td>
                <td>{r.location}</td>
                <td className="num">{r.team_size ?? ""}</td>
                <td className="num">{r.founders}{r.contacted ? <div className="faint">{r.contacted} emailed</div> : null}</td>
                <td className="nowrap">{fmtDate(r.discovered_at, false)}</td>
              </tr>
            ))}
            {!rows.length && !res.error ? <tr><td colSpan={7} className="muted">No companies match.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Pager path={PATH} params={params} page={page} pageSize={PAGE} total={total} />
    </>
  );
}

async function Founders({ sp }: { sp: Awaited<SP> }) {
  const q = str(sp.q);
  const status = pick(sp.status, FOUNDER_STATUS, "all");
  const sort = pick(sp.sort, Object.keys(FOUNDER_SORT) as (keyof typeof FOUNDER_SORT)[], "updated");
  const dir = pick(sp.dir, ["asc", "desc"] as const, "desc");
  const page = pageNumber(sp.page);
  const params = { tab: "founders", q, status, sort, dir };

  const counts = await section((run) => run<{ email_status: string; n: number }>("SELECT email_status, count(*)::int n FROM ent_founders GROUP BY 1"));
  const byStatus = new Map((counts.data ?? []).map((r) => [r.email_status, r.n]));
  const all = (counts.data ?? []).reduce((s, r) => s + r.n, 0);

  const res = await section((run) =>
    run(
      `SELECT f.id, f.name, f.title, f.email_status, f.status_reason, f.email_source, f.email_verified, f.why_line, f.contacted_at, f.linkedin_url,
         c.id AS company_id, c.name AS company, c.batch, count(*) OVER ()::int AS total
       FROM ent_founders f JOIN ent_companies c ON c.id = f.company_id
       WHERE ($1::text IS NULL OR f.name ILIKE $1 OR c.name ILIKE $1 OR f.title ILIKE $1 OR f.email ILIKE $1 OR f.why_line ILIKE $1)
         AND ($2::text = 'all' OR f.email_status = $2)
       ORDER BY ${FOUNDER_SORT[sort]} ${dir === "asc" ? "ASC" : "DESC"} NULLS LAST, f.id DESC
       LIMIT $3 OFFSET $4`,
      [likePattern(q), status, PAGE, (page - 1) * PAGE]
    )
  );
  const rows = res.data ?? [];
  const total = rows[0]?.total ?? 0;

  return (
    <>
      <div className="chips" aria-label="Email status">
        {FOUNDER_STATUS.map((s) => (
          <Link key={s} href={hrefWith(PATH, { ...params, status: s, page: 1 })} className={`chip ${status === s ? "active" : ""}`}>
            {s.replace(/_/g, " ")} {fmtNum(s === "all" ? all : byStatus.get(s) ?? 0)}
          </Link>
        ))}
      </div>
      <form className="filters" method="get" action={PATH}>
        <input type="hidden" name="tab" value="founders" />
        <input type="hidden" name="status" value={status} />
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
        <input type="search" name="q" defaultValue={q} placeholder="Search name, company, title, email, why line" aria-label="Search founders" />
        <button className="btn" type="submit">Search</button>
        {q ? <Link className="btn secondary" href={hrefWith(PATH, { ...params, q: "" })}>Clear</Link> : null}
      </form>
      <ErrorBox error={res.error ?? counts.error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortTh path={PATH} params={params} col="name" label="Founder" sort={sort} dir={dir} />
              <SortTh path={PATH} params={params} col="company" label="Company" sort={sort} dir={dir} />
              <SortTh path={PATH} params={params} col="status" label="Email status" sort={sort} dir={dir} />
              <th>Source</th>
              <th>Why line</th>
              <SortTh path={PATH} params={params} col="contacted" label="Contacted" sort={sort} dir={dir} />
              <th>LinkedIn</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id}>
                <td><strong>{r.name}</strong>{r.title ? <div className="faint">{r.title}</div> : null}</td>
                <td><Link href={`/entrepreneur/${r.company_id}`}>{r.company}</Link>{r.batch ? <div className="faint">{r.batch}</div> : null}</td>
                <td><Badge value={r.email_status} />{r.status_reason ? <div className="faint">{truncate(r.status_reason, 90)}</div> : null}</td>
                <td>{r.email_source ?? ""}{r.email_verified ? <div className="faint">verified</div> : null}</td>
                <td className="wide">{r.why_line ? `I am really interested in ${r.why_line}` : <span className="faint">not written yet</span>}</td>
                <td className="nowrap">{fmtDate(r.contacted_at)}</td>
                <td>{r.linkedin_url ? <Ext href={r.linkedin_url}>Profile</Ext> : null}</td>
              </tr>
            ))}
            {!rows.length && !res.error ? <tr><td colSpan={7} className="muted">No founders match.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Pager path={PATH} params={params} page={page} pageSize={PAGE} total={total} />
    </>
  );
}
