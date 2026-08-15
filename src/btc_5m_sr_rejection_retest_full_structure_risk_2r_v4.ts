import type { price_candle } from './btc_bybit_decibel_overlap_audit.js';
import {
  applySwingReaction,
  breakZonesAtCompleted5mClose,
  buildExact5mBars,
  ConfirmedSwingSRRules,
  getConfirmedSwingReactions,
  resolveExitTouches,
  type five_minute_bar,
  type reaction_zone,
  type trade_side,
} from './btc_5m_confirmed_swing_sr_zone_limit_state_machine.js';
import {
  isRetestTouched,
  selectRejectionCandidate,
  type rejection_progress,
} from './btc_5m_confirmed_swing_sr_rejection_retest_limit_state_machine.js';
import { applyExternalDepositIfRequired, type external_deposit_event } from './btc_eth_pair.js';
import {
  isFixedRiskRetestPassive,
  sizeFixedRiskPosition,
  type fixed_risk_sizing,
} from './btc_5m_sr_rejection_retest_fixed_risk_2r_v2.js';

const minute = 60_000;
const fiveMinutes = 5 * minute;
const day = 86_400_000;

export const FullStructureRiskRules = {
  ...ConfirmedSwingSRRules,
  experimentId: 'BTC_5M_SR_REJECTION_RETEST_FULL_STRUCTURE_RISK_2R_V4' as const,
  retestWindowBars: 1,
  startingEquityUsd: 30,
  riskFraction: 0.005,
  targetRMultiple: 2,
  emergencyBufferRMultiple: 10,
  minimumCompletedTradeCount: 500,
  minimumCompletedTradesPerUtcDay: 5,
};

export type full_structure_risk_state =
  'FLAT' | 'WAITING_RETEST_SHORT' | 'WAITING_RETEST_LONG' | 'OPEN_SHORT' | 'OPEN_LONG';

type full_structure_risk_campaign = {
  side: trade_side;
  zone: reaction_zone;
  signalTimestamp: number;
  entryPrice: number;
  rejection5mOpen: number;
  rejection5mHigh: number;
  rejection5mLow: number;
  rejection5mClose: number;
  existingClusterStructuralExtreme: number;
};

export type full_structure_risk_trade = {
  side: trade_side;
  signalTimestamp: number;
  entryTimestamp: number;
  exitTimestamp: number;
  entryPrice: number;
  exitPrice: number;
  entryZoneId: number;
  entryZoneLower: number;
  entryZoneUpper: number;
  zoneLower: number;
  zoneUpper: number;
  rejection5mOpen: number;
  rejection5mHigh: number;
  rejection5mLow: number;
  rejection5mClose: number;
  existingClusterStructuralExtreme: number;
  tradeStructuralAnchor: number;
  rPrice: number;
  targetPrice: number;
  emergencyStopPrice: number;
  emergencyDistanceFromEntryInR: number;
  zoneWidthREquivalent: number;
  rejectionRiskEquivalent: number;
  outcome:
    'TAKE_PROFIT' | 'NORMAL_INVALIDATION_EXIT_TAKER' | 'EMERGENCY_STOP' | 'SEGMENT_BOUNDARY_EXIT';
  invalidationTimestamp: number | null;
  equityBeforeTrade: number;
  riskTargetUsd: number;
  targetNotionalUsd: number;
  actualNotionalUsd: number;
  actualGrossRiskUsd: number;
  actualRiskPctOfEquity: number;
  riskCappedByLeverage: boolean;
  entryFeeUsd: number;
  exitFeeUsd: number;
  totalFeeUsd: number;
  feeUsdPerActualGrossRisk: number;
  grossPnlUsd: number;
  netPnlUsd: number;
  grossR: number;
  netR: number;
  holdingMinutes: number;
};

type open_position = Omit<
  full_structure_risk_trade,
  | 'exitTimestamp'
  | 'exitPrice'
  | 'outcome'
  | 'exitFeeUsd'
  | 'totalFeeUsd'
  | 'feeUsdPerActualGrossRisk'
  | 'grossPnlUsd'
  | 'netPnlUsd'
  | 'grossR'
  | 'netR'
  | 'holdingMinutes'
> & { normalExitExecutionTimestamp: number | null };

function cloneZone(zone: reaction_zone): reaction_zone {
  return { ...zone, sourceSwingRanges: [...zone.sourceSwingRanges] };
}

