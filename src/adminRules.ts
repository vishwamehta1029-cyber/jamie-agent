// Administrator rules: every factual application answer, the resume pick, the salary rule and the
// honesty checks for written answers live here as plain code. Each standard answer cites the brain
// facts it comes from; if one of those facts is retired, that field stops auto-filling.
import { resumeType } from "./scout.js";
import { extractSalary } from "./scoutParse.js";

export type Variant = "fde" | "ai_engineer" | "gtm";
export const RESUME_FILES: Record<Variant, string> = {
  fde: "Vishwa_Mehta_Resume_FDE.pdf",
  ai_engineer: "Vishwa_Mehta_Resume_AI_Engineer.pdf",
  gtm: "Vishwa_Mehta_Resume_GTM.pdf",
};

/** Resume by role title first, then by which kind of work the job description talks about most. Never asks. */
export function pickVariant(role: string, jd = ""): { variant: Variant; why: string } {
  const byTitle = resumeType(role);
  if (byTitle !== "ask") return { variant: byTitle, why: `title "${role}"` };
  const t = jd.toLowerCase();
  const count = (re: RegExp) => (t.match(re) || []).length;
  const scores: Record<Variant, number> = {
    gtm: count(/\bgtm\b|go-to-market|outbound|pipeline|revops|crm|hubspot|salesforce|clay|marketing|demand gen/g),
    fde: count(/customer|deploy|implementation|integration|stakeholder|solutions?|onboarding|client/g),
    ai_engineer: count(/\bllm|\brag\b|agent|model|embedding|fine-tun|pytorch|evaluation|inference|machine learning/g),
  };
  const best = (Object.entries(scores) as [Variant, number][]).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? { variant: best[0], why: `job description leans ${best[0]} (${best[1]} mentions)` } : { variant: "fde", why: "no clear signal, FDE is the broadest" };
}

/** Salary rule (fact 164): $120,000 if inside the posted range, else the midpoint, else $100,000. */
export function salaryFor(jd = "", range?: { min: number; max: number } | null): { value: number; why: string } {
  const r = range ?? extractSalary(jd);
  if (!r) return { value: 100000, why: "no range posted" };
  if (r.min <= 120000 && 120000 <= r.max) return { value: 120000, why: `inside $${r.min}-$${r.max}` };
  return { value: Math.round((r.min + r.max) / 2), why: `midpoint of $${r.min}-$${r.max}` };
}

export type Ctx = { jd?: string; salaryRange?: { min: number; max: number } | null; source?: string; today?: Date };

type Std = { id: string; match: RegExp; not?: RegExp; facts: number[]; value: (c: Ctx) => string; prefer?: string[][] };

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const fmtDate = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;

