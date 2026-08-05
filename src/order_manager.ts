import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { z } from 'zod';

import {
  getFinancialDecimal,
  getFinancialUnits,
  type risk_decision,
  type risk_state,
} from './risk_engine.js';
import type { proposed_trade_intent } from './risk_engine.js';
import type { maker_fill_assumption } from './maker_execution_simulator.js';

export const ORDER_MANAGER_VERSION = 'BTC_USD_ORDER_MANAGER_V1';
const OrderManagerEnvironmentSchema = z.object({
  PAPER_ORDER_PLACEMENT_LATENCY_MS: z.coerce.number().int().nonnegative().max(60_000).default(250),
  PAPER_ORDER_CANCEL_LATENCY_MS: z.coerce.number().int().nonnegative().max(60_000).default(250),
  ENTRY_ORDER_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(30),
  CANCEL_CONFIRMATION_TIMEOUT_MS: z.coerce.number().int().positive().max(300_000).default(5000),
});
export function normalizeOrderManagerConfiguration(
  environment: Record<string, string | undefined>,
) {
  const value = OrderManagerEnvironmentSchema.parse(environment);
  return {
    placementLatencyMs: value.PAPER_ORDER_PLACEMENT_LATENCY_MS,
    cancelLatencyMs: value.PAPER_ORDER_CANCEL_LATENCY_MS,
    entryOrderTtlSeconds: value.ENTRY_ORDER_TTL_SECONDS,
    cancelConfirmationTimeoutMs: value.CANCEL_CONFIRMATION_TIMEOUT_MS,
  };
}
export type managed_order_state =
  | 'CREATED'
  | 'VALIDATING'
  | 'READY_TO_SUBMIT'
  | 'SUBMIT_PENDING'
  | 'ACKNOWLEDGED'
  | 'ACTIVE'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCEL_PENDING'
  | 'CANCEL_ACKNOWLEDGED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REJECTED'
  | 'RECONCILIATION_REQUIRED'
  | 'FAILED'
  | 'HALTED';
export type order_type =
  | 'POST_ONLY_LIMIT'
  | 'REDUCE_ONLY_LIMIT'
  | 'REDUCE_ONLY_EMERGENCY'
  | 'STOP_LOSS_EXIT'
  | 'TAKE_PROFIT_EXIT'
  | 'OPERATOR_EXIT';
export type order_instruction = {
  intentId: string;
  riskDecisionId: string;
  clientOrderId: string;
  marketAddress: string;
  side: 'BUY' | 'SELL';
  positionEffect: 'OPEN' | 'REDUCE_ONLY';
  orderType: order_type;
  leverage: 40;
  requestedQuantity: number;
  allocatedMargin: number;
  positionNotional: number;
  limitPrice: number | null;
  stopPrice: number | null;
  createdAt: string;
  expiresAt: string;
  strategyVersion: string;
  riskPolicyVersion: string;
  paperAccountVersion: string;
  correlationId: string;
  causationId: string | null;
};
export type market_snapshot = {
  observedAt: string;
  bestBid: number;
  bestAsk: number;
  crossed: boolean;
  mode: 'Open' | 'Closed';
};
export type adapter_acknowledgement = {
  acknowledgementId: string;
  commandId: string;
  clientOrderId: string;
  kind: 'SUBMIT_ACKNOWLEDGED' | 'CANCEL_ACKNOWLEDGED' | 'RECONCILED_ACTIVE' | 'RECONCILED_INACTIVE';
  acknowledgedAt: string;
};
export type adapter_fill = {
  fillId: string;
  clientOrderId: string;
  eventTimestamp: string;
  receivedAt: string;
  price: number;
  quantity: number;
  feeRate: number;
  liquidityRole: 'MAKER' | 'TAKER';
  fillSource: maker_fill_assumption;
  evidenceIds: string[];
  confidence: 'CONSERVATIVE' | 'LEVEL1_FLOW_PROXY';
};
export interface clock {
  now(): string;
}
export interface risk_decision_reader {
  getPersistedApproval(
    intentId: string,
  ): { intent: proposed_trade_intent; decision: risk_decision } | null;
}
export interface paper_account_writer {
  getState(): {
    status: string;
    reservedEntryCollateralUnits: string;
    orders: Record<
      string,
      {
        kind: 'ENTRY' | 'EXIT';
        state: string;
        requestedQuantityUnits: string;
        filledQuantityUnits: string;
        reservedMarginUnits: string;
      }
    >;
    position: {
      state: string;
      remainingQuantityUnits: string;
      positionId: string;
      direction: 'LONG' | 'SHORT';
      marketAddress: string;
    } | null;
  };
  consumeRiskDecision(
    reader: risk_decision_reader,
    intentId: string,
    orderId: string,
    occurredAt: string,
    maximumAgeMs?: number,
  ): void;
  activateOrder(orderId: string, occurredAt: string): void;
  requestCancel(orderId: string, occurredAt: string, effectiveAt: string): void;
  cancelOrder(orderId: string, occurredAt: string): void;
  recordEntryFill(
    orderId: string,
    fillId: string,
    price: number,
    quantity: number,
    feeRate: number,
    occurredAt: string,
  ): 'INSERTED' | 'DUPLICATE';
  recordExitFill(
    fillId: string,
    price: number,
    quantity: number,
    feeRate: number,
    occurredAt: string,
  ): 'INSERTED' | 'DUPLICATE';
}
export interface market_snapshot_reader {
  getSnapshot(at: string): market_snapshot | null;
}
export interface execution_adapter {
  dispatch(command: outbox_command): adapter_acknowledgement | null;
  reconcile(clientOrderId: string): adapter_acknowledgement;
}
export interface durable_outbox {
  getPendingCommands(): outbox_command[];
  markAttempt(commandId: string, attemptedAt: string): void;
}
export interface order_repository extends durable_outbox {
  getOrder(clientOrderId: string): managed_order | null;
}
export type outbox_command = {
  commandId: string;
  clientOrderId: string;
  kind: 'SUBMIT_ORDER' | 'CANCEL_ORDER' | 'REQUEST_RECONCILIATION';
  payload: order_instruction;
  attemptCount: number;
  nextAttemptAt: string;
  deliveredAt: string | null;
};
export type managed_order = {
  instruction: order_instruction;
  state: managed_order_state;
  filledQuantityUnits: string;
  decisionAt: string;
  validationAt: string | null;
  submitRequestedAt: string | null;
  adapterReceivedAt: string | null;
  acknowledgedAt: string | null;
  activeAt: string | null;
  cancelEffectiveAt: string | null;
  reasonCodes: string[];
};

