/**
 * One-off mainnet probe of Decibel order-update semantics.
 * Plan: docs/decibel_venue_capability_probe_plan_v1.md. NOT part of the production chain.
 *
 * Usage (one stage per run, bot stopped, account flat with zero orders):
 *   npm run decibel:probe:venue-v1 -- --live --stage A [--report-dir <dir outside repo>]
 *
 * Safety: own risk gate (decibel_venue_probe_policy_v1), one submission per step and
 * no retries, read-back after every step, cleanup in `finally`, report written outside
 * the repository, credentials never printed.
 */
import dotenv from 'dotenv';

dotenv.config();

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { inspect } from 'node:util';
import { z } from 'zod';

import { getDecibelQuantityUnitsV1, scaleDecimalToChainUnitsV1 } from './decibel_chain_units_v1.js';
import { loadDecibelSdkRuntimeV1 } from './decibel_sdk_runtime_v1.js';
import {
  DECIBEL_PRODUCTION_MAX_GAS_AMOUNT_V1,
  capDecibelProductionMaxGasAmountV1,
} from './decibel_external_production_executor_v1.js';
import {
  DECIBEL_VENUE_PROBE_CROSS_DISTANCE_FRACTION_V1,
  DECIBEL_VENUE_PROBE_FAR_DISTANCE_FRACTION_V1,
  DECIBEL_VENUE_PROBE_STOP_DISTANCE_FRACTION_V1,
  assessDecibelVenueProbeOrderV1,
  assessDecibelVenueProbePreconditionsV1,
  buildDecibelVenueProbeClientOrderIdV1,
  compareDecibelVenueProbeOrdersV1,
  getDecibelVenueProbePriceV1,
  getDecibelVenueProbeSizeV1,
  isDecibelVenueProbeClientOrderIdV1,
  parseDecibelVenueProbeArgsV1,
  redactDecibelVenueProbeTextV1,
  type decibel_venue_probe_market_v1,
  type decibel_venue_probe_order_row_v1,
  type decibel_venue_probe_order_v1,
  type decibel_venue_probe_stage_v1,
} from './decibel_venue_probe_policy_v1.js';

const MARKET_NAME = 'BTC/USD';
const BTC_USD_MARKET_ADDRESS = '0x5e0e16f34adfb4b316f8d532d68acbfa206826feaaa418d3938046bdc2044861';
const TIF_POST_ONLY = 1;
const TIF_IOC = 2;

// ---------- external data validation ----------
const MarketRowSchema = z.object({
  market_addr: z.string(),
  market_name: z.string(),
  sz_decimals: z.number().int().nonnegative(),
  px_decimals: z.number().int().nonnegative(),
  tick_size: z.number().positive(),
  min_size: z.number().positive(),
  lot_size: z.number().positive(),
  mode: z.string(),
});
const PriceRowSchema = z.object({ market: z.string(), mid_px: z.number().positive() });
const OpenOrderSchema = z.object({
  market: z.string(),
  order_id: z.union([z.string(), z.number()]).transform(String),
  client_order_id: z.string().nullable().optional(),
  orig_size: z.number().nullable().optional(),
  remaining_size: z.number().nullable().optional(),
  price: z.number().nullable().optional(),
  is_reduce_only: z.boolean().optional(),
  is_tpsl: z.boolean().optional(),
  unix_ms: z.number().nullable().optional(),
});
const BulkOrderSchema = z.object({
  market: z.string(),
  sequence_number: z.number(),
  bid_prices: z.array(z.number()),
  bid_sizes: z.array(z.number()),
  ask_prices: z.array(z.number()),
  ask_sizes: z.array(z.number()),
});
const PositionSchema = z.object({
  market: z.string(),
  size: z.number(),
  tp_order_id: z.union([z.string(), z.number()]).nullable().optional(),
  sl_order_id: z.union([z.string(), z.number()]).nullable().optional(),
});

