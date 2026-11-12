import 'dotenv/config';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prisma } from '../src/lib/prisma.js';

const sql = await readFile(new URL('../reporting/operational-metrics.sql', import.meta.url), 'utf8');
const wrapper = await readFile(new URL('../reporting/run-operational-metrics.psql', import.meta.url), 'utf8');
// Freeze ONLY the clock expression; all aggregation and window SQL stays intact.
// This instant is 00:15 on November 11 in Asia/Kolkata, but November 10 UTC.
const frozenSql = sql.replaceAll('CURRENT_TIMESTAMP', "TIMESTAMPTZ '2026-11-10T18:45:00Z'");
after(() => prisma.$disconnect());

async function fixture(run) {
  return prisma.$transaction(async (tx) => {
    // Session-local shadow tables keep fixtures separate from API tests and seed data.
    for (const table of ['Employee', 'Task', 'Payment', 'Enquiry']) {
      await tx.$executeRawUnsafe(`CREATE TEMP TABLE "${table}" (LIKE public."${table}" INCLUDING DEFAULTS) ON COMMIT DROP`);
    }
    await tx.$executeRawUnsafe('ALTER TABLE pg_temp."Task" ADD PRIMARY KEY (id)');
    await tx.$executeRawUnsafe('ALTER TABLE pg_temp."Payment" ADD FOREIGN KEY ("taskId") REFERENCES pg_temp."Task"(id) ON DELETE CASCADE');
    return run(tx);
  });
}

async function report(tx, query = frozenSql) {
  const rows = await tx.$queryRawUnsafe(query);
  assert.equal(rows.length, 1);
  return rows[0];
}

const expectedKeys = [
  'definition_version', 'receivables_model', 'observed_at', 'reporting_timezone', 'reporting_day',
  'day_start_utc', 'day_end_utc', 'stale_stamp_days', 'task_records', 'open_tasks',
  'inprogress_tasks', 'high_priority_open_tasks', 'dated_open_tasks', 'overdue_open_tasks',
  'undated_open_tasks', 'invalid_task_status_records', 'employee_records', 'employees_with_open_tasks',
  'fee_unset_tasks', 'known_fee_tasks', 'zero_fee_tasks', 'positive_fee_tasks',
  'billing_unpaid_tasks', 'billing_part_paid_tasks', 'billing_paid_tasks', 'billing_pending_tasks',
  'outstanding_fee_tasks', 'known_fees_inr', 'retained_receipts_inr', 'known_outstanding_inr',
  'outstanding_tasks_without_reminder', 'outstanding_tasks_latest_reminder_previous_day',
  'outstanding_tasks_reminder_age_7d', 'negative_fee_tasks', 'fees_below_received_tasks',
  'payments_on_unset_fee_tasks', 'future_last_reminder_tasks',
  'overdue_dated_open_fraction', 'roster_with_open_tasks_fraction', 'fee_coverage_fraction',
  'latest_reminder_previous_day_fraction',
  'tasks_missing_created_at', 'done_tasks_missing_completed_at', 'non_done_tasks_with_completed_at',
  'task_completion_before_creation_records', 'future_task_timestamp_records',
  'surviving_payment_records', 'nonpositive_payment_records', 'future_payment_records',
  'enquiry_records', 'open_enquiry_records', 'invalid_enquiry_status_records', 'future_enquiry_records',
  'flow_windows',
];

const flowKeys = [
  'label', 'reporting_day', 'start_utc', 'end_utc', 'task_created_records',
  'currently_done_completion_records', 'dated_currently_done_completion_records',
  'on_time_currently_done_completion_records', 'on_time_dated_completion_fraction',
  'payment_records', 'recorded_receipts_inr', 'enquiry_created_records',
];

