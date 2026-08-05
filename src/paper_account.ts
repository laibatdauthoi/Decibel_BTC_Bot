import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';

import { getFinancialDecimal, getFinancialUnits } from './risk_engine.js';
import type { risk_repository } from './risk_repository.js';

const SCALE = 100_000_000n;
export const PAPER_ACCOUNT_VERSION = 'BTC_USD_PAPER_V1';
export const DAILY_MINIMUM_FILLED_VOLUME_USD = 10_000;
export type paper_order_state =
  | 'CREATED'
  | 'ACTIVE'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REJECTED';
export type paper_position_state = 'FLAT' | 'OPENING' | 'OPEN' | 'CLOSING' | 'CLOSED';
export type paper_event_type =
  | 'ACCOUNT_INITIALIZED'
  | 'RISK_INTENT_ACCEPTED'
  | 'ORDER_CREATED'
  | 'ORDER_ACTIVATED'
  | 'ORDER_PARTIALLY_FILLED'
  | 'ORDER_FILLED'
  | 'ORDER_CANCEL_REQUESTED'
  | 'ORDER_CANCELLED'
  | 'ORDER_EXPIRED'
  | 'ORDER_REJECTED'
  | 'POSITION_OPENED'
  | 'POSITION_INCREASE_REJECTED'
  | 'EXIT_INTENT_CREATED'
  | 'POSITION_PARTIALLY_CLOSED'
  | 'POSITION_CLOSED'
  | 'STOP_TRIGGERED'
  | 'TAKE_PROFIT_TRIGGERED'
  | 'FUNDING_APPLIED'
  | 'FEE_APPLIED'
  | 'MARK_UPDATED'
  | 'DAILY_VOLUME_UPDATED'
  | 'RISK_PAUSE_OBSERVED'
  | 'OPERATOR_ACTION_RECORDED'
  | 'ACCOUNT_HALTED';

type paper_order = {
  orderId: string;
  intentId: string;
  marketAddress: string;
  kind: 'ENTRY' | 'EXIT';
  state: paper_order_state;
  direction: 'LONG' | 'SHORT';
  requestedQuantityUnits: string;
  filledQuantityUnits: string;
  priceUnits: string;
  stopLossPriceUnits: string;
  takeProfitPriceUnits: string | null;
  reservedMarginUnits: string;
  effectiveCancelAt: string | null;
  reduceOnly: boolean;
};
type paper_position = {
  positionId: string;
  state: paper_position_state;
  marketAddress: string;
  direction: 'LONG' | 'SHORT';
  leverage: 40;
  totalEntryQuantityUnits: string;
  remainingQuantityUnits: string;
  averageEntryPriceUnits: string;
  allocatedMarginUnits: string;
  positionNotionalUnits: string;
  makerEntryFeesUnits: string;
  exitFeesUnits: string;
  fundingUnits: string;
  realizedPnLUnits: string;
  unrealizedPnLUnits: string;
  stopLossPriceUnits: string;
  takeProfitPriceUnits: string | null;
  openedAt: string;
  closedAt: string | null;
  sourceIntentId: string;
  strategyVersion: string;
  riskPolicyVersion: string;
};
export type paper_account_state = {
  status: 'ACTIVE' | 'HALTED';
  startingEquityUnits: string;
  totalEquityUnits: string;
  availableCollateralUnits: string;
  reservedEntryCollateralUnits: string;
  allocatedPositionMarginUnits: string;
  releasedMarginUnits: string;
  cumulativeFeesUnits: string;
  cumulativeFundingUnits: string;
  realizedPnLUnits: string;
  unrealizedPnLUnits: string;
  fundingAvailability: 'MISSING' | 'AVAILABLE';
  orders: Record<string, paper_order>;
  position: paper_position | null;
  consumedIntentIds: string[];
  processedFillIds: string[];
  dailyVolumeUnits: Record<string, string>;
  exitIntentObservationId: string | null;
  eventCount: number;
};
export type paper_event = {
  eventId: string;
  eventType: paper_event_type;
  occurredAt: string;
  receivedAt: string;
  correlationId: string;
  causationId: string | null;
  intentId: string | null;
  orderId: string | null;
  fillId: string | null;
  positionId: string | null;
  payloadVersion: 1;
  payload: Record<string, unknown>;
  previousStateHash: string;
  resultingStateHash: string;
};

