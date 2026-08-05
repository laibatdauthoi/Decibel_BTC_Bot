import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildDecibelPreflightReport } from '../src/decibel_preflight_report.js';
import {
  fail_closed_decibel_execution_adapter,
  LIVE_EXECUTION_DISABLED,
  type decibel_execution_adapter,
} from '../src/decibel_execution_adapter.js';

const Directories: string[] = [];
afterEach(() => {
  for (const directory of Directories.splice(0))
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
});

const CompleteEnvironment = {
  DECIBEL_NETWORK: 'mainnet',
  DECIBEL_NODE_API_KEY: 'test-secret-never-report',
  DECIBEL_WALLET_ADDRESS: `0x${'1'.repeat(64)}`,
  MARKET_SYMBOL: 'BTC/USD',
  CANDLE_INTERVAL: '5m',
  LIVE_TRADING_ENABLED: 'false',
  LIVE_TRADING_KILL_SWITCH_ENABLED: 'true',
};
const Market = {
  symbol: 'BTC/USD' as const,
  exchangeSymbol: 'BTC-USD-PERP',
  marketAddress: `0x${'2'.repeat(64)}`,
  sizeDecimals: 8,
  priceDecimals: 2,
  tickSize: 0.1,
  minimumSize: 0.0001,
  lotSize: 0.0001,
  maximumLeverage: 40,
  maximumOpenInterest: 1_000,
  mode: 'Open' as const,
};
const Probe = () =>
  Promise.resolve({
    market: Market,
    price: {
      symbol: 'BTC/USD' as const,
      exchangeSymbol: Market.exchangeSymbol,
      markPrice: 65_000,
      midPrice: 65_001,
      oraclePrice: 65_002,
      observedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  });
const Adapter = new fail_closed_decibel_execution_adapter(Probe);

function soak(verdict = 'PAPER_RUNTIME_HEALTHY_COLLECT_MORE', modern = 100) {
  return {
    liveSafety: { valid: true, liveRiskIntentCount: 0, liveOrderCount: 0 },
    readiness: { verdict },
    evidence: { modernEvaluationCount: modern, minimumModernEvaluations: 100 },
    microstructure: { collectorCompatibleNow: true, currentCandidateReadiness: { valid: true } },
  };
}

async function run(
  environment: Record<string, string | undefined> = CompleteEnvironment,
  report = soak(),
  adapter: decibel_execution_adapter | null = Adapter,
) {
  const root = mkdtempSync(path.join(tmpdir(), 'decibel-preflight-'));
  Directories.push(root);
  return {
    root,
    report: await buildDecibelPreflightReport({
      environment,
      paperDatabasePath: path.join(root, 'paper.sqlite'),
      candleDatabasePath: path.join(root, 'candles.sqlite'),
      microstructureDatabasePath: path.join(root, 'micro.sqlite'),
      probe: Probe,
      ...(adapter === null ? {} : { executionAdapter: adapter }),
      soakReport: report,
    }),
  };
}

describe('Decibel live-readiness preflight', () => {
  it('reports insufficient paper evidence', async () => {
    const { report } = await run(CompleteEnvironment, soak('INSUFFICIENT_EVIDENCE', 17));
    expect(report.finalVerdict).toBe('NOT_READY_INSUFFICIENT_PAPER_EVIDENCE');
    expect(report.paperEvidence).toMatchObject({
      modernEvaluationCount: 17,
      minimumModernEvaluations: 100,
    });
  });

  it('reports an unavailable adapter as missing readiness configuration', async () => {
    const { report } = await run(CompleteEnvironment, soak(), null);
    expect(report.finalVerdict).toBe('NOT_READY_CONFIG_MISSING');
    expect(report.executionAdapter).toMatchObject({
      discovered: false,
      mode: 'UNAVAILABLE',
      capabilityProbe: { status: 'NOT_ATTEMPTED' },
      orderSubmissionDisabledReason: 'ADAPTER_UNAVAILABLE',
    });
  });

  it('reports missing Decibel and public-wallet configuration without secrets', async () => {
    const { report } = await run({ LIVE_TRADING_ENABLED: 'false' }, soak());
    expect(report.finalVerdict).toBe('NOT_READY_CONFIG_MISSING');
    expect(report.configuration.missing).toEqual(
      expect.arrayContaining([
        'DECIBEL_NETWORK_MISSING',
        'DECIBEL_NODE_API_KEY_MISSING',
        'DECIBEL_WALLET_ADDRESS_MISSING',
      ]),
    );
    expect(JSON.stringify(report)).not.toContain('test-secret-never-report');
  });

  it('fails closed when live execution is accidentally enabled', async () => {
    const { report } = await run({ ...CompleteEnvironment, LIVE_TRADING_ENABLED: 'true' });
    expect(report.finalVerdict).toBe('NOT_READY_SAFETY_GATES_FAILED');
    expect(report.safety.failures).toContain('LIVE_EXECUTION_MUST_REMAIN_DISABLED');
  });

  it('fails closed when the kill switch or soak safety gate fails', async () => {
    const unsafeSoak = {
      ...soak('PAPER_RUNTIME_HAS_ISSUES'),
      liveSafety: { valid: false, liveRiskIntentCount: 1, liveOrderCount: 0 },
    };
    const { report } = await run(
      { ...CompleteEnvironment, LIVE_TRADING_KILL_SWITCH_ENABLED: 'false' },
      unsafeSoak,
    );
    expect(report.finalVerdict).toBe('NOT_READY_SAFETY_GATES_FAILED');
    expect(report.safety.failures).toEqual(
      expect.arrayContaining([
        'LIVE_TRADING_KILL_SWITCH_NOT_ENGAGED',
        'LIVE_LEDGER_SAFETY_INVARIANT_FAILED',
        'PAPER_SOAK_HAS_ISSUES',
      ]),
    );
  });

  it('returns manual-review readiness without exposing credentials or loading a key', async () => {
    const { report } = await run();
    expect(report).toMatchObject({
      finalVerdict: 'READY_FOR_MANUAL_LIVE_REVIEW',
      liveExecutionEnabled: false,
      executionAdapter: {
        discovered: true,
        mode: 'READ_ONLY',
        capabilityProbe: { status: 'PASS', readOnly: true },
        orderSubmissionEnabled: false,
        orderSubmissionDisabledReason: LIVE_EXECUTION_DISABLED,
      },
      wallet: { publicAddressPresent: true, publicAddressValid: true, privateKeyLoaded: false },
      connectivity: { status: 'PASS' },
      liveSafety: { liveRiskIntentCount: 0, liveOrderCount: 0 },
      manualReviewOnly: true,
    });
    const audit = JSON.stringify(report);
    expect(audit).not.toContain(CompleteEnvironment.DECIBEL_NODE_API_KEY);
    expect(audit).not.toContain(CompleteEnvironment.DECIBEL_WALLET_ADDRESS);
  });

  it('keeps the discovered adapter read-only and submission fail-closed', async () => {
    expect(Adapter.getStatus()).toMatchObject({
      discovered: true,
      mode: 'READ_ONLY',
      privateKeyLoaded: false,
      orderSubmissionEnabled: false,
    });
    expect(Adapter.validatePublicWalletAddress(undefined)).toEqual({
      valid: false,
      reason: 'DECIBEL_WALLET_ADDRESS_MISSING',
    });
    const payload = {
      marketAddress: Market.marketAddress,
      side: 'BUY' as const,
      quantity: 0.001,
      limitPrice: 65_000,
      reduceOnly: false,
      clientOrderId: 'dry-run-only',
    };
    expect(Adapter.validateOrderPayload(payload)).toEqual({ valid: true, reasons: [] });
    await expect(Adapter.submitOrder(payload)).rejects.toThrow(LIVE_EXECUTION_DISABLED);
  });

  it('does not create databases or change live ledger counts', async () => {
    const evidence = soak();
    evidence.liveSafety = { valid: true, liveRiskIntentCount: 0, liveOrderCount: 0 };
    const { root, report } = await run(CompleteEnvironment, evidence);
    expect(existsSync(path.join(root, 'paper.sqlite'))).toBe(false);
    expect(existsSync(path.join(root, 'candles.sqlite'))).toBe(false);
    expect(existsSync(path.join(root, 'micro.sqlite'))).toBe(false);
    expect(report.liveSafety).toEqual(evidence.liveSafety);
  });
});
