# Entrepreneur

**Version 1.0, Nov 22, 2026**

Entrepreneur finds YC startups that fit Vishwa, keeps a tracker of each one (what it does, batch, founders, funding raised), and emails one founder per company asking for a coffee chat.

## 1. What runs in code vs the LLM

| Step | Who |
|---|---|
| Pulling the YC directory (yc-oss mirror of YC's search index, updated daily) | Code (`jamie_ent_sync`) |
| Fit score for every company: AI and agents, workflow automation, GTM, B2B, batch recency, team size, hiring, Seattle/SF/NY/remote; off-fit fields and non-US lower it | Code |
| Skipping companies Jamie already emailed | Code |
| Adding the newest batch if the mirror lags (read from ycombinator.com) | LLM copies fields, code scores (`jamie_ent_add_companies`) |
| Founders from the company's YC page, funding from a public source | LLM reads and copies (`jamie_ent_research`) |
| Refusing funding with no source URL | Code |
| Picking the founder (CEO first), checking the domain, guessing the address (`first@` first, then `first.last@`) | Code |
| The one company-specific line ("I am really interested in ...") | LLM writes it |
| Checking that line: from the company's own description, no invented numbers, no dashes, under 170 characters | Code (`jamie_ent_draft`) |
| Everything else in the email | Code, from her approved template (answer bank: "Entrepreneur founder email (coffee chat)") |
| Her approval of every email | LLM shows `jamie_ent_review`, then `jamie_ent_approve` with her words |
| Daily cap, guardrails, Gmail ceiling, pacing, bounce re-guess | Code (`jamie_ent_next`) |
| Proving the sent email is the approved one (sha256) | Code (`jamie_ent_sent`) |

## 2. The loop

1. `jamie_ent_sync`. If YC has a batch newer than `newest_batch_in_feed`, read it at ycombinator.com/companies in Chrome and add it with `jamie_ent_add_companies`.
2. `jamie_ent_shortlist`.
3. For each company: open its YC page (ycombinator.com/companies/<slug>) for founders, search the web for funding (press release, TechCrunch, company blog, YC launch post) and keep the URL. `jamie_ent_research`.
4. Write the why line from what the company says it does. `jamie_ent_draft`.
5. `jamie_ent_review`. Show her every why line and one full email. She approves or drops.
6. `jamie_ent_approve` with her words.
7. `jamie_postman_assets` part thumbnail (shared with Postman), then loop `jamie_ent_next` → Gmail `send_message` → `jamie_ent_sent`.
8. Bounce checks at 1 hour and 24 hours. A reply or meeting goes in the tracker with `jamie_ent_update`.

## 3. Fail-safes

| Guard | Default | What happens |
|---|---|---|
| Template approval | always | No drafts until her template is approved in the answer bank |
| Email approval | always | Nothing returned to send until `jamie_ent_approve` |
| Exact text | always | `jamie_ent_sent` refuses a sha256 that doesn't match |
| One founder per company, never twice | always | Already-emailed people and companies are skipped |
| Daily cap (`ent_daily_cap`) | 10 founders a day | `jamie_ent_next` waits until tomorrow |
| Bounce | 2 patterns per person | First bounce re-drafts with the second pattern for her OK; after that, one Apollo lookup via the normal bounce flow |
| 3 bounces in a row, Gmail ceiling, pacing, Jamie's guardrails | shared with Postman | Same rules |
| Funding | always | Recorded only with a source URL; otherwise "not found" |
