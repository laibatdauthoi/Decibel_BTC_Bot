import type { PlaceOrderResult } from '@decibeltrade/sdk';
import type {
  AccountAddress,
  InputGenerateTransactionPayloadData,
  SimpleTransaction,
} from '@aptos-labs/ts-sdk';

import type { cancel_intent_v1, place_intent_v1 } from './decibel_execution_intent_v1.js';
import { scaleDecimalToChainUnitsV1 } from './decibel_chain_units_v1.js';
import {
  DECIBEL_PRODUCTION_EXECUTOR_HANDOFF_V1,
  type DecibelProductionExecutionExecutorV1,
  type production_execution_result_v1,
} from './decibel_production_executor_handoff_v1.js';
import { loadDecibelSdkRuntimeV1 } from './decibel_sdk_runtime_v1.js';

export const DECIBEL_EXTERNAL_PRODUCTION_EXECUTOR_V1 = DECIBEL_PRODUCTION_EXECUTOR_HANDOFF_V1;

const BTC_USD_MARKET_ADDRESS = '0x5e0e16f34adfb4b316f8d532d68acbfa206826feaaa418d3938046bdc2044861';
const DECIBEL_POST_ONLY_TIME_IN_FORCE = 1;
const BTC_USD_PRICE_DECIMALS = 6;
const BTC_USD_SIZE_DECIMALS = 8;
export const DECIBEL_PRODUCTION_MAX_GAS_AMOUNT_V1 = 200_000;
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
  }): Promise<PlaceOrderResult>;
  cancelOrder(input: {
    orderId: string;
    marketAddr: string;
    subaccountAddr?: string;
  }): Promise<unknown>;
}

type decibel_execution_gas_diagnostics_v1 = Readonly<{
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
  if (
    intent.market !== 'BTC/USD' ||
    intent.action !== 'PLACE' ||
    intent.type !== 'LIMIT' ||
    !intent.postOnly ||
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
    public override buildTx(
      payload: InputGenerateTransactionPayloadData & {
        maxGasAmount?: number;
        gasUnitPrice?: number;
      },
      sender: AccountAddress,
    ): Promise<SimpleTransaction> {
      return super.buildTx(
        {
          ...payload,
          maxGasAmount: capDecibelProductionMaxGasAmountV1(payload.maxGasAmount),
        },
        sender,
      );
    }
  }
  const Client = new decibel_capped_gas_write_dex_v1(MAINNET_CONFIG, Signer, {
    ...(environment.DECIBEL_NODE_API_KEY ? { nodeApiKey: environment.DECIBEL_NODE_API_KEY } : {}),
  });
  const WriteClient: DecibelProductionWriteClientV1 = {
    placeOrder: (input) =>
      Client.placeOrder({
        ...input,
        // SDK 0.7.0 declares human-unit numbers but forwards these values directly
        // to Move u64 arguments. BigInt chain units are required at this boundary.
        price: input.price as unknown as number,
        size: input.size as unknown as number,
        accountOverride: Signer,
      }),
    cancelOrder: (input) => Client.cancelOrder({ ...input, accountOverride: Signer }),
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
    getGasDiagnostics: async () =>
      Object.freeze({
        primaryAccountAddress: Signer.accountAddress.toString(),
        subaccountAddress: subaccount,
        primaryAccountAptBalance: await getAptBalance(Signer.accountAddress),
        subaccountAptBalance: await getAptBalance(subaccount),
        maxGasAmount: DECIBEL_PRODUCTION_MAX_GAS_AMOUNT_V1,
        resolvedMarketAddress,
        subaccountObjectExists: await hasObjectResource(
          subaccount,
          `${MAINNET_CONFIG.deployment.package}::dex_accounts::Subaccount`,
        ),
        marketObjectExists: await hasObjectResource(
          resolvedMarketAddress,
          `${MAINNET_CONFIG.deployment.package}::perp_market::PerpMarket`,
        ),
      }),
  });
}

export class decibel_external_production_executor_v1 implements DecibelProductionExecutionExecutorV1 {
  private Connection: decibel_production_write_connection_v1 | null = null;

  constructor(
    private readonly GetConnection: () =>
      decibel_production_write_connection_v1 | Promise<decibel_production_write_connection_v1>,
  ) {}

  async placePostOnlyLimit(intent: place_intent_v1): Promise<production_execution_result_v1> {
    validatePlaceIntent(intent);
    try {
      const { client, subaccount } = await this.getConnection();
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
          sizeChainUnits: scaleDecimalToChainUnitsV1(
            intent.quantity,
            BTC_USD_SIZE_DECIMALS,
          ).toString(),
          isBuy: intent.side === 'BUY',
          timeInForce: DECIBEL_POST_ONLY_TIME_IN_FORCE,
          isReduceOnly: false,
          clientOrderId: intent.clientOrderId,
        }),
      );
      const result = await client.placeOrder({
        marketName: 'BTC/USD',
        price: scaleDecimalToChainUnitsV1(intent.price, BTC_USD_PRICE_DECIMALS),
        size: scaleDecimalToChainUnitsV1(intent.quantity, BTC_USD_SIZE_DECIMALS),
        isBuy: intent.side === 'BUY',
        timeInForce: DECIBEL_POST_ONLY_TIME_IN_FORCE,
        isReduceOnly: false,
        clientOrderId: intent.clientOrderId,
        subaccountAddr: subaccount,
      });
      if (!result.success || !result.orderId)
        return Object.freeze({ outcome: 'PLACE_OUTCOME_UNKNOWN' });
      return Object.freeze({
        outcome: 'PLACE_ACKNOWLEDGED',
        venueOrderId: result.orderId,
      });
    } catch {
      return Object.freeze({ outcome: 'PLACE_OUTCOME_UNKNOWN' });
    }
  }

  async cancelExactOrder(intent: cancel_intent_v1): Promise<production_execution_result_v1> {
    validateCancelIntent(intent);
    try {
      const { client, subaccount } = await this.getConnection();
      await this.logGasDiagnostics();
      await client.cancelOrder({
        orderId: intent.expectedPreviousVenueOrderId,
        marketAddr: BTC_USD_MARKET_ADDRESS,
        subaccountAddr: subaccount,
      });
      return Object.freeze({
        outcome: 'CANCEL_CONFIRMED',
        venueOrderId: intent.expectedPreviousVenueOrderId,
      });
    } catch {
      return Object.freeze({ outcome: 'CANCEL_OUTCOME_UNKNOWN' });
    }
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
}

export function createDecibelProductionExecutorV1(): DecibelProductionExecutionExecutorV1 {
  return new decibel_external_production_executor_v1(() => createWriteClient(process.env));
}
