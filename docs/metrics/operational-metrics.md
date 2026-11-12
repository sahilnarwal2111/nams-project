# Operational metrics: candidate definitions, version 3

Status: owner review required. These are candidates, not approved KPIs.
No production access, live values, deployment cutover, or source freshness is verified.
Verification uses synthetic data only. This reporting PR adds no instrumentation, endpoint, application behavior, schema migration, or schedule.

## Sources and coverage inventory

Source baseline: `main` revision `1c1009526f4af2ab0bd1082237fa7a3bcb8f94b4`.
See the [coverage inventory](coverage.md) for supported workflows and remaining gaps.

- [Schema](../../apps/backend/prisma/schema.prisma): Employee, Task, task-linked Payment, Enquiry, and ActivityLog.
- [Billing rules](../../apps/backend/src/lib/billing.js): received totals and derived unset/unpaid/part/paid status.
- [Receivables rules](../../apps/frontend/src/receivables.js): known outstanding, zero-fee work, pending filters, and current totals.
- [Tasks](../../apps/backend/src/controllers/tasks.controller.js): fees, reminder stamps, creation/completion stamps, and task deletion with payment cascade.
- [Payments](../../apps/backend/src/controllers/payments.controller.js): receipt creation and explicit removal; caller-supplied receipt dates.
- [Ticket migration](../../apps/backend/prisma/migrations/20261111133000_receivables_by_ticket/migration.sql): deletion of prior payments, removal of Client, and new fee/task link.
- [Enquiries](../../apps/backend/src/controllers/enquiries.controller.js): server creation time, current status, suppression, and deletion.
- [Auth](../../apps/backend/src/lib/auth.js), [activity writer](../../apps/backend/src/lib/activity.js), and [activity controller](../../apps/backend/src/controllers/activity.controller.js): personal/shared actors and append-only API audit history.
- [Activity migration](../../apps/backend/prisma/migrations/20261111121239_add_activity_log/migration.sql): log schema and UPDATE/DELETE/TRUNCATE guards.
- [Frontend boundary](../../apps/frontend/src/api.js), [date parser](../../apps/backend/src/lib/dates.js), and [seed](../../apps/backend/prisma/seed.js): mock mode, date handling, and synthetic fixtures.
- [SQL](../../apps/backend/reporting/operational-metrics.sql) and [wrapper](../../apps/backend/reporting/run-operational-metrics.psql): executable definitions and read-only execution.

Receivables now belong to a task, also called a ticket. `Task.client` remains free text, not a customer relation or join key.
There is no Client table in the current schema. The query groups Payment by taskId before joining Task to prevent fee/workload multiplication.
Employee assignment uses Task.assigneeId, not the actor who performed work. The query does not read ActivityLog.

## Cohorts, units, and reporting dates

- **Observation:** one repeatable-read snapshot at `observed_at`; source rows must still exist at this observation.
- **Task cohort:** all surviving tasks, regardless of work status. Open means todo or inprogress; done means done.
- **Fee cohort:** known fees are non-null; positive fees are greater than zero. Unknown fees are a separate coverage cohort.
- **Outstanding cohort:** tasks with a known fee and `max(fee - retained received, 0) > 0`.
- **Employee cohort:** all roster rows, including staff without tasks. No active-employment flag exists.
- **Payment cohort:** surviving task-linked Payment rows, regardless of task work status or whether its fee is now settled.
- **Enquiry cohort:** surviving stored enquiries, regardless of current status. Closed enquiries still enter arrival counts.
- **Exclusions:** no guessed exclusions by names, IDs, or roles. No reliable demo/internal/test flag exists.
- **Units:** money is whole INR, not paise. Counts and amounts have no denominator.
- **Timezone:** Asia/Kolkata is a proposed reporting timezone, not the database session or browser timezone.
- **Calendar dates:** read expectedCompletion by its stored UTC date. Due today is not overdue work.
- **Instants:** Prisma timestamp columns store UTC without a PostgreSQL timezone annotation. Convert UTC to Asia/Kolkata for day membership.

