import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildOrderManagerVerificationReport } from '../src/verify_order_manager.js';
import {
  deterministic_clock,
  getClientOrderId,
  getExitOrderId,
  getReplacementOrderId,
  paper_execution_adapter,
  validateOrderTransition,
  type adapter_fill,
  type order_instruction,
} from '../src/order_manager.js';
const Directories: string[] = [];
afterEach(() => {
  for (const directory of Directories.splice(0))
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
});
describe('order manager', () => {
  it('generates stable identifiers and rejects invalid transitions', () => {
    expect(getClientOrderId('i', 'ENTRY', 1)).toBe(getClientOrderId('i', 'ENTRY', 1));
    expect(getClientOrderId('i', 'ENTRY', 1)).not.toBe(getClientOrderId('i', 'ENTRY', 2));
    expect(getReplacementOrderId('o', 1)).not.toBe(getReplacementOrderId('o', 2));
    expect(getExitOrderId('p', 'STOP')).toBe(getExitOrderId('p', 'STOP'));
    expect(() => validateOrderTransition('CREATED', 'ACTIVE')).toThrow('INVALID_ORDER_TRANSITION');
  });
  it('uses no future evidence and implements both conservative fill assumptions', () => {
    const Clock = new deterministic_clock('2026-01-01T00:00:00Z'),
      Adapter = new paper_execution_adapter(Clock);
    const instruction = { side: 'BUY', limitPrice: 100, requestedQuantity: 1 } as order_instruction;
    const fill: adapter_fill = {
      fillId: 'f',
      clientOrderId: 'o',
      eventTimestamp: '2026-01-01T00:00:00Z',
      receivedAt: '2026-01-01T00:00:00Z',
      price: 99,
      quantity: 0.2,
      feeRate: 0.001,
      liquidityRole: 'MAKER',
      fillSource: 'STRICT_TRADE_THROUGH',
      evidenceIds: ['trade'],
      confidence: 'CONSERVATIVE',
    };
    expect(
      Adapter.evaluateFill(instruction, '2026-01-01T00:00:01Z', fill, 98, 101, 0.2),
    ).toBeNull();
    expect(
      Adapter.evaluateFill(instruction, '2025-12-31T23:59:59Z', fill, 98, 101, 0.2)?.quantity,
    ).toBe(0.2);
    expect(
      Adapter.evaluateFill(
        instruction,
        '2025-12-31T23:59:59Z',
        { ...fill, fillSource: 'TOUCH_WITH_FLOW', price: 100 },
        99,
        101,
        0.1,
      )?.quantity,
    ).toBe(0.1);
  });
  it('runs assertion-backed crossing, latency, fill, cancellation, outbox, and exit scenarios', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'order-report-'));
    Directories.push(directory);
    const report = buildOrderManagerVerificationReport(directory);
    expect(report.scenarioResults.every((scenario) => scenario.result === 'PASS')).toBe(true);
    expect(report).toMatchObject({
      leverage: 40,
      liveExecutionAdapterExported: false,
      canTradeLive: false,
    });
    expect(report.reservationOwnership).toMatchObject({
      nonTerminalOrders: [],
      totalOrderOwnedReservation: 0,
      paperAccountReservedEntryCollateral: 0,
      reservationEqualityAsserted: true,
    });
    expect(report.reconciliationRequiredOrderCount).toBe(0);
    expect(report.finalPaperState).toMatchObject({
      positionState: 'CLOSED',
      reservedEntryCollateral: 0,
      allocatedPositionMargin: 0,
    });
    expect(report.finalPaperState.availableCollateral).toBe(report.finalPaperState.totalEquity);
    expect(report.durableOutboxEvidence).toMatchObject({
      pendingCount: 0,
      pendingCountAfterRecovery: 0,
      logicalClientOrderCountAfterRestart: 1,
    });
    expect(report.durableOutboxEvidence.dispatchAttemptCount).toBeGreaterThan(0);
    expect(report.dailyMinimumEvidence).toMatchObject({
      minimumStatus: 'MINIMUM_MET',
      duplicateFillVolumeAdded: 0,
      tradingContinuedAfterMinimum: true,
    });
    expect(report.dailyMinimumEvidence.finalVolume).toBeGreaterThan(10_000);
    expect(report.dailyMinimumEvidence.additionalVolumeAfterMinimum).toBeGreaterThan(0);
    const cancelEffectiveAt = report.timingEvidence.cancelEffectiveAt;
    if (cancelEffectiveAt === null) throw new Error('Missing cancellation effectiveness timestamp');
    expect(report.timingEvidence.fillBeforeCancelEffectivenessAt < cancelEffectiveAt).toBe(true);
    expect(report.timingEvidence.fillAfterCancellationResult).toBe('FILL_NOT_ALLOWED');
    expect(JSON.stringify(report)).not.toContain('00000000000004');
  });
  it('preserves deterministic adapter latency without sleeping', () => {
    const Clock = new deterministic_clock('2026-01-01T00:00:00Z'),
      Adapter = new paper_execution_adapter(Clock, 250, 400);
    const command = {
      commandId: 'c',
      clientOrderId: 'o',
      kind: 'SUBMIT_ORDER' as const,
      payload: {} as order_instruction,
      attemptCount: 0,
      nextAttemptAt: Clock.now(),
      deliveredAt: null,
    };
    expect(Adapter.dispatch(command)?.acknowledgedAt).toBe('2026-01-01T00:00:00.250Z');
    expect(Adapter.dispatch({ ...command, kind: 'CANCEL_ORDER' })?.acknowledgedAt).toBe(
      '2026-01-01T00:00:00.400Z',
    );
  });
});
