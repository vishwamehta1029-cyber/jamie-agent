import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { q, one, getSetting } from "./db.js";
import {
  extractYears, extractSkills, detectCsDegree, titleMatch, isSweFocused, isSeniorTitle, detectAgency,
  isOutsideUS, extractSalary, parseLinkedInPosted, fitReason, htmlToText,
} from "./scoutParse.js";
import { detectBoard, fetchBoard, probeCompany, type Posting, type Ats } from "./scoutAts.js";

// Scout: finds fresh, strong-fit job postings, filters them against Vishwa's rules, ranks them,
// and logs the skills employers ask for. Code does the reading, filtering and scoring.
// The LLM only supplies LinkedIn page text (no public feed) and presents results. Spec: agents/scout.md

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
const MIN_TITLE_RATING_FOR_SWEEP = 3;

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

export function experienceRating(minYears: number | null | undefined, preferBelow: number, pickedByVishwa: boolean, senior = false): number {
  if (pickedByVishwa) return 5;
  if (minYears !== null && minYears !== undefined) return minYears < preferBelow ? 5 : 2;
  return senior ? 2 : 5;
}

export function score(job: {
  title_rating: number; skill_rating: number; experience: number; is_agency: boolean;
  recently_funded?: boolean; yc?: boolean; hiring_manager?: string | null; location?: string | null; work_mode?: string | null;
}) {
  const parts = {
    title_match: job.title_rating * WEIGHTS.title_match,
    skill_overlap: job.skill_rating * WEIGHTS.skill_overlap,
    experience_fit: job.experience * WEIGHTS.experience_fit,
    direct_employer: (job.is_agency ? 0 : 5) * WEIGHTS.direct_employer,
    location: locationRating(job.location, job.work_mode) * WEIGHTS.location,
    recently_funded: (job.recently_funded ? 5 : 0) * WEIGHTS.recently_funded,
    hiring_manager_named: (job.hiring_manager ? 5 : 0) * WEIGHTS.hiring_manager_named,
    yc: (job.yc ? 5 : 0) * WEIGHTS.yc,
  };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { score: Math.round((total / MAX_SCORE) * 100), parts };
}

// Vishwa's skills, from Jamie's brain only.
export async function herSkills(): Promise<Set<string>> {
  const facts = await q(
    `SELECT fact FROM facts WHERE active AND (category IN ('skills','skill_levels','project','projects','summary')
       OR category LIKE 'experience%')`
  );
  return new Set(extractSkills(facts.map((r: any) => r.fact).join("\n")));
}

type Rules = { preferBelow: number; maxAgeHours: number; excludeAgencies: boolean };
async function rules(): Promise<Rules> {
  const [a, b, c] = await Promise.all([
    getSetting<number>("max_years_experience"),
    getSetting<number>("scout_max_age_hours"),
    getSetting<boolean>("scout_exclude_agencies"),
  ]);
  return { preferBelow: Number(a ?? 3), maxAgeHours: Number(b ?? 24), excludeAgencies: c === true };
}

export type RawJob = {
  run_id?: number | null;
  source: string;
  external_id?: string | null;
  url: string;
  company: string;
  real_employer?: string | null;
  role: string;
  location?: string | null;
  work_mode?: string | null;
  posted_at?: string | null;
  is_repost?: boolean | null;
  repost_proof?: string | null;
  description?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  hiring_manager?: string | null;
  recently_funded?: boolean;
  yc?: boolean;
  max_age_hours?: number;
};

export type Evaluation = {
  verdict: "shortlisted" | "rejected";
  reasons: string[];
  flags: string[];
  fit_score: number;
  score_parts: Record<string, number>;
  resume: string;
  fit_reason: string;
  min_years: number | null;
  years_quote: string | null;
  skills: string[];
  extracted: Record<string, unknown>;
};

