import 'dotenv/config';

import { resolve } from 'node:path';

import { syncBTCCandlesticks } from './candlestick_pipeline.js';
import { candlestick_repository } from './candlestick_repository.js';
import { createBTCCandlestickSummary } from './candlestick_summary.js';
import { loadConfig } from './config.js';
import { decibel_client } from './decibel_client.js';

async function startApplication(): Promise<void> {
  const config = loadConfig();
  const DecibelClient = new decibel_client(config);
  const market = await DecibelClient.getBTCMarketMetadata();
  const price = await DecibelClient.getBTCPrice();
  const now = new Date();
  const CandlestickRepository = new candlestick_repository(
    resolve('data', 'btc_usd_candlesticks.sqlite'),
  );
  try {
    const persistence = await syncBTCCandlesticks(
      DecibelClient,
      CandlestickRepository,
      config.candleInterval,
      now,
    );
    const candleHistory = {
      symbol: 'BTC/USD' as const,
      exchangeSymbol: market.exchangeSymbol,
      marketAddress: market.marketAddress,
      interval: config.candleInterval,
      candles: CandlestickRepository.getCandlesticks(market.marketAddress, config.candleInterval),
    };
    const candles = createBTCCandlestickSummary(candleHistory);

    // Only public market data is emitted. Configuration and credentials are never logged.
    console.log(
      JSON.stringify({ network: config.network, market, price, candles, persistence }, null, 2),
    );
  } finally {
    CandlestickRepository.close();
  }
}

startApplication().catch(() => {
  console.error('Unable to fetch Decibel BTC/USD market data');
  process.exitCode = 1;
});
