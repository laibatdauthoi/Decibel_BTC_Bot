import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';

export const DECIBEL_DURABLE_CLIENT_ORDER_IDENTITY_RECOVERY_V1 =
  'DECIBEL_DURABLE_CLIENT_ORDER_IDENTITY_RECOVERY_V1' as const;

export type decibel_submission_journal_state_v1 =
  | 'PREPARED'
  | 'SUBMISSION_STARTED'
  | 'ACKNOWLEDGED'
  | 'RECOVERY_REQUIRED'
  | 'RECOVERED'
  | 'NOT_SUBMITTED_PROVEN'
  | 'AMBIGUOUS'
  | 'NEUTRALIZATION_REQUIRED'
  | 'CANCEL_BY_CLIENT_ID_REQUESTED'
  | 'CANCEL_BY_CLIENT_ID_TERMINAL'
  | 'EXECUTION_IDENTITY_RECOVERED'
  | 'NO_EXECUTION_PROVEN'
  | 'RECONCILED'
  | 'TERMINAL';

export function generateDecibelCanaryClientOrderIdV1(input: {
  executionSessionId: string;
  localOrderSequence: number;
  marketIdentity: string;
  strategyConfigId: string;
  side: 'BUY' | 'SELL';
}): string {
  if (
    !input.executionSessionId ||
    !Number.isSafeInteger(input.localOrderSequence) ||
    input.localOrderSequence < 0 ||
    !input.marketIdentity ||
    !input.strategyConfigId
  )
    throw new Error('DECIBEL_CANARY_CLIENT_ORDER_ID_INPUT_INVALID');
  const digest = createHash('sha256')
    .update(
      JSON.stringify([
        input.executionSessionId,
        input.localOrderSequence,
        input.marketIdentity,
        input.strategyConfigId,
        input.side,
      ]),
    )
    .digest('hex')
    .slice(0, 32);
  return `dcv1-${input.side === 'BUY' ? 'b' : 's'}-${input.localOrderSequence}-${digest}`;
}

export type decibel_submission_prepared_record_v1 = Readonly<{
  executionSessionId: string;
  localExecutionRequestId: string;
  clientOrderId: string;
  account: string;
  market: string;
  side: 'BUY' | 'SELL';
  price: string;
  quantity: string;
  timeInForce: 'PostOnly';
  strategyConfigId: string;
  createdAt: number;
  journalSequence: number;
}>;

export type decibel_submission_journal_event_v1 = Readonly<{
  eventId: string;
  executionSessionId: string;
  localExecutionRequestId: string;
  clientOrderId: string;
  journalSequence: number;
  state: decibel_submission_journal_state_v1;
  recordedAt: number;
  venueOrderId: string | null;
  transactionHash: string | null;
  recoverySource: string | null;
}>;

const allowedTransitions = Object.freeze({
  PREPARED: Object.freeze(['SUBMISSION_STARTED', 'NOT_SUBMITTED_PROVEN', 'AMBIGUOUS']),
  SUBMISSION_STARTED: Object.freeze(['ACKNOWLEDGED', 'RECOVERY_REQUIRED', 'AMBIGUOUS']),
  ACKNOWLEDGED: Object.freeze(['TERMINAL']),
  RECOVERY_REQUIRED: Object.freeze([
    'RECOVERED',
    'AMBIGUOUS',
    'NOT_SUBMITTED_PROVEN',
    'NEUTRALIZATION_REQUIRED',
  ]),
  RECOVERED: Object.freeze(['TERMINAL']),
  NOT_SUBMITTED_PROVEN: Object.freeze([]),
  AMBIGUOUS: Object.freeze(['RECOVERY_REQUIRED', 'NEUTRALIZATION_REQUIRED']),
  NEUTRALIZATION_REQUIRED: Object.freeze(['CANCEL_BY_CLIENT_ID_REQUESTED']),
  CANCEL_BY_CLIENT_ID_REQUESTED: Object.freeze(['CANCEL_BY_CLIENT_ID_TERMINAL', 'AMBIGUOUS']),
  CANCEL_BY_CLIENT_ID_TERMINAL: Object.freeze([
    'EXECUTION_IDENTITY_RECOVERED',
    'NO_EXECUTION_PROVEN',
  ]),
  EXECUTION_IDENTITY_RECOVERED: Object.freeze(['RECONCILED']),
  NO_EXECUTION_PROVEN: Object.freeze(['RECONCILED']),
  RECONCILED: Object.freeze(['TERMINAL']),
  TERMINAL: Object.freeze([]),
}) as unknown as Readonly<
  Record<decibel_submission_journal_state_v1, readonly decibel_submission_journal_state_v1[]>
>;

export class decibel_execution_submission_journal_v1 {
  private readonly database: Database.Database;

