import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { promises as dns } from "node:dns";
import { q, one, getSetting, setSetting, tsOr } from "./db.js";
import { registerProjectLabTools, activeProject, progress as labProgress } from "./projectLab.js";
import { registerScoutTools, shortlistCount } from "./scout.js";
import { registerStylistTools, stylistPendingCount } from "./stylist.js";
import { registerAdministratorTools, adminStatus } from "./administrator.js";

const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

const norm = (s: string) => s.trim().toLowerCase();

// 7-day bounce rate. Reported for visibility only; it does not pause sends.
export async function bounceRate() {
  const r = (await one<{ sends: string; bounces: string }>(
    `SELECT count(*) sends, count(*) FILTER (WHERE bounced) bounces FROM sends WHERE sent_at > now() - interval '7 days'`
  ))!;
  const sends = Number(r.sends);
  const bounces = Number(r.bounces);
  const pct = sends ? (bounces / sends) * 100 : 0;
  return { sends_7d: sends, bounces_7d: bounces, rate_pct: Math.round(pct * 10) / 10 };
}

export async function massAppsToday() {
  const cap = await getSetting<number>("mass_apps_daily_cap");
  const n = Number(
    (await one<{ n: string }>(
      `SELECT count(*) n FROM applications WHERE tier = 'mass' AND status = 'submitted'
       AND submitted_at > date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'America/Los_Angeles'`
    ))!.n
  );
  return { mass_apps_today: n, cap, remaining: Math.max(0, cap - n), can_apply_mass: n < cap };
}

export async function guardrailStatus(contactId?: number) {
  const [companyCap, dailyLimit, paused] = await Promise.all([
    getSetting<number>("company_bounce_cap"),
    getSetting<number>("daily_send_limit"),
    getSetting<boolean>("guessing_paused"),
  ]);
  const sentToday = Number(
    (await one<{ n: string }>(
      "SELECT count(*) n FROM sends WHERE sent_at > date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'America/Los_Angeles'"
    ))!.n
  );
  const rate = await bounceRate();

  const blocks: string[] = [];
  const warnings: string[] = [];
  if (sentToday >= dailyLimit) blocks.push(`Daily send limit reached (${sentToday}/${dailyLimit}).`);

  let contact: any = null;
  if (contactId) {
    contact = await one("SELECT * FROM contacts WHERE id = $1", [contactId]);
    if (!contact) blocks.push(`Contact ${contactId} not found.`);
  }

  const guessed = contact ? contact.email_source === "guessed" : true;
  if (guessed && paused) {
    blocks.push("Guessed sends are paused by Vishwa. She must resume with jamie_update_settings.");
  }

  if (contact) {
    if (!contact.email) blocks.push("Contact has no email yet.");
    const companyBounces = Number(
      (await one<{ n: string }>(
        `SELECT count(*) n FROM sends s JOIN contacts c ON c.id = s.contact_id
         WHERE s.bounced AND lower(c.company) = lower($1)`,
        [contact.company]
      ))!.n
    );
    if (guessed && companyBounces >= companyCap) {
      blocks.push(
        `${companyBounces} bounces at ${contact.company} (cap ${companyCap}). The pattern is likely wrong; stop guessing here and ask Vishwa.`
      );
    }
    if (contact.domain) {
      const p = await one("SELECT * FROM email_patterns WHERE domain = $1", [norm(contact.domain)]);
      if (p?.accepts_mail === false) blocks.push(`${contact.domain} does not accept mail (no MX records).`);
      if (p?.catch_all) warnings.push(`${contact.domain} is catch-all: guessed address is LOW confidence. Tell Vishwa in the draft.`);
      if (guessed && p?.status !== "confirmed") warnings.push("Email pattern not yet confirmed for this domain.");
    }
    if (contact.status === "dead_end") blocks.push("Contact is marked dead_end.");
  }

  return {
    can_send: blocks.length === 0,
    blocks,
    warnings,
    reminder: "Even when can_send is true, Vishwa must approve this exact email before it is sent.",
    counters: { sent_today: sentToday, daily_limit: dailyLimit, bounce_rate: rate, paused, mass_apps: await massAppsToday() },
  };
}

