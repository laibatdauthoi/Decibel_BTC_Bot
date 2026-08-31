export const DECIBEL_AUTHENTICATED_READ_CONNECTIVITY_V1 =
  'DECIBEL_AUTHENTICATED_READ_CONNECTIVITY_V1' as const;

export type decibel_read_input_status_v1 = 'PRESENT' | 'MISSING' | 'INVALID';
export type decibel_market_read_classification_v1 =
  | 'MARKET_READ_READY'
  | 'MARKET_READ_BLOCKED_NODE_API_KEY'
  | 'MARKET_READ_BLOCKED_ENDPOINT'
  | 'MARKET_READ_BLOCKED_NETWORK'
  | 'MARKET_READ_BLOCKED_MARKET_IDENTITY'
  | 'MARKET_READ_BLOCKED_SDK'
  | 'MARKET_READ_BLOCKED_UNKNOWN';
export type decibel_account_read_classification_v1 =
  | 'ACCOUNT_READ_READY'
  | 'ACCOUNT_READ_BLOCKED_NODE_API_KEY'
  | 'ACCOUNT_READ_BLOCKED_SUBACCOUNT'
  | 'ACCOUNT_READ_BLOCKED_NETWORK'
  | 'ACCOUNT_READ_BLOCKED_ENDPOINT'
  | 'ACCOUNT_READ_BLOCKED_SDK'
  | 'ACCOUNT_READ_BLOCKED_UNKNOWN';

export type decibel_sanitized_read_error_v1 = Readonly<{
  operation: string;
  sdkMethod: string;
  endpointClass: 'PUBLIC_READ' | 'NODE_TOKEN_AUTHENTICATED_READ' | 'ACCOUNT_SCOPED_READ';
  httpStatus: number | null;
  code:
    | 'HTTP_401_UNAUTHORIZED'
    | 'HTTP_403_FORBIDDEN'
    | 'HTTP_404_NOT_FOUND'
    | 'NETWORK_DNS_FAILURE'
    | 'NETWORK_TIMEOUT'
    | 'INVALID_CONFIGURATION'
    | 'SDK_DECODE_FAILURE'
    | 'UNKNOWN_READ_FAILURE';
  errorType: string;
  sanitizedMessage: string;
  retryable: boolean;
}>;

function errorRecord(error: unknown): Record<string, unknown> {
  return error !== null && typeof error === 'object' ? (error as Record<string, unknown>) : {};
}

export function sanitizeDecibelReadErrorV1(input: {
  error: unknown;
  operation: string;
  sdkMethod: string;
  endpointClass: decibel_sanitized_read_error_v1['endpointClass'];
}): decibel_sanitized_read_error_v1 {
  const record = errorRecord(input.error);
  const cause = errorRecord(record.cause);
  const status =
    typeof record.status === 'number'
      ? record.status
      : typeof cause.status === 'number'
        ? cause.status
        : null;
  const rawCode =
    typeof record.code === 'string'
      ? record.code
      : typeof cause.code === 'string'
        ? cause.code
        : '';
  const rawMessage = input.error instanceof Error ? input.error.message : String(input.error);
  const code =
    status === 401
      ? 'HTTP_401_UNAUTHORIZED'
      : status === 403
        ? 'HTTP_403_FORBIDDEN'
        : status === 404
          ? 'HTTP_404_NOT_FOUND'
          : ['ENOTFOUND', 'EAI_AGAIN'].includes(rawCode)
            ? 'NETWORK_DNS_FAILURE'
            : ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'ABORT_ERR'].includes(rawCode) ||
                /timeout/i.test(rawMessage)
              ? 'NETWORK_TIMEOUT'
              : /config|address|argument/i.test(rawMessage)
                ? 'INVALID_CONFIGURATION'
                : /zod|decode|parse|invalid input/i.test(rawMessage)
                  ? 'SDK_DECODE_FAILURE'
                  : 'UNKNOWN_READ_FAILURE';
  return Object.freeze({
    operation: input.operation,
    sdkMethod: input.sdkMethod,
    endpointClass: input.endpointClass,
    httpStatus: status,
    code,
    errorType: input.error instanceof Error ? input.error.name : typeof input.error,
    sanitizedMessage: code,
    retryable: ['NETWORK_DNS_FAILURE', 'NETWORK_TIMEOUT', 'UNKNOWN_READ_FAILURE'].includes(code),
  });
}

