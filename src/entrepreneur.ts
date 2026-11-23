// Entrepreneur (Nov 23, 2026): a daily Vercel cron that emails founders of US YC startups building AI
// agents, asking for a coffee chat. Deterministic code end to end. The ONLY LLM call is the why line
// ("I am really interested in ___"), written from the company's own one-liner and description and checked
// in code. Sends go through the same guardrail code as jamie_can_send, jamie_log_send, jamie_record_bounce,
// jamie_mark_bounce_checked, jamie_check_domain and jamie_log_apollo. Off until Vishwa sets
// entrepreneur_enabled to true. Pure rules live in entrepreneurRules.ts.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { q, one, getSetting } from "./db.js";
import { guardrailStatus, checkDomain, logSend, logApollo, recordBounce, markBounceChecked, bounceStreakStop } from "./server.js";
import {
  SEARCH_TERMS, TEMPLATE_ANSWER_ID, CARD_ANSWER_ID, BOUNCE_QUERY,
  normalizeYc, qualifies, parseAlgoliaOpts, companySlugsIn, parseCompanyPage, emailsOnPage, founderEmailFrom,
  checkWhyLine, fallbackWhyLine, dedupeFounders, extractCard, fillTemplate, buildMime, isGmailStop, bounceRecipients, batchKey,
  envInt, envFlag, type YcCompany, type FounderIn, type Filled,
} from "./entrepreneurRules.js";

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TODAY = "date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'America/Los_Angeles'";
const UA = { "user-agent": "Mozilla/5.0 (compatible; JamieEntrepreneur/1.0; +https://vishwamehta.vercel.app/)" };
const YC = "https://www.ycombinator.com";

export function entConfig() {
  return {
    target: envInt("ENT_DAILY_EMAIL_TARGET", 100, 0, 1000),
    batch: envInt("ENT_BATCH_SIZE", 10, 1, 100),
    delayMs: envInt("ENT_SEND_DELAY_MS", 2000, 0, 60000),
    budgetMs: envInt("ENT_TIME_BUDGET_MS", 50000, 5000, 780000),
    maxFoundersPerCompany: envInt("ENT_MAX_FOUNDERS_PER_COMPANY", 3, 1, 10),
    apolloDailyCredits: envInt("ENT_APOLLO_DAILY_CREDITS", 150, 0, 100000),
    discoveryPages: envInt("ENT_DISCOVERY_PAGES", 2, 1, 10),
    discoveryEveryHours: envInt("ENT_DISCOVERY_EVERY_HOURS", 20, 1, 24 * 14),
    model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5",
    sender: (process.env.GMAIL_SENDER || "").trim().toLowerCase(),
    envDryRun: envFlag("ENT_DRY_RUN"),
    has: {
      apollo: !!process.env.APOLLO_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      gmail: !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN && process.env.GMAIL_SENDER),
      cron_secret: !!process.env.CRON_SECRET,
    },
  };
}
type Cfg = ReturnType<typeof entConfig>;

type Stats = {
  discovered: number; discovery_source?: string; companies_checked: number; founders_added: number;
  public_emails: number; apollo_calls: number; apollo_verified: number; no_verified_email: number;
  no_mx: number; why_lines: number; why_fallbacks: number; sent: number; blocked: number;
  bounces_found: number; bounce_checks: number; previews: any[]; stop_reason?: string; notes: string[];
};

class Budget {
  private deadline: number;
  constructor(deadline: number) { this.deadline = deadline; }
  left() { return this.deadline - Date.now(); }
  has(ms: number) { return this.left() > ms; }
}

async function fetchText(url: string, ms = 8000, init: RequestInit = {}): Promise<{ status: number; text: string }> {
  try {
    const r = await fetch(url, { ...init, headers: { ...UA, ...(init.headers as any) }, signal: AbortSignal.timeout(ms), redirect: "follow" });
    return { status: r.status, text: (await r.text()).slice(0, 2_000_000) };
  } catch (e: any) {
    return { status: 0, text: String(e?.message ?? e) };
  }
}

async function mapLimit<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

// ---------- 1. Discovery: YC's public directory (Algolia index behind ycombinator.com/companies) ----------

let algolia: { app: string; key: string; index: string } | null | undefined;

/** The directory page ships a public, search-only Algolia key to every visitor. Env vars override it if YC changes the page. */
async function algoliaCreds(): Promise<{ app: string; key: string; index: string } | null> {
  if (algolia !== undefined) return algolia;
  const index = process.env.YC_ALGOLIA_INDEX || "YCCompany_production";
  if (process.env.YC_ALGOLIA_APP_ID && process.env.YC_ALGOLIA_API_KEY) {
    return (algolia = { app: process.env.YC_ALGOLIA_APP_ID, key: process.env.YC_ALGOLIA_API_KEY, index });
  }
  const page = await fetchText(`${YC}/companies`, 10000);
  const o = page.status === 200 ? parseAlgoliaOpts(page.text) : null;
  return (algolia = o ? { ...o, index } : null);
}

