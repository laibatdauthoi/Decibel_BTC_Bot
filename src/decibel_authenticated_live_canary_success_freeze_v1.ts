export const DECIBEL_AUTHENTICATED_LIVE_CANARY_SUCCESS_FREEZE_V1 =
  'DECIBEL_AUTHENTICATED_LIVE_CANARY_SUCCESS_FREEZE_V1' as const;

type json_record = Record<string, unknown>;

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === 'object') {
    const source = value as json_record;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, canonicalValue(source[key])]),
    );
  }
  return value;
}

export function canonicalizeDecibelAuthenticatedLiveCanarySuccessV1(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}
