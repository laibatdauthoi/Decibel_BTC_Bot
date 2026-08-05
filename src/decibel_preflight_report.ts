import { z } from 'zod';
import { loadConfig } from './config.js';
import type { BTC_market_metadata, BTC_market_price } from './decibel_client.js';
import { normalizePaperBotConfiguration } from './paper_bot.js';
import { buildPaperSoakReport } from './paper_soak_report.js';

const OptionalValue = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);
const PreflightSchema = z.object({
  DECIBEL_NETWORK: z.enum(['mainnet', 'testnet']).optional(),
  DECIBEL_NODE_API_KEY: OptionalValue,
  DECIBEL_WALLET_ADDRESS: OptionalValue,
  MARKET_SYMBOL: z.literal('BTC/USD').optional(),
  CANDLE_INTERVAL: z.literal('5m').optional(),
  LIVE_TRADING_ENABLED: z.enum(['true', 'false']).default('false'),
  LIVE_TRADING_KILL_SWITCH_ENABLED: z.enum(['true', 'false']).default('true'),
});

export type decibel_preflight_verdict =
  | 'NOT_READY_INSUFFICIENT_PAPER_EVIDENCE'
  | 'NOT_READY_CONFIG_MISSING'
  | 'NOT_READY_SAFETY_GATES_FAILED'
  | 'READY_FOR_MANUAL_LIVE_REVIEW';

type soak_summary = {
  liveSafety: { valid: boolean; liveRiskIntentCount: number; liveOrderCount: number };
  readiness: { verdict: string };
  evidence: { modernEvaluationCount: number; minimumModernEvaluations: number };
  microstructure: unknown;
};
export type preflight_probe = (config: ReturnType<typeof loadConfig>) => Promise<{
  market: BTC_market_metadata;
  price: BTC_market_price;
}>;

