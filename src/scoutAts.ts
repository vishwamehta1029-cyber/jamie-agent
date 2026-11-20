// Reads public job boards (Greenhouse, Lever, Ashby) directly. No auth, no browser, no LLM.
import { htmlToText } from "./scoutParse.js";

export type Ats = "greenhouse" | "lever" | "ashby";

export type Posting = {
  ats: Ats;
  token: string;
  external_id: string;
  title: string;
  url: string;
  location: string | null;
  work_mode: "remote" | "hybrid" | "onsite" | null;
  posted_at: string | null;
  description: string;
  salary_min: number | null;
  salary_max: number | null;
};

/** Find the job board behind a careers or job URL. */
export function detectBoard(url: string): { ats: Ats; token: string } | null {
  if (!url) return null;
  const pats: [RegExp, Ats][] = [
    [/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([A-Za-z0-9_-]+)/i, "greenhouse"],
    [/boards-api\.greenhouse\.io\/v1\/boards\/([A-Za-z0-9_-]+)/i, "greenhouse"],
    [/jobs(?:\.eu)?\.lever\.co\/([A-Za-z0-9_.-]+)/i, "lever"],
    [/api(?:\.eu)?\.lever\.co\/v0\/postings\/([A-Za-z0-9_.-]+)/i, "lever"],
    [/jobs\.ashbyhq\.com\/([A-Za-z0-9_.%-]+)/i, "ashby"],
    [/api\.ashbyhq\.com\/posting-api\/job-board\/([A-Za-z0-9_.%-]+)/i, "ashby"],
  ];
  for (const [re, ats] of pats) {
    const m = url.match(re);
    if (m && m[1] && m[1] !== "embed") return { ats, token: decodeURIComponent(m[1]) };
  }
  return null;
}

async function getJson(url: string, timeoutMs = 6000): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json", "user-agent": "jamie-scout/1.0" } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const mode = (s?: string | null, remoteFlag?: boolean): Posting["work_mode"] => {
  const v = `${s ?? ""}`.toLowerCase();
  if (remoteFlag || /remote/.test(v)) return "remote";
  if (/hybrid/.test(v)) return "hybrid";
  if (/on-?site|in[- ]office/.test(v)) return "onsite";
  return null;
};

export async function fetchBoard(ats: Ats, token: string): Promise<Posting[] | null> {
  if (ats === "greenhouse") {
    const d = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`);
    if (!d || !Array.isArray(d.jobs)) return null;
    return d.jobs.map((j: any): Posting => {
      const description = htmlToText(j.content ?? "");
      return {
        ats, token, external_id: String(j.id), title: String(j.title ?? "").trim(), url: j.absolute_url,
        location: j.location?.name ?? null, work_mode: mode(j.location?.name),
        posted_at: j.first_published ?? j.updated_at ?? null, description, salary_min: null, salary_max: null,
      };
    });
  }
  if (ats === "lever") {
    let d = await getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`);
    if (!Array.isArray(d) || !d.length) {
      const eu = await getJson(`https://api.eu.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`);
      if (Array.isArray(eu)) d = eu;
    }
    if (!Array.isArray(d)) return null;
    return d.map((j: any): Posting => {
      const lists = (j.lists ?? []).map((l: any) => `${l.text}\n${htmlToText(l.content ?? "")}`).join("\n");
      const description = [j.descriptionPlain, lists, j.additionalPlain].filter(Boolean).join("\n");
      const created = typeof j.createdAt === "number" ? new Date(j.createdAt).toISOString() : j.createdAt ?? null;
      return {
        ats, token, external_id: String(j.id), title: String(j.text ?? "").trim(), url: j.hostedUrl,
        location: j.categories?.location ?? null, work_mode: mode(j.workplaceType ?? j.categories?.location),
        posted_at: created, description,
        salary_min: j.salaryRange?.min ?? null, salary_max: j.salaryRange?.max ?? null,
      };
    });
  }
  const d = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=true`);
  if (!d || !Array.isArray(d.jobs)) return null;
  return d.jobs
    .filter((j: any) => j.isListed !== false)
    .map((j: any): Posting => {
      const comp = (j.compensation?.summaryComponents ?? j.compensation?.compensationTiers?.[0]?.components ?? [])
        .find((c: any) => /salary/i.test(c.compensationType ?? ""));
      return {
        ats, token, external_id: String(j.id), title: String(j.title ?? "").trim(), url: j.jobUrl ?? j.applyUrl,
        location: j.location ?? j.address?.postalAddress?.addressLocality ?? null, work_mode: mode(j.workplaceType, j.isRemote),
        posted_at: j.publishedAt ?? null, description: j.descriptionPlain ?? htmlToText(j.descriptionHtml ?? ""),
        salary_min: comp?.minValue ?? null, salary_max: comp?.maxValue ?? null,
      };
    });
}

/** Guess a company's job board from its name by trying likely slugs on each ATS. */
export async function probeCompany(company: string): Promise<{ ats: Ats; token: string; jobs: number } | null> {
  const base = company.toLowerCase().replace(/\b(inc|llc|ltd|corp|corporation|co|ai|labs|technologies|technology|hq)\b\.?/g, " ").trim();
  const words = base.replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  const full = company.toLowerCase().replace(/[^a-z0-9]/g, "");
  const slugs = Array.from(new Set([full, words.join(""), words.join("-"), words[0], `${words.join("")}ai`, `${words.join("")}hq`].filter((s) => s && s.length > 1)));
  for (const slug of slugs) {
    for (const ats of ["ashby", "greenhouse", "lever"] as Ats[]) {
      const jobs = await fetchBoard(ats, slug);
      if (jobs && jobs.length) return { ats, token: slug, jobs: jobs.length };
    }
  }
  return null;
}
