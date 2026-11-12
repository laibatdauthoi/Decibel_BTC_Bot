import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decibel_execution_lifecycle_journal_v1 } from '../src/decibel_execution_lifecycle_journal_v1.js';

type statement_v1 = { all(...values: unknown[]): unknown[]; get(...values: unknown[]): unknown };
type database_v1 = { prepare(sql: string): statement_v1 };

/**
 * Captures the SQL each hot journal method actually runs and checks that SQLite plans it
 * through an index. A full scan of execution_intents cost 35-67 ms per call on the
 * production journal (37k intents), which stalled the event loop every cycle.
 */
describe('execution journal query plans', () => {
  const Journal = new decibel_execution_lifecycle_journal_v1(
    join(mkdtempSync(join(tmpdir(), 'journal-plan-')), 'journal.sqlite'),
  );
  const Database = (Journal as unknown as { Database: database_v1 }).Database;

  const captureSql = (call: () => unknown): string[] => {
    const captured: string[] = [];
    const original = Database.prepare.bind(Database);
    Database.prepare = (sql: string) => {
      captured.push(sql);
      return original(sql);
    };
    try {
      call();
    } finally {
      Database.prepare = original;
    }
    return captured.filter((sql) => /FROM\s+execution_intents/i.test(sql));
  };
  const planOf = (sql: string) =>
    (
      Database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(
        ...Array.from({ length: (sql.match(/\?/g) ?? []).length }, () => 'x'),
      ) as { detail: string }[]
    )
      .map((row) => row.detail)
      .join(' | ');

  it.each([
    ['nonTerminal', () => Journal.nonTerminal()],
    ['findNonTerminalPlaceBySide', () => Journal.findNonTerminalPlaceBySide('BUY')],
    ['findPlaceByExactIdentity', () => Journal.findPlaceByExactIdentity('venue-1', 'client-1')],
    ['getOrderLineageByVenueOrderId', () => Journal.getOrderLineageByVenueOrderId('venue-1')],
    ['findNonTerminalByVenueOrderId', () => Journal.findNonTerminalByVenueOrderId('venue-1')],
    ['hasTPRepriceCancellation', () => Journal.hasTPRepriceCancellation('session-1', 'SELL')],
    ['getTPAdverseProgress', () => Journal.getTPAdverseProgress('session-1:SELL')],
    ['getExecutionReconciliationBlocker', () => Journal.getExecutionReconciliationBlocker()],
  ] as const)('%s reads execution_intents through an index', (_name, call) => {
    const statements = captureSql(call);
    expect(statements.length).toBeGreaterThan(0);
    for (const sql of statements) {
      const plan = planOf(sql);
      expect(plan, sql).toMatch(/USING (COVERING )?INDEX execution_intents_/);
      expect(plan, sql).not.toMatch(/SCAN execution_intents(?! USING)/);
    }
  });
});
