export type capital_margin_evidence_v1 = Readonly<{
  availableMarginUsd: number | null;
  status: 'fresh' | 'stale' | 'unknown';
}>;

// Compare decimal USD values without binary arithmetic or rounding to cents.
function parseUSD(value: string): readonly [bigint, number] | null {
  const match = /^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(
    value.trim().replace(/^\+/, '').replace(/^\./, '0.'),
  );
  if (!match) return null;
  const fraction = match[2] ?? '';
  const exponent = Number(match[3] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 324) return null;
  return [BigInt(`${match[1]}${fraction}`), fraction.length - exponent];
}

export function validateSettingsCapitalMarginV1(
  capital: string,
  evidence: capital_margin_evidence_v1,
): 'valid' | 'invalid' | 'exceeds' | 'stale' | 'unknown' {
  const amount = parseUSD(capital);
  if (amount === null || amount[0] <= 0n) return 'invalid';
  if (evidence.status !== 'fresh') return evidence.status;
  const margin = evidence.availableMarginUsd;
  if (margin === null || !Number.isFinite(margin) || margin < 0) return 'unknown';
  const available = parseUSD(margin.toString());
  if (available === null) return 'unknown';
  const scale = Math.max(amount[1], available[1]);
  return amount[0] * 10n ** BigInt(scale - amount[1]) >
    available[0] * 10n ** BigInt(scale - available[1])
    ? 'exceeds'
    : 'valid';
}