function isPublicAddress(value: string | undefined): boolean {
  return value !== undefined && /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function classifyDecibelPreflight(input: {
  missingConfiguration: readonly string[];
  safetyFailures: readonly string[];
  soakVerdict: string;
}): decibel_preflight_verdict {
  if (input.safetyFailures.length > 0) return 'NOT_READY_SAFETY_GATES_FAILED';
  if (input.missingConfiguration.length > 0) return 'NOT_READY_CONFIG_MISSING';
  if (input.soakVerdict !== 'PAPER_RUNTIME_HEALTHY_COLLECT_MORE')
    return input.soakVerdict === 'INSUFFICIENT_EVIDENCE'
      ? 'NOT_READY_INSUFFICIENT_PAPER_EVIDENCE'
      : 'NOT_READY_SAFETY_GATES_FAILED';
  return 'READY_FOR_MANUAL_LIVE_REVIEW';
}

export async function buildDecibelPreflightReport(input: {
  environment: Record<string, string | undefined>;
  paperDatabasePath: string;
  candleDatabasePath: string;
  microstructureDatabasePath: string;
  probe: preflight_probe;
  soakReport?: soak_summary;
}) {
  const parsed = PreflightSchema.safeParse(input.environment);
  const raw = parsed.success ? parsed.data : null;
  const paperConfig = normalizePaperBotConfiguration(input.environment);
  const missingConfiguration: string[] = [];
  if (raw?.DECIBEL_NETWORK === undefined) missingConfiguration.push('DECIBEL_NETWORK_MISSING');
  if (raw?.DECIBEL_NODE_API_KEY === undefined)
    missingConfiguration.push('DECIBEL_NODE_API_KEY_MISSING');
  if (!isPublicAddress(raw?.DECIBEL_WALLET_ADDRESS))
    missingConfiguration.push(
      raw?.DECIBEL_WALLET_ADDRESS === undefined
        ? 'DECIBEL_WALLET_ADDRESS_MISSING'
        : 'DECIBEL_WALLET_ADDRESS_INVALID',
    );
  if (raw?.MARKET_SYMBOL !== 'BTC/USD')
    missingConfiguration.push('MARKET_SYMBOL_MISSING_OR_INVALID');
  if (raw?.CANDLE_INTERVAL !== '5m')
    missingConfiguration.push('CANDLE_INTERVAL_MISSING_OR_INVALID');
  if (!parsed.success) missingConfiguration.push('DECIBEL_PREFLIGHT_CONFIG_INVALID');

  const liveExecutionEnabled = raw?.LIVE_TRADING_ENABLED === 'true';
  const killSwitchEnabled = raw?.LIVE_TRADING_KILL_SWITCH_ENABLED !== 'false';
  const safetyFailures: string[] = [];
  if (liveExecutionEnabled) safetyFailures.push('LIVE_EXECUTION_MUST_REMAIN_DISABLED');
  if (!killSwitchEnabled) safetyFailures.push('LIVE_TRADING_KILL_SWITCH_NOT_ENGAGED');

  let connectivity: { status: 'PASS' | 'FAIL' | 'NOT_ATTEMPTED'; errorCode: string | null } = {
    status: 'NOT_ATTEMPTED',
    errorCode: null,
  };
  let market: BTC_market_metadata | null = null;
  let price: BTC_market_price | null = null;
  if (parsed.success && parsed.data.DECIBEL_NETWORK !== undefined) {
    try {
      const config = loadConfig(input.environment);
      const result = await input.probe(config);
      market = result.market;
      price = result.price;
      connectivity = { status: 'PASS', errorCode: null };
      if (market.symbol !== 'BTC/USD') missingConfiguration.push('BTC_USD_MARKET_NOT_RESOLVED');
      if (market.mode !== 'Open') safetyFailures.push(`MARKET_MODE_${market.mode.toUpperCase()}`);
    } catch {
      connectivity = { status: 'FAIL', errorCode: 'DECIBEL_READ_CONNECTIVITY_FAILED' };
      missingConfiguration.push('DECIBEL_READ_CONNECTIVITY_FAILED');
    }
  }
  const soak =
    input.soakReport ??
    buildPaperSoakReport({
      paperDatabasePath: input.paperDatabasePath,
      candleDatabasePath: input.candleDatabasePath,
      microstructureDatabasePath: input.microstructureDatabasePath,
      mode: paperConfig.mode,
      environment: input.environment,
    });
  if (!soak.liveSafety.valid) safetyFailures.push('LIVE_LEDGER_SAFETY_INVARIANT_FAILED');
  if (soak.readiness.verdict === 'PAPER_RUNTIME_HAS_ISSUES')
    safetyFailures.push('PAPER_SOAK_HAS_ISSUES');
  const uniqueMissing = [...new Set(missingConfiguration)],
    uniqueSafety = [...new Set(safetyFailures)];
  const verdict = classifyDecibelPreflight({
    missingConfiguration: uniqueMissing,
    safetyFailures: uniqueSafety,
    soakVerdict: soak.readiness.verdict,
  });
  return {
    reportVersion: 'DECIBEL_LIVE_PREFLIGHT_V1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    currentBotMode: paperConfig.mode,
    liveExecutionEnabled,
    executionAdapter: { wired: false, capability: 'UNAVAILABLE_IN_THIS_BUILD' },
    configuration: {
      networkConfigured: raw?.DECIBEL_NETWORK !== undefined,
      nodeApiKeyPresent: raw?.DECIBEL_NODE_API_KEY !== undefined,
      marketSymbolConfigured: raw?.MARKET_SYMBOL === 'BTC/USD',
      candleIntervalConfigured: raw?.CANDLE_INTERVAL === '5m',
      missing: uniqueMissing,
    },
    connectivity,
    market:
      market === null
        ? null
        : {
            symbol: market.symbol,
            exchangeSymbol: market.exchangeSymbol,
            marketAddress: market.marketAddress,
            mode: market.mode,
            tickSize: market.tickSize,
            lotSize: market.lotSize,
            minimumSize: market.minimumSize,
            maximumLeverage: market.maximumLeverage,
            markPrice: price?.markPrice ?? null,
            observedAt: price?.observedAt.toISOString() ?? null,
          },
    wallet: {
      publicAddressPresent: raw?.DECIBEL_WALLET_ADDRESS !== undefined,
      publicAddressValid: isPublicAddress(raw?.DECIBEL_WALLET_ADDRESS),
      privateKeyLoaded: false,
    },
    safety: {
      killSwitchEnabled,
      liveExecutionDisabled: !liveExecutionEnabled,
      failures: uniqueSafety,
      maxPositionSize: paperConfig.paperRiskPolicy.maxPositionSize,
      maxNotionalExposure: paperConfig.paperRiskPolicy.maxNotionalExposure,
      maxTradeNotional: paperConfig.paperRiskPolicy.maxTradeNotional,
    },
    paperEvidence: {
      verdict: soak.readiness.verdict,
      modernEvaluationCount: soak.evidence.modernEvaluationCount,
      minimumModernEvaluations: soak.evidence.minimumModernEvaluations,
    },
    microstructureReadiness: soak.microstructure,
    liveSafety: soak.liveSafety,
    finalVerdict: verdict,
    manualReviewOnly: true,
  };
}