test('report returns exactly one allowlisted aggregate row, zero totals, and undefined empty fractions', async () => {
  await fixture(async (tx) => {
    const row = await report(tx);
    assert.deepEqual(Object.keys(row).sort(), [...expectedKeys].sort());
    for (const key of expectedKeys.filter((k) => /_fraction$/.test(k))) assert.equal(row[key], null);
    for (const key of ['open_tasks', 'task_records', 'fee_unset_tasks', 'employee_records', 'overdue_open_tasks']) {
      assert.equal(row[key], 0n);
    }
    assert.equal(Number(row.known_outstanding_inr), 0);
    assert.equal(Number(row.retained_receipts_inr), 0);
    assert.equal(row.definition_version, 3);
    assert.equal(row.receivables_model, 'task_fee_payment_task_id');
    assert.deepEqual(row.flow_windows.map((f) => f.label), ['last_complete_day', 'prior_day', 'week_baseline']);
    for (const flow of row.flow_windows) {
      assert.deepEqual(Object.keys(flow).sort(), [...flowKeys].sort());
      assert.equal(flow.on_time_dated_completion_fraction, null);
      for (const key of flowKeys.filter((k) => /_records$|_inr$/.test(k))) assert.equal(flow[key], 0);
    }
    // Also execute the unchanged, real-time production SELECT.
    const current = await report(tx, sql);
    assert.equal(current.open_tasks, 0n);
    assert.ok(current.observed_at instanceof Date);
  });
});

test('workload uses open statuses, UTC calendar dates, and distinct roster employees', async () => {
  await fixture(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "Employee" (id, name, role, initials) VALUES
      ('a', 'PRIVATE EMPLOYEE', 'role', 'AA'), ('b', 'PRIVATE EMPLOYEE', 'role', 'BB'),
      ('c', 'PRIVATE EMPLOYEE', 'role', 'CC')`;
    await tx.$executeRaw`
      INSERT INTO "Task" (id, title, client, status, priority, "assigneeId", "updatedAt", "expectedCompletion") VALUES
      ('1', 'PRIVATE TASK', 'PRIVATE CUSTOMER', 'todo', 'high', 'a', now(), '2026-11-10'),
      ('2', 'PRIVATE TASK', 'PRIVATE CUSTOMER', 'inprogress', 'high', 'a', now(), '2026-11-11'),
      ('3', 'PRIVATE TASK', 'PRIVATE CUSTOMER', 'todo', 'low', 'b', now(), NULL),
      ('4', 'PRIVATE TASK', 'PRIVATE CUSTOMER', 'done', 'high', 'c', now(), '2026-11-01'),
      ('5', 'PRIVATE TASK', 'PRIVATE CUSTOMER', 'unexpected', 'high', 'c', now(), '2026-11-01'),
      ('6', 'PRIVATE TASK', 'PRIVATE CUSTOMER', 'todo', 'medium', 'b', now(), '2026-11-12'),
      ('7', 'PRIVATE TASK', 'PRIVATE CUSTOMER', 'todo', 'low', 'b', now(), '2026-11-10 23:30:00')`;
    const row = await report(tx);
    assert.equal(row.task_records, 7n);
    assert.equal(row.open_tasks, 5n);
    assert.equal(row.inprogress_tasks, 1n);
    assert.equal(row.high_priority_open_tasks, 2n);
    assert.equal(row.dated_open_tasks, 4n);
    assert.equal(row.overdue_open_tasks, 2n);
    assert.equal(row.undated_open_tasks, 1n);
    assert.equal(row.invalid_task_status_records, 1n);
    assert.equal(Number(row.overdue_dated_open_fraction), 0.5);
    assert.equal(row.employee_records, 3n);
    assert.equal(row.employees_with_open_tasks, 2n);
    assert.ok(Math.abs(Number(row.roster_with_open_tasks_fraction) - 2 / 3) < 1e-12);
    assert.ok(!JSON.stringify(row, (_, v) => typeof v === 'bigint' ? String(v) : v).includes('PRIVATE'));
  });
});

test('ticket fees distinguish unknown from zero, derive status, and avoid payment join fanout', async () => {
  await fixture(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "Task" (id, title, client, status, priority, "assigneeId", "updatedAt", fee) VALUES
      ('unset', 'PRIVATE', 'PRIVATE', 'todo', 'low', 'a', now(), NULL),
      ('free', 'PRIVATE', 'PRIVATE', 'done', 'low', 'a', now(), 0),
      ('unpaid', 'PRIVATE', 'PRIVATE', 'todo', 'low', 'a', now(), 100),
      ('part', 'PRIVATE', 'PRIVATE', 'done', 'low', 'a', now(), 100),
      ('paid', 'PRIVATE', 'PRIVATE', 'todo', 'low', 'a', now(), 100),
      ('large1', 'PRIVATE', 'PRIVATE', 'todo', 'low', 'a', now(), 2000000000),
      ('large2', 'PRIVATE', 'PRIVATE', 'todo', 'low', 'a', now(), 2000000000)`;
    await tx.$executeRaw`
      INSERT INTO "Payment" (id, "taskId", amount, "receivedAt") VALUES
      (1, 'part', 20, '2026-11-10'), (2, 'part', 30, '2026-11-10'), (3, 'paid', 100, '2026-11-10')`;
    const row = await report(tx);
    assert.equal(row.task_records, 7n);
    assert.equal(row.fee_unset_tasks, 1n);
    assert.equal(row.known_fee_tasks, 6n);
    assert.equal(row.zero_fee_tasks, 1n);
    assert.equal(row.positive_fee_tasks, 5n);
    assert.equal(row.billing_unpaid_tasks, 3n);
    assert.equal(row.billing_part_paid_tasks, 1n);
    assert.equal(row.billing_paid_tasks, 2n);
    assert.equal(row.billing_pending_tasks, 5n);
    assert.equal(row.outstanding_fee_tasks, 4n);
    assert.equal(Number(row.known_fees_inr), 4000000300);
    assert.equal(Number(row.retained_receipts_inr), 150);
    assert.equal(Number(row.known_outstanding_inr), 4000000150);
    assert.equal(row.outstanding_tasks_without_reminder, 4n);
    assert.equal(row.surviving_payment_records, 3n);
    assert.ok(Math.abs(Number(row.fee_coverage_fraction) - 6 / 7) < 1e-12);
    assert.equal(row.negative_fee_tasks, 0n);
    assert.equal(row.fees_below_received_tasks, 0n);
    assert.equal(row.payments_on_unset_fee_tasks, 0n);
  });
});