  public constructor(databasePath: string) {
    if (!databasePath) throw new Error('DECIBEL_SUBMISSION_JOURNAL_PATH_REQUIRED');
    this.database = new Database(databasePath);
    this.database.pragma('journal_mode = WAL');
    this.database.pragma('synchronous = FULL');
    this.database.pragma('foreign_keys = ON');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS decibel_execution_submission_requests_v1 (
        local_execution_request_id TEXT PRIMARY KEY,
        execution_session_id TEXT NOT NULL,
        client_order_id TEXT NOT NULL UNIQUE,
        account TEXT NOT NULL,
        market TEXT NOT NULL,
        side TEXT NOT NULL CHECK(side IN ('BUY','SELL')),
        price TEXT NOT NULL,
        quantity TEXT NOT NULL,
        time_in_force TEXT NOT NULL CHECK(time_in_force = 'PostOnly'),
        strategy_config_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        journal_sequence INTEGER NOT NULL UNIQUE
      );
      CREATE TABLE IF NOT EXISTS decibel_execution_submission_events_v1 (
        event_id TEXT PRIMARY KEY,
        execution_session_id TEXT NOT NULL,
        local_execution_request_id TEXT NOT NULL,
        client_order_id TEXT NOT NULL,
        journal_sequence INTEGER NOT NULL,
        state TEXT NOT NULL,
        recorded_at INTEGER NOT NULL,
        venue_order_id TEXT,
        transaction_hash TEXT,
        recovery_source TEXT,
        FOREIGN KEY(local_execution_request_id)
          REFERENCES decibel_execution_submission_requests_v1(local_execution_request_id)
      );
    `);
  }

  public prepare(record: decibel_submission_prepared_record_v1): void {
    if (
      !record.executionSessionId ||
      !record.localExecutionRequestId ||
      !record.clientOrderId ||
      !record.account ||
      !record.market ||
      !record.strategyConfigId ||
      record.timeInForce !== 'PostOnly' ||
      !Number.isSafeInteger(record.createdAt) ||
      !Number.isSafeInteger(record.journalSequence)
    )
      throw new Error('DECIBEL_SUBMISSION_JOURNAL_PREPARED_INVALID');
    const transaction = this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO decibel_execution_submission_requests_v1 VALUES
           (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          record.localExecutionRequestId,
          record.executionSessionId,
          record.clientOrderId,
          record.account,
          record.market,
          record.side,
          record.price,
          record.quantity,
          record.timeInForce,
          record.strategyConfigId,
          record.createdAt,
          record.journalSequence,
        );
      this.insertEvent({
        eventId: `${record.localExecutionRequestId}:PREPARED:${record.journalSequence}`,
        executionSessionId: record.executionSessionId,
        localExecutionRequestId: record.localExecutionRequestId,
        clientOrderId: record.clientOrderId,
        journalSequence: record.journalSequence,
        state: 'PREPARED',
        recordedAt: record.createdAt,
        venueOrderId: null,
        transactionHash: null,
        recoverySource: null,
      });
    });
    try {
      transaction.immediate();
    } catch (error) {
      throw new Error('DECIBEL_SUBMISSION_JOURNAL_PERSIST_FAILED', { cause: error });
    }
  }

  public append(event: decibel_submission_journal_event_v1): void {
    const latest = this.latest(event.localExecutionRequestId);
    if (latest === null || !allowedTransitions[latest.state].includes(event.state))
      throw new Error('DECIBEL_SUBMISSION_JOURNAL_TRANSITION_INVALID');
    if (
      latest.clientOrderId !== event.clientOrderId ||
      latest.executionSessionId !== event.executionSessionId ||
      event.journalSequence <= latest.journalSequence
    )
      throw new Error('DECIBEL_SUBMISSION_JOURNAL_IDENTITY_CONFLICT');
    if (
      event.venueOrderId !== null &&
      this.events(event.localExecutionRequestId).some(
        (existing) =>
          existing.venueOrderId !== null && existing.venueOrderId !== event.venueOrderId,
      )
    )
      throw new Error('DECIBEL_CLIENT_ORDER_ID_MULTIPLE_VENUE_ORDER_CONFLICT');
    try {
      this.database.transaction(() => this.insertEvent(event)).immediate();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('DECIBEL_')) throw error;
      throw new Error('DECIBEL_SUBMISSION_JOURNAL_PERSIST_FAILED', { cause: error });
    }
  }

  public latest(localExecutionRequestId: string): decibel_submission_journal_event_v1 | null {
    const row = this.database
      .prepare(
        `SELECT event_id AS eventId, execution_session_id AS executionSessionId,
                local_execution_request_id AS localExecutionRequestId,
                client_order_id AS clientOrderId, journal_sequence AS journalSequence,
                state, recorded_at AS recordedAt, venue_order_id AS venueOrderId,
                transaction_hash AS transactionHash, recovery_source AS recoverySource
         FROM decibel_execution_submission_events_v1
         WHERE local_execution_request_id = ?
         ORDER BY journal_sequence DESC LIMIT 1`,
      )
      .get(localExecutionRequestId) as decibel_submission_journal_event_v1 | undefined;
    return row ?? null;
  }

  public events(localExecutionRequestId: string): readonly decibel_submission_journal_event_v1[] {
    return this.database
      .prepare(
        `SELECT event_id AS eventId, execution_session_id AS executionSessionId,
                local_execution_request_id AS localExecutionRequestId,
                client_order_id AS clientOrderId, journal_sequence AS journalSequence,
                state, recorded_at AS recordedAt, venue_order_id AS venueOrderId,
                transaction_hash AS transactionHash, recovery_source AS recoverySource
         FROM decibel_execution_submission_events_v1
         WHERE local_execution_request_id = ? ORDER BY journal_sequence ASC`,
      )
      .all(localExecutionRequestId) as decibel_submission_journal_event_v1[];
  }

  public canInvokeSubmission(localExecutionRequestId: string): boolean {
    return this.latest(localExecutionRequestId)?.state === 'PREPARED';
  }

  public canPlaceAnyNewOrder(): boolean {
    const row = this.database
      .prepare(
        `SELECT COUNT(*) AS count FROM (
           SELECT state FROM decibel_execution_submission_events_v1 e
           WHERE journal_sequence = (
             SELECT MAX(journal_sequence) FROM decibel_execution_submission_events_v1 x
             WHERE x.local_execution_request_id = e.local_execution_request_id
           )
         ) WHERE state NOT IN ('NOT_SUBMITTED_PROVEN','TERMINAL')`,
      )
      .get() as { count: number };
    return row.count === 0;
  }

  public close(): void {
    this.database.close();
  }

  private insertEvent(event: decibel_submission_journal_event_v1): void {
    this.database
      .prepare(`INSERT INTO decibel_execution_submission_events_v1 VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(
        event.eventId,
        event.executionSessionId,
        event.localExecutionRequestId,
        event.clientOrderId,
        event.journalSequence,
        event.state,
        event.recordedAt,
        event.venueOrderId,
        event.transactionHash,
        event.recoverySource,
      );
  }
}

