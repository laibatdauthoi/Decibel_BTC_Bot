import { z } from 'zod';
import type { BTC_market_metadata, BTC_market_price } from './decibel_client.js';

export const LIVE_EXECUTION_DISABLED = 'LIVE_EXECUTION_DISABLED';

const PublicAddressSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const OrderPayloadSchema = z.object({
  marketAddress: PublicAddressSchema,
  side: z.enum(['BUY', 'SELL']),
  quantity: z.number().positive().finite(),
  limitPrice: z.number().positive().finite(),
  reduceOnly: z.boolean(),
  clientOrderId: z.string().min(1).max(128),
});

export type decibel_order_payload = z.infer<typeof OrderPayloadSchema>;
export type decibel_capability_result = {
  available: boolean;
  mode: 'READ_ONLY';
  market: BTC_market_metadata;
  price: BTC_market_price;
  orderSubmissionEnabled: false;
  disabledReason: typeof LIVE_EXECUTION_DISABLED;
};

export interface decibel_execution_adapter {
  checkCapability(): Promise<decibel_capability_result>;
  validateMarketInstrument(market: BTC_market_metadata): { valid: boolean; reasons: string[] };
  validatePublicWalletAddress(address: string | undefined): {
    valid: boolean;
    reason: string | null;
  };
  validateOrderPayload(payload: unknown): { valid: boolean; reasons: string[] };
  submitOrder(payload: decibel_order_payload): Promise<never>;
  getStatus(): {
    discovered: true;
    mode: 'READ_ONLY';
    privateKeyLoaded: false;
    orderSubmissionEnabled: false;
    disabledReason: typeof LIVE_EXECUTION_DISABLED;
  };
}

export class fail_closed_decibel_execution_adapter implements decibel_execution_adapter {
  constructor(
    private readonly ReadProbe: () => Promise<{
      market: BTC_market_metadata;
      price: BTC_market_price;
    }>,
  ) {}

  getStatus() {
    return {
      discovered: true as const,
      mode: 'READ_ONLY' as const,
      privateKeyLoaded: false as const,
      orderSubmissionEnabled: false as const,
      disabledReason: LIVE_EXECUTION_DISABLED as typeof LIVE_EXECUTION_DISABLED,
    };
  }

  async checkCapability(): Promise<decibel_capability_result> {
    const result = await this.ReadProbe();
    const validation = this.validateMarketInstrument(result.market);
    if (!validation.valid) throw new Error(validation.reasons.join(','));
    return {
      available: true,
      mode: 'READ_ONLY',
      ...result,
      orderSubmissionEnabled: false,
      disabledReason: LIVE_EXECUTION_DISABLED,
    };
  }

  validateMarketInstrument(market: BTC_market_metadata) {
    const reasons: string[] = [];
    if (market.symbol !== 'BTC/USD') reasons.push('BTC_USD_MARKET_REQUIRED');
    if (!PublicAddressSchema.safeParse(market.marketAddress).success)
      reasons.push('MARKET_ADDRESS_INVALID');
    if (market.mode !== 'Open') reasons.push(`MARKET_MODE_${market.mode.toUpperCase()}`);
    if (!(market.tickSize > 0)) reasons.push('TICK_SIZE_INVALID');
    if (!(market.lotSize > 0)) reasons.push('LOT_SIZE_INVALID');
    if (!(market.minimumSize > 0)) reasons.push('MINIMUM_SIZE_INVALID');
    return { valid: reasons.length === 0, reasons };
  }

  validatePublicWalletAddress(address: string | undefined) {
    if (address === undefined) return { valid: false, reason: 'DECIBEL_WALLET_ADDRESS_MISSING' };
    if (!PublicAddressSchema.safeParse(address).success)
      return { valid: false, reason: 'DECIBEL_WALLET_ADDRESS_INVALID' };
    return { valid: true, reason: null };
  }

  validateOrderPayload(payload: unknown) {
    const result = OrderPayloadSchema.safeParse(payload);
    return {
      valid: result.success,
      reasons: result.success
        ? []
        : result.error.issues.map((issue) => `INVALID_${issue.path.join('_').toUpperCase()}`),
    };
  }

  submitOrder(payload: decibel_order_payload): Promise<never> {
    void payload;
    return Promise.reject(new Error(LIVE_EXECUTION_DISABLED));
  }
}
