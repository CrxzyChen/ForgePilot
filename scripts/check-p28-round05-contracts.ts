import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repository = resolve(import.meta.dirname, '..');
const dashboardCss = readFileSync(join(repository, 'app/globals.css'), 'utf8');
assert.match(dashboardCss, /@import 'tailwindcss' source\(none\)/u);
for (const source of ['.', '../components', '../hooks', '../lib']) {
  assert.ok(dashboardCss.includes(`@source '${source}';`));
}
const dashboardConfig = readFileSync(
  join(repository, 'vite.config.ts'),
  'utf8',
);
for (const directory of [
  'artifacts',
  'target',
  'studio',
  'crates',
  'examples',
  'templates',
]) {
  assert.ok(
    dashboardConfig.includes(`'**/${directory}/**'`),
    `${directory} must not trigger dashboard reloads`,
  );
}
const documents = {
  specification: 'docs/rounds/ROUND-05-COPILOT-GAME-COMPLETION.md',
  checklist: 'docs/rounds/ROUND-05-CHECKLIST.md',
  observation: 'docs/testing/ROUND-05-HUMAN-OBSERVATION.md',
  architecture: 'docs/architecture/0024-round05-completion-authority.md',
  gapMap: 'docs/rounds/ROUND-05-GAP-MAP.md',
  evidence: 'docs/testing/P28-ROUND05-CONTRACT-EVIDENCE.md',
} as const;

const schemas = {
  completionRun: 'schemas/completion-run.schema.json',
  mediaJob: 'schemas/media-generation-job.schema.json',
  candidateReview: 'schemas/generated-asset-review.schema.json',
  transactionalImport: 'schemas/generated-resource-import.schema.json',
  runtimeObservation: 'schemas/runtime-observation.schema.json',
} as const;

for (const path of Object.values(documents)) {
  assert.ok(
    existsSync(join(repository, path)),
    `missing P28 artifact: ${path}`,
  );
}

const specification = readFileSync(
  join(repository, documents.specification),
  'utf8',
);
const checklist = readFileSync(join(repository, documents.checklist), 'utf8');
const observation = readFileSync(
  join(repository, documents.observation),
  'utf8',
);
const architecture = readFileSync(
  join(repository, documents.architecture),
  'utf8',
);
const gapMap = readFileSync(join(repository, documents.gapMap), 'utf8');

type JsonSchema = {
  $id?: string;
  title?: string;
  properties?: Record<string, unknown>;
  $defs?: Record<string, unknown>;
};

const parsedSchemas = Object.entries(schemas).map(([name, path]) => {
  const absolutePath = join(repository, path);
  assert.ok(existsSync(absolutePath), `missing P28 schema: ${path}`);
  const schema = JSON.parse(readFileSync(absolutePath, 'utf8')) as JsonSchema;
  assert.match(
    schema.$id ?? '',
    /^https:\/\/ai-game-kernel\.dev\/schema\/[a-z0-9-]+\/1-0-0$/u,
    `${name} has no canonical versioned schema ID`,
  );
  assert.ok(schema.title, `${name} has no title`);
  assert.ok(schema.properties, `${name} has no root properties`);
  assert.ok(schema.$defs, `${name} has no definitions`);
  return { name, path, schema };
});

assert.equal(
  new Set(parsedSchemas.map(({ schema }) => schema.$id)).size,
  parsedSchemas.length,
  'P28 schemas must have unique canonical IDs',
);

for (const phase of ['P28', 'P29', 'P30', 'P31', 'P32', 'P33']) {
  assert.ok(
    specification.includes(`### ${phase} —`),
    `specification is missing ${phase}`,
  );
  assert.ok(
    checklist.includes(`## ${phase} —`),
    `checklist is missing ${phase}`,
  );
  assert.ok(
    observation.includes(`| ${phase} `),
    `observation dashboard is missing ${phase}`,
  );
}

