# Jamie: my personal AI agent and second brain

Jamie is my personal agent. Think of him as a second brain that does the work for me. He knows me well, remembers everything, and makes my life easier.

**Agents like Jamie are for people who are lazy and ambitious:** you want big outcomes without doing every small step yourself.

[![Watch Jamie in 57 seconds](docs/thumbnail.png)](docs/jamie-demo.mp4)

▶️ **[Watch Jamie in 57 seconds](docs/jamie-demo.mp4)**

**Jump to:** [See the code](#see-the-code) · [Build your own Jamie](#build-your-own-jamie) · [Architecture](#architecture)

## See the code

| File | What it does |
|---|---|
| [`src/server.ts`](src/server.ts) | Core tools: memory, applications, contacts, emails, guardrails |
| [`src/projectLab.ts`](src/projectLab.ts) | Project Lab: 12 tools to finish, deploy, improve and suggest for her projects |
| [`agents/project-lab.md`](agents/project-lab.md) | Project Lab agent spec |
| [`src/scout.ts`](src/scout.ts) | Scout: 8 tools to find, filter and rank job postings and track skill demand |
| [`src/scoutParse.ts`](src/scoutParse.ts) | Scout's code-only extraction: years, skills, degree, salary, location, reposts, agencies |
| [`src/scoutAts.ts`](src/scoutAts.ts) | Reads Greenhouse, Lever and Ashby job boards through their public APIs |
| [`agents/scout.md`](agents/scout.md) | Scout agent spec |
| [`src/stylist.ts`](src/stylist.ts) | Stylist: 7 tools that keep the resumes and portfolio current, with honesty checks in code |
| [`src/stylistResume.ts`](src/stylistResume.ts) | Builds one-page resume PDFs from the database |
| [`agents/stylist.md`](agents/stylist.md) | Stylist agent spec |
| [`src/administrator.ts`](src/administrator.ts) | Administrator: 7 tools that apply to jobs end to end on autopilot (resume upload, every factual answer, checks and logging in code) |
| [`src/adminRules.ts`](src/adminRules.ts) | Standard answers, resume pick, salary rule and answer checks, all plain code |
| [`agents/administrator.md`](agents/administrator.md) | Administrator agent spec |
| [`src/brain.ts`](src/brain.ts) | Turns the database into one readable "brain" file |
| [`src/schema.ts`](src/schema.ts) | The brain's tables and default limits |
| [`src/http.ts`](src/http.ts) | Secure endpoint for Claude and ChatGPT |
| [`src/db.ts`](src/db.ts) | Postgres connection and settings |
| [`skill/SKILL.md`](skill/SKILL.md) | Jamie's rules and workflows for Claude |

A taste: before any email goes out, the server itself checks the limits, so the model can't skip them.

```ts
server.registerTool("jamie_can_send", {
  description: "Guardrail check. MUST be called before sending any outreach email.",
  inputSchema: { contact_id: z.number().int() },
}, async ({ contact_id }) => ok(await guardrailStatus(contact_id)));
```

## Build your own Jamie

Three ways, from fastest to most hands-on.

### Option 1: Clone and deploy (5 minutes)

```bash
git clone https://github.com/vishwamehta1029-cyber/jamie-agent.git
cd jamie-agent
npm install
npx vercel deploy --prod
```

Then in Vercel, add `DATABASE_URL` (your Postgres) and `JAMIE_SECRET` (a random string, 24+ characters). Connect `https://<your-app>/<JAMIE_SECRET>/mcp` in Claude and ChatGPT. Full steps are in [Run your own](#run-your-own).

### Option 2: Have Claude build it for you

Copy this prompt into Claude, fill in your use case, and it will write every file:

```text
I want to build my own personal AI agent, like "Jamie": a second brain that does tasks for me and remembers everything.

Build it as a remote MCP server in TypeScript, deployed on Vercel, with a Postgres database (Neon) as the agent's brain. Claude and ChatGPT should both connect to it as a custom connector, so they share one memory.

Requirements:
1. Brain (Postgres tables): facts about me (with source, and old facts retired, never overwritten), an answer bank of approved answers, tasks or applications I track, contacts, sent emails, lessons learned, session handoff notes, and settings for limits.
2. Tools: start_session (returns last handoff, pending items, limits), write_handoff, get_profile, add_fact, search_answers, save_answer, log_task, list_tasks, upsert_contact, log_send, add_lesson, search_lessons, update_settings, weekly_summary, and get_brain (renders the whole brain as one Markdown file).
3. Guardrails enforced in the server, not just the prompt: daily send limit, a can_send check that must pass before any email, and a flag that every custom answer needs my explicit approval.
4. Security: a long secret in the URL (at least 24 characters), checked with a timing-safe comparison. All keys come from environment variables. No personal data in the code.
5. Transparency: if something is not in the brain file, the agent must not know or use it.
6. Also write a Claude skill (SKILL.md) that tells the agent: call start_session first, write a handoff before stopping, save new facts to the brain before using them, and never send or submit anything without my explicit yes.

My use case: [describe what you want your agent to do, for example job search, sales outreach, or personal admin].

Give me every file in full (package.json, tsconfig.json, vercel.json, api/mcp.ts, src/http.ts, src/server.ts, src/db.ts, src/schema.ts, src/brain.ts, skill/SKILL.md), then step-by-step instructions to deploy and connect it to Claude and ChatGPT.
```

### Option 3: Copy the code file by file

Click a file to expand it, then use the copy button on the code block.

<details>
<summary><code>package.json</code> (17 lines)</summary>

```json
{
  "name": "jamie",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": "22.x" },
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.32.2",
    "pg": "8.23.1",
    "zod": "3.25.76"
  },
  "devDependencies": {
    "@types/node": "22.10.0",
    "@types/pg": "8.23.1",
    "@vercel/node": "5.1.0"
  }
}
```

</details>

<details>
<summary><code>tsconfig.json</code> (12 lines)</summary>

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noImplicitAny": false,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src", "api"]
}
```

</details>

<details>
<summary><code>vercel.json</code> (8 lines)</summary>

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    { "source": "/:secret/mcp", "destination": "/api/mcp?k=:secret" },
    { "source": "/:secret/brain", "destination": "/api/mcp?k=:secret&view=brain" },
    { "source": "/:secret/seed", "destination": "/api/mcp?k=:secret&view=seed" }
  ]
}
```

