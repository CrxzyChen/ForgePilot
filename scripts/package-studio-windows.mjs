import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';

import { resolveBuildEnvironment } from './msvc-environment.mjs';
import { copyStudioLicenses } from './studio-license-files.mjs';
import {
  assertReleaseSourceUnchanged,
  captureReleaseSource,
} from './release-source-provenance.mjs';

const root = resolve(process.cwd());
const buildSource = captureReleaseSource(root).source;
if (
  process.env.AIGAME_STUDIO_REQUIRE_CLEAN_SOURCE === '1' &&
  buildSource.dirty
) {
  throw new Error('A release candidate requires a clean source checkout.');
}
const workspacePackage = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8'),
);
const packageVariant = process.env.AIGAME_STUDIO_PACKAGE_VARIANT?.trim() ?? '';
if (packageVariant && !/^[a-z0-9][a-z0-9.-]*$/u.test(packageVariant)) {
  throw new Error(`invalid Studio package variant: ${packageVariant}`);
}
const releaseName = `AI-Game-Studio-${workspacePackage.version}${packageVariant ? `-${packageVariant}` : ''}-win-x64`;
const artifactRoot = join(root, 'artifacts', 'studio-windows');
const bundleRoot = join(artifactRoot, releaseName);
const archivePath = join(artifactRoot, `${releaseName}.zip`);
const archiveChecksumPath = `${archivePath}.sha256`;
const resourcesRoot = join(bundleRoot, 'resources');
const appRoot = join(resourcesRoot, 'app');
const executable = join(bundleRoot, 'AI Game Studio.exe');
const temporary = mkdtempSync(join(tmpdir(), 'aigame-studio-package-'));

for (const target of [artifactRoot, bundleRoot]) {
  const fromWorkspace = relative(root, resolve(target));
  if (
    fromWorkspace === '' ||
    fromWorkspace.startsWith('..') ||
    resolve(target) === root
  ) {
    throw new Error(`refusing unsafe Studio package target: ${target}`);
  }
}