async function algoliaSearch(c: { app: string; key: string; index: string }, term: string, page: number): Promise<YcCompany[]> {
  const params = new URLSearchParams({ query: term, hitsPerPage: "100", page: String(page) }).toString();
  const r = await fetchText(`https://${c.app.toLowerCase()}-dsn.algolia.net/1/indexes/${encodeURIComponent(c.index)}/query`, 10000, {
    method: "POST",
    headers: { "content-type": "application/json", "x-algolia-application-id": c.app, "x-algolia-api-key": c.key, origin: YC, referer: `${YC}/companies` },
    body: JSON.stringify({ params }),
  });
  if (r.status !== 200) throw new Error(`Algolia search failed (HTTP ${r.status})`);
  const j = JSON.parse(r.text);
  return ((j.hits ?? []) as any[]).map(normalizeYc).filter((x): x is YcCompany => !!x);
}

async function upsertCompany(c: YcCompany, terms: string[], term: string | null): Promise<{ id: number; inserted: boolean }> {
  return (await one(
    `INSERT INTO ent_companies (yc_slug, name, batch, batch_key, one_liner, description, website, domain, location, team_size, status, tags, yc_url, agent_terms, search_term)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (yc_slug) DO UPDATE SET name = EXCLUDED.name, batch = COALESCE(EXCLUDED.batch, ent_companies.batch),
       batch_key = COALESCE(EXCLUDED.batch_key, ent_companies.batch_key), one_liner = COALESCE(EXCLUDED.one_liner, ent_companies.one_liner),
       description = COALESCE(EXCLUDED.description, ent_companies.description), website = COALESCE(EXCLUDED.website, ent_companies.website),
       domain = COALESCE(EXCLUDED.domain, ent_companies.domain), location = COALESCE(EXCLUDED.location, ent_companies.location),
       team_size = COALESCE(EXCLUDED.team_size, ent_companies.team_size), status = COALESCE(EXCLUDED.status, ent_companies.status),
       tags = CASE WHEN cardinality(EXCLUDED.tags) > 0 THEN EXCLUDED.tags ELSE ent_companies.tags END,
       agent_terms = EXCLUDED.agent_terms, updated_at = now()
     RETURNING id, (xmax = 0) inserted`,
    [c.slug, c.name, c.batch, batchKey(c.batch), c.one_liner, c.description, c.website, c.domain, c.location, c.team_size, c.status, c.tags, c.yc_url, terms, term]
  ))!;
}

