import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DECIBEL_MAX_HISTORY_RANGE_MS,
  buildDecibelOperatorUiCanaryCaptureV1,
  classifyDecibelOperatorUiOrderPlacementLineageV1,
  getDecibelUiCaptureBaselineRangeV1,
  matchDecibelOperatorUiCanaryOrdersV1,
  verifyDecibelOperatorUiTransactionIntentV1,
  type decibel_ui_order_v1,
} from '../src/decibel_operator_ui_canary_order_capture_v1.js';

const handoff = {
  handoffPackageHash: 'h',
  canaryId: 'c',
  executionSessionId: 's',
  executionPackageHash: 'p',
  subaccount: '0x1',
  market: 'BTC/USD',
  marketAddress: '0x2',
  side: 'BUY',
  price: 100,
  quantity: 0.01,
  createdAt: 10,
  clientOrderId: 'planned',
  entryFunction: '0x3::m::f',
} as never;
const order: decibel_ui_order_v1 = {
  parent: '0x1',
  market: '0x2',
  clientOrderId: 'ui-generated',
  orderId: 'o',
  status: 'Open',
  orderType: 'Limit',
  isBuy: true,
  origSize: 0.01,
  remainingSize: 0.01,
  price: 100,
  transactionVersion: 7,
  unixMs: 11,
};
const placementFunction =
  '0x50ead22afd6ffd9769e3b3d6e0e64a2a350d68e8b102c4e72e33d0b8cfdfdb06::dex_accounts_entry::place_order_to_subaccount';
const adminFunction =
  '0x50ead22afd6ffd9769e3b3d6e0e64a2a350d68e8b102c4e72e33d0b8cfdfdb06::admin_apis::update_mark_for_composite_chainlink';
