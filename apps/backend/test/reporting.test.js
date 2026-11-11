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
    for (const table of ['Employee', 'Task', 'Client']) {
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
  'future_last_call_records', 'paid_positive_balance_records', 'invalid_client_status_records',
  'overdue_dated_open_fraction', 'roster_with_open_tasks_fraction', 'overdue_balance_fraction',
  'latest_stamp_previous_day_fraction',
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

test('production SELECT executes in a read-only transaction with bounded wrapper settings', async () => {
  assert.match(wrapper, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
  assert.match(wrapper, /SET LOCAL statement_timeout = '5s';/);
  assert.match(wrapper, /SET LOCAL lock_timeout = '1s';/);
  assert.match(wrapper, /SET LOCAL search_path = public, pg_catalog;/);
  assert.match(wrapper, /\\ir operational-metrics.sql/);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5s'");
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '1s'");
    await tx.$executeRawUnsafe('SET LOCAL search_path = public, pg_catalog');
    const [settings] = await tx.$queryRawUnsafe('SHOW transaction_read_only');
    assert.equal(settings.transaction_read_only, 'on');
    await report(tx, sql);
  }, { isolationLevel: 'RepeatableRead' });
  await assert.rejects(prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await tx.$executeRawUnsafe('UPDATE public."Client" SET due = due WHERE false');
  }), /read-only transaction/);
});
