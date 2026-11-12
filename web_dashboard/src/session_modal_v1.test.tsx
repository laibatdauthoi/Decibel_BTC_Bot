import { describe, expect, it } from 'vitest';
import { isOutsideDialogV1, shouldCloseBackdropV1 } from './session_modal_v1';

describe('Shared modal backdrop gestures', () => {
  const bounds = { left: 100, right: 900, top: 100, bottom: 700 };
  it('closes an outside press/release, but not a click inside content', () => {
    expect(isOutsideDialogV1({ x: 50, y: 50 }, bounds)).toBe(true);
    expect(isOutsideDialogV1({ x: 200, y: 200 }, bounds)).toBe(false);
    expect(shouldCloseBackdropV1({ x: 50, y: 50, id: 1 }, { x: 50, y: 50, id: 1 }, true)).toBe(
      true,
    );
    expect(shouldCloseBackdropV1({ x: 200, y: 200, id: 1 }, { x: 200, y: 200, id: 1 }, false)).toBe(
      false,
    );
  });
  it('does not close when selecting inside and releasing outside, dragging, or changing pointer', () => {
    expect(shouldCloseBackdropV1(null, { x: 50, y: 50, id: 1 }, true)).toBe(false);
    expect(shouldCloseBackdropV1({ x: 50, y: 50, id: 1 }, { x: 80, y: 80, id: 1 }, true)).toBe(
      false,
    );
    expect(shouldCloseBackdropV1({ x: 50, y: 50, id: 1 }, { x: 50, y: 50, id: 2 }, true)).toBe(
      false,
    );
    expect(shouldCloseBackdropV1({ x: 50, y: 50, id: 1 }, { x: 200, y: 200, id: 1 }, false)).toBe(
      false,
    );
  });
});
