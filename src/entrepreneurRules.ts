// Entrepreneur's rules as plain functions (no database, no network), so they can be unit tested:
// YC discovery filters, founder page parsing, public email matching, why line checks, the email
// template and the Gmail MIME message. src/entrepreneur.ts does the I/O around these.
import { randomBytes } from "node:crypto";
import { isUS, splitName } from "./postman.js";

export const PORTFOLIO_URL = "https://vishwamehta.vercel.app/";
export const TEMPLATE_ANSWER_ID = 159;
export const CARD_ANSWER_ID = 1;
export const CARD_PLACEHOLDER = "[portfolio card with thumbnail]";

/** Search terms Vishwa chose (Nov 23, 2026). Each one is a query against YC's public company directory. */
export const SEARCH_TERMS = [
  "AI agents", "agentic", "autonomous agents", "AI workflow automation", "AI employees",
  "voice agents", "coding agents", "browser agents", "agent infrastructure",
];

// ---------- Batches: newest first ----------

const SEASON: Record<string, number> = { winter: 1, w: 1, spring: 2, x: 2, summer: 3, s: 3, fall: 4, f: 4 };
/** "Fall 2025" -> 20254, "W24" -> 20241. null when unknown. Bigger is newer. */
export function batchKey(b?: string | null): number | null {
  if (!b) return null;
  let m = b.match(/(winter|spring|summer|fall)\s*(\d{4})/i);
  if (m) return Number(m[2]) * 10 + SEASON[m[1].toLowerCase()];
  m = b.trim().match(/^([wxsf])(\d{2})$/i);
  if (m) return (2000 + Number(m[2])) * 10 + SEASON[m[1].toLowerCase()];
  return null;
}

// ---------- Agent keyword match (rule based) ----------

/** Each rule is [label, regex]. A company qualifies when an agent rule matches AND the text is about AI. */
const AGENT_RULES: [string, RegExp][] = [
  ["ai agents", /\bai agents?\b/i],
  ["agentic", /\bagentic\b/i],
  ["autonomous agents", /\bautonomous (?:ai )?agents?\b/i],
  ["multi-agent", /\bmulti-?agents?\b/i],
  ["voice agents", /\bvoice (?:ai )?agents?\b/i],
  ["coding agents", /\b(?:coding|code|software engineering|swe) agents?\b/i],
  ["browser agents", /\b(?:browser|web|computer[- ]use) agents?\b/i],
  ["agent infrastructure", /\bagent (?:infrastructure|infra|platform|framework|orchestration|observability|evals?|memory|sdk)\b/i],
  ["ai employees", /\bai (?:employees?|workers?|teammates?|coworkers?|sdrs?|bdrs?)\b|\bdigital (?:employees?|workers?)\b/i],
  ["ai workflow automation", /\bai[- ](?:powered )?(?:workflow )?automation\b|\bautomates? (?:\w+ ){0,3}workflows? with ai\b/i],
  ["agents", /\bagents?\b/i],
];
const AI_CONTEXT = /\bai\b|\bllms?\b|\bgpt\b|artificial intelligence|machine learning|agentic|\bgenai\b|generative/i;
/** "agents" alone also means human agents (real estate, insurance, support). Those need AI context. */
const HUMAN_AGENT = /\b(?:real estate|insurance|travel|support|customer service|call center|sports|talent|booking|leasing) agents?\b/i;

export function agentTerms(text: string): string[] {
  const t = text.replace(/\s+/g, " ");
  if (!AI_CONTEXT.test(t)) return [];
  const hits = AGENT_RULES.filter(([, re]) => re.test(t)).map(([label]) => label);
  // Only the bare word "agents", and it reads as human agents: not an agent company.
  if (hits.length === 1 && hits[0] === "agents" && HUMAN_AGENT.test(t) && !/\bai agents?\b/i.test(t)) return [];
  return hits;
}

// ---------- YC company records ----------