</details>

<details>
<summary><code>api/mcp.ts</code> (8 lines)</summary>

```ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { handle } from "../src/http.js";

export const config = { maxDuration: 30 };

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handle(req as any, res);
}
```

</details>

<details>
<summary><code>src/http.ts</code> (86 lines)</summary>

```ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer } from "./server.js";
import { renderBrain } from "./brain.js";
import { loadSeed } from "./seed.js";

function secretOk(given: string | undefined): boolean {
  const want = process.env.JAMIE_SECRET;
  if (!want || want.length < 24 || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

function parse(req: IncomingMessage): { secret?: string; view: string } {
  const url = new URL(req.url || "/", "http://x");
  const m = url.pathname.match(/^\/([^/]+)\/(mcp|brain|seed)\/?$/);
  return { secret: url.searchParams.get("k") || m?.[1], view: url.searchParams.get("view") || m?.[2] || "mcp" };
}

async function readBody(req: IncomingMessage & { body?: unknown }): Promise<unknown> {
  if (req.body !== undefined) return req.body;
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : undefined;
}

function text(res: ServerResponse, code: number, body: string, type = "text/plain") {
  res.statusCode = code;
  res.setHeader("Content-Type", `${type}; charset=utf-8`);
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

export async function handle(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  const { secret, view } = parse(req);
  if (!secretOk(secret)) return text(res, 404, "Not found");

  if (req.method === "GET" && view === "brain") {
    try {
      return text(res, 200, await renderBrain(), "text/markdown");
    } catch (e: any) {
      console.error(e);
      return text(res, 500, "Brain unavailable: " + (e?.message || "error"));
    }
  }
  if (req.method === "GET" && view === "seed") {
    try {
      return text(res, 200, await loadSeed());
    } catch (e: any) {
      console.error(e);
      return text(res, 500, "Seed failed: " + (e?.message || "error"));
    }
  }
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null }));
    return;
  }
  try {
    const body = await readBody(req);
    const server = buildServer();
    server.registerTool(
      "jamie_get_brain",
      {
        description:
          "Return Jamie's ENTIRE brain as Markdown: every fact, answer, application, contact, pattern, send, Apollo use, lesson, handoff, and setting. Jamie knows only what is in here. Call after any write so the brain file shown to Vishwa is refreshed.",
        inputSchema: {},
      },
      async () => ({ content: [{ type: "text" as const, text: await renderBrain() }] })
    );
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req as any, res, body);
  } catch (e: any) {
    console.error(e);
    if (!res.headersSent) text(res, 500, JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null }), "application/json");
  }
}
```

