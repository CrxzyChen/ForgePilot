import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  PREVIEW_HOST_PROTOCOL_VERSION,
  RUNTIME_PROTOCOL_VERSION,
  assertRuntimeSequence,
  isRuntimeSemanticId,
  isRuntimeSessionId,
  type RuntimeStateMessage,
} from '../studio/runtime/runtime-session-protocol.ts';

const repository = resolve(import.meta.dirname, '..');
const requiredDocuments = [
  'docs/rounds/ROUND-04-REAL-GAME-AUTHORING.md',
  'docs/rounds/ROUND-04-CHECKLIST.md',
  'docs/testing/ROUND-04-HUMAN-OBSERVATION.md',
  'docs/audits/ROUND-04-PLACEHOLDER-INVENTORY.md',
  'docs/architecture/0022-shared-runtime-session-and-projections.md',
  'docs/architecture/0023-runtime-adapters-and-determinism-boundary.md',
];
const schemaPaths = [
  'schemas/runtime-session.schema.json',
  'schemas/runtime-projection.schema.json',
  'schemas/preview-host.schema.json',
];

for (const path of [...requiredDocuments, ...schemaPaths]) {
  assert.ok(
    existsSync(join(repository, path)),
    `missing P22 artifact: ${path}`,
  );
}

const requiredDefinitions = new Map<string, string[]>([
  [
    'schemas/runtime-session.schema.json',
    [
      'SessionControlMessage',
      'SessionStateMessage',
      'InputActionMessage',
      'PhysicsEventMessage',
    ],
  ],
  [
    'schemas/runtime-projection.schema.json',
    ['AssetReference', 'RenderSnapshot', 'AudioEvent', 'DebugSnapshot'],
  ],
  [
    'schemas/preview-host.schema.json',
    ['host.hello', 'surface.attach', 'frame.ack', 'host.failure'],
  ],
]);

for (const path of schemaPaths) {
  const source = readFileSync(join(repository, path), 'utf8');
  const schema = JSON.parse(source) as {
    $schema?: string;
    $id?: string;
    title?: string;
  };
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.match(schema.$id ?? '', /3-0-0-preview-1/u);
  assert.ok(schema.title);
  for (const definition of requiredDefinitions.get(path) ?? []) {
    assert.match(source, new RegExp(definition.replace('.', '\\.'), 'u'));
  }
}

assert.equal(RUNTIME_PROTOCOL_VERSION, '3.0.0-preview.1');
assert.equal(PREVIEW_HOST_PROTOCOL_VERSION, RUNTIME_PROTOCOL_VERSION);
assert.ok(isRuntimeSessionId('session:preview_1'));
assert.ok(!isRuntimeSessionId('session/preview'));
assert.ok(isRuntimeSemanticId('scene:arena'));
assert.ok(!isRuntimeSemanticId('arena'));

const baseState: RuntimeStateMessage = {
  protocolVersion: RUNTIME_PROTOCOL_VERSION,
  kind: 'session.state',
  sessionId: 'session:preview_1',
  generation: 1,
  sequence: 4,
  tick: 12,
  payload: {
    state: 'paused',
    projectHash: 'a'.repeat(64),
    activeSceneId: 'scene:arena',
    stateHash: 'b'.repeat(64),
  },
};
assert.doesNotThrow(() =>
  assertRuntimeSequence(baseState, { ...baseState, sequence: 5 }),
);
assert.throws(
  () => assertRuntimeSequence(baseState, { ...baseState, sequence: 4 }),
  /RUNTIME_PROTOCOL_SEQUENCE_INVALID/u,
);

const inventory = readFileSync(
  join(repository, 'docs/audits/ROUND-04-PLACEHOLDER-INVENTORY.md'),
  'utf8',
);
for (let id = 1; id <= 20; id += 1) {
  assert.match(
    inventory,
    new RegExp(`R4-INV-${String(id).padStart(3, '0')}`, 'u'),
  );
}
for (const owner of ['P23', 'P24', 'P25', 'P26', 'P27']) {
  assert.match(inventory, new RegExp(`\\b${owner}\\b`, 'u'));
}

const sessionAdr = readFileSync(
  join(
    repository,
    'docs/architecture/0022-shared-runtime-session-and-projections.md',
  ),
  'utf8',
);
for (const contract of [
  'one authoritative world',
  'RenderSnapshot',
  'AudioEvent',
  'DebugSnapshot',
  'PhysicsEvent',
  'Preview Host',
  'stable',
  'MCP',
]) {
  assert.match(sessionAdr, new RegExp(contract, 'iu'));
}

console.log(
  JSON.stringify(
    {
      gate: 'P22 contracts and source-backed inventory',
      protocolVersion: RUNTIME_PROTOCOL_VERSION,
      documents: requiredDocuments.length,
      schemas: schemaPaths.length,
      inventoryEntries: 20,
      result: 'passed',
    },
    null,
    2,
  ),
);
