import { describe, expect, it } from 'vitest';
import {
  DECIBEL_CANCEL_ENTRY_FUNCTION_V1,
  DecibelSuccessfulCancelPostconditionAuditV1,
  classifyDecibelFirstCanaryCrashStateV1,
  proveDecibelCancelAbortNoExposureV1,
  proveDecibelSuccessfulCancelNeutralizationV1,
} from '../src/decibel_successful_cancel_postcondition_proof_v1.js';
import type { decibel_precommitted_transaction_recovery_result_v1 } from '../src/decibel_precommitted_transaction_finality_recovery_v1.js';

const base = {
  durableClientOrderId: 'client-1',
  expectedSubaccount: 'sub',
  expectedMarket: 'btc',
  cancelTransactionHash: `0x${'1'.repeat(64)}`,
  transactionCommitted: true,
  transactionSuccess: true,
  committedVersion: 100,
  exactEntryFunctionIdentity: DECIBEL_CANCEL_ENTRY_FUNCTION_V1,
};
const cancelRecovery: decibel_precommitted_transaction_recovery_result_v1 = {
  transactionPurpose: 'UNKNOWN_ORDER_EMERGENCY_CANCEL',
  transactionHash: base.cancelTransactionHash,
  clientOrderId: 'client-1',
  subaccount: 'sub',
  market: 'btc',
  durableBeforeSubmit: true,
  expirationTimestamp: 90,
  lookupAttempts: 1,
  chainTransactionStatus: 'COMMITTED',
  committedVersion: 100,
  success: true,
  vmStatus: 'Executed successfully',
  decodedRelevantAbort: null,
  finalClassification: 'COMMITTED_SUCCESS',
  exposureNeutralized: false,
  automaticResubmissionPermitted: false,
  liveExecutionEnabled: false,
};

describe('Decibel Successful Cancel Postcondition Proof V1', () => {
  it('freezes the exact installed SDK/ABI target and audit closure', () => {
    expect(DecibelSuccessfulCancelPostconditionAuditV1).toMatchObject({
      deployedCancelAbiMatchesSdk: true,
      successfulCancelTxProvesTargetNeutralized: 'UNPROVEN',
      cancelSemanticsAuditClosed: true,
      liveExecutionEnabled: false,
    });
  });

  it('cannot create proof from method name or committed success alone', () => {
    expect(
      proveDecibelSuccessfulCancelNeutralizationV1({ ...base, semanticProof: 'NONE' }),
    ).toBeNull();
    expect(
      proveDecibelSuccessfulCancelNeutralizationV1({
        ...base,
        exactEntryFunctionIdentity: 'cancelClientOrder',
        semanticProof: 'EXPLICIT_OFFICIAL_POSTCONDITION',
        semanticProofVersion: 'v1',
      }),
    ).toBeNull();
  });

  it('admits successful neutralization only with authoritative versioned semantics', () => {
    expect(
      proveDecibelSuccessfulCancelNeutralizationV1({
        ...base,
        semanticProof: 'AUTHORITATIVE_CURRENT_MOVE_SOURCE',
        semanticProofVersion: 'package-hash',
      }),
    ).toMatchObject({
      neutralized: true,
      proofSource: 'SUCCESSFUL_CANCEL_TRANSACTION_CONTRACT',
      liveExecutionEnabled: false,
    });
    expect(
      proveDecibelSuccessfulCancelNeutralizationV1({
        ...base,
        transactionSuccess: false,
        semanticProof: 'AUTHORITATIVE_CURRENT_MOVE_SOURCE',
        semanticProofVersion: 'package-hash',
      }),
    ).toBeNull();
  });

  it('whitelists only E_MARKET_NOT_FOUND in the exact frozen scope', () => {
    expect(
      proveDecibelCancelAbortNoExposureV1({
        abort: 'E_MARKET_NOT_FOUND',
        exactDedicatedSubaccount: true,
        exactMarket: true,
        maximumVenueOrdersPerSession: 1,
      }),
    ).toMatchObject({ neutralized: true, classification: 'COMMITTED_ABORT_NO_EXPOSURE' });
    expect(
      proveDecibelCancelAbortNoExposureV1({
        abort: 'EMARKET_HALTED',
        exactDedicatedSubaccount: true,
        exactMarket: true,
        maximumVenueOrdersPerSession: 1,
      }),
    ).toBeNull();
  });

  it('keeps zero/partial execution fail-closed without authoritative neutralization', () => {
    for (const authenticatedFillState of ['ZERO', 'PARTIAL'] as const) {
      expect(
        classifyDecibelFirstCanaryCrashStateV1({
          transactionHashDurable: true,
          placeFinality: 'COMMITTED_SUCCESS',
          authenticatedFillState,
          positionConservationProven: true,
          cancelRecovery,
        }),
      ).toBe('AMBIGUOUS_FAIL_CLOSED');
    }
  });

  it('reconciles zero/partial execution only with a proven neutralization source', () => {
    const abortProof = proveDecibelCancelAbortNoExposureV1({
      abort: 'E_MARKET_NOT_FOUND',
      exactDedicatedSubaccount: true,
      exactMarket: true,
      maximumVenueOrdersPerSession: 1,
    });
    expect(abortProof).not.toBeNull();
    if (abortProof === null) throw new Error('expected abort proof');
    expect(
      classifyDecibelFirstCanaryCrashStateV1({
        transactionHashDurable: true,
        placeFinality: 'COMMITTED_SUCCESS',
        authenticatedFillState: 'ZERO',
        positionConservationProven: true,
        cancelRecovery,
        abortNoExposureProof: abortProof,
      }),
    ).toBe('SAFE_NO_EXECUTION');
    expect(
      classifyDecibelFirstCanaryCrashStateV1({
        transactionHashDurable: true,
        placeFinality: 'COMMITTED_SUCCESS',
        authenticatedFillState: 'PARTIAL',
        positionConservationProven: true,
        cancelRecovery,
        abortNoExposureProof: abortProof,
      }),
    ).toBe('SAFE_PARTIAL_EXECUTION_NEUTRALIZED');
  });

  it('does not require cancel for full conserved execution', () => {
    expect(
      classifyDecibelFirstCanaryCrashStateV1({
        transactionHashDurable: true,
        placeFinality: 'COMMITTED_SUCCESS',
        authenticatedFillState: 'FULL',
        positionConservationProven: true,
      }),
    ).toBe('SAFE_FULL_EXECUTION');
  });

  it('classifies pre-mutation and ambiguous transaction crashes safely', () => {
    expect(
      classifyDecibelFirstCanaryCrashStateV1({
        transactionHashDurable: true,
        placeFinality: 'COMMITTED_ABORT',
        authenticatedFillState: 'ZERO',
        positionConservationProven: true,
      }),
    ).toBe('SAFE_NO_MUTATION');
    expect(
      classifyDecibelFirstCanaryCrashStateV1({
        transactionHashDurable: true,
        placeFinality: 'PENDING_OR_UNKNOWN',
        authenticatedFillState: 'UNKNOWN',
        positionConservationProven: false,
      }),
    ).toBe('AMBIGUOUS_FAIL_CLOSED');
  });
});
