import { describe, expect, it } from 'vitest';
import {
  buildDecibelOperatorUiCanaryCaptureV1,
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
describe('Decibel operator UI canary capture V1', () => {
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
});