// Order matters: the first match wins.
export const STANDARD: Std[] = [
  { id: "first_name", match: /\b(first|given|legal first) name\b/i, facts: [1], value: () => "Vishwa" },
  { id: "last_name", match: /\b(last|family|sur) ?name\b/i, facts: [1], value: () => "Mehta" },
  { id: "preferred_name", match: /\bpreferred (first )?name\b/i, facts: [1], value: () => "Vishwa" },
  { id: "full_name", match: /^\s*(full |legal )?name\s*\*?\s*$|\bfull name\b|\bsignature\b/i, facts: [1], value: () => "Vishwa Mehta" },
  { id: "email", match: /e-?mail/i, facts: [24], value: () => "vishwamehta1029@gmail.com" },
  { id: "phone", match: /phone|mobile|cell/i, facts: [25], value: () => "508-654-2959" },
  { id: "linkedin", match: /linkedin/i, facts: [2], value: () => "https://www.linkedin.com/in/vishwa10" },
  { id: "github", match: /github/i, facts: [3], value: () => "https://github.com/vishwamehta1029-cyber" },
  { id: "portfolio", match: /portfolio|personal (web)?site|website|other links?\b|\burl\b/i, facts: [16], value: () => "https://vishwamehta.vercel.app/" },
  { id: "cover_letter", match: /cover letter/i, facts: [111], value: () => "https://vishwamehta.vercel.app/" },
  { id: "demo_video", match: /demo video|video (link|url)|loom/i, facts: [11], value: () => "https://lnkd.in/p/gUpQaAH8" },
  { id: "address", match: /street|address line|mailing address|^\s*address/i, facts: [59], value: () => "130 Boren Ave N" },
  { id: "zip", match: /zip|postal/i, facts: [59], value: () => "98109" },
  { id: "state", match: /^\s*state\b|province|region/i, facts: [59], value: () => "Washington", prefer: [["washington", "wa"]] },
  { id: "country", match: /country/i, not: /citizen/i, facts: [59], value: () => "United States", prefer: [["united states", "usa", "us"]] },
  { id: "location", match: /\b(city|location|where are you (located|based)|current location)\b/i, facts: [4, 26], value: () => "Seattle, WA", prefer: [["seattle"]] },
  { id: "authorized", match: /(legally )?authori[sz]ed to work|eligible to work|right to work|work authori[sz]ation/i, not: /sponsor/i, facts: [110, 137], value: () => "Yes", prefer: [["yes"]] },
  { id: "sponsorship", match: /sponsor|h-?1b|visa/i, facts: [110, 137], value: () => "Yes", prefer: [["yes", "will require", "require"]] },
  { id: "visa_status", match: /(current )?(immigration|visa|work) status|citizenship status/i, facts: [137], value: () => "F-1 OPT (planning STEM OPT)", prefer: [["opt", "f-1", "f1", "student"], ["other"]] },
  { id: "citizen", match: /\bu\.?s\.? citizen|citizen(ship)? of the united states|green card|permanent resident/i, facts: [137], value: () => "No", prefer: [["no"]] },
  { id: "relocate", match: /relocat/i, facts: [9], value: () => "Yes", prefer: [["yes"]] },
  { id: "noncompete", match: /non-?compete|non-?solicit/i, facts: [8], value: () => "No", prefer: [["no"]] },
  { id: "start_date", match: /start date|earliest (date|start)|when can you start|available to start|notice period/i, facts: [6],
    value: (c) => fmtDate(addDays(c.today ?? new Date(), 14)) },
  { id: "salary", match: /salary|compensation|pay expectation|desired pay|expected (base|pay)/i, facts: [164], value: (c) => String(salaryFor(c.jd, c.salaryRange).value) },
  { id: "years_experience", match: /years of (professional |relevant |work )?experience|how many years/i, facts: [10], value: () => "2", prefer: [["2", "1-2", "1 - 2", "2-3"], ["1-3", "0-2"]] },
  { id: "current_company", match: /current (company|employer)|most recent (company|employer)/i, facts: [34], value: () => "Profundity Group" },
  { id: "current_title", match: /current (job )?title|most recent (job )?title/i, facts: [34], value: () => "Forward Deployed Engineer" },
  { id: "school", match: /school|university|college|institution/i, facts: [33], value: () => "University of South Florida", prefer: [["university of south florida", "south florida", "usf"]] },
  { id: "degree", match: /\bdegree\b|level of education|highest education/i, facts: [33], value: () => "Bachelor's", prefer: [["bachelor"]] },
  { id: "discipline", match: /discipline|field of study|major/i, facts: [33], value: () => "Quantitative Economics and Econometrics", prefer: [["econom"], ["mathemat", "statistic"]] },
  { id: "grad_date", match: /graduat/i, facts: [33, 129], value: () => "12/2025", prefer: [["2025"]] },
  { id: "gender", match: /gender|sex\b/i, not: /orientation|identity.*trans/i, facts: [12, 60], value: () => "Female", prefer: [["female", "woman"]] },
  { id: "hispanic", match: /hispanic|latin[oa]/i, facts: [12], value: () => "No", prefer: [["no", "not hispanic"]] },
  { id: "race", match: /race|ethnic/i, facts: [12], value: () => "Asian", prefer: [["south asian"], ["asian"]] },
  { id: "veteran", match: /veteran|military|armed forces/i, facts: [12], value: () => "I am not a protected veteran", prefer: [["not a protected veteran", "not a veteran", "i am not"], ["no"]] },
  { id: "disability", match: /disabilit/i, facts: [12], value: () => "No, I do not have a disability", prefer: [["no, i do not", "do not have", "no"]] },
  { id: "travel", match: /travel/i, facts: [106], value: () => "Yes", prefer: [["yes"]] },
  { id: "time_zones", match: /time ?zones?/i, facts: [106], value: () => "Yes", prefer: [["yes"]] },
  { id: "heard_about", match: /how did you (hear|find|learn)|source|referr(al|ed)/i, not: /referr(ed|al) by|employee name/i, facts: [], value: (c) => c.source ?? "LinkedIn", prefer: [["linkedin"], ["job board", "website", "other"]] },
  { id: "previously_worked", match: /(previously|ever) (worked|been employed|applied)/i, facts: [], value: () => "No", prefer: [["no"]] },
  { id: "age_18", match: /18 years|over 18|at least 18/i, facts: [], value: () => "Yes", prefer: [["yes"]] },
  { id: "privacy_ack", match: /acknowledge|consent to .*privacy|agree to .*privacy|privacy (notice|policy)/i, facts: [], value: () => "Yes", prefer: [["yes", "i acknowledge", "i agree", "agree", "acknowledge"]] },
];

