import { describe, expect, it } from 'vitest';
import type { decibel_submission_prepared_record_v1 } from '../src/decibel_durable_client_order_identity_recovery_v1.js';
import {
  DecibelUnknownOrderNeutralizationRecoveryAuditV1,
  authorizeDecibelUnknownOrderEmergencyCancelV1,
  classifyDecibelUnknownOrderExposureNeutralizationV1,
  reconcileDecibelUnknownOrderAfterNeutralizationV1,
  recoverDecibelExecutionIdentityFromClientOrderTradesV1,
  type decibel_unknown_order_trade_row_v1,
} from '../src/decibel_unknown_order_neutralization_recovery_v1.js';
import type { decibel_zero_anchor_absolute_position_conservation_result_v1 } from '../src/decibel_zero_anchor_absolute_position_conservation_proof_v1.js';

const prepared: decibel_submission_prepared_record_v1 = {
  executionSessionId: 's1',
  localExecutionRequestId: 'r1',
  clientOrderId: 'client-1',
  account: 'sub',
  market: 'btc',
  side: 'BUY',
  price: '100',
  quantity: '1',
  timeInForce: 'PostOnly',
  strategyConfigId: 'cfg',
  createdAt: 1,
  journalSequence: 1,
};
const neutral = classifyDecibelUnknownOrderExposureNeutralizationV1({
  cancelOutcome: 'OPEN_ORDER_CANCELLED_AUTHORITATIVE',
  transactionVersion: 10,
});
function trade(size = '0.3', id = 't1', orderId = 'o1'): decibel_unknown_order_trade_row_v1 {
  return {
    account: 'sub',
    market: 'btc',
    source: 'OrderFill',
    tradeId: id,
    orderId,
    clientOrderId: 'client-1',
    size,
    price: '100',
    transactionVersion: 9,
    authenticated: true,
  };
}
function conservation(
  fillQuantity: string,
  classification: decibel_zero_anchor_absolute_position_conservation_result_v1['finalClassification'],
): decibel_zero_anchor_absolute_position_conservation_result_v1 {
  return {
    account: 'sub',
    market: 'btc',
    venueOrderId: 'o1',
    zeroAnchorProof: 'PROVEN',
    positionBeforeKind: 'NO_OPEN_POSITION',
    positionAfterKind:
      classification === 'NO_EXECUTION_RECONCILED' ? 'NO_OPEN_POSITION' : 'OPEN_POSITION',
    rawPositionSize: classification === 'NO_EXECUTION_RECONCILED' ? null : fillQuantity,
    absolutePositionMagnitude: fillQuantity,
    orderSide: 'BUY',
    authenticatedFillDirection:
      classification === 'NO_EXECUTION_RECONCILED' ? 'NO_EXECUTION' : 'OPEN_LONG',
    uniqueTradeIds: classification === 'NO_EXECUTION_RECONCILED' ? [] : ['t1'],
    fillQuantity,
    quantityMatch: true,
    exclusivityResult: 'PROVEN',
    snapshotStability: 'STABLE',
    makerProof: 'PROVEN',
    makerVolumeUsd: classification === 'NO_EXECUTION_RECONCILED' ? '0' : '30',
    executedQuantityCompleteness: true,
    makerVolumeCompleteness: true,
    costRecordCompleteness: false,
    finalClassification: classification,
    liveExecutionEnabled: false,
  };
}