/** Readers return either an array, `{ items }`, or a single object. */
function asRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items))
    return (value as { items: unknown[] }).items;
  return value === null || value === undefined ? [] : [value];
}
const isBtc = (market: string) =>
  market.toLowerCase() === BTC_USD_MARKET_ADDRESS || market === MARKET_NAME;

// ---------- SDK boundary ----------
// SDK 0.7.0 declares human-unit numbers but forwards price/size directly to Move u64
// arguments (see decibel_external_production_executor_v1). This local interface takes the
// chain-unit bigints the contract expects; the single cast below is isolated here.
type committed_tx_v1 = Readonly<{
  hash?: string;
  success?: boolean;
  vm_status?: string;
  events?: readonly Readonly<{ type: string; data: unknown }>[];
}>;
type probe_write_client_v1 = Readonly<{
  placeOrder(input: {
    marketName: string;
    price: bigint;
    size: bigint;
    isBuy: boolean;
    timeInForce: number;
    isReduceOnly: boolean;
    clientOrderId: string;
    subaccountAddr: string;
  }): Promise<
    { success: true; orderId?: string; transactionHash: string } | { success: false; error: string }
  >;
  updateOrder(input: {
    orderId: string;
    marketAddr: string;
    price: bigint;
    size: bigint;
    isBuy: boolean;
    timeInForce: number;
    isReduceOnly: boolean;
    subaccountAddr: string;
  }): Promise<committed_tx_v1>;
  cancelOrder(input: {
    orderId: string;
    marketName: string;
    subaccountAddr: string;
  }): Promise<committed_tx_v1>;
  cancelBulkOrder(input: { marketName: string; subaccountAddr: string }): Promise<committed_tx_v1>;
  placeTpSlOrderForPosition(input: {
    marketAddr: string;
    slTriggerPrice: bigint;
    slLimitPrice: bigint;
    slSize: bigint;
    subaccountAddr: string;
  }): Promise<committed_tx_v1>;
  cancelTpSlOrderForPosition(input: {
    marketAddr: string;
    orderId: string;
    subaccountAddr: string;
  }): Promise<committed_tx_v1>;
  sendEntry(functionName: string, functionArguments: unknown[]): Promise<committed_tx_v1>;
}>;

type report_step_v1 = {
  step: string;
  at: number;
  request?: unknown;
  outcome: 'SUCCESS' | 'ABORTED' | 'FAILED' | 'UNKNOWN' | 'SKIPPED' | 'OBSERVED';
  transactionHash?: string | null;
  vmStatus?: string | null;
  events?: unknown;
  error?: string;
  observation?: unknown;
};

// Secrets loaded from .env. The Decibel/Aptos SDK logs failed requests itself, including
// the node API key in the request overrides, so every console method is redacted.
const SecretValues: string[] = [];
const redact = (text: string) => redactDecibelVenueProbeTextV1(text, SecretValues);
function installRedactingConsoleV1(): void {
  for (const method of ['log', 'info', 'warn', 'error'] as const) {
    const original = console[method].bind(console);
    console[method] = (...values: unknown[]) =>
      original(
        ...values.map((value) =>
          redact(
            typeof value === 'string' ? value : inspect(value, { depth: 6, breakLength: 160 }),
          ),
        ),
      );
  }
}

const safeError = (error: unknown): string =>
  redact(error instanceof Error ? error.message : String(error)).slice(0, 400);

function isProductionProcessRunning(): boolean | null {
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$ErrorActionPreference='Stop'; if (Get-CimInstance Win32_Process | Where-Object {$_.Name -eq 'node.exe' -and $_.CommandLine -match 'run_decibel_production_(web|live)'}) { exit 2 } else { exit 0 }",
    ],
    { encoding: 'utf8', timeout: 30_000 },
  );
  if (result.status === 0) return false;
  if (result.status === 2) return true;
  return null;
}

