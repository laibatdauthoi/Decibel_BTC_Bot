import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DECIBEL_HISTORY_ROLL_MARGIN_MS_V1,
  DECIBEL_MAX_HISTORY_RANGE_MS,
  DECIBEL_ORDER_ATTRIBUTION_LOOKBACK_MS_V1,
  decibel_production_live_state_source_v1,
  resolveDecibelHistoryWindowV1,
  type DecibelProductionLiveAuthenticatedReaderV1,
} from '../src/decibel_production_live_state_source_v1.js';
import { makeDecibelActivityBaselineFixtureV1 } from './fixtures/decibel_activity_baseline_fixture_v1.js';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2027, 2, 15);
const earliest = now - DECIBEL_MAX_HISTORY_RANGE_MS + DECIBEL_HISTORY_ROLL_MARGIN_MS_V1;

describe('Rolling venue history window', () => {
  it('starts at a recent baseline', () => {
    const baseline = now - 30 * DAY;
    expect(resolveDecibelHistoryWindowV1(baseline, now)).toEqual({
      orderStart: baseline,
      tradeStart: baseline,
      rolled: false,
    });
  });

  it('rolls an old baseline inside the 180-day limit instead of failing', () => {
    // The first wallet's legacy baseline (2026-09-01) on 2027-03-15.
    const window = resolveDecibelHistoryWindowV1(Date.UTC(2026, 8, 1), now);
    expect(window).toEqual({
      orderStart: earliest,
      tradeStart: earliest + DECIBEL_ORDER_ATTRIBUTION_LOOKBACK_MS_V1,
      rolled: true,
    });
    expect(now - window.orderStart).toBeLessThan(DECIBEL_MAX_HISTORY_RANGE_MS);
    // Orders reach further back than fills, so edge fills still find their order.
    expect(window.tradeStart - window.orderStart).toBe(DECIBEL_ORDER_ATTRIBUTION_LOOKBACK_MS_V1);
  });

  it('rejects a baseline in the future or malformed', () => {
    for (const bad of [now + 1, -1, Number.NaN])
      expect(() => resolveDecibelHistoryWindowV1(bad, now)).toThrow(
        'PRODUCTION_LIVE_SOURCE_BASELINE_HISTORY_RANGE_INVALID',
      );
  });

  it('reads venue history through the rolled window', async () => {
    const starts: Record<string, number> = {};
    const stop = () => Promise.reject(new Error('TEST_STOP_AFTER_HISTORY_REQUESTS'));
    const Reader = {
      readOrderHistory: (_subaccount: string, start: number) => {
        starts.orders = start;
        return stop();
      },
      readTradeHistory: (_subaccount: string, start: number) => {
        starts.trades = start;
        return stop();
      },
      readAccountOverview: stop,
      readPositions: stop,
      readOpenOrders: stop,
      readActiveTwaps: stop,
      readBulkOrders: stop,
      readMarketMetadata: stop,
      readCurrentBook: stop,
    } as unknown as DecibelProductionLiveAuthenticatedReaderV1;
    const Source = new decibel_production_live_state_source_v1(
      Reader,
      {
        DECIBEL_NETWORK: 'mainnet',
        DECIBEL_SUBACCOUNT_ADDRESS: 'test-subaccount',
        DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: join(
          mkdtempSync(join(tmpdir(), 'history-window-')),
          'missing.json',
        ),
      },
      () => now,
      () => ({
        ...makeDecibelActivityBaselineFixtureV1(),
        historyStartTimestamp: Date.UTC(2026, 8, 1),
      }),
    );
    await expect(Source.readAuthenticatedSnapshot()).rejects.toThrow();
    expect(starts).toEqual({
      orders: earliest,
      trades: earliest + DECIBEL_ORDER_ATTRIBUTION_LOOKBACK_MS_V1,
    });
  });
});
