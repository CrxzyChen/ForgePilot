import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repository = resolve(import.meta.dirname, '..');
const requiredDocuments = [
  'docs/rounds/ROUND-03-GENERAL-AI-STUDIO.md',
  'docs/rounds/ROUND-03-CHECKLIST.md',
  'docs/rounds/ROUND-03-GAP-LEDGER.md',
  'docs/audits/ROUND-03-HARDCODING-INVENTORY.md',
  'docs/architecture/0015-general-core-capability-and-demo-boundaries.md',
  'docs/architecture/0016-sandboxed-typescript-project-runtime.md',
  'docs/testing/ROUND-03-HUMAN-ACCEPTANCE.md',
  'docs/testing/ROUND-03-BASELINE-OBSERVATION.md',
  'docs/PROJECT_AUTHORING_CONTRACT.md',
];
const schemas = [
  'schemas/capability.schema.json',
  'schemas/scene.schema.json',
  'schemas/prefab.schema.json',
  'schemas/script-runtime.schema.json',
  'schemas/project-settings.schema.json',
  'schemas/workspace-state.schema.json',
];

for (const path of [...requiredDocuments, ...schemas]) {
  assert.ok(
    existsSync(join(repository, path)),
    `missing P14 artifact: ${path}`,
  );
}
for (const path of schemas) {
  const schema = JSON.parse(readFileSync(join(repository, path), 'utf8')) as {
    $schema?: string;
    $id?: string;
    title?: string;
  };
  assert.equal(
    schema.$schema,
    'https://json-schema.org/draft/2020-12/schema',
    `${path} must use JSON Schema 2020-12`,
  );
  assert.match(schema.$id ?? '', /2-0-0-alpha-1/u, `${path} must be versioned`);
  assert.ok(schema.title, `${path} must be named`);
}

const inventory = readFileSync(
  join(repository, 'docs/audits/ROUND-03-HARDCODING-INVENTORY.md'),
  'utf8',
);
for (let id = 1; id <= 15; id += 1) {
  assert.match(
    inventory,
    new RegExp(`INV-${String(id).padStart(3, '0')}`, 'u'),
    `inventory must retain INV-${String(id).padStart(3, '0')}`,
  );
}
for (const decision of ['keep', 'extract', 'demo', 'replace', 'remove']) {
  assert.match(inventory, new RegExp(`\\b${decision}\\b`, 'u'));
}
for (const owner of ['P15', 'P16', 'P17', 'P18', 'P19', 'P20']) {
  assert.match(inventory, new RegExp(`\\b${owner}\\b`, 'u'));
}

const boundary = readFileSync(
  join(
    repository,
    'docs/architecture/0015-general-core-capability-and-demo-boundaries.md',
  ),
  'utf8',
);
for (const concept of [
  'general core',
  'capability',
  'project extension',
  'Examples',
  'Engine MCP',
  'ChangeSet',
]) {
  assert.match(boundary, new RegExp(concept, 'iu'));
}

const scriptHost = readFileSync(
  join(
    repository,
    'docs/architecture/0016-sandboxed-typescript-project-runtime.md',
  ),
  'utf8',
);
for (const policy of [
  'QuickJS',
  'TypeScript 5.9',
  'fixed Tick',
  'source maps',
  'memory',
  'network',
  '101 isolated',
]) {
  assert.match(scriptHost, new RegExp(policy, 'iu'));
}

const baseline = readFileSync(
  join(repository, 'docs/testing/ROUND-03-BASELINE-OBSERVATION.md'),
  'utf8',
);
assert.match(baseline, /Result: Failed with blockers/u);
for (let id = 1; id <= 9; id += 1) {
  assert.match(
    baseline,
    new RegExp(`R3-GAP-${String(id).padStart(3, '0')}`, 'u'),
  );
}

const acceptance = readFileSync(
  join(repository, 'docs/testing/ROUND-03-HUMAN-ACCEPTANCE.md'),
  'utf8',
);
for (const requirement of [
  'Empty 2D',
  'Empty 3D',
  'without coaching',
  'standalone',
  'Codex',
  'ChangeSet',
]) {
  assert.match(acceptance, new RegExp(requirement, 'iu'));
}

console.log(
  JSON.stringify(
    {
      gate: 'P14 product rebaseline and contracts',
      artifacts: requiredDocuments.length,
      schemas: schemas.length,
      inventoriedAssumptions: 15,
      baselineBlockingGaps: 9,
      result: 'passed',
    },
    null,
    2,
  ),
);
