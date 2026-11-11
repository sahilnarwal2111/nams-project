# Operational metrics: candidate definitions, version 1

Status: owner review required. These are candidates, not agreed company KPIs.
No live data access or live metric values are verified by this document.
Tests use synthetic data in an isolated PostgreSQL database.
This PR is separate from instrumentation. It adds no events, API, schema, or dashboard.

## Sources and evidence

Paths below are relative to the repository root. Definitions follow these sources:

- [`schema.prisma`](../../apps/backend/prisma/schema.prisma): `Task`, `Employee`, and `Client` fields and relations.
- [`tasks.controller.js`](../../apps/backend/src/controllers/tasks.controller.js): task creation, assignment validation, status moves, edits, and permanent deletion.
- [`clients.controller.js`](../../apps/backend/src/controllers/clients.controller.js): balance validation, editable statuses, reminder overwrite, default `lastCall`, and permanent deletion.
- [`employees.controller.js`](../../apps/backend/src/controllers/employees.controller.js): roster listing, without per-person sign-in or activity data.
- [`App.jsx`](../../apps/frontend/src/App.jsx): `WorkBoard`, `Payments`, summary calculations, mock fallback, and reminder button.
- [`api.js`](../../apps/frontend/src/api.js): `hasApi`, calendar-date conversion, and local-day conversion for `lastCall`.
- [`dates.js`](../../apps/backend/src/lib/dates.js): date-only input becomes midnight UTC; timestamp input also remains accepted.
- [`seed.js`](../../apps/backend/prisma/seed.js): demo records; seeding upserts can replace values.
- [`reporting SQL`](../../apps/backend/reporting/operational-metrics.sql): executable definitions.

The workflow notes also reflect client management and staff sign-in on `main` at `0f9713d8df69c6659e20d92256c5bb513a0f4b4b`.
These features merged after this reporting branch started. Sources for that verified snapshot:

