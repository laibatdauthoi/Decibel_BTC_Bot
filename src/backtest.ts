import 'dotenv/config';

import { resolve } from 'node:path';

import {
  backtesting_engine,
  type backtest_strategy,
  type strategy_context,
} from './backtesting_engine.js';
import { candlestick_repository } from './candlestick_repository.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';

let BacktestLogger = createLogger('pretty');

class buy_and_hold_strategy implements backtest_strategy {
  evaluate(context: strategy_context): 'LONG' | 'HOLD' {
    return context.candles.length === 1 ? 'LONG' : 'HOLD';
  }
}

function runBacktest(): void {
  const config = loadConfig();
  BacktestLogger = createLogger(config.logFormat);
  const CandlestickRepository = new candlestick_repository(
    resolve('data', 'btc_usd_candlesticks.sqlite'),
  );
  try {
    const marketAddresses = CandlestickRepository.getMarketAddresses('5m');
    if (marketAddresses.length !== 1) {
      throw new Error('Backtest requires exactly one stored BTC/USD 5m market address');
    }
    const marketAddress = marketAddresses[0];
    if (marketAddress === undefined) throw new Error('No BTC/USD 5m candles are stored');
    const candles = CandlestickRepository.getCandlesticks(marketAddress, '5m');
    const BacktestEngine = new backtesting_engine({
      startingEquity: 10_000,
      makerFeeRate: 0.0002,
      takerFeeRate: 0.0005,
      slippageRate: 0.0005,
      leverage: 2,
      positionRisk: 0.01,
      stopLossRate: 0.01,
      takeProfitRate: 0.02,
    });
    const result = BacktestEngine.run(candles, new buy_and_hold_strategy());
    BacktestLogger.info(
      { event: 'backtest_complete', marketAddress, candleCount: candles.length, ...result },
      'BTC/USD 5m backtest completed',
    );
  } finally {
    CandlestickRepository.close();
  }
}

try {
  runBacktest();
} catch {
  BacktestLogger.error({ event: 'backtest_failed' }, 'Unable to run BTC/USD backtest');
  process.exitCode = 1;
}
