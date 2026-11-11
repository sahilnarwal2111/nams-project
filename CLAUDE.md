# CLAUDE.md

Guidance for Claude Code when working in this repository. The `maintainer` agent in `.claude/agents/maintainer.md` builds on this file.

## What this is

Website and internal tools for a civil-engineering consultancy ("NK Consultancy", Jind, Haryana). An npm-workspaces monorepo:

- `apps/frontend` — Vite + React 19 single-page site (marketing landing page with an enquiry form, a Work Board kanban, a Payments receivables tracker, and an Enquiries page). Deployed on Vercel from `main`.
- `apps/backend` — Express 5 + Prisma API over Postgres 16. Deployed on Render with the database on Neon; see Deployment.

**Current state:** the Work Board (tasks, employees, saving status moves) and the Payments page (clients, saving logged reminders) use the API when `VITE_API_URL` is set, and fall back to the mock data in `App.jsx` when it is not (as on Vercel today). The landing page's enquiry form posts to the API, and the staff Enquiries page lists what was sent; in mock mode both share an in-memory list held in `App`. The landing page team section reads the public `GET /api/team` in API mode and shows placeholders until it answers.

## Commands (run from the repo root)

```bash
npm install                 # once; installs both workspaces

npm run dev:frontend        # Vite dev server on http://localhost:5173
npm run dev:backend         # API on http://localhost:4000 (needs Postgres, see below)

npm run lint                # ESLint on both apps
npm run build:frontend      # production build to apps/frontend/dist
npm run test:backend        # migrate + seed + API tests (needs Postgres)
npm run test:frontend       # node:test unit tests for src/api.js (no Postgres needed)
npm test                    # backend + frontend tests
npm run check               # lint + build + tests — must pass before any PR

npm run prisma:migrate      # create a migration after editing schema.prisma
npm run prisma:generate     # regenerate the Prisma client
npm run prisma:seed         # (re)load the seed data; upserts, safe to re-run
```

### Local setup

Node 24 on the host; no Docker required. The backend needs a Postgres 16 database reachable at the `DATABASE_URL` in `apps/backend/.env` (copy from `.env.example`; default is `postgresql://nk:nk@localhost:5432/nk_consultancy`). Either run `docker compose up -d` if Docker is available, or a local Postgres with a `nk`/`nk` user and `nk_consultancy` database.

`vite.config.js` sets `server.host: true` and polling file-watching so the dev server also works when the repo is bind-mounted into a container; leave those in place.

## CI

`.github/workflows/ci.yml` runs on every PR and on pushes to `main`: frontend lint + tests + build, and backend lint + tests against a Postgres service container. A PR is not mergeable until it is green.

## Frontend architecture

