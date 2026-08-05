import 'dotenv/config';

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { readMainnetBTCBacktestDataset } from './backtest_data.js';
import { candlestick_repository } from './candlestick_repository.js';
import { loadConfig } from './config.js';
import { resolveCandlestickDatabasePath } from './database_path.js';
import { decibel_client } from './decibel_client.js';
import { createLogger } from './logger.js';
import { loadMarketStructureConfig } from './market_structure.js';
import { resolveMicrostructureDatabasePath } from './microstructure_database_path.js';
import { loadOpportunityScannerConfig, scanBTCOpportunities } from './opportunity_scanner.js';
import { buildResearchSamples, RESEARCH_WINDOWS_SECONDS } from './research_dataset.js';
import {
  resolveResearchDatabasePath,
  resolveResearchReportPath,
} from './research_database_path.js';
import { research_dataset_repository, research_source_repository } from './research_repository.js';
import { createResearchMarketMetadata } from './research_market_metadata.js';
import { buildBTCTimeframes } from './timeframe_aggregation.js';

function countBy<T extends string>(values: readonly T[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

async function run(): Promise<void> {
  const config = loadConfig();
  const ResearchLogger = createLogger(config.logFormat);
  const CandleRepository = new candlestick_repository(resolveCandlestickDatabasePath());
  const SourceRepository = new research_source_repository(resolveMicrostructureDatabasePath());
  const DatasetRepository = new research_dataset_repository(resolveResearchDatabasePath());
  const DecibelClient = new decibel_client(config);
  try {
    const dataset = readMainnetBTCBacktestDataset(CandleRepository, config.network);
    const normalizedMarket = await DecibelClient.getBTCMarketMetadata();
    if (normalizedMarket.marketAddress !== dataset.marketAddress)
      throw new Error(
        `Normalized BTC/USD market address ${normalizedMarket.marketAddress} does not match stored candle market ${dataset.marketAddress}`,
      );
    const candidates = scanBTCOpportunities(
      buildBTCTimeframes(dataset.candles),
      loadOpportunityScannerConfig(),
      loadMarketStructureConfig(),
    );
    const now = Date.now();
    if (!SourceRepository.getMarketAddresses().includes(dataset.marketAddress))
      throw new Error(
        `No microstructure data matches normalized BTC/USD market ${dataset.marketAddress}`,
      );
    const source = SourceRepository.loadSource(dataset.marketAddress, now);
    if (source.marketAddress !== dataset.marketAddress)
      throw new Error('Microstructure source market does not match the BTC/USD research market');
    const metadata = createResearchMarketMetadata(normalizedMarket, new Date(now));
    const samples = buildResearchSamples(candidates, dataset.candles, source, now);
    if (samples.some((sample) => sample.marketAddress !== metadata.marketAddress))
      throw new Error('Research candidate market does not match the normalized BTC/USD metadata');
    const metadataPersistence = DatasetRepository.saveMarketMetadata(metadata);
    const persistence = DatasetRepository.save(samples);
    const validByWindow = Object.fromEntries(
      RESEARCH_WINDOWS_SECONDS.map((seconds) => {
        const valid = samples.filter(
          (sample) => sample.features[String(seconds)]?.status === 'VALID',
        ).length;
        return [
          seconds,
          { validCount: valid, validRatio: samples.length === 0 ? 0 : valid / samples.length },
        ];
      }),
    );
    const outcomeCompleteCount = samples.filter((sample) => sample.outcomes.complete).length;
    const overlap = samples.filter((sample) =>
      Object.values(sample.features).some((feature) => feature.aggregateCoverageRatio > 0),
    ).length;
    const usable = samples
      .filter(
        (sample) =>
          sample.outcomes.complete &&
          Object.values(sample.features).every((feature) => feature.status === 'VALID'),
      )
      .map((sample) => sample.candidate.availableAtTime)
      .sort();
    const validOutcomeCompleteCount = usable.length;
    const report = {
      status: validOutcomeCompleteCount < 100 ? 'NOT_ENOUGH_DATA' : 'READY',
      featureVersion: samples[0]?.featureVersion ?? null,
      totalCandidateCount: samples.length,
      candidatesOverlappingMicrostructureData: overlap,
      validByWindow,
      outcomeCompleteCount,
      validOutcomeCompleteCount,
      distributionByCandidateType: countBy(samples.map((sample) => sample.candidate.candidateType)),
      distributionByDirection: countBy(samples.map((sample) => sample.candidate.direction)),
      distributionByRegime: countBy(samples.map((sample) => sample.candidate.regime)),
      earliestUsableDecisionTimestamp: usable[0] ?? null,
      latestUsableDecisionTimestamp: usable.at(-1) ?? null,
      persistence,
      marketMetadata: {
        marketAddress: metadata.marketAddress,
        metadataVersion: metadata.metadataVersion,
        observedAt: metadata.observedAt,
        persistence: metadataPersistence,
      },
    };
    const reportPath = resolveResearchReportPath();
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    ResearchLogger.info(
      {
        event: 'research_dataset_built',
        report,
        reportPath,
        databasePath: resolveResearchDatabasePath(),
      },
      `BTC/USD research dataset: ${report.status}`,
    );
  } finally {
    DatasetRepository.close();
    SourceRepository.close();
    CandleRepository.close();
    DecibelClient.closeWebSocket();
  }
}

try {
  await run();
} catch (error) {
  const Logger = createLogger('pretty');
  Logger.error(
    {
      event: 'research_dataset_failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    },
    'Unable to build BTC/USD research dataset',
  );
  process.exitCode = 1;
}