/** Pure decision logic: every rule and score is computed here, in code. */
export async function evaluate(j: RawJob, r: Rules, skills: Set<string>): Promise<Evaluation> {
  const text = j.description ?? "";
  const reasons: string[] = [];
  const flags: string[] = [];
  const picked = j.source === "linkedin_saved";

  // 1. Original listings only. Job-board feeds come straight from the employer, so they count as original.
  if (j.is_repost === true) reasons.push("reposted listing");
  else if (j.is_repost !== false || !j.repost_proof) reasons.push("repost status not verified");

  // 2. Degree and role type
  const deg = detectCsDegree(text);
  if (deg.required) reasons.push("requires a CS degree");
  else if (deg.mentioned) flags.push("mentions a CS degree (or equivalent)");
  if (isSweFocused(j.role)) reasons.push("primarily software engineering");

  // 3. Freshness (her own saved jobs are exempt)
  if (j.posted_at) {
    const ageHours = (Date.now() - new Date(j.posted_at).getTime()) / 3_600_000;
    const limit = j.max_age_hours ?? r.maxAgeHours;
    if (Number.isNaN(ageHours)) flags.push("posted date unreadable");
    else if (ageHours > limit && !picked) reasons.push(`posted ${Math.round(ageHours)}h ago (limit ${Math.round(limit)}h)`);
  } else flags.push("posted date unknown");

  // 4. US only
  if (isOutsideUS(j.location)) reasons.push(`outside the US (${j.location})`);

  // 5. Agencies
  const agency = detectAgency(j.company, text);
  if (agency) {
    if (r.excludeAgencies) reasons.push("staffing or recruiting agency");
    else if (!j.real_employer) flags.push("agency, real employer unknown");
  }

  // 6. Already applied
  const employer = j.real_employer || j.company;
  const prior = await q(
    `SELECT id, role, status FROM applications
     WHERE lower(company) LIKE '%' || lower($1) || '%' OR lower($1) LIKE '%' || lower(company) || '%'`,
    [employer.trim()]
  );
  const sameRole = prior.filter((p: any) => norm(p.role).includes(norm(j.role)) || norm(j.role).includes(norm(p.role)));
  if (sameRole.some((p: any) => p.status !== "skipped")) reasons.push("already applied or in progress for this role");
  else if (prior.length) flags.push(`applied to ${prior.length} other role(s) here`);

  // Scoring (experience is a preference only; never rejects or flags)
  const years = extractYears(text);
  const t = titleMatch(j.role);
  if (t.rating === 0 && !picked) flags.push("not a target title");
  const jobSkills = extractSkills(`${j.role}\n${text}`);
  const matched = jobSkills.filter((k) => skills.has(k));
  const skillRating = jobSkills.length ? Math.round(((5 * matched.length) / jobSkills.length) * 10) / 10 : 3;
  const senior = isSeniorTitle(j.role);
  const experience = experienceRating(years?.min, r.preferBelow, picked, senior);
  const s = score({
    title_rating: picked ? Math.max(t.rating, 3) : t.rating, skill_rating: skillRating, experience, is_agency: agency,
    recently_funded: j.recently_funded, yc: j.yc, hiring_manager: j.hiring_manager, location: j.location, work_mode: j.work_mode,
  });
  const rtype = resumeType(j.role);
  if (rtype === "ask") flags.push("resume choice unclear, ask Vishwa");

  // Her own saved jobs are her decision: only "already applied" rejects one; every other rule becomes a flag
  if (picked) {
    const all = reasons.splice(0);
    for (const why of all) {
      if (/already applied/.test(why)) reasons.push(why);
      else flags.push(`her pick despite: ${why}`);
    }
  }

  const salary = j.salary_min && j.salary_max ? { min: j.salary_min, max: j.salary_max } : extractSalary(text);
  return {
    verdict: reasons.length ? "rejected" : "shortlisted",
    reasons, flags, fit_score: s.score, score_parts: s.parts, resume: rtype,
    fit_reason: fitReason({
      family: t.family, skillsMatched: matched, skillsTotal: jobSkills.length, location: j.location, workMode: j.work_mode,
      minYears: years?.min ?? null, preferBelow: r.preferBelow, agency, source: j.source,
    }),
    min_years: years?.min ?? null, years_quote: years?.quote ?? null, skills: jobSkills,
    extracted: {
      title_family: t.family, title_rating: t.rating, skill_rating: skillRating, skills_matched: matched,
      senior_title: senior, agency, cs_degree: deg, salary,
    },
  };
}

