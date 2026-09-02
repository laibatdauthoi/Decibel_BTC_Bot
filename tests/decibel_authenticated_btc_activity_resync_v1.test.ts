import { describe, expect, it } from 'vitest';

import {
  deriveDecibelAuthenticatedBtcActivityResyncV1,
  validateDecibelAuthenticatedBtcResyncCheckpointV1,
  type decibel_btc_attributed_fill_v1,
} from '../src/decibel_authenticated_btc_activity_resync_v1.js';

const frozen: decibel_btc_attributed_fill_v1 = {
  tradeId: 'frozen',
  orderId: 'frozen-order',
  clientOrderId: 'frozen-client',
  marketAddress: '0xbtc',
  side: 'BUY',
  size: 0.00027,
  price: 76_916.9,
  transactionVersion: 1,
  transactionHash: '0x1',
  entryFunction: 'fill',
  transactionLineage: 'PROVEN_OPERATOR_PLACEMENT',
  orderType: 'Limit',
  timeInForce: 1,
  postOnly: true,
  fee: 0.003,
  rebate: 0,
  makerStatus: 'PROVEN',
  activityClass: 'FROZEN_CANARY_STRATEGY_FILL',
};
const externalSell: decibel_btc_attributed_fill_v1 = {
  ...frozen,
  tradeId: 'external',
  orderId: 'manual-order',
  clientOrderId: 'manual-client',
  side: 'SELL',
  transactionVersion: 2,
  activityClass: 'AUTHENTICATED_OUT_OF_BAND_ACCOUNT_FILL',
};

function derive(
  changes: Partial<Parameters<typeof deriveDecibelAuthenticatedBtcActivityResyncV1>[0]> = {},
) {
  return deriveDecibelAuthenticatedBtcActivityResyncV1({
    priorFrozenManifestBodyHash: 'manifest-hash',
    frozenFillIds: ['frozen'],
    capturedRecyclingOrderIds: [],
    fills: [frozen, externalSell],
    currentPositionBase: 0,
    lotSize: 0.00001,
    btcOpenOrderCount: 0,
    activeBtcTwapCount: 0,
    activeBtcTpSlCount: 0,
    activeBtcBulkOrderCount: 0,
    resyncTimestamp: 100,
    sourceHashes: { manifest: 'hash' },
    ...changes,
  });
}

describe('DECIBEL AUTHENTICATED BTC OUT-OF-BAND ACTIVITY ATTRIBUTION AND RESYNC V1', () => {
  it('uses out-of-band fills for account conservation but excludes them from strategy volume', () => {
    const result = derive();
    expect(result).toMatchObject({
      ready: true,
      accountInventoryBase: 0,
      positionConservationPassed: true,
      strategyMakerVolumeUsd: 20.767563,
      cycleDisposition: 'CYCLE_INTERRUPTED_BY_OUT_OF_BAND_ACTIVITY',
    });
    expect(result.strategyFillIds).toEqual(['frozen']);
    expect(result.outOfBandFillIds).toEqual(['external']);
    expect(result.checkpoint?.completedRecycleCycles).toBe(0);
  });

  it('keeps a durably captured recycling order in the strategy ledger', () => {
    const captured = { ...externalSell, orderId: 'captured', makerStatus: 'PROVEN' as const };
    const result = derive({ fills: [frozen, captured], capturedRecyclingOrderIds: ['captured'] });
    expect(result.strategyFillIds).toEqual(['frozen', 'external']);
    expect(result.outOfBandFillIds).toEqual([]);
  });

  it('never infers unknown side or maker status', () => {
    const unknown = {
      ...externalSell,
      side: null,
      makerStatus: 'UNPROVEN' as const,
      transactionLineage: 'UNPROVEN' as const,
    };
    const result = derive({ fills: [frozen, unknown] });
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain('BTC_FILL_ATTRIBUTION_INCOMPLETE');
    expect(result.checkpoint).toBeNull();
  });

  it('blocks checkpoint creation for nonzero position, open orders, or active protections', () => {
    expect(derive({ currentPositionBase: 0.00027 }).blockers).toContain(
      'BTC_RESYNC_POSITION_NOT_ZERO',
    );
    expect(derive({ btcOpenOrderCount: 1 }).blockers).toContain('BTC_RESYNC_OPEN_ORDER_PRESENT');
    expect(derive({ activeBtcTwapCount: 1 }).blockers).toContain('BTC_RESYNC_ACTIVE_TWAP');
    expect(derive({ activeBtcTpSlCount: 1 }).blockers).toContain('BTC_RESYNC_ACTIVE_TP_SL');
    expect(derive({ activeBtcBulkOrderCount: 1 }).blockers).toContain(
      'BTC_RESYNC_ACTIVE_BULK_ORDER',
    );
  });

  it('fails account conservation when authenticated fills do not explain position', () => {
    const result = derive({ fills: [frozen], currentPositionBase: 0 });
    expect(result.blockers).toContain('BTC_ACCOUNT_POSITION_CONSERVATION_FAILED');
  });

  it('creates a deterministic checkpoint without venue mutation authority', () => {
    const left = derive();
    const right = derive();
    expect(left.checkpoint).toEqual(right.checkpoint);
    expect(validateDecibelAuthenticatedBtcResyncCheckpointV1(left.checkpoint)).toMatchObject({
      checkpointBodyHashSha256: left.checkpoint?.checkpointBodyHashSha256,
    });
    expect(left.mutationCounters).toEqual({
      signedTransactions: 0,
      submittedTransactions: 0,
      placedOrders: 0,
      cancelledOrders: 0,
      replacedOrders: 0,
      venueMutations: 0,
    });
  });
});