export function getFullStructureRiskGeometry(input: {
  side: trade_side;
  zone: reaction_zone;
  existingClusterStructuralExtreme: number;
  rejection5mLow: number;
  rejection5mHigh: number;
}) {
  const entryPrice = input.side === 'LONG' ? input.zone.upper : input.zone.lower;
  const tradeStructuralAnchor =
    input.side === 'LONG'
      ? Math.min(input.existingClusterStructuralExtreme, input.rejection5mLow)
      : Math.max(input.existingClusterStructuralExtreme, input.rejection5mHigh);
  const rPrice =
    input.side === 'LONG' ? entryPrice - tradeStructuralAnchor : tradeStructuralAnchor - entryPrice;
  if (!(rPrice > 0)) return null;
  const targetPrice =
    input.side === 'LONG'
      ? entryPrice + FullStructureRiskRules.targetRMultiple * rPrice
      : entryPrice - FullStructureRiskRules.targetRMultiple * rPrice;
  const emergencyStopPrice =
    input.side === 'LONG'
      ? tradeStructuralAnchor - FullStructureRiskRules.emergencyBufferRMultiple * rPrice
      : tradeStructuralAnchor + FullStructureRiskRules.emergencyBufferRMultiple * rPrice;
  return {
    entryPrice,
    existingClusterStructuralExtreme: input.existingClusterStructuralExtreme,
    tradeStructuralAnchor,
    rPrice,
    targetPrice,
    emergencyStopPrice,
    emergencyDistanceFromEntryInR: Math.abs(emergencyStopPrice - entryPrice) / rPrice,
  };
}

export function getClusterStructuralExtreme(zone: reaction_zone) {
  if (zone.sourceSwingRanges.length === 0) return null;
  return zone.type === 'SUPPORT'
    ? Math.min(...zone.sourceSwingRanges.map((range) => range.low))
    : Math.max(...zone.sourceSwingRanges.map((range) => range.high));
}

export function isFullStructureRiskPositionInvalid(
  side: trade_side,
  close: number,
  tradeStructuralAnchor: number,
) {
  return side === 'LONG' ? close < tradeStructuralAnchor : close > tradeStructuralAnchor;
}

function calculatePnl(side: trade_side, notional: number, entry: number, exit: number) {
  return side === 'LONG' ? notional * (exit / entry - 1) : notional * (entry / exit - 1);
}

