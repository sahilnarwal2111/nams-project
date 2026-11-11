-- Definition version 1. Current-state aggregates, NOT a historical day-end report.
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
         count(*) FILTER (WHERE status NOT IN ('todo', 'inprogress', 'done')) AS invalid_task_status_records
  FROM "Task" CROSS JOIN windows w
), employees AS (
  SELECT count(*) AS employee_records,
         count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM "Task" t WHERE t."assigneeId" = e.id AND t.status IN ('todo', 'inprogress')
         )) AS employees_with_open_tasks
  FROM "Employee" e
), clients AS (
  SELECT count(*) AS client_records,
         count(*) FILTER (WHERE due > 0) AS balance_client_records,
         coalesce(sum(due::bigint), 0) AS recorded_balance_inr,
         count(*) FILTER (WHERE status = 'overdue' AND due > 0) AS overdue_balance_client_records,
         coalesce(sum(due::bigint) FILTER (WHERE status = 'overdue' AND due > 0), 0) AS overdue_recorded_balance_inr,
         count(*) FILTER (WHERE due > 0 AND "lastCall" >= w.day_start_utc AND "lastCall" < w.day_end_utc) AS balance_clients_latest_stamp_previous_day,
         count(*) FILTER (WHERE due > 0 AND (("lastCall" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::date <= w.today - 7) AS balance_clients_stamp_age_7d,
         count(*) FILTER (WHERE "lastCall" > w.observed_at AT TIME ZONE 'UTC') AS future_last_call_records,
         count(*) FILTER (WHERE status = 'paid' AND due > 0) AS paid_positive_balance_records,
         count(*) FILTER (WHERE due < 0) AS negative_balance_records,
         count(*) FILTER (WHERE status NOT IN ('paid', 'due-soon', 'overdue')) AS invalid_client_status_records
  FROM "Client" CROSS JOIN windows w
)
SELECT 1 AS definition_version,
       w.observed_at, 'Asia/Kolkata' AS reporting_timezone, w.reporting_day,
       w.day_start_utc, w.day_end_utc, 7 AS stale_stamp_days,
       t.*, e.*, c.*,
       t.overdue_open_tasks::numeric / nullif(t.dated_open_tasks, 0) AS overdue_dated_open_fraction,
       e.employees_with_open_tasks::numeric / nullif(e.employee_records, 0) AS roster_with_open_tasks_fraction,
       c.overdue_recorded_balance_inr::numeric / nullif(c.recorded_balance_inr, 0) AS overdue_balance_fraction,
       c.balance_clients_latest_stamp_previous_day::numeric / nullif(c.balance_client_records, 0) AS latest_stamp_previous_day_fraction
FROM windows w CROSS JOIN tasks t CROSS JOIN employees e CROSS JOIN clients c;
