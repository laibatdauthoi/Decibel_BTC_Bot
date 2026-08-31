import Database from 'better-sqlite3';

export const DECIBEL_PRECOMMITTED_TRANSACTION_FINALITY_RECOVERY_V1 =
  'DECIBEL_PRECOMMITTED_TRANSACTION_FINALITY_RECOVERY_V1' as const;

export type decibel_transaction_purpose_v1 =
  'PLACE_CANARY_ORDER' | 'UNKNOWN_ORDER_EMERGENCY_CANCEL';

export type decibel_precommitted_mutation_v1 = Readonly<{
  transactionPurpose: decibel_transaction_purpose_v1;
  transactionHash: string;
  replayProtectionNonce: string | null;
  expirationTimestamp: number;
  chainId: number;
  sender: string;
  entryFunction: string;
  clientOrderId: string;
  market: string;
  subaccount: string;
  signedAt: number;
  hashDurableAt: number;
  submittedAt: number | null;
  committedAt: number | null;
  committedVersion: number | null;
  success: boolean | null;
  vmStatus: string | null;
  finalClassification: decibel_precommitted_transaction_recovery_result_v1['finalClassification'];
  liveExecutionEnabled: false;
}>;

export type decibel_precommitted_transaction_recovery_result_v1 = Readonly<{
  transactionPurpose: decibel_transaction_purpose_v1;
  transactionHash: string;
  clientOrderId: string;
  subaccount: string;
  market: string;
  durableBeforeSubmit: boolean;
  expirationTimestamp: number;
  lookupAttempts: number;
  chainTransactionStatus: 'COMMITTED' | 'PENDING' | 'NOT_FOUND' | 'UNKNOWN';
  committedVersion: number | null;
  success: boolean | null;
  vmStatus: string | null;
  decodedRelevantAbort: 'E_MARKET_NOT_FOUND' | null;
  finalClassification:
    | 'SIGNED_AND_DURABLE'
    | 'COMMITTED_SUCCESS'
    | 'COMMITTED_ABORT_AUTHORITATIVE_NO_MUTATION'
    | 'COMMITTED_ABORT_EXPOSURE_AMBIGUOUS'
    | 'EXPIRED_UNCOMMITTED'
    | 'PENDING'
    | 'NOT_FOUND_BEFORE_EXPIRY'
    | 'TRANSACTION_IDENTITY_CONFLICT'
    | 'TRANSACTION_STATE_UNKNOWN';
  exposureNeutralized: boolean;
  automaticResubmissionPermitted: false;
  liveExecutionEnabled: false;
}>;

type durable_input = Omit<
  decibel_precommitted_mutation_v1,
  | 'submittedAt'
  | 'committedAt'
  | 'committedVersion'
  | 'success'
  | 'vmStatus'
  | 'finalClassification'
  | 'liveExecutionEnabled'
>;

export class decibel_precommitted_transaction_journal_v1 {
  private readonly database: Database.Database;

