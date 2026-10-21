#!/usr/bin/env node
// Controller wrapper used by the agentic-tests plugin. It runs the bundled engine
// with the embedded handoff profile and folds the common multi-command steps into one
// call each, so the orchestrator spends one tool call per step and reads compact JSON.
//
//   at.mjs doctor   [--project P]                          (installs the engine's locked dependencies on first use)
//   at.mjs init     --project P --slug S [--mode interactive|autonomous] [--host-capacity N] [--max-attempts N] [--github-remote R]
//   at.mjs launch   --campaign C [--request FILE]          (request YAML on stdin; several requests separated by a line "---")
//   at.mjs dispatch --campaign C --task-id J               (retry a task launch allocated but could not dispatch)
//   at.mjs bind     --campaign C --task-id J --handle H    or  --pairs "J1=H1 J2=H2"
//   at.mjs publish  --campaign C --task-id J [--file DRAFT] [--tokens N --model M]   (reviewers: check, submit, close)
//   at.mjs close    --campaign C --task-id J [--tokens N --model M]
//   at.mjs state    --campaign C
//   at.mjs report   --campaign C [--port N]               (reconcile, build, serve)
//   at.mjs cost     --campaign C --task-id J --tokens N [--model M]
//   at.mjs leftovers --project P                           (running engine-owned targets of earlier campaigns)
//   at.mjs teardown --campaign C                           (stop its runtimes, remove its worktrees and devices, blank session secrets; keeps the report server)
//   at.mjs scrub    --campaign C                           (blank resolved server secrets in mcpc owner files)
//   at.mjs <any engine command ...>                       (passthrough)
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const engine = path.join(here, '..', 'engine', 'run-agentic-tests', 'scripts', 'agentic-tests.mjs');
// The runner documentation ships inside this plugin (runners/<skill>/SKILL.md), so no user-level skills are needed.
const skillDirs = [path.join(here, '..', 'runners'), process.env.AGENTIC_SKILL_DIRS].filter(Boolean).join(path.delimiter);
const env = { ...process.env, AGENTIC_HANDOFF_PROFILE: 'embedded', AGENTIC_HELPERS_DIR: here, AGENTIC_SKILL_DIRS: skillDirs };
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function once(args, { input } = {}) {
  const result = spawnSync(process.execPath, [engine, ...args], { encoding: 'utf8', env, input, timeout: 600000, maxBuffer: 64 * 1024 * 1024 });
  let data = null;
  try { data = JSON.parse(result.stdout); } catch {}
  return { status: result.status ?? 6, data, stderr: (result.stderr || '').trim() };
}
const errorText = result => `${JSON.stringify(result.data?.error || '')} ${result.stderr}`;
// First use installs the engine's locked dependencies; a busy controller lock is retried three times.
function run(args, opts = {}) {
  let result = once(args, opts);
  if (result.status !== 0 && !args.includes('--setup') && /DEPENDENCIES_MISSING/.test(errorText(result)) && once(['doctor', '--setup']).status === 0) result = once(args, opts);
  for (let attempt = 0; attempt < 3 && result.status !== 0 && /CONTROLLER_BUSY/.test(errorText(result)); attempt++) { sleep(10000); result = once(args, opts); }
  return result;
}
const recordCost = (campaign, taskId, tokens, model) => {
  const task = run(['records', '--campaign', campaign, '--kind', 'task', '--format', 'json']).data?.records?.find(t => t.task_id === taskId);
  const entry = { task_id: taskId, role: task?.role || 'unknown', tokens: Number(tokens), model: model || null, at: new Date().toISOString() };
  appendFileSync(path.join(campaign, 'costs.jsonl'), JSON.stringify(entry) + '\n');
  return entry;
};
const print = value => process.stdout.write(JSON.stringify(value) + '\n');
const failure = (step, result) => {
  const error = result.data?.error || { code: 'ENGINE_FAILED', message: result.stderr.slice(-800) };
  return { ok: false, step, code: error.code, message: error.message, details: error.details?.length ? error.details : undefined, issues: error.issues?.length ? error.issues : undefined, next_actions: result.data?.next_actions };
};
const failWith = (step, result) => { print(failure(step, result)); process.exit(result.status || 1); };

function parse(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    options[key.slice(2)] = value;
  }
  return options;
}
const need = (options, key) => options[key] ?? (print({ ok: false, code: 'MISSING_OPTION', message: `--${key} is required` }), process.exit(2));
const abs = (campaign, relative) => path.join(campaign, relative);

