import type { BTC_candlestick } from './decibel_client.js';

export const BTCEthPairStrategy = {
  strategyId: 'btc_eth_relative_strength_pair_v1' as const,
  returnLookbackBars: 3,
  minimumMarginUtilization: 0.75,
  takeProfitCostMultiple: 1.5,
  stopLossCostMultiple: 3,
  externalDepositTrigger: 15,
  externalDepositAmount: 15,
  fundingMode: 'UNAVAILABLE' as const,
  marginGuardMode: 'DECIBEL_MARKET_MAX_LEVERAGE' as const,
  liveExecutionEnabled: false as const,
};

export type pair_direction = 'LONG_BTC_SHORT_ETH' | 'SHORT_BTC_LONG_ETH';
export type pair_side = 'BUY' | 'SELL';
export type pair_market = {
  marketAddress: string;
  tickSize: number;
  lotSize: number;
  minimumSize: number;
  maximumLeverage: number;
  makerFeeRate: number;
  takerFeeRate: number;
};
export type synchronized_pair_candle = {
  timestamp: Date;
  btc: BTC_candlestick;
  eth: BTC_candlestick;
};
export type pair_data_summary = {
  btc1mBars: number;
  eth1mBars: number;
  synchronized1mBars: number;
  btcOnlyTimestampsDropped: number;
  ethOnlyTimestampsDropped: number;
  firstSynchronizedTimestamp: string | null;
  lastSynchronizedTimestamp: string | null;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  droppedUnmatchedTimestamps: number;
};
export type pair_sizing = {
  pairLeverage: number;
  targetNotionalPerLeg: number;
  btcQuantity: number;
  ethQuantity: number;
  btcNotional: number;
  ethNotional: number;
  btcInitialMargin: number;
  ethInitialMargin: number;
  notionalMismatch: number;
  notionalMismatchBps: number;
  totalInitialMargin: number;
  marginUtilization: number;
};
export type pair_sizing_failure_reason =
  | 'AVAILABLE_MARGIN_NON_POSITIVE'
  | 'INVALID_MARKET_RULES'
  | 'INVALID_PAIR_LEVERAGE'
  | 'BTC_BELOW_MINIMUM_SIZE'
  | 'ETH_BELOW_MINIMUM_SIZE'
  | 'PAIR_MARGIN_CAP_EXCEEDED'
  | 'NO_LEGAL_EQUAL_NOTIONAL_PAIR';
export type pair_sizing_diagnostics = {
  availableMargin: number;
  targetMarginUtilization: number;
  pairLeverage: number | null;
  btcPrice: number;
  ethPrice: number;
  targetNotionalPerLeg: number | null;
  rawBTCQuantity: number | null;
  roundedBTCQuantity: number | null;
  btcMinimumQuantity: number;
  btcLotSize: number;
  rawETHQuantity: number | null;
  roundedETHQuantity: number | null;
  ethMinimumQuantity: number;
  ethLotSize: number;
  btcNotional: number | null;
  ethNotional: number | null;
  totalInitialMargin: number | null;
  actualMarginUtilization: number | null;
};
export class pair_sizing_error extends Error {
  constructor(
    readonly reason: pair_sizing_failure_reason,
    readonly diagnostics: pair_sizing_diagnostics,
  ) {
    super(`${reason}: ${JSON.stringify(diagnostics)}`);
    this.name = 'pair_sizing_error';
  }
}
export type closed_pair_campaign = {
  campaignId: string;
  signalTimestamp: number;
  relativeReturn3: number;
  direction: pair_direction;
  btcEntryPrice: number | null;
  ethEntryPrice: number | null;
  btcQty: number;
  ethQty: number;
  btcNotional: number;
  ethNotional: number;
  pairLeverage: number;
  marginUtilization: number;
  btcEntryFillTimestamp: number | null;
  ethEntryFillTimestamp: number | null;
  entryLeggingBars: number | null;
  entryFees: number;
  makerEntryFees: number;
  takerEntryFees: number;
  makerExitFees: number;
  takerExitFees: number;
  firstLegFilled: 'BTC' | 'ETH' | 'BOTH';
  firstLegFillTimestamp: number | null;
  requiredHedgeCompletion: boolean;
  hedgeCompletionBars: number;
  secondLegFillTimestamp: number | null;
  equityBeforeEntry: number;
  availableMarginBeforeEntry: number;
  btcIntendedQuantity: number;
  ethIntendedQuantity: number;
  entryAbortReason: pair_entry_abort_reason | null;
  btcMaxMarketLeverage: number;
  ethMaxMarketLeverage: number;
  selectedPairLeverage: number;
  btcMMFraction: number;
  ethMMFraction: number;
  minimumMarkedAccountEquity: number | null;
  maximumTotalMaintenanceMargin: number;
  minimumMarginHealthRatio: number | null;
  marginWarning150Breached: boolean;
  marginWarning120Breached: boolean;
  marginWarning105Breached: boolean;
  marginGuardTriggered: boolean;
  marginGuardTimestamp: number | null;
  markedAccountEquityAtMarginGuard: number | null;
  totalMaintenanceMarginAtMarginGuard: number | null;
  marginHealthRatioAtMarginGuard: number | null;
  exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'MARGIN_GUARD' | 'ENTRY_ABORT';
  exitTriggerTimestamp: number;
  btcExitPrice: number | null;
  ethExitPrice: number | null;
  exitFees: number;
  makerFees: number;
  takerFees: number;
  fundingPaid: 0;
  fundingReceived: 0;
  fundingMode: 'UNAVAILABLE';
  grossPairPnL: number;
  netPairPnL: number;
  totalPairCost: number;
  holdingBars: number;
};

type leg = {
  side: pair_side;
  limit: number;
  quantity: number;
  fillPrice: number | null;
  fillIndex: number | null;
  fillTimestamp: number | null;
};
type open_pair = {
  campaignId: string;
  signalIndex: number;
  signalTimestamp: number;
  relativeReturn3: number;
  direction: pair_direction;
  sizing: pair_sizing;
  btc: leg;
  eth: leg;
  entryFees: number;
  makerEntryFees: number;
  takerEntryFees: number;
  equityBeforeEntry: number;
  btcIntendedQuantity: number;
  ethIntendedQuantity: number;
  hedgeCompletionStartedIndex: number | null;
  marginAudit: pair_margin_audit;
  firstEligibleIndex: number;
  activeIndex: number | null;
  exit: null | {
    reason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'MARGIN_GUARD';
    triggerIndex: number;
    btcLimit: number;
    ethLimit: number;
    btcFill: { price: number; index: number; maker: boolean } | null;
    ethFill: { price: number; index: number; maker: boolean } | null;
  };
};
type pair_margin_audit = {
  minimumMarkedAccountEquity: number;
  maximumTotalMaintenanceMargin: number;
  minimumMarginHealthRatio: number;
  marginWarning150Breached: boolean;
  marginWarning120Breached: boolean;
  marginWarning105Breached: boolean;
  marginGuardTriggered: boolean;
  marginGuardTimestamp: number | null;
  markedAccountEquityAtMarginGuard: number | null;
  totalMaintenanceMarginAtMarginGuard: number | null;
  marginHealthRatioAtMarginGuard: number | null;
};
export type pair_entry_abort_reason =
  | 'INVALID_MARKET_RULES'
  | 'SECOND_LEG_BELOW_MINIMUM_SIZE'
  | 'SECOND_LEG_CANNOT_BE_SIZED'
  | 'PAIR_MARGIN_CAP_EXCEEDED'
  | 'HEDGE_COMPLETION_IMPOSSIBLE'
  | 'MARGIN_GUARD_FORCES_ABORT';