export function simulateFullStructureRiskSegment(input: {
  bars: readonly five_minute_bar[];
  startTimestamp: number;
  endExclusiveTimestamp: number;
  makerFeeRate: number;
  takerFeeRate: number;
  maximumLeverage: number;
  onProgress?: (progress: rejection_progress) => void;
}) {
  const bars = input.bars.filter(
    (bar) =>
      bar.timestamp >= input.startTimestamp &&
      bar.timestamp + fiveMinutes <= input.endExclusiveTimestamp,
  );
  const zones: reaction_zone[] = [];
  let activeSupportZones: reaction_zone[] = [];
  let activeResistanceZones: reaction_zone[] = [];
  const trades: full_structure_risk_trade[] = [];
  const externalDeposits: external_deposit_event[] = [];
  let nextZoneId = 1;
  let state: full_structure_risk_state = 'FLAT';
  let campaign: full_structure_risk_campaign | null = null;
  let position: open_position | null = null;
  let realizedEquity = FullStructureRiskRules.startingEquityUsd;
  let resistanceRejectionCount = 0;
  let supportRejectionCount = 0;
  let dualSideRejectionAmbiguousCount = 0;
  let invalidStructuralRiskCount = 0;
  let entryNotPassiveAtActivationCount = 0;
  let retestCampaignCount = 0;
  let retestShortFillCount = 0;
  let retestLongFillCount = 0;
  let retestNotFilledCount = 0;
  let validEntryCount = 0;
  let riskCappedByLeverageCount = 0;

  const applyTopUp = (timestamp: number) => {
    const result = applyExternalDepositIfRequired(realizedEquity, state === 'FLAT', timestamp);
    realizedEquity = result.equity;
    if (result.event !== null) externalDeposits.push(result.event);
  };

  const closePosition = (
    exitTimestamp: number,
    exitPrice: number,
    outcome: full_structure_risk_trade['outcome'],
    exitFeeRate: number,
  ) => {
    if (position === null) throw new Error('POSITION_REQUIRED');
    const grossPnlUsd = calculatePnl(
      position.side,
      position.actualNotionalUsd,
      position.entryPrice,
      exitPrice,
    );
    const exitFeeUsd = position.actualNotionalUsd * exitFeeRate;
    const totalFeeUsd = position.entryFeeUsd + exitFeeUsd;
    const netPnlUsd = grossPnlUsd - totalFeeUsd;
    trades.push({
      ...position,
      exitTimestamp,
      exitPrice,
      outcome,
      exitFeeUsd,
      totalFeeUsd,
      feeUsdPerActualGrossRisk: totalFeeUsd / position.actualGrossRiskUsd,
      grossPnlUsd,
      netPnlUsd,
      grossR: grossPnlUsd / position.actualGrossRiskUsd,
      netR: netPnlUsd / position.actualGrossRiskUsd,
      holdingMinutes: (exitTimestamp - position.entryTimestamp) / minute,
    });
    realizedEquity += netPnlUsd;
    position = null;
    campaign = null;
    state = 'FLAT';
    applyTopUp(exitTimestamp);
  };

  for (let barIndex = 0; barIndex < bars.length; barIndex++) {
    const bar = bars[barIndex]!;
    if (input.onProgress !== undefined && (barIndex + 1) % 20_000 === 0)
      input.onProgress({
        processed1m: (barIndex + 1) * 5,
        total1m: bars.length * 5,
        timestamp: bar.timestamp,
        state,
        activeSupportZones: activeSupportZones.length,
        activeResistanceZones: activeResistanceZones.length,
        confirmedRejections: resistanceRejectionCount + supportRejectionCount,
        completedTrades: trades.length,
      });

    const previousBar = barIndex > 0 ? bars[barIndex - 1]! : null;
    const contiguous =
      previousBar === null || bar.timestamp === previousBar.timestamp + fiveMinutes;
    if (!contiguous) {
      campaign = null;
      if (position !== null)
        closePosition(
          previousBar.timestamp + 4 * minute,
          previousBar.close,
          'SEGMENT_BOUNDARY_EXIT',
          input.takerFeeRate,
        );
      state = 'FLAT';
    }

    if (
      position !== null &&
      position.normalExitExecutionTimestamp !== null &&
      position.normalExitExecutionTimestamp === bar.timestamp
    )
      closePosition(
        bar.minutes[0]!.timestamp,
        bar.minutes[0]!.open,
        'NORMAL_INVALIDATION_EXIT_TAKER',
        input.takerFeeRate,
      );

    const zonesKnownBeforeCandle = [
      ...activeSupportZones.map(cloneZone),
      ...activeResistanceZones.map(cloneZone),
    ];
    let fillMinuteIndex: number | null = null;
    if (
      (state === 'WAITING_RETEST_LONG' || state === 'WAITING_RETEST_SHORT') &&
      campaign !== null
    ) {
      if (!isFixedRiskRetestPassive(campaign.side, campaign.entryPrice, bar.minutes[0]!.open)) {
        entryNotPassiveAtActivationCount++;
        campaign = null;
        state = 'FLAT';
      } else {
        for (let minuteIndex = 0; minuteIndex < 5; minuteIndex++) {
          const row = bar.minutes[minuteIndex]!;
          if (!isRetestTouched(campaign.side, campaign.entryPrice, row.high, row.low)) continue;
          const frozenZone = cloneZone(campaign.zone);
          const geometry = getFullStructureRiskGeometry({
            side: campaign.side,
            zone: frozenZone,
            existingClusterStructuralExtreme: campaign.existingClusterStructuralExtreme,
            rejection5mLow: campaign.rejection5mLow,
            rejection5mHigh: campaign.rejection5mHigh,
          });
          const sizing: fixed_risk_sizing | null =
            geometry === null
              ? null
              : sizeFixedRiskPosition({
                  side: campaign.side,
                  equity: realizedEquity,
                  entryPrice: geometry.entryPrice,
                  invalidationPrice: geometry.tradeStructuralAnchor,
                  maximumLeverage: input.maximumLeverage,
                });
          if (geometry === null || sizing === null || !(sizing.actualNotionalUsd > 0)) {
            invalidStructuralRiskCount++;
            campaign = null;
            state = 'FLAT';
            break;
          }
          position = {
            side: campaign.side,
            signalTimestamp: campaign.signalTimestamp,
            entryTimestamp: row.timestamp,
            entryPrice: geometry.entryPrice,
            entryZoneId: frozenZone.zoneId,
            entryZoneLower: frozenZone.lower,
            entryZoneUpper: frozenZone.upper,
            zoneLower: frozenZone.lower,
            zoneUpper: frozenZone.upper,
            rejection5mOpen: campaign.rejection5mOpen,
            rejection5mHigh: campaign.rejection5mHigh,
            rejection5mLow: campaign.rejection5mLow,
            rejection5mClose: campaign.rejection5mClose,
            existingClusterStructuralExtreme: geometry.existingClusterStructuralExtreme,
            tradeStructuralAnchor: geometry.tradeStructuralAnchor,
            rPrice: geometry.rPrice,
            targetPrice: geometry.targetPrice,
            emergencyStopPrice: geometry.emergencyStopPrice,
            emergencyDistanceFromEntryInR: geometry.emergencyDistanceFromEntryInR,
            zoneWidthREquivalent: Math.abs(frozenZone.upper - frozenZone.lower) / geometry.rPrice,
            rejectionRiskEquivalent:
              campaign.side === 'LONG'
                ? (geometry.entryPrice - campaign.rejection5mLow) / geometry.rPrice
                : (campaign.rejection5mHigh - geometry.entryPrice) / geometry.rPrice,
            invalidationTimestamp: null,
            normalExitExecutionTimestamp: null,
            equityBeforeTrade: realizedEquity,
            riskTargetUsd: sizing.riskTargetUsd,
            targetNotionalUsd: sizing.targetNotionalUsd,
            actualNotionalUsd: sizing.actualNotionalUsd,
            actualGrossRiskUsd: sizing.actualGrossRiskUsd,
            actualRiskPctOfEquity: sizing.actualRiskPctOfEquity,
            riskCappedByLeverage: sizing.riskCappedByLeverage,
            entryFeeUsd: sizing.actualNotionalUsd * input.makerFeeRate,
          };
          if (sizing.riskCappedByLeverage) riskCappedByLeverageCount++;
          if (campaign.side === 'SHORT') retestShortFillCount++;
          else retestLongFillCount++;
          validEntryCount++;
          state = campaign.side === 'SHORT' ? 'OPEN_SHORT' : 'OPEN_LONG';
          campaign = null;
          fillMinuteIndex = minuteIndex;
          break;
        }
      }
    }

    if (position !== null) {
      const startMinute = fillMinuteIndex ?? 0;
      for (let minuteIndex = startMinute; minuteIndex < 5 && position !== null; minuteIndex++) {
        const row = bar.minutes[minuteIndex]!;
        const emergencyTouched =
          position.side === 'LONG'
            ? row.low <= position.emergencyStopPrice
            : row.high >= position.emergencyStopPrice;
        const tpTouched =
          (fillMinuteIndex === null || minuteIndex > fillMinuteIndex) &&
          (position.side === 'LONG'
            ? row.high >= position.targetPrice
            : row.low <= position.targetPrice);
        const exit = resolveExitTouches({ emergencyTouched, tpTouched });
        if (exit === 'EMERGENCY_STOP')
          closePosition(
            row.timestamp,
            position.emergencyStopPrice,
            'EMERGENCY_STOP',
            input.takerFeeRate,
          );
        else if (exit === 'TAKE_PROFIT')
          closePosition(row.timestamp, position.targetPrice, 'TAKE_PROFIT', input.makerFeeRate);
      }
    }

    if (
      (state === 'WAITING_RETEST_LONG' || state === 'WAITING_RETEST_SHORT') &&
      campaign !== null
    ) {
      retestNotFilledCount++;
      campaign = null;
      state = 'FLAT';
    }

    const rejection = selectRejectionCandidate(bar, zonesKnownBeforeCandle);
    if (rejection.resistance !== null) resistanceRejectionCount++;
    if (rejection.support !== null) supportRejectionCount++;
    if (rejection.dualSideAmbiguous) dualSideRejectionAmbiguousCount++;

    for (const reaction of getConfirmedSwingReactions(bars, barIndex)) {
      const active = reaction.type === 'SUPPORT' ? activeSupportZones : activeResistanceZones;
      const priorLength = active.length;
      const updated = applySwingReaction(active, reaction, nextZoneId, bar.timestamp + fiveMinutes);
      if (active.length > priorLength) {
        zones.push(updated);
        nextZoneId++;
      }
    }
    breakZonesAtCompleted5mClose(
      [...activeSupportZones, ...activeResistanceZones],
      bar.close,
      bar.timestamp + fiveMinutes,
    );
    activeSupportZones = activeSupportZones.filter((zone) => !zone.isBroken);
    activeResistanceZones = activeResistanceZones.filter((zone) => !zone.isBroken);

    if (
      position !== null &&
      position.normalExitExecutionTimestamp === null &&
      isFullStructureRiskPositionInvalid(position.side, bar.close, position.tradeStructuralAnchor)
    ) {
      position.invalidationTimestamp = bar.timestamp + fiveMinutes;
      position.normalExitExecutionTimestamp = bar.timestamp + fiveMinutes;
    }

    if (state === 'FLAT' && !rejection.dualSideAmbiguous) {
      const zone = rejection.resistance ?? rejection.support;
      if (zone !== null) {
        const side: trade_side = zone.type === 'RESISTANCE' ? 'SHORT' : 'LONG';
        const existingClusterStructuralExtreme = getClusterStructuralExtreme(zone);
        const geometry = getFullStructureRiskGeometry({
          side,
          zone,
          existingClusterStructuralExtreme: existingClusterStructuralExtreme ?? Number.NaN,
          rejection5mLow: bar.low,
          rejection5mHigh: bar.high,
        });
        if (existingClusterStructuralExtreme === null || geometry === null)
          invalidStructuralRiskCount++;
        else {
          campaign = {
            side,
            zone: cloneZone(zone),
            signalTimestamp: bar.timestamp + fiveMinutes,
            entryPrice: geometry.entryPrice,
            rejection5mOpen: bar.open,
            rejection5mHigh: bar.high,
            rejection5mLow: bar.low,
            rejection5mClose: bar.close,
            existingClusterStructuralExtreme,
          };
          retestCampaignCount++;
          state = side === 'SHORT' ? 'WAITING_RETEST_SHORT' : 'WAITING_RETEST_LONG';
        }
      }
    }
  }

  if (position !== null && bars.length > 0)
    closePosition(
      bars.at(-1)!.timestamp + 4 * minute,
      bars.at(-1)!.close,
      'SEGMENT_BOUNDARY_EXIT',
      input.takerFeeRate,
    );

  return {
    trades,
    zones,
    externalDeposits,
    endingRealizedEquityUsd: realizedEquity,
    strategyNetPnlUsd: trades.reduce((sum, trade) => sum + trade.netPnlUsd, 0),
    diagnostics: {
      completed5mDecisionCount: bars.length,
      resistanceRejectionCount,
      supportRejectionCount,
      dualSideRejectionAmbiguousCount,
      invalidStructuralRiskCount,
      entryNotPassiveAtActivationCount,
      retestCampaignCount,
      retestShortFillCount,
      retestLongFillCount,
      retestNotFilledCount,
      validEntryCount,
      riskCappedByLeverageCount,
      retestFillRate: retestCampaignCount ? validEntryCount / retestCampaignCount : 0,
    },
  };
}

