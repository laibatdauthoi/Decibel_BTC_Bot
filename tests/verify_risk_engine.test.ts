import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildRiskVerificationReport } from '../src/verify_risk_engine.js';

const Directories: string[] = [];
afterEach(() => {
  for (const directory of Directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('risk verification report', () => {
  it('reports approved invariants, exact rejection reasons, target invariance, and fills', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'risk-report-test-'));
    Directories.push(directory);
    const report = buildRiskVerificationReport(path.join(directory, 'temporary-risk.sqlite'));
    const approvals = report.scenarioResults.filter((result) => result.decision === 'APPROVED');
    expect(approvals).toHaveLength(2);
    for (const approval of approvals) {
      if (!('positionNotional' in approval)) throw new Error('Missing approved scenario metrics');
      expect(approval.approvedLeverage).toBe(40);
      expect(approval.positionNotional).toBeCloseTo(approval.allocatedMargin * 40, 8);
      expect(approval.totalLossAtStopIncludingFees).toBeLessThanOrEqual(approval.permittedRisk);
    }
    const rejection = report.scenarioResults.find(
      (result) => result.scenario === 'notional above USD 1200',
    );
    expect(rejection).toMatchObject({
      decision: 'REJECTED',
      reasonCodes: ['EXPOSURE_LIMIT_EXCEEDED'],
    });
    expect(report.volumeTargetInvariance.targetDisabledOrZero).toEqual(
      report.volumeTargetInvariance.targetUSD10000,
    );
    expect(report.fillAccounting.duplicateEntryFill.volumeAdded).toBe(0);
    expect(report.fillAccounting.dailyFilledVolume).toBe(150.05);
    expect(report).toMatchObject({
      finalRiskState: 'HALTED',
      canTrade: false,
      intentionalFinalVerificationScenario: true,
    });
  });

  it('is deterministic and idempotent with a fresh temporary database', () => {
    const first = mkdtempSync(path.join(tmpdir(), 'risk-report-first-'));
    const second = mkdtempSync(path.join(tmpdir(), 'risk-report-second-'));
    Directories.push(first, second);
    expect(buildRiskVerificationReport(path.join(first, 'risk.sqlite'))).toEqual(
      buildRiskVerificationReport(path.join(second, 'risk.sqlite')),
    );
  });
});