export function getClientOrderId(intentId: string, purpose: string, attempt: number): string {
  return stableId('order', intentId, purpose, String(attempt));
}
export function getReplacementOrderId(originalOrderId: string, sequence: number): string {
  return stableId('replacement', originalOrderId, String(sequence));
}
export function getExitOrderId(positionId: string, reason: string): string {
  return stableId('exit', positionId, reason);
}
function stableId(...parts: string[]): string {
  return `${parts[0]}_${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24)}`;
}
function hash(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}
const units = (number: number) => getFinancialUnits(number);

const TRANSITIONS: Record<managed_order_state, readonly managed_order_state[]> = {
  CREATED: ['VALIDATING'],
  VALIDATING: ['READY_TO_SUBMIT', 'REJECTED'],
  READY_TO_SUBMIT: ['SUBMIT_PENDING'],
  SUBMIT_PENDING: ['ACKNOWLEDGED', 'RECONCILIATION_REQUIRED'],
  ACKNOWLEDGED: ['ACTIVE'],
  ACTIVE: ['PARTIALLY_FILLED', 'FILLED', 'CANCEL_PENDING', 'RECONCILIATION_REQUIRED'],
  PARTIALLY_FILLED: ['PARTIALLY_FILLED', 'FILLED', 'CANCEL_PENDING', 'RECONCILIATION_REQUIRED'],
  FILLED: [],
  CANCEL_PENDING: ['CANCEL_ACKNOWLEDGED', 'RECONCILIATION_REQUIRED', 'PARTIALLY_FILLED', 'FILLED'],
  CANCEL_ACKNOWLEDGED: ['CANCELLED'],
  CANCELLED: [],
  EXPIRED: [],
  REJECTED: [],
  RECONCILIATION_REQUIRED: ['ACTIVE', 'CANCELLED', 'HALTED'],
  FAILED: ['HALTED'],
  HALTED: [],
};
export function validateOrderTransition(from: managed_order_state, to: managed_order_state): void {
  if (!TRANSITIONS[from].includes(to)) throw new Error(`INVALID_ORDER_TRANSITION:${from}->${to}`);
}
const NON_TERMINAL_ENTRY_STATES = new Set<managed_order_state>([
  'CREATED',
  'VALIDATING',
  'READY_TO_SUBMIT',
  'SUBMIT_PENDING',
  'ACKNOWLEDGED',
  'ACTIVE',
  'PARTIALLY_FILLED',
  'CANCEL_PENDING',
  'RECONCILIATION_REQUIRED',
]);
export function getReservationOwnership(
  state: ReturnType<paper_account_writer['getState']>,
  orders: readonly managed_order[],
) {
  const nonTerminalOrders = orders
    .filter(
      (order) =>
        order.instruction.positionEffect === 'OPEN' && NON_TERMINAL_ENTRY_STATES.has(order.state),
    )
    .map((order) => {
      const paperOrder = state.orders[order.instruction.clientOrderId];
      const requested = units(order.instruction.requestedQuantity);
      const filled = BigInt(order.filledQuantityUnits);
      return {
        clientOrderId: order.instruction.clientOrderId,
        state: order.state,
        requestedQuantity: getFinancialDecimal(requested),
        filledQuantity: getFinancialDecimal(filled),
        remainingQuantity: getFinancialDecimal(requested - filled),
        ownedReservation: getFinancialDecimal(BigInt(paperOrder?.reservedMarginUnits ?? '0')),
      };
    });
  const ownedUnits = nonTerminalOrders.reduce(
    (sum, order) => sum + units(order.ownedReservation),
    0n,
  );
  const paperUnits = BigInt(state.reservedEntryCollateralUnits);
  if (ownedUnits !== paperUnits)
    throw new Error(`RESERVATION_OWNERSHIP_MISMATCH:owned=${ownedUnits},paper=${paperUnits}`);
  for (const order of orders.filter(
    (candidate) =>
      candidate.instruction.positionEffect === 'OPEN' &&
      !NON_TERMINAL_ENTRY_STATES.has(candidate.state),
  )) {
    const reservation = BigInt(
      state.orders[order.instruction.clientOrderId]?.reservedMarginUnits ?? '0',
    );
    if (reservation !== 0n)
      throw new Error(`TERMINAL_ORDER_OWNS_RESERVATION:${order.instruction.clientOrderId}`);
  }
  return {
    nonTerminalOrders,
    totalOrderOwnedReservation: getFinancialDecimal(ownedUnits),
    paperAccountReservedEntryCollateral: getFinancialDecimal(paperUnits),
    reservationEqualityAsserted: true,
  };
}