async function discover(cfg: Cfg, b: Budget, st: Stats) {
  const last = await getSetting<string | null>("entrepreneur_last_discovery");
  if (last && Date.now() - new Date(last).getTime() < cfg.discoveryEveryHours * 3600_000) return;
  const creds = await algoliaCreds();
  if (creds) {
    st.discovery_source = "algolia";
    const found = new Map<string, { c: YcCompany; term: string }>();
    for (const term of SEARCH_TERMS) {
      for (let page = 0; page < cfg.discoveryPages; page++) {
        if (!b.has(15000)) { st.notes.push("discovery stopped early (time budget)"); break; }
        const hits = await algoliaSearch(creds, term, page);
        for (const h of hits) if (!found.has(h.slug)) found.set(h.slug, { c: h, term });
        if (hits.length < 100) break;
      }
    }
    for (const { c, term } of found.values()) {
      const v = qualifies(c);
      if (!v.ok) continue;
      if ((await upsertCompany(c, v.terms, term)).inserted) st.discovered++;
    }
  } else {
    // Fallback: the public directory pages themselves, then each company page (founders are parsed at the same time).
    st.discovery_source = "yc_pages";
    const slugs = new Set<string>();
    for (const term of SEARCH_TERMS) {
      if (!b.has(20000)) break;
      const r = await fetchText(`${YC}/companies?query=${encodeURIComponent(term)}`, 10000);
      if (r.status === 200) companySlugsIn(r.text).forEach((s) => slugs.add(s));
    }
    const known = new Set(((await q("SELECT yc_slug FROM ent_companies WHERE yc_slug = ANY($1::text[])", [[...slugs]])) as any[]).map((r) => r.yc_slug));
    const fresh = [...slugs].filter((s) => !known.has(s));
    await mapLimit(fresh, 4, async (slug) => {
      if (!b.has(15000)) return;
      const page = await fetchText(`${YC}/companies/${slug}`, 10000);
      const parsed = page.status === 200 ? parseCompanyPage(page.text) : null;
      if (!parsed?.company) return;
      const v = qualifies(parsed.company);
      if (!v.ok) return;
      const up = await upsertCompany(parsed.company, v.terms, null);
      if (up.inserted) st.discovered++;
      await saveFounders(up.id, parsed.founders, cfg, st);
    });
    if (!slugs.size) st.notes.push("YC directory pages returned no companies (the list may be rendered client side only); set YC_ALGOLIA_APP_ID and YC_ALGOLIA_API_KEY");
  }
  await q("INSERT INTO settings (key, value) VALUES ('entrepreneur_last_discovery', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [JSON.stringify(new Date().toISOString())]);
}

// ---------- 2. Founders from each company page ----------

async function saveFounders(companyId: number, founders: FounderIn[], cfg: Cfg, st: Stats) {
  const known = (await q("SELECT name FROM ent_founders WHERE company_id = $1", [companyId])) as any[];
  const room = Math.max(0, cfg.maxFoundersPerCompany - known.length);
  for (const f of dedupeFounders(founders, room, { names: known.map((k) => k.name) })) {
    const row = await one(
      `INSERT INTO ent_founders (company_id, name, first_name, last_name, title, linkedin_url, twitter_url, email, email_source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING RETURNING id`,
      [companyId, f.name, f.first_name, f.last_name, f.title, f.linkedin_url, f.twitter_url, f.email, f.email ? "public" : null]
    );
    if (row) st.founders_added++;
  }
  await q("UPDATE ent_companies SET founders_fetched_at = now(), founders_error = NULL, updated_at = now() WHERE id = $1", [companyId]);
}

async function fetchFounders(cfg: Cfg, b: Budget, st: Stats) {
  const todo = (await q(
    `SELECT id, yc_slug FROM ent_companies WHERE founders_fetched_at IS NULL AND founders_error IS NULL
     ORDER BY batch_key DESC NULLS LAST, id LIMIT 40`
  )) as any[];
  await mapLimit(todo, 4, async (c) => {
    if (!b.has(12000)) return;
    st.companies_checked++;
    const page = await fetchText(`${YC}/companies/${c.yc_slug}`, 10000);
    const parsed = page.status === 200 ? parseCompanyPage(page.text) : null;
    if (!parsed) {
      await q("UPDATE ent_companies SET founders_error = $2, updated_at = now() WHERE id = $1", [c.id, page.status === 200 ? "page had no company data" : `HTTP ${page.status}`]);
      return;
    }
    if (parsed.company) {
      const v = qualifies(parsed.company);
      if (!v.ok) {
        await q("UPDATE ent_companies SET founders_error = $2, status = COALESCE($3, status), updated_at = now() WHERE id = $1", [c.id, `no longer qualifies: ${v.reasons.join("; ")}`, parsed.company.status]);
        return;
      }
      await upsertCompany(parsed.company, v.terms, null);
    }
    await saveFounders(c.id, parsed.founders, cfg, st);
  });
}

// ---------- 3. Contacts: Entrepreneur founders are contacts, so every guardrail keyed on contacts applies ----------

async function ensureContact(f: any): Promise<any> {
  let c = await one("SELECT * FROM contacts WHERE lower(name) = lower($1) AND lower(company) = lower($2)", [f.name, f.company_name]);
  if (c) {
    c = await one(
      `UPDATE contacts SET title = COALESCE(title, $2), domain = COALESCE(domain, $3), linkedin_url = COALESCE(linkedin_url, $4),
         email = COALESCE($5, email), email_source = COALESCE($6, email_source), email_confidence = CASE WHEN $5::text IS NOT NULL THEN 'high' ELSE email_confidence END,
         updated_at = now() WHERE id = $1 RETURNING *`,
      [c.id, f.title, f.domain, f.linkedin_url, f.email, f.email_source]
    );
  } else {
    c = await one(
      `INSERT INTO contacts (name, title, company, domain, linkedin_url, email, email_source, email_confidence, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'new',$9) RETURNING *`,
      [f.name, f.title, f.company_name, f.domain, f.linkedin_url, f.email, f.email_source, f.email ? "high" : null, `Entrepreneur: YC ${f.batch ?? ""} founder`.trim()]
    );
  }
  await q("UPDATE ent_founders SET contact_id = $2 WHERE id = $1", [f.id, c.id]);
  return c;
}

async function setFounder(id: number, fields: Record<string, unknown>) {
  const keys = Object.keys(fields);
  await q(`UPDATE ent_founders SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")}, updated_at = now() WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}

// ---------- 4 + 5. Email: public first, else Apollo verified; then the MX check ----------

async function publicEmails(domain: string): Promise<string[]> {
  const pages = await Promise.all(["", "/about", "/team", "/contact"].map((p) => fetchText(`https://${domain}${p}`, 5000)));
  const mailtos = pages.flatMap((p) => (p.status === 200 ? [...p.text.matchAll(/mailto:([^"'?>\s]+)/gi)].map((m) => decodeURIComponent(m[1])) : []));
  return [...new Set([...mailtos.join(" ").match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [], ...pages.flatMap((p) => (p.status === 200 ? emailsOnPage(p.text, domain) : []))].map((e) => e.toLowerCase()))]
    .filter((e) => e.endsWith(`@${domain}`) || e.endsWith(`.${domain}`));
}

async function apolloCreditsToday(): Promise<number> {
  const r = await one(`SELECT COALESCE(sum(credits),0)::numeric n FROM apollo_usage WHERE reason LIKE 'entrepreneur%' AND created_at > ${TODAY}`);
  return Number(r?.n ?? 0);
}

/** Apollo People Match. Returns the email only when Apollo says it is verified. Throws on auth, plan or rate errors. */
async function apolloMatch(f: any): Promise<{ email: string | null; status: string | null; found: boolean }> {
  const r = await fetchText("https://api.apollo.io/api/v1/people/match", 20000, {
    method: "POST",
    headers: { "content-type": "application/json", "cache-control": "no-cache", "x-api-key": process.env.APOLLO_API_KEY! },
    body: JSON.stringify({ first_name: f.first_name, last_name: f.last_name, name: f.name, domain: f.domain, organization_name: f.company_name, reveal_personal_emails: false }),
  });
  if (r.status !== 200) throw new Error(`Apollo people/match HTTP ${r.status}`);
  const p = JSON.parse(r.text)?.person ?? null;
  const status = p?.email_status ?? null;
  const email = p?.email && status === "verified" && !/email_not_unlocked|domain\.com$/i.test(p.email) ? String(p.email).toLowerCase() : null;
  return { email, status, found: !!p };
}

async function finishEmail(f: any, email: string, source: "public" | "apollo", st: Stats): Promise<void> {
  try {
    await setFounder(f.id, { email, email_source: source, email_verified: true, email_lookup_at: new Date() });
  } catch (e: any) {
    if (/ent_founders_email_idx|duplicate key/i.test(String(e?.message))) {
      await setFounder(f.id, { email_status: "blocked", status_reason: "same email as another founder row", email_lookup_at: new Date() });
      st.blocked++;
      return;
    }
    throw e;
  }
  const d = await checkDomain(email.split("@")[1]);
  if (!d.accepts_mail) {
    await setFounder(f.id, { email_status: "blocked", status_reason: `${email.split("@")[1]} has no MX records` });
    st.no_mx++;
  }
}

async function lookupEmails(cfg: Cfg, dry: boolean, b: Budget, st: Stats) {
  // Founders who came with a public YC email still need the MX check.
  const yc = (await q(`SELECT f.* FROM ent_founders f WHERE f.email_status = 'new' AND f.email IS NOT NULL AND f.email_lookup_at IS NULL LIMIT 50`)) as any[];
  for (const f of yc) {
    if (!b.has(8000)) return;
    st.public_emails++;
    await finishEmail({ ...f }, f.email, "public", st);
  }
  const todo = (await q(
    `SELECT f.*, c.name company_name, c.domain, c.batch FROM ent_founders f JOIN ent_companies c ON c.id = f.company_id
     WHERE f.email_status = 'new' AND f.email IS NULL AND f.email_lookup_at IS NULL
     ORDER BY c.batch_key DESC NULLS LAST, f.id LIMIT 60`
  )) as any[];
  const siteCache = new Map<string, Promise<string[]>>();
  let apolloOff: string | null = !cfg.has.apollo ? "APOLLO_API_KEY not set" : dry ? "dry run (no credits spent)" : null;
  for (const f of todo) {
    if (!b.has(10000)) return;
    if (!f.domain) {
      await setFounder(f.id, { email_status: "no_verified_email", status_reason: "company has no website domain", email_lookup_at: new Date() });
      st.no_verified_email++;
      continue;
    }
    if (f.status_reason !== "no public email") {
      if (!siteCache.has(f.domain)) siteCache.set(f.domain, publicEmails(f.domain));
      const pub = founderEmailFrom(await siteCache.get(f.domain)!, f.first_name, f.last_name ?? "");
      if (pub) { st.public_emails++; await finishEmail(f, pub, "public", st); continue; }
      await setFounder(f.id, { status_reason: "no public email" });
    }
    if (!apolloOff && (await apolloCreditsToday()) >= cfg.apolloDailyCredits) apolloOff = `Apollo daily credit budget reached (${cfg.apolloDailyCredits})`;
    if (apolloOff) continue; // stays pending; retried when Apollo is available
    const contact = await ensureContact(f);
    let m: { email: string | null; status: string | null; found: boolean };
    try {
      st.apollo_calls++;
      m = await apolloMatch(f);
    } catch (e: any) {
      apolloOff = String(e?.message ?? e);
      st.notes.push(`Apollo stopped: ${apolloOff}`);
      continue;
    }
    // Same log as jamie_log_apollo: a verified email is saved to the contact; none marks the contact dead_end.
    await logApollo({
      contact_id: contact.id, reason: "entrepreneur: people match (no public email)", credits: m.found ? 1 : 0,
      verified_email: m.email ?? undefined, result: m.email ? `found ${m.email} (verified)` : m.found ? `email_status ${m.status ?? "none"}, not used` : "no match",
    });
    if (m.email) {
      st.apollo_verified++;
      await finishEmail(f, m.email, "apollo", st);
    } else {
      await setFounder(f.id, { email_status: "no_verified_email", status_reason: m.found ? `Apollo email_status ${m.status ?? "none"}` : "Apollo found no match", email_lookup_at: new Date() });
      st.no_verified_email++;
    }
  }
  if (apolloOff && todo.length) st.notes.push(`Apollo skipped: ${apolloOff}`);
}

// ---------- 6. The why line: the only LLM call ----------

const WHY_SYSTEM =
  "You write one short phrase for a cold email to a startup founder. The sentence is: \"I am really interested in ___\". " +
  "Return ONLY the phrase that fills the blank. Rules: start with a lowercase letter (acronyms like AI may stay uppercase); " +
  "one line; under 120 characters; no trailing period; no em dashes or en dashes; no numbers unless they appear in the text given; " +
  "use only what the text says the company does, address the company as \"you\". " +
  "Example: how you are using agents to automate insurance claims";

async function anthropicWhy(cfg: Cfg, source: string, retryNote?: string): Promise<string> {
  const content = `What the company says it does:\n${source}${retryNote ? `\n\nYour last answer broke these rules: ${retryNote}. Try again.` : ""}`;
  const r = await fetchText("https://api.anthropic.com/v1/messages", 20000, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: cfg.model, max_tokens: 80, temperature: 0, system: WHY_SYSTEM, messages: [{ role: "user", content }] }),
  });
  if (r.status !== 200) throw new Error(`Anthropic HTTP ${r.status}`);
  const j = JSON.parse(r.text);
  return ((j.content ?? []) as any[]).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
}

export async function whyLineFor(cfg: Cfg, c: { name: string; one_liner: string | null; description: string | null }): Promise<{ line: string; source: string }> {
  const source = [c.one_liner, c.description].filter(Boolean).join("\n");
  if (cfg.has.anthropic && source) {
    let note: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const v = checkWhyLine(await anthropicWhy(cfg, source, note), source);
        if (v.ok) return { line: v.line, source: "llm" };
        note = v.problems.join("; ");
      } catch (e: any) {
        note = undefined;
        if (attempt === 1) break;
      }
    }
  }
  return { line: fallbackWhyLine(c.one_liner, c.name), source: cfg.has.anthropic ? "fallback" : "fallback_no_key" };
}

async function writeWhyLines(cfg: Cfg, dry: boolean, b: Budget, st: Stats) {
  const todo = (await q(
    `SELECT f.id, f.company_id, c.name, c.one_liner, c.description FROM ent_founders f JOIN ent_companies c ON c.id = f.company_id
     WHERE f.email_status = 'new' AND f.why_line IS NULL AND ($1::boolean OR f.email IS NOT NULL)
     ORDER BY c.batch_key DESC NULLS LAST, f.id LIMIT 40`,
    [dry]
  )) as any[];
  const byCompany = new Map<number, { line: string; source: string }>();
  for (const f of todo) {
    if (!b.has(8000)) return;
    let w = byCompany.get(f.company_id);
    if (!w) {
      const sib = await one("SELECT why_line, why_source FROM ent_founders WHERE company_id = $1 AND why_line IS NOT NULL LIMIT 1", [f.company_id]);
      w = sib ? { line: sib.why_line, source: sib.why_source } : await whyLineFor(cfg, f);
      if (!sib) { if (w.source === "llm") st.why_lines++; else st.why_fallbacks++; }
      byCompany.set(f.company_id, w);
    }
    await setFounder(f.id, { why_line: w.line, why_source: w.source });
  }
}

// ---------- 7. Template: her approved answer #159 and the card from answer #1, loaded at send time ----------

export async function loadTemplate(): Promise<{ template: string; card: string } | { error: string }> {
  const t = await one("SELECT id, answer, approved FROM answers WHERE id = $1", [TEMPLATE_ANSWER_ID]);
  if (!t) return { error: `answer #${TEMPLATE_ANSWER_ID} (Entrepreneur template) not found` };
  if (!t.approved) return { error: `answer #${TEMPLATE_ANSWER_ID} is not approved` };
  const a1 = await one("SELECT answer FROM answers WHERE id = $1", [CARD_ANSWER_ID]);
  const card = a1 ? extractCard(a1.answer) : null;
  if (!card) return { error: `no <table> thumbnail card found in answer #${CARD_ANSWER_ID}` };
  return { template: t.answer, card };
}

// ---------- 8. Gmail ----------

async function gmailToken(): Promise<string> {
  const r = await fetchText("https://oauth2.googleapis.com/token", 15000, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!, client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!, grant_type: "refresh_token",
    }).toString(),
  });
  let j: any = {};
  try { j = JSON.parse(r.text); } catch { /* ignore */ }
  if (r.status !== 200 || !j.access_token) throw new Error(`Gmail token refresh failed (HTTP ${r.status}${j.error ? `, ${j.error}` : ""})`);
  return j.access_token;
}

