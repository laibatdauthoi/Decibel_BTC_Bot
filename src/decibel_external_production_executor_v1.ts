import type { PlaceOrderResult } from '@decibeltrade/sdk';
import type {
  AccountAuthenticator,
  AccountAddress,
  InputGenerateTransactionPayloadData,
  PendingTransactionResponse,
  SimpleTransaction,
} from '@aptos-labs/ts-sdk';

import type { cancel_intent_v1, place_intent_v1 } from './decibel_execution_intent_v1.js';
import { scaleDecimalToChainUnitsV1, getDecibelQuantityUnitsV1 } from './decibel_chain_units_v1.js';
import {
  DECIBEL_PRODUCTION_EXECUTOR_HANDOFF_V1,
  type DecibelProductionExecutionExecutorV1,
  type decibel_catastrophe_stop_request_v1,
  type decibel_catastrophe_stop_result_v1,
  type production_execution_result_v1,
} from './decibel_production_executor_handoff_v1.js';
import { loadDecibelSdkRuntimeV1 } from './decibel_sdk_runtime_v1.js';

export const DECIBEL_EXTERNAL_PRODUCTION_EXECUTOR_V1 = DECIBEL_PRODUCTION_EXECUTOR_HANDOFF_V1;

const BTC_USD_MARKET_ADDRESS = '0x5e0e16f34adfb4b316f8d532d68acbfa206826feaaa418d3938046bdc2044861';
const DECIBEL_POST_ONLY_TIME_IN_FORCE = 1;
const DECIBEL_IMMEDIATE_OR_CANCEL_TIME_IN_FORCE = 2;
const BTC_USD_PRICE_DECIMALS = 6;
const BTC_USD_SIZE_DECIMALS = 8;
// 200,000 -> 20,000 (2026-11-14): a transaction uses about 300-500 gas units, but Aptos
// requires balance >= max gas x gas price; with 200,000 a 0.1995 APT wallet (enough for
// hundreds of transactions) could not submit anything. 20,000 keeps a ~40x margin.
export const DECIBEL_PRODUCTION_MAX_GAS_AMOUNT_V1 = 20_000;

/**
 * A fullnode "Invalid transaction: Type: Validation" error means the transaction was
 * refused before it reached the chain (for example INSUFFICIENT_BALANCE_FOR_TRANSACTION_FEE
 * or SEQUENCE_NUMBER_TOO_OLD). It can never execute, so it is a rejection, not an unknown
 * outcome, and the order state is unchanged.
 */
export function isDecibelPreSubmissionRejectionV1(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Invalid transaction: Type: Validation/i.test(message);
}
export const DECIBEL_PRODUCTION_CANCEL_TRANSPORT_TIMEOUT_MS_V1 = 20_000;
const APT_OCTAS_PER_APT = 100_000_000;

type decibel_chain_unit = bigint;

export const DECIBEL_CLIENT_ORDER_ID_MAX_BYTES_V1 = 32;

export interface DecibelProductionWriteClientV1 {
  placeOrder(input: {
    marketName: string;
    price: decibel_chain_unit;
    size: decibel_chain_unit;
    isBuy: boolean;
    timeInForce: 0 | 1 | 2;
    isReduceOnly: boolean;
    clientOrderId?: string;
    subaccountAddr?: string;
  }): Promise<
    PlaceOrderResult & Readonly<{ transactionHash?: string; expirationTimestampMs?: number }>
  >;
  cancelOrder(input: {
    orderId: string;
    marketAddr: string;
    subaccountAddr?: string;
  }): Promise<unknown>;
  /** Full-size position SL: no size, so the venue sizes it to the whole position. */
  placeTpSlOrderForPosition?(input: {
    marketAddr: string;
    slTriggerPrice: decibel_chain_unit;
    slLimitPrice: decibel_chain_unit;
    subaccountAddr?: string;
  }): Promise<Readonly<{ success?: boolean; hash?: string; vm_status?: string }>>;
}