const MIGRATIONS = [
  {
    version: 1,
    sql: `CREATE TABLE order_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT UNIQUE NOT NULL,
  client_order_id TEXT NOT NULL,event_type TEXT NOT NULL,occurred_at TEXT NOT NULL,previous_state_hash TEXT NOT NULL,
  resulting_state_hash TEXT NOT NULL,order_json TEXT NOT NULL);CREATE TABLE order_projections(client_order_id TEXT PRIMARY KEY,
  order_json TEXT NOT NULL,state_hash TEXT NOT NULL);CREATE TABLE order_fills(fill_id TEXT PRIMARY KEY,client_order_id TEXT NOT NULL,
  price_units TEXT NOT NULL,quantity_units TEXT NOT NULL,notional_units TEXT NOT NULL,evidence_json TEXT NOT NULL);
  CREATE TABLE consumed_risk_decisions(intent_id TEXT PRIMARY KEY,client_order_id TEXT UNIQUE NOT NULL);
  CREATE TABLE order_outbox(command_id TEXT PRIMARY KEY,client_order_id TEXT NOT NULL,kind TEXT NOT NULL,payload_json TEXT NOT NULL,
  attempt_count INTEGER NOT NULL,next_attempt_at TEXT NOT NULL,delivered_at TEXT);CREATE TABLE adapter_acknowledgements(
  acknowledgement_id TEXT PRIMARY KEY,command_id TEXT NOT NULL,client_order_id TEXT NOT NULL,kind TEXT NOT NULL,acknowledged_at TEXT NOT NULL);
  CREATE TABLE reconciliation_records(record_id TEXT PRIMARY KEY,client_order_id TEXT NOT NULL,result TEXT NOT NULL,occurred_at TEXT NOT NULL);`,
  },
];
export class sqlite_order_repository implements order_repository {
  private readonly db: Database.Database;
  constructor(path: string) {
    this.db = new Database(path, { timeout: 5000 });
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    const version = this.db.pragma('user_version', { simple: true }) as number;
    if (version > 1) throw new Error('UNSAFE_ORDER_MIGRATION');
    if (version < 1)
      this.db.transaction(() => {
        this.db.exec(MIGRATIONS[0]!.sql);
        this.db.pragma('user_version = 1');
      })();
    this.validateReplay();
  }
  getOrder(id: string): managed_order | null {
    const row = this.db
      .prepare('SELECT order_json FROM order_projections WHERE client_order_id=?')
      .get(id) as { order_json: string } | undefined;
    return row === undefined ? null : (JSON.parse(row.order_json) as managed_order);
  }
  saveTransition(
    order: managed_order,
    eventId: string,
    eventType: string,
    occurredAt: string,
    command?: outbox_command,
  ): void {
    const existing = this.getOrder(order.instruction.clientOrderId);
    const previousHash = existing === null ? hash(null) : hash(existing);
    const resultingHash = hash(order),
      json = JSON.stringify(order);
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO order_events(
      event_id,client_order_id,event_type,occurred_at,previous_state_hash,resulting_state_hash,order_json)VALUES(?,?,?,?,?,?,?)`,
        )
        .run(
          eventId,
          order.instruction.clientOrderId,
          eventType,
          occurredAt,
          previousHash,
          resultingHash,
          json,
        );
      this.db
        .prepare(
          `INSERT INTO order_projections VALUES(?,?,?) ON CONFLICT(client_order_id)DO UPDATE SET
      order_json=excluded.order_json,state_hash=excluded.state_hash`,
        )
        .run(order.instruction.clientOrderId, json, resultingHash);
      if (command !== undefined)
        this.db
          .prepare('INSERT OR IGNORE INTO order_outbox VALUES(?,?,?,?,?,?,?)')
          .run(
            command.commandId,
            command.clientOrderId,
            command.kind,
            JSON.stringify(command.payload),
            command.attemptCount,
            command.nextAttemptAt,
            command.deliveredAt,
          );
    })();
  }
  consumeIntent(intentId: string, orderId: string): void {
    try {
      this.db.prepare('INSERT INTO consumed_risk_decisions VALUES(?,?)').run(intentId, orderId);
    } catch {
      throw new Error('RISK_DECISION_ALREADY_CONSUMED');
    }
  }
  saveFill(fill: adapter_fill): 'INSERTED' | 'DUPLICATE' {
    const price = units(fill.price),
      quantity = units(fill.quantity),
      notional = (price * quantity) / 100_000_000n;
    const row = this.db
      .prepare('SELECT price_units,quantity_units FROM order_fills WHERE fill_id=?')
      .get(fill.fillId) as { price_units: string; quantity_units: string } | undefined;
    if (row !== undefined) {
      if (row.price_units !== price.toString() || row.quantity_units !== quantity.toString())
        throw new Error('INCONSISTENT_DUPLICATE_FILL');
      return 'DUPLICATE';
    }
    this.db
      .prepare('INSERT INTO order_fills VALUES(?,?,?,?,?,?)')
      .run(
        fill.fillId,
        fill.clientOrderId,
        price.toString(),
        quantity.toString(),
        notional.toString(),
        JSON.stringify(fill.evidenceIds),
      );
    return 'INSERTED';
  }
  saveAcknowledgement(ack: adapter_acknowledgement): boolean {
    return (
      this.db
        .prepare('INSERT OR IGNORE INTO adapter_acknowledgements VALUES(?,?,?,?,?)')
        .run(ack.acknowledgementId, ack.commandId, ack.clientOrderId, ack.kind, ack.acknowledgedAt)
        .changes === 1
    );
  }
  getPendingCommands(): outbox_command[] {
    return (
      this.db
        .prepare('SELECT * FROM order_outbox WHERE delivered_at IS NULL ORDER BY rowid')
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({
      commandId: String(row.command_id),
      clientOrderId: String(row.client_order_id),
      kind: row.kind as outbox_command['kind'],
      payload: JSON.parse(String(row.payload_json)) as order_instruction,
      attemptCount: Number(row.attempt_count),
      nextAttemptAt: String(row.next_attempt_at),
      deliveredAt: null,
    }));
  }
  markAttempt(id: string, at: string): void {
    this.db
      .prepare(
        'UPDATE order_outbox SET attempt_count=attempt_count+1,next_attempt_at=? WHERE command_id=?',
      )
      .run(at, id);
  }
  markDelivered(id: string, at: string): void {
    this.db.prepare('UPDATE order_outbox SET delivered_at=? WHERE command_id=?').run(at, id);
  }
  markOrderCommandsDelivered(clientOrderId: string, at: string): void {
    this.db
      .prepare(
        'UPDATE order_outbox SET delivered_at=? WHERE client_order_id=? AND delivered_at IS NULL',
      )
      .run(at, clientOrderId);
  }
  getOutboxEvidence() {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS command_count,
    COALESCE(SUM(attempt_count),0) AS attempt_count,
    SUM(CASE WHEN delivered_at IS NULL THEN 1 ELSE 0 END) AS pending_count FROM order_outbox`,
      )
      .get() as { command_count: number; attempt_count: number; pending_count: number };
    return {
      commandCount: row.command_count,
      dispatchAttemptCount: row.attempt_count,
      pendingCount: row.pending_count,
    };
  }
  getAllOrders(): managed_order[] {
    return (
      this.db
        .prepare('SELECT order_json FROM order_projections ORDER BY client_order_id')
        .all() as Array<{ order_json: string }>
    ).map((row) => JSON.parse(row.order_json) as managed_order);
  }
  validateReplay(): void {
    const rows = this.db.prepare('SELECT * FROM order_events ORDER BY sequence').all() as Array<
      Record<string, unknown>
    >;
    const states = new Map<string, managed_order>();
    for (const row of rows) {
      const id = String(row.client_order_id),
        previous = states.get(id) ?? null;
      if (String(row.previous_state_hash) !== hash(previous))
        throw new Error('ORDER_EVENT_CHAIN_CORRUPTED');
      const next = JSON.parse(String(row.order_json)) as managed_order;
      if (String(row.resulting_state_hash) !== hash(next))
        throw new Error('ORDER_EVENT_CHAIN_CORRUPTED');
      states.set(id, next);
    }
    for (const [id, state] of states) {
      const projection = this.getOrder(id);
      if (projection === null || hash(projection) !== hash(state))
        throw new Error('ORDER_PROJECTION_MISMATCH');
    }
  }
  getSchemaVersion() {
    return this.db.pragma('user_version', { simple: true }) as number;
  }
  close() {
    this.db.close();
  }
}

