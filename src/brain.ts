import { q } from "./db.js";
import { DONE_CHECKLIST } from "./projectLab.js";

const esc = (v: unknown) =>
  v === null || v === undefined || v === "" ? "" : String(v).replace(/\|/g, "\\|").replace(/\n/g, " ");
const day = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 10) : "");

function table(cols: string[], rows: any[], pick: (r: any) => unknown[]) {
  if (!rows.length) return "_Nothing yet._\n";
  const head = `| ${cols.join(" | ")} |\n| ${cols.map(() => "---").join(" | ")} |\n`;
  return head + rows.map((r) => `| ${pick(r).map(esc).join(" | ")} |`).join("\n") + "\n";
}

const CATEGORY_ORDER = [
  "identity", "contact", "logistics", "eeo", "rules", "preferences", "resume_routing", "summary",
  "experience", "experience:profundity", "experience:culminate", "experience:curiouser", "experience:stanford",
  "project", "metrics", "skills", "skill_levels", "education", "story",
];

export async function renderBrain(): Promise<string> {
  const [facts, retired, answers, apps, submitted, contacts, patterns, sends, apollo, lessons, handoffs, settings] =
    await Promise.all([
      q("SELECT * FROM facts WHERE active ORDER BY category, id"),
      q("SELECT * FROM facts WHERE NOT active ORDER BY updated_at DESC"),
      q("SELECT * FROM answers ORDER BY approved DESC, updated_at DESC"),
      q("SELECT * FROM applications ORDER BY COALESCE(submitted_at, created_at) DESC, id DESC"),
      q(`SELECT sa.*, a.company, a.role FROM submitted_answers sa JOIN applications a ON a.id = sa.application_id
         ORDER BY sa.approved_at DESC`),
      q("SELECT * FROM contacts ORDER BY updated_at DESC"),
      q("SELECT * FROM email_patterns ORDER BY domain"),
      q(`SELECT s.*, c.name, c.company FROM sends s JOIN contacts c ON c.id = s.contact_id ORDER BY s.sent_at DESC`),
      q(`SELECT u.*, c.name, c.company FROM apollo_usage u LEFT JOIN contacts c ON c.id = u.contact_id ORDER BY u.created_at DESC`),
      q("SELECT * FROM lessons ORDER BY topic, created_at"),
      q("SELECT * FROM handoffs ORDER BY created_at DESC"),
      q("SELECT * FROM settings ORDER BY key"),
    ]);

  const out: string[] = [];
  const now = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  out.push(`# Jamie's Brain\n`);
  out.push(`Generated ${now} from Jamie's live database. This is everything Jamie knows.`);
  out.push(`**Hard rule:** if it is not in this file, Jamie does not know it and must not use it.\n`);
  out.push(
    `**At a glance:** ${facts.length} facts · ${answers.filter((a: any) => a.approved).length} approved answers · ` +
      `${apps.length} applications · ${contacts.length} contacts · ${lessons.length} lessons\n`
  );

  out.push(`## About Vishwa\n`);
  const cats = Array.from(new Set(facts.map((f: any) => f.category))).sort(
    (a: any, b: any) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b)
  );
  if (!cats.length) out.push("_Nothing yet._\n");
  for (const c of cats) {
    out.push(`### ${c}\n`);
    for (const f of facts.filter((x: any) => x.category === c)) {
      const src = [f.source, f.source_ref].filter(Boolean).join(", ");
      out.push(`- ${f.fact}  \n  <sub>#${f.id} · ${src} · ${day(f.created_at)}</sub>`);
    }
    out.push("");
  }

  out.push(`## Answer Bank\n`);
  if (!answers.length) out.push("_Nothing yet._\n");
  for (const a of answers) {
    out.push(
      `**#${a.id} ${a.approved ? "Approved" : "Not approved"}** · ${[a.question_type, a.role_type, a.company].filter(Boolean).join(" · ")} · used ${a.times_used}x\n`
    );
    out.push(`> **Q:** ${a.question}\n>\n> ${String(a.answer).replace(/\n/g, "\n> ")}\n`);
  }

  out.push(`## Applications\n`);
  out.push(
    table(["#", "Company", "Role", "Status", "Tier", "ATS", "Resume", "Submitted", "Notes"], apps, (r) => [
      r.id, r.company, r.role, r.status, r.tier, r.ats, r.resume_used, day(r.submitted_at), r.notes,
    ])
  );

  out.push(`## Submitted Custom Answers (review log)\n`);
  out.push(
    table(["Date", "Company", "Role", "Question", "Answer"], submitted, (r) => [
      day(r.approved_at), r.company, r.role, r.question, r.answer,
    ])
  );

  out.push(`## Contacts\n`);
  out.push(
    table(["#", "Name", "Title", "Company", "Email", "Source", "Confidence", "Status", "Notes"], contacts, (r) => [
      r.id, r.name, r.title, r.company, r.email, r.email_source, r.email_confidence, r.status, r.notes,
    ])
  );

  out.push(`## Email Patterns\n`);
  out.push(
    table(["Domain", "Pattern", "Status", "Accepts mail", "Catch-all", "Bounces", "Evidence"], patterns, (r) => [
      r.domain, r.pattern, r.status, r.accepts_mail, r.catch_all, r.bounces, r.evidence,
    ])
  );

  out.push(`## Outreach Sent\n`);
  out.push(
    table(["Date", "To", "Name", "Company", "Subject", "Bounced", "1h check", "24h check"], sends, (r) => [
      day(r.sent_at), r.to_email, r.name, r.company, r.subject, r.bounced ? "yes" : "no", r.checked_1h ? "done" : "", r.checked_24h ? "done" : "",
    ])
  );

  out.push(`## Apollo Usage\n`);
  out.push(
    table(["Date", "Contact", "Company", "Reason", "Credits", "Result"], apollo, (r) => [
      day(r.created_at), r.name, r.company, r.reason, r.credits, r.result,
    ])
  );

  out.push(`## Lessons Learned\n`);
  if (!lessons.length) out.push("_Nothing yet._\n");
  for (const l of lessons) out.push(`- **${l.topic}:** ${l.lesson}${l.source ? ` <sub>(${l.source})</sub>` : ""}`);
  out.push("");

  out.push(`## Handoffs\n`);
  if (!handoffs.length) out.push("_Nothing yet._\n");
  for (const h of handoffs) {
    out.push(`- **${day(h.created_at)} · ${h.platform}:** ${h.summary}${h.next_steps ? `  \n  Next: ${h.next_steps}` : ""}`);
  }
  out.push("");

  const [projects, labTasks, labIdeas] = await Promise.all([
    q("SELECT * FROM projects ORDER BY in_scope DESC, status, name"),
    q("SELECT t.*, p.name project_name FROM pl_tasks t JOIN projects p ON p.id = t.project_id ORDER BY p.name, t.order_no, t.id"),
    q("SELECT i.*, p.name project_name FROM pl_ideas i JOIN projects p ON p.id = i.project_id ORDER BY i.status, i.score DESC NULLS LAST"),
  ]);
  out.push(`## Project Lab\n`);
  if (!projects.length) out.push("_Nothing yet._\n");
  for (const p of projects) {
    const tasks = labTasks.filter((t: any) => t.project_id === p.id && t.status !== "parked");
    const done = tasks.filter((t: any) => t.status === "done").length;
    const dod = Object.keys(DONE_CHECKLIST).filter((k) => p.done_checklist?.[k]?.done).length;
    out.push(`### ${p.name} · ${p.status}${p.in_scope ? "" : " · out of scope"}\n`);
    out.push(`- Repo: ${p.repo}${p.live_url ? ` · Live: ${p.live_url}` : ""}`);
    out.push(`- Progress: ${done} of ${tasks.length} tasks · Definition of done: ${dod} of ${Object.keys(DONE_CHECKLIST).length}`);
    for (const [label, v] of [["What it does", p.one_liner], ["Problem", p.problem], ["Architecture", p.architecture], ["Stack", p.stack],
      ["Decisions", p.decisions], ["Failures and fixes", p.failures], ["Approved metrics", p.metrics], ["Talking points", p.talking_points]] as const) {
      if (v) out.push(`- ${label}: ${String(v).replace(/\n/g, " ")}`);
    }
    if (p.skills_proven?.length) out.push(`- Skills proven: ${p.skills_proven.join(", ")}`);
    if (p.v2_list?.length) out.push(`- v2 list: ${p.v2_list.join("; ")}`);
    out.push("");
    if (tasks.length) out.push(table(["#", "Task", "Min", "Milestone", "Status", "PR"], tasks, (t) => [t.order_no, t.title, t.minutes, t.milestone, t.status, t.pr_url]));
  }
  if (labIdeas.length) {
    out.push(`### Project Lab ideas\n`);
    out.push(table(["#", "Project", "Idea", "Kind", "Effort", "Score", "Status", "Reason"], labIdeas, (i) => [
      i.id, i.project_name, i.idea, i.kind, i.effort, i.score, i.status, i.reason,
    ]));
  }

  const [scoutJobs, scoutSkills] = await Promise.all([
    q("SELECT * FROM jobs WHERE status IN ('shortlisted','handed_off') ORDER BY status, fit_score DESC LIMIT 100"),
    q(`SELECT s.skill, count(DISTINCT s.job_id) n FROM job_skills s JOIN jobs j ON j.id = s.job_id
       WHERE j.found_at > now() - interval '30 days' AND j.status <> 'rejected' GROUP BY s.skill ORDER BY n DESC LIMIT 20`),
  ]);
  out.push(`## Scout\n`);
  if (!scoutJobs.length) out.push("_No shortlisted jobs._\n");
  else out.push(table(["#", "Company", "Role", "Score", "Resume", "Status", "Flags", "Link"], scoutJobs, (j) => [
    j.id, j.real_employer ? `${j.real_employer} (via ${j.company})` : j.company, j.role, j.fit_score, j.resume, j.status, (j.flags || []).join("; "), j.url,
  ]));
  if (scoutSkills.length) {
    out.push(`### Skills employers ask for (last 30 days)\n`);
    out.push(scoutSkills.map((s: any) => `${s.skill} (${s.n})`).join(", ") + "\n");
  }

  const [styItems, styChanges] = await Promise.all([
    q("SELECT key, kind, surfaces, version, updated_at FROM stylist_items WHERE active ORDER BY kind, order_no"),
    q("SELECT id, summary, status, created_at, published_at FROM stylist_changes ORDER BY id DESC LIMIT 20"),
  ]);
  out.push(`## Stylist\n`);
  out.push(`${styItems.length} live resume and portfolio items. Resumes: fde, ai_engineer, gtm. Portfolio feed: /public/portfolio.json\n`);
  if (styChanges.length) out.push(table(["#", "Change", "Status", "Published"], styChanges, (c) => [c.id, c.summary, c.status, day(c.published_at)]));

  out.push(`## Guardrail Settings\n`);
  out.push(table(["Setting", "Value"], settings, (r) => [r.key, JSON.stringify(r.value)]));

  out.push(`## Retired Facts (corrected or replaced)\n`);
  out.push(
    table(["#", "Category", "Old fact", "Replaced by", "Retired"], retired, (r) => [
      r.id, r.category, r.fact, r.superseded_by ? `#${r.superseded_by}` : "", day(r.updated_at),
    ])
  );

  return out.join("\n");
}