test('nullable reminders stay separate from stale stamps and use the known-outstanding cohort', async () => {
  await fixture(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "Task" (id, title, client, status, priority, "assigneeId", "updatedAt", fee, "lastReminder") VALUES
      ('never', 'PRIVATE', 'PRIVATE', 'todo', 'low', 'a', now(), 100, NULL),
      ('old', 'PRIVATE', 'PRIVATE', 'todo', 'low', 'a', now(), 100, '2026-11-04 18:29:59.999'),
      ('fresh', 'PRIVATE', 'PRIVATE', 'todo', 'low', 'a', now(), 100, '2026-11-04 18:30'),
      ('future', 'PRIVATE', 'PRIVATE', 'todo', 'low', 'a', now(), 100, '2026-11-10 18:45:00.001'),
      ('latest', 'PRIVATE', 'PRIVATE', 'todo', 'low', 'a', now(), 100, '2026-11-10 12:00'),
      ('unknown', 'PRIVATE', 'PRIVATE', 'todo', 'low', 'a', now(), NULL, '2026-11-01'),
      ('free', 'PRIVATE', 'PRIVATE', 'todo', 'low', 'a', now(), 0, '2026-11-01')`;
    const first = await report(tx);
    assert.equal(first.outstanding_fee_tasks, 5n);
    assert.equal(first.outstanding_tasks_without_reminder, 1n);
    assert.equal(first.outstanding_tasks_reminder_age_7d, 1n);
    assert.equal(first.future_last_reminder_tasks, 1n);
    assert.equal(first.outstanding_tasks_latest_reminder_previous_day, 1n);
    assert.equal(Number(first.latest_reminder_previous_day_fraction), 0.2);
    await tx.$executeRaw`UPDATE "Task" SET "lastReminder" = '2026-11-10 18:35' WHERE id = 'latest'`;
    assert.equal((await report(tx)).outstanding_tasks_latest_reminder_previous_day, 0n);
    await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'America/Los_Angeles'");
    const otherTimezone = await report(tx);
    assert.equal(otherTimezone.outstanding_tasks_reminder_age_7d, 1n);
    assert.equal(otherTimezone.reporting_day.toISOString(), '2026-11-10T00:00:00.000Z');
  });
});

test('direct-write financial defects raise flags while outstanding follows the app clamp', async () => {
  await fixture(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "Task" (id, title, client, status, priority, "assigneeId", "updatedAt", fee) VALUES
      ('negative', 'PRIVATE', 'PRIVATE', 'todo', 'low', 'a', now(), -50),
      ('unset', 'PRIVATE', 'PRIVATE', 'todo', 'low', 'a', now(), NULL),
      ('overpaid', 'PRIVATE', 'PRIVATE', 'todo', 'low', 'a', now(), 100)`;
    await tx.$executeRaw`
      INSERT INTO "Payment" (id, "taskId", amount, "receivedAt") VALUES
      (1, 'unset', 10, '2026-11-10'), (2, 'overpaid', 120, '2026-11-10')`;
    const row = await report(tx);
    assert.equal(row.negative_fee_tasks, 1n);
    assert.equal(row.payments_on_unset_fee_tasks, 1n);
    assert.equal(row.fees_below_received_tasks, 2n);
    assert.equal(Number(row.known_fees_inr), 50);
    assert.equal(Number(row.retained_receipts_inr), 130);
    assert.equal(Number(row.known_outstanding_inr), 0);
  });
});

