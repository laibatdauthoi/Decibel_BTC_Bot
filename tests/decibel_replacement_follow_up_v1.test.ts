import { describe, expect, it } from 'vitest';
import {
  DECIBEL_REPLACEMENT_FOLLOW_UP_DELAY_MS_V1,
  DECIBEL_REPLACEMENT_FOLLOW_UP_IDLE_V1,
  DECIBEL_REPLACEMENT_FOLLOW_UP_MAX_V1,
  planDecibelReplacementFollowUpV1,
} from '../src/decibel_replacement_follow_up_v1.js';

describe('replacement follow-up cadence', () => {
  it('schedules a fast cycle only while a replacement is pending', () => {
    expect(planDecibelReplacementFollowUpV1(DECIBEL_REPLACEMENT_FOLLOW_UP_IDLE_V1, null)).toEqual({
      state: DECIBEL_REPLACEMENT_FOLLOW_UP_IDLE_V1,
      delayMs: null,
    });
    const first = planDecibelReplacementFollowUpV1(DECIBEL_REPLACEMENT_FOLLOW_UP_IDLE_V1, 'r-1');
    expect(first).toEqual({
      state: { decisionId: 'r-1', count: 1 },
      delayMs: DECIBEL_REPLACEMENT_FOLLOW_UP_DELAY_MS_V1,
    });
    const second = planDecibelReplacementFollowUpV1(first.state, 'r-1');
    expect(second.state).toEqual({ decisionId: 'r-1', count: 2 });
    expect(planDecibelReplacementFollowUpV1(second.state, null).state).toEqual(
      DECIBEL_REPLACEMENT_FOLLOW_UP_IDLE_V1,
    );
  });

  it('restarts the count for a new plan and caps fast cycles per plan', () => {
    let state = DECIBEL_REPLACEMENT_FOLLOW_UP_IDLE_V1;
    let delays = 0;
    for (let index = 0; index < DECIBEL_REPLACEMENT_FOLLOW_UP_MAX_V1 + 5; index += 1) {
      const next = planDecibelReplacementFollowUpV1(state, 'stuck');
      state = next.state;
      if (next.delayMs !== null) delays += 1;
    }
    expect(delays).toBe(DECIBEL_REPLACEMENT_FOLLOW_UP_MAX_V1);
    expect(planDecibelReplacementFollowUpV1(state, 'stuck').delayMs).toBeNull();
    expect(planDecibelReplacementFollowUpV1(state, 'next-plan')).toEqual({
      state: { decisionId: 'next-plan', count: 1 },
      delayMs: DECIBEL_REPLACEMENT_FOLLOW_UP_DELAY_MS_V1,
    });
  });

  it('honours custom delay and maximum', () => {
    const plan = planDecibelReplacementFollowUpV1(DECIBEL_REPLACEMENT_FOLLOW_UP_IDLE_V1, 'r', {
      delayMs: 100,
      maximum: 1,
    });
    expect(plan.delayMs).toBe(100);
    expect(
      planDecibelReplacementFollowUpV1(plan.state, 'r', { delayMs: 100, maximum: 1 }).delayMs,
    ).toBeNull();
  });
});