// Engine-owned targets that are still running in earlier campaigns of this project.
function leftovers(project) {
  const root = path.join(project, 'agentic-tests');
  if (!existsSync(root)) return [];
  const found = [];
  for (const name of readdirSync(root)) {
    const campaign = path.join(root, name);
    const records = run(['records', '--campaign', campaign, '--kind', 'environment', '--format', 'json']).data?.records || [];
    for (const e of records.filter(item => ['READY', 'STARTING'].includes(item.status) && item.ownership !== 'external')) {
      const inspected = run(['runtime', 'inspect', '--campaign', campaign, '--target-id', e.target_id]).data;
      if (inspected?.alive === false) continue;
      found.push({ campaign, target_id: e.target_id, runtime_type: e.runtime_type, endpoint: e.endpoint, status: e.status, alive: inspected?.alive ?? null });
    }
  }
  return found;
}


// mcpc expands ${NAME} references and the engine adapter records the resolved server config in owner.json:
// blank the values of the variables the target declared (env_names) once its session is stopped.
function scrubSessionSecrets(campaign, environments) {
  const scrubbed = [];
  for (const e of environments) {
    const names = new Set(e.command?.env_names || []);
    const file = path.join(campaign, 'environments', e.target_id, 'mcpc', 'owner.json');
    if (!names.size || !existsSync(file)) continue;
    try {
      const owner = JSON.parse(readFileSync(file, 'utf8'));
      const env = owner.native?.server?.env;
      if (!env) continue;
      let changed = false;
      for (const name of Object.keys(env)) if (names.has(name) && env[name] !== '[REDACTED]') { env[name] = '[REDACTED]'; changed = true; }
      if (changed) { writeFileSync(file, JSON.stringify(owner, null, 2) + '\n', { mode: 0o600 }); scrubbed.push(e.target_id); }
    } catch { /* an unreadable owner file is left as it is */ }
  }
  return scrubbed;
}

// Stop the campaign's runtimes, then remove what only this campaign created: successor worktrees and its devices.
function teardown(campaign) {
  const actions = [];
  const before = run(['reconcile', '--campaign', campaign]).data;
  if (before && !existsSync(path.join(campaign, '99-teardown.json'))) writeFileSync(path.join(campaign, '99-teardown.json'), JSON.stringify({ at: new Date().toISOString(), complete: before.complete, outcome: before.outcome, cases: (before.cases || []).map(c => ({ case_id: c.case_id, outcome: c.outcome })) }, null, 2) + '\n');
  const read = kind => run(['records', '--campaign', campaign, '--kind', kind, '--format', 'json']).data?.records || [];
  const project = read('campaign')[0]?.project;
  const campaignId = read('campaign')[0]?.campaign_id;
  for (const e of read('environment')) {
    if (['READY', 'STARTING'].includes(e.status)) {
      const stopped = run(['runtime', 'stop', '--campaign', campaign, '--target-id', e.target_id]);
      actions.push({ stopped: e.target_id, type: e.runtime_type, ok: stopped.status === 0, ownership: stopped.data?.ownership, error: stopped.status === 0 ? undefined : (stopped.data?.error?.code || 'FAILED') });
    }
    const argv = e.command?.argv || [];
    const flag = key => argv[argv.indexOf(key) + 1];
    if (e.runtime_type === 'mobile' && /^agentic-tests-/.test(flag('--name') || '')) {
      const name = flag('--name'), host = flag('--host') || 'local', platform = flag('--platform');
      const script = platform === 'android'
        ? `avdmanager list avd -c | grep -qx '${name}' && avdmanager delete avd -n '${name}'; true`
        : `for u in $(xcrun simctl list devices | grep -F '${name} (' | grep -Eo '[0-9A-F-]{36}'); do xcrun simctl shutdown $u 2>/dev/null; xcrun simctl delete $u && echo deleted $u; done`;
      const env = readFileSync(path.join(here, 'maestro-env.sh'), 'utf8');
      const swept = host === 'local'
        ? spawnSync('bash', ['-c', `${env}\n${script}`], { encoding: 'utf8', timeout: 120000 })
        : spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, 'bash -l -s'], { encoding: 'utf8', input: `${env}\n${script}\n`, timeout: 120000 });
      actions.push({ device_sweep: name, host, output: (swept.stdout || '').trim() || 'nothing left' });
    }
  }
  const scrubbed = scrubSessionSecrets(campaign, read('environment'));
  if (scrubbed.length) actions.push({ secrets_scrubbed_from: scrubbed.map(target => `environments/${target}/mcpc/owner.json`) });
  if (project && campaignId) {
    const dir = path.join(path.dirname(project), '.agentic-test-worktrees', campaignId);
    if (existsSync(dir)) {
      for (const name of readdirSync(dir)) {
        const removed = spawnSync('git', ['-C', project, 'worktree', 'remove', '--force', path.join(dir, name)], { encoding: 'utf8' });
        actions.push({ worktree_removed: path.join(dir, name), ok: removed.status === 0, error: removed.status === 0 ? undefined : removed.stderr.trim().slice(-200) });
      }
      spawnSync('git', ['-C', project, 'worktree', 'prune']);
      try { rmSync(dir, { recursive: true }); } catch {}
    }
  }
  return { ok: actions.every(a => a.ok !== false), campaign, actions, kept: 'the report server, if one is running (stop it with: at.mjs report stop --campaign <campaign>)' };
}

