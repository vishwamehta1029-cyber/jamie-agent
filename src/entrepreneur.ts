// Entrepreneur: finds YC startups relevant to Vishwa, keeps a tracker (what they do, founder, funding),
// and emails one founder per company asking for a coffee chat. Code scores relevance, picks the founder,
// guesses the address, renders every email from her approved template and gates sending. The LLM reads
// YC pages and the web, copies facts with sources, and writes the one company-specific line, which she
// approves along with every other line of every email.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createHash } from "node:crypto";
import { promises as dns } from "node:dns";
import { z } from "zod";
import { q, one, getSetting } from "./db.js";
import { guardrailStatus, applyPattern } from "./server.js";
import { splitName, isUS, esc, portfolioCard, PORTFOLIO, THUMBNAIL_FILE } from "./postman.js";

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const norm = (s: string) => s.trim().toLowerCase();

export const YC_FEED = "https://yc-oss.github.io/api/companies/all.json";
export const TEMPLATE_QUESTION = "Entrepreneur founder email (coffee chat)";

// ---------- Batches ----------

const SEASON: Record<string, number> = { winter: 1, w: 1, spring: 2, x: 2, summer: 3, s: 3, fall: 4, f: 4 };
/** "Summer 2026", "S26", "F25" -> sortable 20263. null if unknown. */
export function batchKey(b?: string | null): number | null {
  if (!b) return null;
  let m = b.match(/(winter|spring|summer|fall)\s*(\d{4})/i);
  if (m) return Number(m[2]) * 10 + SEASON[m[1].toLowerCase()];
  m = b.trim().match(/^([wxsf])(\d{2})$/i);
  if (m) return (2000 + Number(m[2])) * 10 + SEASON[m[1].toLowerCase()];
  return null;
}

// ---------- Relevance to Vishwa (plain code) ----------

export type Company = {
  slug: string; name: string; batch?: string | null; one_liner?: string | null; description?: string | null;
  website?: string | null; location?: string | null; regions?: string[]; team_size?: number | null;
  industries?: string[]; tags?: string[]; is_hiring?: boolean | null; status?: string | null; nonprofit?: boolean | null;
};

const SIGNALS: { re: RegExp; pts: number; why: string }[] = [
  { re: /\bai\b|agent|agentic|\bllm|genai|generative|\brag\b|copilot|artificial intelligence/i, pts: 22, why: "AI or agents" },
  { re: /automat|workflow|no-code|orchestrat/i, pts: 10, why: "workflow automation" },
  { re: /\bgtm\b|go-to-market|sales|outbound|revenue|marketing|\bcrm\b|lead gen|growth/i, pts: 14, why: "GTM or sales" },
  { re: /enterprise|deploy|implementation|customer success|customer support|onboarding/i, pts: 8, why: "customer-facing deployment" },
  { re: /analytics|\bdata\b|business intelligence|dashboard/i, pts: 6, why: "data and analytics" },
  { re: /developer|devtools|\bapi\b|infrastructure/i, pts: 5, why: "developer tools" },
];
const OFF_FIT = /biotech|therapeutic|drug discovery|clinical|medical device|semiconductor|battery|materials science|aerospace|satellite|nuclear|fusion|crypto|blockchain|web3|defi/i;

export function scoreCompany(c: Company, nowYear = new Date().getFullYear()): { score: number; why: string[]; reject?: string } {
  if (c.status && !/active/i.test(c.status)) return { score: 0, why: [], reject: `status ${c.status}` };
  if (c.nonprofit) return { score: 0, why: [], reject: "nonprofit" };
  const text = [c.one_liner, c.description, ...(c.tags ?? []), ...(c.industries ?? [])].filter(Boolean).join(" ");
  const why: string[] = [];
  let score = 0;
  for (const s of SIGNALS) if (s.re.test(text)) { score += s.pts; why.push(s.why); }
  if ((c.industries ?? []).some((i) => /b2b/i.test(i))) { score += 10; why.push("B2B"); }
  if (OFF_FIT.test(text)) { score -= 25; why.push("off-fit field"); }
  const k = batchKey(c.batch);
  if (k) {
    const y = Math.floor(k / 10);
    if (y >= nowYear) { score += 16; why.push(`current batch (${c.batch})`); }
    else if (y === nowYear - 1) { score += 10; why.push(`recent batch (${c.batch})`); }
    else if (y < nowYear - 3) score -= 10;
  }
  const t = c.team_size ?? null;
  if (t !== null) {
    if (t <= 15) { score += 12; why.push(`small team (${t})`); }
    else if (t <= 50) { score += 6; why.push(`team of ${t}`); }
    else if (t > 150) score -= 15;
  }
  if (c.is_hiring) { score += 10; why.push("hiring"); }
  const loc = [c.location, ...(c.regions ?? [])].filter(Boolean).join(" ");
  if (/seattle/i.test(loc)) { score += 10; why.push("Seattle"); }
  else if (/san francisco|bay area|palo alto|mountain view/i.test(loc)) { score += 8; why.push("SF Bay Area"); }
  else if (/new york/i.test(loc)) { score += 8; why.push("New York"); }
  else if (/remote/i.test(loc)) { score += 6; why.push("remote"); }
  if (loc && !isUS(loc) && !/remote|united states|america/i.test(loc)) { score -= 30; why.push("outside the US"); }
  return { score, why };
}

