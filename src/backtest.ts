import 'dotenv/config';

import { getBacktestFailureDiagnostics, readMainnetBTCBacktestDataset } from './backtest_data.js';
import {
  backtesting_engine,
  type backtest_config,
  type backtest_result,
} from './backtesting_engine.js';
import { candlestick_repository } from './candlestick_repository.js';
import { loadConfig } from './config.js';
import { resolveCandlestickDatabasePath } from './database_path.js';
import { ema_trend_strategy, loadBacktestCommandConfig } from './ema_trend_strategy.js';
import { createLogger } from './logger.js';

let BacktestLogger = createLogger('pretty');

function summarizeCostScenario(result: backtest_result): object {
  return {
    netReturn: result.netReturn,
    grossReturnBeforeCosts: result.grossReturnBeforeCosts,
    tradingFeeCost: result.tradingFeeCost,
    slippageCost: result.slippageCost,
    maximumDrawdown: result.maximumDrawdown,
    endingEquity: result.endingEquity,
    tradeCount: result.trades.length,
  };
}

function runBacktest(): void {
  const applicationConfig = loadConfig();
  const strategyConfig = loadBacktestCommandConfig();
  BacktestLogger = createLogger(applicationConfig.logFormat);
  const databasePath = resolveCandlestickDatabasePath();
  const CandlestickRepository = new candlestick_repository(databasePath);
  try {
    const { marketAddress, candles } = readMainnetBTCBacktestDataset(
      CandlestickRepository,
      applicationConfig.network,
    );
    const engineConfig: backtest_config = {
      startingEquity: 10_000,
      makerFeeRate: 0.0002,
      takerFeeRate: 0.0005,
      slippageRate: 0.0005,
      leverage: 2,
      positionRisk: 0.01,
      stopLossRate: 0.01,
      takeProfitRate: 0.02,
    };
    const BacktestEngine = new backtesting_engine(engineConfig);
    const EMATrendStrategy = new ema_trend_strategy(strategyConfig);
    const result = BacktestEngine.run(candles, EMATrendStrategy);
    const { trades, ...summary } = result;
    const zeroCostResult = new backtesting_engine({
      ...engineConfig,
      makerFeeRate: 0,
      takerFeeRate: 0,
      slippageRate: 0,
    }).run(candles, new ema_trend_strategy(strategyConfig));
    const doubledCostResult = new backtesting_engine({
      ...engineConfig,
      makerFeeRate: engineConfig.makerFeeRate * 2,
      takerFeeRate: engineConfig.takerFeeRate * 2,
      slippageRate: engineConfig.slippageRate * 2,
    }).run(candles, new ema_trend_strategy(strategyConfig));

    BacktestLogger.info(
      {
        event: 'backtest_complete',
        network: 'mainnet',
        marketAddress,
        candleCount: candles.length,
        strategyParameters: EMATrendStrategy.config,
        engineParameters: engineConfig,
        tradeCount: trades.length,
        costScenarios: {
          zero: summarizeCostScenario(zeroCostResult),
          configured: summarizeCostScenario(result),
          doubled: summarizeCostScenario(doubledCostResult),
        },
        ...summary,
      },
      'BTC/USD 5m EMA trend backtest completed',
    );
    if (strategyConfig.verbose) {
      trades.forEach((trade, index) => {
        BacktestLogger.info(
          { event: 'backtest_trade', tradeNumber: index + 1, ...trade },
          'Backtest trade',
        );
      });
    }
  } catch (error) {
    BacktestLogger.error(
      {
        event: 'backtest_data_failed',
        ...getBacktestFailureDiagnostics(CandlestickRepository, databasePath),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Unable to read BTC/USD backtest candles',
    );
    throw error;
  } finally {
    CandlestickRepository.close();
  }
}

try {
  runBacktest();
} catch (error) {
  BacktestLogger.error(
    { event: 'backtest_failed', error: error instanceof Error ? error.message : 'Unknown error' },
    'Unable to run BTC/USD backtest',
  );
  process.exitCode = 1;
}
