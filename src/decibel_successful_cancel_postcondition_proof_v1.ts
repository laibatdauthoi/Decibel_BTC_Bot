import type { decibel_precommitted_transaction_recovery_result_v1 } from './decibel_precommitted_transaction_finality_recovery_v1.js';

export const DECIBEL_SUCCESSFUL_CANCEL_POSTCONDITION_PROOF_V1 =
  'DECIBEL_SUCCESSFUL_CANCEL_POSTCONDITION_PROOF_V1' as const;

export const DECIBEL_CANCEL_ENTRY_FUNCTION_V1 =
  '0x50ead22afd6ffd9769e3b3d6e0e64a2a350d68e8b102c4e72e33d0b8cfdfdb06::dex_accounts_entry::cancel_client_order_to_subaccount' as const;

export type decibel_successful_cancel_neutralization_proof_v1 = Readonly<{
  durableClientOrderId: string;
  expectedSubaccount: string;
  expectedMarket: string;
  cancelTransactionHash: string;
  committedVersion: number;
  exactEntryFunctionIdentity: typeof DECIBEL_CANCEL_ENTRY_FUNCTION_V1;
  semanticProofVersion: string;
  neutralized: true;
  proofSource: 'SUCCESSFUL_CANCEL_TRANSACTION_CONTRACT';
  liveExecutionEnabled: false;
}>;

export function proveDecibelSuccessfulCancelNeutralizationV1(input: {
  durableClientOrderId: string;
  expectedSubaccount: string;
  expectedMarket: string;
  cancelTransactionHash: string;
  transactionCommitted: boolean;
  transactionSuccess: boolean;
  committedVersion: number;
  exactEntryFunctionIdentity: string;
  semanticProof: 'AUTHORITATIVE_CURRENT_MOVE_SOURCE' | 'EXPLICIT_OFFICIAL_POSTCONDITION' | 'NONE';
  semanticProofVersion?: string;
}): decibel_successful_cancel_neutralization_proof_v1 | null {
  if (
    !input.transactionCommitted ||
    !input.transactionSuccess ||
    input.exactEntryFunctionIdentity !== DECIBEL_CANCEL_ENTRY_FUNCTION_V1 ||
    input.semanticProof === 'NONE' ||
    input.semanticProofVersion === undefined
  )
    return null;
  return Object.freeze({
    durableClientOrderId: input.durableClientOrderId,
    expectedSubaccount: input.expectedSubaccount,
    expectedMarket: input.expectedMarket,
    cancelTransactionHash: input.cancelTransactionHash,
    committedVersion: input.committedVersion,
    exactEntryFunctionIdentity: DECIBEL_CANCEL_ENTRY_FUNCTION_V1,
    semanticProofVersion: input.semanticProofVersion,
    neutralized: true,
    proofSource: 'SUCCESSFUL_CANCEL_TRANSACTION_CONTRACT',
    liveExecutionEnabled: false,
  });
}

export type decibel_cancel_abort_exposure_proof_v1 = Readonly<{
  abort: 'E_MARKET_NOT_FOUND';
  classification: 'COMMITTED_ABORT_NO_EXPOSURE';
  neutralized: true;
  scope: 'EXACT_DEDICATED_SUBACCOUNT_MARKET';
  liveExecutionEnabled: false;
}>;

export function proveDecibelCancelAbortNoExposureV1(input: {
  abort: string;
  exactDedicatedSubaccount: boolean;
  exactMarket: boolean;
  maximumVenueOrdersPerSession: 1;
}): decibel_cancel_abort_exposure_proof_v1 | null {
  if (input.abort !== 'E_MARKET_NOT_FOUND' || !input.exactDedicatedSubaccount || !input.exactMarket)
    return null;
  return Object.freeze({
    abort: 'E_MARKET_NOT_FOUND',
    classification: 'COMMITTED_ABORT_NO_EXPOSURE',
    neutralized: true,
    scope: 'EXACT_DEDICATED_SUBACCOUNT_MARKET',
    liveExecutionEnabled: false,
  });
}

export type decibel_first_canary_crash_matrix_classification_v1 =
  | 'SAFE_NO_MUTATION'
  | 'SAFE_NO_EXECUTION'
  | 'SAFE_PARTIAL_EXECUTION_NEUTRALIZED'
  | 'SAFE_FULL_EXECUTION'
  | 'AMBIGUOUS_FAIL_CLOSED';