export type decibel_execution_gas_diagnostics_v1 = Readonly<{
  primaryAccountAddress: string;
  subaccountAddress: string;
  primaryAccountAptBalance: number;
  subaccountAptBalance: number;
  maxGasAmount: number;
  resolvedMarketAddress?: string;
  subaccountObjectExists?: boolean;
  marketObjectExists?: boolean;
}>;

type decibel_production_write_connection_v1 = Readonly<{
  client: DecibelProductionWriteClientV1;
  subaccount: string;
  getGasDiagnostics?: () => Promise<decibel_execution_gas_diagnostics_v1>;
}>;

export function capDecibelProductionMaxGasAmountV1(value?: number): number {
  return Math.min(
    value ?? DECIBEL_PRODUCTION_MAX_GAS_AMOUNT_V1,
    DECIBEL_PRODUCTION_MAX_GAS_AMOUNT_V1,
  );
}

type decibel_production_executor_environment_v1 = Readonly<{
  DECIBEL_NETWORK?: string;
  DECIBEL_NODE_API_KEY?: string;
  DECIBEL_PRIVATE_KEY?: string;
  DECIBEL_SUBACCOUNT_ADDRESS?: string;
}>;

function assertIdentity(value: string, blocker: string): void {
  if (value.trim().length === 0) throw new Error(blocker);
}

function assertClientOrderId(value: string): void {
  assertIdentity(value, 'PRODUCTION_EXECUTOR_PLACE_CONTRACT_REJECTED');
  if (
    !/^[\x20-\x7e]+$/.test(value) ||
    Buffer.byteLength(value, 'utf8') > DECIBEL_CLIENT_ORDER_ID_MAX_BYTES_V1
  )
    throw new Error('PRODUCTION_EXECUTOR_CLIENT_ORDER_ID_INVALID');
}

function validatePlaceIntent(intent: place_intent_v1): void {
  const sessionUnwindIoc = intent.executionRole === 'SESSION_UNWIND_IOC';
  if (
    intent.market !== 'BTC/USD' ||
    intent.action !== 'PLACE' ||
    intent.type !== 'LIMIT' ||
    (sessionUnwindIoc
      ? intent.timeInForce !== 'ImmediateOrCancel' || intent.postOnly || !intent.reduceOnly
      : intent.timeInForce !== 'PostOnly' || !intent.postOnly) ||
    ![
      'STANDARD_MAKER',
      'INVENTORY_REDUCING_MAKER',
      'TAKE_PROFIT_MAKER',
      'SESSION_UNWIND_IOC',
    ].includes(intent.executionRole) ||
    intent.selfTradePermitted ||
    !intent.externalCounterpartyRequired ||
    !Number.isFinite(intent.price) ||
    intent.price <= 0 ||
    !Number.isFinite(intent.quantity) ||
    intent.quantity <= 0 ||
    !Number.isSafeInteger(intent.priceTicks) ||
    intent.priceTicks <= 0 ||
    !Number.isSafeInteger(intent.quantityLots) ||
    intent.quantityLots <= 0
  )
    throw new Error('PRODUCTION_EXECUTOR_PLACE_CONTRACT_REJECTED');
  assertIdentity(intent.intentId, 'PRODUCTION_EXECUTOR_PLACE_CONTRACT_REJECTED');
  assertIdentity(intent.mutationKey, 'PRODUCTION_EXECUTOR_PLACE_CONTRACT_REJECTED');
  assertClientOrderId(intent.clientOrderId);
  assertIdentity(intent.sourceStateHash, 'PRODUCTION_EXECUTOR_PLACE_CONTRACT_REJECTED');
  assertIdentity(intent.strategyDecisionHash, 'PRODUCTION_EXECUTOR_PLACE_CONTRACT_REJECTED');
}

