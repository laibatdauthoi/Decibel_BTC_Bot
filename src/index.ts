import 'dotenv/config';

import { createBTCCandlestickSummary } from './candlestick_summary.js';
import { loadConfig } from './config.js';
import { decibel_client } from './decibel_client.js';

const CANDLE_LOOKBACK_MS = 24 * 60 * 60 * 1_000;

async function startApplication(): Promise<void> {
  const config = loadConfig();
  const DecibelClient = new decibel_client(config);
  const market = await DecibelClient.getBTCMarketMetadata();
  const price = await DecibelClient.getBTCPrice();
  const now = new Date();
  const candleHistory = await DecibelClient.getBTCHourlyCandlesticks(
    new Date(now.getTime() - CANDLE_LOOKBACK_MS),
    now,
    now,
  );
  const candles = createBTCCandlestickSummary(candleHistory);

  // Only public market data is emitted. Configuration and credentials are never logged.
  console.log(JSON.stringify({ network: config.network, market, price, candles }, null, 2));
}

startApplication().catch(() => {
  console.error('Unable to fetch Decibel BTC/USD market data');
  process.exitCode = 1;
});