export type decibel_recovered_order_v1 = Readonly<{
  account: string;
  market: string;
  assetType: 'perp';
  clientOrderId: string;
  venueOrderId: string;
  side: 'BUY' | 'SELL';
  price: string;
  quantity: string;
  timeInForce: 1;
  status: 'Open' | 'Filled' | 'Cancelled' | 'Rejected';
  transactionHash?: string;
}>;

export type decibel_client_order_identity_recovery_result_v1 = Readonly<{
  executionSessionId: string;
  localExecutionRequestId: string;
  clientOrderId: string;
  journalStateBeforeRecovery: decibel_submission_journal_state_v1;
  lookupAttempts: number;
  lookupVisibilityResult: 'VISIBLE' | 'NOT_VISIBLE_WITHIN_BOUND';
  recoveredVenueOrderId: string | null;
  recoveredOrderStatus: decibel_recovered_order_v1['status'] | null;
  postOnlyVerification: boolean;
  identityConsistency: boolean;
  transactionEvidence: string | null;
  terminal: boolean;
  recoveryClassification:
    | 'RECOVERED_ACCEPTED_ORDER'
    | 'RECOVERED_TERMINAL_ORDER'
    | 'AMBIGUOUS_ORDER_SUBMISSION_STATE'
    | 'CLIENT_ORDER_RECOVERY_CONFLICT';
  automaticResubmissionPermitted: false;
  readyForExistingFillAndPositionReconciliation: boolean;
  liveExecutionEnabled: false;
}>;