export type external_deposit_event = {
  type: 'EXTERNAL_DEPOSIT';
  timestamp: number;
  equityBeforeDeposit: number;
  amount: 15;
  equityAfterDeposit: number;
};

export function applyExternalDepositIfRequired(
  equity: number,
  isFlat: boolean,
  timestamp: number,
): { equity: number; event: external_deposit_event | null } {
  if (!isFlat || equity >= 15) return { equity, event: null };
  const event: external_deposit_event = {
    type: 'EXTERNAL_DEPOSIT',
    timestamp,
    equityBeforeDeposit: equity,
    amount: 15,
    equityAfterDeposit: Math.round((equity + 15) * 100) / 100,
  };
  return { equity: event.equityAfterDeposit, event };
}

const roundDown = (value: number, increment: number) =>
  Math.floor((value + Number.EPSILON) / increment) * increment;
const roundUp = (value: number, increment: number) =>
  Math.ceil((value - Number.EPSILON) / increment) * increment;
const roundLimit = (price: number, side: pair_side, tickSize: number) =>
  side === 'BUY' ? roundDown(price, tickSize) : roundUp(price, tickSize);
const passiveFill = (leg_: leg, candle: BTC_candlestick, tickSize: number) =>
  leg_.side === 'BUY' ? candle.low <= leg_.limit - tickSize : candle.high >= leg_.limit + tickSize;
const pnl = (side: pair_side, entry: number, exit: number, quantity: number) =>
  (side === 'BUY' ? exit - entry : entry - exit) * quantity;
const percentile = (values: readonly number[], fraction: number) =>
  values.length === 0
    ? 0
    : [...values].sort((left, right) => left - right)[Math.floor((values.length - 1) * fraction)]!;
const distribution = (values: readonly number[]) => ({
  mean: values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length,
  median: percentile(values, 0.5),
  min: values.length === 0 ? 0 : Math.min(...values),
  max: values.length === 0 ? 0 : Math.max(...values),
});
const profitFactor = (values: readonly number[]) => {
  const wins = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0),
    losses = -values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0);
  return losses === 0 ? null : wins / losses;
};

export function synchronizePairCandles(
  btcCandles: readonly BTC_candlestick[],
  ethCandles: readonly BTC_candlestick[],
): { candles: synchronized_pair_candle[]; data: pair_data_summary } {
  const validate = (candles: readonly BTC_candlestick[], asset: string) => {
    let previous = -1;
    const seen = new Set<number>();
    for (const candle of candles) {
      const timestamp = candle.timestamp.getTime();
      if (!Number.isSafeInteger(timestamp) || timestamp % 60_000 !== 0)
        throw new Error(`${asset}_ONE_MINUTE_CANDLE_MISALIGNED`);
      if (seen.has(timestamp)) throw new Error(`${asset}_ONE_MINUTE_CANDLE_DUPLICATE`);
      if (timestamp <= previous) throw new Error(`${asset}_ONE_MINUTE_CANDLES_UNORDERED`);
      seen.add(timestamp);
      previous = timestamp;
    }
    return seen;
  };
  const btcTimes = validate(btcCandles, 'BTC'),
    ethTimes = validate(ethCandles, 'ETH'),
    ethByTime = new Map(ethCandles.map((candle) => [candle.timestamp.getTime(), candle])),
    candles = btcCandles.flatMap((btc) => {
      const eth = ethByTime.get(btc.timestamp.getTime());
      return eth ? [{ timestamp: btc.timestamp, btc, eth }] : [];
    });
  const firstTimestamp = candles[0]?.timestamp.toISOString() ?? null,
    lastTimestamp = candles.at(-1)?.timestamp.toISOString() ?? null,
    btcOnlyTimestampsDropped = [...btcTimes].filter((time) => !ethTimes.has(time)).length,
    ethOnlyTimestampsDropped = [...ethTimes].filter((time) => !btcTimes.has(time)).length;
  return {
    candles,
    data: {
      btc1mBars: btcCandles.length,
      eth1mBars: ethCandles.length,
      synchronized1mBars: candles.length,
      btcOnlyTimestampsDropped,
      ethOnlyTimestampsDropped,
      firstSynchronizedTimestamp: firstTimestamp,
      lastSynchronizedTimestamp: lastTimestamp,
      firstTimestamp,
      lastTimestamp,
      droppedUnmatchedTimestamps: btcOnlyTimestampsDropped + ethOnlyTimestampsDropped,
    },
  };
}

export function calculatePairSignal(
  candles: readonly synchronized_pair_candle[],
  index: number,
): {
  btcReturn3: number;
  ethReturn3: number;
  relativeReturn3: number;
  direction: pair_direction | null;
} | null {
  if (index < BTCEthPairStrategy.returnLookbackBars) return null;
  const current = candles[index]!,
    previous = candles[index - 3]!;
  const btcReturn3 = current.btc.close / previous.btc.close - 1,
    ethReturn3 = current.eth.close / previous.eth.close - 1,
    relativeReturn3 = btcReturn3 - ethReturn3;
  return {
    btcReturn3,
    ethReturn3,
    relativeReturn3,
    direction:
      relativeReturn3 > 0
        ? 'LONG_BTC_SHORT_ETH'
        : relativeReturn3 < 0
          ? 'SHORT_BTC_LONG_ETH'
          : null,
  };
}

export function calculatePairLeverage(btcMaximum: number, ethMaximum: number): number {
  if (![btcMaximum, ethMaximum].every((value) => Number.isFinite(value) && value > 0))
    throw new Error('PAIR_MAXIMUM_LEVERAGE_UNAVAILABLE');
  return Math.min(btcMaximum, ethMaximum);
}

export function evaluatePairExit(input: {
  grossPairPnL: number;
  entryFees: number;
  expectedMakerExitFees: number;
  expectedTakerExitFees: number;
  markedAccountEquity: number;
  totalMaintenanceMargin: number;
}): 'TAKE_PROFIT' | 'STOP_LOSS' | 'MARGIN_GUARD' | null {
  const makerCost = input.entryFees + input.expectedMakerExitFees,
    takerCost = input.entryFees + input.expectedTakerExitFees;
  if (input.markedAccountEquity < input.totalMaintenanceMargin) return 'MARGIN_GUARD';
  if (input.grossPairPnL - makerCost >= 1.5 * makerCost) return 'TAKE_PROFIT';
  if (input.grossPairPnL - takerCost <= -3 * takerCost) return 'STOP_LOSS';
  return null;
}