async function gmail(token: string, path: string, init: RequestInit = {}) {
  const r = await fetchText(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, 20000, {
    ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers as any) },
  });
  let json: any = null;
  try { json = JSON.parse(r.text); } catch { /* ignore */ }
  return { status: r.status, json, text: r.text };
}

// ---------- 9. Bounce checks at 1h and 24h ----------

async function checkBounces(token: string, b: Budget, st: Stats) {
  const due = (await q(
    `SELECT s.id, s.to_email, s.gmail_thread_id, s.sent_at, s.checked_1h, s.checked_24h, f.id founder_id
     FROM sends s JOIN ent_founders f ON f.send_id = s.id
     WHERE NOT s.bounced AND ((NOT s.checked_1h AND s.sent_at < now() - interval '1 hour') OR (NOT s.checked_24h AND s.sent_at < now() - interval '24 hours'))
     ORDER BY s.sent_at LIMIT 200`
  )) as any[];
  if (!due.length) return;
  const list = await gmail(token, `messages?maxResults=100&q=${encodeURIComponent(BOUNCE_QUERY)}`);
  if (list.status !== 200) throw new Error(`Gmail bounce search HTTP ${list.status}`);
  const bounces: { threadId: string; to: string[] }[] = [];
  for (const m of ((list.json?.messages ?? []) as any[]).slice(0, 60)) {
    if (!b.has(6000)) return; // finish next run rather than mark anything checked on partial data
    const g = await gmail(token, `messages/${m.id}?format=full`);
    if (g.status === 200) bounces.push({ threadId: g.json.threadId, to: bounceRecipients(g.json) });
  }
  for (const s of due) {
    const addr = String(s.to_email).toLowerCase();
    const hit = bounces.find((x) => (s.gmail_thread_id && x.threadId === s.gmail_thread_id) || x.to.includes(addr));
    if (hit) {
      await recordBounce(s.id, "mailer-daemon bounce (Entrepreneur check)");
      await setFounder(s.founder_id, { email_status: "bounced", status_reason: "bounced" });
      st.bounces_found++;
      continue;
    }
    const age = Date.now() - new Date(s.sent_at).getTime();
    if (!s.checked_1h && age > 3600_000) { await markBounceChecked(s.id, "1h"); st.bounce_checks++; }
    if (!s.checked_24h && age > 24 * 3600_000) { await markBounceChecked(s.id, "24h"); st.bounce_checks++; }
  }
}

