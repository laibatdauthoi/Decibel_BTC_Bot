import type { decibel_actual_fill_truth_v1 } from './decibel_actual_fill_truth_v1.js';

export const DECIBEL_PNL_TRACKER_V1 = 'DECIBEL_PNL_TRACKER_V1' as const;

export type decibel_realized_pnl_window_v1 = Readonly<{
  windowMs: number;
  realizedPnlUsd: number;
  realizedPnlPercent: number | null;
  matchedNotionalUsd: number;
}>;

type lot = { quantity: number; price: number };

function calculateWindow(
  fills: readonly decibel_actual_fill_truth_v1[],
  now: number,
  windowMs: number,
): decibel_realized_pnl_window_v1 {
  const buys: lot[] = [];
  const sells: lot[] = [];
  let realizedPnlUsd = 0;
  let matchedNotionalUsd = 0;
  const ordered = fills
    .filter((fill) => {
      const timestamp = (fill.venueTimestamp ?? fill.receivedAt).getTime();
      return timestamp <= now && timestamp >= now - windowMs;
    })
    .sort(
      (left, right) =>
        (left.venueTimestamp ?? left.receivedAt).getTime() -
          (right.venueTimestamp ?? right.receivedAt).getTime() ||
        left.venueFillId.localeCompare(right.venueFillId),
    );
  for (const fill of ordered) {
    let remaining = fill.executedBaseQuantity;
    const opposing = fill.side === 'BUY' ? sells : buys;
    while (remaining > 0 && opposing[0] !== undefined) {
      const open = opposing[0];
      const matched = Math.min(remaining, open.quantity);
      realizedPnlUsd +=
        fill.side === 'BUY'
          ? (open.price - fill.executedPrice) * matched
          : (fill.executedPrice - open.price) * matched;
      matchedNotionalUsd += matched * fill.executedPrice;
      remaining -= matched;
      open.quantity -= matched;
      if (open.quantity <= Number.EPSILON) opposing.shift();
    }
    if (remaining > Number.EPSILON)
      (fill.side === 'BUY' ? buys : sells).push({ quantity: remaining, price: fill.executedPrice });
    if (fill.fee.availability === 'AVAILABLE' && fill.fee.amount !== null)
      realizedPnlUsd -= fill.fee.amount;
  }
  return Object.freeze({
    windowMs,
    realizedPnlUsd,
    realizedPnlPercent: matchedNotionalUsd > 0 ? (realizedPnlUsd / matchedNotionalUsd) * 100 : null,
    matchedNotionalUsd,
  });
}

export function calculateDecibelRealizedPnlWindowsV1(
  fills: readonly decibel_actual_fill_truth_v1[],
  now: number,
): Readonly<{
  hours24: decibel_realized_pnl_window_v1;
  days7: decibel_realized_pnl_window_v1;
  days30: decibel_realized_pnl_window_v1;
}> {
  return Object.freeze({
    hours24: calculateWindow(fills, now, 24 * 60 * 60 * 1_000),
    days7: calculateWindow(fills, now, 7 * 24 * 60 * 60 * 1_000),
    days30: calculateWindow(fills, now, 30 * 24 * 60 * 60 * 1_000),
  });
}
