# CLAUDE.md

Guidance for Claude Code when working in this repository. The `maintainer` agent in `.claude/agents/maintainer.md` builds on this file.

## What this is

Website and internal tools for a civil-engineering consultancy ("NK Consultancy", Jind, Haryana). An npm-workspaces monorepo:

- `apps/frontend` — Vite + React 19 single-page site (marketing landing page, a Work Board kanban, and a Payments receivables tracker). Deployed on Vercel from `main`.
- `apps/backend` — Express 5 + Prisma API over Postgres 16. Deployed on Render with the database on Neon; see Deployment.

**Current state:** the Work Board (tasks, employees, saving status moves) and the Payments page (clients, saving logged reminders) use the API when `VITE_API_URL` is set, and fall back to the mock data in `App.jsx` when it is not (as on Vercel today). The landing page team section still uses mock data and does not call the API yet.

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

API access lives in `apps/frontend/src/api.js`: `hasApi()` (true when `import.meta.env.VITE_API_URL` is set; see `apps/frontend/.env.example`), `fetchEmployees`, `fetchTasks`, `updateTaskStatus`, `createTask`, `updateTask`, `deleteTask`, `fetchClients`, `logClientCall`, `createClient`, `updateClient`, `recordPayment`, `deleteClient`, and small pure converters (`taskFromApi`: `assigneeId` → `assignee`; `taskToApi`: the work form's values → request body, blanks as `null`; `clientToApi`, `clientFormError`, `paymentError` and `paymentPatchBody`: the client and payment dialogs' rules, kept out of the components so they can be tested; `clientFromApi`: ISO `invoiceDate` → `YYYY-MM-DD` by UTC day via `dateFromApi`, ISO `lastCall` → `YYYY-MM-DD` by the viewer's local day via `instantFromApi`; `localDay()` is the UI's "today"). Non-2xx responses throw an `Error` with a readable message. The converters are tested in `apps/frontend/test/api.test.js` with `node:test`. The frontend test script sets `TZ=Asia/Kolkata` so the date tests mean the same thing on CI as in the office. Keep conversions pure and in `api.js`.

The Work Board in API mode shows a loading state, an error with Retry if the load fails (never a silent mock fallback), moves cards optimistically, and rolls back with an error banner if the `PATCH` fails. Without `VITE_API_URL` it behaves as before on the mock data.

The Payments page follows the same pattern in API mode: loading state, error with Retry (no silent mock fallback), and "Log Reminder" updates `lastCall` immediately, then sends `PATCH /api/clients/:id` with an empty body and adopts the `lastCall` the API returns; on failure it restores the previous value and shows an error banner. The summary tiles and status filter are computed from the loaded clients.

Everything else lives in `apps/frontend/src/App.jsx` (~650 lines), top to bottom:

1. `C` — design-token object of hex colors used via inline `style={{ }}` for brand colors, layered with Tailwind utility classes for layout and spacing. Brand colors go through `C`, everything else through Tailwind. Keep that split.
2. Mock data (`SERVICES`, `EMPLOYEES`, `INITIAL_TASKS`, `INITIAL_CLIENTS`) and `*_META` lookups (`STATUS_META`, `PRIORITY_META`, `PAY_STATUS_META`, plus the `WORK_TYPES` list) mapping enum values to label/color. These literal enum values are the contract with the API — see below.
3. Page components: `TopNav`, `Landing`, `WorkBoard` (move-left/move-right buttons, no drag; a `WorkForm` dialog creates, edits and deletes work items, in mock mode too), `Payments` (call logging; `ClientForm` adds, edits and deletes clients and `PaymentForm` records money received, which reduces the dues and marks a cleared account as paid). The dialogs share `Modal`, `useDialogAction`, `DeleteControl` and `DialogButtons`.
4. `App` — page switching via a `useState` string (`home` / `work` / `payments`). There is no router, so back/forward and deep links do not work. `useStaffSession` asks the API whether sign-in is required and `StaffOnly` wraps the Work Board and Payments pages: it shows `SignIn` when a password is set on the server and the browser has no valid token. The landing page is always public. The token lives in `localStorage` (`api.js`), and any 401 clears it and returns to the sign-in screen.

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
  prisma/schema.prisma     Employee, Task, Client
  prisma/migrations/       committed migrations
  prisma/seed.js           seed data mirroring the frontend mocks
  test/api.test.js         node:test suite hitting the real app over HTTP
