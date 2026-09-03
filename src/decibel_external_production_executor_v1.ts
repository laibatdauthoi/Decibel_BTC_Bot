import type { PlaceOrderResult } from '@decibeltrade/sdk';

import type { cancel_intent_v1, place_intent_v1 } from './decibel_execution_intent_v1.js';
import {
  DECIBEL_PRODUCTION_EXECUTOR_HANDOFF_V1,
  type DecibelProductionExecutionExecutorV1,
  type production_execution_result_v1,
} from './decibel_production_executor_handoff_v1.js';
import { loadDecibelSdkRuntimeV1 } from './decibel_sdk_runtime_v1.js';

export const DECIBEL_EXTERNAL_PRODUCTION_EXECUTOR_V1 = DECIBEL_PRODUCTION_EXECUTOR_HANDOFF_V1;

const BTC_USD_MARKET_ADDRESS = '0x5e0e16f34adfb4b316f8d532d68acbfa206826feaaa418d3938046bdc2044861';
const DECIBEL_POST_ONLY_TIME_IN_FORCE = 1;

export interface DecibelProductionWriteClientV1 {
  placeOrder(input: {
    marketName: string;
    price: number;
    size: number;
    isBuy: boolean;
    timeInForce: number;
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

type decibel_production_executor_environment_v1 = Readonly<{
  DECIBEL_NETWORK?: string;
  DECIBEL_NODE_API_KEY?: string;
  DECIBEL_PRIVATE_KEY?: string;
  DECIBEL_SUBACCOUNT_ADDRESS?: string;
}>;

function assertIdentity(value: string, blocker: string): void {
  if (value.trim().length === 0) throw new Error(blocker);
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
  assertIdentity(intent.clientOrderId, 'PRODUCTION_EXECUTOR_PLACE_CONTRACT_REJECTED');
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
): Promise<Readonly<{ client: DecibelProductionWriteClientV1; subaccount: string }>> {
  if (environment.DECIBEL_NETWORK !== 'mainnet')
    throw new Error('PRODUCTION_EXECUTOR_MAINNET_REQUIRED');
  const privateKey = environment.DECIBEL_PRIVATE_KEY;
  const subaccount = environment.DECIBEL_SUBACCOUNT_ADDRESS?.trim();
  if (!privateKey) throw new Error('PRODUCTION_EXECUTOR_PRIVATE_KEY_REQUIRED');
  if (!subaccount) throw new Error('PRODUCTION_EXECUTOR_SUBACCOUNT_REQUIRED');
  const [{ Account, Ed25519PrivateKey }, { DecibelWriteDex, MAINNET_CONFIG }] = await Promise.all([
    import('@aptos-labs/ts-sdk'),
    loadDecibelSdkRuntimeV1(),
  ]);
  const Signer = Account.fromPrivateKey({
    privateKey: new Ed25519PrivateKey(privateKey),
  });
  const Client = new DecibelWriteDex(MAINNET_CONFIG, Signer, {
    ...(environment.DECIBEL_NODE_API_KEY ? { nodeApiKey: environment.DECIBEL_NODE_API_KEY } : {}),
  });
  return Object.freeze({ client: Client, subaccount });
}

export class decibel_external_production_executor_v1 implements DecibelProductionExecutionExecutorV1 {
  private Connection: Readonly<{
    client: DecibelProductionWriteClientV1;
    subaccount: string;
  }> | null = null;

  constructor(
    private readonly GetConnection: () =>
      | Readonly<{
          client: DecibelProductionWriteClientV1;
          subaccount: string;
        }>
      | Promise<
          Readonly<{
            client: DecibelProductionWriteClientV1;
            subaccount: string;
          }>
        >,
  ) {}

  async placePostOnlyLimit(intent: place_intent_v1): Promise<production_execution_result_v1> {
    validatePlaceIntent(intent);
    try {
      const { client, subaccount } = await this.getConnection();
      const result = await client.placeOrder({
        marketName: 'BTC-USD',
        price: intent.price,
        size: intent.quantity,
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
}

export function createDecibelProductionExecutorV1(): DecibelProductionExecutionExecutorV1 {
  return new decibel_external_production_executor_v1(() => createWriteClient(process.env));
}