function average(values: readonly number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
function percentile(values: readonly number[], quantile: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * quantile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return lower === upper
    ? sorted[lower]!
    : sorted[lower]! * (upper - position) + sorted[upper]! * (position - lower);
}
function distribution(values: readonly number[]) {
  return {
    mean: average(values),
    median: percentile(values, 0.5),
    p10: percentile(values, 0.1),
    p25: percentile(values, 0.25),
    p75: percentile(values, 0.75),
    p90: percentile(values, 0.9),
    p95: percentile(values, 0.95),
  };
}
function profitFactor(values: readonly number[]) {
  const wins = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const losses = values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0);
  return losses < 0 ? wins / Math.abs(losses) : null;
}

function summarizeSegment(
  result: ReturnType<typeof simulateFullStructureRiskSegment>,
  startTimestamp: number,
  endExclusiveTimestamp: number,
) {
  const primary = result.trades.filter((trade) => trade.outcome !== 'SEGMENT_BOUNDARY_EXIT');
  const gross = primary.map((trade) => trade.grossPnlUsd);
  const net = primary.map((trade) => trade.netPnlUsd);
  const grossR = primary.map((trade) => trade.grossR);
  const netR = primary.map((trade) => trade.netR);
  const tp = primary.filter((trade) => trade.outcome === 'TAKE_PROFIT');
  const normal = primary.filter((trade) => trade.outcome === 'NORMAL_INVALIDATION_EXIT_TAKER');
  const emergency = primary.filter((trade) => trade.outcome === 'EMERGENCY_STOP');
  const days = (endExclusiveTimestamp - startTimestamp) / day;
  const summarizeSide = (side: trade_side) => {
    const rows = primary.filter((trade) => trade.side === side);
    return {
      completedTradeCount: rows.length,
      completedTradesPerUtcDay: days ? rows.length / days : 0,
      meanGrossR: average(rows.map((trade) => trade.grossR)),
      meanNetR: average(rows.map((trade) => trade.netR)),
      grossProfitFactor: profitFactor(rows.map((trade) => trade.grossPnlUsd)),
      netProfitFactor: profitFactor(rows.map((trade) => trade.netPnlUsd)),
      strategyNetPnlUsd: rows.reduce((sum, trade) => sum + trade.netPnlUsd, 0),
    };
  };
  return {
    entryFunnel: result.diagnostics,
    frequency: {
      completedTradeCount: primary.length,
      completedTradesPerUtcDay: days ? primary.length / days : 0,
    },
    rEconomics: {
      meanGrossR: average(grossR),
      medianGrossR: percentile(grossR, 0.5),
      meanNetR: average(netR),
      medianNetR: percentile(netR, 0.5),
      grossRProfitFactor: profitFactor(grossR),
      netRProfitFactor: profitFactor(netR),
      takeProfitMeanGrossR: average(tp.map((trade) => trade.grossR)),
      normalInvalidationMeanGrossR: average(normal.map((trade) => trade.grossR)),
      emergencyMeanGrossR: average(emergency.map((trade) => trade.grossR)),
      grossRDistribution: distribution(grossR),
      netRDistribution: distribution(netR),
    },
    usdEconomics: {
      meanGrossPnlUsd: average(gross),
      totalGrossPnlUsd: gross.reduce((sum, value) => sum + value, 0),
      grossProfitFactor: profitFactor(gross),
      meanNetPnlUsd: average(net),
      totalNetPnlUsd: net.reduce((sum, value) => sum + value, 0),
      netProfitFactor: profitFactor(net),
      winRate: net.length ? net.filter((value) => value > 0).length / net.length : 0,
      startingEquityUsd: FullStructureRiskRules.startingEquityUsd,
      endingEquityUsd: result.endingRealizedEquityUsd,
      strategyNetPnlUsd: result.strategyNetPnlUsd,
      topUpCount: result.externalDeposits.length,
      totalExternalCapitalAddedUsd: result.externalDeposits.reduce(
        (sum, event) => sum + event.amount,
        0,
      ),
    },
    outcomes: {
      takeProfitCount: tp.length,
      takeProfitRate: primary.length ? tp.length / primary.length : 0,
      normalInvalidationCount: normal.length,
      normalInvalidationRate: primary.length ? normal.length / primary.length : 0,
      emergencyStopCount: emergency.length,
      emergencyStopRate: primary.length ? emergency.length / primary.length : 0,
      riskCappedByLeverageCount: primary.filter((trade) => trade.riskCappedByLeverage).length,
      riskCappedByLeverageRate: primary.length
        ? primary.filter((trade) => trade.riskCappedByLeverage).length / primary.length
        : 0,
      retestNotFilledCount: result.diagnostics.retestNotFilledCount,
      segmentBoundaryExitCount: result.trades.length - primary.length,
    },
    emergencyDiagnostics: {
      emergencyStopCount: emergency.length,
      emergencyStopRate: primary.length ? emergency.length / primary.length : 0,
      meanEmergencyGrossR: average(emergency.map((trade) => trade.grossR)),
      medianEmergencyGrossR: percentile(
        emergency.map((trade) => trade.grossR),
        0.5,
      ),
      meanEmergencyLossUsd: average(emergency.map((trade) => trade.grossPnlUsd)),
      medianEmergencyLossUsd: percentile(
        emergency.map((trade) => trade.grossPnlUsd),
        0.5,
      ),
      worstEmergencyLossUsd: emergency.length
        ? Math.min(...emergency.map((trade) => trade.grossPnlUsd))
        : null,
      emergencyDistanceFromEntryInR: distribution(
        primary.map((trade) => trade.emergencyDistanceFromEntryInR),
      ),
    },
    moneyManagement: {
      rPricePctOfEntry: distribution(primary.map((trade) => trade.rPrice / trade.entryPrice)),
      riskTargetUsd: distribution(primary.map((trade) => trade.riskTargetUsd)),
      actualGrossRiskUsd: distribution(primary.map((trade) => trade.actualGrossRiskUsd)),
      actualRiskPctOfEquity: distribution(primary.map((trade) => trade.actualRiskPctOfEquity)),
      actualNotionalUsd: distribution(primary.map((trade) => trade.actualNotionalUsd)),
      totalFeesUsdPerActualGrossRisk: distribution(
        primary.map((trade) => trade.totalFeeUsd / trade.actualGrossRiskUsd),
      ),
      zoneWidthREquivalent: distribution(primary.map((trade) => trade.zoneWidthREquivalent)),
      rejectionRiskEquivalent: distribution(primary.map((trade) => trade.rejectionRiskEquivalent)),
    },
    longShort: { LONG: summarizeSide('LONG'), SHORT: summarizeSide('SHORT') },
  };
}

