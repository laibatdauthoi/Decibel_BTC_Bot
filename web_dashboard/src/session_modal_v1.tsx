import { useEffect, useRef, type ReactNode } from 'react';

export function isOutsideDialogV1(
  point: Readonly<{ x: number; y: number }>,
  bounds: Readonly<{ left: number; right: number; top: number; bottom: number }>,
): boolean {
  return (
    point.x < bounds.left ||
    point.x > bounds.right ||
    point.y < bounds.top ||
    point.y > bounds.bottom
  );
}
export function shouldCloseBackdropV1(
  start: Readonly<{ x: number; y: number; id: number }> | null,
  end: Readonly<{ x: number; y: number; id: number }>,
  outside: boolean,
): boolean {
  return (
    start !== null &&
    outside &&
    start.id === end.id &&
    Math.hypot(start.x - end.x, start.y - end.y) <= 6
  );
}

export const SessionModal = (
  props: Readonly<{ title: string; close: () => void; children: ReactNode; className?: string }>,
) => {
  const Dialog = useRef<HTMLDialogElement>(null);
  const PointerStart = useRef<{ x: number; y: number; id: number } | null>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = Dialog.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={Dialog}
      className={`activity-history-modal ${props.className ?? ''}`}
      aria-label={props.title}
      onCancel={(event) => {
        event.preventDefault();
        props.close();
      }}
      onPointerDown={(event) => {
        PointerStart.current =
          event.target === event.currentTarget &&
          isOutsideDialogV1(
            { x: event.clientX, y: event.clientY },
            event.currentTarget.getBoundingClientRect(),
          ) &&
          event.button === 0
            ? { x: event.clientX, y: event.clientY, id: event.pointerId }
            : null;
      }}
      onPointerCancel={() => {
        PointerStart.current = null;
      }}
      onPointerUp={(event) => {
        const outside =
          event.target === event.currentTarget &&
          isOutsideDialogV1(
            { x: event.clientX, y: event.clientY },
            event.currentTarget.getBoundingClientRect(),
          );
        const close = shouldCloseBackdropV1(
          PointerStart.current,
          { x: event.clientX, y: event.clientY, id: event.pointerId },
          outside,
        );
        PointerStart.current = null;
        if (close) props.close();
      }}
    >
      <header>
        <h2>{props.title}</h2>
        <button type="button" onClick={props.close} autoFocus aria-label="Close Session History">
          CLOSE
        </button>
      </header>
      {props.children}
    </dialog>
  );
};