export function domainOf(website?: string | null): string | null {
  if (!website) return null;
  try { return new URL(/^https?:/i.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
}

async function upsertCompany(c: Company, source: string) {
  const s = scoreCompany(c);
  const row = await one(
    `INSERT INTO yc_companies (slug, name, batch, batch_key, one_liner, description, website, domain, location, regions, team_size, industries, tags, is_hiring, status, yc_url, fit_score, fit_reason, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, batch = COALESCE(EXCLUDED.batch, yc_companies.batch), batch_key = COALESCE(EXCLUDED.batch_key, yc_companies.batch_key),
       one_liner = COALESCE(EXCLUDED.one_liner, yc_companies.one_liner), description = COALESCE(EXCLUDED.description, yc_companies.description),
       website = COALESCE(EXCLUDED.website, yc_companies.website), domain = COALESCE(EXCLUDED.domain, yc_companies.domain),
       location = COALESCE(EXCLUDED.location, yc_companies.location), regions = CASE WHEN cardinality(EXCLUDED.regions) > 0 THEN EXCLUDED.regions ELSE yc_companies.regions END,
       team_size = COALESCE(EXCLUDED.team_size, yc_companies.team_size), industries = CASE WHEN cardinality(EXCLUDED.industries) > 0 THEN EXCLUDED.industries ELSE yc_companies.industries END,
       tags = CASE WHEN cardinality(EXCLUDED.tags) > 0 THEN EXCLUDED.tags ELSE yc_companies.tags END, is_hiring = COALESCE(EXCLUDED.is_hiring, yc_companies.is_hiring),
       status = COALESCE(EXCLUDED.status, yc_companies.status), fit_score = EXCLUDED.fit_score, fit_reason = EXCLUDED.fit_reason, updated_at = now()
     RETURNING slug, (xmax = 0) inserted, track_status`,
    [c.slug, c.name, c.batch ?? null, batchKey(c.batch), c.one_liner ?? null, c.description ?? null, c.website ?? null, domainOf(c.website),
     c.location ?? null, c.regions ?? [], c.team_size ?? null, c.industries ?? [], c.tags ?? [], c.is_hiring ?? null, c.status ?? null,
     `https://www.ycombinator.com/companies/${c.slug}`, s.score, s.reject ? `rejected: ${s.reject}` : s.why.join(", "), source]
  );
  const contacted = await one("SELECT max(s.sent_at) t FROM sends s JOIN contacts ct ON ct.id = s.contact_id WHERE lower(ct.company) = lower($1)", [c.name]);
  if (contacted?.t && row.track_status === "found") await q("UPDATE yc_companies SET track_status = 'contacted_before', notes = concat_ws('; ', notes, 'emailed before by Jamie') WHERE slug = $1", [c.slug]);
  return { ...row, score: s.score, why: s.why, reject: s.reject };
}

// ---------- Template (answer bank, approved by Vishwa) ----------

export const DEFAULT_TEMPLATE = `Subject: Coffee chat about [COMPANY]

Hey [FOUNDER FIRST NAME],

My name is Vishwa. I came across what you are building at [COMPANY], and I am really interested in [WHY LINE].

So far, I have built a self-learning personal agent called Jamie (Just Another Me In Existence) that manages 6 other agents I built (Administrator, Scout, Stylist, Project Lab, Postman and Entrepreneur), built to attain 90% autonomy in their respective workflows.

I have always wanted to work closely with a founder, as I want to be one myself. I would love a chance to get on a call to see if there is some way I can be a part of your team.

I am smart, I have very good EQ, I learn things quickly, and I am really passionate about what I do.

I have included my portfolio below, which highlights my experience and projects.

[PORTFOLIO CARD]

Thank you,
Vishwa`;

async function approvedTemplate(): Promise<{ id: number; text: string } | null> {
  const t = await one("SELECT id, answer FROM answers WHERE approved AND question = $1 ORDER BY updated_at DESC LIMIT 1", [TEMPLATE_QUESTION]);
  return t ? { id: t.id, text: t.answer } : null;
}

export function renderFounderEmail(template: string, p: { first: string; company: string; why: string; to: string }) {
  const lines = template.replace(/\r/g, "").split("\n");
  const subjLine = lines[0].startsWith("Subject:") ? lines.shift()!.slice(8).trim() : `Coffee chat about [COMPANY]`;
  const fill = (s: string, html: boolean) => {
    const e = html ? esc : (x: string) => x;
    return s.replace(/\[FOUNDER FIRST NAME\]/g, e(p.first)).replace(/\[COMPANY\]/g, e(p.company)).replace(/\[WHY LINE\]/g, e(p.why));
  };
  const paras = lines.join("\n").trim().split(/\n\s*\n/);
  const subject = fill(subjLine, false);
  const body = paras.map((x) => (x.trim() === "[PORTFOLIO CARD]" ? PORTFOLIO : fill(x, false))).join("\n\n");
  const html =
    `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:21px;color:#1f2328;">` +
    paras.map((x) => (x.trim() === "[PORTFOLIO CARD]" ? portfolioCard() : `<p style="margin:0 0 14px 0;">${fill(esc(x), true).replace(/\n/g, "<br>")}</p>`)).join("") +
    `</div>`;
  return { subject, body, html, sha256: sha(`${p.to}\n${subject}\n${html}`) };
}

/** The one line the LLM writes. It must come from what the company says it does. */
export function checkWhyLine(why: string, c: { one_liner?: string | null; description?: string | null; tags?: string[] }) {
  const problems: string[] = [];
  const w = why.trim();
  if (/[—–]/.test(w)) problems.push("no em or en dashes");
  if (w.length < 12) problems.push("too short");
  if (w.length > 170) problems.push("keep it under 170 characters");
  if (/\n/.test(w)) problems.push("one line only");
  if (/[.!?]$/.test(w)) problems.push("no ending punctuation; the template adds the period");
  const src = [c.one_liner, c.description, ...(c.tags ?? [])].filter(Boolean).join(" ").toLowerCase();
  const words = (w.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || []).filter((x) => !/^(your|that|with|what|from|this|their|they|have|about|really|building|built|work|working|using|like|into|more|most|very|team)$/.test(x));
  if (!words.some((x) => src.includes(x))) problems.push("must name something from the company's own description");
  for (const n of w.match(/\d[\d,.]*%?/g) ?? []) if (!src.includes(n.toLowerCase())) problems.push(`number "${n}" is not in the company's description`);
  if (/learn(ing)? curve|ramp(ing)? up|challenge for me/i.test(w)) problems.push("never frame learning as a challenge");
  return problems;
}

/** Founder emails at startups are most often first@domain. */
const FOUNDER_PATTERNS = ["{first}", "{first}.{last}"];
function founderPattern(p: any, tried: string[]): string | null {
  if (p?.pattern && p.status === "confirmed") return tried.includes(p.pattern) ? null : p.pattern;
  const order = p?.pattern && p.status === "guessed" ? [p.pattern, ...FOUNDER_PATTERNS] : FOUNDER_PATTERNS;
  return order.find((x) => !tried.includes(x) && !(p?.status === "wrong" && p.pattern === x)) ?? null;
}

async function checkMx(domain: string) {
  let accepts = false;
  try { accepts = (await dns.resolveMx(domain)).length > 0; } catch { accepts = false; }
  return one(`INSERT INTO email_patterns (domain, accepts_mail) VALUES ($1,$2)
    ON CONFLICT (domain) DO UPDATE SET accepts_mail = EXCLUDED.accepts_mail, updated_at = now() RETURNING *`, [domain, accepts]);
}

const pickFounder = (fs: any[]) => fs.find((f) => /\bceo\b|chief executive/i.test(f.title ?? "")) ?? fs.find((f) => /founder/i.test(f.title ?? "")) ?? fs[0];

export async function entrepreneurStatus() {
  const r = await one(`SELECT count(*) FILTER (WHERE track_status IN ('found','researched'))::int to_research,
      (SELECT count(*)::int FROM ent_emails WHERE status = 'drafted') waiting_for_vishwa,
      (SELECT count(*)::int FROM ent_emails WHERE status = 'approved') approved_unsent,
      (SELECT count(*)::int FROM ent_emails WHERE status = 'sent' AND updated_at > now() - interval '7 days') sent_7d
    FROM yc_companies WHERE fit_score >= 40`);
  return r;
}

async function sentToday(): Promise<number> {
  const r = await one("SELECT count(*)::int n FROM ent_emails WHERE status IN ('sent','bounced') AND sent_at > date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'America/Los_Angeles'");
  return r?.n ?? 0;
}

// ---------- Tools ----------

const companyIn = z.object({
  slug: z.string().describe("From ycombinator.com/companies/<slug>"), name: z.string(), batch: z.string().optional(),
  one_liner: z.string().optional(), description: z.string().optional(), website: z.string().optional(), location: z.string().optional(),
  team_size: z.number().int().optional(), industries: z.array(z.string()).optional(), tags: z.array(z.string()).optional(),
  is_hiring: z.boolean().optional(), status: z.string().optional(),
});

export function registerEntrepreneurTools(server: McpServer) {
  server.registerTool(
    "jamie_ent_sync",
    {
      description: "Entrepreneur: pull the YC directory mirror (yc-oss, updated daily from YC's search index; it can lag the newest batch) and score every active company for fit with Vishwa in code. Saves companies scoring at least min_score. Returns the best new ones.",
      inputSchema: { min_score: z.number().optional(), since_year: z.number().int().optional().describe("Oldest batch year to keep; default 2 years back"), limit: z.number().int().max(100).optional() },
    },
    async ({ min_score, since_year, limit }) => {
      const min = min_score ?? Number((await getSetting("ent_min_score")) ?? 40);
      const year = since_year ?? new Date().getFullYear() - 2;
      let data: any[];
      try {
        const res = await fetch(YC_FEED);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = (await res.json()) as any[];
      } catch (e: any) {
        return ok({ refused: true, reason: `YC feed unreachable (${e.message})`, fallback: "Open https://www.ycombinator.com/companies in Chrome with batch and industry filters, read each company page, and send them to jamie_ent_add_companies." });
      }
      let kept = 0, newOnes: any[] = [], newestBatch = 0;
      for (const r of data) {
        const k = batchKey(r.batch);
        if (k && k > newestBatch) newestBatch = k;
        if (!k || Math.floor(k / 10) < year) continue;
        const c: Company = {
          slug: r.slug, name: r.name, batch: r.batch, one_liner: r.one_liner, description: r.long_description, website: r.website,
          location: Array.isArray(r.all_locations) ? r.all_locations.join("; ") : r.all_locations, regions: r.regions ?? [], team_size: r.team_size ?? null,
          industries: r.industries ?? (r.industry ? [r.industry] : []), tags: r.tags ?? [], is_hiring: r.isHiring ?? null, status: r.status, nonprofit: r.nonprofit,
        };
        if (!c.slug || !c.name) continue;
        const s = scoreCompany(c);
        if (s.reject || s.score < min) continue;
        const row = await upsertCompany(c, "yc-oss");
        kept++;
        if (row.inserted) newOnes.push({ slug: c.slug, name: c.name, batch: c.batch, one_liner: c.one_liner, score: s.score, why: s.why.join(", ") });
      }
      newOnes.sort((a, b) => b.score - a.score);
      const nb = newestBatch ? `${["", "Winter", "Spring", "Summer", "Fall"][newestBatch % 10]} ${Math.floor(newestBatch / 10)}` : "unknown";
      return ok({
        scanned: data.length, kept, new: newOnes.length, newest_batch_in_feed: nb, top_new: newOnes.slice(0, limit ?? 25),
        next: `If YC has a batch newer than ${nb}, add it from ycombinator.com/companies (jamie_ent_add_companies). Then jamie_ent_shortlist.`,
      });
    }
  );

  server.registerTool(
    "jamie_ent_add_companies",
    {
      description: "Entrepreneur: add YC companies read from ycombinator.com (newest batch, or one she names). Copy fields as shown on the page; code scores fit.",
      inputSchema: { companies: z.array(companyIn).min(1).max(50) },
    },
    async ({ companies }) => {
      const out: any[] = [];
      for (const c of companies) { const r = await upsertCompany(c, "ycombinator.com"); out.push({ slug: c.slug, name: c.name, score: r.score, why: r.why.join(", "), reject: r.reject, track_status: r.track_status }); }
      return ok({ saved: out.sort((a, b) => b.score - a.score) });
    }
  );

  server.registerTool(
    "jamie_ent_shortlist",
    {
      description: "Entrepreneur: the best-fit YC companies not contacted yet, with what's missing for each (founder, funding, email line).",
      inputSchema: { limit: z.number().int().max(50).optional() },
    },
    async ({ limit }) => {
      const min = Number((await getSetting("ent_min_score")) ?? 40);
      const rows = await q(`SELECT slug, name, batch, one_liner, location, team_size, is_hiring, fit_score, fit_reason, track_status, yc_url,
          jsonb_array_length(founders) n_founders, funding_text
        FROM yc_companies WHERE track_status IN ('found','researched') AND fit_score >= $1 ORDER BY fit_score DESC, batch_key DESC NULLS LAST LIMIT $2`, [min, limit ?? 15]);
      return ok({
        shortlist: (rows as any[]).map((r) => ({ ...r, needs: r.track_status === "found" ? "research: founders from the YC page, funding from the web" : "draft: write the why line" })),
        daily: { sent_today: await sentToday(), cap: Number((await getSetting("ent_daily_cap")) ?? 10) },
      });
    }
  );

  server.registerTool(
    "jamie_ent_research",
    {
      description: "Entrepreneur: save what you read about one company. Founders exactly as listed on its YC page. Funding only from a public source with its URL (press release, TechCrunch, company blog); otherwise leave it out and code records 'not found'. Code picks the founder to email (CEO first), checks the domain, and guesses one address.",
      inputSchema: {
        slug: z.string(),
        founders: z.array(z.object({ name: z.string(), title: z.string().optional(), linkedin_url: z.string().optional(), location: z.string().optional() })).min(1),
        funding_text: z.string().optional().describe("As the source says it, e.g. 'Raised a $4.5M seed led by X (Mar 2026)'"),
        funding_usd: z.number().optional().describe("Total raised in USD, only if the source states it"),
        funding_source_url: z.string().optional(),
        website: z.string().optional(), location: z.string().optional(), team_size: z.number().int().optional(), is_hiring: z.boolean().optional(),
      },
    },
    async (a) => {
      const c = await one("SELECT * FROM yc_companies WHERE slug = $1", [a.slug]);
      if (!c) return ok({ refused: true, reason: "unknown slug; add it with jamie_ent_add_companies first" });
      if ((a.funding_text || a.funding_usd) && !a.funding_source_url) return ok({ refused: true, reason: "funding needs the source URL it came from" });
      const founders = a.founders.map((f) => ({ ...f, name: splitName(f.name)?.clean ?? f.name }));
      const domain = domainOf(a.website ?? c.website);
      await q(`UPDATE yc_companies SET founders = $2, funding_text = $3, funding_usd = $4, funding_source = $5, funding_checked_at = now(),
               website = COALESCE($6, website), domain = COALESCE($7, domain), location = COALESCE($8, location), team_size = COALESCE($9, team_size),
               is_hiring = COALESCE($10, is_hiring), track_status = CASE WHEN track_status = 'found' THEN 'researched' ELSE track_status END, updated_at = now() WHERE slug = $1`,
        [a.slug, JSON.stringify(founders), a.funding_text ?? "not found", a.funding_usd ?? null, a.funding_source_url ?? null, a.website ?? null, domain, a.location ?? null, a.team_size ?? null, a.is_hiring ?? null]);
      const f = pickFounder(founders);
      const n = splitName(f.name);
      const warnings: string[] = [];
      if (!n) return ok({ refused: true, reason: `no full name for ${f.name}` });
      if (!domain) return ok({ refused: true, reason: "no website domain; pass website" });
      const prior = await one("SELECT s.sent_at FROM sends s JOIN contacts ct ON ct.id = s.contact_id WHERE lower(ct.name) = lower($1) AND lower(ct.company) = lower($2)", [n.clean, c.name]);
      if (prior) { await q("UPDATE yc_companies SET track_status = 'contacted_before' WHERE slug = $1", [a.slug]); return ok({ skip: true, reason: `${n.clean} was already emailed ${String(prior.sent_at).slice(0, 15)}` }); }
      const p = await checkMx(domain);
      if (!p.accepts_mail) return ok({ refused: true, reason: `${domain} has no mail server (MX)` });
      const pattern = founderPattern(p, []);
      if (!pattern) return ok({ refused: true, reason: "no email pattern left to try" });
      if (p.catch_all) warnings.push(`${domain} is catch-all: the guess is low confidence.`);
      const email = applyPattern(pattern, n.first, n.last, domain);
      const conf = p.status === "confirmed" ? "high" : p.catch_all ? "low" : "medium";
      let ct = await one("SELECT * FROM contacts WHERE lower(name) = lower($1) AND lower(company) = lower($2)", [n.clean, c.name]);
      ct = ct
        ? await one("UPDATE contacts SET title = $2, domain = $3, email = $4, email_source = 'guessed', email_confidence = $5, linkedin_url = COALESCE(linkedin_url, $6), updated_at = now() WHERE id = $1 RETURNING *", [ct.id, f.title ?? "Founder", domain, email, conf, f.linkedin_url ?? null])
        : await one("INSERT INTO contacts (name, title, company, domain, linkedin_url, email, email_source, email_confidence, status, notes) VALUES ($1,$2,$3,$4,$5,$6,'guessed',$7,'new','Entrepreneur: YC founder') RETURNING *", [n.clean, f.title ?? "Founder", c.name, domain, f.linkedin_url ?? null, email, conf]);
      await q("DELETE FROM ent_emails WHERE slug = $1 AND status IN ('drafted','researched')", [a.slug]);
      await q("INSERT INTO ent_emails (slug, contact_id, founder_name, founder_first, founder_title, email, pattern, status) VALUES ($1,$2,$3,$4,$5,$6,$7,'researched')", [a.slug, ct.id, n.clean, n.first, f.title ?? "Founder", email, pattern]);
      return ok({
        company: c.name, founder: { name: n.clean, title: f.title, email, confidence: conf, pattern }, funding: a.funding_text ?? "not found", warnings,
        what_they_do: c.one_liner, description: c.description,
        next: "Write the why line: one short phrase that finishes \"I am really interested in ...\", naming something specific from their description, then jamie_ent_draft.",
      });
    }
  );

  server.registerTool(
    "jamie_ent_draft",
    {
      description: "Entrepreneur: write one founder email. You give only the why line (finishes \"I am really interested in ...\"); code checks it against the company's own description and renders the rest from Vishwa's approved template with the portfolio card.",
      inputSchema: { slug: z.string(), why_line: z.string() },
    },
    async ({ slug, why_line }) => {
      const t = await approvedTemplate();
      if (!t) return ok({ refused: true, reason: `Vishwa hasn't approved "${TEMPLATE_QUESTION}" in the answer bank yet. Show it to her first.` });
      const c = await one("SELECT * FROM yc_companies WHERE slug = $1", [slug]);
      const e = await one("SELECT * FROM ent_emails WHERE slug = $1 AND status IN ('researched','drafted') ORDER BY id DESC LIMIT 1", [slug]);
      if (!c || !e) return ok({ refused: true, reason: "research the company first (jamie_ent_research)" });
      const problems = checkWhyLine(why_line, c);
      if (problems.length) return ok({ refused: true, problems, company_says: { one_liner: c.one_liner, description: c.description } });
      const r = renderFounderEmail(t.text, { first: e.founder_first, company: c.name, why: why_line.trim(), to: e.email });
      await q("UPDATE ent_emails SET why_line = $2, subject = $3, body = $4, html = $5, sha256 = $6, template_id = $7, status = 'drafted', updated_at = now() WHERE id = $1",
        [e.id, why_line.trim(), r.subject, r.body, r.html, r.sha256, t.id]);
      await q("UPDATE yc_companies SET track_status = 'drafted', updated_at = now() WHERE slug = $1", [slug]);
      return ok({ email_id: e.id, to: e.email, subject: r.subject, body: r.body, next: "Draft the next company, then jamie_ent_review to show Vishwa the batch." });
    }
  );

  server.registerTool(
    "jamie_ent_review",
    {
      description: "Entrepreneur: every drafted founder email waiting for Vishwa, each with its exact subject and body. Show her all of them; nothing sends until jamie_ent_approve.",
      inputSchema: {},
    },
    async () => {
      const rows = await q(`SELECT e.id, y.name company, y.batch, y.one_liner, y.funding_text, e.founder_name, e.founder_title, e.email, ct.email_confidence, e.why_line, e.subject, e.body
        FROM ent_emails e JOIN yc_companies y ON y.slug = e.slug JOIN contacts ct ON ct.id = e.contact_id WHERE e.status = 'drafted' ORDER BY y.fit_score DESC`);
      return ok({ waiting: rows, note: "Only the founder's first name, company and the why line change between emails. Show her each why line and one full email; she can drop any." });
    }
  );

  server.registerTool(
    "jamie_ent_approve",
    {
      description: "Entrepreneur: record Vishwa's yes for drafted founder emails. Only after she approved them in chat; pass her words. Unlisted drafts stay waiting.",
      inputSchema: { email_ids: z.array(z.number().int()).min(1), vishwa_said: z.string().min(2), drop_ids: z.array(z.number().int()).optional() },
    },
    async ({ email_ids, vishwa_said, drop_ids }) => {
      if (drop_ids?.length) {
        const d = await q("UPDATE ent_emails SET status = 'skipped', updated_at = now() WHERE id = ANY($1::int[]) AND status = 'drafted' RETURNING slug", [drop_ids]);
        for (const r of d as any[]) await q("UPDATE yc_companies SET track_status = 'skipped' WHERE slug = $1", [r.slug]);
      }
      const n = await q("UPDATE ent_emails SET status = 'approved', approved_quote = $2, approved_at = now(), updated_at = now() WHERE id = ANY($1::int[]) AND status = 'drafted' RETURNING id", [email_ids, vishwa_said]);
      return ok({ approved: n.length, next: "jamie_postman_assets part thumbnail (once per session), then loop jamie_ent_next -> Gmail send_message -> jamie_ent_sent." });
    }
  );

  server.registerTool(
    "jamie_ent_next",
    {
      description: "Entrepreneur: the next approved founder email allowed to go out now, with its exact Gmail payload. Code enforces the daily cap, Jamie's guardrails, the Gmail ceiling, pacing and bounce handling.",
      inputSchema: {},
    },
    async () => {
      // A bounced founder: try the second pattern once, which needs Vishwa's OK again.
      const bounced = (await q(`SELECT e.*, y.name company, y.domain FROM ent_emails e JOIN sends s ON s.id = e.send_id JOIN yc_companies y ON y.slug = e.slug
        WHERE e.status = 'sent' AND s.bounced`)) as any[];
      const tell: string[] = [];
      for (const b of bounced) {
        await q("UPDATE ent_emails SET status = 'bounced', updated_at = now() WHERE id = $1", [b.id]);
        const tried = ((await q("SELECT DISTINCT pattern FROM ent_emails WHERE contact_id = $1 AND status = 'bounced'", [b.contact_id])) as any[]).map((r) => r.pattern);
        const p = await one("SELECT * FROM email_patterns WHERE domain = $1", [b.domain]);
        const next = tried.length < Number((await getSetting("max_patterns_per_person")) ?? 2) ? founderPattern(p, tried) : null;
        if (!next) { tell.push(`${b.founder_name} (${b.company}) bounced on every pattern. One Apollo lookup is allowed through the normal bounce flow.`); continue; }
        const n = splitName(b.founder_name)!;
        const email = applyPattern(next, n.first, n.last, b.domain);
        const t = await approvedTemplate();
        const r = renderFounderEmail(t!.text, { first: b.founder_first, company: b.company, why: b.why_line, to: email });
        await q("INSERT INTO ent_emails (slug, contact_id, founder_name, founder_first, founder_title, email, pattern, why_line, subject, body, html, sha256, template_id, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'drafted')",
          [b.slug, b.contact_id, b.founder_name, b.founder_first, b.founder_title, email, next, b.why_line, r.subject, r.body, r.html, r.sha256, t!.id]);
        await q("UPDATE contacts SET email = $2, email_confidence = 'low', status = 'new', updated_at = now() WHERE id = $1", [b.contact_id, email]);
        tell.push(`${b.email} bounced. Re-drafted to ${email}; it needs her OK (jamie_ent_review).`);
      }
      const last3 = (await q("SELECT bounced FROM sends ORDER BY sent_at DESC LIMIT 3")) as any[];
      if (last3.length === 3 && last3.every((s) => s.bounced)) return ok({ stop: true, tell_vishwa: ["The last 3 emails sent all bounced. Outreach stopped until Vishwa looks.", ...tell] });
      const cap = Number((await getSetting("ent_daily_cap")) ?? 10);
      if ((await sentToday()) >= cap) return ok({ wait: true, reason: `Daily founder email cap reached (${cap}). Resume tomorrow.`, tell_vishwa: tell });
      const ceiling = Number((await getSetting("postman_gmail_daily_ceiling")) ?? 450);
      const all24 = (await one("SELECT count(*)::int n FROM sends WHERE sent_at > now() - interval '24 hours'")).n;
      if (all24 >= ceiling) return ok({ wait: true, reason: `${ceiling} emails in 24 hours (Gmail ceiling).`, tell_vishwa: tell });
      const gap = Number((await getSetting("postman_min_gap_seconds")) ?? 20);
      const lastT = await one("SELECT max(sent_at) t FROM ent_emails");
      if (lastT?.t && (Date.now() - new Date(lastT.t).getTime()) / 1000 < gap) return ok({ wait: true, wait_seconds: gap, reason: "pacing", tell_vishwa: tell });
      const queue = (await q("SELECT e.* FROM ent_emails e JOIN yc_companies y ON y.slug = e.slug WHERE e.status = 'approved' ORDER BY y.fit_score DESC, e.id")) as any[];
      for (const e of queue) {
        const g = await guardrailStatus(e.contact_id);
        if (!g.can_send) { await q("UPDATE ent_emails SET status = 'skipped', notes = $2 WHERE id = $1", [e.id, g.blocks.join(" ")]); tell.push(`${e.founder_name}: skipped (${g.blocks.join(" ")})`); continue; }
        const thumbSha = (await getSetting<string>(`postman_asset:${THUMBNAIL_FILE}`)) ?? "<thumbnail sha256 from jamie_postman_assets>";
        return ok({
          email_id: e.id, founder: e.founder_name, sha256: e.sha256, warnings: g.warnings, tell_vishwa: tell.length ? tell : undefined,
          gmail_send_message: {
            to: [e.email], subject: e.subject, htmlBody: e.html, body: e.body,
            attachments: [{ content: `sha256:${thumbSha}:/mnt/user-data/outputs/jamie/${THUMBNAIL_FILE}`, filename: THUMBNAIL_FILE, mimeType: "image/png", inline: true }],
          },
          rule: "Send exactly this; the thumbnail is cid:att0. Then jamie_ent_sent.",
        });
      }
      return ok({ done: true, tell_vishwa: tell.length ? tell : undefined, next: "Bounce checks at 1h and 24h (jamie_start_session lists them)." });
    }
  );

  server.registerTool(
    "jamie_ent_sent",
    {
      description: "Entrepreneur: log a founder email right after Gmail sent it. The sha256 must match the approved email.",
      inputSchema: { email_id: z.number().int(), sha256: z.string(), gmail_message_id: z.string(), gmail_thread_id: z.string().optional() },
    },
    async ({ email_id, sha256, gmail_message_id, gmail_thread_id }) => {
      const e = await one("SELECT * FROM ent_emails WHERE id = $1", [email_id]);
      if (!e) return ok({ refused: true, reason: "no such email" });
      if (e.status !== "approved") return ok({ refused: true, reason: `email is ${e.status}, not approved` });
      if (e.sha256 !== sha256) return ok({ refused: true, reason: "sha256 does not match the approved email. Tell Vishwa exactly what was sent." });
      const s = await one("INSERT INTO sends (contact_id, to_email, subject, gmail_message_id, gmail_thread_id) VALUES ($1,$2,$3,$4,$5) RETURNING id, sent_at", [e.contact_id, e.email, e.subject, gmail_message_id, gmail_thread_id ?? null]);
      await q("UPDATE contacts SET status = 'sent', updated_at = now() WHERE id = $1", [e.contact_id]);
      await q("UPDATE ent_emails SET status = 'sent', send_id = $2, sent_at = now(), updated_at = now() WHERE id = $1", [email_id, s.id]);
      await q("UPDATE yc_companies SET track_status = 'emailed', updated_at = now() WHERE slug = $1", [e.slug]);
      return ok({ logged: s, next: "jamie_ent_next" });
    }
  );

  server.registerTool(
    "jamie_ent_tracker",
    {
      description: "Entrepreneur: the YC tracker. Company, what it does, batch, founder, funding (with source), fit, status and when the founder was emailed.",
      inputSchema: { status: z.string().optional().describe("found, researched, drafted, emailed, replied, meeting, not_relevant, skipped, contacted_before"), limit: z.number().int().max(200).optional() },
    },
    async ({ status, limit }) => ok(await q(
      `SELECT y.name company, y.batch, y.one_liner what_they_do, y.location, y.team_size, y.is_hiring,
              (SELECT string_agg(f->>'name' || COALESCE(' (' || (f->>'title') || ')', ''), ', ') FROM jsonb_array_elements(y.founders) f) founders,
              y.funding_text funding, y.funding_source, y.fit_score, y.fit_reason, y.track_status status,
              (SELECT max(sent_at) FROM ent_emails e WHERE e.slug = y.slug) emailed_at, y.notes, y.yc_url
       FROM yc_companies y WHERE ($1::text IS NULL OR y.track_status = $1) AND y.fit_score >= 0
       ORDER BY (y.track_status IN ('emailed','replied','meeting')) DESC, y.fit_score DESC LIMIT $2`, [status ?? null, limit ?? 50]))
  );

  server.registerTool(
    "jamie_ent_update",
    {
      description: "Entrepreneur: update a company in the tracker when something happens (founder replied, meeting booked, not relevant). Only on facts: a reply in Gmail or Vishwa saying so.",
      inputSchema: { slug: z.string(), status: z.enum(["replied", "meeting", "not_relevant", "skipped", "found"]), note: z.string().optional() },
    },
    async ({ slug, status, note }) => ok(await one("UPDATE yc_companies SET track_status = $2, notes = concat_ws('; ', notes, $3::text), updated_at = now() WHERE slug = $1 RETURNING name, track_status, notes", [slug, status, note ?? null]))
  );
}
