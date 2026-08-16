import type { price_candle } from './btc_bybit_decibel_overlap_audit.js';
import {
  applySwingReaction,
  breakZonesAtCompleted5mClose,
  buildExact5mBars,
  ConfirmedSwingSRRules,
  getConfirmedSwingReactions,
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
} from './btc_5m_sr_rejection_retest_fixed_risk_2r_v2.js';
import {
  FullStructureRiskRules,
  getClusterStructuralExtreme,
  getFullStructureRiskGeometry,
  simulateFullStructureRiskSegment,
  type full_structure_risk_trade,
} from './btc_5m_sr_rejection_retest_full_structure_risk_2r_v4.js';

const minute = 60_000;
const fiveMinutes = 5 * minute;
const day = 86_400_000;

export const HardStop2RProspectiveRules = {
  ...FullStructureRiskRules,
  experimentId: 'BTC_5M_SR_V4_HARD_STOP_2R_PROSPECTIVE_REPLAY_V1' as const,
  controlExperimentId: FullStructureRiskRules.experimentId,
  policies: ['P0_V4_CONTROL', 'P1_HARD_STOP_2R'] as const,
  hardStopR: -2 as const,
  entryLiquidity: 'POST_ONLY_LIMIT_MAKER' as const,
  targetLiquidity: 'REDUCE_ONLY_POST_ONLY_LIMIT_MAKER' as const,
  hardStopLiquidity: 'TAKER' as const,
  same1mTpStopPolicy: 'HARD_STOP_WINS' as const,
  expectedControl: {
    DISCOVERY: {
      completedTradeCount: 7060,
      completedTradesPerUtcDay: 5.183553597650514,
      takeProfitCount: 3160,
      normalInvalidationCount: 3800,
      emergencyStopCount: 100,
      meanGrossR: -0.34637171309843406,
      grossRProfitFactor: 0.72151565713062,
      meanNetR: -0.7082785613789999,
      netRProfitFactor: 0.5271915438052596,
      totalNetPnlUsd: -539.202734254158,
      netProfitFactor: 0.5303313514551756,
      riskCappedByLeverageCount: 34,
    },
    LATE_DEVELOPMENT: {
      completedTradeCount: 4189,
      completedTradesPerUtcDay: 7.1710606872956,
      takeProfitCount: 1912,
      normalInvalidationCount: 2249,
      emergencyStopCount: 28,
      meanGrossR: -0.22675489376963345,
      grossRProfitFactor: 0.8012678542059599,
      meanNetR: -0.7469557056243191,
      netRProfitFactor: 0.5009975686606005,
      totalNetPnlUsd: -337.3837168281302,
      netProfitFactor: 0.5050435543405921,
      riskCappedByLeverageCount: 35,
    },
  },
};

