import { describe, expect, it } from 'vitest';

import { createLogger } from '../src/logger.js';

function makeDestination() {
  const lines: string[] = [];
  return {
    lines,
    destination: { write: (line: string) => lines.push(line) },
  };
}

describe('createLogger', () => {
  it('preserves structured newline-delimited records in JSON mode', () => {
    const output = makeDestination();
    const Logger = createLogger('json', output.destination);

    Logger.info({ event: 'service_started', total: 42 }, 'Service started');

    const record = JSON.parse(output.lines.join('')) as unknown;
    expect(record).toMatchObject({
      level: 'info',
      event: 'service_started',
      total: 42,
      msg: 'Service started',
    });
  });

  it('formats concise multiline local output', () => {
    const output = makeDestination();
    const Logger = createLogger('pretty', output.destination);

    Logger.warn({ event: 'candle_data_stale', staleAfterMs: 600_000 }, 'Candlestick data is stale');

    const text = output.lines.join('');
    expect(text).toContain('WARN Candlestick data is stale');
    expect(text).toContain('\n  event: candle_data_stale');
    expect(text).toContain('\n  staleAfterMs: 600000');
    expect(text).not.toContain('"event"');
  });

  it('redacts credential-shaped fields in every format', () => {
    for (const format of ['pretty', 'json'] as const) {
      const output = makeDestination();
      const Logger = createLogger(format, output.destination);
      Logger.info({ event: 'test', nodeApiKey: 'example-secret' }, 'Safe output');

      expect(output.lines.join('')).not.toContain('example-secret');
      expect(output.lines.join('')).toContain('[REDACTED]');
    }
  });
});
