import { describe, expect, it, vi } from 'vitest';

import {
  buildDecibelExecutionIntentV1,
  type cancel_intent_v1,
  type place_intent_v1,
} from '../src/decibel_execution_intent_v1.js';
import {
  capDecibelProductionMaxGasAmountV1,
  createDecibelProductionExecutorV1,
  DECIBEL_PRODUCTION_MAX_GAS_AMOUNT_V1,
  DECIBEL_EXTERNAL_PRODUCTION_EXECUTOR_V1,
  decibel_external_production_executor_v1,
  type DecibelProductionWriteClientV1,
} from '../src/decibel_external_production_executor_v1.js';
import { DECIBEL_PRODUCTION_EXECUTOR_HANDOFF_V1 } from '../src/decibel_production_executor_handoff_v1.js';

const buildPlace = (): place_intent_v1 => {
  const intent = buildDecibelExecutionIntentV1({
    sessionId: 'session-one',
    cycleSequence: 1,
    action: 'PLACE',
    market: 'BTC/USD',
    side: 'BUY',
    price: 100,
    quantity: 0.1,
    tickSize: 0.1,
    lotSize: 0.01,
    clientOrderId: 'client-one',
    knownVenueOrderId: null,
    sourceStateHash: 'source-state',
    strategyDecisionHash: 'strategy-decision',
    createdAt: 1,
  });
  if (intent.action !== 'PLACE') {
    throw new Error('TEST_PLACE_INTENT_BUILD_FAILED');
  }
  return intent;
};

const buildCancel = (): cancel_intent_v1 => {
  const intent = buildDecibelExecutionIntentV1({
    sessionId: 'session-one',
    cycleSequence: 2,
    action: 'CANCEL',
    market: 'BTC/USD',
    side: 'BUY',
    price: 100,
    quantity: 0.1,
    tickSize: 0.1,
    lotSize: 0.01,
    clientOrderId: 'client-one',
    knownVenueOrderId: 'venue-one',
    sourceStateHash: 'source-state',
    strategyDecisionHash: 'strategy-decision',
    createdAt: 2,
  });
  if (intent.action !== 'CANCEL') {
    throw new Error('TEST_CANCEL_INTENT_BUILD_FAILED');
  }
  return intent;
};

function setup(input?: {
  place?: DecibelProductionWriteClientV1['placeOrder'];
  cancel?: DecibelProductionWriteClientV1['cancelOrder'];
}) {
  const placeOrder = vi.fn(
    input?.place ??
      (() =>
        Promise.resolve({
          success: true as const,
          orderId: 'venue-one',
          transactionHash: 'transaction-one',
        })),
  );
  const cancelOrder = vi.fn(input?.cancel ?? (() => Promise.resolve({ hash: 'transaction-two' })));
  const Client: DecibelProductionWriteClientV1 = { placeOrder, cancelOrder };
  const Executor = new decibel_external_production_executor_v1(() => ({
    client: Client,
    subaccount: 'subaccount-one',
  }));
  return { Executor, placeOrder, cancelOrder };
}

