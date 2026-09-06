import { spawnSync } from 'node:child_process';

import { resolveBuildEnvironment } from './msvc-environment.mjs';

const environment = resolveBuildEnvironment();
if (!environment) {
  console.error(
    '[kernelctl] Visual Studio Build Tools with the C++ workload is required on Windows.',
  );
  process.exit(1);
}

const result = spawnSync(
  'cargo',
  [
    'run',
    '--quiet',
    '-p',
    'ai-game-kernel-cli',
    '--',
    ...process.argv.slice(2),
  ],
  { cwd: process.cwd(), env: environment, stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
