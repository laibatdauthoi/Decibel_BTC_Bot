import type {
  DecibelProductionLiveStateSourceV1,
  decibel_production_live_snapshot_v1,
} from './decibel_production_live_types_v1.js';

export function wrapDecibelProductionLiveStateSourceV1(
  Source: DecibelProductionLiveStateSourceV1,
  observeSnapshot: (snapshot: decibel_production_live_snapshot_v1) => void,
): DecibelProductionLiveStateSourceV1 {
  type reconcile_arguments = Parameters<DecibelProductionLiveStateSourceV1['reconcileIntent']>;
  type cancel_arguments = Parameters<
    NonNullable<DecibelProductionLiveStateSourceV1['revalidateCancelTarget']>
  >;
  type timeout_arguments = Parameters<
    NonNullable<DecibelProductionLiveStateSourceV1['verifyTimedOutIntent']>
  >;
  const observe = (snapshot: decibel_production_live_snapshot_v1) => {
    observeSnapshot(snapshot);
    return snapshot;
  };
  return Object.freeze({
    ...(Source.assertAuthenticatedTransport === undefined
      ? {}
      : { assertAuthenticatedTransport: () => Source.assertAuthenticatedTransport!() }),
    ...(Source.readAuthenticatedTransportDiagnostics === undefined
      ? {}
      : {
          readAuthenticatedTransportDiagnostics: () =>
            Source.readAuthenticatedTransportDiagnostics!(),
        }),
    ...(Source.validateSubmission === undefined
      ? {}
      : {
          validateSubmission: (
            intent: Parameters<
              NonNullable<DecibelProductionLiveStateSourceV1['validateSubmission']>
            >[0],
          ) => Source.validateSubmission!(intent),
        }),
    readAuthenticatedSnapshot: async (signal?: AbortSignal) => {
      const snapshot = await Source.readAuthenticatedSnapshot(signal);
      signal?.throwIfAborted();
      return observe(snapshot);
    },
    ...(Source.readAuthenticatedAccountState === undefined
      ? {}
      : {
          readAuthenticatedAccountState: (signal?: AbortSignal) =>
            Source.readAuthenticatedAccountState!(signal),
        }),
    ...(Source.readOrderIdentityEvidence === undefined
      ? {}
      : {
          readOrderIdentityEvidence: (
            input: Parameters<
              NonNullable<DecibelProductionLiveStateSourceV1['readOrderIdentityEvidence']>
            >[0],
          ) => Source.readOrderIdentityEvidence!(input),
        }),
    reconcileIntent: (...arguments_: reconcile_arguments) => Source.reconcileIntent(...arguments_),
    ...(Source.readAuthenticatedSnapshotAfterMutation === undefined
      ? {}
      : {
          readAuthenticatedSnapshotAfterMutation: async () =>
            observe(await Source.readAuthenticatedSnapshotAfterMutation!()),
        }),
    ...(Source.readAuthenticatedPosition === undefined
      ? {}
      : { readAuthenticatedPosition: () => Source.readAuthenticatedPosition!() }),
    ...(Source.readPublicMarketPrice === undefined
      ? {}
      : { readPublicMarketPrice: () => Source.readPublicMarketPrice!() }),
    ...(Source.revalidateCancelTarget === undefined
      ? {}
      : {
          revalidateCancelTarget: (...arguments_: cancel_arguments) =>
            Source.revalidateCancelTarget!(...arguments_),
        }),
    ...(Source.verifyTimedOutIntent === undefined
      ? {}
      : {
          verifyTimedOutIntent: (...arguments_: timeout_arguments) =>
            Source.verifyTimedOutIntent!(...arguments_),
        }),
    ...(Source.readExchangeCandles1m === undefined
      ? {}
      : {
          readExchangeCandles1m: (startMs: number, endMs: number) =>
            Source.readExchangeCandles1m!(startMs, endMs),
        }),
    ...(Source.close === undefined ? {} : { close: () => Source.close!() }),
  });
}