```

Endpoints today (all under `/api`):

| Method and path | Request body | Success | Errors |
| --- | --- | --- | --- |
| `GET /api/health` | none | 200 `{ status: "ok" }` | none |
| `GET /api/auth/session` | none | 200 `{ required, authenticated }`; never 401 | none |
| `POST /api/auth/login` | `{ password }` | 200 `{ token, expiresAt }` | 400 if login is switched off, 401 on a wrong password, 429 after 8 wrong attempts from one address (15-minute wait) |
| `GET /api/employees` | none | 200, list of employees | none |
| `GET /api/tasks` | none | 200, list of tasks | none |
| `GET /api/tasks/:id` | none | 200, the task | 404 if the task is unknown |
| `POST /api/tasks` | `{ title, client, assigneeId, priority, status? }` plus the optional work details below; `status` defaults to `todo` | 201, the task; id generated as highest `NK-###` + 1 | 400 `{ error }` on missing/empty fields, invalid `priority`/`status`, unknown `assigneeId`, or an invalid work detail |
| `PATCH /api/tasks/:id` | any of `title`, `client`, `assigneeId`, `priority`, `status` and the work details below; only the fields sent change; `id`/`updatedAt` are ignored | 200, the updated task | 400 `{ error }` on an empty body, empty `title`/`client`, invalid `priority`/`status`, unknown `assigneeId`, or an invalid work detail; 404 if the task is unknown |
| `DELETE /api/tasks/:id` | none | 204, no body; permanently deletes | 404 `{ error }` if the task is unknown |
| `GET /api/clients` | none | 200, list of clients | none |
| `POST /api/clients` | required `name`, `contact`, `phone` (non-empty strings), `due` (integer >= 0 rupees), `invoiceDate`, `status` (`paid\|due-soon\|overdue`); optional `notes`, `lastCall` (defaults to now); dates accept `YYYY-MM-DD` or a full ISO timestamp | 201, the client; id generated as highest `c#` + 1 | 400 `{ error }` on a missing field, invalid `status`, negative/non-integer `due`, or unparseable date |
| `PATCH /api/clients/:id` | any of `name`, `contact`, `phone`, `due`, `invoiceDate`, `lastCall`, `status`, `notes`, validated like `POST /api/clients` (`notes` may be `null` to clear it); only the fields sent change and `lastCall` is untouched unless sent; `id` and unknown keys are ignored; with no body, an empty body, or no editable fields it logs a call, setting `lastCall` to now | 200, the updated client | 400 `{ error }` on any invalid field, including `null` for anything but `notes`; 404 if the client is unknown |
| `DELETE /api/clients/:id` | none | 204, no body; permanently deletes | 404 `{ error }` if the client is unknown |

Work details on a task (all optional, from the "new work" form): `customerPhone`, `district`, `department`, `details` (strings; blank or `null` clears), `workTypes` (a list drawn from `survey`, `x-section`, `drawing`, `design`, `printout`; returned in that fixed order), `expectedCompletion` (`YYYY-MM-DD` or an ISO timestamp; `null` or `""` clears).

Staff sign-in (`src/lib/auth.js`): one shared password in the `APP_PASSWORD` environment variable. While it is unset the API is open, which is the local and test default. Once set, every endpoint except `/api/health` and `/api/auth/*` needs `Authorization: Bearer <token>` and answers 401 without it. Tokens last 30 days and are signed with a key derived from the password, so changing `APP_PASSWORD` signs everyone out. There are no user accounts or roles yet.

Design decisions to preserve:

- **IDs are the frontend's human-readable values** (`e1`, `NK-101`, `c1`), not generated. Keeps the API's output identical to the mock data.
- **Enum-like fields are plain strings** matching the frontend exactly: task `status` `todo|inprogress|done`, task `priority` `low|medium|high`, task `workTypes` entries `survey|x-section|drawing|design|printout`, client `status` `paid|due-soon|overdue`. No Prisma enums, no case or hyphen remapping.
- **Dates:** the API returns ISO timestamps; the UI uses `YYYY-MM-DD`. Convert in the frontend at the fetch boundary. A calendar date with no time (an invoice date) is stored as midnight UTC and read by its UTC day; a moment in time (a logged call) is read by the viewer's local day. Mixing the two makes "today" wrong before 05:30 IST.
- Unknown IDs return 404 (Prisma `P2025`); anything else falls through to the 500 handler in `app.js`.
- CORS: `CORS_ORIGINS` is a comma-separated allowlist with `*` wildcards; unset allows everything (fine locally, not in production).

Tests run against a real database: `npm test` in the backend runs `prisma generate` and `prisma migrate deploy`, seeds, then `node --test`. Tests that write must restore what they changed.

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
- `APP_PASSWORD` in the Render dashboard switches staff sign-in on. Until it is set the hosted API is open to anyone, so keep real client data off it.

The remote also has a stale `master` branch holding only the first commit; `main` is the default.
