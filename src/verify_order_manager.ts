import 'dotenv/config';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
import {
  deterministic_clock,
  getClientOrderId,
  getReplacementOrderId,
  getExitOrderId,
  getReservationOwnership,
  order_manager,
  paper_execution_adapter,
  sqlite_order_repository,
  type adapter_fill,
  type market_snapshot,
} from './order_manager.js';
import { buildPaperAccountVerificationReport } from './verify_paper_account.js';
const NOW = '2026-01-01T12:00:00.000Z',
  Market = createResearchMarketMetadata(
    {
      symbol: 'BTC/USD',
      exchangeSymbol: 'BTC',
      marketAddress: 'verification-btc-market',
      sizeDecimals: 4,
      priceDecimals: 1,
      tickSize: 0.1,
      minimumSize: 0.0001,
      lotSize: 0.0001,
      maximumLeverage: 50,
      maximumOpenInterest: 1e9,
      mode: 'Open',
    },
    new Date(NOW),
  );
const makeIntent = (id: string, direction: 'LONG' | 'SHORT' = 'LONG'): proposed_trade_intent => ({
  intentId: id,
  marketAddress: Market.marketAddress,
  direction,
  decisionTimestamp: NOW,
  referencePrice: 100000,
  intendedEntryPrice: 100000,
  stopLossPrice: direction === 'LONG' ? 99900 : 100100,
  entryOrderType: 'POST_ONLY_LIMIT',
  requestedLeverage: 40,
  candidateId: id,
  candidateType: 'VERIFY',
  strategyVersion: 'v1',
  featureVersion: 'v1',
  dataSessionId: 's',
});
const context = (): risk_context => ({
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
  marketMetadata: Market,
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
});
function assert(ok: boolean, message: string): asserts ok {
  if (!ok) throw new Error(`Order manager verification failed: ${message}`);
}
export function buildOrderManagerVerificationReport(directory: string) {
  const Risk = new risk_repository(path.join(directory, 'risk.sqlite')),
    Paper = new paper_account_repository(path.join(directory, 'paper.sqlite')),
    Orders = new sqlite_order_repository(path.join(directory, 'orders.sqlite')),
    Clock = new deterministic_clock(NOW);
  let Snapshot: market_snapshot = {
    observedAt: NOW,
    bestBid: 99999,
    bestAsk: 100001,
    crossed: false,
    mode: 'Open',
  };
  const Reader = { getSnapshot: () => Snapshot },
    Manager = new order_manager(Orders, Risk, Paper, Reader, Clock, 30, 5000),
    Adapter = new paper_execution_adapter(Clock, 250, 250);
  const approve = (id: string, direction: 'LONG' | 'SHORT' = 'LONG') => {
    const intent = makeIntent(id, direction),
      decision = evaluateTradeRisk(intent, context(), normalizeRiskConfiguration({}));
    assert(decision.status === 'APPROVED', `${id} risk approval`);
    Risk.saveDecision(intent, decision);
    return decision;
  };
  const submit = (id: string) => {
    const order = Manager.createEntry(id);
    Snapshot = { ...Snapshot, observedAt: Clock.now() };
    const validated = Manager.validateEntry(order.instruction.clientOrderId, {
      riskState: 'ACTIVE',
      runtimeHealth: 'HEALTHY',
      paperAccountActive: true,
      marketDataMaximumAgeMs: 1000,
      now: Clock.now(),
    });
    assert(
      validated.state === 'READY_TO_SUBMIT',
      `ready ${id}: ${validated.reasonCodes.join(',')}`,
    );
    const command = Manager.enqueueSubmit(order.instruction.clientOrderId);
    assert(
      Orders.getOrder(order.instruction.clientOrderId)?.state === 'SUBMIT_PENDING',
      'not active before ack',
    );
    const ack = Manager.dispatch(command, Adapter);
    assert(ack !== null, 'adapter ack');
    Clock.advance(250);
    Manager.acknowledge(ack);
    Manager.acknowledge(ack);
    const persistedOrder = Orders.getOrder(order.instruction.clientOrderId);
    assert(persistedOrder !== null, 'persisted acknowledged order');
    return persistedOrder;
  };
  const longApproval = approve('long'),
    long = submit('long');
  assert(long.instruction.leverage === 40 && long.activeAt !== null, '40x acknowledged activation');
  const makeFill = (
    id: string,
    price: number,
    quantity: number,
    source: 'STRICT_TRADE_THROUGH' | 'TOUCH_WITH_FLOW',
  ): adapter_fill => ({
    fillId: id,
    clientOrderId: long.instruction.clientOrderId,
    eventTimestamp: Clock.now(),
    receivedAt: Clock.now(),
    price,
    quantity,
    feeRate: 0.00011,
    liquidityRole: 'MAKER',
    fillSource: source,
    evidenceIds: [id],
    confidence: source === 'STRICT_TRADE_THROUGH' ? 'CONSERVATIVE' : 'LEVEL1_FLOW_PROXY',
  });
  const strict = Adapter.evaluateFill(
    long.instruction,
    long.activeAt,
    makeFill('strict', 99999, 0.0002, 'STRICT_TRADE_THROUGH'),
    99998,
    100001,
    0.0002,
  );
  assert(strict !== null, 'strict fill');
  Manager.applyFill(strict);
  assert(Manager.applyFill(strict) === 'DUPLICATE', 'duplicate fill');
  const touch = Adapter.evaluateFill(
    long.instruction,
    long.activeAt,
    makeFill('touch', 100000, 0.0003, 'TOUCH_WITH_FLOW'),
    99999,
    100001,
    0.0003,
  );
  assert(touch !== null, 'touch fill');
  Manager.applyFill(touch);
  let overfill = '';
  try {
    Manager.applyFill({ ...makeFill('over', 99999, 0.0001, 'STRICT_TRADE_THROUGH') });
  } catch (error) {
    overfill = error instanceof Error ? error.message : 'UNKNOWN';
  }
  assert(overfill === 'FILL_NOT_ALLOWED', 'overfill rejected');
  const exit = Manager.createExit('STOP_LOSS', 99900);
  assert(
    Manager.validateExit(exit.instruction.clientOrderId, {
      riskState: 'PAUSED_DATA',
      runtimeHealth: 'DEGRADED',
      paperAccountActive: true,
      marketDataMaximumAgeMs: 1000,
      now: Clock.now(),
    }).state === 'READY_TO_SUBMIT',
    'protective exit while paused',
  );
  const exitCommand = Manager.enqueueSubmit(exit.instruction.clientOrderId),
    exitAck = Manager.dispatch(exitCommand, Adapter)!;
  Clock.advance(250);
  Manager.acknowledge(exitAck);
  Manager.applyFill({
    fillId: 'exit-partial',
    clientOrderId: exit.instruction.clientOrderId,
    eventTimestamp: Clock.now(),
    receivedAt: Clock.now(),
    price: 99900,
    quantity: 0.0002,
    feeRate: 0.00034,
    liquidityRole: 'TAKER',
    fillSource: 'STRICT_TRADE_THROUGH',
    evidenceIds: ['stop'],
    confidence: 'CONSERVATIVE',
  });
  Manager.applyFill({
    fillId: 'exit-final',
    clientOrderId: exit.instruction.clientOrderId,
    eventTimestamp: Clock.now(),
    receivedAt: Clock.now(),
    price: 99900,
    quantity: 0.0003,
    feeRate: 0.00034,
    liquidityRole: 'TAKER',
    fillSource: 'STRICT_TRADE_THROUGH',
    evidenceIds: ['stop2'],
    confidence: 'CONSERVATIVE',
  });
  const shortApproval = approve('valid-short', 'SHORT'),
    short = submit('valid-short');
  assert(short.activeAt !== null, 'short active after acknowledgement');
  const shortFill: adapter_fill = {
    fillId: 'short-fill',
    clientOrderId: short.instruction.clientOrderId,
    eventTimestamp: Clock.now(),
    receivedAt: Clock.now(),
    price: 100001,
    quantity: shortApproval.calculatedQuantity,
    feeRate: 0.00011,
    liquidityRole: 'MAKER',
    fillSource: 'STRICT_TRADE_THROUGH',
    evidenceIds: ['short-trade-through'],
    confidence: 'CONSERVATIVE',
  };
  assert(
    Adapter.evaluateFill(
      short.instruction,
      short.activeAt,
      shortFill,
      99999,
      100002,
      shortApproval.calculatedQuantity,
    ) !== null,
    'post-only short fill',
  );
  Manager.applyFill(shortFill);
  Paper.recordExitFill(
    'short-cleanup',
    100000,
    shortApproval.calculatedQuantity,
    0,
    Clock.now(),
    Risk,
  );
  const crossLong = approve('cross-long');
  Snapshot = { ...Snapshot, bestAsk: crossLong.roundedEntryPrice! };
  const rejectedLong = Manager.createEntry('cross-long');
  const longCross = Manager.validateEntry(rejectedLong.instruction.clientOrderId, {
    riskState: 'ACTIVE',
    runtimeHealth: 'HEALTHY',
    paperAccountActive: true,
    marketDataMaximumAgeMs: 1000,
    now: Clock.now(),
  });
  assert(longCross.reasonCodes[0] === 'POST_ONLY_WOULD_CROSS', 'buy crossing');
  approve('cross-short', 'SHORT');
  Snapshot = { ...Snapshot, bestBid: 100000, bestAsk: 100001 };
  const rejectedShort = Manager.createEntry('cross-short');
  const shortCross = Manager.validateEntry(rejectedShort.instruction.clientOrderId, {
    riskState: 'ACTIVE',
    runtimeHealth: 'HEALTHY',
    paperAccountActive: true,
    marketDataMaximumAgeMs: 1000,
    now: Clock.now(),
  });
  assert(shortCross.reasonCodes[0] === 'POST_ONLY_WOULD_CROSS', 'sell crossing');
  Snapshot = { ...Snapshot, bestBid: 99999, bestAsk: 100001 };
  approve('cancel');
  const cancelOrder = submit('cancel'),
    cancelRequestAt = Clock.now(),
    cancelCommand = Manager.requestCancel(cancelOrder.instruction.clientOrderId);
  const cancelEffectiveAt =
    Orders.getOrder(cancelOrder.instruction.clientOrderId)?.cancelEffectiveAt ?? null;
  const beforeCancel = {
    ...makeFill('before-cancel', 99999, 0.0001, 'STRICT_TRADE_THROUGH'),
    clientOrderId: cancelOrder.instruction.clientOrderId,
  };
  Manager.applyFill(beforeCancel);
  const fillBeforeCancelEffectivenessAt = beforeCancel.eventTimestamp;
  Clock.advance(5000);
  const cancelAck = Manager.dispatch(cancelCommand, Adapter)!;
  const duplicateCancelAck = Manager.dispatch(cancelCommand, Adapter);
  assert(
    duplicateCancelAck?.acknowledgementId === cancelAck.acknowledgementId,
    'duplicate dispatch stable acknowledgement',
  );
  Clock.advance(250);
  Manager.acknowledge(cancelAck);
  let afterCancel = '';
  try {
    Manager.applyFill({ ...beforeCancel, fillId: 'after-cancel', eventTimestamp: Clock.now() });
  } catch (error) {
    afterCancel = error instanceof Error ? error.message : 'UNKNOWN';
  }
  assert(afterCancel === 'FILL_NOT_ALLOWED', 'fill after cancel');
  Paper.recordExitFill('cancel-cleanup', 99_999, 0.0001, 0, Clock.now(), Risk);
  approve('uncertain');
  const uncertain = submit('uncertain');
  Manager.requestCancel(uncertain.instruction.clientOrderId);
  Manager.markCancellationUncertain(uncertain.instruction.clientOrderId);
  assert(
    Orders.getOrder(uncertain.instruction.clientOrderId)?.state === 'RECONCILIATION_REQUIRED',
    'uncertainty',
  );
  const pendingBeforeRestart = Orders.getPendingCommands().length;
  Orders.close();
  const Restarted = new sqlite_order_repository(path.join(directory, 'orders.sqlite'));
  assert(Restarted.getPendingCommands().length === pendingBeforeRestart, 'durable outbox recovery');
  const RestartedManager = new order_manager(Restarted, Risk, Paper, Reader, Clock, 30, 5000);
  Clock.advance(5000);
  const reconciliation = Adapter.reconcile(uncertain.instruction.clientOrderId);
  RestartedManager.acknowledge(reconciliation);
  const outboxEvidence = Restarted.getOutboxEvidence();
  assert(outboxEvidence.pendingCount === 0, 'outbox fully drained after reconciliation');
  const logicalOrderCount = Restarted.getAllOrders().filter(
    (order) => order.instruction.clientOrderId === uncertain.instruction.clientOrderId,
  ).length;
  assert(logicalOrderCount === 1, 'one logical client order after restart');
  const reservationOwnership = getReservationOwnership(Paper.getState(), Restarted.getAllOrders());
  assert(reservationOwnership.nonTerminalOrders.length === 0, 'no non-terminal final orders');
  const finalPaperState = summarizePaperState(Paper.getState());
  assert(
    finalPaperState.positionState === 'CLOSED' &&
      finalPaperState.reservedEntryCollateral === 0 &&
      finalPaperState.allocatedPositionMargin === 0 &&
      finalPaperState.availableCollateral === finalPaperState.totalEquity,
    'clean final paper state',
  );
  const minimumDirectory = path.join(directory, 'minimum-volume');
  mkdirSync(minimumDirectory);
  const minimumReport = buildPaperAccountVerificationReport(minimumDirectory);
  assert(
    minimumReport.dailyMinimum.dailyFilledVolume > 10_000 &&
      minimumReport.dailyMinimum.minimumStatus === 'MINIMUM_MET' &&
      minimumReport.minimumCrossingEvidence.tradingContinuedAfterMinimum,
    'isolated daily minimum accumulation',
  );
  const report = {
    version: 'BTC_USD_ORDER_MANAGER_V1',
    stableIdentifiers: {
      entry: getClientOrderId('long', 'ENTRY', 1),
      replacement: getReplacementOrderId(long.instruction.clientOrderId, 1),
      exit: getExitOrderId('position:long', 'STOP_LOSS'),
    },
    scenarioResults: [
      {
        scenario: 'post-only LONG acknowledgement and activation',
        result: 'PASS',
        placementLatencyMs: 250,
      },
      { scenario: 'post-only SHORT submission and fill', result: 'PASS' },
      { scenario: 'strict trade-through and touch-with-flow partial fills', result: 'PASS' },
      { scenario: 'duplicate and overfill protection', result: 'PASS', overfill },
      {
        scenario: 'BUY and SELL crossing rejection',
        result: 'PASS',
        reasonCode: 'POST_ONLY_WOULD_CROSS',
      },
      { scenario: 'reduce-only stop exit while risk paused', result: 'PASS' },
      { scenario: 'TTL/cancel race and acknowledgement', result: 'PASS', afterCancel },
      { scenario: 'cancel uncertainty and durable outbox restart', result: 'PASS' },
    ],
    leverage: longApproval.approvedLeverage,
    timingEvidence: {
      submitRequestedAt: long.submitRequestedAt,
      acknowledgedAt: long.acknowledgedAt,
      activeAt: long.activeAt,
      cancelRequestedAt: cancelRequestAt,
      cancelEffectiveAt,
      fillBeforeCancelEffectivenessAt,
      cancelAcknowledgedAt: cancelAck.acknowledgedAt,
      fillAfterCancellationResult: afterCancel,
    },
    durableOutboxEvidence: {
      ...outboxEvidence,
      duplicateDispatchAcknowledgementId: duplicateCancelAck?.acknowledgementId,
      pendingCountAfterRecovery: outboxEvidence.pendingCount,
      logicalClientOrderCountAfterRestart: logicalOrderCount,
    },
    reservationOwnership,
    reconciliationRequiredOrderCount: Restarted.getAllOrders().filter(
      (order) => order.state === 'RECONCILIATION_REQUIRED',
    ).length,
    dailyMinimumEvidence: {
      ...minimumReport.minimumCrossingEvidence,
      finalVolume: minimumReport.dailyMinimum.dailyFilledVolume,
      minimumStatus: minimumReport.dailyMinimum.minimumStatus,
      invariantsUnchanged: {
        leverage: 40,
        quantity: minimumReport.approvedRisk.quantity,
        allocatedMargin: minimumReport.approvedRisk.allocatedMargin,
        entryPrice: minimumReport.approvedRisk.entry,
        stopPrice: minimumReport.approvedRisk.stop,
        ttlSeconds: 30,
        approval: 'APPROVED',
      },
    },
    finalPaperState,
    liveExecutionAdapterExported: false,
    canTradeLive: false,
  };
  Restarted.close();
  Paper.close();
  Risk.close();
  return report;
}
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const directory = mkdtempSync(path.join(tmpdir(), 'order-manager-verify-'));
  try {
    createLogger(process.env.LOG_FORMAT === 'json' ? 'json' : 'pretty').info(
      { event: 'order_manager_verified', ...buildOrderManagerVerificationReport(directory) },
      'Order manager verification completed',
    );
  } catch (error) {
    createLogger('pretty').error(
      { error: error instanceof Error ? error.message : 'Unknown' },
      'Order manager verification failed',
    );
    process.exitCode = 1;
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}
