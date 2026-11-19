import { useEffect, useRef, type ReactNode } from 'react';

import { isOutsideDialogV1, shouldCloseBackdropV1 } from './session_modal_v1';

/**
 * In-app confirmation dialog matching the dashboard style (replaces window.confirm).
 * Escape, the Cancel button and a click on the backdrop all cancel; focus starts on
 * Cancel so Enter never confirms a destructive action by accident.
 */
export const ConfirmDialog = (
  props: Readonly<{
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    /** Extra fields between the message and the buttons (for example an amount). */
    children?: ReactNode;
    confirmDisabled?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }>,
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
      className="confirm-dialog"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      onCancel={(event) => {
        event.preventDefault();
        props.onCancel();
      }}
      onPointerDown={(event) => {
        PointerStart.current =
          event.target === event.currentTarget &&
          event.button === 0 &&
          isOutsideDialogV1(
            { x: event.clientX, y: event.clientY },
            event.currentTarget.getBoundingClientRect(),
          )
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
        if (close) props.onCancel();
      }}
    >
      <header>
        <h2 id="confirm-dialog-title">{props.title}</h2>
      </header>
      <p id="confirm-dialog-message">{props.message}</p>
      {props.children !== undefined && <div className="confirm-dialog-body">{props.children}</div>}
      <footer>
        <button
          type="button"
          className="confirm-dialog-cancel"
          onClick={props.onCancel}
          autoFocus={props.children === undefined}
        >
          {props.cancelLabel ?? 'CANCEL'}
        </button>
        <button
          type="button"
          className="confirm-dialog-confirm"
          disabled={props.confirmDisabled === true}
          onClick={props.onConfirm}
        >
          {props.confirmLabel}
        </button>
      </footer>
    </dialog>
  );
};
