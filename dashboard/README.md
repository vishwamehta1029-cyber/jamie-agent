# Jamie Dashboard

A private web dashboard for Jamie. It shows the Entrepreneur agent, applications, lessons and handoffs, and lets you browse every table in Jamie's database.

It is a separate app from the Jamie MCP server (the `jamie-mcp` Vercel project). It only reads: there is no button, form or endpoint that changes data.

## Pages

| Page | What you see |
|---|---|
| Overview | Today and last 7 days: applications submitted, handoffs, failed (Administrator); Scout shortlisted and rejected; Entrepreneur companies, founders, emails sent, no verified email, blocked, bounces, Apollo credits. Charts of emails and applications per day for 14 days. Last Entrepreneur run and last error. Guardrail settings |
| Entrepreneur | Companies and founders tables with search, filters, sorting and pages. Click a company for its founders, their emails, sends and bounces |
| Applications | The applications table with status filter, search and links to each job |
| Lessons & handoffs | Lessons by topic (with search) and the latest handoff notes |
| Database | Every table with its row count. Open one to page through rows, sort by any column and search its text columns |

"Today" means since midnight Pacific, the same as the agents use.

## Security

- **Password login.** One password (`DASHBOARD_PASSWORD`), compared in constant time. After 5 wrong tries from one address, that address waits 15 minutes, and every wrong try takes about a second to answer. The limiter lives in memory, so on Vercel it slows guessing per server instance rather than being a hard global limit: use a long password.
- **Session cookie.** HttpOnly, Secure, SameSite=Lax, signed with HMAC-SHA256 using `DASHBOARD_SESSION_SECRET` (and the password), valid for 7 days. Changing either env var signs everyone out.
- **Every route is protected** by `proxy.ts` (Next.js 16's name for middleware) except `/login`, and each page checks the cookie again before it reads data.
- **Read only.** Every query runs inside `BEGIN TRANSACTION READ ONLY ... ROLLBACK` with a 15 second statement timeout, so Postgres itself refuses any write. Queries use parameters only; table and column names come from `information_schema` and are quoted.
- **Secrets hidden.** In the database browser, columns whose names contain token, secret, password, key, refresh, credential, private, cookie or session are replaced with "hidden" inside the SQL, so the value never leaves the database. They are also never searched or sorted on. (This also hides harmless columns such as `settings.key` and `ent_companies.batch_key`. The Overview shows the settings.)
- **Not indexed.** `X-Robots-Tag: noindex`, a robots meta tag and a `robots.txt` that disallows everything. Also `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` and nosniff.
- Nothing logs the password, the secret or the connection string.

## Set it up on Vercel (about 10 minutes)

You need: access to the Vercel account that has `jamie-mcp`, and the Neon database it uses.

1. **Make two secrets.** A password you will type to log in, and a session secret of at least 32 random characters. To make the secret, run this in any terminal and copy the output:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
   (A password manager's "generate password" with 40+ characters works too.)
2. Go to [vercel.com/new](https://vercel.com/new) (**Add New... → Project**).
3. Find **jamie-agent** in the list of GitHub repos and click **Import**.
4. Under **Root Directory**, click **Edit**, choose **`dashboard`**, and click **Continue**. Vercel should now show **Framework Preset: Next.js**. Leave the build and install commands as they are.
5. Give it a name, for example `jamie-dashboard`.
6. Open **Environment Variables** and add:
   - `DASHBOARD_PASSWORD` = the password from step 1
   - `DASHBOARD_SESSION_SECRET` = the secret from step 1
   - `DATABASE_URL` = the same connection string `jamie-mcp` uses. You can copy it from `jamie-mcp` → **Settings → Environment Variables**, or from Neon (**Dashboard → Connect**). Skip this one if you do step 8 instead.
7. Click **Deploy** and wait for it to finish.
8. (Instead of pasting `DATABASE_URL`) In the new project, open the **Storage** tab, click **Connect Database**, pick the existing Neon database that `jamie-mcp` uses, and connect it to Production and Preview. Leave the variable prefix empty, so it adds `DATABASE_URL`. Then go to **Deployments**, open the latest one, and click **Redeploy** so it picks up the variable.
9. Open the project's URL. You should see the login page. Sign in with your password.

Env vars only take effect on a new deployment, so after changing any of them, redeploy.

### Optional: a read-only database user

The app is already read only, but a database user that can only read is a second lock. In the Neon SQL Editor (as the database owner), run, with your own password and owner name:

```sql
CREATE ROLE jamie_dashboard WITH LOGIN PASSWORD 'a-long-random-password';
GRANT CONNECT ON DATABASE neondb TO jamie_dashboard;
GRANT USAGE ON SCHEMA public TO jamie_dashboard;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO jamie_dashboard;
-- Tables Jamie creates later (run as the role that owns Jamie's tables, usually neondb_owner):
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO jamie_dashboard;
ALTER ROLE jamie_dashboard SET default_transaction_read_only = on;
```

Then set `DASHBOARD_DATABASE_URL` to the same connection string with `jamie_dashboard` and its password in place of the owner's, and redeploy. When `DASHBOARD_DATABASE_URL` is set, it is used instead of `DATABASE_URL`.

### What does not change

- The `jamie-mcp` project is untouched. Its build only uses `api/` and `src/` (its `tsconfig.json` includes only those), and this folder has its own `package.json`, so nothing here is built or installed there.
- This project's `vercel.json` skips a deploy when a push did not change anything in `dashboard/`. You can still redeploy by hand at any time.
- Optional: to stop `jamie-mcp` redeploying when only the dashboard changes, set its **Settings → Git → Ignored Build Step** to `git diff --quiet HEAD^ HEAD -- . ':!dashboard'`.

## Run it on your computer

```bash
cd dashboard
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

## Checks

```bash
npm test         # unit tests: session cookie, password check and lockout, secret masking, browser SQL, read-only wrapper
npm run build    # production build (also type checks)
```

## Files

```
proxy.ts                    Auth gate for every route except /login
app/login/                  Login page and the sign-in / sign-out actions
app/(app)/page.tsx          Overview
app/(app)/entrepreneur/     Companies, founders and the company page
app/(app)/applications/     Applications
app/(app)/lessons/          Lessons and handoffs
app/(app)/db/               Table list and the table browser
components/                 Table helpers, pager, SVG bar chart
lib/session.ts              Signed session cookie (Web Crypto HMAC)
lib/password.ts             Constant-time password check and failed-login limiter
lib/readonly.ts             READ ONLY transaction wrapper
lib/db.ts                   Postgres pool (DASHBOARD_DATABASE_URL, else DATABASE_URL)
lib/browse.ts               SQL for the table browser, with secret columns masked
lib/mask.ts                 Which column names count as secret
```
