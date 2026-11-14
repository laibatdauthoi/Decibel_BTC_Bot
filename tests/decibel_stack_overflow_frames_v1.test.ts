import { describe, expect, it } from 'vitest';
import { describeDecibelStackOverflowFramesV1 } from '../src/run_decibel_production_web_v1.js';

const overflow = (): RangeError => {
  const recurse = (depth: number): number => recurse(depth + 1) + 1;
  try {
    recurse(0);
  } catch (error) {
    if (error instanceof RangeError) return error;
  }
  throw new Error('EXPECTED_STACK_OVERFLOW');
};

describe('stack overflow frames v1', () => {
  it('reports the top frames of a stack overflow, also when it is a cause', () => {
    const direct = describeDecibelStackOverflowFramesV1(overflow());
    expect(direct).toMatch(/^ STACK=\[/);
    const frames = JSON.parse(direct.slice(' STACK='.length)) as string[];
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.length).toBeLessThanOrEqual(8);
    expect(frames[0]).toContain('recurse');
    const wrapped = new Error('PRODUCTION_AUTHENTICATED_READ_TRANSIENT', { cause: overflow() });
    expect(describeDecibelStackOverflowFramesV1(wrapped)).toMatch(/recurse/);
  });

  it('stays silent for other errors', () => {
    expect(describeDecibelStackOverflowFramesV1(new Error('fetch failed'))).toBe('');
    expect(describeDecibelStackOverflowFramesV1('text')).toBe('');
  });
});
