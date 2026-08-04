import type { BTC_candlestick } from './decibel_client.js';
import type { candlestick_group_count, candlestick_repository } from './candlestick_repository.js';

export type backtest_dataset = {
  marketAddress: string;
  interval: '5m';
  candles: BTC_candlestick[];
};

export function readMainnetBTCBacktestDataset(
  repository: candlestick_repository,
  network: 'mainnet' | 'testnet',
): backtest_dataset {
  if (network !== 'mainnet') {
    throw new Error('Backtest requires DECIBEL_NETWORK=mainnet');
  }

  const candidates = repository
    .getCandleGroupCounts()
    .filter((group) => group.interval === '5m' && group.candleCount > 0);
  if (candidates.length === 0) {
    throw new Error('No mainnet BTC/USD 5m candles are stored');
  }
  if (candidates.length !== 1) {
    throw new Error('Mainnet BTC/USD 5m market address is ambiguous in the database');
  }

  const candidate = candidates[0];
  if (candidate === undefined) throw new Error('No mainnet BTC/USD 5m candles are stored');
  return {
    marketAddress: candidate.marketAddress,
    interval: '5m',
    candles: repository.getCandlesticks(candidate.marketAddress, '5m'),
  };
}

export function getBacktestFailureDiagnostics(
  repository: candlestick_repository,
  databasePath: string,
): { databasePath: string; candleGroups: candlestick_group_count[] } {
  return { databasePath, candleGroups: repository.getCandleGroupCounts() };
}
