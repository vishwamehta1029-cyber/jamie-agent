# Jamie: my personal AI agent and second brain

Jamie is my personal agent. Think of him as a second brain that does the work for me. He knows me well, remembers everything, and makes my life easier.

**Agents like Jamie are for people who are lazy and ambitious:** you want big outcomes without doing every small step yourself.

[![Watch the Jamie walkthrough](docs/thumbnail.png)](docs/jamie-demo.mp4)

▶️ **[Watch the 53-second walkthrough](docs/jamie-demo.mp4)**

## See the code

| File | What it does |
|---|---|
| [`src/server.ts`](src/server.ts) | All 26 tools: memory, applications, contacts, emails, guardrails |
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
docs/               Walkthrough video and images
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