// ---------- 8 (cont). Sending ----------

async function sentToday(): Promise<number> {
  const r = await one(`SELECT count(*)::int n FROM ent_founders WHERE contacted_at > ${TODAY}`);
  return r?.n ?? 0;
}

async function alreadyEmailed(f: any): Promise<string | null> {
  const s = await one(
    `SELECT s.sent_at FROM sends s LEFT JOIN contacts c ON c.id = s.contact_id
     WHERE lower(s.to_email) = lower($1) OR (lower(c.name) = lower($2) AND lower(c.company) = lower($3)) LIMIT 1`,
    [f.email ?? "", f.name, f.company_name]
  );
  if (s) return `already emailed ${String(s.sent_at).slice(0, 15)}`;
  const twin = f.linkedin_url
    ? await one("SELECT id FROM ent_founders WHERE id <> $1 AND lower(linkedin_url) = lower($2) AND email_status IN ('sending','sent','bounced','replied')", [f.id, f.linkedin_url])
    : null;
  return twin ? "same founder already emailed for another company" : null;
}

async function sendBatch(cfg: Cfg, dry: boolean, b: Budget, st: Stats): Promise<void> {
  const remaining = cfg.target - (await sentToday());
  if (remaining <= 0) { st.stop_reason = `daily target reached (${cfg.target})`; return; }
  const streak = await bounceStreakStop();
  if (streak) { st.stop_reason = streak; return; }
  const ceiling = Number((await getSetting("postman_gmail_daily_ceiling")) ?? 450);
  const last24 = Number((await one("SELECT count(*)::int n FROM sends WHERE sent_at > now() - interval '24 hours'"))?.n ?? 0);
  if (last24 >= ceiling) { st.stop_reason = `Gmail ceiling: ${last24} sends in 24h (postman_gmail_daily_ceiling ${ceiling})`; return; }

  const tpl = await loadTemplate();
  if ("error" in tpl) throw new Error(tpl.error);

  const limit = Math.min(cfg.batch, remaining, ceiling - last24);
  const ready = (await q(
    `SELECT f.*, c.name company_name, c.domain, c.batch FROM ent_founders f JOIN ent_companies c ON c.id = f.company_id
     WHERE f.email_status = 'new' AND f.why_line IS NOT NULL AND ($1::boolean OR (f.email IS NOT NULL AND f.email_lookup_at IS NOT NULL))
     ORDER BY c.batch_key DESC NULLS LAST, f.id LIMIT $2`,
    [dry, limit * 2]
  )) as any[];
  if (!ready.length) return;

  let token: string | null = null;
  if (!dry) {
    if (!cfg.has.gmail) throw new Error("Gmail env vars are not set (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER)");
    token = await gmailToken();
    const prof = await gmail(token, "profile");
    const addr = String(prof.json?.emailAddress ?? "").toLowerCase();
    if (prof.status !== 200 || addr !== cfg.sender) throw new Error(`Gmail token is for ${addr || "an unknown account"}, not GMAIL_SENDER; not sending`);
  }

  let n = 0;
  for (const f of ready) {
    if (n >= limit) break;
    if (!b.has(cfg.delayMs + 15000)) { st.notes.push("send batch stopped early (time budget)"); break; }
    let filled: Filled;
    try {
      filled = fillTemplate(tpl.template, { first: f.first_name, company: f.company_name, why: f.why_line }, tpl.card);
    } catch (e: any) {
      throw new Error(`template: ${e.message}`);
    }
    if (dry) {
      st.previews.push({ founder_id: f.id, company: f.company_name, to: f.email ?? "(no email yet)", subject: filled.subject, text: filled.text, why_source: f.why_source });
      n++;
      continue;
    }
    const dup = await alreadyEmailed(f);
    if (dup) { await setFounder(f.id, { email_status: "blocked", status_reason: dup }); st.blocked++; continue; }
    const contact = await ensureContact(f);
    const g = await guardrailStatus(contact.id);
    if (!g.can_send) {
      if (g.blocks.some((x: string) => /daily send limit/i.test(x))) { st.stop_reason = g.blocks.join(" "); break; }
      await setFounder(f.id, { email_status: "blocked", status_reason: g.blocks.join(" ") });
      st.blocked++;
      continue;
    }
    const claimed = await one("UPDATE ent_founders SET email_status = 'sending', updated_at = now() WHERE id = $1 AND email_status = 'new' RETURNING id", [f.id]);
    if (!claimed) continue;
    const raw = buildMime({ from: `Vishwa Mehta <${cfg.sender}>`, to: f.email, subject: filled.subject, text: filled.text, html: filled.html });
    const r = await gmail(token!, "messages/send", { method: "POST", body: JSON.stringify({ raw }) });
    if (r.status !== 200 || !r.json?.id) {
      if (r.status !== 0 && isGmailStop(r.status, r.text)) {
        await setFounder(f.id, { email_status: "new" }); // not sent; try again next run
        st.stop_reason = `Gmail limit (HTTP ${r.status})`;
        break;
      }
      // Unknown outcome (timeout) or a hard rejection: never retry, so nobody is emailed twice.
      await setFounder(f.id, { email_status: "blocked", status_reason: r.status === 0 ? "send outcome unknown (network); not retried" : `Gmail rejected (HTTP ${r.status})` });
      st.blocked++;
      if (r.status === 401 || r.status === 403) { st.stop_reason = `Gmail auth error (HTTP ${r.status})`; break; }
      continue;
    }
    const s = await logSend({ contact_id: contact.id, to_email: f.email, subject: filled.subject, gmail_message_id: r.json.id, gmail_thread_id: r.json.threadId });
    await setFounder(f.id, { email_status: "sent", status_reason: null, send_id: s.id, contacted_at: new Date(), gmail_message_id: r.json.id, gmail_thread_id: r.json.threadId });
    st.sent++;
    n++;
    if (cfg.delayMs) await sleep(cfg.delayMs);
  }
}