export function classifyDecibelFirstCanaryCrashStateV1(input: {
  transactionHashDurable: boolean;
  placeFinality:
    'NOT_SUBMITTED_PROVEN' | 'COMMITTED_ABORT' | 'COMMITTED_SUCCESS' | 'PENDING_OR_UNKNOWN';
  authenticatedFillState: 'ZERO' | 'PARTIAL' | 'FULL' | 'UNKNOWN';
  positionConservationProven: boolean;
  cancelRecovery?: decibel_precommitted_transaction_recovery_result_v1;
  successfulCancelProof?: decibel_successful_cancel_neutralization_proof_v1;
  abortNoExposureProof?: decibel_cancel_abort_exposure_proof_v1;
}): decibel_first_canary_crash_matrix_classification_v1 {
  if (!input.transactionHashDurable || input.placeFinality === 'PENDING_OR_UNKNOWN')
    return 'AMBIGUOUS_FAIL_CLOSED';
  if (input.placeFinality === 'NOT_SUBMITTED_PROVEN' || input.placeFinality === 'COMMITTED_ABORT')
    return 'SAFE_NO_MUTATION';
  if (!input.positionConservationProven || input.authenticatedFillState === 'UNKNOWN')
    return 'AMBIGUOUS_FAIL_CLOSED';
  if (input.authenticatedFillState === 'FULL') return 'SAFE_FULL_EXECUTION';
  const neutralized =
    input.successfulCancelProof?.neutralized === true ||
    input.abortNoExposureProof?.neutralized === true;
  if (!neutralized || input.cancelRecovery?.automaticResubmissionPermitted !== false)
    return 'AMBIGUOUS_FAIL_CLOSED';
  return input.authenticatedFillState === 'ZERO'
    ? 'SAFE_NO_EXECUTION'
    : 'SAFE_PARTIAL_EXECUTION_NEUTRALIZED';
}

export const DecibelSuccessfulCancelPostconditionAuditV1 = Object.freeze({
  installedSdkVersion: '0.7.0',
  installedSdkCancelPath:
    'DecibelWriteDex.cancelClientOrder -> sendSubaccountTx -> sendTx -> Aptos submit.simple -> waitForTransaction',
  currentPublicSdkCancelPath:
    'DecibelWriteDex.cancelClientOrder -> submitSubaccountTx -> sendTx/sendEncryptedTx',
  sdkCancelSemanticDrift: false,
  pythonSdkCorroboration: 'NEUTRAL',
  deployedCancelAbiMatchesSdk: true,
  deployedAbi: Object.freeze({
    function: DECIBEL_CANCEL_ENTRY_FUNCTION_V1,
    visibility: 'private',
    isEntry: true,
    genericTypeParameters: 0,
    parameters: Object.freeze([
      '&signer',
      'Object<dex_accounts::Subaccount>',
      'String',
      'Object<perp_market::PerpMarket>',
    ]),
    returns: Object.freeze([]),
  }),
  officialCancelDocPostcondition: 'IMPLICIT',
  currentCancelMoveSourceAvailable: false,
  officialCancelIntegrationTestPostcondition: 'ABSENT',
  successPathCanReturnWithTargetStillPending: 'UNPROVEN',
  successfulCancelTxProvesTargetNeutralized: 'UNPROVEN',
  eMarketNotFoundNoPendingExposureProof: 'PROVEN_FOR_FROZEN_CANARY_SCOPE',
  transactionFinalityRecovery: 'PARTIAL',
  unknownOrderExposureNeutralization: 'PARTIAL',
  canaryOrderLineageDurability: 'PARTIAL',
  minimalLiveCanaryReconciliationReady: 'NO_UNDER_STRICT_PROOF_STANDARD',
  minimalLiveCanaryOperationalRisk: 'BOUNDED_AND_FAIL_CLOSED',
  knownVenueContractLimitation: 'SUCCESSFUL_CANCEL_POSTCONDITION_NOT_PUBLICLY_PROVABLE',
  ambiguousSubmissionDuplicateRisk: 'ELIMINATED_BY_NO_RESUBMISSION',
  ambiguousCancelDuplicateRisk: 'ELIMINATED_BY_NO_AUTOMATIC_RECANCEL',
  cancelSemanticsAuditClosed: true,
  nextStep: 'MINIMAL LIVE CANARY SPECIFICATION V1',
  firstCanaryContract: Object.freeze({
    dedicatedSubaccountRequired: true,
    startingPosition: 'FLAT',
    marketCount: 1,
    maximumVenueOrdersPerSession: 1,
    maximumConcurrentLiveOrders: 1,
    limitPostOnlyOnly: true,
    minimumMetadataValidSizeOnly: true,
    recycling: false,
    amendment: false,
    tpSl: false,
    twap: false,
    bulkOrders: false,
    otherManualOrDelegatedActivity: false,
  }),
  liveExecutionEnabled: false,
  signerInitialized: false,
} as const);