export class deterministic_clock implements clock {
  constructor(private timestamp: string) {}
  now() {
    return this.timestamp;
  }
  advance(milliseconds: number) {
    this.timestamp = new Date(Date.parse(this.timestamp) + milliseconds).toISOString();
  }
}
export class paper_execution_adapter implements execution_adapter {
  readonly liveExecutionEnabled = false;
  constructor(
    private readonly Clock: clock,
    readonly placementLatencyMs = 250,
    readonly cancelLatencyMs = 250,
  ) {}
  dispatch(command: outbox_command): adapter_acknowledgement | null {
    return {
      acknowledgementId: stableId('ack', command.commandId),
      commandId: command.commandId,
      clientOrderId: command.clientOrderId,
      kind: command.kind === 'CANCEL_ORDER' ? 'CANCEL_ACKNOWLEDGED' : 'SUBMIT_ACKNOWLEDGED',
      acknowledgedAt: new Date(
        Date.parse(this.Clock.now()) +
          (command.kind === 'CANCEL_ORDER' ? this.cancelLatencyMs : this.placementLatencyMs),
      ).toISOString(),
    };
  }
  reconcile(id: string): adapter_acknowledgement {
    return {
      acknowledgementId: stableId('reconcile', id),
      commandId: stableId('command', id, 'reconcile'),
      clientOrderId: id,
      kind: 'RECONCILED_INACTIVE',
      acknowledgedAt: this.Clock.now(),
    };
  }
  evaluateFill(
    instruction: order_instruction,
    activeAt: string,
    fill: adapter_fill,
    bestBid: number,
    bestAsk: number,
    availableOppositeVolume: number,
  ): adapter_fill | null {
    if (
      fill.eventTimestamp < activeAt ||
      fill.liquidityRole !== 'MAKER' ||
      fill.evidenceIds.length === 0
    )
      return null;
    const eligible =
      instruction.side === 'BUY'
        ? fill.fillSource === 'STRICT_TRADE_THROUGH'
          ? fill.price < (instruction.limitPrice ?? 0)
          : fill.price <= (instruction.limitPrice ?? 0) && availableOppositeVolume > 0
        : fill.fillSource === 'STRICT_TRADE_THROUGH'
          ? fill.price > (instruction.limitPrice ?? 0)
          : fill.price >= (instruction.limitPrice ?? 0) && availableOppositeVolume > 0;
    if (bestBid >= bestAsk || !eligible) return null;
    return { ...fill, quantity: Math.min(fill.quantity, availableOppositeVolume) };
  }
}

