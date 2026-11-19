import { useEffect, useRef } from 'react';

/**
 * Browsers throttle timers in a hidden tab (to once a minute after a few minutes) and may drop
 * its event stream. Calls `onVisible` when the tab is shown again, so the dashboard reads fresh
 * state at once instead of waiting for the next throttled poll or stream reconnect.
 */
export function useOnPageVisibleV1(onVisible: () => void): void {
  const OnVisible = useRef(onVisible);
  useEffect(() => {
    OnVisible.current = onVisible;
  });
  useEffect(() => {
    const handle = (): void => {
      if (document.visibilityState === 'visible') OnVisible.current();
    };
    document.addEventListener('visibilitychange', handle);
    window.addEventListener('pageshow', handle);
    return () => {
      document.removeEventListener('visibilitychange', handle);
      window.removeEventListener('pageshow', handle);
    };
  }, []);
}

/** True when a hidden tab's event stream must be reopened rather than left to its retry delay. */
export function shouldReopenEventStreamV1(readyState: number | undefined): boolean {
  return readyState !== 1; // EventSource.OPEN
}
