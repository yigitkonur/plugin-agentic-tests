#!/usr/bin/env node
// Token and model usage of a headless run: main session versus workers, from a `claude -p --output-format stream-json --verbose` log.
//   node scripts/run-stats.mjs <run.jsonl>
// Streamed messages repeat with growing usage, so the maximum per API message id is kept.
import { readFileSync } from 'node:fs';
const lines = readFileSync(process.argv[2], 'utf8').trim().split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const per = new Map();
for (const l of lines) {
  if (l.type !== 'assistant' || !l.message?.usage) continue;
  const u = l.message.usage, prev = per.get(l.message.id) || { worker: !!l.parent_tool_use_id, model: l.message.model, in: 0, cacheRead: 0, cacheWrite: 0, out: 0 };
  per.set(l.message.id, { ...prev, in: Math.max(prev.in, u.input_tokens || 0), cacheRead: Math.max(prev.cacheRead, u.cache_read_input_tokens || 0), cacheWrite: Math.max(prev.cacheWrite, u.cache_creation_input_tokens || 0), out: Math.max(prev.out, u.output_tokens || 0) });
}
const agg = f => [...per.values()].filter(f).reduce((a, m) => ({ calls: a.calls + 1, in: a.in + m.in, cacheRead: a.cacheRead + m.cacheRead, cacheWrite: a.cacheWrite + m.cacheWrite, out: a.out + m.out }), { calls: 0, in: 0, cacheRead: 0, cacheWrite: 0, out: 0 });
const total = b => b.in + b.cacheRead + b.cacheWrite + b.out;
const main = agg(m => !m.worker), workers = agg(m => m.worker);
const result = lines.filter(l => l.type === 'result').at(-1);
const models = {}; for (const m of per.values()) { const k = `${m.worker ? 'worker' : 'main'}:${m.model}`; models[k] = (models[k] || 0) + 1; }
const times = lines.map(l => l.timestamp).filter(Boolean);
console.log(JSON.stringify({ cost_usd: result && +result.total_cost_usd.toFixed(2), main: { ...main, total: total(main) }, workers: { ...workers, total: total(workers) }, models }));
