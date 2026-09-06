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

const project = 'examples/tank-legacy-regression/examples/minimal.game.json';
const input =
  'examples/tank-legacy-regression/fixtures/replay/movement.input.json';
const run = kernelctl('run', project, input);
assert.equal(run.status, 0, run.stderr);
const result = JSON.parse(run.stdout).result;
const golden = JSON.parse(
  readFileSync('fixtures/golden/movement.snapshot.json', 'utf8'),
);
assert.deepEqual(result.snapshot, golden);
assert.deepEqual(
  result.trace.slice(0, 6).map(({ system, action }) => [system, action]),
  [
    ['command', 'system-start'],
    ['command', 'system-complete'],
    ['movement', 'system-start'],
    ['movement', 'system-complete'],
    ['production', 'system-start'],
    ['production', 'system-complete'],
  ],
);

const verified = kernelctl('verify', project, input, golden.stateHash);
assert.equal(verified.status, 0, verified.stderr);
assert.equal(JSON.parse(verified.stdout).stateHash, golden.stateHash);

const mismatch = kernelctl('verify', project, input, '0'.repeat(64));
assert.equal(mismatch.status, 3, mismatch.stderr);
const replayError = JSON.parse(mismatch.stdout).error;
assert.equal(replayError.code, 'REPLAY_HASH_MISMATCH');
assert.equal(replayError.tick, 35);
assert.equal(replayError.system, 'replay');

console.log(
  `[P2] deterministic replay exit gate passed (${golden.stateHash.slice(0, 12)}…)`,
);
