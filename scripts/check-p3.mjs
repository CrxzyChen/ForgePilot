import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { resolveBuildEnvironment } from './msvc-environment.mjs';

const environment = resolveBuildEnvironment();
assert(environment, 'Visual Studio C++ Build Tools are required on Windows');

function cargoRun(packageName, args, timeout = 120_000) {
  return spawnSync(
    'cargo',
    ['run', '--quiet', '-p', packageName, '--', ...args],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: environment,
      timeout,
    },
  );
}

const smoke = cargoRun('ai-game-kernel-runtime', ['--smoke', '3']);
assert.equal(smoke.status, 0, smoke.stderr || smoke.error?.message);
const lines = smoke.stdout.trim().split(/\r?\n/u);
const report = JSON.parse(lines.at(-1));
assert.equal(report.kind, 'ai-game-kernel/runtime-smoke');
assert.equal(report.framesPresented, 3);
assert.equal(report.ticksExecuted, 3);
assert.equal(report.headlessBoundary, 'renderer-consumes-snapshot-only');
assert.ok(
  report.adapter.length > 0,
  'wgpu must select a physical or software adapter',
);
assert.ok(report.backend.length > 0, 'wgpu must report a backend');
assert.ok(
  report.averageFrameMs < 50,
  `average frame time ${report.averageFrameMs.toFixed(2)} ms exceeds the 50 ms MVP budget`,
);

const headless = cargoRun('ai-game-kernel-cli', [
  'run',
  'examples/tank-legacy-regression/examples/frontier.game.json',
  'examples/tank-legacy-regression/fixtures/replay/runtime-smoke.input.json',
]);
assert.equal(headless.status, 0, headless.stderr || headless.error?.message);
const headlessHash = JSON.parse(headless.stdout).result.snapshot.stateHash;
assert.equal(
  report.finalStateHash,
  headlessHash,
  'rendered and headless execution must produce the same canonical state',
);

console.log(
  `[P3] ${report.backend} runtime gate passed on ${report.adapter} ` +
    `(${report.averageFrameMs.toFixed(2)} ms, ${headlessHash.slice(0, 12)}…)`,
);
