import { createInterface, type Interface } from 'node:readline/promises';
import type { Readable, Writable } from 'node:stream';

export const DECIBEL_PRODUCTION_TUI_V1 = 'DECIBEL_PRODUCTION_TUI_V1' as const;
export const DECIBEL_TUI_ENTER_ALTERNATE_SCREEN_V1 = '\u001B[?1049h\u001B[?25l';
export const DECIBEL_TUI_LEAVE_ALTERNATE_SCREEN_V1 = '\u001B[?25h\u001B[?1049l';

export function enterDecibelProductionTuiScreenV1(output: Writable): void {
  output.write(DECIBEL_TUI_ENTER_ALTERNATE_SCREEN_V1);
}

export function leaveDecibelProductionTuiScreenV1(output: Writable): void {
  output.write(DECIBEL_TUI_LEAVE_ALTERNATE_SCREEN_V1);
}

export function formatDecibelProductionTuiEventV1(value: unknown): string | null {
  let record: Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed === null || typeof parsed !== 'object') return null;
      record = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (value !== null && typeof value === 'object') {
    record = value as Record<string, unknown>;
  } else return null;
  const event = typeof record.event === 'string' ? record.event : 'EXECUTION_EVENT';
  const feeAmount =
    typeof record.feeUsd === 'number'
      ? record.feeUsd
      : typeof record.feeAmount === 'number'
        ? record.feeAmount
        : null;
  const gasApt =
    typeof record.gasApt === 'number'
      ? record.gasApt
      : typeof record.gasUsedOctas === 'number'
        ? record.gasUsedOctas / 100_000_000
        : null;
  const payerBalance =
    typeof record.primaryAccountAptBalance === 'number' ? record.primaryAccountAptBalance : null;
  const maxGasAmount = typeof record.maxGasAmount === 'number' ? record.maxGasAmount : null;
  const details = [
    feeAmount === null ? null : `FEE=$${Math.abs(feeAmount).toFixed(6)}`,
    gasApt === null ? null : `GAS=${gasApt.toFixed(8)} APT`,
    payerBalance === null ? null : `GAS_PAYER_BALANCE=${payerBalance.toFixed(6)} APT`,
    maxGasAmount === null ? null : `MAX_GAS_AMOUNT=${maxGasAmount}`,
  ].filter((detail): detail is string => detail !== null);
  return details.length === 0 ? null : `${event} ${details.join(' ')}`;
}

export type decibel_production_tui_status_v1 =
  | 'RUNNING'
  | 'PAUSED'
  | 'RISK_REDUCTION'
  | 'SWITCHING_PROFILE'
  | 'CANCELLING'
  | 'STOPPED_GOAL_REACHED'
  | 'STOPPED';

export type decibel_production_tui_model_v1 = {
  status: decibel_production_tui_status_v1;
  activeProfile: string;
  subaccountAddress: string;
  masterAptGas: number | null;
  collateralUsd: number | null;
  effectiveLeverage: number;
  btcPrice: number | null;
  positionBase: number;
  unrealizedPnlUsd: number | null;
  pnl24hUsd: number;
  pnl24hPercent: number | null;
  pnl7dUsd: number;
  pnl7dPercent: number | null;
  pnl30dUsd: number;
  pnl30dPercent: number | null;
  targetVolumeUsd: number | null;
  accumulatedVolumeUsd: number;
  bid: { price: number; clientOrderId: string } | null;
  ask: { price: number; clientOrderId: string } | null;
  bidLadder?: readonly Readonly<{
    levelId: string;
    price: number;
    quantity: number;
    skewStatus: string;
  }>[];
  askLadder?: readonly Readonly<{
    levelId: string;
    price: number;
    quantity: number;
    skewStatus: string;
  }>[];
  halfSpreadBps: number;
  orderNotionalUsd: number;
  maxPositionBase: number;
  maxDrawdownUsd: number;
  logs: string[];
};

