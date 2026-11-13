import { q } from "./db.js";

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
