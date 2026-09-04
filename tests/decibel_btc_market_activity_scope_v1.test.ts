import { describe, expect, it } from 'vitest';

import { filterDecibelBTCMarketActivityV1 } from '../src/decibel_btc_market_activity_scope_v1.js';
import { DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1 } from '../src/decibel_minimal_live_canary_v1.js';

describe('Decibel BTC market activity scope V1', () => {
  it('admits only the canonical BTC market before exclusivity checks', () => {
    const BTCOrder = { market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1, id: 'btc' };
    const BTCPositionByAddress = {
      market_address: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1.toUpperCase().replace('0X', '0x'),
      id: 'btc-address',
    };
    const BTCTwapById = {
      market_id: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1.toUpperCase().replace('0X', '0x'),
      id: 'btc-id',
    };
    const rows = [
      { market: 'DELL/USD', id: 'dell-symbol' },
      { market: '0xdell', id: 'dell-object' },
      BTCOrder,
      { market: 'BTC/USD', id: 'btc-symbol-is-not-object-id' },
    ];

    expect(filterDecibelBTCMarketActivityV1([...rows, BTCPositionByAddress, BTCTwapById])).toEqual([
      BTCOrder,
      BTCPositionByAddress,
      BTCTwapById,
    ]);
  });
});
