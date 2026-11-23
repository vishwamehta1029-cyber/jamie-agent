import Link from "next/link";
import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { section } from "@/lib/db";
import { fmtNum } from "@/lib/format";
import { quoteIdent } from "@/lib/sql";
import { ErrorBox } from "@/components/ui";

export const metadata: Metadata = { title: "Database" };
export const dynamic = "force-dynamic";

export default async function Tables() {
  await requireAuth();
  const res = await section(async (q) => {
    const tables = await q<{ table_name: string; columns: number }>(
      `SELECT t.table_name, (SELECT count(*)::int FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = t.table_name) AS columns
       FROM information_schema.tables t WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE' ORDER BY t.table_name`
    );
    if (!tables.length) return [];
    // Exact counts in one statement; names come from information_schema and are quoted.
    const counts = await q<{ t: string; n: string }>(
      tables.map((t, i) => `SELECT $${i + 1}::text AS t, count(*)::bigint AS n FROM public.${quoteIdent(t.table_name)}`).join(" UNION ALL "),
      tables.map((t) => t.table_name)
    );
    const n = new Map(counts.map((c) => [c.t, Number(c.n)]));
    return tables.map((t) => ({ ...t, rows: n.get(t.table_name) ?? 0 }));
  });
  const total = (res.data ?? []).reduce((s, t) => s + t.rows, 0);
  return (
    <>
      <div className="page-head">
        <h1>Database</h1>
        <div className="muted">Every table in the public schema. Columns whose names look secret (token, secret, password, key, refresh) are hidden.</div>
      </div>
      <ErrorBox error={res.error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Table</th><th className="num">Rows</th><th className="num">Columns</th></tr></thead>
          <tbody>
            {(res.data ?? []).map((t) => (
              <tr key={t.table_name}>
                <td><Link href={`/db/${encodeURIComponent(t.table_name)}`} className="mono">{t.table_name}</Link></td>
                <td className="num">{fmtNum(t.rows)}</td>
                <td className="num">{t.columns}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {res.data ? <p className="faint">{res.data.length} tables, {fmtNum(total)} rows.</p> : null}
    </>
  );
}
