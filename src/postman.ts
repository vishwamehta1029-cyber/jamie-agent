// Postman: Jamie's outreach agent (Nov 22, 2026). For each job Vishwa selects, Postman finds up to 25
// relevant US people at the company, guesses one work email each, and writes every email in code from
// her approved template (only first name, role, company and the role-based CTA change). Nothing is sent
// until she approves the batch. Unconfirmed email patterns go out as a small canary wave first; the rest
// wait until the canaries pass the 1 hour bounce check. Bounces stop him.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createHash } from "node:crypto";
import { promises as dns } from "node:dns";
import { z } from "zod";
import { q, one, getSetting, setSetting } from "./db.js";
import { guardrailStatus, applyPattern, bounceStreakStop, markBounceChecked, recordBounce } from "./server.js";
import { gmail, gmailToken } from "./entrepreneur.js";
import { BOUNCE_QUERY, bounceRecipients, buildMime } from "./entrepreneurRules.js";
import { renderResume } from "./administrator.js";
import { pickVariant, RESUME_FILES, type Variant } from "./adminRules.js";

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const norm = (s: string) => s.trim().toLowerCase();

// ---------- Template (her approved "Default job outreach email", answer bank) ----------

export const PORTFOLIO = "https://vishwamehta.vercel.app/";
export const THUMBNAIL_URL = "https://image.thum.io/get/width/1000/crop/600/noanimate/https://vishwamehta.vercel.app/";
export const THUMBNAIL_FILE = "vishwa_portfolio_thumbnail.png";
export const CTA = {
  chat: "If this feels like a good fit, I would love to connect for a brief chat.",
  refer: "If this feels like a good fit, could you please refer me for this role or connect me with the right person?",
} as const;
const P_INTRO = "I’m Vishwa, a Forward Deployed AI Engineer at Profundity Group in Seattle, with two years of experience building and deploying AI solutions.";
const P_ABOUT = "I really enjoy problem solving and building creative solutions. I like to stay customer obsessed, understanding what people need and improving solutions based on how they use them.";
const P_PORTFOLIO = "You can explore my projects and demos in my portfolio.";
/** Sentences that must still be in the bank template; if she edits it there, Postman refuses until code matches. */
export const FIXED_SENTENCES = [P_INTRO, P_ABOUT, P_PORTFOLIO, CTA.chat, CTA.refer, "Open to Relocation", "Thank you,"];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderEmail(p: { first: string; role: string; company: string; cta: "chat" | "refer"; to: string }) {
  const subject = `${p.role} at ${p.company} | Open to Relocation`;
  const cta = CTA[p.cta];
  const body = [
    `Hi ${p.first},`,
    `I’m reaching out regarding the ${p.role} at ${p.company}.`,
    P_INTRO,
    P_ABOUT,
    `${P_PORTFOLIO} ${PORTFOLIO}`,
    cta,
    "Thank you,\nVishwa Mehta",
  ].join("\n\n");
  const para = (t: string) => `<p style="margin:0 0 14px 0;">${t}</p>`;
  const card =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="width:100%;max-width:520px;border:1px solid #e4e7ec;border-radius:12px;margin:0 0 14px 0;">` +
    `<tr><td><a href="${PORTFOLIO}" target="_blank"><img src="cid:att0" width="520" alt="Vishwa Mehta’s portfolio: AI projects, live demos, and automation workflows" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:12px 12px 0 0;"></a></td></tr>` +
    `<tr><td style="padding:14px 16px;font-family:Arial,sans-serif;font-size:14px;line-height:21px;"><a href="${PORTFOLIO}" style="color:#3f61d8;text-decoration:none;font-weight:bold;">Explore my AI projects, live demos, and automation workflows →</a></td></tr></table>`;
  const html =
    `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:21px;color:#1f2328;">` +
    para(`Hi ${esc(p.first)},`) +
    para(`I’m reaching out regarding the ${esc(p.role)} at ${esc(p.company)}.`) +
    para(P_INTRO) +
    para(P_ABOUT) +
    para(`You can explore my projects and demos in my <a href="${PORTFOLIO}" target="_blank">portfolio</a>.`) +
    card +
    para(cta) +
    para("Thank you,<br>Vishwa Mehta") +
    `</div>`;
  return { subject, body, html, sha256: sha(`${p.to}\n${subject}\n${html}`) };
}

