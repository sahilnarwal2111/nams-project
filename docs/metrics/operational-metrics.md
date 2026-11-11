# Operational metrics: candidate definitions, version 2

Status: owner review required. These are candidates, not approved KPIs.
No production access, live values, deployment cutover, or source freshness is verified.
All verification uses synthetic data. This reporting PR adds no instrumentation, endpoint, schema, or schedule.

## Sources and coverage inventory

The branch includes `main` revision `87faad62c2d13e64c3a701cc148a6914c19d28e1`, newer than the requested `d251760dcb1b886ee06fce948709aca03484f60c`.
See [coverage inventory](coverage.md) for workflow coverage and remaining gaps.
Source links below resolve to the code reviewed with this reporting query:

- [Schema](../../apps/backend/prisma/schema.prisma): Employee, Task, Client, Payment, and Enquiry fields and relations.
- [Tasks](../../apps/backend/src/controllers/tasks.controller.js): server creation stamps, completion replacement/clearing, assignment, and permanent deletion.
- [Payments](../../apps/backend/src/controllers/payments.controller.js): atomic balance decrement and payment creation; caller-supplied `receivedAt` is allowed.
- [Clients](../../apps/backend/src/controllers/clients.controller.js): balance/status editing, reminder overwrite, deletion, and staff amount restrictions.
- [Enquiries](../../apps/backend/src/controllers/enquiries.controller.js): server creation time, current status, honeypot suppression, and permanent deletion.
- [Auth](../../apps/backend/src/lib/auth.js) and [session/login](../../apps/backend/src/controllers/auth.controller.js): optional shared and personal identity, without stored activity events.
- [Frontend boundary](../../apps/frontend/src/api.js), [workflow UI](../../apps/frontend/src/App.jsx), and [date parser](../../apps/backend/src/lib/dates.js): mock mode, payment requests, calendar dates, and display-local instants.
- [Seed](../../apps/backend/prisma/seed.js): demo upserts, without task creation/completion stamps or expected dates on fresh rows.
- [SQL](../../apps/backend/reporting/operational-metrics.sql) and [wrapper](../../apps/backend/reporting/run-operational-metrics.psql): executable definitions and read-only execution.

`Task.client` is free text, not a Client relation. Never join these sources by customer name.
The SQL aggregates each source separately. Employee assignment uses `Task.assigneeId`, not an activity actor.

## Cohorts and reporting dates

- **Observation:** one repeatable-read snapshot at `observed_at`. All records must still exist at this observation.
- **Task cohort:** surviving tasks. Open means `todo` or `inprogress`; done means `done`.
- **Employee cohort:** every roster row, including staff without tasks. No active-employment flag exists.
- **Client cohort:** surviving clients. Positive-balance cohort means `due > 0`, regardless of status.
- **Payment cohort:** surviving Payment rows, regardless of current client balance or status. Do not restrict receipts to clients who still owe money.
- **Enquiry cohort:** surviving stored enquiries, regardless of current status. Closed enquiries still enter arrival counts.
- **Exclusions:** no guessed exclusions by names, IDs, or roles. No reliable demo/internal/test flag exists.
- **Timezone:** Asia/Kolkata is a proposed office reporting timezone, not the browser or database session timezone.
- **Calendar dates:** read `expectedCompletion` by its stored UTC date. Due today is not overdue.
- **Instants:** Prisma timestamp columns store UTC without a PostgreSQL timezone annotation. Convert UTC to Asia/Kolkata for day membership.
- **Windows:** use local midnight boundaries, inclusive start and exclusive end. Convert boundaries to UTC before comparisons.

The output has one aggregate row. Top-level workload, balances, quality, roster, and enquiry backlog are **current stocks**, not day-end snapshots.
The `flow_windows` JSON array contains three independent aggregate windows:

| Label | Local reporting date, when observation date is D | Meaning |
| --- | --- | --- |
| `last_complete_day` | D minus 1 day | Last complete day |
| `prior_day` | D minus 2 days | Day immediately before the last complete day |
| `week_baseline` | D minus 8 days | Same weekday, seven days before the last complete day; NOT a seven-day total |

