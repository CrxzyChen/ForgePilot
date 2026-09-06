import { spawnSync } from 'node:child_process';
import process from 'node:process';

import { resolveBuildEnvironment } from './msvc-environment.mjs';

const buildEnvironment = resolveBuildEnvironment();

if (!buildEnvironment) {
  console.error(
    '[kernel-build] Visual Studio Build Tools with the C++ workload is required on Windows.',
  );
  process.exit(1);
}

function requireSuccess(command, args) {
  process.stdout.write(`\n[kernel-build] ${[command, ...args].join(' ')}\n`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: buildEnvironment,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

requireSuccess('cargo', ['build', '--workspace']);

process.stdout.write('\n[kernel-build] build passed\n');