The query returns one aggregate row. Top-level workload, fees, balances, roster, quality, and enquiry backlog are **current stocks**, not historical closing values.
`definition_version` is 3 and `receivables_model` is `task_fee_payment_task_id`.
The nested `flow_windows` array contains three independent local-midnight, half-open windows:

| Label | Reporting date when observation date is D | Meaning |
| --- | --- | --- |
| `last_complete_day` | D minus 1 day | Last complete day |
| `prior_day` | D minus 2 days | Day before last complete day |
| `week_baseline` | D minus 8 days | Same weekday seven days before last complete day; NOT a seven-day total |

Each entry includes reporting_day, start_utc, and end_utc. The start is inclusive; the end is exclusive.
UTC boundary strings lack an offset because source columns do; interpret them as UTC.
Top-level reporting_day/day_start_utc/day_end_utc refer only to last_complete_day.
Fractions range from 0 to 1 with valid data; a zero denominator returns NULL, never zero percent.
Show every fraction with numerator and denominator. Proposed small-sample threshold: fewer than 10 denominator records.
An empty sum returns zero; this does not prove complete source coverage or that unknown fees are zero.

## Workload and coverage candidates

| SQL fields | Definition / denominator | Proposed decision |
| --- | --- | --- |
| `task_records`, `open_tasks`, `inprogress_tasks`, `high_priority_open_tasks` | All tasks; open; in-progress; open with high priority | Backlog and priority review, not activity |
| `dated_open_tasks`, `undated_open_tasks` | Open tasks with / without expectedCompletion | Show missing schedule coverage first |
| `overdue_open_tasks`, `overdue_dated_open_fraction` | Open tasks whose expected UTC date precedes local today; denominator is dated open tasks | Work schedule risk, NOT payment overdue status |
| `employee_records`, `employees_with_open_tasks`, `roster_with_open_tasks_fraction` | Roster count; distinct roster employees assigned open work; denominator is roster count | Assignment coverage, not utilization or adoption |
| `enquiry_records`, `open_enquiry_records` | All stored enquiries; current new/contacted queue | Current queue, not historical queue size |

Expected dates are optional. Fresh seed tasks omit them, so fresh-seed date coverage is empty; this is not a live-data claim.
Hold the overdue fraction until the owner approves coverage. Proposed gate: dated_open_tasks/open_tasks at least 0.8; undefined without open tasks.
The query does not apply publication gates automatically. ExpectedCompletion is a work deadline, not an invoice/payment due date.

## Ticket receivables candidates

For each task, received means the sum of retained Payment.amount rows linked through taskId; no rows means zero received.
Fee is the amount to charge, not the outstanding balance. Payments do not decrement fee.

