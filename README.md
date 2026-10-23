# LOG — Lots of Growth · Task Management Platform

An internal operating system for the LOG marketing agency. It covers the work from the first client meeting to the approved deliverable: clients, projects, tasks and subtasks, hand-offs between people, scheduling with availability checks, submissions and reviews, dashboards, notifications and an audit trail.

The UI has an animated dark theme (aurora background, glass panels, motion). A light theme is one click away.

---

## Stack and why

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js 16** (App Router) + **React 19** + **TypeScript** | One codebase for UI and API, deploys natively to Vercel |
| Database | **PostgreSQL** with **Prisma 6** migrations | Same engine locally and on **Supabase**; strong relational integrity |
| Local DB | `embedded-postgres` (real Postgres binaries from npm) | Real Postgres on a laptop with **no Docker and no install** |
| Auth | Custom server sessions: bcrypt (12 rounds) passwords, HMAC-hashed session tokens in `httpOnly; SameSite=Lax` cookies, login rate limiting | Works the same locally and on Vercel + Supabase with no external service. Supabase Auth would need a running Supabase stack (Docker) for local dev, so it was not used. |
| Authorization | Server-side RBAC on **every** service call, plus Row Level Security on every table | Hiding a button is never the security boundary |
| Files | Private storage driver: `./storage` locally, **private Supabase Storage bucket** when configured | Files are only served through an authorised route, never a public URL |
| UI | Tailwind CSS 4, `motion`, `@dnd-kit`, FullCalendar 6, Recharts, cmdk, sonner, lucide | |
| Tests | Vitest: unit + integration (throw-away Postgres DB per run) + HTTP end-to-end | |

---

## Quick start (local)

Prerequisites: **Node.js 20+** (built on Node 24) and npm. Nothing else.

```bash
npm install
```

```bash
cp .env.example .env
```

Put random values in `SESSION_SECRET` and `CRON_SECRET` in `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Start the local PostgreSQL server in its **own terminal** and leave it running. Data persists in `./.pgdata`.

```bash
npm run db:start
```

In a second terminal, apply the migrations, generate the client, and seed the test accounts and demo data:

```bash
npm run setup
```

```bash
npm run dev
```

Open **http://localhost:3100**.

---

## Local development · test accounts

> ⚠️ **Development and test only.** These predictable credentials are created only when `APP_ENV` is `development` or `test`. The seed **refuses** to create them when `APP_ENV`/`NODE_ENV` is `production`. The quick sign-in buttons on the login page appear only in development.

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@log.local` | `LOG_Admin_2026!` |
| Account Manager | `account.manager@log.local` | `LOG_Account_2026!` |
| Performance Manager | `performance.manager@log.local` | `LOG_Performance_2026!` |
| Production Manager | `production.manager@log.local` | `LOG_Production_2026!` |
| Employee | `employee@log.local` | `LOG_Employee_2026!` |

The seed also creates five synthetic colleagues (`*.demo@log.local`) so team schedules and hand-offs have people to work with. They **cannot sign in**. All synthetic records are flagged `isTestAccount` / `isDemo`, and test accounts show a yellow "Test account" strip in the UI.

### Real business identities

The seed creates the real people with the correct roles and **no usable password**:

| Person | Email | Role |
|---|---|---|
| Mostafa Makady | m.makady@lotsofgrowthgroup.com | Administrator |
| Omar Hassan | o.hassan@lotsofgrowthgroup.com | Administrator |
| Rawan | rawan@lotsofgrowthgroup.com | Account Manager |

To activate one of them:
- **In the app:** Admin → Users → *Generate reset link*. The single-use link expires after 60 minutes.
- **Locally from the CLI** (development only):

  ```bash
  npm run dev-reset-password -- rawan@lotsofgrowthgroup.com
  ```