  public constructor(databasePath: string) {
    if (!databasePath) throw new Error('DECIBEL_PRECOMMITTED_TRANSACTION_JOURNAL_PATH_REQUIRED');
    this.database = new Database(databasePath);
    this.database.pragma('journal_mode = WAL');
    this.database.pragma('synchronous = FULL');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS decibel_precommitted_mutations_v1 (
        transaction_hash TEXT PRIMARY KEY,
        transaction_purpose TEXT NOT NULL,
        replay_protection_nonce TEXT,
        expiration_timestamp INTEGER NOT NULL,
        chain_id INTEGER NOT NULL,
        sender TEXT NOT NULL,
        entry_function TEXT NOT NULL,
        client_order_id TEXT NOT NULL,
        market TEXT NOT NULL,
        subaccount TEXT NOT NULL,
        signed_at INTEGER NOT NULL,
        hash_durable_at INTEGER NOT NULL,
        submitted_at INTEGER,
        committed_at INTEGER,
        committed_version INTEGER,
        success INTEGER,
        vm_status TEXT,
        final_classification TEXT NOT NULL,
        live_execution_enabled INTEGER NOT NULL CHECK(live_execution_enabled = 0)
      );
    `);
  }

  public commitSignedIdentity(input: durable_input): void {
    if (
      !/^0x[0-9a-f]{64}$/i.test(input.transactionHash) ||
      !input.clientOrderId ||
      !input.market ||
      !input.subaccount ||
      !input.sender ||
      !input.entryFunction ||
      input.expirationTimestamp <= input.signedAt ||
      input.hashDurableAt < input.signedAt
    )
      throw new Error('DECIBEL_PRECOMMITTED_TRANSACTION_IDENTITY_INVALID');
    const existing = this.get(input.transactionHash);
    if (existing !== null) {
      if (!sameDurableIdentity(existing, input))
        throw new Error('DECIBEL_PRECOMMITTED_TRANSACTION_IDENTITY_CONFLICT');
      return;
    }
    this.database
      .prepare(
        `INSERT INTO decibel_precommitted_mutations_v1 VALUES
         (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
      )
      .run(
        input.transactionHash,
        input.transactionPurpose,
        input.replayProtectionNonce,
        input.expirationTimestamp,
        input.chainId,
        input.sender,
        input.entryFunction,
        input.clientOrderId,
        input.market,
        input.subaccount,
        input.signedAt,
        input.hashDurableAt,
        null,
        null,
        null,
        null,
        null,
        'SIGNED_AND_DURABLE',
      );
  }

  public authorizeExactSubmission(transactionHash: string): decibel_precommitted_mutation_v1 {
    const record = this.get(transactionHash);
    if (record === null || record.finalClassification !== 'SIGNED_AND_DURABLE')
      throw new Error('DECIBEL_TRANSACTION_HASH_NOT_DURABLE_BEFORE_SUBMIT');
    return record;
  }

  public recordSubmitted(input: {
    expectedTransactionHash: string;
    submittedTransactionHash: string;
    submittedAt: number;
  }): void {
    if (input.expectedTransactionHash !== input.submittedTransactionHash)
      throw new Error('DECIBEL_TRANSACTION_HASH_IDENTITY_CONFLICT');
    const record = this.authorizeExactSubmission(input.expectedTransactionHash);
    if (input.submittedAt < record.hashDurableAt)
      throw new Error('DECIBEL_TRANSACTION_SUBMITTED_BEFORE_HASH_DURABLE');
    this.database
      .prepare(
        `UPDATE decibel_precommitted_mutations_v1 SET submitted_at = ? WHERE transaction_hash = ?`,
      )
      .run(input.submittedAt, input.expectedTransactionHash);
  }

  public recordResolution(
    result: decibel_precommitted_transaction_recovery_result_v1,
    committedAt: number | null,
  ): void {
    const previous = this.get(result.transactionHash);
    if (previous === null) throw new Error('DECIBEL_PRECOMMITTED_TRANSACTION_NOT_FOUND');
    if (
      previous.finalClassification !== 'SIGNED_AND_DURABLE' &&
      (previous.finalClassification !== result.finalClassification ||
        previous.committedVersion !== result.committedVersion ||
        previous.success !== result.success ||
        previous.vmStatus !== result.vmStatus)
    )
      throw new Error('DECIBEL_TRANSACTION_COMMITTED_RESULT_CONFLICT');
    this.database
      .prepare(
        `UPDATE decibel_precommitted_mutations_v1
         SET committed_at = ?, committed_version = ?, success = ?, vm_status = ?, final_classification = ?
         WHERE transaction_hash = ?`,
      )
      .run(
        committedAt,
        result.committedVersion,
        result.success === null ? null : Number(result.success),
        result.vmStatus,
        result.finalClassification,
        result.transactionHash,
      );
  }

