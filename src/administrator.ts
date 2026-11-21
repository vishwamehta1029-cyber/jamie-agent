// Administrator: applies to jobs end to end. Code decides the resume, every factual answer, the salary,
// duplicates and caps, and checks every written answer. The LLM only drives the browser and writes the
// few free-text answers code can't. Autopilot (Vishwa's choice, Nov 20 2026): no approval stops.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createHash } from "node:crypto";
import { z } from "zod";
import { q, one, getSetting } from "./db.js";
import { loadItems } from "./stylist.js";
import { buildModel, renderPdf } from "./stylistResume.js";
import { extractSalary } from "./scoutParse.js";
import {
  pickVariant, salaryFor, resolveStandard, checkAnswer, numberTokens, detectAts, normRole,
  ATS_PLAYBOOK, RESUME_FILES, type Variant, type Question, type Filled,
} from "./adminRules.js";

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

async function activeFactIds(): Promise<Set<number>> {
  return new Set((await q("SELECT id FROM facts WHERE active")).map((r: any) => r.id));
}

/** Every number that appears in an active brain fact or an approved answer: the only numbers a written answer may use. */
async function brainNumbers(): Promise<Set<string>> {
  const rows = await q("SELECT fact AS t FROM facts WHERE active UNION ALL SELECT answer AS t FROM answers WHERE approved");
  const out = new Set<string>();
  for (const r of rows as any[]) for (const t of numberTokens(String(r.t))) { out.add(t.base); if (t.unit) out.add(t.base + t.unit); }
  return out;
}

const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !/^(the|and|you|your|for|are|what|why|how|this|with|our|have|would|tell|about)$/.test(w)));
const overlap = (a: string, b: string) => {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
};

export async function findDuplicate(company: string, role: string, url?: string | null) {
  const rows = await q("SELECT id, company, role, url, status, submitted_at FROM applications WHERE lower(company) = lower($1) AND status NOT IN ('skipped')", [company]);
  return (rows as any[]).find((r) => (url && r.url === url) || normRole(r.role) === normRole(role)) ?? null;
}

async function massToday(): Promise<{ used: number; cap: number }> {
  const cap = Number((await getSetting("mass_apps_daily_cap")) ?? 45);
  const r = await one("SELECT count(*) n FROM applications WHERE tier = 'mass' AND status = 'submitted' AND submitted_at >= date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'America/Los_Angeles'");
  return { used: Number(r?.n ?? 0), cap };
}

export async function renderResume(variant: Variant) {
  const items = await loadItems();
  if (!items.some((i) => i.surfaces.includes(`resume:${variant}`))) throw new Error("Stylist has no resume content yet; run jamie_stylist_seed once");
  const { pdf, pages } = await renderPdf(buildModel(items, `resume:${variant}`));
  return { pdf, pages, filename: RESUME_FILES[variant], sha256: createHash("sha256").update(pdf).digest("hex").slice(0, 16) };
}

export async function adminStatus() {
  const r = await one(`SELECT
      count(*) FILTER (WHERE status = 'handoff') AS handoffs,
      count(*) FILTER (WHERE status = 'submitted' AND autopilot AND submitted_at > now() - interval '24 hours') AS autopilot_24h
    FROM applications`);
  return { handoffs_waiting_for_vishwa: Number(r?.handoffs ?? 0), submitted_by_autopilot_last_24h: Number(r?.autopilot_24h ?? 0) };
}