export async function recoverDecibelOrderIdentityByClientOrderIdV1(input: {
  prepared: decibel_submission_prepared_record_v1;
  journalState: decibel_submission_journal_state_v1;
  maximumLookupAttempts: number;
  lookup: (query: {
    account: string;
    market: string;
    client_order_id: string;
    asset_type: 'perp';
  }) => Promise<decibel_recovered_order_v1 | null>;
}): Promise<decibel_client_order_identity_recovery_result_v1> {
  if (
    !Number.isSafeInteger(input.maximumLookupAttempts) ||
    input.maximumLookupAttempts < 1 ||
    input.maximumLookupAttempts > 5
  )
    throw new Error('DECIBEL_CLIENT_ORDER_RECOVERY_BOUND_INVALID');
  for (let attempt = 1; attempt <= input.maximumLookupAttempts; attempt += 1) {
    const order = await input.lookup({
      account: input.prepared.account,
      market: input.prepared.market,
      client_order_id: input.prepared.clientOrderId,
      asset_type: 'perp',
    });
    if (order === null) continue;
    const consistent =
      order.account === input.prepared.account &&
      order.market === input.prepared.market &&
      order.assetType === 'perp' &&
      order.clientOrderId === input.prepared.clientOrderId &&
      Boolean(order.venueOrderId) &&
      order.side === input.prepared.side &&
      order.price === input.prepared.price &&
      order.quantity === input.prepared.quantity &&
      order.timeInForce === 1;
    if (!consistent)
      return Object.freeze({
        executionSessionId: input.prepared.executionSessionId,
        localExecutionRequestId: input.prepared.localExecutionRequestId,
        clientOrderId: input.prepared.clientOrderId,
        journalStateBeforeRecovery: input.journalState,
        lookupAttempts: attempt,
        lookupVisibilityResult: 'VISIBLE',
        recoveredVenueOrderId: null,
        recoveredOrderStatus: null,
        postOnlyVerification: false,
        identityConsistency: false,
        transactionEvidence: null,
        terminal: false,
        recoveryClassification: 'CLIENT_ORDER_RECOVERY_CONFLICT',
        automaticResubmissionPermitted: false,
        readyForExistingFillAndPositionReconciliation: false,
        liveExecutionEnabled: false,
      });
    const terminal = order.status !== 'Open';
    return Object.freeze({
      executionSessionId: input.prepared.executionSessionId,
      localExecutionRequestId: input.prepared.localExecutionRequestId,
      clientOrderId: input.prepared.clientOrderId,
      journalStateBeforeRecovery: input.journalState,
      lookupAttempts: attempt,
      lookupVisibilityResult: 'VISIBLE',
      recoveredVenueOrderId: order.venueOrderId,
      recoveredOrderStatus: order.status,
      postOnlyVerification: true,
      identityConsistency: true,
      transactionEvidence: order.transactionHash ?? null,
      terminal,
      recoveryClassification: terminal ? 'RECOVERED_TERMINAL_ORDER' : 'RECOVERED_ACCEPTED_ORDER',
      automaticResubmissionPermitted: false,
      readyForExistingFillAndPositionReconciliation: true,
      liveExecutionEnabled: false,
    });
  }
  return Object.freeze({
    executionSessionId: input.prepared.executionSessionId,
    localExecutionRequestId: input.prepared.localExecutionRequestId,
    clientOrderId: input.prepared.clientOrderId,
    journalStateBeforeRecovery: input.journalState,
    lookupAttempts: input.maximumLookupAttempts,
    lookupVisibilityResult: 'NOT_VISIBLE_WITHIN_BOUND',
    recoveredVenueOrderId: null,
    recoveredOrderStatus: null,
    postOnlyVerification: false,
    identityConsistency: true,
    transactionEvidence: null,
    terminal: false,
    recoveryClassification: 'AMBIGUOUS_ORDER_SUBMISSION_STATE',
    automaticResubmissionPermitted: false,
    readyForExistingFillAndPositionReconciliation: false,
    liveExecutionEnabled: false,
  });
}

export const DecibelDurableClientOrderIdentityRecoveryAuditV1 = Object.freeze({
  clientOrderIdSubmissionAvailable: true,
  clientOrderIdLookupAvailable: true,
  clientOrderIdType: 'Move Option<String>; SDK string',
  clientOrderIdMaximumLength: 'UNDOCUMENTED',
  clientOrderIdAllowedCharacters: 'UNDOCUMENTED',
  clientOrderIdCaseSensitivity: 'UNDOCUMENTED',
  clientOrderIdUniqueness: 'PARTIAL',
  clientOrderIdDuplicateSubmissionSemantics: 'REJECTED',
  clientOrderIdReuseBehavior: 'UNPROVEN',
  clientOrderIdTerminalOrderRecovery: 'PARTIAL',
  terminalClientOrderLookup: 'PARTIAL',
  clientOrderLookupVisibility: 'UNPROVEN',
  preSubmissionDurability: 'PROVEN',
  clientOrderIdRecovery: 'PARTIAL',
  ambiguousSubmissionDuplicateRisk: 'ELIMINATED_BY_NO_RESUBMISSION',
  canaryOrderLineageDurability: 'PARTIAL',
  minimalLiveCanaryReconciliationReady: false,
  generalAuthenticatedReconciliationReady: false,
  smallestRemainingBlocker: 'CLIENT_ORDER_ID_TERMINAL_RETENTION_AND_VISIBILITY_UNPROVEN',
  liveExecutionEnabled: false,
  signerInitialized: false,
} as const);