for (const contract of [
  'one high-level goal',
  'Engine MCP',
  'ChangeSet',
  'human selection',
  'transactional',
  'idempotency',
  'frame',
  'sound-effect',
  'standalone',
  'screen coordinates',
]) {
  assert.match(specification, new RegExp(contract, 'iu'));
}

for (const requiredItem of [
  'Publish the Round 05 development specification',
  'Publish this independent execution checklist',
  'Publish the Round 05 human observation board',
  'Define the canonical placeholder-Tank-to-package user journey',
  'Add an executable contract check',
  'Define the versioned completion-run state schema',
  'Define explicit image, sound-effect, music, and speech-generation job',
  'Define candidate artifact, review decision, rejection, and regeneration',
  'Define transactional generated-resource import and rollback schema',
  'Define addressable runtime frame/audio observation schema',
  'Map every starting gap to an owner phase',
]) {
  assert.ok(
    checklist.includes(`- [x] ${requiredItem}`),
    `unchecked P28 contract item: ${requiredItem}`,
  );
}

const p28Section = checklist.match(/## P28[\s\S]*?(?=## P29)/u)?.[0] ?? '';
assert.doesNotMatch(
  p28Section,
  /- \[ \]/u,
  'P28 still contains unchecked work',
);

for (const authorityBoundary of [
  'Provider authorization',
  'Candidate review',
  'ChangeSet approval',
  'ambiguous timeout',
  'content-hash-bound',
  'Stopping a Goal',
  'audio-to-speech-generation-v1',
]) {
  assert.match(
    architecture,
    new RegExp(authorityBoundary, 'iu'),
    `architecture decision is missing ${authorityBoundary}`,
  );
}

for (let gap = 1; gap <= 12; gap += 1) {
  const id = `R5-GAP-${String(gap).padStart(2, '0')}`;
  assert.match(gapMap, new RegExp(`\\| ${id} \\|`, 'u'), `missing ${id}`);
}
for (const phase of ['P29', 'P30', 'P31', 'P32', 'P33']) {
  assert.match(gapMap, new RegExp(`npm run check:${phase.toLowerCase()}`, 'u'));
}
for (const journey of [
  'Journey A',
  'Journey B',
  'Journey C',
  'Journey D',
  'Journey E',
]) {
  assert.match(gapMap, new RegExp(journey, 'u'));
}

const schemaSources = new Map(
  Object.entries(schemas).map(([name, path]) => [
    name,
    readFileSync(join(repository, path), 'utf8'),
  ]),
);
for (const token of [
  'completion-run:',
  'plan-step:',
  'presentationRemoved',
  'providerApprovalMode',
]) {
  assert.match(
    schemaSources.get('completionRun') ?? '',
    new RegExp(token, 'u'),
  );
}
for (const token of [
  'soundEffect',
  'music',
  'speechGeneration',
  'audio-to-speech-generation-v1',
  'idempotencyKey',
  'timeout-ambiguous',
]) {
  assert.match(schemaSources.get('mediaJob') ?? '', new RegExp(token, 'u'));
}
for (const token of [
  'ImageMetadata',
  'AudioMetadata',
  'review-decision:',
  'regeneration:',
  'configured-policy',
]) {
  assert.match(
    schemaSources.get('candidateReview') ?? '',
    new RegExp(token, 'u'),
  );
}
for (const token of [
  'asset.copy',
  'asset.manifest.upsert',
  'asset.provenance.write',
  'reference.set',
  'ownsRollback',
]) {
  assert.match(
    schemaSources.get('transactionalImport') ?? '',
    new RegExp(token, 'u'),
  );
}
for (const token of [
  'frameArtifact',
  'drawableId',
  'componentId',
  'fallback',
  'missingClipIds',
  'failedPlaybackIds',
]) {
  assert.match(
    schemaSources.get('runtimeObservation') ?? '',
    new RegExp(token, 'u'),
  );
}

for (const boundary of [
  'direction',
  'required gate',
  'clarification',
  'coaching',
  'manual workaround',
]) {
  assert.ok(
    observation.toLowerCase().includes(`**${boundary.toLowerCase()}**`),
    `observation rubric is missing ${boundary}`,
  );
}

for (const journey of [
  'Journey A',
  'Journey B',
  'Journey C',
  'Journey D',
  'Journey E',
]) {
  assert.match(observation, new RegExp(`## ${journey} —`, 'u'));
}

assert.match(observation, /R5-OBS-001/u);
assert.match(
  observation,
  /Blank issue counts[\s\S]*never mean[\s\S]*zero defects/iu,
);
assert.doesNotMatch(observation, /Release decision:\s*(eligible|approved)/iu);

const mcpSource = readFileSync(
  join(repository, 'studio/server/engine-mcp-server.ts'),
  'utf8',
);
assert.match(mcpSource, /'asset\.generate'/u);
for (const capability of [
  'image',
  'soundEffect',
  'music',
  'speechGeneration',
]) {
  assert.match(mcpSource, new RegExp(`'${capability}'`, 'u'));
}
assert.match(mcpSource, /runWithPolicy/u);
assert.match(mcpSource, /'build\.windows'/u);
assert.match(mcpSource, /'release\.package'/u);

const brokerSource = readFileSync(
  join(repository, 'studio/workspace/studio-asset-job-broker.ts'),
  'utf8',
);
for (const adapter of [
  'aliyun-bailian-image',
  'aliyun-bailian-tts',
  'openai-image',
  'elevenlabs-sound-effect',
  'elevenlabs-music',
]) {
  assert.match(brokerSource, new RegExp(adapter, 'u'));
}
assert.match(brokerSource, /this\.#changes\.propose\(/u);
assert.doesNotMatch(mcpSource, /\['asset\.select'/u);
assert.match(specification, /transactional ChangeSet import/iu);

const roadmap = readFileSync(join(repository, 'lib/roadmap.ts'), 'utf8');
assert.match(roadmap, /RoadmapTrack = .*'R5'/u);
for (const phase of ['P28', 'P29', 'P30', 'P31', 'P32', 'P33']) {
  assert.match(
    roadmap,
    new RegExp(`code: '${phase}'[\\s\\S]*?track: 'R5'`, 'u'),
    `human dashboard is missing R5 phase ${phase}`,
  );
}
assert.match(
  roadmap,
  /code: 'P28'[\s\S]*?track: 'R5'[\s\S]*?status: 'completed'/u,
);
assert.match(
  roadmap,
  /code: 'P29'[\s\S]*?track: 'R5'[\s\S]*?status: 'active'/u,
);
assert.match(roadmap, /currentRound: 'ROUND 05'/u);
assert.match(roadmap, /activeTrack: 'R5'/u);
assert.match(roadmap, /Goal → Tool Graph/u);

const packageDocument = JSON.parse(
  readFileSync(join(repository, 'package.json'), 'utf8'),
) as { scripts?: Record<string, string> };
assert.equal(
  packageDocument.scripts?.['check:p28:round05'],
  'node scripts/check-p28-round05-contracts.ts && node scripts/check-r5-closure.ts',
);

console.log(
  JSON.stringify(
    {
      gate: 'P28 Round 05 completion contracts',
      documents: Object.values(documents),
      phases: ['P28', 'P29', 'P30', 'P31', 'P32', 'P33'],
      observedProductionAdapters: [
        'aliyun-bailian-image',
        'aliyun-bailian-tts',
        'openai-image',
        'elevenlabs-sound-effect',
        'elevenlabs-music',
      ],
      generationCapabilities: [
        'image',
        'soundEffect',
        'music',
        'speechGeneration',
      ],
      frozenSchemas: parsedSchemas.map(({ path }) => path),
      mappedGaps: 12,
      dashboardTrack: 'R5',
      result: 'passed',
    },
    null,
    2,
  ),
);
