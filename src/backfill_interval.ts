import { z } from 'zod';

const BackfillIntervalSchema = z.enum(['1m', '5m']);

export function parseBackfillInterval(
  arguments_: readonly string[],
  configuredInterval = '5m',
): '1m' | '5m' {
  const argument = arguments_.find((value) => value.startsWith('--interval='));
  const separatedIndex = arguments_.indexOf('--interval');
  const selected =
    argument?.slice('--interval='.length) ??
    (separatedIndex >= 0 ? arguments_[separatedIndex + 1] : undefined) ??
    configuredInterval;
  const parsed = BackfillIntervalSchema.safeParse(selected);
  if (!parsed.success)
    throw new Error(`Unsupported backfill interval: ${selected}. Allowed: 1m, 5m`);
  return parsed.data;
}