export type full_structure_risk_summary = ReturnType<typeof summarizeSegment>;

export function passesFullStructureRiskDiscovery(summary: full_structure_risk_summary) {
  return (
    summary.frequency.completedTradeCount >= FullStructureRiskRules.minimumCompletedTradeCount &&
    summary.frequency.completedTradesPerUtcDay >=
      FullStructureRiskRules.minimumCompletedTradesPerUtcDay &&
    (summary.usdEconomics.meanNetPnlUsd ?? -Infinity) > 0 &&
    summary.usdEconomics.totalNetPnlUsd > 0 &&
    (summary.usdEconomics.netProfitFactor ?? 0) > 1 &&
    (summary.rEconomics.meanNetR ?? -Infinity) > 0
  );
}
function passesLate(summary: full_structure_risk_summary) {
  return (
    summary.frequency.completedTradesPerUtcDay >=
      FullStructureRiskRules.minimumCompletedTradesPerUtcDay &&
    (summary.usdEconomics.meanNetPnlUsd ?? -Infinity) > 0 &&
    summary.usdEconomics.totalNetPnlUsd > 0 &&
    (summary.usdEconomics.netProfitFactor ?? 0) > 1 &&
    (summary.rEconomics.meanNetR ?? -Infinity) > 0
  );
}