| SQL fields | Definition / denominator | Coverage and decision |
| --- | --- | --- |
| `fee_unset_tasks` | Tasks with fee NULL | Unknown amount, not zero charge or settled work |
| `known_fee_tasks`, `zero_fee_tasks`, `positive_fee_tasks` | Non-null fee; fee exactly zero; fee greater than zero | Separate coverage from deliberate no-charge work |
| `fee_coverage_fraction` | known_fee_tasks / task_records | Fee-entry coverage; zero fees count as known |
| `billing_unpaid_tasks` | Known fee with received below fee and received at most zero | Derived unpaid state, matching billing.js |
| `billing_part_paid_tasks` | Known fee with received above zero but below fee | Derived part-paid state |
| `billing_paid_tasks` | Known fee with received at least fee | Includes zero-fee no-charge work; not a paid-customer count |
| `billing_pending_tasks` | Fee unknown OR received below known fee | Matches pending filter; includes unknown fees without quantified debt |
| `outstanding_fee_tasks` | Known positive outstanding balance | Denominator for reminder diagnostics |
| `known_fees_inr` | Sum non-null fees across all work statuses | Recorded charges only; unknown amounts excluded, not imputed |
| `retained_receipts_inr` | Sum retained linked receipts across all tasks | Current retained receipt total, not lifetime cash or revenue |
| `known_outstanding_inr` | Sum max(fee - received, 0) for known fees; unknown fees contribute no quantified amount | Matches Receivables outstanding tile; incomplete when fees are unknown |
| `outstanding_tasks_without_reminder` | Outstanding cohort with lastReminder NULL | No retained reminder stamp; separate from old stamps |
| `outstanding_tasks_latest_reminder_previous_day` | Outstanding cohort whose latest lastReminder falls in last complete day | Latest-stamp diagnostic, not count of calls or reminder events |
| `latest_reminder_previous_day_fraction` | Previous metric / outstanding_fee_tasks | Current cohort in both numerator and denominator |
| `outstanding_tasks_reminder_age_7d` | Outstanding cohort with local reminder date at least seven calendar days before today | Proposed follow-up threshold, not an SLA; excludes NULL stamps |
| `surviving_payment_records` | Count all retained Payment rows | Coverage context, not complete lifetime transactions |

Show fee_unset_tasks and fee_coverage_fraction beside known_outstanding_inr. A zero known balance with unset fees is not proof that nothing is owed.
Zero fee means explicitly not charged and derives paid with no receipts. NULL fee derives unset, even if corrupt direct writes attach payments.
Work status does not filter financial cohorts: done work can remain unpaid, and open work can already be paid.
No stored Client.status, invoiceDate, lastCall, or manual payment-overdue category remains. Do not invent replacements from work dates.
LastReminder starts NULL, not at creation; updates replace only the latest stamp. A stamp alone does not prove customer contact.

## Timestamp-window candidates

These keys appear in each flow_windows entry. They describe surviving records, not a complete immutable cash or event ledger.

| SQL key | Numerator / denominator or unit | Coverage limit |
| --- | --- | --- |
| `task_created_records` | Non-null Task.createdAt inside window | Excludes unknown dates and deleted tickets |
| `currently_done_completion_records` | Currently done tasks with non-null completedAt inside window | Latest current completion episode, not every completion transition |
| `dated_currently_done_completion_records` | Previous cohort with non-null expectedCompletion | Dated-completion denominator |
| `on_time_currently_done_completion_records` | Dated completion cohort whose local completion day is on/before expected UTC date | Uses current editable expected date, not original commitment |
| `on_time_dated_completion_fraction` | On-time recorded completions / dated recorded completions | Requires date/legacy coverage warnings and both counts |
| `payment_records`, `recorded_receipts_inr` | Retained Payment rows whose receivedAt falls in window; sum amount in INR | Stated receipt date, not entry time; removal and ticket deletion restate history |
| `enquiry_created_records` | Surviving enquiries whose createdAt falls in window, all current statuses | Stored arrivals, not all attempts, unique leads, or visitor conversion |

### Legacy timestamps, reopening, and audit history

Task creation/completion columns are nullable without migration defaults or backfill.
tasks_missing_created_at counts unknown creation dates; done_tasks_missing_completed_at counts done tasks with unknown completion dates.
NULL means unknown/unset, not proof of a pre-migration row. Never impute dates from updatedAt, migrations, expected dates, or report dates.
A legacy task can acquire a completion stamp while creation stays unknown; it enters completion but not creation counts.
Creating work already done stamps both fields. Moving to done stamps completedAt; remaining done preserves it.
Leaving done clears the stamp; recompletion replaces it. A no-op done update does not repair a legacy NULL completion stamp.
Past window counts can fall or move between days. Expected-date edits can restate on-time fractions.
The current-row query cannot establish first completion, every transition, active cycle time, reopen rate, or individual productivity.