const units = (value: number): bigint => getFinancialUnits(value);
const text = (value: bigint): string => value.toString();
const value = (input: string): bigint => BigInt(input);
const mul = (left: bigint, right: bigint): bigint => (left * right) / SCALE;
function stable(valueToHash: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(valueToHash)).digest('hex')}`;
}
function calculateEquity(state: paper_account_state): bigint {
  return (
    value(state.startingEquityUnits) +
    value(state.realizedPnLUnits) +
    value(state.unrealizedPnLUnits) -
    value(state.cumulativeFeesUnits) +
    value(state.cumulativeFundingUnits)
  );
}
function recalculate(state: paper_account_state): void {
  const equity = calculateEquity(state);
  state.totalEquityUnits = text(equity);
  state.availableCollateralUnits = text(
    equity - value(state.reservedEntryCollateralUnits) - value(state.allocatedPositionMarginUnits),
  );
}
export function assertPaperInvariants(state: paper_account_state): void {
  if (calculateEquity(state) !== value(state.totalEquityUnits)) throw new Error('EQUITY_IDENTITY');
  if (value(state.availableCollateralUnits) < 0n) throw new Error('NEGATIVE_COLLATERAL');
  if (
    value(state.reservedEntryCollateralUnits) < 0n ||
    value(state.allocatedPositionMarginUnits) < 0n
  )
    throw new Error('NEGATIVE_MARGIN');
  if (state.position !== null) {
    if (value(state.position.remainingQuantityUnits) < 0n) throw new Error('NEGATIVE_POSITION');
    if (state.position.state === 'CLOSED' && value(state.position.remainingQuantityUnits) !== 0n)
      throw new Error('CLOSED_POSITION_QUANTITY');
    if (
      state.position.state !== 'CLOSED' &&
      value(state.position.positionNotionalUnits) !==
        value(state.position.allocatedMarginUnits) * 40n
    )
      throw new Error('LEVERAGE_NOT_40');
  }
  for (const order of Object.values(state.orders))
    if (value(order.filledQuantityUnits) > value(order.requestedQuantityUnits))
      throw new Error('ORDER_OVERFILL');
}
function initialState(startingEquity: number): paper_account_state {
  const equity = text(units(startingEquity));
  return {
    status: 'ACTIVE',
    startingEquityUnits: equity,
    totalEquityUnits: equity,
    availableCollateralUnits: equity,
    reservedEntryCollateralUnits: '0',
    allocatedPositionMarginUnits: '0',
    releasedMarginUnits: '0',
    cumulativeFeesUnits: '0',
    cumulativeFundingUnits: '0',
    realizedPnLUnits: '0',
    unrealizedPnLUnits: '0',
    fundingAvailability: 'MISSING',
    orders: {},
    position: null,
    consumedIntentIds: [],
    processedFillIds: [],
    dailyVolumeUnits: {},
    exitIntentObservationId: null,
    eventCount: 0,
  };
}

const MIGRATIONS = [
  {
    version: 1,
    sql: `
  CREATE TABLE paper_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL, occurred_at TEXT NOT NULL, received_at TEXT NOT NULL,
    correlation_id TEXT NOT NULL, causation_id TEXT, intent_id TEXT, order_id TEXT, fill_id TEXT,
    position_id TEXT, payload_version INTEGER NOT NULL, payload_json TEXT NOT NULL,
    previous_state_hash TEXT NOT NULL, resulting_state_hash TEXT NOT NULL, resulting_state_json TEXT NOT NULL);
  CREATE UNIQUE INDEX paper_events_fill_id ON paper_events(fill_id) WHERE fill_id IS NOT NULL;
  CREATE TABLE paper_account_projection(singleton INTEGER PRIMARY KEY CHECK(singleton=1),
    state_json TEXT NOT NULL, state_hash TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE paper_consumed_intents(intent_id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE);
  CREATE TABLE paper_processed_fills(fill_id TEXT PRIMARY KEY, event_id TEXT NOT NULL UNIQUE);
  CREATE TABLE paper_daily_volume(utc_day TEXT PRIMARY KEY, volume_units TEXT NOT NULL);
  `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE paper_order_projections(order_id TEXT PRIMARY KEY, order_json TEXT NOT NULL,
        state_hash TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE paper_position_projection(singleton INTEGER PRIMARY KEY CHECK(singleton=1),
        position_json TEXT, state_hash TEXT NOT NULL, updated_at TEXT NOT NULL);
    `,
  },
];

