import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import electronPath from 'electron';

import { ProjectManager } from '../studio/project/project-manager.ts';
import type { ProjectSummary } from '../studio/project/project-types.ts';
import { StudioSettingsService } from '../studio/settings/studio-settings-service.ts';
import { CredentialVaultService } from '../studio/settings/credential-vault-service.ts';
import { migrateLegacyProviderConnections } from '../studio/settings/legacy-provider-connection-migration.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';
import type { SceneDocument } from '../studio/workspace/scene-authoring-service.ts';

const repository = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), 'ai-game-studio-p15-'));
const projects = join(temporary, 'projects');
const studioData = join(temporary, 'studio-data');
const kernelCliPath = join(repository, 'target', 'debug', 'kernelctl.exe');
const electronExecutable = electronPath as unknown as string;

try {
  mkdirSync(projects, { recursive: true });
  const created: ProjectSummary[] = [];
  for (const preset of ['empty', 'empty-2d', 'empty-3d'] as const) {
    const manager = new ProjectManager({
      templateRoot: join(repository, 'templates'),
      storageDirectory: join(studioData, preset),
      engineVersion: '0.2.0-alpha.1',
    });
    const project = manager.createProject({
      parentDirectory: projects,
      directoryName: preset,
      name: `P15 ${preset}`,
      preset,
    });
    created.push(project);
    assert.equal(project.manifest.entry.scene, 'scenes/main.game.json');
    assert(existsSync(join(project.root, 'AGENTS.md')));
    assert(existsSync(join(project.root, '.agents', 'skills')));
    assert(existsSync(join(project.root, 'scripts', 'runtime.json')));
    assert(existsSync(join(project.root, 'settings', 'project.json')));
    assert(existsSync(join(project.root, 'input', 'actions.json')));
    assert.doesNotMatch(
      readFileSync(join(project.root, 'scenes', 'main.game.json'), 'utf8'),
      /tank|terrain|topdown/iu,
    );
    manager.closeProject();
  }
  assert(created[1]!.manifest.capabilities.includes('2d'));
  assert(!created[1]!.manifest.capabilities.includes('3d'));
  assert(created[2]!.manifest.capabilities.includes('3d'));
  assert(!created[2]!.manifest.capabilities.includes('2d'));

  const workspace = new StudioCommandRegistry({
    projectRoot: created[2]!.root,
    kernelCliPath,
  });
  const startupScene = workspace.execute('scene.inspect', {
    path: workspace.snapshot().entryScene,
  }).data as SceneDocument;
  assert.equal(startupScene.name, 'Main');
  assert.deepEqual(startupScene.objects, []);
  const restored = workspace.setWorkspaceState({
    schemaVersion: '2.0.0-alpha.1',
    activity: 'settings',
    rightPanel: 'copilot',
    bottomPanel: 'problems',
    openDocuments: [
      {
        path: 'studio://overview',
        title: '项目概览',
        kind: 'overview',
        pinned: true,
      },
    ],
    activeDocument: 'studio://overview',
    selectedEntityId: null,
    collapsedFolders: ['assets'],
    layout: {
      leftWidth: 280,
      rightWidth: 340,
      bottomHeight: 220,
      outlineCollapsed: false,
      filesCollapsed: false,
    },
  });
  assert.deepEqual(workspace.getWorkspaceState(), restored);

  const settings = new StudioSettingsService({
    userDataDirectory: studioData,
    getProjectRoot: () => created[2]!.root,
  });
  assert.equal(settings.get('studio').values.locale, 'zh-CN');
  settings.update('studio', { locale: 'en', autosave: 'delay' });
  assert.equal(settings.get('studio').values.locale, 'en');
  settings.update('agent', { defaultMode: 'goal' });
  assert.equal(settings.get('agent').values.defaultMode, 'goal');
  settings.update('project', { tickRate: 120 });
  assert.equal(settings.get('project').values.tickRate, 120);
  assert.throws(() => settings.update('ai-tools', { apiKey: 'plaintext' }));
  assert.equal(settings.reset('studio').values.locale, 'zh-CN');

  const vaultPath = join(studioData, 'credentials', 'vault.json');
  const vault = new CredentialVaultService(vaultPath, {
    available: () => true,
    encrypt: (value) => Buffer.from(value.split('').reverse().join(''), 'utf8'),
    decrypt: (value) => value.toString('utf8').split('').reverse().join(''),
  });
  const credential = vault.set({
    provider: 'p15-fake-provider',
    label: 'Machine gate credential',
    configuration: { baseUrl: 'https://models.example.test/v1' },
    secrets: { apiKey: 'never-write-this-plaintext' },
  });
  assert.equal(vault.list()[0]?.id, credential.id);
  assert.equal(
    vault.list()[0]?.configuration.baseUrl,
    'https://models.example.test/v1',
  );
  assert.deepEqual(vault.list()[0]?.configuredSecretFields, ['apiKey']);
  assert.doesNotMatch(
    JSON.stringify(vault.list()),
    /never-write-this-plaintext/u,
  );
  assert.equal(vault.resolve(credential.id), 'never-write-this-plaintext');
  assert.deepEqual(vault.resolveProfile(credential.id), {
    id: credential.id,
    provider: 'p15-fake-provider',
    label: 'Machine gate credential',
    configuration: { baseUrl: 'https://models.example.test/v1' },
    secrets: { apiKey: 'never-write-this-plaintext' },
  });
  const secondCredential = vault.set({
    provider: 'p15-fake-provider',
    label: 'Second account',
    configuration: {},
    secrets: { apiKey: 'a-different-secret' },
  });
  assert.notEqual(secondCredential.id, credential.id);
  assert.equal(vault.list().length, 2);
  const bailianCredential = vault.set({
    provider: 'aliyun-bailian',
    label: 'Legacy Bailian account',
    configuration: {},
    secrets: { apiKey: 'bailian-secret-remains-encrypted' },
  });
  settings.update('ai-tools', {
    activeProviderId: 'aliyun-bailian',
    providerCredentialRef: bailianCredential.id,
    providerConnections: {
      'aliyun-bailian': {
        credentialRef: bailianCredential.id,
        region: 'cn-beijing',
        workspaceId: 'p15-workspace',
      },
    },
    providers: [],
    credentialRefs: [],
  });
  const migration = migrateLegacyProviderConnections(settings, vault);
  assert.deepEqual(migration.migratedCredentialIds, [bailianCredential.id]);
  assert.deepEqual(
    vault.list().find((item) => item.id === bailianCredential.id)
      ?.configuration,
    { region: 'cn-beijing', workspaceId: 'p15-workspace' },
  );
  assert.equal(
    vault.resolve(bailianCredential.id),
    'bailian-secret-remains-encrypted',
  );
  assert.equal('providerConnections' in settings.get('ai-tools').values, false);
  assert.equal(
    'providerCredentialRef' in settings.get('ai-tools').values,
    false,
  );
  assert.equal('activeProviderId' in settings.get('ai-tools').values, false);
  assert.equal('providers' in settings.get('ai-tools').values, false);
  assert.equal('credentialRefs' in settings.get('ai-tools').values, false);
  assert.equal(
    settings.get('ai-tools').values.generationApprovalMode,
    'always',
  );
  assert.doesNotMatch(
    readFileSync(vaultPath, 'utf8'),
    /never-write-this-plaintext/u,
  );
  assert.equal(vault.remove(credential.id), true);
  assert.equal(vault.remove(secondCredential.id), true);
  assert.equal(vault.remove(bailianCredential.id), true);
  assert.deepEqual(vault.list(), []);
  assert.throws(
    () =>
      new CredentialVaultService(vaultPath, {
        available: () => false,
        encrypt: () => Buffer.alloc(0),
        decrypt: () => '',
      }).set({
        provider: 'x',
        label: 'x',
        configuration: {},
        secrets: { apiKey: 'x' },
      }),
    /不会降级为明文/u,
  );

  const mainSource = readFileSync(
    join(repository, 'studio', 'electron', 'main.ts'),
    'utf8',
  );
  assert.match(mainSource, /frame: false/u);
  assert.match(mainSource, /仍有工作正在进行/u);
  assert.match(mainSource, /window-state\.json/u);
  assert.match(mainSource, /IPC_CHANNELS\.projectProgress/u);
  for (const stage of ['validating', 'workspace', 'codex', 'finalizing']) {
    assert.match(mainSource, new RegExp(`stage: ["']${stage}["']`, 'u'));
  }
  const appSource = readFileSync(
    join(repository, 'studio', 'electron', 'renderer', 'App.tsx'),
    'utf8',
  );
  assert.match(appSource, /projects\.onProgress/u);
  assert.match(appSource, /project-operation-overlay/u);
  assert.match(appSource, /正在打开项目/u);
  assert.match(appSource, /请勿重复点击/u);
  assert.match(appSource, /aria-live="assertive"/u);
  const styles = readFileSync(
    join(repository, 'studio', 'electron', 'renderer', 'styles.css'),
    'utf8',
  );
  assert.match(styles, /\.project-operation-overlay/u);
  assert.match(styles, /project-operation-spin/u);
  const workbench = readFileSync(
    join(repository, 'studio', 'electron', 'renderer', 'Workbench.tsx'),
    'utf8',
  );
  for (const label of [
    '项目文件',
    '场景大纲',
    'Inspector',
    'Copilot',
    '控制台',
    '问题',
    '性能',
    '事件时间线',
    'Studio 设置',
    'Agent 设置',
    'AI 工具',
    '系统安全凭据',
  ]) {
    assert.match(workbench, new RegExp(label, 'u'));
  }
  for (const status of [
    'modified',
    'added',
    'deleted',
    'renamed',
    'untracked',
    'conflicted',
    'mixed',
  ]) {
    assert.match(workbench, new RegExp(`${status}:`, 'u'));
  }
  assert.match(workbench, /data-git-status/u);
  assert.match(workbench, /tree-label/u);
  assert.match(workbench, /document-tab-close/u);
  assert.match(workbench, /document-tab-context-menu/u);
  for (const action of ['关闭当前', '关闭右侧', '关闭其他', '关闭全部']) {
    assert.match(workbench, new RegExp(action, 'u'));
  }

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
        ELECTRON_NO_ATTACH_CONSOLE: '1',
        AIGAME_STUDIO_ROOT: repository,
        AIGAME_STUDIO_SMOKE: '1',
        AIGAME_STUDIO_USER_DATA: join(temporary, 'electron-user-data'),
      },
    },
  );
  assert.equal(electron.status, 0, electron.stderr || electron.error?.message);
  const line = electron.stdout
    .split(/\r?\n/u)
    .find((candidate) => candidate.startsWith('[electron-smoke] '));
  assert(line, electron.stdout);
  const smoke = JSON.parse(line.slice('[electron-smoke] '.length)) as {
    ok: boolean;
    bridgeKeys: string[];
    windowControls: string[];
    projectPresets: string[];
  };
  assert.equal(smoke.ok, true);
  assert.deepEqual(smoke.windowControls, [
    '最小化窗口',
    '最大化窗口',
    '关闭窗口',
  ]);
  assert.deepEqual(smoke.projectPresets, ['Empty', 'Empty 2D', 'Empty 3D']);
  assert(smoke.bridgeKeys.includes('settings'));
  assert(smoke.bridgeKeys.includes('window'));

  console.log(
    JSON.stringify(
      {
        gate: 'P15 desktop shell machine gate',
        presets: ['Empty', 'Empty 2D', 'Empty 3D'],
        restoredWorkspace: true,
        settingsScopes: ['studio', 'project', 'agent', 'ai-tools'],
        credentialVault: 'encrypted-reference-only',
        framelessElectronSmoke: true,
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