- [`api.js` payment helpers and form validation](https://github.com/sahilnarwal2111/nams-project/blob/0f9713d8df69c6659e20d92256c5bb513a0f4b4b/apps/frontend/src/api.js): `recordPayment`, `paymentPatchBody`, and `clientFormError`.
- [`App.jsx` payment workflow](https://github.com/sahilnarwal2111/nams-project/blob/0f9713d8df69c6659e20d92256c5bb513a0f4b4b/apps/frontend/src/App.jsx): Record Payment and shared staff sign-in.
- [`auth.js` shared-password identity limit](https://github.com/sahilnarwal2111/nams-project/blob/0f9713d8df69c6659e20d92256c5bb513a0f4b4b/apps/backend/src/lib/auth.js): optional password gate, without per-person identity or stored activity history.

`Task.client` is free text, not a foreign key to `Client`.
Never join these tables by customer name. The query aggregates each source separately.
Employee assignment uses the real `Task.assigneeId` relation, without employee-level output.

## Cohorts, clocks, and reporting windows

- **Observation:** one repeatable-read database snapshot at `observed_at`.
- **Task cohort:** all surviving database task records, including internal work. Open means `todo` or `inprogress`; `done` is excluded.
- **Employee cohort:** all database roster records, including staff without tasks. No active-employment field exists.
- **Client cohort:** all surviving database client records. Balance cohort means `due > 0`, regardless of status.
- **Exclusions:** none based on guessed names, IDs, or roles. No reliable demo, internal, test, consent, or deleted-record flag exists.
- **Timezone:** Asia/Kolkata is a proposed office reporting timezone, not the browser's timezone.
- **Calendar dates:** compare `expectedCompletion` by its stored UTC date, like the frontend converter. Due today is not overdue.
- **Instants:** Prisma stores `lastCall` as UTC in PostgreSQL `timestamp without time zone`; convert UTC to the reporting timezone.
- **Last complete day:** `[yesterday 00:00, today 00:00)` in Asia/Kolkata. The query returns both UTC boundaries and `reporting_day`.
- **Stock metrics:** all workload, roster, balance, and quality metrics describe observation time, not yesterday's closing state.
- **Stamp age:** local calendar-day difference at observation time. Seven days is a proposed follow-up threshold, not an SLA.

Counts and amounts have no denominator. Fractions use the explicit denominator below.
With valid source balances, fractions range from 0 to 1, not 0 to 100.
A zero denominator returns SQL `NULL`, never zero percent.
Empty cohorts produce zero counts and zero amounts. Report the numerator and denominator beside each fraction.
Flag small denominators as **small sample**; proposed threshold: fewer than 10 records.
Do not interpret a small-sample change as a trend.

## Candidate metric catalog

### Start with schedule coverage

`expectedCompletion` is optional. The committed seed tasks omit it, so a fresh seeded database has no dated open tasks.
This describes the seed source, not verified live data. Existing office records can differ.
With no dated open tasks, `overdue_dated_open_fraction` returns `NULL`, not zero percent overdue.
Lead the daily report with `undated_open_tasks` beside `open_tasks` to show missing schedule coverage.
Hold the overdue fraction until most open tasks have dates under an owner-approved coverage threshold.
A proposed threshold is `dated_open_tasks / open_tasks >= 0.8`; no open tasks means coverage is undefined.
This is a reporting recommendation, not an automatic filter in the SQL.

| SQL output | Definition / denominator | Decision and recommendation |
| --- | --- | --- |
| `task_records` | Count all task records, including done and invalid states | Context only; not tasks created or completed today |
| `open_tasks` | Count open tasks | Daily candidate: review backlog |
| `inprogress_tasks` | Count tasks with status `inprogress` | Daily candidate: review concurrent work |
| `high_priority_open_tasks` | Count open tasks with priority `high` | Daily candidate: prioritize work |
| `dated_open_tasks` | Count open tasks with non-null `expectedCompletion` | Denominator and date coverage context |
| `overdue_open_tasks` | Count open tasks with expected UTC date before today's local date | Conditional candidate: review schedule risk alongside date coverage |
| `undated_open_tasks` | Count open tasks without `expectedCompletion` | Daily candidate: expose missing schedule data |
| `overdue_dated_open_fraction` | `overdue_open_tasks / dated_open_tasks` | Hold until the owner approves date coverage; excludes undated work explicitly |
| `employee_records` | Count all roster records | Context; not active users or available staff |
| `employees_with_open_tasks` | Count distinct roster employees with at least one open task | Optional staffing context; no individual ranking |
| `roster_with_open_tasks_fraction` | `employees_with_open_tasks / employee_records` | Optional; assignment coverage, NOT adoption or utilization |
| `client_records` | Count all client records | Context; not acquired customers or unique legal entities |
| `balance_client_records` | Count client records with `due > 0` | Daily candidate: collection queue size |
| `recorded_balance_inr` | Sum `due` across ALL client records, matching Payments; INR, not paise | Daily candidate: recorded outstanding balance, NOT revenue |
| `overdue_balance_client_records` | Count `status = overdue AND due > 0` | Daily candidate: collection priority; differs from the UI count that includes zero balances |
| `overdue_recorded_balance_inr` | Sum `due` where `status = overdue AND due > 0` | Daily candidate: manually classified exposure |
| `overdue_balance_fraction` | `overdue_recorded_balance_inr / recorded_balance_inr` | Candidate with both amounts; no invoice-level due dates exist |
| `balance_clients_latest_stamp_previous_day` | Current positive-balance records whose latest `lastCall` falls in the last complete day | Diagnostic only; NOT calls or verified reminders |
| `latest_stamp_previous_day_fraction` | Previous metric / current `balance_client_records` | Diagnostic only; same balance cohort in numerator and denominator |
| `balance_clients_stamp_age_7d` | Current positive-balance records with local `lastCall` date at least seven calendar days old | Conditional daily candidate: follow-up queue proxy, NOT missed calls |

### Quality outputs: always inspect before publication

- `invalid_task_status_records`: statuses outside `todo`, `inprogress`, `done`; excluded from open-task metrics, included in `task_records`.
- `invalid_client_status_records`: statuses outside `paid`, `due-soon`, `overdue`; balances still enter the total.
- `paid_positive_balance_records`: status `paid` with `due > 0`; balances still enter the total and balance cohort.
  The current client form rejects this combination. A nonzero count can indicate legacy records or direct API or database writes.
- `negative_balance_records`: `due < 0`, possible through direct database writes; totals retain these values, so fractions can be invalid.
- `future_last_call_records`: `lastCall` later than observation time, across all clients.

Stop publication when these quality counts are nonzero until the owner checks the source.
These checks are not a full audit. API validation normally prevents negative balances and null required fields.
The database does not enforce all API enum and balance rules.

## What the source cannot prove

- `updatedAt` changes on ANY task edit. It is not creation time, completion time, or status history.
- No task transition history, `createdAt`, or `completedAt` exists. Do not report daily throughput, cycle time, on-time completion, or conversion.
- `lastCall` defaults to now on client creation. API edits can supply any parseable timestamp.
- Reminder logging overwrites `lastCall`. Later calls erase earlier evidence. This field cannot prove a call occurred or count reminders.
- The latest-stamp window uses current balances. Clients paid since yesterday leave that cohort; new balances enter it.
- No payment transactions, paid timestamps, invoice ledger, contractual due date, or balances by currency exist.
- Record Payment lowers `due` in place through the existing client PATCH and marks a fully cleared balance as `paid`.
  It creates no payment ledger. A falling balance can also follow an edit or deletion; do not call the change recorded collections.
- `invoiceDate` is not a payment deadline. Do not derive overdue status from invoice age.
- Recorded balances are not revenue, collections, cash flow, or customer lifetime value.
- Staff sign-in uses one optional shared office password. Tokens identify no individual, and no stored per-person session or activity history exists.
  No per-person identity, employment status, working hours, or effort data supports adoption, activation, retention, productivity, or utilization.
- Permanent deletion removes records from later snapshots. Seed upserts can replace values.
- Without `VITE_API_URL`, the UI uses local mock state. Database reports miss those changes and unsaved browser activity.
- No source freshness watermark exists. Query success does not prove the office uses the API or that records are current.

## Safe execution and output

Use a dedicated role with SELECT on only `public."Task"`, `public."Employee"`, and `public."Client"`.
Do not use application-owner credentials for scheduled reporting.
Set `REPORTING_DATABASE_URL` outside shell history with the approved read-only connection string.
Do not use the test, migration, or seed commands against production.

### One-time role setup: administrator action, not reporting

The following example creates database permissions. It is separate from the read-only report and requires an authorized database administrator.
Connect to the intended Neon database as its owner through `psql -X`.
Use a new role with no existing memberships. Do not grant Neon owner or application-role membership.

```sql
CREATE ROLE nk_metrics_reader LOGIN
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
SELECT format('GRANT CONNECT ON DATABASE %I TO nk_metrics_reader', current_database())
\gexec
GRANT USAGE ON SCHEMA public TO nk_metrics_reader;
GRANT SELECT ON TABLE public."Task", public."Employee", public."Client" TO nk_metrics_reader;
ALTER ROLE nk_metrics_reader SET default_transaction_read_only = on;
```

In that same psql session, run `\password nk_metrics_reader` to set a password through the hidden prompt.
Do not paste a password into SQL, shell history, or this document.
Use this role's connection string for `REPORTING_DATABASE_URL`, with the provider's required TLS settings.
Check inherited `PUBLIC` privileges and any existing grants before treating the role as SELECT-only.
Do not change shared `PUBLIC` grants without a separate access review.
The read-only default is a safeguard, not a substitute for permissions: a role can change its own transaction mode.
The database role can read source rows; only the reporting query produces aggregate-only output.
Do not distribute its credentials with the report.

### Run the read-only report

From the repository root, run:

```sh
psql -X "$REPORTING_DATABASE_URL" --set=ON_ERROR_STOP=1 \
  --file=apps/backend/reporting/run-operational-metrics.psql
```

The wrapper enforces read-only, repeatable-read execution, a five-second statement limit, and a one-second lock limit.
It pins the source search path to `pg_catalog, public` and disables psql startup files through `-X`.
Use one connection and no concurrent reporting runs. The query returns one aggregate row.
The wrapper makes no persistent writes and creates no objects. A timeout is a failed report, not a zero value.

The query does not select customer names, contacts, phones, notes, task text, task IDs, or employee names.
Do not add customer, employee, role, district, or department breakdowns to company-wide output.
Only publish approved aggregate fields. Do not attach raw source exports or credentials.
Aggregates can still be sensitive in small cohorts; use a restricted channel and owner approval.

## Owner decision checklist and daily report contract

1. Confirm the database and API-backed office workflow are authoritative.
2. Confirm demo and test data are absent or supply an explicit cohort rule.
3. Choose the daily candidates above and approve the timezone and seven-day threshold.
   Approve the schedule-coverage threshold before publishing the overdue fraction.
4. Confirm balance meaning, manual status maintenance, and the audience for aggregate balances.
5. Keep latest-stamp diagnostics out of headline KPIs unless their limits are acceptable.
6. Confirm report time and audience before any scheduling or dashboard changes.

Proposed report headings:

- **Source:** verified database environment, definition version, query link, observation time, timezone, and freshness unknown where applicable.
- **Current snapshot:** approved stock metrics with denominators and small-sample warnings.
- **Last complete day:** date and bounds; no daily flow metrics are currently supported.
- **Comparisons:** unavailable until trusted aggregate snapshots exist; never reconstruct past stock from current rows.
- **Quality and limits:** quality counts, known source gaps, and missing data.
- **Follow-up:** decisions for workload or collection review; distinguish observations from hypotheses.

For future comparisons, retain approved aggregate snapshots outside this read-only PR.
Compare the same local observation time on the prior day and seven days earlier.
Label these as stock changes, not task completions or cash collected.
Require matching definition version, cohort rule, timezone, source, and data-quality checks.
Mark missing snapshots unavailable. Do not backfill a historical date into this query.
No schedule, snapshot storage, live dashboard, or live values are included here.

## Verification

`apps/backend/test/reporting.test.js` runs the real SQL against isolated synthetic tables in PostgreSQL.
The suite covers empty cohorts, ratios, status handling, duplicate assignments, date boundaries,
UTC/local conversion, reminder limitations, aggregate-only output, overflow-safe sums, and read-only execution.
The existing backend test command discovers this test automatically; CI needs no new job.
Run `npm run check` only with a disposable local test database.
