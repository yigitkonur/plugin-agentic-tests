#!/usr/bin/env node
// Structural checks for the marketplace, run in CI next to `node scripts/build.mjs --check`.
// - every plugin has a manifest whose name matches its folder and whose version equals VERSION
// - the marketplace lists exactly the plugins on disk, with the same version
// - agents have name, description (at most 60 words), model and no unresolved template markers
// - skills are manual-only (disable-model-invocation: true)
// - helper scripts named in agents and skills exist and are executable
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
const errors = [];
const frontmatter = text => Object.fromEntries((text.match(/^---\n([\s\S]*?)\n---/)?.[1] || '').split('\n').map(line => line.match(/^([\w-]+):\s*(.*)$/)).filter(Boolean).map(m => [m[1], m[2]]));

const plugins = readdirSync(path.join(root, 'plugins')).filter(name => existsSync(path.join(root, 'plugins', name, '.claude-plugin', 'plugin.json')));
const marketplace = JSON.parse(readFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
const listed = new Map(marketplace.plugins.map(p => [p.name, p]));
if (marketplace.metadata?.version !== version) errors.push(`marketplace metadata.version ${marketplace.metadata?.version} != VERSION ${version}`);
for (const name of plugins) {
  const manifest = JSON.parse(readFileSync(path.join(root, 'plugins', name, '.claude-plugin', 'plugin.json'), 'utf8'));
  if (manifest.name !== name) errors.push(`plugins/${name}: manifest name ${manifest.name}`);
  if (manifest.version !== version) errors.push(`plugins/${name}: version ${manifest.version} != VERSION ${version}`);
  const entry = listed.get(name);
  if (!entry) errors.push(`marketplace does not list ${name}`);
  else {
    if (entry.version !== version) errors.push(`marketplace ${name} version ${entry.version} != VERSION ${version}`);
    if (entry.source !== `./plugins/${name}`) errors.push(`marketplace ${name} source ${entry.source}`);
  }
}
for (const name of listed.keys()) if (!plugins.includes(name)) errors.push(`marketplace lists ${name}, which has no plugin folder`);

const helpers = path.join(root, 'plugins', 'agentic-tests', 'scripts');
const checkHelpers = (file, text) => {
  for (const script of new Set(text.match(/[\w-]+\.(?:sh|mjs)\b/g) || [])) {
    if (['at.mjs', 'pull-evidence.sh', 'schema-check.mjs', 'select-mac.sh', 'device-session.sh'].includes(script)) {
      const target = path.join(helpers, script);
      if (!existsSync(target)) errors.push(`${file}: names missing helper ${script}`);
      else if (!(statSync(target).mode & 0o111)) errors.push(`helper ${script} is not executable`);
    }
  }
};
for (const name of plugins) {
  const agents = path.join(root, 'plugins', name, 'agents');
  if (existsSync(agents)) for (const file of readdirSync(agents)) {
    const relative = `plugins/${name}/agents/${file}`;
    const text = readFileSync(path.join(agents, file), 'utf8'), fm = frontmatter(text);
    for (const key of ['name', 'description', 'model']) if (!fm[key]) errors.push(`${relative}: missing ${key}`);
    if (fm.name && `${fm.name}.md` !== file) errors.push(`${relative}: name ${fm.name} does not match file`);
    if ((fm.description || '').split(/\s+/).length > 60) errors.push(`${relative}: description over 60 words (it is loaded in every session)`);
    if (/\{\{/.test(text)) errors.push(`${relative}: unresolved template marker`);
    checkHelpers(relative, text);
  }
  const skills = path.join(root, 'plugins', name, 'skills');
  if (existsSync(skills)) for (const skill of readdirSync(skills)) {
    const relative = `plugins/${name}/skills/${skill}/SKILL.md`;
    const text = readFileSync(path.join(skills, skill, 'SKILL.md'), 'utf8'), fm = frontmatter(text);
    if (fm.name !== skill) errors.push(`${relative}: name ${fm.name}`);
    if (fm['disable-model-invocation'] !== 'true') errors.push(`${relative}: must be manual-only (disable-model-invocation: true)`);
    checkHelpers(relative, text);
  }
}
if (errors.length) { console.error(`validate: ${errors.length} problem(s)\n  ${errors.join('\n  ')}`); process.exit(1); }
console.log(JSON.stringify({ ok: true, version, plugins: plugins.length }));
