import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  getBacktestFailureDiagnostics,
  readMainnetBTCBacktestDataset,
} from '../src/backtest_data.js';
import { candlestick_repository } from '../src/candlestick_repository.js';
import { resolveCandlestickDatabasePath } from '../src/database_path.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('backtest persistence integration', () => {
  it('reads candles written by persistence from the shared configured database', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'decibel-backtest-'));
    temporaryDirectories.push(projectRoot);
    const databasePath = resolveCandlestickDatabasePath(projectRoot);
    const marketAddress = '0xmainnet-btc-market';
    const Writer = new candlestick_repository(databasePath);
    Writer.saveCandlesticks({
      symbol: 'BTC/USD',
      exchangeSymbol: 'BTC-USD',
      marketAddress,
      interval: '5m',
      candles: [
        {
          timestamp: new Date(0),
          open: 100,
          high: 102,
          low: 99,
          close: 101,
          volume: 2,
        },
      ],
    });
    Writer.close();

    const Reader = new candlestick_repository(resolveCandlestickDatabasePath(projectRoot));
    try {
      const dataset = readMainnetBTCBacktestDataset(Reader, 'mainnet');

      expect(dataset.marketAddress).toBe(marketAddress);
      expect(dataset.interval).toBe('5m');
      expect(dataset.candles).toEqual([
        {
          timestamp: new Date(0),
          open: 100,
          high: 102,
          low: 99,
          close: 101,
          volume: 2,
        },
      ]);
      expect(getBacktestFailureDiagnostics(Reader, databasePath)).toEqual({
        databasePath,
        candleGroups: [{ marketAddress, interval: '5m', candleCount: 1 }],
      });
    } finally {
      Reader.close();
    }
  });

  it('rejects testnet configuration and ambiguous stored 5m markets', () => {
    const Repository = new candlestick_repository(':memory:');
    const save = (marketAddress: string): void => {
      Repository.saveCandlesticks({
        symbol: 'BTC/USD',
        exchangeSymbol: 'BTC-USD',
        marketAddress,
        interval: '5m',
        candles: [
          { timestamp: new Date(0), open: 100, high: 100, low: 100, close: 100, volume: 1 },
        ],
      });
    };
    save('0xfirst');
    save('0xsecond');

    expect(() => readMainnetBTCBacktestDataset(Repository, 'testnet')).toThrow(
      'DECIBEL_NETWORK=mainnet',
    );
    expect(() => readMainnetBTCBacktestDataset(Repository, 'mainnet')).toThrow('ambiguous');
    Repository.close();
  });
});
