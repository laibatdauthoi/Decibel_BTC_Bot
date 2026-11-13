import { describe, expect, it } from 'vitest';
import {
  DECIBEL_CATASTROPHE_STOP_LIMIT_SLIPPAGE_V1,
  isDecibelOwnedCatastropheStopV1,
  planDecibelCatastropheStopV1,
  validateDecibelCatastropheStopV1,
} from '../src/decibel_catastrophe_stop_v1.js';
import {
  deriveDecibelPositionStopStateV1,
  normalizeDecibelAuthenticatedOpenOrdersV1,
} from '../src/decibel_production_live_state_source_v1.js';
import { DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1 } from '../src/decibel_minimal_live_canary_v1.js';

const long = {
  positionBase: 0.00043,
  entryBasis: 70_000,
  markPrice: 69_900,
  maxLossUsd: 0.5,
  tickSize: 0.1,
  existing: null,
  foreignTpSlCount: 0,
};

describe('catastrophe stop plan', () => {
  it('places a wide SELL stop beyond Max Loss for a long, limit 3% past the trigger', () => {
    const plan = planDecibelCatastropheStopV1(long);
    // Notional 30.1 USD: 1.2 x 0.5 / 30.1 = 1.99% -> clamped up to the 2% minimum.
    expect(plan).toMatchObject({ action: 'PLACE', side: 'SELL', triggerPrice: 68_600 });
    expect(plan.limitPrice).toBeCloseTo(
      Math.floor((68_600 * (1 - DECIBEL_CATASTROPHE_STOP_LIMIT_SLIPPAGE_V1)) / 0.1) * 0.1,
      6,
    );
    expect(validateDecibelCatastropheStopV1(plan, long.positionBase, long.markPrice)).toBeNull();
    // A larger Max Loss widens the stop, capped at 10%.
    expect(planDecibelCatastropheStopV1({ ...long, maxLossUsd: 1.5 }).triggerPrice).toBeCloseTo(
      70_000 * (1 - (1.2 * 1.5) / 30.1),
      0,
    );
    expect(planDecibelCatastropheStopV1({ ...long, maxLossUsd: 50 }).triggerPrice).toBe(63_000);
  });

  it('mirrors for a short and stays on the adverse side of a market already past the entry', () => {
    const short = planDecibelCatastropheStopV1({
      ...long,
      positionBase: -0.00043,
      markPrice: 70_100,
    });
    expect(short).toMatchObject({ action: 'PLACE', side: 'BUY', triggerPrice: 71_400 });
    expect(short.limitPrice!).toBeGreaterThan(short.triggerPrice!);
    // A long already 3% down: the trigger moves to 1% below the market, not above it.
    const deep = planDecibelCatastropheStopV1({ ...long, markPrice: 67_900 });
    expect(deep.triggerPrice).toBeCloseTo(67_900 * 0.99, 0);
    expect(validateDecibelCatastropheStopV1(deep, long.positionBase, 67_900)).toBeNull();
  });

  it('does nothing when flat, already protected, or a foreign TP/SL exists', () => {
    expect(planDecibelCatastropheStopV1({ ...long, positionBase: 0 }).reason).toBe(
      'CATASTROPHE_STOP_FLAT',
    );
    const owned = { venueOrderId: '1', triggerPrice: 68_600, limitPrice: 66_542 };
    expect(planDecibelCatastropheStopV1({ ...long, existing: owned })).toMatchObject({
      action: 'NONE',
      reason: 'CATASTROPHE_STOP_PRESENT',
    });
    expect(planDecibelCatastropheStopV1({ ...long, foreignTpSlCount: 1 }).reason).toBe(
      'CATASTROPHE_STOP_FOREIGN_TP_SL_PRESENT',
    );
    expect(planDecibelCatastropheStopV1({ ...long, maxLossUsd: undefined }).reason).toBe(
      'CATASTROPHE_STOP_MAX_LOSS_REQUIRED',
    );
  });

  it('recognises only a wide stop on the adverse side as the bot stop', () => {
    expect(isDecibelOwnedCatastropheStopV1({ triggerPrice: 68_600 }, 0.00043, 70_000)).toBe(true);
    // Tight (0.5%) or on the profit side: not the bot's stop.
    expect(isDecibelOwnedCatastropheStopV1({ triggerPrice: 69_650 }, 0.00043, 70_000)).toBe(false);
    expect(isDecibelOwnedCatastropheStopV1({ triggerPrice: 71_000 }, 0.00043, 70_000)).toBe(false);
    expect(isDecibelOwnedCatastropheStopV1({ triggerPrice: 71_400 }, -0.00043, 70_000)).toBe(true);
  });

  it('refuses a stop that would not close the position or sits too close', () => {
    const plan = planDecibelCatastropheStopV1(long);
    expect(validateDecibelCatastropheStopV1(plan, -0.00043, long.markPrice)).toBe(
      'CATASTROPHE_STOP_SIDE_MUST_CLOSE_POSITION',
    );
    expect(validateDecibelCatastropheStopV1(plan, long.positionBase, 68_700)).toBe(
      'CATASTROPHE_STOP_TOO_CLOSE_OR_LIMIT_INVALID',
    );
  });
});

describe('catastrophe stop venue state (Stage D shapes)', () => {
  const market = DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1;
  const position = (overrides: Record<string, unknown> = {}) => ({
    market,
    user: 'subaccount',
    size: 0.00043,
    entry_price: 70_000,
    tp_order_id: null,
    sl_order_id: null,
    ...overrides,
  });
  const tpslRow = (orderId: string) => ({
    market,
    order_id: orderId,
    client_order_id: '',
    orig_size: null,
    remaining_size: null,
    price: 66_542,
    is_buy: false,
    is_tpsl: true,
    is_reduce_only: true,
  });

  it('accepts the full-size wide SL as the bot stop and excludes it from limit orders', () => {
    const state = deriveDecibelPositionStopStateV1(
      [position({ sl_order_id: 'sl', sl_trigger_price: 68_600, sl_limit_price: 66_542 })],
      [tpslRow('sl')],
    );
    expect(state).toEqual({
      catastropheStop: { venueOrderId: 'sl', triggerPrice: 68_600, limitPrice: 66_542 },
      foreignTpSlCount: 0,
    });
    expect(normalizeDecibelAuthenticatedOpenOrdersV1([tpslRow('sl')], market, 'strategy')).toEqual(
      [],
    );
  });

  it('counts a sized SL, a TP or a tight SL as foreign activity', () => {
    // Stage D: a sized SL leaves sl_order_id null and appears only as a TP/SL row.
    expect(deriveDecibelPositionStopStateV1([position()], [tpslRow('sized')])).toEqual({
      catastropheStop: null,
      foreignTpSlCount: 1,
    });
    expect(
      deriveDecibelPositionStopStateV1([position({ tp_order_id: 'tp' })], [tpslRow('tp')])
        .foreignTpSlCount,
    ).toBe(1);
    expect(
      deriveDecibelPositionStopStateV1(
        [position({ sl_order_id: 'tight', sl_trigger_price: 69_800 })],
        [tpslRow('tight')],
      ),
    ).toEqual({ catastropheStop: null, foreignTpSlCount: 1 });
  });
});
