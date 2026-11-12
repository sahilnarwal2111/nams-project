# Feature-to-metric coverage inventory

Candidate definitions, version 3. No approved KPIs, production access, live values, or environment cutover are verified.
Source baseline: `main` at `1c1009526f4af2ab0bd1082237fa7a3bcb8f94b4`.
See [definitions and safety gates](operational-metrics.md) and the [aggregate SQL](../../apps/backend/reporting/operational-metrics.sql).
This reporting PR changes no application behavior, instrumentation, schema, dashboard, or schedule.

## Current workflow coverage

| Workflow / source | Candidate coverage in this PR | Coverage limit |
| --- | --- | --- |
| Assignment: Task.assigneeId, Employee.id | Current workload and roster assignment fraction | Assignment is not actor activity, adoption, capacity, effort, or attendance; no employee-level output. |
| Work schedule: Task.expectedCompletion | Dated/undated open work and overdue work fraction | Optional, editable work deadline; not a payment due date. Fresh seed omits dates. |
| Task creation/completion timestamps | Surviving task intake, current latest-done episodes, dated on-time fraction in D-1/D-2/D-8 windows | Nullable legacy stamps; reopening clears completion and recompletion replaces it; deletion removes history from this query. |
| Fee entry: Task.fee | Unknown, zero, positive, known counts; known-fee coverage and recorded charges | NULL is unknown, not zero. Zero is explicit no-charge work; unknown fees leave unquantified exposure. |
| Current receivables: Task.fee minus retained Payment amounts | Derived unset/unpaid/part/paid, pending counts, known outstanding and retained receipts | All work statuses included; preaggregate payments to avoid multiplying fees. Not customer counts, revenue, or lifetime cash. |
| Receipt recording: Payment.taskId/amount/receivedAt | Retained receipt count and INR sums by stated receipt day | Dates can be late/backdated/future. No Payment ingestion timestamp. Current task relation differs from former client relation. |
| Explicit receipt removal | Tests show retained receipt history shrinks and task outstanding rises | Removal deletes Payment; it is not a negative receipt in this query. API writes a payment.removed audit entry. |
| Ticket deletion | Tests show ticket, fee, workload, and linked receipt history disappear | Payment.taskId cascades. API audit retains deleted details; query does not reconstruct audit payloads. |
| Reminder logging: Task.lastReminder | No-stamp count, latest-day and seven-day-age diagnostics within known-outstanding cohort | Nullable, overwritten stamp; separate unknown fee/unknown reminder cohorts. Not verified contact or call counts. |
| Enquiry arrival/current status | Surviving arrivals by day and current open queue | Deleted/rejected/rate-limited/honeypot requests absent; no unique-lead or visitor denominator. |
| Personal/shared identity and ActivityLog | Source audit history exists; excluded from this aggregate query | Personal actors can be identified, shared actors cannot. Log has private payloads, mixed old/new models, unverified cutover, and no pre-log backfill. |
| Mock-mode UI | No database-report coverage | In-memory changes without VITE_API_URL do not reach these sources. |

## Superseded assumptions and destructive migration

- Client no longer exists. Task.client is free text, not a customer foreign key. Do not restore Client SQL or join by customer name.
- Payment.taskId replaces Payment.clientId. Current fees and outstanding are ticket-level, not old client balances.
- The [ticket migration source](../../apps/backend/prisma/migrations/20261111133000_receivables_by_ticket/migration.sql) specifies deletion of ALL prior Payment rows before changing the relation.
- This is source behavior, not evidence of production execution. Production cutover remains unverified.
- The migration drops Client and adds nullable Task.fee/lastReminder. It supplies no old-to-new mapping, fee backfill, or payment carryover.
- Source comments call old rows sample data. No live-data inspection here verifies that assertion; reporting must acknowledge the deletion boundary regardless.
- Version 1/2 balance, client count, overdue category, lastCall, and old-linked receipt baselines are not comparable with version 3 ticket metrics.
- Do not splice models, compute cross-model growth, or label migration deletions as refunds, cash outflow, improved collections, or business growth.
- ActivityLog now exists. Earlier statements that no stored API action history exists are superseded. This query still uses current business rows, not audit reconstruction.

## Publication gates and remaining gaps

| Gate / gap | Required evidence or decision | Current coverage |
| --- | --- | --- |
| Per-environment model cutover | Confirm ticket migration, compatible API rollout, and office adoption/import policy | Unverified; migration filename and earliest receipt are not deployment evidence |
| Fresh/upgrade migration safety | Execute current migrations on synthetic fresh schema and actual prior-payment fixture | Reporting regression includes destructive migration; independent verification covers full migration chain |
| Unknown vs zero fees | Display unknown count and known-fee fraction beside quantified outstanding | SQL supplies separate cohorts; no imputation of unknown charges |
| Legacy timestamps | Display missing creation and done-missing-completion counts | NULL remains unknown; no guessed dates |
| Reporting dates | Asia/Kolkata half-open complete days D-1, D-2, D-8 | Explicit dates and UTC bounds returned; timezone needs owner approval |
| Full-day comparisons | Both days must follow verified model cutover and meet quality gates | Pre-cutover unavailable; cutover day partial; zero alone does not prove coverage |
| Mutable receipt history | Label totals retained; disclose late entry, explicit removal, and ticket cascade | Tested, not reconstructed from ActivityLog |
| Cross-model history | Reject former Client-model baselines even where output key names match | Version/model marker and explicit definitions; no historical bridge exists |
| Stock baselines | Retain approved same-time aggregate snapshots within the same model/version | No snapshot store added; current rows do not reconstruct historical stocks |
| Sensitive data | Restricted column grants and aggregate-only output | No ActivityLog/passwordHash/private-text grant; tests check exact wrapper and denials |
| Source validation | Synthetic PostgreSQL integration and migration tests | No live ingestion, production cutover, or dashboard validation claimed |

Future audit-based reporting needs a separate model-aware privacy and definition review.
The audit source can preserve post-cutover actions, but direct SQL/migrations can bypass API logging and old/new payment actions need separate interpretation.
No approved revenue, lifetime collection, retention, conversion, adoption, or employee-performance KPI is supplied here.
