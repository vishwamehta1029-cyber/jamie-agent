# Entrepreneur

**Version 2.0, Nov 22, 2026**

Entrepreneur emails founders of San Francisco startups that build agents, YC or not, asking for a coffee chat. Target: 100 founders a day. It keeps a tracker of every company: what it does, YC batch or not, founders, funding raised, and whether they were emailed or replied.

Vishwa's rules (Nov 22, 2026): all founders based in SF, YC or non-YC; include companies she already applied to; use the email if it's public, otherwise Apollo; aim for 100 founders a day; make as much of it code as possible.

## 1. What runs in code vs the LLM

| Step | Who |
|---|---|
| Next step to call, today's count against 100 | Code (`jamie_ent_plan`) |
| YC directory pull (yc-oss mirror of YC's search index, refreshed daily) | Code (`jamie_ent_sync`) |
| Scope: active, based in San Francisco, builds agents, batch 2023 or later | Code |
| Non-YC SF agent companies from Apollo's company search | Code (`jamie_ent_sync_apollo`, needs `APOLLO_API_KEY`) |
| Outreach order: newer batch, smaller team, hiring, GTM or B2B | Code |
| Founders from each YC page (embedded page data: names, titles, LinkedIn, active or not) and funding news | Code (`jamie_ent_find_founders`) |
| Founders of non-YC companies | Code via Apollo people search (with key), else the LLM (`jamie_ent_add_founders`) |
| Public founder email on the company's own site (/, /about, /team, /contact, /company) | Code (`jamie_ent_find_emails`) |
| Apollo email lookup, only Apollo-verified addresses on the company domain, daily credit budget | Code with `APOLLO_API_KEY`; without it the LLM runs the Apollo MCP and code checks the result (`jamie_ent_set_email`) |
| The company line ("I am really interested in ...") | Code from the one-liner when it reads naturally (about 2 in 3 companies, live check Nov 22); the LLM writes the rest; code checks every line |
| Every email's text | Code, from her approved template ("Entrepreneur founder email (coffee chat)" in the answer bank) |
| Her approval | `jamie_ent_review` table, then `jamie_ent_approve` with her words |
| Sending gates | Code (`jamie_ent_next`, `jamie_ent_sent`) |

Live check on Nov 22, 2026: 650 active SF agent YC companies from 2023 on; 12 of 12 YC pages parsed (19 active founders); 1 of 19 founders had a public address on their site, so most emails come from Apollo.

## 2. A day's run

Call `jamie_ent_plan` and do what `next` says, again and again:

1. `jamie_ent_sync` (and `jamie_ent_sync_apollo` pages for non-YC) when the pool runs low.
2. `jamie_ent_find_founders` (15 companies a call).
3. `jamie_ent_find_emails` (20 founders a call). Without an API key: `jamie_ent_needs_apollo`, tell Vishwa the total credits once, run Apollo `people_match` for each, `jamie_ent_set_email` with Apollo's exact answer.
4. `jamie_ent_draft_batch`, then `jamie_ent_needs_why` and `jamie_ent_set_why` for lines code couldn't write.
5. `jamie_ent_review`: show Vishwa the table (company, what they do, founder, email and source, company line) and one full email. On her yes: `jamie_ent_approve` with `all_reviewed` or ids.
6. `jamie_postman_assets` part thumbnail, then loop `jamie_ent_next` → Gmail `send_message` exactly as returned → `jamie_ent_sent`.
7. Bounce checks at 1 hour and 24 hours. Replies and meetings: `jamie_ent_update`.

## 3. Fail-safes

| Guard | Default | What happens |
|---|---|---|
| Template approval | always | No drafts until her template is approved |
| Email approval | always | Nothing to send until `jamie_ent_approve` |
| Exact text | always | `jamie_ent_sent` refuses a sha256 that doesn't match |
| Never twice | always | A founder Jamie already emailed is skipped |
| Founders per company (`ent_max_founders_per_company`) | 3 | Active founders only |
| No guessing | always | Only public or Apollo-verified addresses on the company domain |
| Daily cap (`ent_daily_cap`) | 100 founders | `jamie_ent_next` waits until tomorrow |
| Apollo budget (`ent_apollo_daily_credits`) | 100 credits a day | Lookups stop for the day |
| Accepted Apollo status (`ent_apollo_accept`) | verified | Other statuses are not used |
| 3 bounces in a row, Gmail ceiling (450 in 24h), pacing (20s), Jamie's guardrails | shared | Same rules as Postman |
| Funding | always | Recorded only with a source; otherwise "not found" |

## 4. Turning on the full code path

Add `APOLLO_API_KEY` (from a paid Apollo plan; the free plan blocks the API) in Vercel → jamie-mcp → Settings → Environment Variables, then redeploy. Without it, YC discovery, founders, public emails, drafting and sending still run in code; Apollo lookups go through the Apollo MCP one by one.
