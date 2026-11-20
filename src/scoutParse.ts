// Deterministic extraction for Scout. No LLM: regexes, dictionaries and templates.

export function htmlToText(html: string): string {
  if (!html) return "";
  const decoded = html
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  return decoded
    .replace(/<(br|\/p|\/li|\/h\d|\/div)\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

const WORD_NUMS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15,
};
const NUM = "(\\d{1,2}|zero|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen)";
const toNum = (s: string) => (/^\d+$/.test(s) ? Number(s) : WORD_NUMS[s.toLowerCase()]);

/**
 * Lowest number of years of experience the posting asks for, with the sentence it came from.
 * Ranges ("2-4 years") return the lower bound. Returns null when no experience requirement is stated.
 */
export function extractYears(text: string): { min: number; quote: string } | null {
  if (!text) return null;
  const sentences = text.split(/(?<=[.;!?\n])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const range = new RegExp(`\\b${NUM}\\s*(?:\\+|plus)?\\s*(?:-|–|—|to)\\s*${NUM}\\s*\\+?\\s*(?:years?|yrs?)`, "i");
  const single = new RegExp(`(?:at least|minimum(?: of)?|min\\.?|over|more than)?\\s*\\b${NUM}\\s*(?:\\+|plus)?\\s*(?:years?|yrs?)`, "i");
  let best: { min: number; quote: string } | null = null;
  for (const s of sentences) {
    if (!/experience|exp\b|background|track record|working|in (?:a|an) /i.test(s)) continue;
    if (/years? old|years? ago|year[- ]round|per year|a year\b|\/year|annual|years? of (?:age|funding|growth|operation|history)|company|founded|in business/i.test(s) && !/experience/i.test(s)) continue;
    const r = s.match(range);
    const m = r ?? s.match(single);
    if (!m) continue;
    const n = toNum(m[1]);
    if (n === undefined || n > 25) continue;
    if (!best || n < best.min) best = { min: n, quote: s.slice(0, 240) };
  }
  return best;
}

// Skill dictionary: canonical name -> aliases (lowercase, matched on word boundaries)
export const SKILLS: Record<string, string[]> = {
  python: ["python"], sql: ["sql"], typescript: ["typescript"], javascript: ["javascript", "node.js", "nodejs"],
  react: ["react", "react.js", "next.js", "nextjs"], go: ["golang"], java: ["java"], r: ["r programming", "rstudio"],
  pandas: ["pandas"], numpy: ["numpy"], pyspark: ["pyspark", "spark"], dbt: ["dbt"], airflow: ["airflow"],
  llm: ["llm", "llms", "large language model", "large language models", "genai", "generative ai", "gen ai"],
  rag: ["rag", "retrieval augmented", "retrieval-augmented"], "prompt engineering": ["prompt engineering", "prompt design", "prompting"],
  agents: ["ai agent", "ai agents", "agentic", "autonomous agent", "agent workflows", "multi-agent"],
  mcp: ["mcp", "model context protocol"], "tool calling": ["tool calling", "tool use", "function calling"],
  "llm evaluation": ["evals", "llm evaluation", "evaluation frameworks", "model evaluation"],
  embeddings: ["embeddings", "embedding"], "vector databases": ["vector database", "vector databases", "vector db", "vector search", "semantic search"],
  pinecone: ["pinecone"], pgvector: ["pgvector"], weaviate: ["weaviate"], qdrant: ["qdrant"], elasticsearch: ["elasticsearch"],
  langchain: ["langchain"], langgraph: ["langgraph"], llamaindex: ["llamaindex", "llama index"],
  openai: ["openai", "gpt-4", "gpt-5", "chatgpt"], claude: ["claude", "anthropic"], gemini: ["gemini"],
  "fine-tuning": ["fine-tuning", "fine tuning", "finetuning"], pytorch: ["pytorch"], tensorflow: ["tensorflow"],
  "machine learning": ["machine learning"], nlp: ["nlp", "natural language processing"],
  aws: ["aws", "amazon web services"], gcp: ["gcp", "google cloud"], azure: ["azure"], docker: ["docker"], kubernetes: ["kubernetes", "k8s"],
  terraform: ["terraform"], "ci/cd": ["ci/cd", "github actions"], linux: ["linux"],
  "rest apis": ["rest api", "rest apis", "restful", "api integration", "api integrations", "apis"], graphql: ["graphql"],
  fastapi: ["fastapi"], flask: ["flask"], django: ["django"], postgres: ["postgres", "postgresql"], mongodb: ["mongodb"],
  snowflake: ["snowflake"], bigquery: ["bigquery"], redshift: ["redshift"], supabase: ["supabase"], vercel: ["vercel"],
  tableau: ["tableau"], "power bi": ["power bi", "powerbi"], looker: ["looker"], excel: ["excel"],
  salesforce: ["salesforce"], hubspot: ["hubspot"], clay: ["clay"], zapier: ["zapier"], n8n: ["n8n"], make: ["make.com"],
  apollo: ["apollo.io"], outreach: ["outreach.io"], segment: ["segment"],
  "gtm automation": ["gtm automation", "go-to-market automation", "revops", "revenue operations", "sales automation"],
  "customer facing": ["customer-facing", "customer facing", "client-facing", "client facing"],
  "solutions engineering": ["solutions engineering", "pre-sales", "presales", "sales engineering"],
  "technical writing": ["technical writing", "documentation"], "product management": ["product management", "roadmap"],
  "data analysis": ["data analysis", "analytics", "data analytics"], etl: ["etl", "elt", "data pipeline", "data pipelines"],
  jira: ["jira"], agile: ["agile", "scrum"], streamlit: ["streamlit"], "a/b testing": ["a/b testing", "experimentation"],
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const SKILL_RES: [string, RegExp][] = Object.entries(SKILLS).map(([k, aliases]) => [
  k,
  new RegExp(`(?<![a-z0-9])(?:${aliases.map(escapeRe).join("|")})(?![a-z0-9])`, "i"),
]);

export function extractSkills(text: string): string[] {
  if (!text) return [];
  return SKILL_RES.filter(([, re]) => re.test(text)).map(([k]) => k);
}

export function detectCsDegree(text: string): { required: boolean; mentioned: boolean; quote?: string } {
  const re = /(bachelor'?s|master'?s|b\.?s\.?|m\.?s\.?|degree)[^.\n]{0,60}(computer science|\bcs\b|software engineering|computer engineering)[^.\n]*/i;
  const m = text.match(re);
  if (!m) return { required: false, mentioned: false };
  const quote = m[0].slice(0, 200);
  const softened = /or (an? )?(equivalent|related|similar|comparable)|or relevant|or practical|equivalent (practical |work )?experience|preferred|nice to have|bonus|plus\b/i.test(quote);
  return { required: !softened, mentioned: true, quote };
}

// Target title families. Rating 0-5 for how close the title is to what Vishwa wants.
const TITLE_RULES: [RegExp, number, string][] = [
  [/forward[- ]deployed/i, 5, "Forward Deployed"],
  [/agent (deployment|engineer)|ai agent|agentic|agents?\b.*engineer/i, 5, "AI Agents"],
  [/\b(ai|applied ai|genai|llm) (engineer|developer|specialist)|applied ai/i, 5, "AI Engineer"],
  [/\bgtm\b|go[- ]to[- ]market (engineer|automation)|growth engineer|revops engineer/i, 5, "GTM Engineer"],
  [/deployment (strategist|engineer|manager|lead)|ai deployment/i, 5, "Deployment"],
  [/associate product manager|\bapm\b/i, 5, "Associate PM"],
  [/solutions? (engineer|architect|consultant|strategist)|sales engineer|value engineer/i, 4, "Solutions"],
  [/\bai\b.*(strategist|consultant|analyst|specialist|operations|enablement|automation)|automation engineer/i, 4, "AI Ops"],
  [/implementation (engineer|specialist|consultant|manager)|integration engineer|onboarding engineer/i, 3, "Implementation"],
  [/(technical|product) support engineer|support engineer|customer (success|support) engineer|technical account manager/i, 3, "Technical Support"],
  [/product (manager|owner)|product operations/i, 3, "Product"],
  [/data analyst|business intelligence|bi analyst|analytics engineer/i, 2, "Data"],
];

export function titleMatch(title: string): { rating: number; family: string | null } {
  for (const [re, rating, family] of TITLE_RULES) if (re.test(title)) return { rating, family };
  return { rating: 0, family: null };
}

export function isSweFocused(title: string): boolean {
  return /\b(software|backend|back-end|frontend|front-end|full[- ]?stack|platform|infrastructure|devops|site reliability|sre|mobile|ios|android|firmware|embedded) (engineer|developer)\b|\bswe\b/i.test(title)
    && !/\b(ai|ml|llm|agents?|agentic|forward[- ]deployed|solutions|gtm|growth|deployment|support|integrations?|automation)\b/i.test(title);
}

export function isSeniorTitle(title: string): boolean {
  return /\b(senior|sr\.?|staff|principal|lead|director|head of|vp|vice president|chief|manager ii|iii|iv)\b/i.test(title)
    && !/associate product manager|product manager i\b/i.test(title);
}

const AGENCY_NAMES = /staffing|recruit|talent (partners|solutions|group)|search (partners|group)|consulting group|placement|headhunt|jobgether|dice\b|cybercoders|robert half|teksystems|insight global|randstad|adecco|kforce|hired\b|crossover|toptal|motion recruitment|harnham|tenth revolution|franklin fitch|intellipro|lorven|emonics|clarity recruiting|wedoe/i;
export function detectAgency(company: string, text: string): boolean {
  return AGENCY_NAMES.test(company) || /\b(our client|on behalf of (a|our) client|for a client of ours|we are partnering with|client of ours)\b/i.test(text);
}

const NON_US = /\b(london|united kingdom|\buk\b|england|ireland|dublin|india|bangalore|bengaluru|hyderabad|pune|mumbai|delhi|noida|gurgaon|chennai|canada|toronto|vancouver|montreal|germany|berlin|munich|france|paris|netherlands|amsterdam|spain|madrid|barcelona|portugal|lisbon|poland|warsaw|krakow|europe|emea|apac|latam|singapore|australia|sydney|melbourne|japan|tokyo|israel|tel aviv|mexico|brazil|sao paulo|argentina|colombia|philippines|manila|sweden|stockholm|switzerland|zurich|italy|milan|romania|ukraine|czech|prague|denmark|copenhagen|finland|norway|oslo|belgium|austria|vienna|korea|seoul|china|hong kong|taiwan|vietnam|indonesia|malaysia|south africa|nigeria|kenya|egypt|uae|dubai|saudi|turkey|istanbul|new zealand)\b/i;
const US = /\b(united states|\busa?\b|u\.s\.|remote[ ,-]*(us|usa|united states|north america)|[A-Z][a-z]+,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b|san francisco|new york|seattle|bay area|austin|boston|chicago|los angeles|denver)/i;
export function isOutsideUS(location?: string | null): boolean {
  if (!location) return false;
  return NON_US.test(location) && !US.test(location);
}

export function extractSalary(text: string): { min: number; max: number } | null {
  const m = text.match(/\$\s?(\d{2,3}(?:\.\d)?\s?[kK]\b|\d{2,3}(?:,\d{3})?)\s*(?:-|–|—|to)\s*\$?\s?(\d{2,3}(?:\.\d)?\s?[kK]\b|\d{2,3}(?:,\d{3})?)/);
  if (!m) return null;
  const val = (s: string) => {
    const t = s.replace(/[\s,$]/g, "");
    return /k$/i.test(t) ? Math.round(parseFloat(t) * 1000) : Number(t);
  };
  const min = val(m[1]), max = val(m[2]);
  if (min < 20000 || max < min || max > 1_000_000) return null;
  return { min, max };
}

/** Parse LinkedIn's posted label from page text, e.g. "Reposted 3 days ago", "14 hours ago". */
export function parseLinkedInPosted(pageText: string, now = Date.now()): { postedAt: string | null; isRepost: boolean | null; proof: string | null } {
  if (!pageText) return { postedAt: null, isRepost: null, proof: null };
  const m = pageText.match(/(Reposted\s+)?(\d+|an?|one)\s+(minute|hour|day|week|month)s?\s+ago/i);
  if (!m) return { postedAt: null, isRepost: /\breposted\b/i.test(pageText) ? true : null, proof: null };
  const n = /^\d+$/.test(m[2]) ? Number(m[2]) : 1;
  const unitMs: Record<string, number> = { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000, month: 2_592_000_000 };
  const postedAt = new Date(now - n * unitMs[m[3].toLowerCase()]).toISOString();
  const isRepost = !!m[1] || /\breposted\b/i.test(pageText);
  return { postedAt, isRepost, proof: isRepost ? `LinkedIn label: "${m[0]}"` : `LinkedIn label: "${m[0]}", no Reposted label on the page` };
}

export function fitReason(p: {
  family: string | null; skillsMatched: string[]; skillsTotal: number; location?: string | null; workMode?: string | null;
  minYears?: number | null; preferBelow: number; agency: boolean; source: string;
}): string {
  const parts: string[] = [];
  if (p.family) parts.push(`${p.family} role`);
  if (p.skillsMatched.length) parts.push(`uses ${p.skillsMatched.slice(0, 4).join(", ")} (${p.skillsMatched.length} of ${p.skillsTotal} skills you have)`);
  const loc = [p.workMode === "remote" ? "remote" : null, p.location].filter(Boolean).join(", ");
  if (loc) parts.push(loc);
  if (p.minYears !== null && p.minYears !== undefined) parts.push(p.minYears < p.preferBelow ? `asks ${p.minYears}+ yrs` : `asks ${p.minYears}+ yrs (above your preference)`);
  if (p.source === "linkedin_saved") parts.push("you saved it");
  return parts.join(". ") + ".";
}
