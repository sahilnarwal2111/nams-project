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
    for (const table of ['Employee', 'Task', 'Client', 'Payment', 'Enquiry']) {
      await tx.$executeRawUnsafe(`CREATE TEMP TABLE "${table}" (LIKE public."${table}" INCLUDING DEFAULTS) ON COMMIT DROP`);
    }
    return run(tx);
  });
}

async function report(tx, query = frozenSql) {
  const rows = await tx.$queryRawUnsafe(query);
  assert.equal(rows.length, 1);
  return rows[0];
}

const expectedKeys = [
  'definition_version', 'observed_at', 'reporting_timezone', 'reporting_day',
  'day_start_utc', 'day_end_utc', 'stale_stamp_days', 'task_records', 'open_tasks',
  'inprogress_tasks', 'high_priority_open_tasks', 'dated_open_tasks', 'overdue_open_tasks',
  'undated_open_tasks', 'invalid_task_status_records', 'employee_records',
  'employees_with_open_tasks', 'client_records', 'balance_client_records',
  'recorded_balance_inr', 'overdue_balance_client_records', 'overdue_recorded_balance_inr',
  'balance_clients_latest_stamp_previous_day', 'balance_clients_stamp_age_7d',
  'future_last_call_records', 'paid_positive_balance_records', 'negative_balance_records', 'invalid_client_status_records',
  'overdue_dated_open_fraction', 'roster_with_open_tasks_fraction', 'overdue_balance_fraction',
  'latest_stamp_previous_day_fraction',
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
    for (const key of ['open_tasks', 'task_records', 'client_records', 'employee_records', 'overdue_open_tasks']) {
      assert.equal(row[key], 0n);
    }
    assert.equal(Number(row.recorded_balance_inr), 0);
    assert.equal(Number(row.overdue_recorded_balance_inr), 0);
    assert.equal(row.definition_version, 2);
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

test('balances use positive-balance cohorts, safe sums, and manual overdue status', async () => {
  await fixture(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "Client" (id, name, contact, phone, due, "invoiceDate", "lastCall", status) VALUES
      ('1', 'PRIVATE', 'PRIVATE', 'PRIVATE', 2000000000, '2020-01-01', '2026-11-09 18:29:59.999', 'due-soon'),
      ('2', 'PRIVATE', 'PRIVATE', 'PRIVATE', 2000000000, '2026-11-11', '2026-11-09 18:30:00', 'overdue'),
      ('3', 'PRIVATE', 'PRIVATE', 'PRIVATE', 100, '2020-01-01', '2026-11-10 18:29:59.999', 'paid'),
      ('4', 'PRIVATE', 'PRIVATE', 'PRIVATE', 0, '2020-01-01', '2026-11-10 12:00:00', 'overdue'),
      ('5', 'PRIVATE', 'PRIVATE', 'PRIVATE', 50, '2020-01-01', '2026-11-10 18:30:00', 'unexpected')`;
    const row = await report(tx);
    assert.equal(row.client_records, 5n);
    assert.equal(row.balance_client_records, 4n);
    assert.equal(Number(row.recorded_balance_inr), 4000000150);
    assert.equal(row.overdue_balance_client_records, 1n);
    assert.equal(Number(row.overdue_recorded_balance_inr), 2000000000);
    assert.ok(Math.abs(Number(row.overdue_balance_fraction) - 2000000000 / 4000000150) < 1e-12);
    assert.equal(row.paid_positive_balance_records, 1n);
    assert.equal(row.invalid_client_status_records, 1n);
    assert.equal(row.balance_clients_latest_stamp_previous_day, 2n);
    assert.equal(Number(row.latest_stamp_previous_day_fraction), 0.5);
    assert.equal(row.reporting_day.toISOString(), '2026-11-10T00:00:00.000Z');
    assert.equal(row.day_start_utc.toISOString(), '2026-11-09T18:30:00.000Z');
    assert.equal(row.day_end_utc.toISOString(), '2026-11-10T18:30:00.000Z');
  });
});

test('stamp age is local calendar days; future stamps and overwritten history are not reminders', async () => {
  await fixture(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "Client" (id, name, contact, phone, due, "invoiceDate", "lastCall", status) VALUES
      ('1', 'PRIVATE', 'PRIVATE', 'PRIVATE', 100, '2026-01-01', '2026-11-04 18:29:59.999', 'due-soon'),
      ('2', 'PRIVATE', 'PRIVATE', 'PRIVATE', 100, '2026-01-01', '2026-11-04 18:30:00', 'due-soon'),
      ('3', 'PRIVATE', 'PRIVATE', 'PRIVATE', 0, '2026-01-01', '2026-11-01', 'paid'),
      ('4', 'PRIVATE', 'PRIVATE', 'PRIVATE', 100, '2026-01-01', '2026-11-10 18:45:00.001', 'overdue'),
      ('5', 'PRIVATE', 'PRIVATE', 'PRIVATE', 100, '2026-01-01', '2026-11-10 12:00:00', 'overdue')`;
    const first = await report(tx);
    assert.equal(first.balance_clients_stamp_age_7d, 1n);
    assert.equal(first.future_last_call_records, 1n);
    assert.equal(first.balance_clients_latest_stamp_previous_day, 1n);
    await tx.$executeRaw`UPDATE "Client" SET "lastCall" = '2026-11-10 18:35:00' WHERE id = '5'`;
    assert.equal((await report(tx)).balance_clients_latest_stamp_previous_day, 0n);
    // Different database session timezones must not change office calendar rules.
    await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'America/Los_Angeles'");
    const otherTimezone = await report(tx);
    assert.equal(otherTimezone.balance_clients_stamp_age_7d, 1n);
    assert.equal(otherTimezone.reporting_day.toISOString(), '2026-11-10T00:00:00.000Z');
  });
});

