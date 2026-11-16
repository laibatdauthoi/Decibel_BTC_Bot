import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
  DECIBEL_ACTIVE_SESSION_STATUSES_V1,
  DECIBEL_TERMINAL_INTENT_STATUSES_SQL_V1,
  DECIBEL_TERMINAL_INTENT_STATUSES_V1,
  DECIBEL_UNRESOLVED_INTENT_STATUSES_V1,
  isDecibelActiveSessionStatusV1,
  isDecibelTerminalIntentStatusV1,
  isDecibelUnresolvedIntentStatusV1,
} from '../src/decibel_lifecycle_statuses_v1.js';

describe('decibel lifecycle statuses v1', () => {
  it('keeps the terminal list text identical to the original partial index', () => {
    expect(DECIBEL_TERMINAL_INTENT_STATUSES_SQL_V1).toBe(
      "('APPLIED','EXTERNALLY_NEUTRALIZED','CANCELLED_EXTERNALLY','FAILED_TIMEOUT','FAILED_DROPPED','FAILED_DROPPED_LEGACY','REJECTED','SUPERSEDED')",
    );
  });

  it('lets SQLite use the non-terminal partial index for the shared NOT IN text', () => {
    const Journal = new Database(':memory:');
    Journal.exec(`
      CREATE TABLE execution_intents(intent_id TEXT PRIMARY KEY, status TEXT, created_at INTEGER);
      CREATE INDEX execution_intents_nonterminal_created ON execution_intents(created_at,intent_id)
        WHERE status NOT IN ${DECIBEL_TERMINAL_INTENT_STATUSES_SQL_V1};
    `);
    const plan = Journal.prepare(
      `EXPLAIN QUERY PLAN SELECT intent_id FROM execution_intents WHERE status NOT IN ${DECIBEL_TERMINAL_INTENT_STATUSES_SQL_V1} ORDER BY created_at,intent_id`,
    ).all() as Array<{ detail: string }>;
    expect(plan.map((row) => row.detail).join(' ')).toContain(
      'execution_intents_nonterminal_created',
    );
    Journal.close();
  });

  it('keeps terminal, unresolved and acknowledged statuses disjoint', () => {
    for (const status of DECIBEL_UNRESOLVED_INTENT_STATUSES_V1)
      expect(isDecibelTerminalIntentStatusV1(status), status).toBe(false);
    expect(isDecibelUnresolvedIntentStatusV1('ACKNOWLEDGED')).toBe(false);
    expect(isDecibelTerminalIntentStatusV1('ACKNOWLEDGED')).toBe(false);
    expect(DECIBEL_TERMINAL_INTENT_STATUSES_V1).toHaveLength(8);
  });

  it('treats only started, not ended sessions as active', () => {
    expect([...DECIBEL_ACTIVE_SESSION_STATUSES_V1]).toEqual(['STARTING', 'RUNNING', 'STOPPING']);
    expect(isDecibelActiveSessionStatusV1('RUNNING')).toBe(true);
    expect(isDecibelActiveSessionStatusV1('ENDED')).toBe(false);
    expect(isDecibelActiveSessionStatusV1('RECOVERY_BLOCKED')).toBe(false);
  });
});
