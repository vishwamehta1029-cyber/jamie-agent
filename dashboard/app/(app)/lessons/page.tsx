import Link from "next/link";
import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { section } from "@/lib/db";
import { fmtDate, fmtNum } from "@/lib/format";
import { likePattern, str } from "@/lib/sql";
import { ErrorBox, hrefWith } from "@/components/ui";

export const metadata: Metadata = { title: "Lessons and handoffs" };
export const dynamic = "force-dynamic";

export default async function Lessons({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAuth();
  const sp = await searchParams;
  const topic = str(sp.topic);
  const q = str(sp.q);

  const topics = await section((run) =>
    run<{ topic: string; n: number; last: string }>("SELECT topic, count(*)::int n, max(created_at) last FROM lessons GROUP BY topic ORDER BY max(created_at) DESC")
  );
  const lessons = await section((run) =>
    run(
      `SELECT id, topic, lesson, source, created_at FROM lessons
       WHERE ($1::text = '' OR topic = $1) AND ($2::text IS NULL OR lesson ILIKE $2 OR topic ILIKE $2 OR source ILIKE $2)
       ORDER BY created_at DESC, id DESC LIMIT 100`,
      [topic, likePattern(q)]
    )
  );
  const handoffs = await section((run) => run("SELECT id, platform, summary, next_steps, open_items, created_at FROM handoffs ORDER BY created_at DESC, id DESC LIMIT 25"));
  const total = (topics.data ?? []).reduce((s, r) => s + r.n, 0);

  return (
    <>
      <div className="page-head">
        <h1>Lessons and handoffs</h1>
        <div className="muted">What Jamie learned, newest first, and the notes each session left for the next.</div>
      </div>
      <div className="grid grid-2">
        <section className="card">
          <div className="section-title"><h2>Lessons</h2><span className="faint">{fmtNum(total)} total</span></div>
          <ErrorBox error={topics.error ?? lessons.error} />
          <div className="chips" aria-label="Topics">
            <Link href={hrefWith("/lessons", { q })} className={`chip ${!topic ? "active" : ""}`}>all</Link>
            {(topics.data ?? []).map((t) => (
              <Link key={t.topic} href={hrefWith("/lessons", { q, topic: t.topic })} className={`chip ${topic === t.topic ? "active" : ""}`}>{t.topic} {t.n}</Link>
            ))}
          </div>
          <form className="filters" method="get" action="/lessons">
            {topic ? <input type="hidden" name="topic" value={topic} /> : null}
            <input type="search" name="q" defaultValue={q} placeholder="Search lessons" aria-label="Search lessons" />
            <button className="btn" type="submit">Search</button>
          </form>
          <ul className="list">
            {(lessons.data ?? []).map((l: any) => (
              <li key={l.id}>
                <div className="faint"><span className="badge info">{l.topic}</span> {fmtDate(l.created_at)}{l.source ? ` · ${l.source}` : ""}</div>
                <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{l.lesson}</div>
              </li>
            ))}
            {lessons.data && !lessons.data.length ? <li className="muted">No lessons match.</li> : null}
          </ul>
          {lessons.data?.length === 100 ? <p className="faint">Showing the newest 100. Use the Database page for the rest.</p> : null}
        </section>
        <section className="card">
          <h2>Recent handoffs</h2>
          <ErrorBox error={handoffs.error} />
          <ul className="list">
            {(handoffs.data ?? []).map((h: any) => (
              <li key={h.id}>
                <div className="faint"><span className="badge">{h.platform}</span> {fmtDate(h.created_at)}</div>
                <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{h.summary}</div>
                {h.next_steps ? <div style={{ whiteSpace: "pre-wrap", marginTop: 6 }}><strong>Next:</strong> {h.next_steps}</div> : null}
                {h.open_items ? (
                  <details style={{ marginTop: 6 }}>
                    <summary className="faint">Open items</summary>
                    <pre className="email">{JSON.stringify(h.open_items, null, 2)}</pre>
                  </details>
                ) : null}
              </li>
            ))}
            {handoffs.data && !handoffs.data.length ? <li className="muted">No handoffs yet.</li> : null}
          </ul>
        </section>
      </div>
    </>
  );
}
