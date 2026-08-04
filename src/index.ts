import 'dotenv/config';

import { loadConfig } from './config.js';
import { decibel_client } from './decibel_client.js';

async function startApplication(): Promise<void> {
  const config = loadConfig();
  const DecibelClient = new decibel_client(config);
  const market = await DecibelClient.getBTCMarketMetadata();
  const price = await DecibelClient.getBTCPrice();

  // Only public market data is emitted. Configuration and credentials are never logged.
  console.log(JSON.stringify({ network: config.network, market, price }, null, 2));
}

startApplication().catch(() => {
  console.error('Unable to fetch Decibel BTC/USD market data');
  process.exitCode = 1;
});