const COMMON_PATTERNS = ["{first}.{last}", "{first}", "{f}{last}", "{first}{last}", "{first}_{last}", "{f}.{last}", "{first}{l}"];

export function applyPattern(pattern: string, first: string, last: string, domain: string) {
  const clean = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "");
  const f = clean(first);
  const l = clean(last);
  const local = pattern
    .replace("{first}", f)
    .replace("{last}", l)
    .replace("{f}", f[0] || "")
    .replace("{l}", l[0] || "");
  return `${local}@${norm(domain)}`;
}

export function buildServer() {
  const server = new McpServer({ name: "jamie", version: "0.7.0" });

  server.registerTool(
    "jamie_start_session",
    {
      description:
        "ALWAYS call first in any Jamie session (Claude or ChatGPT). Returns the last handoff note, guardrail status, pending approvals, sends needing a bounce check, and recent lessons.",
      inputSchema: { platform: z.enum(["claude", "chatgpt"]) },
    },
    async ({ platform }) => {
      const handoff = await one("SELECT * FROM handoffs ORDER BY created_at DESC LIMIT 1");
      const awaiting = await q(
        "SELECT id, company, role, status, updated_at FROM applications WHERE status IN ('in_progress','awaiting_approval') ORDER BY updated_at DESC LIMIT 20"
      );
      const needCheck = await q(
        `SELECT s.id send_id, c.name, c.company, s.to_email, s.sent_at,
                (NOT s.checked_1h AND s.sent_at < now() - interval '1 hour') due_1h,
                (NOT s.checked_24h AND s.sent_at < now() - interval '24 hours') due_24h
         FROM sends s JOIN contacts c ON c.id = s.contact_id
         WHERE NOT s.bounced AND ((NOT s.checked_1h AND s.sent_at < now() - interval '1 hour')
            OR (NOT s.checked_24h AND s.sent_at < now() - interval '24 hours'))
         ORDER BY s.sent_at LIMIT 30`
      );
      const lessons = await q("SELECT topic, lesson FROM lessons ORDER BY created_at DESC LIMIT 15");
      const counts = await one(
        `SELECT (SELECT count(*) FROM facts WHERE active) facts,
                (SELECT count(*) FROM answers WHERE approved) approved_answers,
                (SELECT count(*) FROM applications WHERE status='submitted') submitted,
                (SELECT count(*) FROM contacts) contacts`
      );
      const lab = await activeProject();
      return ok({
        platform,
        last_handoff: handoff,
        project_lab: lab ? await labProgress(lab.id) : null,
        scout: { shortlisted_waiting: await shortlistCount() },
        stylist: { changes_waiting_for_vishwa: await stylistPendingCount() },
        administrator: await adminStatus(),
        guardrails: await guardrailStatus(),
        pending_applications: awaiting,
        sends_needing_bounce_check: needCheck,
        recent_lessons: lessons,
        brain_size: counts,
      });
    }
  );

  server.registerTool(
    "jamie_write_handoff",
    {
      description:
        "Call at the end of every session, or whenever stopping mid-task, so the other platform can pick up. Be specific: company, role, which step, what is waiting on Vishwa.",
      inputSchema: {
        platform: z.enum(["claude", "chatgpt"]),
        summary: z.string(),
        next_steps: z.string().optional(),
        open_items: z.array(z.string()).optional(),
      },
    },
    async ({ platform, summary, next_steps, open_items }) =>
      ok(
        await one(
          "INSERT INTO handoffs (platform, summary, next_steps, open_items) VALUES ($1,$2,$3,$4) RETURNING *",
          [platform, summary, next_steps ?? null, JSON.stringify(open_items ?? [])]
        )
      )
  );

  server.registerTool(
    "jamie_get_profile",
    {
      description: "Get active facts about Vishwa, optionally filtered by category or a search query.",
      inputSchema: { category: z.string().optional(), query: z.string().optional(), limit: z.number().int().max(200).optional() },
    },
    async ({ category, query, limit }) => {
      const tq = query ? tsOr(query) : null;
      const rows = await q(
        `SELECT id, category, fact, source, source_ref, updated_at FROM facts
         WHERE active AND ($1::text IS NULL OR category = $1)
           AND ($2::text IS NULL OR to_tsvector('english', fact) @@ to_tsquery('english', $2))
         ORDER BY ${tq ? "ts_rank(to_tsvector('english', fact), to_tsquery('english', $2)) DESC," : ""} category, id
         LIMIT $3`,
        [category ?? null, tq, limit ?? 100]
      );
      return ok(rows);
    }
  );

  server.registerTool(
    "jamie_add_fact",
    {
      description:
        "Save a new fact about Vishwa. Only facts she stated, from her resume, or confirmed during an application. Never inferences. If it corrects an old fact, pass replaces_fact_id.",
      inputSchema: {
        category: z.string(),
        fact: z.string(),
        source: z.enum(["resume", "told_me", "found_during_application", "correction"]),
        source_ref: z.string().optional(),
        replaces_fact_id: z.number().int().optional(),
      },
    },
    async ({ category, fact, source, source_ref, replaces_fact_id }) => {
      const row = await one(
        "INSERT INTO facts (category, fact, source, source_ref) VALUES ($1,$2,$3,$4) RETURNING *",
        [category, fact, source, source_ref ?? null]
      );
      if (replaces_fact_id) {
        await q("UPDATE facts SET active = FALSE, superseded_by = $1, updated_at = now() WHERE id = $2", [row.id, replaces_fact_id]);
      }
      return ok(row);
    }
  );

  server.registerTool(
    "jamie_search_answers",
    {
      description:
        "Before drafting ANY custom application answer, search here for approved answers to similar questions. Reuse or adapt them; adapted answers still need Vishwa's approval.",
      inputSchema: {
        question: z.string(),
        role_type: z.string().optional(),
        include_unapproved: z.boolean().optional(),
        limit: z.number().int().max(20).optional(),
      },
    },
    async ({ question, role_type, include_unapproved, limit }) => {
      const tq = tsOr(question);
      if (!tq) return ok([]);
      const rows = await q(
        `SELECT id, question, answer, question_type, role_type, company, approved, reusable, times_used,
                ts_rank(to_tsvector('english', question || ' ' || answer), to_tsquery('english', $1)) rank
         FROM answers
         WHERE to_tsvector('english', question || ' ' || answer) @@ to_tsquery('english', $1)
           AND ($2::boolean OR approved)
         ORDER BY (CASE WHEN $3::text IS NOT NULL AND role_type = $3 THEN 1 ELSE 0 END) DESC, rank DESC, times_used DESC
         LIMIT $4`,
        [tq, include_unapproved ?? false, role_type ?? null, limit ?? 5]
      );
      return ok(rows);
    }
  );

  server.registerTool(
    "jamie_save_answer",
    {
      description:
        "Save an answer to the bank. Set approved=true ONLY after Vishwa explicitly approved this exact text. Company-specific answers (why us) get reusable=false.",
      inputSchema: {
        question: z.string(),
        answer: z.string(),
        question_type: z.enum(["why_us", "why_role", "essay", "self_rating", "experience", "logistics", "other"]),
        role_type: z.string().optional(),
        company: z.string().optional(),
        approved: z.boolean(),
        reusable: z.boolean().optional(),
        application_id: z.number().int().optional(),
        update_answer_id: z.number().int().optional(),
      },
    },
    async (a) => {
      if (a.update_answer_id) {
        return ok(
          await one(
            `UPDATE answers SET answer=$2, approved=$3, updated_at=now() WHERE id=$1 RETURNING *`,
            [a.update_answer_id, a.answer, a.approved]
          )
        );
      }
      return ok(
        await one(
          `INSERT INTO answers (question, answer, question_type, role_type, company, approved, reusable, application_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [a.question, a.answer, a.question_type, a.role_type ?? null, a.company ?? null, a.approved,
           a.reusable ?? a.question_type !== "why_us", a.application_id ?? null]
        )
      );
    }
  );

  server.registerTool(
    "jamie_check_applied",
    {
      description:
        "Dedupe check. Call before starting any application. Returns prior applications at this company (fuzzy match). Never re-apply to the same role.",
      inputSchema: { company: z.string(), role: z.string().optional() },
    },
    async ({ company, role }) => {
      const rows = await q(
        `SELECT id, company, role, job_id, status, tier, submitted_at FROM applications
         WHERE lower(company) LIKE '%' || lower($1) || '%' OR lower($1) LIKE '%' || lower(company) || '%'
         ORDER BY created_at DESC`,
        [company.trim()]
      );
      const sameRole = role
        ? rows.filter((r: any) => norm(r.role).includes(norm(role)) || norm(role).includes(norm(r.role)))
        : [];
      return ok({
        already_applied_same_role: sameRole.some((r: any) => r.status === "submitted"),
        matches: rows,
        reminder: "Also search Gmail for past confirmations and outreach to this company.",
      });
    }
  );

  server.registerTool(
    "jamie_log_application",
    {
      description: "Create or update an application record. Pass id to update.",
      inputSchema: {
        id: z.number().int().optional(),
        company: z.string().optional(),
        role: z.string().optional(),
        job_id: z.string().optional(),
        url: z.string().optional(),
        location: z.string().optional(),
        ats: z.string().optional(),
        resume_used: z.string().optional(),
        tier: z.enum(["mass", "quality"]).optional(),
        status: z.enum(["saved", "in_progress", "awaiting_approval", "submitted", "skipped", "rejected", "interviewing", "offer"]).optional(),
        notes: z.string().optional(),
      },
    },
    async (a) => {
      const fields = ["company", "role", "job_id", "url", "location", "ats", "resume_used", "tier", "status", "notes"] as const;
      if (a.status === "submitted") {
        const prev = a.id ? await one("SELECT tier, status FROM applications WHERE id = $1", [a.id]) : null;
        const tier = a.tier ?? prev?.tier ?? "mass";
        if (tier === "mass" && prev?.status !== "submitted") {
          const m = await massAppsToday();
          if (!m.can_apply_mass) {
            return ok({
              refused: true,
              reason: `Daily mass app cap reached (${m.mass_apps_today}/${m.cap}). Do not submit more mass apps today. Tell Vishwa.`,
            });
          }
        }
      }
      if (a.id) {
        const sets: string[] = [];
        const vals: unknown[] = [a.id];
        for (const f of fields) {
          if (a[f] !== undefined) {
            vals.push(a[f]);
            sets.push(`${f} = $${vals.length}`);
          }
        }
        if (a.status === "submitted") sets.push("submitted_at = COALESCE(submitted_at, now())");
        sets.push("updated_at = now()");
        return ok(await one(`UPDATE applications SET ${sets.join(", ")} WHERE id = $1 RETURNING *`, vals));
      }
      if (!a.company || !a.role) throw new Error("company and role are required for a new application");
      const cols = fields.filter((f) => a[f] !== undefined);
      const vals = cols.map((f) => a[f]);
      const extra = a.status === "submitted" ? ", submitted_at" : "";
      const extraVal = a.status === "submitted" ? ", now()" : "";
      return ok(
        await one(
          `INSERT INTO applications (${cols.join(", ")}${extra}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}${extraVal}) RETURNING *`,
          vals
        )
      );
    }
  );

  server.registerTool(
    "jamie_can_apply",
    {
      description:
        "Check before submitting any mass app: returns today's mass app count against the daily hard cap. Quality apps are not capped. The server also refuses a mass submission past the cap.",
      inputSchema: {},
    },
    async () => ok(await massAppsToday())
  );

  server.registerTool(
    "jamie_list_applications",
    {
      description: "List applications, filtered by status and/or company.",
      inputSchema: { status: z.string().optional(), company: z.string().optional(), limit: z.number().int().max(200).optional() },
    },
    async ({ status, company, limit }) =>
      ok(
        await q(
          `SELECT * FROM applications WHERE ($1::text IS NULL OR status = $1)
           AND ($2::text IS NULL OR lower(company) LIKE '%' || lower($2) || '%')
           ORDER BY updated_at DESC LIMIT $3`,
          [status ?? null, company ?? null, limit ?? 50]
        )
      )
  );

  server.registerTool(
    "jamie_log_submitted_answers",
    {
      description:
        "After an application is submitted, log every customized answer that went in (Vishwa reviews this log). Also bumps times_used on reused bank answers.",
      inputSchema: {
        application_id: z.number().int(),
        answers: z.array(z.object({ question: z.string(), answer: z.string(), answer_id: z.number().int().optional() })),
      },
    },
    async ({ application_id, answers }) => {
      for (const a of answers) {
        await q("INSERT INTO submitted_answers (application_id, question, answer, answer_id) VALUES ($1,$2,$3,$4)", [
          application_id, a.question, a.answer, a.answer_id ?? null,
        ]);
        if (a.answer_id) await q("UPDATE answers SET times_used = times_used + 1 WHERE id = $1", [a.answer_id]);
      }
      return ok({ logged: answers.length });
    }
  );

  server.registerTool(
    "jamie_review_submitted_answers",
    {
      description: "Return the log of customized answers submitted, newest first, for Vishwa's review.",
      inputSchema: { days: z.number().int().optional(), limit: z.number().int().max(200).optional() },
    },
    async ({ days, limit }) =>
      ok(
        await q(
          `SELECT sa.*, a.company, a.role FROM submitted_answers sa JOIN applications a ON a.id = sa.application_id
           WHERE sa.approved_at > now() - make_interval(days => $1) ORDER BY sa.approved_at DESC LIMIT $2`,
          [days ?? 30, limit ?? 100]
        )
      )
  );

  server.registerTool(
    "jamie_upsert_contact",
    {
      description:
        "Create or update a contact found for a job (from public web research first). Pass id to update. email_source: guessed | public | apollo.",
      inputSchema: {
        id: z.number().int().optional(),
        name: z.string().optional(),
        title: z.string().optional(),
        company: z.string().optional(),
        domain: z.string().optional(),
        linkedin_url: z.string().optional(),
        email: z.string().optional(),
        email_source: z.enum(["guessed", "public", "apollo"]).optional(),
        email_confidence: z.enum(["high", "medium", "low"]).optional(),
        status: z.enum(["new", "drafted", "sent", "bounced", "replied", "dead_end"]).optional(),
        application_id: z.number().int().optional(),
        notes: z.string().optional(),
      },
    },
    async (a) => {
      const fields = ["name", "title", "company", "domain", "linkedin_url", "email", "email_source", "email_confidence", "status", "application_id", "notes"] as const;
      if (a.domain) a.domain = norm(a.domain);
      if (a.id) {
        const sets: string[] = [];
        const vals: unknown[] = [a.id];
        for (const f of fields) if (a[f] !== undefined) { vals.push(a[f]); sets.push(`${f} = $${vals.length}`); }
        sets.push("updated_at = now()");
        return ok(await one(`UPDATE contacts SET ${sets.join(", ")} WHERE id = $1 RETURNING *`, vals));
      }
      if (!a.name || !a.company) throw new Error("name and company are required for a new contact");
      const existing = await one(
        "SELECT * FROM contacts WHERE lower(name) = lower($1) AND lower(company) = lower($2)",
        [a.name, a.company]
      );
      if (existing) return ok({ note: "Contact already exists; pass id to update.", contact: existing });
      const cols = fields.filter((f) => a[f] !== undefined);
      return ok(
        await one(
          `INSERT INTO contacts (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`,
          cols.map((f) => a[f])
        )
      );
    }
  );

  server.registerTool(
    "jamie_check_domain",
    {
      description:
        "Free pre-send check: does this domain accept mail (MX records)? Saves the result. Mark catch_all if you have evidence (it cannot be detected here).",
      inputSchema: { domain: z.string(), catch_all: z.boolean().optional() },
    },
    async ({ domain, catch_all }) => {
      const d = norm(domain);
      let mx: { exchange: string; priority: number }[] = [];
      let accepts = false;
      try {
        mx = await dns.resolveMx(d);
        accepts = mx.length > 0;
      } catch {
        accepts = false;
      }
      const row = await one(
        `INSERT INTO email_patterns (domain, accepts_mail, catch_all) VALUES ($1,$2,$3)
         ON CONFLICT (domain) DO UPDATE SET accepts_mail = EXCLUDED.accepts_mail,
           catch_all = COALESCE(EXCLUDED.catch_all, email_patterns.catch_all), updated_at = now()
         RETURNING *`,
        [d, accepts, catch_all ?? null]
      );
      return ok({ ...row, mx: mx.map((m) => m.exchange) });
    }
  );

  server.registerTool(
    "jamie_guess_email",
    {
      description:
        "Guess email candidates for a person. Uses the domain's known pattern if confirmed, otherwise common patterns. Returns at most max_patterns_per_person candidates. Prefer a pattern backed by public evidence.",
      inputSchema: { first_name: z.string(), last_name: z.string(), domain: z.string() },
    },
    async ({ first_name, last_name, domain }) => {
      const d = norm(domain);
      const max = await getSetting<number>("max_patterns_per_person");
      const p = await one("SELECT * FROM email_patterns WHERE domain = $1", [d]);
      let patterns: string[];
      let basis: string;
      if (p?.pattern && p.status === "confirmed") {
        patterns = [p.pattern];
        basis = `confirmed pattern for ${d}`;
      } else if (p?.pattern && p.status === "guessed") {
        patterns = [p.pattern, ...COMMON_PATTERNS.filter((x) => x !== p.pattern)].slice(0, max);
        basis = `unconfirmed pattern for ${d}, plus most common fallback`;
      } else {
        const wrong = p?.status === "wrong" && p.pattern ? [p.pattern] : [];
        patterns = COMMON_PATTERNS.filter((x) => !wrong.includes(x)).slice(0, max);
        basis = "no known pattern; most common formats. Look for public evidence before sending.";
      }
      return ok({
        candidates: patterns.map((pt) => ({ pattern: pt, email: applyPattern(pt, first_name, last_name, d) })),
        basis,
        domain_info: p,
      });
    }
  );

  server.registerTool(
    "jamie_save_email_pattern",
    {
      description:
        "Record a company's email format. status=confirmed only with evidence (a real address seen publicly, a reply received, or Apollo verified).",
      inputSchema: {
        domain: z.string(),
        pattern: z.string().describe("e.g. {first}.{last}, {f}{last}, {first}"),
        status: z.enum(["guessed", "confirmed", "wrong"]),
        evidence: z.string().optional(),
      },
    },
    async ({ domain, pattern, status, evidence }) =>
      ok(
        await one(
          `INSERT INTO email_patterns (domain, pattern, status, evidence) VALUES ($1,$2,$3,$4)
           ON CONFLICT (domain) DO UPDATE SET pattern = EXCLUDED.pattern, status = EXCLUDED.status,
             evidence = COALESCE(EXCLUDED.evidence, email_patterns.evidence), updated_at = now()
           RETURNING *`,
          [norm(domain), pattern, status, evidence ?? null]
        )
      )
  );

  server.registerTool(
    "jamie_can_send",
    {
      description:
        "Guardrail check. MUST be called before sending any outreach email. If can_send is false, do not send. Even if true, Vishwa must approve the exact email first.",
      inputSchema: { contact_id: z.number().int() },
    },
    async ({ contact_id }) => ok(await guardrailStatus(contact_id))
  );

  server.registerTool(
    "jamie_log_send",
    {
      description: "Log an outreach email right after it was sent (with Vishwa's approval). Store Gmail ids for bounce checks.",
      inputSchema: {
        contact_id: z.number().int(),
        to_email: z.string(),
        subject: z.string().optional(),
        gmail_message_id: z.string().optional(),
        gmail_thread_id: z.string().optional(),
      },
    },
    async ({ contact_id, to_email, subject, gmail_message_id, gmail_thread_id }) => {
      const row = await one(
        `INSERT INTO sends (contact_id, to_email, subject, gmail_message_id, gmail_thread_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [contact_id, to_email, subject ?? null, gmail_message_id ?? null, gmail_thread_id ?? null]
      );
      await q("UPDATE contacts SET status = 'sent', updated_at = now() WHERE id = $1", [contact_id]);
      return ok({ send: row, next: "Check Gmail for a bounce at 1 hour and 24 hours, then call jamie_mark_bounce_checked or jamie_record_bounce." });
    }
  );

  server.registerTool(
    "jamie_mark_bounce_checked",
    {
      description: "Mark a send as checked with no bounce found, at the 1h or 24h checkpoint.",
      inputSchema: { send_id: z.number().int(), checkpoint: z.enum(["1h", "24h"]) },
    },
    async ({ send_id, checkpoint }) => {
      const col = checkpoint === "1h" ? "checked_1h" : "checked_24h";
      const row = await one(`UPDATE sends SET ${col} = TRUE WHERE id = $1 RETURNING *`, [send_id]);
      if (checkpoint === "24h" && row) {
        const c = await one("SELECT * FROM contacts WHERE id = $1", [row.contact_id]);
        if (c?.email_source === "guessed" && c.domain) {
          await q(
            `UPDATE email_patterns SET status = 'confirmed', evidence = COALESCE(evidence,'') || ' | no bounce 24h: ' || $2, updated_at = now()
             WHERE domain = $1 AND status = 'guessed' AND pattern IS NOT NULL`,
            [c.domain, row.to_email]
          );
        }
      }
      return ok(row);
    }
  );

  server.registerTool(
    "jamie_record_bounce",
    {
      description:
        "Record that a send bounced. Updates the company bounce count and marks the pattern wrong at the company cap. Returns the allowed next action: one Apollo lookup for this person, or dead_end.",
      inputSchema: { send_id: z.number().int(), bounce_reason: z.string().optional() },
    },
    async ({ send_id, bounce_reason }) => {
      const s = await one("UPDATE sends SET bounced = TRUE, bounced_at = now() WHERE id = $1 RETURNING *", [send_id]);
      if (!s) throw new Error(`send ${send_id} not found`);
      const c = await one(
        "UPDATE contacts SET status = 'bounced', notes = COALESCE(notes,'') || $2, updated_at = now() WHERE id = $1 RETURNING *",
        [s.contact_id, bounce_reason ? ` | bounce: ${bounce_reason}` : ""]
      );
      const companyCap = await getSetting<number>("company_bounce_cap");
      let company_cap_hit = false;
      if (c.domain) {
        const p = await one(
          "UPDATE email_patterns SET bounces = bounces + 1, updated_at = now() WHERE domain = $1 RETURNING *",
          [c.domain]
        );
        if (p && p.bounces >= companyCap) {
          await q("UPDATE email_patterns SET status = 'wrong' WHERE domain = $1 AND status <> 'confirmed'", [c.domain]);
          company_cap_hit = true;
        }
      }
      const apolloUsed = await one("SELECT id FROM apollo_usage WHERE contact_id = $1 LIMIT 1", [c.id]);
      const nextAction =
        c.email_source === "apollo" || apolloUsed
          ? { action: "dead_end", why: "Apollo already used for this contact. Mark dead_end." }
          : { action: "apollo_lookup", why: "One Apollo lookup allowed for this person only. Log it with jamie_log_apollo." };
      return ok({
        contact: c,
        bounce_rate: await bounceRate(),
        tell_vishwa: company_cap_hit
          ? `${c.company} reached ${companyCap} bounces. Stop guessing there and ask her.`
          : undefined,
        next: nextAction,
      });
    }
  );

  server.registerTool(
    "jamie_log_apollo",
    {
      description:
        "Log every Apollo lookup (credits are limited). Apollo is LAST RESORT: only after a guessed email bounced. If a verified email was found, it is saved to the contact.",
      inputSchema: {
        contact_id: z.number().int(),
        reason: z.string(),
        credits: z.number().optional(),
        verified_email: z.string().optional(),
        result: z.string().optional(),
      },
    },
    async ({ contact_id, reason, credits, verified_email, result }) => {
      await q("INSERT INTO apollo_usage (contact_id, reason, credits, result) VALUES ($1,$2,$3,$4)", [
        contact_id, reason, credits ?? 1, result ?? (verified_email ? `found ${verified_email}` : "no verified email"),
      ]);
      const c = verified_email
        ? await one(
            "UPDATE contacts SET email = $2, email_source = 'apollo', email_confidence = 'high', status = 'new', updated_at = now() WHERE id = $1 RETURNING *",
            [contact_id, verified_email]
          )
        : await one("UPDATE contacts SET status = 'dead_end', updated_at = now() WHERE id = $1 RETURNING *", [contact_id]);
      return ok({
        contact: c,
        next: verified_email
          ? "Save the real pattern with jamie_save_email_pattern (status confirmed), then re-draft for Vishwa's approval."
          : "No verified email. Contact marked dead_end.",
      });
    }
  );

  server.registerTool(
    "jamie_add_lesson",
    {
      description: "Save something learned about doing the work: ATS quirks, Vishwa's rules, mistakes to avoid. Topic like 'ats:ashby', 'outreach', 'form_filling'.",
      inputSchema: { topic: z.string(), lesson: z.string(), source: z.string().optional() },
    },
    async ({ topic, lesson, source }) =>
      ok(await one("INSERT INTO lessons (topic, lesson, source) VALUES ($1,$2,$3) RETURNING *", [topic, lesson, source ?? null]))
  );

  server.registerTool(
    "jamie_search_lessons",
    {
      description: "Search lessons by topic prefix (e.g. 'ats:') or free text. Call before working on a new ATS.",
      inputSchema: { topic: z.string().optional(), query: z.string().optional() },
    },
    async ({ topic, query }) => {
      const tq = query ? tsOr(query) : null;
      return ok(
        await q(
          `SELECT * FROM lessons WHERE ($1::text IS NULL OR topic LIKE $1 || '%')
           AND ($2::text IS NULL OR to_tsvector('english', topic || ' ' || lesson) @@ to_tsquery('english', $2))
           ORDER BY created_at DESC LIMIT 30`,
          [topic ?? null, tq]
        )
      );
    }
  );

  server.registerTool(
    "jamie_update_settings",
    {
      description:
        "Change guardrail settings. ONLY when Vishwa explicitly asks (e.g. pause or resume guessed sends, change caps).",
      inputSchema: {
        mass_apps_daily_cap: z.number().int().optional(),
        company_bounce_cap: z.number().int().optional(),
        daily_send_limit: z.number().int().optional(),
        max_patterns_per_person: z.number().int().optional(),
        max_years_experience: z.number().int().optional().describe("Scout preference: roles asking for fewer than this many years rank higher. Never a hard filter."),
        guessing_paused: z.boolean().optional(),
        scout_max_age_hours: z.number().int().min(1).max(720).optional().describe("Scout freshness window in hours"),
        scout_exclude_agencies: z.boolean().optional().describe("Scout rejects staffing and recruiting agency postings"),
        admin_autopilot: z.boolean().optional().describe("Administrator applies and submits without stopping for approval (Vishwa turned this on Nov 20, 2026)"),
        admin_run_cap: z.number().int().min(1).max(45).optional().describe("Most applications Administrator submits in one run"),
        admin_max_failure_streak: z.number().int().min(1).max(10).optional().describe("Failed applications in a row before autopilot pauses itself"),
      },
    },
    async (s) => {
      for (const [k, v] of Object.entries(s)) if (v !== undefined) await setSetting(k, v);
      return ok(await q("SELECT * FROM settings ORDER BY key"));
    }
  );

  server.registerTool(
    "jamie_weekly_summary",
    {
      description: "Weekly summary: applications, sends, bounces, bounce rate, Apollo credits, brain growth.",
      inputSchema: { days: z.number().int().optional() },
    },
    async ({ days }) => {
      const d = days ?? 7;
      const s = await one(
        `SELECT
           (SELECT count(*) FROM applications WHERE submitted_at > now() - make_interval(days => $1)) submitted,
           (SELECT count(*) FROM applications WHERE submitted_at > now() - make_interval(days => $1) AND tier='quality') quality,
           (SELECT count(*) FROM sends WHERE sent_at > now() - make_interval(days => $1)) sends,
           (SELECT count(*) FROM sends WHERE bounced AND sent_at > now() - make_interval(days => $1)) bounces,
           (SELECT COALESCE(sum(credits),0) FROM apollo_usage WHERE created_at > now() - make_interval(days => $1)) apollo_credits,
           (SELECT count(*) FROM answers WHERE approved AND created_at > now() - make_interval(days => $1)) new_answers,
           (SELECT count(*) FROM facts WHERE created_at > now() - make_interval(days => $1)) new_facts,
           (SELECT count(*) FROM lessons WHERE created_at > now() - make_interval(days => $1)) new_lessons`,
        [d]
      );
      const sends = Number(s.sends);
      return ok({ ...s, bounce_rate: sends ? `${Math.round((Number(s.bounces) / sends) * 100)}%` : "n/a", days: d });
    }
  );

  registerProjectLabTools(server);
  registerScoutTools(server);
  registerStylistTools(server);
  registerAdministratorTools(server);

  return server;
}
