import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { sha256CanonicalJsonV1 } from './decibel_shadow_reprice_policy_experiment_v1.js';

export const DecibelMcpCapabilityHashV1 =
  '65a089c6cfeca5d7066a7e26b81a25a57fd49ce2d024d04e8ca884b4f69df5b0';
export const DecibelBTCResyncCheckpointHashV1 =
  'e69d23751f85dbfab33a41c4a8827364f8cf323ffff840f77c29647b515d4086';
export const DecibelBTCMarketAddressV1 =
  '0x5e0e16f34adfb4b316f8d532d68acbfa206826feaaa418d3938046bdc2044861';
export const DecibelDELLMarketAddressV1 =
  '0xc14841a32ba6869dbadf72bb8a86fa5d9fc5538bb8e48fab679b7068f6b9d6f9';

export type shadow_readiness_evidence_paths_v1 = Readonly<{
  capability: string;
  checkpoint: string;
  repriceExperiment: string;
  asymmetricExperiment: string;
  firstSummary: string;
  finalSummary: string;
  firstJsonl?: string;
  finalJsonl?: string;
}>;

const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
const sha256File = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const requireValue = (condition: boolean, blocker: string) => {
  if (!condition) throw new Error(blocker);
};

export function buildDecibelMcpMainnetShadowReadinessV1(paths: shadow_readiness_evidence_paths_v1) {
  const capability = readJson(paths.capability);
  const checkpoint = readJson(paths.checkpoint);
  const reprice = readJson(paths.repriceExperiment);
  const asymmetric = readJson(paths.asymmetricExperiment);
  const first = readJson(paths.firstSummary);
  const final = readJson(paths.finalSummary);
  requireValue(
    capability.capabilityHash === DecibelMcpCapabilityHashV1,
    'READINESS_CAPABILITY_HASH_MISMATCH',
  );
  requireValue(
    (capability.server as Record<string, unknown>)?.name === 'decibel-cli' &&
      (capability.server as Record<string, unknown>)?.version === '1.0.0',
    'READINESS_MCP_SERVER_MISMATCH',
  );
  requireValue(
    checkpoint.checkpointBodyHashSha256 === DecibelBTCResyncCheckpointHashV1,
    'READINESS_CHECKPOINT_HASH_MISMATCH',
  );
  const behindFive = (asymmetric.policyResults as Array<Record<string, unknown>>).find(
    (value) => value.policy === 'ASYMMETRIC_BEHIND_5_TICKS',
  );
  requireValue(behindFive !== undefined, 'READINESS_BEHIND_FIVE_EVIDENCE_MISSING');
  requireValue(
    reprice.sourceJsonlSha256 === asymmetric.sourceJsonlSha256,
    'READINESS_REPRICE_SOURCE_HASH_MISMATCH',
  );
  requireValue(
    behindFive!.wouldPlaceCount === 1 &&
      behindFive!.wouldReplaceCount === 359 &&
      behindFive!.p95AbsoluteDeviationTicks === 2 &&
      behindFive!.maxAbsoluteDeviationTicks === 4 &&
      behindFive!.crossingStateDelayedCount === 0 &&
      behindFive!.insideSpreadStateDelayedCount === 0,
    'READINESS_HISTORICAL_REPLAY_MISMATCH',
  );
  requireValue(
    first.sessionId === 'shadow-1788375045835' &&
      first.durationMs === 1_801_152 &&
      first.evaluations === 890 &&
      first.blockedEvaluations === 0 &&
      first.readFailureCount === 1,
    'READINESS_FIRST_SOAK_MISMATCH',
  );
  requireValue(
    final.sessionId === 'shadow-1788404822466' &&
      final.durationMs === 1_800_316 &&
      final.evaluationAttempts === 886 &&
      final.successfulEvaluations === 886 &&
      final.readFailureCount === 0 &&
      final.blockedEvaluations === 0 &&
      final.mcpMutationCalls === 0 &&
      final.venueMutations === 0 &&
      final.mainnetShadowRuntimeReady === true,
    'READINESS_FINAL_SOAK_MISMATCH',
  );
  const sourceArtifactHashes = Object.freeze(
    Object.fromEntries(
      Object.entries(paths).map(([name, path]) => [
        name,
        Object.freeze({ path, sha256: sha256File(path) }),
      ]),
    ),
  );
  const body = {
    identity: 'DECIBEL_MCP_MAINNET_SHADOW_READINESS_FREEZE_V1',
    trustLabel: 'DECIBEL_MCP_MAINNET_SHADOW_READY',
    createdFromEvidence: Object.freeze({
      finalEvidenceTimestamp: final.endedAt,
      sourceSessionIds: Object.freeze([first.sessionId, final.sessionId]),
    }),
    marketIdentity: Object.freeze({
      btcUsdMarketAddress: DecibelBTCMarketAddressV1,
      dellUsdMarketAddress: DecibelDELLMarketAddressV1,
      dellTreatedAsBtc: false,
    }),
    mcpCapability: Object.freeze({
      serverName: 'decibel-cli',
      serverVersion: '1.0.0',
      protocolVersion: '2025-03-26',
      capabilityHash: DecibelMcpCapabilityHashV1,
    }),
    btcResyncCheckpoint: Object.freeze({
      checkpointBodyHashSha256: DecibelBTCResyncCheckpointHashV1,
    }),
    selectedRepricePolicy: 'BEHIND_5_TICKS',
    historicalReplayEvidence: Object.freeze({
      initialPlacements: behindFive!.wouldPlaceCount,
      replacements: behindFive!.wouldReplaceCount,
      exactBestCoveragePct: behindFive!.exactBestCoveragePct,
      p95DeviationTicks: behindFive!.p95AbsoluteDeviationTicks,
      maxDeviationTicks: behindFive!.maxAbsoluteDeviationTicks,
      delayedCrossingStates: behindFive!.crossingStateDelayedCount,
      delayedInsideSpreadStates: behindFive!.insideSpreadStateDelayedCount,
      profitabilityClaimed: false,
      fillRateInferred: false,
    }),
    liveShadowSessions: Object.freeze([
      Object.freeze({
        sessionId: first.sessionId,
        durationMs: first.durationMs,
        successfulEvaluations: first.evaluations,
        blockedEvaluations: first.blockedEvaluations,
        readFailureCount: first.readFailureCount,
        readFailureCause: 'CAUSE_UNRECOVERABLE_FROM_HISTORICAL_LOGGING',
        payloadSchemaFailureCount: first.payloadSchemaFailureCount,
        finalBtcPositionBase: first.finalBtcPositionBase,
        finalInventoryState: first.finalInventoryState,
      }),
      Object.freeze({
        sessionId: final.sessionId,
        durationMs: final.durationMs,
        evaluationAttempts: final.evaluationAttempts,
        successfulEvaluations: final.successfulEvaluations,
        readFailureCount: final.readFailureCount,
        blockedEvaluations: final.blockedEvaluations,
        maxConsecutiveReadFailures: final.maxConsecutiveReadFailures,
        wouldPlaceCount: final.wouldPlaceCount,
        wouldReplaceCount: final.wouldReplaceCount,
        holdCount: final.holdCount,
        replacementsPerMinute: final.replacementsPerMinute,
        exactBestCoveragePct: final.exactBestCoveragePct,
        p95DeviationTicks: final.p95DeviationTicks,
        maxDeviationTicks: final.maxDeviationTicks,
        safetyCrossingReplaceCount: final.safetyCrossingReplaceCount,
        safetyInsideSpreadReplaceCount: final.safetyInsideSpreadReplaceCount,
        behindFiveTickReplaceCount: final.behindFiveTickReplaceCount,
        finalBtcPositionBase: final.finalBtcPositionBase,
        finalInventoryState: final.finalInventoryState,
        mcpMutationCalls: final.mcpMutationCalls,
        venueMutations: final.venueMutations,
        mainnetShadowRuntimeReady: final.mainnetShadowRuntimeReady,
      }),
    ]),
    readReliabilityEvidence: Object.freeze({
      firstSessionFailureCount: first.readFailureCount,
      firstSessionFailureCause: 'CAUSE_UNRECOVERABLE_FROM_HISTORICAL_LOGGING',
      observabilityEnabledAttempts: final.evaluationAttempts,
      observabilityEnabledSuccesses: final.successfulEvaluations,
      observabilityEnabledReadFailures: final.readFailureCount,
      maxConsecutiveReadFailures: final.maxConsecutiveReadFailures,
    }),
    strategyStateAtFinalObservation: Object.freeze({
      btcPositionBase: final.finalBtcPositionBase,
      inventoryState: final.finalInventoryState,
    }),
    safetyBoundary: Object.freeze({
      mainnetAuthenticatedReadsProven: true,
      shadowStrategyEvaluationProven: true,
      mcpPayloadSchemaValidationProven: true,
      continuousMainnetShadowRuntimeProven: true,
      selectedRepricePolicyValidated: true,
      autonomousMainnetMutationProven: false,
      liveExecutionEnabled: false,
      mcpMutationEnabled: false,
      venueMutationEnabled: false,
      externalCounterpartyRequired: true,
      selfTradePermitted: false,
    }),
    sourceArtifactHashes,
  };
  return Object.freeze({ ...body, manifestBodyHashSha256: sha256CanonicalJsonV1(body) });
}