async function save(j: RawJob, e: Evaluation): Promise<number> {
  const salary = (e.extracted.salary as any) ?? null;
  const row = await one(
    `INSERT INTO jobs (run_id, source, external_id, url, company, real_employer, role, location, work_mode, posted_at,
       is_repost, repost_proof, min_years, years_quote, requires_cs_degree, swe_focused, is_agency, hiring_manager,
       salary_min, salary_max, skills, signals, fit_score, fit_reason, resume, flags, status, reject_reasons, extracted)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
     ON CONFLICT DO NOTHING RETURNING id`,
    [
      j.run_id ?? null, j.source, j.external_id ?? null, j.url, j.company.trim(), j.real_employer ?? null, j.role.trim(),
      j.location ?? null, j.work_mode ?? null, j.posted_at ?? null, j.is_repost ?? null, j.repost_proof ?? null,
      e.min_years, e.years_quote, !!(e.extracted.cs_degree as any)?.required, isSweFocused(j.role), !!e.extracted.agency,
      j.hiring_manager ?? null, salary?.min ?? null, salary?.max ?? null, e.skills,
      JSON.stringify({ recently_funded: !!j.recently_funded, yc: !!j.yc }), e.fit_score, e.fit_reason, e.resume, e.flags,
      e.verdict, e.reasons, JSON.stringify(e.extracted),
    ]
  );
  if (!row) return 0;
  for (const k of e.skills) await q("INSERT INTO job_skills (job_id, skill) VALUES ($1, $2) ON CONFLICT DO NOTHING", [row.id, k]);
  return row.id;
}

async function findDuplicate(j: { source: string; external_id?: string | null; url: string; company: string; role: string }) {
  return one(
    `SELECT id, status, company, role FROM jobs
     WHERE ($1::text IS NOT NULL AND source = $2 AND external_id = $1)
        OR url = $3
        OR (lower(company) = lower($4) AND lower(role) = lower($5) AND found_at > now() - interval '30 days')
     LIMIT 1`,
    [j.external_id ?? null, j.source, j.url, j.company.trim(), j.role.trim()]
  );
}

