import { DECIBEL_MARKET_MAKER_V1 } from './decibel_market_state_v1.js';

export const DECIBEL_QUOTE_ENGINE_VERSION_V1 = 'DECIBEL_QUOTE_ENGINE_V1' as const;

export type decibel_quote_engine_status_v1 = 'QUOTES_READY' | 'NO_QUOTES' | 'INPUT_UNUSABLE';
export type decibel_quote_side_v1 = 'BUY' | 'SELL';
export type decibel_quote_side_suppression_reason_v1 =
  | 'BID_INVENTORY_INCREASE_NOT_ALLOWED'
  | 'BID_BELOW_MINIMUM_SIZE'
  | 'BID_WOULD_TAKE_LIQUIDITY'
  | 'ASK_INVENTORY_INCREASE_NOT_ALLOWED'
  | 'ASK_BELOW_MINIMUM_SIZE'
  | 'ASK_WOULD_TAKE_LIQUIDITY';
export type decibel_quote_set_failure_reason_v1 =
  | 'MARKET_STATE_UNUSABLE'
  | 'FAIR_PRICE_UNUSABLE'
  | 'MARKET_STATE_ID_MISMATCH'
  | 'STRATEGY_ID_MISMATCH'
  | 'VERSION_MISMATCH'
  | 'INVENTORY_ASSESSMENT_INVALID'
  | 'MARKET_METADATA_INVALID'
  | 'RESERVATION_PRICE_INVALID'
  | 'INTERNAL_QUOTE_CROSS';

export type decibel_quote_policy_configuration_v1 = Readonly<{
  baseHalfSpreadBps: number;
  baseOrderSizeBase: number;
}>;

export type decibel_quote_intent_v1 = Readonly<{
  intentId: string;
  strategyId: typeof DECIBEL_MARKET_MAKER_V1;
  quoteEngineVersion: typeof DECIBEL_QUOTE_ENGINE_VERSION_V1;
  quoteSetId: string;
  marketAddress: string;
  sourceMarketStateId: string;
  sourceFairPriceAssessmentId: string;
  sourceFairPriceConfigurationId: string;
  sourceInventoryAssessmentId: string;
  sourceInventoryConfigurationId: string;
  side: decibel_quote_side_v1;
  orderType: 'LIMIT';
  timeInForce: 'POST_ONLY';
  price: number;
  quantity: number;
  rawPrice: number;
  rawQuantity: number;
  reservationPrice: number;
  baseHalfSpreadBps: number;
  inventorySizeMultiplier: number;
}>;

export type decibel_quote_set_v1 = Readonly<{
  strategyId: typeof DECIBEL_MARKET_MAKER_V1;
  quoteEngineVersion: typeof DECIBEL_QUOTE_ENGINE_VERSION_V1;
  quoteSetId: string;
  configurationId: string;
  sourceMarketStateId: string;
  sourceFairPriceAssessmentId: string;
  sourceInventoryAssessmentId: string;
  status: decibel_quote_engine_status_v1;
  setFailureReasons: readonly decibel_quote_set_failure_reason_v1[];
  bidSuppressionReasons: readonly decibel_quote_side_suppression_reason_v1[];
  askSuppressionReasons: readonly decibel_quote_side_suppression_reason_v1[];
  reservationPrice: number | null;
  rawBidPrice: number | null;
  rawAskPrice: number | null;
  candidateBidPrice: number | null;
  candidateAskPrice: number | null;
  rawBidSize: number | null;
  rawAskSize: number | null;
  candidateBidSize: number | null;
  candidateAskSize: number | null;
  intents: readonly decibel_quote_intent_v1[];
}>;