ActivityLog now supplies append-only API action history with timestamps, actors, and changes; it supersedes the earlier no-activity-history source limit.
Personal sign-in can identify an actor; shared sign-in identifies only the shared role. API log records can outlive tickets and removed payments.
However, direct database writes/migrations bypass API logging, historical actions are not backfilled, and environment cutover remains unverified.
Old client actions and new ticket actions coexist in the log. Task.client text and audit summaries are not safe historical join keys.
This query intentionally does not read or grant ActivityLog, which contains private text, amounts, IPs, and user agents.
Separate audit-based aggregates need model-aware definitions, privacy review, and verified cutover; their existence does not make these snapshot flows immutable.
No adoption, retention, login, or employee-performance KPI is implemented here.

### Receipt removal, ticket deletion, and migration loss

Record Payment creates a task-linked Payment without changing fee. Receipt dates can be backdated or future-dated; there is no Payment creation timestamp.
Late entry can restate an earlier receipt day. Fee edits can change current outstanding without any receipt.
Explicit payment removal deletes the row: retained receipts fall and the surviving ticket's outstanding can rise.
Removing a payment is not a negative Payment row in this query. The API records payment.removed in ActivityLog, outside these aggregates.
Deleting a ticket cascades to all its Payment rows and removes its fee, balance, workload, and timestamp-window contribution.
The deletion API records a snapshot and payment details in ActivityLog; this query does not reconstruct those deleted records.

The ticket migration source specifies DELETE FROM Payment before replacing clientId with taskId and dropping Client.
This describes source behavior, not evidence that production executed the migration. Production cutover remains unverified.
It does not assign old payments or balances to tickets, infer fees, or reconstruct customer relations. Existing task fee and lastReminder values start NULL.
The migration comment calls former rows sample data; no production inspection here verifies their contents or safety.
Treat prior-payment removal as a model/history reset, NOT refunded money, negative collections, new paid work, or operational improvement.

## Cutover and historical-comparison contract

Migration files describe schema operations, not verified environment deployment times.
Verify each relevant migration application AND API rollout: task timestamps, enquiries, ActivityLog if used elsewhere, and ticket receivables.
For ticket money/reminder coverage, use the later of the ticket migration and compatible API rollout, plus confirmed office adoption/import policy.
Do not assume the SQL file date or earliest surviving receipt proves complete coverage.
Mark pre-cutover windows unavailable and cutover days partial. Full-day coverage starts at the next local midnight after cutover.
A cutover exactly at local midnight can qualify that day after completeness checks.
The query does not infer a cutoff or certify completeness. Until verified, all timestamp windows remain provisional, including zero outputs.
Backdated post-cutover receipts do not restore earlier-model history or prove complete pre-cutover coverage.

Do not compare version 1/2 Client balances, client counts, overdue categories, lastCall proxies, or client-linked receipt totals with version 3 ticket metrics.
Even identically named receipt keys have a different relation and a destructive history boundary. No valid bridge exists by customer name.
Do not splice old/new totals, compute cross-model growth rates, or describe a model-reset difference as business performance.
Post-reset baselines require the same version/model, source, cohort, timezone, verified full-day coverage, and quality gates.
D-1/D-2/D-8 windows can still restate through late entry, explicit removal, and deletion; label them retained-row observations.
Current-stock comparisons require approved same-time aggregate snapshots. Current rows cannot reconstruct historical closing balances.
No snapshot store or schedule is added here. Mock-mode changes do not reach this database, and source freshness remains unverified.

## Quality and publication gates

Inspect flags before publication. Stop affected reporting until the owner checks nonzero defects:

- invalid_task_status_records and invalid_enquiry_status_records: unexpected current statuses.
- negative_fee_tasks: fee below zero; known_fees_inr retains the invalid value.
- fees_below_received_tasks: retained receipts exceed a known fee; outstanding still clamps at zero like the app.
- payments_on_unset_fee_tasks: any payment rows attached to an unknown fee.
- nonpositive_payment_records: zero/negative receipt rows, which raw totals retain.
- future_last_reminder_tasks, future_task_timestamp_records, future_payment_records, future_enquiry_records: future instants.
- non_done_tasks_with_completed_at and task_completion_before_creation_records: inconsistent task timestamp state.