</details>

<details>
<summary><code>src/server.ts</code> (766 lines)</summary>

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { promises as dns } from "node:dns";
import { q, one, getSetting, setSetting, tsOr } from "./db.js";

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
  const server = new McpServer({ name: "jamie", version: "0.3.0" });

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
      return ok({
        platform,
        last_handoff: handoff,
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
        max_years_experience: z.number().int().optional().describe("Skip roles whose minimum required experience is above this"),
        guessing_paused: z.boolean().optional(),
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

  return server;
}
```

</details>

<details>
<summary><code>src/db.ts</code> (61 lines)</summary>

```ts
import pg from "pg";
import { SCHEMA } from "./schema.js";

let pool: pg.Pool | null = null;
let migrated: Promise<void> | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const local = /localhost|127\.0\.0\.1/.test(url);
    pool = new pg.Pool({
      connectionString: url,
      max: 3,
      ssl: local ? undefined : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function ensureSchema(): Promise<void> {
  if (!migrated) {
    migrated = getPool()
      .query(SCHEMA)
      .then(() => undefined)
      .catch((e) => {
        migrated = null;
        throw e;
      });
  }
  return migrated;
}

export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const res = await getPool().query(text, params);
  return res.rows as T[];
}

export async function one<T = any>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

export async function getSetting<T = any>(key: string): Promise<T> {
  const row = await one<{ value: T }>("SELECT value FROM settings WHERE key = $1", [key]);
  return row?.value as T;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await q(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [key, JSON.stringify(value)]
  );
}

export function tsOr(text: string): string | null {
  const words = (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 2);
  if (!words.length) return null;
  return Array.from(new Set(words)).join(" | ");
}
```

</details>

<details>
<summary><code>src/schema.ts</code> (129 lines)</summary>

```ts
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS facts (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  fact TEXT NOT NULL,
  source TEXT NOT NULL,
  source_ref TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  superseded_by INT REFERENCES facts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS answers (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  question_type TEXT,
  role_type TEXT,
  company TEXT,
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  reusable BOOLEAN NOT NULL DEFAULT TRUE,
  times_used INT NOT NULL DEFAULT 0,
  application_id INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS applications (
  id SERIAL PRIMARY KEY,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  job_id TEXT,
  url TEXT,
  location TEXT,
  ats TEXT,
  resume_used TEXT,
  tier TEXT NOT NULL DEFAULT 'mass',
  status TEXT NOT NULL DEFAULT 'saved',
  notes TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS applications_company_idx ON applications (lower(company));
CREATE TABLE IF NOT EXISTS submitted_answers (
  id SERIAL PRIMARY KEY,
  application_id INT NOT NULL REFERENCES applications(id),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  answer_id INT REFERENCES answers(id),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT,
  company TEXT NOT NULL,
  domain TEXT,
  linkedin_url TEXT,
  email TEXT,
  email_source TEXT,
  email_confidence TEXT,
  patterns_tried INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  application_id INT REFERENCES applications(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contacts_company_idx ON contacts (lower(company));
CREATE TABLE IF NOT EXISTS email_patterns (
  domain TEXT PRIMARY KEY,
  pattern TEXT,
  status TEXT NOT NULL DEFAULT 'guessed',
  evidence TEXT,
  catch_all BOOLEAN,
  accepts_mail BOOLEAN,
  bounces INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sends (
  id SERIAL PRIMARY KEY,
  contact_id INT NOT NULL REFERENCES contacts(id),
  to_email TEXT NOT NULL,
  subject TEXT,
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  bounced BOOLEAN NOT NULL DEFAULT FALSE,
  bounced_at TIMESTAMPTZ,
  checked_1h BOOLEAN NOT NULL DEFAULT FALSE,
  checked_24h BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS apollo_usage (
  id SERIAL PRIMARY KEY,
  contact_id INT REFERENCES contacts(id),
  reason TEXT NOT NULL,
  credits NUMERIC NOT NULL DEFAULT 1,
  result TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS lessons (
  id SERIAL PRIMARY KEY,
  topic TEXT NOT NULL,
  lesson TEXT NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS handoffs (
  id SERIAL PRIMARY KEY,
  platform TEXT NOT NULL,
  summary TEXT NOT NULL,
  next_steps TEXT,
  open_items JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
INSERT INTO settings (key, value) VALUES
  ('mass_apps_daily_cap', '45'),
  ('company_bounce_cap', '3'),
  ('daily_send_limit', '250'),
  ('max_patterns_per_person', '2'),
  ('max_years_experience', '3'),
  ('guessing_paused', 'false')
ON CONFLICT (key) DO NOTHING;
DELETE FROM settings WHERE key IN ('weekly_bounce_cap', 'weekly_bounce_rate_pct', 'min_sends_for_rate');
`;
```

</details>

<details>
<summary><code>src/brain.ts</code> (135 lines)</summary>

```ts
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
```

</details>

<details>
<summary><code>src/seed.ts</code> (22 lines)</summary>

```ts
import { q, one } from "./db.js";
import { SEED_DATA } from "./seedData.js";

export async function loadSeed(): Promise<string> {
  const existing = Number((await one<{ n: string }>("SELECT count(*) n FROM facts"))!.n);
  if (existing > 0) return `Brain already has ${existing} facts; not seeding.`;
  const d = SEED_DATA;
  for (const f of d.facts)
    await q("INSERT INTO facts (category, fact, source, source_ref) VALUES ($1,$2,$3,$4)", [f.category, f.fact, f.source, f.source_ref ?? null]);
  for (const l of d.lessons) await q("INSERT INTO lessons (topic, lesson, source) VALUES ($1,$2,'seed')", [l.topic, l.lesson]);
  for (const [company, role, note] of d.applications)
    await q("INSERT INTO applications (company, role, status, notes) VALUES ($1,$2,'submitted',$3)", [
      company, role, ["imported from history", note].filter(Boolean).join("; "),
    ]);
  for (const [company, role, note] of d.in_progress)
    await q("INSERT INTO applications (company, role, status, notes) VALUES ($1,$2,'in_progress',$3)", [company, role, note]);
  for (const a of d.answers)
    await q("INSERT INTO answers (question, answer, question_type, role_type, approved, reusable) VALUES ($1,$2,$3,$4,$5,$6)", [
      a.question, a.answer, a.question_type, a.role_type, a.approved, a.reusable,
    ]);
  return `Seeded ${d.facts.length} facts, ${d.lessons.length} lessons, ${d.applications.length + d.in_progress.length} applications, ${d.answers.length} answers.`;
}
```

</details>

<details>
<summary><code>src/seedData.ts</code> (48 lines)</summary>

```ts
// DEMO DATA ONLY. Everything here is fictional.
// The real knowledge base is private and lives only in the production database.
// To run Jamie for yourself, replace these entries with your own facts, then hit /<secret>/seed once.

export const SEED_DATA: any = {
  facts: [
    { category: "identity", fact: "Name: Alex Rivera", source: "told_me" },
    { category: "identity", fact: "Based in Seattle, WA", source: "told_me" },
    { category: "contact", fact: "Email: alex@example.com", source: "told_me" },
    { category: "logistics", fact: "Start date: two weeks from the application date", source: "told_me" },
    { category: "logistics", fact: "Salary: enter the target from the posting range; if there is no range, enter the default target", source: "told_me" },
    { category: "logistics", fact: "Open to relocation. Prefers remote first", source: "told_me" },
    { category: "logistics", fact: "Authorized to work in the US", source: "told_me" },
    { category: "eeo", fact: "EEO: prefer not to say", source: "told_me" },
    { category: "rules", fact: "Every custom answer must be approved before submitting", source: "told_me" },
    { category: "rules", fact: "Skip roles that require more than 3 years of experience", source: "told_me" },
    { category: "preferences", fact: "No em dashes in anything written", source: "told_me" },
    { category: "resume_routing", fact: "Forward Deployed and Solutions Engineer roles: Resume_AgenticAI.pdf", source: "told_me" },
    { category: "resume_routing", fact: "AI Engineer roles: Resume_AI_Engineer.pdf", source: "told_me" },
    { category: "resume_routing", fact: "GTM roles: Resume_GTM.pdf", source: "told_me" },
    { category: "summary", fact: "Builds agentic AI tools with Claude and MCP for go-to-market teams", source: "resume" },
    { category: "experience", fact: "Forward Deployed Engineer at Example Co (remote, 2026 to present)", source: "resume" },
    { category: "project", fact: "Built an outreach agent that drafts emails from CRM data", source: "resume" },
    { category: "skills", fact: "TypeScript, Python, SQL, Postgres, MCP, Claude", source: "resume" },
    { category: "education", fact: "B.S. Economics, Example University", source: "resume" },
  ],
  lessons: [
    { topic: "style", lesson: "Keep bullets short: six to eight words each" },
    { topic: "outreach", lesson: "Portfolio links in emails always include a thumbnail image" },
    { topic: "tracking", lesson: "Log every submitted custom answer for later review" },
  ],
  applications: [
    ["Northwind", "Forward Deployed Engineer", ""],
    ["Orbit Labs", "AI Engineer", ""],
  ],
  in_progress: [["Lumen & Co", "GTM Engineer", "Waiting on approval for custom answers"]],
  answers: [
    {
      question: "Outreach email template",
      question_type: "other",
      role_type: "any",
      approved: true,
      reusable: true,
      answer:
        "Hi [FIRST NAME],\n\nI just applied for the [role] role at [COMPANY].\n\n- I build agentic AI tools with Claude and MCP\n- Startup builder, at home in ambiguity\n\nPortfolio: [PORTFOLIO LINK + THUMBNAIL]\n\n[CTA]\n\nThanks,\nAlex",
    },
  ],
};
```

</details>

<details>
<summary><code>skill/SKILL.md</code> (102 lines)</summary>

```markdown
---
name: jamie
description: Jamie, Vishwa's job application agent. Use when she says Jamie, or asks to work her LinkedIn saved jobs, fill or submit applications, find contacts or emails for a job, draft or send outreach, check bounces, or review what Jamie learned.
---

# Jamie

Jamie applies to jobs for Vishwa, finds the right people, and drafts outreach. His memory lives in the **Jamie connector** (tools named `jamie_*`), shared with ChatGPT. Everything he learns goes there, not into chat.

## Every session

1. Call `jamie_start_session` (platform `claude`) first. Read the handoff, pending items, and sends due for a bounce check.
2. Tell Vishwa in 2-3 lines where things stand and what you will do.
3. Before stopping, or the moment work pauses mid-task, call `jamie_write_handoff`. Be specific: company, role, step, what is waiting on her.

## Knowledge boundary (hard rule)

- Jamie knows **only** what is in his brain (`jamie_get_brain`). Nothing hidden, nothing outside it.
- Not in the brain means Jamie does not know it. Do not use Claude's own memory, past chats, or assumptions about Vishwa.
- Learned something new (from her, a form, the web)? Write it to the brain first, then use it.
- After any write in a session, call `jamie_get_brain`, save it as `Jamie's Brain.md`, and show it to her in the side panel.

## Hard rules (never bend)

- **Custom answers need approval.** Every essay, "why us", free-text, self-rating, or judgment-call experience answer is shown to Vishwa and approved before submit.
- **Factual fields can be auto-filled**: contact info, EEO, work authorization, salary, start date. Take them from `jamie_get_profile` (category `logistics` and `eeo`). Never invent one.
- **Submit only on her explicit yes** for that application.
- **Every email needs her approval** of the exact text before it is sent.
- **No sign-ins, no passwords, no account creation, no CAPTCHAs.** Stop and hand those to her.
- **Honest framing only.** No inflated titles, no invented metrics.
- **Never re-apply.** Run `jamie_check_applied` and search Gmail for past confirmations and outreach to the company first.
- **Skip roles that require more than 3 years of experience.** Mention each skip and why.
- **Never frame learning or ramping up as a challenge** in any answer.
- No em dashes in anything written for her.
- She types casually and in any case. Fix capitalization and grammar yourself in everything you write or save.

## Workflow 1: Saved jobs to applications

1. Open LinkedIn job tracker (Saved) in Chrome in a new tab. Read the list. Go slowly; act only on her trigger, never crawl in the background.
2. For each job: `jamie_check_applied`, then Gmail search. Skip duplicates and say so.
3. `jamie_log_application` with status `in_progress`. Tier `quality` if she wants outreach for it, else `mass`. For mass apps, check `jamie_can_apply` first.
4. Pick the resume by role type:
   - FDE and Solutions Engineer: `Vishwa_MEHTA_AGENTICAI.pdf`
   - AI Engineer: `Vishwa_Mehta_Resume_AI_Engineer.pdf`
   - GTM: `Vishwa_Mehta_Resume_GTM_1.pdf`
   - Otherwise ask.
5. `jamie_search_lessons` for this ATS (topic `ats:<name>`) before filling.
6. Fill factual fields. For each custom question:
   - `jamie_search_answers` with the question and role type.
   - Reuse or adapt an approved answer, using the posting's exact keywords where true.
   - Batch all custom answers for this application into one message for her review.
7. Set status `awaiting_approval`. Wait.
8. On approval: save each approved answer with `jamie_save_answer` (approved true). Submit only after she says submit.
9. After submit: `jamie_log_application` status `submitted`, `jamie_log_submitted_answers` with every custom answer.
10. Learn: any new fact she gave or corrected goes to `jamie_add_fact`. Any ATS quirk goes to `jamie_add_lesson`.

## Workflow 2: Find contacts and emails

Apollo is paid and limited. It is the **last resort**, used only after a guessed email bounces.

1. **Find the person on the public web**: company team page, LinkedIn, GitHub, press, blog bylines. Prefer the hiring manager, team lead, or recruiter for that role.
2. **Find the email format from public evidence**: an address on their site, press contact, GitHub commits, a talk. Save with `jamie_save_email_pattern` (`confirmed` only with real evidence, else `guessed`).
3. `jamie_check_domain` (free MX check). No MX means do not send.
4. `jamie_guess_email`. It returns at most 2 candidates. Use the first unless evidence favors the second.
5. `jamie_upsert_contact` with `email_source` guessed (or public) and a confidence. Catch-all domains are low confidence; say so in the draft.

You may also read her open Chrome tabs and use the Apollo web tab, but only in step 6 of Workflow 3.

## Workflow 3: Draft, send, watch for bounces

1. Start from the default outreach template in the answer bank (`jamie_search_answers` "outreach email"). Fill [FIRST NAME], [role], [COMPANY], the portfolio link and thumbnail. Keep her wording.
   - **CTA by contact role**: founder, recruiter, direct hiring manager, or anyone directly responsible for the role gets "If this feels like a good fit, I would love to connect for a brief chat." Everyone else gets "If this feels like a good fit, could you please refer me for this role or connect me with the right person?"
   - If the contact's role is unclear, ask her which CTA to use.
2. Save to Gmail Drafts. Show her the exact text.
3. Before sending: `jamie_can_send`. If `can_send` is false, do not send; tell her the blocks. Surface any warnings.
4. Send only after her explicit yes for that email. Then `jamie_log_send` with Gmail ids.
5. **Bounce checks** at 1 hour and 24 hours: search Gmail for bounce notices (from mailer-daemon or postmaster, or "Delivery Status Notification", "Address not found") to that address.
   - No bounce: `jamie_mark_bounce_checked`. Passing 24h confirms a guessed pattern.
   - Bounce: `jamie_record_bounce`.
6. **Only on bounce, and only if `next.action` is `apollo_lookup`**: one Apollo lookup for that one person (MCP first, Apollo tab if needed). Report credits used. Log with `jamie_log_apollo`. If verified, save the real pattern as confirmed and re-draft for approval. If not, the contact is a dead end.
7. If `tell_vishwa` comes back, tell her right away. Pausing or resuming guessed sends is her call (`jamie_update_settings` only when she asks).

### Guardrails (enforced by the connector)

- Max 2 patterns tried per person
- 3 bounces at one company: stop guessing there, ask her
- 250 outreach emails per day max
- One Apollo lookup per bounced person, then dead end

### Application limits

- No limit on companies per day
- Mass apps: hard cap of 45 per day. Check `jamie_can_apply` before each mass app; the server refuses the 46th.
- Quality apps (application plus outreach) are not capped

## Working with ChatGPT

ChatGPT shares the same connector. Vishwa may draft emails or answers there. When picking up, trust the handoff and the answer bank, not chat history. Drafts approved in ChatGPT still go through `jamie_can_send` before sending from here.

## Weekly

On request or at the start of a Monday session: `jamie_weekly_summary` (sends, bounces, bounce rate, Apollo credits, applications, what Jamie learned) and `jamie_review_submitted_answers`.
```

</details>

<details>
<summary><code>.env.example</code> (5 lines)</summary>

```bash
# Postgres connection string (Neon, Supabase, or local)
DATABASE_URL=postgres://user:password@host/dbname?sslmode=require

# Random string, at least 24 characters. It becomes part of your connector URL.
JAMIE_SECRET=replace-with-a-long-random-string
```

</details>


## What Jamie does for me

| | |
|---|---|
| **Applies to jobs** | Works through my LinkedIn saved jobs. Skips duplicates, picks the right resume, fills factual fields, waits for my OK on custom answers. |
| **Drafts emails** | Writes outreach in Gmail from my own template, in my voice, and shows me the exact text first. |
| **Sends LinkedIn connection requests** | Reaches out to the right people for each role, with my approval. |
| **Finds the right people** | Researches hiring managers and recruiters, finds the company email format, checks the domain before sending. |
| **Keeps track of everything** | Every application, contact, email and bounce, logged as it happens. |
| **Weekly stats** | Applications, emails sent, bounces, credits used, and what he learned. |

## What Jamie knows about me

Jamie's brain holds only verified information. Nothing is guessed, and I can read all of it anytime.

- **Facts about me:** experience, skills, logistics, verified only
- **People I've reached out to:** names, roles, emails, outcomes
- **Jobs I've applied to:** company, role, date, status
- **Answers I've approved:** reused and adapted next time
- **My preferences:** tone, formatting, rules he follows
- **Lessons learned:** quirks of each job portal, mistakes to avoid

Every task adds to this brain, so Jamie gets better at helping me every day.

## How he works

Jamie is a remote **MCP server** with one shared brain in Postgres. Claude and ChatGPT both connect to the same Jamie, so work started in one picks up cleanly in the other. A **Claude skill** tells him how to do the work. Every action that matters waits for my yes.

## Where Jamie is going

- **More context:** his brain keeps growing with every task
- **More places:** beyond chat apps, into my everyday tools
- **A voice:** talk to him and hear him answer
- **More skills:** new kinds of tasks over time

**Today:** Jamie runs in Claude and ChatGPT and handles my job search and outreach. Voice and the rest are next.

## Rules the agent can't bend

Enforced in the skill **and** in the server, not left to judgment.

- Nothing is submitted without my yes
- Every email is approved before it sends
- Every custom answer is approved, then logged for review
- No passwords, sign-ins, or CAPTCHAs
- Never re-applies to the same role
- Honest framing, no inflated titles
- Skips roles needing more than 3 years
- Hard caps: 45 mass apps and 250 emails a day
- 3 bounces at a company stops guessing there
- One Apollo lookup per bounced person, then dead end

![Guardrails](docs/guardrails.png)

## Architecture

```mermaid
flowchart LR
  subgraph Clients
    C[Claude + Jamie skill]
    G[ChatGPT]
  end
  C -- MCP --> S
  G -- MCP --> S
  S[Jamie MCP server<br/>Vercel, TypeScript] --> DB[(Neon Postgres<br/>Jamie's brain)]
  S --> B["/brain<br/>live Markdown view"]
  C --> Gm[Gmail]
  C --> Ch[Chrome: LinkedIn, ATS forms]
  C -. last resort .-> A[Apollo]
```

- **Transparent memory.** Jamie's whole brain renders as one Markdown file (`jamie_get_brain` or `/<secret>/brain`). If it's not in that file, Jamie doesn't know it.
- **Facts are versioned.** Corrections retire the old fact and link to the new one, so nothing is silently overwritten.
- **Guardrails live in the database.** `jamie_can_send` and `jamie_log_application` refuse actions past the caps, even if the model forgets.

## Tools (26)

| Area | Tools |
|---|---|
| Session | `jamie_start_session`, `jamie_write_handoff`, `jamie_get_brain` |
| Knowledge | `jamie_get_profile`, `jamie_add_fact`, `jamie_add_lesson`, `jamie_search_lessons` |
| Answers | `jamie_search_answers`, `jamie_save_answer`, `jamie_log_submitted_answers`, `jamie_review_submitted_answers` |
| Applications | `jamie_check_applied`, `jamie_log_application`, `jamie_can_apply`, `jamie_list_applications` |
| Contacts and email | `jamie_upsert_contact`, `jamie_check_domain`, `jamie_guess_email`, `jamie_save_email_pattern` |
| Sending and bounces | `jamie_can_send`, `jamie_log_send`, `jamie_mark_bounce_checked`, `jamie_record_bounce`, `jamie_log_apollo` |
| Settings and reporting | `jamie_update_settings`, `jamie_weekly_summary` |

## Project structure

```
api/mcp.ts          Vercel function entry point
src/http.ts         Secret check, routes /mcp, /brain, /seed
src/server.ts       All MCP tools and guardrail logic
src/db.ts           Postgres pool, auto-migration, settings helpers
src/schema.ts       Tables and default guardrail settings
src/brain.ts        Renders the brain as Markdown
src/seed.ts         One-time seed loader
src/seedData.ts     Demo seed data (fictional)
skill/SKILL.md      The Claude skill: Jamie's rules and workflows
docs/               Demo video and images
```

## Run your own

1. Create a free Postgres database (I use [Neon](https://neon.tech)).
2. Deploy to Vercel and set two environment variables (see `.env.example`):
   - `DATABASE_URL`: your Postgres connection string
   - `JAMIE_SECRET`: a random string, at least 24 characters
3. Replace `src/seedData.ts` with your own facts, then open `https://<your-app>/<JAMIE_SECRET>/seed` once.
4. Add `https://<your-app>/<JAMIE_SECRET>/mcp` as a custom connector in Claude and ChatGPT.
5. Add `skill/SKILL.md` as a Claude skill.

Tables are created automatically on first request.

## Privacy

This repo contains **no personal data and no keys**. The seed data is fictional. My real knowledge base lives only in a private database, and all secrets are environment variables.

## Stack

TypeScript · Model Context Protocol SDK · Zod · Postgres (Neon) · Vercel · Claude · ChatGPT · Gmail · Apollo

---

Built by [Vishwa Mehta](https://vishwamehta.vercel.app/) · [LinkedIn](https://www.linkedin.com/in/vishwa10)
