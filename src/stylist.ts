import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { q, one } from "./db.js";
import { STYLIST_SEED } from "./stylistSeed.js";
import { buildModel, modelToText, renderPdf, RESUME_SURFACES, type Item } from "./stylistResume.js";
import { extractSkills } from "./scoutParse.js";

// Stylist: keeps Vishwa's resumes and portfolio current. Every change is checked in code
// (provenance, approved numbers only, no em dashes, skills from the brain, one page, safe HTML),
// approved once, then published everywhere at the same moment. Spec: agents/stylist.md

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

// Key-order-independent JSON, so a change read back from the database compares equal to a new one
const stable = (v: any): string =>
  Array.isArray(v) ? `[${v.map(stable).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`
  : JSON.stringify(v);

export const SURFACES = [...RESUME_SURFACES, "portfolio"] as const;
const RESUME_KINDS = ["header", "summary", "role", "bullet", "project", "skill_group", "education"];
const PORTFOLIO_KINDS = ["case", "card", "chapter"];
const PROVENANCE_KINDS = ["summary", "role", "bullet", "project", "education"];
const ALLOWED_HTML = /^(mark|br|b|strong|i|em)$/i;

type Op = {
  op: "add" | "update" | "retire";
  key: string;
  kind?: string;
  parent_key?: string;
  surfaces?: string[];
  content?: Record<string, unknown>;
  fact_ids?: number[];
  order_no?: number;
};
type Check = { key: string; level: "error" | "warning"; msg: string };

export async function loadItems(includeInactive = false): Promise<Item[]> {
  return q(`SELECT * FROM stylist_items ${includeInactive ? "" : "WHERE active"} ORDER BY order_no, id`);
}

/** Apply ops to a copy of the items (nothing is saved). */
export function applyOps(items: Item[], ops: Op[]): { items: Item[]; diff: any[] } {
  const map = new Map(items.map((i) => [i.key, { ...i, content: { ...i.content } }]));
  const diff: any[] = [];
  for (const o of ops) {
    const cur = map.get(o.key);
    if (o.op === "add") {
      if (cur && cur.active) throw new Error(`"${o.key}" already exists; use update`);
      const next: Item = {
        key: o.key, kind: o.kind!, parent_key: o.parent_key ?? null, surfaces: o.surfaces ?? [],
        content: o.content ?? {}, fact_ids: o.fact_ids ?? [], order_no: o.order_no ?? 99, active: true,
      };
      map.set(o.key, next);
      diff.push({ op: "add", key: o.key, after: next.content, surfaces: next.surfaces });
    } else if (o.op === "update") {
      if (!cur) throw new Error(`"${o.key}" not found`);
      const next = {
        ...cur, content: { ...cur.content, ...(o.content ?? {}) }, surfaces: o.surfaces ?? cur.surfaces,
        fact_ids: o.fact_ids ?? cur.fact_ids, order_no: o.order_no ?? cur.order_no, parent_key: o.parent_key ?? cur.parent_key, active: true,
      };
      map.set(o.key, next);
      diff.push({ op: "update", key: o.key, before: cur.content, after: next.content, surfaces: next.surfaces });
    } else {
      if (!cur) throw new Error(`"${o.key}" not found`);
      map.set(o.key, { ...cur, active: false });
      for (const [k, v] of map) if (v.parent_key === o.key) map.set(k, { ...v, active: false });
      diff.push({ op: "retire", key: o.key, before: cur.content });
    }
  }
  return { items: [...map.values()], diff };
}

const numsIn = (t: string) =>
  (t.match(/(?<![A-Za-z0-9])~?\$?\d[\d,]*(?:\.\d+)?(?:\s?(?:%|\+|[kKmMbBxX]\b))?(?![A-Za-z0-9])/g) || [])
    .map((x) => x.replace(/[~$,\s+%]/g, "").replace(/[kKmMbBxX]$/, "").replace(/\.0+$/, ""))
    .filter(Boolean);