// ---------- The run ----------

async function lock(seconds: number): Promise<boolean> {
  const r = await one(
    `UPDATE settings SET value = jsonb_build_object('until', (now() + make_interval(secs => $1))::text)
     WHERE key = 'entrepreneur_lock' AND COALESCE((value->>'until')::timestamptz, 'epoch'::timestamptz) < now() RETURNING key`,
    [seconds]
  );
  return !!r;
}
const unlock = () => q(`UPDATE settings SET value = '{"until": "1970-01-01T00:00:00Z"}'::jsonb WHERE key = 'entrepreneur_lock'`);

export async function runEntrepreneur(opts: { trigger: "cron" | "manual"; dryRun?: boolean; budgetMs?: number }) {
  const cfg = entConfig();
  const enabled = (await getSetting<boolean>("entrepreneur_enabled")) === true;
  const settingDry = (await getSetting<boolean>("entrepreneur_dry_run")) === true;
  const dry = opts.dryRun === true || cfg.envDryRun || settingDry;
  if (opts.trigger === "cron" && !enabled) return { skipped: "entrepreneur_enabled is false" };
  if (!dry && !enabled) return { refused: "entrepreneur_enabled is false; only a dry run is allowed" };
  const budgetMs = Math.min(cfg.budgetMs, opts.budgetMs ?? cfg.budgetMs);
  if (!(await lock(Math.ceil(budgetMs / 1000) + 30))) return { skipped: "another Entrepreneur run is in progress" };
  const b = new Budget(Date.now() + budgetMs);
  const st: Stats = {
    discovered: 0, companies_checked: 0, founders_added: 0, public_emails: 0, apollo_calls: 0, apollo_verified: 0,
    no_verified_email: 0, no_mx: 0, why_lines: 0, why_fallbacks: 0, sent: 0, blocked: 0, bounces_found: 0, bounce_checks: 0, previews: [], notes: [],
  };
  const run = await one("INSERT INTO ent_runs (trigger, dry_run) VALUES ($1,$2) RETURNING id", [opts.trigger, dry]);
  const errors: string[] = [];
  const step = async (name: string, fn: () => Promise<void>) => {
    if (!b.has(5000)) return;
    try { await fn(); } catch (e: any) { errors.push(`${name}: ${String(e?.message ?? e).slice(0, 300)}`); }
  };
  try {
    if (cfg.has.gmail) await step("bounces", async () => checkBounces(await gmailToken(), b, st));
    // Send what is ready first, then fill the pipeline for the next run with the time left.
    await step("send", () => sendBatch(cfg, dry, b, st));
    await step("discovery", () => discover(cfg, b, st));
    await step("founders", () => fetchFounders(cfg, b, st));
    await step("emails", () => lookupEmails(cfg, dry, b, st));
    await step("why_lines", () => writeWhyLines(cfg, dry, b, st));
    if (dry && !st.previews.length) await step("preview", () => sendBatch(cfg, dry, b, st));
  } finally {
    const stored = { ...st, previews: st.previews.length };
    await q("UPDATE ent_runs SET finished_at = now(), stats = $2, error = $3 WHERE id = $1", [run.id, JSON.stringify(stored), errors.length ? errors.join(" | ") : null]);
    await unlock();
  }
  return { run_id: run.id, dry_run: dry, ...st, errors, sent_today: await sentToday(), target: cfg.target };
}

