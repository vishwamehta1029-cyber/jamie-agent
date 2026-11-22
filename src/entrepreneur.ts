// Entrepreneur: emails founders of San Francisco startups that build agents (YC or not), asking for a
// coffee chat, aiming for 100 founders a day. Almost everything is code: the YC directory pull, the
// SF + agents filter, fit ranking, founders from each YC page, public emails from company websites,
// Apollo email lookups, the company-specific line when the one-liner allows it, every email's text,
// and all sending gates. The LLM only fills gaps code can't (a company or founder code couldn't find,
// an Apollo lookup through the MCP when no API key is set, a why line code couldn't write) and gets
// Vishwa's approval for every email.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createHash } from "node:crypto";
import { promises as dns } from "node:dns";
import { z } from "zod";
import { q, one, getSetting } from "./db.js";
import { guardrailStatus } from "./server.js";
import { splitName, esc, portfolioCard, PORTFOLIO, THUMBNAIL_FILE } from "./postman.js";

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const norm = (s: string) => s.trim().toLowerCase();
const UA = { "user-agent": "Mozilla/5.0 (compatible; Jamie/1.0; +https://vishwamehta.vercel.app/)" };

export const YC_FEED = "https://yc-oss.github.io/api/companies/all.json";
export const TEMPLATE_QUESTION = "Entrepreneur founder email (coffee chat)";
const setting = async (k: string, d: number) => Number((await getSetting(k)) ?? d);

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

// ---------- Scope and ranking (plain code) ----------

export type Company = {
  slug: string; name: string; is_yc?: boolean; batch?: string | null; one_liner?: string | null; description?: string | null;
  website?: string | null; location?: string | null; team_size?: number | null; industries?: string[]; tags?: string[];
  is_hiring?: boolean | null; status?: string | null; nonprofit?: boolean | null; source_url?: string | null;
  funding_text?: string | null; funding_source?: string | null; apollo_org_id?: string | null;
};

export const BUILDS_AGENTS = /\bagents?\b|agentic|multi-agent|\bai (?:employee|worker|teammate|sdr|bdr|assistant)s?\b/i;
export const inSF = (loc?: string | null) => !!loc && /san francisco|\bsf\b/i.test(loc);
export const buildsAgents = (c: Company) => BUILDS_AGENTS.test([c.one_liner, c.description, ...(c.tags ?? [])].filter(Boolean).join(" "));

/** Order of outreach: fresher batches, smaller teams, hiring, B2B. Scope (SF + agents) is a hard filter, not a score. */
export function scoreCompany(c: Company, nowYear = new Date().getFullYear()): { score: number; why: string[] } {
  const text = [c.one_liner, c.description, ...(c.tags ?? []), ...(c.industries ?? [])].filter(Boolean).join(" ");
  const why: string[] = ["builds agents", "San Francisco"];
  let score = 50;
  if (c.is_yc) { score += 5; why.push("YC"); }
  if (/\bgtm\b|go-to-market|sales|outbound|revenue|marketing|\bcrm\b/i.test(text)) { score += 8; why.push("GTM"); }
  if (/enterprise|deploy|implementation|customer|workflow|automat/i.test(text)) { score += 6; why.push("workflows or customers"); }
  if ((c.industries ?? []).some((i) => /b2b/i.test(i)) || /\bb2b\b/i.test(text)) { score += 6; why.push("B2B"); }
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
    else if (t > 200) score -= 15;
  }
  if (c.is_hiring) { score += 8; why.push("hiring"); }
  return { score, why };
}

export function domainOf(website?: string | null): string | null {
  if (!website) return null;
  try { return new URL(/^https?:/i.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
}

async function upsertCompany(c: Company, source: string) {
  const s = scoreCompany(c);
  const row = await one(
    `INSERT INTO ent_companies (slug, name, is_yc, batch, batch_key, one_liner, description, website, domain, location, team_size, industries, tags, is_hiring, status, source_url, fit_score, fit_reason, source, funding_text, funding_source, apollo_org_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, batch = COALESCE(EXCLUDED.batch, ent_companies.batch), batch_key = COALESCE(EXCLUDED.batch_key, ent_companies.batch_key),
       one_liner = COALESCE(EXCLUDED.one_liner, ent_companies.one_liner), description = COALESCE(EXCLUDED.description, ent_companies.description),
       website = COALESCE(EXCLUDED.website, ent_companies.website), domain = COALESCE(EXCLUDED.domain, ent_companies.domain), location = COALESCE(EXCLUDED.location, ent_companies.location),
       team_size = COALESCE(EXCLUDED.team_size, ent_companies.team_size), is_hiring = COALESCE(EXCLUDED.is_hiring, ent_companies.is_hiring), status = COALESCE(EXCLUDED.status, ent_companies.status),
       funding_text = COALESCE(ent_companies.funding_text, EXCLUDED.funding_text), funding_source = COALESCE(ent_companies.funding_source, EXCLUDED.funding_source),
       apollo_org_id = COALESCE(EXCLUDED.apollo_org_id, ent_companies.apollo_org_id), fit_score = EXCLUDED.fit_score, fit_reason = EXCLUDED.fit_reason, updated_at = now()
     RETURNING slug, (xmax = 0) inserted`,
    [c.slug, c.name, !!c.is_yc, c.batch ?? null, batchKey(c.batch), c.one_liner ?? null, c.description ?? null, c.website ?? null, domainOf(c.website),
     c.location ?? null, c.team_size ?? null, c.industries ?? [], c.tags ?? [], c.is_hiring ?? null, c.status ?? null, c.source_url ?? null,
     s.score, s.why.join(", "), source, c.funding_text ?? null, c.funding_source ?? null, c.apollo_org_id ?? null]
  );
  return { ...row, score: s.score };
}

// ---------- YC company page: founders and funding news ----------

const unescapeAttr = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** The YC company page embeds its data as JSON in a data-page attribute (checked live Nov 22, 2026). */
export function parseYcPage(html: string) {
  const m = html.match(/data-page="([^"]+)"/);
  if (!m) return null;
  let j: any;
  try { j = JSON.parse(unescapeAttr(m[1])); } catch { return null; }
  const co = j?.props?.company;
  if (!co) return null;
  const founders = (co.founders ?? []).map((f: any) => ({ name: String(f.full_name ?? "").trim(), title: f.title ?? "Founder", linkedin_url: f.linkedin_url ?? null, is_active: f.is_active !== false }));
  const news = (j.props.newsItems ?? []) as any[];
  const raise = news.find((n) => /rais|funding|seed|series [a-e]|\$\s?\d/i.test(String(n.title ?? "")) && /\$\s?\d|seed|series/i.test(String(n.title ?? "")));
  return {
    founders,
    city: co.city ?? null, location: co.location ?? null, website: co.website ?? null,
    funding: raise ? { text: String(raise.title), source: raise.url ?? raise.href ?? null } : null,
  };
}

// ---------- Public emails on the company's own website ----------

export function emailsOnPage(html: string, domain: string): string[] {
  const out = new Set<string>();
  for (const e of html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []) {
    const x = e.toLowerCase().replace(/\.$/, "");
    if (x.endsWith(`@${domain}`) && !/\.(png|jpg|jpeg|gif|svg|webp)$/.test(x)) out.add(x);
  }
  return [...out];
}

/** A public address that is clearly this founder's (first@, first.last@, flast@...). Generic ones (hello@, founders@) don't count. */
export function founderEmailFrom(emails: string[], first: string, last: string): string | null {
  const f = first.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "");
  const l = last.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "");
  if (!f || !l) return null;
  const want = [f, `${f}.${l}`, `${f}${l}`, `${f[0]}${l}`, `${f}_${l}`, `${f[0]}.${l}`, `${f}${l[0]}`];
  return emails.find((e) => want.includes(e.split("@")[0])) ?? null;
}

