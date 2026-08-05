import { z } from 'zod';

import type {
  research_book,
  research_segment,
  research_source,
  research_trade_classification,
} from './research_dataset.js';
import type { research_sample } from './research_types.js';
import type { research_market_metadata } from './research_market_metadata.js';

export const MAKER_SIMULATOR_VERSION = 'POST_ONLY_MAKER_V1';
export const MAKER_FILL_ASSUMPTIONS = ['STRICT_TRADE_THROUGH', 'TOUCH_WITH_FLOW'] as const;
export type maker_fill_assumption = (typeof MAKER_FILL_ASSUMPTIONS)[number];
export type maker_order_state =
  | 'CREATED'
  | 'ACTIVE'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REJECTED_POST_ONLY'
  | 'REJECTED_TOO_SMALL';

const EnvironmentSchema = z.object({
  MAKER_SIMULATOR_ENTRY_OFFSET_TICKS: z.coerce.number().int().min(0).max(100).default(0),
  MAKER_SIMULATOR_TTL_SECONDS: z.coerce.number().int().min(1).max(300).default(30),
  MAKER_SIMULATOR_PLACEMENT_LATENCY_MS: z.coerce.number().int().min(0).max(60_000).default(250),
  MAKER_SIMULATOR_CANCEL_LATENCY_MS: z.coerce.number().int().min(0).max(60_000).default(250),
  MAKER_SIMULATOR_FEE_RATE: z.coerce.number().min(-0.01).max(0.01).default(0.00011),
  MAKER_SIMULATOR_STARTING_EQUITY: z.coerce.number().positive().default(10_000),
  MAKER_SIMULATOR_RISK_PER_CANDIDATE: z.coerce.number().positive().max(0.1).default(0.0025),
  MAKER_SIMULATOR_LEVERAGE_CAP: z.coerce.number().positive().max(10).default(2),
});

export type maker_simulator_config = {
  entryOffsetTicks: number;
  ttlSeconds: number;
  placementLatencyMs: number;
  cancelLatencyMs: number;
  feeRate: number;
  startingEquity: number;
  riskPerCandidate: number;
  leverageCap: number;
};

export function loadMakerSimulatorConfig(
  environment: Record<string, string | undefined> = process.env,
): maker_simulator_config {
  const value = EnvironmentSchema.parse(environment);
  return {
    entryOffsetTicks: value.MAKER_SIMULATOR_ENTRY_OFFSET_TICKS,
    ttlSeconds: value.MAKER_SIMULATOR_TTL_SECONDS,
    placementLatencyMs: value.MAKER_SIMULATOR_PLACEMENT_LATENCY_MS,
    cancelLatencyMs: value.MAKER_SIMULATOR_CANCEL_LATENCY_MS,
    feeRate: value.MAKER_SIMULATOR_FEE_RATE,
    startingEquity: value.MAKER_SIMULATOR_STARTING_EQUITY,
    riskPerCandidate: value.MAKER_SIMULATOR_RISK_PER_CANDIDATE,
    leverageCap: value.MAKER_SIMULATOR_LEVERAGE_CAP,
  };
}

export type maker_market_metadata = research_market_metadata;