// ---------- Status ----------

export async function entrepreneurStatus() {
  const cfg = entConfig();
  const t = await one(`SELECT
      (SELECT count(*)::int FROM ent_companies WHERE discovered_at > ${TODAY}) discovered,
      (SELECT count(*)::int FROM ent_companies) companies_total,
      (SELECT count(*)::int FROM ent_founders WHERE created_at > ${TODAY}) founders,
      (SELECT count(*)::int FROM ent_founders) founders_total,
      (SELECT count(*)::int FROM ent_founders WHERE contacted_at > ${TODAY}) emails_sent,
      (SELECT count(*)::int FROM ent_founders WHERE email_status = 'no_verified_email' AND updated_at > ${TODAY}) no_verified_email,
      (SELECT count(*)::int FROM ent_founders WHERE email_status = 'blocked' AND updated_at > ${TODAY}) blocked,
      (SELECT count(*)::int FROM ent_founders f JOIN sends s ON s.id = f.send_id WHERE s.bounced AND s.bounced_at > ${TODAY}) bounces,
      (SELECT COALESCE(sum(credits),0)::numeric FROM apollo_usage WHERE reason LIKE 'entrepreneur%' AND created_at > ${TODAY}) apollo_credits,
      (SELECT count(*)::int FROM ent_founders WHERE email_status = 'new' AND email IS NOT NULL AND email_lookup_at IS NOT NULL AND why_line IS NOT NULL) ready_to_send,
      (SELECT count(*)::int FROM ent_founders WHERE email_status = 'new' AND email IS NULL) awaiting_email_lookup,
      (SELECT count(*)::int FROM ent_founders WHERE email_status = 'sent') sent_all_time`);
  const lastRun = await one("SELECT id, trigger, dry_run, started_at, finished_at, stats, error FROM ent_runs ORDER BY id DESC LIMIT 1");
  const lastErr = await one("SELECT id, started_at, error FROM ent_runs WHERE error IS NOT NULL ORDER BY id DESC LIMIT 1");
  return {
    enabled: (await getSetting<boolean>("entrepreneur_enabled")) === true,
    dry_run: cfg.envDryRun || (await getSetting<boolean>("entrepreneur_dry_run")) === true,
    today: { ...t, apollo_credits: Number(t?.apollo_credits ?? 0), target: cfg.target },
    last_run: lastRun, last_error: lastErr,
    configured: cfg.has,
    limits: { batch_per_run: cfg.batch, send_delay_ms: cfg.delayMs, apollo_daily_credits: cfg.apolloDailyCredits, max_founders_per_company: cfg.maxFoundersPerCompany, model: cfg.model },
  };
}