const textFields = (c: any): string[] => {
  const out: string[] = [];
  const walk = (v: any, k = "") => {
    if (typeof v === "string") { if (!["link", "email", "phone", "start", "end", "url"].includes(k)) out.push(v); }
    else if (Array.isArray(v)) v.forEach((x) => walk(x, k));
    else if (v && typeof v === "object") for (const [kk, vv] of Object.entries(v)) if (kk !== "links") walk(vv, kk);
  };
  walk(c);
  return out;
};

/** Every honesty and quality rule, in code. Errors block approval; warnings are shown. */
export async function runChecks(before: Item[], after: Item[], ops: Op[]): Promise<Check[]> {
  const checks: Check[] = [];
  const facts = await q("SELECT id, category, fact FROM facts WHERE active");
  const factById = new Map(facts.map((f: any) => [f.id, f]));
  const corpus = facts.map((f: any) => f.fact).join("\n").toLowerCase();
  const metricNums = new Set(facts.filter((f: any) => f.category === "metrics").flatMap((f: any) => numsIn(f.fact)));
  const touched = new Set(ops.filter((o) => o.op !== "retire").map((o) => o.key));

  for (const it of after.filter((i) => i.active && touched.has(i.key))) {
    const k = it.key;
    const strings = textFields(it.content);
    const all = strings.join(" ");
    const isResume = it.surfaces.some((s) => s.startsWith("resume:"));
    const isPortfolio = it.surfaces.includes("portfolio");

    if (!SURFACES.some((s) => it.surfaces.includes(s))) checks.push({ key: k, level: "error", msg: "needs at least one surface (resume:fde, resume:ai_engineer, resume:gtm, portfolio)" });
    if (isResume && !RESUME_KINDS.includes(it.kind)) checks.push({ key: k, level: "error", msg: `kind "${it.kind}" can't go on a resume` });
    if (isPortfolio && !PORTFOLIO_KINDS.includes(it.kind)) checks.push({ key: k, level: "error", msg: `kind "${it.kind}" can't go on the portfolio` });

    // No em dashes, anywhere
    if (/—/.test(all)) checks.push({ key: k, level: "error", msg: "contains an em dash" });

    // Provenance: resume content must cite active brain facts
    const cited = it.fact_ids.map((id) => factById.get(id));
    if (isResume && PROVENANCE_KINDS.includes(it.kind)) {
      if (!it.fact_ids.length) checks.push({ key: k, level: "error", msg: "resume content must cite the brain facts it comes from (fact_ids)" });
      else if (cited.some((f) => !f)) checks.push({ key: k, level: "error", msg: "cites a fact that doesn't exist or was retired" });
    }

    // Numbers: any NEW number must be an approved metric or appear in the cited facts
    // (portfolio text may also use numbers from any fact in the brain, like her guardrail limits)
    const prevItem = before.find((b) => b.key === k && b.active);
    const prevNums = new Set(prevItem ? numsIn(textFields(prevItem.content).join(" ")) : []);
    const allowed = new Set([
      ...metricNums,
      ...cited.filter(Boolean).flatMap((f: any) => numsIn(f.fact)),
      ...(isPortfolio && !isResume ? facts.flatMap((f: any) => numsIn(f.fact)) : []),
    ]);
    const bad = [...new Set(numsIn(all))].filter((n) => !prevNums.has(n) && !allowed.has(n) && !/^(19|20)\d\d$/.test(n));
    if (bad.length && (isResume || isPortfolio)) {
      checks.push({ key: k, level: "error", msg: `number(s) ${bad.join(", ")} aren't approved metrics or in the cited facts` });
    }

    // Role titles must match the brain exactly
    if (it.kind === "role") {
      const titles = [it.content.title, ...Object.values(it.content.title_by_surface ?? {})].filter(Boolean) as string[];
      for (const t of titles) if (!corpus.includes(t.toLowerCase())) checks.push({ key: k, level: "error", msg: `title "${t}" isn't in Jamie's brain` });
    }

    // Skills: every listed skill must be backed by the brain
    if (it.kind === "skill_group") {
      const stop = new Set(["and", "of", "the", "with", "for", "in", "to", "a"]);
      for (const s of (it.content.items ?? []) as string[]) {
        const words = s.toLowerCase().replace(/[()/,]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !stop.has(w));
        const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const backed = words.every((w) => new RegExp(`(?<![a-z0-9])${esc(w.slice(0, Math.min(5, w.length)))}`).test(corpus));
        if (!backed) checks.push({ key: k, level: "error", msg: `skill "${s}" isn't backed by any fact in Jamie's brain` });
      }
    }

    // Resume bullet length
    if (it.kind === "bullet" && String(it.content.text ?? "").length > 340) checks.push({ key: k, level: "warning", msg: "bullet is long (over ~3 lines); consider tightening" });

    // Portfolio HTML must be simple and safe
    if (isPortfolio) {
      for (const s of strings) for (const m of s.matchAll(/<\/?\s*([a-z0-9-]+)/gi)) {
        if (!ALLOWED_HTML.test(m[1])) checks.push({ key: k, level: "error", msg: `HTML tag <${m[1]}> isn't allowed (only mark, br, b, strong, i, em)` });
      }
      if (/on\w+\s*=|javascript:/i.test(all)) checks.push({ key: k, level: "error", msg: "scripts or event handlers aren't allowed" });
      const link = it.content.link;
      if (Array.isArray(link) && link[1] && !/^https:\/\//.test(String(link[1]))) checks.push({ key: k, level: "error", msg: "links must start with https://" });
    }
    if (Array.isArray(it.content.links)) {
      for (const l of it.content.links as any[]) {
        if (!l || !l.label || !/^https:\/\//.test(String(l.url ?? ""))) checks.push({ key: k, level: "error", msg: `link "${l?.label ?? "?"}" needs a label and an https:// address` });
      }
    }
  }

  // Each resume must still fit on one page (cut words, never shrink the type)
  const surfacesTouched = new Set(after.filter((i) => touched.has(i.key) || ops.some((o) => o.op === "retire" && o.key === i.key)).flatMap((i) => i.surfaces));
  for (const s of RESUME_SURFACES) {
    if (!surfacesTouched.has(s)) continue;
    const { pages } = await renderPdf(buildModel(after, s));
    if (pages > 1) checks.push({ key: s, level: "error", msg: `${s} would run to ${pages} pages; shorten or retire something` });
  }
  return checks;
}

export function portfolioFeed(items: Item[]) {
  const on = items.filter((i) => i.active && i.surfaces.includes("portfolio"));
  const by = (kind: string, prefix: string) =>
    Object.fromEntries(on.filter((i) => i.kind === kind).map((i) => [i.key.slice(prefix.length), i.content]));
  const cards = Object.fromEntries(on.filter((i) => i.kind === "card").map((i) => [i.key.slice(5), i.content.q]));
  return { cases: by("case", "case:"), cards, chapters: by("chapter", "chap:"), updated_at: new Date().toISOString() };
}

async function publish(changeId: number) {
  const ch = await one("SELECT * FROM stylist_changes WHERE id = $1", [changeId]);
  const ops: Op[] = ch.ops;
  const current = await loadItems(true);
  const { items } = applyOps(current, ops);
  const touchedKeys = new Set(ops.map((o) => o.key));
  for (const it of items) {
    const isChild = it.parent_key && touchedKeys.has(it.parent_key) && ops.some((o) => o.op === "retire" && o.key === it.parent_key);
    if (!touchedKeys.has(it.key) && !isChild) continue;
    await q(
      `INSERT INTO stylist_items (key, kind, parent_key, surfaces, content, fact_ids, order_no, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (key) DO UPDATE SET kind = EXCLUDED.kind, parent_key = EXCLUDED.parent_key, surfaces = EXCLUDED.surfaces,
         content = EXCLUDED.content, fact_ids = EXCLUDED.fact_ids, order_no = EXCLUDED.order_no, active = EXCLUDED.active,
         version = stylist_items.version + 1, updated_at = now()`,
      [it.key, it.kind, it.parent_key, it.surfaces, JSON.stringify(it.content), it.fact_ids, it.order_no, it.active]
    );
  }
  await q("UPDATE stylist_changes SET status = 'published', decided_at = COALESCE(decided_at, now()), published_at = now() WHERE id = $1", [changeId]);
}

function links() {
  const base = process.env.JAMIE_PUBLIC_URL || "https://jamie-mcp.vercel.app";
  return {
    portfolio_feed: `${base}/public/portfolio.json`,
    portfolio_site: "https://vishwamehta.vercel.app/",
    resumes: Object.fromEntries(RESUME_SURFACES.map((s) => [s, `${base}/<secret>/resume/${s.split(":")[1]}.pdf`])),
  };
}

async function createChange(trigger: string, summary: string, ops: Op[]) {
  const before = await loadItems(true);
  const { items: after, diff } = applyOps(before, ops);
  const checks = await runChecks(before, after, ops);
  const blocked = checks.some((c) => c.level === "error");
  const row = await one(
    "INSERT INTO stylist_changes (trigger, summary, ops, checks, status) VALUES ($1,$2,$3,$4,$5) RETURNING id, status",
    [trigger, summary, JSON.stringify(ops), JSON.stringify(checks), blocked ? "blocked" : "pending"]
  );
  return { change_id: row.id, status: row.status, checks, diff };
}

const DISPLAY: Record<string, string> = {
  sql: "SQL", aws: "AWS", gcp: "GCP", rag: "RAG", mcp: "MCP", llm: "LLMs", nlp: "NLP", etl: "ETL", "ci/cd": "CI/CD", "rest apis": "REST APIs",
  openai: "OpenAI API", claude: "Claude API", pgvector: "PostgreSQL (pgvector)", n8n: "n8n", dbt: "dbt", "a/b testing": "A/B testing",
};
const display = (s: string) => DISPLAY[s] ?? s.replace(/\b\w/g, (c) => c.toUpperCase());

/** Loads the starting content once. Safe to call any time: does nothing if content exists. */
export async function seedStylist(): Promise<number> {
  const n = Number((await one("SELECT count(*) n FROM stylist_items")).n);
  if (n) return 0;
  for (const it of STYLIST_SEED as any) {
    await q(
      "INSERT INTO stylist_items (key, kind, parent_key, surfaces, content, fact_ids, order_no) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (key) DO NOTHING",
      [it.key, it.kind, it.parent_key, it.surfaces, JSON.stringify(it.content), it.fact_ids, it.order_no]
    );
  }
  return STYLIST_SEED.length;
}

export async function stylistPendingCount() {
  return Number((await one("SELECT count(*) n FROM stylist_changes WHERE status IN ('pending','blocked')"))?.n ?? 0);
}

export function registerStylistTools(server: McpServer) {
  server.registerTool(
    "jamie_stylist_seed",
    {
      description: "Stylist: load the starting resume and portfolio content (resume from brain facts, portfolio from the live site). Runs once; refuses if content already exists.",
      inputSchema: {},
    },
    async () => {
      const n = Number((await one("SELECT count(*) n FROM stylist_items")).n);
      if (n) return ok({ refused: true, reason: `Stylist already has ${n} items.` });
      await seedStylist();
      const items = await loadItems();
      const fit: Record<string, number> = {};
      for (const s of RESUME_SURFACES) fit[s] = (await renderPdf(buildModel(items, s))).pages;
      return ok({ seeded: STYLIST_SEED.length, pages_per_resume: fit, links: links() });
    }
  );

  server.registerTool(
    "jamie_stylist_view",
    {
      description: "Stylist: what is live right now. For a resume surface, returns its text and page count; for portfolio, the content feed. Omit surface for a summary of everything.",
      inputSchema: { surface: z.enum(SURFACES).optional() },
    },
    async ({ surface }) => {
      const items = await loadItems();
      if (surface === "portfolio") return ok(portfolioFeed(items));
      if (surface) {
        const m = buildModel(items, surface);
        return ok({ surface, pages: (await renderPdf(m)).pages, text: modelToText(m), items: items.filter((i) => i.surfaces.includes(surface)).map((i) => ({ key: i.key, kind: i.kind, fact_ids: i.fact_ids })) });
      }
      const counts = Object.fromEntries(SURFACES.map((s) => [s, items.filter((i) => i.surfaces.includes(s)).length]));
      return ok({ items_per_surface: counts, pending_changes: await stylistPendingCount(), links: links() });
    }
  );

  server.registerTool(
    "jamie_stylist_propose",
    {
      description:
        "Stylist: propose a change to the resumes and/or portfolio. ops: add (key, kind, surfaces, content, fact_ids, parent_key for bullets), update (key + changed content fields), retire (key). Code checks every rule (cited facts, approved numbers only, titles and skills from the brain, no em dashes, one page per resume, safe portfolio HTML) and returns a before/after diff. Nothing goes live until Vishwa approves with jamie_stylist_decide. Write in her voice; keep bullets tight.",
      inputSchema: {
        summary: z.string().describe("One line: what changed and why"),
        trigger: z.enum(["project_lab", "new_fact", "vishwa", "auto"]).optional(),
        ops: z.array(z.object({
          op: z.enum(["add", "update", "retire"]),
          key: z.string().describe("e.g. bullet:profundity:fde2, project:cro:fde, skills:fde:1, case:jamie, card:jamie, chap:4"),
          kind: z.enum(["header", "summary", "role", "bullet", "project", "skill_group", "education", "case", "card", "chapter"]).optional(),
          parent_key: z.string().optional(),
          surfaces: z.array(z.enum(SURFACES)).optional(),
          content: z.record(z.any()).optional(),
          fact_ids: z.array(z.number().int()).optional(),
          order_no: z.number().int().optional(),
        })).min(1),
      },
    },
    async ({ summary, trigger, ops }) => {
      try {
        return ok(await createChange(trigger ?? "vishwa", summary, ops as Op[]));
      } catch (e: any) {
        return ok({ refused: true, reason: e.message });
      }
    }
  );

  server.registerTool(
    "jamie_stylist_auto",
    {
      description:
        "Stylist's automatic pass, all in code: (1) adds skills the brain shows she has but no resume lists, (2) updates project links when Project Lab ships something live, and (3) lists brain facts and shipped projects that need a new bullet worded (needs_wording). Creates pending changes for 1 and 2; for 3, draft the wording and call jamie_stylist_propose.",
      inputSchema: {},
    },
    async () => {
      const items = await loadItems();
      const created: any[] = [];
      const pendingOps = (await q("SELECT ops FROM stylist_changes WHERE status IN ('pending','blocked')")).map((r: any) => stable(r.ops));
      const propose = async (summary: string, ops: Op[]) => {
        if (pendingOps.includes(stable(ops))) return;
        created.push({ summary, ...(await createChange("auto", summary, ops)) });
      };

      // 1. Skills the brain shows but no resume lists (only skills from facts she stated or that came from her resumes)
      const facts = await q("SELECT id, category, fact, source FROM facts WHERE active AND (category IN ('skills','skill_levels','project','projects') OR category LIKE 'experience%')");
      const brainSkills = new Set(extractSkills(facts.map((f: any) => f.fact).join("\n")));
      const listed = new Set(extractSkills(items.filter((i) => i.kind === "skill_group").flatMap((i) => i.content.items).join(", ")));
      const missingAll = [...brainSkills].filter((s) => !listed.has(s));
      // Each resume has its own skill groups; new skills go into the first group of each resume that lacks them
      const firstGroups = RESUME_SURFACES.map((surf) => items.filter((i) => i.active && i.kind === "skill_group" && i.surfaces.includes(surf)).sort((a, b) => a.order_no - b.order_no)[0]).filter(Boolean) as Item[];
      let skillsSkipped: string[] = [];
      if (missingAll.length && firstGroups.length) {
        // Most-requested first (from Scout's job data), then add only as many as keep every resume on one page
        const demand = new Map((await q("SELECT skill, count(DISTINCT job_id) n FROM job_skills GROUP BY skill")).map((r: any) => [r.skill, Number(r.n)]));
        const ranked = missingAll.sort((a, b) => (demand.get(b) ?? 0) - (demand.get(a) ?? 0));
        const fits: string[] = [];
        const opsFor = (add: string[]): Op[] => firstGroups.map((g) => ({ op: "update", key: g.key, content: { items: [...g.content.items, ...add.map(display)] } }) as Op);
        for (const sk of ranked) {
          const trial = applyOps(items, opsFor([...fits, sk])).items;
          let ok1 = true;
          for (const surf of RESUME_SURFACES) if ((await renderPdf(buildModel(trial, surf))).pages > 1) { ok1 = false; break; }
          if (ok1) fits.push(sk); else skillsSkipped.push(display(sk));
        }
        if (fits.length) {
          const sources = facts.filter((f: any) => fits.some((m) => extractSkills(f.fact).includes(m))).map((f: any) => f.id);
          await propose(`Add skills from the brain that no resume lists: ${fits.map(display).join(", ")}`,
            opsFor(fits).map((o, i) => ({ ...o, fact_ids: [...new Set([...firstGroups[i].fact_ids, ...sources])] })));
        }
      }

      // 2. Project Lab shipped or live projects: sync links on the resume and portfolio
      const projects = await q("SELECT * FROM projects WHERE live_url IS NOT NULL AND in_scope");
      for (const p of projects) {
        const name = String(p.name).toLowerCase().split(/\s+/)[0];
        // Every resume variant of this project: a linked name points at the live demo, otherwise add a Live Demo link
        const linkOps: Op[] = [];
        for (const rp of items.filter((i) => i.active && i.kind === "project" && String(i.content.name).toLowerCase().includes(name))) {
          const projLinks: any[] = Array.isArray(rp.content.links) ? rp.content.links : [];
          if (rp.content.name_url) {
            if (rp.content.name_url !== p.live_url) linkOps.push({ op: "update", key: rp.key, content: { name_url: p.live_url } } as Op);
          } else if (!projLinks.some((l) => l.url === p.live_url)) {
            linkOps.push({ op: "update", key: rp.key, content: { links: [{ label: "Live Demo", url: p.live_url }, ...projLinks.filter((l) => !/live demo/i.test(l.label))] } } as Op);
          }
        }
        if (linkOps.length) await propose(`Add the live demo link for ${p.name}`, linkOps);
        const kase = items.find((i) => i.kind === "case" && String(i.content.title).toLowerCase().includes(name));
        if (kase && (!Array.isArray(kase.content.link) || kase.content.link[1] !== p.live_url)) {
          await propose(`Point the ${p.name} case study at the live demo`, [{ op: "update", key: kase.key, content: { link: ["Try the live demo ↗", p.live_url] } }]);
        }
      }

      // 3. What needs a human-quality sentence
      const cited = new Set(items.flatMap((i) => i.fact_ids));
      const needs = facts
        .filter((f: any) => !cited.has(f.id) && (f.category === "project" || f.category.startsWith("experience:")) && f.source !== "found_during_application")
        .map((f: any) => ({ fact_id: f.id, category: f.category, fact: f.fact }));
      const shipped = projects.filter((p: any) => p.status === "shipped" && !items.some((i) => i.kind === "project" && String(i.content.name).toLowerCase().includes(String(p.name).toLowerCase().split(/\s+/)[0])))
        .map((p: any) => ({ project: p.name, one_liner: p.one_liner, talking_points: p.talking_points, skills_proven: p.skills_proven, live_url: p.live_url }));
      return ok({ created, skills_that_did_not_fit: skillsSkipped, needs_wording: { facts: needs, shipped_projects: shipped } });
    }
  );

  server.registerTool(
    "jamie_stylist_changes",
    {
      description: "Stylist: list changes (default: pending and blocked), with their checks and diffs.",
      inputSchema: { status: z.enum(["pending", "blocked", "published", "rejected", "all"]).optional() },
    },
    async ({ status }) => {
      const rows = await q(
        `SELECT * FROM stylist_changes WHERE ($1 = 'all' OR status = ANY(CASE WHEN $1 = 'open' THEN ARRAY['pending','blocked'] ELSE ARRAY[$1] END))
         ORDER BY created_at DESC LIMIT 50`,
        [status ?? "open"]
      );
      return ok(rows);
    }
  );

  server.registerTool(
    "jamie_stylist_decide",
    {
      description:
        "Stylist: Vishwa's decision on a change. approve publishes it everywhere at once (all affected resumes and the portfolio go live). Pass vishwa_approved=true ONLY after she said yes to this exact change. Blocked changes can't be approved; fix and re-propose.",
      inputSchema: { change_id: z.number().int(), decision: z.enum(["approve", "reject"]), vishwa_approved: z.boolean().optional(), reason: z.string().optional() },
    },
    async ({ change_id, decision, vishwa_approved, reason }) => {
      const ch = await one("SELECT * FROM stylist_changes WHERE id = $1", [change_id]);
      if (!ch) throw new Error(`change ${change_id} not found`);
      if (!["pending", "blocked"].includes(ch.status)) return ok({ refused: true, reason: `Change ${change_id} is already ${ch.status}.` });
      if (decision === "reject") {
        await q("UPDATE stylist_changes SET status = 'rejected', decided_at = now(), summary = summary || COALESCE(' | rejected: ' || $2, '') WHERE id = $1", [change_id, reason ?? null]);
        return ok({ rejected: change_id });
      }
      if (!vishwa_approved) return ok({ refused: true, reason: "Approval must come from Vishwa. Show her the diff and ask." });
      // Re-check against the latest content in case anything changed since it was proposed
      const before = await loadItems(true);
      let after: Item[];
      try { after = applyOps(before, ch.ops).items; } catch (e: any) { return ok({ refused: true, reason: e.message }); }
      const checks = await runChecks(before, after, ch.ops);
      if (checks.some((c) => c.level === "error")) {
        await q("UPDATE stylist_changes SET status = 'blocked', checks = $2 WHERE id = $1", [change_id, JSON.stringify(checks)]);
        return ok({ refused: true, reason: "This change breaks a rule.", checks });
      }
      await publish(change_id);
      return ok({ published: change_id, live: links(), next: "Every affected resume link and the portfolio show this now. Jamie applies with the updated resume from here on." });
    }
  );

  server.registerTool(
    "jamie_stylist_rollback",
    {
      description: "Stylist: undo a published change by publishing its reverse. Needs Vishwa's yes (vishwa_approved=true).",
      inputSchema: { change_id: z.number().int(), vishwa_approved: z.boolean() },
    },
    async ({ change_id, vishwa_approved }) => {
      if (!vishwa_approved) return ok({ refused: true, reason: "Rolling back needs Vishwa's yes." });
      const ch = await one("SELECT * FROM stylist_changes WHERE id = $1 AND status = 'published'", [change_id]);
      if (!ch) return ok({ refused: true, reason: `No published change ${change_id}.` });
      const history = await q("SELECT ops FROM stylist_changes WHERE status = 'published' AND id < $1 ORDER BY id", [change_id]);
      // Rebuild each touched item as it was just before this change: seed state, then every earlier published change
      let state: Item[] = (STYLIST_SEED as any).map((s: any) => ({ ...s, active: true }));
      for (const h of history) state = applyOps(state, h.ops).items;
      const inverse: Op[] = [];
      for (const o of ch.ops as Op[]) {
        const prev = state.find((i) => i.key === o.key);
        if (!prev || !prev.active) inverse.push({ op: "retire", key: o.key });
        else inverse.push({ op: (await one("SELECT active FROM stylist_items WHERE key = $1", [o.key]))?.active ? "update" : "add", key: o.key, kind: prev.kind, parent_key: prev.parent_key ?? undefined, surfaces: prev.surfaces, content: prev.content, fact_ids: prev.fact_ids, order_no: prev.order_no });
      }
      // Replace content wholesale on update (not merge) so removed fields come back exactly
      for (const o of inverse) if (o.op === "update") await q("UPDATE stylist_items SET content = '{}'::jsonb WHERE key = $1", [o.key]);
      const row = await one("INSERT INTO stylist_changes (trigger, summary, ops, status, reverts) VALUES ('rollback', $1, $2, 'pending', $3) RETURNING id", [`Undo change ${change_id}: ${ch.summary}`, JSON.stringify(inverse), change_id]);
      await publish(row.id);
      return ok({ rolled_back: change_id, by_change: row.id, live: links() });
    }
  );
}
