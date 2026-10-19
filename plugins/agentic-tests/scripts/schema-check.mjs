#!/usr/bin/env node
// Validate a saved JSON response body against its OpenAPI 3.x response schema.
//   schema-check.mjs <openapi.json|URL> <METHOD> <path template, e.g. /api/orders> <status> <body.json>
// Prints one JSON line: {"valid": true|false, "schema": "<pointer>", "errors": [...]}. Exit 0 valid, 1 invalid, 2 usage.
// Uses the engine's locked Ajv (JSON Schema 2020-12), so nothing is installed.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { dependencyLocation, loadDependencies } = await import(path.join(here, '..', 'engine', 'run-agentic-tests', 'scripts', 'lib', 'dependencies.mjs'));
const out = (value, code) => { process.stdout.write(JSON.stringify(value) + '\n'); process.exit(code); };

const [source, method, route, status, bodyFile] = process.argv.slice(2);
if (!source || !method || !route || !status || !bodyFile) out({ valid: false, error: 'usage: schema-check.mjs <openapi> <METHOD> <path> <status> <body.json>' }, 2);

await loadDependencies({ setup: true });
const require = createRequire(path.join(dependencyLocation(), 'package.json'));
const Ajv2020 = require('ajv/dist/2020').default;

const doc = /^https?:\/\//.test(source) ? await (await fetch(source, { signal: AbortSignal.timeout(10000) })).json() : JSON.parse(readFileSync(source, 'utf8'));
const operation = doc.paths?.[route]?.[method.toLowerCase()];
if (!operation) out({ valid: false, error: `No operation ${method.toUpperCase()} ${route} in the OpenAPI document.` }, 2);
const response = operation.responses?.[status] || operation.responses?.[`${String(status)[0]}XX`] || operation.responses?.default;
if (!response) out({ valid: false, error: `The contract declares no ${status} response for ${method.toUpperCase()} ${route}.`, declared: Object.keys(operation.responses || {}) }, 1);
const pointer = `#/paths/${route.replace(/~/g, '~0').replace(/\//g, '~1')}/${method.toLowerCase()}/responses/${status}`;
const schema = response.content?.['application/json']?.schema;
if (!schema) out({ valid: true, schema: pointer, note: 'The response declares no JSON schema.' }, 0);

let body;
try { body = JSON.parse(readFileSync(bodyFile, 'utf8')); } catch (error) { out({ valid: false, schema: pointer, errors: [{ message: `Body is not JSON: ${error.message}` }] }, 1); }

// Resolve local $refs against the whole document by registering it as one schema.
const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema({ ...doc, $id: 'openapi.json' });
const validate = ajv.compile({ $ref: `openapi.json${pointer}/content/application~1json/schema` });
const valid = validate(body);
out({ valid, schema: pointer, errors: valid ? [] : validate.errors.map(e => ({ path: e.instancePath || '/', message: e.message, params: e.params })) }, valid ? 0 : 1);
