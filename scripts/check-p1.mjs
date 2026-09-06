import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { resolveBuildEnvironment } from './msvc-environment.mjs';

const environment = resolveBuildEnvironment();
assert(environment, 'Visual Studio C++ Build Tools are required on Windows');

function kernelctl(...args) {
  return spawnSync(
    'cargo',
    ['run', '--quiet', '-p', 'ai-game-kernel-cli', '--', ...args],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: environment,
    },
  );
}

const valid = kernelctl(
  'validate',
  'examples/tank-legacy-regression/examples/minimal.game.json',
);
assert.equal(valid.status, 0, valid.stderr);
assert.equal(JSON.parse(valid.stdout).ok, true);

const invalid = kernelctl(
  'validate',
  'examples/tank-legacy-regression/fixtures/invalid/wrong-coordinate.game.json',
);
assert.notEqual(
  invalid.status,
  0,
  'invalid Game IR must be rejected by the CLI process',
);
const invalidReport = JSON.parse(invalid.stdout);
assert(
  invalidReport.diagnostics.some(
    (diagnostic) =>
      diagnostic.instancePath ===
      '/worlds/0/entities/0/components/0/position/x',
  ),
  'validator must report the exact invalid coordinate path',
);

const migration = kernelctl(
  'migrate',
  'examples/tank-legacy-regression/fixtures/v0/minimal.game.json',
);
assert.equal(migration.status, 0, migration.stderr);
const migrated = JSON.parse(migration.stdout).migration.document;
const golden = JSON.parse(
  readFileSync(
    'examples/tank-legacy-regression/fixtures/golden/migrated-v0.game.json',
    'utf8',
  ),
);
assert.deepEqual(migrated, golden);

console.log('[P1] Game IR exit gate passed');