test('timestamp flows expose legacy gaps and change when a task reopens or completes again', async () => {
  await fixture(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "Task" (id, title, client, status, priority, "assigneeId", "updatedAt", "createdAt", "completedAt", "expectedCompletion") VALUES
      ('legacy-done', 'PRIVATE', 'PRIVATE', 'done', 'low', 'a', now(), NULL, NULL, '2026-11-10'),
      ('legacy-open', 'PRIVATE', 'PRIVATE', 'todo', 'low', 'a', now(), NULL, NULL, NULL),
      ('on-time', 'PRIVATE', 'PRIVATE', 'done', 'low', 'a', now(), '2026-11-09 18:30', '2026-11-10 18:00', '2026-11-10'),
      ('today', 'PRIVATE', 'PRIVATE', 'done', 'low', 'a', now(), '2026-11-08 18:30', '2026-11-10 18:30', '2026-11-11'),
      ('late', 'PRIVATE', 'PRIVATE', 'done', 'low', 'a', now(), '2026-11-02 18:30', '2026-11-09 18:30', '2026-11-09'),
      ('end', 'PRIVATE', 'PRIVATE', 'done', 'low', 'a', now(), '2026-11-09 18:30', '2026-11-10 18:29:59.999', '2026-11-10'),
      ('legacy-reclosed', 'PRIVATE', 'PRIVATE', 'done', 'low', 'a', now(), NULL, '2026-11-09 18:30', NULL)`;
    const row = await report(tx);
    assert.equal(row.tasks_missing_created_at, 3n);
    assert.equal(row.done_tasks_missing_completed_at, 1n);
    const [day, prior, week] = row.flow_windows;
    assert.equal(day.task_created_records, 2);
    assert.equal(prior.task_created_records, 1);
    assert.equal(week.task_created_records, 1);
    assert.equal(day.currently_done_completion_records, 4);
    assert.equal(day.dated_currently_done_completion_records, 3);
    assert.equal(day.on_time_currently_done_completion_records, 2);
    assert.ok(Math.abs(day.on_time_dated_completion_fraction - 2 / 3) < 1e-12);
    await tx.$executeRaw`UPDATE "Task" SET status = 'todo', "completedAt" = NULL WHERE id = 'on-time'`;
    assert.equal((await report(tx)).flow_windows[0].currently_done_completion_records, 3);
    await tx.$executeRaw`UPDATE "Task" SET status = 'done', "completedAt" = '2026-11-10 18:35' WHERE id = 'on-time'`;
    assert.equal((await report(tx)).flow_windows[0].currently_done_completion_records, 3);
    // Model an earlier completion, then reopening and recompletion the next day.
    await tx.$executeRaw`UPDATE "Task" SET "completedAt" = '2026-11-08 19:00' WHERE id = 'late'`;
    const earlierEpisode = await report(tx);
    assert.equal(earlierEpisode.flow_windows[1].currently_done_completion_records, 1);
    assert.equal(earlierEpisode.flow_windows[0].currently_done_completion_records, 2);
    await tx.$executeRaw`UPDATE "Task" SET status = 'todo', "completedAt" = NULL WHERE id = 'late'`;
    assert.equal((await report(tx)).flow_windows[1].currently_done_completion_records, 0);
    await tx.$executeRaw`UPDATE "Task" SET status = 'done', "completedAt" = '2026-11-09 19:00' WHERE id = 'late'`;
    const laterEpisode = await report(tx);
    assert.equal(laterEpisode.flow_windows[1].currently_done_completion_records, 0);
    assert.equal(laterEpisode.flow_windows[0].currently_done_completion_records, 3);
    await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'America/Los_Angeles'");
    assert.equal((await report(tx)).flow_windows[0].currently_done_completion_records, 3);
    assert.ok(!JSON.stringify(row.flow_windows).includes('PRIVATE'));
  });
});

test('legacy unknown dates stay unknown instead of adopting migration or observation dates', async () => {
  await fixture(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "Task" (id, title, client, status, priority, "assigneeId", "updatedAt")
      VALUES ('legacy', 'PRIVATE', 'PRIVATE', 'done', 'low', 'a', '2026-11-10 12:00')`;
    const row = await report(tx);
    assert.equal(row.tasks_missing_created_at, 1n);
    assert.equal(row.done_tasks_missing_completed_at, 1n);
    for (const flow of row.flow_windows) {
      assert.equal(flow.task_created_records, 0);
      assert.equal(flow.currently_done_completion_records, 0);
      assert.equal(flow.on_time_dated_completion_fraction, null);
    }
    // The source migration adds nullable columns without defaults or backfill.
    const migration = await readFile(new URL('../prisma/migrations/20261111062932_add_task_timestamps/migration.sql', import.meta.url), 'utf8');
    assert.doesNotMatch(migration, /DEFAULT|NOT NULL|UPDATE /i);
  });
});

