# Feature-to-metric coverage inventory

Candidate definitions, version 2. No approved KPIs, production access, ingestion verification, or live values are claimed.
Source baseline: `main` at `87faad62c2d13e64c3a701cc148a6914c19d28e1`.
This baseline includes the capabilities named in requested revision `d251760dcb1b886ee06fce948709aca03484f60c`.
All status assessments below describe code support, not verified production completeness.
See [definitions, cohorts, windows, and gates](operational-metrics.md) and the [aggregate SQL](../../apps/backend/reporting/operational-metrics.sql).

## Current coverage

| Workflow / source | Candidate coverage in this PR | Coverage limit / missing evidence |
| --- | --- | --- |
| Work assignment: Task.assigneeId, Employee.id | Current open/in-progress/high-priority workload; roster assignment fraction | Assignment is not an activity actor, attendance, adoption, capacity, or effort. No employee-level output. |
| Schedule: Task.expectedCompletion | Undated/dated open counts; overdue dated-open fraction | Optional current date; fresh seed omits it. Owner must approve coverage gate. |
| Task intake: Task.createdAt | Surviving timestamped creation counts in three complete-day windows | Nullable, no legacy backfill, deleted tasks absent; null means unknown/unset. |
| Completion: Task.completedAt and status | Current done rows whose latest completion falls in each window; dated on-time fraction | Reopen clears stamp; recompletion replaces it. No transition ledger or first-completion history. Expected-date edits restate on-time quality. |
| Client receivables: Client.due/status | Current recorded balance and manually overdue exposure | Not original invoice value, revenue, contractual aging, or historical closing balance; direct edits remain possible. |
| Payment recording: Payment.amount/receivedAt | Retained payment count and INR sum by stated receipt day | Payment history now exists. User can backdate/future-date; no ingestion time. Client deletion cascades to payment history. No pre-cutover completeness or reconciliation. |
| Reminder logging: Client.lastCall | Latest-stamp and stale-stamp diagnostics | Defaults on client creation; overwrite loses earlier stamps; does not prove or count calls. |
| Enquiry arrival: Enquiry.createdAt | Retained arrivals by day; current open queue | Server timestamps stored rows. Deleted, rejected, rate-limited, and honeypot-suppressed submissions absent. Not all attempts or unique leads. |
| Enquiry follow-up: Enquiry.status | Current new/contacted backlog only | No contact/closure dates, status ledger, visitor denominator, or link to Client; no response-time or conversion metric. |
| Personal/shared auth: tokens and Employee.passwordHash | No login/adoption metric in this query | Personal tokens can carry identity; shared tokens cannot. No persistent login/activity ledger or business-row actor. Password hash is not queried or granted. |
| Mock-mode UI | No database-report coverage | Without VITE_API_URL, in-memory changes do not reach these sources. |

## Superseded source limits

- Version 1 said task creation/completion timestamps did not exist. They now exist but remain nullable and mutable as described above.
- Version 1 described payment recording as balance-only with no history. Payment rows now record receipts; pre-history and deletion gaps remain.
- Earlier wording said personal identity did not exist. Optional personal auth now exists, but stored per-person activity evidence does not.
- Timestamped enquiries now support retained-arrival counts, not a visitor-to-customer funnel or timed follow-up.

## Coverage gates and operational gaps

| Gate / gap | Required decision or evidence | Current status |
| --- | --- | --- |
| Source cutover per environment | Confirm migration application and API rollout for task timestamps, payments, and enquiries | Unverified; migration filenames are not deployment evidence |
| Legacy tasks | Publish missing-created and done-missing-completed counts; never impute timestamps | Query provides aggregate warnings |
| Reporting dates | Asia/Kolkata half-open complete days: D-1, D-2, D-8 | Proposed; query returns each date and UTC boundary |
| Full-day comparisons | Both windows must follow verified cutover and meet cohort/quality checks | Provisional until owner verification; zero is not proof of complete coverage |
| Stock comparisons | Retain approved same-time aggregate snapshots | Not implemented; current rows cannot reconstruct historical stocks |
| Deleted/reopened history | Use qualified retained/current-state labels; retain restatement caveats | No event ledger or audit-store change in this PR |
| Sensitive financial output | Owner-approved admin audience and restricted database grants | Instructions provided; no production permissions or report audience verified |
| Source validation | Synthetic PostgreSQL tests and independent read-only checks | Executable coverage lives in `apps/backend/test/reporting.test.js`; not live ingestion or dashboard validation |

Potential future work includes activity/transition history, deletion-safe receipt audit, and enquiry follow-up timestamps.
Those require separate product, privacy, and instrumentation decisions. This PR does not implement them.
No dashboard, schedule, analytics project, or event ingestion is claimed complete.
