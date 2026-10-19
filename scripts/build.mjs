#!/usr/bin/env node
// Render src/agents/*.md into each plugin's agents/ directory.
// - `{{> name}}` is replaced with src/fragments/<name>.md.
// - The build-only frontmatter key `plugins: [a, b]` lists the target plugins and is removed.
// - Shared helper scripts live once in the core plugin; nothing is copied.
// `--check` exits 1 when any rendered file differs from what is committed.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const fragments = Object.fromEntries(readdirSync(path.join(root, 'src/fragments')).filter(f => f.endsWith('.md'))
  .map(f => [f.replace(/\.md$/, ''), readFileSync(path.join(root, 'src/fragments', f), 'utf8').trim()]));

const outputs = new Map();
for (const file of readdirSync(path.join(root, 'src/agents')).filter(f => f.endsWith('.md')).sort()) {
  const text = readFileSync(path.join(root, 'src/agents', file), 'utf8');
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${file}: missing frontmatter`);
  const lines = match[1].split('\n');
  const pluginsLine = lines.find(line => line.startsWith('plugins:'));
  if (!pluginsLine) throw new Error(`${file}: missing build-only "plugins:" key`);
  const plugins = pluginsLine.replace(/^plugins:\s*\[|\]\s*$/g, '').split(',').map(s => s.trim()).filter(Boolean);
  const frontmatter = lines.filter(line => line !== pluginsLine).join('\n');
  const body = match[2].replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => {
    if (!(name in fragments)) throw new Error(`${file}: unknown fragment ${name}`);
    return fragments[name];
  });
  if (/\{\{/.test(body)) throw new Error(`${file}: unresolved template marker`);
  const rendered = `---\n${frontmatter}\n---\n<!-- Generated from src/agents/${file} by scripts/build.mjs. Edit the source, then run node scripts/build.mjs. -->\n${body}`;
  for (const plugin of plugins) {
    if (!existsSync(path.join(root, 'plugins', plugin))) throw new Error(`${file}: unknown plugin ${plugin}`);
    outputs.set(path.join('plugins', plugin, 'agents', file), rendered);
  }
}

let stale = [];
const expected = new Set(outputs.keys());
for (const plugin of readdirSync(path.join(root, 'plugins'))) {
  const dir = path.join(root, 'plugins', plugin, 'agents');
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir)) {
    const relative = path.join('plugins', plugin, 'agents', file);
    if (!expected.has(relative)) { stale.push(`orphan ${relative}`); if (!check) rmSync(path.join(root, relative)); }
  }
}
for (const [relative, content] of outputs) {
  const target = path.join(root, relative);
  const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
  if (current === content) continue;
  stale.push(`${current === null ? 'missing' : 'changed'} ${relative}`);
  if (!check) { mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, content); }
}
if (check && stale.length) { console.error(`Generated agents are stale:\n  ${stale.join('\n  ')}\nRun: node scripts/build.mjs`); process.exit(1); }
console.log(JSON.stringify({ ok: true, mode: check ? 'check' : 'write', agents: outputs.size, changed: stale }));