test('ticket receipts use office days and restate after explicit payment removal and ticket deletion', async () => {
  await fixture(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "Task" (id, title, client, status, priority, "assigneeId", "updatedAt", fee) VALUES
      ('a', 'PRIVATE', 'PRIVATE', 'todo', 'low', 'e', now(), 2000000000),
      ('b', 'PRIVATE', 'PRIVATE', 'todo', 'low', 'e', now(), 2000000000),
      ('c', 'PRIVATE', 'PRIVATE', 'todo', 'low', 'e', now(), 50),
      ('d', 'PRIVATE', 'PRIVATE', 'todo', 'low', 'e', now(), 25),
      ('e', 'PRIVATE', 'PRIVATE', 'todo', 'low', 'e', now(), 10)`;
    await tx.$executeRaw`
      INSERT INTO "Payment" (id, "taskId", amount, "receivedAt", note) VALUES
      (1, 'a', 2000000000, '2026-11-09 18:30', 'PRIVATE'),
      (2, 'b', 2000000000, '2026-11-10 18:29:59.999', 'PRIVATE'),
      (3, 'c', 50, '2026-11-10 18:30', 'PRIVATE'),
      (4, 'd', 25, '2026-11-09 18:29:59.999', 'PRIVATE'),
      (5, 'e', 10, '2026-11-02 18:30', 'PRIVATE')`;
    await tx.$executeRaw`
      INSERT INTO "Enquiry" (id, name, phone, message, status, "createdAt") VALUES
      (1, 'PRIVATE', 'PRIVATE', 'PRIVATE', 'new', '2026-11-09 18:30'),
      (2, 'PRIVATE', 'PRIVATE', 'PRIVATE', 'closed', '2026-11-10 18:29:59.999'),
      (3, 'PRIVATE', 'PRIVATE', 'PRIVATE', 'contacted', '2026-11-10 18:30'),
      (4, 'PRIVATE', 'PRIVATE', 'PRIVATE', 'new', '2026-11-09 18:29:59.999'),
      (5, 'PRIVATE', 'PRIVATE', 'PRIVATE', 'closed', '2026-11-02 18:30')`;
    const row = await report(tx);
    const [day, prior, week] = row.flow_windows;
    assert.equal(day.payment_records, 2);
    assert.equal(day.recorded_receipts_inr, 4000000000);
    assert.equal(prior.recorded_receipts_inr, 25);
    assert.equal(week.recorded_receipts_inr, 10);
    assert.equal(row.surviving_payment_records, 5n);
    assert.equal(row.open_enquiry_records, 3n);
    assert.equal(day.enquiry_created_records, 2);
    assert.equal(prior.enquiry_created_records, 1);
    assert.equal(week.enquiry_created_records, 1);
    assert.equal(day.reporting_day, '2026-11-10');
    assert.equal(prior.reporting_day, '2026-11-09');
    assert.equal(week.reporting_day, '2026-11-03');
    assert.equal(day.start_utc, '2026-11-09T18:30:00');
    assert.equal(day.end_utc, '2026-11-10T18:30:00');
    await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'America/Los_Angeles'");
    assert.deepEqual((await report(tx)).flow_windows, row.flow_windows);
    await tx.$executeRaw`DELETE FROM "Payment" WHERE id = 1`;
    const afterRemoval = await report(tx);
    assert.equal(afterRemoval.flow_windows[0].payment_records, 1);
    assert.equal(afterRemoval.flow_windows[0].recorded_receipts_inr, 2000000000);
    assert.equal(Number(afterRemoval.known_outstanding_inr), 2000000000);
    await tx.$executeRaw`DELETE FROM "Task" WHERE id = 'b'`;
    await tx.$executeRaw`DELETE FROM "Enquiry" WHERE id = 1`;
    const afterDelete = await report(tx);
    assert.equal(afterDelete.flow_windows[0].payment_records, 0);
    assert.equal(afterDelete.flow_windows[0].recorded_receipts_inr, 0);
    assert.equal(afterDelete.flow_windows[0].enquiry_created_records, 1);
    assert.equal(afterDelete.task_records, 4n);
    assert.equal(afterDelete.surviving_payment_records, 3n);
    assert.ok(!JSON.stringify(row, (_, v) => typeof v === 'bigint' ? String(v) : v).includes('PRIVATE'));
  });
});

test('timestamp and payment quality flags expose direct-write defects without imputing legacy times', async () => {
  await fixture(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "Task" (id, title, client, status, priority, "assigneeId", "updatedAt", "createdAt", "completedAt") VALUES
      ('bad', 'PRIVATE', 'PRIVATE', 'todo', 'low', 'a', now(), '2026-11-10 18:45:00.001', '2026-11-09 18:30')`;
    await tx.$executeRaw`
      INSERT INTO "Payment" (id, "taskId", amount, "receivedAt") VALUES
      (1, 'bad', -10, '2026-11-09 18:30'), (2, 'bad', 0, '2026-11-10 18:45:00.001')`;
    await tx.$executeRaw`
      INSERT INTO "Enquiry" (id, name, phone, status, "createdAt")
      VALUES (1, 'PRIVATE', 'PRIVATE', 'invalid', '2026-11-10 18:45:00.001')`;
    const row = await report(tx);
    assert.equal(row.non_done_tasks_with_completed_at, 1n);
    assert.equal(row.task_completion_before_creation_records, 1n);
    assert.equal(row.future_task_timestamp_records, 1n);
    assert.equal(row.nonpositive_payment_records, 2n);
    assert.equal(row.future_payment_records, 1n);
    assert.equal(row.invalid_enquiry_status_records, 1n);
    assert.equal(row.future_enquiry_records, 1n);
    assert.equal(row.flow_windows[0].currently_done_completion_records, 0);
    assert.equal(row.flow_windows[0].recorded_receipts_inr, -10);
  });
});

