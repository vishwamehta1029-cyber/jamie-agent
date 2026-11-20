import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { q, one, getSetting } from "./db.js";

// Scout: finds fresh, strong-fit job postings, filters them against Vishwa's hard rules,
// ranks them, and logs the skills employers ask for. Spec: agents/scout.md

const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Score weights. Ratings are 0-5; booleans count as 5 or 0.
export const WEIGHTS = {
  title_match: 3,
  skill_overlap: 3,
  experience_fit: 2,
  direct_employer: 3,
  location: 2,
  recently_funded: 2,
  hiring_manager_named: 1,
  yc: 1,
} as const;
const MAX_SCORE = Object.values(WEIGHTS).reduce((a, w) => a + w * 5, 0);

export function locationRating(location?: string | null, workMode?: string | null): number {
  const s = `${location ?? ""} ${workMode ?? ""}`.toLowerCase();
  if (/remote/.test(s) || /seattle|bellevue|redmond|kirkland/.test(s)) return 5;
  if (/san francisco|bay area|\bsf\b|palo alto|mountain view|san jose|oakland|menlo park/.test(s)) return 3.5;
  if (/new york|\bnyc\b|brooklyn/.test(s)) return 2;
  return 1;
}

export function resumeType(role: string): "fde" | "ai_engineer" | "gtm" | "ask" {
  const r = role.toLowerCase();
  if (/\bgtm\b|go-to-market|growth|revops|marketing/.test(r)) return "gtm";
  if (/forward deployed|deployment|solutions|implementation|support|customer|strategist|value engineer|consultant/.test(r)) return "fde";
  if (/\bai\b|machine learning|\bml\b|llm|agent|applied/.test(r)) return "ai_engineer";
  return "ask";
}

type Signals = {
  title_match?: number;
  skill_overlap?: number;
  recently_funded?: boolean;
  yc?: boolean;
};

export function experienceRating(minYears: number | null | undefined, preferBelow: number, pickedByVishwa: boolean): number {
  if (pickedByVishwa || minYears === null || minYears === undefined) return 5;
  return minYears < preferBelow ? 5 : 2;
}

export function score(job: {
  signals: Signals;
  is_agency: boolean;
  experience: number;
  hiring_manager?: string | null;
  location?: string | null;
  work_mode?: string | null;
}) {
  const s = job.signals;
  const clamp = (n?: number) => Math.max(0, Math.min(5, n ?? 0));
  const parts = {
    title_match: clamp(s.title_match) * WEIGHTS.title_match,
    skill_overlap: clamp(s.skill_overlap) * WEIGHTS.skill_overlap,
    experience_fit: job.experience * WEIGHTS.experience_fit,
    direct_employer: (job.is_agency ? 0 : 5) * WEIGHTS.direct_employer,
    location: locationRating(job.location, job.work_mode) * WEIGHTS.location,
    recently_funded: (s.recently_funded ? 5 : 0) * WEIGHTS.recently_funded,
    hiring_manager_named: (job.hiring_manager ? 5 : 0) * WEIGHTS.hiring_manager_named,
    yc: (s.yc ? 5 : 0) * WEIGHTS.yc,
  };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { score: Math.round((total / MAX_SCORE) * 100), parts };
}

const jobInput = {
  run_id: z.number().int().optional(),
  source: z.enum(["linkedin_saved", "linkedin_search", "yc_work_at_a_startup", "career_page", "other"]),
  external_id: z.string().optional().describe("e.g. the LinkedIn job id"),
  url: z.string().describe("Direct link to the posting or application"),
  company: z.string(),
  real_employer: z.string().optional().describe("For agency postings: the hiring company, if identifiable"),
  role: z.string(),
  location: z.string().optional(),
  work_mode: z.enum(["remote", "hybrid", "onsite"]).optional(),
  posted_at: z.string().optional().describe("ISO date the listing was ORIGINALLY posted"),
  is_repost: z.boolean().optional().describe("true if LinkedIn labels it Reposted or the original date is older than the shown date"),
  repost_proof: z.string().optional().describe("Required when is_repost=false: what you checked, e.g. 'no Reposted label; listed 14 hours ago'"),
  min_years: z.number().min(0).max(30).optional().describe("Lowest number of years the posting asks for. For a range like 2-4 or 1-4 use the lower number. Omit if not stated."),
  years_quote: z.string().optional().describe("The exact posting text about experience"),
  requires_cs_degree: z.boolean().optional(),
  swe_focused: z.boolean().optional().describe("Primarily a software engineering role"),
  is_agency: z.boolean().optional().describe("Posted by a staffing or recruiting agency"),
  hiring_manager: z.string().optional(),
  salary_min: z.number().int().optional(),
  salary_max: z.number().int().optional(),
  skills: z.array(z.string()).optional().describe("Skills and tools the posting asks for"),
  signals: z
    .object({
      title_match: z.number().min(0).max(5).optional().describe("5 = exact target title"),
      skill_overlap: z.number().min(0).max(5).optional().describe("Overlap with her verified skills and projects"),
      recently_funded: z.boolean().optional(),
      yc: z.boolean().optional(),
    })
    .optional(),
  fit_reason: z.string().optional().describe("Two lines on why it fits"),
};

