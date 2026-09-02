import type { DecibelMcpTransportV1 } from './decibel_mcp_execution_transport_v1.js';

type row = Record<string, unknown>;
const object = (value: unknown): row | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as row) : null;

export function decodeDecibelMcpTextResultV1(value: unknown): unknown {
  const result = object(value);
  const content = result?.content;
  if (!Array.isArray(content)) return value;
  for (const item of content) {
    const text = object(item)?.text;
    if (typeof text !== 'string') continue;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      continue;
    }
  }
  return value;
}

function collectRows(value: unknown, output: row[] = []): row[] {
  if (Array.isArray(value)) {
    for (const item of value) collectRows(item, output);
    return output;
  }
  const current = object(value);
  if (current === null) return output;
  const keys = Object.keys(current);
  if (
    keys.some((key) =>
      [
        'market',
        'market_addr',
        'marketAddress',
        'market_name',
        'symbol',
        'address',
        'name',
      ].includes(key),
    )
  )
    output.push(current);
  for (const nested of Object.values(current)) collectRows(nested, output);
  return output;
}

const text = (value: unknown) => (typeof value === 'string' ? value : null);
const numeric = (value: unknown) => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
};
const addressOf = (value: row) =>
  text(value.marketAddress) ??
  text(value.market_addr) ??
  text(value.market_address) ??
  text(value.market) ??
  text(value.address);
const symbolOf = (value: row) =>
  text(value.symbol) ??
  text(value.market_name) ??
  text(value.marketName) ??
  text(value.exchangeSymbol) ??
  text(value.name);
const canonicalSymbol = (value: string) => value.toUpperCase().replace(/[-_]/g, '/');
const exactAddress = (left: string | null, right: string) =>
  left?.toLowerCase() === right.toLowerCase();

function ids(rows: readonly row[], keys: readonly string[]): string[] {
  return rows
    .map((item) => keys.map((key) => text(item[key])).find((value) => value !== null) ?? null)
    .filter((value): value is string => value !== null)
    .sort();
}

function parseBook(value: unknown, observedAt: number) {
  const decoded = object(decodeDecibelMcpTextResultV1(value));
  if (decoded === null) throw new Error('MCP_SHADOW_ORDERBOOK_MALFORMED');
  const bids = decoded.bids;
  const asks = decoded.asks;
  const bestBid =
    numeric(decoded.bestBid ?? decoded.best_bid) ??
    (Array.isArray(bids) && Array.isArray(bids[0]) ? numeric(bids[0][0]) : null);
  const bestAsk =
    numeric(decoded.bestAsk ?? decoded.best_ask) ??
    (Array.isArray(asks) && Array.isArray(asks[0]) ? numeric(asks[0][0]) : null);
  if (bestBid === null || bestAsk === null || bestBid <= 0 || bestAsk <= bestBid)
    throw new Error('MCP_SHADOW_ORDERBOOK_INVALID');
  return Object.freeze({ bestBid, bestAsk, observedAt });
}

export type decibel_mcp_shadow_snapshot_v1 = Awaited<ReturnType<typeof readSnapshot>>;

async function readSnapshot(transport: DecibelMcpTransportV1, btcAddress: string, at: number) {
  const [positionsRaw, ordersRaw, tradesRaw, orderHistoryRaw, bookRaw, priceRaw] =
    await Promise.all([
      transport.callTool('get_positions', {}),
      transport.callTool('get_orders', {}),
      transport.callTool('get_trade_history', { symbol: 'BTC/USD' }),
      transport.callTool('get_order_history', { symbol: 'BTC/USD' }),
      transport.callTool('get_orderbook', { symbol: 'BTC/USD' }),
      transport.callTool('get_price', { symbol: 'BTC/USD' }),
    ]);
  const positions = collectRows(decodeDecibelMcpTextResultV1(positionsRaw));
  const orders = collectRows(decodeDecibelMcpTextResultV1(ordersRaw));
  const trades = collectRows(decodeDecibelMcpTextResultV1(tradesRaw));
  const orderHistory = collectRows(decodeDecibelMcpTextResultV1(orderHistoryRaw));
  const btcPositions = positions.filter((item) => exactAddress(addressOf(item), btcAddress));
  const foreignPositions = positions.filter((item) => !exactAddress(addressOf(item), btcAddress));
  const btcOrders = orders.filter((item) => exactAddress(addressOf(item), btcAddress));
  const foreignOrders = orders.filter((item) => !exactAddress(addressOf(item), btcAddress));
  const btcTrades = trades.filter((item) => {
    const address = addressOf(item);
    const symbol = symbolOf(item);
    return (
      exactAddress(address, btcAddress) ||
      (symbol !== null && canonicalSymbol(symbol) === 'BTC/USD')
    );
  });
  const foreignTrades = trades.filter((item) => !btcTrades.includes(item));
  const positionBase = btcPositions.reduce(
    (sum, item) => sum + (numeric(item.size ?? item.position_size) ?? 0),
    0,
  );
  return Object.freeze({
    observedAt: at,
    btcMarketAddress: btcAddress,
    btcPositions: Object.freeze(btcPositions),
    foreignPositions: Object.freeze(foreignPositions),
    btcOrders: Object.freeze(btcOrders),
    foreignOrders: Object.freeze(foreignOrders),
    btcTrades: Object.freeze(btcTrades),
    foreignTrades: Object.freeze(foreignTrades),
    btcOrderHistory: Object.freeze(orderHistory),
    btcPositionBase: positionBase,
    btcOpenOrderIds: Object.freeze(ids(btcOrders, ['order_id', 'orderId'])),
    btcFillIds: Object.freeze(ids(btcTrades, ['trade_id', 'tradeId', 'id'])),
    book: parseBook(bookRaw, at),
    price: decodeDecibelMcpTextResultV1(priceRaw),
  });
}

export async function readDecibelMcpMainnetShadowStateV1(input: {
  transport: DecibelMcpTransportV1;
  now: () => number;
}) {
  await input.transport.start();
  const marketsRaw = await input.transport.callTool('get_markets', {});
  const marketRows = collectRows(decodeDecibelMcpTextResultV1(marketsRaw));
  const mappings = marketRows
    .map((item) => ({ address: addressOf(item), symbol: symbolOf(item), raw: item }))
    .filter(
      (item): item is { address: string; symbol: string; raw: row } =>
        item.address !== null && item.symbol !== null,
    );
  const btc = mappings.filter((item) => canonicalSymbol(item.symbol) === 'BTC/USD');
  if (btc.length !== 1)
    throw new Error(
      btc.length === 0 ? 'MCP_BTC_USD_MARKET_NOT_FOUND' : 'MCP_BTC_USD_MARKET_AMBIGUOUS',
    );
  const initial = await readSnapshot(input.transport, btc[0]!.address, input.now());
  const final = await readSnapshot(input.transport, btc[0]!.address, input.now());
  return Object.freeze({ mappings: Object.freeze(mappings), btcMarket: btc[0]!, initial, final });
}

export function assertDecibelMcpShadowStateUnchangedV1(
  initial: decibel_mcp_shadow_snapshot_v1,
  final: decibel_mcp_shadow_snapshot_v1,
): void {
  if (
    initial.btcPositionBase !== final.btcPositionBase ||
    JSON.stringify(initial.btcOpenOrderIds) !== JSON.stringify(final.btcOpenOrderIds) ||
    JSON.stringify(initial.btcFillIds) !== JSON.stringify(final.btcFillIds) ||
    initial.foreignOrders.length !== final.foreignOrders.length
  )
    throw new Error('MCP_SHADOW_STATE_CHANGED');
}
