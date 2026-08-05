import 'dotenv/config';

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLogger } from './logger.js';
import { createResearchMarketMetadata } from './research_market_metadata.js';
import {
  calculateFillNotional,
  evaluateTradeRisk,
  normalizeRiskConfiguration,
  type proposed_trade_intent,
  type risk_context,
  type risk_decision,
} from './risk_engine.js';
import { risk_repository } from './risk_repository.js';

const NOW = '2026-01-01T12:00:00.000Z';
const EQUITY = 30;
const Metadata = createResearchMarketMetadata(
  {
    symbol: 'BTC/USD',
    exchangeSymbol: 'BTC-USD',
    marketAddress: 'verification-btc-market',
    sizeDecimals: 4,
    priceDecimals: 1,
    tickSize: 0.1,
    minimumSize: 0.0001,
    lotSize: 0.0001,
    maximumLeverage: 50,
    maximumOpenInterest: 1_000_000,
    mode: 'Open',
  },
  new Date('2026-01-01T00:00:00.000Z'),
);

function makeIntent(changes: Partial<proposed_trade_intent> = {}): proposed_trade_intent {
  return {
    intentId: 'verify-long',
    marketAddress: Metadata.marketAddress,
    direction: 'LONG',
    decisionTimestamp: NOW,
    referencePrice: 100_000,
    intendedEntryPrice: 100_000,
    stopLossPrice: 99_900,
    entryOrderType: 'POST_ONLY_LIMIT',
    requestedLeverage: 40,
    candidateId: 'verification',
    candidateType: 'RESEARCH',
    strategyVersion: 'verification-v1',
    featureVersion: 'verification-v1',
    dataSessionId: 'verification-session',
    ...changes,
  };
}
function makeContext(changes: Partial<risk_context> = {}): risk_context {
  return {
    currentTime: NOW,
    accountEquity: EQUITY,
    availableCollateral: EQUITY,
    reservedCollateral: 0,
    startOfDayEquity: EQUITY,
    realizedDailyPnL: 0,
    realizedDailyFilledVolume: 0,
    peakEquity: EQUITY,
    currentDrawdown: 0,
    consecutiveLosses: 0,
    lastLossTimestamp: null,
    currentPosition: null,
    existingOpenOrders: [],
    marketMetadata: Metadata,
    marketMode: 'Open',
    unifiedRuntimeHealth: 'HEALTHY',
    latestCompletedCandleTimestamp: NOW,
    latestBookTimestamp: NOW,
    latestTradeTimestamp: NOW,
    latestMarketPriceTimestamp: NOW,
    latestAggregateTimestamp: NOW,
    currentRiskState: 'ACTIVE',
    healthySinceTimestamp: NOW,
    processedIntentIds: [],
    persistenceAvailable: true,
    ...changes,
  };
}
function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Risk verification invariant failed: ${message}`);
}
function summarizeApproval(name: string, decision: risk_decision, permittedRisk: number) {
  assert(decision.status === 'APPROVED', `${name} must be approved`);
  assert(decision.approvedLeverage === 40, `${name} approved leverage must equal 40`);
  assert(
    Math.abs(decision.positionNotional - decision.allocatedMargin * 40) <= 1e-8,
    `${name} notional must equal allocated margin times 40`,
  );
  assert(decision.totalLossAtStopIncludingFees <= permittedRisk + 1e-8, `${name} exceeds risk`);
  assert(decision.calculatedQuantity >= Metadata.minimumSize, `${name} is below minimum size`);
  const lotUnits = decision.calculatedQuantity / Metadata.lotSize;
  assert(Math.abs(lotUnits - Math.round(lotUnits)) <= 1e-8, `${name} violates lot size`);
  assert(decision.positionNotional <= EQUITY * 40 + 1e-8, `${name} exceeds 40x exposure`);
  return {
    scenario: name,
    decision: decision.status,
    requestedLeverage: decision.requestedLeverage,
    approvedLeverage: decision.approvedLeverage,
    entryPrice: decision.roundedEntryPrice,
    stopLossPrice: decision.roundedStopLossPrice,
    quantity: decision.calculatedQuantity,
    positionNotional: decision.positionNotional,
    allocatedMargin: decision.allocatedMargin,
    positionNotionalDividedByAllocatedMargin: decision.positionNotional / decision.allocatedMargin,
    accountExposureMultiple: decision.accountExposureMultiple,
    makerEntryFeeReserve: decision.makerEntryFeeReserve,
    emergencyTakerExitFeeReserve: decision.emergencyTakerExitFeeReserve,
    priceLossAtStop: decision.priceLossAtStop,
    totalLossAtStopIncludingFees: decision.totalLossAtStopIncludingFees,
    permittedRisk,
    availableCollateralAfter: decision.availableCollateralAfter,
    collateralBufferAfter: decision.collateralBufferAfter,
  };
}

export function buildRiskVerificationReport(databasePath: string) {
  const config = normalizeRiskConfiguration({});
  const permittedRisk = EQUITY * config.riskPerTradeRatio;
  const long = evaluateTradeRisk(makeIntent(), makeContext(), config);
  const short = evaluateTradeRisk(
    makeIntent({ intentId: 'verify-short', direction: 'SHORT', stopLossPrice: 100_100 }),
    makeContext(),
    config,
  );
  const rejectionInputs: Array<[string, proposed_trade_intent, risk_context, string]> = [
    [
      'requested leverage 39',
      makeIntent({ requestedLeverage: 39 }),
      makeContext(),
      'REQUESTED_LEVERAGE_NOT_40',
    ],
    [
      'requested leverage 41',
      makeIntent({ requestedLeverage: 41 }),
      makeContext(),
      'REQUESTED_LEVERAGE_NOT_40',
    ],
    [
      'market maximum leverage below 40',
      makeIntent(),
      makeContext({ marketMetadata: { ...Metadata, maximumLeverage: 39 } }),
      'MARKET_MAXIMUM_LEVERAGE_BELOW_40',
    ],
    [
      'notional above USD 1200',
      makeIntent(),
      makeContext({ marketMetadata: { ...Metadata, minimumSize: 0.0121 } }),
      'EXPOSURE_LIMIT_EXCEEDED',
    ],
    [
      'insufficient collateral',
      makeIntent(),
      makeContext({
        availableCollateral: 3.1,
        marketMetadata: { ...Metadata, minimumSize: 0.0001 },
      }),
      'INSUFFICIENT_COLLATERAL',
    ],
    [
      'collateral buffer',
      makeIntent(),
      makeContext({ availableCollateral: 3 }),
      'COLLATERAL_BUFFER_VIOLATION',
    ],
    [
      'invalid LONG stop',
      makeIntent({ stopLossPrice: 100_001 }),
      makeContext(),
      'INVALID_STOP_LOSS',
    ],
    [
      'invalid SHORT stop',
      makeIntent({ direction: 'SHORT', stopLossPrice: 99_999 }),
      makeContext(),
      'INVALID_STOP_LOSS',
    ],
    [
      'stale data',
      makeIntent(),
      makeContext({ latestBookTimestamp: '2026-01-01T11:00:00Z' }),
      'STALE_MARKET_DATA',
    ],
    [
      'unhealthy runtime',
      makeIntent(),
      makeContext({ unifiedRuntimeHealth: 'DEGRADED' }),
      'UNHEALTHY_RUNTIME',
    ],
    [
      'daily loss',
      makeIntent(),
      makeContext({ realizedDailyPnL: -0.3 }),
      'DAILY_LOSS_LIMIT_REACHED',
    ],
    ['drawdown', makeIntent(), makeContext({ currentDrawdown: 0.05 }), 'DRAWDOWN_LIMIT_REACHED'],
    [
      'cooldown',
      makeIntent(),
      makeContext({ consecutiveLosses: 1, lastLossTimestamp: '2026-01-01T11:30:00Z' }),
      'LOSS_COOLDOWN_ACTIVE',
    ],
    [
      'existing position',
      makeIntent(),
      makeContext({ currentPosition: { marketAddress: Metadata.marketAddress } }),
      'POSITION_ALREADY_EXISTS',
    ],
    [
      'existing order',
      makeIntent(),
      makeContext({ existingOpenOrders: [{ entryOrder: true }] }),
      'ENTRY_ORDER_ALREADY_EXISTS',
    ],
    [
      'duplicate intent',
      makeIntent(),
      makeContext({ processedIntentIds: ['verify-long'] }),
      'DUPLICATE_INTENT',
    ],
    [
      'operator pause',
      makeIntent(),
      makeContext({ currentRiskState: 'PAUSED_OPERATOR' }),
      'RISK_STATE_NOT_ACTIVE',
    ],
    [
      'halted state',
      makeIntent(),
      makeContext({ currentRiskState: 'HALTED' }),
      'RISK_STATE_NOT_ACTIVE',
    ],
  ];
  const rejected = rejectionInputs.map(([scenario, intent, context, expectedReason]) => {
    const decision = evaluateTradeRisk(intent, context, config);
    assert(decision.status === 'REJECTED', `${scenario} must reject`);
    assert(
      decision.reasonCodes.length === 1 && decision.reasonCodes[0] === expectedReason,
      `${scenario} must return ${expectedReason}`,
    );
    return { scenario, decision: decision.status, reasonCodes: decision.reasonCodes };
  });

  const disabledTarget = evaluateTradeRisk(makeIntent(), makeContext(), {
    ...config,
    dailyVolumeTargetUSD: 0,
  });
  const target10000 = evaluateTradeRisk(makeIntent(), makeContext(), {
    ...config,
    dailyVolumeTargetUSD: 10_000,
  });
  const invariantFields = [
    'status',
    'approvedLeverage',
    'allocatedMargin',
    'calculatedQuantity',
    'roundedEntryPrice',
    'roundedStopLossPrice',
  ] as const;
  for (const field of invariantFields)
    assert(disabledTarget[field] === target10000[field], `volume target changed ${field}`);
  const summarizeInvariantDecision = (decision: risk_decision) => ({
    decision: decision.status,
    leverage: decision.approvedLeverage,
    allocatedMargin: decision.allocatedMargin,
    quantity: decision.calculatedQuantity,
    entryPrice: decision.roundedEntryPrice,
    stopLossPrice: decision.roundedStopLossPrice,
  });

  const Repository = new risk_repository(databasePath);
  let fillAccounting;
  try {
    const entry = {
      fillId: 'verify-entry',
      timestamp: NOW,
      price: 100_000,
      quantity: 0.001,
      role: 'ENTRY' as const,
    };
    const entryResult = Repository.recordFill(entry);
    const volumeAfterEntry = Repository.getDailyVolume('2026-01-01');
    const duplicateResult = Repository.recordFill(entry);
    const volumeAfterDuplicate = Repository.getDailyVolume('2026-01-01');
    const exitResult = Repository.recordFill({
      fillId: 'verify-partial-exit',
      timestamp: NOW,
      price: 100_100,
      quantity: 0.0005,
      role: 'EXIT',
    });
    const dailyFilledVolume = Repository.getDailyVolume('2026-01-01');
    assert(
      entryResult === 'INSERTED' && duplicateResult === 'DUPLICATE',
      'fill idempotency failed',
    );
    assert(volumeAfterDuplicate === volumeAfterEntry, 'duplicate fill added volume');
    fillAccounting = {
      uniqueEntryFill: { result: entryResult, volume: volumeAfterEntry },
      duplicateEntryFill: {
        result: duplicateResult,
        volumeAdded: volumeAfterDuplicate - volumeAfterEntry,
      },
      partialExitFill: { result: exitResult, volume: calculateFillNotional(100_100, 0.0005) },
      dailyFilledVolume,
    };
  } finally {
    Repository.close();
  }

  return {
    policyVersion: long.policyVersion,
    referenceEquityUSD: EQUITY,
    theoreticalMaximumNotionalUSD: EQUITY * 40,
    scenarioResults: [
      summarizeApproval('approved LONG', long, permittedRisk),
      summarizeApproval('approved SHORT', short, permittedRisk),
      ...rejected,
    ],
    volumeTargetInvariance: {
      targetDisabledOrZero: summarizeInvariantDecision(disabledTarget),
      targetUSD10000: summarizeInvariantDecision(target10000),
      assertedIdenticalFields: invariantFields,
    },
    fillAccounting,
    finalRiskState: 'HALTED' as const,
    canTrade: false,
    canTradeReason: 'Intentional final verification scenario is HALTED; verification never trades',
    intentionalFinalVerificationScenario: true,
  };
}

function run(): void {
  const directory = mkdtempSync(path.join(tmpdir(), 'decibel-risk-verification-'));
  try {
    const report = buildRiskVerificationReport(path.join(directory, 'risk.sqlite'));
    createLogger(process.env.LOG_FORMAT === 'json' ? 'json' : 'pretty').info(
      { event: 'risk_engine_verified', ...report },
      'Risk engine verification completed',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    run();
  } catch (error) {
    createLogger(process.env.LOG_FORMAT === 'json' ? 'json' : 'pretty').error(
      {
        event: 'risk_engine_verification_failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Risk engine verification failed',
    );
    process.exitCode = 1;
  }
}