Each window carries `reporting_day`, `start_utc`, and `end_utc`. UTC boundary strings lack an offset because source columns do; interpret them as UTC.
Top-level `reporting_day`, `day_start_utc`, and `day_end_utc` refer only to `last_complete_day`.
Counts and INR amounts have no denominator. Fractions use the denominators below and range from 0 to 1 with valid source data.
Zero denominators return SQL `NULL`, never zero percent. Empty cohorts return zero counts and amounts, subject to cutover limitations below.
Report fractions with both counts. Label denominators below 10 as **small sample**; this threshold is a proposal, not an approved policy.

## Current-stock candidates

| SQL fields | Definition / denominator | Proposed use |
| --- | --- | --- |
| `task_records`, `open_tasks`, `inprogress_tasks`, `high_priority_open_tasks` | All tasks; open tasks; in-progress tasks; open tasks with high priority | Backlog and priority review; not activity |
| `dated_open_tasks`, `undated_open_tasks` | Open tasks with / without an expected date | Schedule coverage; lead with undated count beside open count |
| `overdue_open_tasks`, `overdue_dated_open_fraction` | Open tasks whose expected UTC date precedes local today; denominator is dated open tasks | Conditional schedule risk, not on-time completion |
| `employee_records`, `employees_with_open_tasks`, `roster_with_open_tasks_fraction` | Roster count; distinct employees assigned open work; denominator is roster count | Assignment coverage, NOT adoption or utilization |
| `client_records`, `balance_client_records` | All client rows; rows with positive due | Collection queue context, not unique legal entities |
| `recorded_balance_inr` | Sum due across all clients, matching the Receivables view; not reconciled with Payment rows | Outstanding balance, not revenue or cash received |
| `overdue_balance_client_records`, `overdue_recorded_balance_inr`, `overdue_balance_fraction` | Positive-balance rows manually marked overdue; their balance sum; denominator is total recorded balance | Exposure; no contractual due date exists |
| `balance_clients_latest_stamp_previous_day`, `latest_stamp_previous_day_fraction` | Current positive-balance rows with latest `lastCall` in last complete day; denominator is current positive-balance rows | Diagnostic only, NOT call counts or verified reminders |
| `balance_clients_stamp_age_7d` | Current positive-balance rows with local lastCall date at least seven calendar days before today | Follow-up proxy; seven days is proposed, not an SLA |
| `enquiry_records`, `open_enquiry_records` | All stored enquiries; current status new or contacted | Current enquiry queue, not historical queue size |
| `surviving_payment_records` | All retained payment rows | Coverage context, not lifetime transactions |

Expected dates are optional. Fresh seed tasks omit them, so a fresh seed has no dated open tasks and a NULL overdue fraction.
This describes synthetic seed behavior, not live coverage. Hold the overdue fraction until the owner approves date coverage.
A proposed gate is `dated_open_tasks / open_tasks >= 0.8`; coverage is undefined without open tasks.
The query does not apply this publication gate automatically.

## Timestamp-window candidates

The following keys appear in each `flow_windows` entry. They describe retained rows at observation, not an immutable event ledger.

| SQL key | Numerator / denominator or unit | Coverage and decision |
| --- | --- | --- |
| `task_created_records` | Tasks with non-null createdAt inside the window | Recorded task intake; excludes unknown creation dates and deleted tasks |
| `currently_done_completion_records` | Tasks currently done with non-null completedAt inside the window | Latest recorded completion episode only; NOT all completion transitions |
| `dated_currently_done_completion_records` | Previous cohort with non-null expectedCompletion | Denominator for dated completion quality |
| `on_time_currently_done_completion_records` | Dated completion cohort whose local completion day is on/before expected UTC date | Uses current editable expected date, not the original commitment |
| `on_time_dated_completion_fraction` | On-time recorded completions / dated recorded completions | Candidate only with denominator and legacy/date-coverage warning |
| `payment_records`, `recorded_receipts_inr` | Payment rows with receivedAt inside the window; sum their amount in whole INR | Retained recorded receipts, NOT revenue, lifetime collections, or bank reconciliation |
| `enquiry_created_records` | Stored enquiries with createdAt inside the window, all current statuses | Recorded arrivals, NOT unique leads, all submissions, or visitor conversion |

### Legacy rows, reopened tasks, and deleted history