export function validateMakerMarketMetadata(
  metadata: maker_market_metadata | null,
  candidateMarketAddresses: readonly string[],
  microstructureMarketAddress: string,
): maker_market_metadata {
  if (metadata === null)
    throw new Error(
      'Normalized BTC/USD market metadata is unavailable in the research database; run npm run build:research-dataset first',
    );
  const mismatches = candidateMarketAddresses.filter(
    (marketAddress) => marketAddress !== metadata.marketAddress,
  );
  if (mismatches.length > 0)
    throw new Error(
      `Research candidate market address does not match metadata snapshot ${metadata.marketAddress}`,
    );
  if (microstructureMarketAddress !== metadata.marketAddress)
    throw new Error(
      `Microstructure market address ${microstructureMarketAddress} does not match metadata snapshot ${metadata.marketAddress}`,
    );
  return metadata;
}
export type maker_fill = {
  economicTradeId: string;
  timestamp: string;
  price: number;
  quantity: number;
  reason: maker_fill_assumption;
};
export type maker_markout = {
  timestamp: string | null;
  observationTime?: string;
  midPrice: number | null;
  return: number | null;
  directionAdjustedReturn: number | null;
};
export type maker_simulation_result = {
  simulatorVersion: string;
  featureVersion: string;
  fillAssumption: maker_fill_assumption;
  candidateId: string;
  marketAddress: string;
  candidateType: research_sample['candidate']['candidateType'];
  direction: research_sample['candidate']['direction'];
  regime: research_sample['candidate']['regime'];
  state: maker_order_state;
  events: Array<{ state: maker_order_state; timestamp: string }>;
  decisionTime: string;
  activeTime: string;
  expiryTime: string;
  cancelRequestedTime: string | null;
  cancelEffectiveTime: string | null;
  initialBook: research_book | null;
  limitPrice: number | null;
  requestedQuantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  averageFillPrice: number | null;
  makerFees: number;
  firstFillTime: string | null;
  fullFillTime: string | null;
  timeToFirstFillMs: number | null;
  timeToFullFillMs: number | null;
  fills: maker_fill[];
  markouts: Record<string, maker_markout>;
  adverseSelection: number | null;
  fillReason: maker_fill_assumption | null;
  rejectionReason: string | null;
  confidence: 'NONE' | 'CONSERVATIVE_TRADE_THROUGH' | 'LEVEL1_FLOW_PROXY';
};

function isInsideSegment(timestampMs: number, segments: readonly research_segment[]): boolean {
  return segments.some(
    (segment) => timestampMs >= segment.startTimeMs && timestampMs < segment.endTimeMs,
  );
}

function latestBookAt(source: research_source, timeMs: number): research_book | undefined {
  return source.books
    .filter(
      (book) =>
        book.receivedAtMs <= timeMs &&
        isInsideSegment(book.receivedAtMs, source.compatibleSegments),
    )
    .sort((left, right) => right.receivedAtMs - left.receivedAtMs)[0];
}

function roundDown(value: number, step: number): number {
  return Number((Math.floor((value + Number.EPSILON) / step) * step).toPrecision(15));
}

function isEligibleTrade(
  trade: research_trade_classification,
  direction: 'LONG' | 'SHORT',
): boolean {
  return (
    !trade.ambiguous &&
    trade.source !== 'UNKNOWN' &&
    trade.side === (direction === 'LONG' ? 'SELL' : 'BUY')
  );
}

function buildRejectedResult(
  base: Omit<
    maker_simulation_result,
    | 'state'
    | 'limitPrice'
    | 'requestedQuantity'
    | 'filledQuantity'
    | 'remainingQuantity'
    | 'averageFillPrice'
    | 'makerFees'
    | 'firstFillTime'
    | 'fullFillTime'
    | 'timeToFirstFillMs'
    | 'timeToFullFillMs'
    | 'fills'
    | 'markouts'
    | 'adverseSelection'
    | 'fillReason'
    | 'rejectionReason'
    | 'confidence'
  >,
  state: 'REJECTED_POST_ONLY' | 'REJECTED_TOO_SMALL',
  timestamp: string,
  reason: string,
  limitPrice: number | null,
  requestedQuantity: number,
): maker_simulation_result {
  return {
    ...base,
    state,
    events: [...base.events, { state, timestamp }],
    cancelRequestedTime: null,
    cancelEffectiveTime: null,
    limitPrice,
    requestedQuantity,
    filledQuantity: 0,
    remainingQuantity: requestedQuantity,
    averageFillPrice: null,
    makerFees: 0,
    firstFillTime: null,
    fullFillTime: null,
    timeToFirstFillMs: null,
    timeToFullFillMs: null,
    fills: [],
    markouts: {},
    adverseSelection: null,
    fillReason: null,
    rejectionReason: reason,
    confidence: 'NONE',
  };
}