export function registerAdministratorTools(server: McpServer) {
  server.registerTool(
    "jamie_admin_queue",
    {
      description: "Administrator: the next jobs to apply to, best first, from Scout's shortlist. Duplicates are already removed in code; each comes with its resume pick and ATS.",
      inputSchema: { limit: z.number().int().min(1).max(50).optional() },
    },
    async ({ limit }) => {
      const jobs = await q("SELECT id, company, role, url, fit_score, fit_reason, status, resume FROM jobs WHERE status IN ('shortlisted','handed_off') ORDER BY fit_score DESC NULLS LAST, id LIMIT 200");
      const out: any[] = [];
      for (const j of jobs as any[]) {
        if (out.length >= (limit ?? 10)) break;
        const dup = await findDuplicate(j.company, j.role, j.url);
        if (dup) { await q("UPDATE jobs SET status = 'applied' WHERE id = $1 AND $2::text = 'submitted'", [j.id, dup.status]); continue; }
        const ats = detectAts(j.url);
        const pv = ["fde", "ai_engineer", "gtm"].includes(j.resume) ? { variant: j.resume as Variant } : pickVariant(j.role);
        out.push({ scout_job_id: j.id, company: j.company, role: j.role, url: j.url, ats, resume: RESUME_FILES[pv.variant], fit: j.fit_score, why: j.fit_reason, needs_vishwa: ATS_PLAYBOOK[ats]?.handoff ?? null });
      }
      return ok({ autopilot: (await getSetting("admin_autopilot")) !== false, mass_apps: await massToday(), queue: out });
    }
  );

  server.registerTool(
    "jamie_admin_prepare",
    {
      description: "Administrator: start one application. Code checks duplicates and the daily mass cap, picks the resume, works out salary, opens the application record, and returns the ATS playbook and past lessons. Then call jamie_admin_resume and upload it.",
      inputSchema: {
        company: z.string(), role: z.string(), url: z.string(),
        scout_job_id: z.number().int().optional(),
        job_description: z.string().optional().describe("Posting text, used for the resume pick and salary range"),
        tier: z.enum(["mass", "quality"]).optional(),
        location: z.string().optional(),
        source: z.string().optional().describe("Where the job was found (LinkedIn, company site...)"),
      },
    },
    async (a) => {
      const dup = await findDuplicate(a.company, a.role, a.url);
      if (dup) return ok({ skip: true, reason: `already ${dup.status} (application #${dup.id})`, application: dup });
      const tier = a.tier ?? "mass";
      if (tier === "mass") {
        const m = await massToday();
        if (m.used >= m.cap) return ok({ stop: true, reason: `daily mass cap reached (${m.used}/${m.cap}); tell Vishwa and stop mass apps for today` });
      }
      const ats = detectAts(a.url);
      const pv = pickVariant(a.role, a.job_description ?? "");
      const range = extractSalary(a.job_description ?? "");
      const autopilot = (await getSetting("admin_autopilot")) !== false;
      const app = await one(
        `INSERT INTO applications (company, role, url, location, ats, resume_used, tier, status, job_id, jd_text, source, autopilot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'in_progress',$8,$9,$10,$11) RETURNING id`,
        [a.company, a.role, a.url, a.location ?? null, ats, RESUME_FILES[pv.variant], tier, a.scout_job_id ? String(a.scout_job_id) : null, a.job_description ?? null, a.source ?? "LinkedIn", autopilot]
      );
      if (a.scout_job_id) await q("UPDATE jobs SET status = 'handed_off' WHERE id = $1", [a.scout_job_id]);
      const lessons = await q("SELECT lesson FROM lessons WHERE topic = $1 OR topic = 'ats:any' ORDER BY id DESC LIMIT 15", [`ats:${ats}`]);
      const play = ATS_PLAYBOOK[ats];
      return ok({
        application_id: app.id,
        autopilot,
        resume: { variant: pv.variant, filename: RESUME_FILES[pv.variant], why: pv.why },
        salary: salaryFor(a.job_description ?? "", range),
        ats, upload_resume_to: play.resume, ats_notes: play.notes, lessons: lessons.map((l: any) => l.lesson),
        handoff: play.handoff ?? null,
        next: play.handoff
          ? `Call jamie_admin_done outcome "handoff" with reason "${play.handoff}".`
          : "jamie_admin_resume, upload it, read every field, then jamie_admin_fill with all questions.",
      });
    }
  );

  server.registerTool(
    "jamie_admin_resume",
    {
      description: "Administrator: the current approved resume as a PDF (rendered live from Stylist, so always the latest version). Write base64 to /tmp/jamie/<filename>, then upload that path with the browser's file upload tool. Never use an older copy.",
      inputSchema: { variant: z.enum(["fde", "ai_engineer", "gtm"]) },
    },
    async ({ variant }) => {
      const r = await renderResume(variant);
      return ok({ filename: r.filename, bytes: r.pdf.length, pages: r.pages, sha256: r.sha256, save_to: `/tmp/jamie/${r.filename}`, base64: r.pdf.toString("base64") });
    }
  );

  server.registerTool(
    "jamie_admin_fill",
    {
      description: "Administrator: send every question on the form (label, type, options, required, max_chars). Code answers all factual ones (contact, links, work authorization, sponsorship, salary, start date, education, EEO, yes/no logistics) and reuses saved answers. Only needs_writing comes back for you to write, using the posting's exact keywords and only facts from the brain.",
      inputSchema: {
        application_id: z.number().int(),
        questions: z.array(z.object({ label: z.string(), type: z.string().optional(), options: z.array(z.string()).optional(), required: z.boolean().optional(), max_chars: z.number().int().optional() })),
      },
    },
    async ({ application_id, questions }) => {
      const app = await one("SELECT * FROM applications WHERE id = $1", [application_id]);
      if (!app) return ok({ refused: true, reason: "no such application" });
      const facts = await activeFactIds();
      const ctx = { jd: app.jd_text ?? "", source: app.source ?? "LinkedIn" };
      const bank = await q("SELECT id, question, answer, role_type FROM answers WHERE approved AND reusable");
      const filled: (Filled & { answer_id?: number })[] = [];
      const needs: any[] = [];
      const blocked: any[] = [];
      const skippedOptional: string[] = [];
      for (const qn of questions as Question[]) {
        if (/resume|\bcv\b/i.test(qn.label) && (qn.type === "file" || /upload|attach/i.test(qn.label))) { filled.push({ label: qn.label, value: `upload ${app.resume_used}`, source: "resume", fact_ids: [] }); continue; }
        const s = resolveStandard(qn, ctx, facts);
        if (s && "blocked" in s) { blocked.push(s); continue; }
        if (s) { filled.push(s); continue; }
        const best = (bank as any[]).map((b) => ({ b, score: overlap(qn.label, b.question) })).sort((x, y) => y.score - x.score)[0];
        if (best && best.score >= 0.75 && (!qn.max_chars || best.b.answer.length <= qn.max_chars) && !qn.options?.length) {
          filled.push({ label: qn.label, value: best.b.answer, source: "bank", fact_ids: [], answer_id: best.b.id });
          continue;
        }
        if (qn.required === false && !qn.options?.length) { skippedOptional.push(qn.label); continue; }
        const near = (bank as any[]).map((b) => ({ id: b.id, question: b.question, answer: b.answer, score: overlap(qn.label, b.question) })).filter((x) => x.score >= 0.3).sort((x, y) => y.score - x.score).slice(0, 3);
        needs.push({ label: qn.label, options: qn.options, max_chars: qn.max_chars, start_from: near });
      }
      await q("UPDATE applications SET status = 'in_progress', updated_at = now() WHERE id = $1", [application_id]);
      return ok({
        filled, needs_writing: needs, blocked, optional_left_blank: skippedOptional,
        rules_for_writing: [
          "Use only facts in Jamie's brain; mirror the posting's exact keywords where true",
          "Short and specific; her voice; no em dashes; never frame learning or ramping up as a challenge",
          "Run jamie_admin_check on everything you write, fix every problem, then submit",
        ],
      });
    }
  );

  server.registerTool(
    "jamie_admin_check",
    {
      description: "Administrator: code checks for answers you wrote (em dashes, numbers not in the brain, length limits, learning-as-a-challenge framing, inflated titles). Fix and re-check until every answer is clean.",
      inputSchema: { answers: z.array(z.object({ question: z.string(), answer: z.string(), max_chars: z.number().int().optional() })) },
    },
    async ({ answers }) => {
      const nums = await brainNumbers();
      const results = answers.map((a) => ({ question: a.question, problems: checkAnswer(a.answer, { brainNumbers: nums, max_chars: a.max_chars }) }));
      return ok({ clean: results.every((r) => !r.problems.length), results });
    }
  );

  server.registerTool(
    "jamie_admin_done",
    {
      description: "Administrator: close out an application. outcome submitted (after the confirmation page shows), handoff (needs a sign-in, account, CAPTCHA, or anything only Vishwa can do), or skipped. For submitted, pass every answer that went in; code re-checks written answers, logs them for Vishwa's review, saves new ones to the answer bank and marks the Scout job applied.",
      inputSchema: {
        application_id: z.number().int(),
        outcome: z.enum(["submitted", "handoff", "skipped"]),
        answers: z.array(z.object({ question: z.string(), answer: z.string(), source: z.string().describe("standard:*, bank, resume, or written"), answer_id: z.number().int().optional() })).optional(),
        confirmation: z.string().optional().describe("Confirmation text or URL from the ATS"),
        reason: z.string().optional(),
      },
    },
    async ({ application_id, outcome, answers, confirmation, reason }) => {
      const app = await one("SELECT * FROM applications WHERE id = $1", [application_id]);
      if (!app) return ok({ refused: true, reason: "no such application" });
      if (outcome !== "submitted") {
        await q("UPDATE applications SET status = $2, notes = concat_ws(E'\\n', notes, $3::text), handoff_reason = $4, updated_at = now() WHERE id = $1",
          [application_id, outcome === "handoff" ? "handoff" : "skipped", reason ?? null, outcome === "handoff" ? reason ?? "needs Vishwa" : null]);
        if (app.job_id && outcome === "skipped") await q("UPDATE jobs SET status = 'skipped' WHERE id::text = $1", [app.job_id]);
        return ok({ recorded: outcome, application_id });
      }
      const written = (answers ?? []).filter((a) => a.source === "written");
      const nums = await brainNumbers();
      const bad = written.map((a) => ({ question: a.question, problems: checkAnswer(a.answer, { brainNumbers: nums }) })).filter((r) => r.problems.length);
      if (bad.length) return ok({ refused: true, reason: "written answers still have problems; this should have been fixed before submitting", bad });
      for (const a of (answers ?? []).filter((x) => !x.source.startsWith("standard:") && x.source !== "resume")) {
        let answerId = a.answer_id ?? null;
        if (a.source === "written") {
          const row = await one("INSERT INTO answers (question, answer, question_type, company, approved, reusable, application_id) VALUES ($1,$2,'written_by_autopilot',$3,false,true,$4) RETURNING id", [a.question, a.answer, app.company, application_id]);
          answerId = row.id;
        } else if (answerId) await q("UPDATE answers SET times_used = times_used + 1, updated_at = now() WHERE id = $1", [answerId]);
        await q("INSERT INTO submitted_answers (application_id, question, answer, answer_id) VALUES ($1,$2,$3,$4)", [application_id, a.question, a.answer, answerId]);
      }
      await q("UPDATE applications SET status = 'submitted', submitted_at = now(), notes = concat_ws(E'\\n', notes, $2::text), updated_at = now() WHERE id = $1", [application_id, confirmation ? `Confirmation: ${confirmation}` : null]);
      if (app.job_id) await q("UPDATE jobs SET status = 'applied' WHERE id::text = $1", [app.job_id]);
      return ok({ submitted: application_id, logged_answers: (answers ?? []).length, written_answers_for_vishwa_to_review: written.length, mass_apps: await massToday() });
    }
  );

  server.registerTool(
    "jamie_admin_report",
    {
      description: "Administrator: what autopilot did. Submitted applications, the answers it wrote (for Vishwa to read after the fact), and handoffs waiting on her.",
      inputSchema: { days: z.number().int().min(1).max(60).optional() },
    },
    async ({ days }) => {
      const d = days ?? 1;
      const submitted = await q("SELECT id, company, role, resume_used, tier, submitted_at FROM applications WHERE status = 'submitted' AND submitted_at > now() - ($1 || ' days')::interval ORDER BY submitted_at DESC", [String(d)]);
      const written = await q(`SELECT a.company, s.question, s.answer FROM submitted_answers s JOIN applications a ON a.id = s.application_id
        JOIN answers w ON w.id = s.answer_id WHERE w.question_type = 'written_by_autopilot' AND s.approved_at > now() - ($1 || ' days')::interval ORDER BY s.id DESC`, [String(d)]);
      const handoffs = await q("SELECT id, company, role, url, handoff_reason FROM applications WHERE status = 'handoff' ORDER BY updated_at DESC");
      return ok({ submitted, written_answers: written, handoffs_waiting_for_vishwa: handoffs, mass_apps_today: await massToday() });
    }
  );
}