export type YcCompany = {
  slug: string; name: string; batch: string | null; one_liner: string | null; description: string | null;
  website: string | null; domain: string | null; location: string | null; regions: string[]; team_size: number | null;
  status: string | null; tags: string[]; yc_url: string;
};

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x ?? "")).filter(Boolean) : typeof v === "string" && v ? [v] : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function domainOf(website?: string | null): string | null {
  if (!website) return null;
  try {
    return new URL(/^https?:/i.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Normalize a YC directory record (Algolia hit or the company object embedded in a YC page). */
export function normalizeYc(h: any): YcCompany | null {
  const slug = str(h?.slug);
  const name = str(h?.name);
  if (!slug || !name) return null;
  const website = str(h.website) ?? str(h.url_website);
  const locs = [...arr(h.all_locations), ...arr(h.location), ...arr(h.city), ...arr(h.country)];
  const team = Number(h.team_size ?? h.teamSize);
  return {
    slug, name,
    batch: str(h.batch) ?? str(h.batch_name),
    one_liner: str(h.one_liner) ?? str(h.oneLiner),
    description: str(h.long_description) ?? str(h.longDescription) ?? str(h.description),
    website, domain: domainOf(website),
    location: locs.length ? [...new Set(locs)].join("; ") : null,
    regions: arr(h.regions),
    team_size: Number.isFinite(team) && team > 0 ? team : null,
    status: str(h.status) ?? str(h.ycdc_status),
    tags: [...new Set([...arr(h.tags), ...arr(h.industries), ...arr(h.subindustry)])],
    yc_url: `https://www.ycombinator.com/companies/${slug}`,
  };
}

export function isUSCompany(c: Pick<YcCompany, "location" | "regions">): boolean {
  if (c.regions.some((r) => /united states|^usa?$/i.test(r.trim()))) return true;
  return (c.location ?? "").split(";").some((l) => isUS(l.trim()));
}

/** Discovery filter, all in code: active, not acquired, US, and the text says it builds agents. */
export function qualifies(c: YcCompany): { ok: boolean; reasons: string[]; terms: string[] } {
  const reasons: string[] = [];
  if (!c.status || !/^active$/i.test(c.status)) reasons.push(`status ${c.status ?? "unknown"}`);
  if (/acquired/i.test(c.status ?? "") || /\bacquired by\b/i.test(c.one_liner ?? "")) reasons.push("acquired");
  if (!isUSCompany(c)) reasons.push(`not US (${c.location ?? "no location"})`);
  const terms = agentTerms([c.one_liner, c.description, ...c.tags].filter(Boolean).join(" . "));
  if (!terms.length) reasons.push("no agent terms");
  return { ok: reasons.length === 0, reasons, terms };
}

/** Newest batch first; unknown batches last; then name for a stable order. */
export function byNewestBatch(a: Pick<YcCompany, "batch" | "name">, b: Pick<YcCompany, "batch" | "name">): number {
  return (batchKey(b.batch) ?? 0) - (batchKey(a.batch) ?? 0) || a.name.localeCompare(b.name);
}

// ---------- YC pages ----------

const unescapeAttr = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** YC pages embed their data as JSON in a data-page attribute (Inertia). */
export function pageData(html: string): any | null {
  const m = html.match(/data-page="([^"]+)"/);
  if (!m) return null;
  try {
    return JSON.parse(unescapeAttr(m[1]));
  } catch {
    return null;
  }
}

/** The public Algolia app id and search-only key the YC directory page ships to every browser. */
export function parseAlgoliaOpts(html: string): { app: string; key: string } | null {
  const m = html.match(/AlgoliaOpts\s*=\s*(\{[^;<]*\})/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[1]);
    const app = str(j.app) ?? str(j.appId) ?? str(j.applicationId);
    const key = str(j.key) ?? str(j.apiKey) ?? str(j.searchKey);
    return app && key ? { app, key } : null;
  } catch {
    return null;
  }
}

/** Company slugs linked from a YC directory page (fallback when Algolia is unavailable). */
export function companySlugsIn(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/\/companies\/([a-z0-9][a-z0-9-]*)(?=["'?#/])/g)) {
    if (!["founders", "industry", "location", "batch", "tags", "black-founders", "hispanic-latino-founders", "women-founders"].includes(m[1])) out.add(m[1]);
  }
  const data = pageData(html);
  const walk = (v: any, depth = 0) => {
    if (!v || depth > 6) return;
    if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
    if (typeof v === "object") {
      if (typeof v.slug === "string" && typeof v.name === "string" && (v.one_liner || v.batch)) out.add(v.slug);
      for (const x of Object.values(v)) walk(x, depth + 1);
    }
  };
  walk(data?.props);
  return [...out];
}

export type FounderIn = { name: string; first_name: string; last_name: string; title: string | null; linkedin_url: string | null; twitter_url: string | null; email: string | null };

const cleanUrl = (u: unknown): string | null => {
  const s = str(u);
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`;
};
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

/** Company and founders from https://www.ycombinator.com/companies/<slug>. Inactive founders are dropped. */
export function parseCompanyPage(html: string): { company: YcCompany | null; founders: FounderIn[] } | null {
  const data = pageData(html);
  const co = data?.props?.company;
  if (!co) return null;
  const founders: FounderIn[] = [];
  for (const f of (co.founders ?? []) as any[]) {
    if (f?.is_active === false || f?.active === false) continue;
    const n = splitName(String(f?.full_name ?? f?.name ?? ""));
    if (!n) continue;
    const email = str(f.email) ?? str(f.public_email);
    founders.push({
      name: n.clean, first_name: n.first, last_name: n.last,
      title: str(f.title) ?? "Founder",
      linkedin_url: cleanUrl(f.linkedin_url ?? f.linkedin),
      twitter_url: cleanUrl(f.twitter_url ?? f.twitter),
      email: email && EMAIL_RE.test(email) ? email.toLowerCase() : null,
    });
  }
  return { company: normalizeYc(co), founders };
}

/** Never the same person twice: drop repeats by name, LinkedIn URL or email, then keep the first `max`. */
export function dedupeFounders(founders: FounderIn[], max: number, alreadyKnown: { names?: string[]; linkedins?: string[]; emails?: string[] } = {}): FounderIn[] {
  const names = new Set((alreadyKnown.names ?? []).map((x) => x.toLowerCase()));
  const lis = new Set((alreadyKnown.linkedins ?? []).map((x) => x.toLowerCase().replace(/\/+$/, "")));
  const emails = new Set((alreadyKnown.emails ?? []).map((x) => x.toLowerCase()));
  const out: FounderIn[] = [];
  for (const f of founders) {
    const n = f.name.toLowerCase();
    const li = f.linkedin_url?.toLowerCase().replace(/\/+$/, "");
    const e = f.email?.toLowerCase();
    if (names.has(n) || (li && lis.has(li)) || (e && emails.has(e))) continue;
    names.add(n);
    if (li) lis.add(li);
    if (e) emails.add(e);
    out.push(f);
    if (out.length >= max) break;
  }
  return out;
}

// ---------- Public email on the company's own site ----------

export function emailsOnPage(html: string, domain: string): string[] {
  const out = new Set<string>();
  const d = domain.toLowerCase();
  for (const e of html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []) {
    const x = e.toLowerCase().replace(/\.$/, "");
    if ((x.endsWith(`@${d}`) || x.endsWith(`.${d}`)) && !/\.(png|jpe?g|gif|svg|webp)$/.test(x)) out.add(x);
  }
  return [...out];
}

/** A public address that is clearly this founder's (first@, first.last@, flast@ ...). Generic inboxes (hello@, founders@) never count. */
export function founderEmailFrom(emails: string[], first: string, last: string): string | null {
  const c = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "");
  const f = c(first);
  const l = c(last);
  if (!f || !l) return null;
  const want = new Set([f, `${f}.${l}`, `${f}${l}`, `${f[0]}${l}`, `${f}_${l}`, `${f[0]}.${l}`, `${f}${l[0]}`, `${f}-${l}`]);
  return emails.find((e) => want.has(e.split("@")[0])) ?? null;
}

// ---------- The why line ----------

export const WHY_MAX = 120;

/** Clean what the model returned, then check it. Returns the cleaned line and every rule it breaks. */
export function checkWhyLine(raw: string, source: string): { line: string; ok: boolean; problems: string[] } {
  let line = String(raw ?? "").trim();
  line = line.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "").trim();
  line = line.replace(/^i am really interested in\s+/i, "").replace(/^interested in\s+/i, "").trim();
  line = line.replace(/[.!]+$/, "").trim();
  const problems: string[] = [];
  if (!line) problems.push("empty");
  if (/[\r\n]/.test(raw.trim()) || /[\r\n]/.test(line)) problems.push("more than one line");
  if (line.length > WHY_MAX) problems.push(`longer than ${WHY_MAX} characters`);
  if (/[—–]/.test(line)) problems.push("em or en dash");
  if (/[.!]$/.test(line)) problems.push("trailing period");
  const firstWord = line.split(/\s+/)[0] ?? "";
  if (/^[A-Z]/.test(firstWord) && !/^[A-Z0-9]{2,}s?$/.test(firstWord.replace(/[^A-Za-z0-9]/g, ""))) problems.push("starts with a capital letter");
  const srcNums = new Set(source.match(/\d+(?:[.,]\d+)?/g) ?? []);
  const bad = (line.match(/\d+(?:[.,]\d+)?/g) ?? []).filter((n) => !srcNums.has(n));
  if (bad.length) problems.push(`numbers not in the source: ${bad.join(", ")}`);
  if (/[\[\]{}<>]/.test(line)) problems.push("brackets or markup");
  return { line, ok: problems.length === 0, problems };
}

const VERB_START = /^(automate|automates|build|builds|help|helps|turn|turns|make|makes|let|lets|give|gives|bring|brings|run|runs|create|creates|deploy|deploys|replace|replaces|power|powers|enable|enables|transform|transforms|streamline|streamlines|scale|scales|handle|handles|answer|answers|manage|manages|connect|connects|monitor|monitors|find|finds|write|writes|book|books|close|closes|push|pushes|send|sends|ship|ships|track|tracks|sell|sells|fix|fixes|reduce|reduces|cut|cuts)\b/i;
const isAcronym = (w: string) => /^[A-Z0-9&/.+-]{2,}s?$/.test(w.replace(/[^A-Za-z0-9&/.+-]/g, "")) && /[A-Z]/.test(w);

/** Code-built why line from the one-liner when the model's line fails twice. Always passes checkWhyLine. */
export function fallbackWhyLine(oneLiner: string | null | undefined, companyName: string): string {
  let s = String(oneLiner ?? "").replace(/\s+/g, " ").replace(/[—–]/g, ",").replace(/[\[\]{}<>"“”]/g, "").trim().replace(/[.!]+$/, "");
  if (companyName && s.toLowerCase().startsWith(companyName.toLowerCase() + " ")) s = s.slice(companyName.length + 1).replace(/^(is|are)\s+/i, "");
  if (!s) return "what you are building";
  const words = s.split(" ");
  if (!isAcronym(words[0])) words[0] = words[0].toLowerCase();
  s = words.join(" ");
  let line: string;
  if (VERB_START.test(s)) {
    // "Automates claims with agents" -> "how you automate claims with agents"
    const [w, ...rest] = s.split(" ");
    const base = /(?:sh|ch|x|z|ss)es$/.test(w) ? w.slice(0, -2) : /[^s]s$/.test(w) ? w.slice(0, -1) : w;
    line = `how you ${[base, ...rest].join(" ")}`;
  } else if (/^(the|a|an|your|our)\b/i.test(s)) {
    line = `what you are building with ${s.replace(/^(your|our)\b/i, "the")}`;
  } else {
    line = `what you are building with ${s}`;
  }
  if (line.length > WHY_MAX) {
    const cut = line.slice(0, WHY_MAX + 1);
    line = cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]+$/, "").replace(/\s+(and|or|for|with|to|of|the|a|an|in|on)$/i, "");
  }
  return line.replace(/[.!]+$/, "");
}

// ---------- Template ----------

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The <table ...>...</table> thumbnail card from answer #1 (her default outreach template). */
export function extractCard(answer: string): string | null {
  const m = answer.match(/<table\b[\s\S]*?<\/table>/i);
  return m ? m[0] : null;
}

/** Drop a trailing "[Rules: ...]" block (it can contain brackets inside). */
export function stripRules(t: string): string {
  const i = t.search(/\[\s*Rules\s*:/i);
  if (i < 0) return t;
  // The rules block runs to the end of the template.
  return t.slice(0, i).replace(/\s+$/, "");
}

export type Filled = { subject: string; text: string; html: string };

/** Fill her approved template by string replace. Subject comes from its "Subject:" line, else "Coffee chat about <COMPANY>". */
export function fillTemplate(template: string, v: { first: string; company: string; why: string }, cardHtml: string): Filled {
  let t = stripRules(template.replace(/\r\n/g, "\n")).trim();
  let subjectTpl = "Coffee chat about [COMPANY]";
  const sm = t.match(/^Subject:\s*(.+)\n+/i);
  if (sm) {
    subjectTpl = sm[1].trim();
    t = t.slice(sm[0].length);
  }
  const fill = (s: string, enc: (x: string) => string) =>
    s.split("[FOUNDER FIRST NAME]").join(enc(v.first)).split("[COMPANY]").join(enc(v.company)).split("[WHY LINE]").join(enc(v.why));
  const subject = fill(subjectTpl, (x) => x).replace(/\s+/g, " ").trim();
  const text = fill(t, (x) => x).split(CARD_PLACEHOLDER).join(PORTFOLIO_URL);
  const left = text.match(/\[(FOUNDER FIRST NAME|COMPANY|WHY LINE)\]/);
  if (left) throw new Error(`template still has ${left[0]}`);
  const CARD = "\u0000CARD\u0000";
  const htmlSrc = fill(t.split(CARD_PLACEHOLDER).join(CARD), (x) => x);
  const paras = htmlSrc.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const body = paras
    .map((p) => (p === CARD ? cardHtml : `<p style="margin:0 0 14px 0;">${escHtml(p).replace(/\n/g, "<br>")}</p>`))
    .join("\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:21px;color:#1f2328;">\n${body}\n</div>`;
  return { subject, text, html };
}

// ---------- Gmail ----------

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const wrap76 = (s: string) => s.replace(/.{1,76}/g, (m) => m + "\r\n").trimEnd();
const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

export type MailAttachment = { filename: string; mimeType: string; data: Buffer; contentId?: string };

/** Create a Gmail API message with text, HTML and optional attachments. */
export function buildMime(m: {
  from: string; to: string; subject: string; text: string; html: string; attachments?: MailAttachment[]; messageId?: string;
}, boundary = `jamie_${randomBytes(8).toString("hex")}`): string {
  if ([m.from, m.to, m.subject].some((value) => /[\r\n]/.test(value))) throw new Error("Invalid mail header");
  const alternative = m.attachments?.length ? `${boundary}_alternative` : boundary;
  const lines = [
    `From: ${m.from}`, `To: ${m.to}`, `Subject: ${encodeHeader(m.subject)}`, "MIME-Version: 1.0",
  ];
  if (m.messageId) {
    if (!/^[a-z0-9_.-]+@[a-z0-9.-]+$/i.test(m.messageId)) throw new Error("Invalid message ID");
    lines.push(`Message-ID: <${m.messageId}>`);
  }
  if (m.attachments?.length) {
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, "", `--${boundary}`);
  }
  lines.push(
    `Content-Type: multipart/alternative; boundary="${alternative}"`, "",
    `--${alternative}`, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", wrap76(b64(m.text)),
    `--${alternative}`, 'Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", wrap76(b64(m.html)),
    `--${alternative}--`,
  );
  for (const part of m.attachments ?? []) {
    if (!/^[a-z0-9_.-]+$/i.test(part.filename) || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(part.mimeType) ||
        (part.contentId && !/^[a-z0-9_.-]+$/i.test(part.contentId))) throw new Error("Invalid attachment metadata");
    lines.push(`--${boundary}`, `Content-Type: ${part.mimeType}`, "Content-Transfer-Encoding: base64",
      `Content-Disposition: ${part.contentId ? "inline" : "attachment"}; filename="${part.filename}"`);
    if (part.contentId) lines.push(`Content-ID: <${part.contentId}>`);
    lines.push("", wrap76(part.data.toString("base64")));
  }
  if (m.attachments?.length) lines.push(`--${boundary}--`);
  return Buffer.from([...lines, ""].join("\r\n"), "utf8").toString("base64url");
}

/** Gmail errors that mean "stop sending for now" (quota, rate, account limits). */
export function isGmailStop(status: number, body: string): boolean {
  return status === 429 || (status === 403 && /rate ?limit|quota|dailyLimit|userRateLimit|limit exceeded|sending limit/i.test(body)) || /quotaExceeded|rateLimitExceeded/i.test(body);
}

export const BOUNCE_QUERY = '(from:mailer-daemon OR "Address not found") newer_than:2d';

/** Every email address a bounce message names (headers, snippet and decoded body). */
export function bounceRecipients(msg: any): string[] {
  const chunks: string[] = [String(msg?.snippet ?? "")];
  const walk = (p: any) => {
    if (!p) return;
    for (const h of p.headers ?? []) if (/^(x-failed-recipients|to|original-recipient|final-recipient)$/i.test(h.name)) chunks.push(String(h.value));
    if (p.body?.data) {
      try { chunks.push(Buffer.from(String(p.body.data), "base64url").toString("utf8")); } catch { /* ignore */ }
    }
    for (const c of p.parts ?? []) walk(c);
  };
  walk(msg?.payload);
  const out = new Set<string>();
  for (const e of chunks.join("\n").match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []) out.add(e.toLowerCase());
  return [...out];
}

// ---------- Small helpers ----------

export function envInt(name: string, dflt: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && String(process.env[name] ?? "").trim() !== "" ? Math.min(max, Math.max(min, Math.floor(n))) : dflt;
}
export const envFlag = (name: string) => /^(1|true|yes|on)$/i.test(String(process.env[name] ?? "").trim());