const transaction = (
  version: number,
  entryFunction: string,
  args: readonly unknown[] = ['0x1', '0x2', 100_000_000, 1_000_000, true, 1, false, 'ui-generated'],
) => ({
  hash: `0x${version.toString(16).padStart(64, '0')}`,
  version,
  success: true,
  vmStatus: 'Executed',
  sender: '0xoperator',
  entryFunction,
  arguments: args,
  timestamp: 12,
});
describe('Decibel operator UI canary capture V1', () => {
  it('bounds the immutable baseline at the handoff timestamp within Decibel history limits', () => {
    const createdAt = 1_788_291_394_650;
    const range = getDecibelUiCaptureBaselineRangeV1(createdAt);
    expect(range.startTimestamp).toBe(createdAt - DECIBEL_MAX_HISTORY_RANGE_MS + 1);
    expect(range.startTimestamp).toBeGreaterThan(0);
    expect(range.endTimestamp).toBe(createdAt);
    expect(range.endTimestamp - range.startTimestamp).toBeLessThanOrEqual(
      DECIBEL_MAX_HISTORY_RANGE_MS,
    );
  });
  it('wires both baseline histories to the bounded range and preserves the post-handoff start', () => {
    const source = readFileSync(
      resolve('src/run_decibel_operator_ui_canary_order_capture_v1.ts'),
      'utf8',
    );
    expect(source.match(/startTimestamp: baselineStart/g)).toHaveLength(2);
    expect(source.match(/endTimestamp: baselineEnd/g)).toHaveLength(2);
    expect(source.match(/startTimestamp: handoff\.createdAt/g)).toHaveLength(2);
    expect(source).not.toContain('startTimestamp: 0');
  });
  it('matches only a new exact semantic order while preserving separate client IDs', () => {
    const result = matchDecibelOperatorUiCanaryOrdersV1({
      handoff,
      baselineOrderIds: new Set(),
      orders: [order],
      tickSize: 0.1,
      lotSize: 0.01,
    });
    expect(result.matching).toHaveLength(1);
    const report = buildDecibelOperatorUiCanaryCaptureV1({
      handoff,
      handoffArtifactPath: 'handoff.json',
      baselineOrderIds: [],
      baselineClientOrderIds: ['planned'],
      baselineTransactionVersions: [],
      candidateCount: 1,
      matchingCandidates: result.matching,
      transaction: {
        hash: `0x${'a'.repeat(64)}`,
        version: 7,
        success: true,
        vmStatus: 'Executed',
        sender: '0x1',
        entryFunction: '0x3::m::f',
        arguments: ['0x1', '0x2', 100, 0.01, true, 1, false, 'ui-generated'],
        timestamp: 12,
      },
      activityExclusivity: true,
      captureStartAt: 10,
      capturedAt: 12,
    });
    expect(report.uiCanaryOrderCaptured).toBe(true);
    expect(report.handoffPlannedClientOrderId).toBe('planned');
    expect(report.venueClientOrderId).toBe('ui-generated');
    expect(report.mutationCounters.venueMutations).toBe(0);
  });
  it('cannot match a historical baseline order', () =>
    expect(
      matchDecibelOperatorUiCanaryOrdersV1({
        handoff,
        baselineOrderIds: new Set(['o']),
        orders: [order],
        tickSize: 0.1,
        lotSize: 0.01,
      }).matching,
    ).toHaveLength(0));
  it.each([
    ['parent', 'wrong'],
    ['market', 'wrong'],
    ['isBuy', false],
    ['price', 99.9],
    ['origSize', 0.02],
  ] as const)('rejects mismatched %s', (field, value) =>
    expect(
      matchDecibelOperatorUiCanaryOrdersV1({
        handoff,
        baselineOrderIds: new Set(),
        orders: [{ ...order, [field]: value }],
        tickSize: 0.1,
        lotSize: 0.01,
      }).matching,
    ).toHaveLength(0),
  );
  it('requires a unique candidate and preserves exact blockers', () => {
    const common = {
      handoff,
      handoffArtifactPath: 'x',
      baselineOrderIds: [],
      baselineClientOrderIds: [],
      baselineTransactionVersions: [],
      candidateCount: 0,
      transaction: null,
      activityExclusivity: true,
      captureStartAt: 10,
      capturedAt: 20,
    };
    expect(
      buildDecibelOperatorUiCanaryCaptureV1({ ...common, matchingCandidates: [] }).classification,
    ).toBe('UI_CANARY_ORDER_NOT_FOUND');
    expect(
      buildDecibelOperatorUiCanaryCaptureV1({
        ...common,
        candidateCount: 2,
        matchingCandidates: [order, { ...order, orderId: 'o2' }],
      }).classification,
    ).toBe('UI_CANARY_ORDER_AMBIGUOUS');
  });
  it('verifies placement payload and rejects mismatch/unproven evidence', () => {
    const base = {
      hash: 'x',
      version: 7,
      success: true,
      vmStatus: null,
      sender: null,
      entryFunction: '0x3::m::f',
      arguments: ['0x1', '0x2', 100, 0.01, true, 1, false],
      timestamp: null,
    };
    expect(verifyDecibelOperatorUiTransactionIntentV1({ handoff, transaction: base })).toBe('YES');
    expect(
      verifyDecibelOperatorUiTransactionIntentV1({
        handoff,
        transaction: { ...base, arguments: ['0x1', '0x2', 99, 0.01, true, 1, false] },
      }),
    ).toBe('NO');
    expect(
      verifyDecibelOperatorUiTransactionIntentV1({
        handoff,
        transaction: { ...base, entryFunction: null },
      }),
    ).toBe('UNPROVEN');
  });
  it('classifies unrelated activity as exclusivity loss', () =>
    expect(
      buildDecibelOperatorUiCanaryCaptureV1({
        handoff,
        handoffArtifactPath: 'x',
        baselineOrderIds: [],
        baselineClientOrderIds: [],
        baselineTransactionVersions: [],
        candidateCount: 2,
        matchingCandidates: [order],
        transaction: null,
        activityExclusivity: false,
        captureStartAt: 10,
        capturedAt: 20,
      }).classification,
    ).toBe('UI_CAPTURE_ACTIVITY_EXCLUSIVITY_LOST'));

  it('filters admin lineage before exclusivity and preserves it as diagnostic evidence', () => {
    const adminOrder = {
      ...order,
      orderId: 'admin-row',
      isBuy: false,
      transactionVersion: 7035507148,
    };
    const validOrder = { ...order, orderId: 'valid-row', transactionVersion: 7035508419 };
    const placementLineage = [
      classifyDecibelOperatorUiOrderPlacementLineageV1({
        handoff,
        order: adminOrder,
        transaction: transaction(7035507148, adminFunction),
      }),
      classifyDecibelOperatorUiOrderPlacementLineageV1({
        handoff,
        order: validOrder,
        transaction: transaction(7035508419, placementFunction),
      }),
    ];
    const result = matchDecibelOperatorUiCanaryOrdersV1({
      handoff,
      baselineOrderIds: new Set(),
      orders: [adminOrder, validOrder],
      tickSize: 0.1,
      lotSize: 0.01,
      placementLineage,
    });
    expect(placementLineage).toMatchObject([
      {
        transactionVersion: 7035507148,
        entryFunction: adminFunction,
        classification: 'PROVEN_NON_PLACEMENT',
      },
      {
        transactionVersion: 7035508419,
        entryFunction: placementFunction,
        classification: 'PROVEN_OPERATOR_PLACEMENT',
      },
    ]);
    expect(result.rawNewOrderRows).toHaveLength(2);
    expect(result.uniqueOrders).toHaveLength(2);
    expect(result.newOrders).toEqual([validOrder]);
    expect(result.provenNonPlacementRows).toEqual([adminOrder]);
    expect(result.matching).toEqual([validOrder]);
    expect(result.activityExclusivity).toBe(true);
    expect(result.lineageBlocker).toBeNull();
  });

  it('deduplicates lifecycle rows before lineage-filtered exclusivity', () => {
    const duplicate = { ...order, status: 'Filled', unixMs: 12 };
    const lineage = classifyDecibelOperatorUiOrderPlacementLineageV1({
      handoff,
      order,
      transaction: transaction(7, placementFunction),
    });
    const result = matchDecibelOperatorUiCanaryOrdersV1({
      handoff,
      baselineOrderIds: new Set(),
      orders: [order, duplicate],
      tickSize: 0.1,
      lotSize: 0.01,
      placementLineage: [lineage],
    });
    expect(result.rawNewOrderRows).toHaveLength(2);
    expect(result.uniqueOrders).toHaveLength(1);
    expect(result.newOrders).toHaveLength(1);
    expect(result.activityExclusivity).toBe(true);
  });

  it('loses exclusivity for two proven operator placements', () => {
    const second = { ...order, orderId: 'o2', clientOrderId: 'ui-generated-2' };
    const result = matchDecibelOperatorUiCanaryOrdersV1({
      handoff,
      baselineOrderIds: new Set(),
      orders: [order, second],
      tickSize: 0.1,
      lotSize: 0.01,
      placementLineage: [
        classifyDecibelOperatorUiOrderPlacementLineageV1({
          handoff,
          order,
          transaction: transaction(7, placementFunction),
        }),
        classifyDecibelOperatorUiOrderPlacementLineageV1({
          handoff,
          order: second,
          transaction: transaction(7, placementFunction, [
            '0x1',
            '0x2',
            100_000_000,
            1_000_000,
            true,
            1,
            false,
            'ui-generated-2',
          ]),
        }),
      ],
    });
    expect(result.newOrders).toHaveLength(2);
    expect(result.activityExclusivity).toBe(false);
  });

  it('fails closed when relevant placement lineage is unproven', () => {
    const lineage = classifyDecibelOperatorUiOrderPlacementLineageV1({
      handoff,
      order,
      transaction: null,
    });
    const result = matchDecibelOperatorUiCanaryOrdersV1({
      handoff,
      baselineOrderIds: new Set(),
      orders: [order],
      tickSize: 0.1,
      lotSize: 0.01,
      placementLineage: [lineage],
    });
    expect(result.unprovenLineageRows).toEqual([order]);
    expect(result.lineageBlocker).toBe('UNPROVEN_ORDER_TRANSACTION_LINEAGE');
    expect(result.activityExclusivity).toBe(false);
  });

  it.each([
    ['subaccount', ['wrong', '0x2', 100_000_000, 1_000_000, true, 1, false]],
    ['market', ['0x1', 'wrong', 100_000_000, 1_000_000, true, 1, false]],
    ['price', ['0x1', '0x2', 99_000_000, 1_000_000, true, 1, false]],
    ['quantity', ['0x1', '0x2', 100_000_000, 2_000_000, true, 1, false]],
    ['side', ['0x1', '0x2', 100_000_000, 1_000_000, false, 1, false]],
  ] as const)('fails closed on order-history transaction %s contradiction', (_field, args) => {
    const lineage = classifyDecibelOperatorUiOrderPlacementLineageV1({
      handoff,
      order,
      transaction: transaction(7, placementFunction, args),
    });
    const result = matchDecibelOperatorUiCanaryOrdersV1({
      handoff,
      baselineOrderIds: new Set(),
      orders: [order],
      tickSize: 0.1,
      lotSize: 0.01,
      placementLineage: [lineage],
    });
    expect(lineage.classification).toBe('UNPROVEN');
    expect(lineage.contradiction).not.toBeNull();
    expect(result.lineageBlocker).toBe('ORDER_HISTORY_TRANSACTION_CONTRADICTION');
    expect(result.activityExclusivity).toBe(false);
  });

  it('includes non-placement diagnostics and zero mutation counters in the capture artifact', () => {
    const adminOrder = { ...order, orderId: 'admin-row', transactionVersion: 7035507148 };
    const lineage = classifyDecibelOperatorUiOrderPlacementLineageV1({
      handoff,
      order: adminOrder,
      transaction: transaction(7035507148, adminFunction),
    });
    const report = buildDecibelOperatorUiCanaryCaptureV1({
      handoff,
      handoffArtifactPath: 'handoff.json',
      baselineOrderIds: [],
      baselineClientOrderIds: [],
      baselineTransactionVersions: [],
      candidateCount: 0,
      matchingCandidates: [],
      transaction: null,
      activityExclusivity: true,
      rawNewOrderRows: [adminOrder],
      uniqueOrderIds: [adminOrder.orderId],
      placementLineage: [lineage],
      provenOperatorPlacementCandidates: [],
      provenNonPlacementRows: [adminOrder],
      unprovenLineageRows: [],
      exclusivityFailures: [],
      captureStartAt: 10,
      capturedAt: 20,
    });
    expect(report.rawNewOrderRows).toEqual([adminOrder]);
    expect(report.provenNonPlacementRows).toEqual([adminOrder]);
    expect(report.mutationCounters).toEqual({
      signedTransactions: 0,
      submittedTransactions: 0,
      placedOrders: 0,
      cancelledOrders: 0,
      replacedOrders: 0,
      venueMutations: 0,
    });
  });
});
