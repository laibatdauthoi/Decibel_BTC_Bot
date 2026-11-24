import { describe, expect, it } from 'vitest';
import { createDecibelReentryGuardV1 } from '../src/decibel_production_web_helpers_v1.js';

describe('Execution snapshot ready signal', () => {
  it('drops a nested call instead of recursing (activation -> economic rebuild -> signal)', () => {
    let activations = 0;
    let notify: () => void = () => undefined;
    // Activation re-reads the economic evidence, whose rebuild raises the signal again.
    const rebuildSnapshot = () => notify();
    notify = createDecibelReentryGuardV1(() => {
      activations += 1;
      rebuildSnapshot();
    });
    expect(() => notify()).not.toThrow();
    expect(activations).toBe(1);
    // Later signals are not swallowed.
    notify();
    expect(activations).toBe(2);
  });

  it('releases the guard when the callback throws', () => {
    let calls = 0;
    const guarded = createDecibelReentryGuardV1(() => {
      calls += 1;
      if (calls === 1) throw new Error('ACTIVATION_FAILED');
    });
    expect(() => guarded()).toThrow('ACTIVATION_FAILED');
    guarded();
    expect(calls).toBe(2);
  });
});