  public get(transactionHash: string): decibel_precommitted_mutation_v1 | null {
    const row = this.database
      .prepare(
        `SELECT transaction_hash AS transactionHash, transaction_purpose AS transactionPurpose,
          replay_protection_nonce AS replayProtectionNonce, expiration_timestamp AS expirationTimestamp,
          chain_id AS chainId, sender, entry_function AS entryFunction, client_order_id AS clientOrderId,
          market, subaccount, signed_at AS signedAt, hash_durable_at AS hashDurableAt,
          submitted_at AS submittedAt, committed_at AS committedAt, committed_version AS committedVersion,
          success, vm_status AS vmStatus, final_classification AS finalClassification,
          live_execution_enabled AS liveExecutionEnabled
         FROM decibel_precommitted_mutations_v1 WHERE transaction_hash = ?`,
      )
      .get(transactionHash) as
      | (Omit<decibel_precommitted_mutation_v1, 'success' | 'liveExecutionEnabled'> & {
          success: number | null;
          liveExecutionEnabled: 0;
        })
      | undefined;
    return row === undefined
      ? null
      : Object.freeze({
          ...row,
          success: row.success === null ? null : row.success === 1,
          liveExecutionEnabled: false,
        });
  }

  public close(): void {
    this.database.close();
  }
}

function sameDurableIdentity(
  record: decibel_precommitted_mutation_v1,
  input: durable_input,
): boolean {
  return (
    record.transactionPurpose === input.transactionPurpose &&
    record.replayProtectionNonce === input.replayProtectionNonce &&
    record.expirationTimestamp === input.expirationTimestamp &&
    record.chainId === input.chainId &&
    record.sender === input.sender &&
    record.entryFunction === input.entryFunction &&
    record.clientOrderId === input.clientOrderId &&
    record.market === input.market &&
    record.subaccount === input.subaccount &&
    record.signedAt === input.signedAt &&
    record.hashDurableAt === input.hashDurableAt
  );
}

export function classifyDecibelPrecommittedTransactionRecoveryV1(input: {
  transaction: durable_input;
  lookupAttempts: number;
  lookupStatus: 'COMMITTED' | 'PENDING' | 'NOT_FOUND' | 'UNKNOWN';
  ledgerTimestamp: number;
  committedVersion?: number;
  success?: boolean;
  vmStatus?: string;
  decodedAbort?: 'E_MARKET_NOT_FOUND';
  submittedResponseHash?: string;
  absenceObservedThroughExpiry?: boolean;
  successfulCancelNeutralizationSemanticsProven: boolean;
}): decibel_precommitted_transaction_recovery_result_v1 {
  const identityConflict =
    input.submittedResponseHash !== undefined &&
    input.submittedResponseHash !== input.transaction.transactionHash;
  let finalClassification: decibel_precommitted_transaction_recovery_result_v1['finalClassification'];
  if (identityConflict) finalClassification = 'TRANSACTION_IDENTITY_CONFLICT';
  else if (input.lookupStatus === 'PENDING') finalClassification = 'PENDING';
  else if (input.lookupStatus === 'NOT_FOUND')
    finalClassification =
      input.ledgerTimestamp > input.transaction.expirationTimestamp &&
      input.absenceObservedThroughExpiry === true
        ? 'EXPIRED_UNCOMMITTED'
        : input.ledgerTimestamp <= input.transaction.expirationTimestamp
          ? 'NOT_FOUND_BEFORE_EXPIRY'
          : 'TRANSACTION_STATE_UNKNOWN';
  else if (input.lookupStatus === 'UNKNOWN') finalClassification = 'TRANSACTION_STATE_UNKNOWN';
  else if (input.success === true) finalClassification = 'COMMITTED_SUCCESS';
  else if (
    input.transaction.transactionPurpose === 'PLACE_CANARY_ORDER' ||
    input.decodedAbort === 'E_MARKET_NOT_FOUND'
  )
    finalClassification = 'COMMITTED_ABORT_AUTHORITATIVE_NO_MUTATION';
  else finalClassification = 'COMMITTED_ABORT_EXPOSURE_AMBIGUOUS';
  const cancelNeutralized =
    input.transaction.transactionPurpose === 'UNKNOWN_ORDER_EMERGENCY_CANCEL' &&
    ((finalClassification === 'COMMITTED_SUCCESS' &&
      input.successfulCancelNeutralizationSemanticsProven) ||
      (finalClassification === 'COMMITTED_ABORT_AUTHORITATIVE_NO_MUTATION' &&
        input.decodedAbort === 'E_MARKET_NOT_FOUND'));
  return Object.freeze({
    transactionPurpose: input.transaction.transactionPurpose,
    transactionHash: input.transaction.transactionHash,
    clientOrderId: input.transaction.clientOrderId,
    subaccount: input.transaction.subaccount,
    market: input.transaction.market,
    durableBeforeSubmit: true,
    expirationTimestamp: input.transaction.expirationTimestamp,
    lookupAttempts: input.lookupAttempts,
    chainTransactionStatus: input.lookupStatus,
    committedVersion: input.committedVersion ?? null,
    success: input.success ?? null,
    vmStatus: input.vmStatus ?? null,
    decodedRelevantAbort: input.decodedAbort ?? null,
    finalClassification,
    exposureNeutralized: cancelNeutralized,
    automaticResubmissionPermitted: false,
    liveExecutionEnabled: false,
  });
}