API access lives in `apps/frontend/src/api.js`: `hasApi()` (true when `import.meta.env.VITE_API_URL` is set; see `apps/frontend/.env.example`), `fetchEmployees`, `fetchTasks`, `updateTaskStatus`, `createTask`, `updateTask`, `deleteTask`, `fetchClients`, `logClientCall`, `createClient`, `updateClient`, `recordPayment`, `fetchPayments`, `deleteClient`, and small pure converters (`taskFromApi`: `assigneeId` → `assignee`; `taskToApi`: the work form's values → request body, blanks as `null`; `clientToApi`, `clientFormError`, `paymentError` and `paymentPatchBody`: the client and payment dialogs' rules, kept out of the components so they can be tested; `clientFromApi`: ISO `invoiceDate` → `YYYY-MM-DD` by UTC day via `dateFromApi`, ISO `lastCall` → `YYYY-MM-DD` by the viewer's local day via `instantFromApi`; `localDay()` is the UI's "today"; `daysAgo` labels a day as "Today" or "N days ago" by calendar day; `enquiryError`, `enquiryToApi` and `enquiryFromApi` are the enquiry form's rules), plus `sendEnquiry`, `fetchEnquiries`, `updateEnquiryStatus` and `deleteEnquiry`. Non-2xx responses throw an `Error` with a readable message. The converters are tested in `apps/frontend/test/api.test.js` with `node:test`. The frontend test script sets `TZ=Asia/Kolkata` so the date tests mean the same thing on CI as in the office. Keep conversions pure and in `api.js`. The Work Board's search, sort and overdue rules (`filterTasks`, `sortTasks`, `SORT_MODES`, `isOverdue`) are pure functions in `apps/frontend/src/board.js`, tested in `apps/frontend/test/board.test.js`. The activity log page's rules (`KIND_FILTERS`, `actorFilters`, `activityQuery`, `groupByDay`, `changeRows`, `valueLabel`, `deviceLabel` and the date labels) are pure functions in `apps/frontend/src/activity.js`, tested in `test/activity.test.js`; `api.js` adds `fetchActivity`. So are the rules for finished work: `boardTasks` keeps only work completed in the last `RECENT_DAYS` (7) on the board, and `completedTasks` / `completedByMonth` order and group everything finished for the Completed list.

The Work Board in API mode shows a loading state, an error with Retry if the load fails (never a silent mock fallback), moves cards optimistically, and rolls back with an error banner if the `PATCH` fails. Without `VITE_API_URL` it behaves as before on the mock data.

The Payments page follows the same pattern in API mode: loading state, error with Retry (no silent mock fallback), and "Log Reminder" updates `lastCall` immediately, then sends `PATCH /api/clients/:id` with an empty body and adopts the `lastCall` the API returns; on failure it restores the previous value and shows an error banner. The summary tiles and status filter are computed from the loaded clients.

Everything else lives in `apps/frontend/src/App.jsx` (~650 lines), top to bottom:

1. `C` — design-token object of hex colors used via inline `style={{ }}` for brand colors, layered with Tailwind utility classes for layout and spacing. Brand colors go through `C`, everything else through Tailwind. Keep that split.
2. Mock data (`SERVICES`, `EMPLOYEES`, `INITIAL_TASKS`, `INITIAL_CLIENTS`) and `*_META` lookups (`STATUS_META`, `PRIORITY_META`, `PAY_STATUS_META`, plus the `WORK_TYPES` list) mapping enum values to label/color. These literal enum values are the contract with the API — see below.
3. Page components: `TopNav`, `Landing`, `WorkBoard` (move-left/move-right buttons, no drag; a search box over the NK number, work, customer, district, department, phone and details; a sort menu for task number, due date, priority or newest; an overdue count, an overdue marker on open cards past their expected completion date and a completion date on finished ones; a `WorkForm` dialog creates, edits and deletes work items, in mock mode too; a Board / Completed tab pair, where `CompletedList` shows all finished work by month, newest first, with Reopen), `Payments` (call logging; `ClientForm` adds, edits and deletes clients and `PaymentForm` records money received through `POST /api/clients/:id/payments`, which reduces the dues and marks a cleared account as paid; `PaymentHistory` lists a client's payments). `EnquiryForm` sits in `Landing` and is public: it validates with `enquiryError`, carries a hidden `website` field that only scripts fill in, and swaps to a thank-you message once sent. `Enquiries` is the staff list, with status filters, Mark Contacted / Close / Reopen (saved optimistically, rolled back with a banner on failure) and delete. The dialogs share `Modal`, `useDialogAction`, `DeleteControl` and `DialogButtons`.
4. `App` — page switching via a `useState` string (`home` / `work` / `completed` / `payments` / `enquiries` / `team` / `activity`). Pages live in the address after `#/` (`#/work`, `#/completed`, `#/payments`, `#/enquiries`, `#/team`, `#/activity`; `work` and `completed` are two views of the same `WorkBoard`, which is not remounted between them), parsed by the pure helpers in `apps/frontend/src/route.js` (tested in `test/route.test.js`), so back, forward and shared links work. There is no router library. Plain anchors such as `#services` and `#enquiry` stay on the landing page and scroll to their section; a page change scrolls to the top. Hash addresses need no Vercel rewrites. `useStaffSession` asks the API whether sign-in is required, the viewer's role (`sessionRole`; mock mode is admin) and, for a personal sign-in, who they are; it reloads the session on sign-out so `SignIn` lists the current people (`signInChoices`: the shared password first and by default, named by `sharedChoiceLabel`, then a profile for every person; one without a password is listed as "no password yet" and cannot be submitted). `SignIn` also warns when the server has no admin password (`methods.admin` false). `WorkBoard` takes `viewer` (`{ isAdmin, employeeId }`): everyone gets New Work and the move buttons, `canEditTask` decides which cards get the edit pencil, and `WorkForm` locks the assignee when a non-admin edits existing work and hides Delete for non-admins. `Team` (API mode, everyone signed in) shows a profile per person with their open and completed work (`workCounts` in `board.js`); only an admin gets the controls to set and remove personal passwords. `Activity` (API mode, admin only, with its own menu item) lists the activity log newest first by day, with Who and What filters, "Show older entries" paging, and rows that open to show before and after, the device and the address; everyone else gets `ActivityUnavailable`. `TopNav` shows the full menu from 1024px (`lg`) and the compact menu below, because the admin's seven items do not fit a tablet. `AccessNote` is the boxed explanation used wherever controls are hidden because of the sign-in: the Work Board tells a non-admin what they can change (the office sign-in also gets a Switch sign-in link), an admin with no personal passwords set gets a pointer to the Team page, and both say so when no admin password exists on the server. `App` passes these pages `access` (`{ adminConfigured, onSwitchSignIn, onOpenTeam }`) only while sign-in is on. `Payments` takes `isAdmin`: staff see "Pending" or "Received" in place of amounts (`paymentPending`) and no Add Client, edit, history or Record Payment controls. `StaffOnly` wraps the Work Board, Payments and Enquiries pages: it shows `SignIn` when a password is set on the server and the browser has no valid token. The landing page is always public. The token lives in `localStorage` (`api.js`), and any 401 clears it and returns to the sign-in screen.

Styling: Tailwind v4 via `@tailwindcss/vite`, entry `src/index.css`, which also defines the custom classes (`f-display`, `f-body`, `f-mono`, `contour-bg`, `grid-bg`, `card-hover`, `no-scrollbar`) and imports Google Fonts. **The Google Fonts `@import` must stay above `@import "tailwindcss"`** — CSS requires all `@import`s before other rules and Tailwind's import expands into generated rules, so reversing them breaks the build.

Icons: `lucide-react`. ESLint flags unused imports as errors, so remove icons you stop using.

## Backend architecture

```
apps/backend/
  src/server.js            loads .env, starts the app
  src/app.js               Express app: CORS, JSON, routes, error handler
  src/routes/*.routes.js   one router per resource
  src/controllers/*.js     handlers; Prisma calls live here
  src/lib/prisma.js        shared PrismaClient
  src/lib/rateLimit.js     small in-memory per-key limit
  src/lib/activity.js      the activity log: inTransaction, lockAndFind, diff, logActivity
  src/lib/httpError.js     HttpError, thrown inside a transaction to answer with a status
  prisma/schema.prisma     Employee (with `passwordHash`), Task, Client, Payment, Enquiry, ActivityLog
  prisma/migrations/       committed migrations
  prisma/seed.js           seed data mirroring the frontend mocks
  test/api.test.js         node:test suite hitting the real app over HTTP
```

Endpoints today (all under `/api`):

| Method and path | Request body | Success | Errors |
| --- | --- | --- | --- |
| `GET /api/health` | none | 200 `{ status: "ok" }` | none |
| `GET /api/auth/session` | none | 200 `{ required, authenticated, role, employeeId, name, people, methods }`; `role` is `admin`, `staff` or `null`; `employeeId`/`name` are set for a personal sign-in; `people` lists every employee as `{ id, name, hasPassword }` (empty while sign-in is off); `methods` is `{ admin, office }`, whether each shared password is set on the server; never 401 | none |
| `POST /api/auth/login` | `{ password, as? }`; `as` is an employee id for a personal sign-in; otherwise (`shared`, `admin`, `office` or nothing) the password alone decides between admin and office | 200 `{ token, expiresAt, role }`, plus `employeeId` for a personal sign-in | 400 if login is switched off, 401 on a wrong password or a person without one, 429 after 8 wrong attempts from one address (15-minute wait) |
| `GET /api/team` | public, no token | 200, `[{ id, name, role, initials }]` for the landing page | none |
| `GET /api/employees` | none | 200, list of employees; admins also get `hasPassword` | none |
| `PUT /api/employees/:id/password` | admin only: `{ password }`, 6 to 200 characters | 204; replaces any old one and signs that person out | 400 on a bad password, 403 for non-admins, 404 if the employee is unknown |
| `DELETE /api/employees/:id/password` | admin only | 204; the person can no longer sign in on their own | 403 for non-admins, 404 if the employee is unknown |
| `GET /api/tasks` | none | 200, list of tasks | none |
| `GET /api/tasks/:id` | none | 200, the task | 404 if the task is unknown |
| `POST /api/tasks` | anyone signed in: `{ title, client, assigneeId, priority, status? }` plus the optional work details below; `status` defaults to `todo` | 201, the task; id generated as highest `NK-###` + 1 | 400 `{ error }` on missing/empty fields, invalid `priority`/`status`, unknown `assigneeId`, or an invalid work detail |
| `PATCH /api/tasks/:id` | any of `title`, `client`, `assigneeId`, `priority`, `status` and the work details below; only the fields sent change; `id`/`updatedAt` are ignored | 200, the updated task | 400 `{ error }` on an empty body, empty `title`/`client`, invalid `priority`/`status`, unknown `assigneeId`, or an invalid work detail; 403 when a non-admin sends anything besides `status` for work that is not theirs, reassigns their own, or uses the office sign-in to edit details; 404 if the task is unknown |
| `DELETE /api/tasks/:id` | admin only | 204, no body; permanently deletes | 404 `{ error }` if the task is unknown |
| `GET /api/clients` | none | 200, list of clients; `due` is left out for staff | none |
| `POST /api/clients` | required `name`, `contact`, `phone` (non-empty strings), `due` (integer >= 0 rupees), `invoiceDate`, `status` (`paid\|due-soon\|overdue`); optional `notes`, `lastCall` (defaults to now); dates accept `YYYY-MM-DD` or a full ISO timestamp | 201, the client; id generated as highest `c#` + 1 | 400 `{ error }` on a missing field, invalid `status`, negative/non-integer `due`, or unparseable date |
| `PATCH /api/clients/:id` | any of `name`, `contact`, `phone`, `due`, `invoiceDate`, `lastCall`, `status`, `notes`, validated like `POST /api/clients` (`notes` may be `null` to clear it); only the fields sent change and `lastCall` is untouched unless sent; `id` and unknown keys are ignored; with no body, an empty body, or no editable fields it logs a call, setting `lastCall` to now | 200, the updated client | 400 `{ error }` on any invalid field, including `null` for anything but `notes`; 404 if the client is unknown |
| `DELETE /api/clients/:id` | none | 204, no body; permanently deletes | 404 `{ error }` if the client is unknown |
| `GET /api/clients/:id/payments` | none | 200, the client's payments, newest first | 404 if the client is unknown |
| `POST /api/clients/:id/payments` | `{ amount, note?, receivedAt? }`; `amount` is whole rupees above zero | 201 `{ payment, client }`; the payment is stored and `due` is lowered in one transaction, and a cleared client becomes `paid` | 400 `{ error }` on a bad amount, an amount above the dues, or a bad `note`/`receivedAt`; 404 if the client is unknown |
| `POST /api/enquiries` | public, never needs a token: `{ name, phone, message? }`; `name` up to 100 characters, `phone` 7 to 15 digits with spaces, `+`, `-` and brackets allowed, `message` up to 1000 characters; `status`, `id` and `createdAt` in the body are ignored | 201 `{ received: true }`; the stored record is not returned | 400 `{ error }` on a bad field; 429 after 5 enquiries in an hour from one address |
| `GET /api/enquiries` | none | 200, all enquiries, newest first | none |
| `PATCH /api/enquiries/:id` | `{ status }`, one of `new\|contacted\|closed`; nothing else can change | 200, the updated enquiry | 400 `{ error }` on a missing or invalid `status`; 404 if the enquiry is unknown |
| `DELETE /api/enquiries/:id` | none | 204, no body; permanently deletes | 404 `{ error }` if the enquiry is unknown |
| `GET /api/activity` | admin only; query, all optional: `limit` (1 to 200, default 50), `before` (an entry id, for the next page), `actor` (an employee id, or `person\|admin\|office\|public\|unknown\|open`), `type` (`task\|client\|payment\|enquiry\|employee\|session`), `entityType` + `entityId` together (everything done to one record) | 200 `{ entries, nextBefore }`, newest first; `nextBefore` is `null` on the last page | 400 `{ error }` on a bad query value; 403 for non-admins. There is no route that edits or removes an entry |

Enquiries: `POST /api/enquiries` is the only write open to the public, so it is deliberately narrow. It stores three text fields, is limited per address by `src/lib/rateLimit.js` (in memory, resets on restart), and silently drops any submission that fills the hidden `website` field while still answering 201. Reading, updating and deleting need staff sign-in like the rest of the API; the router applies `requireAuth` per route. Enquiry ids are plain integers.

Activity log (`src/lib/activity.js`, model `ActivityLog`): the record of who did what and when, kept so that a change to the data can always be traced to a sign-in. The rules:

- **Every handler that changes data writes an entry in the same transaction as the change**: `inTransaction(async (tx) => { const before = await lockAndFind(tx, "task", id); ...change with tx...; await logActivity(tx, req, { action, entityType, entityId, summary, changes: diff(before, after) }); })`. A change cannot be saved without its entry, and a refused or failed change leaves none. A new write endpoint that skips this is a bug; its tests must assert the entry.
- An entry holds: `at` (set by the database), the actor (`actorType` `person\|admin\|office\|public\|unknown\|open`, `actorId` for a personal sign-in, `actorName` as it was then), `action` (`<type>.<verb>`: `task.created\|moved\|updated\|deleted`, `client.created\|updated\|call_logged\|deleted`, `payment.recorded`, `enquiry.received\|status_changed\|deleted`, `employee.password_set\|password_removed`, `session.signed_in\|sign_in_failed`), the record (`entityType`, `entityId`, plain values with no foreign key so entries outlive the record; a payment is filed under its client), a one-line `summary` that reads on its own, `changes` as `{ field: { from, to } }`, and `ip` and `userAgent`.
- A deleted record's last entry holds all its fields (and a deleted client's payments), so it can be read back. Saving without changing anything writes no entry. Reads are not logged.
- **Never put a password, hash or token in an entry.** `diff` skips `passwordHash` and `updatedAt`; password entries carry no `changes`.
- **Append-only.** There is no route that edits or deletes entries, and the migration adds triggers that make the database refuse `UPDATE`, `DELETE` and `TRUNCATE` on `ActivityLog`. Do not add a way round this. It also means tests cannot clean the log up: they look only at entries newer than a mark taken at the start (`newestLogId` / `logSince` in the tests).
- Reading is admin only (`GET /api/activity`), because entries hold amounts.
- The two shared passwords are logged as "Admin" and "Office sign-in": the log cannot tell which person used a shared password, only the address and device. Named entries need personal sign-ins.
- Task and client numbers are reused after the highest one is deleted (highest + 1), so one `entityId` can cover two records over time; the `deleted` and `created` entries mark the boundary.
- `HttpError` (`src/lib/httpError.js`) is how a handler stops a transaction with a 4xx: throw it inside, `sendHttpError(res, err)` in the catch.

Task timestamps: the API sets `createdAt` when a task is created and `completedAt` when its status first becomes `done`, and clears `completedAt` when it leaves `done`. Both are read-only (ignored in request bodies) and `null` on tasks that predate 2026-11-11. The frontend keeps `createdAt` as a timestamp for ordering and shows `completedAt` as the viewer's local day.

Work details on a task (all optional, from the "new work" form): `customerPhone`, `district`, `department`, `details` (strings; blank or `null` clears), `workTypes` (a list drawn from `survey`, `x-section`, `drawing`, `design`, `printout`; returned in that fixed order), `expectedCompletion` (`YYYY-MM-DD` or an ISO timestamp; `null` or `""` clears).

Sign-in and roles (`src/lib/auth.js`): two shared passwords in environment variables plus personal passwords. Both environment values are trimmed, so a stray space or line break in the Render dashboard does not lock anyone out; typed passwords are compared exactly. `APP_PASSWORD` is the office password and signs in as `staff` with no name. `ADMIN_PASSWORD` signs in as `admin`. Each employee can also be given their own password by the admin (`PUT /api/employees/:id/password`, the Team page); it is stored as an scrypt hash in `Employee.passwordHash` and never returned. Signing in with it gives `staff` plus that `employeeId`. While both shared passwords are unset the API is open with admin rights, which is the local and test default, and personal passwords do nothing. Once either is set, every endpoint except `/api/health`, `/api/auth/*`, `GET /api/team` and `POST /api/enquiries` needs `Authorization: Bearer <token>` and answers 401 without it. Shared tokens are `<role>.<expiry>.<signature>` signed with a key derived from that role's password; personal tokens are `person.<employee id>.<expiry>.<signature>` signed with a key derived from the stored hash, so a new or removed password signs that person out. `requireAuth` is async because personal tokens need a database lookup.

Work Board rules, enforced in `tasks.routes.js` and `updateTask`: everyone signed in, the office sign-in included, can read the board, add work, and move any card to any status (a `PATCH` whose only field is `status`). Editing the other fields needs an admin or a personal sign-in on work assigned to that person, who may not reassign it (403). Only an admin deletes work.

Money is admin only, and the server enforces it: `requireAuth` sets `req.role`, and `requireAdmin` answers 403 `{ error }`. Staff get `GET /api/clients` without the `due` field (the `status` still says paid, due soon or overdue) and may send `PATCH /api/clients/:id` only with no editable fields, which logs a reminder call. Creating, editing and deleting clients and both payments endpoints need an admin. With only `APP_PASSWORD` set, nobody can see amounts. Client `notes` are free text and are shown to staff, so amounts should not be written there. Never return `due` or payment amounts from a new endpoint without checking the role.

Payments: `Payment` rows are the history behind `Client.due`. Record money received through the payments endpoint, not by editing `due`, so the two stay in step. Deleting a client deletes its payments. Payments made before 2026-11-11 were never recorded, so the history does not add up to the original invoice.

Design decisions to preserve:

- **IDs are the frontend's human-readable values** (`e1`, `NK-101`, `c1`), not generated. Keeps the API's output identical to the mock data.
- **Enum-like fields are plain strings** matching the frontend exactly: task `status` `todo|inprogress|done`, task `priority` `low|medium|high`, task `workTypes` entries `survey|x-section|drawing|design|printout`, client `status` `paid|due-soon|overdue`, enquiry `status` `new|contacted|closed`. No Prisma enums, no case or hyphen remapping.
- **Dates:** the API returns ISO timestamps; the UI uses `YYYY-MM-DD`. Convert in the frontend at the fetch boundary. A calendar date with no time (an invoice date) is stored as midnight UTC and read by its UTC day; a moment in time (a logged call) is read by the viewer's local day. Mixing the two makes "today" wrong before 05:30 IST.
- Unknown IDs return 404 (Prisma `P2025`); anything else falls through to the 500 handler in `app.js`.
- CORS: `CORS_ORIGINS` is a comma-separated allowlist with `*` wildcards; unset allows everything (fine locally, not in production).

Tests run against a real database: `npm test` in the backend runs `prisma generate` and `prisma migrate deploy`, seeds, then `node --test`. Tests that write must restore what they changed (the activity log is the exception: it cannot be cleaned, by design).

## Rules for changes

- Branch from `main`; never commit to `main` directly. PRs must pass CI.
- Every bug fix gets a test that would have caught it; every new endpoint gets tests.
- Schema changes always come with a migration. Never edit a migration that is already on `main`.
- Keep `.env` untracked. Only `.env.example` is committed.
- Don't add a router, TypeScript, or a state library as a side effect of another change; those are their own decisions.

## Deployment

Frontend: Vercel, deploying `main`; every PR gets a preview URL. `vercel.json` sets `framework: vite` and `outputDirectory: dist` because Vercel's auto-detection expected `build/`.

Backend: Render free web service (Singapore) with the database on Neon's free plan. `render.yaml` at the repo root is the Render Blueprint.

- Build: `npm ci --include=dev && npm run build:backend`, which runs `prisma generate` and `prisma migrate deploy`. New migrations are applied on every deploy.
- Start: `npm run start:backend`. Render sets `PORT`; health check is `/api/health`.
- Render redeploys only when `apps/backend/**`, the root `package.json`, `package-lock.json` or `render.yaml` change.
- `DATABASE_URL` (Neon, direct connection string) and `CORS_ORIGINS` are set in the Render dashboard, never in the repo. `CORS_ORIGINS` is `https://nams-project.vercel.app,https://nams-project-*-sahilnarwal2111s-projects.vercel.app`.
- The frontend uses the hosted API only when `VITE_API_URL` is set in the Vercel project settings.
- Seeding is a one-time manual step: `DATABASE_URL=<neon url> npm run prisma:seed` from a laptop. Do not add the seed to the build: it upserts and would overwrite edits to the seeded records on every deploy.
- The free web service sleeps after 15 idle minutes, so the first request after a quiet spell can take up to a minute.
- `APP_PASSWORD` (staff) and `ADMIN_PASSWORD` (admin, sees amounts) are set in the Render dashboard. If neither is set the hosted API is open to anyone with admin rights, so keep real client data off it until they are.

The remote also has a stale `master` branch holding only the first commit; `main` is the default.
