// Fixture Shop API: a dependency-free JSON API for agentic-tests live checks.
// PORT defaults to 8000. Credentials: FIXTURE_USER / FIXTURE_PASSWORD (defaults below).
// Allowed browser origins: http://127.0.0.1:3000 and http://localhost:3000.
import http from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';

const port = Number(process.env.PORT || 8000);
const secret = randomUUID();
const email = process.env.FIXTURE_USER || 'demo@example.test';
const password = process.env.FIXTURE_PASSWORD || 'demo-pass';
const orders = { [email]: [{ id: '1001', item: 'Notebook', qty: 2, total: 12 }, { id: '1002', item: 'Pen', qty: 5, total: 10 }, { id: '1003', item: 'Stapler', qty: 1, total: 15 }] };
const prices = { Notebook: 6, Pen: 2, Stapler: 15, Ruler: 3 };
const idempotency = new Map();
const origins = new Set(['http://127.0.0.1:3000', 'http://localhost:3000']);
let nextId = 1004;

const sign = value => createHmac('sha256', secret).update(value).digest('hex').slice(0, 32);
const mint = (user, ttl) => { const exp = Math.floor(Date.now() / 1000) + ttl; return `t.${Buffer.from(user).toString('base64url')}.${exp}.${sign(`${user}.${exp}`)}`; };
function verify(header) {
  const token = /^Bearer (.+)$/.exec(header || '')?.[1];
  if (!token) return { error: 'unauthorized' };
  const [prefix, user64, exp, signature] = token.split('.');
  if (prefix !== 't' || !user64 || !exp || !signature) return { error: 'unauthorized' };
  const user = Buffer.from(user64, 'base64url').toString();
  if (sign(`${user}.${exp}`) !== signature) return { error: 'unauthorized' };
  if (Number(exp) < Date.now() / 1000) return { error: 'token_expired' };
  return { user };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const origin = req.headers.origin;
  const cors = origin && origins.has(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {};
  const json = (status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...cors, ...headers }); res.end(JSON.stringify(body)); };
  const fail = (status, code, message, field) => json(status, { error: { code, message, ...(field ? { field } : {}) } });
  if (req.method === 'OPTIONS') {
    if (!cors['access-control-allow-origin']) { res.writeHead(204); return res.end(); }
    res.writeHead(204, { ...cors, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'authorization, content-type, idempotency-key', 'access-control-max-age': '600' });
    return res.end();
  }
  if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('agentic-fixture-api ok'); }
  if (url.pathname === '/openapi.json') { res.writeHead(200, { 'content-type': 'application/json' }); return import('node:fs').then(fs => res.end(fs.readFileSync(new URL('./openapi.json', import.meta.url)))); }
  let raw = '';
  req.on('data', chunk => { raw += chunk; });
  req.on('end', () => {
    let body = {};
    if (raw) { try { body = JSON.parse(raw); } catch { return fail(400, 'validation_error', 'Body must be JSON.'); } }
    if (url.pathname === '/api/login' && req.method === 'POST') {
      if (typeof body.email !== 'string' || !body.email) return fail(400, 'validation_error', 'email is required.', 'email');
      if (typeof body.password !== 'string' || !body.password) return fail(400, 'validation_error', 'password is required.', 'password');
      const ttl = body.ttl_seconds === undefined ? 3600 : body.ttl_seconds;
      if (!Number.isInteger(ttl) || ttl < 1 || ttl > 3600) return fail(400, 'validation_error', 'ttl_seconds must be an integer from 1 to 3600.', 'ttl_seconds');
      if (body.email !== email || body.password !== password) return fail(401, 'invalid_credentials', 'Invalid email or password.');
      return json(200, { token: mint(email, ttl), expires_in: ttl });
    }
    if (url.pathname === '/api/orders') {
      const auth = verify(req.headers.authorization);
      if (auth.error) return fail(401, auth.error, auth.error === 'token_expired' ? 'Token has expired.' : 'Missing or invalid bearer token.');
      const list = orders[auth.user] || (orders[auth.user] = []);
      if (req.method === 'GET') {
        const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 10;
        const offset = url.searchParams.has('offset') ? Number(url.searchParams.get('offset')) : 0;
        if (!Number.isInteger(limit) || limit < 1 || limit > 50) return fail(400, 'validation_error', 'limit must be an integer from 1 to 50.', 'limit');
        if (!Number.isInteger(offset) || offset < 0) return fail(400, 'validation_error', 'offset must be a non-negative integer.', 'offset');
        return json(200, { items: list.slice(offset, offset + limit), total: list.length, limit, offset });
      }
      if (req.method === 'POST') {
        if (typeof body.item !== 'string' || !(body.item in prices)) return fail(400, 'validation_error', `item must be one of ${Object.keys(prices).join(', ')}.`, 'item');
        if (!Number.isInteger(body.qty) || body.qty < 1 || body.qty > 99) return fail(400, 'validation_error', 'qty must be an integer from 1 to 99.', 'qty');
        const key = req.headers['idempotency-key'];
        const fingerprint = JSON.stringify({ item: body.item, qty: body.qty });
        if (key && idempotency.has(`${auth.user}:${key}`)) {
          const previous = idempotency.get(`${auth.user}:${key}`);
          if (previous.fingerprint !== fingerprint) return fail(409, 'idempotency_conflict', 'Idempotency-Key was already used with a different body.');
          return json(200, previous.order, { 'idempotent-replayed': 'true' });
        }
        const order = { id: String(nextId++), item: body.item, qty: body.qty, total: prices[body.item] * body.qty };
        list.push(order);
        if (key) idempotency.set(`${auth.user}:${key}`, { fingerprint, order });
        return json(201, order, { location: `/api/orders/${order.id}` });
      }
      return fail(405, 'method_not_allowed', 'Use GET or POST.');
    }
    fail(404, 'not_found', 'No such route.');
  });
});
server.listen(port, '127.0.0.1', () => console.log(`Fixture Shop API listening on http://127.0.0.1:${port}`));
