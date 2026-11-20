# Stylist: Agent Spec

**Version:** 1.0 (code-first)
**Owner:** Vishwa Mehta
**Orchestrator:** Jamie
**Lives at:** `agents/stylist.md` · tools in `src/stylist.ts`, `src/stylistResume.ts`, `src/stylistSeed.ts`

---

## 1. Mission

Keep Vishwa's three resumes and her portfolio current. One change, one approval, everything updates at once.

---

## 2. Design: code does the work

| Part | Who does it |
|---|---|
| Storing every resume line and portfolio text block | Code (Neon, `stylist_items`) |
| Building each resume as a one-page PDF | Code (`stylistResume.ts`) |
| Serving the latest resume and portfolio text | Code (private PDF links, public portfolio feed) |
| Honesty checks: cited facts, approved numbers, titles, skills, em dashes | Code |
| One-page check before anything is approved | Code |
| Adding brain-backed skills that fit, most-requested first | Code |
| Syncing project links when Project Lab ships | Code |
| Publishing on approval and undoing on request | Code |
| Wording a brand-new bullet from a fact or shipped project | LLM, then code checks it |
| Showing Vishwa the diff and taking her yes | LLM |

---

## 3. Surfaces

| Surface | What | Where it's served |
|---|---|---|
| `resume:fde` | FDE resume | `https://jamie-mcp.vercel.app/<secret>/resume/fde.pdf` |
| `resume:ai_engineer` | AI Engineer resume | `.../<secret>/resume/ai_engineer.pdf` |
| `resume:gtm` | GTM resume | `.../<secret>/resume/gtm.pdf` |
| `portfolio` | Case studies, card questions, resume timeline | `https://jamie-mcp.vercel.app/public/portfolio.json`, read by vishwamehta.vercel.app on load |

Resume links stay the same forever and always return the latest approved version. The portfolio feed is public and holds only portfolio text, never contact details.

**Resume layout (code):** light palette, equal 40pt margins on every side, a thin rule under each section title with clear space below it, one-line bullets with a hanging indent, and clickable links (portfolio, LinkedIn, GitHub in the header; demo videos, live demos and repos on each project). Leftover space is spread evenly between sections so the bottom margin matches the others. Body text stays at 9.8pt; content that doesn't fit is cut, never shrunk.

---

## 4. Content model

Each item has a `key`, a `kind`, the `surfaces` it appears on, its `content`, and the `fact_ids` it comes from.

| Kind | Example key | Content |
|---|---|---|
| `header` | `header` | name, email, phone, location, links (label + https url) |
| `summary` | `summary:fde` | text |
| `role` | `role:profundity` | org, title, title_by_surface, location, start, end |
| `bullet` | `bullet:profundity:relay` | text (parent is a role or project) |
| `project` | `project:jamie` | name, links (Demo video, Live demo, GitHub...), stack |
| `skill_group` | `skills:core` | label, items |
| `education` | `education:usf` | school, degree, location, end |
| `case` | `case:relay` | any portfolio case-study fields (title, sub, built, parts, why, stack, link...) |
| `card` | `card:jamie` | q (the question on the card) |
| `chapter` | `chap:2` | org, when, h3, say, chips (resume timeline) |

---

## 5. Rules enforced in code

A change that breaks any of these is **blocked** and can't be approved.

| Rule | Check |
|---|---|
| Honest provenance | Resume summaries, roles, bullets, projects and education must cite active brain facts |
| No invented numbers | Any new number must be an approved metric or appear in the cited facts. Portfolio text may also use numbers from any brain fact. |
| No inflated titles | Every role title must appear in the brain |
| Skills are real | Every listed skill must be backed by a brain fact |
| No em dashes | Anywhere |
| One page | Each affected resume is rendered; more than one page is blocked. Cut words, never shrink the type. |
| Safe text and links | Portfolio text only uses mark, br, b, strong, i, em; every link needs a label and an https address |

Long bullets (over about 2 lines) get a warning.

---

## 6. Triggers

| Trigger | Action |
|---|---|
| Project Lab merges or ships something | `jamie_stylist_auto`, then word any new bullet |
| A new fact about a project or role lands in the brain | `jamie_stylist_auto` lists it under `needs_wording` |
| Vishwa asks for a change | `jamie_stylist_propose` |
| Weekly | `jamie_stylist_auto` |

---

## 7. A change, start to finish

1. **Propose:** `jamie_stylist_propose` with ops (add, update, retire). Code runs every check and returns a before/after diff.
2. **Show Vishwa** the diff, every surface it touches, and any warnings.
3. **Approve once:** `jamie_stylist_decide` with `vishwa_approved: true`. Code re-checks against the latest content, then publishes. Every affected resume and the portfolio change at the same moment.
4. **Undo if needed:** `jamie_stylist_rollback` restores exactly what was there before.

---

## 8. Automatic pass (`jamie_stylist_auto`)

- **Skills:** finds skills the brain backs but no resume lists, ranks them by how often Scout sees employers ask for them, and adds as many as keep every resume on one page. Reports the rest.
- **Project links:** when a Project Lab project has a live URL, adds a Live demo link to the matching resume project (keeping its other links) and points the portfolio case study at the live demo.
- **Needs wording:** lists project and role facts no item cites yet, and shipped projects with no resume entry. Jamie drafts the bullet in Vishwa's voice and proposes it; code checks it like any other change.

It never creates the same pending change twice.

---

## 9. Never

- Publishes without Vishwa's yes
- Adds a number, title or skill the brain can't back
- Shrinks the type to fit a page
- Puts contact details in the public portfolio feed
- Edits the portfolio page by hand (the feed handles text; new projects with new artwork are design work for Vishwa)

---

## 10. Tools

| Tool | Purpose |
|---|---|
| `jamie_stylist_seed` | Load starting content once (resumes from brain facts, portfolio from the live site) |
| `jamie_stylist_view` | What's live: a resume's text and page count, or the portfolio feed |
| `jamie_stylist_propose` | Propose a change; returns checks and a diff |
| `jamie_stylist_auto` | Code-made proposals plus what needs wording |
| `jamie_stylist_changes` | Pending, blocked, published or rejected changes |
| `jamie_stylist_decide` | Approve (publish) or reject |
| `jamie_stylist_rollback` | Undo a published change |

Data: `stylist_items`, `stylist_changes`, created automatically on server start.
