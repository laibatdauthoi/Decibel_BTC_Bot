/**
 * Terminal view of the runtime's stdout (added 2026-11-18). The runtime prints machine-oriented
 * lines: a CONTROL_LOOP diagnostic of up to ~10,000 characters per cycle and per-cycle
 * telemetry. The launcher keeps every line, unchanged, in production_runtime/stdout.log and
 * shows the operator a compact, timestamped version here. DECIBEL_TERMINAL_VERBOSE=true prints
 * the raw lines instead.
 */

/** Longest line shown in the terminal; the full line stays in stdout.log. */
export const DECIBEL_TERMINAL_MAX_LINE_V1 = 220;

function readField(line: string, key: string): string | null {
  const match = new RegExp(`(?:^| )${key}=(\\S*)`).exec(line);
  if (!match) return null;
  const value = match[1] ?? '';
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

function truncate(text: string): string {
  return text.length <= DECIBEL_TERMINAL_MAX_LINE_V1
    ? text
    : `${text.slice(0, DECIBEL_TERMINAL_MAX_LINE_V1 - 2)} …`;
}

function formatControlLoop(line: string): string {
  const parts: string[] = [
    `LOOP ${readField(line, 'CONTROL_LOOP') ?? '?'}`,
    `${readField(line, 'TRADING_STATE') ?? '?'}: ${readField(line, 'TRADING_REASON') ?? '?'}`,
  ];
  const position = readField(line, 'POSITION_QTY');
  if (position !== null && position !== 'UNKNOWN') parts.push(`POS ${position}`);
  const uncovered = readField(line, 'UNCOVERED_INVENTORY_QTY');
  if (uncovered !== null && uncovered !== 'UNKNOWN' && Number(uncovered) !== 0)
    parts.push(`UNCOVERED ${uncovered}`);
  const tp = readField(line, 'TP_RESTING_PRICE');
  if (tp !== null && tp !== 'UNKNOWN' && tp !== 'null') parts.push(`TP ${tp}`);
  const outcome = readField(line, 'FINAL_EXECUTOR_OUTCOME');
  if (outcome !== null && !['UNKNOWN', 'null', 'NONE'].includes(outcome))
    parts.push(`EXEC ${outcome}`);
  return parts.join(' | ');
}

function formatSessionControl(line: string): string {
  const parts = [
    `SESSION ${readField(line, 'SESSION_CONTROL_STATE') ?? '?'}`,
    `LOOP ${readField(line, 'EXECUTION_LOOP') ?? '?'}`,
  ];
  for (const key of ['BLOCKER', 'READINESS_BLOCKER', 'LAST_START_BLOCKER']) {
    const value = readField(line, key);
    if (value !== null && value !== 'NONE' && !parts.some((part) => part.endsWith(` ${value}`)))
      parts.push(`${key} ${value}`);
  }
  return parts.join(' | ');
}

function formatJsonEvent(line: string): string | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.event !== 'string') return null;
  // Per-order stage traces: only the outcome of each submission or cancel reaches the terminal.
  if (
    record.event.endsWith('_STAGE') &&
    !(typeof record.stage === 'string' && OUTCOME_STAGE.test(record.stage))
  )
    return '';
  if (record.event === 'DECIBEL_EXECUTION_GAS_PAYER_DIAGNOSTIC') return '';
  const details = Object.entries(record)
    .filter(
      ([key, field]) =>
        key !== 'event' &&
        !/(?:Id|At|Address)$/.test(key) &&
        (typeof field === 'string' || typeof field === 'number' || typeof field === 'boolean') &&
        String(field).length <= 40,
    )
    .map(([key, field]) => `${key}=${String(field)}`);
  return [record.event.replace(/^DECIBEL_/, ''), ...details].join(' ');
}

const OUTCOME_STAGE = /COMPLETE|FAIL|ERROR|REJECT|TIMEOUT|ABORT/;

/** Healthy per-cycle telemetry: kept in stdout.log only. */
function isRoutineTelemetry(line: string): boolean {
  if (line.startsWith('DECIBEL_PRODUCTION_EVENT_LOOP_LAG_MS ')) return true;
  if (line.startsWith('DECIBEL_PRODUCTION_ECONOMIC_REFRESH=PASS ')) return true;
  return (
    line.startsWith('DECIBEL_PRODUCTION_MARKET_PIPELINE ') &&
    line.includes('"wsConnectionState":"CONNECTED"') &&
    line.includes('"wsSubscriptionState":"SUBSCRIBED"')
  );
}

/** One runtime stdout line as shown in the terminal, or null to keep it out of the terminal. */
export function formatDecibelTerminalLineV1(line: string, now: Date = new Date()): string | null {
  const text = line.replace(/\r$/, '');
  if (text.trim() === '' || isRoutineTelemetry(text)) return null;
  const body =
    text.startsWith('PROCESS_ID=') && text.includes(' CONTROL_LOOP=')
      ? formatControlLoop(text)
      : text.startsWith('PROCESS_ID=') && text.includes(' SESSION_CONTROL_STATE=')
        ? formatSessionControl(text)
        : text.startsWith('{')
          ? (formatJsonEvent(text) ?? text)
          : text;
  if (body === '') return null;
  const clock = now.toTimeString().slice(0, 8);
  return `${clock} ${truncate(body)}`;
}

/**
 * Splits streamed stdout text into lines and formats each one; a trailing partial line waits
 * for the next chunk.
 */
export class decibel_terminal_line_formatter_v1 {
  private Pending = '';

  public constructor(private readonly Verbose: boolean) {}

  public push(text: string): string {
    if (this.Verbose) return text;
    const lines = (this.Pending + text).split('\n');
    this.Pending = lines.pop() ?? '';
    return this.render(lines);
  }

  public flush(): string {
    if (this.Verbose || this.Pending === '') return '';
    const rest = this.Pending;
    this.Pending = '';
    return this.render([rest]);
  }

  private render(lines: readonly string[]): string {
    return lines
      .map((line) => formatDecibelTerminalLineV1(line))
      .filter((line): line is string => line !== null)
      .map((line) => `${line}\n`)
      .join('');
  }
}