async function fetchText(url: string, ms = 6000): Promise<string> {
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms), redirect: "follow" });
    if (!r.ok) return "";
    return (await r.text()).slice(0, 600_000);
  } catch { return ""; }
}

async function publicEmails(domain: string): Promise<string[]> {
  const pages = await Promise.all(["", "/about", "/team", "/contact", "/company"].map((p) => fetchText(`https://${domain}${p}`)));
  return [...new Set(pages.flatMap((h) => emailsOnPage(h, domain)))];
}

// ---------- Apollo (code path needs APOLLO_API_KEY from a paid Apollo plan) ----------

const apolloKey = () => process.env.APOLLO_API_KEY || null;
async function apollo(path: string, body: unknown): Promise<any> {
  const r = await fetch(`https://api.apollo.io/api/v1/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "X-Api-Key": apolloKey()! },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error ?? j?.message ?? `HTTP ${r.status}`);
  return j;
}

async function apolloCreditsToday(): Promise<number> {
  const r = await one("SELECT COALESCE(sum(credits),0)::numeric n FROM apollo_usage WHERE reason LIKE 'entrepreneur:%' AND created_at > date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'America/Los_Angeles'");
  return Number(r?.n ?? 0);
}

// ---------- The company-specific line ----------

/** Turns a noun-phrase one-liner into the "I am really interested in ..." line. null when it isn't one; the LLM writes those. */
export function whyFromOneLiner(name: string, oneLiner?: string | null): string | null {
  if (!oneLiner) return null;
  let s = oneLiner.trim().replace(/\s+/g, " ").replace(/[.!]+$/, "");
  if (!s || s.length > 140 || /[—–:;?]/.test(s)) return null;
  if (s.toLowerCase().startsWith(name.toLowerCase())) return null;
  const NOUNISH = /^(the |an? |ai[ -]|agentic |autonomous |agents? |open[- ]source |voice |enterprise |vertical |llm|multi-agent |browser |coding |personal |custom |intelligent |self-|end-to-end |[A-Z][A-Za-z0-9]+ for )/i;
  if (!NOUNISH.test(s)) return null;
  if (/^(the|an?) /i.test(s)) s = s.replace(/^(the|an?) /i, "");
  if (/^[A-Z][a-z]/.test(s) && !/^[A-Z][A-Za-z0-9]+ for /.test(s)) s = s[0].toLowerCase() + s.slice(1);
  return s;
}

/** Checks for any why line (code or LLM). It must come from what the company says it does. */
export function checkWhyLine(why: string, c: { one_liner?: string | null; description?: string | null; tags?: string[] }) {
  const problems: string[] = [];
  const w = why.trim();
  if (/[—–]/.test(w)) problems.push("no em or en dashes");
  if (w.length < 12) problems.push("too short");
  if (w.length > 170) problems.push("keep it under 170 characters");
  if (/\n/.test(w)) problems.push("one line only");
  if (/[.!?]$/.test(w)) problems.push("no ending punctuation; the template adds the period");
  const src = [c.one_liner, c.description, ...(c.tags ?? [])].filter(Boolean).join(" ").toLowerCase();
  const words = (w.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || []).filter((x) => !/^(your|that|with|what|from|this|their|they|have|about|really|building|built|work|working|using|like|into|more|most|very|team|teams)$/.test(x));
  if (!words.some((x) => src.includes(x))) problems.push("must name something from the company's own description");
  for (const n of w.match(/\d[\d,.]*%?/g) ?? []) if (!src.includes(n.toLowerCase())) problems.push(`number "${n}" is not in the company's description`);
  if (/learn(ing)? curve|ramp(ing)? up|challenge for me/i.test(w)) problems.push("never frame learning as a challenge");
  return problems;
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
  const subjLine = lines[0].startsWith("Subject:") ? lines.shift()!.slice(8).trim() : "Coffee chat about [COMPANY]";
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

// ---------- Shared steps ----------

async function ensureContact(f: any, c: any) {
  if (f.contact_id) return f.contact_id;
  const existing = await one("SELECT id FROM contacts WHERE lower(name) = lower($1) AND lower(company) = lower($2)", [f.name, c.name]);
  const id = existing?.id ?? (await one("INSERT INTO contacts (name, title, company, domain, linkedin_url, status, notes) VALUES ($1,$2,$3,$4,$5,'new','Entrepreneur: founder') RETURNING id",
    [f.name, f.title, c.name, c.domain, f.linkedin_url])).id;
  await q("UPDATE ent_founders SET contact_id = $2 WHERE id = $1", [f.id, id]);
  f.contact_id = id;
  return id;
}

async function setEmail(f: any, c: any, email: string, source: "public" | "apollo", status: string) {
  const contactId = await ensureContact(f, c);
  await q("UPDATE contacts SET email = $2, email_source = $3, email_confidence = $4, domain = COALESCE(domain, $5), updated_at = now() WHERE id = $1",
    [contactId, norm(email), source, source === "public" || status === "verified" ? "high" : "medium", c.domain]);
  await q("UPDATE ent_founders SET email = $2, email_source = $3, email_status = $4, status = 'ready', updated_at = now() WHERE id = $1", [f.id, norm(email), source, status]);
}

async function alreadyEmailed(name: string, company: string) {
  return one("SELECT s.sent_at FROM sends s JOIN contacts ct ON ct.id = s.contact_id WHERE lower(ct.name) = lower($1) AND lower(ct.company) = lower($2) LIMIT 1", [name, company]);
}

async function addFounders(c: any, founders: { name: string; title?: string | null; linkedin_url?: string | null; is_active?: boolean }[], source: string) {
  const max = await setting("ent_max_founders_per_company", 3);
  let added = 0;
  const active = founders.filter((f) => f.is_active !== false).slice(0, max);
  for (const f of active) {
    const n = splitName(f.name);
    if (!n) continue;
    const prior = await alreadyEmailed(n.clean, c.name);
    const r = await one(
      `INSERT INTO ent_founders (company_slug, name, first_name, last_name, title, linkedin_url, source, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (company_slug, lower(name)) DO NOTHING RETURNING id`,
      [c.slug, n.clean, n.first, n.last, f.title ?? "Founder", f.linkedin_url ?? null, source, prior ? "skipped" : "found", prior ? `already emailed ${String(prior.sent_at).slice(0, 15)}` : null]
    );
    if (r) added++;
  }
  await q("UPDATE ent_companies SET founders_checked_at = now(), track_status = CASE WHEN track_status = 'found' THEN 'researched' ELSE track_status END, updated_at = now() WHERE slug = $1", [c.slug]);
  return added;
}

async function sentToday(): Promise<number> {
  const r = await one("SELECT count(*)::int n FROM ent_founders WHERE sent_at > date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'America/Los_Angeles'");
  return r?.n ?? 0;
}

export async function entrepreneurStatus() {
  const r = await one(`SELECT
      (SELECT count(*)::int FROM ent_companies WHERE founders_checked_at IS NULL AND track_status = 'found') companies_to_research,
      (SELECT count(*)::int FROM ent_founders WHERE status = 'found') founders_need_email,
      (SELECT count(*)::int FROM ent_founders WHERE status = 'needs_apollo') founders_need_apollo,
      (SELECT count(*)::int FROM ent_founders WHERE status = 'ready') ready_to_draft,
      (SELECT count(*)::int FROM ent_founders WHERE status = 'needs_why') need_why_line,
      (SELECT count(*)::int FROM ent_founders WHERE status = 'drafted') waiting_for_vishwa,
      (SELECT count(*)::int FROM ent_founders WHERE status = 'approved') approved_unsent`);
  return { ...r, sent_today: await sentToday(), daily_target: await setting("ent_daily_cap", 100), apollo_api: !!apolloKey(), apollo_credits_today: await apolloCreditsToday() };
}

// ---------- Tools ----------

const companyIn = z.object({
  slug: z.string().optional().describe("YC slug if it's a YC company; otherwise leave out and the domain is used"),
  name: z.string(), website: z.string(), one_liner: z.string().optional(), description: z.string().optional(),
  location: z.string().describe("Where the company is based, as the source says"), batch: z.string().optional(), team_size: z.number().int().optional(),
  is_yc: z.boolean().optional(), source_url: z.string().describe("Where you found it"),
});

export function registerEntrepreneurTools(server: McpServer) {
  server.registerTool(
    "jamie_ent_plan",
    {
      description: "Entrepreneur: start here every run. Shows today's pipeline against the 100-founder target and the exact next tool to call. Code runs each step; call what it says until it says done or waits for Vishwa.",
      inputSchema: {},
    },
    async () => {
      const s = await entrepreneurStatus();
      const left = Math.max(0, s.daily_target - s.sent_today - s.approved_unsent - s.waiting_for_vishwa);
      const tpl = await approvedTemplate();
      const total = await one("SELECT count(*)::int n FROM ent_companies");
      let next: string;
      if (!tpl) next = `Vishwa must approve the "${TEMPLATE_QUESTION}" template in the answer bank first.`;
      else if (s.approved_unsent > 0) next = "jamie_ent_next (send the approved emails)";
      else if (s.waiting_for_vishwa > 0 && left === 0) next = "jamie_ent_review, show Vishwa, then jamie_ent_approve";
      else if (s.need_why_line > 0) next = "jamie_ent_needs_why, write each line, jamie_ent_set_why";
      else if (s.ready_to_draft > 0) next = "jamie_ent_draft_batch";
      else if (s.founders_need_email > 0) next = "jamie_ent_find_emails";
      else if (s.founders_need_apollo > 0 && s.apollo_api) next = "jamie_ent_find_emails";
      else if (s.companies_to_research > 0) next = "jamie_ent_find_founders";
      else if (s.founders_need_apollo > 0) next = "jamie_ent_needs_apollo (Apollo MCP lookups, 1 credit each, with Vishwa's OK on the total)";
      else if (!total?.n) next = "jamie_ent_sync";
      else next = s.waiting_for_vishwa ? "jamie_ent_review, show Vishwa, then jamie_ent_approve" : "jamie_ent_sync (and jamie_ent_sync_apollo for non-YC), or add companies from another list with jamie_ent_add_companies";
      return ok({ ...s, still_needed_today: left, next });
    }
  );

  server.registerTool(
    "jamie_ent_sync",
    {
      description: "Entrepreneur (code): pull the YC directory (yc-oss mirror of YC's search index, updated daily) and keep every active company based in San Francisco that builds agents. Ranks them for outreach order.",
      inputSchema: { since_year: z.number().int().optional().describe("Oldest batch year; default 2023") },
    },
    async ({ since_year }) => {
      const year = since_year ?? 2023;
      let data: any[];
      try {
        const res = await fetch(YC_FEED, { signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = (await res.json()) as any[];
      } catch (e: any) {
        return ok({ refused: true, reason: `YC feed unreachable (${e.message})` });
      }
      let kept = 0, added = 0, newest = 0;
      for (const r of data) {
        const k = batchKey(r.batch);
        if (k && k > newest) newest = k;
        const c: Company = {
          slug: r.slug, name: r.name, is_yc: true, batch: r.batch, one_liner: r.one_liner, description: r.long_description, website: r.website,
          location: Array.isArray(r.all_locations) ? r.all_locations.join("; ") : r.all_locations, team_size: r.team_size ?? null,
          industries: r.industries ?? [], tags: r.tags ?? [], is_hiring: r.isHiring ?? null, status: r.status, nonprofit: r.nonprofit,
          source_url: `https://www.ycombinator.com/companies/${r.slug}`,
        };
        if (!c.slug || !c.name || !/active/i.test(c.status ?? "") || c.nonprofit) continue;
        if (!k || Math.floor(k / 10) < year || !inSF(c.location) || !buildsAgents(c)) continue;
        const row = await upsertCompany(c, "yc");
        kept++; if (row.inserted) added++;
      }
      const nb = newest ? `${["", "Winter", "Spring", "Summer", "Fall"][newest % 10]} ${Math.floor(newest / 10)}` : "unknown";
      return ok({ scanned: data.length, sf_agent_companies: kept, new: added, newest_batch_in_feed: nb, next: "jamie_ent_plan" });
    }
  );

  server.registerTool(
    "jamie_ent_sync_apollo",
    {
      description: "Entrepreneur (code): non-YC San Francisco companies that build agents, from Apollo's company search (needs APOLLO_API_KEY; Apollo charges per search page). One page of up to 100 companies per call.",
      inputSchema: { page: z.number().int().min(1).max(50).optional() },
    },
    async ({ page }) => {
      if (!apolloKey()) return ok({ refused: true, reason: "APOLLO_API_KEY is not set on the Jamie server. Vishwa adds it in Vercel (paid Apollo plan). Until then, add non-YC companies with jamie_ent_add_companies." });
      let j: any;
      try {
        j = await apollo("mixed_companies/search", {
          q_organization_keyword_tags: ["ai agents", "agentic ai", "autonomous agents"], organization_locations: ["San Francisco, California, United States"],
          organization_num_employees_ranges: ["1,10", "11,50", "51,200"], page: page ?? 1, per_page: 100,
        });
      } catch (e: any) { return ok({ refused: true, reason: `Apollo: ${e.message}` }); }
      await q("INSERT INTO apollo_usage (reason, credits, result) VALUES ('entrepreneur:company_search', 1, $1)", [`page ${page ?? 1}`]);
      let kept = 0;
      for (const o of [...(j.organizations ?? []), ...(j.accounts ?? [])]) {
        const domain = o.primary_domain ?? o.domain ?? domainOf(o.website_url);
        if (!domain) continue;
        const dup = await one("SELECT slug FROM ent_companies WHERE domain = $1", [domain]);
        if (dup) continue;
        const c: Company = {
          slug: domain, name: o.name, is_yc: false, website: o.website_url ?? `https://${domain}`, one_liner: o.short_description ?? null,
          location: [o.city, o.state].filter(Boolean).join(", ") || "San Francisco", team_size: o.estimated_num_employees ?? null,
          tags: o.keywords ?? [], status: "Active", source_url: o.linkedin_url ?? `https://${domain}`,
          funding_text: o.total_funding_printed ? `Total raised ${o.total_funding_printed}${o.latest_funding_stage ? ` (latest: ${o.latest_funding_stage})` : ""}` : null,
          funding_source: o.total_funding_printed ? "Apollo company data" : null, apollo_org_id: o.organization_id ?? o.id,
        };
        if (!inSF(c.location)) continue;
        await upsertCompany(c, "apollo");
        kept++;
      }
      return ok({ page: page ?? 1, saved: kept, total_pages: j.pagination?.total_pages ?? null, credits_used: 1 });
    }
  );

  server.registerTool(
    "jamie_ent_add_companies",
    {
      description: "Entrepreneur: add San Francisco companies that build agents from any other list (non-YC included). Copy fields as the source shows them; code checks SF and agents.",
      inputSchema: { companies: z.array(companyIn).min(1).max(50) },
    },
    async ({ companies }) => {
      const saved: any[] = [], rejected: any[] = [];
      for (const x of companies) {
        const domain = domainOf(x.website);
        if (!domain) { rejected.push({ name: x.name, reason: "no website" }); continue; }
        const c: Company = { ...x, slug: x.slug ?? domain, status: "Active" };
        if (!inSF(c.location)) { rejected.push({ name: x.name, reason: `not San Francisco (${x.location})` }); continue; }
        if (!buildsAgents(c)) { rejected.push({ name: x.name, reason: "description doesn't say it builds agents" }); continue; }
        const r = await upsertCompany(c, x.is_yc ? "yc" : "manual");
        saved.push({ slug: c.slug, name: x.name, score: r.score });
      }
      return ok({ saved, rejected });
    }
  );

  server.registerTool(
    "jamie_ent_find_founders",
    {
      description: "Entrepreneur (code): founders for the next companies, best fit first. YC companies: read from each YC page (names, titles, LinkedIn, funding news). Non-YC: Apollo people search if the key is set. Only active founders, up to 3 per company. Anyone Jamie already emailed is skipped.",
      inputSchema: { limit: z.number().int().min(1).max(25).optional() },
    },
    async ({ limit }) => {
      const rows = (await q("SELECT * FROM ent_companies WHERE founders_checked_at IS NULL AND track_status = 'found' ORDER BY fit_score DESC, batch_key DESC NULLS LAST LIMIT $1", [limit ?? 15])) as any[];
      const results: any[] = [], needs_you: any[] = [];
      await Promise.all(rows.map(async (c) => {
        if (c.is_yc) {
          const page = parseYcPage(await fetchText(`https://www.ycombinator.com/companies/${c.slug}`, 10000));
          if (!page || !page.founders.length) { needs_you.push({ slug: c.slug, name: c.name, website: c.website, why: "YC page had no founder data" }); return; }
          if (page.funding && !c.funding_text) await q("UPDATE ent_companies SET funding_text = $2, funding_source = $3 WHERE slug = $1", [c.slug, page.funding.text, page.funding.source]);
          if (page.city && !inSF(page.city) && !inSF(page.location)) { await q("UPDATE ent_companies SET track_status = 'not_relevant', notes = 'YC page says not San Francisco', founders_checked_at = now() WHERE slug = $1", [c.slug]); return; }
          results.push({ company: c.name, added: await addFounders(c, page.founders, "yc_page") });
        } else if (apolloKey() && c.apollo_org_id) {
          try {
            const j = await apollo("mixed_people/api_search", { organization_ids: [c.apollo_org_id], person_titles: ["founder", "co-founder", "ceo", "chief executive officer"], per_page: 10 });
            const fs = (j.people ?? []).map((p: any) => ({ name: p.name ?? `${p.first_name} ${p.last_name}`, title: p.title, linkedin_url: p.linkedin_url }));
            if (!fs.length) { needs_you.push({ slug: c.slug, name: c.name, website: c.website, why: "Apollo found no founders" }); return; }
            results.push({ company: c.name, added: await addFounders(c, fs, "apollo_search") });
          } catch (e: any) { needs_you.push({ slug: c.slug, name: c.name, website: c.website, why: `Apollo: ${e.message}` }); }
        } else needs_you.push({ slug: c.slug, name: c.name, website: c.website, why: "non-YC: find founders on the company site or LinkedIn" });
      }));
      for (const n of needs_you) await q("UPDATE ent_companies SET founders_checked_at = now(), notes = concat_ws('; ', notes, $2::text) WHERE slug = $1 AND founders_checked_at IS NULL", [n.slug, n.why]);
      return ok({ checked: rows.length, results, needs_you: needs_you.length ? needs_you : undefined, how: needs_you.length ? "For each: find founders on the company site or LinkedIn, then jamie_ent_add_founders." : undefined, next: "jamie_ent_plan" });
    }
  );

  server.registerTool(
    "jamie_ent_add_founders",
    {
      description: "Entrepreneur: founders code couldn't find, copied exactly as the source shows (company site, LinkedIn). Optional funding with its source URL.",
      inputSchema: {
        slug: z.string(), founders: z.array(z.object({ name: z.string(), title: z.string().optional(), linkedin_url: z.string().optional() })).min(1),
        funding_text: z.string().optional(), funding_source_url: z.string().optional(),
      },
    },
    async ({ slug, founders, funding_text, funding_source_url }) => {
      const c = await one("SELECT * FROM ent_companies WHERE slug = $1", [slug]);
      if (!c) return ok({ refused: true, reason: "unknown company" });
      if (funding_text && !funding_source_url) return ok({ refused: true, reason: "funding needs the source URL" });
      if (funding_text) await q("UPDATE ent_companies SET funding_text = $2, funding_source = $3 WHERE slug = $1", [slug, funding_text, funding_source_url]);
      return ok({ added: await addFounders(c, founders, "manual") });
    }
  );

  server.registerTool(
    "jamie_ent_find_emails",
    {
      description: "Entrepreneur (code): emails for founders who don't have one. First the company's own website (a public address that is clearly the founder's), then Apollo people match if APOLLO_API_KEY is set (1 credit per match, within the daily Apollo budget; only Apollo-verified emails are used). No guessing.",
      inputSchema: { limit: z.number().int().min(1).max(30).optional() },
    },
    async ({ limit }) => {
      const fs = (await q(`SELECT f.*, c.name company, c.domain, c.slug FROM ent_founders f JOIN ent_companies c ON c.slug = f.company_slug
        WHERE f.status = 'found' OR (f.status = 'needs_apollo' AND $2::boolean) ORDER BY (f.status = 'found') DESC, c.fit_score DESC, f.id LIMIT $1`, [limit ?? 20, !!apolloKey()])) as any[];
      const byDomain = new Map<string, string[]>();
      let pub = 0, apo = 0, none = 0, budgetHit = false;
      const budget = await setting("ent_apollo_daily_credits", 100);
      const accept = String((await getSetting("ent_apollo_accept")) ?? "verified").split(",");
      for (const f of fs) {
        const c = { name: f.company, domain: f.domain, slug: f.slug };
        if (!f.domain) { await q("UPDATE ent_founders SET status = 'no_email', notes = 'company has no domain' WHERE id = $1", [f.id]); none++; continue; }
        if (f.status === "found") {
          let mx = false;
          try { mx = (await dns.resolveMx(f.domain)).length > 0; } catch { mx = false; }
          if (!mx) { await q("UPDATE ent_founders SET status = 'no_email', notes = 'domain has no mail server' WHERE id = $1", [f.id]); none++; continue; }
          if (!byDomain.has(f.domain)) byDomain.set(f.domain, await publicEmails(f.domain));
          const e = founderEmailFrom(byDomain.get(f.domain)!, f.first_name, f.last_name);
          if (e) { await setEmail(f, c, e, "public", "public"); pub++; continue; }
          await q("UPDATE ent_founders SET status = 'needs_apollo' WHERE id = $1", [f.id]);
        }
        if (!apolloKey()) continue;
        if ((await apolloCreditsToday()) >= budget) { budgetHit = true; break; }
        try {
          const j = await apollo("people/match", { first_name: f.first_name, last_name: f.last_name, domain: f.domain, organization_name: f.company, linkedin_url: f.linkedin_url ?? undefined, reveal_personal_emails: false });
          const p = j.person;
          const contactId = await ensureContact(f, c);
          await q("INSERT INTO apollo_usage (contact_id, reason, credits, result) VALUES ($1,'entrepreneur:people_match',$2,$3)", [contactId, p ? 1 : 0, p?.email ? `${p.email} (${p.email_status})` : "no email"]);
          await q("UPDATE ent_founders SET apollo_checked_at = now() WHERE id = $1", [f.id]);
          if (p?.email && accept.includes(String(p.email_status)) && String(p.email).toLowerCase().endsWith(`@${f.domain}`)) { await setEmail(f, c, p.email, "apollo", p.email_status); apo++; }
          else { await q("UPDATE ent_founders SET status = 'no_email', notes = $2 WHERE id = $1", [f.id, p?.email ? `Apollo email ${p.email_status}, not used` : "Apollo had no email"]); none++; }
        } catch (e: any) { return ok({ public: pub, apollo: apo, stopped: `Apollo: ${e.message}` }); }
      }
      const waiting = Number((await one("SELECT count(*)::int n FROM ent_founders WHERE status = 'needs_apollo'")).n);
      return ok({
        checked: fs.length, public: pub, apollo_verified: apo, no_email: none, waiting_for_apollo: waiting,
        apollo_credits_today: await apolloCreditsToday(), apollo_budget: budget, budget_hit: budgetHit || undefined,
        next: !apolloKey() && waiting ? "No Apollo API key: jamie_ent_needs_apollo for MCP lookups (tell Vishwa the total credits first)." : "jamie_ent_plan",
      });
    }
  );

  server.registerTool(
    "jamie_ent_needs_apollo",
    {
      description: "Entrepreneur: founders waiting for an Apollo lookup when the server has no API key. Run Apollo people_match through the Apollo MCP for each (1 credit per match; tell Vishwa the total first), then jamie_ent_set_email with what Apollo returned.",
      inputSchema: { limit: z.number().int().max(100).optional() },
    },
    async ({ limit }) => ok(await q(`SELECT f.id founder_id, f.first_name, f.last_name, f.linkedin_url, c.name organization_name, c.domain FROM ent_founders f JOIN ent_companies c ON c.slug = f.company_slug
      WHERE f.status = 'needs_apollo' ORDER BY c.fit_score DESC, f.id LIMIT $1`, [limit ?? 25]))
  );

  server.registerTool(
    "jamie_ent_set_email",
    {
      description: "Entrepreneur: record what an Apollo MCP lookup returned for one founder. Pass exactly Apollo's email and email_status, or found=false. Code keeps only verified addresses on the company domain and logs the credit.",
      inputSchema: { founder_id: z.number().int(), found: z.boolean(), email: z.string().optional(), email_status: z.string().optional(), credits: z.number().optional() },
    },
    async ({ founder_id, found, email, email_status, credits }) => {
      const f = await one("SELECT f.*, c.name company, c.domain, c.slug FROM ent_founders f JOIN ent_companies c ON c.slug = f.company_slug WHERE f.id = $1", [founder_id]);
      if (!f) return ok({ refused: true, reason: "no such founder" });
      const c = { name: f.company, domain: f.domain, slug: f.slug };
      const contactId = await ensureContact(f, c);
      await q("INSERT INTO apollo_usage (contact_id, reason, credits, result) VALUES ($1,'entrepreneur:people_match_mcp',$2,$3)", [contactId, credits ?? (found ? 1 : 0), found ? `${email} (${email_status})` : "no email"]);
      const accept = String((await getSetting("ent_apollo_accept")) ?? "verified").split(",");
      if (found && email && accept.includes(String(email_status)) && email.toLowerCase().endsWith(`@${f.domain}`)) { await setEmail(f, c, email, "apollo", email_status!); return ok({ saved: norm(email) }); }
      await q("UPDATE ent_founders SET status = 'no_email', apollo_checked_at = now(), notes = $2 WHERE id = $1", [founder_id, found ? `Apollo email ${email_status}, not used` : "Apollo had no email"]);
      return ok({ saved: null, reason: found ? `status ${email_status} or off-domain; only ${accept.join("/")} @${f.domain} is used` : "no email" });
    }
  );

  server.registerTool(
    "jamie_ent_draft_batch",
    {
      description: "Entrepreneur (code): write the emails for founders who have an address. Code writes the company line from the one-liner when it reads naturally; the rest come back in needs_why for you. Every email is rendered from Vishwa's approved template.",
      inputSchema: { limit: z.number().int().min(1).max(150).optional() },
    },
    async ({ limit }) => {
      const t = await approvedTemplate();
      if (!t) return ok({ refused: true, reason: `Vishwa hasn't approved "${TEMPLATE_QUESTION}" in the answer bank yet.` });
      const fs = (await q(`SELECT f.*, c.name company, c.one_liner, c.description, c.tags FROM ent_founders f JOIN ent_companies c ON c.slug = f.company_slug
        WHERE f.status = 'ready' ORDER BY c.fit_score DESC, f.id LIMIT $1`, [limit ?? 100])) as any[];
      let drafted = 0, needWhy = 0;
      for (const f of fs) {
        const sibling = await one("SELECT why_line FROM ent_founders WHERE company_slug = $1 AND why_line IS NOT NULL AND id <> $2 LIMIT 1", [f.company_slug, f.id]);
        const why = sibling?.why_line ?? whyFromOneLiner(f.company, f.one_liner);
        if (!why || checkWhyLine(why, f).length) { await q("UPDATE ent_founders SET status = 'needs_why' WHERE id = $1", [f.id]); needWhy++; continue; }
        const r = renderFounderEmail(t.text, { first: f.first_name, company: f.company, why, to: f.email });
        await q("UPDATE ent_founders SET why_line = $2, why_source = $3, subject = $4, body = $5, html = $6, sha256 = $7, template_id = $8, status = 'drafted', updated_at = now() WHERE id = $1",
          [f.id, why, sibling ? "same company" : "code", r.subject, r.body, r.html, r.sha256, t.id]);
        drafted++;
      }
      return ok({ drafted, needs_why: needWhy, next: needWhy ? "jamie_ent_needs_why" : "jamie_ent_plan" });
    }
  );

  server.registerTool(
    "jamie_ent_needs_why",
    {
      description: "Entrepreneur: companies whose line code couldn't write from the one-liner. Write one short phrase per company that finishes \"I am really interested in ...\", naming something from its own description, then jamie_ent_set_why.",
      inputSchema: { limit: z.number().int().max(100).optional() },
    },
    async ({ limit }) => ok(await q(`SELECT DISTINCT ON (c.slug) c.slug, c.name, c.one_liner, left(c.description, 600) description FROM ent_founders f JOIN ent_companies c ON c.slug = f.company_slug
      WHERE f.status = 'needs_why' ORDER BY c.slug LIMIT $1`, [limit ?? 50]))
  );

  server.registerTool(
    "jamie_ent_set_why",
    {
      description: "Entrepreneur: the company line for every founder there who is waiting on it. Code checks it against the company's description and renders the emails.",
      inputSchema: { lines: z.array(z.object({ slug: z.string(), why_line: z.string() })).min(1).max(100) },
    },
    async ({ lines }) => {
      const t = await approvedTemplate();
      if (!t) return ok({ refused: true, reason: "template not approved" });
      const out: any[] = [];
      for (const l of lines) {
        const c = await one("SELECT * FROM ent_companies WHERE slug = $1", [l.slug]);
        if (!c) { out.push({ slug: l.slug, refused: "unknown company" }); continue; }
        const problems = checkWhyLine(l.why_line, c);
        if (problems.length) { out.push({ slug: l.slug, problems, company_says: c.one_liner }); continue; }
        const fs = (await q("SELECT * FROM ent_founders WHERE company_slug = $1 AND status IN ('needs_why','drafted')", [l.slug])) as any[];
        for (const f of fs) {
          const r = renderFounderEmail(t.text, { first: f.first_name, company: c.name, why: l.why_line.trim(), to: f.email });
          await q("UPDATE ent_founders SET why_line = $2, why_source = 'llm', subject = $3, body = $4, html = $5, sha256 = $6, template_id = $7, status = 'drafted', updated_at = now() WHERE id = $1",
            [f.id, l.why_line.trim(), r.subject, r.body, r.html, r.sha256, t.id]);
        }
        out.push({ slug: l.slug, drafted: fs.length });
      }
      return ok({ results: out });
    }
  );

  server.registerTool(
    "jamie_ent_review",
    {
      description: "Entrepreneur: every drafted founder email waiting for Vishwa: company, what it does, founder, email and where it came from, the company line, plus one full sample. Show her the whole table; nothing sends until jamie_ent_approve.",
      inputSchema: { limit: z.number().int().max(200).optional() },
    },
    async ({ limit }) => {
      const rows = await q(`SELECT f.id, c.name company, c.batch, c.one_liner, f.name founder, f.title, f.email, f.email_source, f.why_line, f.why_source
        FROM ent_founders f JOIN ent_companies c ON c.slug = f.company_slug WHERE f.status = 'drafted' ORDER BY c.fit_score DESC, f.id LIMIT $1`, [limit ?? 120]);
      const sample = rows.length ? await one("SELECT subject, body FROM ent_founders WHERE id = $1", [(rows[0] as any).id]) : null;
      return ok({ waiting: rows, count: rows.length, sample, note: "Only the first name, company and company line change between emails. She can approve all, drop some, or edit a company line (jamie_ent_set_why)." });
    }
  );

  server.registerTool(
    "jamie_ent_approve",
    {
      description: "Entrepreneur: record Vishwa's yes. Only after she approved the reviewed emails in chat; pass her words. Use all_reviewed=true when she approved the whole table, or pass ids.",
      inputSchema: { vishwa_said: z.string().min(2), all_reviewed: z.boolean().optional(), founder_ids: z.array(z.number().int()).optional(), drop_ids: z.array(z.number().int()).optional() },
    },
    async ({ vishwa_said, all_reviewed, founder_ids, drop_ids }) => {
      if (drop_ids?.length) await q("UPDATE ent_founders SET status = 'skipped', notes = concat_ws('; ', notes, 'dropped by Vishwa') WHERE id = ANY($1::int[]) AND status = 'drafted'", [drop_ids]);
      const n = all_reviewed
        ? await q("UPDATE ent_founders SET status = 'approved', approved_quote = $1, approved_at = now() WHERE status = 'drafted' RETURNING id", [vishwa_said])
        : await q("UPDATE ent_founders SET status = 'approved', approved_quote = $1, approved_at = now() WHERE status = 'drafted' AND id = ANY($2::int[]) RETURNING id", [vishwa_said, founder_ids ?? []]);
      return ok({ approved: n.length, next: "jamie_postman_assets part thumbnail (once per session), then loop jamie_ent_next -> Gmail send_message -> jamie_ent_sent." });
    }
  );

  server.registerTool(
    "jamie_ent_next",
    {
      description: "Entrepreneur: the next approved founder email allowed to go out now, with its exact Gmail payload. Code enforces the 100 a day cap, Jamie's guardrails, the Gmail ceiling, pacing and the 3-bounces stop.",
      inputSchema: {},
    },
    async () => {
      await q(`UPDATE ent_founders f SET status = 'bounced', updated_at = now() FROM sends s WHERE s.id = f.send_id AND s.bounced AND f.status = 'sent'`);
      const last3 = (await q("SELECT bounced FROM sends ORDER BY sent_at DESC LIMIT 3")) as any[];
      if (last3.length === 3 && last3.every((s) => s.bounced)) return ok({ stop: true, tell_vishwa: "The last 3 emails sent all bounced. Outreach stopped until Vishwa looks." });
      const cap = await setting("ent_daily_cap", 100);
      if ((await sentToday()) >= cap) return ok({ wait: true, reason: `${cap} founders emailed today. Resume tomorrow.` });
      const ceiling = await setting("postman_gmail_daily_ceiling", 450);
      if (Number((await one("SELECT count(*)::int n FROM sends WHERE sent_at > now() - interval '24 hours'")).n) >= ceiling) return ok({ wait: true, reason: `${ceiling} emails in 24 hours (Gmail ceiling).` });
      const gap = await setting("postman_min_gap_seconds", 20);
      const lastT = await one("SELECT max(sent_at) t FROM ent_founders");
      if (lastT?.t) { const ago = (Date.now() - new Date(lastT.t).getTime()) / 1000; if (ago < gap) return ok({ wait: true, wait_seconds: Math.ceil(gap - ago), reason: "pacing" }); }
      const queue = (await q("SELECT f.* FROM ent_founders f JOIN ent_companies c ON c.slug = f.company_slug WHERE f.status = 'approved' ORDER BY c.fit_score DESC, f.id LIMIT 20")) as any[];
      for (const f of queue) {
        const g = await guardrailStatus(f.contact_id);
        if (!g.can_send) { await q("UPDATE ent_founders SET status = 'skipped', notes = concat_ws('; ', notes, $2::text) WHERE id = $1", [f.id, g.blocks.join(" ")]); continue; }
        const thumbSha = (await getSetting<string>(`postman_asset:${THUMBNAIL_FILE}`)) ?? "<thumbnail sha256 from jamie_postman_assets>";
        return ok({
          founder_id: f.id, founder: f.name, sha256: f.sha256, warnings: g.warnings, sent_today: await sentToday(), cap,
          gmail_send_message: {
            to: [f.email], subject: f.subject, htmlBody: f.html, body: f.body,
            attachments: [{ content: `sha256:${thumbSha}:/mnt/user-data/outputs/jamie/${THUMBNAIL_FILE}`, filename: THUMBNAIL_FILE, mimeType: "image/png", inline: true }],
          },
          rule: "Send exactly this; the thumbnail is cid:att0. Then jamie_ent_sent.",
        });
      }
      return ok({ done: true, sent_today: await sentToday(), next: "jamie_ent_plan" });
    }
  );

  server.registerTool(
    "jamie_ent_sent",
    {
      description: "Entrepreneur: log a founder email right after Gmail sent it. The sha256 must match the approved email.",
      inputSchema: { founder_id: z.number().int(), sha256: z.string(), gmail_message_id: z.string(), gmail_thread_id: z.string().optional() },
    },
    async ({ founder_id, sha256, gmail_message_id, gmail_thread_id }) => {
      const f = await one("SELECT * FROM ent_founders WHERE id = $1", [founder_id]);
      if (!f) return ok({ refused: true, reason: "no such founder" });
      if (f.status !== "approved") return ok({ refused: true, reason: `email is ${f.status}, not approved` });
      if (f.sha256 !== sha256) return ok({ refused: true, reason: "sha256 does not match the approved email. Tell Vishwa exactly what was sent." });
      const s = await one("INSERT INTO sends (contact_id, to_email, subject, gmail_message_id, gmail_thread_id) VALUES ($1,$2,$3,$4,$5) RETURNING id, sent_at", [f.contact_id, f.email, f.subject, gmail_message_id, gmail_thread_id ?? null]);
      await q("UPDATE contacts SET status = 'sent', updated_at = now() WHERE id = $1", [f.contact_id]);
      await q("UPDATE ent_founders SET status = 'sent', send_id = $2, sent_at = now(), updated_at = now() WHERE id = $1", [founder_id, s.id]);
      await q("UPDATE ent_companies SET track_status = 'emailed', updated_at = now() WHERE slug = $1", [f.company_slug]);
      return ok({ logged: s, sent_today: await sentToday(), next: "jamie_ent_next" });
    }
  );

  server.registerTool(
    "jamie_ent_tracker",
    {
      description: "Entrepreneur: the tracker. Company, YC or not, what it does, founders, funding (with source), status and when founders were emailed.",
      inputSchema: { status: z.string().optional().describe("found, researched, emailed, replied, meeting, not_relevant, skipped"), limit: z.number().int().max(500).optional() },
    },
    async ({ status, limit }) => ok(await q(
      `SELECT c.name company, CASE WHEN c.is_yc THEN coalesce(c.batch, 'YC') ELSE 'not YC' END yc, c.one_liner what_they_do, c.team_size,
              (SELECT string_agg(f.name || ' (' || f.title || ', ' || f.status || ')', '; ') FROM ent_founders f WHERE f.company_slug = c.slug) founders,
              coalesce(c.funding_text, 'not found') funding, c.funding_source, c.track_status status,
              (SELECT max(sent_at) FROM ent_founders f WHERE f.company_slug = c.slug) emailed_at, c.website, c.source_url
       FROM ent_companies c WHERE ($1::text IS NULL OR c.track_status = $1)
       ORDER BY (c.track_status IN ('emailed','replied','meeting')) DESC, c.fit_score DESC LIMIT $2`, [status ?? null, limit ?? 100]))
  );

  server.registerTool(
    "jamie_ent_update",
    {
      description: "Entrepreneur: update a company when something happens (a founder replied, meeting booked, not relevant). Only on facts: a reply in Gmail or Vishwa saying so.",
      inputSchema: { slug: z.string(), status: z.enum(["replied", "meeting", "not_relevant", "skipped", "found"]), note: z.string().optional() },
    },
    async ({ slug, status, note }) => ok(await one("UPDATE ent_companies SET track_status = $2, notes = concat_ws('; ', notes, $3::text), updated_at = now() WHERE slug = $1 RETURNING name, track_status, notes", [slug, status, note ?? null]))
  );
}
