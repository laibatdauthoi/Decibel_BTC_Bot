export const RUNTIME_TERMINAL_BUFFER_LIMIT_V1 = 300;

export type runtime_terminal_line_v1 = Readonly<{
  id: string;
  timestamp: number;
  level: 'INFO' | 'WARN' | 'ERROR';
  source: 'SYSTEM' | 'STRATEGY' | 'EXEC' | 'VENUE' | 'RECON' | 'RISK' | 'FILL';
  message: string;
  count: number;
}>;

export type runtime_terminal_input_v1 = Readonly<{
  connected: boolean;
  degraded: boolean;
  generatedAt: number;
  events: readonly Readonly<{
    timestamp: number;
    severity: string;
    category: string;
    eventType: string;
    description: string;
  }>[];
  intents: readonly Readonly<{
    timestamp: number;
    intentId: string;
    action: string;
    side: string;
    price: number | null;
    quantity: number | null;
    status: string;
    blocker: string | null;
    reconciliationResult: string | null;
  }>[];
  fills: readonly Readonly<{
    timestamp: number;
    fillId: string;
    side: string;
    quantity: number;
    price: number;
    maker: boolean;
  }>[];
  blockers: readonly Readonly<{
    code: string;
    meaning: string;
    firstObservedAt: number;
    lastObservedAt: number;
  }>[];
}>;

const secretPattern =
  /\b(private[_ -]?key|mnemonic|api[_ -]?(?:key|token)|authorization|cookie|secret|access[_ -]?token|refresh[_ -]?token)\b\s*[:=]\s*(?:bearer\s+)?[^\s,;]+/gi;
const bearerPattern = /\bbearer\s+[a-z0-9._~+/-]+=*/gi;

export function sanitizeTerminalTextV1(value: string): string {
  return value.replace(secretPattern, '$1=[REDACTED]').replace(bearerPattern, 'Bearer [REDACTED]');
}

function mapLevel(value: string): runtime_terminal_line_v1['level'] {
  const normalized = value.toUpperCase();
  if (/ERROR|FATAL|BLOCK/.test(normalized)) return 'ERROR';
  if (/WARN|STALE|UNKNOWN|RECONCIL|HOLD|REJECT/.test(normalized)) return 'WARN';
  return 'INFO';
}

function mapSource(value: string): runtime_terminal_line_v1['source'] {
  const normalized = value.toUpperCase();
  if (/FILL/.test(normalized)) return 'FILL';
  if (/RECON/.test(normalized)) return 'RECON';
  if (/RISK|BLOCK|PREFLIGHT|LIMIT|BUDGET/.test(normalized)) return 'RISK';
  if (/VENUE|ORDER|TRANSACTION/.test(normalized)) return 'VENUE';
  if (/EXEC|PLACE|CANCEL|SUBMIT|APPLIED|ACKNOWLEDGED/.test(normalized)) return 'EXEC';
  if (/STRATEGY|QUOTE|HOLD|NO_OP/.test(normalized)) return 'STRATEGY';
  return 'SYSTEM';
}

function formatTradeDetails(side: string, quantity: number | null, price: number | null): string {
  const quantityText = quantity === null ? '' : ` ${quantity.toFixed(8)}`;
  const priceText =
    price === null
      ? ''
      : ` @ ${price.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
  return `${side}${quantityText}${priceText}`.trim();
}

function canCoalesce(line: runtime_terminal_line_v1): boolean {
  if (line.level !== 'INFO') return false;
  return line.source === 'SYSTEM' || line.source === 'STRATEGY';
}

export function buildRuntimeTerminalLinesV1(
  input: runtime_terminal_input_v1,
  limit = RUNTIME_TERMINAL_BUFFER_LIMIT_V1,
): readonly runtime_terminal_line_v1[] {
  const lines: runtime_terminal_line_v1[] = [];
  lines.push({
    id: `connection-${input.generatedAt}`,
    timestamp: input.generatedAt,
    level: input.connected && !input.degraded ? 'INFO' : 'WARN',
    source: 'SYSTEM',
    message: input.connected
      ? input.degraded
        ? 'TELEMETRY DEGRADED'
        : 'STATE SOURCE CONNECTED'
      : 'SSE DISCONNECTED',
    count: 1,
  });
  for (const event of input.events) {
    const combined = `${event.eventType} ${event.description}`;
    lines.push({
      id: `event-${event.timestamp}-${event.eventType}-${event.description}`,
      timestamp: event.timestamp,
      level: mapLevel(`${event.severity} ${combined}`),
      source: mapSource(`${event.category} ${combined}`),
      message: sanitizeTerminalTextV1(combined),
      count: 1,
    });
  }
  for (const intent of input.intents) {
    const state = intent.reconciliationResult ?? intent.blocker ?? intent.status;
    lines.push({
      id: `intent-${intent.intentId}-${intent.timestamp}-${state}`,
      timestamp: intent.timestamp,
      level: mapLevel(state),
      source: mapSource(`${intent.action} ${state}`),
      message: sanitizeTerminalTextV1(
        `${intent.action} ${formatTradeDetails(intent.side, intent.quantity, intent.price)} ${state}`,
      ),
      count: 1,
    });
  }
  for (const fill of input.fills) {
    lines.push({
      id: `fill-${fill.fillId}`,
      timestamp: fill.timestamp,
      level: 'INFO',
      source: 'FILL',
      message: `${fill.maker ? 'MAKER' : 'TAKER'} ${formatTradeDetails(fill.side, fill.quantity, fill.price)}`,
      count: 1,
    });
  }
  for (const blocker of input.blockers) {
    lines.push({
      id: `blocker-${blocker.code}-${blocker.lastObservedAt}`,
      timestamp: blocker.lastObservedAt,
      level: 'ERROR',
      source: 'RISK',
      message: sanitizeTerminalTextV1(`${blocker.meaning} / ${blocker.code}`),
      count: 1,
    });
  }
  lines.sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id));
  const coalesced: runtime_terminal_line_v1[] = [];
  for (const line of lines) {
    const previous = coalesced.at(-1);
    if (
      previous !== undefined &&
      canCoalesce(line) &&
      previous.level === line.level &&
      previous.source === line.source &&
      previous.message === line.message
    ) {
      coalesced[coalesced.length - 1] = {
        ...line,
        id: previous.id,
        count: previous.count + 1,
      };
    } else {
      coalesced.push(line);
    }
  }
  return Object.freeze(coalesced.slice(-Math.max(1, limit)).map((line) => Object.freeze(line)));
}

export function shouldAutoFollowRuntimeTerminalV1(distanceFromBottom: number): boolean {
  return distanceFromBottom <= 24;
}