export type manager_context = {
  riskState: risk_state;
  runtimeHealth: 'HEALTHY' | 'DEGRADED' | 'FAILED';
  paperAccountActive: boolean;
  marketDataMaximumAgeMs: number;
  now: string;
};
export class order_manager {
  constructor(
    private readonly Repository: sqlite_order_repository,
    private readonly RiskReader: risk_decision_reader,
    private readonly PaperAccount: paper_account_writer,
    private readonly MarketReader: market_snapshot_reader,
    private readonly Clock: clock,
    private readonly entryTtlSeconds = 30,
    private readonly cancelTimeoutMs = 5_000,
  ) {}
  createEntry(intentId: string, attempt = 1): managed_order {
    const persisted = this.RiskReader.getPersistedApproval(intentId);
    if (persisted === null) throw new Error('RISK_DECISION_MISSING');
    const { intent, decision } = persisted;
    if (decision.status !== 'APPROVED') throw new Error('RISK_DECISION_REJECTED');
    const id = getClientOrderId(intentId, 'ENTRY', attempt);
    const existing = this.Repository.getOrder(id);
    if (existing !== null) return existing;
    if (
      decision.approvedLeverage !== 40 ||
      decision.requestedLeverage !== 40 ||
      decision.roundedEntryPrice === null ||
      decision.roundedStopLossPrice === null
    )
      throw new Error('RISK_DECISION_MISMATCH');
    const instruction: order_instruction = {
      intentId,
      riskDecisionId: intentId,
      clientOrderId: id,
      marketAddress: intent.marketAddress,
      side: intent.direction === 'LONG' ? 'BUY' : 'SELL',
      positionEffect: 'OPEN',
      orderType: 'POST_ONLY_LIMIT',
      leverage: 40,
      requestedQuantity: decision.calculatedQuantity,
      allocatedMargin: decision.allocatedMargin,
      positionNotional: decision.positionNotional,
      limitPrice: decision.roundedEntryPrice,
      stopPrice: decision.roundedStopLossPrice,
      createdAt: this.Clock.now(),
      expiresAt: new Date(Date.parse(this.Clock.now()) + this.entryTtlSeconds * 1000).toISOString(),
      strategyVersion: intent.strategyVersion,
      riskPolicyVersion: decision.policyVersion,
      paperAccountVersion: 'BTC_USD_PAPER_V1',
      correlationId: intentId,
      causationId: null,
    };
    const order: managed_order = {
      instruction,
      state: 'CREATED',
      filledQuantityUnits: '0',
      decisionAt: decision.decisionTimestamp,
      validationAt: null,
      submitRequestedAt: null,
      adapterReceivedAt: null,
      acknowledgedAt: null,
      activeAt: null,
      cancelEffectiveAt: null,
      reasonCodes: [],
    };
    this.Repository.consumeIntent(intentId, id);
    this.Repository.saveTransition(order, `${id}:created`, 'CREATED', this.Clock.now());
    return order;
  }
  createExit(
    reason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'OPERATOR',
    limitPrice: number | null,
  ): managed_order {
    const position = this.PaperAccount.getState().position;
    if (position === null || !['OPEN', 'CLOSING'].includes(position.state))
      throw new Error('POSITION_MISSING');
    const id = getExitOrderId(position.positionId, reason),
      existing = this.Repository.getOrder(id);
    if (existing !== null) return existing;
    const quantity = Number(BigInt(position.remainingQuantityUnits)) / 100_000_000;
    const instruction: order_instruction = {
      intentId: `exit:${position.positionId}:${reason}`,
      riskDecisionId: 'PROTECTIVE_EXIT',
      clientOrderId: id,
      marketAddress: position.marketAddress,
      side: position.direction === 'LONG' ? 'SELL' : 'BUY',
      positionEffect: 'REDUCE_ONLY',
      orderType:
        reason === 'STOP_LOSS'
          ? 'STOP_LOSS_EXIT'
          : reason === 'TAKE_PROFIT'
            ? 'TAKE_PROFIT_EXIT'
            : 'OPERATOR_EXIT',
      leverage: 40,
      requestedQuantity: quantity,
      allocatedMargin: 0,
      positionNotional: 0,
      limitPrice,
      stopPrice: null,
      createdAt: this.Clock.now(),
      expiresAt: new Date(Date.parse(this.Clock.now()) + this.entryTtlSeconds * 1000).toISOString(),
      strategyVersion: 'PROTECTIVE_EXIT',
      riskPolicyVersion: 'BTC_USD_40X_RISK_V1',
      paperAccountVersion: 'BTC_USD_PAPER_V1',
      correlationId: position.positionId,
      causationId: reason,
    };
    const order: managed_order = {
      instruction,
      state: 'CREATED',
      filledQuantityUnits: '0',
      decisionAt: this.Clock.now(),
      validationAt: null,
      submitRequestedAt: null,
      adapterReceivedAt: null,
      acknowledgedAt: null,
      activeAt: null,
      cancelEffectiveAt: null,
      reasonCodes: [],
    };
    this.Repository.saveTransition(order, `${id}:created`, 'CREATED', this.Clock.now());
    return order;
  }
  validateEntry(id: string, context: manager_context): managed_order {
    const order = this.required(id);
    this.move(order, 'VALIDATING');
    const reject = (reason: string) => {
      this.move(order, 'REJECTED');
      order.reasonCodes = [reason];
      this.Repository.saveTransition(
        order,
        `${id}:rejected:${reason}`,
        'REJECTED',
        this.Clock.now(),
      );
      return order;
    };
    if (context.riskState !== 'ACTIVE') return reject('RISK_STATE_NOT_ACTIVE');
    if (context.runtimeHealth !== 'HEALTHY') return reject('UNHEALTHY_RUNTIME');
    if (!context.paperAccountActive || this.PaperAccount.getState().status !== 'ACTIVE')
      return reject('PAPER_ACCOUNT_NOT_ACTIVE');
    if (
      this.PaperAccount.getState().position !== null &&
      this.PaperAccount.getState().position?.state !== 'CLOSED'
    )
      return reject('POSITION_EXISTS');
    if (Date.parse(context.now) >= Date.parse(order.instruction.expiresAt))
      return reject('ORDER_EXPIRED');
    const book = this.MarketReader.getSnapshot(context.now);
    if (
      book === null ||
      Date.parse(context.now) - Date.parse(book.observedAt) > context.marketDataMaximumAgeMs
    )
      return reject('STALE_MARKET_DATA');
    if (book.mode !== 'Open') return reject('MARKET_NOT_OPEN');
    if (book.crossed || book.bestBid >= book.bestAsk) return reject('INVALID_BOOK');
    if (
      order.instruction.side === 'BUY' &&
      (order.instruction.limitPrice ?? Infinity) >= book.bestAsk
    )
      return reject('POST_ONLY_WOULD_CROSS');
    if (
      order.instruction.side === 'SELL' &&
      (order.instruction.limitPrice ?? -Infinity) <= book.bestBid
    )
      return reject('POST_ONLY_WOULD_CROSS');
    this.move(order, 'READY_TO_SUBMIT');
    order.validationAt = this.Clock.now();
    this.Repository.saveTransition(order, `${id}:ready`, 'READY_TO_SUBMIT', this.Clock.now());
    return order;
  }
  validateExit(id: string, context: manager_context): managed_order {
    const order = this.required(id);
    if (order.instruction.positionEffect !== 'REDUCE_ONLY') throw new Error('NOT_REDUCE_ONLY');
    this.move(order, 'VALIDATING');
    const position = this.PaperAccount.getState().position;
    if (
      position === null ||
      BigInt(position.remainingQuantityUnits) < units(order.instruction.requestedQuantity)
    ) {
      this.move(order, 'REJECTED');
      order.reasonCodes = ['EXIT_QUANTITY_EXCEEDS_POSITION'];
      this.Repository.saveTransition(
        order,
        `${id}:rejected:quantity`,
        'REJECTED',
        this.Clock.now(),
      );
      return order;
    }
    if (context.riskState === 'HALTED' || !context.paperAccountActive) {
      this.move(order, 'REJECTED');
      order.reasonCodes = ['PROTECTIVE_EXIT_UNAVAILABLE'];
      this.Repository.saveTransition(
        order,
        `${id}:rejected:unavailable`,
        'REJECTED',
        this.Clock.now(),
      );
      return order;
    }
    this.move(order, 'READY_TO_SUBMIT');
    order.validationAt = this.Clock.now();
    this.Repository.saveTransition(order, `${id}:ready`, 'READY_TO_SUBMIT', this.Clock.now());
    return order;
  }
  enqueueSubmit(id: string): outbox_command {
    const order = this.required(id);
    this.move(order, 'SUBMIT_PENDING');
    order.submitRequestedAt = this.Clock.now();
    const command = {
      commandId: stableId('command', id, 'submit'),
      clientOrderId: id,
      kind: 'SUBMIT_ORDER' as const,
      payload: order.instruction,
      attemptCount: 0,
      nextAttemptAt: this.Clock.now(),
      deliveredAt: null,
    };
    this.Repository.saveTransition(
      order,
      `${id}:submit-pending`,
      'SUBMIT_PENDING',
      this.Clock.now(),
      command,
    );
    return command;
  }
  dispatch(command: outbox_command, adapter: execution_adapter): adapter_acknowledgement | null {
    this.Repository.markAttempt(command.commandId, this.Clock.now());
    return adapter.dispatch(command);
  }
  acknowledge(ack: adapter_acknowledgement): managed_order {
    const order = this.required(ack.clientOrderId);
    if (!this.Repository.saveAcknowledgement(ack)) return order;
    if (ack.kind === 'SUBMIT_ACKNOWLEDGED') {
      this.move(order, 'ACKNOWLEDGED');
      order.acknowledgedAt = ack.acknowledgedAt;
      order.adapterReceivedAt = ack.acknowledgedAt;
      this.Repository.saveTransition(
        order,
        `${order.instruction.clientOrderId}:ack`,
        'ACKNOWLEDGED',
        ack.acknowledgedAt,
      );
      this.move(order, 'ACTIVE');
      order.activeAt = ack.acknowledgedAt;
      if (order.instruction.positionEffect === 'OPEN') {
        this.PaperAccount.consumeRiskDecision(
          this.RiskReader,
          order.instruction.intentId,
          order.instruction.clientOrderId,
          ack.acknowledgedAt,
        );
        this.PaperAccount.activateOrder(order.instruction.clientOrderId, ack.acknowledgedAt);
      }
      this.Repository.saveTransition(
        order,
        `${order.instruction.clientOrderId}:active`,
        'ACTIVE',
        ack.acknowledgedAt,
      );
      this.Repository.markDelivered(ack.commandId, ack.acknowledgedAt);
    } else if (ack.kind === 'CANCEL_ACKNOWLEDGED') {
      this.move(order, 'CANCEL_ACKNOWLEDGED');
      this.Repository.saveTransition(
        order,
        `${order.instruction.clientOrderId}:cancel-ack`,
        'CANCEL_ACKNOWLEDGED',
        ack.acknowledgedAt,
      );
      this.PaperAccount.cancelOrder(order.instruction.clientOrderId, ack.acknowledgedAt);
      this.move(order, 'CANCELLED');
      this.Repository.saveTransition(
        order,
        `${order.instruction.clientOrderId}:cancelled`,
        'CANCELLED',
        ack.acknowledgedAt,
      );
      this.Repository.markDelivered(ack.commandId, ack.acknowledgedAt);
    } else if (ack.kind === 'RECONCILED_INACTIVE') {
      this.move(order, 'CANCELLED');
      this.PaperAccount.cancelOrder(order.instruction.clientOrderId, ack.acknowledgedAt);
      this.Repository.saveTransition(
        order,
        `${order.instruction.clientOrderId}:reconciled-inactive`,
        'CANCELLED',
        ack.acknowledgedAt,
      );
      this.Repository.markOrderCommandsDelivered(
        order.instruction.clientOrderId,
        ack.acknowledgedAt,
      );
    } else if (ack.kind === 'RECONCILED_ACTIVE') {
      this.move(order, 'ACTIVE');
      this.Repository.saveTransition(
        order,
        `${order.instruction.clientOrderId}:reconciled-active`,
        'ACTIVE',
        ack.acknowledgedAt,
      );
      this.Repository.markOrderCommandsDelivered(
        order.instruction.clientOrderId,
        ack.acknowledgedAt,
      );
    }
    return order;
  }
  applyFill(fill: adapter_fill): 'INSERTED' | 'DUPLICATE' {
    const order = this.required(fill.clientOrderId);
    if (!['ACTIVE', 'PARTIALLY_FILLED', 'CANCEL_PENDING'].includes(order.state))
      throw new Error('FILL_NOT_ALLOWED');
    if (order.cancelEffectiveAt !== null && fill.eventTimestamp >= order.cancelEffectiveAt)
      throw new Error('FILL_AFTER_CANCELLATION');
    if (order.instruction.orderType === 'POST_ONLY_LIMIT' && fill.liquidityRole !== 'MAKER')
      throw new Error('ENTRY_FILL_NOT_MAKER');
    if (
      order.instruction.limitPrice !== null &&
      (order.instruction.side === 'BUY'
        ? fill.price > order.instruction.limitPrice
        : fill.price < order.instruction.limitPrice)
    )
      throw new Error('FILL_PRICE_VIOLATION');
    const result = this.Repository.saveFill(fill);
    if (result === 'DUPLICATE') return result;
    const quantity = units(fill.quantity),
      newFilled = BigInt(order.filledQuantityUnits) + quantity,
      total = units(order.instruction.requestedQuantity);
    if (newFilled > total) throw new Error('ORDER_OVERFILL');
    order.filledQuantityUnits = newFilled.toString();
    const complete = newFilled === total;
    if (complete) this.move(order, 'FILLED');
    else if (order.state !== 'CANCEL_PENDING') this.move(order, 'PARTIALLY_FILLED');
    if (order.instruction.positionEffect === 'OPEN')
      this.PaperAccount.recordEntryFill(
        order.instruction.clientOrderId,
        fill.fillId,
        fill.price,
        fill.quantity,
        fill.feeRate,
        fill.eventTimestamp,
      );
    else
      this.PaperAccount.recordExitFill(
        fill.fillId,
        fill.price,
        fill.quantity,
        fill.feeRate,
        fill.eventTimestamp,
      );
    this.Repository.saveTransition(
      order,
      `${order.instruction.clientOrderId}:fill:${fill.fillId}`,
      order.state,
      fill.eventTimestamp,
    );
    return 'INSERTED';
  }
  requestCancel(id: string): outbox_command {
    const order = this.required(id);
    this.move(order, 'CANCEL_PENDING');
    order.cancelEffectiveAt = new Date(
      Date.parse(this.Clock.now()) + this.cancelTimeoutMs,
    ).toISOString();
    this.PaperAccount.requestCancel(id, this.Clock.now(), order.cancelEffectiveAt);
    const command = {
      commandId: stableId('command', id, 'cancel'),
      clientOrderId: id,
      kind: 'CANCEL_ORDER' as const,
      payload: order.instruction,
      attemptCount: 0,
      nextAttemptAt: this.Clock.now(),
      deliveredAt: null,
    };
    this.Repository.saveTransition(
      order,
      `${id}:cancel-pending`,
      'CANCEL_PENDING',
      this.Clock.now(),
      command,
    );
    return command;
  }
  markCancellationUncertain(id: string): void {
    const order = this.required(id);
    this.move(order, 'RECONCILIATION_REQUIRED');
    this.Repository.saveTransition(
      order,
      `${id}:reconciliation-required`,
      'RECONCILIATION_REQUIRED',
      this.Clock.now(),
      {
        commandId: stableId('command', id, 'reconcile'),
        clientOrderId: id,
        kind: 'REQUEST_RECONCILIATION',
        payload: order.instruction,
        attemptCount: 0,
        nextAttemptAt: this.Clock.now(),
        deliveredAt: null,
      },
    );
  }
  observeRiskState(state: risk_state): void {
    if (state === 'ACTIVE') return;
    for (const command of this.Repository.getPendingCommands()) {
      const order = this.Repository.getOrder(command.clientOrderId);
      if (
        order !== null &&
        order.instruction.positionEffect === 'OPEN' &&
        ['ACTIVE', 'PARTIALLY_FILLED'].includes(order.state)
      )
        this.requestCancel(order.instruction.clientOrderId);
    }
  }
  private required(id: string) {
    const order = this.Repository.getOrder(id);
    if (order === null) throw new Error('ORDER_MISSING');
    return order;
  }
  private move(order: managed_order, to: managed_order_state) {
    validateOrderTransition(order.state, to);
    order.state = to;
  }
}