export async function shortlistCount() {
  const r = await one("SELECT count(*) n FROM jobs WHERE status = 'shortlisted'");
  return Number(r?.n ?? 0);
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

const BOARD_SOURCES = ["greenhouse", "lever", "ashby"];

export function registerScoutTools(server: McpServer) {
  server.registerTool(
    "jamie_scout_watch",
    {
      description:
        "Scout's company watchlist (companies whose job boards it reads directly). action=add: pass a careers or job URL (Greenhouse, Lever, Ashby) or just a company name and the server finds its board. action=seed: learn boards from past applications' job links, then try to find boards for the rest by name (10 per call; call again while 'remaining' > 0). action=list or remove.",
      inputSchema: {
        action: z.enum(["add", "seed", "list", "remove"]),
        company: z.string().optional(),
        url: z.string().optional(),
        id: z.number().int().optional(),
        source: z.string().optional(),
      },
    },
    async ({ action, company, url, id, source }) => {
      if (action === "list") {
        const rows = await q("SELECT * FROM scout_watchlist ORDER BY active DESC, company");
        return ok({ total: rows.length, active: rows.filter((r: any) => r.active).length, companies: rows });
      }
      if (action === "remove") {
        if (!id) throw new Error("id is required");
        return ok(await one("UPDATE scout_watchlist SET active = FALSE WHERE id = $1 RETURNING *", [id]));
      }
      if (action === "add") {
        if (!company && !url) throw new Error("company or url is required");
        let board = url ? detectBoard(url) : null;
        if (!board && company) {
          const found = await probeCompany(company);
          if (found) board = { ats: found.ats, token: found.token };
        }
        if (!board) return ok({ added: false, reason: "No Greenhouse, Lever or Ashby board found. Track this company through LinkedIn instead." });
        const row = await one(
          `INSERT INTO scout_watchlist (company, ats, token, source) VALUES ($1,$2,$3,$4)
           ON CONFLICT (ats, token) DO UPDATE SET active = TRUE, company = EXCLUDED.company RETURNING *`,
          [company ?? board.token, board.ats, board.token, source ?? "manual"]
        );
        return ok({ added: true, board: row });
      }
      // seed
      const apps = await q("SELECT DISTINCT ON (lower(company)) company, url FROM applications ORDER BY lower(company), created_at DESC");
      let fromLinks = 0;
      const needProbe: string[] = [];
      for (const a of apps) {
        const b = a.url ? detectBoard(a.url) : null;
        if (b) {
          const r = await one(
            "INSERT INTO scout_watchlist (company, ats, token, source) VALUES ($1,$2,$3,'applications') ON CONFLICT (ats, token) DO NOTHING RETURNING id",
            [a.company, b.ats, b.token]
          );
          if (r) fromLinks++;
        } else needProbe.push(a.company);
      }
      const watched = new Set((await q("SELECT lower(company) c FROM scout_watchlist")).map((r: any) => r.c));
      const tried = new Set((await q("SELECT lower(company) c FROM scout_watchlist_misses")).map((r: any) => r.c));
      const todo = needProbe.filter((c) => !watched.has(c.toLowerCase()) && !tried.has(c.toLowerCase()) && !/staffing|recruit|search|talent/i.test(c));
      const batch = todo.slice(0, 10);
      const found: any[] = [];
      await pool(batch, 5, async (c) => {
        const f = await probeCompany(c);
        if (f) {
          await q("INSERT INTO scout_watchlist (company, ats, token, source) VALUES ($1,$2,$3,'applications') ON CONFLICT (ats, token) DO NOTHING", [c, f.ats, f.token]);
          found.push({ company: c, ...f });
        } else {
          await q("INSERT INTO scout_watchlist_misses (company) VALUES ($1) ON CONFLICT DO NOTHING", [c]);
        }
      });
      const total = Number((await one("SELECT count(*) n FROM scout_watchlist WHERE active")).n);
      return ok({ added_from_job_links: fromLinks, found_by_name: found, remaining: Math.max(0, todo.length - batch.length), watchlist_size: total });
    }
  );

  server.registerTool(
    "jamie_scout_sweep",
    {
      description:
        "Scout's main job: read watched companies' job boards directly (no browsing), keep target titles, and run every posting through Scout's rules and scoring in code. Checks the companies due longest first, 15 per call by default; call again with the same run_id while remaining_companies > 0. Covers the gap since each company's last check (up to 72 hours) so nothing is missed between runs.",
      inputSchema: { run_id: z.number().int().optional(), limit: z.number().int().min(1).max(30).optional() },
    },
    async ({ run_id, limit }) => {
      const run = run_id
        ? await one("SELECT * FROM scout_runs WHERE id = $1", [run_id])
        : await one("INSERT INTO scout_runs (sources, query) VALUES ('{job_boards}', 'sweep') RETURNING *");
      const r = await rules();
      const skills = await herSkills();
      const due = await q(
        `SELECT * FROM scout_watchlist WHERE active AND (last_checked_at IS NULL OR last_checked_at < now() - interval '6 hours')
         ORDER BY last_checked_at NULLS FIRST LIMIT $1`,
        [limit ?? 15]
      );
      const stats: Record<string, number> = { companies: 0, postings: 0, target_titles: 0, shortlisted: 0, rejected: 0, already_seen: 0, board_errors: 0 };
      const reasons: Record<string, number> = {};
      await pool(due, 6, async (w: any) => {
        const postings = await fetchBoard(w.ats as Ats, w.token);
        stats.companies++;
        if (!postings) {
          stats.board_errors++;
          await q("UPDATE scout_watchlist SET last_checked_at = now(), last_error = 'board not reachable' WHERE id = $1", [w.id]);
          return;
        }
        const sinceLast = w.last_checked_at ? (Date.now() - new Date(w.last_checked_at).getTime()) / 3_600_000 + 1 : r.maxAgeHours;
        const window = Math.min(72, Math.max(r.maxAgeHours, sinceLast));
        const ids = postings.map((p) => p.external_id);
        const existing = new Set((await q("SELECT external_id FROM jobs WHERE source = $1 AND external_id = ANY($2)", [w.ats, ids])).map((x: any) => x.external_id));
        for (const p of postings as Posting[]) {
          stats.postings++;
          if (titleMatch(p.title).rating < MIN_TITLE_RATING_FOR_SWEEP) continue;
          stats.target_titles++;
          if (existing.has(p.external_id)) { stats.already_seen++; continue; }
          const raw: RawJob = {
            run_id: run.id, source: w.ats, external_id: p.external_id, url: p.url, company: w.company, role: p.title,
            location: p.location, work_mode: p.work_mode, posted_at: p.posted_at, is_repost: false,
            repost_proof: `Direct from ${w.company}'s ${w.ats} job board, first published ${p.posted_at ?? "date not given"}`,
            description: p.description, salary_min: p.salary_min, salary_max: p.salary_max, max_age_hours: window,
          };
          const e = await evaluate(raw, r, skills);
          if (e.verdict === "rejected") {
            stats.rejected++;
            for (const x of e.reasons) {
              const key = x.replace(/^posted .*/, "too old").replace(/\s*\(.*\)$/, "").trim();
              reasons[key] = (reasons[key] ?? 0) + 1;
            }
            // Routine rejections (too old, outside the US) aren't stored, so the audit trail stays readable
            if (!e.reasons.every((x) => /^posted |^outside the US/.test(x))) await save(raw, e);
            continue;
          }
          if (await save(raw, e)) stats.shortlisted++;
        }
        await q("UPDATE scout_watchlist SET last_checked_at = now(), last_jobs = $2, last_error = NULL WHERE id = $1", [w.id, postings.length]);
      });
      const remaining = Number((await one(
        "SELECT count(*) n FROM scout_watchlist WHERE active AND (last_checked_at IS NULL OR last_checked_at < now() - interval '6 hours')"
      )).n);
      const prev = (await one("SELECT stats FROM scout_runs WHERE id = $1", [run.id]))?.stats ?? {};
      const merged: Record<string, any> = { ...prev };
      for (const [k, v] of Object.entries(stats)) merged[k] = (Number(prev[k]) || 0) + v;
      const mergedReasons: Record<string, number> = { ...(prev.reject_reasons ?? {}) };
      for (const [k, v] of Object.entries(reasons)) mergedReasons[k] = (mergedReasons[k] ?? 0) + v;
      merged.reject_reasons = mergedReasons;
      await q("UPDATE scout_runs SET stats = $2 WHERE id = $1", [run.id, JSON.stringify(merged)]);
      return ok({
        run_id: run.id, this_call: stats, reject_reasons: reasons, remaining_companies: remaining,
        next: remaining ? "Call jamie_scout_sweep again with this run_id." : "Sweep done. Run jamie_scout_qa action=check, then show jamie_scout_shortlist.",
      });
    }
  );

  server.registerTool(
    "jamie_scout_add_job",
    {
      description:
        "Scout: submit one posting from a source with no public feed (her LinkedIn saved jobs, LinkedIn search, YC Work at a Startup). Paste the page text in page_text; the server reads the posted label (Reposted / '14 hours ago'), years, skills, degree, salary, agency and location, applies every rule, scores it and saves it. Do not judge or summarize; just pass what is on the page.",
      inputSchema: {
        run_id: z.number().int().optional(),
        source: z.enum(["linkedin_saved", "linkedin_search", "yc_work_at_a_startup", "career_page", "other"]),
        external_id: z.string().optional().describe("e.g. the LinkedIn job id from the URL"),
        url: z.string(),
        company: z.string(),
        role: z.string(),
        location: z.string().optional(),
        work_mode: z.enum(["remote", "hybrid", "onsite"]).optional(),
        page_text: z.string().describe("The full text of the job page, copied as-is (get_page_text)"),
        hiring_manager: z.string().optional().describe("Only if the page names one"),
        real_employer: z.string().optional(),
        recently_funded: z.boolean().optional(),
        yc: z.boolean().optional(),
      },
    },
    async (a) => {
      const dup = await findDuplicate({ source: a.source, external_id: a.external_id, url: a.url, company: a.company, role: a.role });
      if (dup) return ok({ verdict: "duplicate", existing: dup });
      const text = /<[a-z][\s\S]*>/i.test(a.page_text) ? htmlToText(a.page_text) : a.page_text;
      const posted = parseLinkedInPosted(text);
      const raw: RawJob = {
        run_id: a.run_id ?? null, source: a.source, external_id: a.external_id ?? null, url: a.url, company: a.company,
        real_employer: a.real_employer ?? null, role: a.role, location: a.location ?? null, work_mode: a.work_mode ?? null,
        posted_at: posted.postedAt, is_repost: posted.isRepost, repost_proof: posted.proof,
        description: text, hiring_manager: a.hiring_manager ?? null, recently_funded: a.recently_funded, yc: a.yc,
      };
      // A job-board link gets the employer's own published date instead of LinkedIn's label
      const board = detectBoard(a.url);
      if (board) {
        const postings = await fetchBoard(board.ats, board.token);
        const match = postings?.find((p) => a.url.includes(p.external_id));
        if (match) {
          raw.posted_at = match.posted_at;
          raw.is_repost = false;
          raw.repost_proof = `Direct from the ${board.ats} job board, first published ${match.posted_at}`;
          raw.description = match.description || text;
        }
      }
      const r = await rules();
      const e = await evaluate(raw, r, await herSkills());
      const id = await save(raw, e);
      const { extracted, ...rest } = e;
      return ok({ job_id: id, ...rest });
    }
  );

  server.registerTool(
    "jamie_scout_run",
    {
      description: "Scout: start a run (returns run_id and the live rules) or finish it (returns counts, rejection reasons, sweep stats and the top 10).",
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
        const r = await rules();
        return ok({
          run,
          rules: {
            prefer_min_years_below: r.preferBelow, max_age_hours: r.maxAgeHours, exclude_agencies: r.excludeAgencies,
            original_listings_only: true, no_cs_degree_or_pure_swe: true, us_only: true,
          },
          watchlist_size: Number((await one("SELECT count(*) n FROM scout_watchlist WHERE active")).n),
        });
      }
      if (!run_id) throw new Error("run_id is required to finish a run");
      await q("UPDATE scout_runs SET status = 'done', finished_at = now(), notes = COALESCE($2, notes) WHERE id = $1", [run_id, notes ?? null]);
      const counts = await q("SELECT status, count(*) n FROM jobs WHERE run_id = $1 GROUP BY status", [run_id]);
      const reasons = await q("SELECT r reason, count(*) n FROM jobs, unnest(reject_reasons) r WHERE run_id = $1 GROUP BY r ORDER BY n DESC", [run_id]);
      const run = await one("SELECT stats FROM scout_runs WHERE id = $1", [run_id]);
      const top = await q(
        "SELECT id, company, role, fit_score, fit_reason, resume, url FROM jobs WHERE run_id = $1 AND status = 'shortlisted' ORDER BY fit_score DESC LIMIT 10",
        [run_id]
      );
      return ok({ run_id, counts, reject_reasons: reasons, sweep_stats: run?.stats ?? {}, top });
    }
  );

  server.registerTool(
    "jamie_scout_shortlist",
    {
      description: "Scout: ranked shortlist of jobs that passed every rule and haven't been handed off. Defaults to the top 20.",
      inputSchema: { run_id: z.number().int().optional(), limit: z.number().int().max(100).optional() },
    },
    async ({ run_id, limit }) =>
      ok(await q(
        `SELECT id, company, real_employer, role, location, work_mode, posted_at, min_years, years_quote, fit_score,
                fit_reason, resume, hiring_manager, salary_min, salary_max, flags, url, source, qa_checked
         FROM jobs WHERE status = 'shortlisted' AND ($1::int IS NULL OR run_id = $1)
         ORDER BY fit_score DESC, posted_at DESC NULLS LAST LIMIT $2`,
        [run_id ?? null, limit ?? 20]
      ))
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
      return ok(await one(
        `UPDATE jobs SET status = $2, application_id = COALESCE($3, application_id),
           reject_reasons = CASE WHEN $4::text IS NULL THEN reject_reasons ELSE array_append(reject_reasons, $4) END,
           updated_at = now() WHERE id = $1 RETURNING id, company, role, status, application_id`,
        [job_id, status, application_id ?? null, reason ?? null]
      ));
    }
  );

  server.registerTool(
    "jamie_scout_qa",
    {
      description:
        "Quality check before showing the shortlist. action=check: the server re-reads every shortlisted job-board posting (still listed, same title, same publish date) and expires or rejects any that changed; it also picks a random 20% of LinkedIn/manual jobs for Jamie to re-open. action=record: save Jamie's result for one of those; a failure rejects the job and means the batch goes back to Scout.",
      inputSchema: {
        action: z.enum(["check", "record"]),
        run_id: z.number().int().optional(),
        job_id: z.number().int().optional(),
        passed: z.boolean().optional(),
        note: z.string().optional(),
      },
    },
    async ({ action, run_id, job_id, passed, note }) => {
      if (action === "check") {
        const jobs = await q(
          "SELECT * FROM jobs WHERE status = 'shortlisted' AND NOT qa_checked AND ($1::int IS NULL OR run_id = $1)",
          [run_id ?? null]
        );
        const boardJobs = jobs.filter((j: any) => BOARD_SOURCES.includes(j.source));
        const manual = jobs.filter((j: any) => !BOARD_SOURCES.includes(j.source));
        const auto = { verified: 0, expired: 0, changed: 0, unreachable: 0 };
        const watch = await q("SELECT ats, token, company FROM scout_watchlist");
        const byBoard = new Map<string, any[]>();
        for (const j of boardJobs) {
          const b = detectBoard(j.url) ?? watch.find((w: any) => w.ats === j.source && w.company === j.company);
          const key = b ? `${b.ats}|${b.token}` : `${j.source}|?`;
          byBoard.set(key, [...(byBoard.get(key) ?? []), j]);
        }
        await pool([...byBoard.entries()], 6, async ([key, list]) => {
          const [ats, token] = key.split("|");
          const live = token !== "?" ? await fetchBoard(ats as Ats, token) : null;
          for (const j of list) {
            if (!live) { auto.unreachable++; continue; }
            const p = live.find((x) => x.external_id === j.external_id);
            if (!p) {
              auto.expired++;
              await q("UPDATE jobs SET status = 'expired', qa_checked = TRUE, qa_result = 'no longer listed', updated_at = now() WHERE id = $1", [j.id]);
            } else if (norm(p.title) !== norm(j.role) || (j.posted_at && p.posted_at && new Date(p.posted_at).getTime() !== new Date(j.posted_at).getTime())) {
              auto.changed++;
              await q("UPDATE jobs SET status = 'rejected', qa_checked = TRUE, qa_result = 'posting changed since Scout saw it', reject_reasons = array_append(reject_reasons, 'failed QA: posting changed'), updated_at = now() WHERE id = $1", [j.id]);
            } else {
              auto.verified++;
              await q("UPDATE jobs SET qa_checked = TRUE, qa_result = 'verified live on job board' WHERE id = $1", [j.id]);
            }
          }
        });
        const n = manual.length ? Math.max(1, Math.ceil(manual.length * 0.2)) : 0;
        const sample = [...manual].sort(() => Math.random() - 0.5).slice(0, n)
          .map((j: any) => ({ id: j.id, company: j.company, role: j.role, url: j.url, years_quote: j.years_quote, repost_proof: j.repost_proof }));
        return ok({
          auto_checked: auto, manual_jobs: manual.length, manual_sample: sample,
          check: sample.length ? "Open each sampled link. Confirm not reposted, still open, years quote matches. Then record each." : "Nothing left for Jamie to check.",
        });
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
      return ok({ job: row, next: passed ? "Continue with the sample." : "QA failed. Send the batch back to Scout: re-add each LinkedIn job from a fresh copy of its page." });
    }
  );

  server.registerTool(
    "jamie_scout_skill_demand",
    {
      description:
        "Scout's market intel: skills employers ask for most in recent postings, with job counts and whether Jamie's brain shows Vishwa has each one. Gaps feed Project Lab's suggestions.",
      inputSchema: { days: z.number().int().max(365).optional(), limit: z.number().int().max(100).optional(), shortlisted_only: z.boolean().optional() },
    },
    async ({ days, limit, shortlisted_only }) => {
      const rows = await q(
        `SELECT s.skill, count(DISTINCT s.job_id) jobs FROM job_skills s JOIN jobs j ON j.id = s.job_id
         WHERE j.found_at > now() - ($1::int * interval '1 day') AND (NOT $2 OR j.status IN ('shortlisted','handed_off','applied'))
         GROUP BY s.skill ORDER BY jobs DESC, s.skill LIMIT $3`,
        [days ?? 30, shortlisted_only ?? true, limit ?? 30]
      );
      const mine = await herSkills();
      return ok(rows.map((r: any) => ({ skill: r.skill, jobs: Number(r.jobs), in_brain: mine.has(r.skill) })));
    }
  );
}