describe('Decibel Unknown-Order Neutralization Recovery V1', () => {
  it('authorizes only the exact journal account, market, and client ID', () => {
    const request = authorizeDecibelUnknownOrderEmergencyCancelV1({
      prepared,
      journalState: 'AMBIGUOUS',
      expectedSubaccount: 'sub',
      expectedMarket: 'btc',
      expectedClientOrderId: 'client-1',
    });
    expect(request).toMatchObject({
      authorization: 'UNKNOWN_ORDER_EMERGENCY_CANCEL',
      subaccount: 'sub',
      market: 'btc',
      clientOrderId: 'client-1',
      cancelAll: false,
      replacementPermitted: false,
      liveExecutionEnabled: false,
    });
    expect(() =>
      authorizeDecibelUnknownOrderEmergencyCancelV1({
        prepared,
        journalState: 'AMBIGUOUS',
        expectedSubaccount: 'sub',
        expectedMarket: 'eth',
        expectedClientOrderId: 'client-1',
      }),
    ).toThrow('IDENTITY_CONFLICT');
    expect(() =>
      authorizeDecibelUnknownOrderEmergencyCancelV1({
        prepared,
        journalState: 'AMBIGUOUS',
        expectedSubaccount: 'sub',
        expectedMarket: 'btc',
        expectedClientOrderId: 'wrong',
      }),
    ).toThrow('IDENTITY_CONFLICT');
  });

  it('recovers no execution after authoritative neutralization, zero fills, and flat position', () => {
    const identity = recoverDecibelExecutionIdentityFromClientOrderTradesV1({
      account: 'sub',
      market: 'btc',
      clientOrderId: 'client-1',
      rows: [],
    });
    const result = reconcileDecibelUnknownOrderAfterNeutralizationV1({
      prepared,
      neutralization: neutral,
      executionIdentity: identity,
      positionConservation: conservation('0', 'NO_EXECUTION_RECONCILED'),
      requestedQuantity: '1',
      postOnlyMakerProofPreserved: true,
    });
    expect(result.recoveryClassification).toBe('UNKNOWN_ORDER_RECOVERED_NO_EXECUTION');
    expect(result.recoveredVenueOrderId).toBeNull();
  });

  it('recovers partial and full execution identity from authenticated trade history', () => {
    const partialIdentity = recoverDecibelExecutionIdentityFromClientOrderTradesV1({
      account: 'sub',
      market: 'btc',
      clientOrderId: 'client-1',
      rows: [trade()],
    });
    expect(
      reconcileDecibelUnknownOrderAfterNeutralizationV1({
        prepared,
        neutralization: neutral,
        executionIdentity: partialIdentity,
        positionConservation: conservation(
          '0.3',
          'COMPLETE_BY_ZERO_ANCHOR_POSITION_MAGNITUDE_CONSERVATION',
        ),
        requestedQuantity: '1',
        postOnlyMakerProofPreserved: true,
      }).recoveryClassification,
    ).toBe('UNKNOWN_ORDER_RECOVERED_PARTIAL_EXECUTION');
    const fullIdentity = recoverDecibelExecutionIdentityFromClientOrderTradesV1({
      account: 'sub',
      market: 'btc',
      clientOrderId: 'client-1',
      rows: [trade('1')],
    });
    expect(
      reconcileDecibelUnknownOrderAfterNeutralizationV1({
        prepared,
        neutralization: neutral,
        executionIdentity: fullIdentity,
        positionConservation: conservation(
          '1',
          'COMPLETE_BY_ZERO_ANCHOR_POSITION_MAGNITUDE_CONSERVATION',
        ),
        requestedQuantity: '1',
        postOnlyMakerProofPreserved: true,
      }).recoveryClassification,
    ).toBe('UNKNOWN_ORDER_RECOVERED_FULL_EXECUTION');
  });

  it('deduplicates fills and rejects two venue IDs for one client ID', () => {
    expect(
      recoverDecibelExecutionIdentityFromClientOrderTradesV1({
        account: 'sub',
        market: 'btc',
        clientOrderId: 'client-1',
        rows: [trade(), trade()],
      }).uniqueFills,
    ).toHaveLength(1);
    expect(() =>
      recoverDecibelExecutionIdentityFromClientOrderTradesV1({
        account: 'sub',
        market: 'btc',
        clientOrderId: 'client-1',
        rows: [trade('0.1', 'a', 'o1'), trade('0.2', 'b', 'o2')],
      }),
    ).toThrow('MULTIPLE_VENUE_ORDER_CONFLICT');
  });

  it('fails closed for position mismatch, missing quantity, and non-flat no-fill state', () => {
    const identity = recoverDecibelExecutionIdentityFromClientOrderTradesV1({
      account: 'sub',
      market: 'btc',
      clientOrderId: 'client-1',
      rows: [trade()],
    });
    expect(
      reconcileDecibelUnknownOrderAfterNeutralizationV1({
        prepared,
        neutralization: neutral,
        executionIdentity: identity,
        positionConservation: conservation('0.2', 'MISSING_FILL_QUANTITY'),
        requestedQuantity: '1',
        postOnlyMakerProofPreserved: true,
      }).recoveryClassification,
    ).toBe('CANARY_TERMINATION_UNSAFE');
    const empty = recoverDecibelExecutionIdentityFromClientOrderTradesV1({
      account: 'sub',
      market: 'btc',
      clientOrderId: 'client-1',
      rows: [],
    });
    expect(
      reconcileDecibelUnknownOrderAfterNeutralizationV1({
        prepared,
        neutralization: neutral,
        executionIdentity: empty,
        positionConservation: conservation('0.3', 'MISSING_FILL_QUANTITY'),
        requestedQuantity: '1',
        postOnlyMakerProofPreserved: true,
      }).recoveryClassification,
    ).toBe('CANARY_TERMINATION_UNSAFE');
  });

  it('keeps ambiguous cancellation fail-closed without resubmission', () => {
    const ambiguous = classifyDecibelUnknownOrderExposureNeutralizationV1({
      cancelOutcome: 'NOT_FOUND_UNQUALIFIED',
    });
    const result = reconcileDecibelUnknownOrderAfterNeutralizationV1({
      prepared,
      neutralization: ambiguous,
      executionIdentity: recoverDecibelExecutionIdentityFromClientOrderTradesV1({
        account: 'sub',
        market: 'btc',
        clientOrderId: 'client-1',
        rows: [],
      }),
      positionConservation: conservation('0', 'NO_EXECUTION_RECONCILED'),
      requestedQuantity: '1',
      postOnlyMakerProofPreserved: true,
    });
    expect(result.recoveryClassification).toBe('CANCEL_RESULT_AMBIGUOUS');
    expect(result.automaticResubmissionPermitted).toBe(false);
  });

  it('keeps current exposure neutralization and lineage partial', () => {
    const audit = DecibelUnknownOrderNeutralizationRecoveryAuditV1;
    expect(audit.tradeHistoryClientOrderId).toBe('AVAILABLE_VIA_SDK');
    expect(audit.canaryRecoveryDependsOnTerminalOrderRetention).toBe(false);
    expect(audit.unknownOrderExposureNeutralization).toBe('PARTIAL');
    expect(audit.canaryOrderLineageDurability).toBe('PARTIAL');
    expect(audit.minimalLiveCanaryReconciliationReady).toBe(false);
    expect(audit.liveExecutionEnabled).toBe(false);
  });
});
