# Postman

**Version 1.0, Nov 22, 2026**

Postman is Jamie's outreach agent. For each job Vishwa selects, he finds up to 25 relevant people at the company, gives each one work email, writes every email from her approved template, and sends them after she approves the batch.

## 1. What runs in code vs the LLM

| Step | Who |
|---|---|
| Which jobs | Vishwa picks (`jamie_postman_queue` lists recent submitted applications without outreach) |
| Marking the application as quality (application plus outreach) | Code (`jamie_postman_start`) |
| Skipping anyone at the company who was already emailed | Code |
| Mail server (MX) check for the domain | Code |
| Search plan: how many recruiters vs team people, which titles | Code |
| Searching LinkedIn, the posting, the team page and Apollo search, copying name, title and location as shown | LLM |
| US-only, full real names (masked last names rejected), dedupe | Code (`jamie_postman_add_people`) |
| Relevance score and CTA (chat vs refer) | Code |
| Picking the top 25 with about 40% recruiters and 60% hiring and team people | Code (`jamie_postman_build`) |
| One email address per person (public address, else the confirmed pattern, else one guessed pattern) | Code |
| Writing every email (subject, body, portfolio card, resume) from her template | Code |
| Showing her the batch and getting her yes | LLM, then `jamie_postman_approve` with her words |
| Canary wave, bounce stops, guardrails, Gmail daily ceiling, pacing | Code (`jamie_postman_next`) |
| Sending through Gmail exactly as returned | LLM |
| Proving the sent email is the approved one (sha256) | Code (`jamie_postman_sent`) |

## 2. Relevance (in code)

| Bucket | Score | CTA |
|---|---|---|
| Directly responsible for the role (named hiring manager, "I'm hiring" post) | 100 | chat |
| Publicly shared this opening | 90 | refer |
| Founder or CEO | 85 | chat |
| Leads this function (Head of, VP, Director in the role's area) | 82 | refer |
| Recruiter (technical or matching recruiter scores higher) | 70 to 78 | chat |
| Manages or leads in this function | 76 | refer |
| Same function | 62 | refer |
| Engineering leader or adjacent engineering (for engineering roles) | 45 to 58 | refer |
| Not clearly related | 20, only used to reach 25, flagged | refer |

Same city as the job adds 5. USF alum adds 3. The CTA rule is Vishwa's: founder, recruiter, direct hiring manager, or anyone directly responsible for the role gets "I would love to connect for a brief chat"; everyone else gets the referral ask. She can change any CTA when she approves.

## 3. The email

Only the greeting name, the role, the company and the CTA line change. Everything else is her approved "Default job outreach email" word for word:

- Subject: `<role> at <company> | Open to Relocation`
- The portfolio thumbnail card, attached inline as `cid:att0` (Claude's Gmail tool strips external images)
- The resume for the role type (FDE, AI Engineer or GTM), rendered live from Stylist, attached second

If the template in the answer bank changes, `jamie_postman_build` refuses until the code template matches, so Postman never sends an outdated version.

## 4. The loop

1. `jamie_start_session`. Postman campaigns waiting on her show up there.
2. She names the jobs, or `jamie_postman_queue` and she picks.
3. Per job: `jamie_postman_start` with company, role, application id and the email domain.
4. Search. LinkedIn people search with current company and United States, one search per title in the plan, then the posting, team page, LinkedIn posts about the opening, and Apollo people search (search only; never Access email). Send everyone to `jamie_postman_add_people` as shown. Collect up to 40; code picks.
5. Look for public evidence of the email format and save it with `jamie_save_email_pattern`.
6. `jamie_postman_build`. Show her the table (name, title, location, why, CTA, email, confidence, wave), the flags and the sample email.
7. Her yes, quoted, goes to `jamie_postman_approve` (with any people she drops or CTAs she changes).
8. `jamie_postman_assets` for the thumbnail and the resume; write both to `/mnt/user-data/outputs/jamie/`.
9. Loop: `jamie_postman_next` → Gmail `send_message` with the payload exactly as returned → `jamie_postman_sent`. On `wait`, start the next company and come back.
10. Bounce checks at 1 hour and 24 hours as usual (`jamie_mark_bounce_checked` or `jamie_record_bounce`).

Several companies can run side by side: approve all the batches, send every canary wave, then come back an hour later for the rest.

## 5. Fail-safes (server-side)

| Guard | Default | What happens |
|---|---|---|
| Approval | always | Nothing is returned to send until `jamie_postman_approve`; every email's text is locked by sha256 at build |
| Exact text | always | `jamie_postman_sent` refuses a sha256 that doesn't match the approved email |
| Never twice | always | Anyone at the company already in `sends` is rejected |
| US only | always | Unknown or non-US locations are rejected |
| Canary (`postman_canary_size`) | 3 | With an unconfirmed pattern, 3 guessed emails go first; the rest wait for their 1 hour bounce check |
| Canary bounce | 1 bounce | The pattern is marked wrong, unsent addresses switch to the next pattern, and the batch goes back to Vishwa |
| Patterns per person (`max_patterns_per_person`) | 2 | If both bounce, everything unsent is held for her |
| 3 bounces in a row | any company | All outreach stops (her rule, Nov 4 2026) |
| Company bounce cap, daily send limit, paused guessing, no-MX, dead ends | existing | `jamie_can_send` rules apply to every Postman email |
| Gmail ceiling (`postman_gmail_daily_ceiling`) | 450 in 24h | Gmail personal accounts stop sending at about 500 a day |
| Pacing (`postman_min_gap_seconds`) | 20s | Spaces sends in a campaign |
| Off switch | `jamie_postman_stop` | Unsent emails are never sent |

## 6. Apollo

Apollo stays last resort. Postman uses Apollo people search to find names (no credits), never email reveals. A bounced person gets the normal single Apollo lookup through `jamie_record_bounce`.