export function proveFullExecutionRemainderZeroV1(input: {
  requestedQuantity: string;
  authenticatedFillQuantity: string;
  quantityConservationProven: boolean;
}): boolean {
  return (
    input.quantityConservationProven && input.requestedQuantity === input.authenticatedFillQuantity
  );
}

export const DecibelPrecommittedTransactionFinalityAuditV1 = Object.freeze({
  installedAptosSdkVersion: '5.2.1',
  preSubmitTransactionHashAvailable: true,
  transactionHashFunction: 'generateUserTransactionHash(InputSubmitTransactionData)',
  transactionLookupByHashAvailable: true,
  transactionFinalityStatusAvailable: true,
  decibelOrderlessPlaceTxSupported: true,
  decibelOrderlessCancelTxSupported: true,
  replayNonceGeneration: 'generateRandomReplayProtectionNonce()',
  currentDecibelSendTxPrecommitBoundarySafe: false,
  signedBytesPersistenceRequired: false,
  expiredUncommittedTransactionNoMutationProof: 'PARTIAL',
  aptosTransactionAtomicityProven: true,
  failedPlaceTxCannotLeaveOrder: 'PROVEN',
  successfulCancelTxProvesTargetNeutralized: 'UNPROVEN',
  eMarketNotFoundNoPendingExposureProof: 'PROVEN_FOR_EXACT_DEDICATED_MARKET',
  canaryOrderHistoryRecovery: 'PARTIAL',
  transactionFinalityRecovery: 'PARTIAL',
  unknownOrderExposureNeutralization: 'PARTIAL',
  canaryOrderLineageDurability: 'PARTIAL',
  minimalLiveCanaryReconciliationReady: false,
  smallestRemainingBlocker: 'SUCCESSFUL_CANCEL_TARGET_NEUTRALIZATION_SEMANTICS_UNPROVEN',
  knownVenueContractLimitation: 'SUCCESSFUL_CANCEL_POSTCONDITION_NOT_PUBLICLY_PROVABLE',
  minimalLiveCanaryOperationalRisk: 'BOUNDED_AND_FAIL_CLOSED',
  cancelSemanticsAuditClosed: true,
  nextStep: 'MINIMAL LIVE CANARY SPECIFICATION V1',
  liveExecutionEnabled: false,
  signerInitialized: false,
} as const);
