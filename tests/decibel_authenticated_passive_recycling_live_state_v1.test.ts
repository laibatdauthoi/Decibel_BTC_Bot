import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  deriveDecibelAuthenticatedPassiveRecyclingLiveStateV1,
  FROZEN_CANARY_MANIFEST_BODY_SHA256,
  FROZEN_CANARY_MANIFEST_SHA256,
  validateDecibelAuthenticatedLiveCanaryManifestV1,
  type decibel_authenticated_recycling_fill_v1,
} from '../src/decibel_authenticated_passive_recycling_live_state_v1.js';

const manifestPath = resolve('research/decibel_authenticated_live_canary_success_v1_manifest.json');
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString('utf8')) as Record<string, unknown>;
const canaryFill: decibel_authenticated_recycling_fill_v1 = Object.freeze({
  tradeId: '128861549622277478047068807757829',
  orderId: '170141599249866108485528702512416161792',
  clientOrderId: '64585957f9134b3e8d6ee952e9122535',
  side: 'BUY',
  size: 0.00027,
  price: 76_916.9,
  transactionVersion: 7_036_650_897,
  source: 'OrderFill',
  makerStatus: 'PROVEN',
});
const now = 1_800_000_000_000;

function derive(
  changes: Partial<
    Parameters<typeof deriveDecibelAuthenticatedPassiveRecyclingLiveStateV1>[0]
  > = {},
) {
  return deriveDecibelAuthenticatedPassiveRecyclingLiveStateV1({
    manifest,
    manifestFileSha256: FROZEN_CANARY_MANIFEST_SHA256,
    now,
    accountObservedAt: now,
    maxStateAgeMs: 5_000,
    currentPositionBase: 0.00027,
    fills: [canaryFill],
    openOrders: [],
    activeTwapCount: 0,
    activeTpSlCount: 0,
    activeBulkOrderCount: 0,
    book: { bestBid: 79_999.9, bestAsk: 80_000, observedAt: now },
    metadata: {
      marketAddress: '0x5e0e16f34adfb4b316f8d532d68acbfa206826feaaa418d3938046bdc2044861',
      tickSize: 0.1,
      lotSize: 0.00001,
      minimumSize: 0.00002,
      minimumNotionalUsd: 10,
      maximumConfiguredNotionalUsd: 100,
      mode: 'Open',
    },
    hardInventoryLimitBase: 0.001,
    ...changes,
  });
}

