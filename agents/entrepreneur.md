# Entrepreneur

**Version 3.0, Nov 23, 2026 (code edition)**

Entrepreneur emails founders of US YC startups that build AI agents, asking for a coffee chat. It runs by itself every day on a Vercel cron. Target: 100 founders a day, newest YC batches first.

Vishwa's decisions (Nov 23, 2026): Entrepreneur is deterministic code end to end, run daily by a cron. The **only** LLM call writes the `[WHY LINE]` in her template. LinkedIn connection requests and YC Work at a Startup messages are dropped. She adds the secrets in Vercel herself.

Lives at `src/entrepreneur.ts` (I/O and the run), `src/entrepreneurRules.ts` (pure rules, unit tested in `test/entrepreneur.test.ts`) and `api/entrepreneur.ts` (the cron endpoint).

## 1. What runs in code vs the LLM

| Step | Who |
|---|---|
| Discovery: search YC's public directory for 9 terms (AI agents, agentic, autonomous agents, AI workflow automation, AI employees, voice agents, coding agents, browser agents, agent infrastructure) | Code |
| Filter: status Active, not acquired, US (regions or locations), agent keywords in the one-liner, description or tags | Code (`qualifies`) |
| Order: newest batch first | Code |
| Founders from each YC company page (name, title, LinkedIn, X, any public email), active founders only, up to 3 per company | Code |
| Public email: the YC page, else a mailto or address on the company's own site that is clearly this founder's | Code |
| Apollo People Match (name + domain); only `email_status: verified` is used | Code |
| MX check on the email's domain (same logic as `jamie_check_domain`); no MX = blocked | Code |
| **Why line** ("I am really interested in ___") from the company's one-liner and description | **LLM (Anthropic Messages API), checked in code** |
| Filling her template (answer #159) and the portfolio card (answer #1) | Code |
| Guardrails before every send (`jamie_can_send` logic), send through the Gmail API, log the send (`jamie_log_send` logic) | Code |
| Bounce checks at 1 hour and 24 hours (`jamie_record_bounce`, `jamie_mark_bounce_checked` logic) | Code |

Nothing is guessed. A founder with no public email and no Apollo-verified email is marked `no_verified_email` and never emailed.

## 2. The why line (the only LLM call)

- Input: only the company's `one_liner` and `description`.
- Model: `ANTHROPIC_MODEL` (default `claude-haiku-4-5`), temperature 0.
- Code checks every answer: one line, at most 120 characters, lowercase start (an acronym like AI is fine), no em or en dashes, no numbers that aren't in the source text, no trailing period, no brackets.
- A bad answer gets one retry with the broken rules listed. If that fails too (or there is no API key), code builds the line from the one-liner: "how you automate insurance claims with AI agents" or "what you are building with AI agents for dental front desks".
- The line is stored on the founder row (`why_line`, `why_source` = llm, fallback or fallback_no_key). Founders at the same company share it.

## 3. The email

- Template: answer #159 ("Entrepreneur: YC founder outreach template"), loaded from the answer bank at send time and refused if it isn't approved. The text is never copied into code.
- Placeholders filled by string replace: `[FOUNDER FIRST NAME]`, `[COMPANY]`, `[WHY LINE]`. The `[Rules: ...]` block at the end is stripped.
- Subject: the template's `Subject:` line, which is "Coffee chat about <COMPANY>".
- `[portfolio card with thumbnail]`: the HTML thumbnail card (the `<table>` block in answer #1) in the HTML part; https://vishwamehta.vercel.app/ in the plain-text part.
- Sent as multipart (text + HTML) from `GMAIL_SENDER`. Blank lines become paragraphs; single line breaks become `<br>`.
- Before sending, code checks the Gmail token belongs to `GMAIL_SENDER`.

## 4. A day

The cron calls `/api/entrepreneur` 24 times a day (about every 30 minutes, 8am to 8pm Pacific). Each call has about 50 seconds and does, in order:

1. **Bounce checks**: Gmail search `(from:mailer-daemon OR "Address not found") newer_than:2d`; a bounce in the same thread or naming the address marks the send bounced; otherwise the 1h and 24h checkpoints are marked.
2. **Send** up to `ENT_BATCH_SIZE` ready founders, `ENT_SEND_DELAY_MS` apart.
3. **Discovery** (once every `ENT_DISCOVERY_EVERY_HOURS`).
4. **Founders** for companies not read yet, newest batch first.
5. **Email lookup** and MX check.
6. **Why lines** for founders who have an email.

Progress lives in the database, so the next call picks up where the last stopped. A lock keeps two calls from running at once.

Each entry in `vercel.json` runs once a day, which works on every Vercel plan. On Pro, the 24 entries can be replaced by one `*/30 16-23,0-3 * * *`.

## 5. Settings and env vars

| Setting | Default | What it does |
|---|---|---|
| `entrepreneur_enabled` | false | Kill switch. Off: the cron does nothing. On: it discovers, looks up and sends |
| `entrepreneur_dry_run` | false | Builds everything, sends nothing, spends no Apollo credits |

Change them with `jamie_update_settings`, only when Vishwa says so.

| Env var | Needed for |
|---|---|
| `CRON_SECRET` | The cron endpoint (Vercel sends it as `Authorization: Bearer`) |
| `APOLLO_API_KEY` | Apollo People Match |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | The why line (without a key, code writes it) |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER` | Sending and bounce checks. Scopes: `gmail.send` and `gmail.readonly` |
| `ENT_DAILY_EMAIL_TARGET` | Emails a day (default 100) |
| `ENT_BATCH_SIZE`, `ENT_SEND_DELAY_MS`, `ENT_TIME_BUDGET_MS` | Pacing per cron call (10, 2000 ms, 50000 ms) |
| `ENT_MAX_FOUNDERS_PER_COMPANY`, `ENT_APOLLO_DAILY_CREDITS` | 3 founders, 150 Apollo credits a day |
| `ENT_DISCOVERY_PAGES`, `ENT_DISCOVERY_EVERY_HOURS` | 2 pages of 100 per term, every 20 hours |
| `ENT_DRY_RUN` | `1` forces a dry run |
| `YC_ALGOLIA_APP_ID`, `YC_ALGOLIA_API_KEY`, `YC_ALGOLIA_INDEX` | Optional. The YC directory's public search config is read from ycombinator.com/companies; set these only if that breaks |

## 6. Fail-safes

| Guard | What happens |
|---|---|
| Kill switch | `entrepreneur_enabled` false: nothing runs |
| Dry run | Setting, env or `jamie_entrepreneur_run` default: sample emails returned, nothing sent |
| Never twice | Unique founder per company, unique email, unique LinkedIn; anyone already in `sends` (any agent) is skipped; a send whose outcome is unknown is never retried |
| No guessing | Only public or Apollo-verified emails |
| Jamie's guardrails | Every founder is a contact; `jamie_can_send` logic runs before each send (daily send limit, dead ends, no MX) |
| 3 bounces in a row | All outreach stops (her rule, Nov 4 2026, shared with Postman) |
| Gmail ceiling (`postman_gmail_daily_ceiling`) | 450 sends in 24 hours across agents |
| Gmail quota or rate error | The run stops; the founder stays queued |
| Apollo | Every call logged in `apollo_usage` (reason `entrepreneur: ...`) through the `jamie_log_apollo` logic; daily credit budget; stops on any API error |
| Template | Refused if answer #159 isn't approved or answer #1 has no card |

## 7. Tables

- `ent_companies`: yc slug, name, batch, one-liner, description, website, domain, location, team size, status, tags, YC url, matched agent terms, discovered at.
- `ent_founders`: company, name, first name, title, LinkedIn, X, email, `email_source` (public or apollo), `email_verified`, `why_line`, `email_status` (new, sending, no_verified_email, blocked, sent, bounced, replied), reason, contact and send ids, contacted at, Gmail message and thread ids.
- `ent_runs`: one row per cron call with its counts and errors.

Created automatically on the first request, like every other table.

## 8. Tools

- `jamie_entrepreneur_status`: today's counts (discovered, founders, emails sent, no verified email, blocked, bounces, Apollo credits), the last run and the last error, and which env vars are set.
- `jamie_entrepreneur_run`: one batch now. `dry_run` defaults to true.
- `jamie_get_brain` includes an Entrepreneur section (founders and companies).

Replies are not detected yet; `replied` is set by hand for now.
