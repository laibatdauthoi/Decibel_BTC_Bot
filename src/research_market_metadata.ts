import { createHash } from 'node:crypto';
import { z } from 'zod';

import type { BTC_market_metadata } from './decibel_client.js';

export const ResearchMarketMetadataSchema = z.object({
  marketAddress: z.string().min(1),
  tickSize: z.number().positive().finite(),
  lotSize: z.number().positive().finite(),
  minimumSize: z.number().positive().finite(),
  sizeDecimals: z.number().int().nonnegative(),
  priceDecimals: z.number().int().nonnegative(),
  maximumLeverage: z.number().positive().finite(),
  metadataVersion: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  observedAt: z.string().datetime(),
});

export type research_market_metadata = z.infer<typeof ResearchMarketMetadataSchema>;
export type research_market_constraints = Omit<
  research_market_metadata,
  'metadataVersion' | 'observedAt'
>;

function getMetadataVersion(constraints: research_market_constraints): string {
  return `sha256:${createHash('sha256')
    .update(
      JSON.stringify([
        constraints.marketAddress,
        constraints.tickSize,
        constraints.lotSize,
        constraints.minimumSize,
        constraints.sizeDecimals,
        constraints.priceDecimals,
        constraints.maximumLeverage,
      ]),
    )
    .digest('hex')}`;
}

export function createResearchMarketMetadata(
  market: BTC_market_metadata,
  observedAt: Date = new Date(),
): research_market_metadata {
  const constraints: research_market_constraints = {
    marketAddress: market.marketAddress,
    tickSize: market.tickSize,
    lotSize: market.lotSize,
    minimumSize: market.minimumSize,
    sizeDecimals: market.sizeDecimals,
    priceDecimals: market.priceDecimals,
    maximumLeverage: market.maximumLeverage,
  };
  return validateResearchMarketMetadata({
    ...constraints,
    metadataVersion: getMetadataVersion(constraints),
    observedAt: observedAt.toISOString(),
  });
}

export function validateResearchMarketMetadata(value: unknown): research_market_metadata {
  const metadata = ResearchMarketMetadataSchema.parse(value);
  const expectedVersion = getMetadataVersion({
    marketAddress: metadata.marketAddress,
    tickSize: metadata.tickSize,
    lotSize: metadata.lotSize,
    minimumSize: metadata.minimumSize,
    sizeDecimals: metadata.sizeDecimals,
    priceDecimals: metadata.priceDecimals,
    maximumLeverage: metadata.maximumLeverage,
  });
  if (metadata.metadataVersion !== expectedVersion)
    throw new Error('Research market metadata version does not match its normalized constraints');
  return metadata;
}
