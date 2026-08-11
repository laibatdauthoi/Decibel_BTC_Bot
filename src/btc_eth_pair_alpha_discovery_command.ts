import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import {
  AlphaDiscoverySamplingStrideBars,
  DiscoveryFeatureDefinitions,
  buildCachedShadowSamples,
  buildBucketRules,
  buildBTCEthRelativeDriftV1,
  buildBTCEthUtcSessionRelativeDriftV1,
  buildCausalRegimeStrengthPullbackV1,
  buildFrozenDirectionRegimePullbackHoldoutV1,
  buildRegimePullbackEntryV1,
  buildRegimePullbackTp3Sl3V1,
  buildRegimePersistence7d,
  buildTwoWeekConfirmedRegimePullbackV1,
  calculateAlphaFeatures,
  calculateBucketMetrics,
  calculatePairRatioSeries,
  rankRules,
  sampleEligibleIndices,
  simulateShadowCampaign,
} from './btc_eth_pair_alpha_discovery.js';
import { synchronizePairCandles, type pair_market } from './btc_eth_pair.js';
import { resolveCandlestickDatabasePath } from './database_path.js';
import type { BTC_candlestick } from './decibel_client.js';
import { resolveResearchDatabasePath } from './research_database_path.js';

type candle_row = {
  timestamp_ms: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
type group_row = { market_address: string; candle_count: number };
type metadata_row = {
  market_address: string;
  tick_size: number;
  lot_size: number;
  minimum_size: number;
  maximum_leverage: number;
};
type fee_config = { makerFeeRate: number; takerFeeRate: number };

const readCandles = (database: Database.Database, address: string): BTC_candlestick[] =>
  database
    .prepare<[string], candle_row>(
      "SELECT timestamp_ms,open,high,low,close,volume FROM candlesticks WHERE market_address=? AND interval='1m' ORDER BY timestamp_ms",
    )
    .all(address)
    .map((row) => ({ ...row, timestamp: new Date(row.timestamp_ms) }));

export function runBTCEthPairAlphaDiscoveryCommand(): void {
  const startedAt = performance.now(),
    root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    Candles = new Database(resolveCandlestickDatabasePath(), {
      readonly: true,
      fileMustExist: true,
    }),
    Research = new Database(resolveResearchDatabasePath(), { readonly: true, fileMustExist: true });
  try {
    const eth = Candles.prepare<[], { market_address: string }>(
        "SELECT market_address FROM candlestick_market_symbols WHERE symbol='ETH/USD'",
      ).get(),
      groups = Candles.prepare<[], group_row>(
        "SELECT market_address,COUNT(*) candle_count FROM candlesticks WHERE interval='1m' GROUP BY market_address ORDER BY candle_count DESC",
      ).all(),
      btc = groups.find((value) => value.market_address !== eth?.market_address);
    if (!eth || !btc) throw new Error('SYNCHRONIZED_BTC_ETH_ONE_MINUTE_MARKETS_UNAVAILABLE');
    const metadata = (address: string) =>
        Research.prepare<[string], metadata_row>(
          'SELECT market_address,tick_size,lot_size,minimum_size,maximum_leverage FROM research_market_metadata_snapshots WHERE market_address=? ORDER BY observed_at_ms DESC LIMIT 1',
        ).get(address),
      btcMetadata = metadata(btc.market_address),
      ethMetadata = metadata(eth.market_address);
    if (!btcMetadata || !ethMetadata) throw new Error('PAIR_MARKET_METADATA_UNAVAILABLE');
    const fees = JSON.parse(
        readFileSync(path.join(root, 'config', 'btc_eth_pair_v1.json'), 'utf8'),
      ) as fee_config,
      market = (value: metadata_row): pair_market => ({
        marketAddress: value.market_address,
        tickSize: value.tick_size,
        lotSize: value.lot_size,
        minimumSize: value.minimum_size,
        maximumLeverage: value.maximum_leverage,
        makerFeeRate: fees.makerFeeRate,
        takerFeeRate: fees.takerFeeRate,
      }),
      btcMarket = { ...market(btcMetadata), maximumLeverage: 40 },
      ethMarket = { ...market(ethMetadata), maximumLeverage: 25 },
      synchronized = synchronizePairCandles(
        readCandles(Candles, btc.market_address),
        readCandles(Candles, eth.market_address),
      ),
      sampledIndices = sampleEligibleIndices(
        synchronized.candles.length,
        20,
        AlphaDiscoverySamplingStrideBars,
      ),
      sampledRows = sampledIndices.flatMap((index) => {
        const features = calculateAlphaFeatures(synchronized.candles, index);
        return features
          ? [{ timestamp: synchronized.candles[index]!.timestamp.getTime(), features }]
          : [];
      }),
      indexByTimestamp = new Map(
        sampledIndices.map((index) => [synchronized.candles[index]!.timestamp.getTime(), index]),
      ),
      indexBySignalTimestamp = new Map(
        sampledIndices.map((index) => [
          synchronized.candles[index]!.timestamp.getTime() + 60_000,
          index,
        ]),
      ),
      splitIndex = Math.floor(sampledRows.length * 0.7),
      splitTimestamp = sampledRows[splitIndex]?.timestamp ?? null,
      cached = buildCachedShadowSamples({
        rows: sampledRows,
        evaluate: (timestamp, direction) =>
          simulateShadowCampaign({
            candles: synchronized.candles,
            signalIndex: indexByTimestamp.get(timestamp)!,
            direction,
            btcMarket,
            ethMarket,
            startingEquity: 30,
          }),
        onProgress: (completed, total) => console.log(`shadow outcomes: ${completed} / ${total}`),
      }),
      samples = cached.samples;
    console.log('aggregating feature buckets');
    const allRules = buildBucketRules(samples),
      rankedTop15 = rankRules(allRules),
      regimePersistence7d = buildRegimePersistence7d(
        samples,
        synchronized.candles.at(-1)!.timestamp.getTime(),
      ),
      ratioSeries = calculatePairRatioSeries(synchronized.candles),
      regimePullbackEntryV1 = buildRegimePullbackEntryV1({
        candles: synchronized.candles,
        samples,
        regime: regimePersistence7d,
        ratioSeries,
      }),
      regimePullbackTp3Sl3V1 = buildRegimePullbackTp3Sl3V1({
        samples,
        oneWeekPullback: regimePullbackEntryV1,
        evaluateExperiment: (timestamp, direction, exitPolicy) => {
          const signalIndex = indexBySignalTimestamp.get(timestamp);
          if (signalIndex === undefined) throw new Error('EXPERIMENT_SIGNAL_INDEX_UNAVAILABLE');
          return simulateShadowCampaign({
            candles: synchronized.candles,
            signalIndex,
            direction,
            btcMarket,
            ethMarket,
            startingEquity: 30,
            exitPolicy,
          });
        },
      }),
      twoWeekConfirmedRegimePullbackV1 = buildTwoWeekConfirmedRegimePullbackV1({
        candles: synchronized.candles,
        samples,
        regime: regimePersistence7d,
        oneWeekPullback: regimePullbackEntryV1,
        ratioSeries,
      }),
      frozenDirectionRegimePullbackHoldoutV1 = buildFrozenDirectionRegimePullbackHoldoutV1({
        samples,
        regime: regimePersistence7d,
        oneWeekPullback: regimePullbackEntryV1,
        splitTimestamp,
      }),
      causalRegimeStrengthPullbackV1 = buildCausalRegimeStrengthPullbackV1({
        samples,
        regime: regimePersistence7d,
        oneWeekPullback: regimePullbackEntryV1,
      }),
      btcEthRelativeDriftV1 = buildBTCEthRelativeDriftV1(synchronized.candles),
      btcEthUtcSessionRelativeDriftV1 = buildBTCEthUtcSessionRelativeDriftV1(synchronized.candles),
      baselines = Object.fromEntries(
        (['LONG_BTC_SHORT_ETH', 'SHORT_BTC_LONG_ETH'] as const).map((direction) => [
          direction,
          {
            discovery: calculateBucketMetrics(
              samples.filter(
                (sample) => sample.split === 'DISCOVERY' && sample.outcome.direction === direction,
              ),
            ),
            holdout: calculateBucketMetrics(
              samples.filter(
                (sample) => sample.split === 'HOLDOUT' && sample.outcome.direction === direction,
              ),
            ),
          },
        ]),
      ),
      report = {
        reportVersion: 'BTC_ETH_PAIR_ALPHA_DISCOVERY_V1',
        data: synchronized.data,
        split: { method: 'CHRONOLOGICAL_70_30', splitTimestamp },
        samplingStrideBars: AlphaDiscoverySamplingStrideBars,
        sampledTimestampCount: sampledRows.length,
        cachedShadowOutcomeCount: cached.cachedShadowOutcomeCount,
        featureDefinitions: DiscoveryFeatureDefinitions,
        frozenThresholds: { rangePosition: [0.25, 0.5, 0.75], volumeRatio: 1 },
        shadowCampaignAssumptions: {
          startingEquity: 30,
          btcMaxLeverage: 40,
          ethMaxLeverage: 25,
          pairLeverage: 25,
          independentCampaigns: true,
          overlappingCampaignsAllowed: true,
          portfolioEquityCurve: false,
          warning: 'OVERLAPPING_SHADOW_CAMPAIGNS_ARE_NOT_A_REALIZABLE_PORTFOLIO_BACKTEST',
        },
        unconditionalDirectionBaselines: baselines,
        allBucketRules: allRules,
        rankedTop15,
        regimePersistence7d,
        regimePullbackEntryV1,
        regimePullbackTp3Sl3V1,
        twoWeekConfirmedRegimePullbackV1,
        frozenDirectionRegimePullbackHoldoutV1,
        causalRegimeStrengthPullbackV1,
        btcEthRelativeDriftV1,
        btcEthUtcSessionRelativeDriftV1,
        conclusion: rankedTop15.some((value) => value.flag === 'PROMISING')
          ? 'SIMPLE_OHLCV_ENTRY_STATE_FOUND'
          : 'NO_SIMPLE_OHLCV_ENTRY_STATE_FOUND',
      },
      output = path.join(root, 'data', 'btc_price_action', 'btc_eth_pair_alpha_discovery_v1.json');
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.table(
      rankedTop15.map((value) => ({
        feature: value.feature,
        bucket: value.bucket,
        direction: value.direction,
        discoveryResolved: value.discovery.resolvedCount,
        discoveryTPRate: value.discovery.tpBeforeSlRate,
        discoveryGrossPF: value.discovery.grossProfitFactor,
        holdoutResolved: value.holdout.resolvedCount,
        holdoutTPRate: value.holdout.tpBeforeSlRate,
        holdoutGrossPF: value.holdout.grossProfitFactor,
        flag: value.flag,
      })),
    );
    console.table(
      regimePersistence7d.blocks.map((block) => ({
        Block: block.blockIndex,
        Start: new Date(block.startTimestamp).toISOString(),
        Winner: block.winner,
        'LONG GrossPF': block.directions.LONG_BTC_SHORT_ETH.grossProfitFactor,
        'SHORT GrossPF': block.directions.SHORT_BTC_LONG_ETH.grossProfitFactor,
        'LONG TP rate': block.directions.LONG_BTC_SHORT_ETH.tpBeforeSlRate,
        'SHORT TP rate': block.directions.SHORT_BTC_LONG_ETH.tpBeforeSlRate,
      })),
    );
    console.table(
      regimePersistence7d.causalTransitions.map((transition) => ({
        'Source block': transition.sourceBlockIndex,
        'Predicted direction': transition.predictedDirection,
        'Target block': transition.targetBlockIndex,
        'Persisted?': transition.directionPersisted,
        'Target TP rate': transition.targetDirectionTPRate,
        'Target GrossPF': transition.targetDirectionGrossPF,
      })),
    );
    console.log(
      JSON.stringify({
        predictionCount: regimePersistence7d.summary?.predictionCount ?? 0,
        directionPersistenceRate: regimePersistence7d.summary?.directionPersistenceRate ?? null,
        causalRegimeTPBeforeSLRate: regimePersistence7d.summary?.causalRegimeTPBeforeSLRate ?? null,
        causalRegimeGrossProfitFactor:
          regimePersistence7d.summary?.causalRegimeGrossProfitFactor ?? null,
        causalRegimeNetProfitFactor:
          regimePersistence7d.summary?.causalRegimeNetProfitFactor ?? null,
        classification:
          regimePersistence7d.summary?.classification ?? 'NO_USEFUL_7D_REGIME_PERSISTENCE',
      }),
    );
    console.log('=== BTC/ETH RELATIVE DRIFT ===');
    console.log(
      JSON.stringify({
        'First timestamp': btcEthRelativeDriftV1.dataRange?.firstTimestamp ?? null,
        'Last timestamp': btcEthRelativeDriftV1.dataRange?.lastTimestamp ?? null,
        'Start BTC/ETH ratio': btcEthRelativeDriftV1.fullPeriod?.firstBTCETHRatio ?? null,
        'End BTC/ETH ratio': btcEthRelativeDriftV1.fullPeriod?.lastBTCETHRatio ?? null,
        'Full-period relative return':
          btcEthRelativeDriftV1.fullPeriod?.fullPeriodRelativeReturn ?? null,
      }),
    );
    console.table(
      btcEthRelativeDriftV1.horizons.map((horizon) => ({
        Horizon: `${horizon.horizonDays}d`,
        'Overall Windows': horizon.overall.windowCount,
        'Overall Positive %': (horizon.overall.positiveRate ?? 0) * 100,
        'Overall Median %': (horizon.overall.medianRelativeReturn ?? 0) * 100,
        'Discovery Positive %': (horizon.discovery.positiveRate ?? 0) * 100,
        'Discovery Median %': (horizon.discovery.medianRelativeReturn ?? 0) * 100,
        'Holdout Windows': horizon.holdout.windowCount,
        'Holdout Positive %': (horizon.holdout.positiveRate ?? 0) * 100,
        'Holdout Median %': (horizon.holdout.medianRelativeReturn ?? 0) * 100,
        'Direction Consistent': horizon.directionConsistent,
        'Bias Label': horizon.biasStrengthLabel,
      })),
    );
    console.log(JSON.stringify({ Conclusion: btcEthRelativeDriftV1.conclusion }));
    console.log('=== BTC/ETH UTC SESSION RELATIVE DRIFT ===');
    console.table(
      Object.entries(btcEthUtcSessionRelativeDriftV1.sessions).map(([label, session]) => ({
        Session: label,
        'Overall N': session.overall.sessionCount,
        'Overall Positive %': (session.overall.positiveRate ?? 0) * 100,
        'Overall Median %': (session.overall.medianRelativeReturn ?? 0) * 100,
        'Discovery N': session.discovery.sessionCount,
        'Discovery Direction': session.discoveryDirection,
        'Discovery Hit %':
          ((session.discovery.medianRelativeReturn ?? 0) >= 0
            ? (session.discovery.positiveRate ?? 0)
            : (session.discovery.negativeRate ?? 0)) * 100,
        'Discovery Median %': (session.discovery.medianRelativeReturn ?? 0) * 100,
        'Holdout N': session.holdout.sessionCount,
        'Holdout Direction': session.holdoutDirection,
        'Holdout Hit %':
          ((session.holdout.medianRelativeReturn ?? 0) >= 0
            ? (session.holdout.positiveRate ?? 0)
            : (session.holdout.negativeRate ?? 0)) * 100,
        'Holdout Median %': (session.holdout.medianRelativeReturn ?? 0) * 100,
        Consistent: session.directionConsistent,
        'Bias Label': session.biasStrengthLabel,
      })),
    );
    console.log(
      JSON.stringify({
        'Incomplete sessions': btcEthUtcSessionRelativeDriftV1.incompleteSessionCount,
        'Cross-boundary sessions': btcEthUtcSessionRelativeDriftV1.crossBoundarySessionCount,
        'DISCOVERY median-return ranking': btcEthUtcSessionRelativeDriftV1.discoverySessionRanking,
        'HOLDOUT median-return ranking': btcEthUtcSessionRelativeDriftV1.holdoutSessionRanking,
        Classification: btcEthUtcSessionRelativeDriftV1.classification,
      }),
    );
    console.log('=== CAUSAL WEEKLY REGIME STRENGTH + PULLBACK ===');
    console.table(
      Object.entries(causalRegimeStrengthPullbackV1.overallByStrengthBucket).map(
        ([bucket, value]) => ({
          'Strength Bucket': bucket,
          Blocks: value.targetBlockCount,
          Signals: value.signalCount,
          Resolved: value.resolvedCount,
          'TP Rate': value.tpBeforeSlRate,
          GrossPF: value.grossProfitFactor,
          NetPF: value.netProfitFactor,
        }),
      ),
    );
    console.table(
      Object.entries(causalRegimeStrengthPullbackV1.holdoutByStrengthBucket).map(
        ([bucket, value]) => ({
          'Strength Bucket': bucket,
          Signals: value.sampleCount,
          Resolved: value.resolvedCount,
          'TP Rate': value.tpBeforeSlRate,
          GrossPF: value.grossProfitFactor,
          NetPF: value.netProfitFactor,
        }),
      ),
    );
    console.log(
      JSON.stringify({
        'GrossPF non-decreasing': causalRegimeStrengthPullbackV1.monotonicity.grossPFNonDecreasing,
        'TP rate non-decreasing': causalRegimeStrengthPullbackV1.monotonicity.tpRateNonDecreasing,
        Classification: causalRegimeStrengthPullbackV1.classification,
      }),
    );
    console.log('=== WEEKLY REGIME + 2-BAR PULLBACK TURN ===');
    console.log(
      JSON.stringify({
        'eligible sampled timestamps': regimePullbackEntryV1.eligibleRegimeSampledTimestampCount,
        signals: regimePullbackEntryV1.signalCount,
        'signal rate': regimePullbackEntryV1.signalRate,
        resolved: regimePullbackEntryV1.aggregate.resolvedCount,
        'TP rate': regimePullbackEntryV1.aggregate.tpBeforeSlRate,
        GrossPF: regimePullbackEntryV1.aggregate.grossProfitFactor,
        NetPF: regimePullbackEntryV1.aggregate.netProfitFactor,
        'mean holding bars': regimePullbackEntryV1.aggregate.meanHoldingBars,
        'Regime-only GrossPF':
          regimePullbackEntryV1.regimeOnlyComparison.regimeOnlyGrossProfitFactor,
        'Pullback GrossPF': regimePullbackEntryV1.aggregate.grossProfitFactor,
        'Opposite-at-same-signals GrossPF':
          regimePullbackEntryV1.oppositeDirectionComparison.oppositeDirectionGrossProfitFactor,
      }),
    );
    console.table(
      Object.entries(regimePullbackEntryV1.byAllowedDirection).map(([direction, value]) => ({
        'Allowed Direction': direction,
        Signals: value.sampleCount,
        Resolved: value.resolvedCount,
        'TP Rate': value.tpBeforeSlRate,
        GrossPF: value.grossProfitFactor,
        NetPF: value.netProfitFactor,
      })),
    );
    console.log(JSON.stringify({ classification: regimePullbackEntryV1.classification }));
    console.log('=== REGIME + PULLBACK EXIT EXPERIMENT: TP3C / SL3C ===');
    const exitComparisonRows = (
      baseline: typeof regimePullbackTp3Sl3V1.baselineSameSignalsOverall,
      experiment: typeof regimePullbackTp3Sl3V1.overall,
    ) => [
      {
        Metric: 'Resolved',
        TP1_5C_SL3C: baseline.resolvedCount,
        TP3C_SL3C: experiment.resolvedCount,
      },
      {
        Metric: 'TP rate',
        TP1_5C_SL3C: baseline.tpBeforeSlRate,
        TP3C_SL3C: experiment.tpBeforeSlRate,
      },
      {
        Metric: 'GrossPF',
        TP1_5C_SL3C: baseline.grossProfitFactor,
        TP3C_SL3C: experiment.grossProfitFactor,
      },
      {
        Metric: 'NetPF',
        TP1_5C_SL3C: baseline.netProfitFactor,
        TP3C_SL3C: experiment.netProfitFactor,
      },
      {
        Metric: 'Gross PnL',
        TP1_5C_SL3C: baseline.grossPairPnLSum,
        TP3C_SL3C: experiment.grossPairPnLSum,
      },
      {
        Metric: 'Net PnL',
        TP1_5C_SL3C: baseline.netPairPnLSum,
        TP3C_SL3C: experiment.netPairPnLSum,
      },
      {
        Metric: 'Mean holding bars',
        TP1_5C_SL3C: baseline.meanHoldingBars,
        TP3C_SL3C: experiment.meanHoldingBars,
      },
      {
        Metric: 'Unresolved',
        TP1_5C_SL3C: baseline.unresolvedCount,
        TP3C_SL3C: experiment.unresolvedCount,
      },
    ];
    console.log('OVERALL');
    console.table(
      exitComparisonRows(
        regimePullbackTp3Sl3V1.baselineSameSignalsOverall,
        regimePullbackTp3Sl3V1.overall,
      ),
    );
    console.log('HOLDOUT');
    console.table(
      exitComparisonRows(
        regimePullbackTp3Sl3V1.baselineSameSignalsHoldout,
        regimePullbackTp3Sl3V1.holdout,
      ),
    );
    console.log(
      JSON.stringify({
        'Old +1.5C TP count': regimePullbackTp3Sl3V1.oldTPContinuationDiagnostic.oldTPCount,
        'Continued to +3C TP':
          regimePullbackTp3Sl3V1.oldTPContinuationDiagnostic.laterReached3CTPCount,
        'Fell to -3C SL': regimePullbackTp3Sl3V1.oldTPContinuationDiagnostic.laterHit3CSLCount,
        'Old TP to +3C rate': regimePullbackTp3Sl3V1.oldTPContinuationDiagnostic.oldTPTo3CTPRate,
      }),
    );
    console.table(
      Object.entries(regimePullbackTp3Sl3V1.byDirection).map(([direction, value]) => ({
        Direction: direction,
        Signals: value.holdout.sampleCount,
        Resolved: value.holdout.resolvedCount,
        'TP Rate': value.holdout.tpBeforeSlRate,
        GrossPF: value.holdout.grossProfitFactor,
        NetPF: value.holdout.netProfitFactor,
        'Mean holding bars': value.holdout.meanHoldingBars,
      })),
    );
    console.log(JSON.stringify({ Classification: regimePullbackTp3Sl3V1.classification }));
    console.log('=== TWO-WEEK CONFIRMED REGIME + PULLBACK ===');
    console.log(
      JSON.stringify({
        'target blocks evaluated': twoWeekConfirmedRegimePullbackV1.totalTargetBlocksEvaluated,
        'confirmed regime blocks': twoWeekConfirmedRegimePullbackV1.confirmedRegimeBlockCount,
        'no-confirmed-regime blocks': twoWeekConfirmedRegimePullbackV1.noConfirmedRegimeBlockCount,
        'eligible sampled timestamps':
          twoWeekConfirmedRegimePullbackV1.eligibleConfirmedRegimeSampledTimestampCount,
        signals: twoWeekConfirmedRegimePullbackV1.signalCount,
        'signal rate': twoWeekConfirmedRegimePullbackV1.signalRate,
        resolved: twoWeekConfirmedRegimePullbackV1.aggregate.resolvedCount,
        'TP rate': twoWeekConfirmedRegimePullbackV1.aggregate.tpBeforeSlRate,
        GrossPF: twoWeekConfirmedRegimePullbackV1.aggregate.grossProfitFactor,
        NetPF: twoWeekConfirmedRegimePullbackV1.aggregate.netProfitFactor,
        'One-week pullback GrossPF':
          twoWeekConfirmedRegimePullbackV1.oneWeekPullbackComparison
            .oneWeekPullbackGrossProfitFactor,
        'Two-week pullback GrossPF': twoWeekConfirmedRegimePullbackV1.aggregate.grossProfitFactor,
        'Confirmed-regime-only GrossPF':
          twoWeekConfirmedRegimePullbackV1.confirmedRegimeOnlyComparison
            .confirmedRegimeOnlyGrossProfitFactor,
        'Opposite-at-same-signals GrossPF':
          twoWeekConfirmedRegimePullbackV1.oppositeDirectionComparison
            .oppositeDirectionGrossProfitFactor,
      }),
    );
    console.table(
      Object.entries(twoWeekConfirmedRegimePullbackV1.byAllowedDirection).map(
        ([direction, value]) => ({
          'Allowed Direction': direction,
          Signals: value.sampleCount,
          Resolved: value.resolvedCount,
          'TP Rate': value.tpBeforeSlRate,
          GrossPF: value.grossProfitFactor,
          NetPF: value.netProfitFactor,
        }),
      ),
    );
    console.table(twoWeekConfirmedRegimePullbackV1.byTargetBlock);
    console.log(
      JSON.stringify({ classification: twoWeekConfirmedRegimePullbackV1.classification }),
    );
    console.log('=== FROZEN DIRECTION HOLDOUT TEST ===');
    console.log(
      JSON.stringify({
        'LONG discovery resolved':
          frozenDirectionRegimePullbackHoldoutV1.discoveryDirectionMetrics.LONG_BTC_SHORT_ETH
            .resolvedCount,
        'LONG discovery GrossPF':
          frozenDirectionRegimePullbackHoldoutV1.discoveryDirectionMetrics.LONG_BTC_SHORT_ETH
            .grossProfitFactor,
        'LONG discovery TP rate':
          frozenDirectionRegimePullbackHoldoutV1.discoveryDirectionMetrics.LONG_BTC_SHORT_ETH
            .tpBeforeSlRate,
        'SHORT discovery resolved':
          frozenDirectionRegimePullbackHoldoutV1.discoveryDirectionMetrics.SHORT_BTC_LONG_ETH
            .resolvedCount,
        'SHORT discovery GrossPF':
          frozenDirectionRegimePullbackHoldoutV1.discoveryDirectionMetrics.SHORT_BTC_LONG_ETH
            .grossProfitFactor,
        'SHORT discovery TP rate':
          frozenDirectionRegimePullbackHoldoutV1.discoveryDirectionMetrics.SHORT_BTC_LONG_ETH
            .tpBeforeSlRate,
        'Frozen preferred direction':
          frozenDirectionRegimePullbackHoldoutV1.frozenPreferredDirection,
        'accepted signals':
          frozenDirectionRegimePullbackHoldoutV1.holdoutSignalFrequency.holdoutAcceptedSignalCount,
        resolved: frozenDirectionRegimePullbackHoldoutV1.holdoutAggregate.resolvedCount,
        'TP rate': frozenDirectionRegimePullbackHoldoutV1.holdoutAggregate.tpBeforeSlRate,
        GrossPF: frozenDirectionRegimePullbackHoldoutV1.holdoutAggregate.grossProfitFactor,
        NetPF: frozenDirectionRegimePullbackHoldoutV1.holdoutAggregate.netProfitFactor,
        'Unfiltered holdout GrossPF':
          frozenDirectionRegimePullbackHoldoutV1.unfilteredHoldoutComparison
            .unfilteredHoldoutGrossProfitFactor,
        'Frozen-direction regime-only GrossPF':
          frozenDirectionRegimePullbackHoldoutV1.frozenDirectionRegimeOnlyComparison
            .frozenDirectionRegimeOnlyGrossProfitFactor,
        'Frozen-direction + pullback GrossPF':
          frozenDirectionRegimePullbackHoldoutV1.holdoutAggregate.grossProfitFactor,
        'Opposite-at-same-signals GrossPF':
          frozenDirectionRegimePullbackHoldoutV1.oppositeDirectionComparison
            .oppositeGrossProfitFactor,
        classification: frozenDirectionRegimePullbackHoldoutV1.classification,
      }),
    );
    console.log(
      JSON.stringify({
        conclusion: report.conclusion,
        output,
        sampledTimestamps: sampledRows.length,
        cachedShadowOutcomes: cached.cachedShadowOutcomeCount,
        featureAggregationCount: allRules.length,
        elapsedSeconds: (performance.now() - startedAt) / 1_000,
      }),
    );
  } finally {
    Research.close();
    Candles.close();
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    runBTCEthPairAlphaDiscoveryCommand();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unknown alpha discovery failure');
    process.exitCode = 1;
  }
}
