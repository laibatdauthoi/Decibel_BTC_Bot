import { useEffect, useRef } from 'react';

/** How long a transient dashboard notice stays visible. Errors stay longer to be read. */
export const DASHBOARD_NOTICE_MS_V1 = Object.freeze({ success: 4_000, error: 6_000 });

export type dashboard_notice_tone_v1 = 'success' | 'error' | 'info';

/** Visible time of a notice; null keeps it (info describes work still in progress). */
export function noticeLifetimeMsV1(tone: dashboard_notice_tone_v1): number | null {
  return tone === 'info' ? null : DASHBOARD_NOTICE_MS_V1[tone];
}

/** Calls `dismiss` once `lifetimeMs` has passed; a new notice restarts the timer. */
export function useDismissNoticeV1(
  notice: unknown,
  lifetimeMs: number | null,
  dismiss: () => void,
): void {
  const Dismiss = useRef(dismiss);
  useEffect(() => {
    Dismiss.current = dismiss;
  });
  useEffect(() => {
    if (notice === null || notice === undefined || lifetimeMs === null) return;
    const timer = setTimeout(() => Dismiss.current(), lifetimeMs);
    return () => clearTimeout(timer);
  }, [notice, lifetimeMs]);
}
