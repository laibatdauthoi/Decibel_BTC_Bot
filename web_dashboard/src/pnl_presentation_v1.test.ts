import { describe, expect, it } from 'vitest';
import {
  calculateActivityFillNetPnlV1,
  calculateGrossPnlUsdV1,
  formatOperatorPnlPairV1,
} from './presentation';

describe('PnL and net PnL presentation', () => {
  it('derives gross PnL from net PnL and fees', () => {
    // Live session 2026-11-12: net -0.01132 after 0.02928 of fees.
    expect(calculateGrossPnlUsdV1(-0.01132, 0.02928)).toBeCloseTo(0.01796, 10);
    expect(calculateGrossPnlUsdV1(null, 0.02928)).toBeNull();
    expect(calculateGrossPnlUsdV1(-0.01, null)).toBeNull();
  });

  it('formats gross PnL next to net PnL', () => {
    expect(formatOperatorPnlPairV1(0.018, -0.011)).toBe('PnL +$0.02 · Net $-0.01');
    expect(formatOperatorPnlPairV1(null, -0.011)).toBe('PnL — · Net $-0.01');
  });

  it('computes net PnL per closing fill with FIFO opening fees', () => {
    const net = calculateActivityFillNetPnlV1([
      {
        fillId: 'close',
        timestamp: 3,
        quantity: 1,
        feeUsd: 0.1,
        pnlAtCloseUsd: 2,
        closePnlAvailability: 'VERIFIED',
        direction: 'Close Long',
      },
      {
        fillId: 'open',
        timestamp: 1,
        quantity: 1,
        feeUsd: 0.2,
        closePnlAvailability: 'N/A',
        direction: 'Open Long',
      },
      {
        fillId: 'open-2',
        timestamp: 4,
        quantity: 2,
        feeUsd: 0.4,
        closePnlAvailability: 'N/A',
        direction: 'Open Short',
      },
      {
        fillId: 'close-2a',
        timestamp: 5,
        quantity: 1,
        feeUsd: 0.05,
        pnlAtCloseUsd: -1,
        closePnlAvailability: 'VERIFIED',
        direction: 'Close Short',
      },
      {
        fillId: 'unknown-fee',
        timestamp: 6,
        quantity: 1,
        feeUsd: null,
        pnlAtCloseUsd: 1,
        closePnlAvailability: 'VERIFIED',
        direction: 'Close Short',
      },
    ]);
    expect(net.get('close')).toBeCloseTo(2 - 0.1 - 0.2, 12);
    expect(net.get('close-2a')).toBeCloseTo(-1 - 0.05 - 0.2, 12);
    expect(net.get('unknown-fee')).toBeNull();
    expect(net.has('open')).toBe(false);
  });

  it('returns null when a close cannot be matched to opening fills', () => {
    const net = calculateActivityFillNetPnlV1([
      {
        fillId: 'orphan',
        timestamp: 1,
        quantity: 1,
        feeUsd: 0.1,
        pnlAtCloseUsd: 1,
        closePnlAvailability: 'VERIFIED',
        direction: 'Close Long',
      },
    ]);
    expect(net.get('orphan')).toBeNull();
  });
});