export interface DecibelProductionTuiControlsV1 {
  setPaused(paused: boolean): Promise<void> | void;
  cancelAllAndReconcile(): Promise<void>;
  unwindAndReconcile(): Promise<void>;
  switchProfile(profile: string): Promise<void>;
  setTargetVolumeUsd(value: number | null): void;
  setOrderNotionalUsd(value: number): void;
  setMaxLeverage(value: number): void;
  setHalfSpreadBps(value: number): void;
  setMaxPositionBase(value: number): void;
  setMaxDrawdownUsd(value: number): void;
}

function value(value: number | null, digits = 4): string {
  return value === null ? 'N/A' : value.toFixed(digits);
}

function progress(current: number, target: number | null): string {
  if (target === null) return '[====================] UNLIMITED';
  const ratio = Math.max(0, Math.min(1, current / target));
  const complete = Math.round(ratio * 20);
  return `[${'#'.repeat(complete)}${'.'.repeat(20 - complete)}] ${(ratio * 100).toFixed(1)}%`;
}

export function renderDecibelProductionTuiV1(model: decibel_production_tui_model_v1): string {
  const activeQuotes = [
    model.bid === null ? null : `BID ${model.bid.price} (${model.bid.clientOrderId})`,
    model.ask === null ? null : `ASK ${model.ask.price} (${model.ask.clientOrderId})`,
  ].filter((quote): quote is string => quote !== null);
  const spread = activeQuotes.length === 0 ? 'No active quotes' : activeQuotes.join(' | ');
  const ladder = [...(model.bidLadder ?? []), ...(model.askLadder ?? [])]
    .map((level) => `${level.levelId} ${level.price} x ${level.quantity} ${level.skewStatus}`)
    .join(' | ');
  return [
    `DECIBEL BTC MARKET MAKER | ${model.status}`,
    `Account | Profile ${model.activeProfile} | Subaccount ${model.subaccountAddress}`,
    `Wallet  | Master APT ${value(model.masterAptGas, 6)} | USDC ${value(model.collateralUsd, 2)} | Leverage ${model.effectiveLeverage.toFixed(2)}x`,
    `Market  | BTC/USD ${value(model.btcPrice, 2)} | Position ${value(model.positionBase, 8)} BTC | Unrealized PnL $${value(model.unrealizedPnlUsd, 2)}`,
    `PnL     | 24h $${value(model.pnl24hUsd, 2)} (${value(model.pnl24hPercent, 3)}%) | 7d $${value(model.pnl7dUsd, 2)} (${value(model.pnl7dPercent, 3)}%) | 30d $${value(model.pnl30dUsd, 2)} (${value(model.pnl30dPercent, 3)}%)`,
    `Volume  | $${model.accumulatedVolumeUsd.toFixed(2)} / ${model.targetVolumeUsd === null ? 'UNLIMITED' : `$${model.targetVolumeUsd.toFixed(2)}`} ${progress(model.accumulatedVolumeUsd, model.targetVolumeUsd)}`,
    `Quotes  | ${spread} | Half-spread ${model.halfSpreadBps.toFixed(3)} bps`,
    `Ladder  | ${ladder || 'No generated levels'}`,
    `Limits  | Order $${model.orderNotionalUsd.toFixed(2)} | Position ${model.maxPositionBase.toFixed(8)} BTC | Drawdown $${model.maxDrawdownUsd.toFixed(2)}`,
    'Keys    | W profile | T target | V size | l/L leverage | s/S spread | p/P position | X drawdown | Space pause | C cancel',
    'Events  |',
    ...model.logs.slice(-8).map((line) => `  ${line}`),
  ].join('\n');
}

export class decibel_production_tui_v1 {
  private Prompt: Interface | null = null;

  public constructor(
    private readonly Model: decibel_production_tui_model_v1,
    private readonly Controls: DecibelProductionTuiControlsV1,
    private readonly Input: Readable,
    private readonly Output: Writable,
  ) {}

  public render(): void {
    this.Output.write(`\u001B[H\u001B[2J${renderDecibelProductionTuiV1(this.Model)}\n`);
  }

