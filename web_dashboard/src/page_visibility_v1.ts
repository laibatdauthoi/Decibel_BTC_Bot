import { useEffect, useRef } from 'react';

export type page_visibility_handlers_v1 = Readonly<{
  onVisible: () => void;
  onHidden?: () => void;
}>;

/**
 * Calls `onHidden` when the tab is hidden and `onVisible` when it is shown again (also after a
 * back/forward cache restore). A hidden tab gets throttled or frozen timers, and a telemetry
 * stream left open meanwhile piles up snapshots that all have to be parsed on return.
 */
export function usePageVisibilityV1(handlers: page_visibility_handlers_v1): void {
  const Handlers = useRef(handlers);
  useEffect(() => {
    Handlers.current = handlers;
  });
  useEffect(() => {
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') Handlers.current.onVisible();
      else Handlers.current.onHidden?.();
    };
    const onPageShow = (event: PageTransitionEvent): void => {
      if (event.persisted) Handlers.current.onVisible();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);
}

/** True when the telemetry stream was closed (by the hidden tab or the browser) and must reopen. */
export function shouldReopenEventStreamV1(readyState: number | undefined): boolean {
  return readyState === undefined || readyState === 2; // EventSource.CLOSED
}

/** Polls skip a hidden tab; the visible handler reads fresh state on return. */
export function isPageHiddenV1(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}