export function simulateMakerOrder(
  sample: research_sample,
  source: research_source,
  metadata: maker_market_metadata,
  config: maker_simulator_config,
  assumption: maker_fill_assumption,
): maker_simulation_result {
  const decisionTimeMs = Date.parse(sample.candidate.availableAtTime);
  const activeTimeMs = decisionTimeMs + config.placementLatencyMs;
  const expiryTimeMs = activeTimeMs + config.ttlSeconds * 1_000;
  const cancelEffectiveTimeMs = expiryTimeMs + config.cancelLatencyMs;
  const initialBook = latestBookAt(source, decisionTimeMs);
  const created = { state: 'CREATED' as const, timestamp: new Date(decisionTimeMs).toISOString() };
  const base = {
    simulatorVersion: MAKER_SIMULATOR_VERSION,
    featureVersion: sample.featureVersion,
    fillAssumption: assumption,
    candidateId: sample.candidateId,
    marketAddress: sample.marketAddress,
    candidateType: sample.candidate.candidateType,
    direction: sample.candidate.direction,
    regime: sample.candidate.regime,
    events: [created],
    decisionTime: sample.candidate.availableAtTime,
    activeTime: new Date(activeTimeMs).toISOString(),
    expiryTime: new Date(expiryTimeMs).toISOString(),
    cancelRequestedTime: null,
    cancelEffectiveTime: null,
    initialBook: initialBook ?? null,
  };
  if (initialBook === undefined)
    return buildRejectedResult(
      base,
      'REJECTED_POST_ONLY',
      new Date(activeTimeMs).toISOString(),
      'NO_DECISION_BOOK',
      null,
      0,
    );

  const limitPrice =
    sample.candidate.direction === 'LONG'
      ? initialBook.bestBid - config.entryOffsetTicks * metadata.tickSize
      : initialBook.bestAsk + config.entryOffsetTicks * metadata.tickSize;
  const effectiveLeverage = Math.min(config.leverageCap, metadata.maximumLeverage);
  const riskNotional = Math.min(
    config.startingEquity * config.riskPerCandidate * effectiveLeverage,
    config.startingEquity * effectiveLeverage,
  );
  const requestedQuantity = roundDown(riskNotional / initialBook.midPrice, metadata.lotSize);
  if (requestedQuantity < metadata.minimumSize)
    return buildRejectedResult(
      base,
      'REJECTED_TOO_SMALL',
      new Date(activeTimeMs).toISOString(),
      'BELOW_MINIMUM_SIZE',
      limitPrice,
      requestedQuantity,
    );

  const activeBook = latestBookAt(source, activeTimeMs);
  const crosses =
    activeBook === undefined ||
    (sample.candidate.direction === 'LONG'
      ? limitPrice >= activeBook.bestAsk
      : limitPrice <= activeBook.bestBid);
  if (crosses)
    return buildRejectedResult(
      base,
      'REJECTED_POST_ONLY',
      new Date(activeTimeMs).toISOString(),
      activeBook === undefined ? 'NO_ACTIVE_BOOK' : 'WOULD_CROSS_ACTIVE_BOOK',
      limitPrice,
      requestedQuantity,
    );

  const events: maker_simulation_result['events'] = [
    created,
    { state: 'ACTIVE', timestamp: new Date(activeTimeMs).toISOString() },
  ];
  let remaining = requestedQuantity;
  const fills: maker_fill[] = [];
  const seenEconomicTrades = new Set<string>();
  const trades = source.trades
    .filter(
      (trade) =>
        trade.receivedAtMs >= activeTimeMs &&
        trade.receivedAtMs < cancelEffectiveTimeMs &&
        isInsideSegment(trade.receivedAtMs, source.compatibleSegments),
    )
    .sort(
      (left, right) =>
        left.receivedAtMs - right.receivedAtMs ||
        left.economicTradeId.localeCompare(right.economicTradeId),
    );
  for (const trade of trades) {
    if (remaining <= 0 || seenEconomicTrades.has(trade.economicTradeId)) continue;
    seenEconomicTrades.add(trade.economicTradeId);
    if (!isEligibleTrade(trade, sample.candidate.direction)) continue;
    const priceEligible =
      sample.candidate.direction === 'LONG'
        ? assumption === 'STRICT_TRADE_THROUGH'
          ? trade.price < limitPrice
          : trade.price <= limitPrice
        : assumption === 'STRICT_TRADE_THROUGH'
          ? trade.price > limitPrice
          : trade.price >= limitPrice;
    if (!priceEligible) continue;
    const quantity = Math.min(remaining, trade.size);
    if (quantity <= 0) continue;
    const timestamp = new Date(trade.receivedAtMs).toISOString();
    fills.push({
      economicTradeId: trade.economicTradeId,
      timestamp,
      price: limitPrice,
      quantity,
      reason: assumption,
    });
    remaining = Number((remaining - quantity).toPrecision(15));
    events.push({ state: remaining > 0 ? 'PARTIALLY_FILLED' : 'FILLED', timestamp });
  }

  const filledQuantity = Number((requestedQuantity - remaining).toPrecision(15));
  const wasFilled = remaining === 0;
  if (!wasFilled) {
    events.push({ state: 'CANCEL_REQUESTED', timestamp: new Date(expiryTimeMs).toISOString() });
    events.push({
      state: filledQuantity === 0 ? 'EXPIRED' : 'CANCELLED',
      timestamp: new Date(cancelEffectiveTimeMs).toISOString(),
    });
  }
  const averageFillPrice =
    filledQuantity === 0
      ? null
      : fills.reduce((sum, fill) => sum + fill.price * fill.quantity, 0) / filledQuantity;
  const firstFillTime = fills[0]?.timestamp ?? null;
  const fullFillTime = wasFilled ? (fills.at(-1)?.timestamp ?? null) : null;
  const markouts = [5, 15, 30, 60].reduce<Record<string, maker_markout>>((values, seconds) => {
    if (averageFillPrice === null || firstFillTime === null)
      return {
        ...values,
        [seconds]: {
          timestamp: null,
          midPrice: null,
          return: null,
          directionAdjustedReturn: null,
        },
      };
    const targetTimeMs = Date.parse(firstFillTime) + seconds * 1_000;
    const book = latestBookAt(source, targetTimeMs);
    if (book === undefined || book.receivedAtMs < Date.parse(firstFillTime))
      return {
        ...values,
        [seconds]: {
          timestamp: null,
          midPrice: null,
          return: null,
          directionAdjustedReturn: null,
        },
      };
    const value = book.midPrice / averageFillPrice - 1;
    return {
      ...values,
      [seconds]: {
        timestamp: new Date(targetTimeMs).toISOString(),
        observationTime: new Date(book.receivedAtMs).toISOString(),
        midPrice: book.midPrice,
        return: value,
        directionAdjustedReturn: sample.candidate.direction === 'LONG' ? value : -value,
      },
    };
  }, {});
  const markout5 = markouts['5'];
  return {
    ...base,
    state: wasFilled ? 'FILLED' : filledQuantity > 0 ? 'CANCELLED' : 'EXPIRED',
    events,
    cancelRequestedTime: wasFilled ? null : new Date(expiryTimeMs).toISOString(),
    cancelEffectiveTime: wasFilled ? null : new Date(cancelEffectiveTimeMs).toISOString(),
    limitPrice,
    requestedQuantity,
    filledQuantity,
    remainingQuantity: remaining,
    averageFillPrice,
    makerFees: fills.reduce((sum, fill) => sum + fill.price * fill.quantity * config.feeRate, 0),
    firstFillTime,
    fullFillTime,
    timeToFirstFillMs: firstFillTime === null ? null : Date.parse(firstFillTime) - activeTimeMs,
    timeToFullFillMs: fullFillTime === null ? null : Date.parse(fullFillTime) - activeTimeMs,
    fills,
    markouts,
    adverseSelection:
      markout5?.directionAdjustedReturn == null ? null : -markout5.directionAdjustedReturn,
    fillReason: fills.length === 0 ? null : assumption,
    rejectionReason: null,
    confidence:
      assumption === 'STRICT_TRADE_THROUGH' ? 'CONSERVATIVE_TRADE_THROUGH' : 'LEVEL1_FLOW_PROXY',
  };
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? null)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function summarizeMakerSimulations(results: readonly maker_simulation_result[]) {
  const summarize = (orders: readonly maker_simulation_result[]) => {
    const eligible = orders.filter(
      (order) => order.state !== 'REJECTED_POST_ONLY' && order.state !== 'REJECTED_TOO_SMALL',
    );
    const partial = eligible.filter(
      (order) => order.filledQuantity > 0 && order.remainingQuantity > 0,
    );
    const full = eligible.filter((order) => order.state === 'FILLED');
    const noFill = eligible.filter((order) => order.filledQuantity === 0);
    const markoutSummary = Object.fromEntries(
      [5, 15, 30, 60].map((seconds) => {
        const values = orders.flatMap((order) => {
          const value = order.markouts[String(seconds)]?.directionAdjustedReturn;
          return value == null ? [] : [value];
        });
        return [
          seconds,
          {
            sampleCount: values.length,
            averageDirectionAdjustedMarkout:
              values.length === 0
                ? null
                : values.reduce((sum, value) => sum + value, 0) / values.length,
          },
        ];
      }),
    );
    return {
      candidateCount: new Set(orders.map((order) => order.candidateId)).size,
      eligibleOrderCount: eligible.length,
      rejectedPostOnlyCount: orders.filter((order) => order.state === 'REJECTED_POST_ONLY').length,
      rejectedTooSmallCount: orders.filter((order) => order.state === 'REJECTED_TOO_SMALL').length,
      partialFillRate: eligible.length === 0 ? 0 : partial.length / eligible.length,
      fullFillRate: eligible.length === 0 ? 0 : full.length / eligible.length,
      noFillOrExpiryRate: eligible.length === 0 ? 0 : noFill.length / eligible.length,
      medianTimeToFillMs: median(
        eligible.flatMap((order) =>
          order.timeToFirstFillMs === null ? [] : [order.timeToFirstFillMs],
        ),
      ),
      averageMakerFee:
        eligible.length === 0
          ? 0
          : eligible.reduce((sum, order) => sum + order.makerFees, 0) / eligible.length,
      markouts: markoutSummary,
    };
  };
  const groupBy = (key: 'candidateType' | 'direction' | 'regime' | 'fillAssumption') =>
    Object.fromEntries(
      [...new Set(results.map((result) => result[key]))]
        .sort()
        .map((value) => [value, summarize(results.filter((result) => result[key] === value))]),
    );
  const eligibleCandidates = new Set(
    results
      .filter(
        (order) => order.state !== 'REJECTED_POST_ONLY' && order.state !== 'REJECTED_TOO_SMALL',
      )
      .map((order) => order.candidateId),
  ).size;
  return {
    status: eligibleCandidates < 100 ? ('NOT_ENOUGH_DATA' as const) : ('READY' as const),
    eligibleCandidateCount: eligibleCandidates,
    overall: summarize(results),
    byCandidateType: groupBy('candidateType'),
    byDirection: groupBy('direction'),
    byRegime: groupBy('regime'),
    byFillAssumption: groupBy('fillAssumption'),
  };
}
