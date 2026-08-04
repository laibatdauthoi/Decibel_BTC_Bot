import 'dotenv/config';

import { getBacktestFailureDiagnostics, readMainnetBTCBacktestDataset } from './backtest_data.js';
import { candlestick_repository } from './candlestick_repository.js';
import { loadConfig } from './config.js';
import { resolveCandlestickDatabasePath } from './database_path.js';
import { createLogger } from './logger.js';
import { loadMarketStructureConfig } from './market_structure.js';
import {
  analyzeOpportunityOutcomes,
  loadOpportunityOutcomeConfig,
  type opportunity_outcome_analysis,
  type outcome_group,
} from './opportunity_outcomes.js';
import { loadOpportunityScannerConfig, scanBTCOpportunities } from './opportunity_scanner.js';
import { buildBTCTimeframes } from './timeframe_aggregation.js';

let AnalysisLogger = createLogger('pretty');

function selectTwelveBarGroups(groups: readonly outcome_group[]): outcome_group[] {
  return groups.filter((group) => group.horizonBars === 12 && group.zeroCost.sampleCount > 0);
}

function compactGroup(group: outcome_group): object {
  const compactMetrics = (metrics: outcome_group['zeroCost']) => ({
    hitRate: metrics.hitRate,
    averageReturn: metrics.averageReturn,
    medianReturn: metrics.medianReturn,
    expectancy: metrics.expectancy,
  });
  return {
    group: group.group,
    horizonBars: group.horizonBars,
    sampleCount: group.zeroCost.sampleCount,
    averageMFE: group.zeroCost.averageMFE,
    averageMAE: group.zeroCost.averageMAE,
    zeroCost: compactMetrics(group.zeroCost),
    maker: compactMetrics(group.maker),
    takerWithSlippage: compactMetrics(group.takerWithSlippage),
  };
}

function summarizeAnalysis(analysis: opportunity_outcome_analysis): object {
  return {
    historicalCandidateCount: analysis.historicalCandidateCount,
    analyzedCandidateCount: analysis.analyzedCandidateCount,
    excludedInsufficientFutureCount: analysis.excludedInsufficientFutureCount,
    feeAssumptions: analysis.feeAssumptions,
    overlappingClusters: analysis.overlappingClusters,
    results: {
      candidateTypeAt12Bars: selectTwelveBarGroups(analysis.groupedResults.candidateType).map(
        compactGroup,
      ),
      directionAt12Bars: selectTwelveBarGroups(analysis.groupedResults.direction).map(compactGroup),
      regimeAt12Bars: selectTwelveBarGroups(analysis.groupedResults.regime).map(compactGroup),
      scoreBandAt12Bars: selectTwelveBarGroups(analysis.groupedResults.scoreBand).map(compactGroup),
      holdingHorizons: analysis.groupedResults.holdingHorizon.map(compactGroup),
    },
    cooldownResults: analysis.cooldownResults.map((cooldown) => ({
      cooldownMinutes: cooldown.cooldownMinutes,
      selectedCandidateCount: cooldown.selectedCandidateCount,
      horizonResults: cooldown.horizonResults.map(compactGroup),
    })),
  };
}

function runAnalysis(): void {
  const config = loadConfig();
  const scannerConfig = loadOpportunityScannerConfig();
  const structureConfig = loadMarketStructureConfig();
  const outcomeConfig = loadOpportunityOutcomeConfig();
  AnalysisLogger = createLogger(config.logFormat);
  const databasePath = resolveCandlestickDatabasePath();
  const Repository = new candlestick_repository(databasePath);
  try {
    const dataset = readMainnetBTCBacktestDataset(Repository, config.network);
    const timeframes = buildBTCTimeframes(dataset.candles);
    const candidates = scanBTCOpportunities(timeframes, scannerConfig, structureConfig);
    const analysis = analyzeOpportunityOutcomes(timeframes['5m'], candidates, outcomeConfig);
    AnalysisLogger.info(
      {
        event: 'opportunity_outcomes_complete',
        marketAddress: dataset.marketAddress,
        ...summarizeAnalysis(analysis),
      },
      'BTC/USD opportunity outcomes analyzed',
    );
  } catch (error) {
    AnalysisLogger.error(
      {
        event: 'opportunity_outcomes_failed',
        ...getBacktestFailureDiagnostics(Repository, databasePath),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Unable to analyze BTC/USD opportunity outcomes',
    );
    throw error;
  } finally {
    Repository.close();
  }
}

try {
  runAnalysis();
} catch {
  process.exitCode = 1;
}