export function buildFullStructureRiskReport(input: {
  candles: readonly price_candle[];
  prebuilt5m?: ReturnType<typeof buildExact5mBars>;
  makerFeeRate: number;
  takerFeeRate: number;
  maximumLeverage: number;
  leverageSource: string;
  feeSource: string;
  onProgress?: (segment: 'DISCOVERY' | 'LATE_DEVELOPMENT', progress: rejection_progress) => void;
}) {
  const built = input.prebuilt5m ?? buildExact5mBars(input.candles);
  const run = (
    segment: 'DISCOVERY' | 'LATE_DEVELOPMENT',
    startTimestamp: number,
    endExclusiveTimestamp: number,
  ) =>
    simulateFullStructureRiskSegment({
      bars: built.bars,
      startTimestamp,
      endExclusiveTimestamp,
      makerFeeRate: input.makerFeeRate,
      takerFeeRate: input.takerFeeRate,
      maximumLeverage: input.maximumLeverage,
      ...(input.onProgress === undefined
        ? {}
        : { onProgress: (progress: rejection_progress) => input.onProgress?.(segment, progress) }),
    });
  const discoveryResult = run(
    'DISCOVERY',
    FullStructureRiskRules.startTimestamp,
    FullStructureRiskRules.chronologicalSplitTimestamp,
  );
  const lateResult = run(
    'LATE_DEVELOPMENT',
    FullStructureRiskRules.chronologicalSplitTimestamp,
    FullStructureRiskRules.endExclusiveTimestamp,
  );
  const discovery = summarizeSegment(
    discoveryResult,
    FullStructureRiskRules.startTimestamp,
    FullStructureRiskRules.chronologicalSplitTimestamp,
  );
  const lateDevelopment = summarizeSegment(
    lateResult,
    FullStructureRiskRules.chronologicalSplitTimestamp,
    FullStructureRiskRules.endExclusiveTimestamp,
  );
  const discoveryPass = passesFullStructureRiskDiscovery(discovery);
  const latePass = discoveryPass && passesLate(lateDevelopment);
  const classificationReasons: string[] = [];
  if (discovery.frequency.completedTradeCount < FullStructureRiskRules.minimumCompletedTradeCount)
    classificationReasons.push('DISCOVERY_COMPLETED_TRADE_COUNT_BELOW_500');
  if (
    discovery.frequency.completedTradesPerUtcDay <
    FullStructureRiskRules.minimumCompletedTradesPerUtcDay
  )
    classificationReasons.push('DISCOVERY_COMPLETED_TRADES_PER_DAY_BELOW_5');
  if (
    (discovery.usdEconomics.meanNetPnlUsd ?? -Infinity) <= 0 ||
    discovery.usdEconomics.totalNetPnlUsd <= 0
  )
    classificationReasons.push('DISCOVERY_NET_EDGE_NOT_POSITIVE');
  if ((discovery.usdEconomics.netProfitFactor ?? 0) <= 1)
    classificationReasons.push('DISCOVERY_NET_PROFIT_FACTOR_NOT_ABOVE_1');
  if ((discovery.rEconomics.meanNetR ?? -Infinity) <= 0)
    classificationReasons.push('DISCOVERY_MEAN_NET_R_NOT_POSITIVE');
  if (discoveryPass && !passesLate(lateDevelopment))
    classificationReasons.push('UNCHANGED_STRATEGY_FAILED_LATE_SURVIVAL');
  const classification = !discoveryPass
    ? 'BTC_5M_SR_REJECTION_RETEST_FULL_STRUCTURE_RISK_2R_NO_DISCOVERY_EDGE'
    : !latePass
      ? 'BTC_5M_SR_REJECTION_RETEST_FULL_STRUCTURE_RISK_2R_FAILED_LATE'
      : 'BTC_5M_SR_REJECTION_RETEST_FULL_STRUCTURE_RISK_2R_ALPHA_LEAD';
  return {
    experimentId: FullStructureRiskRules.experimentId,
    sources: {
      price: 'data/bybit_btcusdt_perp_1m.sqlite:candles',
      bybitBTCOnly: true,
      decibelOverlapRead: false,
      leverageSource: input.leverageSource,
    },
    dataRange: {
      startTimestamp: FullStructureRiskRules.startTimestamp,
      endExclusiveTimestamp: FullStructureRiskRules.endExclusiveTimestamp,
      chronologicalSplitTimestamp: FullStructureRiskRules.chronologicalSplitTimestamp,
      overallSimulation: false,
    },
    frozenStrategy: {
      srEngine: ConfirmedSwingSRRules.experimentId,
      minimumConfirmedReactions: 2,
      rejectionFilters: [],
      retestWindowBars: 1,
      entryLiquidity: 'MAKER',
      actualQueueFillSimulated: false,
      structuralRiskAnchor: 'FULL_CLUSTER_EXTREME_WITH_CURRENT_REJECTION_EXTENSION',
      zoneWidthDeterminesRisk: false,
      latestRejectionAloneDeterminesRisk: false,
      riskFractionOfRealizedEquity: FullStructureRiskRules.riskFraction,
      target: 'EXACT_2R_REDUCE_ONLY_RESTING_LIMIT',
      tpLiquidity: 'MAKER',
      invalidation: 'STRICT_COMPLETED_5M_CLOSE_PAST_FROZEN_FULL_CLUSTER_EXTREME',
      normalExit: 'FIRST_EXACT_NEXT_1M_OPEN_MARKETABLE_REDUCE_ONLY_LIMIT_TAKER',
      exitPendingStates: false,
      emergencyStop: 'TEN_R_BEYOND_FULL_STRUCTURE_ANCHOR',
      emergencyDistanceFromEntryInR: 11,
      emergencyStopIsAlphaExit: false,
      emergencyStopDeterminesSizing: false,
      arbitraryMaximumHoldingExit: null,
      oneCampaignMaximum: true,
      onePositionMaximum: true,
      parameterSearch: false,
      filters: [],
      indicators: [],
      externalSignals: [],
    },
    barSummary: {
      valid5mBars: built.bars.length,
      invalid5mBars: built.invalid5mBars,
      utcAligned: true,
      gapFilling: false,
    },
    marketContext: { maximumLeverage: input.maximumLeverage },
    feeContext: {
      source: input.feeSource,
      makerFeeRate: input.makerFeeRate,
      takerFeeRate: input.takerFeeRate,
    },
    segments: { discovery, lateDevelopment },
    qualification: {
      discoveryPass,
      latePass,
      completedTradeCountMinimum: FullStructureRiskRules.minimumCompletedTradeCount,
      completedTradesPerUtcDayMinimum: FullStructureRiskRules.minimumCompletedTradesPerUtcDay,
      netProfitFactorMustExceed: 1,
      meanNetRMustExceed: 0,
      emergencyStopRateGate: null,
    },
    classification,
    classificationReasons,
    trades: { discovery: discoveryResult.trades, lateDevelopment: lateResult.trades },
    externalDeposits: {
      discovery: discoveryResult.externalDeposits,
      lateDevelopment: lateResult.externalDeposits,
    },
  };
}
