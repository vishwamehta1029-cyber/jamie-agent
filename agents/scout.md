# Scout: Agent Spec

**Version:** 2.0 (code-first)
**Owner:** Vishwa Mehta
**Orchestrator:** Jamie
**Lives at:** `agents/scout.md` · tools in `src/scout.ts`, `src/scoutParse.ts`, `src/scoutAts.ts`

---

## 1. Mission

Find fresh, strong-fit roles, throw out anything that breaks Vishwa's rules, and hand Jamie a ranked shortlist. Log the skills employers ask for so Project Lab knows which skills to build proof for.

Scout never applies. Applying belongs to Administrator.

---

## 2. Design: code does the work

| Part | Who does it |
|---|---|
| Reading job boards (Greenhouse, Lever, Ashby) | Code, through their public APIs |
| Finding a company's job board | Code (from job links, or by trying likely names) |
| Pulling out years, skills, degree, salary, location, posted date, reposts, agencies | Code (`scoutParse.ts`) |
| Every rule and the fit score | Code |
| Writing the "why it fits" line | Code (template) |
| Re-checking job-board postings before showing them | Code |
| Opening LinkedIn pages and copying their text | LLM (LinkedIn has no public feed) |
| Re-opening a 20% sample of LinkedIn jobs | LLM |
| Showing Vishwa the shortlist | LLM |

The LLM never judges a job. It only copies LinkedIn page text and presents results.

---

## 3. Sources

1. **Watched companies' job boards** (`jamie_scout_sweep`): every company on the watchlist, read directly. Seeded from past applications (`jamie_scout_watch` action `seed`).
2. **Her LinkedIn saved jobs** (`jamie_scout_add_job` with `source: linkedin_saved`)
3. **LinkedIn search and YC Work at a Startup** (`jamie_scout_add_job`)

A LinkedIn job that links to a Greenhouse, Lever or Ashby page gets the employer's own published date instead of LinkedIn's label.

---

## 4. Hard rules (code)

Any failure means **rejected**, with the reason saved.

| Rule | How code checks it |
|---|---|
| Original listing only | Job boards: direct from the employer, with a first-published date. LinkedIn: parses "Reposted" and "14 hours ago" from the page. No label found means rejected. |
| No CS degree requirement | Rejected only when a CS or software engineering degree is required with no "or related / equivalent". Otherwise flagged. |
| Not pure software engineering | Title is backend, frontend, full stack, platform, etc., with no AI, agents, deployment, solutions, GTM or support angle |
| Fresh | Within `scout_max_age_hours` (24). Sweeps cover the gap since each company's last check, up to 72 hours. Her own saved jobs are exempt. |
| US only | Location is clearly outside the US |
| No agencies | Agency name list, or phrases like "on behalf of our client" |
| Not already applied | Same company and role in `applications` |
| No duplicates | Same board id, URL, or company and role in the last 30 days |

Sweeps only consider **target titles** (rating 3 or more), so roles like Account Executive are never looked at.

---

## 5. Ranking (code, 0 to 100)

| Signal | How code rates it | Weight |
|---|---|---|
| Title | Title families: Forward Deployed, AI Agents, AI Engineer, GTM, Deployment, Associate PM = 5; Solutions, AI Ops = 4; Implementation, Technical Support, Product = 3 | 3 |
| Skills | Share of the posting's skills that Jamie's brain shows she has | 3 |
| Experience (preference only) | Under 3 years, or not stated: 5. 3+ years, or a senior title with no years stated: 2. Her own saved jobs: always 5. Ranges use the lower number. | 2 |
| Direct employer | Not an agency | 3 |
| Location | Seattle or remote 5, SF 3.5, NY 2, other 1 | 2 |
| Recently funded | Optional input | 2 |
| Hiring manager named | Optional input | 1 |
| YC | Optional input | 1 |

**Resume type** comes from the title: `fde`, `ai_engineer`, `gtm`, or `ask`.

---

## 6. A run

1. First time only: `jamie_scout_watch` action `seed`, repeated while `remaining` > 0.
2. `jamie_scout_sweep`, repeated with the same `run_id` while `remaining_companies` > 0.
3. LinkedIn saved jobs: for each one, open it, `get_page_text`, and pass the text to `jamie_scout_add_job` with the same `run_id`. No judging.
4. `jamie_scout_qa` action `check`. Code re-reads every job-board posting; Jamie re-opens the LinkedIn sample it returns and records each.
5. `jamie_scout_run` action `finish`, then show `jamie_scout_shortlist`.

---

## 7. Quality check

- **Job-board jobs:** code re-reads the board. Taken down means `expired`. Title or publish date changed means `rejected`.
- **LinkedIn jobs:** a random 20% (at least 1) for Jamie to re-open. Any failure rejects that job and sends the batch back.

---

## 8. Market intel for Project Lab

Every posting's skills go into `job_skills`. `jamie_scout_skill_demand` returns the most-requested skills with job counts and whether Jamie's brain shows Vishwa has each one.

---

## 9. Settings

| Setting | Default | Meaning |
|---|---|---|
| `max_years_experience` | 3 | Preference: roles asking for fewer years rank higher. Never a filter. |
| `scout_max_age_hours` | 24 | Freshness window |
| `scout_exclude_agencies` | true | Reject staffing and recruiting agency postings |

Change with `jamie_update_settings` only when Vishwa asks.

---

## 10. Tools

| Tool | Purpose |
|---|---|
| `jamie_scout_watch` | Add, seed, list or remove watched companies |
| `jamie_scout_sweep` | Read watched job boards and process every target-title posting |
| `jamie_scout_add_job` | Process one LinkedIn or YC posting from its page text |
| `jamie_scout_run` | Start or finish a run |
| `jamie_scout_shortlist` | Ranked jobs that passed |
| `jamie_scout_set_status` | Hand off, mark applied, skipped or expired |
| `jamie_scout_qa` | Code re-check of job-board jobs, plus the LinkedIn sample |
| `jamie_scout_skill_demand` | Most-requested skills and her gaps |

Data: `scout_watchlist`, `scout_watchlist_misses`, `scout_runs`, `jobs`, `job_skills`, created automatically on server start.

---

## 11. Never

- Applies to anything
- Judges, summarizes or rewrites a posting (code reads it)
- Guesses experience or posted dates
- Pads the shortlist with weak matches
- Hands off a rejected job (the server refuses)