Task creation/completion columns are nullable, without migration defaults or backfill.
`tasks_missing_created_at` counts unknown creation times across all tasks.
`done_tasks_missing_completed_at` counts currently done tasks without a completion stamp.
Null means unknown/unset; it does not prove a row predates deployment. Seeds and direct writes can also omit timestamps.
Do not replace nulls with updatedAt, migration dates, expected dates, or the report date.
A legacy task can gain a valid latest completion stamp while its creation time stays null; it enters completion but not creation counts.

Creation already in done stamps both fields. A transition to done stamps completedAt; repeated done preserves it.
Leaving done clears completedAt. Completing again replaces the previous completion time.
A no-op done update does not repair a legacy null completion stamp.
Consequently reopening can reduce a past window count, and recompletion can move a task between windows.
These counts cannot prove immutable throughput, every completion event, first completion, reopen rate, active cycle time, or employee productivity.
Expected-date edits can also change the apparent on-time fraction after the work finishes.

Record Payment now creates Payment history and reduces due in one transaction. This supersedes the earlier balance-only workflow limitation.
The API accepts backdated or future receivedAt values; the window is the stated receipt date, not entry/ingestion time.
Payment has no separate creation timestamp or actor. Late entries can restate earlier days.
Deleting a client cascades to all its payments, including earlier windows. Direct balance edits create no payment history.
The source cannot reconcile original invoice value, retained receipts, and current due or recover deleted payments.
Do not describe falling balances as collections or retained receipt sums as complete historical cash flow.

Enquiries have server-created timestamps and mutable current status. Deleting an enquiry reduces earlier arrival counts.
Honeypot requests return success without storage; validation failures, rate-limited requests, and deleted rows are absent.
No visitor denominator, deduplication identity, contact timestamp, closure timestamp, or enquiry-to-client link exists.
Arrival counts therefore do not prove conversion, response time, contact rate by day, or unique qualified leads.

Personal sign-in can identify an employee in a token; shared office/admin sign-in does not identify a person.
Neither path stores a login/activity event ledger. Tasks store assignee, not actor; payments and enquiries store no authenticated actor.
Do not infer adoption, activation, retention, attendance, or individual activity from assignment or password provisioning.
The reporting query never reads passwordHash, credentials, tokens, phones, or free text.

## Migration cutover and comparison contract

Sources: [payments migration](../../apps/backend/prisma/migrations/20261111062411_add_payments/migration.sql),
[task timestamps migration](../../apps/backend/prisma/migrations/20261111062932_add_task_timestamps/migration.sql),
[enquiries migration](../../apps/backend/prisma/migrations/20261111070013_add_enquiries/migration.sql), and
[personal passwords migration](../../apps/backend/prisma/migrations/20261111073557_add_personal_passwords/migration.sql).
Migration filenames are source identifiers, NOT verified application cutover times.
No historical payment or enquiry backfill occurs. The task migration leaves existing timestamps null.
Confirm each environment's migration application AND API deployment time before publishing timestamp-window candidates.
Source availability starts at the later of those times; office use and any imports also need confirmation.

Mark days before cutover **unavailable** and cutover days **partial**. Start full-day reporting at the first local midnight after cutover.
If cutover is exactly local midnight, that new day can qualify after completeness checks.
The query intentionally does not guess a cutover, filter by a migration filename, or certify completeness.
Until the owner verifies cutover, every timestamp-window result is diagnostic/provisional, even zero.
A backdated payment before cutover does not prove full coverage of that earlier day.
The presence of a timestamp does not establish completeness for other records in its cohort.

Compare the three timestamp windows only with matching definition version, source, timezone, verified cutover coverage, and quality checks.
Do not compare a partial or unavailable window with a full day. Label results as mutable retained-row counts/sums.
Current-stock comparisons require trusted aggregate snapshots at the same local observation time, on prior day and seven days earlier.
Do not reconstruct past stocks from current rows. Do not compare version 1 snapshots directly with version 2 outputs.
No snapshot store or schedule is added here. No freshness watermark verifies office use of the API.
Mock-mode activity is not persisted to this database and is outside all query cohorts.

## Quality and publication gates

Inspect these flags before publication; stop affected reporting until the owner checks nonzero defects:

