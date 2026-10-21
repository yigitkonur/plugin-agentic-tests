// Fixture Shop: a dependency-free web app for agentic-tests live checks.
// Credentials come from FIXTURE_USER / FIXTURE_PASSWORD (defaults below). PORT defaults to 3000. A sign-in writes data.json in the working directory.
import http from 'node:http';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.PORT || 3000);
const users = { [process.env.FIXTURE_USER || 'demo@example.test']: { email: process.env.FIXTURE_USER || 'demo@example.test', password: process.env.FIXTURE_PASSWORD || 'demo-pass', orders: ['#1001', '#1002', '#1003'] } };
const sessions = new Map();

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title} · Fixture Shop</title>
<style>body{font-family:system-ui;margin:40px;max-width:640px}label{display:block;margin:12px 0}nav a{margin-right:12px}.error{color:#b00020}</style></head>
<body><nav><a href="/">Home</a><a href="/login">Sign in</a></nav><main>${body}</main></body></html>`;

export function greeting(user) {
  return `Signed in as ${user.email}`;
}

function sessionUser(req) {
  const id = /(?:^|;\s*)sid=([\w-]+)/.exec(req.headers.cookie || '')?.[1];
  return id && sessions.get(id);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const send = (status, html, headers = {}) => { res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...headers }); res.end(html); };
  if (url.pathname === '/health') return send(200, 'agentic-fixture-web ok');
  if (url.pathname === '/') return send(200, page('Home', '<h1>Welcome to Fixture Shop</h1><p><a href="/login">Sign in</a> to see your orders.</p>'));
  if (url.pathname === '/login' && req.method === 'GET') return send(200, page('Sign in', loginForm('')));
  if (url.pathname === '/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const form = new URLSearchParams(body);
      const user = users[form.get('email') || ''];
      if (!user || user.password !== form.get('password')) return send(401, page('Sign in', loginForm('Invalid email or password')));
      const sid = randomUUID();
      sessions.set(sid, user);
      writeFileSync('data.json', JSON.stringify({ last_sign_in: user.email, at: new Date().toISOString() })); // the app keeps a small file in its own folder, like many real apps
      send(303, '', { location: '/dashboard', 'set-cookie': `sid=${sid}; HttpOnly; SameSite=Lax; Path=/` });
    });
    return;
  }
  if (url.pathname === '/dashboard') {
    const user = sessionUser(req);
    if (!user) return send(303, '', { location: '/login' });
    const orders = user.orders.map(o => `<li>Order ${o}</li>`).join('');
    return send(200, page('Dashboard', `<h1>Dashboard</h1><p id="greeting">${greeting(user)}</p><h2>Your orders</h2><ul aria-label="Orders">${orders}</ul>`));
  }
  send(404, page('Not found', '<h1>Not found</h1>'));
});

function loginForm(error) {
  return `<h1>Sign in</h1>${error ? `<p class="error" role="alert">${error}</p>` : ''}
<form method="post" action="/login"><label>Email <input name="email" type="email" autocomplete="username"></label>
<label>Password <input name="password" type="password" autocomplete="current-password"></label><button type="submit">Sign in</button></form>`;
}

server.listen(port, '127.0.0.1', () => console.log(`Fixture Shop listening on http://127.0.0.1:${port}`));