describe('Decibel external production executor V1', () => {
  it('caps every transaction build at the conservative production gas limit', () => {
    expect(capDecibelProductionMaxGasAmountV1()).toBe(200_000);
    expect(capDecibelProductionMaxGasAmountV1(10_000)).toBe(10_000);
    expect(capDecibelProductionMaxGasAmountV1(2_000_000)).toBe(200_000);
    expect(DECIBEL_PRODUCTION_MAX_GAS_AMOUNT_V1).toBe(200_000);
  });

  it('exports the frozen handoff identity', () => {
    expect(DECIBEL_EXTERNAL_PRODUCTION_EXECUTOR_V1).toBe(DECIBEL_PRODUCTION_EXECUTOR_HANDOFF_V1);
  });

  it('factory is lazy and does not load credentials or submit at construction', () => {
    const Executor = createDecibelProductionExecutorV1();
    expect(typeof Executor.placePostOnlyLimit).toBe('function');
    expect(typeof Executor.cancelExactOrder).toBe('function');
  });

  it('preserves exact PLACE fields and invokes PostOnly transport once', async () => {
    const { Executor, placeOrder } = setup();
    const intent = buildPlace();
    await expect(Executor.placePostOnlyLimit(intent)).resolves.toEqual({
      outcome: 'PLACE_ACKNOWLEDGED',
      venueOrderId: 'venue-one',
    });
    expect(placeOrder).toHaveBeenCalledTimes(1);
    expect(placeOrder).toHaveBeenCalledWith({
      marketName: 'BTC/USD',
      price: 100_000_000n,
      size: 10_000_000n,
      isBuy: true,
      timeInForce: 1,
      isReduceOnly: false,
      clientOrderId: intent.clientOrderId,
      subaccountAddr: 'subaccount-one',
    });
  });

  it('logs the exact public Move arguments before placement', async () => {
    const { Executor, placeOrder } = setup();
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const intent = buildPlace();

    await Executor.placePostOnlyLimit(intent);

    expect(info).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'DECIBEL_PLACE_ORDER_ARGUMENTS',
        entryFunction: 'dex_accounts_entry::place_order_to_subaccount',
        subaccountObjectAddress: 'subaccount-one',
        marketObjectAddress: '0x5e0e16f34adfb4b316f8d532d68acbfa206826feaaa418d3938046bdc2044861',
        priceChainUnits: '100000000',
        sizeChainUnits: '10000000',
        isBuy: true,
        timeInForce: 1,
        isReduceOnly: false,
        clientOrderId: intent.clientOrderId,
      }),
    );
    expect(info.mock.invocationCallOrder[0]).toBeLessThan(
      placeOrder.mock.invocationCallOrder[0] ?? 0,
    );
    info.mockRestore();
  });

  it('prints public sender, subaccount and APT balances before placement', async () => {
    const placeOrder = vi.fn(() =>
      Promise.resolve({
        success: true as const,
        orderId: 'venue-one',
        transactionHash: 'transaction-one',
      }),
    );
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const Executor = new decibel_external_production_executor_v1(() => ({
      client: { placeOrder, cancelOrder: vi.fn() },
      subaccount: '0xsubaccount',
      getGasDiagnostics: () =>
        Promise.resolve({
          primaryAccountAddress: '0xprimary',
          subaccountAddress: '0xsubaccount',
          primaryAccountAptBalance: 2.575,
          subaccountAptBalance: 0,
          maxGasAmount: 200_000,
          resolvedMarketAddress:
            '0x5e0e16f34adfb4b316f8d532d68acbfa206826feaaa418d3938046bdc2044861',
          subaccountObjectExists: true,
          marketObjectExists: true,
        }),
    }));

    await Executor.placePostOnlyLimit(buildPlace());

    expect(info).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'DECIBEL_EXECUTION_GAS_PAYER_DIAGNOSTIC',
        primaryAccountAddress: '0xprimary',
        subaccountAddress: '0xsubaccount',
        primaryAccountAptBalance: 2.575,
        subaccountAptBalance: 0,
        maxGasAmount: 200_000,
        resolvedMarketAddress: '0x5e0e16f34adfb4b316f8d532d68acbfa206826feaaa418d3938046bdc2044861',
        subaccountObjectExists: true,
        marketObjectExists: true,
      }),
    );
    expect(info.mock.invocationCallOrder[0]).toBeLessThan(
      placeOrder.mock.invocationCallOrder[0] ?? 0,
    );
    info.mockRestore();
  });

  it('fails closed before placement when an on-chain object cannot be proven', async () => {
    const placeOrder = vi.fn(() =>
      Promise.resolve({
        success: true as const,
        orderId: 'venue-one',
        transactionHash: 'transaction-one',
      }),
    );
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const Executor = new decibel_external_production_executor_v1(() => ({
      client: { placeOrder, cancelOrder: vi.fn() },
      subaccount: '0xmissing',
      getGasDiagnostics: () =>
        Promise.resolve({
          primaryAccountAddress: '0xprimary',
          subaccountAddress: '0xmissing',
          primaryAccountAptBalance: 2.575,
          subaccountAptBalance: 0,
          maxGasAmount: 200_000,
          resolvedMarketAddress:
            '0x5e0e16f34adfb4b316f8d532d68acbfa206826feaaa418d3938046bdc2044861',
          subaccountObjectExists: false,
          marketObjectExists: true,
        }),
    }));

    await expect(Executor.placePostOnlyLimit(buildPlace())).resolves.toEqual({
      outcome: 'PLACE_OUTCOME_UNKNOWN',
    });
    expect(placeOrder).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it('converts decimal BTC price and size to exact Move u64 chain units', async () => {
    const { Executor, placeOrder } = setup();
    const intent = buildDecibelExecutionIntentV1({
      sessionId: 'session-decimal-units',
      cycleSequence: 1,
      action: 'PLACE',
      market: 'BTC/USD',
      side: 'BUY',
      price: 79_289.7,
      quantity: 0.00013,
      tickSize: 0.1,
      lotSize: 0.00001,
      clientOrderId: 'decimal-units',
      knownVenueOrderId: null,
      sourceStateHash: 'source-state',
      strategyDecisionHash: 'strategy-decision',
      createdAt: 1,
    });
    if (intent.action !== 'PLACE') throw new Error('TEST_PLACE_INTENT_BUILD_FAILED');

    await Executor.placePostOnlyLimit(intent);

    const input = placeOrder.mock.calls[0]?.[0];
    expect(input?.price).toBe(79_289_700_000n);
    expect(input?.size).toBe(13_000n);
    expect(() => BigInt(input?.price ?? 0)).not.toThrow();
    expect(() => BigInt(input?.size ?? 0)).not.toThrow();
  });

  it('rejects an invalid PLACE contract before transport', async () => {
    const { Executor, placeOrder } = setup();
    const invalid = { ...buildPlace(), postOnly: false };
    await expect(
      Executor.placePostOnlyLimit(invalid as unknown as ReturnType<typeof buildPlace>),
    ).rejects.toThrow('PRODUCTION_EXECUTOR_PLACE_CONTRACT_REJECTED');
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it('rejects a client order ID longer than the venue limit before transport', async () => {
    const { Executor, placeOrder } = setup();
    const invalid = { ...buildPlace(), clientOrderId: `d1b${'a'.repeat(30)}` };

    await expect(Executor.placePostOnlyLimit(invalid)).rejects.toThrow(
      'PRODUCTION_EXECUTOR_CLIENT_ORDER_ID_INVALID',
    );
    expect(Buffer.byteLength(invalid.clientOrderId, 'utf8')).toBeGreaterThan(32);
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it.each([
    ['SDK failure', () => Promise.resolve({ success: false as const, error: 'redacted' })],
    ['transport failure', () => Promise.reject(new Error('transport unavailable'))],
    [
      'missing venue identity',
      () => Promise.resolve({ success: true as const, orderId: undefined, transactionHash: 'tx' }),
    ],
  ])('maps ambiguous PLACE %s to unknown without retry', async (_name, place) => {
    const { Executor, placeOrder } = setup({ place });
    await expect(Executor.placePostOnlyLimit(buildPlace())).resolves.toEqual({
      outcome: 'PLACE_OUTCOME_UNKNOWN',
    });
    expect(placeOrder).toHaveBeenCalledTimes(1);
  });

  it('cancels only the exact supplied venue order identity', async () => {
    const { Executor, cancelOrder } = setup();
    await expect(Executor.cancelExactOrder(buildCancel())).resolves.toEqual({
      outcome: 'CANCEL_CONFIRMED',
      venueOrderId: 'venue-one',
    });
    expect(cancelOrder).toHaveBeenCalledTimes(1);
    expect(cancelOrder).toHaveBeenCalledWith({
      orderId: 'venue-one',
      marketAddr: '0x5e0e16f34adfb4b316f8d532d68acbfa206826feaaa418d3938046bdc2044861',
      subaccountAddr: 'subaccount-one',
    });
  });

  it('rejects missing CANCEL venue identity before transport', async () => {
    const { Executor, cancelOrder } = setup();
    const invalid = { ...buildCancel(), expectedPreviousVenueOrderId: '' };
    await expect(
      Executor.cancelExactOrder(invalid as ReturnType<typeof buildCancel>),
    ).rejects.toThrow('PRODUCTION_EXECUTOR_CANCEL_CONTRACT_REJECTED');
    expect(cancelOrder).not.toHaveBeenCalled();
  });

  it('maps CANCEL transport failure to unknown without retry', async () => {
    const { Executor, cancelOrder } = setup({
      cancel: () => Promise.reject(new Error('transport unavailable')),
    });
    await expect(Executor.cancelExactOrder(buildCancel())).resolves.toEqual({
      outcome: 'CANCEL_OUTCOME_UNKNOWN',
    });
    expect(cancelOrder).toHaveBeenCalledTimes(1);
  });

  it('maps lazy connection failure to unknown without retrying the provider', async () => {
    const getConnection = vi.fn(() => Promise.reject(new Error('SDK unavailable')));
    const Executor = new decibel_external_production_executor_v1(getConnection);

    await expect(Executor.placePostOnlyLimit(buildPlace())).resolves.toEqual({
      outcome: 'PLACE_OUTCOME_UNKNOWN',
    });
    expect(getConnection).toHaveBeenCalledTimes(1);
  });
});
