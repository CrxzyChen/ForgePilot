import { spawnSync } from 'node:child_process';
import process from 'node:process';

import { resolveBuildEnvironment } from './msvc-environment.mjs';

const buildEnvironment = resolveBuildEnvironment();

if (!buildEnvironment) {
  console.error(
    '[kernel-check] Visual Studio Build Tools with the C++ workload is required on Windows.',
  );
  process.exit(1);
}

function run(command, args, options = {}) {
  const rendered = [command, ...args].join(' ');
  process.stdout.write(`\n[kernel-check] ${rendered}\n`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: buildEnvironment,
    stdio: 'inherit',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

function requireSuccess(command, args) {
  const status = run(command, args);
  if (status !== 0) process.exit(status);
}

requireSuccess('cargo', ['fmt', '--all', '--check']);
requireSuccess('cargo', [
  'clippy',
  '--workspace',
  '--all-targets',
  '--',
  '-D',
  'warnings',
]);

requireSuccess('cargo', ['test', '--workspace']);

const targets = spawnSync('rustup', ['target', 'list', '--installed'], {
  encoding: 'utf8',
  env: buildEnvironment,
});
if (!targets.stdout?.includes('wasm32-wasip1')) {
  requireSuccess('rustup', ['target', 'add', 'wasm32-wasip1']);
}
requireSuccess('cargo', [
  'test',
  '-p',
  'ai-game-kernel-core',
  '-p',
  'ai-game-kernel-cli',
  '--target',
  'wasm32-wasip1',
]);

process.stdout.write('\n[kernel-check] all checks passed\n');