test('negative balances from direct writes raise a publication quality flag', async () => {
  await fixture(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "Client" (id, name, contact, phone, due, "invoiceDate", "lastCall", status) VALUES
      ('1', 'PRIVATE', 'PRIVATE', 'PRIVATE', -50, '2026-01-01', '2026-11-10', 'paid'),
      ('2', 'PRIVATE', 'PRIVATE', 'PRIVATE', 100, '2026-01-01', '2026-11-10', 'overdue')`;
    const row = await report(tx);
    assert.equal(row.negative_balance_records, 1n);
    assert.equal(row.balance_client_records, 1n);
    assert.equal(Number(row.recorded_balance_inr), 50);
    // The uncorrected source total stays visible; the quality flag blocks publication.
    assert.equal(Number(row.overdue_balance_fraction), 2);
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

test('receipts and enquiries use half-open office days, retain no details, and lose deleted history', async () => {
  await fixture(async (tx) => {
    // LIKE omits foreign keys. Mirror the real Payment cascade for this deletion test.
    await tx.$executeRawUnsafe('ALTER TABLE pg_temp."Client" ADD PRIMARY KEY (id)');
    await tx.$executeRawUnsafe('ALTER TABLE pg_temp."Payment" ADD FOREIGN KEY ("clientId") REFERENCES pg_temp."Client"(id) ON DELETE CASCADE');
    await tx.$executeRaw`
      INSERT INTO "Client" (id, name, contact, phone, due, "invoiceDate", "lastCall", status)
      VALUES ('c', 'PRIVATE', 'PRIVATE', 'PRIVATE', 0, '2026-01-01', '2026-11-01', 'paid')`;
    await tx.$executeRaw`
      INSERT INTO "Payment" (id, "clientId", amount, "receivedAt", note) VALUES
      (1, 'c', 2000000000, '2026-11-09 18:30', 'PRIVATE'),
      (2, 'c', 2000000000, '2026-11-10 18:29:59.999', 'PRIVATE'),
      (3, 'c', 50, '2026-11-10 18:30', 'PRIVATE'),
      (4, 'c', 25, '2026-11-09 18:29:59.999', 'PRIVATE'),
      (5, 'c', 10, '2026-11-02 18:30', 'PRIVATE')`;
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
    await tx.$executeRaw`DELETE FROM "Client" WHERE id = 'c'`;
    await tx.$executeRaw`DELETE FROM "Enquiry" WHERE id = 1`;
    const afterDelete = await report(tx);
    assert.equal(afterDelete.flow_windows[0].payment_records, 0);
    assert.equal(afterDelete.flow_windows[0].recorded_receipts_inr, 0);
    assert.equal(afterDelete.flow_windows[0].enquiry_created_records, 1);
    assert.ok(!JSON.stringify(row, (_, v) => typeof v === 'bigint' ? String(v) : v).includes('PRIVATE'));
  });
});

test('timestamp and payment quality flags expose direct-write defects without imputing legacy times', async () => {
  await fixture(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "Task" (id, title, client, status, priority, "assigneeId", "updatedAt", "createdAt", "completedAt") VALUES
      ('bad', 'PRIVATE', 'PRIVATE', 'todo', 'low', 'a', now(), '2026-11-10 18:45:00.001', '2026-11-09 18:30')`;
    await tx.$executeRaw`
      INSERT INTO "Payment" (id, "clientId", amount, "receivedAt") VALUES
      (1, 'c', -10, '2026-11-09 18:30'), (2, 'c', 0, '2026-11-10 18:45:00.001')`;
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

test('production SELECT executes in a read-only transaction with bounded wrapper settings', async () => {
  assert.match(wrapper, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
  assert.match(wrapper, /SET LOCAL statement_timeout = '5s';/);
  assert.match(wrapper, /SET LOCAL lock_timeout = '1s';/);
  assert.match(wrapper, /SET LOCAL search_path = pg_catalog, public;/);
  assert.match(wrapper, /\\ir operational-metrics.sql/);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5s'");
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '1s'");
    await tx.$executeRawUnsafe('SET LOCAL search_path = pg_catalog, public');
    const [settings] = await tx.$queryRawUnsafe('SHOW transaction_read_only');
    assert.equal(settings.transaction_read_only, 'on');
    await report(tx, sql);
  }, { isolationLevel: 'RepeatableRead' });
  await assert.rejects(prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await tx.$executeRawUnsafe('UPDATE public."Client" SET due = due WHERE false');
  }), /read-only transaction/);
});