function validateCancelIntent(intent: cancel_intent_v1): void {
  if (intent.market !== 'BTC/USD' || intent.action !== 'CANCEL')
    throw new Error('PRODUCTION_EXECUTOR_CANCEL_CONTRACT_REJECTED');
  assertIdentity(intent.intentId, 'PRODUCTION_EXECUTOR_CANCEL_CONTRACT_REJECTED');
  assertIdentity(intent.mutationKey, 'PRODUCTION_EXECUTOR_CANCEL_CONTRACT_REJECTED');
  assertIdentity(
    intent.expectedPreviousVenueOrderId,
    'PRODUCTION_EXECUTOR_CANCEL_CONTRACT_REJECTED',
  );
}

/** Independent read-only RPCs; every existing gas/object check still completes before submission. */
export async function readDecibelGasAccountEvidenceV1(
  readers: Readonly<{
    readPrimaryBalance: () => Promise<number>;
    readSubaccountBalance: () => Promise<number>;
    readSubaccountExists: () => Promise<boolean>;
    readMarketExists: () => Promise<boolean>;
  }>,
) {
  const [
    primaryAccountAptBalance,
    subaccountAptBalance,
    subaccountObjectExists,
    marketObjectExists,
  ] = await Promise.all([
    readers.readPrimaryBalance(),
    readers.readSubaccountBalance(),
    readers.readSubaccountExists(),
    readers.readMarketExists(),
  ]);
  return Object.freeze({
    primaryAccountAptBalance,
    subaccountAptBalance,
    subaccountObjectExists,
    marketObjectExists,
  });
}

