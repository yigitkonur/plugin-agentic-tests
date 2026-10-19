#!/usr/bin/env node
// Fixture Shop MCP server: a dependency-free stdio MCP server whose tools call the Fixture Shop API.
// FIXTURE_API_URL (default http://127.0.0.1:8000), FIXTURE_USER / FIXTURE_PASSWORD (API defaults).
import readline from 'node:readline';

const api = process.env.FIXTURE_API_URL || 'http://127.0.0.1:8000';
const credentials = { email: process.env.FIXTURE_USER || 'demo@example.test', password: process.env.FIXTURE_PASSWORD || 'demo-pass' };
const items = ['Notebook', 'Pen', 'Stapler', 'Ruler'];
const tools = [
  { name: 'list_orders', description: "List the signed-in fixture user's orders from the shop API.", inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Page size, 1 to 50 (default 10).' } }, additionalProperties: false } },
  { name: 'create_order', description: 'Create an order in the shop API. Pass an idempotency_key to make retries safe.', inputSchema: { type: 'object', properties: { item: { type: 'string', enum: items }, qty: { type: 'integer', minimum: 1, maximum: 99 }, idempotency_key: { type: 'string' } }, required: ['item', 'qty'], additionalProperties: false } },
  { name: 'shop_status', description: 'Report which shop API this server talks to and whether it answers.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
];

async function token() {
  const response = await fetch(`${api}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(credentials), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`login failed with ${response.status}`);
  return (await response.json()).token;
}
const text = (value, isError = false) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }], ...(isError ? { isError: true } : {}) });

async function call(name, args = {}) {
  if (name === 'shop_status') {
    try { const r = await fetch(`${api}/health`, { signal: AbortSignal.timeout(5000) }); return text({ api, ok: r.ok }); }
    catch (error) { return text({ api, ok: false, error: error.cause?.code || error.message }, true); }
  }
  if (name === 'list_orders') {
    if (args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 50)) return text('limit must be an integer from 1 to 50.', true);
    const r = await fetch(`${api}/api/orders?limit=${args.limit ?? 10}`, { headers: { authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(10000) });
    const body = await r.json();
    return r.ok ? text(body) : text(body.error?.message || `API error ${r.status}`, true);
  }
  if (name === 'create_order') {
    if (!items.includes(args.item)) return text(`item must be one of ${items.join(', ')}.`, true);
    if (!Number.isInteger(args.qty) || args.qty < 1 || args.qty > 99) return text('qty must be an integer from 1 to 99.', true);
    const headers = { authorization: `Bearer ${await token()}`, 'content-type': 'application/json', ...(args.idempotency_key ? { 'idempotency-key': args.idempotency_key } : {}) };
    const r = await fetch(`${api}/api/orders`, { method: 'POST', headers, body: JSON.stringify({ item: args.item, qty: args.qty }), signal: AbortSignal.timeout(10000) });
    const body = await r.json();
    return r.ok ? text(body) : text(body.error?.message || `API error ${r.status}`, true);
  }
  return null;
}

const send = message => process.stdout.write(JSON.stringify(message) + '\n');
const lines = readline.createInterface({ input: process.stdin });
lines.on('line', async line => {
  let message;
  try { message = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  const { id, method, params } = message;
  if (id === undefined) return; // notifications
  try {
    if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fixture-shop-mcp', version: '1.0.0' }, instructions: 'Tools for the Fixture Shop: list_orders, create_order, shop_status.' } });
    if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
    if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools } });
    if (method === 'tools/call') {
      const result = await call(params?.name, params?.arguments);
      if (!result) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${params?.name}` } });
      return send({ jsonrpc: '2.0', id, result });
    }
    if (['prompts/list', 'resources/list', 'resources/templates/list'].includes(method)) return send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  } catch (error) { send({ jsonrpc: '2.0', id, result: text(`Backend unavailable: ${error.message}`, true) }); }
});