Missing task timestamps and unknown fees are coverage warnings, not automatically corrupt data.
These checks do not detect all direct-write defects, removed history, demo records, or incomplete ingestion.
The query exposes defects; it does not repair data, suppress output, or implement publication policy.

## Restricted role and exact wrapper

Use approved reporting credentials, not the application-owner connection. Financial output stays restricted to an owner-approved admin audience.
Keep only aggregate output; no names, IDs, contact fields, notes, task text, password hashes, or audit payloads enter the report.
The role can read individual permitted source columns; only this query enforces aggregate-only output. Keep its credentials private.

### Administrator setup, separate from reporting

Connect to the intended database as an authorized administrator through psql -X.
The tested example requires a new role without memberships. Stop if the role already exists and review its grants separately.

```sql
CREATE ROLE nk_metrics_reader LOGIN
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
SELECT format('GRANT CONNECT ON DATABASE %I TO nk_metrics_reader', current_database())
\gexec
GRANT USAGE ON SCHEMA public TO nk_metrics_reader;
GRANT SELECT (id) ON TABLE public."Employee" TO nk_metrics_reader;
GRANT SELECT (id, status, priority, "assigneeId", "expectedCompletion", "createdAt", "completedAt", fee, "lastReminder") ON TABLE public."Task" TO nk_metrics_reader;
GRANT SELECT ("taskId", amount, "receivedAt") ON TABLE public."Payment" TO nk_metrics_reader;
GRANT SELECT (status, "createdAt") ON TABLE public."Enquiry" TO nk_metrics_reader;
ALTER ROLE nk_metrics_reader SET default_transaction_read_only = on;
```

Set the password with `\password nk_metrics_reader` through the hidden prompt. Do not put secrets into SQL, shell history, or reports.
Use the provider's required TLS settings for REPORTING_DATABASE_URL. No Client grant belongs in current setup.
Do not grant ActivityLog, private text, passwordHash, broad table SELECT, owner membership, or application-role membership.
Existing reporting roles need explicit removal/review of earlier table and column grants; adding narrow grants does not remove old access.
Inspect inherited PUBLIC privileges. Do not change shared PUBLIC grants without a separate access review.
The read-only default is only a safeguard: a role can override its own transaction mode. Permissions must deny writes independently.

```sh
psql -X "$REPORTING_DATABASE_URL" --set=ON_ERROR_STOP=1 \
  --file=apps/backend/reporting/run-operational-metrics.psql
```

The exact wrapper uses read-only repeatable-read execution, five-second statement and one-second lock limits, and pg_catalog, public, pg_temp search path.
Use one connection and no concurrent reporting runs. It creates no objects and performs no persistent writes.
Missing tables/columns/permissions or timeout means failed reporting, not zero. Current source migrations must already exist in the reporting environment.
Never run migration, seed, or test commands against production for report setup. This PR performs no merge, deployment, or production operation.

## Verification and owner decisions

[Reporting tests](../../apps/backend/test/reporting.test.js) use isolated synthetic PostgreSQL tables and execute the actual ticket migration on a synthetic old-model fixture.
They cover unknown/zero fees, aggregation without fanout, derived status, payment removal, task cascade, migration loss, date windows, legacy nulls, reopening, and read-only execution.
Independent verification replays current migrations on fresh and upgrade synthetic databases and runs the exact wrapper with the documented restricted role.
Run repository checks only against a disposable local database. No test certifies production cutover or approved KPIs.

The owner must confirm source authority, demo exclusions, model cutover, date coverage, audience, timezone, and candidate selection before publication.
Every report must identify definition/model version, observation time, window dates, source, cutover status, denominators, quality flags, and restatement limits.