export function resolveDecibelCanarySideV1(input: {
  cliSide: string | undefined;
  environmentSide: string | undefined;
}): Readonly<{
  side: 'BUY' | 'SELL' | null;
  source: 'CLI' | 'ENVIRONMENT' | 'UNAVAILABLE';
  status: decibel_read_input_status_v1;
}> {
  const candidate = input.cliSide ?? input.environmentSide;
  if (candidate === undefined || candidate.trim() === '')
    return Object.freeze({ side: null, source: 'UNAVAILABLE', status: 'MISSING' });
  const normalized = candidate.trim().toUpperCase();
  if (normalized !== 'BUY' && normalized !== 'SELL')
    return Object.freeze({
      side: null,
      source: input.cliSide === undefined ? 'ENVIRONMENT' : 'CLI',
      status: 'INVALID',
    });
  return Object.freeze({
    side: normalized,
    source: input.cliSide === undefined ? 'ENVIRONMENT' : 'CLI',
    status: 'PRESENT',
  });
}

export type decibel_read_connectivity_dependencies_v1 = Readonly<{
  getMarkets: () => Promise<readonly Record<string, unknown>[]>;
  getCurrentBook: () => Promise<Record<string, unknown>>;
  getPositions: () => Promise<readonly unknown[]>;
  getOpenOrders: () => Promise<readonly unknown[]>;
  getActiveTwaps: () => Promise<readonly unknown[]>;
  getBulkOrders: () => Promise<readonly unknown[]>;
}>;

export type DecibelAuthenticatedReadConnectivityReportV1 = Readonly<{
  version: typeof DECIBEL_AUTHENTICATED_READ_CONNECTIVITY_V1;
  timestamp: number;
  sdkVersion: '0.7.0';
  constructionPath: Readonly<{
    constructor: 'DecibelReadDex';
    configObject: 'MAINNET_CONFIG | TESTNET_CONFIG';
    nodeApiKeyField: 'nodeApiKey';
    authenticationHeader: 'Authorization: Bearer [REDACTED]';
    accountMethodsUseSubAddr: true;
  }>;
  configuration: Readonly<{
    nodeApiKey: decibel_read_input_status_v1;
    nodeApiKeyPresent: boolean;
    network: decibel_read_input_status_v1;
    subaccount: decibel_read_input_status_v1;
    marketAddress: 'PRESENT';
    canarySide: decibel_read_input_status_v1;
    canarySideSource: 'CLI' | 'ENVIRONMENT' | 'UNAVAILABLE';
  }>;
  endpoints: Readonly<{
    network: string;
    tradingHttpUrl: string;
    tradingWsUrl: string;
    fullnodeUrl: string;
  }>;
  market: Readonly<{
    classification: decibel_market_read_classification_v1;
    exactMarketFound: boolean;
    metadata: Record<string, unknown> | null;
    book: Record<string, unknown> | null;
  }>;
  account: Readonly<{
    classification: decibel_account_read_classification_v1;
    positionsReadSuccessful: boolean;
    returnedOpenPositionCount: number | null;
    openOrdersReadSuccessful: boolean;
    openOrderCount: number | null;
    activeTwapCount: number | null;
    activeBulkCount: number | null;
  }>;
  errors: readonly decibel_sanitized_read_error_v1[];
  signedTransactions: 0;
  submittedTransactions: 0;
  placedOrders: 0;
  cancelledOrders: 0;
  venueMutations: 0;
  liveExecutionEnabled: false;
}>;

