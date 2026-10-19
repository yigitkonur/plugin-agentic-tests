#!/usr/bin/env node
// Controller wrapper used by the agentic-tests plugin. It runs the bundled engine
// with the embedded handoff profile and folds the common multi-command steps into one
// call each, so the orchestrator spends one tool call per step and reads compact JSON.
//
//   at.mjs doctor
//   at.mjs init     --project P --slug S [--mode interactive|autonomous] [--host-capacity N] [--max-attempts N]
//   at.mjs launch   --campaign C [--request FILE]       (request YAML on stdin when --request is absent)
//   at.mjs bind     --campaign C --task-id J --handle H
//   at.mjs publish  --campaign C --task-id J [--file DRAFT]   (reviewers: check, submit, close)
//   at.mjs close    --campaign C --task-id J
//   at.mjs state    --campaign C
//   at.mjs report   --campaign C [--port N]               (reconcile, build, serve)
//   at.mjs cost     --campaign C --task-id J --tokens N [--model M]
//   at.mjs <any engine command ...>                       (passthrough)
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const engine = path.join(here, '..', 'engine', 'run-agentic-tests', 'scripts', 'agentic-tests.mjs');
const env = { ...process.env, AGENTIC_HANDOFF_PROFILE: 'embedded', AGENTIC_HELPERS_DIR: here };