async function templateDrift(): Promise<string | null> {
  const t = await one("SELECT id, answer FROM answers WHERE approved AND question ILIKE 'Default job outreach email%' ORDER BY id LIMIT 1");
  if (!t) return "No approved \"Default job outreach email\" in the answer bank.";
  const flat = (s: string) => s.replace(/[’']/g, "'").replace(/\s+/g, " ");
  const missing = FIXED_SENTENCES.filter((s) => !flat(t.answer).includes(flat(s)));
  return missing.length ? `The bank template (answer #${t.id}) no longer has: ${missing.map((m) => `"${m}"`).join("; ")}. Update Postman's template in code to match before sending.` : null;
}

// ---------- People: names, US check, relevance ----------

const SUFFIX = /^(jr|sr|ii|iii|iv|phd|mba|md|cpa|pmp|shrm-cp|shrm-scp|phr|sphr)\.?$/i;
export function splitName(raw: string): { first: string; last: string; clean: string } | null {
  const clean = raw.replace(/\(.*?\)/g, " ").split(",")[0].replace(/[^\p{L}\p{M}'\-. ]/gu, " ").replace(/\s+/g, " ").trim();
  const parts = clean.split(" ").filter((w) => w && !SUFFIX.test(w));
  while (parts.length && /^(dr|mr|mrs|ms|prof)\.?$/i.test(parts[0])) parts.shift();
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  if (/^\p{L}\.?$/u.test(last)) return null; // masked or initial-only last name
  const cap = (w: string) => w.split(/([-'])/).map((x) => (x.length > 1 && x === x.toLowerCase() || x === x.toUpperCase() ? x.charAt(0).toUpperCase() + x.slice(1).toLowerCase() : x)).join("");
  return { first: cap(parts[0]), last: cap(last), clean: parts.map(cap).join(" ") };
}

const US_STATES = "alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|district of columbia";
const US_ABBR = "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";
const US_PLACES = "san francisco|bay area|silicon valley|seattle|new york|nyc|los angeles|boston|austin|chicago|denver|atlanta|miami|dallas|houston|san diego|san jose|palo alto|mountain view|menlo park|redmond|bellevue|portland|philadelphia|pittsburgh|phoenix|salt lake|minneapolis|detroit|raleigh|nashville|charlotte|washington dc|brooklyn|oakland|sunnyvale|santa clara|irvine|tampa|orlando";
const NON_US = /\b(canada|toronto|vancouver|montreal|india|bengaluru|bangalore|mumbai|delhi|hyderabad|pune|united kingdom|\buk\b|england|london|ireland|dublin|germany|berlin|munich|france|paris|netherlands|amsterdam|spain|madrid|barcelona|portugal|lisbon|poland|czech|prague|israel|tel aviv|singapore|australia|sydney|brazil|mexico|argentina|philippines|japan|tokyo|china|korea|ukraine|romania|serbia)\b/i;
export function isUS(loc?: string | null): boolean {
  if (!loc) return false;
  if (NON_US.test(loc) && !/united states|\busa?\b/i.test(loc)) return false;
  return new RegExp(`united states|\\busa\\b|\\bu\\.s\\.|\\bus\\b|\\b(${US_STATES})\\b|\\b(${US_PLACES})\\b`, "i").test(loc) || new RegExp(`,\\s*(${US_ABBR})\\b`).test(loc);
}

type Family = "fde" | "ai" | "gtm" | "product" | "data" | "general";
const FAMILY_RE: Record<Exclude<Family, "general">, RegExp> = {
  fde: /forward deployed|deploy|solutions?|field engineer|implementation|customer engineer|professional services|sales engineer|applied ai/i,
  ai: /\bai\b|\bml\b|machine learning|llm|applied|artificial intelligence|data scien/i,
  gtm: /\bgtm\b|go-to-market|growth|revenue|revops|sales|marketing|demand gen|business development|partnerships/i,
  product: /product/i,
  data: /\bdata\b|analytics|\bbi\b|business intelligence|analyst/i,
};
export function roleFamilies(role: string): Family[] {
  const f = (Object.keys(FAMILY_RE) as Exclude<Family, "general">[]).filter((k) => FAMILY_RE[k].test(role));
  return f.length ? f : ["general"];
}
const ENGINEERING = /engineer|engineering|technical|developer|\bcto\b|architect/i;

export function searchTitles(role: string): { team: string[]; recruiters: string[]; leaders: string[] } {
  const fam = roleFamilies(role);
  const team = new Set<string>([role]);
  if (fam.includes("fde")) ["Forward Deployed Engineer", "Head of Forward Deployed Engineering", "Solutions Engineer", "Deployment Strategist", "Head of Solutions", "Customer Engineer"].forEach((t) => team.add(t));
  if (fam.includes("ai")) ["AI Engineer", "Head of AI", "Applied AI", "Machine Learning Engineer", "Engineering Manager"].forEach((t) => team.add(t));
  if (fam.includes("gtm")) ["GTM Engineer", "Head of Growth", "Revenue Operations", "Head of Marketing", "VP Sales", "Growth Engineer"].forEach((t) => team.add(t));
  if (fam.includes("product")) ["Product Manager", "Head of Product", "VP Product", "Group Product Manager"].forEach((t) => team.add(t));
  if (fam.includes("data")) ["Data Analyst", "Analytics Manager", "Head of Data", "Business Intelligence"].forEach((t) => team.add(t));
  if (ENGINEERING.test(role)) ["Engineering Manager", "VP Engineering", "Head of Engineering"].forEach((t) => team.add(t));
  return {
    team: [...team],
    recruiters: ["Technical Recruiter", "Recruiter", "Talent Acquisition", "Head of Talent", "Recruiting Lead", "Talent Partner"],
    leaders: ["Founder", "Co-Founder", "CEO", "CTO"],
  };
}

export type PersonIn = {
  name: string; title: string; location?: string; linkedin_url?: string; source?: string; evidence?: string;
  responsible_for_role?: boolean; shared_opening?: boolean; usf_alum?: boolean; public_email?: string;
};

const RECRUITER = /recruit|talent|sourc(er|ing)|people partner|people operations|\bhr\b|human resources|head of people/i;
const FOUNDER = /founder|\bceo\b|chief executive/i;
const LEADER = /\bcto\b|\bchief\b|\bvp\b|vice president|head of|\bdirector\b|\bpresident\b|\bgm\b|general manager/i;
const MANAGER = /manager|\blead\b|principal|staff/i;

/** Relevance in code: who is closest to the hiring decision for this role. CTA follows Vishwa's rule. */
export function classify(p: PersonIn, role: string, jobLocation?: string | null) {
  const t = p.title;
  const fam = roleFamilies(role);
  const fnMatch = fam.some((f) => f !== "general" && FAMILY_RE[f].test(t)) || (fam.includes("general") && ENGINEERING.test(role) && ENGINEERING.test(t));
  const engAdj = ENGINEERING.test(role) && ENGINEERING.test(t);
  let bucket: "hiring" | "recruiter" | "team" | "other";
  let score: number;
  let why: string;
  if (p.responsible_for_role) { bucket = "hiring"; score = 100; why = "directly responsible for the role"; }
  else if (FOUNDER.test(t)) { bucket = "hiring"; score = 85; why = "founder or CEO"; }
  else if (RECRUITER.test(t)) { bucket = "recruiter"; score = /technical|engineering|gtm|go-to-market|ai\b/i.test(t) ? 78 : 70; why = "recruiter"; }
  else if (p.shared_opening) { bucket = "team"; score = 90; why = "publicly shared this opening"; }
  else if (LEADER.test(t) && fnMatch) { bucket = "team"; score = 82; why = "leads this function"; }
  else if (MANAGER.test(t) && fnMatch) { bucket = "team"; score = 76; why = "manages or leads in this function"; }
  else if (fnMatch) { bucket = "team"; score = 62; why = "same function"; }
  else if (LEADER.test(t) && engAdj) { bucket = "team"; score = 58; why = "engineering leader"; }
  else if (engAdj) { bucket = "team"; score = 45; why = "adjacent engineering"; }
  else { bucket = "other"; score = 20; why = "not clearly related to the role"; }
  if (jobLocation && p.location) {
    const city = jobLocation.split(",")[0].trim().toLowerCase();
    if (city && city.length > 2 && p.location.toLowerCase().includes(city)) { score += 5; why += ", same city"; }
  }
  if (p.usf_alum) { score += 3; why += ", USF alum"; }
  const cta: "chat" | "refer" = p.responsible_for_role || FOUNDER.test(t) || RECRUITER.test(t) ? "chat" : "refer";
  return { bucket, score, why, cta };
}

// ---------- Email pattern + domain ----------

const COMMON = ["{first}.{last}", "{first}", "{f}{last}", "{first}{last}", "{first}_{last}", "{f}.{last}", "{first}{l}"];

async function checkMx(domain: string) {
  let accepts = false;
  try { accepts = (await dns.resolveMx(domain)).length > 0; } catch { accepts = false; }
  return one(
    `INSERT INTO email_patterns (domain, accepts_mail) VALUES ($1,$2)
     ON CONFLICT (domain) DO UPDATE SET accepts_mail = EXCLUDED.accepts_mail, updated_at = now() RETURNING *`,
    [domain, accepts]
  );
}

/** One address per person. Confirmed pattern, else the saved guess, else the most common format not marked wrong. */
function patternFor(p: any): { pattern: string; status: "confirmed" | "guessed" } {
  if (p?.pattern && p.status === "confirmed") return { pattern: p.pattern, status: "confirmed" };
  if (p?.pattern && p.status === "guessed") return { pattern: p.pattern, status: "guessed" };
  const wrong = p?.status === "wrong" && p.pattern ? p.pattern : null;
  return { pattern: COMMON.find((x) => x !== wrong)!, status: "guessed" };
}

// ---------- Status helpers ----------

async function syncBounces(campaignId: number) {
  await q(`UPDATE postman_people pp SET status = 'bounced', updated_at = now() FROM sends s
           WHERE pp.send_id = s.id AND s.bounced AND pp.status = 'sent' AND pp.campaign_id = $1`, [campaignId]);
}

async function counts(campaignId: number) {
  const rows = await q("SELECT status, count(*)::int n FROM postman_people WHERE campaign_id = $1 GROUP BY status", [campaignId]);
  return Object.fromEntries((rows as any[]).map((r) => [r.status, r.n]));
}

export async function postmanStatus() {
  const rows = await q(`SELECT c.id, c.company, c.role, c.status, c.stop_reason,
      count(p.*) FILTER (WHERE p.status = 'sent')::int sent,
      count(p.*) FILTER (WHERE p.status = 'bounced')::int bounced,
      count(p.*) FILTER (WHERE p.status = 'approved')::int to_send,
      count(p.*) FILTER (WHERE p.status = 'picked')::int awaiting_approval
    FROM postman_campaigns c LEFT JOIN postman_people p ON p.campaign_id = c.id
    WHERE c.status NOT IN ('done','stopped') OR c.updated_at > now() - interval '2 days'
    GROUP BY c.id ORDER BY c.updated_at DESC LIMIT 20`);
  return {
    waiting_for_vishwa: (rows as any[]).filter((r) => ["review", "needs_vishwa"].includes(r.status)),
    sending: (rows as any[]).filter((r) => ["approved", "sending"].includes(r.status)),
    recent: rows,
  };
}

async function sentTodayAll(): Promise<number> {
  const r = await one("SELECT count(*)::int n FROM sends WHERE sent_at > now() - interval '24 hours'");
  return r?.n ?? 0;
}

// ---------- Tools ----------

async function postmanMailbox() {
  const sender = process.env.GMAIL_SENDER?.trim().toLowerCase();
  if (!sender || !/^[^\s<>@]+@[^\s<>@]+$/.test(sender)) throw new Error("Configure GMAIL_SENDER in Vercel");
  const token = await gmailToken();
  const profile = await gmail(token, "profile");
  if (profile.status !== 200) throw new Error(`Gmail profile check failed (HTTP ${profile.status})`);
  if (profile.json?.emailAddress?.toLowerCase() !== sender) throw new Error("Gmail OAuth is connected to a different mailbox than GMAIL_SENDER");
  return { sender, token };
}

async function checkPostmanBounces(campaignId: number) {
  const due = await q(`SELECT s.* FROM sends s JOIN postman_people p ON p.send_id = s.id
    WHERE p.campaign_id = $1 AND NOT s.bounced
      AND ((NOT s.checked_1h AND s.sent_at <= now() - interval '1 hour')
        OR (NOT s.checked_24h AND s.sent_at <= now() - interval '24 hours'))`, [campaignId]);
  if (!due.length) return 0;
  const { token } = await postmanMailbox();
  const oldest = Math.floor(Math.min(...due.map((send) => new Date(send.sent_at).getTime())) / 1000);
  const query = encodeURIComponent(`${BOUNCE_QUERY.replace(" newer_than:2d", "")} after:${oldest}`);
  const hits: { addresses: string[]; threadId: string; observedAt: number }[] = [];
  let pageToken = "";
  do {
    const list = await gmail(token, `messages?maxResults=100&q=${query}&pageToken=${encodeURIComponent(pageToken)}`);
    if (list.status !== 200 || !list.json) throw new Error(`Gmail bounce search failed (HTTP ${list.status})`);
    for (const message of list.json.messages ?? []) {
      const result = await gmail(token, `messages/${message.id}?format=full`);
      const observedAt = Number(result.json?.internalDate);
      if (result.status !== 200 || !Number.isFinite(observedAt)) throw new Error("Incomplete Gmail bounce check");
      hits.push({ addresses: bounceRecipients(result.json), threadId: result.json.threadId, observedAt });
    }
    pageToken = list.json.nextPageToken ?? "";
  } while (pageToken);
  for (const send of due) {
    const sentAt = new Date(send.sent_at).getTime();
    const hit = hits.some(({ addresses, threadId, observedAt }) => observedAt >= sentAt &&
      ((send.gmail_thread_id && threadId === send.gmail_thread_id) || addresses.includes(norm(send.to_email))));
    if (hit) await recordBounce(send.id, "Gmail delivery failure (Postman check)");
    else {
      if (!send.checked_1h) await markBounceChecked(send.id, "1h");
      if (!send.checked_24h && Date.now() - sentAt >= 86_400_000) await markBounceChecked(send.id, "24h");
    }
  }
  return due.length;
}

const postmanMessageId = (id: number, hash: string) => `postman.${id}.${hash}@jamie-mcp.vercel.app`;

async function logPostmanDispatch(campaignId: number, p: { id: number; contact_id: number; email: string; subject: string }, messageId: string, threadId?: string) {
  const logged = await one(`WITH claimed AS (
      SELECT id FROM postman_people WHERE id = $6 AND status = 'dispatching' FOR UPDATE
    ), sent AS (
      INSERT INTO sends (contact_id, to_email, subject, gmail_message_id, gmail_thread_id)
      SELECT $1,$2,$3,$4,$5 FROM claimed RETURNING id
    ), person AS (
      UPDATE postman_people SET status = 'sent', send_id = sent.id, updated_at = now()
      FROM sent WHERE postman_people.id = $6 AND status = 'dispatching' RETURNING sent.id
    ), contact AS (
      UPDATE contacts SET status = 'sent', updated_at = now() WHERE id = $1
    ), campaign AS (
      UPDATE postman_campaigns SET status = 'sending', updated_at = now() WHERE id = $7 AND status = 'approved'
    ) SELECT id FROM person`, [p.contact_id, p.email, p.subject, messageId, threadId ?? null, p.id, campaignId]);
  if (!logged) throw new Error("Dispatch was already resolved");
  return { sent: true, person_id: p.id, send_id: logged.id, gmail_message_id: messageId };
}

async function sendPostmanEmail(c: { id: number; resume_variant: Variant }, p: {
  id: number; contact_id: number; email: string; subject: string; body: string; html: string; sha256: string;
}) {
  if (sha(`${p.email}\n${p.subject}\n${p.html}`) !== p.sha256) return ok({ refused: true, reason: "Approved email changed" });
  const [{ sender, token }, resume, thumbnail] = await Promise.all([
    postmanMailbox(), renderResume(c.resume_variant), fetch(THUMBNAIL_URL, { signal: AbortSignal.timeout(10000) }),
  ]);
  if (!thumbnail.ok) throw new Error(`Portfolio thumbnail failed (HTTP ${thumbnail.status})`);
  const mimeType = thumbnail.headers.get("content-type")?.split(";")[0] ?? "";
  if (!/^image\/(png|jpeg|gif|webp)$/.test(mimeType)) throw new Error("Portfolio thumbnail did not return an image");
  const raw = buildMime({ messageId: postmanMessageId(p.id, p.sha256), from: `Vishwa Mehta <${sender}>`, to: p.email, subject: p.subject, text: p.body, html: p.html,
    attachments: [
      { filename: THUMBNAIL_FILE.replace(/\.png$/, `.${mimeType.split("/")[1]}`), mimeType, data: Buffer.from(await thumbnail.arrayBuffer()), contentId: "att0" },
      { filename: resume.filename, mimeType: "application/pdf", data: resume.pdf },
    ],
  });
  const g = await guardrailStatus(p.contact_id);
  if (!g.can_send) return ok({ refused: true, reason: g.blocks.join(" ") });
  const claim = await one(`UPDATE postman_people p SET status = 'dispatching', updated_at = now()
    FROM postman_campaigns c
    WHERE p.id = $1 AND c.id = p.campaign_id AND c.status IN ('approved','sending')
      AND p.status = 'approved' AND p.sha256 = $2
      AND NOT EXISTS (SELECT 1 FROM sends s WHERE s.contact_id = p.contact_id OR lower(s.to_email) = lower(p.email))
    RETURNING p.id`, [p.id, p.sha256]).catch((error) => {
    if (error?.code === "23505") return null;
    throw error;
  });
  if (!claim) return ok({ wait: true, reason: "A send is in progress or this recipient has already been contacted" });
  try {
    const result = await gmail(token, "messages/send", { method: "POST", body: JSON.stringify({ raw }) });
    if (result.status >= 400 && result.status < 500 && result.status !== 408) {
      await q("UPDATE postman_people SET status = 'approved', updated_at = now() WHERE id = $1 AND status = 'dispatching'", [p.id]);
      return ok({ refused: true, reason: `Gmail rejected the send (HTTP ${result.status})` });
    }
    if (result.status !== 200 || !result.json?.id) throw new Error("Gmail did not confirm acceptance");
    return ok(await logPostmanDispatch(c.id, p, result.json.id, result.json.threadId));
  } catch {
    return ok({ stop: true, person_id: p.id, reason: "Gmail acceptance or logging was uncertain. Check Sent mail before resolving the pending dispatch. Postman will not retry it automatically." });
  }
}

export function registerPostmanTools(server: McpServer) {
  server.registerTool(
    "jamie_postman_queue",
    {
      description: "Postman: jobs Vishwa could pick for outreach (recent submitted applications with no Postman campaign yet), plus open campaigns. Show this when she says to run Postman without naming jobs.",
      inputSchema: { days: z.number().int().min(1).max(60).optional(), limit: z.number().int().max(100).optional() },
    },
    async ({ days, limit }) => {
      const apps = await q(
        `SELECT a.id application_id, a.company, a.role, a.url, a.tier, a.submitted_at FROM applications a
         WHERE a.status = 'submitted' AND a.submitted_at > now() - make_interval(days => $1)
           AND NOT EXISTS (SELECT 1 FROM postman_campaigns c WHERE lower(c.company) = lower(a.company) AND lower(c.role) = lower(a.role))
         ORDER BY a.submitted_at DESC LIMIT $2`,
        [days ?? 7, limit ?? 40]
      );
      return ok({ pick_from: apps, campaigns: await postmanStatus(), next: "Vishwa picks the jobs. For each one: jamie_postman_start." });
    }
  );

  server.registerTool(
    "jamie_postman_start",
    {
      description: "Postman: open an outreach campaign for one job Vishwa selected. Code marks the application quality, lists everyone at the company already emailed (they are skipped), checks the domain's mail server, and returns the search plan: how many recruiters vs team people to find and which titles to search.",
      inputSchema: {
        company: z.string(), role: z.string(),
        application_id: z.number().int().optional(),
        domain: z.string().optional().describe("Company email domain, e.g. acme.com (from their site or a public address)"),
        job_url: z.string().optional(), job_location: z.string().optional(), job_description: z.string().optional(),
        target: z.number().int().min(1).max(50).optional().describe("People to email; default 25"),
      },
    },
    async (a) => {
      const open = await one("SELECT * FROM postman_campaigns WHERE lower(company) = lower($1) AND lower(role) = lower($2) AND status NOT IN ('stopped','done')", [a.company, a.role]);
      if (open) return ok({ existing: true, campaign: open, counts: await counts(open.id), next: "Continue this campaign (jamie_postman_status for details)." });
      const app = a.application_id
        ? await one("SELECT * FROM applications WHERE id = $1", [a.application_id])
        : await one("SELECT * FROM applications WHERE lower(company) = lower($1) AND lower(role) = lower($2) ORDER BY (status = 'submitted') DESC, id DESC LIMIT 1", [a.company, a.role]);
      const warnings: string[] = [];
      if (!app) warnings.push("No application found for this job. Outreach usually follows the application; tell Vishwa.");
      else if (app.status !== "submitted") warnings.push(`Application #${app.id} is ${app.status}, not submitted yet.`);
      if (app) await q("UPDATE applications SET tier = 'quality', updated_at = now() WHERE id = $1", [app.id]);
      const variant: Variant = pickVariant(a.role, a.job_description ?? app?.jd_text ?? "").variant;
      const target = a.target ?? Number((await getSetting("postman_target")) ?? 25);
      const domain = a.domain ? norm(a.domain).replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] : null;
      const c = await one(
        `INSERT INTO postman_campaigns (application_id, company, role, domain, job_url, job_location, resume_variant, target)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [app?.id ?? null, a.company, a.role, domain, a.job_url ?? app?.url ?? null, a.job_location ?? app?.location ?? null, variant, target]
      );
      const already = await q(
        `SELECT DISTINCT c.name, c.title, s.to_email, s.sent_at::date sent FROM sends s JOIN contacts c ON c.id = s.contact_id
         WHERE lower(c.company) = lower($1) ORDER BY 4 DESC`, [a.company]);
      const companyBounces = Number((await one("SELECT count(*) n FROM sends s JOIN contacts c ON c.id = s.contact_id WHERE s.bounced AND lower(c.company) = lower($1)", [a.company])).n);
      const pattern = domain ? await checkMx(domain) : null;
      if (pattern && pattern.accepts_mail === false) warnings.push(`${domain} has no mail server (MX). Find the right domain before building.`);
      if (companyBounces) warnings.push(`${companyBounces} past bounces at ${a.company}.`);
      const share = Number((await getSetting("postman_recruiter_share")) ?? 0.4);
      const recruiters = Math.round(target * share);
      return ok({
        campaign_id: c.id, company: c.company, role: c.role, resume: RESUME_FILES[variant], warnings,
        already_emailed_skip_these: already,
        domain: domain ? { domain, accepts_mail: pattern?.accepts_mail, pattern: pattern?.pattern ?? null, pattern_status: pattern?.status ?? null, catch_all: pattern?.catch_all ?? null } : "missing: pass it to jamie_postman_build",
        search_plan: {
          find: `${target} people, aim for about ${recruiters} recruiters and ${target - recruiters} hiring or team people. Collect extra (up to ${target + 15}); code ranks and picks.`,
          titles: searchTitles(a.role),
          where: [
            "LinkedIn people search: current company = this company, location United States, one search per title above; read name, headline, location",
            "The posting itself (hiring manager named?), the company team or about page, and LinkedIn posts sharing this opening",
            "Apollo people search in her Apollo tab (search only). Never click Access email: that spends credits, and Apollo is only for one lookup after a bounce",
          ],
          rules: [
            "Current employee, US location (code rejects anything else), real full name (masked last names are rejected)",
            "Mark responsible_for_role only with evidence (named hiring manager, 'I'm hiring' post); mark shared_opening if they posted this job",
            "Never guess or summarize relevance yourself; send name, title and location as shown and let code score",
          ],
        },
        email_pattern_help: pattern?.status === "confirmed" ? "Pattern confirmed; no canary needed." : "Look for public evidence of the email format (an address on their site, press page, GitHub commits) and save it with jamie_save_email_pattern before building.",
        next: "jamie_postman_add_people with everyone found (batches are fine), then jamie_postman_build.",
      });
    }
  );

  const personSchema = z.object({
    name: z.string(), title: z.string(), location: z.string().optional(), linkedin_url: z.string().optional(),
    source: z.string().optional().describe("linkedin, apollo_search, team_page, posting, other"),
    evidence: z.string().optional(), responsible_for_role: z.boolean().optional(), shared_opening: z.boolean().optional(),
    usf_alum: z.boolean().optional(), public_email: z.string().optional().describe("Only an address seen publicly"),
  });

  server.registerTool(
    "jamie_postman_add_people",
    {
      description: "Postman: add people found at the company, exactly as shown (name, title, location). Code rejects non-US, masked names and anyone already emailed, scores relevance to the role, sets the CTA, and says how many more of each kind are needed.",
      inputSchema: { campaign_id: z.number().int(), people: z.array(personSchema).min(1).max(60) },
    },
    async ({ campaign_id, people }) => {
      const c = await one("SELECT * FROM postman_campaigns WHERE id = $1", [campaign_id]);
      if (!c) return ok({ refused: true, reason: "no such campaign" });
      if (!["finding", "review"].includes(c.status)) return ok({ refused: true, reason: `campaign is ${c.status}` });
      const added: any[] = [];
      const rejected: any[] = [];
      for (const p of people) {
        const n = splitName(p.name);
        if (!n) { rejected.push({ name: p.name, reason: "no full name (masked or single name)" }); continue; }
        if (!isUS(p.location)) { rejected.push({ name: n.clean, reason: p.location ? `not US (${p.location})` : "location unknown; US is required" }); continue; }
        const prior = await one(
          `SELECT s.to_email, s.sent_at FROM sends s JOIN contacts ct ON ct.id = s.contact_id
           WHERE lower(ct.name) = lower($1) AND lower(ct.company) = lower($2) LIMIT 1`, [n.clean, c.company]);
        if (prior) { rejected.push({ name: n.clean, reason: `already emailed ${String(prior.sent_at).slice(0, 15)}` }); continue; }
        const k = classify(p, c.role, c.job_location);
        const row = await one(
          `INSERT INTO postman_people (campaign_id, name, first_name, last_name, title, location, linkedin_url, source, evidence, public_email, bucket, score, cta, reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (campaign_id, lower(name)) DO NOTHING RETURNING id`,
          [campaign_id, n.clean, n.first, n.last, p.title, p.location ?? null, p.linkedin_url ?? null, p.source ?? null, p.evidence ?? null,
           p.public_email ? norm(p.public_email) : null, k.bucket, k.score, k.cta, k.why]
        );
        if (!row) { rejected.push({ name: n.clean, reason: "duplicate in this campaign" }); continue; }
        added.push({ id: row.id, name: n.clean, title: p.title, bucket: k.bucket, score: k.score, cta: k.cta });
      }
      const pool = await q("SELECT bucket, count(*)::int n FROM postman_people WHERE campaign_id = $1 AND status = 'candidate' GROUP BY bucket", [campaign_id]);
      const by = Object.fromEntries((pool as any[]).map((r) => [r.bucket, r.n]));
      const share = Number((await getSetting("postman_recruiter_share")) ?? 0.4);
      const wantRec = Math.round(c.target * share);
      const rel = (by.hiring ?? 0) + (by.team ?? 0);
      const still = { recruiters: Math.max(0, wantRec - (by.recruiter ?? 0)), hiring_or_team: Math.max(0, c.target - wantRec - rel) };
      return ok({
        added: added.length, rejected, pool: by, still_needed: still,
        next: still.recruiters + still.hiring_or_team > 0
          ? "Keep searching (next title, next page). If the company is too small to reach the target, build anyway; code reports the shortfall."
          : "Enough people. jamie_postman_build.",
      });
    }
  );

  server.registerTool(
    "jamie_postman_build",
    {
      description: "Postman: pick the top people (about 40% recruiters, 60% hiring and team), give each one email address, and write every email in code from Vishwa's approved template with the thumbnail and resume. Returns the review sheet to show her. Nothing is sent from here.",
      inputSchema: { campaign_id: z.number().int(), domain: z.string().optional() },
    },
    async ({ campaign_id, domain }) => {
      const c = await one("SELECT * FROM postman_campaigns WHERE id = $1", [campaign_id]);
      if (!c) return ok({ refused: true, reason: "no such campaign" });
      if (!["finding", "review"].includes(c.status)) return ok({ refused: true, reason: `campaign is ${c.status}; already approved batches are not rebuilt` });
      const drift = await templateDrift();
      if (drift) return ok({ refused: true, reason: drift });
      const d = domain ? norm(domain) : c.domain;
      if (!d) return ok({ refused: true, reason: "need the company email domain" });
      if (domain) await q("UPDATE postman_campaigns SET domain = $2 WHERE id = $1", [campaign_id, d]);
      const dp = await checkMx(d);
      if (!dp.accepts_mail) return ok({ refused: true, reason: `${d} has no mail server (MX). Wrong domain?` });

      // Rebuild from scratch each time before approval.
      await q("UPDATE postman_people SET status = 'candidate', email = NULL, wave = NULL, sha256 = NULL WHERE campaign_id = $1 AND status = 'picked'", [campaign_id]);
      const pool = (await q("SELECT * FROM postman_people WHERE campaign_id = $1 AND status = 'candidate' ORDER BY score DESC, id", [campaign_id])) as any[];
      const share = Number((await getSetting("postman_recruiter_share")) ?? 0.4);
      const wantRec = Math.round(c.target * share);
      const recs = pool.filter((p) => p.bucket === "recruiter");
      const rel = pool.filter((p) => p.bucket === "hiring" || p.bucket === "team");
      const others = pool.filter((p) => p.bucket === "other");
      const pick: any[] = [...recs.slice(0, wantRec), ...rel.slice(0, c.target - wantRec)];
      for (const p of [...rel, ...recs, ...others]) { if (pick.length >= c.target) break; if (!pick.includes(p)) pick.push(p); }
      pick.sort((x, y) => Number(y.score) - Number(x.score));

      const pat = patternFor(dp);
      const canarySize = Number((await getSetting("postman_canary_size")) ?? 3);
      const needCanary = pat.status !== "confirmed" && pick.some((p) => !p.public_email);
      let canaries = 0;
      const rows: any[] = [];
      for (const p of pick) {
        const email = p.public_email ?? applyPattern(pat.pattern, p.first_name, p.last_name, d);
        const source = p.public_email ? "public" : "guessed";
        const confidence = p.public_email ? "high" : dp.catch_all ? "low" : pat.status === "confirmed" ? "high" : "medium";
        const wave = !needCanary || p.public_email ? 1 : canaries < canarySize ? (canaries++, 1) : 2;
        let contact = await one("SELECT * FROM contacts WHERE lower(name) = lower($1) AND lower(company) = lower($2)", [p.name, c.company]);
        if (contact) contact = await one("UPDATE contacts SET title = $2, domain = $3, email = $4, email_source = $5, email_confidence = $6, application_id = COALESCE(application_id, $7), linkedin_url = COALESCE(linkedin_url, $8), status = 'drafted', updated_at = now() WHERE id = $1 RETURNING *",
          [contact.id, p.title, d, email, source, confidence, c.application_id, p.linkedin_url]);
        else contact = await one(`INSERT INTO contacts (name, title, company, domain, linkedin_url, email, email_source, email_confidence, status, application_id, notes)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'drafted',$9,$10) RETURNING *`,
          [p.name, p.title, c.company, d, p.linkedin_url, email, source, confidence, c.application_id, `Postman campaign ${campaign_id}`]);
        const r = renderEmail({ first: p.first_name, role: c.role, company: c.company, cta: p.cta, to: email });
        await q(`UPDATE postman_people SET status = 'picked', contact_id = $2, email = $3, email_source = $4, email_confidence = $5, pattern = $6, wave = $7,
                 subject = $8, html = $9, body = $10, sha256 = $11, updated_at = now() WHERE id = $1`,
          [p.id, contact.id, email, source, confidence, p.public_email ? null : pat.pattern, wave, r.subject, r.html, r.body, r.sha256]);
        rows.push({ id: p.id, name: p.name, title: p.title, location: p.location, why: p.reason, cta: p.cta, email, confidence, wave });
      }
      await q("UPDATE postman_campaigns SET status = 'review', updated_at = now() WHERE id = $1", [campaign_id]);
      const flags: string[] = [];
      if (pick.length < c.target) flags.push(`Shortfall: ${pick.length} of ${c.target} (only ${pool.length} qualified US people found).`);
      const nRec = pick.filter((p) => p.bucket === "recruiter").length;
      if (nRec < wantRec) flags.push(`${nRec} recruiters (aim was ${wantRec}).`);
      if (dp.catch_all) flags.push(`${d} is catch-all: guessed addresses are low confidence.`);
      if (needCanary) flags.push(`Pattern ${pat.pattern}@${d} is not confirmed: wave 1 (${canaries} people) goes first; wave 2 waits until wave 1 passes the 1 hour bounce check.`);
      const others_used = pick.filter((p) => p.bucket === "other").length;
      if (others_used) flags.push(`${others_used} picks are only loosely related to the role (filled to reach the target). Vishwa can drop them.`);
      const sample = pick[0] ? await one("SELECT subject, body FROM postman_people WHERE id = $1", [pick[0].id]) : null;
      return ok({
        campaign_id, company: c.company, role: c.role, resume: RESUME_FILES[c.resume_variant as Variant],
        people: rows, flags,
        what_changes_per_email: "Only the greeting name, and the CTA line (chat vs refer) by role. Subject, body, portfolio card and resume attachment are identical.",
        sample_email: sample,
        next: "Show Vishwa the people table, the flags and the sample email (exact text). Send nothing. When she says yes (she may drop people or change a CTA), call jamie_postman_approve with her words.",
      });
    }
  );

  server.registerTool(
    "jamie_postman_approve",
    {
      description: "Postman: record Vishwa's approval of a built batch. Call ONLY after she said yes in chat to the exact people table and sample. Pass her words. Optional: people to drop, CTA changes. Locks every email's exact text.",
      inputSchema: {
        campaign_id: z.number().int(),
        vishwa_said: z.string().min(2).describe("Her approval, quoted"),
        drop_person_ids: z.array(z.number().int()).optional(),
        cta_changes: z.array(z.object({ person_id: z.number().int(), cta: z.enum(["chat", "refer"]) })).optional(),
      },
    },
    async ({ campaign_id, vishwa_said, drop_person_ids, cta_changes }) => {
      const c = await one("SELECT * FROM postman_campaigns WHERE id = $1", [campaign_id]);
      if (!c) return ok({ refused: true, reason: "no such campaign" });
      if (!["review", "needs_vishwa"].includes(c.status)) return ok({ refused: true, reason: `campaign is ${c.status}; build it first` });
      if (drop_person_ids?.length) await q("UPDATE postman_people SET status = 'dropped', reason = concat_ws('; ', reason, 'dropped by Vishwa') WHERE campaign_id = $1 AND id = ANY($2::int[]) AND status = 'picked'", [campaign_id, drop_person_ids]);
      for (const ch of cta_changes ?? []) {
        const p = await one("SELECT * FROM postman_people WHERE id = $1 AND campaign_id = $2 AND status = 'picked'", [ch.person_id, campaign_id]);
        if (!p) continue;
        const r = renderEmail({ first: p.first_name, role: c.role, company: c.company, cta: ch.cta, to: p.email });
        await q("UPDATE postman_people SET cta = $2, html = $3, body = $4, sha256 = $5 WHERE id = $1", [p.id, ch.cta, r.html, r.body, r.sha256]);
      }
      const n = await q("UPDATE postman_people SET status = 'approved', updated_at = now() WHERE campaign_id = $1 AND status = 'picked' RETURNING id", [campaign_id]);
      await q("UPDATE postman_campaigns SET status = 'approved', approved_quote = $2, approved_at = now(), stop_reason = NULL, updated_at = now() WHERE id = $1", [campaign_id, vishwa_said]);
      return ok({ approved: n.length, next: "Call jamie_postman_gmail_check, then call jamie_postman_next with send_via_gmail: true for each approved message." });
    }
  );

  server.registerTool(
    "jamie_postman_assets",
    {
      description: "Postman: the two attachments every email carries, as base64 with sha256: the portfolio thumbnail (inline, cid:att0) and the approved resume for this campaign. Write each to /mnt/user-data/outputs/jamie/<filename> once per session and attach by file reference.",
      inputSchema: { campaign_id: z.number().int(), part: z.enum(["thumbnail", "resume"]) },
    },
    async ({ campaign_id, part }) => {
      const c = await one("SELECT resume_variant FROM postman_campaigns WHERE id = $1", [campaign_id]);
      if (!c) return ok({ refused: true, reason: "no such campaign" });
      if (part === "resume") {
        const r = await renderResume(c.resume_variant as Variant);
        await setSetting(`postman_asset:${r.filename}`, sha(r.pdf));
        return ok({ filename: r.filename, mimeType: "application/pdf", bytes: r.pdf.length, sha256: sha(r.pdf), save_to: `/mnt/user-data/outputs/jamie/${r.filename}`, base64: r.pdf.toString("base64") });
      }
      try {
        const res = await fetch(THUMBNAIL_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        await setSetting(`postman_asset:${THUMBNAIL_FILE}`, sha(buf));
        return ok({ filename: THUMBNAIL_FILE, mimeType: res.headers.get("content-type") ?? "image/png", bytes: buf.length, sha256: sha(buf), save_to: `/mnt/user-data/outputs/jamie/${THUMBNAIL_FILE}`, base64: buf.toString("base64") });
      } catch (e: any) {
        return ok({ refused: true, reason: `thumbnail fetch failed (${e.message})`, fallback: "Screenshot the top of https://vishwamehta.vercel.app/ in Chrome (1000x600), save it as the thumbnail file, and show Vishwa before sending." });
      }
    }
  );

  server.registerTool("jamie_postman_gmail_check", {
    description: "Verify Postman's production Gmail connection and sender with a read-only Gmail profile request.",
    inputSchema: {},
  }, async () => {
    try {
      const { sender } = await postmanMailbox();
      return ok({ connected: true, sender });
    } catch (error) {
      return ok({ connected: false, reason: error instanceof Error ? error.message : "Gmail connection failed" });
    }
  });

  server.registerTool("jamie_postman_reconcile", {
    description: "Check Sent mail for an interrupted dispatch and log a matching Gmail message. Never sends or retries.",
    inputSchema: { person_id: z.number().int() },
  }, async ({ person_id }) => {
    const p = await one("SELECT * FROM postman_people WHERE id = $1 AND status = 'dispatching'", [person_id]);
    if (!p) return ok({ refused: true, reason: "No pending dispatch for this person" });
    const { token } = await postmanMailbox();
    const query = encodeURIComponent(`in:sent rfc822msgid:${postmanMessageId(p.id, p.sha256)}`);
    const result = await gmail(token, `messages?maxResults=2&q=${query}`);
    if (result.status !== 200 || !result.json) throw new Error(`Gmail Sent lookup failed (HTTP ${result.status})`);
    const messages = result.json.messages ?? [];
    if (messages.length !== 1) return ok({ pending: true, matches: messages.length, reason: "Gmail has not returned a unique match. Leave this dispatch on hold." });
    return ok(await logPostmanDispatch(p.campaign_id, p, messages[0].id, messages[0].threadId));
  });

  server.registerTool("jamie_postman_check_bounces", {
    description: "Check Gmail delivery failures for a campaign's sent mail at the existing 1h and 24h checkpoints.",
    inputSchema: { campaign_id: z.number().int() },
  }, async ({ campaign_id }) => ok({ checked: await checkPostmanBounces(campaign_id) }));

  server.registerTool(
    "jamie_postman_next",
    {
      description: "Postman: the next email allowed to go out now, with its exact payload (to, subject, htmlBody, body, attachment order). Code enforces approval, the canary wave, bounce stops, the daily Gmail ceiling, Jamie's guardrails and pacing. Use send_via_gmail to send and log it in code. The default returns the legacy Gmail payload.",
      inputSchema: { campaign_id: z.number().int(), send_via_gmail: z.boolean().optional() },
    },
    async ({ campaign_id, send_via_gmail }) => {
      const c = await one("SELECT * FROM postman_campaigns WHERE id = $1", [campaign_id]);
      if (!c) return ok({ refused: true, reason: "no such campaign" });
      if (!["approved", "sending"].includes(c.status)) return ok({ stop: true, reason: `campaign is ${c.status}${c.stop_reason ? `: ${c.stop_reason}` : ""}` });
      const pending = await one("SELECT id FROM postman_people WHERE status = 'dispatching' LIMIT 1");
      if (pending) return ok({ wait: true, person_id: pending.id, reason: "A Gmail dispatch is pending; use jamie_postman_reconcile if the dispatch was interrupted." });
      if (send_via_gmail) await checkPostmanBounces(campaign_id);
      await syncBounces(campaign_id);
      const stop = async (why: string, status = "needs_vishwa") => {
        await q("UPDATE postman_campaigns SET status = $2, stop_reason = $3, updated_at = now() WHERE id = $1", [campaign_id, status, why]);
        return ok({ stop: true, tell_vishwa: why });
      };

      // 3 bounces in a row anywhere: stop all outreach (Vishwa, Nov 4 2026).
      const streak = await bounceStreakStop();
      if (streak) return stop(streak);

      // Canary bounced: the guessed pattern is probably wrong. Re-guess the rest and send back for approval.
      const wave1 = (await q("SELECT pp.*, s.checked_1h, s.bounced FROM postman_people pp LEFT JOIN sends s ON s.id = pp.send_id WHERE pp.campaign_id = $1 AND pp.wave = 1 AND pp.email_source = 'guessed'", [campaign_id])) as any[];
      const canaryBounced = wave1.filter((p) => p.bounced);
      if (canaryBounced.length && c.domain) {
        const bad = canaryBounced[0].pattern;
        await q("UPDATE email_patterns SET pattern = $2, status = 'wrong', updated_at = now() WHERE domain = $1 AND status <> 'confirmed'", [c.domain, bad]);
        // Retire this canary round so it is not counted again.
        await q("UPDATE postman_people SET wave = 0 WHERE campaign_id = $1 AND wave = 1 AND status IN ('sent','bounced')", [campaign_id]);
        const tried = ((await q("SELECT DISTINCT pattern FROM postman_people WHERE campaign_id = $1 AND status = 'bounced' AND pattern IS NOT NULL", [campaign_id])) as any[]).map((r) => r.pattern);
        const maxPatterns = Number((await getSetting("max_patterns_per_person")) ?? 2);
        const rest = (await q("SELECT * FROM postman_people WHERE campaign_id = $1 AND status = 'approved' AND email_source = 'guessed' ORDER BY score DESC, id", [campaign_id])) as any[];
        if (tried.length >= maxPatterns) {
          await q("UPDATE postman_people SET status = 'picked' WHERE campaign_id = $1 AND status = 'approved' AND email_source = 'guessed'", [campaign_id]);
          return stop(`${tried.join(" and ")} both bounced at ${c.domain}. ${rest.length} unsent emails are on hold. Vishwa decides: find public evidence of the format, or stop this campaign.`);
        }
        const next = COMMON.find((x) => !tried.includes(x))!;
        const canarySize = Number((await getSetting("postman_canary_size")) ?? 3);
        let i = 0;
        for (const p of rest) {
          const email = applyPattern(next, p.first_name, p.last_name, c.domain);
          const r = renderEmail({ first: p.first_name, role: c.role, company: c.company, cta: p.cta, to: email });
          await q("UPDATE postman_people SET status = 'picked', email = $2, pattern = $3, wave = $4, sha256 = $5, html = $6, body = $7, reason = concat_ws('; ', reason, 'address changed after canary bounce') WHERE id = $1",
            [p.id, email, next, i++ < canarySize ? 1 : 2, r.sha256, r.html, r.body]);
          await q("UPDATE contacts SET email = $2, email_confidence = 'low', updated_at = now() WHERE id = $1", [p.contact_id, email]);
        }
        await q("UPDATE postman_campaigns SET status = 'needs_vishwa', stop_reason = $2, updated_at = now() WHERE id = $1", [campaign_id, `${bad} bounced; ${rest.length} unsent re-guessed as ${next}`]);
        return ok({ stop: true, tell_vishwa: `${canaryBounced.length} canary email(s) at ${c.company} bounced, so ${bad}@${c.domain} looks wrong. The ${rest.length} unsent addresses were switched to ${next}@${c.domain} (new canary first). Show her jamie_postman_status; on her yes, jamie_postman_approve. Each bounced person still gets one Apollo lookup through the normal bounce flow.` });
      }

      const ceiling = Number((await getSetting("postman_gmail_daily_ceiling")) ?? 450);
      if ((await sentTodayAll()) >= ceiling) return ok({ wait: true, reason: `${ceiling} emails in the last 24 hours (Gmail personal accounts lock at about 500). Resume tomorrow.` });

      const last = await one("SELECT max(s.sent_at) t FROM sends s JOIN postman_people pp ON pp.send_id = s.id WHERE pp.campaign_id = $1", [campaign_id]);
      const gap = Number((await getSetting("postman_min_gap_seconds")) ?? 20);
      if (last?.t) {
        const ago = (Date.now() - new Date(last.t).getTime()) / 1000;
        if (ago < gap) return ok({ wait: true, wait_seconds: Math.ceil(gap - ago), reason: "pacing between sends" });
      }

      const wave1Clear = wave1.filter((p) => !['skipped', 'dropped'].includes(p.status)).every((p) => p.status === "sent" && p.checked_1h && !p.bounced);
      const candidates = (await q(
        `SELECT * FROM postman_people WHERE campaign_id = $1 AND status = 'approved' AND ($2::boolean OR wave = 1) ORDER BY wave, score DESC, id`,
        [campaign_id, wave1Clear || !wave1.length]
      )) as any[];
      for (const p of candidates) {
        const g = await guardrailStatus(p.contact_id);
        if (!g.can_send) {
          await q("UPDATE postman_people SET status = 'skipped', reason = concat_ws('; ', reason, $2::text) WHERE id = $1", [p.id, g.blocks.join(" ")]);
          continue;
        }
        if (send_via_gmail) {
          const prior = await one("SELECT id FROM sends WHERE contact_id = $1 OR lower(to_email) = lower($2) LIMIT 1", [p.contact_id, p.email]);
          if (prior) {
            await q("UPDATE postman_people SET status = 'skipped', reason = 'Already contacted' WHERE id = $1 AND status = 'approved'", [p.id]);
            continue;
          }
          return sendPostmanEmail(c, p);
        }
        const resumeFile = RESUME_FILES[c.resume_variant as Variant];
        const thumbSha = (await getSetting<string>(`postman_asset:${THUMBNAIL_FILE}`)) ?? "<thumbnail sha256 from jamie_postman_assets>";
        const resumeSha = (await getSetting<string>(`postman_asset:${resumeFile}`)) ?? "<resume sha256 from jamie_postman_assets>";
        return ok({
          person_id: p.id, name: p.name, wave: p.wave, sha256: p.sha256, warnings: g.warnings,
          gmail_send_message: {
            to: [p.email], subject: p.subject, htmlBody: p.html, body: p.body,
            attachments: [
              { content: `sha256:${thumbSha}:/mnt/user-data/outputs/jamie/${THUMBNAIL_FILE}`, filename: THUMBNAIL_FILE, mimeType: "image/png", inline: true },
              { content: `sha256:${resumeSha}:/mnt/user-data/outputs/jamie/${resumeFile}`, filename: resumeFile, mimeType: "application/pdf" },
            ],
          },
          rule: "Send exactly this. Thumbnail must stay first (it is cid:att0). Do not edit any text. If the file's sha256 on disk differs, call jamie_postman_assets again.",
        });
      }
      const left = await one("SELECT count(*)::int n FROM postman_people WHERE campaign_id = $1 AND status = 'approved'", [campaign_id]);
      if (left.n > 0) {
        const due = wave1.filter((p) => p.status === "sent" && !p.checked_1h).map((p) => p.send_id);
        return ok({ wait: true, reason: `Wave 2 (${left.n} emails) waits for the canaries' 1 hour bounce check.`, canary_send_ids_to_check: due, how: "After 1 hour: search Gmail for bounces to those addresses, then jamie_mark_bounce_checked or jamie_record_bounce, then call jamie_postman_next again. Start other campaigns meanwhile." });
      }
      await q("UPDATE postman_campaigns SET status = 'done', updated_at = now() WHERE id = $1", [campaign_id]);
      return ok({ done: true, counts: await counts(campaign_id), next: "Bounce checks at 1h and 24h for every send (jamie_start_session lists them)." });
    }
  );

  server.registerTool(
    "jamie_postman_sent",
    {
      description: "Postman: log an email right after Gmail sent it. Pass the sha256 from jamie_postman_next; code refuses if it doesn't match the approved text.",
      inputSchema: { person_id: z.number().int(), sha256: z.string(), gmail_message_id: z.string(), gmail_thread_id: z.string().optional() },
    },
    async ({ person_id, sha256, gmail_message_id, gmail_thread_id }) => {
      const p = await one("SELECT * FROM postman_people WHERE id = $1", [person_id]);
      if (!p) return ok({ refused: true, reason: "no such person" });
      if (p.status !== "approved") return ok({ refused: true, reason: `person is ${p.status}, not approved to send` });
      if (p.sha256 !== sha256) return ok({ refused: true, reason: "sha256 does not match the approved email. Tell Vishwa exactly what was sent." });
      const s = await one("INSERT INTO sends (contact_id, to_email, subject, gmail_message_id, gmail_thread_id) VALUES ($1,$2,$3,$4,$5) RETURNING id, sent_at",
        [p.contact_id, p.email, p.subject, gmail_message_id, gmail_thread_id ?? null]);
      await q("UPDATE contacts SET status = 'sent', updated_at = now() WHERE id = $1", [p.contact_id]);
      await q("UPDATE postman_people SET status = 'sent', send_id = $2, updated_at = now() WHERE id = $1", [person_id, s.id]);
      await q("UPDATE postman_campaigns SET status = 'sending', updated_at = now() WHERE id = $1 AND status = 'approved'", [p.campaign_id]);
      return ok({ logged: s, counts: await counts(p.campaign_id), next: "jamie_postman_next" });
    }
  );

  server.registerTool(
    "jamie_postman_status",
    {
      description: "Postman: one campaign's people and progress, or every open campaign if no id. Use it to show Vishwa where outreach stands.",
      inputSchema: { campaign_id: z.number().int().optional() },
    },
    async ({ campaign_id }) => {
      if (!campaign_id) return ok(await postmanStatus());
      await syncBounces(campaign_id);
      const c = await one("SELECT * FROM postman_campaigns WHERE id = $1", [campaign_id]);
      if (!c) return ok({ refused: true, reason: "no such campaign" });
      const people = await q("SELECT id, name, title, location, bucket, score, cta, email, email_confidence, wave, status, reason FROM postman_people WHERE campaign_id = $1 AND status <> 'candidate' ORDER BY wave NULLS LAST, score DESC", [campaign_id]);
      return ok({ campaign: { id: c.id, company: c.company, role: c.role, domain: c.domain, status: c.status, stop_reason: c.stop_reason, approved_at: c.approved_at }, counts: await counts(campaign_id), people });
    }
  );

  server.registerTool(
    "jamie_postman_stop",
    {
      description: "Postman: stop a campaign (Vishwa says stop, or the job closed). Unsent emails are never sent.",
      inputSchema: { campaign_id: z.number().int(), reason: z.string() },
    },
    async ({ campaign_id, reason }) => {
      await q("UPDATE postman_people SET status = 'dropped', reason = concat_ws('; ', reason, $2::text) WHERE campaign_id = $1 AND status IN ('candidate','picked','approved')", [campaign_id, `stopped: ${reason}`]);
      return ok(await one("UPDATE postman_campaigns SET status = 'stopped', stop_reason = $2, updated_at = now() WHERE id = $1 RETURNING id, company, role, status", [campaign_id, reason]));
    }
  );
}
