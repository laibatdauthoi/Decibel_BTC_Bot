import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildDecibelMcpMainnetShadowReadinessV1,
  DecibelBTCMarketAddressV1,
  DecibelBTCResyncCheckpointHashV1,
  DecibelDELLMarketAddressV1,
  DecibelMcpCapabilityHashV1,
} from '../src/decibel_mcp_mainnet_shadow_readiness_v1.js';
import { freezeDecibelMcpMainnetShadowReadinessV1 } from '../src/run_decibel_mcp_mainnet_shadow_readiness_v1.js';
import { stringifyCanonicalJsonV1 } from '../src/decibel_shadow_reprice_policy_experiment_v1.js';

const paths = {
  capability: 'research/decibel_mcp_mainnet_capabilities_v1.json',
  checkpoint: 'research/decibel_authenticated_btc_resync_checkpoint_v1.json',
  repriceExperiment: 'research/decibel_shadow_reprice_policy_experiment_v1.json',
  asymmetricExperiment: 'research/decibel_shadow_asymmetric_reprice_experiment_v1.json',
  firstSummary: 'data/decibel_mcp_mainnet_continuous_shadow_summary_v1_shadow-1788375045835.json',
  finalSummary: 'data/decibel_mcp_mainnet_continuous_shadow_summary_v1_shadow-1788404822466.json',
  firstJsonl: 'data/decibel_mcp_mainnet_continuous_shadow_v1_shadow-1788375045835.jsonl',
  finalJsonl: 'data/decibel_mcp_mainnet_continuous_shadow_v1_shadow-1788404822466.jsonl',
} as const;

describe('DECIBEL MCP MAINNET SHADOW READINESS FREEZE V1', () => {
  const manifest = buildDecibelMcpMainnetShadowReadinessV1(paths);

  it('requires exact MCP capability and checkpoint evidence', () => {
    expect(manifest.mcpCapability).toMatchObject({
      serverName: 'decibel-cli',
      serverVersion: '1.0.0',
      protocolVersion: '2025-03-26',
      capabilityHash: DecibelMcpCapabilityHashV1,
    });
    expect(manifest.btcResyncCheckpoint.checkpointBodyHashSha256).toBe(
      DecibelBTCResyncCheckpointHashV1,
    );
  });

  it('freezes exact BTC identity without treating DELL as BTC', () => {
    expect(manifest.marketIdentity).toEqual({
      btcUsdMarketAddress: DecibelBTCMarketAddressV1,
      dellUsdMarketAddress: DecibelDELLMarketAddressV1,
      dellTreatedAsBtc: false,
    });
    expect(DecibelBTCMarketAddressV1).not.toBe(DecibelDELLMarketAddressV1);
  });

  it('selects BEHIND_5_TICKS and preserves its historical proof', () => {
    expect(manifest.selectedRepricePolicy).toBe('BEHIND_5_TICKS');
    expect(manifest.historicalReplayEvidence).toMatchObject({
      initialPlacements: 1,
      replacements: 359,
      p95DeviationTicks: 2,
      maxDeviationTicks: 4,
      delayedCrossingStates: 0,
      delayedInsideSpreadStates: 0,
      profitabilityClaimed: false,
      fillRateInferred: false,
    });
  });

  it('preserves the unrecoverable first-soak read failure', () => {
    expect(manifest.liveShadowSessions[0]).toMatchObject({
      sessionId: 'shadow-1788375045835',
      successfulEvaluations: 890,
      readFailureCount: 1,
      readFailureCause: 'CAUSE_UNRECOVERABLE_FROM_HISTORICAL_LOGGING',
    });
  });

  it('freezes 886 of 886 final attempts with zero read failures', () => {
    expect(manifest.liveShadowSessions[1]).toMatchObject({
      sessionId: 'shadow-1788404822466',
      evaluationAttempts: 886,
      successfulEvaluations: 886,
      readFailureCount: 0,
      maxConsecutiveReadFailures: 0,
      p95DeviationTicks: 2,
      maxDeviationTicks: 4,
      mainnetShadowRuntimeReady: true,
    });
  });

  it('requires zero mutations and never claims autonomous execution readiness', () => {
    expect(manifest.safetyBoundary).toMatchObject({
      autonomousMainnetMutationProven: false,
      liveExecutionEnabled: false,
      mcpMutationEnabled: false,
      venueMutationEnabled: false,
      externalCounterpartyRequired: true,
      selfTradePermitted: false,
    });
    expect(JSON.stringify(manifest)).not.toContain('LIVE_TRADING_READY');
    expect(JSON.stringify(manifest)).not.toContain('PRODUCTION_EXECUTION_READY');
    expect(JSON.stringify(manifest)).not.toContain('AUTONOMOUS_MAINNET_EXECUTION_READY');
  });

  it('hashes every immutable source deterministically', () => {
    expect(Object.keys(manifest.sourceArtifactHashes)).toHaveLength(8);
    for (const evidence of Object.values(manifest.sourceArtifactHashes))
      expect(evidence.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(buildDecibelMcpMainnetShadowReadinessV1(paths).sourceArtifactHashes).toEqual(
      manifest.sourceArtifactHashes,
    );
  });

  it('produces a deterministic manifest hash and canonical representation', () => {
    const again = buildDecibelMcpMainnetShadowReadinessV1(paths);
    expect(again.manifestBodyHashSha256).toBe(manifest.manifestBodyHashSha256);
    expect(stringifyCanonicalJsonV1(again)).toBe(stringifyCanonicalJsonV1(manifest));
  });

  it('freezes idempotently and never overwrites conflict', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'shadow-readiness-')), 'manifest.json');
    const contents = stringifyCanonicalJsonV1(manifest);
    expect(freezeDecibelMcpMainnetShadowReadinessV1(path, contents)).toBe('FROZEN');
    expect(freezeDecibelMcpMainnetShadowReadinessV1(path, contents)).toBe('ALREADY_FROZEN');
    expect(() => freezeDecibelMcpMainnetShadowReadinessV1(path, '{}\n')).toThrow(
      'MCP_MAINNET_SHADOW_READINESS_MANIFEST_CONFLICT',
    );
    expect(readFileSync(path, 'utf8')).toBe(contents);
  });

  it('uses only evidence files and contains no MCP invocation', () => {
    const source = readFileSync('src/decibel_mcp_mainnet_shadow_readiness_v1.ts', 'utf8');
    expect(source).not.toContain('callTool');
    expect(source).not.toContain('place_limit_order');
    expect(source).not.toContain('cancel_order');
    expect(manifest.trustLabel).toBe('DECIBEL_MCP_MAINNET_SHADOW_READY');
  });
});
