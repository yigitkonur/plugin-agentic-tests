import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, lstatSync } from 'node:fs';
import { mkdir, copyFile, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
let modules;
const failure = (message, details = []) => Object.assign(new Error(message), { code: 'DEPENDENCIES_MISSING', exitCode: 5, details });

export function dependencyLocation() {
  const hash = createHash('sha256').update(readFileSync(path.join(root, 'package-lock.json'))).digest('hex');
  return path.join(process.env.AGENTIC_TESTS_CACHE || path.join(homedir(), '.cache', 'run-agentic-tests'), hash);
}

export function getDependencies() {
  const cache = dependencyLocation();
  if (modules?.cache === cache) return modules;
  modules = undefined;
  if (!existsSync(path.join(cache, 'node_modules', 'yaml', 'package.json'))) {
    throw failure('Run doctor --setup to install locked dependencies in the external cache.', [cache]);
  }
  try {
    const require = createRequire(path.join(cache, 'package.json'));
    if (require('yaml/package.json').version !== '2.9.1' || require('ajv/package.json').version !== '8.20.0') {
      throw failure('Dependency cache versions differ from the lock; remove this cache and run doctor --setup.', [cache]);
    }
    modules = { YAML: require('yaml'), Ajv: require('ajv').default, cache };
    return modules;
  } catch (error) {
    if (error.code === 'DEPENDENCIES_MISSING') throw error;
    throw failure('Dependency cache is incomplete; run doctor --setup.', [cache]);
  }
}

export async function loadDependencies(options = {}) {
  if (Number(process.versions.node.split('.')[0]) < 22) throw failure('Node.js 22 or newer is required.');
  try { return getDependencies(); } catch (error) { if (!options?.setup) throw error; }
  const cache = dependencyLocation();
  await mkdir(path.dirname(cache), { recursive: true });
  const staging = `${cache}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(staging, { recursive: false });
  try {
    for (const file of ['package.json', 'package-lock.json']) await copyFile(path.join(root, file), path.join(staging, file));
    await execute('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: staging, timeout: 120000, maxBuffer: 1024 * 1024 });
    try { await rename(staging, cache); } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
      try { return getDependencies(); } catch (invalid) { if (invalid.code !== 'DEPENDENCIES_MISSING') throw invalid; }
      if (lstatSync(cache).isSymbolicLink() || !lstatSync(cache).isDirectory()) throw failure('Refusing to replace a dependency-cache symlink or non-directory.', [cache]);
      const quarantined = `${cache}.${process.pid}.${Date.now()}.incomplete`;
      await rename(cache, quarantined);
      try {
        await rename(staging, cache);
        getDependencies();
      } catch (installError) {
        if (!existsSync(cache)) await rename(quarantined, cache);
        throw installError;
      } finally { if (existsSync(cache)) await rm(quarantined, { recursive: true, force: true }); }
    }
    return getDependencies();
  } catch (error) {
    if (error.code === 'DEPENDENCIES_MISSING') throw error;
    throw failure('Installing locked dependencies failed. Check npm/network access, then retry doctor --setup.', [error.code || 'NPM_FAILED']);
  } finally { await rm(staging, { recursive: true, force: true }); }
}

// Locate sibling runner skills wherever the host installs them.
export function findSkill(name) {
  const extra = (process.env.AGENTIC_SKILL_DIRS || '').split(path.delimiter).filter(Boolean);
  const candidates = [
    ...extra.map(dir => path.join(dir, name, 'SKILL.md')),
    path.join(homedir(), '.claude', 'skills', name, 'SKILL.md'),
    path.join(homedir(), '.agents', 'skills', name, 'SKILL.md'),
    path.join(root, '..', name, 'SKILL.md'),
    path.join(root, 'skills', name, 'SKILL.md'),
  ];
  return candidates.find(candidate => existsSync(candidate)) || null;
}

// Agent and MCP shells skip profile files, so also look in the runners' own install dirs.
function findExecutable(name, extraDirs = []) {
  const dirs = [...(process.env.PATH || '').split(path.delimiter), ...extraDirs].filter(Boolean);
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    try { if (existsSync(candidate) && !lstatSync(candidate).isDirectory()) return candidate; } catch {}
  }
  return null;
}

async function javaVersionAt(home) {
  try {
    const { stdout, stderr } = await execute(path.join(home, 'bin', 'java'), ['-version'], { timeout: 5000 });
    const output = `${stdout}\n${stderr}`;
    const match = output.match(/version\s+"([\d._]+)"/i);
    return match ? match[1] : null;
  } catch { return null; }
}

// A Java 17+ home: JAVA_HOME, macOS java_home, then Homebrew JDKs.
export async function findJavaHome() {
  const candidates = [];
  if (process.env.JAVA_HOME) candidates.push(process.env.JAVA_HOME);
  if (process.platform === 'darwin') {
    try { candidates.push((await execute('/usr/libexec/java_home', ['-v', '17+'], { timeout: 5000 })).stdout.trim()); } catch {}
    for (const formula of ['openjdk@21', 'openjdk@17', 'openjdk', 'openjdk@27', 'openjdk@25'])
      for (const prefix of ['/opt/homebrew/opt', '/usr/local/opt'])
        candidates.push(path.join(prefix, formula, 'libexec', 'openjdk.jdk', 'Contents', 'Home'));
  }
  for (const home of candidates.filter(Boolean)) {
    if (!existsSync(path.join(home, 'bin', 'java'))) continue;
    const version = await javaVersionAt(home);
    if (version && Number(version.split('.')[0]) >= 17) return { home, version };
  }
  return null;
}

export async function checkRunnerEgoBrowser() {
  const skillPath = findSkill('ego-browser');
  const cliPath = findExecutable('ego-browser', [path.join(homedir(), '.local', 'bin')]);
  try {
    const { stdout, stderr } = await execute(cliPath || 'ego-browser', ['--version'], { timeout: 15000 });
    const output = `${stdout}\n${stderr}`;
    const versionMatch = output.match(/ego-browser\s+([\d.]+)/i);
    let remoteHost = null;
    try { remoteHost = readFileSync(cliPath, 'utf8').match(/^target=([\w.-]+)/m)?.[1] || null; } catch {}
    return {
      available: true,
      cli_available: true,
      cli_path: cliPath,
      skill_available: Boolean(skillPath),
      skill_path: skillPath,
      version: versionMatch ? versionMatch[1] : output.trim().split('\n')[0],
      remote_host: remoteHost || (output.includes('tugce') ? 'tugce' : null),
    };
  } catch (error) {
    return { available: false, cli_available: Boolean(cliPath), cli_path: cliPath, skill_available: Boolean(skillPath), skill_path: skillPath, error: error.code || 'NOT_FOUND' };
  }
}

async function xcodePath() {
  if (process.platform !== 'darwin') return null;
  try { return (await execute('xcode-select', ['-p'], { timeout: 5000 })).stdout.trim() || null; } catch { return null; }
}

export async function checkRunnerMaestro() {
  const skillPath = findSkill('test-by-maestro');
  const cliPath = findExecutable('maestro', [path.join(homedir(), '.maestro', 'bin')]);
  const java = await findJavaHome();
  const host = { platform: process.platform, xcode: await xcodePath(), adb: findExecutable('adb', [path.join(homedir(), 'Library', 'Android', 'sdk', 'platform-tools')]) };
  const base = { cli_path: cliPath, skill_available: Boolean(skillPath), skill_path: skillPath, java: { available: Boolean(java), version: java?.version || null, home: java?.home || null }, host, ios_simulator_supported: Boolean(host.xcode) };
  if (!cliPath) return { available: false, cli_available: false, supported: false, ...base, error: 'NOT_FOUND' };
  if (!java) return { available: false, cli_available: true, supported: false, ...base, error: 'JAVA_RUNTIME_MISSING' };
  try {
    const env = { ...process.env, JAVA_HOME: java.home, PATH: [path.join(java.home, 'bin'), path.dirname(cliPath), process.env.PATH].join(path.delimiter) };
    const { stdout } = await execute(cliPath, ['--version'], { timeout: 60000, env });
    const version = stdout.trim().split('\n').filter(line => /^\d+\.\d+\.\d+/.test(line.trim())).at(-1)?.trim() || stdout.trim();
    const supported = /^2\.(1[01]|\d+)\./.test(version);
    return { available: supported, cli_available: true, version, supported, ...base, env: { JAVA_HOME: java.home, PATH_PREPEND: [path.join(java.home, 'bin'), path.dirname(cliPath)] } };
  } catch (error) {
    return { available: false, cli_available: true, supported: false, ...base, error: error.code || 'MAESTRO_FAILED' };
  }
}

export async function checkRunnerMcpc() {
  const skillPath = findSkill('test-by-mcpc-cli');
  const cliPath = findExecutable('mcpc');
  try {
    const { stdout } = await execute(cliPath || 'mcpc', ['--version'], { timeout: 10000 });
    const version = stdout.trim();
    const versionSupported = /^0\.7\./.test(version);
    return {
      available: versionSupported,
      cli_available: true,
      cli_path: cliPath,
      skill_available: Boolean(skillPath),
      skill_path: skillPath,
      version,
      supported: versionSupported,
      session_first: true,
      skills_extension: true,
    };
  } catch (error) {
    return { available: false, cli_available: Boolean(cliPath), cli_path: cliPath, skill_available: Boolean(skillPath), skill_path: skillPath, supported: false, error: error.code || 'NOT_FOUND' };
  }
}

export async function inspectAllRunners() {
  const [egoBrowser, maestro, mcpc] = await Promise.all([
    checkRunnerEgoBrowser(),
    checkRunnerMaestro(),
    checkRunnerMcpc(),
  ]);
  return {
    ego_browser: egoBrowser,
    maestro,
    mcpc,
  };
}

