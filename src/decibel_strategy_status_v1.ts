/**
 * Strategy status for the dashboard (2026-11-14 consolidation): which strategy rule is
 * passing or blocking right now and why, from the orchestrator's latest decision snapshot,
 * plus how many cycles each rule blocked in the current session.
 *
 * Read-only presentation: nothing here feeds back into trading decisions.
 */
import { DECIBEL_STRATEGY_POLICY_V1 } from './decibel_strategy_policy_v1.js';
import { assessDecibelSnapshotDCAV1, countDecibelOpeningOrdersV1 } from './decibel_dca_v1.js';
import { planDecibelPatientTPV1 } from './decibel_exit_economics_v1.js';
import { getDecibelEntryVolatilityPauseReasonV1 } from './decibel_volatility_targets_v1.js';
import type { decibel_production_live_snapshot_v1 } from './decibel_production_live_types_v1.js';

export type decibel_strategy_rule_name_v1 =
  | 'ENTRY_CANDLE_FILTER'
  | 'VOLATILITY_PAUSE'
  | 'GAS_RESERVE'
  | 'DCA'
  | 'TP_ADVERSE'
  | 'CATASTROPHE_STOP';

export type decibel_strategy_rule_status_v1 = Readonly<{
  rule: decibel_strategy_rule_name_v1;
  /** PASS: allows; BLOCK: currently blocks; WAIT: holding for evidence; IDLE: not applicable. */
  state: 'PASS' | 'BLOCK' | 'WAIT' | 'IDLE';
  reason: string | null;
}>;

export type decibel_strategy_status_v1 = Readonly<{
  sessionId: string | null;
  observedAt: number;
  candleSource: 'EXCHANGE' | 'BBO_FALLBACK' | null;
  rangeBps: number | null;
  /** The last two closed 5-minute candles, oldest first. */
  closedCandles: readonly Readonly<{ start: number; low: number; high: number }>[] | null;
  positionBase: number;
  dcaAdditionsUsed: number | null;
  dcaMaximumAdditions: number;
  catastropheStopTriggerPrice: number | null;
  rules: readonly decibel_strategy_rule_status_v1[];
  /** Cycles in which each rule blocked or waited, for the current session. */
  blockedCycles: Readonly<Partial<Record<decibel_strategy_rule_name_v1, number>>>;
  cycles: number;
}>;

const safely = <T>(read: () => T, fallback: T): T => {
  try {
    return read();
  } catch {
    return fallback;
  }
};

function describeEntryFilter(
  snapshot: decibel_production_live_snapshot_v1,
): decibel_strategy_rule_status_v1 {
  const rule = 'ENTRY_CANDLE_FILTER' as const;
  if (snapshot.input.actualInventoryBase !== 0)
    return { rule, state: 'IDLE', reason: 'POSITION_OPEN' };
  const blockers = snapshot.entryCandleBlockers;
  if (blockers === undefined || blockers === null)
    return { rule, state: 'IDLE', reason: 'FILTER_OFF' };
  if (blockers.BUY === null || blockers.SELL === null)
    return {
      rule,
      state: 'PASS',
      reason:
        blockers.BUY === null && blockers.SELL === null
          ? 'BOTH_SIDES'
          : blockers.BUY === null
            ? `BUY_ONLY (SELL: ${blockers.SELL})`
            : `SELL_ONLY (BUY: ${blockers.BUY})`,
    };
  return {
    rule,
    state: blockers.BUY === 'ENTRY_CANDLE_EVIDENCE_REQUIRED' ? 'WAIT' : 'BLOCK',
    reason: `BUY: ${blockers.BUY} / SELL: ${blockers.SELL}`,
  };
}

function describePositionRule(
  rule: 'DCA' | 'TP_ADVERSE',
  snapshot: decibel_production_live_snapshot_v1,
): decibel_strategy_rule_status_v1 {
  const position = snapshot.input.actualInventoryBase;
  if (position === 0) return { rule, state: 'IDLE', reason: 'FLAT' };
  if (rule === 'DCA') {
    const dca = safely(() => assessDecibelSnapshotDCAV1(snapshot), null);
    if (dca === null) return { rule, state: 'WAIT', reason: 'DCA_EVIDENCE_UNAVAILABLE' };
    return {
      rule,
      state: dca.allowed ? 'PASS' : dca.reason.includes('EVIDENCE') ? 'WAIT' : 'BLOCK',
      reason: dca.reason,
    };
  }
  const side = position > 0 ? 'SELL' : 'BUY';
  const plan = safely(() => planDecibelPatientTPV1(snapshot, side), null);
  if (plan === null) return { rule, state: 'WAIT', reason: 'TP_EVIDENCE_UNAVAILABLE' };
  return {
    rule,
    state: plan.targetPrice !== null ? 'PASS' : plan.reason.includes('REQUIRED') ? 'WAIT' : 'BLOCK',
    reason: plan.reason,
  };
}

export function projectDecibelStrategyStatusV1(
  snapshot: decibel_production_live_snapshot_v1 | null,
  previous: decibel_strategy_status_v1 | null = null,
): decibel_strategy_status_v1 | null {
  if (snapshot === null) return null;
  const range = snapshot.priceRangeBps ?? null;
  const volatility = getDecibelEntryVolatilityPauseReasonV1(range);
  const gas = snapshot.executionGasBlocker ?? null;
  const stop = snapshot.catastropheStop ?? null;
  const position = snapshot.input.actualInventoryBase;
  const rules: decibel_strategy_rule_status_v1[] = [
    describeEntryFilter(snapshot),
    {
      rule: 'VOLATILITY_PAUSE',
      state: volatility === null ? 'PASS' : 'BLOCK',
      reason: volatility,
    },
    { rule: 'GAS_RESERVE', state: gas === null ? 'PASS' : 'BLOCK', reason: gas },
    describePositionRule('DCA', snapshot),
    describePositionRule('TP_ADVERSE', snapshot),
    {
      rule: 'CATASTROPHE_STOP',
      state: position === 0 ? 'IDLE' : stop === null ? 'WAIT' : 'PASS',
      reason: position === 0 ? 'FLAT' : stop === null ? 'CATASTROPHE_STOP_MISSING' : 'STOP_RESTING',
    },
  ];
  const sessionId = snapshot.input.sessionId;
  const sameSession = previous !== null && previous.sessionId === sessionId;
  const blockedCycles: Partial<Record<decibel_strategy_rule_name_v1, number>> = sameSession
    ? { ...previous.blockedCycles }
    : {};
  for (const status of rules)
    if (status.state === 'BLOCK' || status.state === 'WAIT')
      blockedCycles[status.rule] = (blockedCycles[status.rule] ?? 0) + 1;
  return Object.freeze({
    sessionId,
    observedAt: snapshot.input.now,
    candleSource: snapshot.marketStructure?.source ?? null,
    rangeBps: range,
    closedCandles: snapshot.marketStructure?.closedCandles ?? null,
    positionBase: position,
    dcaAdditionsUsed:
      position === 0
        ? null
        : safely(() => {
            const count = countDecibelOpeningOrdersV1(snapshot);
            return count === null ? null : Math.max(0, count - 1);
          }, null),
    dcaMaximumAdditions: DECIBEL_STRATEGY_POLICY_V1.dca.maximumAdditions,
    catastropheStopTriggerPrice: stop?.triggerPrice ?? null,
    rules: Object.freeze(rules.map((status) => Object.freeze(status))),
    blockedCycles: Object.freeze(blockedCycles),
    cycles: sameSession ? previous.cycles + 1 : 1,
  });
}