async function createWriteClient(
  environment: decibel_production_executor_environment_v1,
): Promise<decibel_production_write_connection_v1> {
  if (environment.DECIBEL_NETWORK !== 'mainnet')
    throw new Error('PRODUCTION_EXECUTOR_MAINNET_REQUIRED');
  const privateKey = environment.DECIBEL_PRIVATE_KEY;
  const subaccount = environment.DECIBEL_SUBACCOUNT_ADDRESS?.trim();
  if (!privateKey) throw new Error('PRODUCTION_EXECUTOR_PRIVATE_KEY_REQUIRED');
  if (!subaccount) throw new Error('PRODUCTION_EXECUTOR_SUBACCOUNT_REQUIRED');
  const [
    { Account, AccountAddress, Ed25519PrivateKey, MoveString, createObjectAddress },
    { DecibelWriteDex, MAINNET_CONFIG },
  ] = await Promise.all([import('@aptos-labs/ts-sdk'), loadDecibelSdkRuntimeV1()]);
  const Signer = Account.fromPrivateKey({
    privateKey: new Ed25519PrivateKey(privateKey),
  });
  class decibel_capped_gas_write_dex_v1 extends DecibelWriteDex {
    public latestTransactionHash: string | null = null;
    public latestExpirationTimestampMs: number | null = null;
    public override buildTx(
      payload: InputGenerateTransactionPayloadData & {
        maxGasAmount?: number;
        gasUnitPrice?: number;
      },
      sender: AccountAddress,
    ): Promise<SimpleTransaction> {
      return super
        .buildTx(
          {
            ...payload,
            maxGasAmount: capDecibelProductionMaxGasAmountV1(payload.maxGasAmount),
          },
          sender,
        )
        .then((transaction) => {
          this.latestExpirationTimestampMs =
            Number(transaction.rawTransaction.expiration_timestamp_secs) * 1_000;
          return transaction;
        });
    }
    public override async submitTx(
      transaction: SimpleTransaction,
      senderAuthenticator: AccountAuthenticator,
    ): Promise<PendingTransactionResponse> {
      const pending = await super.submitTx(transaction, senderAuthenticator);
      this.latestTransactionHash = pending.hash;
      return pending;
    }
  }
  const Client = new decibel_capped_gas_write_dex_v1(MAINNET_CONFIG, Signer, {
    ...(environment.DECIBEL_NODE_API_KEY ? { nodeApiKey: environment.DECIBEL_NODE_API_KEY } : {}),
  });
  const WriteClient: DecibelProductionWriteClientV1 = {
    placeOrder: async (input) => {
      Client.latestTransactionHash = null;
      Client.latestExpirationTimestampMs = null;
      const result = await Client.placeOrder({
        ...input,
        // SDK 0.7.0 declares human-unit numbers but forwards these values directly
        // to Move u64 arguments. BigInt chain units are required at this boundary.
        price: input.price as unknown as number,
        size: input.size as unknown as number,
        accountOverride: Signer,
      });
      return {
        ...result,
        ...(Client.latestTransactionHash === null
          ? {}
          : { transactionHash: Client.latestTransactionHash }),
        ...(Client.latestExpirationTimestampMs === null
          ? {}
          : { expirationTimestampMs: Client.latestExpirationTimestampMs }),
      };
    },
    cancelOrder: (input) => Client.cancelOrder({ ...input, accountOverride: Signer }),
    placeTpSlOrderForPosition: (input) =>
      Client.placeTpSlOrderForPosition({
        ...input,
        // Chain units, as for placeOrder: SDK 0.7.0 forwards these to Move u64 arguments.
        slTriggerPrice: input.slTriggerPrice as unknown as number,
        slLimitPrice: input.slLimitPrice as unknown as number,
        accountOverride: Signer,
      }),
  };
  const getAptBalance = async (accountAddress: string | AccountAddress): Promise<number> =>
    (await Client.aptos.getAccountAPTAmount({ accountAddress })) / APT_OCTAS_PER_APT;
  const resolvedMarketAddress = createObjectAddress(
    AccountAddress.fromString(MAINNET_CONFIG.deployment.perpEngineGlobal),
    new MoveString('BTC/USD').bcsToBytes(),
  ).toString();
  if (resolvedMarketAddress.toLowerCase() !== BTC_USD_MARKET_ADDRESS)
    throw new Error('PRODUCTION_EXECUTOR_BTC_MARKET_IDENTITY_MISMATCH');
  const hasObjectResource = async (
    accountAddress: string,
    resourceType: string,
  ): Promise<boolean> => {
    try {
      await Client.aptos.getAccountResource({
        accountAddress,
        resourceType: resourceType as `${string}::${string}::${string}`,
      });
      return true;
    } catch {
      return false;
    }
  };
  return Object.freeze({
    client: WriteClient,
    subaccount,
    getGasDiagnostics: async () => {
      const evidence = await readDecibelGasAccountEvidenceV1({
        readPrimaryBalance: () => getAptBalance(Signer.accountAddress),
        readSubaccountBalance: () => getAptBalance(subaccount),
        readSubaccountExists: () =>
          hasObjectResource(
            subaccount,
            `${MAINNET_CONFIG.deployment.package}::dex_accounts::Subaccount`,
          ),
        readMarketExists: () =>
          hasObjectResource(
            resolvedMarketAddress,
            `${MAINNET_CONFIG.deployment.package}::perp_market::PerpMarket`,
          ),
      });
      return Object.freeze({
        primaryAccountAddress: Signer.accountAddress.toString(),
        subaccountAddress: subaccount,
        ...evidence,
        maxGasAmount: DECIBEL_PRODUCTION_MAX_GAS_AMOUNT_V1,
        resolvedMarketAddress,
      });
    },
  });
}

export class decibel_external_production_executor_v1 implements DecibelProductionExecutionExecutorV1 {
  private Connection: decibel_production_write_connection_v1 | null = null;

  constructor(
    private readonly GetConnection: () =>
      decibel_production_write_connection_v1 | Promise<decibel_production_write_connection_v1>,
    private readonly CancelTransportTimeoutMs = DECIBEL_PRODUCTION_CANCEL_TRANSPORT_TIMEOUT_MS_V1,
    private readonly getNow: () => number = Date.now,
  ) {}