export async function runDecibelAuthenticatedReadConnectivityProbeV1(input: {
  timestamp: number;
  nodeApiKeyPresent: boolean;
  network: string;
  subaccount: string | null;
  marketAddress: string;
  canarySide: ReturnType<typeof resolveDecibelCanarySideV1>;
  endpoints: DecibelAuthenticatedReadConnectivityReportV1['endpoints'];
  dependencies: decibel_read_connectivity_dependencies_v1;
}): Promise<DecibelAuthenticatedReadConnectivityReportV1> {
  const errors: decibel_sanitized_read_error_v1[] = [];
  const base = {
    version: DECIBEL_AUTHENTICATED_READ_CONNECTIVITY_V1,
    timestamp: input.timestamp,
    sdkVersion: '0.7.0' as const,
    constructionPath: Object.freeze({
      constructor: 'DecibelReadDex' as const,
      configObject: 'MAINNET_CONFIG | TESTNET_CONFIG' as const,
      nodeApiKeyField: 'nodeApiKey' as const,
      authenticationHeader: 'Authorization: Bearer [REDACTED]' as const,
      accountMethodsUseSubAddr: true as const,
    }),
    configuration: Object.freeze({
      nodeApiKey: input.nodeApiKeyPresent ? ('PRESENT' as const) : ('MISSING' as const),
      nodeApiKeyPresent: input.nodeApiKeyPresent,
      network: ['mainnet', 'testnet'].includes(input.network)
        ? ('PRESENT' as const)
        : ('INVALID' as const),
      subaccount:
        input.subaccount === null
          ? ('MISSING' as const)
          : /^0x[0-9a-f]{64}$/i.test(input.subaccount)
            ? ('PRESENT' as const)
            : ('INVALID' as const),
      marketAddress: 'PRESENT' as const,
      canarySide: input.canarySide.status,
      canarySideSource: input.canarySide.source,
    }),
  };
  if (!input.nodeApiKeyPresent)
    return Object.freeze({
      ...base,
      endpoints: input.endpoints,
      market: Object.freeze({
        classification: 'MARKET_READ_BLOCKED_NODE_API_KEY',
        exactMarketFound: false,
        metadata: null,
        book: null,
      }),
      account: Object.freeze({
        classification: 'ACCOUNT_READ_BLOCKED_NODE_API_KEY',
        positionsReadSuccessful: false,
        returnedOpenPositionCount: null,
        openOrdersReadSuccessful: false,
        openOrderCount: null,
        activeTwapCount: null,
        activeBulkCount: null,
      }),
      errors: Object.freeze([]),
      signedTransactions: 0,
      submittedTransactions: 0,
      placedOrders: 0,
      cancelledOrders: 0,
      venueMutations: 0,
      liveExecutionEnabled: false,
    });

  let metadata: Record<string, unknown> | null = null;
  let book: Record<string, unknown> | null = null;
  try {
    const markets = await input.dependencies.getMarkets();
    metadata = markets.find((row) => row.market_addr === input.marketAddress) ?? null;
    if (metadata === null)
      errors.push(
        Object.freeze({
          operation: 'MARKET_IDENTITY',
          sdkMethod: 'markets.getAll',
          endpointClass: 'NODE_TOKEN_AUTHENTICATED_READ',
          httpStatus: null,
          code: 'INVALID_CONFIGURATION',
          errorType: 'MarketIdentityMismatch',
          sanitizedMessage: 'CONFIGURED_MARKET_ADDRESS_NOT_RETURNED',
          retryable: false,
        }),
      );
  } catch (error) {
    errors.push(
      sanitizeDecibelReadErrorV1({
        error,
        operation: 'MARKETS',
        sdkMethod: 'markets.getAll',
        endpointClass: 'NODE_TOKEN_AUTHENTICATED_READ',
      }),
    );
  }
  if (metadata !== null) {
    try {
      book = await input.dependencies.getCurrentBook();
    } catch (error) {
      errors.push(
        sanitizeDecibelReadErrorV1({
          error,
          operation: 'CURRENT_ORDERBOOK',
          sdkMethod: 'GET /api/v1/orderbook?market=',
          endpointClass: 'NODE_TOKEN_AUTHENTICATED_READ',
        }),
      );
    }
  }
  const marketError = errors.find(
    (value) =>
      value.operation === 'MARKETS' ||
      value.operation === 'MARKET_IDENTITY' ||
      value.operation === 'CURRENT_ORDERBOOK',
  );
  const marketClassification: decibel_market_read_classification_v1 =
    metadata === null
      ? marketError?.code === 'HTTP_401_UNAUTHORIZED' || marketError?.code === 'HTTP_403_FORBIDDEN'
        ? 'MARKET_READ_BLOCKED_NODE_API_KEY'
        : marketError?.operation === 'MARKET_IDENTITY'
          ? 'MARKET_READ_BLOCKED_MARKET_IDENTITY'
          : marketError?.code === 'NETWORK_DNS_FAILURE' || marketError?.code === 'NETWORK_TIMEOUT'
            ? 'MARKET_READ_BLOCKED_NETWORK'
            : 'MARKET_READ_BLOCKED_SDK'
      : book === null
        ? 'MARKET_READ_BLOCKED_ENDPOINT'
        : 'MARKET_READ_READY';

  let positions: readonly unknown[] | null = null,
    openOrders: readonly unknown[] | null = null;
  let twaps: readonly unknown[] | null = null,
    bulk: readonly unknown[] | null = null;
  if (input.subaccount !== null && base.configuration.subaccount === 'PRESENT') {
    for (const operation of [
      [
        'POSITIONS',
        'userPositions.getByAddr',
        input.dependencies.getPositions,
        (value: readonly unknown[]) => {
          positions = value;
        },
      ],
      [
        'OPEN_ORDERS',
        'userOpenOrders.getByAddr',
        input.dependencies.getOpenOrders,
        (value: readonly unknown[]) => {
          openOrders = value;
        },
      ],
      [
        'ACTIVE_TWAPS',
        'userActiveTwaps.getByAddr',
        input.dependencies.getActiveTwaps,
        (value: readonly unknown[]) => {
          twaps = value;
        },
      ],
      [
        'BULK_ORDERS',
        'userBulkOrders.getByAddr',
        input.dependencies.getBulkOrders,
        (value: readonly unknown[]) => {
          bulk = value;
        },
      ],
    ] as const) {
      try {
        operation[3](await operation[2]());
      } catch (error) {
        errors.push(
          sanitizeDecibelReadErrorV1({
            error,
            operation: operation[0],
            sdkMethod: operation[1],
            endpointClass: 'ACCOUNT_SCOPED_READ',
          }),
        );
      }
    }
  }
  const accountError = errors.find((value) =>
    ['POSITIONS', 'OPEN_ORDERS'].includes(value.operation),
  );
  const accountClassification: decibel_account_read_classification_v1 =
    base.configuration.subaccount !== 'PRESENT'
      ? 'ACCOUNT_READ_BLOCKED_SUBACCOUNT'
      : positions !== null && openOrders !== null
        ? 'ACCOUNT_READ_READY'
        : accountError?.code === 'HTTP_401_UNAUTHORIZED' ||
            accountError?.code === 'HTTP_403_FORBIDDEN'
          ? 'ACCOUNT_READ_BLOCKED_NODE_API_KEY'
          : accountError?.code === 'NETWORK_DNS_FAILURE' || accountError?.code === 'NETWORK_TIMEOUT'
            ? 'ACCOUNT_READ_BLOCKED_NETWORK'
            : 'ACCOUNT_READ_BLOCKED_ENDPOINT';
  const count = (value: readonly unknown[] | null): number | null => value?.length ?? null;
  return Object.freeze({
    ...base,
    endpoints: input.endpoints,
    market: Object.freeze({
      classification: marketClassification,
      exactMarketFound: metadata !== null,
      metadata,
      book,
    }),
    account: Object.freeze({
      classification: accountClassification,
      positionsReadSuccessful: positions !== null,
      returnedOpenPositionCount: count(positions),
      openOrdersReadSuccessful: openOrders !== null,
      openOrderCount: count(openOrders),
      activeTwapCount: count(twaps),
      activeBulkCount: count(bulk),
    }),
    errors: Object.freeze(errors),
    signedTransactions: 0,
    submittedTransactions: 0,
    placedOrders: 0,
    cancelledOrders: 0,
    venueMutations: 0,
    liveExecutionEnabled: false,
  });
}

export function shouldRunDecibelCanaryDryRunPhaseBV1(
  report: DecibelAuthenticatedReadConnectivityReportV1,
): boolean {
  return (
    report.market.classification === 'MARKET_READ_READY' &&
    report.account.classification === 'ACCOUNT_READ_READY' &&
    report.configuration.canarySide === 'PRESENT'
  );
}
