import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import electronPath from 'electron';

import { CodexProcessManager } from '../studio/electron/codex-process-manager.ts';
import { ProjectManager } from '../studio/project/project-manager.ts';
import { ProjectError } from '../studio/project/project-types.ts';
import {
  PINNED_CODEX_VERSION,
  resolveBundledCodexSidecar,
} from '../studio/server/codex-sidecar-resolver.ts';

const repository = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), 'ai-game-kernel-p8-'));
const projectParent = join(temporary, 'projects');
const storage = join(temporary, 'studio-data');
const kernelCliPath = join(repository, 'target', 'debug', 'kernelctl.exe');
const electronExecutable = electronPath as unknown as string;
const codexManager = new CodexProcessManager({
  applicationRoot: repository,
  runtimeExecutable: process.execPath,
});

try {
  const manager = new ProjectManager({
    templateRoot: join(repository, 'templates'),
    storageDirectory: storage,
    engineVersion: '0.2.0-dev',
    doctor: {
      kernelCliPath,
      engineMcpPath: join(repository, 'target', 'debug', 'aigame-mcp.exe'),
      engineMcpEnvironment: {
        ...process.env,
        AIGAME_STUDIO_NODE_RUNTIME: process.execPath,
        AIGAME_STUDIO_ENGINE_MCP_SERVER: join(
          repository,
          'dist',
          'electron',
          'engine-mcp',
          'server.js',
        ),
        AIGAME_STUDIO_KERNEL_CLI: kernelCliPath,
        AIGAME_STUDIO_GAME_RUNTIME: join(
          repository,
          'target',
          'debug',
          'ai-game-player.exe',
        ),
        AIGAME_STUDIO_SCRIPT_HOST: join(
          repository,
          'target',
          'debug',
          'project-script-host.exe',
        ),
      },
    },
  });
  const { mkdirSync } = await import('node:fs');
  mkdirSync(projectParent, { recursive: true });
  const project = manager.createProject({
    parentDirectory: projectParent,
    name: 'Studio Foundation',
  });

  assert.equal(project.manifest.entry.scene, 'scenes/main.game.json');
  assert.deepEqual(
    project.manifest.templates.map((item) => item.id),
    ['core:base', 'core:empty', 'core:windows'],
  );
  for (const path of [
    'AGENTS.md',
    '.codex/config.toml',
    '.agents/skills/author-scene/SKILL.md',
    '.agents/skills/author-gameplay-feature/SKILL.md',
    '.agents/skills/build-and-test-game/SKILL.md',
    'scenes/main.game.json',
    'scripts/runtime.json',
    'build/windows.release.json',
    'assets/asset-manifest.json',
  ]) {
    assert(existsSync(join(project.root, path)), path);
  }
  assert(!readFileSync(join(project.root, 'AGENTS.md'), 'utf8').includes('{{'));
  assert.equal(project.gitInitialized, true, project.gitMessage);

  const doctor = manager.doctor();
  assert.equal(doctor.ok, true, JSON.stringify(doctor.diagnostics, null, 2));
  assert(
    doctor.checks.some(
      (check) => check.id === 'mcp' && check.status === 'passed',
    ),
  );

  const secondManager = new ProjectManager({
    templateRoot: join(repository, 'templates'),
    storageDirectory: join(temporary, 'second-studio'),
    engineVersion: '0.2.0-dev',
  });
  assert.throws(
    () => secondManager.openProject(project.root),
    (error: unknown) =>
      error instanceof ProjectError && error.code === 'PROJECT_LOCKED',
  );
  manager.closeProject();
  const reopened = secondManager.openProject(project.root);
  assert.equal(reopened.manifest.id, 'local:studio-foundation');
  secondManager.closeProject();

  const launch = resolveBundledCodexSidecar({
    applicationRoot: repository,
    runtimeExecutable: process.execPath,
  });
  assert.equal(launch.version, PINNED_CODEX_VERSION);
  assert.equal(
    launch.packageRoot,
    join(repository, 'node_modules', '@openai', 'codex'),
  );
  assert.equal(launch.toolchainBin, join(repository, 'target', 'debug'));
  if (process.platform === 'win32') {
    assert.equal(launch.prefixArguments.length, 0);
    assert.equal(
      launch.command,
      join(
        repository,
        'node_modules',
        '@openai',
        'codex-win32-x64',
        'vendor',
        'x86_64-pc-windows-msvc',
        'bin',
        'codex.exe',
      ),
    );
  }
  const codex = await codexManager.start(project.root);
  assert.equal(codex.status, 'ready', codex.error ?? undefined);
  assert.equal(codex.version, PINNED_CODEX_VERSION);
  assert.equal(codex.projectRoot, project.root);
  await codexManager.stop();
  const resumedCodex = await codexManager.start(project.root);
  assert(
    resumedCodex.threadId,
    'Codex project thread was not recovered or replaced',
  );
  await codexManager.stop();

  const electron = spawnSync(
    electronExecutable,
    [join(repository, 'dist', 'electron', 'main', 'main.js')],
    {
      cwd: repository,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 45_000,
      env: {
        ...process.env,
        AIGAME_STUDIO_ROOT: repository,
        AIGAME_STUDIO_SMOKE: '1',
        AIGAME_STUDIO_USER_DATA: join(temporary, 'electron-user-data'),
      },
    },
  );
  assert.equal(electron.status, 0, electron.stderr || electron.error?.message);
  const smokeLine = electron.stdout
    .split(/\r?\n/u)
    .find((line) => line.startsWith('[electron-smoke] '));
  assert(smokeLine, electron.stdout);
  const smoke = JSON.parse(smokeLine.slice('[electron-smoke] '.length)) as {
    ok: boolean;
    hasBridge: boolean;
    bridgeKeys: string[];
    windowControls: Array<string | null>;
    projectPresets: Array<string | null>;
    hasRequire: boolean;
    hasNodeProcess: boolean;
  };
  assert.deepEqual(smoke, {
    ok: true,
    hasBridge: true,
    bridgeKeys: ['app', 'codex', 'projects', 'settings', 'window', 'workspace'],
    windowControls: ['最小化窗口', '最大化窗口', '关闭窗口'],
    projectPresets: ['Empty', 'Empty 2D', 'Empty 3D'],
    hasRequire: false,
    hasNodeProcess: false,
  });

  console.log(
    `[P8 foundation] Electron isolation, project templates, Git snapshot, lock, Doctor, runnable Game IR, and managed Codex ${PINNED_CODEX_VERSION} passed`,
  );
} finally {
  await codexManager.stop();
  rmSync(temporary, { recursive: true, force: true });
}