/** Pick the option that best matches what we want. */
export function pickOption(options: string[], value: string, prefer?: string[][]): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const opts = options.map((o) => ({ o, n: norm(o) }));
  for (const tier of [...(prefer ?? []), [norm(value)]]) {
    for (const want of tier) {
      const exact = opts.find((x) => x.n === want);
      if (exact) return exact.o;
      const starts = opts.find((x) => x.n.startsWith(want + " ") || x.n.startsWith(want + ",") || x.n.startsWith(want + "-"));
      if (starts) return starts.o;
      if (want.length > 3) { const inc = opts.find((x) => x.n.includes(want)); if (inc) return inc.o; }
    }
  }
  return null;
}

export type Question = { label: string; type?: string; options?: string[]; required?: boolean; max_chars?: number };
export type Filled = { label: string; value: string; source: string; fact_ids: number[] };

/** Answer one question from the standard table. Returns null when it needs the answer bank or writing. */
export function resolveStandard(qn: Question, ctx: Ctx, activeFacts: Set<number>): Filled | { label: string; blocked: string } | null {
  const label = qn.label.replace(/\s+/g, " ").trim();
  // Long free-text prompts are never standard, even if they mention a keyword
  if ((qn.type === "textarea" || label.length > 140) && !/cover letter/i.test(label)) return null;
  for (const s of STANDARD) {
    if (!s.match.test(label) || (s.not && s.not.test(label))) continue;
    const missing = s.facts.filter((f) => !activeFacts.has(f));
    if (missing.length) return { label, blocked: `${s.id}: brain fact ${missing.join(", ")} was retired; check the brain before answering` };
    let value = s.value(ctx);
    if (s.id === "start_date" && /notice/i.test(label)) value = "2 weeks";
    if (qn.options?.length) {
      const pick = pickOption(qn.options, value, s.prefer);
      if (!pick) {
        if (/^(gender|hispanic|race|veteran|disability)$/.test(s.id)) {
          const decline = pickOption(qn.options, "decline", [["decline", "prefer not", "i don't wish", "choose not"]]);
          if (decline) return { label, value: decline, source: `standard:${s.id} (no exact option, declined)`, fact_ids: s.facts };
        }
        return null;
      }
      value = pick;
    }
    return { label, value, source: `standard:${s.id}`, fact_ids: s.facts };
  }
  return null;
}

/** Numbers with their unit: "54%" -> 54 + %, "3x", "1,000+", "$120K" -> 120000, "1B". Years are ignored. */
export function numberTokens(text: string): { raw: string; base: string; unit: string }[] {
  const out: { raw: string; base: string; unit: string }[] = [];
  for (const m of text.matchAll(/(?<![A-Za-z0-9.])~?\$?(\d[\d,]*(?:\.\d+)?)\s?(%|\+|[kKmMbBxX](?![A-Za-z0-9]))?(?![A-Za-z0-9])/g)) {
    let base = m[1].replace(/,/g, "").replace(/\.0+$/, "");
    let unit = (m[2] ?? "").toLowerCase();
    if (unit === "k") { base = String(Math.round(parseFloat(base) * 1000)); unit = ""; }
    if (!unit && /^(19|20)\d\d$/.test(base)) continue;
    out.push({ raw: m[0].trim(), base, unit });
  }
  return [...new Map(out.map((t) => [t.base + t.unit, t])).values()];
}

