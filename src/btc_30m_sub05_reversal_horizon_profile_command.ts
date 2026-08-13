import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { buildSub05ReversalHorizonProfileReport } from './btc_30m_sub05_reversal_horizon_profile.js';
import type { price_candle } from './btc_bybit_decibel_overlap_audit.js';

type row = { start_timestamp_ms: number; open: string; high: string; low: string; close: string };

export function runSub05ReversalHorizonProfileCommand() {
  const started = Date.now(),
    root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    audit = JSON.parse(
      readFileSync(
        path.join(root, 'data', 'btc_price_action', 'btc_bybit_decibel_overlap_audit_v1.json'),
        'utf8',
      ),
    ) as { sourceRanges?: { decibel?: { firstTimestamp?: unknown } } },
    boundary = audit.sourceRanges?.decibel?.firstTimestamp;
  if (typeof boundary !== 'number') throw new Error('SUB05_HORIZON_BOUNDARY_INVALID');

  console.log('Loading pre-Decibel Bybit 1m data...');
  const database = new Database(path.join(root, 'data', 'bybit_btcusdt_perp_1m.sqlite'), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const candles = database
        .prepare<[], row>(
          'SELECT start_timestamp_ms,open,high,low,close FROM candles WHERE start_timestamp_ms<? ORDER BY start_timestamp_ms',
        )
        .all(boundary)
        .map<price_candle>((value) => ({
          timestamp: value.start_timestamp_ms,
          open: Number(value.open),
          high: Number(value.high),
          low: Number(value.low),
          close: Number(value.close),
        })),
      report = buildSub05ReversalHorizonProfileReport({
        candles,
        externalValidationStartTimestamp: boundary,
        onProgress: (progress) =>
          console.log('PROGRESS', {
            ...progress,
            elapsedSeconds: (Date.now() - started) / 1000,
          }),
      }),
      directory = path.join(root, 'data', 'btc_price_action'),
      output = path.join(directory, 'btc_30m_sub05_reversal_horizon_profile_v1.json');
    mkdirSync(directory, { recursive: true });
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);

    console.log('=== BTC 30M SUB05 REVERSAL HORIZON PROFILE V1 ===');
    console.log('DATA', report.dataRange);
    console.log('OVERALL', report.overall);
    console.log('DISCOVERY EDGE DECAY', report.discovery.edgeDecay);
    console.log('HOLDOUT EDGE DECAY', report.holdout.edgeDecay);
    console.log('Classification', report.classification);
    console.log('PERFORMANCE', report.performance);
    console.log('Report', output);
  } finally {
    database.close();
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    runSub05ReversalHorizonProfileCommand();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unknown horizon profile failure');
    process.exitCode = 1;
  }
}