- **Production first admin:** see [Production: first administrator](#production-first-administrator).

An email address on its own never grants privileges. Roles are only ever set by the seed, an administrator, or the operator CLI.

### Password reset without an email service

`/forgot-password` always gives the same answer, so it cannot be used to discover which accounts exist. It notifies administrators in the app, and they issue a reset link from **Admin → Users**. In local development the link is also printed to the **server console**, never to the browser.

---

## How to test every role (5 minutes)

Use the quick sign-in buttons on the login page.

1. **Administrator** — the dashboard shows company KPIs, charts, workload and recent activity. Try **Admin → Users / Teams / Audit log**. Create a client, then a project with *Test Account Manager* as account manager. Then **New task** (press `N`): pick the project, department *Account Management*, assignee *Test Account Manager*.
2. **Account Manager** — open the new task → *Add subtask*. Route one subtask to **Performance**, assigned to *Test Performance Manager*, and one to **Production**, assigned to *Test Production Manager*. Notice the assignee list only contains eligible, active people.
3. **Performance Manager** — open the routed task → *Add subtask*, assign *Test Employee*, set a deadline. Open **Team schedule** and drag the task onto a day in the employee's lane: availability is checked first. Drag it onto *Nour Adel (demo)*'s name to hand it off, then back.
4. **Employee** — on **My board**, drag the card to *In Progress* (or click **Start**), tick checklist items, start the **timer**, then **Submit for review** with notes, a link and a file.
5. **Performance Manager** — the notification bell shows the submission. Open it → **Request changes**: a reason is mandatory.
6. **Employee** — the dashboard shows it under *Returned for changes* with the feedback banner. **Resubmit**: revision 2 is added and revision 1 is kept.
7. **Performance Manager** — **Approve**. The task's *History* and *Submissions* tabs show the whole trail.
8. **Production Manager** — confirm you can't see or edit Performance tasks. A direct URL like `/tasks/<performance task number>` returns *Task unavailable*.

Try the scheduling rules: in **Calendar → Week**, drag a block outside working hours, onto Friday, onto someone's leave (*Karim Fathy (demo)* has seeded leave), or over another booking. You get **"[Name] is unavailable at the selected time."** with the reasons and the next free slots. The block snaps back if saving fails.

---

## Features

**Organization**
- Users, departments, teams, team managers, active/inactive, working days and hours, weekly capacity, leave.
- Deactivated users keep their history but cannot receive new work.

**Clients and projects**
- Full CRUD with search and filters, account manager assignment, requirements, and progress computed from the tasks you can see.
- Employees never see client contact data.

**Tasks**
- References like `LOG-123`, parent tasks and nested subtasks, department routing, assignee, reviewer, priority, start date, deadline, scheduled block, estimate vs. logged time, labels, checklist, dependencies (cycle-checked), comments, files, links.
- Each task keeps a full activity timeline and an ownership trail.
- Duplicate, archive/restore, cancel with a reason, bulk actions, CSV export, and templates (Social Media Campaign, Paid Ads Launch, Video Production, Landing Page) that create subtasks and checklists.

**Workflow**
- Backlog → Ready → Scheduled → In Progress → Submitted for Review → Changes Requested / Approved, plus Blocked, On Hold and Cancelled.
- The state machine lives in [`src/lib/workflow.ts`](src/lib/workflow.ts) and is enforced on the server.
- Overdue is **computed** from the deadline and completion state, never stored as a status.
- Submissions are immutable revisions with notes, links and files, and each review records its decision and feedback.
- A parent task cannot be approved while subtasks are still open.
- Work cannot start while its dependencies are unfinished.

**Moving work between people without contradictions**
- Every change of owner goes through **one server function**. It checks eligibility (active, right department, within the manager's scope) and the new owner's availability for any booked slot. If they are busy, it offers "clear the slot, keep the deadline".
- It records a **hand-off** (from → to, by whom, with a note), notifies both people, stops the old owner's running timer, and writes the audit log.
- **Optimistic concurrency:** every task has a `version`. A save based on a stale copy is rejected with "This task was just changed by someone else" instead of overwriting the other person's change.
- Scheduling locks the person's row (`SELECT … FOR UPDATE`) so two managers cannot double-book someone at the same moment.
- Double-clicking Submit or Approve cannot create duplicates.

**Views**
- **Board (Kanban):** columns per status, or **swimlanes per person** (managers), where dragging a card into another person's row hands it off. Drops are validated and roll back on failure.
- **Calendar:** Day / Week / Month / Agenda views covering my schedule, an employee, a team, a department, a project, or company-wide. It shows work blocks (fill = status, edge = priority), **all deadlines** (dashed, and managers can drag them), and leave. Drag from the unscheduled queue, drag to move, resize to change duration.
- **Team schedule:** one lane per employee and a column per day, with daily capacity bars and leave shading. Drag between days or people, or onto a name to reassign only.
- **Task list:** filters, sorting, pagination, bulk actions, CSV export.
- **Command palette** (`Ctrl/⌘ K`): search tasks, projects and people, or jump anywhere. Press `N` for a new task.

**Dashboards and reports** (all computed from database records)
- **Admin:** company KPIs, created vs. completed per day, status distribution, workload by department and person, project progress, upcoming deadlines, recent activity.
- **Account Manager and department managers:** the same, scoped to what they manage.
- **Employee:** today's schedule, due today, upcoming, overdue, returned for changes, awaiting review, recently completed, hours logged.
- **Reports:** per-person delivery (open, overdue, completed, on-time %, average revisions, changes requested, hours logged) with date ranges and CSV export.

**Notifications and audit**
- In-app notifications for assignment, reassignment, deadline changes, due within 24h, overdue, comments and mentions, submission, resubmission, approval, changes requested, blocked, and scheduling. They are stored per user with read/unread state.
- The client polls every 20 s. Deadline reminders come from a daily Vercel Cron (`/api/cron/deadlines`) and are also swept lazily at most every 10 minutes.
- The audit log (admin only) records actor, role, action, entity, before/after values and IP.

### Metric definitions

| Metric | Definition |
|---|---|
| Open | Not Approved/Cancelled, not archived |
| Completed | Approved (`completedAt`) within the range |
| Overdue | Open with a deadline before now |
| Completion rate | Of tasks created in the range (excluding cancelled), the share already approved. Shows "—" when none were created. |
| On-time rate | Of tasks approved in the range that had a deadline, the share approved on or before it. Shows "—" when none. |
| Booked / capacity | Scheduled minutes in the next 7 days ÷ the person's weekly capacity |

### Scheduling rules

- Working hours default to **Sunday–Thursday, 09:00–18:00, Africa/Cairo**. Change the defaults per person in Admin → Users, and the company timezone with `APP_TIMEZONE`.
- A booking must fall on a working day, inside working hours, within one day, must not overlap the person's leave or other live bookings, and must not start before a dependency is scheduled to finish.
- The check runs **on the server for every write**. The UI only shows the result.
- Times are stored in UTC and shown in the browser's timezone, which is expected to be the company's.

---

## Tests

```bash
npm test
```

Runs **unit + integration tests**. Each run creates a **fresh throw-away database** `log_test_<timestamp>` on the local server, migrates and seeds it, and drops only that database at the end. Your dev data is never touched. Requires `npm run db:start` to be running.

```bash
npm run test:e2e
```

Runs **HTTP end-to-end tests** against a running server (`npm run dev` or `npm start`). Set `LOG_BASE_URL` to point at a preview deployment instead.

```bash
npm run typecheck
```

What is covered:
- **Authentication:** login, wrong password, rate limiting, logout, password change, single-use and expiring reset links, inactive users.
- **Permissions:** employees cannot read or modify other employees' tasks (404, not 403); no self-approval; Account Manager cannot manage users or see the audit log; Performance and Production Managers are isolated from each other's departments; employees cannot see clients; admins see everything; an email alone never grants admin.
- **Workflow:** the full admin → AM → manager → employee chain, invalid transitions, mandatory reason for changes, resubmission with revision history, the parent approval gate, deadline audit, hand-off records, stale-version conflicts, parent and dependency cycles, the dependency start gate, validation of bad references.
- **Calendar:** scheduling, moving, overlap detection with the exact message and suggestions, working hours, leave, reassigning to a busy person, cross-scope scheduling.
- **Data integrity:** the seed reruns without duplicates, refuses test accounts in production, enforces required fields and team rules, and dashboard metrics match the stored rows.
- **HTTP:** health check, 401/redirects, cookie flags, every role signs in, object-level access control, CSRF origin check, logout, security headers.

---

## Resetting the local database

Option 1, using Prisma. Prisma asks for confirmation because it **erases all local data**:

```bash
npm run db:reset
```

Option 2, a clean slate by hand. Stop `npm run db:start`, delete the `.pgdata` folder, start it again, then run:

```bash
npm run setup
```

Re-running `npm run seed` at any time is safe: users are upserted, test passwords are reset to the documented values, and demo data is created only once.

---

## Deploying: GitHub → Vercel + Supabase

### 1. GitHub (private repository)

```bash
git init
```

```bash
git add -A
```

```bash
git commit -m "LOG task management platform"
```

Create a **private** repository on GitHub and push to it. `.env`, `.pgdata/` and `storage/` are git-ignored, so never commit secrets.

### 2. Supabase

1. Create **two** projects: `log-preview` for Preview deployments and test data, and `log-production` for Production.
2. In **Project Settings → Database → Connection string**, copy:
   - the **Transaction pooler** URI (port 6543) → `DATABASE_URL`, with `?pgbouncer=true&connection_limit=1` appended
   - the **Session pooler / direct** URI (port 5432) → `DIRECT_URL`, which migrations use
3. In **Storage**, create a **private** bucket called `log-attachments` (public access **off**).
4. In **Project Settings → API**, copy the project URL → `SUPABASE_URL`, and the `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`. This key is server-only and never sent to the browser.
5. Row Level Security: migration `row_level_security` turns on RLS for **every** table with no policies, and revokes table access from `anon` / `authenticated`. Supabase's public Data API therefore cannot read business data. The app reaches Postgres only from the server.

### 3. Vercel

1. Import the GitHub repository. The framework is auto-detected as Next.js, and the build command comes from `vercel.json` (`npm run vercel-build`, which runs `prisma generate && prisma migrate deploy && next build`).
2. Add the environment variables in **Settings → Environment Variables**. Use the Preview Supabase project for the *Preview* environment and the Production project for *Production*:

| Name | Notes |
|---|---|
| `DATABASE_URL` | Supabase transaction pooler URI |
| `DIRECT_URL` | Supabase direct/session URI (migrations) |
| `SESSION_SECRET` | 32+ random bytes, different per environment |
| `CRON_SECRET` | Random string; Vercel Cron sends it as a Bearer token |
| `APP_ENV` | `preview` or `production` |
| `APP_URL` | The deployment's base URL |
| `APP_TIMEZONE` | `Africa/Cairo` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only |
| `SUPABASE_STORAGE_BUCKET` | `log-attachments` |
| `MAX_UPLOAD_MB` | `4` (Vercel limits function request bodies to ~4.5 MB) |
| `ALLOW_TEST_ACCOUNTS` | `true` **only** on the isolated Preview database, if you want the test logins there |

3. Push a branch or open a PR. Vercel builds a **Preview** deployment against the preview database. Seed it from your machine:

   ```bash
   DATABASE_URL="<preview direct url>" DIRECT_URL="<preview direct url>" APP_ENV=preview ALLOW_TEST_ACCOUNTS=true npx tsx prisma/seed.ts
   ```

   Then run the HTTP tests against it:

   ```bash
   LOG_BASE_URL="https://<preview>.vercel.app" npm run test:e2e
   ```

4. When the preview is verified, merge to `main` to promote to **Production**.

### Production: the real team (recommended)

1. Edit the people in [`scripts/roster.ts`](scripts/roster.ts): 3 admins, Rawan, a Performance Manager, a Production Manager and the employees. Placeholder names say "(rename me)".
2. With the production database URL in the environment, run:

   ```bash
   npm run provision-users
   ```

   Every listed person gets a new one-time password, written **only** to `CREDENTIALS.local.md` on your computer (git-ignored). They must change it at first sign-in. The script also creates the two teams and the private file bucket. Re-running it issues new passwords.
3. To wipe all tasks, projects, clients and test accounts (a "fresh start"), keeping departments, templates and real users:

   ```bash
   npm run purge-test-data -- --yes
   ```

### Production: first administrator

1. Seed the production reference data. This creates departments, templates and the real identities without passwords. No test accounts are created because `APP_ENV` is production.

   ```bash
   DATABASE_URL="<prod direct url>" DIRECT_URL="<prod direct url>" APP_ENV=production npx tsx prisma/seed.ts
   ```

2. Create or promote the first admin. A one-time password is printed once and must be changed at first sign-in:

   ```bash
   DATABASE_URL="<prod direct url>" npx tsx scripts/create-admin.ts --email m.makady@lotsofgrowthgroup.com --promote
   ```

3. Sign in, change the password, then invite everyone else from **Admin → Users**. Each new user gets a single-use setup link.

### Backups and recovery

- **Supabase Free:** no automatic backups. Schedule a logical dump, for example a nightly GitHub Action or a laptop task. Store dumps privately.

  ```bash
  pg_dump "$DIRECT_URL" -Fc -f log-$(date +%F).dump
  ```

- **Supabase Pro and above:** daily backups (7+ days) are automatic, and Point-in-Time Recovery is an add-on. Restore from **Database → Backups**.
- **Restore a dump** into a fresh project:

  ```bash
  pg_restore --no-owner -d "$DIRECT_URL" log-YYYY-MM-DD.dump
  ```

  Then redeploy. Migrations are idempotent (`prisma migrate deploy`).
- Attachments live in Supabase Storage. Include the bucket in your backup routine (`supabase storage` CLI or `rclone`).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Can't reach database server at localhost:5433` | Start `npm run db:start` in its own terminal |
| Login says "Too many failed attempts" | Wait 15 minutes, or run `npm run seed`, which resets test passwords (lockout counts the last 15 min) |
| Uploads fail on Vercel | Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` and create the private bucket. Local disk is not persistent on Vercel. |
| `P1001` / timeouts on Vercel | Use the **pooler** URI with `?pgbouncer=true&connection_limit=1` for `DATABASE_URL` |
| `prisma migrate deploy` fails in the Vercel build | Check `DIRECT_URL` (port 5432) for that environment |
| Port 3100 busy | `npm run dev -- -p 3200` and update `APP_URL` |

---

## Known limitations

- **Real-time:** notifications and views refresh by polling (20 s) and after your own actions, not over websockets.
- **Email:** no email delivery. Reset links and invitations are created by admins in the app (or printed to the console in dev). An SMTP/Resend integration can be added in `src/app/api/auth/forgot/route.ts`.
- **One scheduled block per task:** split long work into subtasks to book multiple sessions.
- **Calendar timezone:** the calendar renders in the browser's timezone. Availability rules use `APP_TIMEZONE`.
- **Uploads:** limited by `MAX_UPLOAD_MB` (default 4 MB because of Vercel's body limit). Share larger files as links in the submission.
- **Mentions:** the API supports mentions (notifying only people who can see the task), but the comment box has no @-autocomplete yet.
- **Deployment:** this environment had no GitHub, Vercel or Supabase access, so the project has **not** been deployed. Follow the steps above.

## Project layout

```
prisma/            schema, migrations (incl. RLS), idempotent seed
scripts/           db-server (local Postgres), create-admin, dev-reset-password
src/server/        auth, sessions, permissions (RBAC scopes), audit, services (tasks, availability, org, clients, analytics, files, planning)
src/app/api/       thin route handlers (auth + CSRF + error mapping in src/server/api.ts)
src/app/(app)/     dashboard, tasks, board, calendar, team, projects, clients, reports, availability, templates, admin, settings
src/components/    design system (ui.tsx), shell, task drawer, dialogs, charts
tests/             unit, integration (throw-away DB), e2e (HTTP)
```