export class paper_account_repository {
  private readonly database: Database.Database;
  private state: paper_account_state;
  constructor(databasePath: string, startingEquity = 30) {
    this.database = new Database(databasePath, { timeout: 5_000 });
    this.database.pragma('journal_mode = WAL');
    this.database.pragma('busy_timeout = 5000');
    const current = this.database.pragma('user_version', { simple: true }) as number;
    const latest = MIGRATIONS.at(-1)?.version ?? 0;
    if (current > latest) throw new Error('UNSAFE_PAPER_MIGRATION');
    for (const migration of MIGRATIONS) {
      if (migration.version <= current) continue;
      this.database.transaction(() => {
        this.database.exec(migration.sql);
        this.database.pragma(`user_version = ${migration.version}`);
      })();
    }
    const projection = this.database
      .prepare('SELECT state_json FROM paper_account_projection WHERE singleton=1')
      .get() as { state_json: string } | undefined;
    if (projection === undefined) {
      this.state = initialState(startingEquity);
      this.append(
        'ACCOUNT_INITIALIZED',
        'paper-account-initialized',
        '1970-01-01T00:00:00.000Z',
        {},
      );
    } else {
      this.state = JSON.parse(projection.state_json) as paper_account_state;
      try {
        this.validateReplay();
      } catch (error) {
        this.database.close();
        throw error;
      }
    }
  }
  getState(): paper_account_state {
    return structuredClone(this.state);
  }
  private append(
    eventType: paper_event_type,
    eventId: string,
    occurredAt: string,
    payload: Record<string, unknown>,
    ids: Partial<
      Pick<
        paper_event,
        'correlationId' | 'causationId' | 'intentId' | 'orderId' | 'fillId' | 'positionId'
      >
    > = {},
  ): void {
    if (this.state.status === 'HALTED' && eventType !== 'OPERATOR_ACTION_RECORDED')
      throw new Error('ACCOUNT_HALTED');
    const persistedProjection = this.database
      .prepare('SELECT state_hash FROM paper_account_projection WHERE singleton=1')
      .get() as { state_hash: string } | undefined;
    const previousStateHash = persistedProjection?.state_hash ?? stable(this.state);
    this.state.eventCount += 1;
    recalculate(this.state);
    try {
      assertPaperInvariants(this.state);
    } catch (error) {
      this.state.status = 'HALTED';
      throw error;
    }
    const resultingStateHash = stable(this.state);
    const stateJSON = JSON.stringify(this.state);
    this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO paper_events(event_id,event_type,occurred_at,received_at,
        correlation_id,causation_id,intent_id,order_id,fill_id,position_id,payload_version,payload_json,
        previous_state_hash,resulting_state_hash,resulting_state_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          eventId,
          eventType,
          occurredAt,
          occurredAt,
          ids.correlationId ?? eventId,
          ids.causationId ?? null,
          ids.intentId ?? null,
          ids.orderId ?? null,
          ids.fillId ?? null,
          ids.positionId ?? null,
          1,
          JSON.stringify(payload),
          previousStateHash,
          resultingStateHash,
          stateJSON,
        );
      this.database
        .prepare(
          `INSERT INTO paper_account_projection VALUES(1,?,?,?) ON CONFLICT(singleton)
        DO UPDATE SET state_json=excluded.state_json,state_hash=excluded.state_hash,updated_at=excluded.updated_at`,
        )
        .run(stateJSON, resultingStateHash, occurredAt);
      for (const intentId of this.state.consumedIntentIds) {
        const order = Object.values(this.state.orders).find(
          (candidate) => candidate.intentId === intentId,
        );
        if (order !== undefined)
          this.database
            .prepare('INSERT OR IGNORE INTO paper_consumed_intents VALUES (?, ?)')
            .run(intentId, order.orderId);
      }
      if (ids.fillId !== undefined)
        this.database
          .prepare('INSERT OR IGNORE INTO paper_processed_fills VALUES (?, ?)')
          .run(ids.fillId, eventId);
      for (const [utcDay, volumeUnits] of Object.entries(this.state.dailyVolumeUnits))
        this.database
          .prepare(
            `INSERT INTO paper_daily_volume VALUES (?, ?) ON CONFLICT(utc_day)
          DO UPDATE SET volume_units=excluded.volume_units`,
          )
          .run(utcDay, volumeUnits);
      for (const order of Object.values(this.state.orders))
        this.database
          .prepare(
            `INSERT INTO paper_order_projections VALUES (?, ?, ?, ?) ON CONFLICT(order_id)
          DO UPDATE SET order_json=excluded.order_json,state_hash=excluded.state_hash,updated_at=excluded.updated_at`,
          )
          .run(order.orderId, JSON.stringify(order), resultingStateHash, occurredAt);
      this.database
        .prepare(
          `INSERT INTO paper_position_projection VALUES (1, ?, ?, ?) ON CONFLICT(singleton)
        DO UPDATE SET position_json=excluded.position_json,state_hash=excluded.state_hash,updated_at=excluded.updated_at`,
        )
        .run(
          this.state.position === null ? null : JSON.stringify(this.state.position),
          resultingStateHash,
          occurredAt,
        );
    })();
  }
  consumeRiskDecision(
    RiskRepository: risk_repository,
    intentId: string,
    orderId: string,
    occurredAt: string,
    maximumAgeMs = 300_000,
  ): void {
    const persisted = RiskRepository.getPersistedApproval(intentId);
    if (persisted === null) throw new Error('RISK_DECISION_MISSING');
    const { decision, intent } = persisted;
    if (decision.status !== 'APPROVED') throw new Error('RISK_DECISION_REJECTED');
    if (
      intent.intentId !== decision.intentId ||
      intent.marketAddress.length === 0 ||
      intent.intendedEntryPrice !== decision.requestedEntryPrice ||
      intent.stopLossPrice !== decision.requestedStopLossPrice ||
      decision.policyVersion !== 'BTC_USD_40X_RISK_V1' ||
      !decision.configurationHash.startsWith('sha256:') ||
      decision.requestedLeverage !== 40 ||
      decision.approvedLeverage !== 40
    )
      throw new Error('RISK_DECISION_MISMATCH');
    if (Date.parse(occurredAt) - Date.parse(decision.decisionTimestamp) > maximumAgeMs)
      throw new Error('RISK_DECISION_STALE');
    if (this.state.consumedIntentIds.includes(intentId)) throw new Error('RISK_APPROVAL_CONSUMED');
    if (this.state.position !== null && this.state.position.state !== 'CLOSED') {
      this.append('POSITION_INCREASE_REJECTED', `${orderId}:position-rejected`, occurredAt, {
        reasonCode: 'PYRAMIDING_OR_REVERSAL',
      });
      throw new Error('PYRAMIDING_OR_REVERSAL');
    }
    if (
      Object.values(this.state.orders).some(
        (order) =>
          order.kind === 'ENTRY' &&
          !['FILLED', 'CANCELLED', 'EXPIRED', 'REJECTED'].includes(order.state),
      )
    )
      throw new Error('ENTRY_ORDER_EXISTS');
    const quantity = units(decision.calculatedQuantity),
      margin = units(decision.allocatedMargin);
    if (
      quantity <= 0n ||
      margin <= 0n ||
      decision.roundedEntryPrice === null ||
      decision.roundedStopLossPrice === null
    )
      throw new Error('RISK_DECISION_MISMATCH');
    this.state.consumedIntentIds.push(intentId);
    this.state.orders[orderId] = {
      orderId,
      intentId,
      marketAddress: intent.marketAddress,
      kind: 'ENTRY',
      state: 'CREATED',
      direction: decision.requestedStopLossPrice < decision.requestedEntryPrice ? 'LONG' : 'SHORT',
      requestedQuantityUnits: text(quantity),
      filledQuantityUnits: '0',
      priceUnits: text(units(decision.roundedEntryPrice)),
      stopLossPriceUnits: text(units(decision.roundedStopLossPrice)),
      takeProfitPriceUnits:
        decision.roundedTakeProfitPrice === null
          ? null
          : text(units(decision.roundedTakeProfitPrice)),
      reservedMarginUnits: text(margin),
      effectiveCancelAt: null,
      reduceOnly: false,
    };
    this.append(
      'RISK_INTENT_ACCEPTED',
      `${orderId}:risk`,
      occurredAt,
      { policyVersion: decision.policyVersion },
      { intentId, orderId },
    );
    this.append(
      'ORDER_CREATED',
      `${orderId}:created`,
      occurredAt,
      { quantityUnits: text(quantity), marginUnits: text(margin) },
      { intentId, orderId },
    );
  }
  activateOrder(orderId: string, occurredAt: string): void {
    const order = this.requireOrder(orderId);
    if (order.state !== 'CREATED') throw new Error('INVALID_ORDER_TRANSITION');
    order.state = 'ACTIVE';
    if (order.kind === 'ENTRY')
      this.state.reservedEntryCollateralUnits = text(
        value(this.state.reservedEntryCollateralUnits) + value(order.reservedMarginUnits),
      );
    this.append(
      'ORDER_ACTIVATED',
      `${orderId}:active`,
      occurredAt,
      {},
      { orderId, intentId: order.intentId },
    );
  }
  requestCancel(orderId: string, occurredAt: string, effectiveAt: string): void {
    const order = this.requireOrder(orderId);
    if (!['ACTIVE', 'PARTIALLY_FILLED'].includes(order.state))
      throw new Error('INVALID_ORDER_TRANSITION');
    order.state = 'CANCEL_REQUESTED';
    order.effectiveCancelAt = effectiveAt;
    this.append(
      'ORDER_CANCEL_REQUESTED',
      `${orderId}:cancel-requested`,
      occurredAt,
      { effectiveAt },
      { orderId },
    );
  }
  cancelOrder(orderId: string, occurredAt: string): void {
    const order = this.requireOrder(orderId);
    if (
      order.state !== 'CANCEL_REQUESTED' ||
      order.effectiveCancelAt === null ||
      occurredAt < order.effectiveCancelAt
    )
      throw new Error('INVALID_ORDER_TRANSITION');
    order.state = 'CANCELLED';
    this.releaseReservation(order);
    this.append('ORDER_CANCELLED', `${orderId}:cancelled`, occurredAt, {}, { orderId });
  }
  expireOrder(orderId: string, occurredAt: string): void {
    const order = this.requireOrder(orderId);
    if (!['ACTIVE', 'PARTIALLY_FILLED'].includes(order.state))
      throw new Error('INVALID_ORDER_TRANSITION');
    order.state = 'EXPIRED';
    this.releaseReservation(order);
    this.append('ORDER_EXPIRED', `${orderId}:expired`, occurredAt, {}, { orderId });
  }
  private releaseReservation(order: paper_order): void {
    if (order.kind !== 'ENTRY') return;
    this.state.reservedEntryCollateralUnits = text(
      value(this.state.reservedEntryCollateralUnits) - value(order.reservedMarginUnits),
    );
    order.reservedMarginUnits = '0';
  }
  private requireOrder(orderId: string): paper_order {
    const order = this.state.orders[orderId];
    if (order === undefined) throw new Error('ORDER_MISSING');
    return order;
  }
  recordEntryFill(
    orderId: string,
    fillId: string,
    price: number,
    quantity: number,
    feeRate: number,
    occurredAt: string,
    RiskRepository?: risk_repository,
  ): 'INSERTED' | 'DUPLICATE' {
    if (this.state.processedFillIds.includes(fillId)) return 'DUPLICATE';
    const order = this.requireOrder(orderId);
    if (!['ACTIVE', 'PARTIALLY_FILLED', 'CANCEL_REQUESTED'].includes(order.state))
      throw new Error('FILL_NOT_ALLOWED');
    if (order.effectiveCancelAt !== null && occurredAt >= order.effectiveCancelAt)
      throw new Error('FILL_AFTER_CANCELLATION');
    const fillQuantity = units(quantity),
      fillPrice = units(price),
      previousFilled = value(order.filledQuantityUnits);
    if (fillQuantity <= 0n || previousFilled + fillQuantity > value(order.requestedQuantityUnits))
      throw new Error('ORDER_OVERFILL');
    const notional = mul(fillPrice, fillQuantity),
      margin = notional / 40n,
      fee = mul(notional, units(feeRate));
    const oldReserved = value(order.reservedMarginUnits);
    const moved = margin > oldReserved ? oldReserved : margin;
    order.reservedMarginUnits = text(oldReserved - moved);
    order.filledQuantityUnits = text(previousFilled + fillQuantity);
    this.state.reservedEntryCollateralUnits = text(
      value(this.state.reservedEntryCollateralUnits) - moved,
    );
    this.state.allocatedPositionMarginUnits = text(
      value(this.state.allocatedPositionMarginUnits) + margin,
    );
    this.state.cumulativeFeesUnits = text(value(this.state.cumulativeFeesUnits) + fee);
    if (this.state.position === null || this.state.position.state === 'CLOSED') {
      this.state.position = {
        positionId: `position:${order.intentId}`,
        state: 'OPEN',
        marketAddress: order.marketAddress,
        direction: order.direction,
        leverage: 40,
        totalEntryQuantityUnits: text(fillQuantity),
        remainingQuantityUnits: text(fillQuantity),
        averageEntryPriceUnits: text(fillPrice),
        allocatedMarginUnits: text(margin),
        positionNotionalUnits: text(notional),
        makerEntryFeesUnits: text(fee),
        exitFeesUnits: '0',
        fundingUnits: '0',
        realizedPnLUnits: '0',
        unrealizedPnLUnits: '0',
        stopLossPriceUnits: order.stopLossPriceUnits,
        takeProfitPriceUnits: order.takeProfitPriceUnits,
        openedAt: occurredAt,
        closedAt: null,
        sourceIntentId: order.intentId,
        strategyVersion: 'verification-v1',
        riskPolicyVersion: 'BTC_USD_40X_RISK_V1',
      };
    } else {
      const position = this.state.position;
      if (position.direction !== order.direction) throw new Error('REVERSAL_REJECTED');
      const oldQuantity = value(position.totalEntryQuantityUnits),
        newQuantity = oldQuantity + fillQuantity;
      position.averageEntryPriceUnits = text(
        (value(position.averageEntryPriceUnits) * oldQuantity + fillPrice * fillQuantity) /
          newQuantity,
      );
      position.totalEntryQuantityUnits = text(newQuantity);
      position.remainingQuantityUnits = text(value(position.remainingQuantityUnits) + fillQuantity);
      position.positionNotionalUnits = text(value(position.positionNotionalUnits) + notional);
      position.allocatedMarginUnits = text(value(position.allocatedMarginUnits) + margin);
      position.makerEntryFeesUnits = text(value(position.makerEntryFeesUnits) + fee);
    }
    order.state =
      value(order.filledQuantityUnits) === value(order.requestedQuantityUnits)
        ? 'FILLED'
        : 'PARTIALLY_FILLED';
    if (order.state === 'FILLED' && value(order.reservedMarginUnits) > 0n)
      this.releaseReservation(order);
    this.state.processedFillIds.push(fillId);
    this.addVolume(occurredAt, notional);
    const eventType = order.state === 'FILLED' ? 'ORDER_FILLED' : 'ORDER_PARTIALLY_FILLED';
    this.append(
      eventType,
      `fill:${fillId}`,
      occurredAt,
      {
        priceUnits: text(fillPrice),
        quantityUnits: text(fillQuantity),
        notionalUnits: text(notional),
        feeUnits: text(fee),
      },
      { orderId, fillId, intentId: order.intentId, positionId: this.state.position.positionId },
    );
    if (RiskRepository !== undefined)
      RiskRepository.recordFill({ fillId, timestamp: occurredAt, price, quantity, role: 'ENTRY' });
    return 'INSERTED';
  }
  private addVolume(timestamp: string, notional: bigint): void {
    const day = new Date(timestamp).toISOString().slice(0, 10);
    this.state.dailyVolumeUnits[day] = text(
      value(this.state.dailyVolumeUnits[day] ?? '0') + (notional < 0n ? -notional : notional),
    );
  }
  updateMark(eventId: string, markPrice: number, occurredAt: string): void {
    const position = this.state.position;
    if (position === null || position.state === 'CLOSED') throw new Error('POSITION_MISSING');
    const mark = units(markPrice);
    const difference =
      position.direction === 'LONG'
        ? mark - value(position.averageEntryPriceUnits)
        : value(position.averageEntryPriceUnits) - mark;
    position.unrealizedPnLUnits = text(mul(difference, value(position.remainingQuantityUnits)));
    this.state.unrealizedPnLUnits = position.unrealizedPnLUnits;
    this.append(
      'MARK_UPDATED',
      eventId,
      occurredAt,
      { markPriceUnits: text(mark) },
      { positionId: position.positionId },
    );
  }
  triggerExit(
    observationId: string,
    markPrice: number,
    occurredAt: string,
  ): 'STOP' | 'TAKE_PROFIT' | 'NONE' {
    const position = this.state.position;
    if (position === null || position.state !== 'OPEN') return 'NONE';
    if (this.state.exitIntentObservationId !== null) return 'NONE';
    const mark = units(markPrice),
      stop = value(position.stopLossPriceUnits),
      take = position.takeProfitPriceUnits === null ? null : value(position.takeProfitPriceUnits);
    const stopHit = stop > 0n && (position.direction === 'LONG' ? mark <= stop : mark >= stop);
    const takeHit = take !== null && (position.direction === 'LONG' ? mark >= take : mark <= take);
    if (!stopHit && !takeHit) return 'NONE';
    const trigger = stopHit ? 'STOP' : 'TAKE_PROFIT';
    this.state.exitIntentObservationId = observationId;
    position.state = 'CLOSING';
    this.append(
      trigger === 'STOP' ? 'STOP_TRIGGERED' : 'TAKE_PROFIT_TRIGGERED',
      `${observationId}:trigger`,
      occurredAt,
      { markPriceUnits: text(mark) },
      { positionId: position.positionId },
    );
    this.append(
      'EXIT_INTENT_CREATED',
      `${observationId}:exit-intent`,
      occurredAt,
      { reduceOnly: true, quantityUnits: position.remainingQuantityUnits, trigger },
      { positionId: position.positionId },
    );
    return trigger;
  }
  recordExitFill(
    fillId: string,
    price: number,
    quantity: number,
    feeRate: number,
    occurredAt: string,
    RiskRepository?: risk_repository,
  ): 'INSERTED' | 'DUPLICATE' {
    if (this.state.processedFillIds.includes(fillId)) return 'DUPLICATE';
    const position = this.state.position;
    if (position === null || !['OPEN', 'CLOSING'].includes(position.state))
      throw new Error('POSITION_MISSING');
    const fillQuantity = units(quantity);
    if (fillQuantity <= 0n || fillQuantity > value(position.remainingQuantityUnits))
      throw new Error('EXIT_OVERFILL');
    const fillPrice = units(price),
      notional = mul(fillPrice, fillQuantity),
      fee = mul(notional, units(feeRate));
    const entryNotional = mul(value(position.averageEntryPriceUnits), fillQuantity);
    const pnl = position.direction === 'LONG' ? notional - entryNotional : entryNotional - notional;
    const beforeQuantity = value(position.remainingQuantityUnits),
      released = (value(position.allocatedMarginUnits) * fillQuantity) / beforeQuantity;
    position.remainingQuantityUnits = text(beforeQuantity - fillQuantity);
    position.allocatedMarginUnits = text(value(position.allocatedMarginUnits) - released);
    position.positionNotionalUnits = text(value(position.positionNotionalUnits) - released * 40n);
    position.exitFeesUnits = text(value(position.exitFeesUnits) + fee);
    position.realizedPnLUnits = text(value(position.realizedPnLUnits) + pnl);
    this.state.allocatedPositionMarginUnits = text(
      value(this.state.allocatedPositionMarginUnits) - released,
    );
    this.state.releasedMarginUnits = text(value(this.state.releasedMarginUnits) + released);
    this.state.cumulativeFeesUnits = text(value(this.state.cumulativeFeesUnits) + fee);
    this.state.realizedPnLUnits = text(value(this.state.realizedPnLUnits) + pnl);
    this.state.processedFillIds.push(fillId);
    this.addVolume(occurredAt, notional);
    const closed = value(position.remainingQuantityUnits) === 0n;
    if (closed) {
      position.state = 'CLOSED';
      position.closedAt = occurredAt;
      position.unrealizedPnLUnits = '0';
      this.state.unrealizedPnLUnits = '0';
    } else position.state = 'CLOSING';
    this.append(
      closed ? 'POSITION_CLOSED' : 'POSITION_PARTIALLY_CLOSED',
      `fill:${fillId}`,
      occurredAt,
      {
        priceUnits: text(fillPrice),
        quantityUnits: text(fillQuantity),
        notionalUnits: text(notional),
        feeUnits: text(fee),
        realizedPnLUnits: text(pnl),
      },
      { fillId, positionId: position.positionId },
    );
    if (RiskRepository !== undefined)
      RiskRepository.recordFill({ fillId, timestamp: occurredAt, price, quantity, role: 'EXIT' });
    return 'INSERTED';
  }
  applyFunding(eventId: string, amount: number, occurredAt: string): void {
    const funding = units(amount);
    this.state.cumulativeFundingUnits = text(value(this.state.cumulativeFundingUnits) + funding);
    this.state.fundingAvailability = 'AVAILABLE';
    if (this.state.position !== null)
      this.state.position.fundingUnits = text(value(this.state.position.fundingUnits) + funding);
    this.append('FUNDING_APPLIED', eventId, occurredAt, { amountUnits: text(funding) });
  }
  setProtection(stopLossPrice: number, takeProfitPrice?: number): void {
    if (this.state.position === null) throw new Error('POSITION_MISSING');
    this.state.position.stopLossPriceUnits = text(units(stopLossPrice));
    this.state.position.takeProfitPriceUnits =
      takeProfitPrice === undefined ? null : text(units(takeProfitPrice));
  }
  getDailyMinimum(utcDate: string, now: string) {
    const volume = value(this.state.dailyVolumeUnits[utcDate] ?? '0'),
      minimum = units(DAILY_MINIMUM_FILLED_VOLUME_USD);
    const date = new Date(now),
      elapsed = date.getUTCHours() * 3600 + date.getUTCMinutes() * 60 + date.getUTCSeconds();
    const projected = elapsed === 0 ? volume : (volume * 86400n) / BigInt(elapsed);
    const ended = utcDate < date.toISOString().slice(0, 10);
    return {
      utcDate,
      dailyFilledVolume: getFinancialDecimal(volume),
      dailyMinimumFilledVolume: 10_000,
      amountRemainingToMinimum: getFinancialDecimal(minimum > volume ? minimum - volume : 0n),
      completionRatio: getFinancialDecimal((volume * SCALE) / minimum),
      projectedEndOfDayVolume: getFinancialDecimal(projected),
      minimumStatus:
        volume >= minimum
          ? 'MINIMUM_MET'
          : ended
            ? 'MINIMUM_MISSED'
            : projected >= minimum
              ? 'MINIMUM_ON_TRACK'
              : elapsed > 43200
                ? 'MINIMUM_AT_RISK'
                : 'BELOW_MINIMUM',
    };
  }
  validateReplay(): void {
    let previous = stable(initialState(getFinancialDecimal(value(this.state.startingEquityUnits))));
    const rows = this.database
      .prepare(
        'SELECT previous_state_hash,resulting_state_hash,resulting_state_json FROM paper_events ORDER BY sequence',
      )
      .all() as Array<{
      previous_state_hash: string;
      resulting_state_hash: string;
      resulting_state_json: string;
    }>;
    for (const row of rows) {
      if (
        row.previous_state_hash !== previous ||
        stable(JSON.parse(row.resulting_state_json)) !== row.resulting_state_hash
      )
        throw new Error('PAPER_EVENT_CHAIN_CORRUPTED');
      previous = row.resulting_state_hash;
    }
    const projection = this.database
      .prepare('SELECT state_hash FROM paper_account_projection WHERE singleton=1')
      .get() as { state_hash: string };
    if (previous !== projection.state_hash || stable(this.state) !== projection.state_hash)
      throw new Error('PAPER_PROJECTION_MISMATCH');
    const orderRows = this.database
      .prepare('SELECT order_id,order_json FROM paper_order_projections')
      .all() as Array<{ order_id: string; order_json: string }>;
    if (
      orderRows.length !== Object.keys(this.state.orders).length ||
      orderRows.some((row) => JSON.stringify(this.state.orders[row.order_id]) !== row.order_json)
    )
      throw new Error('PAPER_ORDER_PROJECTION_MISMATCH');
    const positionRow = this.database
      .prepare('SELECT position_json FROM paper_position_projection WHERE singleton=1')
      .get() as { position_json: string | null } | undefined;
    if (
      positionRow === undefined ||
      positionRow.position_json !==
        (this.state.position === null ? null : JSON.stringify(this.state.position))
    )
      throw new Error('PAPER_POSITION_PROJECTION_MISMATCH');
    const volumeRows = this.database
      .prepare('SELECT utc_day,volume_units FROM paper_daily_volume')
      .all() as Array<{ utc_day: string; volume_units: string }>;
    if (
      volumeRows.length !== Object.keys(this.state.dailyVolumeUnits).length ||
      volumeRows.some((row) => this.state.dailyVolumeUnits[row.utc_day] !== row.volume_units)
    )
      throw new Error('PAPER_VOLUME_PROJECTION_MISMATCH');
    assertPaperInvariants(this.state);
  }
  getSchemaVersion(): number {
    return this.database.pragma('user_version', { simple: true }) as number;
  }
  getJournalMode(): string {
    return this.database.pragma('journal_mode', { simple: true }) as string;
  }
  close(): void {
    this.database.close();
  }
}

export function summarizePaperState(state: paper_account_state) {
  return {
    status: state.status,
    totalEquity: getFinancialDecimal(value(state.totalEquityUnits)),
    availableCollateral: getFinancialDecimal(value(state.availableCollateralUnits)),
    reservedEntryCollateral: getFinancialDecimal(value(state.reservedEntryCollateralUnits)),
    allocatedPositionMargin: getFinancialDecimal(value(state.allocatedPositionMarginUnits)),
    releasedMargin: getFinancialDecimal(value(state.releasedMarginUnits)),
    cumulativeFees: getFinancialDecimal(value(state.cumulativeFeesUnits)),
    cumulativeFunding: getFinancialDecimal(value(state.cumulativeFundingUnits)),
    realizedPnL: getFinancialDecimal(value(state.realizedPnLUnits)),
    unrealizedPnL: getFinancialDecimal(value(state.unrealizedPnLUnits)),
    fundingAvailability: state.fundingAvailability,
    positionState: state.position?.state ?? 'FLAT',
    dailyVolume: Object.fromEntries(
      Object.entries(state.dailyVolumeUnits).map(([day, amount]) => [
        day,
        getFinancialDecimal(value(amount)),
      ]),
    ),
  };
}
