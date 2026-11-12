import { describe, it, expect } from 'vitest';
import {
  assembleDecibelCapacityCertificateV1,
  produceDecibelDepthV1,
  produceDecibelExitStressV1,
  produceDecibelLifecycleGasV1,
  parseDecibelCapacityReceiptV1,
  produceDecibelMarginTierV1,
} from '../src/decibel_capacity_producers_v1.js';
import { calculateDecibelRiskCapacityV1 } from '../src/decibel_risk_capacity_v1.js';
import { createDecibelTransactionEvidenceReaderV1 } from '../src/decibel_production_live_state_source_v1.js';
const book = (unix_ms: number, mid = 100) => ({
  market: 'BTC',
  unix_ms,
  bids: [
    { price: mid - 1, size: 2 },
    { price: mid - 2, size: 3 },
  ],
  asks: [
    { price: mid + 1, size: 2 },
    { price: mid + 2, size: 3 },
  ],
});
function valid() {
  return {
    now: 4000,
    maximumBookAgeMs: 5000,
    market: 'BTC',
    quantity: 1,
    books: [book(1000), book(2000, 98), book(3000, 102), book(4000, 99)],
    exits: [
      {
        startedAt: 1000,
        completedAt: 2000,
        transactionHash: 'exit1',
        source: 'AUTHENTICATED_IOC_FILL_AND_TX' as const,
      },
    ],
    policy: {
      source: 'TEST_EXPLICIT_POLICY',
      maximumAgeMs: 5000,
      minimumWindows: 2,
      minimumExitObservations: 1,
      maximumGapMs: 1000,
      exitHorizonMultiplier: 1,
      collateralReserveUsd: 0.1,
      liquidationReserveUsd: 0.1,
    },
    margin: {
      source: 'AUTHENTICATED_POST_ORDER_MARGIN_TIER' as const,
      observedAt: 4000,
      validUntil: 9000,
      maximumNotionalUsd: 1000,
      initialMarginRate: 0.1,
      reservedCollateralUsd: 0,
      liquidationDistanceBps: 9000,
      maintenanceMarginUsd: 0,
      tierBoundaryNotionalUsd: 1000,
    },
    manifest: [{ hash: 'tx' }],
    receipts: [
      {
        hash: 'tx',
        version: '1',
        gasUnits: '100',
        gasUnitPrice: '100',
        success: false,
        observedAt: 4000,
        source: 'APTOS_COMMITTED_USER_TRANSACTION' as const,
      },
    ],
    prices: [{ hash: 'tx', aptUsd: 2, source: 'TEST_HISTORICAL_FX' }],
    fees: {
      observedAt: 4000,
      validUntil: 9000,
      source: 'AUTHENTICATED_USER_FEE_RATES' as const,
      makerBps: 1,
      takerBps: 3,
    },
    futureGas: {
      source: 'TEST_COMPLETE_LIFECYCLE_BOUND',
      observedAt: 4000,
      validUntil: 9000,
      costUsd: 0.01,
    },
    adverseSelectionBps: 2,
  };
}
describe('Capacity evidence producers (synthetic tests, never production evidence)', () => {
  it('publishes a full certificate only from complete compatible components', () => {
    const input = valid(),
      report = assembleDecibelCapacityCertificateV1(input);
    expect(report.blockers).toEqual([]);
    expect(report.certificate).toBeDefined();
    const args = {
      now: 4000,
      evidence: report.certificate!,
      capitalUsd: 8,
      availableMarginUsd: 8,
      leverage: 10,
      maxLossUsd: 2,
      netSessionPnlAfterFeesUsd: 0,
      midpoint: 99,
      lotSize: 0.001,
      collateralFraction: 0.5,
      safetyNotionalCeilingUsd: 1000,
      positionBase: 0,
      orders: [],
    };
    expect(calculateDecibelRiskCapacityV1(args).effectivePositionLimitUsd).toBeGreaterThan(0);
    expect(calculateDecibelRiskCapacityV1(args)).toEqual(
      calculateDecibelRiskCapacityV1({ ...args }),
    );
    expect(
      assembleDecibelCapacityCertificateV1(JSON.parse(JSON.stringify(input)) as typeof input),
    ).toEqual(report);
  });
  it.each(['policy', 'margin', 'manifest', 'fees', 'futureGas', 'adverseSelectionBps'] as const)(
    'fails closed when %s is missing',
    (field) => {
      const input = valid();
      const altered = { ...input, [field]: null };
      expect(assembleDecibelCapacityCertificateV1(altered).certificate).toBeUndefined();
    },
  );
  it('rejects stale components, market gaps and duplicate conflicting depth', () => {
    const input = valid();
    expect(
      assembleDecibelCapacityCertificateV1({ ...input, now: 10000 }).certificate,
    ).toBeUndefined();
    expect(produceDecibelDepthV1(book(4000), 'OTHER', 4000, 5000, 1).blocker).toContain('MISMATCH');
    expect(
      produceDecibelExitStressV1(
        [book(1000), book(4000)],
        input.exits,
        'BTC',
        4000,
        1,
        input.policy,
      ).blocker,
    ).toContain('COVERAGE');
    expect(
      produceDecibelExitStressV1(
        [...input.books, book(2000, 120)],
        input.exits,
        'BTC',
        4000,
        1,
        input.policy,
      ).blocker,
    ).toContain('CONFLICT');
    for (const component of ['margin', 'fees', 'futureGas'] as const)
      expect(
        assembleDecibelCapacityCertificateV1({
          ...input,
          [component]: { ...input[component], validUntil: 3999 },
        }).certificate,
      ).toBeUndefined();
  });
  it('uses both order-book sides and returns thin depth instead of a synthetic fill', () => {
    const thin = book(4000);
    thin.asks = [{ price: 101, size: 0.1 }];
    expect(produceDecibelDepthV1(thin, 'BTC', 4000, 5000, 1).blocker).toBe(
      'CAPACITY_EXIT_DEPTH_INSUFFICIENT',
    );
    const partial = produceDecibelDepthV1(book(4000), 'BTC', 4000, 5000, 3).observation!;
    expect(partial.buyVwap).toBeCloseTo((2 * 101 + 102) / 3);
    expect(partial.sellVwap).toBeCloseTo((2 * 99 + 98) / 3);
    const input = valid(),
      calm = produceDecibelExitStressV1(input.books, input.exits, 'BTC', 4000, 1, input.policy);
    const high = produceDecibelExitStressV1(
      [book(1000), book(2000, 70), book(3000, 110), book(4000, 70)],
      input.exits,
      'BTC',
      4000,
      1,
      input.policy,
    );
    expect(high.observation!.adverseMoveBps).toBeGreaterThan(calm.observation!.adverseMoveBps);
  });
  it('fails closed at an unverified tier boundary and after restart without exit coverage', () => {
    const input = valid();
    expect(produceDecibelMarginTierV1(input.margin, 4000, 1001).blocker).toContain('BOUNDARY');
    expect(assembleDecibelCapacityCertificateV1({ ...input, exits: [] }).blockers).toContain(
      'CAPACITY_MEASURED_EXIT_HORIZON_COVERAGE_MISSING',
    );
  });
  it('covers all transactions including failed ones, deduplicates hashes and rejects incomplete gas/FX', () => {
    const input = valid();
    const gas = produceDecibelLifecycleGasV1(
      [{ hash: 'tx' }, { hash: 'tx' }],
      input.receipts,
      input.prices,
    );
    expect(gas.gasApt).toBe(0.0001);
    expect(gas.gasUsd).toBe(0.0002);
    expect(
      produceDecibelLifecycleGasV1([{ hash: null }], input.receipts, input.prices).blocker,
    ).toContain('MANIFEST');
    expect(produceDecibelLifecycleGasV1(input.manifest, [], input.prices).blocker).toContain(
      'RECEIPT',
    );
    expect(produceDecibelLifecycleGasV1(input.manifest, input.receipts, []).gasUsd).toBeNull();
    expect(parseDecibelCapacityReceiptV1({ type: 'pending_transaction' }, 'tx', 4000)).toBeNull();
    expect(
      parseDecibelCapacityReceiptV1(
        {
          type: 'user_transaction',
          hash: 'wrong',
          version: '1',
          gas_used: '2',
          gas_unit_price: '3',
          success: true,
        },
        'tx',
        4000,
      ),
    ).toBeNull();
  });
  it('shares committed receipt reads with reconciliation and never certifies pending transactions', async () => {
    let calls = 0;
    const chain = {
      getLedgerInfo: () => Promise.resolve({}),
      getTransactionByHash: () => {
        calls++;
        return Promise.resolve({
          type: 'user_transaction',
          hash: 'tx',
          version: '1',
          gas_used: '2',
          gas_unit_price: '3',
          success: true,
        });
      },
    } as unknown as Parameters<typeof createDecibelTransactionEvidenceReaderV1>[0];
    const reader = createDecibelTransactionEvidenceReaderV1(chain);
    expect(await reader.readTransactionByHash('tx')).toBe('COMMITTED');
    expect(await reader.readTransactionReceipt('tx')).toMatchObject({ gasUnits: '2' });
    expect(calls).toBe(1);
    const pending = {
      ...chain,
      getTransactionByHash: () => Promise.resolve({ type: 'pending_transaction' }),
    } as unknown as typeof chain;
    await expect(
      createDecibelTransactionEvidenceReaderV1(pending).readTransactionByHash('pending'),
    ).rejects.toThrow('PRODUCTION_RECONCILIATION_TRANSACTION_LOOKUP_FAILED');
  });
});