  public async handleKey(key: string): Promise<void> {
    if (key === ' ') {
      const paused = this.Model.status !== 'PAUSED';
      this.Model.status = paused ? 'PAUSED' : 'RUNNING';
      await this.Controls.setPaused(paused);
      this.log(paused ? 'Quoting paused' : 'Quoting resumed');
      return;
    }
    if (key === 'c' || key === 'C') {
      this.Model.status = 'CANCELLING';
      await this.Controls.cancelAllAndReconcile();
      this.Model.status = 'PAUSED';
      this.log('All BTC/USD orders cancelled and reconciled');
      return;
    }
    if (key === 'w' || key === 'W') {
      const profile = await this.ask('Preconfigured profile name: ');
      this.Model.status = 'SWITCHING_PROFILE';
      await this.Controls.setPaused(true);
      await this.Controls.cancelAllAndReconcile();
      await this.Controls.switchProfile(profile.trim());
      this.Model.activeProfile = profile.trim();
      this.Model.status = 'PAUSED';
      this.log(`Profile switched to ${profile.trim()}; explicit resume required`);
      return;
    }
    if (key === 't' || key === 'T') {
      const parsed = Number(await this.ask('Target session volume USD (-1 unlimited): '));
      if (!Number.isFinite(parsed) || parsed === 0) throw new Error('TUI_TARGET_VOLUME_INVALID');
      this.Model.targetVolumeUsd = parsed < 0 ? null : parsed;
      this.Controls.setTargetVolumeUsd(this.Model.targetVolumeUsd);
      return;
    }
    const prompts: Record<string, readonly [string, (number: number) => void]> = {
      v: ['Order notional USD: ', (number) => this.Controls.setOrderNotionalUsd(number)],
      V: ['Order notional USD: ', (number) => this.Controls.setOrderNotionalUsd(number)],
      x: ['Emergency max drawdown USD: ', (number) => this.Controls.setMaxDrawdownUsd(number)],
      X: ['Emergency max drawdown USD: ', (number) => this.Controls.setMaxDrawdownUsd(number)],
    };
    const prompt = prompts[key];
    if (prompt !== undefined) {
      const parsed = Number(await this.ask(prompt[0]));
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('TUI_LIMIT_INVALID');
      prompt[1](parsed);
      return;
    }
    const adjustment =
      key === 'l'
        ? -1
        : key === 'L'
          ? 1
          : key === 's'
            ? 0.1
            : key === 'S'
              ? -0.1
              : key === 'p'
                ? -0.00001
                : key === 'P'
                  ? 0.00001
                  : null;
    if (adjustment === null) return;
    if (key.toLowerCase() === 'l') {
      this.Model.effectiveLeverage = Math.max(
        1,
        Math.min(40, this.Model.effectiveLeverage + adjustment),
      );
      this.Controls.setMaxLeverage(this.Model.effectiveLeverage);
    } else if (key.toLowerCase() === 's') {
      this.Model.halfSpreadBps = Math.max(0, this.Model.halfSpreadBps + adjustment);
      this.Controls.setHalfSpreadBps(this.Model.halfSpreadBps);
    } else {
      this.Model.maxPositionBase = Math.max(0, this.Model.maxPositionBase + adjustment);
      this.Controls.setMaxPositionBase(this.Model.maxPositionBase);
    }
  }

  public async enforceVolumeGoal(): Promise<boolean> {
    if (
      this.Model.targetVolumeUsd === null ||
      this.Model.accumulatedVolumeUsd < this.Model.targetVolumeUsd
    )
      return false;
    this.Model.status = 'CANCELLING';
    await this.Controls.setPaused(true);
    await this.Controls.unwindAndReconcile();
    this.Model.status = 'STOPPED_GOAL_REACHED';
    this.log('Target session volume reached; orders cancelled and reconciled');
    return true;
  }

  public close(): void {
    this.Prompt?.close();
  }

  private log(message: string): void {
    this.Model.logs.push(`${new Date().toISOString()} ${message}`);
    if (this.Model.logs.length > 100) this.Model.logs.splice(0, this.Model.logs.length - 100);
  }

  private async ask(question: string): Promise<string> {
    this.Prompt ??= createInterface({ input: this.Input, output: this.Output });
    return this.Prompt.question(question);
  }
}