type campaign = {
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

export type hard_stop_2r_trade = Omit<
  full_structure_risk_trade,
  'outcome' | 'invalidationTimestamp'
> & {
  outcome: 'TAKE_PROFIT' | 'HARD_STOP_2R' | 'EMERGENCY_STOP' | 'SEGMENT_BOUNDARY_EXIT';
  hardStopPrice: number;
  same1mTpStopAmbiguous: boolean;
  openThroughStop: boolean;
  slippageBeyondMinus2R: number | null;
};

type open_position = Omit<
  hard_stop_2r_trade,
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
  | 'same1mTpStopAmbiguous'
  | 'openThroughStop'
  | 'slippageBeyondMinus2R'
>;

const cloneZone = (zone: reaction_zone): reaction_zone => ({
  ...zone,
  sourceSwingRanges: [...zone.sourceSwingRanges],
});

export function getHardStop2RPrice(side: trade_side, entryPrice: number, rPrice: number) {
  return side === 'LONG' ? entryPrice - 2 * rPrice : entryPrice + 2 * rPrice;
}

export function isHardStop2RTouched(
  side: trade_side,
  candle: Pick<price_candle, 'low' | 'high'>,
  hardStopPrice: number,
) {
  return side === 'LONG' ? candle.low <= hardStopPrice : candle.high >= hardStopPrice;
}

export function getHardStop2RFillPrice(
  side: trade_side,
  hardStopPrice: number,
  triggeringOpen: number,
) {
  return side === 'LONG'
    ? Math.min(hardStopPrice, triggeringOpen)
    : Math.max(hardStopPrice, triggeringOpen);
}

const calculatePnl = (side: trade_side, notional: number, entry: number, exit: number) =>
  side === 'LONG' ? notional * (exit / entry - 1) : notional * (entry / exit - 1);

export function simulateHardStop2RProspectiveSegment(input: {
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
  const trades: hard_stop_2r_trade[] = [];
  const externalDeposits: external_deposit_event[] = [];
  let nextZoneId = 1;
  let state: 'FLAT' | 'WAITING_RETEST_SHORT' | 'WAITING_RETEST_LONG' | 'OPEN_SHORT' | 'OPEN_LONG' =
    'FLAT';
  let activeCampaign: campaign | null = null;
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
  let same1mTpStopAmbiguousCount = 0;

  const applyTopUp = (timestamp: number) => {
    const result = applyExternalDepositIfRequired(realizedEquity, state === 'FLAT', timestamp);
    realizedEquity = result.equity;
    if (result.event !== null) externalDeposits.push(result.event);
  };

  const closePosition = (
    exitTimestamp: number,
    exitPrice: number,
    outcome: hard_stop_2r_trade['outcome'],
    exitFeeRate: number,
    same1mTpStopAmbiguous = false,
    openThroughStop = false,
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
    const grossR = grossPnlUsd / position.actualGrossRiskUsd;
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
      grossR,
      netR: netPnlUsd / position.actualGrossRiskUsd,
      holdingMinutes: (exitTimestamp - position.entryTimestamp) / minute,
      same1mTpStopAmbiguous,
      openThroughStop,
      slippageBeyondMinus2R: outcome === 'HARD_STOP_2R' ? Math.max(0, -2 - grossR) : null,
    });
    realizedEquity += netPnlUsd;
    position = null;
    activeCampaign = null;
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
      activeCampaign = null;
      if (position !== null)
        closePosition(
          previousBar.timestamp + 4 * minute,
          previousBar.close,
          'SEGMENT_BOUNDARY_EXIT',
          input.takerFeeRate,
        );
      state = 'FLAT';
    }

    const zonesKnownBeforeCandle = [
      ...activeSupportZones.map(cloneZone),
      ...activeResistanceZones.map(cloneZone),
    ];
    let fillMinuteIndex: number | null = null;
    if (
      (state === 'WAITING_RETEST_LONG' || state === 'WAITING_RETEST_SHORT') &&
      activeCampaign !== null
    ) {
      if (
        !isFixedRiskRetestPassive(
          activeCampaign.side,
          activeCampaign.entryPrice,
          bar.minutes[0]!.open,
        )
      ) {
        entryNotPassiveAtActivationCount++;
        activeCampaign = null;
        state = 'FLAT';
      } else {
        for (let minuteIndex = 0; minuteIndex < 5; minuteIndex++) {
          const row = bar.minutes[minuteIndex]!;
          if (!isRetestTouched(activeCampaign.side, activeCampaign.entryPrice, row.high, row.low))
            continue;
          const frozenZone = cloneZone(activeCampaign.zone);
          const geometry = getFullStructureRiskGeometry({
            side: activeCampaign.side,
            zone: frozenZone,
            existingClusterStructuralExtreme: activeCampaign.existingClusterStructuralExtreme,
            rejection5mLow: activeCampaign.rejection5mLow,
            rejection5mHigh: activeCampaign.rejection5mHigh,
          });
          const sizing =
            geometry === null
              ? null
              : sizeFixedRiskPosition({
                  side: activeCampaign.side,
                  equity: realizedEquity,
                  entryPrice: geometry.entryPrice,
                  invalidationPrice: geometry.tradeStructuralAnchor,
                  maximumLeverage: input.maximumLeverage,
                });
          if (geometry === null || sizing === null || !(sizing.actualNotionalUsd > 0)) {
            invalidStructuralRiskCount++;
            activeCampaign = null;
            state = 'FLAT';
            break;
          }
          position = {
            side: activeCampaign.side,
            signalTimestamp: activeCampaign.signalTimestamp,
            entryTimestamp: row.timestamp,
            entryPrice: geometry.entryPrice,
            entryZoneId: frozenZone.zoneId,
            entryZoneLower: frozenZone.lower,
            entryZoneUpper: frozenZone.upper,
            zoneLower: frozenZone.lower,
            zoneUpper: frozenZone.upper,
            rejection5mOpen: activeCampaign.rejection5mOpen,
            rejection5mHigh: activeCampaign.rejection5mHigh,
            rejection5mLow: activeCampaign.rejection5mLow,
            rejection5mClose: activeCampaign.rejection5mClose,
            existingClusterStructuralExtreme: geometry.existingClusterStructuralExtreme,
            tradeStructuralAnchor: geometry.tradeStructuralAnchor,
            rPrice: geometry.rPrice,
            targetPrice: geometry.targetPrice,
            hardStopPrice: getHardStop2RPrice(
              activeCampaign.side,
              geometry.entryPrice,
              geometry.rPrice,
            ),
            emergencyStopPrice: geometry.emergencyStopPrice,
            emergencyDistanceFromEntryInR: geometry.emergencyDistanceFromEntryInR,
            zoneWidthREquivalent: Math.abs(frozenZone.upper - frozenZone.lower) / geometry.rPrice,
            rejectionRiskEquivalent:
              activeCampaign.side === 'LONG'
                ? (geometry.entryPrice - activeCampaign.rejection5mLow) / geometry.rPrice
                : (activeCampaign.rejection5mHigh - geometry.entryPrice) / geometry.rPrice,
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
          if (activeCampaign.side === 'SHORT') retestShortFillCount++;
          else retestLongFillCount++;
          validEntryCount++;
          state = activeCampaign.side === 'SHORT' ? 'OPEN_SHORT' : 'OPEN_LONG';
          activeCampaign = null;
          fillMinuteIndex = minuteIndex;
          break;
        }
      }
    }

    if (position !== null) {
      const startMinute = fillMinuteIndex ?? 0;
      for (let minuteIndex = startMinute; minuteIndex < 5 && position !== null; minuteIndex++) {
        const row = bar.minutes[minuteIndex]!;
        const targetTouchedOnPath =
          position.side === 'LONG'
            ? row.high >= position.targetPrice
            : row.low <= position.targetPrice;
        const targetTouched =
          (fillMinuteIndex === null || minuteIndex > fillMinuteIndex) && targetTouchedOnPath;
        const stopTouched = isHardStop2RTouched(position.side, row, position.hardStopPrice);
        const emergencyOpenThrough =
          position.side === 'LONG'
            ? row.open <= position.emergencyStopPrice
            : row.open >= position.emergencyStopPrice;
        if (emergencyOpenThrough) {
          closePosition(
            row.timestamp,
            row.open,
            'EMERGENCY_STOP',
            input.takerFeeRate,
            targetTouchedOnPath && stopTouched,
            true,
          );
        } else if (stopTouched) {
          const ambiguous = targetTouchedOnPath;
          if (ambiguous) same1mTpStopAmbiguousCount++;
          const stopPrice = position.hardStopPrice;
          closePosition(
            row.timestamp,
            getHardStop2RFillPrice(position.side, stopPrice, row.open),
            'HARD_STOP_2R',
            input.takerFeeRate,
            ambiguous,
            position.side === 'LONG' ? row.open <= stopPrice : row.open >= stopPrice,
          );
        } else if (targetTouched) {
          closePosition(row.timestamp, position.targetPrice, 'TAKE_PROFIT', input.makerFeeRate);
        }
      }
    }

    if (
      (state === 'WAITING_RETEST_LONG' || state === 'WAITING_RETEST_SHORT') &&
      activeCampaign !== null
    ) {
      retestNotFilledCount++;
      activeCampaign = null;
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

    if (state === 'FLAT' && !rejection.dualSideAmbiguous) {
      const selectedZone = rejection.resistance ?? rejection.support;
      if (selectedZone !== null) {
        const side: trade_side = selectedZone.type === 'RESISTANCE' ? 'SHORT' : 'LONG';
        const structuralExtreme = getClusterStructuralExtreme(selectedZone);
        const geometry = getFullStructureRiskGeometry({
          side,
          zone: selectedZone,
          existingClusterStructuralExtreme: structuralExtreme ?? Number.NaN,
          rejection5mLow: bar.low,
          rejection5mHigh: bar.high,
        });
        if (structuralExtreme === null || geometry === null) invalidStructuralRiskCount++;
        else {
          activeCampaign = {
            side,
            zone: cloneZone(selectedZone),
            signalTimestamp: bar.timestamp + fiveMinutes,
            entryPrice: geometry.entryPrice,
            rejection5mOpen: bar.open,
            rejection5mHigh: bar.high,
            rejection5mLow: bar.low,
            rejection5mClose: bar.close,
            existingClusterStructuralExtreme: structuralExtreme,
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
      same1mTpStopAmbiguousCount,
      retestFillRate: retestCampaignCount ? validEntryCount / retestCampaignCount : 0,
    },
  };
}

type report_trade = full_structure_risk_trade | hard_stop_2r_trade;
const average = (values: readonly number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const percentile = (values: readonly number[], q: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (position - low);
};
const profitFactor = (values: readonly number[]) => {
  const wins = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const losses = values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0);
  return losses < 0 ? wins / Math.abs(losses) : null;
};

function summarizeTrades(
  trades: readonly report_trade[],
  startTimestamp: number,
  endExclusiveTimestamp: number,
  externalDeposits: readonly external_deposit_event[],
  endingRealizedEquityUsd: number,
) {
  const primary = trades.filter((trade) => trade.outcome !== 'SEGMENT_BOUNDARY_EXIT');
  const days = (endExclusiveTimestamp - startTimestamp) / day;
  const summarize = (rows: readonly report_trade[]) => {
    const gross = rows.map((row) => row.grossPnlUsd);
    const net = rows.map((row) => row.netPnlUsd);
    const grossR = rows.map((row) => row.grossR);
    const netR = rows.map((row) => row.netR);
    const entryNotional = rows.reduce((sum, row) => sum + row.actualNotionalUsd, 0);
    const exitNotional = entryNotional;
    const turnover = entryNotional + exitNotional;
    const totalFees = rows.reduce((sum, row) => sum + row.totalFeeUsd, 0);
    return {
      completedTradeCount: rows.length,
      averageCompletedTradesPerUtcDay: days ? rows.length / days : 0,
      takeProfitCount: rows.filter((row) => row.outcome === 'TAKE_PROFIT').length,
      takeProfitRate: rows.length
        ? rows.filter((row) => row.outcome === 'TAKE_PROFIT').length / rows.length
        : 0,
      normalInvalidationCount: rows.filter(
        (row) => row.outcome === 'NORMAL_INVALIDATION_EXIT_TAKER',
      ).length,
      hardStopCount: rows.filter((row) => row.outcome === 'HARD_STOP_2R').length,
      emergencyStopCount: rows.filter((row) => row.outcome === 'EMERGENCY_STOP').length,
      emergencyStopRate: rows.length
        ? rows.filter((row) => row.outcome === 'EMERGENCY_STOP').length / rows.length
        : 0,
      winRate: rows.length ? net.filter((value) => value > 0).length / rows.length : 0,
      meanGrossR: average(grossR),
      medianGrossR: percentile(grossR, 0.5),
      grossRProfitFactor: profitFactor(grossR),
      meanNetR: average(netR),
      medianNetR: percentile(netR, 0.5),
      netRProfitFactor: profitFactor(netR),
      meanGrossPnlUsd: average(gross),
      totalGrossPnlUsd: gross.reduce((sum, value) => sum + value, 0),
      grossProfitFactor: profitFactor(gross),
      meanNetPnlUsd: average(net),
      totalNetPnlUsd: net.reduce((sum, value) => sum + value, 0),
      netProfitFactor: profitFactor(net),
      riskCappedByLeverageCount: rows.filter((row) => row.riskCappedByLeverage).length,
      riskCapRate: rows.length
        ? rows.filter((row) => row.riskCappedByLeverage).length / rows.length
        : 0,
      totalEntryNotionalUsd: entryNotional,
      totalExitNotionalUsd: exitNotional,
      totalTurnoverUsd: turnover,
      totalFeesUsd: totalFees,
      netPnlPer1mTotalTurnoverUsd:
        turnover > 0 ? (net.reduce((sum, value) => sum + value, 0) / turnover) * 1_000_000 : null,
      feesPer1mTotalTurnoverUsd: turnover > 0 ? (totalFees / turnover) * 1_000_000 : null,
    };
  };
  return {
    ALL: {
      ...summarize(primary),
      topUpCount: externalDeposits.length,
      externalCapitalAddedUsd: externalDeposits.reduce((sum, event) => sum + event.amount, 0),
      endingRealizedEquityUsd,
    },
    LONG: summarize(primary.filter((trade) => trade.side === 'LONG')),
    SHORT: summarize(primary.filter((trade) => trade.side === 'SHORT')),
  };
}

const closeEnough = (actual: number | null, expected: number) =>
  actual !== null && Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected));

export function verifyControlFoundation(
  discovery: ReturnType<typeof summarizeTrades>['ALL'],
  late: ReturnType<typeof summarizeTrades>['ALL'],
) {
  const checks = (
    actual: typeof discovery,
    expected: (typeof HardStop2RProspectiveRules.expectedControl)['DISCOVERY'],
  ) => ({
    completedTradeCount: actual.completedTradeCount === expected.completedTradeCount,
    completedTradesPerUtcDay: closeEnough(
      actual.averageCompletedTradesPerUtcDay,
      expected.completedTradesPerUtcDay,
    ),
    takeProfitCount: actual.takeProfitCount === expected.takeProfitCount,
    normalInvalidationCount: actual.normalInvalidationCount === expected.normalInvalidationCount,
    emergencyStopCount: actual.emergencyStopCount === expected.emergencyStopCount,
    meanGrossR: closeEnough(actual.meanGrossR, expected.meanGrossR),
    grossRProfitFactor: closeEnough(actual.grossRProfitFactor, expected.grossRProfitFactor),
    meanNetR: closeEnough(actual.meanNetR, expected.meanNetR),
    netRProfitFactor: closeEnough(actual.netRProfitFactor, expected.netRProfitFactor),
    totalNetPnlUsd: closeEnough(actual.totalNetPnlUsd, expected.totalNetPnlUsd),
    netProfitFactor: closeEnough(actual.netProfitFactor, expected.netProfitFactor),
    riskCappedByLeverageCount:
      actual.riskCappedByLeverageCount === expected.riskCappedByLeverageCount,
  });
  const discoveryChecks = checks(discovery, HardStop2RProspectiveRules.expectedControl.DISCOVERY);
  const lateChecks = checks(late, HardStop2RProspectiveRules.expectedControl.LATE_DEVELOPMENT);
  return {
    passed: [...Object.values(discoveryChecks), ...Object.values(lateChecks)].every(Boolean),
    DISCOVERY: discoveryChecks,
    LATE_DEVELOPMENT: lateChecks,
  };
}

function comparison(
  candidate: ReturnType<typeof summarizeTrades>['ALL'],
  control: ReturnType<typeof summarizeTrades>['ALL'],
) {
  const delta = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);
  return {
    deltaCompletedTradesPerDay:
      candidate.averageCompletedTradesPerUtcDay - control.averageCompletedTradesPerUtcDay,
    deltaMeanGrossR: delta(candidate.meanGrossR, control.meanGrossR),
    deltaGrossRProfitFactor: delta(candidate.grossRProfitFactor, control.grossRProfitFactor),
    deltaMeanNetR: delta(candidate.meanNetR, control.meanNetR),
    deltaNetRProfitFactor: delta(candidate.netRProfitFactor, control.netRProfitFactor),
    deltaTotalNetPnlUsd: candidate.totalNetPnlUsd - control.totalNetPnlUsd,
    deltaNetProfitFactor: delta(candidate.netProfitFactor, control.netProfitFactor),
    deltaEmergencyStopRate: candidate.emergencyStopRate - control.emergencyStopRate,
    deltaRiskCapRate: candidate.riskCapRate - control.riskCapRate,
    deltaExternalCapitalAddedUsd:
      candidate.externalCapitalAddedUsd - control.externalCapitalAddedUsd,
    deltaNetPnlPer1mTotalTurnoverUsd: delta(
      candidate.netPnlPer1mTotalTurnoverUsd,
      control.netPnlPer1mTotalTurnoverUsd,
    ),
  };
}

function dominates(
  candidate: ReturnType<typeof summarizeTrades>['ALL'],
  control: ReturnType<typeof summarizeTrades>['ALL'],
) {
  return (
    candidate.averageCompletedTradesPerUtcDay >= 5 &&
    (candidate.meanGrossR ?? -Infinity) > (control.meanGrossR ?? Infinity) &&
    (candidate.grossRProfitFactor ?? -Infinity) > (control.grossRProfitFactor ?? Infinity) &&
    (candidate.meanNetR ?? -Infinity) > (control.meanNetR ?? Infinity) &&
    (candidate.netRProfitFactor ?? -Infinity) > (control.netRProfitFactor ?? Infinity) &&
    candidate.totalNetPnlUsd > control.totalNetPnlUsd &&
    (candidate.netProfitFactor ?? -Infinity) > (control.netProfitFactor ?? Infinity)
  );
}

const edge = (summary: ReturnType<typeof summarizeTrades>['ALL']) => ({
  grossEdgePositive: (summary.meanGrossR ?? -Infinity) > 0 && (summary.grossRProfitFactor ?? 0) > 1,
  netEdgePositive: (summary.meanNetR ?? -Infinity) > 0 && (summary.netProfitFactor ?? 0) > 1,
});

const tradeIdentity = (trade: report_trade) =>
  `${trade.side}:${trade.signalTimestamp}:${trade.entryPrice}:${trade.tradeStructuralAnchor}`;

function sequenceDifference(
  p0: readonly full_structure_risk_trade[],
  p1: readonly hard_stop_2r_trade[],
) {
  const p0Rows = p0.filter((row) => row.outcome !== 'SEGMENT_BOUNDARY_EXIT');
  const p1Rows = p1.filter((row) => row.outcome !== 'SEGMENT_BOUNDARY_EXIT');
  const p0Keys = new Set(p0Rows.map(tradeIdentity));
  const p1Keys = new Set(p1Rows.map(tradeIdentity));
  const onlyP1 = p1Rows.filter((row) => !p0Keys.has(tradeIdentity(row)));
  return {
    p0CompletedTradeCount: p0Rows.length,
    p1CompletedTradeCount: p1Rows.length,
    deltaCompletedTradeCount: p1Rows.length - p0Rows.length,
    p1TradesNotPresentInP0ChronologyCount: onlyP1.length,
    p0TradesNotPresentInP1ChronologyCount: p0Rows.filter((row) => !p1Keys.has(tradeIdentity(row)))
      .length,
    earlierFlatCreatedCandidateOpportunityCount: onlyP1.length,
  };
}

function hardStopExecution(trades: readonly hard_stop_2r_trade[]) {
  const stops = trades.filter((trade) => trade.outcome === 'HARD_STOP_2R');
  const slip = stops.map((trade) => trade.slippageBeyondMinus2R ?? 0);
  return {
    hardStopCount: stops.length,
    exactStopFillCount: stops.filter((trade) => !trade.openThroughStop).length,
    openThroughStopFillCount: stops.filter((trade) => trade.openThroughStop).length,
    openThroughStopFillRate: stops.length
      ? stops.filter((trade) => trade.openThroughStop).length / stops.length
      : 0,
    meanHardStopGrossR: average(stops.map((trade) => trade.grossR)),
    medianHardStopGrossR: percentile(
      stops.map((trade) => trade.grossR),
      0.5,
    ),
    meanSlippageBeyondMinus2R: average(slip),
    medianSlippageBeyondMinus2R: percentile(slip, 0.5),
    p90SlippageBeyondMinus2R: percentile(slip, 0.9),
    same1mTpStopAmbiguousCount: stops.filter((trade) => trade.same1mTpStopAmbiguous).length,
  };
}

function prospectiveFunnel(
  diagnostics: ReturnType<typeof simulateHardStop2RProspectiveSegment>['diagnostics'],
) {
  return {
    tradeableRejectionCount: diagnostics.retestCampaignCount,
    entryWindowCount: diagnostics.retestCampaignCount,
    postOnlyPlacementEligibleCount:
      diagnostics.retestCampaignCount - diagnostics.entryNotPassiveAtActivationCount,
    postOnlyRejectedNonPassiveCount: diagnostics.entryNotPassiveAtActivationCount,
    entryFilledCount: diagnostics.validEntryCount,
    entryUnfilledCount: diagnostics.retestNotFilledCount,
    entryFillRate: diagnostics.retestFillRate,
    invalidStructuralRiskCount: diagnostics.invalidStructuralRiskCount,
    riskCappedByLeverageCount: diagnostics.riskCappedByLeverageCount,
    riskCapRate: diagnostics.validEntryCount
      ? diagnostics.riskCappedByLeverageCount / diagnostics.validEntryCount
      : 0,
  };
}

export function classifyHardStop2RProspective(input: {
  foundationPassed: boolean;
  frequencyPassed: boolean;
  dominancePassed: boolean;
  grossEdgeBoth: boolean;
  netEdgeBoth: boolean;
}) {
  if (!input.foundationPassed) return 'BTC_5M_SR_HARD_STOP_2R_PROSPECTIVE_FOUNDATION_REGRESSION';
  if (!input.frequencyPassed) return 'BTC_5M_SR_HARD_STOP_2R_PROSPECTIVE_FREQUENCY_FAIL';
  if (!input.dominancePassed) return 'BTC_5M_SR_HARD_STOP_2R_PROSPECTIVE_DOES_NOT_DOMINATE_V4';
  if (input.netEdgeBoth) return 'BTC_5M_SR_HARD_STOP_2R_PROSPECTIVE_STRONG_V5_CANDIDATE';
  if (input.grossEdgeBoth) return 'BTC_5M_SR_HARD_STOP_2R_PROSPECTIVE_GROSS_EDGE_CANDIDATE';
  return 'BTC_5M_SR_HARD_STOP_2R_PROSPECTIVE_V5_CANDIDATE';
}

export function buildHardStop2RProspectiveReport(input: {
  candles: readonly price_candle[];
  prebuilt5m?: ReturnType<typeof buildExact5mBars>;
  makerFeeRate: number;
  takerFeeRate: number;
  maximumLeverage: number;
  leverageSource: string;
  feeSource: string;
  onProgress?: (policy: string, segment: string, progress: rejection_progress) => void;
}) {
  const built = input.prebuilt5m ?? buildExact5mBars(input.candles);
  const runSegment = (startTimestamp: number, endExclusiveTimestamp: number, segment: string) => {
    const shared = {
      bars: built.bars,
      startTimestamp,
      endExclusiveTimestamp,
      makerFeeRate: input.makerFeeRate,
      takerFeeRate: input.takerFeeRate,
      maximumLeverage: input.maximumLeverage,
    };
    const p0 = simulateFullStructureRiskSegment({
      ...shared,
      ...(input.onProgress === undefined
        ? {}
        : {
            onProgress: (progress: rejection_progress) =>
              input.onProgress?.('P0', segment, progress),
          }),
    });
    const p1 = simulateHardStop2RProspectiveSegment({
      ...shared,
      ...(input.onProgress === undefined
        ? {}
        : {
            onProgress: (progress: rejection_progress) =>
              input.onProgress?.('P1', segment, progress),
          }),
    });
    const p0Summary = summarizeTrades(
      p0.trades,
      startTimestamp,
      endExclusiveTimestamp,
      p0.externalDeposits,
      p0.endingRealizedEquityUsd,
    );
    const p1Summary = summarizeTrades(
      p1.trades,
      startTimestamp,
      endExclusiveTimestamp,
      p1.externalDeposits,
      p1.endingRealizedEquityUsd,
    );
    return {
      funnels: {
        P0_V4_CONTROL: {
          ...prospectiveFunnel({ ...p0.diagnostics, same1mTpStopAmbiguousCount: 0 }),
          completedTradeCount: p0Summary.ALL.completedTradeCount,
          averageCompletedTradesPerUtcDay: p0Summary.ALL.averageCompletedTradesPerUtcDay,
          rawDiagnostics: p0.diagnostics,
        },
        P1_HARD_STOP_2R: {
          ...prospectiveFunnel(p1.diagnostics),
          completedTradeCount: p1Summary.ALL.completedTradeCount,
          averageCompletedTradesPerUtcDay: p1Summary.ALL.averageCompletedTradesPerUtcDay,
          rawDiagnostics: p1.diagnostics,
        },
      },
      policies: {
        P0_V4_CONTROL: {
          trades: p0.trades,
          externalDeposits: p0.externalDeposits,
          scoreboard: p0Summary,
        },
        P1_HARD_STOP_2R: {
          trades: p1.trades,
          externalDeposits: p1.externalDeposits,
          scoreboard: p1Summary,
        },
      },
      hardStopExecution: hardStopExecution(p1.trades),
      opportunitySequenceDifference: sequenceDifference(p0.trades, p1.trades),
      comparison: comparison(p1Summary.ALL, p0Summary.ALL),
      dominance: dominates(p1Summary.ALL, p0Summary.ALL),
      edgeCheck: { P0: edge(p0Summary.ALL), P1: edge(p1Summary.ALL) },
    };
  };
  const discovery = runSegment(
    FullStructureRiskRules.startTimestamp,
    FullStructureRiskRules.chronologicalSplitTimestamp,
    'DISCOVERY',
  );
  const lateDevelopment = runSegment(
    FullStructureRiskRules.chronologicalSplitTimestamp,
    FullStructureRiskRules.endExclusiveTimestamp,
    'LATE_DEVELOPMENT',
  );
  const foundation = verifyControlFoundation(
    discovery.policies.P0_V4_CONTROL.scoreboard.ALL,
    lateDevelopment.policies.P0_V4_CONTROL.scoreboard.ALL,
  );
  const frequencyGate = {
    DISCOVERY:
      discovery.policies.P1_HARD_STOP_2R.scoreboard.ALL.averageCompletedTradesPerUtcDay >= 5,
    LATE_DEVELOPMENT:
      lateDevelopment.policies.P1_HARD_STOP_2R.scoreboard.ALL.averageCompletedTradesPerUtcDay >= 5,
  };
  const dominance = {
    DISCOVERY: foundation.passed && discovery.dominance,
    LATE_DEVELOPMENT: foundation.passed && lateDevelopment.dominance,
  };
  const grossEdgeBoth =
    discovery.edgeCheck.P1.grossEdgePositive && lateDevelopment.edgeCheck.P1.grossEdgePositive;
  const netEdgeBoth =
    discovery.edgeCheck.P1.netEdgePositive && lateDevelopment.edgeCheck.P1.netEdgePositive;
  const classification = classifyHardStop2RProspective({
    foundationPassed: foundation.passed,
    frequencyPassed: frequencyGate.DISCOVERY && frequencyGate.LATE_DEVELOPMENT,
    dominancePassed: dominance.DISCOVERY && dominance.LATE_DEVELOPMENT,
    grossEdgeBoth,
    netEdgeBoth,
  });
  return {
    experimentId: HardStop2RProspectiveRules.experimentId,
    metadata: {
      priceSource: 'data/bybit_btcusdt_perp_1m.sqlite:candles',
      feeSource: input.feeSource,
      leverageSource: input.leverageSource,
      makerFeeRate: input.makerFeeRate,
      takerFeeRate: input.takerFeeRate,
      maximumLeverage: input.maximumLeverage,
      liveTradingEnabled: false,
    },
    dataRange: {
      startTimestamp: FullStructureRiskRules.startTimestamp,
      endExclusiveTimestamp: FullStructureRiskRules.endExclusiveTimestamp,
      chronologicalSplitTimestamp: FullStructureRiskRules.chronologicalSplitTimestamp,
      overallSimulation: false,
    },
    independentStateMachines: {
      independentPositionState: true,
      independentEquityAndTopUps: true,
      independentOpportunityChronology: true,
      lockedCohort: false,
    },
    frozenStrategy: {
      srEngine: ConfirmedSwingSRRules.experimentId,
      proximalEntryUnchanged: true,
      targetR: 2,
      structuralAnchorR: -1,
      p1HardStopR: -2,
      entryLiquidity: HardStop2RProspectiveRules.entryLiquidity,
      targetLiquidity: HardStop2RProspectiveRules.targetLiquidity,
      hardStopLiquidity: HardStop2RProspectiveRules.hardStopLiquidity,
    },
    foundation,
    segments: { discovery, lateDevelopment },
    frequencyGate: {
      ...frequencyGate,
      passed: frequencyGate.DISCOVERY && frequencyGate.LATE_DEVELOPMENT,
    },
    dominance: { ...dominance, passed: dominance.DISCOVERY && dominance.LATE_DEVELOPMENT },
    edgeCheck: { grossEdgeBoth, netEdgeBoth },
    classification,
  };
}
