import { describe, expect, it } from 'vitest';
import {
  assessDecibelVenueProbeOrderV1,
  assessDecibelVenueProbePreconditionsV1,
  assessDecibelVenueProbeStopV1,
  findDecibelVenueProbeStopOrderIdV1,
  buildDecibelVenueProbeClientOrderIdV1,
  compareDecibelVenueProbeOrdersV1,
  getDecibelVenueProbePriceV1,
  getDecibelVenueProbeSizeV1,
  isDecibelVenueProbeClientOrderIdV1,
  extractDecibelVenueProbeOrderEventsV1,
  findDecibelVenueProbeReplacementOrderIdV1,
  parseDecibelMoveAbortV1,
  parseDecibelVenueProbeArgsV1,
  redactDecibelVenueProbeTextV1,
  type decibel_venue_probe_order_v1,
} from '../src/decibel_venue_probe_policy_v1.js';

const market = { tickSize: 0.1, lotSize: 0.00001, minimumSize: 0.00002, midPrice: 80000 };
const ready = {
  tradingMode: 'mainnet',
  liveTradingEnabled: 'true',
  network: 'mainnet',
  productionProcessRunning: false,
  positionBase: 0,
  openOrderCount: 0,
  bulkOrderCount: 0,
  marketMode: 'Open',
  aptBalanceOctas: 5_000_000,
  requiredGasOctas: 20_000_000 / 100,
};