test('ticket migration deletes prior client payments without mapping fees or history', async () => {
  await prisma.$transaction(async (tx) => {
    // Reconstruct the relevant pre-ticket schema only in session-local tables.
    await tx.$executeRawUnsafe('CREATE TEMP TABLE "Task" (LIKE public."Task" INCLUDING DEFAULTS) ON COMMIT DROP');
    await tx.$executeRawUnsafe('ALTER TABLE pg_temp."Task" DROP COLUMN fee, DROP COLUMN "lastReminder", ADD PRIMARY KEY (id)');
    await tx.$executeRawUnsafe('CREATE TEMP TABLE "Client" (id TEXT PRIMARY KEY) ON COMMIT DROP');
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE "Payment" (
      id INTEGER PRIMARY KEY, "clientId" TEXT NOT NULL, amount INTEGER NOT NULL,
      "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, note TEXT,
      CONSTRAINT "Payment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES pg_temp."Client"(id) ON DELETE CASCADE
    ) ON COMMIT DROP`);
    await tx.$executeRawUnsafe('CREATE INDEX "Payment_clientId_idx" ON pg_temp."Payment"("clientId")');
    await tx.$executeRaw`
      INSERT INTO "Task" (id, title, client, status, priority, "assigneeId", "updatedAt")
      VALUES ('legacy', 'PRIVATE', 'PRIVATE', 'todo', 'low', 'e', now())`;
    await tx.$executeRaw`INSERT INTO "Client" (id) VALUES ('old-client')`;
    await tx.$executeRaw`INSERT INTO "Payment" (id, "clientId", amount) VALUES (1, 'old-client', 75)`;
    const migration = await readFile(new URL('../prisma/migrations/20261111133000_receivables_by_ticket/migration.sql', import.meta.url), 'utf8');
    // This migration contains simple SQL statements, no function bodies.
    const statements = migration.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n').split(';').map((s) => s.trim()).filter(Boolean);
    for (const statement of statements) await tx.$executeRawUnsafe(statement);
    const [oldClient] = await tx.$queryRawUnsafe(`SELECT to_regclass('pg_temp."Client"')::text AS relation`);
    assert.equal(oldClient.relation, null);
    const [task] = await tx.$queryRawUnsafe('SELECT fee, "lastReminder" FROM "Task"');
    assert.equal(task.fee, null);
    assert.equal(task.lastReminder, null);
    const [payments] = await tx.$queryRawUnsafe('SELECT count(*) AS records FROM "Payment"');
    assert.equal(payments.records, 0n);
    await tx.$executeRaw`UPDATE "Task" SET fee = 100 WHERE id = 'legacy'`;
    await tx.$executeRaw`INSERT INTO "Payment" (id, "taskId", amount) VALUES (2, 'legacy', 25)`;
    await tx.$executeRaw`DELETE FROM "Task" WHERE id = 'legacy'`;
    const [afterDelete] = await tx.$queryRawUnsafe('SELECT count(*) AS records FROM "Payment"');
    assert.equal(afterDelete.records, 0n);
  });
});

test('production SELECT executes in a read-only transaction with bounded wrapper settings', async () => {
  assert.match(wrapper, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
  assert.match(wrapper, /SET LOCAL statement_timeout = '5s';/);
  assert.match(wrapper, /SET LOCAL lock_timeout = '1s';/);
  assert.match(wrapper, /SET LOCAL search_path = pg_catalog, public, pg_temp;/);
  assert.match(wrapper, /\\ir operational-metrics.sql/);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5s'");
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '1s'");
    await tx.$executeRawUnsafe('SET LOCAL search_path = pg_catalog, public, pg_temp');
    const [settings] = await tx.$queryRawUnsafe('SHOW transaction_read_only');
    assert.equal(settings.transaction_read_only, 'on');
    await report(tx, sql);
  }, { isolationLevel: 'RepeatableRead' });
  await assert.rejects(prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await tx.$executeRawUnsafe('UPDATE public."Task" SET fee = fee WHERE false');
  }), /read-only transaction/);
});
