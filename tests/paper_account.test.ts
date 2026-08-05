import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { buildPaperAccountVerificationReport } from '../src/verify_paper_account.js';
import { paper_account_repository } from '../src/paper_account.js';

const Directories: string[] = [];
afterEach(() => {
  for (const directory of Directories.splice(0))
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
});

describe('paper account', () => {
  it('verifies exact fills, long/short PnL, restart, minimum volume, and no live execution', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'paper-report-'));
    Directories.push(directory);
    const report = buildPaperAccountVerificationReport(directory);
    expect(report.scenarioResults.every((scenario) => scenario.result === 'PASS')).toBe(true);
    expect(report.dailyMinimum).toMatchObject({
      minimumStatus: 'MINIMUM_MET',
      dailyMinimumFilledVolume: 10_000,
    });
    expect(report.dailyMinimum.dailyFilledVolume).toBeGreaterThan(10_000);
    expect(report.finalState).toMatchObject({
      status: 'ACTIVE',
      allocatedPositionMargin: 0,
      positionState: 'CLOSED',
    });
    expect(report.canTradeLive).toBe(false);
    expect(JSON.stringify(report)).not.toContain('00000000000004');
  });

  it('implements cancel and expiry transitions and rejects fills after effective cancellation', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'paper-order-'));
    Directories.push(directory);
    const report = buildPaperAccountVerificationReport(directory);
    expect(report.scenarioResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scenario: 'cancel, expiry, and cancel race',
          result: 'PASS',
          cancelledFillReason: 'FILL_NOT_ALLOWED',
        }),
      ]),
    );
  });

  it('detects a corrupted projection on restart instead of repairing it', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'paper-corrupt-'));
    Directories.push(directory);
    buildPaperAccountVerificationReport(directory);
    const databasePath = path.join(directory, 'paper.sqlite');
    const Corruptor = new Database(databasePath);
    Corruptor.prepare(
      "UPDATE paper_account_projection SET state_hash='sha256:corrupted' WHERE singleton=1",
    ).run();
    Corruptor.close();
    expect(() => new paper_account_repository(databasePath)).toThrow('PAPER_PROJECTION_MISMATCH');
  });

  it('migrates idempotently and initializes exact USD 30 collateral', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'paper-migration-'));
    Directories.push(directory);
    const databasePath = path.join(directory, 'paper.sqlite');
    let Repository = new paper_account_repository(databasePath, 30);
    expect(Repository.getState()).toMatchObject({
      startingEquityUnits: '3000000000',
      availableCollateralUnits: '3000000000',
      eventCount: 1,
    });
    Repository.close();
    Repository = new paper_account_repository(databasePath, 30);
    expect(Repository.getSchemaVersion()).toBe(2);
    expect(Repository.getState().eventCount).toBe(1);
    Repository.close();
  });
});