describe('venue probe policy', () => {
  it('requires --live and exactly one valid stage', () => {
    expect(parseDecibelVenueProbeArgsV1(['--stage', 'A']).error).toBe('PROBE_LIVE_FLAG_REQUIRED');
    expect(parseDecibelVenueProbeArgsV1(['--live']).error).toBe('PROBE_STAGE_REQUIRED');
    expect(parseDecibelVenueProbeArgsV1(['--live', '--stage', 'Z']).error).toBe(
      'PROBE_STAGE_REQUIRED',
    );
    expect(parseDecibelVenueProbeArgsV1(['--live', '--stage', 'A', '--stage', 'B']).error).toBe(
      'PROBE_SINGLE_STAGE_REQUIRED',
    );
    expect(
      parseDecibelVenueProbeArgsV1(['--live', '--stage', 'C', '--partial-fill-wait-ms', '700000'])
        .error,
    ).toBe('PROBE_PARTIAL_FILL_WAIT_INVALID');
    expect(parseDecibelVenueProbeArgsV1(['--live', '--stage', 'E']).args).toEqual({
      stage: 'E',
      reportDirectory: null,
      partialFillWaitMs: 600000,
    });
  });

  it('blocks on every unproven precondition', () => {
    expect(assessDecibelVenueProbePreconditionsV1(ready)).toBeNull();
    expect(assessDecibelVenueProbePreconditionsV1({ ...ready, liveTradingEnabled: 'false' })).toBe(
      'PROBE_MAINNET_LIVE_TRADING_FLAGS_REQUIRED',
    );
    expect(
      assessDecibelVenueProbePreconditionsV1({ ...ready, productionProcessRunning: null }),
    ).toBe('PROBE_PRODUCTION_PROCESS_NOT_PROVEN_STOPPED');
    expect(
      assessDecibelVenueProbePreconditionsV1({ ...ready, productionProcessRunning: true }),
    ).toBe('PROBE_PRODUCTION_PROCESS_NOT_PROVEN_STOPPED');
    expect(assessDecibelVenueProbePreconditionsV1({ ...ready, marketMode: 'ReduceOnly' })).toBe(
      'PROBE_MARKET_NOT_OPEN',
    );
    expect(assessDecibelVenueProbePreconditionsV1({ ...ready, positionBase: null })).toBe(
      'PROBE_POSITION_UNKNOWN',
    );
    expect(assessDecibelVenueProbePreconditionsV1({ ...ready, positionBase: 0.00002 })).toBe(
      'PROBE_FLAT_POSITION_REQUIRED',
    );
    expect(assessDecibelVenueProbePreconditionsV1({ ...ready, openOrderCount: 1 })).toBe(
      'PROBE_ZERO_OPEN_ORDERS_REQUIRED',
    );
    expect(assessDecibelVenueProbePreconditionsV1({ ...ready, bulkOrderCount: null })).toBe(
      'PROBE_ZERO_BULK_ORDERS_REQUIRED',
    );
  });

  it('rounds resting prices away from the touch and crossing prices through it', () => {
    expect(getDecibelVenueProbePriceV1(market, 'BUY', 0.03, 'AWAY')).toBe(77600);
    expect(getDecibelVenueProbePriceV1(market, 'SELL', 0.03, 'AWAY')).toBe(82400);
    expect(getDecibelVenueProbePriceV1({ ...market, midPrice: 80000.05 }, 'BUY', 0, 'AWAY')).toBe(
      80000,
    );
    expect(
      getDecibelVenueProbePriceV1({ ...market, midPrice: 80000.05 }, 'BUY', 0, 'THROUGH'),
    ).toBe(80000.1);
    expect(getDecibelVenueProbeSizeV1(market, 2)).toBe(0.00004);
    expect(getDecibelVenueProbeSizeV1({ ...market, minimumSize: 0.000015 }, 1)).toBe(0.00002);
  });

  it('applies its own risk gate to every order', () => {
    const rest: decibel_venue_probe_order_v1 = {
      side: 'BUY',
      price: 77600,
      quantity: 0.00004,
      timeInForce: 'PostOnly',
      reduceOnly: false,
      purpose: 'REST',
    };
    expect(assessDecibelVenueProbeOrderV1(rest, market, 0)).toBeNull();
    expect(assessDecibelVenueProbeOrderV1({ ...rest, quantity: 0.0002 }, market, 0)).toBe(
      'PROBE_ORDER_NOTIONAL_ABOVE_CAP',
    );
    expect(
      assessDecibelVenueProbeOrderV1(
        { ...rest, quantity: 0.0001 },
        { ...market, minimumSize: 0.00001 },
        0,
      ),
    ).toBe('PROBE_ORDER_SIZE_ABOVE_TWO_MINIMUM');
    expect(
      assessDecibelVenueProbeOrderV1({ ...rest, timeInForce: 'ImmediateOrCancel' }, market, 0),
    ).toBe('PROBE_IOC_ONLY_FOR_EXPLICIT_OPEN_OR_CLOSE');
    const close: decibel_venue_probe_order_v1 = {
      side: 'SELL',
      price: 79700,
      quantity: 0.00004,
      timeInForce: 'ImmediateOrCancel',
      reduceOnly: true,
      purpose: 'CLOSE_POSITION',
    };
    expect(assessDecibelVenueProbeOrderV1(close, market, 0.00004)).toBeNull();
    expect(assessDecibelVenueProbeOrderV1({ ...close, reduceOnly: false }, market, 0.00004)).toBe(
      'PROBE_CLOSE_REQUIRES_REDUCE_ONLY',
    );
    expect(assessDecibelVenueProbeOrderV1(close, market, -0.00004)).toBe(
      'PROBE_CLOSE_SIDE_INVALID',
    );
    expect(assessDecibelVenueProbeOrderV1(close, market, 0.00002)).toBe(
      'PROBE_CLOSE_ABOVE_POSITION',
    );
    expect(
      assessDecibelVenueProbeOrderV1(
        { ...close, side: 'BUY', reduceOnly: false, purpose: 'OPEN_POSITION' },
        market,
        0.00002,
      ),
    ).toBe('PROBE_OPEN_REQUIRES_FLAT_POSITION');
    expect(
      assessDecibelVenueProbeOrderV1(
        { ...close, timeInForce: 'ImmediateOrCancel', purpose: 'TP' },
        market,
        0.00004,
      ),
    ).toBe('PROBE_IOC_ONLY_FOR_EXPLICIT_OPEN_OR_CLOSE');
  });

  it('builds short, recognisable client order ids', () => {
    const id = buildDecibelVenueProbeClientOrderIdV1('C', 12, 1_794_000_000_000);
    expect(Buffer.byteLength(id)).toBeLessThanOrEqual(32);
    expect(isDecibelVenueProbeClientOrderIdV1(id)).toBe(true);
    expect(isDecibelVenueProbeClientOrderIdV1('d1b' + 'a'.repeat(29))).toBe(false);
    expect(isDecibelVenueProbeClientOrderIdV1(null)).toBe(false);
  });

  it('reports whether an update kept the order id and timestamp', () => {
    const before = {
      orderId: '1',
      clientOrderId: 'vprobe-A1-x',
      price: 77600,
      origSize: 0.00004,
      remainingSize: 0.00004,
      reduceOnly: false,
      unixMs: 100,
    };
    expect(
      compareDecibelVenueProbeOrdersV1(before, [{ ...before, price: 77200 }], 'vprobe-A1-x'),
    ).toMatchObject({ orderPresent: true, orderIdPreserved: true, timestampPreserved: true });
    expect(
      compareDecibelVenueProbeOrdersV1(
        before,
        [{ ...before, orderId: '2', unixMs: 200 }],
        'vprobe-A1-x',
      ),
    ).toMatchObject({ orderIdPreserved: false, timestampPreserved: false });
    expect(compareDecibelVenueProbeOrdersV1(before, [], 'vprobe-A1-x')).toMatchObject({
      orderPresent: false,
      orderIdPreserved: null,
    });
  });

  it('blocks when the gas wallet cannot cover one capped transaction', () => {
    expect(
      assessDecibelVenueProbePreconditionsV1({
        ...ready,
        aptBalanceOctas: 100,
        requiredGasOctas: 200,
      }),
    ).toBe('PROBE_INSUFFICIENT_APT_FOR_GAS');
    expect(assessDecibelVenueProbePreconditionsV1({ ...ready, aptBalanceOctas: null })).toBe(
      'PROBE_INSUFFICIENT_APT_FOR_GAS',
    );
    expect(assessDecibelVenueProbePreconditionsV1({ ...ready, requiredGasOctas: 0 })).toBe(
      'PROBE_INSUFFICIENT_APT_FOR_GAS',
    );
  });

  it('redacts configured secrets and Aptos Labs API keys', () => {
    const text = "overrides: { API_KEY: 'aptoslabs_FakeKeyForTests_123' } key=0xabcdef0123456789";
    const redacted = redactDecibelVenueProbeTextV1(text, ['0xabcdef0123456789', 'short']);
    expect(redacted).not.toContain('aptoslabs_');
    expect(redacted).not.toContain('0xabcdef0123456789');
    expect(redacted).toContain('[REDACTED]');
    expect(redactDecibelVenueProbeTextV1('short value', ['short'])).toBe('short value');
  });

  it('reads order events and finds the replacement order after update_order', () => {
    // Shape recorded on mainnet 2026-11-12 (ids and addresses replaced with fakes).
    const event = (
      orderId: string,
      status: string,
      clientOrderId: string | null,
      reason?: string,
    ) => ({
      type: '0xfake::market_types::OrderEvent',
      data: {
        __variant__: 'V1',
        order_id: orderId,
        client_order_id: { vec: clientOrderId === null ? [] : [clientOrderId] },
        status: { __variant__: status },
        cancellation_reason: { vec: reason ? [{ __variant__: reason }] : [] },
        is_taker: status === 'ACKNOWLEDGED',
        price: '70855600000',
        orig_size: '4000',
        remaining_size: status === 'CANCELLED' ? '0' : '4000',
      },
    });
    const events = extractDecibelVenueProbeOrderEventsV1([
      { type: '0xfake::other::Event', data: {} },
      event('111', 'CANCELLED', 'vprobe-A1-x', 'OrderCancelledByUser'),
      event('222', 'ACKNOWLEDGED', null),
      event('222', 'OPEN', null),
    ]);
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      orderId: '111',
      clientOrderId: 'vprobe-A1-x',
      status: 'CANCELLED',
      cancellationReason: 'OrderCancelledByUser',
    });
    expect(events[2]).toMatchObject({ orderId: '222', clientOrderId: null, status: 'OPEN' });
    expect(findDecibelVenueProbeReplacementOrderIdV1(events, '111')).toBe('222');
    expect(findDecibelVenueProbeReplacementOrderIdV1([events[0]!], '111')).toBeNull();
  });

  it('classifies a committed Move abort with its code', () => {
    const hash = '0x' + '1'.repeat(64);
    expect(
      parseDecibelMoveAbortV1(
        `Transaction ${hash} failed with an error: Move abort in 0xfake::single_order_book: EORDER_NOT_FOUND(0x2): `,
      ),
    ).toEqual({ transactionHash: hash, abort: 'single_order_book::EORDER_NOT_FOUND(0x2)' });
    expect(parseDecibelMoveAbortV1('socket hang up')).toBeNull();
  });

  it('allows only a far stop on the closing side of an open position', () => {
    const long = { positionBase: 0.0002, midPrice: 70000 };
    expect(assessDecibelVenueProbeStopV1({ ...long, triggerPrice: 63000, limitPrice: 62300 })).toBe(
      null,
    );
    // Too close, wrong side, limit on the market side of the trigger, or flat.
    expect(assessDecibelVenueProbeStopV1({ ...long, triggerPrice: 69000, limitPrice: 68000 })).toBe(
      'PROBE_STOP_TOO_CLOSE',
    );
    expect(assessDecibelVenueProbeStopV1({ ...long, triggerPrice: 77000, limitPrice: 78000 })).toBe(
      'PROBE_STOP_TOO_CLOSE',
    );
    expect(assessDecibelVenueProbeStopV1({ ...long, triggerPrice: 63000, limitPrice: 63500 })).toBe(
      'PROBE_STOP_TOO_CLOSE',
    );
    expect(
      assessDecibelVenueProbeStopV1({
        ...long,
        positionBase: 0,
        triggerPrice: 63000,
        limitPrice: 62300,
      }),
    ).toBe('PROBE_STOP_POSITION_REQUIRED');
    const short = { positionBase: -0.0002, midPrice: 70000 };
    expect(
      assessDecibelVenueProbeStopV1({ ...short, triggerPrice: 77000, limitPrice: 77700 }),
    ).toBe(null);
    expect(
      assessDecibelVenueProbeStopV1({ ...short, triggerPrice: Number.NaN, limitPrice: 77700 }),
    ).toBe('PROBE_STOP_PRICE_INVALID');
  });

  it('finds the stop order id from the position first, else a single TP/SL row', () => {
    expect(findDecibelVenueProbeStopOrderIdV1(['7', '8'], '9')).toBe('9');
    expect(findDecibelVenueProbeStopOrderIdV1(['7'], null)).toBe('7');
    expect(findDecibelVenueProbeStopOrderIdV1(['7', '8'], null)).toBeNull();
    expect(findDecibelVenueProbeStopOrderIdV1([], '')).toBeNull();
  });
});
