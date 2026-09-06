import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

const repository = resolve(process.cwd());
const version = JSON.parse(
  readFileSync(join(repository, 'package.json'), 'utf8'),
).version as string;
const packageVariant = process.env.AIGAME_STUDIO_PACKAGE_VARIANT?.trim() ?? '';
if (packageVariant && !/^[a-z0-9][a-z0-9.-]*$/u.test(packageVariant)) {
  throw new Error(`invalid Studio package variant: ${packageVariant}`);
}
const releaseName = `AI-Game-Studio-${version}${packageVariant ? `-${packageVariant}` : ''}-win-x64`;
const bundle = join(repository, 'artifacts', 'studio-windows', releaseName);
const archive = `${bundle}.zip`;
const archiveChecksum = `${archive}.sha256`;
const temporary = mkdtempSync(join(tmpdir(), 'ai-game-studio-installed-p20-'));

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function removeTree(directory: string): Promise<void> {
  const retryable = new Set(['EBUSY', 'ENOTEMPTY', 'EPERM']);
  let lastError: unknown;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      rmSync(directory, { recursive: true, force: true });
      return;
    } catch (reason) {
      lastError = reason;
      const code =
        typeof reason === 'object' && reason !== null && 'code' in reason
          ? String(reason.code)
          : '';
      if (!retryable.has(code)) {
        throw reason;
      }
      await delay(250);
    }
  }
  throw lastError;
}

function runStudio(
  installRoot: string,
  environment: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(join(installRoot, 'AI Game Studio.exe'), [], {
      cwd: repository,
      windowsHide: true,
      // Keep the explicit pipe transport; attaching to a hidden Windows
      // parent console can block Electron before its main entrypoint runs.
      env: { ...environment, ELECTRON_NO_ATTACH_CONSOLE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      rejectRun(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        rejectRun(
          new Error(
            `Studio smoke timed out after ${timeoutMs}ms\n${stdout}\n${stderr}`,
          ),
        );
      } else if (code !== 0) {
        rejectRun(new Error(stderr || stdout || `Studio exited with ${code}`));
      } else {
        resolveRun({ stdout, stderr });
      }
    });
  });
}

async function smoke(installRoot: string, userData: string) {
  const result = await runStudio(
    installRoot,
    {
      NODE_ENV: 'production',
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      PATH: join(process.env.SystemRoot ?? 'C:\\Windows', 'System32'),
      AIGAME_STUDIO_SMOKE: '1',
      AIGAME_STUDIO_USER_DATA: userData,
    },
    60_000,
  );
  const line = result.stdout
    .split(/\r?\n/u)
    .find((candidate) => candidate.startsWith('[electron-smoke] '));
  assert(line, result.stdout);
  const report = JSON.parse(line.slice('[electron-smoke] '.length)) as {
    ok: boolean;
    projectPresets: string[];
  };
  assert.equal(report.ok, true);
  assert.deepEqual(report.projectPresets, ['Empty', 'Empty 2D', 'Empty 3D']);
  return report;
}

async function qualitySmoke(
  installRoot: string,
  userData: string,
  projects: string,
) {
  mkdirSync(projects, { recursive: true });
  const result = await runStudio(
    installRoot,
    {
      NODE_ENV: 'production',
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      PATH: join(process.env.SystemRoot ?? 'C:\\Windows', 'System32'),
      AIGAME_STUDIO_USER_DATA: userData,
      AIGAME_STUDIO_P15_QUALITY_GATE_PARENT: projects,
    },
    90_000,
  );
  const line = result.stdout
    .split(/\r?\n/u)
    .find((candidate) => candidate.startsWith('[p15-quality-gate] '));
  assert(line, result.stdout);
  const report = JSON.parse(line.slice('[p15-quality-gate] '.length)) as {
    ok: boolean;
    highDpi: number;
    unnamedControls: number;
    rendererCrashRecovered: boolean;
    projectRestored: boolean;
  };
  assert.equal(report.ok, true, JSON.stringify(report));
  assert(report.highDpi >= 1.25);
  assert.equal(report.unnamedControls, 0);
  assert.equal(report.rendererCrashRecovered, true);
  assert.equal(report.projectRestored, true);
  return report;
}

try {
  assert(existsSync(bundle), 'Studio portable bundle is missing');
  assert(existsSync(archive), 'Studio portable release archive is missing');
  assert(existsSync(archiveChecksum), 'Studio archive checksum is missing');
  const archiveHash = createHash('sha256')
    .update(readFileSync(archive))
    .digest('hex');
  assert.match(
    readFileSync(archiveChecksum, 'utf8'),
    new RegExp(`^${archiveHash}`),
  );
  const buildManifest = JSON.parse(
    readFileSync(join(bundle, 'STUDIO-BUILD-MANIFEST.json'), 'utf8'),
  ) as {
    version: string;
    requiresGlobalNode: boolean;
    requiresGlobalCodex: boolean;
    cleanGate: { ok: boolean; standalonePlayer: boolean };
  };
  assert.equal(buildManifest.version, version);
  assert.equal(buildManifest.requiresGlobalNode, false);
  assert.equal(buildManifest.requiresGlobalCodex, false);
  assert.equal(buildManifest.cleanGate.ok, true);
  assert.equal(buildManifest.cleanGate.standalonePlayer, true);

  const bundleFiles = filesBelow(bundle).map((path) =>
    relative(bundle, path).replaceAll('\\', '/'),
  );
  assert(bundleFiles.includes('resources/app/bin/ai-game-player.exe'));
  assert(bundleFiles.includes('resources/app/bin/project-script-host.exe'));
  assert(bundleFiles.includes('resources/app/bin/aigame-mcp.exe'));
  assert(!bundleFiles.some((path) => /kernelctl/iu.test(path)));
  assert(
    !bundleFiles.some((path) =>
      /tank-legacy-regression|topdown-action|tank-combat\.game/iu.test(path),
    ),
  );

  const userData = join(temporary, 'user-data');
  const extracted = spawnSync('tar', ['-xf', archive, '-C', temporary], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120_000,
  });
  assert.equal(extracted.status, 0, extracted.stderr || extracted.stdout);
  const installA = join(temporary, releaseName);
  const installB = join(temporary, 'installed-b');
  const cleanInstall = await smoke(installA, userData);
  writeFileSync(
    join(userData, 'update-preservation-sentinel.txt'),
    'preserve\n',
  );

  cpSync(bundle, installB, { recursive: true });
  const updatedInstall = await smoke(installB, userData);
  assert(existsSync(join(userData, 'update-preservation-sentinel.txt')));
  const quality = await qualitySmoke(
    installB,
    join(temporary, 'quality-user-data'),
    join(temporary, 'quality-projects'),
  );

  await removeTree(installA);
  assert(!existsSync(installA));
  assert(existsSync(installB));
  await removeTree(installB);
  assert(!existsSync(installB));
  assert(
    existsSync(join(userData, 'update-preservation-sentinel.txt')),
    'portable uninstall must not silently delete user projects/settings',
  );

  console.log(
    JSON.stringify(
      {
        gate: 'P20 installed Studio lifecycle',
        version,
        cleanInstall,
        updatedInstall,
        quality,
        archiveSha256: archiveHash,
        archiveExtractedForCleanInstall: true,
        portableUninstall: true,
        userDataPreserved: true,
        legacyTankExcluded: true,
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  try {
    await removeTree(temporary);
  } catch (reason) {
    console.error(
      `[p20-cleanup-warning] ${temporary}: ${reason instanceof Error ? reason.message : String(reason)}`,
    );
  }
}