const environment = resolveBuildEnvironment();
if (!environment) {
  throw new Error('Visual Studio C++ Build Tools are required on Windows');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    env: options.env ?? environment,
    stdio: options.capture ? 'pipe' : 'inherit',
    timeout: options.timeout ?? 300_000,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.status})\n${result.stderr ?? ''}`,
    );
  }
  return result;
}

function copy(source, destination) {
  mkdirSync(dirname(destination), { recursive: true });
  if (statSync(source).isDirectory()) {
    cpSync(source, destination, { recursive: true });
  } else {
    copyFileSync(source, destination);
  }
}

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? filesBelow(path) : [path];
    })
    .sort((left, right) => left.localeCompare(right));
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function assertTargetNotRunning() {
  const windowsRoot = process.env.SystemRoot ?? 'C:\\Windows';
  const check = spawnSync(
    join(
      windowsRoot,
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    ),
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$ErrorActionPreference = 'Stop'; $target = $env:AIGAME_PACKAGE_TARGET; $running = @(Get-Process | Where-Object { $_.Path -eq $target }); if ($running.Count -gt 0) { exit 9 }",
    ],
    {
      env: {
        SystemRoot: windowsRoot,
        WINDIR: windowsRoot,
        AIGAME_PACKAGE_TARGET: executable,
      },
      windowsHide: true,
      encoding: 'utf8',
      timeout: 15_000,
    },
  );
  if (check.error || check.status !== 0)
    throw new Error(
      'Studio packaging target is running or could not be checked. Use AIGAME_STUDIO_PACKAGE_VARIANT for an isolated candidate; no target files were removed.',
    );
}

try {
  assertTargetNotRunning();
  const npmCli = resolve(
    dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  );
  run(process.execPath, [npmCli, 'run', 'build:electron']);
  run('cargo', [
    'build',
    '--release',
    '--locked',
    '-p',
    'ai-game-player',
    '-p',
    'ai-game-engine-mcp',
    '-p',
    'ai-game-script-host',
  ]);

  mkdirSync(artifactRoot, { recursive: true });
  assertTargetNotRunning();
  rmSync(bundleRoot, { recursive: true, force: true });
  cpSync(join(root, 'node_modules', 'electron', 'dist'), bundleRoot, {
    recursive: true,
  });
  rmSync(join(resourcesRoot, 'default_app.asar'), { force: true });
  renameSync(join(bundleRoot, 'electron.exe'), executable);

  mkdirSync(appRoot, { recursive: true });
  writeFileSync(
    join(appRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: 'ai-game-studio',
        productName: 'AI Game Studio',
        version: workspacePackage.version,
        private: true,
        license: 'Apache-2.0',
        type: 'module',
        main: 'dist/electron/main/main.js',
      },
      null,
      2,
    )}\n`,
  );
  copy(join(root, 'dist', 'electron'), join(appRoot, 'dist', 'electron'));
  copy(join(root, 'templates'), join(appRoot, 'templates'));
  copy(
    join(root, 'docs', `RELEASE_LIMITATIONS-${workspacePackage.version}.md`),
    join(bundleRoot, 'RELEASE-LIMITATIONS.md'),
  );
  copy(
    join(root, 'node_modules', 'typescript'),
    join(appRoot, 'node_modules', 'typescript'),
  );
  copy(
    join(root, 'target', 'release', 'aigame-mcp.exe'),
    join(appRoot, 'bin', 'aigame-mcp.exe'),
  );
  copy(
    join(root, 'target', 'release', 'ai-game-player.exe'),
    join(appRoot, 'bin', 'ai-game-player.exe'),
  );
  copy(
    join(root, 'target', 'release', 'project-script-host.exe'),
    join(appRoot, 'bin', 'project-script-host.exe'),
  );

  const codexSource = join(root, 'node_modules', '@openai', 'codex');
  const codexDestination = join(appRoot, 'vendor', 'codex');
  copy(
    join(codexSource, 'package.json'),
    join(codexDestination, 'package.json'),
  );
  copy(join(codexSource, 'README.md'), join(codexDestination, 'README.md'));
  copy(join(codexSource, 'bin'), join(codexDestination, 'bin'));
  copy(
    join(
      root,
      'node_modules',
      '@openai',
      'codex-win32-x64',
      'vendor',
      'x86_64-pc-windows-msvc',
    ),
    join(codexDestination, 'vendor', 'x86_64-pc-windows-msvc'),
  );

  copyStudioLicenses(root, appRoot);

  const gateParent = join(temporary, 'projects');
  mkdirSync(gateParent, { recursive: true });
  const cleanPath = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32');
  const gate = run(executable, [], {
    capture: true,
    timeout: 90_000,
    env: {
      ...process.env,
      PATH: cleanPath,
      AIGAME_STUDIO_P20_GATE_PARENT: gateParent,
      AIGAME_STUDIO_USER_DATA: join(temporary, 'user-data'),
    },
  });
  const gateLine = gate.stdout
    .split(/\r?\n/u)
    .find((line) => line.startsWith('[p20-clean-gate] '));
  if (!gateLine) throw new Error(`missing P20 gate output\n${gate.stdout}`);
  const gateResult = JSON.parse(gateLine.slice('[p20-clean-gate] '.length));
  if (!gateResult.ok) {
    throw new Error(`P20 clean gate failed: ${JSON.stringify(gateResult)}`);
  }

  const fileHashes = Object.fromEntries(
    filesBelow(bundleRoot).map((path) => [
      relative(bundleRoot, path).replaceAll('\\', '/'),
      sha256(path),
    ]),
  );
  assertReleaseSourceUnchanged(buildSource, captureReleaseSource(root).source);
  const manifest = {
    kind: 'ai-game-studio/windows-portable',
    version: workspacePackage.version,
    target: 'x86_64-pc-windows-msvc',
    source: buildSource,
    electron: readFileSync(join(bundleRoot, 'version'), 'utf8').trim(),
    codex: '0.152.1',
    requiresGlobalNode: false,
    requiresGlobalCodex: false,
    cleanGate: gateResult,
    files: fileHashes,
  };
  writeFileSync(
    join(bundleRoot, 'STUDIO-BUILD-MANIFEST.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  rmSync(archivePath, { force: true });
  rmSync(archiveChecksumPath, { force: true });
  run('tar', ['-a', '-c', '-f', archivePath, releaseName], {
    cwd: artifactRoot,
    timeout: 300_000,
  });
  const archiveSha256 = sha256(archivePath);
  writeFileSync(
    archiveChecksumPath,
    `${archiveSha256}  ${basename(archivePath)}\n`,
  );
  console.log(
    JSON.stringify({
      ok: true,
      bundleRoot,
      archivePath,
      archiveSha256,
      executable: basename(executable),
      fileCount: Object.keys(fileHashes).length + 1,
      cleanGate: gateResult,
    }),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
