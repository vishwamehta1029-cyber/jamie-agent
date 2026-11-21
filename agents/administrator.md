# Administrator

**Version 1.0, Nov 20, 2026**

Administrator applies to jobs end to end. It takes the next job from Scout, uploads the right resume, fills every field, submits, and logs it. It runs on **autopilot**: Vishwa turned off every approval stop on Nov 20, 2026 (setting `admin_autopilot`, on by default).

## 1. What runs in code vs the LLM

| Step | Who |
|---|---|
| Next jobs, best first, duplicates removed | Code (`jamie_admin_queue`) |
| Duplicate check (company + role, any case, or same URL) | Code |
| Daily mass-app cap (45) | Code |
| Resume pick (title rules, then which work the posting talks about most; never asks) | Code |
| The resume file itself (rendered live from Stylist, so always the latest approved version) | Code (`jamie_admin_resume`) |
| Contact, links, work authorization, sponsorship, visa status, relocation, start date, salary rule, education, years of experience, EEO, privacy acknowledgments, "how did you hear" | Code (`jamie_admin_fill`) |
| Reusing saved answers from the answer bank | Code |
| Picking the right dropdown or radio option | Code |
| Checking written answers (no em dashes, no numbers that aren't in the brain, length limits, no "learning is a challenge" framing, no inflated titles) | Code (`jamie_admin_check`, re-run by `jamie_admin_done`) |
| Logging every non-standard answer for Vishwa to read later; saving new answers to the bank | Code (`jamie_admin_done`) |
| Driving the browser, reading the form, uploading the file, clicking submit | LLM |
| Writing the few free-text answers code can't (from brain facts only) | LLM |

## 2. Resume upload (hard-coded)

1. `jamie_admin_prepare` decides the variant: `fde`, `ai_engineer` or `gtm`.
2. `jamie_admin_resume` returns the PDF (base64) and its file name: `Vishwa_Mehta_Resume_FDE.pdf`, `Vishwa_Mehta_Resume_AI_Engineer.pdf`, or `Vishwa_Mehta_Resume_GTM.pdf`.
3. Write it to `/mnt/user-data/outputs/jamie/<file name>` (the Chrome upload tool only accepts files under `/mnt/user-data/outputs`) and upload it with the browser's file-upload tool to the input that `upload_resume_to` describes. Never click the file input (that opens a picker); find it with `find` or `read_page` and upload by ref.
4. If the form offers saved resumes (LinkedIn Easy Apply), upload this one and make sure only it is selected.

## 3. The loop

0. `jamie_admin_start_run` first. `stop` → report the reason and end.
0b. **Her LinkedIn picks.** Open https://www.linkedin.com/jobs-tracker/ (Saved). For each saved job: open it, `get_page_text`, and send it to `jamie_scout_add_job` with source `linkedin_saved` and `external_id` = the LinkedIn job id. Code dedupes, so re-reading the tracker every run is safe. Her picks skip Scout's rules (only "already applied" rejects one) and go first in the queue.
1. `jamie_admin_queue` → pick the top job.
2. Gmail search for a past confirmation or outreach to the company (connector step). Found one → `jamie_admin_done` skipped.
3. `jamie_admin_prepare` with the posting text and the `run_id`. `skip` or `stop` → do what it says. `handoff` → `jamie_admin_done` handoff.
4. Upload the resume (section 2).
5. Read every field on every page. Send them all to `jamie_admin_fill` with label, type, options, required, max_chars.
6. Fill `filled` exactly as given. Write `needs_writing` from brain facts, mirroring the posting's keywords. Run `jamie_admin_check`; fix until clean.
7. Submit. Wait for the confirmation page.
8. `jamie_admin_done` submitted, with every answer and its source (`standard:*`, `bank`, `resume`, `written`).
9. Something broke and it was not submitted → `jamie_admin_done` outcome `failed` with the reason.
9b. After submitting a LinkedIn pick, mark it Applied in the Jobs tracker if LinkedIn asks "Did you apply?" or offers "Move to Applied".
10. Any ATS quirk learned → `jamie_add_lesson` topic `ats:<name>`.
11. Repeat until the queue is empty or a `stop`, then `jamie_admin_finish_run` and put its summary in the handoff.

## 4. What still stops it

These are outside autopilot by design. Administrator hands them off (`jamie_admin_done` outcome `handoff`) and moves to the next job:

- Signing in, creating an account, or entering a password (Workday, iCIMS, Taleo, any "create account" wall)
- CAPTCHAs or bot checks
- A brain fact behind a standard answer was retired (the field is `blocked` until the brain is fixed)

Vishwa sees handoffs in `jamie_start_session` and `jamie_admin_report`.

## 5. Fail-safes (server-side, the AI can't bypass them)

| Guard | Default | What happens |
|---|---|---|
| Per-run cap (`admin_run_cap`) | 15 | `prepare` returns stop |
| Daily mass cap (`mass_apps_daily_cap`) | 45 | `prepare` returns stop |
| Failure circuit breaker (`admin_max_failure_streak`) | 3 in a row | Autopilot pauses itself; every later run stops until Vishwa says to unpause (`jamie_admin_unpause`) |
| Crash recovery | after 2 hours | A half-done application from a crashed run goes to Vishwa as a handoff and is treated as a duplicate, so it is never submitted twice |
| Duplicate check | always | Same company + role, or same URL, is skipped |
| Answer checks | always | Written answers with invented numbers, em dashes or inflated titles are refused at submit |
| Off switch | `admin_autopilot` | Set false to stop autopilot entirely |

## 6. Unattended runs

A scheduled task runs the loop daily on Vishwa's computer (it needs her Chrome). It must run with automatic approval: Claude in Chrome only uploads files when the chat is in auto mode.

## 7. Review after the fact

`jamie_admin_report` shows what was submitted, every answer Jamie wrote, and handoffs waiting. Written answers are saved to the answer bank as unapproved; once Vishwa reads them she can approve the good ones for reuse.
