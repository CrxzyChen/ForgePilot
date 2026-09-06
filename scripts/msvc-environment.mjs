import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const vswhere =
  'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe';

export function resolveBuildEnvironment() {
  if (
    process.platform !== 'win32' ||
    spawnSync('where.exe', ['link.exe'], { stdio: 'ignore' }).status === 0
  ) {
    return process.env;
  }

  if (!existsSync(vswhere)) return undefined;
  const query = spawnSync(
    vswhere,
    [
      '-latest',
      '-products',
      '*',
      '-requiresAny',
      '-requires',
      'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
      '-property',
      'installationPath',
    ],
    { encoding: 'utf8' },
  );
  const installationPath = query.stdout?.trim();
  if (!installationPath) {
    if (process.env.DEBUG_MSVC) {
      console.error('[msvc] vswhere failed', query.status, query.stderr);
    }
    return undefined;
  }

  const devCommand = join(installationPath, 'Common7', 'Tools', 'VsDevCmd.bat');
  const command = `call "${devCommand}" -no_logo -arch=amd64 -host_arch=amd64 >nul && set`;
  const result = spawnSync(command, { encoding: 'utf8', shell: true });
  if (result.status !== 0) {
    if (process.env.DEBUG_MSVC) {
      console.error('[msvc] VsDevCmd failed', result.status, result.stderr);
    }
    return undefined;
  }

  return Object.fromEntries(
    result.stdout
      .split(/\r?\n/)
      .filter((line) => line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}