// ---------- MCP tools ----------

export function registerEntrepreneurTools(server: McpServer) {
  server.registerTool(
    "jamie_entrepreneur_status",
    {
      description: "Entrepreneur (daily cron, code end to end): today's counts (companies discovered, founders found, emails sent, no verified email, blocked, bounces, Apollo credits), whether it is enabled or in dry run, which env vars are set, and the last run and last error. Read only.",
      inputSchema: {},
    },
    async () => ok(await entrepreneurStatus())
  );

  server.registerTool(
    "jamie_entrepreneur_run",
    {
      description: "Entrepreneur: run one batch now, exactly what the cron does (bounce checks, send ready emails, discovery, founders, email lookup, why lines). dry_run (default true) builds everything and returns sample emails without sending or spending Apollo credits. A real run needs entrepreneur_enabled=true, which only Vishwa turns on.",
      inputSchema: { dry_run: z.boolean().optional() },
    },
    async ({ dry_run }) => ok(await runEntrepreneur({ trigger: "manual", dryRun: dry_run ?? true, budgetMs: 45000 }))
  );
}

/** For the brain file: companies and founders, newest first. */
export async function entrepreneurBrain() {
  const [companies, founders] = await Promise.all([
    q("SELECT name, batch, one_liner, location, team_size, yc_url, discovered_at FROM ent_companies ORDER BY batch_key DESC NULLS LAST, id DESC LIMIT 100"),
    q(`SELECT f.name, f.title, c.name company, c.batch, f.email_source, f.email_status, f.status_reason, f.why_line, f.contacted_at
       FROM ent_founders f JOIN ent_companies c ON c.id = f.company_id ORDER BY f.updated_at DESC LIMIT 100`),
  ]);
  return { companies, founders, status: await entrepreneurStatus() };
}