describe('DECIBEL AUTHENTICATED PASSIVE RECYCLING LIVE-STATE BRIDGE V1', () => {
  it('validates the exact immutable success manifest and hashes', () => {
    expect(createHash('sha256').update(manifestBytes).digest('hex')).toBe(
      FROZEN_CANARY_MANIFEST_SHA256,
    );
    expect(manifest.manifestBodyHashSha256).toBe(FROZEN_CANARY_MANIFEST_BODY_SHA256);
    expect(
      validateDecibelAuthenticatedLiveCanaryManifestV1({
        manifest,
        manifestFileSha256: FROZEN_CANARY_MANIFEST_SHA256,
      }).fillIds,
    ).toEqual(['128861549622277478047068807757829']);
  });

  it('turns the authenticated BUY fill and current position into SELL-only LONG_RECYCLE', () => {
    const state = derive();
    expect(state).toMatchObject({
      ready: true,
      inventoryState: 'LONG_RECYCLE',
      authenticatedPositionBase: 0.00027,
      eligibleSide: 'SELL',
      buySuppressed: true,
      sellSuppressed: false,
      authenticatedMakerFilledBase: 0.00027,
      authenticatedMakerVolumeUsd: 20.767563,
      cycleStarted: true,
      cycleCompleted: false,
      currentCycleInventoryBase: 0.00027,
      completedRecycleCycles: 0,
      externalCounterpartyRequired: true,
      selfTradePermitted: false,
      liveExecutionEnabled: false,
      venueMutationEnabled: false,
    });
    expect(state.intent).toEqual({
      side: 'SELL',
      price: 80_000,
      quantity: 0.00027,
      notionalUsd: 21.6,
      type: 'LIMIT',
      timeInForce: 'PostOnly',
      postOnly: true,
    });
    expect(state.mutationCounters).toEqual({
      signedTransactions: 0,
      submittedTransactions: 0,
      placedOrders: 0,
      cancelledOrders: 0,
      replacedOrders: 0,
      venueMutations: 0,
    });
  });

  it('blocks stale BBO/account state', () => {
    const state = derive({ book: { bestBid: 79_999.9, bestAsk: 80_000, observedAt: now - 5_001 } });
    expect(state.inventoryState).toBe('BLOCKED');
    expect(state.blockers).toContain('AUTHENTICATED_RECYCLING_STATE_STALE');
    expect(state.intent).toBeNull();
  });

  it('blocks unexplained open orders and emits no second intent', () => {
    const state = derive({
      openOrders: [
        {
          orderId: 'unknown',
          clientOrderId: 'manual',
          marketAddress: '0x5e0e16f34adfb4b316f8d532d68acbfa206826feaaa418d3938046bdc2044861',
          side: 'SELL',
          knownRecyclingOrder: false,
        },
      ],
    });
    expect(state.blockers).toContain('AUTHENTICATED_RECYCLING_UNEXPLAINED_BTC_OPEN_ORDER');
    expect(state.intent).toBeNull();
  });

  it('reports one known active recycling order without generating another', () => {
    const state = derive({
      openOrders: [
        {
          orderId: 'known',
          clientOrderId: 'dpvr1-s-0-id',
          marketAddress: '0x5e0e16f34adfb4b316f8d532d68acbfa206826feaaa418d3938046bdc2044861',
          side: 'SELL',
          knownRecyclingOrder: true,
        },
      ],
    });
    expect(state.ready).toBe(true);
    expect(state.knownActiveRecyclingOrder?.orderId).toBe('known');
    expect(state.intent).toBeNull();
    expect(state.operatorActionRequired).toBe(false);
  });

  it('keeps foreign-market open orders out of the BTC ledger and blocks under strict account-wide exclusivity', () => {
    const state = derive({
      openOrders: [
        {
          orderId: 'foreign',
          clientOrderId: 'foreign-client',
          marketAddress: '0xdell',
          side: 'BUY',
          knownRecyclingOrder: false,
        },
      ],
    });
    expect(state.btcOpenOrderIds).toEqual([]);
    expect(state.foreignMarketOpenOrderIds).toEqual(['foreign']);
    expect(state.blockers).toContain('AUTHENTICATED_RECYCLING_UNRELATED_MARKET_OPEN_ORDER');
  });

  it('reports granular authenticated activity blockers', () => {
    const state = derive({ activeTwapCount: 1, activeTpSlCount: 1, activeBulkOrderCount: 1 });
    expect(state.blockers).toEqual(
      expect.arrayContaining([
        'AUTHENTICATED_RECYCLING_ACTIVE_TWAP',
        'AUTHENTICATED_RECYCLING_ACTIVE_TP_SL',
        'AUTHENTICATED_RECYCLING_ACTIVE_BULK_ORDER',
      ]),
    );
  });

  it('blocks unexplained fills and position conservation mismatches', () => {
    const extra = { ...canaryFill, tradeId: 'unexplained', orderId: 'other', size: 0.00001 };
    expect(derive({ fills: [canaryFill, extra], currentPositionBase: 0.00028 }).blockers).toContain(
      'AUTHENTICATED_RECYCLING_UNEXPLAINED_BTC_FILL',
    );
    expect(() => derive({ currentPositionBase: 0 })).not.toThrow();
    expect(derive({ currentPositionBase: 0 }).blockers).toContain(
      'AUTHENTICATED_RECYCLING_POSITION_CONSERVATION_FAILED',
    );
  });

  it('deduplicates identical fills and rejects conflicting duplicate IDs', () => {
    const idempotent = derive({ fills: [canaryFill, { ...canaryFill }] });
    expect(idempotent.authenticatedFillIds).toEqual([canaryFill.tradeId]);
    expect(idempotent.authenticatedMakerVolumeUsd).toBe(20.767563);
    expect(() => derive({ fills: [canaryFill, { ...canaryFill, price: 76_917 }] })).toThrow(
      'AUTHENTICATED_RECYCLING_FILL_ID_CONFLICT',
    );
  });

  it('counts no placement volume and completes a cycle only on authenticated return to zero', () => {
    const sellFill: decibel_authenticated_recycling_fill_v1 = {
      tradeId: 'sell-fill',
      orderId: 'known-sell-order',
      clientOrderId: 'dpvr1-s-0-id',
      side: 'SELL',
      size: 0.00027,
      price: 80_000,
      transactionVersion: 7_036_650_999,
      source: 'OrderFill',
      makerStatus: 'PROVEN',
    };
    const state = derive({
      fills: [canaryFill, sellFill],
      knownRecyclingOrderIds: ['known-sell-order'],
      currentPositionBase: 0,
    });
    expect(state).toMatchObject({
      inventoryState: 'FLAT',
      completedRecycleCycles: 1,
      cycleCompleted: true,
      currentCycleInventoryBase: 0,
      authenticatedMakerFilledBase: 0.00054,
      intent: null,
    });
    expect(state.authenticatedMakerVolumeUsd).toBeCloseTo(42.367563, 12);
  });

  it('fails closed when the immutable manifest hash is wrong', () => {
    expect(() =>
      validateDecibelAuthenticatedLiveCanaryManifestV1({
        manifest,
        manifestFileSha256: '0'.repeat(64),
      }),
    ).toThrow('AUTHENTICATED_CANARY_MANIFEST_FILE_HASH_MISMATCH');
  });
});