const [command, ...rest] = process.argv.slice(2);
const options = parse(rest);

if (command === 'doctor') {
  const result = run(['doctor', '--setup', '--runners', ...(options.project ? ['--project', options.project] : [])]);
  if (!result.data) failWith('doctor', result);
  const r = result.data.runners || {};
  const have = name => spawnSync('bash', ['-c', `command -v ${name}`], { encoding: 'utf8' }).status === 0;
  const git = (...args) => { const out = spawnSync('git', ['-C', options.project, ...args], { encoding: 'utf8' }); return out.status === 0 ? out.stdout.trim() : null; };
  const project = options.project && existsSync(options.project) ? (() => {
    const inside = git('rev-parse', '--is-inside-work-tree') === 'true';
    const remote = inside ? git('remote', 'get-url', 'origin') : null;
    return { path: options.project, git: inside, has_commit: inside && git('rev-parse', '--verify', 'HEAD') !== null, clean: inside ? git('status', '--porcelain') === '' : null, branch: inside ? git('rev-parse', '--abbrev-ref', 'HEAD') : null, remote, github_remote: Boolean(remote && /github\.com|github-[\w.-]+[:/]/.test(remote)) };
  })() : undefined;
  const missingAccounts = (options.accounts || '').split(',').filter(Boolean).filter(name => !process.env[name]);
  print({
    ok: result.data.ok, ready: result.data.ready, node: result.data.node, dependencies: result.data.dependencies,
    timeout: have('timeout') || have('gtimeout') || have('perl'),
    web: { available: r.ego_browser?.available, version: r.ego_browser?.version, remote_host: r.ego_browser?.remote_host, skill: r.ego_browser?.skill_path },
    mcp: { available: r.mcpc?.available, version: r.mcpc?.version, skill: r.mcpc?.skill_path },
    mobile: { available: r.maestro?.available, version: r.maestro?.version, java_home: r.maestro?.java?.home, xcode: r.maestro?.host?.xcode, adb: r.maestro?.host?.adb, skill: r.maestro?.skill_path },
    api: { available: have('curl') },
    ...(project ? { project } : {}),
    ...(options.accounts ? { accounts_missing: missingAccounts } : {}),
    ...(options.project ? { leftovers: leftovers(options.project) } : {}),
    next_actions: result.data.next_actions,
  });
} else if (command === 'init') {
  const args = ['init', '--project', need(options, 'project'), '--slug', need(options, 'slug')];
  for (const key of ['mode', 'host-capacity', 'max-active', 'max-attempts', 'locale', 'github-remote']) if (options[key]) args.push(`--${key}`, options[key]);
  const result = run(args);
  if (result.status !== 0) failWith('init', result);
  print({ ok: true, campaign: result.data.campaign_path, campaign_id: result.data.campaign?.campaign_id, mode: result.data.campaign?.mode, host_capacity: result.data.campaign?.host_capacity, max_attempts: result.data.campaign?.max_attempts });
} else if (command === 'launch') {
  const campaign = need(options, 'campaign');
  const requests = [];
  if (options.request) requests.push(options.request);
  else {
    const text = readFileSync(0, 'utf8');
    if (!text.trim()) { print({ ok: false, code: 'MISSING_REQUEST', message: 'Pass --request FILE or the request YAML on stdin.' }); process.exit(2); }
    mkdirSync(path.join(campaign, 'requests'), { recursive: true });
    text.split(/^---[ \t]*$/m).map(part => part.trim()).filter(Boolean).forEach((part, index) => {
      const file = path.join(campaign, 'requests', `${new Date().toISOString().replace(/[:.]/g, '')}-${process.pid}-${index}.yaml`);
      writeFileSync(file, part + '\n'); requests.push(file);
    });
  }
  let failed = false;
  for (const request of requests) {
    const created = run(['task', 'create', '--campaign', campaign, '--request', request]);
    if (created.status !== 0) { print(failure('task create', created)); failed = true; continue; }
    const task = created.data.task;
    const dispatched = run(['task', 'dispatch', '--campaign', campaign, '--task-id', task.task_id]);
    if (dispatched.status !== 0) { print({ ...failure(`task dispatch ${task.task_id} (task stays PLANNED)`, dispatched), task_id: task.task_id, role: task.role }); failed = true; continue; }
    print({
      ok: true, task_id: task.task_id, role: task.role, case_ids: task.case_ids,
      ...(task.round_id ? { round_id: task.round_id } : {}), ...(task.target_id ? { target_id: task.target_id } : {}),
      ...(task.verification_slot ? { slot: task.verification_slot } : {}), ...(task.plan_id ? { plan_id: task.plan_id } : {}),
      handoff: abs(campaign, created.data.handoff_path),
      drafts: created.data.draft_paths.map(p => abs(campaign, p)),
      outputs: created.data.outputs.map(o => abs(campaign, o.path)),
    });
  }
  if (failed) process.exitCode = 1;
} else if (command === 'dispatch') {
  // Dispatch a task that launch allocated but could not dispatch yet (resource lease, capacity).
  const campaign = need(options, 'campaign'), taskId = need(options, 'task-id');
  const dispatched = run(['task', 'dispatch', '--campaign', campaign, '--task-id', taskId]);
  if (dispatched.status !== 0) failWith(`task dispatch ${taskId} (task stays PLANNED)`, dispatched);
  const task = dispatched.data.task;
  print({ ok: true, task_id: task.task_id, role: task.role, case_ids: task.case_ids, ...(task.round_id ? { round_id: task.round_id } : {}), handoff: abs(campaign, `tasks/${task.task_id}/10-handoff.md`), drafts: task.draft_paths.map(p => abs(campaign, p)), outputs: task.outputs.map(o => abs(campaign, o.path)) });
} else if (command === 'bind') {
  const campaign = need(options, 'campaign');
  const pairs = options.pairs ? options.pairs.split(/[\s,]+/).filter(Boolean).map(pair => pair.split('=')) : [[need(options, 'task-id'), need(options, 'handle')]];
  let failed = false;
  for (const [taskId, handle] of pairs) {
    const result = run(['task', 'bind', '--campaign', campaign, '--task-id', taskId, '--handle', handle]);
    if (result.status !== 0) { print({ ...failure(`task bind ${taskId}`, result), task_id: taskId }); failed = true; continue; }
    print({ ok: true, task_id: result.data.task.task_id, state: result.data.task.state });
  }
  if (failed) process.exitCode = 1;
} else if (command === 'publish') {
  const campaign = need(options, 'campaign'), taskId = need(options, 'task-id');
  const task = JSON.parse(JSON.stringify(run(['records', '--campaign', campaign, '--kind', 'task', '--format', 'json']).data?.records?.find(t => t.task_id === taskId) || null));
  if (!task) { print({ ok: false, code: 'TASK_NOT_FOUND', message: `Unknown task ${taskId}` }); process.exit(3); }
  const drafts = options.file ? [options.file] : task.draft_paths.map(p => abs(campaign, p));
  const receipts = [];
  for (const draft of drafts) {
    const checked = run(['submit', '--campaign', campaign, '--task-id', taskId, '--file', draft, '--check']);
    if (checked.status !== 0) failWith(`submit --check ${path.basename(draft)} (send these issues to the worker; do not close)`, checked);
    const submitted = run(['submit', '--campaign', campaign, '--task-id', taskId, '--file', draft]);
    if (submitted.status !== 0) failWith(`submit ${path.basename(draft)}`, submitted);
    receipts.push({ record_id: submitted.data.record_id, status: submitted.data.submission_status, verdict: submitted.data.test_verdict });
  }
  const closed = run(['task', 'close', '--campaign', campaign, '--task-id', taskId, '--finished', 'true']);
  if (closed.status !== 0) failWith('task close', closed);
  if (options.tokens) recordCost(campaign, taskId, options.tokens, options.model);
  print({ ok: true, task_id: taskId, receipts, state: closed.data.task.state });
} else if (command === 'close') {
  const result = run(['task', 'close', '--campaign', need(options, 'campaign'), '--task-id', need(options, 'task-id'), '--finished', 'true']);
  if (result.status !== 0) failWith('task close', result);
  if (options.tokens) recordCost(options.campaign, options['task-id'], options.tokens, options.model);
  print({ ok: true, task_id: result.data.task.task_id, state: result.data.task.state });
} else if (command === 'state') {
  const campaign = need(options, 'campaign');
  const result = run(['reconcile', '--campaign', campaign]);
  if (result.status !== 0) failWith('reconcile', result);
  const s = result.data;
  const costs = existsSync(path.join(campaign, 'costs.jsonl')) ? readFileSync(path.join(campaign, 'costs.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  const marker = existsSync(path.join(campaign, '99-teardown.json')) ? JSON.parse(readFileSync(path.join(campaign, '99-teardown.json'), 'utf8')) : null;
  print({
    ok: true, complete: s.complete, outcome: s.outcome, target: s.latest_target_id, counts: s.counts,
    ...(marker ? { torn_down: { at: marker.at, complete_before: marker.complete, outcome_before: marker.outcome, note: 'The engine judges proof against a READY target, so after teardown complete is false and TARGET_NOT_READY / CLOSURE_AUDIT_REQUIRED appear. The result at teardown time is the one recorded here and in the report.' } } : {}),
    cases: (s.cases || []).map(c => ({ case_id: c.case_id, outcome: c.outcome, round: c.round_id, reviews: c.verification_record_ids?.length, reason: c.reason })),
    findings: (s.findings || []).map(f => ({ finding_id: f.finding_id, class: f.class, state: f.state, scope: f.scope, cases: f.case_ids, attempts: f.attempts })),
    running: s.running, ready: s.ready, blocked: s.blocked,
    obligations: (s.obligations || []).map(o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null))),
    tokens: costs.length ? { total: costs.reduce((n, c) => n + c.tokens, 0), by_role: costs.reduce((m, c) => ({ ...m, [c.role]: (m[c.role] || 0) + c.tokens }), {}) } : undefined,
  });
} else if (command === 'report' && !(rest[0] && !rest[0].startsWith('--'))) {
  const campaign = need(options, 'campaign');
  run(['reconcile', '--campaign', campaign]);
  const built = run(['report', 'build', '--campaign', campaign]);
  if (built.status !== 0) failWith('report build', built);
  const served = run(['report', 'serve', '--campaign', campaign, ...(options.port ? ['--port', options.port] : [])]);
  if (served.status !== 0) failWith('report serve', served);
  print({ ok: true, report: abs(campaign, 'report/index.html'), url: served.data.url || served.data.report?.url, pid: served.data.pid || served.data.report?.pid });
} else if (command === 'cost') {
  print({ ok: true, ...recordCost(need(options, 'campaign'), need(options, 'task-id'), Number(need(options, 'tokens')), options.model) });
} else if (command === 'leftovers') {
  print({ ok: true, leftovers: leftovers(need(options, 'project')) });
} else if (command === 'scrub') {
  const campaign = need(options, 'campaign');
  const environments = run(['records', '--campaign', campaign, '--kind', 'environment', '--format', 'json']).data?.records || [];
  print({ ok: true, scrubbed: scrubSessionSecrets(campaign, environments) });
} else if (command === 'teardown') {
  print(teardown(need(options, 'campaign')));
} else if (!command || command === 'help' || command === '--help') {
  print({ ok: true, commands: ['doctor', 'init', 'launch', 'dispatch', 'bind', 'publish', 'close', 'state', 'report', 'cost', 'leftovers', 'scrub', 'teardown', '<engine passthrough>'], engine });
} else {
  const result = spawnSync(process.execPath, [engine, command, ...rest], { stdio: 'inherit', env });
  process.exit(result.status ?? 6);
}