function run(args, { input } = {}) {
  const result = spawnSync(process.execPath, [engine, ...args], { encoding: 'utf8', env, input, timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
  let data = null;
  try { data = JSON.parse(result.stdout); } catch {}
  return { status: result.status ?? 6, data, stderr: (result.stderr || '').trim() };
}
const print = value => process.stdout.write(JSON.stringify(value) + '\n');
const failWith = (step, result) => {
  const error = result.data?.error || { code: 'ENGINE_FAILED', message: result.stderr.slice(-800) };
  print({ ok: false, step, code: error.code, message: error.message, details: error.details?.length ? error.details : undefined, issues: error.issues?.length ? error.issues : undefined, next_actions: result.data?.next_actions });
  process.exit(result.status || 1);
};

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

const [command, ...rest] = process.argv.slice(2);
const options = parse(rest);

if (command === 'doctor') {
  const result = run(['doctor', '--runners', ...(options.project ? ['--project', options.project] : [])]);
  if (!result.data) failWith('doctor', result);
  const r = result.data.runners || {};
  print({
    ok: result.data.ok, ready: result.data.ready, node: result.data.node,
    web: { available: r.ego_browser?.available, version: r.ego_browser?.version, remote_host: r.ego_browser?.remote_host, skill: r.ego_browser?.skill_path },
    mcp: { available: r.mcpc?.available, version: r.mcpc?.version, skill: r.mcpc?.skill_path },
    mobile: { available: r.maestro?.available, version: r.maestro?.version, java_home: r.maestro?.java?.home, xcode: r.maestro?.host?.xcode, adb: r.maestro?.host?.adb, skill: r.maestro?.skill_path },
    api: { available: spawnSync('curl', ['--version'], { encoding: 'utf8' }).status === 0 },
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
  let request = options.request;
  if (!request) {
    const text = readFileSync(0, 'utf8');
    if (!text.trim()) { print({ ok: false, code: 'MISSING_REQUEST', message: 'Pass --request FILE or the request YAML on stdin.' }); process.exit(2); }
    mkdirSync(path.join(campaign, 'requests'), { recursive: true });
    request = path.join(campaign, 'requests', `${new Date().toISOString().replace(/[:.]/g, '')}-${process.pid}.yaml`);
    writeFileSync(request, text);
  }
  const created = run(['task', 'create', '--campaign', campaign, '--request', request]);
  if (created.status !== 0) failWith('task create', created);
  const task = created.data.task;
  const dispatched = run(['task', 'dispatch', '--campaign', campaign, '--task-id', task.task_id]);
  if (dispatched.status !== 0) failWith(`task dispatch ${task.task_id} (task stays PLANNED)`, dispatched);
  print({
    ok: true, task_id: task.task_id, role: task.role, case_ids: task.case_ids,
    ...(task.round_id ? { round_id: task.round_id } : {}), ...(task.target_id ? { target_id: task.target_id } : {}),
    ...(task.verification_slot ? { slot: task.verification_slot } : {}), ...(task.plan_id ? { plan_id: task.plan_id } : {}),
    handoff: abs(campaign, created.data.handoff_path),
    drafts: created.data.draft_paths.map(p => abs(campaign, p)),
    outputs: created.data.outputs.map(o => abs(campaign, o.path)),
  });
} else if (command === 'bind') {
  const result = run(['task', 'bind', '--campaign', need(options, 'campaign'), '--task-id', need(options, 'task-id'), '--handle', need(options, 'handle')]);
  if (result.status !== 0) failWith('task bind', result);
  print({ ok: true, task_id: result.data.task.task_id, state: result.data.task.state });
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
  print({ ok: true, task_id: taskId, receipts, state: closed.data.task.state });
} else if (command === 'close') {
  const result = run(['task', 'close', '--campaign', need(options, 'campaign'), '--task-id', need(options, 'task-id'), '--finished', 'true']);
  if (result.status !== 0) failWith('task close', result);
  print({ ok: true, task_id: result.data.task.task_id, state: result.data.task.state });
} else if (command === 'state') {
  const campaign = need(options, 'campaign');
  const result = run(['reconcile', '--campaign', campaign]);
  if (result.status !== 0) failWith('reconcile', result);
  const s = result.data;
  const costs = existsSync(path.join(campaign, 'costs.jsonl')) ? readFileSync(path.join(campaign, 'costs.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  print({
    ok: true, complete: s.complete, outcome: s.outcome, target: s.latest_target_id, counts: s.counts,
    cases: (s.cases || []).map(c => ({ case_id: c.case_id, outcome: c.outcome, round: c.round_id, reviews: c.verification_record_ids?.length, reason: c.reason })),
    findings: (s.findings || []).map(f => ({ finding_id: f.finding_id, class: f.class, state: f.state, scope: f.scope, cases: f.case_ids, attempts: f.attempts })),
    running: s.running, ready: s.ready, blocked: s.blocked,
    obligations: (s.obligations || []).map(o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null))),
    tokens: costs.length ? { total: costs.reduce((n, c) => n + c.tokens, 0), by_role: costs.reduce((m, c) => ({ ...m, [c.role]: (m[c.role] || 0) + c.tokens }), {}) } : undefined,
  });
} else if (command === 'report') {
  const campaign = need(options, 'campaign');
  run(['reconcile', '--campaign', campaign]);
  const built = run(['report', 'build', '--campaign', campaign]);
  if (built.status !== 0) failWith('report build', built);
  const served = run(['report', 'serve', '--campaign', campaign, ...(options.port ? ['--port', options.port] : [])]);
  if (served.status !== 0) failWith('report serve', served);
  print({ ok: true, report: abs(campaign, 'report/index.html'), url: served.data.url || served.data.report?.url, pid: served.data.pid || served.data.report?.pid });
} else if (command === 'cost') {
  const campaign = need(options, 'campaign'), taskId = need(options, 'task-id');
  const task = run(['records', '--campaign', campaign, '--kind', 'task', '--format', 'json']).data?.records?.find(t => t.task_id === taskId);
  const entry = { task_id: taskId, role: task?.role || 'unknown', tokens: Number(need(options, 'tokens')), model: options.model || null, at: new Date().toISOString() };
  appendFileSync(path.join(campaign, 'costs.jsonl'), JSON.stringify(entry) + '\n');
  print({ ok: true, ...entry });
} else if (!command || command === 'help' || command === '--help') {
  print({ ok: true, commands: ['doctor', 'init', 'launch', 'bind', 'publish', 'close', 'state', 'report', 'cost', '<engine passthrough>'], engine });
} else {
  const result = spawnSync(process.execPath, [engine, command, ...rest], { stdio: 'inherit', env });
  process.exit(result.status ?? 6);
}
