import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { existingTables, section } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { Badge, ErrorBox, Ext } from "@/components/ui";

export const metadata: Metadata = { title: "Company" };
export const dynamic = "force-dynamic";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) notFound();

  const res = await section(async (q) => {
    const [company] = await q("SELECT * FROM ent_companies WHERE id = $1", [Number(id)]);
    if (!company) return null;
    const founders = await q(
      `SELECT f.id, f.name, f.title, f.linkedin_url, f.twitter_url, f.email, f.email_source, f.email_verified, f.email_lookup_at,
         f.why_line, f.why_source, f.email_status, f.status_reason, f.contact_id, f.send_id, f.contacted_at, f.created_at, f.updated_at
       FROM ent_founders f WHERE f.company_id = $1 ORDER BY f.id`,
      [company.id]
    );
    const sendIds = founders.map((f: any) => f.send_id).filter(Boolean);
    const contactIds = founders.map((f: any) => f.contact_id).filter(Boolean);
    const sends = sendIds.length || contactIds.length
      ? await q(
          `SELECT s.id, s.contact_id, s.to_email, s.subject, s.sent_at, s.bounced, s.bounced_at, s.checked_1h, s.checked_24h
           FROM sends s WHERE s.id = ANY($1::int[]) OR s.contact_id = ANY($2::int[]) ORDER BY s.sent_at`,
          [sendIds, contactIds]
        )
      : [];
    // Postman stores the exact text it sent; Entrepreneur stores only the subject and the why line.
    const has = await existingTables(q);
    const bodies = has.has("postman_people") && sends.length
      ? await q("SELECT send_id, subject, body FROM postman_people WHERE send_id = ANY($1::int[]) AND body IS NOT NULL", [sends.map((s: any) => s.id)])
      : [];
    return { company, founders, sends, bodies };
  });

  if (res.data === null && !res.error) notFound();
  const d = res.data;
  if (!d) return <ErrorBox error={res.error} />;
  const c = d.company;
  const body = new Map(d.bodies.map((b: any) => [b.send_id, b.body]));

  return (
    <>
      <div className="page-head">
        <div className="faint"><Link href="/entrepreneur">Entrepreneur</Link> / Company</div>
        <h1>{c.name}</h1>
        <div className="muted">{c.one_liner}</div>
      </div>

      <div className="grid grid-2">
        <section className="card">
          <h2>Company</h2>
          <dl className="kv">
            <dt>Batch</dt><dd>{c.batch}</dd>
            <dt>Location</dt><dd>{c.location}</dd>
            <dt>Team size</dt><dd>{c.team_size ?? ""}</dd>
            <dt>YC status</dt><dd>{c.status}</dd>
            <dt>Website</dt><dd><Ext href={c.website}>{c.domain ?? c.website}</Ext></dd>
            <dt>YC page</dt><dd><Ext href={c.yc_url}>{c.yc_slug}</Ext></dd>
            <dt>Agent terms</dt><dd>{(c.agent_terms ?? []).join(", ")}</dd>
            <dt>Tags</dt><dd>{(c.tags ?? []).join(", ")}</dd>
            <dt>Discovered</dt><dd>{fmtDate(c.discovered_at)}</dd>
            <dt>Founders fetched</dt><dd>{fmtDate(c.founders_fetched_at) || "not yet"}</dd>
            {c.founders_error ? <><dt>Founder fetch error</dt><dd>{c.founders_error}</dd></> : null}
          </dl>
        </section>
        <section className="card">
          <h2>Description</h2>
          <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{c.description || <span className="faint">none</span>}</p>
        </section>
      </div>

      <h2 style={{ marginTop: 22 }}>Founders</h2>
      {!d.founders.length ? <div className="note">No founders saved for this company yet.</div> : null}
      <div className="grid grid-2">
        {d.founders.map((f: any) => {
          const fs = d.sends.filter((s: any) => s.id === f.send_id || (f.contact_id && s.contact_id === f.contact_id));
          return (
            <section className="card" key={f.id}>
              <div className="section-title">
                <h3 style={{ margin: 0 }}>{f.name}</h3>
                <Badge value={f.email_status} />
              </div>
              <dl className="kv">
                <dt>Title</dt><dd>{f.title}</dd>
                <dt>Email</dt><dd className="mono">{f.email ?? <span className="faint">none</span>}</dd>
                <dt>Email source</dt><dd>{f.email_source ?? ""}{f.email_verified ? " (verified)" : ""}</dd>
                {f.status_reason ? <><dt>Reason</dt><dd>{f.status_reason}</dd></> : null}
                <dt>Contacted</dt><dd>{fmtDate(f.contacted_at) || "not yet"}</dd>
                <dt>Links</dt><dd>{f.linkedin_url ? <Ext href={f.linkedin_url}>LinkedIn</Ext> : null}{f.linkedin_url && f.twitter_url ? " · " : null}{f.twitter_url ? <Ext href={f.twitter_url}>X</Ext> : null}</dd>
              </dl>
              {fs.length ? fs.map((s: any) => (
                <div key={s.id} style={{ marginTop: 12 }}>
                  <div className="faint">
                    Send #{s.id} to <span className="mono">{s.to_email}</span>, {fmtDate(s.sent_at)}{" "}
                    {s.bounced ? <Badge value="bounced" /> : <Badge value={s.checked_24h ? "no bounce 24h" : s.checked_1h ? "no bounce 1h" : "not checked yet"} />}
                    {s.bounced_at ? ` ${fmtDate(s.bounced_at)}` : ""}
                  </div>
                  {s.subject ? <div><strong>Subject:</strong> {s.subject}</div> : null}
                  {body.get(s.id) ? <pre className="email">{body.get(s.id)}</pre> : null}
                </div>
              )) : null}
              {!fs.some((s: any) => body.get(s.id)) ? (
                <div style={{ marginTop: 10 }}>
                  <div className="faint">Why line{f.why_source ? ` (${f.why_source})` : ""}: the full email body is not stored; it is template answer #159 filled with this line.</div>
                  <pre className="email">{f.why_line ? `I am really interested in ${f.why_line}` : "not written yet"}</pre>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </>
  );
}