/** Code checks on any answer Jamie writes. Problems are fixed before submitting. */
export function checkAnswer(text: string, opts: { brainNumbers: Set<string>; max_chars?: number }): string[] {
  const p: string[] = [];
  if (/—/.test(text)) p.push("contains an em dash");
  if (opts.max_chars && text.length > opts.max_chars) p.push(`over the ${opts.max_chars} character limit (${text.length})`);
  // A number with a unit (54%, 3x, 1,000+) must appear in the brain with that same unit
  const bad = numberTokens(text).filter((t) => !(t.unit ? opts.brainNumbers.has(t.base + t.unit) : opts.brainNumbers.has(t.base))).map((t) => t.raw);
  if (bad.length) p.push(`number(s) ${bad.join(", ")} aren't in Jamie's brain`);
  if (/\b(eager|excited) to learn\b|\bramp(ing)? up\b|\blearning curve\b|\bstill learning\b|\bnew to\b/i.test(text)) p.push("frames learning or ramping up as a challenge");
  if (/\b(senior|lead|head of|principal|staff|director|manager)\b[^.]{0,30}\b(engineer|at profundity|of ai|role)\b/i.test(text) && !/hiring manager/i.test(text)) p.push("may inflate a title; her titles are in the brain");
  if (/\b(as an ai|language model|i'm sorry)\b/i.test(text)) p.push("sounds machine-written");
  return p;
}

/** Where the resume goes on each ATS, and the known stoppers. */
export const ATS_PLAYBOOK: Record<string, { resume: string; notes: string[]; handoff?: string }> = {
  greenhouse: { resume: 'input[type=file] inside the "Resume/CV" block (id often "resume")', notes: ["Cover letter: use the 'Enter manually' option and paste the portfolio link", "Custom questions sit under 'Additional questions'", "EEO block is at the bottom and optional"] },
  lever: { resume: 'input[type=file][name="resume"] ("Attach resume/CV")', notes: ["Lever parses the resume and pre-fills name, email, phone: check them", "'Additional information' is free text; put the portfolio link there"] },
  ashby: { resume: 'input[type=file] under "Resume"', notes: ["Ashby autofills from the resume after upload; wait for it, then overwrite with the standard answers", "Yes/No questions are buttons, not selects"] },
  workday: { resume: "My Experience step, 'Select files'", notes: [], handoff: "Workday needs an account sign-in; hand to Vishwa" },
  icims: { resume: "upload step after sign-in", notes: [], handoff: "iCIMS needs an account; hand to Vishwa" },
  taleo: { resume: "upload step after sign-in", notes: [], handoff: "Taleo needs an account; hand to Vishwa" },
  linkedin: { resume: "Easy Apply 'Upload resume' (input[type=file]); deselect older resumes so only this one is checked", notes: ["Easy Apply keeps answers from past applications: check each prefilled value against the standard answers"] },
  other: { resume: 'the input[type=file] nearest a "Resume" or "CV" label', notes: ["If the form asks to create an account, stop and hand off"] },
};

export function detectAts(url = ""): string {
  const u = url.toLowerCase();
  if (/greenhouse\.io|gh_jid=/.test(u)) return "greenhouse";
  if (/lever\.co/.test(u)) return "lever";
  if (/ashbyhq\.com/.test(u)) return "ashby";
  if (/myworkdayjobs|workday/.test(u)) return "workday";
  if (/icims\.com/.test(u)) return "icims";
  if (/taleo\.net/.test(u)) return "taleo";
  if (/linkedin\.com/.test(u)) return "linkedin";
  return "other";
}

export const normRole = (s: string) => s.toLowerCase().replace(/\(.*?\)|[^a-z0-9 ]/g, " ").replace(/\b(i|ii|iii|sr|jr|senior|junior)\b/g, " ").replace(/\s+/g, " ").trim();
