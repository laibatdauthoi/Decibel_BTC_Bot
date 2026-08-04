import pino, { type DestinationStream, type Logger } from 'pino';
import { z } from 'zod';

export type log_format = 'pretty' | 'json';

const LogRecordSchema = z.record(z.unknown());
const omittedPrettyFields = new Set(['level', 'time', 'msg']);

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function formatPrettyLog(line: string): string {
  const record = LogRecordSchema.parse(JSON.parse(line) as unknown);
  const timestamp = typeof record.time === 'string' ? record.time : '';
  const level = typeof record.level === 'string' ? record.level.toUpperCase() : 'INFO';
  const message = typeof record.msg === 'string' ? record.msg : 'Application event';
  const details = Object.entries(record)
    .filter(([key]) => !omittedPrettyFields.has(key))
    .map(([key, value]) => `  ${key}: ${formatValue(value)}`);
  return [`[${timestamp}] ${level} ${message}`, ...details].join('\n') + '\n';
}

function createPrettyDestination(destination: DestinationStream): DestinationStream {
  return {
    write(line: string): void {
      destination.write(formatPrettyLog(line));
    },
  };
}

export function createLogger(
  format: log_format,
  destination: DestinationStream = process.stdout,
): Logger {
  const output = format === 'pretty' ? createPrettyDestination(destination) : destination;
  return pino(
    {
      base: null,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      redact: {
        paths: ['nodeApiKey', 'DECIBEL_NODE_API_KEY', 'apiKey', 'credentials', 'privateKey'],
        censor: '[REDACTED]',
      },
    },
    output,
  );
}
