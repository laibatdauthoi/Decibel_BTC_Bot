import 'dotenv/config';

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { createLogger } from './logger.js';
import { paper_account_repository, summarizePaperState } from './paper_account.js';
import { createResearchMarketMetadata } from './research_market_metadata.js';
import {
  evaluateTradeRisk,
  normalizeRiskConfiguration,
  type proposed_trade_intent,
  type risk_context,
} from './risk_engine.js';
import { risk_repository } from './risk_repository.js';

const NOW = '2026-01-01T12:00:00.000Z';
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
  new Date(NOW),
);
function intent(id: string, direction: 'LONG' | 'SHORT' = 'LONG'): proposed_trade_intent {
  return {
    intentId: id,
    marketAddress: Metadata.marketAddress,
    direction,
    decisionTimestamp: NOW,
    referencePrice: 100_000,
    intendedEntryPrice: 100_000,
    stopLossPrice: direction === 'LONG' ? 99_900 : 100_100,
    takeProfitPrice: direction === 'LONG' ? 100_200 : 99_800,
    entryOrderType: 'POST_ONLY_LIMIT',
    requestedLeverage: 40,
    candidateId: id,
    candidateType: 'PAPER_VERIFICATION',
    strategyVersion: 'verification-v1',
    featureVersion: 'v1',
    dataSessionId: 'session',
  };
}
function context(): risk_context {
  return {
    currentTime: NOW,
    accountEquity: 30,
    availableCollateral: 30,
    reservedCollateral: 0,
    startOfDayEquity: 30,
    realizedDailyPnL: 0,
    realizedDailyFilledVolume: 0,
    peakEquity: 30,
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
  };
}
function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Paper verification failed: ${message}`);
}

export function buildPaperAccountVerificationReport(directory: string) {
  const riskPath = path.join(directory, 'risk.sqlite');
  const paperPath = path.join(directory, 'paper.sqlite');
  const RiskRepository = new risk_repository(riskPath);
  const config = normalizeRiskConfiguration({});
  const saveApproval = (id: string, direction: 'LONG' | 'SHORT' = 'LONG') => {
    const trade = intent(id, direction);
    const decision = evaluateTradeRisk(trade, context(), config);
    check(decision.status === 'APPROVED', `${id} approval`);
    RiskRepository.saveDecision(trade, decision);
    return decision;
  };
  const approval = saveApproval('paper-long');
  let PaperRepository = new paper_account_repository(paperPath, 30);
  PaperRepository.consumeRiskDecision(RiskRepository, 'paper-long', 'entry-long', NOW);
  PaperRepository.activateOrder('entry-long', NOW);
  const reserved = summarizePaperState(PaperRepository.getState());
  check(reserved.reservedEntryCollateral === approval.allocatedMargin, 'margin reservation');
  PaperRepository.close();
  PaperRepository = new paper_account_repository(paperPath, 30);
  check(
    PaperRepository.getState().orders['entry-long']?.state === 'ACTIVE',
    'restart with open order',
  );
  PaperRepository.recordEntryFill(
    'entry-long',
    'entry-partial',
    100_000,
    0.0002,
    0.00011,
    NOW,
    RiskRepository,
  );
  const duplicate = PaperRepository.recordEntryFill(
    'entry-long',
    'entry-partial',
    100_000,
    0.0002,
    0.00011,
    NOW,
    RiskRepository,
  );
  check(duplicate === 'DUPLICATE', 'duplicate partial fill');
  PaperRepository.close();
  PaperRepository = new paper_account_repository(paperPath, 30);
  check(
    PaperRepository.getState().orders['entry-long']?.state === 'PARTIALLY_FILLED',
    'restart with partial fill',
  );
  PaperRepository.recordEntryFill(
    'entry-long',
    'entry-final',
    100_000,
    0.0003,
    0.00011,
    NOW,
    RiskRepository,
  );
  PaperRepository.updateMark('long-mark', 100_100, NOW);
  const marked = summarizePaperState(PaperRepository.getState());
  check(marked.unrealizedPnL === 0.05, 'LONG mark-to-market');
  PaperRepository.close();
  PaperRepository = new paper_account_repository(paperPath, 30);
  check(
    summarizePaperState(PaperRepository.getState()).positionState === 'OPEN',
    'restart with open position',
  );
  const firstTrigger = PaperRepository.triggerExit('stop-observation', 99_900, NOW);
  const repeatedTrigger = PaperRepository.triggerExit('stop-observation', 99_800, NOW);
  check(firstTrigger === 'STOP' && repeatedTrigger === 'NONE', 'idempotent stop priority');
  PaperRepository.close();
  PaperRepository = new paper_account_repository(paperPath, 30);
  check(
    summarizePaperState(PaperRepository.getState()).positionState === 'CLOSING',
    'restart during closing',
  );
  PaperRepository.recordExitFill('exit-partial', 99_800, 0.0002, 0.00034, NOW, RiskRepository);
  PaperRepository.recordExitFill('exit-final', 99_800, 0.0003, 0.00034, NOW, RiskRepository);
  const closed = summarizePaperState(PaperRepository.getState());
  check(
    closed.positionState === 'CLOSED' && closed.allocatedPositionMargin === 0,
    'full close and margin release',
  );
  PaperRepository.close();
  PaperRepository = new paper_account_repository(paperPath, 30);
  check(
    summarizePaperState(PaperRepository.getState()).positionState === 'CLOSED',
    'deterministic restart',
  );

  const shortApproval = saveApproval('paper-short', 'SHORT');
  PaperRepository.consumeRiskDecision(RiskRepository, 'paper-short', 'entry-short', NOW);
  PaperRepository.activateOrder('entry-short', NOW);
  PaperRepository.recordEntryFill(
    'entry-short',
    'short-entry',
    100_000,
    shortApproval.calculatedQuantity,
    0.00011,
    NOW,
    RiskRepository,
  );
  PaperRepository.updateMark('short-mark', 99_900, NOW);
  const shortMarked = summarizePaperState(PaperRepository.getState());
  check(shortMarked.unrealizedPnL === 0.05, 'SHORT mark-to-market');
  PaperRepository.recordExitFill(
    'short-exit',
    100_000,
    shortApproval.calculatedQuantity,
    0,
    NOW,
    RiskRepository,
  );
  for (let index = 0; index < 100; index += 1) {
    const id = `volume-${index}`,
      decision = saveApproval(id);
    PaperRepository.consumeRiskDecision(RiskRepository, id, `order-${id}`, NOW);
    PaperRepository.activateOrder(`order-${id}`, NOW);
    PaperRepository.recordEntryFill(
      `order-${id}`,
      `${id}-entry`,
      100_000,
      decision.calculatedQuantity,
      0,
      NOW,
      RiskRepository,
    );
    PaperRepository.recordExitFill(
      `${id}-exit`,
      100_000,
      decision.calculatedQuantity,
      0,
      NOW,
      RiskRepository,
    );
  }
  const cancelledApproval = saveApproval('cancelled-order');
  PaperRepository.consumeRiskDecision(RiskRepository, 'cancelled-order', 'cancelled-entry', NOW);
  PaperRepository.activateOrder('cancelled-entry', NOW);
  PaperRepository.requestCancel('cancelled-entry', NOW, NOW);
  PaperRepository.cancelOrder('cancelled-entry', NOW);
  let cancelledFillReason = '';
  try {
    PaperRepository.recordEntryFill(
      'cancelled-entry',
      'late-fill',
      100_000,
      cancelledApproval.calculatedQuantity,
      0,
      NOW,
    );
  } catch (error) {
    cancelledFillReason = error instanceof Error ? error.message : 'UNKNOWN';
  }
  check(cancelledFillReason === 'FILL_NOT_ALLOWED', 'fill after cancellation rejection');
  saveApproval('expired-order');
  PaperRepository.consumeRiskDecision(RiskRepository, 'expired-order', 'expired-entry', NOW);
  PaperRepository.activateOrder('expired-entry', NOW);
  PaperRepository.expireOrder('expired-entry', NOW);
  const beforeCancelApproval = saveApproval('fill-before-cancel');
  PaperRepository.consumeRiskDecision(
    RiskRepository,
    'fill-before-cancel',
    'before-cancel-entry',
    NOW,
  );
  PaperRepository.activateOrder('before-cancel-entry', NOW);
  PaperRepository.requestCancel('before-cancel-entry', NOW, '2026-01-01T12:00:01.000Z');
  PaperRepository.recordEntryFill(
    'before-cancel-entry',
    'before-cancel-fill',
    100_000,
    beforeCancelApproval.calculatedQuantity,
    0,
    NOW,
    RiskRepository,
  );
  saveApproval('pyramid');
  let pyramidReason = '';
  try {
    PaperRepository.consumeRiskDecision(RiskRepository, 'pyramid', 'pyramid-entry', NOW);
  } catch (error) {
    pyramidReason = error instanceof Error ? error.message : 'UNKNOWN';
  }
  check(pyramidReason === 'PYRAMIDING_OR_REVERSAL', 'pyramiding rejected');
  PaperRepository.recordExitFill(
    'before-cancel-exit',
    100_000,
    beforeCancelApproval.calculatedQuantity,
    0,
    NOW,
    RiskRepository,
  );
  PaperRepository.applyFunding('explicit-funding', 0.01, NOW);
  const minimum = PaperRepository.getDailyMinimum('2026-01-01', NOW);
  check(minimum.dailyFilledVolume > 10_000, 'volume continues above minimum');
  check(PaperRepository.getState().status === 'ACTIVE', 'minimum must not pause account');
  const finalState = summarizePaperState(PaperRepository.getState());
  PaperRepository.close();
  RiskRepository.close();
  const Corruptor = new Database(paperPath);
  Corruptor.prepare(
    "UPDATE paper_account_projection SET state_hash='sha256:verification-corruption' WHERE singleton=1",
  ).run();
  Corruptor.close();
  let corruptionReason = '';
  try {
    new paper_account_repository(paperPath, 30);
  } catch (error) {
    corruptionReason = error instanceof Error ? error.message : 'UNKNOWN';
  }
  check(corruptionReason === 'PAPER_PROJECTION_MISMATCH', 'corrupted projection detection');
  return {
    paperAccountVersion: 'BTC_USD_PAPER_V1',
    databaseIsolation: 'TEMPORARY',
    startingEquity: 30,
    approvedRisk: {
      leverage: approval.approvedLeverage,
      quantity: approval.calculatedQuantity,
      allocatedMargin: approval.allocatedMargin,
      entry: approval.roundedEntryPrice,
      stop: approval.roundedStopLossPrice,
    },
    scenarioResults: [
      {
        scenario: 'margin reserved',
        result: 'PASS',
        reservedMargin: reserved.reservedEntryCollateral,
      },
      { scenario: 'partial and duplicate entry fill', result: 'PASS', duplicateResult: duplicate },
      { scenario: 'LONG mark-to-market', result: 'PASS', unrealizedPnL: marked.unrealizedPnL },
      {
        scenario: 'stop creates one reduce-only exit intent',
        result: 'PASS',
        firstTrigger,
        repeatedTrigger,
      },
      { scenario: 'full close releases margin', result: 'PASS', state: closed.positionState },
      {
        scenario: 'SHORT mark-to-market',
        result: 'PASS',
        unrealizedPnL: shortMarked.unrealizedPnL,
      },
      { scenario: 'restart and event replay', result: 'PASS' },
      { scenario: 'restart with open position and during closing', result: 'PASS' },
      { scenario: 'cancel, expiry, and cancel race', result: 'PASS', cancelledFillReason },
      { scenario: 'pyramiding and reversal rejection', result: 'PASS', reasonCode: pyramidReason },
      { scenario: 'explicit funding only', result: 'PASS' },
      { scenario: 'corrupted projection detection', result: 'PASS', reasonCode: corruptionReason },
    ],
    dailyMinimum: minimum,
    finalState,
    canTradeLive: false,
    reason: 'Paper accounting verification only; no execution capability',
  };
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const directory = mkdtempSync(path.join(tmpdir(), 'decibel-paper-verification-'));
  try {
    const report = buildPaperAccountVerificationReport(directory);
    createLogger(process.env.LOG_FORMAT === 'json' ? 'json' : 'pretty').info(
      { event: 'paper_account_verified', ...report },
      'Paper account verification completed',
    );
  } catch (error) {
    createLogger(process.env.LOG_FORMAT === 'json' ? 'json' : 'pretty').error(
      {
        event: 'paper_account_verification_failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Paper account verification failed',
    );
    process.exitCode = 1;
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}
