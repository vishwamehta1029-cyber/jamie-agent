import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { section, existingTables } from "@/lib/db";
import { TODAY_SQL, fmtDate, fmtNum } from "@/lib/format";
import { BarChart } from "@/components/BarChart";
import { Badge, ErrorBox, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

const T = TODAY_SQL;
const W = "(now() - interval '7 days')";

const SETTINGS = [
  ["entrepreneur_enabled", "Entrepreneur enabled"],
  ["entrepreneur_dry_run", "Entrepreneur dry run"],
  ["daily_send_limit", "Daily send limit (all email)"],
  ["postman_gmail_daily_ceiling", "Gmail ceiling per 24h"],
  ["company_bounce_cap", "Bounces per company before stop"],
  ["guessing_paused", "Email guessing paused"],
  ["mass_apps_daily_cap", "Mass applications per day"],
  ["admin_run_cap", "Applications per Administrator run"],
  ["admin_autopilot", "Administrator autopilot"],
  ["admin_max_failure_streak", "Failures in a row before pause"],
  ["admin_failure_streak", "Current failure streak"],
  ["admin_paused_reason", "Administrator paused reason"],
  ["entrepreneur_last_discovery", "Last Entrepreneur discovery"],
] as const;

export default async function Overview() {
  await requireAuth();

  const counts = await section(async (q) => {
    const has = await existingTables(q);
    const app = has.has("applications")
      ? (await q(`SELECT
          count(*) FILTER (WHERE status = 'submitted' AND submitted_at >= ${T})::int sub_t,
          count(*) FILTER (WHERE status = 'submitted' AND submitted_at >= ${W})::int sub_w,
          count(*) FILTER (WHERE status = 'handoff' AND updated_at >= ${T})::int hand_t,
          count(*) FILTER (WHERE status = 'handoff' AND updated_at >= ${W})::int hand_w,
          count(*) FILTER (WHERE status = 'handoff')::int hand_open,
          count(*) FILTER (WHERE status = 'failed' AND updated_at >= ${T})::int fail_t,
          count(*) FILTER (WHERE status = 'failed' AND updated_at >= ${W})::int fail_w
        FROM applications`))[0]
      : null;
    const jobs = has.has("jobs")
      ? (await q(`SELECT
          count(*) FILTER (WHERE status IS DISTINCT FROM 'rejected' AND found_at >= ${T})::int short_t,
          count(*) FILTER (WHERE status IS DISTINCT FROM 'rejected' AND found_at >= ${W})::int short_w,
          count(*) FILTER (WHERE status = 'rejected' AND found_at >= ${T})::int rej_t,
          count(*) FILTER (WHERE status = 'rejected' AND found_at >= ${W})::int rej_w,
          count(*) FILTER (WHERE status = 'shortlisted')::int waiting
        FROM jobs`))[0]
      : null;
    const ent = has.has("ent_founders") && has.has("ent_companies")
      ? (await q(`SELECT
          (SELECT count(*)::int FROM ent_companies WHERE discovered_at >= ${T}) comp_t,
          (SELECT count(*)::int FROM ent_companies WHERE discovered_at >= ${W}) comp_w,
          (SELECT count(*)::int FROM ent_companies) comp_all,
          (SELECT count(*)::int FROM ent_founders WHERE created_at >= ${T}) f_t,
          (SELECT count(*)::int FROM ent_founders WHERE created_at >= ${W}) f_w,
          (SELECT count(*)::int FROM ent_founders) f_all,
          (SELECT count(*)::int FROM ent_founders WHERE contacted_at >= ${T}) sent_t,
          (SELECT count(*)::int FROM ent_founders WHERE contacted_at >= ${W}) sent_w,
          (SELECT count(*)::int FROM ent_founders WHERE contacted_at IS NOT NULL) sent_all,
          (SELECT count(*)::int FROM ent_founders WHERE email_status = 'no_verified_email' AND updated_at >= ${T}) nov_t,
          (SELECT count(*)::int FROM ent_founders WHERE email_status = 'no_verified_email' AND updated_at >= ${W}) nov_w,
          (SELECT count(*)::int FROM ent_founders WHERE email_status = 'blocked' AND updated_at >= ${T}) blk_t,
          (SELECT count(*)::int FROM ent_founders WHERE email_status = 'blocked' AND updated_at >= ${W}) blk_w,
          (SELECT count(*)::int FROM ent_founders f JOIN sends s ON s.id = f.send_id WHERE s.bounced AND s.bounced_at >= ${T}) bnc_t,
          (SELECT count(*)::int FROM ent_founders f JOIN sends s ON s.id = f.send_id WHERE s.bounced AND s.bounced_at >= ${W}) bnc_w,
          (SELECT COALESCE(sum(credits), 0)::float FROM apollo_usage WHERE reason LIKE 'entrepreneur%' AND created_at >= ${T}) apo_t,
          (SELECT COALESCE(sum(credits), 0)::float FROM apollo_usage WHERE reason LIKE 'entrepreneur%' AND created_at >= ${W}) apo_w,
          (SELECT count(*)::int FROM ent_founders WHERE email_status = 'new' AND email IS NOT NULL AND email_lookup_at IS NOT NULL AND why_line IS NOT NULL) ready`))[0]
      : null;
    const mail = has.has("sends")
      ? (await q(`SELECT
          count(*) FILTER (WHERE sent_at >= ${T})::int t, count(*) FILTER (WHERE sent_at >= ${W})::int w,
          count(*) FILTER (WHERE bounced AND bounced_at >= ${T})::int b_t, count(*) FILTER (WHERE bounced AND bounced_at >= ${W})::int b_w
        FROM sends`))[0]
      : null;
    const apollo = has.has("apollo_usage")
      ? (await q(`SELECT COALESCE(sum(credits) FILTER (WHERE created_at >= ${T}), 0)::float t, COALESCE(sum(credits) FILTER (WHERE created_at >= ${W}), 0)::float w FROM apollo_usage`))[0]
      : null;
    return { app, jobs, ent, mail, apollo };
  });

  const series = await section(async (q) => {
    const has = await existingTables(q);
    const ent = has.has("ent_founders");
    return q<{ day: string; sends: number; ent: number; apps: number }>(`
      WITH days AS (
        SELECT (date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') - make_interval(days => i))::date AS day
        FROM generate_series(0, 13) AS i
      )
      SELECT to_char(d.day, 'Mon DD') AS day,
        (SELECT count(*)::int FROM sends s WHERE (s.sent_at AT TIME ZONE 'America/Los_Angeles')::date = d.day) AS sends,
        ${ent ? "(SELECT count(*)::int FROM ent_founders f WHERE (f.contacted_at AT TIME ZONE 'America/Los_Angeles')::date = d.day)" : "0"} AS ent,
        (SELECT count(*)::int FROM applications a WHERE a.status = 'submitted' AND (a.submitted_at AT TIME ZONE 'America/Los_Angeles')::date = d.day) AS apps
      FROM days d ORDER BY d.day`);
  });

  const runs = await section(async (q) => {
    const has = await existingTables(q);
    if (!has.has("ent_runs")) return { last: null, lastErr: null, recent: [] as any[] };
    const [last] = await q("SELECT id, trigger, dry_run, stats, error, started_at, finished_at FROM ent_runs ORDER BY id DESC LIMIT 1");
    const [lastErr] = await q("SELECT id, error, started_at FROM ent_runs WHERE error IS NOT NULL ORDER BY id DESC LIMIT 1");
    const recent = await q("SELECT id, trigger, dry_run, stats, error, started_at, finished_at FROM ent_runs ORDER BY id DESC LIMIT 8");
    return { last: last ?? null, lastErr: lastErr ?? null, recent };
  });

  const settings = await section((q) =>
    q<{ key: string; value: unknown }>("SELECT key, value FROM settings WHERE key = ANY($1::text[])", [SETTINGS.map((s) => s[0])])
  );
  const sv = new Map((settings.data ?? []).map((r) => [r.key, r.value]));

  const c = counts.data;
  const last = runs.data?.last;
  const ls = (last?.stats ?? {}) as Record<string, any>;

  return (
    <>
      <div className="page-head">
        <h1>Overview</h1>
        <div className="muted">Today means since midnight Pacific. Everything here is read only.</div>
      </div>

      <ErrorBox error={counts.error} />
      {c ? (
        <div className="grid grid-2">
          <section className="card">
            <div className="section-title"><h2>Entrepreneur</h2><Link href="/entrepreneur" className="faint">Open</Link></div>
            {c.ent ? (
              <div className="stats">
                <Stat label="Companies found" today={c.ent.comp_t} week={c.ent.comp_w} />
                <Stat label="Founders" today={c.ent.f_t} week={c.ent.f_w} />
                <Stat label="Emails sent" today={c.ent.sent_t} week={c.ent.sent_w} />
                <Stat label="No verified email" today={c.ent.nov_t} week={c.ent.nov_w} />
                <Stat label="Blocked" today={c.ent.blk_t} week={c.ent.blk_w} />
                <Stat label="Bounces" today={c.ent.bnc_t} week={c.ent.bnc_w} />
                <Stat label="Apollo credits" today={c.ent.apo_t} week={c.ent.apo_w} />
                <Stat label="Ready to send" today={c.ent.ready} hint="Founders with a checked email and a why line, waiting for the next run" />
              </div>
            ) : <div className="note">The Entrepreneur tables do not exist yet. jamie-mcp creates them on its first request after PR #15 is deployed.</div>}
            {c.ent ? <p className="faint" style={{ marginBottom: 0 }}>All time: {fmtNum(c.ent.comp_all)} companies, {fmtNum(c.ent.f_all)} founders, {fmtNum(c.ent.sent_all)} emailed.</p> : null}
          </section>

          <section className="card">
            <div className="section-title"><h2>Administrator and Scout</h2><Link href="/applications" className="faint">Open</Link></div>
            <div className="stats">
              {c.app ? (
                <>
                  <Stat label="Applications submitted" today={c.app.sub_t} week={c.app.sub_w} />
                  <Stat label="Handoffs" today={c.app.hand_t} week={c.app.hand_w} hint={`${c.app.hand_open} waiting for Vishwa right now`} />
                  <Stat label="Failed" today={c.app.fail_t} week={c.app.fail_w} />
                </>
              ) : null}
              {c.jobs ? (
                <>
                  <Stat label="Scout shortlisted" today={c.jobs.short_t} week={c.jobs.short_w} hint="Jobs found that Scout did not reject (some were later applied to or expired)" />
                  <Stat label="Scout rejected" today={c.jobs.rej_t} week={c.jobs.rej_w} />
                </>
              ) : null}
              {c.mail ? <Stat label="Emails sent, all agents" today={c.mail.t} week={c.mail.w} /> : null}
              {c.mail ? <Stat label="Bounces, all agents" today={c.mail.b_t} week={c.mail.b_w} /> : null}
              {c.apollo ? <Stat label="Apollo credits, all agents" today={c.apollo.t} week={c.apollo.w} /> : null}
            </div>
            {c.app ? <p className="faint" style={{ marginBottom: 0 }}>{fmtNum(c.app.hand_open)} handoffs waiting right now. {c.jobs ? `${fmtNum(c.jobs.waiting)} Scout jobs still shortlisted.` : ""}</p> : null}
          </section>
        </div>
      ) : null}

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <section className="card">
          <ErrorBox error={series.error} />
          {series.data ? <BarChart title="Emails sent per day, all agents" unit="emails" data={series.data.map((d) => ({ label: d.day, value: d.sends }))} /> : null}
        </section>
        <section className="card">
          {series.data ? <BarChart title="Entrepreneur emails per day" unit="emails" data={series.data.map((d) => ({ label: d.day, value: d.ent }))} /> : null}
        </section>
        <section className="card">
          {series.data ? <BarChart title="Applications submitted per day" unit="applications" data={series.data.map((d) => ({ label: d.day, value: d.apps }))} /> : null}
        </section>

        <section className="card">
          <h2>Last Entrepreneur run</h2>
          <ErrorBox error={runs.error} />
          {last ? (
            <dl className="kv">
              <dt>Run</dt><dd>#{last.id} ({last.trigger}){last.dry_run ? <> <Badge value="dry run" /></> : null}</dd>
              <dt>Started</dt><dd>{fmtDate(last.started_at)}</dd>
              <dt>Finished</dt><dd>{last.finished_at ? fmtDate(last.finished_at) : <Badge value="in_progress" />}</dd>
              <dt>Sent / blocked</dt><dd>{fmtNum(ls.sent)} / {fmtNum(ls.blocked)}</dd>
              <dt>Found</dt><dd>{fmtNum(ls.discovered)} companies, {fmtNum(ls.founders_added)} founders</dd>
              <dt>Apollo</dt><dd>{fmtNum(ls.apollo_calls)} calls, {fmtNum(ls.apollo_verified)} verified</dd>
              {ls.stop_reason ? <><dt>Stopped because</dt><dd>{ls.stop_reason}</dd></> : null}
              {Array.isArray(ls.notes) && ls.notes.length ? <><dt>Notes</dt><dd>{ls.notes.join("; ")}</dd></> : null}
              <dt>Error</dt><dd>{last.error ? <span style={{ color: "var(--bad)" }}>{last.error}</span> : "none"}</dd>
            </dl>
          ) : runs.data ? <div className="note">No Entrepreneur runs yet.</div> : null}
          {runs.data?.lastErr && runs.data.lastErr.id !== last?.id ? (
            <p className="faint" style={{ marginBottom: 0 }}>Last error (run #{runs.data.lastErr.id}, {fmtDate(runs.data.lastErr.started_at)}): {runs.data.lastErr.error}</p>
          ) : null}
        </section>
      </div>

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <section className="card">
          <h2>Guardrail settings</h2>
          <ErrorBox error={settings.error} />
          <dl className="kv">
            {SETTINGS.map(([k, label]) => (
              <FragmentKV key={k} label={label} value={sv.has(k) ? sv.get(k) : undefined} />
            ))}
          </dl>
          <p className="faint" style={{ marginBottom: 0 }}>
            Entrepreneur&apos;s daily email target, batch size and Apollo credit budget are env vars on jamie-mcp (defaults 100, 10 and 150), so they are not visible here.
          </p>
        </section>
        <section className="card">
          <h2>Recent Entrepreneur runs</h2>
          {runs.data?.recent.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Run</th><th>Started</th><th className="num">Sent</th><th className="num">Founders</th><th>Result</th></tr></thead>
                <tbody>
                  {runs.data.recent.map((r: any) => (
                    <tr key={r.id}>
                      <td className="nowrap">#{r.id} {r.dry_run ? <Badge value="dry run" /> : null}</td>
                      <td className="nowrap">{fmtDate(r.started_at)}</td>
                      <td className="num">{fmtNum(r.stats?.sent)}</td>
                      <td className="num">{fmtNum(r.stats?.founders_added)}</td>
                      <td className="cell">{r.error ? <span style={{ color: "var(--bad)" }}>{r.error}</span> : r.stats?.stop_reason ?? (r.finished_at ? "ok" : "running")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="note">No runs yet.</div>}
        </section>
      </div>
    </>
  );
}

function FragmentKV({ label, value }: { label: string; value: unknown }) {
  let shown: React.ReactNode;
  if (value === undefined) shown = <span className="faint">not set</span>;
  else if (value === true) shown = <span className="badge good">on</span>;
  else if (value === false) shown = <span className="badge">off</span>;
  else if (value === null || value === "null") shown = <span className="faint">none</span>;
  else if (typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value)) shown = fmtDate(value);
  else shown = typeof value === "object" ? JSON.stringify(value) : String(value);
  return (<><dt>{label}</dt><dd>{shown}</dd></>);
}
