import { describe, expect, it } from 'vitest';
import { projectDecibelStrategyStatusV1 } from '../src/decibel_strategy_status_v1.js';
import { createDecibelMarketStructureV1 } from '../src/decibel_market_structure_v1.js';
import type { decibel_production_live_snapshot_v1 } from '../src/decibel_production_live_types_v1.js';

const now = 1_800_000_000_000;
// Only the fields the status projection reads; the position rules are exercised elsewhere.
const flat = (overrides: Record<string, unknown> = {}) =>
  ({
    priceRangeBps: 12,
    entryCandleBlockers: { BUY: null, SELL: 'ENTRY_REQUIRES_NEW_HIGH' },
    executionGasBlocker: null,
    catastropheStop: null,
    marketStructure: createDecibelMarketStructureV1('EXCHANGE', [], now),
    ...overrides,
    input: { now, sessionId: 'session-a', actualInventoryBase: 0 },
  }) as unknown as decibel_production_live_snapshot_v1;

describe('decibel strategy status v1', () => {
  it('reports each rule for a flat book', () => {
    const status = projectDecibelStrategyStatusV1(flat())!;
    expect(status.candleSource).toBe('EXCHANGE');
    expect(status.rangeBps).toBe(12);
    const byRule = Object.fromEntries(status.rules.map((rule) => [rule.rule, rule]));
    expect(byRule.ENTRY_CANDLE_FILTER).toMatchObject({ state: 'PASS' });
    expect(byRule.ENTRY_CANDLE_FILTER!.reason).toContain('BUY_ONLY');
    expect(byRule.VOLATILITY_PAUSE!.state).toBe('PASS');
    expect(byRule.GAS_RESERVE!.state).toBe('PASS');
    expect(byRule.DCA!.state).toBe('IDLE');
    expect(byRule.TP_ADVERSE!.state).toBe('IDLE');
    expect(byRule.CATASTROPHE_STOP!.state).toBe('IDLE');
  });

  it('counts blocked cycles per rule within a session and resets on a new one', () => {
    const blocked = flat({
      priceRangeBps: 55,
      executionGasBlocker: 'ENTRY_GAS_BALANCE_LOW',
      entryCandleBlockers: { BUY: 'ENTRY_REQUIRES_NEW_LOW', SELL: 'ENTRY_REQUIRES_NEW_HIGH' },
    });
    const first = projectDecibelStrategyStatusV1(blocked)!;
    const second = projectDecibelStrategyStatusV1(blocked, first)!;
    expect(second.cycles).toBe(2);
    expect(second.blockedCycles).toMatchObject({
      ENTRY_CANDLE_FILTER: 2,
      VOLATILITY_PAUSE: 2,
      GAS_RESERVE: 2,
    });
    const other = {
      ...blocked,
      input: { ...blocked.input, sessionId: 'session-b' },
    } as decibel_production_live_snapshot_v1;
    expect(projectDecibelStrategyStatusV1(other, second)!.cycles).toBe(1);
  });

  it('returns null without a snapshot', () => {
    expect(projectDecibelStrategyStatusV1(null)).toBeNull();
  });
});