export async function shortlistCount() {
  const r = await one("SELECT count(*) n FROM jobs WHERE status = 'shortlisted'");
  return Number(r?.n ?? 0);
}

export function registerScoutTools(server: McpServer) {
  server.registerTool(
    "jamie_scout_run",
    {
      description:
        "Scout: start a run before searching (returns run_id; pass it to every jamie_scout_add_job), and finish it after. Finishing returns counts and the top of the shortlist.",
      inputSchema: {
        action: z.enum(["start", "finish"]),
        run_id: z.number().int().optional(),
        sources: z.array(z.string()).optional(),
        query: z.string().optional(),
        notes: z.string().optional(),
      },
    },
    async ({ action, run_id, sources, query, notes }) => {
      if (action === "start") {
        const run = await one("INSERT INTO scout_runs (sources, query) VALUES ($1, $2) RETURNING *", [sources ?? [], query ?? null]);
        const [maxYears, maxAge, excludeAgencies] = await Promise.all([
          getSetting<number>("max_years_experience"),
          getSetting<number>("scout_max_age_hours"),
          getSetting<boolean>("scout_exclude_agencies"),
        ]);
        return ok({
          run,
          rules: {
            prefer_min_years_below: Number(maxYears),
            max_age_hours: Number(maxAge),
            exclude_agencies: excludeAgencies === true,
            original_listings_only: true,
            no_cs_degree_or_pure_swe: true,
          },
        });
      }
      if (!run_id) throw new Error("run_id is required to finish a run");
      await q("UPDATE scout_runs SET status = 'done', finished_at = now(), notes = COALESCE($2, notes) WHERE id = $1", [run_id, notes ?? null]);
      const counts = await q("SELECT status, count(*) n FROM jobs WHERE run_id = $1 GROUP BY status", [run_id]);
      const reasons = await q(
        "SELECT r reason, count(*) n FROM jobs, unnest(reject_reasons) r WHERE run_id = $1 GROUP BY r ORDER BY n DESC",
        [run_id]
      );
      const top = await q(
        "SELECT id, company, role, fit_score, resume, url FROM jobs WHERE run_id = $1 AND status = 'shortlisted' ORDER BY fit_score DESC LIMIT 10",
        [run_id]
      );
      return ok({ run_id, counts, reject_reasons: reasons, top, next: "Run jamie_scout_qa action=sample before handing the shortlist to Jamie." });
    }
  );

  server.registerTool(
    "jamie_scout_add_job",
    {
      description:
        "Scout: submit one posting you found. The server applies Vishwa's hard rules (original listing only with proof, no CS-degree or pure SWE roles, freshness window, agencies, already applied, duplicates), computes the fit score and resume type, logs the skills, and saves it as shortlisted or rejected with reasons. Experience is a preference only: roles asking for fewer than 3 years rank higher, nothing is rejected or flagged for experience, and jobs from her own saved list are never marked down. Report facts honestly; never guess min_years.",
      inputSchema: jobInput,
    },
    async (a) => {
      // Duplicate check
      const dup = await one(
        `SELECT id, status, company, role FROM jobs
         WHERE ($1::text IS NOT NULL AND source = $2 AND external_id = $1)
            OR url = $3
            OR (lower(company) = lower($4) AND lower(role) = lower($5) AND found_at > now() - interval '30 days')
         LIMIT 1`,
        [a.external_id ?? null, a.source, a.url, a.company.trim(), a.role.trim()]
      );
      if (dup) return ok({ verdict: "duplicate", existing: dup });

      const [maxYears, maxAge, excludeAgencies] = await Promise.all([
        getSetting<number>("max_years_experience"),
        getSetting<number>("scout_max_age_hours"),
        getSetting<boolean>("scout_exclude_agencies"),
      ]);
      const reasons: string[] = [];
      const flags: string[] = [];

      // 1. Original listings only, with proof
      if (a.is_repost === true) reasons.push("reposted listing");
      else if (a.is_repost === undefined || !a.repost_proof) reasons.push("repost status not verified");

      // 2. Experience is a preference, not a rule: it only affects ranking (see score), never rejects or flags.

      // 3. Degree and role type
      if (a.requires_cs_degree) reasons.push("requires a CS degree");
      if (a.swe_focused) reasons.push("primarily software engineering");

      // 4. Freshness
      if (a.posted_at) {
        const ageHours = (Date.now() - new Date(a.posted_at).getTime()) / 3_600_000;
        if (Number.isNaN(ageHours)) flags.push("posted date unreadable");
        else if (ageHours > Number(maxAge)) reasons.push(`posted ${Math.round(ageHours)}h ago (limit ${maxAge}h)`);
      } else flags.push("posted date unknown");

      // 5. Agencies
      if (a.is_agency) {
        if (excludeAgencies === true) reasons.push("staffing or recruiting agency");
        else if (!a.real_employer) flags.push("agency, real employer unknown");
      }

      // 6. Already applied
      const employer = a.real_employer || a.company;
      const prior = await q(
        `SELECT id, role, status FROM applications
         WHERE lower(company) LIKE '%' || lower($1) || '%' OR lower($1) LIKE '%' || lower(company) || '%'`,
        [employer.trim()]
      );
      const sameRole = prior.filter((p: any) => norm(p.role).includes(norm(a.role)) || norm(a.role).includes(norm(p.role)));
      if (sameRole.some((p: any) => p.status !== "skipped")) reasons.push("already applied or in progress for this role");
      else if (prior.length) flags.push(`applied to ${prior.length} other role(s) here`);

      const signals: Signals = a.signals ?? {};
      const experience = experienceRating(a.min_years, Number(maxYears), a.source === "linkedin_saved");
      const s = score({ signals, is_agency: !!a.is_agency, experience, hiring_manager: a.hiring_manager, location: a.location, work_mode: a.work_mode });
      const rtype = resumeType(a.role);
      if (rtype === "ask") flags.push("resume choice unclear, ask Vishwa");
      const status = reasons.length ? "rejected" : "shortlisted";

      const job = await one(
        `INSERT INTO jobs (run_id, source, external_id, url, company, real_employer, role, location, work_mode, posted_at,
           is_repost, repost_proof, min_years, years_quote, requires_cs_degree, swe_focused, is_agency, hiring_manager,
           salary_min, salary_max, skills, signals, fit_score, fit_reason, resume, flags, status, reject_reasons)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
         RETURNING id`,
        [
          a.run_id ?? null, a.source, a.external_id ?? null, a.url, a.company.trim(), a.real_employer ?? null, a.role.trim(),
          a.location ?? null, a.work_mode ?? null, a.posted_at ?? null, a.is_repost ?? null, a.repost_proof ?? null,
          a.min_years ?? null, a.years_quote ?? null, !!a.requires_cs_degree, !!a.swe_focused, !!a.is_agency,
          a.hiring_manager ?? null, a.salary_min ?? null, a.salary_max ?? null, a.skills ?? [], JSON.stringify(signals),
          s.score, a.fit_reason ?? null, rtype, flags, status, reasons,
        ]
      );
      const skills = Array.from(new Set((a.skills ?? []).map((k) => k.trim().toLowerCase()).filter(Boolean)));
      for (const k of skills) await q("INSERT INTO job_skills (job_id, skill) VALUES ($1, $2) ON CONFLICT DO NOTHING", [job.id, k]);

      return ok({ job_id: job.id, verdict: status, reasons, flags, fit_score: s.score, score_parts: s.parts, resume: rtype });
    }
  );

  server.registerTool(
    "jamie_scout_shortlist",
    {
      description: "Scout: ranked shortlist of jobs that passed every rule and haven't been handed off yet. Defaults to the top 20.",
      inputSchema: { run_id: z.number().int().optional(), limit: z.number().int().max(100).optional() },
    },
    async ({ run_id, limit }) =>
      ok(
        await q(
          `SELECT id, company, real_employer, role, location, work_mode, posted_at, min_years, years_quote, fit_score,
                  fit_reason, resume, hiring_manager, flags, url, qa_checked
           FROM jobs WHERE status = 'shortlisted' AND ($1::int IS NULL OR run_id = $1)
           ORDER BY fit_score DESC, found_at DESC LIMIT $2`,
          [run_id ?? null, limit ?? 20]
        )
      )
  );

  server.registerTool(
    "jamie_scout_set_status",
    {
      description:
        "Scout: move a job on. handed_off = given to Administrator to apply; applied = linked to an application (pass application_id); skipped = Vishwa passed on it (give reason); expired = posting closed.",
      inputSchema: {
        job_id: z.number().int(),
        status: z.enum(["handed_off", "applied", "skipped", "expired"]),
        application_id: z.number().int().optional(),
        reason: z.string().optional(),
      },
    },
    async ({ job_id, status, application_id, reason }) => {
      const j = await one("SELECT * FROM jobs WHERE id = $1", [job_id]);
      if (!j) throw new Error(`job ${job_id} not found`);
      if (j.status === "rejected" && status !== "expired") {
        return ok({ refused: true, reason: `Job ${job_id} failed Scout's rules (${j.reject_reasons.join("; ")}). It can't be handed off.` });
      }
      if (status === "applied" && !application_id) return ok({ refused: true, reason: "Pass the application_id from jamie_log_application." });
      return ok(
        await one(
          `UPDATE jobs SET status = $2, application_id = COALESCE($3, application_id),
             reject_reasons = CASE WHEN $4::text IS NULL THEN reject_reasons ELSE array_append(reject_reasons, $4) END,
             updated_at = now() WHERE id = $1 RETURNING id, company, role, status, application_id`,
          [job_id, status, application_id ?? null, reason ?? null]
        )
      );
    }
  );

  server.registerTool(
    "jamie_scout_qa",
    {
      description:
        "Jamie's quality check on Scout. action=sample returns a random 20% (at least 1) of a run's shortlisted jobs to re-verify against the live posting. action=record saves the result; a failed job is rejected, and any failure means the whole batch goes back to Scout.",
      inputSchema: {
        action: z.enum(["sample", "record"]),
        run_id: z.number().int().optional(),
        job_id: z.number().int().optional(),
        passed: z.boolean().optional(),
        note: z.string().optional(),
      },
    },
    async ({ action, run_id, job_id, passed, note }) => {
      if (action === "sample") {
        if (!run_id) throw new Error("run_id is required");
        const total = Number((await one("SELECT count(*) n FROM jobs WHERE run_id = $1 AND status = 'shortlisted'", [run_id])).n);
        const n = Math.max(1, Math.ceil(total * 0.2));
        const sample = await q(
          `SELECT id, company, role, url, posted_at, is_repost, repost_proof, min_years, years_quote FROM jobs
           WHERE run_id = $1 AND status = 'shortlisted' AND NOT qa_checked ORDER BY random() LIMIT $2`,
          [run_id, n]
        );
        return ok({ shortlisted: total, sample_size: sample.length, sample, check: "Open each URL. Confirm it is not reposted, the experience quote matches, it is still open, and it is not already applied to." });
      }
      if (!job_id || passed === undefined) throw new Error("job_id and passed are required");
      const row = await one(
        `UPDATE jobs SET qa_checked = TRUE, qa_result = $3,
           status = CASE WHEN $2 THEN status ELSE 'rejected' END,
           reject_reasons = CASE WHEN $2 THEN reject_reasons ELSE array_append(reject_reasons, 'failed QA: ' || COALESCE($3, '')) END,
           updated_at = now()
         WHERE id = $1 RETURNING id, run_id, status`,
        [job_id, passed, note ?? null]
      );
      return ok({
        job: row,
        next: passed ? "Continue with the sample." : "QA failed. Send the whole batch back to Scout to re-check every job against the rules before handing anything off.",
      });
    }
  );

  server.registerTool(
    "jamie_scout_skill_demand",
    {
      description:
        "Scout's market intel: the skills employers ask for most in recent postings, with job counts and whether Jamie's brain shows Vishwa has each one. Gaps feed Project Lab's suggestions.",
      inputSchema: { days: z.number().int().max(365).optional(), limit: z.number().int().max(100).optional(), shortlisted_only: z.boolean().optional() },
    },
    async ({ days, limit, shortlisted_only }) => {
      const rows = await q(
        `SELECT s.skill, count(DISTINCT s.job_id) jobs
         FROM job_skills s JOIN jobs j ON j.id = s.job_id
         WHERE j.found_at > now() - ($1::int * interval '1 day') AND (NOT $2 OR j.status IN ('shortlisted','handed_off','applied'))
         GROUP BY s.skill ORDER BY jobs DESC, s.skill LIMIT $3`,
        [days ?? 30, shortlisted_only ?? true, limit ?? 30]
      );
      const facts = await q("SELECT lower(fact) f FROM facts WHERE active AND category IN ('skills','skill_levels','experience','project','experience:profundity','experience:culminate','experience:curiouser','projects')");
      const corpus = facts.map((r: any) => r.f).join(" \n ");
      return ok(
        rows.map((r: any) => ({
          skill: r.skill,
          jobs: Number(r.jobs),
          in_brain: corpus.includes(r.skill.toLowerCase()),
        }))
      );
    }
  );
}
