import { describe, expect, it } from 'vitest';
import {
  assessDecibelVenueProbeOrderV1,
  assessDecibelVenueProbePreconditionsV1,
  buildDecibelVenueProbeClientOrderIdV1,
  compareDecibelVenueProbeOrdersV1,
  getDecibelVenueProbePriceV1,
  getDecibelVenueProbeSizeV1,
  isDecibelVenueProbeClientOrderIdV1,
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
});
