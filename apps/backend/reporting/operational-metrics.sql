-- Definition version 3. Stocks are current, flows use surviving timestamped rows.
-- Migration/deployment cutover and legacy coverage need owner verification.
-- PostgreSQL timestamp-without-time-zone columns contain Prisma UTC values.
-- Use run-operational-metrics.psql for a bounded, read-only transaction.
WITH clock AS (
  SELECT CURRENT_TIMESTAMP AS observed_at,
         (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date AS today
), windows AS (
  SELECT *, today - 1 AS reporting_day,
         ((today - 1)::timestamp AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'UTC' AS day_start_utc,
         (today::timestamp AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'UTC' AS day_end_utc
  FROM clock
), tasks AS (
  SELECT count(*) AS task_records,
         count(*) FILTER (WHERE status IN ('todo', 'inprogress')) AS open_tasks,
         count(*) FILTER (WHERE status = 'inprogress') AS inprogress_tasks,
         count(*) FILTER (WHERE status IN ('todo', 'inprogress') AND priority = 'high') AS high_priority_open_tasks,
         count(*) FILTER (WHERE status IN ('todo', 'inprogress') AND "expectedCompletion" IS NOT NULL) AS dated_open_tasks,
         count(*) FILTER (WHERE status IN ('todo', 'inprogress') AND "expectedCompletion"::date < w.today) AS overdue_open_tasks,
         count(*) FILTER (WHERE status IN ('todo', 'inprogress') AND "expectedCompletion" IS NULL) AS undated_open_tasks,
         count(*) FILTER (WHERE "createdAt" IS NULL) AS tasks_missing_created_at,
         count(*) FILTER (WHERE status = 'done' AND "completedAt" IS NULL) AS done_tasks_missing_completed_at,
         count(*) FILTER (WHERE status <> 'done' AND "completedAt" IS NOT NULL) AS non_done_tasks_with_completed_at,
         count(*) FILTER (WHERE "completedAt" < "createdAt") AS task_completion_before_creation_records,
         count(*) FILTER (WHERE "createdAt" > w.observed_at AT TIME ZONE 'UTC'
                          OR "completedAt" > w.observed_at AT TIME ZONE 'UTC') AS future_task_timestamp_records,
         count(*) FILTER (WHERE status NOT IN ('todo', 'inprogress', 'done')) AS invalid_task_status_records
  FROM "Task" CROSS JOIN windows w
), employees AS (
  SELECT count(*) AS employee_records,
         count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM "Task" t WHERE t."assigneeId" = e.id AND t.status IN ('todo', 'inprogress')
         )) AS employees_with_open_tasks
  FROM "Employee" e
), payment_by_task AS (
  -- Aggregate before joining: multiple payments must not multiply fees/tasks.
  SELECT "taskId", sum(amount::bigint) AS received, count(*) AS payment_count
  FROM "Payment" GROUP BY "taskId"
), ticket_balances AS (
  SELECT t.fee, t."lastReminder", coalesce(p.received, 0) AS received,
         coalesce(p.payment_count, 0) AS payment_count,
         CASE WHEN t.fee IS NULL THEN 0
              ELSE greatest(0, t.fee::bigint - coalesce(p.received, 0)) END AS known_outstanding
  FROM "Task" t LEFT JOIN payment_by_task p ON p."taskId" = t.id
), receivables AS (
  SELECT count(*) FILTER (WHERE fee IS NULL) AS fee_unset_tasks,
         count(*) FILTER (WHERE fee IS NOT NULL) AS known_fee_tasks,
         count(*) FILTER (WHERE fee = 0) AS zero_fee_tasks,
         count(*) FILTER (WHERE fee > 0) AS positive_fee_tasks,
         count(*) FILTER (WHERE fee IS NOT NULL AND received < fee AND received <= 0) AS billing_unpaid_tasks,
         count(*) FILTER (WHERE fee IS NOT NULL AND received < fee AND received > 0) AS billing_part_paid_tasks,
         count(*) FILTER (WHERE fee IS NOT NULL AND received >= fee) AS billing_paid_tasks,
         count(*) FILTER (WHERE fee IS NULL OR received < fee) AS billing_pending_tasks,
         count(*) FILTER (WHERE known_outstanding > 0) AS outstanding_fee_tasks,
         coalesce(sum(fee::bigint), 0) AS known_fees_inr,
         coalesce(sum(received), 0) AS retained_receipts_inr,
         coalesce(sum(known_outstanding), 0) AS known_outstanding_inr,
         count(*) FILTER (WHERE known_outstanding > 0 AND "lastReminder" IS NULL) AS outstanding_tasks_without_reminder,
         count(*) FILTER (WHERE known_outstanding > 0 AND "lastReminder" >= w.day_start_utc AND "lastReminder" < w.day_end_utc) AS outstanding_tasks_latest_reminder_previous_day,
         count(*) FILTER (WHERE known_outstanding > 0 AND (("lastReminder" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::date <= w.today - 7) AS outstanding_tasks_reminder_age_7d,
         count(*) FILTER (WHERE fee < 0) AS negative_fee_tasks,
         count(*) FILTER (WHERE fee IS NOT NULL AND received > fee) AS fees_below_received_tasks,
         count(*) FILTER (WHERE fee IS NULL AND payment_count > 0) AS payments_on_unset_fee_tasks,
         count(*) FILTER (WHERE "lastReminder" > w.observed_at AT TIME ZONE 'UTC') AS future_last_reminder_tasks
  FROM ticket_balances CROSS JOIN windows w
), payment_quality AS (
  SELECT count(*) AS surviving_payment_records,
         count(*) FILTER (WHERE amount <= 0) AS nonpositive_payment_records,
         count(*) FILTER (WHERE "receivedAt" > w.observed_at AT TIME ZONE 'UTC') AS future_payment_records
  FROM "Payment" p CROSS JOIN windows w
), enquiries AS (
  SELECT count(*) AS enquiry_records,
         count(*) FILTER (WHERE status IN ('new', 'contacted')) AS open_enquiry_records,
         count(*) FILTER (WHERE status NOT IN ('new', 'contacted', 'closed')) AS invalid_enquiry_status_records,
         count(*) FILTER (WHERE "createdAt" > w.observed_at AT TIME ZONE 'UTC') AS future_enquiry_records
  FROM "Enquiry" CROSS JOIN windows w
), flow_days AS (
  SELECT label, w.today - days_ago AS reporting_day
  FROM windows w CROSS JOIN (VALUES
    ('last_complete_day', 1), ('prior_day', 2), ('week_baseline', 8)
  ) AS offsets(label, days_ago)
), flow_windows AS (
  SELECT *, (reporting_day::timestamp AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'UTC' AS start_utc,
         ((reporting_day + 1)::timestamp AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'UTC' AS end_utc
  FROM flow_days
), flows AS (
  SELECT f.*,
         t.task_created_records, t.currently_done_completion_records,
         t.dated_currently_done_completion_records, t.on_time_currently_done_completion_records,
         t.on_time_currently_done_completion_records::numeric
           / nullif(t.dated_currently_done_completion_records, 0) AS on_time_dated_completion_fraction,
         p.payment_records, p.recorded_receipts_inr, q.enquiry_created_records
  FROM flow_windows f
  CROSS JOIN LATERAL (
    SELECT count(*) FILTER (WHERE "createdAt" >= f.start_utc AND "createdAt" < f.end_utc) AS task_created_records,
           count(*) FILTER (WHERE status = 'done' AND "completedAt" >= f.start_utc AND "completedAt" < f.end_utc) AS currently_done_completion_records,
           count(*) FILTER (WHERE status = 'done' AND "completedAt" >= f.start_utc AND "completedAt" < f.end_utc
                            AND "expectedCompletion" IS NOT NULL) AS dated_currently_done_completion_records,
           count(*) FILTER (WHERE status = 'done' AND "completedAt" >= f.start_utc AND "completedAt" < f.end_utc
                            AND (("completedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::date <= "expectedCompletion"::date)
             AS on_time_currently_done_completion_records
    FROM "Task"
  ) t
  CROSS JOIN LATERAL (
    SELECT count(*) AS payment_records, coalesce(sum(amount::bigint), 0) AS recorded_receipts_inr
    FROM "Payment" WHERE "receivedAt" >= f.start_utc AND "receivedAt" < f.end_utc
  ) p
  CROSS JOIN LATERAL (
    SELECT count(*) AS enquiry_created_records
    FROM "Enquiry" WHERE "createdAt" >= f.start_utc AND "createdAt" < f.end_utc
  ) q
)
SELECT 3 AS definition_version, 'task_fee_payment_task_id' AS receivables_model,
       w.observed_at, 'Asia/Kolkata' AS reporting_timezone, w.reporting_day,
       w.day_start_utc, w.day_end_utc, 7 AS stale_stamp_days,
       t.*, e.*, r.*, p.*, q.*,
       (SELECT jsonb_agg(to_jsonb(flows) ORDER BY reporting_day DESC) FROM flows) AS flow_windows,
       t.overdue_open_tasks::numeric / nullif(t.dated_open_tasks, 0) AS overdue_dated_open_fraction,
       e.employees_with_open_tasks::numeric / nullif(e.employee_records, 0) AS roster_with_open_tasks_fraction,
       r.known_fee_tasks::numeric / nullif(t.task_records, 0) AS fee_coverage_fraction,
       r.outstanding_tasks_latest_reminder_previous_day::numeric / nullif(r.outstanding_fee_tasks, 0) AS latest_reminder_previous_day_fraction
FROM windows w CROSS JOIN tasks t CROSS JOIN employees e CROSS JOIN receivables r
CROSS JOIN payment_quality p CROSS JOIN enquiries q;