async function main(): Promise<void> {
  installRedactingConsoleV1();
  const parsed = parseDecibelVenueProbeArgsV1(process.argv.slice(2));
  if (parsed.args === null) throw new Error(parsed.error ?? 'PROBE_ARGS_INVALID');
  const { stage, partialFillWaitMs } = parsed.args;
  const reportDirectory = resolve(
    parsed.args.reportDirectory ?? join(tmpdir(), 'decibel_venue_probe'),
  );
  if ((reportDirectory + sep).startsWith(resolve(process.cwd()) + sep))
    throw new Error('PROBE_REPORT_DIR_MUST_BE_OUTSIDE_REPOSITORY');

  const environment = process.env;
  const privateKey = environment.DECIBEL_PRIVATE_KEY;
  const subaccountInput = environment.DECIBEL_SUBACCOUNT_ADDRESS?.trim();
  if (!privateKey || !subaccountInput) throw new Error('PROBE_CREDENTIALS_REQUIRED');
  const subaccount: string = subaccountInput;
  SecretValues.push(
    privateKey,
    ...(environment.DECIBEL_NODE_API_KEY ? [environment.DECIBEL_NODE_API_KEY] : []),
  );

  const [{ Account, Ed25519PrivateKey }, { DecibelWriteDex, DecibelReadDex, MAINNET_CONFIG }] =
    await Promise.all([import('@aptos-labs/ts-sdk'), loadDecibelSdkRuntimeV1()]);
  const nodeApiKey = environment.DECIBEL_NODE_API_KEY?.trim() || undefined;
  const Signer = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(privateKey) });
  class probe_write_dex_v1 extends DecibelWriteDex {
    // Same cap as the production executor: Aptos requires balance >= max_gas * gas_price,
    // and the SDK default rejects small gas wallets (INSUFFICIENT_BALANCE_FOR_TRANSACTION_FEE).
    public override buildTx(
      payload: Parameters<InstanceType<typeof DecibelWriteDex>['buildTx']>[0],
      sender: Parameters<InstanceType<typeof DecibelWriteDex>['buildTx']>[1],
    ) {
      return super.buildTx(
        { ...payload, maxGasAmount: capDecibelProductionMaxGasAmountV1(payload.maxGasAmount) },
        sender,
      );
    }
    public sendEntry(functionName: string, functionArguments: unknown[]) {
      return this.sendTx({
        function:
          `${MAINNET_CONFIG.deployment.package}::dex_accounts_entry::${functionName}` as `${string}::${string}::${string}`,
        typeArguments: [],
        functionArguments: functionArguments as never,
      });
    }
  }
  const Writer = new probe_write_dex_v1(MAINNET_CONFIG, Signer, nodeApiKey ? { nodeApiKey } : {});
  const Client = Writer as unknown as probe_write_client_v1;
  const Reader = new DecibelReadDex(MAINNET_CONFIG, nodeApiKey ? { nodeApiKey } : {});

  // ---------- reads ----------
  const readMarket = async () => {
    const rows = asRows(await Reader.markets.getAll()).map((row) => MarketRowSchema.parse(row));
    const row = rows.find((candidate) => candidate.market_name === MARKET_NAME);
    if (!row || row.market_addr.toLowerCase() !== BTC_USD_MARKET_ADDRESS)
      throw new Error('PROBE_MARKET_IDENTITY_MISMATCH');
    const prices = asRows(await Reader.marketPrices.getByName({ marketName: MARKET_NAME })).map(
      (price) => PriceRowSchema.parse(price),
    );
    const midPrice = prices[0]?.mid_px;
    if (midPrice === undefined) throw new Error('PROBE_MID_PRICE_UNAVAILABLE');
    return {
      row,
      market: Object.freeze({
        tickSize: row.tick_size / 10 ** row.px_decimals,
        lotSize: row.lot_size / 10 ** row.sz_decimals,
        minimumSize: row.min_size / 10 ** row.sz_decimals,
        midPrice,
      }) satisfies decibel_venue_probe_market_v1,
    };
  };
  const readAccount = async () => {
    const [orders, positions, bulk] = await Promise.all([
      Reader.userOpenOrders.getByAddr({ subAddr: subaccount }),
      Reader.userPositions.getByAddr({ subAddr: subaccount, marketAddr: BTC_USD_MARKET_ADDRESS }),
      Reader.userBulkOrders.getByAddr({ subAddr: subaccount, market: BTC_USD_MARKET_ADDRESS }),
    ]);
    const openOrders = asRows(orders)
      .map((row) => OpenOrderSchema.parse(row))
      .filter((row) => isBtc(row.market));
    const position = asRows(positions)
      .map((row) => PositionSchema.parse(row))
      .find((row) => isBtc(row.market));
    return {
      openOrders,
      orderRows: openOrders.map((row): decibel_venue_probe_order_row_v1 => ({
        orderId: row.order_id,
        clientOrderId: row.client_order_id ?? null,
        price: row.price ?? null,
        origSize: row.orig_size ?? null,
        remainingSize: row.remaining_size ?? null,
        reduceOnly: row.is_reduce_only ?? null,
        unixMs: row.unix_ms ?? null,
      })),
      positionBase: position?.size ?? 0,
      position: position ?? null,
      // A cancelled bulk order can remain as a record with empty level arrays.
      bulkOrders: asRows(bulk)
        .map((row) => BulkOrderSchema.parse(row))
        .filter((row) => isBtc(row.market) && row.bid_prices.length + row.ask_prices.length > 0),
    };
  };
  const readHistory = async () =>
    asRows(await Reader.userOrderHistory.getByAddr({ subAddr: subaccount, limit: 20 })).filter(
      (row) =>
        row !== null &&
        typeof row === 'object' &&
        isDecibelVenueProbeClientOrderIdV1(
          (row as { client_order_id?: string | null }).client_order_id,
        ),
    );

  // ---------- preconditions ----------
  const { row: marketRow, market } = await readMarket();
  const initial = await readAccount();
  const [aptBalanceOctas, gasPrice] = await Promise.all([
    Writer.aptos.getAccountAPTAmount({ accountAddress: Signer.accountAddress }),
    Writer.aptos.getGasPriceEstimation(),
  ]);
  const requiredGasOctas = DECIBEL_PRODUCTION_MAX_GAS_AMOUNT_V1 * gasPrice.gas_estimate;
  console.log(
    JSON.stringify({
      event: 'PROBE_GAS_ACCOUNT',
      aptBalance: aptBalanceOctas / 1e8,
      maxGasAmount: DECIBEL_PRODUCTION_MAX_GAS_AMOUNT_V1,
      gasUnitPriceOctas: gasPrice.gas_estimate,
      requiredPerTransactionApt: requiredGasOctas / 1e8,
    }),
  );
  const blocker = assessDecibelVenueProbePreconditionsV1({
    aptBalanceOctas,
    requiredGasOctas,
    tradingMode: environment.TRADING_MODE,
    liveTradingEnabled: environment.LIVE_TRADING_ENABLED,
    network: environment.DECIBEL_NETWORK,
    productionProcessRunning: isProductionProcessRunning(),
    positionBase: initial.positionBase,
    openOrderCount: initial.openOrders.length,
    bulkOrderCount: initial.bulkOrders.length,
    marketMode: marketRow.mode,
  });
  if (blocker) throw new Error(blocker);

  const steps: report_step_v1[] = [];
  const startedAt = Date.now();
  let stepNumber = 0;
  const px = (price: number) => scaleDecimalToChainUnitsV1(price, marketRow.px_decimals);
  const sz = (size: number) => getDecibelQuantityUnitsV1(size, marketRow.sz_decimals);
  const record = (step: report_step_v1) => {
    steps.push(step);
    console.log(
      JSON.stringify({ event: 'PROBE_STEP', stage, ...step }, (_k, v: unknown) =>
        typeof v === 'bigint' ? v.toString() : v,
      ),
    );
  };
  const observe = async (step: string, extra?: unknown) => {
    const account = await readAccount();
    record({
      step,
      at: Date.now(),
      outcome: 'OBSERVED',
      observation: {
        positionBase: account.positionBase,
        position: account.position,
        openOrders: account.orderRows,
        bulkOrders: account.bulkOrders,
        ...(extra === undefined ? {} : { extra }),
      },
    });
    return account;
  };
  const txOutcome = (tx: committed_tx_v1) => ({
    outcome: (tx.success === false ? 'ABORTED' : 'SUCCESS') as report_step_v1['outcome'],
    transactionHash: tx.hash ?? null,
    vmStatus: tx.vm_status ?? null,
    events: (tx.events ?? []).map((event) => ({ type: event.type, data: event.data })),
  });
  /** Exactly one submission; any exception is recorded as UNKNOWN and never retried. */
  const submit = async (step: string, request: unknown, send: () => Promise<committed_tx_v1>) => {
    stepNumber += 1;
    try {
      const tx = await send();
      record({ step, at: Date.now(), request, ...txOutcome(tx) });
      return tx;
    } catch (error) {
      record({ step, at: Date.now(), request, outcome: 'UNKNOWN', error: safeError(error) });
      return null;
    }
  };
  const gate = (order: decibel_venue_probe_order_v1, positionBase: number) => {
    const reason = assessDecibelVenueProbeOrderV1(order, market, positionBase);
    if (reason) throw new Error(reason);
  };
  const place = async (step: string, order: decibel_venue_probe_order_v1, positionBase: number) => {
    gate(order, positionBase);
    stepNumber += 1;
    const clientOrderId = buildDecibelVenueProbeClientOrderIdV1(stage, stepNumber, Date.now());
    const request = { ...order, clientOrderId };
    try {
      const result = await Client.placeOrder({
        marketName: MARKET_NAME,
        price: px(order.price),
        size: sz(order.quantity),
        isBuy: order.side === 'BUY',
        timeInForce: order.timeInForce === 'PostOnly' ? TIF_POST_ONLY : TIF_IOC,
        isReduceOnly: order.reduceOnly,
        clientOrderId,
        subaccountAddr: subaccount,
      });
      record({
        step,
        at: Date.now(),
        request,
        outcome: result.success ? 'SUCCESS' : 'FAILED',
        ...(result.success
          ? {
              transactionHash: result.transactionHash,
              observation: { orderId: result.orderId ?? null },
            }
          : { error: result.error.slice(0, 400) }),
      });
      return { clientOrderId, orderId: result.success ? (result.orderId ?? null) : null };
    } catch (error) {
      record({ step, at: Date.now(), request, outcome: 'UNKNOWN', error: safeError(error) });
      return { clientOrderId, orderId: null };
    }
  };
  const update = async (
    step: string,
    orderId: string,
    clientOrderId: string,
    order: decibel_venue_probe_order_v1,
    positionBase: number,
  ) => {
    gate(order, positionBase);
    const before = (await readAccount()).orderRows.find((row) => row.orderId === orderId) ?? null;
    await submit(step, { orderId, ...order }, () =>
      Client.updateOrder({
        orderId,
        marketAddr: BTC_USD_MARKET_ADDRESS,
        price: px(order.price),
        size: sz(order.quantity),
        isBuy: order.side === 'BUY',
        timeInForce: order.timeInForce === 'PostOnly' ? TIF_POST_ONLY : TIF_IOC,
        isReduceOnly: order.reduceOnly,
        subaccountAddr: subaccount,
      }),
    );
    const after = await readAccount();
    const comparison = compareDecibelVenueProbeOrdersV1(before, after.orderRows, clientOrderId);
    record({
      step: `${step}:compare`,
      at: Date.now(),
      outcome: 'OBSERVED',
      observation: { before, ...comparison, history: await readHistory() },
    });
    return comparison.after?.orderId ?? orderId;
  };
  const closePosition = async (step: string) => {
    const account = await readAccount();
    if (account.positionBase === 0) return;
    const side = account.positionBase > 0 ? 'SELL' : 'BUY';
    const fresh = (await readMarket()).market;
    await place(
      step,
      {
        side,
        price: getDecibelVenueProbePriceV1(
          fresh,
          side,
          DECIBEL_VENUE_PROBE_CROSS_DISTANCE_FRACTION_V1,
          'THROUGH',
        ),
        quantity: Math.abs(account.positionBase),
        timeInForce: 'ImmediateOrCancel',
        reduceOnly: true,
        purpose: 'CLOSE_POSITION',
      },
      account.positionBase,
    );
  };
  const openPosition = async (multiple: 1 | 2) =>
    place(
      'open-position-ioc',
      {
        side: 'BUY',
        price: getDecibelVenueProbePriceV1(
          market,
          'BUY',
          DECIBEL_VENUE_PROBE_CROSS_DISTANCE_FRACTION_V1,
          'THROUGH',
        ),
        quantity: getDecibelVenueProbeSizeV1(market, multiple),
        timeInForce: 'ImmediateOrCancel',
        reduceOnly: false,
        purpose: 'OPEN_POSITION',
      },
      0,
    );
  const restingBuy = (multiple: 1 | 2, fraction = DECIBEL_VENUE_PROBE_FAR_DISTANCE_FRACTION_V1) =>
    ({
      side: 'BUY',
      price: getDecibelVenueProbePriceV1(market, 'BUY', fraction, 'AWAY'),
      quantity: getDecibelVenueProbeSizeV1(market, multiple),
      timeInForce: 'PostOnly',
      reduceOnly: false,
      purpose: 'REST',
    }) satisfies decibel_venue_probe_order_v1;
  const findOrderId = async (clientOrderId: string, known: string | null) =>
    known ??
    (await readAccount()).orderRows.find((row) => row.clientOrderId === clientOrderId)?.orderId ??
    null;

  let failure: string | null = null;
  try {
    await observe('initial-state', { market });
    await runStage(stage);
  } catch (error) {
    failure = safeError(error);
    record({ step: 'stage-error', at: Date.now(), outcome: 'FAILED', error: failure });
  } finally {
    // Cleanup reads actual venue state; cancels are bounded to probe orders and the
    // close is a reduce-only IOC bounded by the authenticated position.
    try {
      const account = await readAccount();
      for (const row of account.openOrders) {
        if (row.is_tpsl === true) {
          await submit('cleanup-cancel-tpsl', { orderId: row.order_id }, () =>
            Client.cancelTpSlOrderForPosition({
              marketAddr: BTC_USD_MARKET_ADDRESS,
              orderId: row.order_id,
              subaccountAddr: subaccount,
            }),
          );
        } else if (isDecibelVenueProbeClientOrderIdV1(row.client_order_id)) {
          await submit('cleanup-cancel', { orderId: row.order_id }, () =>
            Client.cancelOrder({
              orderId: row.order_id,
              marketName: MARKET_NAME,
              subaccountAddr: subaccount,
            }),
          );
        }
      }
      if (account.bulkOrders.length > 0)
        await submit('cleanup-cancel-bulk', {}, () =>
          Client.cancelBulkOrder({ marketName: MARKET_NAME, subaccountAddr: subaccount }),
        );
      await closePosition('cleanup-close-position');
    } catch (error) {
      record({ step: 'cleanup-error', at: Date.now(), outcome: 'FAILED', error: safeError(error) });
    }
    const final = await readAccount().catch(() => null);
    const endedClean =
      final !== null &&
      final.positionBase === 0 &&
      final.openOrders.length === 0 &&
      final.bulkOrders.length === 0;
    mkdirSync(reportDirectory, { recursive: true });
    const reportPath = join(reportDirectory, `stage-${stage}-${startedAt}.json`);
    writeFileSync(
      reportPath,
      redact(
        `${JSON.stringify({ stage, startedAt, finishedAt: Date.now(), market, failure, endedClean, final: final && { positionBase: final.positionBase, openOrders: final.orderRows, bulkOrders: final.bulkOrders }, steps }, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v), 2)}\n`,
      ),
      'utf8',
    );
    console.log(JSON.stringify({ event: 'PROBE_DONE', stage, failure, endedClean, reportPath }));
    if (!endedClean) {
      console.error(
        'PROBE_NOT_CLEAN: position or orders remain. Inspect the account before starting the bot.',
      );
      process.exitCode = 3;
    } else if (failure) process.exitCode = 2;
  }

  async function runStage(current: decibel_venue_probe_stage_v1): Promise<void> {
    if (current === 'A') {
      const order = restingBuy(2);
      const placed = await place('A1-place-far-postonly-2x', order, 0);
      const orderId = await findOrderId(placed.clientOrderId, placed.orderId);
      if (!orderId) throw new Error('PROBE_A_ORDER_NOT_FOUND');
      let id = await update(
        'A2-update-price-further',
        orderId,
        placed.clientOrderId,
        restingBuy(2, DECIBEL_VENUE_PROBE_FAR_DISTANCE_FRACTION_V1 + 0.005),
        0,
      );
      id = await update(
        'A3-update-size-down',
        id,
        placed.clientOrderId,
        restingBuy(1, DECIBEL_VENUE_PROBE_FAR_DISTANCE_FRACTION_V1 + 0.005),
        0,
      );
      id = await update(
        'A4-update-size-up',
        id,
        placed.clientOrderId,
        restingBuy(2, DECIBEL_VENUE_PROBE_FAR_DISTANCE_FRACTION_V1 + 0.005),
        0,
      );
      // While flat a reduce-only flag has nothing to reduce: the gate allows the REST
      // purpose with reduceOnly=true only for this observation; the venue should reject it.
      await update(
        'A5-update-reduce-only-while-flat',
        id,
        placed.clientOrderId,
        {
          ...restingBuy(2, DECIBEL_VENUE_PROBE_FAR_DISTANCE_FRACTION_V1 + 0.005),
          reduceOnly: true,
        },
        0,
      );
      return;
    }
    if (current === 'B') {
      const placed = await place('B1-place-far-postonly', restingBuy(1), 0);
      const orderId = await findOrderId(placed.clientOrderId, placed.orderId);
      if (!orderId) throw new Error('PROBE_B_ORDER_NOT_FOUND');
      const fresh = (await readMarket()).market;
      await update(
        'B2-update-crossing-postonly',
        orderId,
        placed.clientOrderId,
        {
          side: 'BUY',
          price: getDecibelVenueProbePriceV1(
            fresh,
            'BUY',
            DECIBEL_VENUE_PROBE_CROSS_DISTANCE_FRACTION_V1,
            'THROUGH',
          ),
          quantity: getDecibelVenueProbeSizeV1(fresh, 1),
          timeInForce: 'PostOnly',
          reduceOnly: false,
          purpose: 'CROSS_UPDATE',
        },
        0,
      );
      await observe('B3-after-crossing-update');
      return;
    }
    if (current === 'C' || current === 'D') {
      await openPosition(current === 'C' ? 2 : 1);
      const opened = await observe(`${current}1-after-open`);
      if (opened.positionBase <= 0) throw new Error('PROBE_POSITION_NOT_OPENED');
      const quantity = Math.abs(opened.positionBase);
      const tp = (fraction: number, size = quantity) =>
        ({
          side: 'SELL',
          price: getDecibelVenueProbePriceV1(market, 'SELL', fraction, 'AWAY'),
          quantity: size,
          timeInForce: 'PostOnly',
          reduceOnly: true,
          purpose: 'TP',
        }) satisfies decibel_venue_probe_order_v1;
      const placed = await place(
        `${current}2-place-reduce-only-tp`,
        tp(0.003),
        opened.positionBase,
      );
      let tpId = await findOrderId(placed.clientOrderId, placed.orderId);
      if (!tpId) throw new Error('PROBE_TP_NOT_FOUND');
      if (current === 'D') {
        const trigger = getDecibelVenueProbePriceV1(
          market,
          'BUY',
          DECIBEL_VENUE_PROBE_STOP_DISTANCE_FRACTION_V1,
          'AWAY',
        );
        const limit = getDecibelVenueProbePriceV1(
          market,
          'BUY',
          DECIBEL_VENUE_PROBE_STOP_DISTANCE_FRACTION_V1 + 0.01,
          'AWAY',
        );
        await submit('D3-place-position-sl-next-to-tp', { trigger, limit, size: quantity }, () =>
          Client.placeTpSlOrderForPosition({
            marketAddr: BTC_USD_MARKET_ADDRESS,
            slTriggerPrice: px(trigger),
            slLimitPrice: px(limit),
            slSize: sz(quantity),
            subaccountAddr: subaccount,
          }),
        );
        await observe('D4-after-sl');
        return;
      }
      tpId = await update(
        'C3-update-tp-price-closer',
        tpId,
        placed.clientOrderId,
        tp(0.0015),
        opened.positionBase,
      );
      tpId = await update(
        'C4-update-tp-size-down',
        tpId,
        placed.clientOrderId,
        tp(0.0015, getDecibelVenueProbeSizeV1(market, 1)),
        opened.positionBase,
      );
      tpId = await update(
        'C5-update-tp-size-up',
        tpId,
        placed.clientOrderId,
        tp(0.0015),
        opened.positionBase,
      );
      tpId = await update(
        'C6-move-tp-near-touch',
        tpId,
        placed.clientOrderId,
        tp(0.0002),
        opened.positionBase,
      );
      const deadline = Date.now() + partialFillWaitMs;
      while (Date.now() < deadline) {
        const account = await readAccount();
        const row = account.orderRows.find((candidate) => candidate.orderId === tpId);
        if (!row) {
          await observe('C7-tp-gone-or-filled');
          return;
        }
        if (
          row.origSize !== null &&
          row.remainingSize !== null &&
          row.remainingSize < row.origSize - 1e-12
        ) {
          await observe('C7-partial-fill-detected', { row });
          await update(
            'C8-update-size-to-original-total',
            tpId,
            placed.clientOrderId,
            tp(0.0002, Math.min(row.origSize, Math.abs(account.positionBase))),
            account.positionBase,
          );
          return;
        }
        await new Promise((done) => setTimeout(done, 5_000));
      }
      record({
        step: 'C7-partial-fill',
        at: Date.now(),
        outcome: 'SKIPPED',
        observation: 'no partial fill within wait window',
      });
      return;
    }
    // Stage E: one-level bulk BUY far from the market.
    const bulk = async (step: string, multiple: 1 | 2, fraction: number, sequence: bigint) => {
      const order = restingBuy(multiple, fraction);
      gate(order, 0);
      await submit(step, { ...order, sequence }, () =>
        Client.sendEntry('place_bulk_orders_to_subaccount', [
          subaccount,
          BTC_USD_MARKET_ADDRESS,
          sequence,
          [px(order.price)],
          [sz(order.quantity)],
          [],
          [],
          undefined,
          undefined,
        ]),
      );
      await observe(`${step}:state`, { history: await readHistory() });
    };
    const base = BigInt(Date.now());
    await bulk('E1-bulk-place-2x', 2, DECIBEL_VENUE_PROBE_FAR_DISTANCE_FRACTION_V1, base);
    await bulk('E2-bulk-size-down', 1, DECIBEL_VENUE_PROBE_FAR_DISTANCE_FRACTION_V1, base + 1n);
    await bulk(
      'E3-bulk-new-price',
      1,
      DECIBEL_VENUE_PROBE_FAR_DISTANCE_FRACTION_V1 + 0.005,
      base + 2n,
    );
  }
}

await main().catch((error: unknown) => {
  console.error(JSON.stringify({ event: 'PROBE_ABORTED_BEFORE_ORDERS', error: safeError(error) }));
  process.exitCode = 1;
});