- `invalid_task_status_records`, `invalid_client_status_records`, `invalid_enquiry_status_records`: unknown current status values.
- `paid_positive_balance_records`: paid status with positive due; UI validation rejects it, but legacy/API/direct writes can produce it.
- `negative_balance_records`, `nonpositive_payment_records`: invalid amounts; raw totals retain them, so fractions can be invalid.
- `future_last_call_records`, `future_task_timestamp_records`, `future_payment_records`, `future_enquiry_records`: timestamps later than observation.
- `non_done_tasks_with_completed_at`: a completion stamp on a task not currently done.
- `task_completion_before_creation_records`: completion earlier than a known creation time.

Missing task timestamps are coverage warnings, not automatically corrupt rows. Show both missing counts beside candidate task flows.
The query reports defects but does not silently fix values, suppress output, or implement publication policy.
These checks do not detect all direct-write defects, deleted history, demo records, or incomplete ingestion.

## Safe execution and output

Use an approved reporting role, not application-owner credentials. Financial output is admin-only; do not widen current app access rules.
Keep the aggregate report in an owner-approved restricted audience. Small cohorts can still reveal sensitive information.
Do not add customer, employee, district, department, or auth-mode breakdowns to shared output.
The query returns no customer names, IDs, phones, notes, task text, payment notes, or employee credentials.

### One-time administrator role setup (separate from reporting)

Connect to the intended database as an authorized administrator through `psql -X`.
Use a new role without memberships. Do not grant Neon owner or application-role membership.
The column grants below avoid granting access to Employee.passwordHash or other private text.

```sql
CREATE ROLE nk_metrics_reader LOGIN
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
SELECT format('GRANT CONNECT ON DATABASE %I TO nk_metrics_reader', current_database())
\gexec
GRANT USAGE ON SCHEMA public TO nk_metrics_reader;
GRANT SELECT (id) ON TABLE public."Employee" TO nk_metrics_reader;
GRANT SELECT (status, priority, "assigneeId", "expectedCompletion", "createdAt", "completedAt") ON TABLE public."Task" TO nk_metrics_reader;
GRANT SELECT (due, status, "lastCall") ON TABLE public."Client" TO nk_metrics_reader;
GRANT SELECT (amount, "receivedAt") ON TABLE public."Payment" TO nk_metrics_reader;
GRANT SELECT (status, "createdAt") ON TABLE public."Enquiry" TO nk_metrics_reader;
ALTER ROLE nk_metrics_reader SET default_transaction_read_only = on;
```

In the same psql session, run `\password nk_metrics_reader` through the hidden prompt. Do not paste passwords into SQL or shell history.
Use the reporting connection string for `REPORTING_DATABASE_URL` with the provider's required TLS settings.
Existing version 1 roles need an administrator permission review: revoke previous broad table SELECT grants before applying column grants.
Adding column grants alone does not remove existing table-level access to passwordHash or text.
Inspect inherited PUBLIC privileges and existing grants. Do not change shared PUBLIC grants without a separate access review.
The read-only default is only a safeguard: a role can override its own transaction mode. Permissions must enforce the boundary.
The role can still read individual permitted source columns; only this query enforces aggregate-only output. Keep credentials private.

### Run the report

```sh
psql -X "$REPORTING_DATABASE_URL" --set=ON_ERROR_STOP=1 \
  --file=apps/backend/reporting/run-operational-metrics.psql
```

The wrapper uses read-only repeatable-read execution, a five-second statement limit, a one-second lock limit, and `pg_catalog, public, pg_temp` search path.
Use one connection and no concurrent runs. It creates no objects and performs no persistent writes.
A timeout or missing table/column/permission is a failed report, not zero. Install and verify all source migrations first.
Never run migration, seed, or test commands against production for reporting setup.

## Owner decisions and verification

Confirm authoritative API/database use, demo exclusions, verified per-source cutover, reporting timezone, audience, schedule-coverage gate, and stamp-age threshold.
Choose candidates only after those checks. No KPI, reporting schedule, or production readiness is approved by this document.
Reports must identify definition version, observation time, source, window dates, cutover status, denominators, quality flags, and known restatement risks.
Distinguish observed aggregate changes from hypotheses and missing data.

[Reporting tests](../../apps/backend/test/reporting.test.js) use isolated synthetic PostgreSQL tables.
They cover empty cohorts, exact output allowlists, date boundaries, legacy nulls, reopened tasks, deletion cascades, receipts, enquiries, and read-only execution.
Run `npm run check` only against a disposable local test database. Independent psql testing verifies the wrapper and restricted role.
