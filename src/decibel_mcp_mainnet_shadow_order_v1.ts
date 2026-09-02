import { createHash } from 'node:crypto';

import { calculateDecibelMinimalLiveCanaryBufferedQuantityV1 } from './decibel_minimal_live_canary_v1.js';

type capability_schema_v1 = Readonly<{
  required: readonly string[];
  fields: Readonly<Record<string, Readonly<{ type: unknown; enum: unknown }>>>;
}>;

export type decibel_mcp_shadow_order_payload_v1 = Readonly<{
  side: 'buy' | 'sell';
  size: number;
  symbol: 'BTC/USD';
  price: number;
  timeInForce: 'post-only';
  reduceOnly: false;
  clientOrderId: string;
}>;

export function buildDecibelMcpMainnetShadowOrderV1(input: {
  side: 'BUY' | 'SELL';
  price: number;
  lotSize: number;
  minimumSize: number;
  minimumNotionalUsd: number;
  targetNotionalUsd: number;
  maximumNotionalUsd: number;
  cycleSequence: number;
  seedHash: string;
  schema: capability_schema_v1;
}) {
  const sizing = calculateDecibelMinimalLiveCanaryBufferedQuantityV1({
    frozenOrderPrice: input.price,
    lotSize: input.lotSize,
    metadataMinimumQuantity: input.minimumSize,
    authoritativeVenueMinimumNotionalUsd: input.minimumNotionalUsd,
    configuredMinimumNotionalUsd: input.minimumNotionalUsd,
    // Avoid a binary floating-point underflow at exact price × lot boundaries. The selected
    // quantity is still verified against the unadjusted target immediately below.
    configuredTargetNotionalUsd: input.targetNotionalUsd - 1e-9,
    configuredMaximumNotionalUsd: input.maximumNotionalUsd,
  });
  if (sizing.selectedCanaryNotionalUsd + 1e-8 < input.targetNotionalUsd)
    throw new Error('MCP_SHADOW_TARGET_NOTIONAL_NOT_MET');
  const clientOrderId = `dmcp-shadow-${createHash('sha256')
    .update(
      `${input.seedHash}|${input.cycleSequence}|${input.side}|${input.price}|${sizing.selectedCanaryQuantity}`,
    )
    .digest('hex')
    .slice(0, 24)}`;
  const payload: decibel_mcp_shadow_order_payload_v1 = Object.freeze({
    side: input.side === 'BUY' ? 'buy' : 'sell',
    size: sizing.selectedCanaryQuantity,
    symbol: 'BTC/USD',
    price: input.price,
    timeInForce: 'post-only',
    reduceOnly: false,
    clientOrderId,
  });
  validateDecibelMcpMainnetShadowPayloadV1(payload, input.schema);
  return Object.freeze({ payload, sizing });
}

export function validateDecibelMcpMainnetShadowPayloadV1(
  payload: decibel_mcp_shadow_order_payload_v1,
  schema: capability_schema_v1,
): void {
  for (const field of schema.required)
    if (!(field in payload)) throw new Error(`MCP_SHADOW_PAYLOAD_REQUIRED_FIELD_MISSING:${field}`);
  const sideEnum = schema.fields.side?.enum;
  const tifEnum = schema.fields.timeInForce?.enum;
  if (!Array.isArray(sideEnum) || !sideEnum.includes(payload.side))
    throw new Error('MCP_SHADOW_PAYLOAD_SIDE_SCHEMA_MISMATCH');
  if (!Array.isArray(tifEnum) || !tifEnum.includes(payload.timeInForce))
    throw new Error('MCP_SHADOW_PAYLOAD_TIF_SCHEMA_MISMATCH');
}