export function calculatePairMaintenanceMargin(input: {
  btcQuantity: number;
  ethQuantity: number;
  btcMarkPrice: number;
  ethMarkPrice: number;
  btcMaximumLeverage: number;
  ethMaximumLeverage: number;
}) {
  if (
    ![input.btcMaximumLeverage, input.ethMaximumLeverage].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    throw new Error('INVALID_MARKET_MAXIMUM_LEVERAGE');
  const btcMMFraction = 1 / (input.btcMaximumLeverage * 2),
    ethMMFraction = 1 / (input.ethMaximumLeverage * 2),
    btcCurrentNotional = Math.abs(input.btcQuantity * input.btcMarkPrice),
    ethCurrentNotional = Math.abs(input.ethQuantity * input.ethMarkPrice),
    btcMaintenanceMargin = btcCurrentNotional * btcMMFraction,
    ethMaintenanceMargin = ethCurrentNotional * ethMMFraction;
  return {
    btcMMFraction,
    ethMMFraction,
    btcCurrentNotional,
    ethCurrentNotional,
    btcMaintenanceMargin,
    ethMaintenanceMargin,
    totalMaintenanceMargin: btcMaintenanceMargin + ethMaintenanceMargin,
  };
}

export function calculateMarkedPairAccountEquity(input: {
  realizedAccountCollateral: number;
  btcSide: pair_side;
  btcEntryPrice: number;
  btcMarkPrice: number;
  btcQuantity: number;
  ethSide: pair_side;
  ethEntryPrice: number;
  ethMarkPrice: number;
  ethQuantity: number;
  accruedFunding?: number;
}) {
  const btcUnrealizedPnL = pnl(
      input.btcSide,
      input.btcEntryPrice,
      input.btcMarkPrice,
      input.btcQuantity,
    ),
    ethUnrealizedPnL = pnl(
      input.ethSide,
      input.ethEntryPrice,
      input.ethMarkPrice,
      input.ethQuantity,
    ),
    fundingContribution = input.accruedFunding ?? 0;
  return {
    btcUnrealizedPnL,
    ethUnrealizedPnL,
    fundingContribution,
    markedAccountEquity:
      input.realizedAccountCollateral + btcUnrealizedPnL + ethUnrealizedPnL + fundingContribution,
  };
}

export function evaluatePairMarginHealth(
  markedAccountEquity: number,
  totalMaintenanceMargin: number,
) {
  const marginHealthRatio =
    totalMaintenanceMargin > 0
      ? markedAccountEquity / totalMaintenanceMargin
      : Number.POSITIVE_INFINITY;
  return {
    marginHealthRatio,
    warning150Breached: marginHealthRatio < 1.5,
    warning120Breached: marginHealthRatio < 1.2,
    warning105Breached: marginHealthRatio < 1.05,
    liquidationEligible: markedAccountEquity < totalMaintenanceMargin,
  };
}

export function sizeEqualNotionalPair(input: {
  availableMargin: number;
  btcPrice: number;
  ethPrice: number;
  btcMarket: pair_market;
  ethMarket: pair_market;
}): pair_sizing {
  const baseDiagnostics = {
    availableMargin: input.availableMargin,
    targetMarginUtilization: BTCEthPairStrategy.minimumMarginUtilization,
    pairLeverage: null,
    btcPrice: input.btcPrice,
    ethPrice: input.ethPrice,
    targetNotionalPerLeg: null,
    rawBTCQuantity: null,
    roundedBTCQuantity: null,
    btcMinimumQuantity: input.btcMarket.minimumSize,
    btcLotSize: input.btcMarket.lotSize,
    rawETHQuantity: null,
    roundedETHQuantity: null,
    ethMinimumQuantity: input.ethMarket.minimumSize,
    ethLotSize: input.ethMarket.lotSize,
    btcNotional: null,
    ethNotional: null,
    totalInitialMargin: null,
    actualMarginUtilization: null,
  } satisfies pair_sizing_diagnostics;
  if (!Number.isFinite(input.availableMargin) || input.availableMargin <= 0)
    throw new pair_sizing_error('AVAILABLE_MARGIN_NON_POSITIVE', baseDiagnostics);
  const validMarket = (market: pair_market) =>
    [market.tickSize, market.lotSize, market.minimumSize].every(
      (value) => Number.isFinite(value) && value > 0,
    );
  if (
    !validMarket(input.btcMarket) ||
    !validMarket(input.ethMarket) ||
    !Number.isFinite(input.btcPrice) ||
    input.btcPrice <= 0 ||
    !Number.isFinite(input.ethPrice) ||
    input.ethPrice <= 0
  )
    throw new pair_sizing_error('INVALID_MARKET_RULES', baseDiagnostics);
  let pairLeverage: number;
  try {
    pairLeverage = calculatePairLeverage(
      input.btcMarket.maximumLeverage,
      input.ethMarket.maximumLeverage,
    );
  } catch {
    throw new pair_sizing_error('INVALID_PAIR_LEVERAGE', baseDiagnostics);
  }
  const targetPerLegNotional = (input.availableMargin * pairLeverage) / 2,
    rawBTCQuantity = targetPerLegNotional / input.btcPrice,
    rawETHQuantity = targetPerLegNotional / input.ethPrice,
    diagnostics = {
      ...baseDiagnostics,
      pairLeverage,
      targetNotionalPerLeg: targetPerLegNotional,
      rawBTCQuantity,
      rawETHQuantity,
      roundedBTCQuantity: roundDown(rawBTCQuantity, input.btcMarket.lotSize),
      roundedETHQuantity: roundDown(rawETHQuantity, input.ethMarket.lotSize),
    } satisfies pair_sizing_diagnostics;
  let btcQuantity = roundDown(rawBTCQuantity, input.btcMarket.lotSize),
    ethQuantity = roundDown(rawETHQuantity, input.ethMarket.lotSize);
  const validMinimums = () =>
    btcQuantity >= input.btcMarket.minimumSize &&
    ethQuantity >= input.ethMarket.minimumSize &&
    btcQuantity > 0 &&
    ethQuantity > 0;
  if (btcQuantity < input.btcMarket.minimumSize)
    throw new pair_sizing_error('BTC_BELOW_MINIMUM_SIZE', diagnostics);
  if (ethQuantity < input.ethMarket.minimumSize)
    throw new pair_sizing_error('ETH_BELOW_MINIMUM_SIZE', diagnostics);
  const totalMargin = () =>
    (btcQuantity * input.btcPrice + ethQuantity * input.ethPrice) / pairLeverage;
  const executionCostReserve = () =>
    btcQuantity * input.btcPrice * (input.btcMarket.makerFeeRate + input.btcMarket.takerFeeRate) +
    ethQuantity * input.ethPrice * (input.ethMarket.makerFeeRate + input.ethMarket.takerFeeRate);
  while (totalMargin() + executionCostReserve() >= input.availableMargin) {
    if (btcQuantity * input.btcPrice >= ethQuantity * input.ethPrice)
      btcQuantity = roundDown(btcQuantity - input.btcMarket.lotSize, input.btcMarket.lotSize);
    else ethQuantity = roundDown(ethQuantity - input.ethMarket.lotSize, input.ethMarket.lotSize);
    if (!validMinimums()) throw new pair_sizing_error('PAIR_MARGIN_CAP_EXCEEDED', diagnostics);
  }
  const improveBalance = () => {
    const btcNotional = btcQuantity * input.btcPrice,
      ethNotional = ethQuantity * input.ethPrice;
    if (btcNotional > ethNotional) {
      const reduced = roundDown(btcQuantity - input.btcMarket.lotSize, input.btcMarket.lotSize);
      if (
        reduced >= input.btcMarket.minimumSize &&
        Math.abs(reduced * input.btcPrice - ethNotional) < Math.abs(btcNotional - ethNotional)
      )
        btcQuantity = reduced;
    } else {
      const reduced = roundDown(ethQuantity - input.ethMarket.lotSize, input.ethMarket.lotSize);
      if (
        reduced >= input.ethMarket.minimumSize &&
        Math.abs(reduced * input.ethPrice - btcNotional) < Math.abs(ethNotional - btcNotional)
      )
        ethQuantity = reduced;
    }
  };
  improveBalance();
  const btcNotional = btcQuantity * input.btcPrice,
    ethNotional = ethQuantity * input.ethPrice,
    btcInitialMargin = btcNotional / pairLeverage,
    ethInitialMargin = ethNotional / pairLeverage,
    totalInitialMargin = btcInitialMargin + ethInitialMargin,
    marginUtilization = totalInitialMargin / input.availableMargin,
    notionalMismatch = Math.abs(btcNotional - ethNotional),
    notionalMismatchBps =
      (notionalMismatch / Math.max((btcNotional + ethNotional) / 2, Number.EPSILON)) * 10_000,
    maximumRoundingMismatch = Math.max(
      input.btcMarket.lotSize * input.btcPrice,
      input.ethMarket.lotSize * input.ethPrice,
    );
  if (marginUtilization < BTCEthPairStrategy.minimumMarginUtilization)
    throw new pair_sizing_error('NO_LEGAL_EQUAL_NOTIONAL_PAIR', {
      ...diagnostics,
      btcNotional,
      ethNotional,
      totalInitialMargin,
      actualMarginUtilization: marginUtilization,
    });
  if (notionalMismatch > maximumRoundingMismatch + 1e-9)
    throw new pair_sizing_error('NO_LEGAL_EQUAL_NOTIONAL_PAIR', {
      ...diagnostics,
      btcNotional,
      ethNotional,
      totalInitialMargin,
      actualMarginUtilization: marginUtilization,
    });
  return {
    pairLeverage,
    targetNotionalPerLeg: targetPerLegNotional,
    btcQuantity,
    ethQuantity,
    btcNotional,
    ethNotional,
    btcInitialMargin,
    ethInitialMargin,
    notionalMismatch,
    notionalMismatchBps,
    totalInitialMargin,
    marginUtilization,
  };
}

export function sizeMissingHedgeLeg(input: {
  firstLegNotional: number;
  executablePrice: number;
  market: pair_market;
  existingInitialMargin: number;
  availableMargin: number;
  pairLeverage: number;
}): number {
  if (
    !Number.isFinite(input.firstLegNotional) ||
    input.firstLegNotional <= 0 ||
    !Number.isFinite(input.executablePrice) ||
    input.executablePrice <= 0 ||
    !Number.isFinite(input.market.lotSize) ||
    input.market.lotSize <= 0 ||
    !Number.isFinite(input.market.minimumSize) ||
    input.market.minimumSize <= 0
  )
    throw new Error('INVALID_MARKET_RULES');
  const targetQuantity = roundDown(
      input.firstLegNotional / input.executablePrice,
      input.market.lotSize,
    ),
    marginCapacity = Math.max(0, input.availableMargin - input.existingInitialMargin),
    maximumQuantity = roundDown(
      marginCapacity /
        (input.executablePrice / input.pairLeverage +
          input.executablePrice * input.market.takerFeeRate),
      input.market.lotSize,
    ),
    quantity = Math.min(targetQuantity, maximumQuantity);
  if (quantity < input.market.minimumSize) throw new Error('SECOND_LEG_BELOW_MINIMUM_SIZE');
  if (
    !(
      input.existingInitialMargin +
        (quantity * input.executablePrice) / input.pairLeverage +
        quantity * input.executablePrice * input.market.takerFeeRate <
      input.availableMargin
    )
  )
    throw new Error('PAIR_MARGIN_CAP_EXCEEDED');
  return quantity;
}

function closeCampaign(
  campaign: open_pair,
  reason: closed_pair_campaign['exitReason'],
  triggerTimestamp: number,
  btcExit: { price: number; maker: boolean } | null,
  ethExit: { price: number; maker: boolean } | null,
  btcMarket: pair_market,
  ethMarket: pair_market,
  holdingBars: number,
  entryAbortReason: pair_entry_abort_reason | null = null,
): closed_pair_campaign {
  const btcGross =
      campaign.btc.fillPrice === null || btcExit === null
        ? 0
        : pnl(campaign.btc.side, campaign.btc.fillPrice, btcExit.price, campaign.btc.quantity),
    ethGross =
      campaign.eth.fillPrice === null || ethExit === null
        ? 0
        : pnl(campaign.eth.side, campaign.eth.fillPrice, ethExit.price, campaign.eth.quantity),
    btcExitFee =
      btcExit === null
        ? 0
        : btcExit.price *
          campaign.btc.quantity *
          (btcExit.maker ? btcMarket.makerFeeRate : btcMarket.takerFeeRate),
    ethExitFee =
      ethExit === null
        ? 0
        : ethExit.price *
          campaign.eth.quantity *
          (ethExit.maker ? ethMarket.makerFeeRate : ethMarket.takerFeeRate),
    exitFees = btcExitFee + ethExitFee,
    makerExitFees = (btcExit?.maker ? btcExitFee : 0) + (ethExit?.maker ? ethExitFee : 0),
    takerExitFees = (!btcExit?.maker ? btcExitFee : 0) + (!ethExit?.maker ? ethExitFee : 0),
    grossPairPnL = btcGross + ethGross,
    totalPairCost = campaign.entryFees + exitFees;
  return {
    campaignId: campaign.campaignId,
    signalTimestamp: campaign.signalTimestamp,
    relativeReturn3: campaign.relativeReturn3,
    direction: campaign.direction,
    btcEntryPrice: campaign.btc.fillPrice,
    ethEntryPrice: campaign.eth.fillPrice,
    btcQty: campaign.btc.quantity,
    ethQty: campaign.eth.quantity,
    btcNotional: campaign.sizing.btcNotional,
    ethNotional: campaign.sizing.ethNotional,
    pairLeverage: campaign.sizing.pairLeverage,
    marginUtilization: campaign.sizing.marginUtilization,
    btcEntryFillTimestamp: campaign.btc.fillTimestamp,
    ethEntryFillTimestamp: campaign.eth.fillTimestamp,
    entryLeggingBars:
      campaign.btc.fillIndex === null || campaign.eth.fillIndex === null
        ? null
        : Math.abs(campaign.btc.fillIndex - campaign.eth.fillIndex),
    entryFees: campaign.entryFees,
    makerEntryFees: campaign.makerEntryFees,
    takerEntryFees: campaign.takerEntryFees,
    makerExitFees,
    takerExitFees,
    firstLegFilled:
      campaign.btc.fillIndex === campaign.eth.fillIndex
        ? 'BOTH'
        : campaign.btc.fillIndex !== null &&
            (campaign.eth.fillIndex === null || campaign.btc.fillIndex < campaign.eth.fillIndex)
          ? 'BTC'
          : 'ETH',
    firstLegFillTimestamp:
      campaign.btc.fillTimestamp === null
        ? campaign.eth.fillTimestamp
        : campaign.eth.fillTimestamp === null
          ? campaign.btc.fillTimestamp
          : Math.min(campaign.btc.fillTimestamp, campaign.eth.fillTimestamp),
    requiredHedgeCompletion: campaign.hedgeCompletionStartedIndex !== null,
    hedgeCompletionBars:
      campaign.hedgeCompletionStartedIndex === null ||
      campaign.btc.fillIndex === null ||
      campaign.eth.fillIndex === null
        ? 0
        : Math.max(campaign.btc.fillIndex, campaign.eth.fillIndex) -
          campaign.hedgeCompletionStartedIndex,
    secondLegFillTimestamp:
      campaign.hedgeCompletionStartedIndex === null
        ? null
        : Math.max(campaign.btc.fillTimestamp ?? 0, campaign.eth.fillTimestamp ?? 0),
    equityBeforeEntry: campaign.equityBeforeEntry,
    availableMarginBeforeEntry: campaign.equityBeforeEntry,
    btcIntendedQuantity: campaign.btcIntendedQuantity,
    ethIntendedQuantity: campaign.ethIntendedQuantity,
    entryAbortReason,
    btcMaxMarketLeverage: btcMarket.maximumLeverage,
    ethMaxMarketLeverage: ethMarket.maximumLeverage,
    selectedPairLeverage: campaign.sizing.pairLeverage,
    btcMMFraction: 1 / (btcMarket.maximumLeverage * 2),
    ethMMFraction: 1 / (ethMarket.maximumLeverage * 2),
    minimumMarkedAccountEquity: Number.isFinite(campaign.marginAudit.minimumMarkedAccountEquity)
      ? campaign.marginAudit.minimumMarkedAccountEquity
      : null,
    maximumTotalMaintenanceMargin: campaign.marginAudit.maximumTotalMaintenanceMargin,
    minimumMarginHealthRatio: Number.isFinite(campaign.marginAudit.minimumMarginHealthRatio)
      ? campaign.marginAudit.minimumMarginHealthRatio
      : null,
    marginWarning150Breached: campaign.marginAudit.marginWarning150Breached,
    marginWarning120Breached: campaign.marginAudit.marginWarning120Breached,
    marginWarning105Breached: campaign.marginAudit.marginWarning105Breached,
    marginGuardTriggered: campaign.marginAudit.marginGuardTriggered,
    marginGuardTimestamp: campaign.marginAudit.marginGuardTimestamp,
    markedAccountEquityAtMarginGuard: campaign.marginAudit.markedAccountEquityAtMarginGuard,
    totalMaintenanceMarginAtMarginGuard: campaign.marginAudit.totalMaintenanceMarginAtMarginGuard,
    marginHealthRatioAtMarginGuard: campaign.marginAudit.marginHealthRatioAtMarginGuard,
    exitReason: reason,
    exitTriggerTimestamp: triggerTimestamp,
    btcExitPrice: btcExit?.price ?? null,
    ethExitPrice: ethExit?.price ?? null,
    exitFees,
    makerFees: campaign.makerEntryFees + makerExitFees,
    takerFees: campaign.takerEntryFees + takerExitFees,
    fundingPaid: 0,
    fundingReceived: 0,
    fundingMode: 'UNAVAILABLE',
    grossPairPnL,
    netPairPnL: grossPairPnL - totalPairCost,
    totalPairCost,
    holdingBars,
  };
}

export function runBTCEthPairBacktest(input: {
  btcCandles: readonly BTC_candlestick[];
  ethCandles: readonly BTC_candlestick[];
  btcMarket: pair_market;
  ethMarket: pair_market;
  startingEquity: number;
  leverageSource: 'MARKET_METADATA' | 'CLI_OVERRIDE';
}) {
  const synchronized = synchronizePairCandles(input.btcCandles, input.ethCandles),
    candles = synchronized.candles,
    campaigns: closed_pair_campaign[] = [];
  let equity = input.startingEquity,
    peak = equity,
    maximumDrawdown = 0,
    campaign: open_pair | null = null,
    campaignIntents = 0,
    campaignsActivated = 0,
    entryOrders = 0,
    entryFills = 0,
    pairsRequiringHedgeCompletion = 0,
    hedgeCompletionSuccessCount = 0,
    hedgeCompletionFailureCount = 0;
  let closedThisBar: boolean;
  const depositEvents: external_deposit_event[] = [];
  const sizingRejectionCounts: Partial<Record<pair_sizing_failure_reason, number>> = {};
  let lastSizingFailure: {
    reason: pair_sizing_failure_reason;
    diagnostics: pair_sizing_diagnostics;
  } | null = null;
  const finish = (closed: closed_pair_campaign) => {
    campaigns.push(closed);
    equity += closed.netPairPnL;
    peak = Math.max(peak, equity);
    maximumDrawdown = Math.max(maximumDrawdown, peak - equity);
    campaign = null;
    closedThisBar = true;
  };

  for (let index = 0; index < candles.length; index += 1) {
    const point = candles[index]!;
    closedThisBar = false;
    if (campaign === null) {
      const deposit = applyExternalDepositIfRequired(
        equity,
        true,
        point.timestamp.getTime() + 60_000,
      );
      if (deposit.event) depositEvents.push(deposit.event);
      equity = deposit.equity;
      peak = Math.max(peak, equity);
    }
    if (campaign?.exit) {
      const exit = campaign.exit;
      if (index > exit.triggerIndex) {
        if (exit.reason !== 'TAKE_PROFIT') {
          finish(
            closeCampaign(
              campaign,
              exit.reason,
              candles[exit.triggerIndex]!.timestamp.getTime() + 60_000,
              { price: point.btc.open, maker: false },
              { price: point.eth.open, maker: false },
              input.btcMarket,
              input.ethMarket,
              index - campaign.activeIndex!,
            ),
          );
        } else {
          if (
            !exit.btcFill &&
            passiveFill(
              {
                ...campaign.btc,
                side: campaign.btc.side === 'BUY' ? 'SELL' : 'BUY',
                limit: exit.btcLimit,
              },
              point.btc,
              input.btcMarket.tickSize,
            )
          )
            exit.btcFill = { price: exit.btcLimit, index, maker: true };
          if (
            !exit.ethFill &&
            passiveFill(
              {
                ...campaign.eth,
                side: campaign.eth.side === 'BUY' ? 'SELL' : 'BUY',
                limit: exit.ethLimit,
              },
              point.eth,
              input.ethMarket.tickSize,
            )
          )
            exit.ethFill = { price: exit.ethLimit, index, maker: true };
          if (exit.btcFill && exit.ethFill) {
            finish(
              closeCampaign(
                campaign,
                'TAKE_PROFIT',
                candles[exit.triggerIndex]!.timestamp.getTime() + 60_000,
                exit.btcFill,
                exit.ethFill,
                input.btcMarket,
                input.ethMarket,
                index - campaign.activeIndex!,
              ),
            );
          } else if (index > exit.triggerIndex + 1) {
            finish(
              closeCampaign(
                campaign,
                'TAKE_PROFIT',
                candles[exit.triggerIndex]!.timestamp.getTime() + 60_000,
                exit.btcFill ?? { price: point.btc.close, maker: false },
                exit.ethFill ?? { price: point.eth.close, maker: false },
                input.btcMarket,
                input.ethMarket,
                index - campaign.activeIndex!,
              ),
            );
          }
        }
      }
    } else if (campaign && campaign.activeIndex !== null) {
      const marked = calculateMarkedPairAccountEquity({
          realizedAccountCollateral: equity - campaign.entryFees,
          btcSide: campaign.btc.side,
          btcEntryPrice: campaign.btc.fillPrice!,
          btcMarkPrice: point.btc.close,
          btcQuantity: campaign.btc.quantity,
          ethSide: campaign.eth.side,
          ethEntryPrice: campaign.eth.fillPrice!,
          ethMarkPrice: point.eth.close,
          ethQuantity: campaign.eth.quantity,
          accruedFunding: 0,
        }),
        gross = marked.btcUnrealizedPnL + marked.ethUnrealizedPnL,
        makerExitFees =
          point.btc.close * campaign.btc.quantity * input.btcMarket.makerFeeRate +
          point.eth.close * campaign.eth.quantity * input.ethMarket.makerFeeRate,
        takerExitFees =
          point.btc.close * campaign.btc.quantity * input.btcMarket.takerFeeRate +
          point.eth.close * campaign.eth.quantity * input.ethMarket.takerFeeRate,
        maintenance = calculatePairMaintenanceMargin({
          btcQuantity: campaign.btc.quantity,
          ethQuantity: campaign.eth.quantity,
          btcMarkPrice: point.btc.close,
          ethMarkPrice: point.eth.close,
          btcMaximumLeverage: input.btcMarket.maximumLeverage,
          ethMaximumLeverage: input.ethMarket.maximumLeverage,
        }),
        health = evaluatePairMarginHealth(
          marked.markedAccountEquity,
          maintenance.totalMaintenanceMargin,
        );
      campaign.marginAudit.minimumMarkedAccountEquity = Math.min(
        campaign.marginAudit.minimumMarkedAccountEquity,
        marked.markedAccountEquity,
      );
      campaign.marginAudit.maximumTotalMaintenanceMargin = Math.max(
        campaign.marginAudit.maximumTotalMaintenanceMargin,
        maintenance.totalMaintenanceMargin,
      );
      campaign.marginAudit.minimumMarginHealthRatio = Math.min(
        campaign.marginAudit.minimumMarginHealthRatio,
        health.marginHealthRatio,
      );
      campaign.marginAudit.marginWarning150Breached ||= health.warning150Breached;
      campaign.marginAudit.marginWarning120Breached ||= health.warning120Breached;
      campaign.marginAudit.marginWarning105Breached ||= health.warning105Breached;
      if (health.liquidationEligible && !campaign.marginAudit.marginGuardTriggered) {
        campaign.marginAudit.marginGuardTriggered = true;
        campaign.marginAudit.marginGuardTimestamp = point.timestamp.getTime() + 60_000;
        campaign.marginAudit.markedAccountEquityAtMarginGuard = marked.markedAccountEquity;
        campaign.marginAudit.totalMaintenanceMarginAtMarginGuard =
          maintenance.totalMaintenanceMargin;
        campaign.marginAudit.marginHealthRatioAtMarginGuard = health.marginHealthRatio;
      }
      const reason = evaluatePairExit({
        grossPairPnL: gross,
        entryFees: campaign.entryFees,
        expectedMakerExitFees: makerExitFees,
        expectedTakerExitFees: takerExitFees,
        markedAccountEquity: marked.markedAccountEquity,
        totalMaintenanceMargin: maintenance.totalMaintenanceMargin,
      });
      if (reason)
        campaign.exit = {
          reason,
          triggerIndex: index,
          btcLimit: roundLimit(
            point.btc.close,
            campaign.btc.side === 'BUY' ? 'SELL' : 'BUY',
            input.btcMarket.tickSize,
          ),
          ethLimit: roundLimit(
            point.eth.close,
            campaign.eth.side === 'BUY' ? 'SELL' : 'BUY',
            input.ethMarket.tickSize,
          ),
          btcFill: null,
          ethFill: null,
        };
    } else if (campaign) {
      if (index >= campaign.firstEligibleIndex) {
        if (
          campaign.hedgeCompletionStartedIndex !== null &&
          index > campaign.hedgeCompletionStartedIndex
        ) {
          const btcMissing = campaign.btc.fillPrice === null,
            missing = btcMissing ? campaign.btc : campaign.eth,
            missingMarket = btcMissing ? input.btcMarket : input.ethMarket,
            pointCandle = btcMissing ? point.btc : point.eth,
            first = btcMissing ? campaign.eth : campaign.btc,
            aggressiveLimit =
              missing.side === 'BUY'
                ? roundUp(pointCandle.close, missingMarket.tickSize)
                : roundDown(pointCandle.close, missingMarket.tickSize),
            firstNotional = first.fillPrice! * first.quantity,
            firstMargin = firstNotional / campaign.sizing.pairLeverage,
            firstCurrentPrice = btcMissing ? point.eth.close : point.btc.close,
            hedgeAvailableMargin =
              campaign.equityBeforeEntry +
              pnl(first.side, first.fillPrice!, firstCurrentPrice, first.quantity) -
              campaign.entryFees;
          try {
            if (hedgeAvailableMargin <= firstMargin) throw new Error('MARGIN_GUARD_FORCES_ABORT');
            missing.quantity = sizeMissingHedgeLeg({
              firstLegNotional: firstNotional,
              executablePrice: aggressiveLimit,
              market: missingMarket,
              existingInitialMargin: firstMargin,
              availableMargin: hedgeAvailableMargin,
              pairLeverage: campaign.sizing.pairLeverage,
            });
            missing.limit = aggressiveLimit;
            missing.fillPrice = aggressiveLimit;
            missing.fillIndex = index;
            missing.fillTimestamp = point.timestamp.getTime() + 60_000;
            const fee = aggressiveLimit * missing.quantity * missingMarket.takerFeeRate;
            campaign.entryFees += fee;
            campaign.takerEntryFees += fee;
            entryFills += 1;
            const btcNotional = campaign.btc.fillPrice! * campaign.btc.quantity,
              ethNotional = campaign.eth.fillPrice! * campaign.eth.quantity,
              btcInitialMargin = btcNotional / campaign.sizing.pairLeverage,
              ethInitialMargin = ethNotional / campaign.sizing.pairLeverage;
            campaign.sizing = {
              ...campaign.sizing,
              btcQuantity: campaign.btc.quantity,
              ethQuantity: campaign.eth.quantity,
              btcNotional,
              ethNotional,
              btcInitialMargin,
              ethInitialMargin,
              totalInitialMargin: btcInitialMargin + ethInitialMargin,
              marginUtilization: (btcInitialMargin + ethInitialMargin) / campaign.equityBeforeEntry,
              notionalMismatch: Math.abs(btcNotional - ethNotional),
              notionalMismatchBps:
                (Math.abs(btcNotional - ethNotional) /
                  Math.max((btcNotional + ethNotional) / 2, Number.EPSILON)) *
                10_000,
            };
            campaign.activeIndex = index;
            campaignsActivated += 1;
            hedgeCompletionSuccessCount += 1;
          } catch (error) {
            const reason =
              error instanceof Error &&
              [
                'INVALID_MARKET_RULES',
                'SECOND_LEG_BELOW_MINIMUM_SIZE',
                'PAIR_MARGIN_CAP_EXCEEDED',
                'MARGIN_GUARD_FORCES_ABORT',
              ].includes(error.message)
                ? (error.message as pair_entry_abort_reason)
                : 'HEDGE_COMPLETION_IMPOSSIBLE';
            hedgeCompletionFailureCount += 1;
            const btcExit = campaign.btc.fillPrice
                ? { price: point.btc.close, maker: false }
                : null,
              ethExit = campaign.eth.fillPrice ? { price: point.eth.close, maker: false } : null;
            finish(
              closeCampaign(
                campaign,
                'ENTRY_ABORT',
                point.timestamp.getTime() + 60_000,
                btcExit,
                ethExit,
                input.btcMarket,
                input.ethMarket,
                0,
                reason,
              ),
            );
          }
        } else {
          if (
            campaign.btc.fillPrice === null &&
            passiveFill(campaign.btc, point.btc, input.btcMarket.tickSize)
          ) {
            campaign.btc.fillPrice = campaign.btc.limit;
            campaign.btc.fillIndex = index;
            campaign.btc.fillTimestamp = point.timestamp.getTime() + 60_000;
            const fee = campaign.btc.limit * campaign.btc.quantity * input.btcMarket.makerFeeRate;
            campaign.entryFees += fee;
            campaign.makerEntryFees += fee;
            entryFills += 1;
          }
          if (
            campaign.eth.fillPrice === null &&
            passiveFill(campaign.eth, point.eth, input.ethMarket.tickSize)
          ) {
            campaign.eth.fillPrice = campaign.eth.limit;
            campaign.eth.fillIndex = index;
            campaign.eth.fillTimestamp = point.timestamp.getTime() + 60_000;
            const fee = campaign.eth.limit * campaign.eth.quantity * input.ethMarket.makerFeeRate;
            campaign.entryFees += fee;
            campaign.makerEntryFees += fee;
            entryFills += 1;
          }
          if (campaign.btc.fillPrice !== null && campaign.eth.fillPrice !== null) {
            campaign.activeIndex = index;
            campaignsActivated += 1;
          } else if (
            index === campaign.firstEligibleIndex &&
            campaign.btc.fillPrice === null &&
            campaign.eth.fillPrice === null
          ) {
            campaign = null;
            closedThisBar = true;
          } else if (campaign.btc.fillPrice !== null || campaign.eth.fillPrice !== null) {
            campaign.hedgeCompletionStartedIndex = index;
            pairsRequiringHedgeCompletion += 1;
          }
        }
      }
    }

    if (campaign === null && !closedThisBar) {
      const signal = calculatePairSignal(candles, index);
      if (signal?.direction) {
        const btcSide = signal.direction === 'LONG_BTC_SHORT_ETH' ? 'BUY' : 'SELL',
          ethSide = btcSide === 'BUY' ? 'SELL' : 'BUY',
          btcLimit = roundLimit(point.btc.close, btcSide, input.btcMarket.tickSize),
          ethLimit = roundLimit(point.eth.close, ethSide, input.ethMarket.tickSize),
          sizingInput = {
            availableMargin: equity,
            btcPrice: btcLimit,
            ethPrice: ethLimit,
            btcMarket: input.btcMarket,
            ethMarket: input.ethMarket,
          };
        let sizing: pair_sizing;
        try {
          sizing = sizeEqualNotionalPair(sizingInput);
        } catch (error) {
          if (!(error instanceof pair_sizing_error)) throw error;
          sizingRejectionCounts[error.reason] = (sizingRejectionCounts[error.reason] ?? 0) + 1;
          lastSizingFailure = { reason: error.reason, diagnostics: error.diagnostics };
          continue;
        }
        campaignIntents += 1;
        entryOrders += 2;
        campaign = {
          campaignId: `pair:${point.timestamp.getTime()}:${signal.direction}`,
          signalIndex: index,
          signalTimestamp: point.timestamp.getTime() + 60_000,
          relativeReturn3: signal.relativeReturn3,
          direction: signal.direction,
          sizing,
          btc: {
            side: btcSide,
            limit: btcLimit,
            quantity: sizing.btcQuantity,
            fillPrice: null,
            fillIndex: null,
            fillTimestamp: null,
          },
          eth: {
            side: ethSide,
            limit: ethLimit,
            quantity: sizing.ethQuantity,
            fillPrice: null,
            fillIndex: null,
            fillTimestamp: null,
          },
          entryFees: 0,
          makerEntryFees: 0,
          takerEntryFees: 0,
          equityBeforeEntry: equity,
          btcIntendedQuantity: sizing.btcQuantity,
          ethIntendedQuantity: sizing.ethQuantity,
          hedgeCompletionStartedIndex: null,
          marginAudit: {
            minimumMarkedAccountEquity: Number.POSITIVE_INFINITY,
            maximumTotalMaintenanceMargin: 0,
            minimumMarginHealthRatio: Number.POSITIVE_INFINITY,
            marginWarning150Breached: false,
            marginWarning120Breached: false,
            marginWarning105Breached: false,
            marginGuardTriggered: false,
            marginGuardTimestamp: null,
            markedAccountEquityAtMarginGuard: null,
            totalMaintenanceMarginAtMarginGuard: null,
            marginHealthRatioAtMarginGuard: null,
          },
          firstEligibleIndex: index + 1,
          activeIndex: null,
          exit: null,
        };
      }
    }
  }

  const net = campaigns.map((value) => value.netPairPnL),
    gross = campaigns.map((value) => value.grossPairPnL),
    completed = campaigns.filter((value) => value.exitReason !== 'ENTRY_ABORT'),
    utilizations = campaigns.map((value) => value.marginUtilization),
    legging = completed.flatMap((value) => value.entryLeggingBars ?? []),
    holding = completed.map((value) => value.holdingBars),
    notional = campaigns.flatMap((value) => [value.btcNotional, value.ethNotional]),
    mismatch = campaigns.map(
      (value) =>
        (Math.abs(value.btcNotional - value.ethNotional) /
          Math.max((value.btcNotional + value.ethNotional) / 2, Number.EPSILON)) *
        10_000,
    ),
    wins = completed.filter((value) => value.netPairPnL > 0),
    hedgeCompletionBars = completed
      .filter((value) => value.requiredHedgeCompletion)
      .map((value) => value.hedgeCompletionBars),
    totalDeposited = depositEvents.reduce((sum, event) => sum + event.amount, 0),
    totalCapitalContributed = input.startingEquity + totalDeposited,
    tradingNetPnL = equity - totalCapitalContributed,
    campaignsBeforeDeposits = depositEvents.map(
      (event) => campaigns.filter((value) => value.exitTriggerTimestamp < event.timestamp).length,
    ),
    campaignsBetweenDeposits = campaignsBeforeDeposits
      .slice(1)
      .map((value, index) => value - campaignsBeforeDeposits[index]!),
    daysBetweenDeposits = depositEvents
      .slice(1)
      .map((event, index) => (event.timestamp - depositEvents[index]!.timestamp) / 86_400_000),
    minimumMarginHealthRatios = completed.flatMap((value) =>
      value.minimumMarginHealthRatio === null ? [] : [value.minimumMarginHealthRatio],
    );
  return {
    strategyId: BTCEthPairStrategy.strategyId,
    data: synchronized.data,
    startingAccountEquity: input.startingEquity,
    endingAccountEquity: equity,
    peakEquity: peak,
    maximumDrawdown,
    btcMaxLeverage: input.btcMarket.maximumLeverage,
    ethMaxLeverage: input.ethMarket.maximumLeverage,
    pairLeverage: calculatePairLeverage(
      input.btcMarket.maximumLeverage,
      input.ethMarket.maximumLeverage,
    ),
    leverageSource: input.leverageSource,
    minimumMarginUtilization: 0.75,
    actualMarginUtilization: {
      ...distribution(utilizations),
      p25: percentile(utilizations, 0.25),
      p75: percentile(utilizations, 0.75),
    },
    percentCampaignsAtOrAbove75PctMargin:
      campaigns.length === 0
        ? 0
        : campaigns.filter((value) => value.marginUtilization >= 0.75).length / campaigns.length,
    campaignIntents,
    campaignsActivated,
    campaignsCompleted: campaigns.length,
    directionCounts: {
      LONG_BTC_SHORT_ETH: campaigns.filter((value) => value.direction === 'LONG_BTC_SHORT_ETH')
        .length,
      SHORT_BTC_LONG_ETH: campaigns.filter((value) => value.direction === 'SHORT_BTC_LONG_ETH')
        .length,
    },
    entryOrders,
    entryFills,
    pairEntryIntents: campaignIntents,
    pairsFilledBothLegs: campaignsActivated,
    pairsRequiringHedgeCompletion,
    hedgeCompletionSuccessCount,
    hedgeCompletionFailureCount,
    hedgeCompletionBars: {
      ...distribution(hedgeCompletionBars),
      p25: percentile(hedgeCompletionBars, 0.25),
      p75: percentile(hedgeCompletionBars, 0.75),
    },
    sizingRejectionCounts,
    lastSizingFailure,
    entryAbortCount: campaigns.filter((value) => value.exitReason === 'ENTRY_ABORT').length,
    entryAbortReasons: Object.fromEntries(
      [...new Set(campaigns.flatMap((value) => value.entryAbortReason ?? []))].map((reason) => [
        reason,
        campaigns.filter((value) => value.entryAbortReason === reason).length,
      ]),
    ),
    entryAbortEconomics: {
      grossPnL: campaigns
        .filter((value) => value.exitReason === 'ENTRY_ABORT')
        .reduce((sum, value) => sum + value.grossPairPnL, 0),
      netPnL: campaigns
        .filter((value) => value.exitReason === 'ENTRY_ABORT')
        .reduce((sum, value) => sum + value.netPairPnL, 0),
      fees: campaigns
        .filter((value) => value.exitReason === 'ENTRY_ABORT')
        .reduce((sum, value) => sum + value.totalPairCost, 0),
    },
    entryFillSeparationBars: { ...distribution(legging), p75: percentile(legging, 0.75) },
    sameBarPairEntryCount: completed.filter((value) => value.entryLeggingBars === 0).length,
    oneBarLeggedEntryCount: completed.filter((value) => value.entryLeggingBars === 1).length,
    grossPairPnL: gross.reduce((sum, value) => sum + value, 0),
    netPairPnL: net.reduce((sum, value) => sum + value, 0),
    makerFees: campaigns.reduce((sum, value) => sum + value.makerFees, 0),
    takerFees: campaigns.reduce((sum, value) => sum + value.takerFees, 0),
    makerEntryFees: campaigns.reduce((sum, value) => sum + value.makerEntryFees, 0),
    takerEntryFees: campaigns.reduce((sum, value) => sum + value.takerEntryFees, 0),
    makerExitFees: campaigns.reduce((sum, value) => sum + value.makerExitFees, 0),
    takerExitFees: campaigns.reduce((sum, value) => sum + value.takerExitFees, 0),
    fundingPaid: 0,
    fundingReceived: 0,
    fundingMode: 'UNAVAILABLE' as const,
    totalPairCosts: campaigns.reduce((sum, value) => sum + value.totalPairCost, 0),
    grossProfitFactor: profitFactor(gross),
    netProfitFactor: profitFactor(net),
    winRate: completed.length === 0 ? 0 : wins.length / completed.length,
    exitReasonCounts: Object.fromEntries(
      ['TAKE_PROFIT', 'STOP_LOSS', 'MARGIN_GUARD', 'ENTRY_ABORT'].map((reason) => [
        reason,
        campaigns.filter((value) => value.exitReason === reason).length,
      ]),
    ),
    takeProfitCount: campaigns.filter((value) => value.exitReason === 'TAKE_PROFIT').length,
    stopLossCount: campaigns.filter((value) => value.exitReason === 'STOP_LOSS').length,
    marginGuardCount: campaigns.filter((value) => value.exitReason === 'MARGIN_GUARD').length,
    historicalFundingMode: 'UNAVAILABLE_ZERO_CONTRIBUTION' as const,
    maintenanceMarginMode: BTCEthPairStrategy.marginGuardMode,
    marginGuardFormula: 'ACCOUNT_EQUITY_LT_TOTAL_MAINTENANCE_MARGIN' as const,
    warning150CampaignCount: completed.filter((value) => value.marginWarning150Breached).length,
    warning120CampaignCount: completed.filter((value) => value.marginWarning120Breached).length,
    warning105CampaignCount: completed.filter((value) => value.marginWarning105Breached).length,
    marginHealthBelow100CampaignCount: completed.filter(
      (value) => value.minimumMarginHealthRatio !== null && value.minimumMarginHealthRatio < 1,
    ).length,
    minimumMarginHealthRatio: {
      ...distribution(minimumMarginHealthRatios),
      p25: percentile(minimumMarginHealthRatios, 0.25),
      p75: percentile(minimumMarginHealthRatios, 0.75),
    },
    marginHealthWarnings: {
      below150Pct: completed.filter((value) => value.marginWarning150Breached).length,
      below120Pct: completed.filter((value) => value.marginWarning120Breached).length,
      below105Pct: completed.filter((value) => value.marginWarning105Breached).length,
      below100Pct: completed.filter(
        (value) => value.minimumMarginHealthRatio !== null && value.minimumMarginHealthRatio < 1,
      ).length,
    },
    minimumCampaignMarginHealthRatio: {
      ...distribution(minimumMarginHealthRatios),
      p25: percentile(minimumMarginHealthRatios, 0.25),
      p75: percentile(minimumMarginHealthRatios, 0.75),
    },
    holdingBars: {
      ...distribution(holding),
      p25: percentile(holding, 0.25),
      p75: percentile(holding, 0.75),
    },
    netProfitToCostOnWins: distribution(
      wins.map((value) => value.netPairPnL / value.totalPairCost),
    ),
    netLossToCostOnStops: distribution(
      campaigns
        .filter((value) => value.exitReason === 'STOP_LOSS')
        .map((value) => value.netPairPnL / value.totalPairCost),
    ),
    notionalPerLeg: distribution(notional),
    notionalMismatchBps: {
      ...distribution(mismatch),
      p25: percentile(mismatch, 0.25),
      p75: percentile(mismatch, 0.75),
    },
    sizeRejectCount: Object.values(sizingRejectionCounts).reduce((sum, value) => sum + value, 0),
    sizeRejectReasons: sizingRejectionCounts,
    initialCapital: input.startingEquity,
    depositCount: depositEvents.length,
    totalDeposited,
    totalCapitalContributed,
    tradingNetPnL,
    netReturnOnContributedCapital:
      totalCapitalContributed > 0 ? tradingNetPnL / totalCapitalContributed : null,
    depositEvents,
    firstDepositTimestamp: depositEvents[0]?.timestamp ?? null,
    lastDepositTimestamp: depositEvents.at(-1)?.timestamp ?? null,
    campaignsCompletedBeforeFirstDeposit: campaignsBeforeDeposits[0] ?? null,
    daysUntilFirstDeposit:
      depositEvents[0] && candles[0]
        ? (depositEvents[0].timestamp - candles[0].timestamp.getTime()) / 86_400_000
        : null,
    averageCampaignsBetweenDeposits:
      campaignsBetweenDeposits.length === 0
        ? null
        : campaignsBetweenDeposits.reduce((sum, value) => sum + value, 0) /
          campaignsBetweenDeposits.length,
    averageDaysBetweenDeposits:
      daysBetweenDeposits.length === 0
        ? null
        : daysBetweenDeposits.reduce((sum, value) => sum + value, 0) / daysBetweenDeposits.length,
    minimumRealizedEquityBeforeDeposit:
      depositEvents.length === 0
        ? null
        : Math.min(...depositEvents.map((event) => event.equityBeforeDeposit)),
    maximumRealizedEquityAfterDeposit:
      depositEvents.length === 0
        ? null
        : Math.max(...depositEvents.map((event) => event.equityAfterDeposit)),
    marginGuard: {
      mode: BTCEthPairStrategy.marginGuardMode,
      calculation:
        'markedAccountEquity < abs(btcQuantity * btcMarkPrice) / (btcMaximumLeverage * 2) + abs(ethQuantity * ethMarkPrice) / (ethMaximumLeverage * 2)',
      equalityTriggersGuard: false,
      warningRatios: [1.5, 1.2, 1.05],
    },
    campaigns,
    liveExecutionEnabled: false as const,
  };
}