  async placePostOnlyLimit(intent: place_intent_v1): Promise<production_execution_result_v1> {
    return this.placeOrder(intent, DECIBEL_POST_ONLY_TIME_IN_FORCE);
  }

  async placeReduceOnlyImmediateOrCancel(
    intent: place_intent_v1,
  ): Promise<production_execution_result_v1> {
    return this.placeOrder(intent, DECIBEL_IMMEDIATE_OR_CANCEL_TIME_IN_FORCE);
  }

  private async placeOrder(
    intent: place_intent_v1,
    timeInForce: 1 | 2,
  ): Promise<production_execution_result_v1> {
    validatePlaceIntent(intent);
    const startedAt = this.getNow();
    try {
      this.logSubmissionStage(intent, 'CONNECTION_RESOLUTION', startedAt);
      const { client, subaccount } = await this.getConnection();
      this.logSubmissionStage(intent, 'GAS_DIAGNOSTICS', startedAt);
      await this.logGasDiagnostics();
      console.info(
        JSON.stringify({
          event: 'DECIBEL_PLACE_ORDER_ARGUMENTS',
          entryFunction: 'dex_accounts_entry::place_order_to_subaccount',
          subaccountObjectAddress: subaccount,
          marketObjectAddress: BTC_USD_MARKET_ADDRESS,
          priceChainUnits: scaleDecimalToChainUnitsV1(
            intent.price,
            BTC_USD_PRICE_DECIMALS,
          ).toString(),
          sizeChainUnits: getDecibelQuantityUnitsV1(
            intent.quantity,
            BTC_USD_SIZE_DECIMALS,
          ).toString(),
          isBuy: intent.side === 'BUY',
          timeInForce,
          isReduceOnly: intent.reduceOnly,
          clientOrderId: intent.clientOrderId,
        }),
      );
      this.logSubmissionStage(intent, 'SDK_PLACE_ORDER', startedAt);
      const result = await client.placeOrder({
        marketName: 'BTC/USD',
        price: scaleDecimalToChainUnitsV1(intent.price, BTC_USD_PRICE_DECIMALS),
        size: getDecibelQuantityUnitsV1(intent.quantity, BTC_USD_SIZE_DECIMALS),
        isBuy: intent.side === 'BUY',
        timeInForce,
        isReduceOnly: intent.reduceOnly,
        clientOrderId: intent.clientOrderId,
        subaccountAddr: subaccount,
      });
      this.logSubmissionStage(intent, 'SDK_PLACE_ORDER_COMPLETE', startedAt);
      if (!result.success && isDecibelPreSubmissionRejectionV1(result.error))
        return Object.freeze({ outcome: 'PLACE_REJECTED' });
      if (!result.success || !result.orderId)
        return Object.freeze({
          outcome: 'PLACE_OUTCOME_UNKNOWN',
          ...('transactionHash' in result ? { transactionHash: result.transactionHash } : {}),
          ...(result.expirationTimestampMs === undefined
            ? {}
            : { expirationTimestampMs: result.expirationTimestampMs }),
        });
      return Object.freeze({
        outcome: 'PLACE_ACKNOWLEDGED',
        venueOrderId: result.orderId,
        transactionHash: result.transactionHash,
        ...(result.expirationTimestampMs === undefined
          ? {}
          : { expirationTimestampMs: result.expirationTimestampMs }),
      });
    } catch (error) {
      this.logSubmissionFailure(intent, error);
      if (isDecibelPreSubmissionRejectionV1(error))
        return Object.freeze({ outcome: 'PLACE_REJECTED' });
      return Object.freeze({ outcome: 'PLACE_OUTCOME_UNKNOWN' });
    }
  }

