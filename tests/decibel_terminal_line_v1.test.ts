import { describe, expect, it } from 'vitest';
import {
  DECIBEL_TERMINAL_MAX_LINE_V1,
  decibel_terminal_line_formatter_v1,
  formatDecibelTerminalLineV1,
} from '../src/decibel_terminal_line_v1.js';

const NOW = new Date(2026, 10, 18, 9, 5, 7);

describe('Terminal view of runtime stdout', () => {
  it('compacts the CONTROL_LOOP diagnostic into one short line', () => {
    const line = [
      'PROCESS_ID=1 INTENDED_ACTION="NONE"',
      `ACTUAL_CAPACITY_LIMIT=${JSON.stringify({ padding: 'x'.repeat(5_000) })}`,
      'FINAL_EXECUTOR_OUTCOME="UNKNOWN" CONTROL_LOOP=ACTIVE LAST_CYCLE_AGE_MS=40',
      'TRADING_STATE=HOLD TRADING_REASON=TP_RESTING POSITION_QTY=0.0012',
      'UNCOVERED_INVENTORY_QTY=0 TP_RESTING_PRICE=98123.5',
    ].join(' ');
    expect(formatDecibelTerminalLineV1(line, NOW)).toBe(
      '09:05:07 LOOP ACTIVE | HOLD: TP_RESTING | POS 0.0012 | TP 98123.5',
    );
  });

  it('compacts the session control line and drops repeated blockers', () => {
    expect(
      formatDecibelTerminalLineV1(
        'PROCESS_ID=1 SESSION_CONTROL_STATE=STOPPING EXECUTION_LOOP=RUNNING BLOCKER=X_ACK READINESS_BLOCKER=X_ACK LAST_START_BLOCKER=NONE',
        NOW,
      ),
    ).toBe('09:05:07 SESSION STOPPING | LOOP RUNNING | BLOCKER X_ACK');
  });

  it('keeps healthy per-cycle telemetry out of the terminal but shows trouble', () => {
    expect(
      formatDecibelTerminalLineV1('DECIBEL_PRODUCTION_EVENT_LOOP_LAG_MS P50=3 P95=4 MAX=9', NOW),
    ).toBeNull();
    expect(
      formatDecibelTerminalLineV1(
        'DECIBEL_PRODUCTION_MARKET_PIPELINE {"wsConnectionState":"CONNECTED","wsSubscriptionState":"SUBSCRIBED"}',
        NOW,
      ),
    ).toBeNull();
    expect(
      formatDecibelTerminalLineV1(
        'DECIBEL_PRODUCTION_MARKET_PIPELINE {"wsConnectionState":"RECONNECTING"}',
        NOW,
      ),
    ).toContain('RECONNECTING');
    expect(formatDecibelTerminalLineV1('DECIBEL_PRODUCTION_ECONOMIC_REFRESH=FAIL', NOW)).toBe(
      '09:05:07 DECIBEL_PRODUCTION_ECONOMIC_REFRESH=FAIL',
    );
  });

  it('shows JSON events by name with their short fields and caps long lines', () => {
    expect(
      formatDecibelTerminalLineV1(
        JSON.stringify({
          event: 'DECIBEL_EXECUTION_CANCEL_STAGE',
          stage: 'SDK_CANCEL_ORDER_COMPLETE',
          elapsedMs: 1138,
          intentId: 'intent-1',
          nested: { a: 1 },
        }),
        NOW,
      ),
    ).toBe('09:05:07 EXECUTION_CANCEL_STAGE stage=SDK_CANCEL_ORDER_COMPLETE elapsedMs=1138');
    expect(
      formatDecibelTerminalLineV1(
        JSON.stringify({ event: 'DECIBEL_EXECUTION_CANCEL_STAGE', stage: 'GAS_DIAGNOSTICS' }),
        NOW,
      ),
    ).toBeNull();
    expect(
      formatDecibelTerminalLineV1(
        JSON.stringify({ event: 'DECIBEL_EXECUTION_SUBMISSION_STAGE', stage: 'SDK_PLACE_FAILED' }),
        NOW,
      ),
    ).toContain('SDK_PLACE_FAILED');
    const long = formatDecibelTerminalLineV1(`NOTE ${'y'.repeat(1_000)}`, NOW) ?? '';
    expect(long.length).toBeLessThanOrEqual(DECIBEL_TERMINAL_MAX_LINE_V1 + 9);
    expect(long.endsWith(' …')).toBe(true);
  });

  it('joins lines split across chunks and passes raw text in verbose mode', () => {
    const formatter = new decibel_terminal_line_formatter_v1(false);
    expect(formatter.push('DECIBEL_PRODUCTION_WEB=REA')).toBe('');
    expect(formatter.push('DY\nTAIL')).toMatch(/^\d\d:\d\d:\d\d DECIBEL_PRODUCTION_WEB=READY\n$/);
    expect(formatter.flush()).toMatch(/ TAIL\n$/);
    expect(new decibel_terminal_line_formatter_v1(true).push('raw\n')).toBe('raw\n');
  });
});
