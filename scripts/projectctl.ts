import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { runProjectDoctor } from '../studio/project/project-doctor.ts';

const [command, projectPath, ...rest] = process.argv.slice(2);

if (command !== 'doctor' || !projectPath || rest.length > 0) {
  console.error('usage: npm run project -- doctor <project-directory>');
  process.exit(2);
}

const repository = resolve(process.cwd());
const executable = process.platform === 'win32' ? 'kernelctl.exe' : 'kernelctl';
const candidates = [
  join(repository, 'bin', executable),
  join(repository, 'target', 'debug', executable),
  join(repository, 'target', 'release', executable),
];
const kernelCliPath = candidates.find((path) => existsSync(path));
const report = runProjectDoctor(resolve(projectPath), { kernelCliPath });
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
