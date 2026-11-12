import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateDecibelAuthenticatedBtcResyncCheckpointV1 } from '../src/decibel_authenticated_btc_activity_resync_v1.js';
import { decibel_execution_lifecycle_journal_v1 } from '../src/decibel_execution_lifecycle_journal_v1.js';
describe('Authenticated history existing journal boundary', () => {
  it('rejects an absent baseline and an unsealed zero-position assertion', () => {
    expect(() => validateDecibelAuthenticatedBtcResyncCheckpointV1(null)).toThrow(
      'CHECKPOINT_INVALID',
    );
    expect(() =>
      validateDecibelAuthenticatedBtcResyncCheckpointV1({ currentPositionBase: 0 }),
    ).toThrow('CHECKPOINT_INVALID');
  });
  it('rolls back conflicting batches, survives restart and deduplicates exact fragments', () => {
    const dir = mkdtempSync(join(tmpdir(), 'decibel-history-'));
    const path = join(dir, 'journal.sqlite');
    const Journal = new decibel_execution_lifecycle_journal_v1(path);
    const fill = {
      fillId: 'execution-fragment-1',
      intentId: null,
      side: 'BUY' as const,
      quantity: 0.00014,
      price: 79000,
      strategyLineage: false,
      makerProven: false,
      externalCounterparty: false,
      observedAt: 1,
    };
    try {
      expect(() => Journal.applyAuthenticatedFillBatch([fill, { ...fill, price: 79001 }])).toThrow(
        'IDENTITY_CONFLICT',
      );
      expect(Journal.ledger().inventory).toBe(0);
      expect(
        Journal.applyAuthenticatedFillBatch([
          fill,
          { ...fill, fillId: 'execution-fragment-2', side: 'SELL' },
        ]),
      ).toEqual({ inserted: 2, duplicates: 0, inventory: 0 });
    } finally {
      Journal.close();
    }
    const Restarted = new decibel_execution_lifecycle_journal_v1(path);
    try {
      expect(Restarted.applyAuthenticatedFillBatch([fill])).toEqual({
        inserted: 0,
        duplicates: 1,
        inventory: 0,
      });
    } finally {
      Restarted.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
