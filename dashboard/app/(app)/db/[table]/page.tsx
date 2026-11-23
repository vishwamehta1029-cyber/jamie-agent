import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { section } from "@/lib/db";
import { browseQuery, type Column } from "@/lib/browse";
import { MASK, maskRow } from "@/lib/mask";
import { cellText, fmtNum } from "@/lib/format";
import { pageNumber, pick, str } from "@/lib/sql";
import { ErrorBox, Pager, hrefWith } from "@/components/ui";

export const metadata: Metadata = { title: "Table" };
export const dynamic = "force-dynamic";

const PAGE = 50;

export default async function TablePage({ params, searchParams }: {
  params: Promise<{ table: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAuth();
  const { table: raw } = await params;
  const sp = await searchParams;
  let table = raw;
  try { table = decodeURIComponent(raw); } catch { notFound(); }
  const q = str(sp.q);
  const dir = pick(sp.dir, ["asc", "desc"] as const, "desc");
  const page = pageNumber(sp.page);

  const res = await section(async (run) => {
    const columns = (await run<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [table]
    )).map((c): Column => ({ name: c.column_name, type: c.data_type }));
    const exists = await run("SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = $1", [table]);
    if (!exists.length || !columns.length) return null;
    const b = browseQuery({ table, columns, sort: str(sp.sort) || null, dir, search: q, limit: PAGE, offset: (page - 1) * PAGE });
    const [count] = await run<{ n: string }>(b.countText, b.params);
    const rows = (await run(b.text, b.params)).map(maskRow);
    return { columns, rows, total: Number(count?.n ?? 0), b };
  });
  if (res.data === null && !res.error) notFound();
  const d = res.data;
  const sort = d?.b.sort ?? "";
  const pathname = `/db/${encodeURIComponent(table)}`;
  const linkParams = { q, sort, dir };

  return (
    <>
      <div className="page-head">
        <div className="faint"><Link href="/db">Database</Link> / Table</div>
        <h1 className="mono" style={{ fontSize: "1.3rem" }}>{table}</h1>
        {d ? <div className="muted">{fmtNum(d.total)} rows{q ? ` matching "${q}"` : ""}{d.b.masked.length ? ` · hidden columns: ${d.b.masked.join(", ")}` : ""}</div> : null}
      </div>
      <form className="filters" method="get" action={pathname}>
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
        <input type="search" name="q" defaultValue={q} placeholder={d?.b.searchable.length ? `Search ${d.b.searchable.length} text columns` : "No searchable columns"} aria-label="Search rows" />
        <button className="btn" type="submit">Search</button>
        {q ? <Link className="btn secondary" href={hrefWith(pathname, { sort, dir })}>Clear</Link> : null}
      </form>
      <ErrorBox error={res.error} />
      {d ? (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {d.columns.map((c) => {
                    const hidden = d.b.masked.includes(c.name);
                    const active = sort === c.name;
                    return (
                      <th key={c.name} title={c.type}>
                        {hidden ? <span>{c.name}</span> : (
                          <Link href={hrefWith(pathname, linkParams, { sort: c.name, dir: active && dir === "desc" ? "asc" : "desc", page: 1 })}>
                            {c.name}{active ? (dir === "asc" ? " ↑" : " ↓") : ""}
                          </Link>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r: any, i: number) => (
                  <tr key={i}>
                    {d.columns.map((c) => <Cell key={c.name} v={r[c.name]} />)}
                  </tr>
                ))}
                {!d.rows.length ? <tr><td colSpan={d.columns.length} className="muted">No rows.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <Pager path={pathname} params={linkParams} page={page} pageSize={PAGE} total={d.total} />
        </>
      ) : null}
    </>
  );
}

function Cell({ v }: { v: unknown }) {
  if (v === null || v === undefined) return <td className="cell-null">null</td>;
  if (v === MASK) return <td className="cell-masked">{MASK}</td>;
  const s = cellText(v);
  if (s.length <= 220) return <td><div className="cell">{s}</div></td>;
  return (
    <td>
      <details>
        <summary><span className="cell">{s.slice(0, 160)}…</span></summary>
        <div className="cell">{s}</div>
      </details>
    </td>
  );
}
