import { describe, expect, it } from 'vitest';
import {
  DECIBEL_LINE_REDACTOR_MAX_PENDING_V1,
  collectDecibelSecretValuesV1,
  decibel_line_redactor_v1,
  installDecibelConsoleRedactionV1,
  redactDecibelSecretsV1,
} from '../src/decibel_secret_redaction_v1.js';

// Fake values only. They are never real credentials.
const FAKE_PRIVATE_KEY = '0x' + 'ab'.repeat(32);
const FAKE_NODE_KEY = 'aptoslabs_FakeNodeKeyForTestsOnly_0123';

describe('secret redaction', () => {
  it('collects secret-named environment values and both hex spellings', () => {
    const secrets = collectDecibelSecretValuesV1({
      DECIBEL_PRIVATE_KEY: FAKE_PRIVATE_KEY,
      DECIBEL_NODE_API_KEY: FAKE_NODE_KEY,
      DECIBEL_SUBACCOUNT_ADDRESS: '0x' + 'cd'.repeat(32),
      SHORT_TOKEN: 'abc',
      TRADING_MODE: 'mainnet',
    });
    expect(secrets).toContain(FAKE_PRIVATE_KEY);
    expect(secrets).toContain(FAKE_PRIVATE_KEY.slice(2));
    expect(secrets).toContain(FAKE_NODE_KEY);
    expect(secrets).not.toContain('0x' + 'cd'.repeat(32));
    expect(secrets).not.toContain('abc');
    expect(secrets).not.toContain('mainnet');
  });

  it('removes configured secrets and any Aptos Labs key pattern', () => {
    const secrets = collectDecibelSecretValuesV1({ DECIBEL_PRIVATE_KEY: FAKE_PRIVATE_KEY });
    const text = `overrides: { API_KEY: '${FAKE_NODE_KEY}' } key=${FAKE_PRIVATE_KEY.slice(2)}`;
    const redacted = redactDecibelSecretsV1(text, secrets);
    expect(redacted).not.toContain('aptoslabs_');
    expect(redacted).not.toContain('ab'.repeat(32));
    expect(redacted).toContain('[REDACTED]');
  });

  it('redacts a secret split across piped chunks', () => {
    const redactor = new decibel_line_redactor_v1([FAKE_PRIVATE_KEY]);
    const line = `error key=${FAKE_PRIVATE_KEY}\n`;
    const middle = Math.floor(line.length / 2);
    const first = redactor.push(Buffer.from(line.slice(0, middle)));
    const second = redactor.push(Buffer.from(line.slice(middle)));
    expect(first).toBe('');
    expect(second).toBe('error key=[REDACTED]\n');
    expect(redactor.push('tail without newline')).toBe('');
    expect(redactor.flush()).toBe('tail without newline');
  });

  it('bounds output that never ends a line', () => {
    const redactor = new decibel_line_redactor_v1([]);
    expect(redactor.push('x'.repeat(DECIBEL_LINE_REDACTOR_MAX_PENDING_V1 + 1))).toHaveLength(
      DECIBEL_LINE_REDACTOR_MAX_PENDING_V1 + 1,
    );
    expect(redactor.flush()).toBe('');
  });

  it('patches console once and redacts object arguments', () => {
    const captured: string[] = [];
    const originalError = console.error;
    console.error = (...values: unknown[]) => {
      captured.push(values.map(String).join(' '));
    };
    try {
      expect(installDecibelConsoleRedactionV1([FAKE_PRIVATE_KEY])).toBe(true);
      expect(installDecibelConsoleRedactionV1([FAKE_PRIVATE_KEY])).toBe(false);
      console.error('Error placing order:', { overrides: { API_KEY: FAKE_NODE_KEY } });
      expect(captured.join('\n')).not.toContain('aptoslabs_');
      expect(captured.join('\n')).toContain('[REDACTED]');
    } finally {
      console.error = originalError;
    }
  });
});