  async cancelExactOrder(intent: cancel_intent_v1): Promise<production_execution_result_v1> {
    validateCancelIntent(intent);
    const startedAt = this.getNow();
    let Timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      this.logCancelStage(intent, 'CONNECTION_RESOLUTION', startedAt);
      const { client, subaccount } = await this.getConnection();
      this.logCancelStage(intent, 'GAS_DIAGNOSTICS', startedAt);
      await this.logGasDiagnostics();
      this.logCancelStage(intent, 'SDK_CANCEL_ORDER_START', startedAt);
      const timeout = new Promise<'TIMEOUT'>((resolve) => {
        Timeout = setTimeout(() => resolve('TIMEOUT'), this.CancelTransportTimeoutMs);
      });
      const result = await Promise.race([
        client.cancelOrder({
          orderId: intent.expectedPreviousVenueOrderId,
          marketAddr: BTC_USD_MARKET_ADDRESS,
          subaccountAddr: subaccount,
        }),
        timeout,
      ]);
      if (result === 'TIMEOUT') {
        this.logCancelStage(intent, 'SDK_CANCEL_ORDER_TIMEOUT', startedAt);
        return Object.freeze({ outcome: 'CANCEL_OUTCOME_UNKNOWN' });
      }
      this.logCancelStage(intent, 'SDK_CANCEL_ORDER_COMPLETE', startedAt);
      return Object.freeze({
        outcome: 'CANCEL_CONFIRMED',
        venueOrderId: intent.expectedPreviousVenueOrderId,
      });
    } catch (error) {
      this.logCancelStage(intent, 'SDK_CANCEL_ORDER_ERROR', startedAt, error);
      if (isDecibelPreSubmissionRejectionV1(error))
        return Object.freeze({ outcome: 'CANCEL_REJECTED' });
      return Object.freeze({ outcome: 'CANCEL_OUTCOME_UNKNOWN' });
    } finally {
      if (Timeout !== undefined) clearTimeout(Timeout);
    }
  }

  async placeCatastropheStop(
    request: decibel_catastrophe_stop_request_v1,
  ): Promise<decibel_catastrophe_stop_result_v1> {
    if (
      !['BUY', 'SELL'].includes(request.side) ||
      ![request.triggerPrice, request.limitPrice].every((v) => Number.isFinite(v) && v > 0) ||
      (request.side === 'SELL'
        ? request.limitPrice >= request.triggerPrice
        : request.limitPrice <= request.triggerPrice)
    )
      throw new Error('PRODUCTION_EXECUTOR_CATASTROPHE_STOP_CONTRACT_REJECTED');
    try {
      const { client, subaccount } = await this.getConnection();
      if (client.placeTpSlOrderForPosition === undefined)
        return Object.freeze({ outcome: 'STOP_REJECTED', detail: 'CLIENT_UNSUPPORTED' });
      const result = await client.placeTpSlOrderForPosition({
        marketAddr: BTC_USD_MARKET_ADDRESS,
        slTriggerPrice: scaleDecimalToChainUnitsV1(request.triggerPrice, BTC_USD_PRICE_DECIMALS),
        slLimitPrice: scaleDecimalToChainUnitsV1(request.limitPrice, BTC_USD_PRICE_DECIMALS),
        subaccountAddr: subaccount,
      });
      return Object.freeze({
        outcome: result.success === false ? 'STOP_REJECTED' : 'STOP_SUBMITTED',
        ...(result.hash ? { transactionHash: result.hash } : {}),
        ...(result.vm_status ? { detail: result.vm_status.slice(0, 200) } : {}),
      });
    } catch (error) {
      return Object.freeze({
        outcome: isDecibelPreSubmissionRejectionV1(error)
          ? 'STOP_REJECTED'
          : 'STOP_OUTCOME_UNKNOWN',
        detail: (error instanceof Error ? error.message : String(error)).slice(0, 200),
      });
    }
  }

  public async readAccountDiagnostics(): Promise<decibel_execution_gas_diagnostics_v1> {
    const connection = await this.getConnection();
    if (connection.getGasDiagnostics === undefined)
      throw new Error('PRODUCTION_EXECUTOR_GAS_DIAGNOSTICS_UNAVAILABLE');
    return connection.getGasDiagnostics();
  }

  private async getConnection() {
    if (this.Connection === null) this.Connection = await this.GetConnection();
    return this.Connection;
  }

  private async logGasDiagnostics(): Promise<void> {
    const connection = await this.getConnection();
    if (connection.getGasDiagnostics === undefined) return;
    const diagnostics = await connection.getGasDiagnostics();
    console.info(
      JSON.stringify({ event: 'DECIBEL_EXECUTION_GAS_PAYER_DIAGNOSTIC', ...diagnostics }),
    );
    if (diagnostics.subaccountObjectExists === false)
      throw new Error('PRODUCTION_EXECUTOR_SUBACCOUNT_OBJECT_NOT_FOUND');
    if (diagnostics.marketObjectExists === false)
      throw new Error('PRODUCTION_EXECUTOR_BTC_MARKET_OBJECT_NOT_FOUND');
    if (
      diagnostics.resolvedMarketAddress !== undefined &&
      diagnostics.resolvedMarketAddress.toLowerCase() !== BTC_USD_MARKET_ADDRESS
    )
      throw new Error('PRODUCTION_EXECUTOR_BTC_MARKET_IDENTITY_MISMATCH');
  }

  private logSubmissionStage(
    intent: place_intent_v1,
    stage:
      'CONNECTION_RESOLUTION' | 'GAS_DIAGNOSTICS' | 'SDK_PLACE_ORDER' | 'SDK_PLACE_ORDER_COMPLETE',
    startedAt: number,
  ): void {
    const observedAt = this.getNow();
    console.info(
      JSON.stringify({
        event: 'DECIBEL_EXECUTION_SUBMISSION_STAGE',
        intentId: intent.intentId,
        clientOrderId: intent.clientOrderId,
        stage,
        observedAt,
        elapsedMs: Math.max(0, observedAt - startedAt),
      }),
    );
  }

  private logSubmissionFailure(intent: place_intent_v1, error: unknown): void {
    const name = error instanceof Error ? error.name : 'UnknownError';
    const message =
      error instanceof Error
        ? error.message.replace(/0x[a-fA-F0-9]{32,}/g, '[REDACTED_HEX]').slice(0, 300)
        : 'UNKNOWN_EXECUTOR_FAILURE';
    console.error(
      JSON.stringify({
        event: 'DECIBEL_EXECUTION_SUBMISSION_FAILED',
        intentId: intent.intentId,
        clientOrderId: intent.clientOrderId,
        errorName: name,
        errorMessage: message,
      }),
    );
  }

  private logCancelStage(
    intent: cancel_intent_v1,
    stage:
      | 'CONNECTION_RESOLUTION'
      | 'GAS_DIAGNOSTICS'
      | 'SDK_CANCEL_ORDER_START'
      | 'SDK_CANCEL_ORDER_COMPLETE'
      | 'SDK_CANCEL_ORDER_TIMEOUT'
      | 'SDK_CANCEL_ORDER_ERROR',
    startedAt: number,
    error?: unknown,
  ): void {
    console.info(
      JSON.stringify({
        event: 'DECIBEL_EXECUTION_CANCEL_STAGE',
        intentId: intent.intentId,
        clientOrderId: intent.clientOrderId,
        venueOrderId: intent.expectedPreviousVenueOrderId,
        stage,
        elapsedMs: Math.max(0, this.getNow() - startedAt),
        ...(error instanceof Error
          ? { errorName: error.name, errorMessage: error.message.slice(0, 200) }
          : {}),
      }),
    );
  }
}

export function createDecibelProductionExecutorV1(): DecibelProductionExecutionExecutorV1 {
  return new decibel_external_production_executor_v1(() => createWriteClient(process.env));
}
