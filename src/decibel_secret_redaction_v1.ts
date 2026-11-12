import { StringDecoder } from 'node:string_decoder';
import { inspect } from 'node:util';

/**
 * Secret redaction for process output. The Decibel/Aptos SDKs log failed requests
 * themselves, including the node API key in request overrides, so production output
 * is redacted both in-process (console) and in the launcher (child stdout/stderr).
 */
export const DECIBEL_REDACTED_V1 = '[REDACTED]';
export const DECIBEL_LINE_REDACTOR_MAX_PENDING_V1 = 65_536;
const MINIMUM_SECRET_LENGTH = 8;
const SECRET_NAME_PATTERN = /(PRIVATE_KEY|API_KEY|SECRET|TOKEN|PASSWORD)/;
const APTOS_LABS_KEY_PATTERN = /aptoslabs_[A-Za-z0-9_-]+/g;

/** Values of environment variables whose names mark them as secrets. */
export function collectDecibelSecretValuesV1(
  environment: Readonly<Record<string, string | undefined>>,
): readonly string[] {
  const values = new Set<string>();
  for (const [name, value] of Object.entries(environment)) {
    const trimmed = value?.trim();
    if (!trimmed || trimmed.length < MINIMUM_SECRET_LENGTH) continue;
    if (!SECRET_NAME_PATTERN.test(name.toUpperCase())) continue;
    values.add(trimmed);
    // Hex keys are often written with and without the 0x prefix.
    if (/^0x[0-9a-f]+$/i.test(trimmed)) values.add(trimmed.slice(2));
  }
  // Longest first, so a secret that contains another is removed whole.
  return Object.freeze([...values].sort((a, b) => b.length - a.length));
}

export function redactDecibelSecretsV1(text: string, secrets: readonly string[]): string {
  let result = text;
  for (const secret of secrets)
    if (secret.length >= MINIMUM_SECRET_LENGTH)
      result = result.split(secret).join(DECIBEL_REDACTED_V1);
  return result.replace(APTOS_LABS_KEY_PATTERN, DECIBEL_REDACTED_V1);
}

const INSTALLED = Symbol.for('decibel.console.redaction.v1');

/** Patches console methods once per process; later calls are no-ops. */
export function installDecibelConsoleRedactionV1(secrets: readonly string[]): boolean {
  const target = console as Console & { [INSTALLED]?: true };
  if (target[INSTALLED]) return false;
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const original = console[method].bind(console);
    console[method] = (...values: unknown[]) =>
      original(
        ...values.map((value) =>
          redactDecibelSecretsV1(
            typeof value === 'string' ? value : inspect(value, { depth: 6, breakLength: 160 }),
            secrets,
          ),
        ),
      );
  }
  target[INSTALLED] = true;
  return true;
}

/**
 * Line-buffered redaction for piped child output. A secret split across two chunks is
 * still removed because only complete lines are emitted; `flush` emits the remainder.
 */
export class decibel_line_redactor_v1 {
  private readonly Decoder = new StringDecoder('utf8');
  private pending = '';

  public constructor(private readonly secrets: readonly string[]) {}

  public push(chunk: Buffer | string): string {
    this.pending += typeof chunk === 'string' ? chunk : this.Decoder.write(chunk);
    const lastNewline = this.pending.lastIndexOf('\n');
    if (lastNewline < 0) {
      // Bound memory for output that never ends a line.
      if (this.pending.length <= DECIBEL_LINE_REDACTOR_MAX_PENDING_V1) return '';
      const overflow = this.pending;
      this.pending = '';
      return redactDecibelSecretsV1(overflow, this.secrets);
    }
    const complete = this.pending.slice(0, lastNewline + 1);
    this.pending = this.pending.slice(lastNewline + 1);
    return redactDecibelSecretsV1(complete, this.secrets);
  }

  public flush(): string {
    const rest = this.pending + this.Decoder.end();
    this.pending = '';
    return rest === '' ? '' : redactDecibelSecretsV1(rest, this.secrets);
  }
}
