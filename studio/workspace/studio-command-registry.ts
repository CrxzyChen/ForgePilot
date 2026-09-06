import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';

import { readProjectManifest } from '../project/project-schema.ts';
import { ProjectError } from '../project/project-types.ts';
import type {
  WorkspaceCommandResult,
  WorkspaceFile,
  WorkspaceFileKind,
  WorkspaceHistorySummary,
  WorkspaceSnapshot,
  StudioWorkspaceState,
} from './workspace-types.ts';
import { StudioLanguageService } from './studio-language-service.ts';
import {
  SCENE_AUTHORING_COMMANDS,
  SceneAuthoringService,
  type SceneDocument,
} from './scene-authoring-service.ts';
import {
  capabilitiesFor,
  capabilitiesForProject,
  parseProjectComponents,
} from '../capabilities/capability-registry.ts';
import {
  ProjectScriptRuntime,
  type ProjectRuntimeResult,
  type RunProjectOptions,
  type RuntimeBreakpoint,
} from '../runtime/project-script-runtime.ts';
import { RuntimeSessionService } from '../runtime/runtime-session-service.ts';
import {
  RuntimeTestReportStore,
  persistRuntimeTestReport,
} from '../runtime/runtime-test-reports.ts';
import {
  readRuntimeInputLog,
  saveRuntimeInputLog,
} from '../runtime/runtime-input-log.ts';
import {
  parseRuntimeAssertions,
  type RuntimeTestAssertion,
} from '../runtime/runtime-test-assertions.ts';
import { projectSceneToRenderSnapshot } from '../runtime/runtime-projection.ts';
import {
  RuntimeObservationService,
  runtimeStateHash,
  type RuntimeObservation,
} from '../runtime/runtime-observation-service.ts';

type FileState = {
  path: string;
  content: string | null;
  encoding?: 'utf8' | 'base64';
};
type HistoryEntry = {
  id: string;
  label: string;
  createdAt: string;
  before: FileState[];
  after: FileState[];
};
type HistoryFile = {
  schemaVersion: '1.0.0';
  cursor: number;
  entries: HistoryEntry[];
};
type PendingTransaction = {
  schemaVersion: '1.0.0';
  phase: 'prepared' | 'applied';
  entry: HistoryEntry;
};

const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.aigame',
  'node_modules',
  'dist',
  'out',
]);
const MAX_TEXT_BYTES = 4 * 1024 * 1024;
export const STUDIO_COMMANDS = [
  'project.refresh',
  'project.validate',
  'diagnostics.list',
  'project.search',
  'project.references',
  'project.replace',
  'source-control.diff',
  'source-control.stage',
  'source-control.unstage',
  'source-control.restore',
  'source-control.status',
  'source-control.commit',
  'source-control.history',
  'source-control.branch.list',
  'source-control.branch.create',
  'source-control.branch.switch',
  'source-control.stash.list',
  'source-control.stash.push',
  'source-control.stash.pop',
  'source-control.remote.list',
  'source-control.remote.fetch',
  'scene.list',
  'scene.inspect',
  'scene.object.pick',
  'component.types',
  'resource.dependencies',
  'resource.missing',
  'prefab.overrides',
  'audit.list',
  'test.run',
  'test.discover',
  'capability.set',
  'asset.generated.import',
  'project.file.write',
  'project.file.create',
  'project.file.rename',
  'project.file.duplicate',
  'project.file.trash',
  'input.define_action',
  'collision.define_rule',
  'runtime.start',
  'runtime.resume',
  'runtime.restart',
  'runtime.stop',
  'runtime.pause',
  'runtime.step_tick',
  'runtime.advance_ticks',
  'runtime.export_input_log',
  'runtime.input',
  'runtime.run_replay',
  'runtime.read_trace',
  'runtime.capture_frame',
  'runtime.navigate_checkpoint',
  'runtime.observation.read',
  'runtime.observation.compare',
  'runtime.hot_reload',
  'debug.breakpoint.set',
  'debug.breakpoint.remove',
  'debug.watch.set',
  'debug.watch.remove',
  'history.undo',
  'history.redo',
  ...SCENE_AUTHORING_COMMANDS,
] as const;

export const STUDIO_MUTATING_COMMANDS = new Set<string>([
  'project.file.write',
  'project.file.create',
  'project.file.rename',
  'project.file.duplicate',
  'project.file.trash',
  'project.replace',
  ...SCENE_AUTHORING_COMMANDS,
  'input.define_action',
  'collision.define_rule',
  'capability.set',
  'asset.generated.import',
]);

export type StudioCommandRegistryOptions = {
  projectRoot: string;
  kernelCliPath: string;
  scriptHostPath?: string;
  playerExecutablePath?: string;
};

function hash(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProjectError(
      'WORKSPACE_ARGUMENT_INVALID',
      `${label} 必须是对象。`,
    );
  }
  return value as Record<string, unknown>;
}

function stringValue(
  value: unknown,
  label: string,
  allowEmpty = false,
): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    throw new ProjectError(
      'WORKSPACE_ARGUMENT_INVALID',
      `${label} 必须是${allowEmpty ? '' : '非空'}字符串。`,
    );
  }
  return value;
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new ProjectError(
      'WORKSPACE_ARGUMENT_INVALID',
      `${label} 必须是整数。`,
    );
  }
  return value as number;
}

function kindFor(path: string): WorkspaceFileKind {
  if (path.startsWith('scenes/') && path.endsWith('.json')) return 'scene';
  if (path.startsWith('prefabs/')) return 'prefab';
  if (path.startsWith('scripts/')) return 'script';
  if (path.startsWith('assets/')) return 'asset';
  if (path.startsWith('tests/') && path.endsWith('.test.json')) return 'test';
  if (path.startsWith('replays/')) return 'replay';
  if (path.endsWith('.json') || path.endsWith('.toml')) return 'config';
  return 'text';
}

function mimeFor(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.wav':
      return 'audio/wav';
    case '.ogg':
      return 'audio/ogg';
    case '.obj':
      return 'model/obj';
    default:
      return 'application/octet-stream';
  }
}

export class StudioCommandRegistry {
  readonly #root: string;
  readonly #kernelCliPath: string;
  readonly #historyPath: string;
  readonly #pendingPath: string;
  readonly #workspaceStatePath: string;
  readonly #languageService: StudioLanguageService;
  readonly #authoring: SceneAuthoringService;
  readonly #scriptRuntime: ProjectScriptRuntime;
  readonly #runtimeSession: RuntimeSessionService;
  readonly #runtimeObservations: RuntimeObservationService;
  readonly #testReports: RuntimeTestReportStore;
  #history: HistoryFile;
  #lastRuntimeResult: ProjectRuntimeResult | null = null;
  #breakpoints: RuntimeBreakpoint[] = [];
  #watches: string[] = [];
  #runtime: WorkspaceSnapshot['runtime'];
  #runtimeTimer: ReturnType<typeof setInterval> | null = null;
  #runtimeObserver: ((runtime: WorkspaceSnapshot['runtime']) => void) | null =
    null;

  constructor(options: StudioCommandRegistryOptions) {
    this.#root = resolve(options.projectRoot);
    this.#testReports = new RuntimeTestReportStore(this.#root);
    this.#kernelCliPath = resolve(options.kernelCliPath);
    const local = join(this.#root, '.aigame', 'local');
    mkdirSync(local, { recursive: true });
    this.#historyPath = join(local, 'workspace-history.json');
    this.#pendingPath = join(local, 'pending-workspace-transaction.json');
    this.#workspaceStatePath = join(local, 'workspace.json');
    this.#languageService = new StudioLanguageService(this.#root);
    this.#authoring = new SceneAuthoringService(this.#root);
    this.#scriptRuntime = new ProjectScriptRuntime({
      projectRoot: this.#root,
      scriptHostPath:
        options.scriptHostPath ??
        join(
          process.cwd(),
          'target',
          'debug',
          process.platform === 'win32'
            ? 'project-script-host.exe'
            : 'project-script-host',
        ),
    });
    this.#runtimeSession = new RuntimeSessionService(this.#scriptRuntime);
    this.#runtimeObservations = new RuntimeObservationService({
      projectRoot: this.#root,
      playerExecutablePath:
        options.playerExecutablePath ??
        join(
          dirname(this.#kernelCliPath),
          process.platform === 'win32'
            ? 'ai-game-player.exe'
            : 'ai-game-player',
        ),
    });
    this.#runtime = {
      status: 'stopped',
      sessionId: this.#runtimeSession.sessionId,
      generation: 0,
      sequence: 0,
      tick: 0,
      seed: 20260902,
      stateHash: null,
      durationMs: null,
    };
    this.#history = this.#loadHistory();
    this.#recoverPending();
  }

  onRuntimeUpdate(
    observer: (runtime: WorkspaceSnapshot['runtime']) => void,
  ): () => void {
    this.#runtimeObserver = observer;
    return () => {
      if (this.#runtimeObserver === observer) this.#runtimeObserver = null;
    };
  }

  dispose(): void {
    this.#stopRuntimeLoop();
    this.#runtimeObserver = null;
  }

  getWorkspaceState(): StudioWorkspaceState {
    const fallback: StudioWorkspaceState = {
      schemaVersion: '2.0.0-alpha.1',
      activity: 'explorer',
      rightPanel: 'inspector',
      bottomPanel: 'console',
      openDocuments: [],
      activeDocument: null,
      selectedEntityId: null,
      collapsedFolders: [],
      diffReview: {
        viewMode: 'auto',
        ignoreTrimWhitespace: false,
        wordWrap: false,
        hideUnchangedRegions: true,
        contextLineCount: 3,
      },
      layout: {
        leftWidth: 244,
        rightWidth: 310,
        bottomHeight: 190,
        outlineCollapsed: false,
        filesCollapsed: false,
      },
    };
    try {
      if (!existsSync(this.#workspaceStatePath)) return fallback;
      const state = JSON.parse(
        readFileSync(this.#workspaceStatePath, 'utf8'),
      ) as StudioWorkspaceState;
      return state.schemaVersion === fallback.schemaVersion ? state : fallback;
    } catch {
      return fallback;
    }
  }

  setWorkspaceState(state: StudioWorkspaceState): StudioWorkspaceState {
    if (state.schemaVersion !== '2.0.0-alpha.1') {
      throw new ProjectError(
        'WORKSPACE_STATE_VERSION_INVALID',
        '工作区状态版本不受支持。',
      );
    }
    const temporary = `${this.#workspaceStatePath}.${randomUUID()}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    renameSync(temporary, this.#workspaceStatePath);
    return structuredClone(state);
  }

  readInputLog(inputLogId: string) {
    return readRuntimeInputLog(this.#root, inputLogId);
  }

  resolveRuntimeReplay(args: Record<string, unknown>): RunProjectOptions {
    return this.#runtimeOptions(
      'runtime.start',
      args,
      stringValue(args.scene ?? this.snapshot().entryScene, 'scene'),
    );
  }

  snapshot(): WorkspaceSnapshot {
    const files = this.#listFiles();
    const manifest = readProjectManifest(
      join(this.#root, 'project.aigame.json'),
    );
    const assetManifest = JSON.parse(
      readFileSync(this.#path('assets/asset-manifest.json'), 'utf8'),
    ) as { assets?: Array<Record<string, unknown>> };
    const inputManifest = JSON.parse(
      readFileSync(this.#path('input/actions.json'), 'utf8'),
    ) as { actions?: Array<{ id: string; bindings: string[] }> };
    const audioBusPath = this.#path('audio/buses.json');
    const audioBuses = existsSync(audioBusPath)
      ? ((
          JSON.parse(readFileSync(audioBusPath, 'utf8')) as {
            buses?: Array<{ id: string; volume: number; muted: boolean }>;
          }
        ).buses ?? [])
      : [];
    return {
      root: this.#root,
      files,
      testRuns: this.#testReports.latest(
        files.filter((file) => file.kind === 'test').map((file) => file.path),
      ),
      entryScene: manifest.entry.scene,
      scenes: this.#authoring.listScenes(),
      activeScene: manifest.entry.scene,
      capabilities: capabilitiesForProject(
        this.#root,
        manifest.capabilities,
      ) as unknown as Array<Record<string, unknown>>,
      assets: structuredClone(assetManifest.assets ?? []),
      inputActions: structuredClone(inputManifest.actions ?? []),
      audioBuses: structuredClone(audioBuses),
      runtime: structuredClone(this.#runtime),
      history: this.#historySummary(),
      commands: [...STUDIO_COMMANDS],
    };
  }

  readText(relativePath: string): {
    path: string;
    source: string;
    hash: string;
  } {
    const path = this.#path(relativePath);
    const stats = statSync(path);
    if (!stats.isFile() || stats.size > MAX_TEXT_BYTES) {
      throw new ProjectError(
        'WORKSPACE_FILE_NOT_TEXT',
        '文件不存在、不是普通文件或超过 4 MiB 文本编辑上限。',
      );
    }
    const source = readFileSync(path, 'utf8');
    return { path: this.#relative(path), source, hash: hash(source) };
  }

  readAssetPreview(relativePath: string): { path: string; dataUrl: string } {
    const localRuntimeObservation = relativePath.startsWith(
      '.aigame/local/runtime-observations/',
    );
    const path = this.#path(relativePath, localRuntimeObservation);
    const stats = statSync(path);
    if (!stats.isFile() || stats.size > 8 * 1024 * 1024) {
      throw new ProjectError(
        'WORKSPACE_ASSET_PREVIEW_UNAVAILABLE',
        '资源不存在或超过 8 MiB 预览上限。',
      );
    }
    const mime = mimeFor(path);
    if (
      !mime.startsWith('image/') &&
      !mime.startsWith('audio/') &&
      mime !== 'model/obj'
    ) {
      throw new ProjectError(
        'WORKSPACE_ASSET_PREVIEW_UNSUPPORTED',
        '当前只支持图片、音频和 Wavefront OBJ 资源预览。',
      );
    }
    return {
      path: this.#relative(path),
      dataUrl: `data:${mime};base64,${readFileSync(path).toString('base64')}`,
    };
  }

  importAsset(sourcePath: string): WorkspaceCommandResult {
    const source = resolve(sourcePath);
    const stats = statSync(source);
    if (!stats.isFile() || stats.size > 32 * 1024 * 1024) {
      throw new ProjectError(
        'WORKSPACE_ASSET_IMPORT_INVALID',
        '资源必须是小于 32 MiB 的普通文件。',
      );
    }
    const originalName = basename(source);
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]+/gu, '-');
    if (!safeName || safeName === '.' || safeName === '..') {
      throw new ProjectError(
        'WORKSPACE_ASSET_NAME_INVALID',
        '资源文件名无效。',
      );
    }
    const target = `assets/imported/${safeName}`;
    const manifestPath = 'assets/asset-manifest.json';
    const manifestSource = this.readText(manifestPath).source;
    const manifest = JSON.parse(manifestSource) as {
      assets: Array<Record<string, unknown>>;
    };
    const bytes = readFileSync(source);
    const namespace = readProjectManifest(
      join(this.#root, 'project.aigame.json'),
    ).id.replace(/^local:/u, '');
    const stem = safeName
      .replace(/\.[^.]+$/u, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/gu, '-');
    const id = `${namespace}:asset/${stem}`;
    const asset = {
      id,
      path: target,
      kind: mimeFor(safeName).startsWith('image/')
        ? 'image'
        : mimeFor(safeName).startsWith('audio/')
          ? 'audio'
          : 'binary',
      mime: mimeFor(safeName),
      bytes: stats.size,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      source: { type: 'import', originalName },
      status: 'ready',
    };
    const index = manifest.assets.findIndex((item) => item.id === id);
    if (index >= 0) manifest.assets[index] = asset;
    else manifest.assets.push(asset);
    const nextManifest = `${JSON.stringify(manifest, null, 2)}\n`;
    const existing = existsSync(this.#path(target))
      ? readFileSync(this.#path(target)).toString('base64')
      : null;
    this.#mutate(
      `导入资源 ${id}`,
      [
        { path: target, content: existing, encoding: 'base64' },
        { path: manifestPath, content: manifestSource },
      ],
      [
        { path: target, content: bytes.toString('base64'), encoding: 'base64' },
        { path: manifestPath, content: nextManifest },
      ],
    );
    return {
      command: 'asset.import',
      changed: true,
      message: `已导入 ${originalName}`,
      data: asset,
      snapshot: this.snapshot(),
    };
  }

  queueRuntimeInput(input: unknown = {}): {
    tick: number;
    action: string;
    value: number;
    source: 'keyboard' | 'pointer' | 'gamepad' | 'replay' | 'automation';
  } {
    if (this.#runtimeSession.generation === 0) {
      throw new ProjectError(
        'WORKSPACE_RUNTIME_NOT_STARTED',
        '请先运行一次预览。',
      );
    }
    const args = object(input, '运行时输入');
    const targetTick =
      args.tick === undefined
        ? this.#runtimeSession.tick
        : integer(args.tick, 'tick');
    const action = stringValue(args.action, 'action');
    const value = Number(args.value ?? 1);
    if (!Number.isFinite(value)) {
      throw new ProjectError(
        'WORKSPACE_RUNTIME_INPUT_INVALID',
        'value 必须是有限数值。',
      );
    }
    const source =
      args.source === undefined
        ? 'automation'
        : stringValue(args.source, 'source');
    if (
      !['keyboard', 'pointer', 'gamepad', 'replay', 'automation'].includes(
        source,
      )
    ) {
      throw new ProjectError(
        'WORKSPACE_RUNTIME_INPUT_SOURCE_INVALID',
        'source 必须是 keyboard、pointer、gamepad、replay 或 automation。',
      );
    }
    this.#runtimeSession.queueInput({
      tick: targetTick,
      action,
      value,
    });
    this.#runtime.sequence = this.#runtimeSession.sequence;
    this.#publishRuntime();
    return {
      tick: targetTick,
      action,
      value,
      source: source as
        | 'keyboard'
        | 'pointer'
        | 'gamepad'
        | 'replay'
        | 'automation',
    };
  }

  execute(command: string, input: unknown = {}): WorkspaceCommandResult {
    if (!(STUDIO_COMMANDS as readonly string[]).includes(command)) {
      throw new ProjectError(
        'WORKSPACE_COMMAND_UNKNOWN',
        `未知 Studio 命令：${command}`,
      );
    }
    const args = object(input, '命令参数');
    let changed = false;
    let message = '已刷新项目。';
    let data: unknown;
    switch (command) {
      case 'project.refresh':
        break;
      case 'scene.list':
        data = this.#authoring.listScenes();
        message = '已读取 Scene 列表。';
        break;
      case 'scene.inspect':
        data = this.#authoring.readScene(
          stringValue(args.path ?? this.snapshot().entryScene, 'path'),
        );
        message = '已读取 Scene。';
        break;
      case 'scene.object.pick': {
        const scene = this.#authoring.readScene(
          stringValue(args.scene ?? this.snapshot().entryScene, 'scene'),
        );
        const objectId = stringValue(args.objectId, 'objectId');
        const selected = scene.objects.find((object) => object.id === objectId);
        if (!selected)
          throw new ProjectError(
            'SCENE_OBJECT_NOT_FOUND',
            `对象不存在：${objectId}`,
          );
        data = { sceneId: scene.id, object: selected };
        message = `已选择 ${selected.name}。`;
        break;
      }
      case 'component.types': {
        const manifest = readProjectManifest(
          join(this.#root, 'project.aigame.json'),
        );
        data = capabilitiesForProject(
          this.#root,
          manifest.capabilities,
        ).flatMap((capability) => capability.components);
        message = '已读取可用 Component 类型。';
        break;
      }
      case 'resource.dependencies':
        data = this.#authoring.dependencies(stringValue(args.path, 'path'));
        message = '已读取资源依赖关系。';
        break;
      case 'resource.missing':
        data = this.#authoring.missingReferences();
        message = '已扫描项目缺失引用。';
        break;
      case 'prefab.overrides': {
        const scenePath = stringValue(
          args.scene ?? this.snapshot().entryScene,
          'scene',
        );
        const objectId = stringValue(args.objectId, 'objectId');
        const scene = JSON.parse(
          this.readText(scenePath).source,
        ) as SceneDocument;
        const instance = scene.objects.find((item) => item.id === objectId);
        if (!instance)
          throw new ProjectError(
            'PREFAB_INSTANCE_NOT_FOUND',
            `Scene 中不存在对象：${objectId}`,
          );
        const marker = instance.components.find(
          (component) => component.type === 'core:prefab-instance',
        );
        const prefabPath = marker?.data.path;
        const sourceObjectId = marker?.data.sourceObjectId;
        if (
          typeof prefabPath !== 'string' ||
          typeof sourceObjectId !== 'string'
        )
          throw new ProjectError(
            'PREFAB_INSTANCE_REQUIRED',
            '所选对象不是 Prefab 根实例。',
          );
        const prefab = JSON.parse(this.readText(prefabPath).source) as {
          objects?: SceneDocument['objects'];
        };
        const sourceObject = prefab.objects?.find(
          (item) => item.id === sourceObjectId,
        );
        if (!sourceObject)
          throw new ProjectError(
            'PREFAB_SOURCE_MISSING',
            'Prefab 源对象已不存在。',
          );
        const normalized = (
          components: SceneDocument['objects'][number]['components'],
        ) =>
          components
            .filter((component) => component.type !== 'core:prefab-instance')
            .map((component) => ({
              type: component.type,
              enabled: component.enabled,
              data: component.data,
            }))
            .sort((left, right) => left.type.localeCompare(right.type));
        const overrides: Array<{
          field: string;
          source: unknown;
          instance: unknown;
        }> = [];
        if (instance.name !== sourceObject.name)
          overrides.push({
            field: 'name',
            source: sourceObject.name,
            instance: instance.name,
          });
        const sourceComponents = normalized(sourceObject.components);
        const instanceComponents = normalized(instance.components);
        if (
          JSON.stringify(sourceComponents) !==
          JSON.stringify(instanceComponents)
        )
          overrides.push({
            field: 'components',
            source: sourceComponents,
            instance: instanceComponents,
          });
        data = {
          scene: scenePath,
          objectId,
          prefabPath,
          sourceObjectId,
          overrides,
        };
        message =
          overrides.length === 0
            ? 'Prefab 实例没有覆盖。'
            : `检测到 ${overrides.length} 项 Prefab 覆盖。`;
        break;
      }
      case 'project.validate':
        data = this.#validate(
          stringValue(args.path ?? this.snapshot().entryScene, 'path'),
        );
        message = '项目入口场景验证通过。';
        break;
      case 'diagnostics.list':
        data = this.#languageService.diagnostics(
          args.path === undefined ? undefined : stringValue(args.path, 'path'),
        );
        message = `已读取项目源码诊断。`;
        break;
      case 'project.search': {
        const query = stringValue(args.query, 'query');
        data = this.#languageService.search(query);
        message = `已搜索“${query}”。`;
        break;
      }
      case 'project.references': {
        data = this.#languageService.references({
          ...(args.id === undefined ? {} : { id: stringValue(args.id, 'id') }),
          ...(args.path === undefined
            ? {}
            : { path: stringValue(args.path, 'path') }),
        });
        message = '已读取 Scene、Component、脚本、System 与 Event 双向引用。';
        break;
      }
      case 'project.replace': {
        const query = stringValue(args.query, 'query');
        const replacement = stringValue(
          args.replacement ?? '',
          'replacement',
          true,
        );
        const matches = this.#languageService.search(query);
        const paths = [...new Set(matches.map((match) => match.path))];
        const before = paths.map((path) => ({
          path,
          content: this.readText(path).source,
        }));
        const after = before.map((file) => ({
          path: file.path,
          content: file.content?.replaceAll(query, replacement) ?? '',
        }));
        for (const file of after)
          this.#validateCandidate(file.path, file.content ?? '');
        if (matches.length > 0) this.#mutate(`替换“${query}”`, before, after);
        changed = matches.length > 0;
        data = { replacements: matches.length, files: paths };
        message = `已在 ${paths.length} 个文件替换 ${matches.length} 处。`;
        break;
      }
      case 'source-control.diff': {
        const path = stringValue(args.path, 'path');
        this.#path(path, true);
        const after = existsSync(this.#path(path))
          ? this.readText(path).source
          : '';
        const previous = spawnSync('git', ['show', `HEAD:${path}`], {
          cwd: this.#root,
          encoding: 'utf8',
          windowsHide: true,
          timeout: 5_000,
          maxBuffer: MAX_TEXT_BYTES,
        });
        const gitStatus = spawnSync(
          'git',
          ['status', '--porcelain=v1', '--untracked-files=all', '--', path],
          {
            cwd: this.#root,
            encoding: 'utf8',
            windowsHide: true,
            timeout: 5_000,
            maxBuffer: MAX_TEXT_BYTES,
          },
        );
        const statusCode =
          gitStatus.stdout.split(/\r?\n/u)[0]?.slice(0, 2) ?? '';
        data = {
          path,
          before: previous.status === 0 ? previous.stdout : '',
          after,
          gitStatus:
            this.#listFiles().find((file) => file.path === path)?.gitStatus ??
            'deleted',
          tracked: previous.status === 0,
          staged:
            statusCode.length === 2 &&
            statusCode[0] !== ' ' &&
            statusCode[0] !== '?',
          unstaged:
            statusCode === '??' ||
            (statusCode.length === 2 && statusCode[1] !== ' '),
        };
        message = `已读取 ${path} 的工作区 Diff。`;
        break;
      }
      case 'source-control.stage': {
        const path = stringValue(args.path, 'path');
        this.#path(path, true);
        this.#runGit(['add', '-A', '--', path], 'SOURCE_CONTROL_STAGE_FAILED');
        changed = true;
        data = { path, staged: true };
        message = `已暂存 ${path}。`;
        break;
      }
      case 'source-control.unstage': {
        const path = stringValue(args.path, 'path');
        this.#path(path, true);
        this.#runGit(
          ['restore', '--staged', '--', path],
          'SOURCE_CONTROL_UNSTAGE_FAILED',
        );
        changed = true;
        data = { path, staged: false };
        message = `已取消暂存 ${path}。`;
        break;
      }
      case 'source-control.restore': {
        const path = stringValue(args.path, 'path');
        this.#path(path, true);
        const tracked = spawnSync(
          'git',
          ['ls-files', '--error-unmatch', '--', path],
          {
            cwd: this.#root,
            encoding: 'utf8',
            windowsHide: true,
            timeout: 5_000,
          },
        );
        if (tracked.status !== 0)
          throw new ProjectError(
            'SOURCE_CONTROL_RESTORE_UNTRACKED',
            '未跟踪文件不会被直接删除；请使用项目回收站。',
          );
        this.#runGit(
          ['restore', '--worktree', '--', path],
          'SOURCE_CONTROL_RESTORE_FAILED',
        );
        changed = true;
        data = { path, restored: true };
        message = `已将 ${path} 的工作区内容还原到索引版本。`;
        break;
      }
      case 'source-control.status': {
        const branch = this.#runGit(
          ['branch', '--show-current'],
          'SOURCE_CONTROL_STATUS_FAILED',
        ).trim();
        const porcelain = this.#runGit(
          ['status', '--porcelain=v1', '--branch', '--untracked-files=all'],
          'SOURCE_CONTROL_STATUS_FAILED',
        );
        data = {
          branch: branch || '(detached)',
          summary: porcelain,
          files: this.#listFiles(),
        };
        message = `已刷新 Git 状态：${branch || '(detached)'}`;
        break;
      }
      case 'source-control.commit': {
        const commitMessage = stringValue(args.message, 'message').trim();
        if (commitMessage.length > 200)
          throw new ProjectError(
            'SOURCE_CONTROL_MESSAGE_INVALID',
            '提交说明不能超过 200 字符。',
          );
        const staged = this.#runGit(
          ['diff', '--cached', '--name-only'],
          'SOURCE_CONTROL_COMMIT_FAILED',
        ).trim();
        if (!staged)
          throw new ProjectError(
            'SOURCE_CONTROL_NOTHING_STAGED',
            '没有已暂存的文件可提交。',
          );
        this.#runGit(
          ['commit', '-m', commitMessage],
          'SOURCE_CONTROL_COMMIT_FAILED',
        );
        const commit = this.#runGit(
          ['rev-parse', 'HEAD'],
          'SOURCE_CONTROL_COMMIT_FAILED',
        ).trim();
        changed = true;
        data = { commit, files: staged.split(/\r?\n/u).filter(Boolean) };
        message = `已创建提交 ${commit.slice(0, 8)}。`;
        break;
      }
      case 'source-control.history': {
        const count = Math.max(1, Math.min(100, Number(args.count ?? 30)));
        const output = this.#runGit(
          [
            'log',
            `-${count}`,
            '--date=iso-strict',
            '--format=%H%x1f%an%x1f%ad%x1f%s',
          ],
          'SOURCE_CONTROL_HISTORY_FAILED',
        );
        data = output
          .trim()
          .split(/\r?\n/u)
          .filter(Boolean)
          .map((line) => {
            const [commit, author, date, subject] = line.split('\u001f');
            return { commit, author, date, subject };
          });
        message = `已读取最近 ${Array.isArray(data) ? data.length : 0} 条提交。`;
        break;
      }
      case 'source-control.branch.list': {
        const current = this.#runGit(
          ['branch', '--show-current'],
          'SOURCE_CONTROL_BRANCH_FAILED',
        ).trim();
        const branches = this.#runGit(
          ['branch', '--format=%(refname:short)'],
          'SOURCE_CONTROL_BRANCH_FAILED',
        )
          .trim()
          .split(/\r?\n/u)
          .filter(Boolean);
        data = { current, branches };
        message = '已读取本地分支。';
        break;
      }
      case 'source-control.branch.create': {
        const name = stringValue(args.name, 'name');
        this.#runGit(
          ['check-ref-format', '--branch', name],
          'SOURCE_CONTROL_BRANCH_INVALID',
        );
        this.#runGit(['switch', '-c', name], 'SOURCE_CONTROL_BRANCH_FAILED');
        changed = true;
        data = { current: name };
        message = `已创建并切换到分支 ${name}。`;
        break;
      }
      case 'source-control.branch.switch': {
        const name = stringValue(args.name, 'name');
        this.#runGit(['switch', name], 'SOURCE_CONTROL_BRANCH_FAILED');
        changed = true;
        data = { current: name };
        message = `已切换到分支 ${name}。`;
        break;
      }
      case 'source-control.stash.list': {
        const output = this.#runGit(
          ['stash', 'list', '--format=%gd%x1f%H%x1f%s'],
          'SOURCE_CONTROL_STASH_FAILED',
        );
        data = output
          .trim()
          .split(/\r?\n/u)
          .filter(Boolean)
          .map((line) => {
            const [ref, commit, subject] = line.split('\u001f');
            return { ref, commit, subject };
          });
        message = '已读取 Stash。';
        break;
      }
      case 'source-control.stash.push': {
        const stashMessage = (
          typeof args.message === 'string'
            ? args.message
            : 'AI Game Studio work in progress'
        ).slice(0, 200);
        const output = this.#runGit(
          ['stash', 'push', '--include-untracked', '-m', stashMessage],
          'SOURCE_CONTROL_STASH_FAILED',
        );
        changed = true;
        data = { output: output.trim() };
        message = '已保存工作区到 Stash。';
        break;
      }
      case 'source-control.stash.pop': {
        const reference = typeof args.ref === 'string' ? args.ref : 'stash@{0}';
        const output = this.#runGit(
          ['stash', 'pop', reference],
          'SOURCE_CONTROL_STASH_CONFLICT',
        );
        changed = true;
        data = { output: output.trim(), files: this.#listFiles() };
        message = `已应用 ${reference}；请检查冲突标记。`;
        break;
      }
      case 'source-control.remote.list': {
        const output = this.#runGit(
          ['remote', '-v'],
          'SOURCE_CONTROL_REMOTE_FAILED',
        );
        data = output
          .trim()
          .split(/\r?\n/u)
          .filter(Boolean)
          .map((line) => {
            const [name, url, direction] = line.split(/\s+/u);
            return { name, url, direction: direction?.replace(/[()]/gu, '') };
          });
        message = '已读取 Git 远端；凭据由 Git 凭据管理器处理。';
        break;
      }
      case 'source-control.remote.fetch': {
        const remote = typeof args.remote === 'string' ? args.remote : 'origin';
        this.#runGit(
          ['fetch', '--prune', remote],
          'SOURCE_CONTROL_FETCH_FAILED',
        );
        changed = true;
        data = { remote };
        message = `已从 ${remote} 获取远端状态。`;
        break;
      }
      case 'audit.list':
        data = {
          cursor: this.#history.cursor,
          events: this.#history.entries.map((entry, index) => ({
            sequence: index + 1,
            id: entry.id,
            label: entry.label,
            createdAt: entry.createdAt,
            applied: index < this.#history.cursor,
          })),
        };
        message = '已读取项目事务审计。';
        break;
      case 'test.discover': {
        data = this.#listFiles()
          .filter((file) => file.kind === 'test')
          .map((file) => {
            let title = file.path;
            let ticks: number | null = null;
            try {
              const document = JSON.parse(
                readFileSync(this.#path(file.path), 'utf8'),
              ) as {
                name?: string;
                ticks?: number;
              };
              title = document.name ?? file.path;
              ticks = Number.isSafeInteger(document.ticks)
                ? document.ticks!
                : null;
            } catch {
              // Invalid test files remain discoverable and fail when run.
            }
            return { path: file.path, title, ticks };
          });
        message = `发现 ${Array.isArray(data) ? data.length : 0} 个测试。`;
        break;
      }
      case 'capability.set': {
        const id = stringValue(args.id, 'id');
        if (!['2d', '3d', 'ui'].includes(id))
          throw new ProjectError(
            'CAPABILITY_UNKNOWN',
            `不可管理的内置能力：${id}`,
          );
        const enabled = args.enabled === true;
        const current = this.readText('project.aigame.json');
        const manifest = JSON.parse(current.source) as {
          capabilities?: string[];
        };
        const values = new Set(manifest.capabilities ?? []);
        if (enabled) values.add(id);
        else values.delete(id);
        manifest.capabilities = [...values];
        const content = `${JSON.stringify(manifest, null, 2)}\n`;
        this.#validateCandidate('project.aigame.json', content);
        this.#mutate(
          `${enabled ? '启用' : '停用'}能力 ${id}`,
          [{ path: 'project.aigame.json', content: current.source }],
          [{ path: 'project.aigame.json', content }],
        );
        changed = true;
        data = { id, enabled, health: 'ready', requiresRestart: false };
        message = `已${enabled ? '启用' : '停用'} ${id} 能力。`;
        break;
      }
      case 'asset.generated.import': {
        const sourcePath = stringValue(args.sourcePath, 'sourcePath');
        const expectedSha256 = stringValue(
          args.expectedSha256,
          'expectedSha256',
        );
        const outputName = stringValue(args.outputName, 'outputName');
        if (!/^[a-f0-9]{64}$/u.test(expectedSha256)) {
          throw new ProjectError(
            'GENERATED_ASSET_HASH_INVALID',
            '候选资源哈希格式无效。',
          );
        }
        const source = resolve(sourcePath);
        const normalizedSource = source.replaceAll('\\', '/');
        if (!normalizedSource.includes('/.aigame/local/asset-candidates/')) {
          throw new ProjectError(
            'GENERATED_ASSET_SOURCE_REJECTED',
            '只能从 Studio 的受控候选目录导入生成资源。',
          );
        }
        const sourceStats = statSync(source);
        if (!sourceStats.isFile() || sourceStats.size > 32 * 1024 * 1024) {
          throw new ProjectError(
            'GENERATED_ASSET_SOURCE_INVALID',
            '生成候选必须是小于 32 MiB 的普通文件。',
          );
        }
        const bytes = readFileSync(source);
        const actualSha256 = createHash('sha256').update(bytes).digest('hex');
        if (actualSha256 !== expectedSha256) {
          throw new ProjectError(
            'GENERATED_ASSET_HASH_MISMATCH',
            '候选资源在审核后发生变化，已拒绝导入。',
          );
        }
        const safeOutputName = basename(outputName).replace(
          /[^a-zA-Z0-9._-]+/gu,
          '-',
        );
        if (
          safeOutputName !== outputName ||
          !safeOutputName ||
          safeOutputName === '.' ||
          safeOutputName === '..'
        ) {
          throw new ProjectError(
            'GENERATED_ASSET_NAME_INVALID',
            '生成资源输出名必须是安全文件名。',
          );
        }
        const namespace = readProjectManifest(
          join(this.#root, 'project.aigame.json'),
        ).id.replace(/^local:/u, '');
        const stem = safeOutputName
          .replace(/\.[^.]+$/u, '')
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/gu, '-');
        const assetId = `${namespace}:asset/${stem}`;
        const targetPath = `assets/imported/${safeOutputName}`;
        const manifestPath = 'assets/asset-manifest.json';
        const provenancePath = `assets/provenance/${stem}.json`;
        const importSettingsPath = `assets/import-settings/${stem}.json`;
        const manifestSource = this.readText(manifestPath).source;
        const manifest = JSON.parse(manifestSource) as {
          assets: Array<Record<string, unknown>>;
        };
        const provenance = object(args.provenance, 'provenance');
        const allowedProvenance = {
          schemaVersion: '1.0.0',
          type: 'generated',
          providerId: stringValue(provenance.providerId, 'providerId'),
          modelId: stringValue(provenance.modelId, 'modelId'),
          jobId: stringValue(provenance.jobId, 'jobId'),
          candidateId: stringValue(provenance.candidateId, 'candidateId'),
          reviewDecisionId: stringValue(
            provenance.reviewDecisionId,
            'reviewDecisionId',
          ),
          promptSha256: stringValue(provenance.promptSha256, 'promptSha256'),
          parametersSha256: stringValue(
            provenance.parametersSha256,
            'parametersSha256',
          ),
          candidateSha256: expectedSha256,
          artDirectionSkillId:
            typeof provenance.artDirectionSkillId === 'string'
              ? provenance.artDirectionSkillId
              : null,
          artDirectionSkillHash:
            typeof provenance.artDirectionSkillHash === 'string' &&
            /^[a-f0-9]{64}$/u.test(provenance.artDirectionSkillHash)
              ? provenance.artDirectionSkillHash
              : null,
          assetBriefId:
            typeof provenance.assetBriefId === 'string'
              ? provenance.assetBriefId
              : null,
          assetBriefHash:
            typeof provenance.assetBriefHash === 'string' &&
            /^[a-f0-9]{64}$/u.test(provenance.assetBriefHash)
              ? provenance.assetBriefHash
              : null,
          source: 'provider-output',
          transformations: Array.isArray(provenance.transformations)
            ? structuredClone(provenance.transformations)
            : [],
          sourceHashes: Array.isArray(provenance.sourceHashes)
            ? provenance.sourceHashes.filter(
                (item): item is string =>
                  typeof item === 'string' && /^[a-f0-9]{64}$/u.test(item),
              )
            : [],
          derivedContentHashes: Array.isArray(provenance.derivedContentHashes)
            ? provenance.derivedContentHashes.filter(
                (item): item is string =>
                  typeof item === 'string' && /^[a-f0-9]{64}$/u.test(item),
              )
            : [expectedSha256],
          reviewedBy:
            provenance.reviewedBy === 'configured-policy'
              ? 'configured-policy'
              : 'human',
          reviewedAt: stringValue(provenance.reviewedAt, 'reviewedAt'),
          license:
            typeof provenance.license === 'string'
              ? provenance.license
              : 'provider-output',
          restrictions: Array.isArray(provenance.restrictions)
            ? provenance.restrictions.filter(
                (item): item is string => typeof item === 'string',
              )
            : [],
        };
        const importSettings =
          args.importSettings &&
          typeof args.importSettings === 'object' &&
          !Array.isArray(args.importSettings)
            ? structuredClone(args.importSettings as Record<string, unknown>)
            : {};
        const asset = {
          id: assetId,
          path: targetPath,
          kind: mimeFor(safeOutputName).startsWith('image/')
            ? 'image'
            : mimeFor(safeOutputName).startsWith('audio/')
              ? 'audio'
              : 'binary',
          mime: mimeFor(safeOutputName),
          bytes: sourceStats.size,
          sha256: expectedSha256,
          source: allowedProvenance,
          importSettings,
          provenancePath,
          status: 'ready',
        };
        const assetIndex = manifest.assets.findIndex(
          (item) => item.id === assetId,
        );
        if (assetIndex >= 0) manifest.assets[assetIndex] = asset;
        else manifest.assets.push(asset);
        const textState = (path: string): FileState => ({
          path,
          content: existsSync(this.#path(path, true))
            ? readFileSync(this.#path(path, true), 'utf8')
            : null,
        });
        const binaryState = (path: string): FileState => ({
          path,
          content: existsSync(this.#path(path, true))
            ? readFileSync(this.#path(path, true)).toString('base64')
            : null,
          encoding: 'base64',
        });
        this.#mutate(
          `事务导入生成资源 ${assetId}`,
          [
            binaryState(targetPath),
            { path: manifestPath, content: manifestSource },
            textState(provenancePath),
            textState(importSettingsPath),
          ],
          [
            {
              path: targetPath,
              content: bytes.toString('base64'),
              encoding: 'base64',
            },
            {
              path: manifestPath,
              content: `${JSON.stringify(manifest, null, 2)}\n`,
            },
            {
              path: provenancePath,
              content: `${JSON.stringify(allowedProvenance, null, 2)}\n`,
            },
            {
              path: importSettingsPath,
              content: `${JSON.stringify(
                { schemaVersion: '1.0.0', assetId, ...importSettings },
                null,
                2,
              )}\n`,
            },
          ],
        );
        changed = true;
        data = asset;
        message = `已事务导入 ${assetId}`;
        break;
      }
      case 'project.file.write': {
        const path = stringValue(args.path, 'path');
        const content = stringValue(args.content, 'content', true);
        if (!existsSync(this.#path(path))) {
          throw new ProjectError(
            'WORKSPACE_FILE_NOT_FOUND',
            `文件不存在：${path}。新建文件请使用 project.file.create；更新已有文件使用 project.file.write 并提供 baseHash。`,
            { path, suggestedCommand: 'project.file.create' },
          );
        }
        const current = this.readText(path);
        const baseHash = stringValue(args.baseHash, 'baseHash');
        if (current.hash !== baseHash) {
          throw new ProjectError(
            'WORKSPACE_BASE_CHANGED',
            '文件已被其他操作修改，请重新载入后再保存。',
          );
        }
        this.#validateCandidate(path, content);
        this.#mutate(
          `保存 ${path}`,
          [{ path, content: current.source }],
          [{ path, content }],
        );
        changed = true;
        message = `已保存 ${path}`;
        break;
      }
      case 'project.file.create': {
        const path = stringValue(args.path, 'path');
        const content = stringValue(args.content ?? '', 'content', true);
        if (existsSync(this.#path(path))) {
          throw new ProjectError(
            'WORKSPACE_FILE_EXISTS',
            `文件已存在：${path}`,
          );
        }
        this.#validateCandidate(path, content);
        this.#mutate(
          `创建 ${path}`,
          [{ path, content: null }],
          [{ path, content }],
        );
        changed = true;
        message = `已创建 ${path}`;
        break;
      }
      case 'project.file.rename': {
        const from = stringValue(args.from, 'from');
        const to = stringValue(args.to, 'to');
        const source = this.readText(from).source;
        if (existsSync(this.#path(to))) {
          throw new ProjectError('WORKSPACE_FILE_EXISTS', `目标已存在：${to}`);
        }
        this.#mutate(
          `移动 ${from} → ${to}`,
          [
            { path: from, content: source },
            { path: to, content: null },
          ],
          [
            { path: from, content: null },
            { path: to, content: source },
          ],
        );
        changed = true;
        message = `已移动到 ${to}`;
        break;
      }
      case 'project.file.duplicate': {
        const from = stringValue(args.from, 'from');
        const to = stringValue(args.to, 'to');
        const source = this.readText(from).source;
        if (existsSync(this.#path(to))) {
          throw new ProjectError('WORKSPACE_FILE_EXISTS', `目标已存在：${to}`);
        }
        this.#mutate(
          `复制 ${from} → ${to}`,
          [{ path: to, content: null }],
          [{ path: to, content: source }],
        );
        changed = true;
        message = `已复制到 ${to}`;
        break;
      }
      case 'project.file.trash': {
        const path = stringValue(args.path, 'path');
        const source = this.readText(path).source;
        const trashPath = `.aigame/trash/${Date.now()}-${this.#relative(this.#path(path)).replaceAll('/', '__')}`;
        this.#mutate(
          `移到回收站 ${path}`,
          [
            { path, content: source },
            { path: trashPath, content: null },
          ],
          [
            { path, content: null },
            { path: trashPath, content: source },
          ],
        );
        changed = true;
        message = `已移到项目回收站：${trashPath}`;
        break;
      }
      case 'input.define_action': {
        const path = 'input/actions.json';
        const current = this.readText(path);
        const document = JSON.parse(current.source) as {
          actions?: Array<{ id: string; bindings: string[] }>;
        };
        document.actions ??= [];
        const id = stringValue(args.id, 'id');
        const bindings = Array.isArray(args.bindings)
          ? args.bindings.map((value) => stringValue(value, 'binding'))
          : [];
        const existing = document.actions.find((action) => action.id === id);
        if (existing) existing.bindings = bindings;
        else document.actions.push({ id, bindings });
        const content = `${JSON.stringify(document, null, 2)}\n`;
        this.#mutate(
          `定义输入动作 ${id}`,
          [{ path, content: current.source }],
          [{ path, content }],
        );
        changed = true;
        message = `已定义输入动作 ${id}`;
        break;
      }
      case 'collision.define_rule': {
        const path = 'physics/collision-layers.json';
        const existingSource = existsSync(this.#path(path))
          ? this.readText(path).source
          : '{"schemaVersion":"1.0.0","rules":[]}\n';
        const document = JSON.parse(existingSource) as {
          rules: Array<{ a: string; b: string; response: string }>;
        };
        document.rules ??= [];
        const a = stringValue(args.a, 'a');
        const b = stringValue(args.b, 'b');
        const response = stringValue(args.response, 'response');
        if (!['block', 'event', 'overlap', 'ignore'].includes(response)) {
          throw new ProjectError(
            'WORKSPACE_COLLISION_RESPONSE_INVALID',
            `不支持的碰撞响应：${response}`,
          );
        }
        const existing = document.rules.find(
          (rule) =>
            (rule.a === a && rule.b === b) || (rule.a === b && rule.b === a),
        );
        if (existing) existing.response = response;
        else document.rules.push({ a, b, response });
        const content = `${JSON.stringify(document, null, 2)}\n`;
        this.#mutate(
          `定义碰撞 ${a} × ${b}`,
          [
            {
              path,
              content: existsSync(this.#path(path)) ? existingSource : null,
            },
          ],
          [{ path, content }],
        );
        changed = true;
        message = `已定义 ${a} × ${b} = ${response}`;
        break;
      }
      case 'runtime.start':
      case 'test.run':
      case 'runtime.run_replay': {
        const scene = stringValue(
          args.scene ?? this.snapshot().entryScene,
          'scene',
        );
        const sceneDocument = JSON.parse(
          readFileSync(this.#path(scene), 'utf8'),
        ) as { schemaVersion?: string };
        if (sceneDocument.schemaVersion === '2.0.0-alpha.1') {
          const options = this.#runtimeOptions(command, args, scene);
          const startedAt = performance.now();
          const result =
            command === 'runtime.start'
              ? (() => {
                  this.#stopRuntimeLoop();
                  return this.#runtimeSession.start(options);
                })()
              : this.#scriptRuntime.run(options);
          this.#lastRuntimeResult = result;
          this.#captureProjectRuntime(
            result,
            performance.now() - startedAt,
            command === 'runtime.start' && result.status === 'completed'
              ? 'running'
              : undefined,
          );
          if (
            command === 'runtime.start' &&
            result.status === 'completed' &&
            args.continuous !== false
          ) {
            this.#startRuntimeLoop();
          }
          data = result;
          if (command === 'test.run' && options.testFile)
            persistRuntimeTestReport(this.#root, options.testFile, result);
          message =
            result.status === 'failed'
              ? `运行失败：${result.diagnostics[0]?.message ?? '未知脚本错误'}`
              : command === 'test.run'
                ? options.assertions?.length || options.expectedHashes?.length
                  ? `项目 TypeScript 测试通过：${result.tick} Tick，${options.assertions?.length ?? 0} 个状态断言 / ${options.expectedHashes?.length ?? 0} 个哈希断言`
                  : `项目 TypeScript 冒烟运行完成：${result.tick} Tick（未配置行为断言）`
                : `项目 TypeScript 已运行 ${result.tick} Tick`;
        } else {
          const replay = stringValue(
            args.replay ?? 'replays/smoke.input.json',
            'replay',
          );
          this.#runtime.status = 'running';
          let replayPath = this.#path(replay);
          if (command === 'runtime.start' && args.seed !== undefined) {
            const seed = integer(args.seed, 'seed');
            if (seed < 0) {
              throw new ProjectError(
                'WORKSPACE_SEED_INVALID',
                'seed 必须是非负整数。',
              );
            }
            const input = JSON.parse(
              readFileSync(replayPath, 'utf8'),
            ) as Record<string, unknown>;
            input.seed = seed;
            replayPath = join(
              this.#root,
              '.aigame',
              'local',
              'preview.input.json',
            );
            writeFileSync(replayPath, `${JSON.stringify(input, null, 2)}\n`);
          }
          data = this.#runKernel(['run', this.#path(scene), replayPath]);
          this.#captureRuntime(data, 'completed');
          message =
            command === 'test.run'
              ? `旧版 Example 回归通过：${replay}`
              : `旧版 Example 已运行 ${replay}`;
        }
        break;
      }
      case 'runtime.stop':
        this.#stopRuntimeLoop();
        if (this.#runtimeSession.generation > 0) this.#runtimeSession.stop();
        this.#lastRuntimeResult = null;
        this.#runtime = {
          status: 'stopped',
          sessionId: this.#runtimeSession.sessionId,
          generation: this.#runtimeSession.generation,
          sequence: this.#runtimeSession.sequence,
          tick: 0,
          seed: this.#runtime.seed,
          stateHash: null,
          durationMs: null,
        };
        this.#publishRuntime();
        message = '已停止预览会话。';
        break;
      case 'runtime.pause':
        if (this.#runtime.status === 'stopped') {
          throw new ProjectError(
            'WORKSPACE_RUNTIME_NOT_STARTED',
            '请先运行一次预览。',
          );
        }
        this.#stopRuntimeLoop();
        if (this.#runtimeSession.generation > 0) this.#runtimeSession.pause();
        this.#runtime.status = 'paused';
        this.#runtime.sequence = this.#runtimeSession.sequence;
        this.#publishRuntime();
        message = `已在 Tick ${this.#runtime.tick} 暂停。`;
        break;
      case 'runtime.resume': {
        if (this.#runtimeSession.generation === 0) {
          throw new ProjectError(
            'WORKSPACE_RUNTIME_NOT_STARTED',
            '请先运行一次预览。',
          );
        }
        const startedAt = performance.now();
        const result = this.#runtimeSession.resume(
          args.ticks === undefined ? 1 : integer(args.ticks, 'ticks'),
        );
        this.#lastRuntimeResult = result;
        this.#captureProjectRuntime(
          result,
          performance.now() - startedAt,
          result.status === 'completed' ? 'running' : undefined,
        );
        if (result.status === 'completed') this.#startRuntimeLoop();
        data = result;
        message = `已从 Tick ${this.#runtime.tick} 继续播放。`;
        break;
      }
      case 'runtime.restart': {
        this.#stopRuntimeLoop();
        const startedAt = performance.now();
        const result = this.#runtimeSession.restart(
          args.ticks === undefined ? undefined : integer(args.ticks, 'ticks'),
        );
        this.#lastRuntimeResult = result;
        this.#captureProjectRuntime(
          result,
          performance.now() - startedAt,
          result.status === 'completed' ? 'running' : undefined,
        );
        if (result.status === 'completed') this.#startRuntimeLoop();
        data = result;
        message = `已重新启动 Runtime Session，第 ${this.#runtimeSession.generation} 代。`;
        break;
      }
      case 'runtime.input': {
        const receipt = this.queueRuntimeInput(args);
        data = receipt;
        message = `已把 ${receipt.action} 输入排入 Tick ${receipt.tick}。`;
        break;
      }
      case 'runtime.advance_ticks': {
        const sessionId = stringValue(args.sessionId, 'sessionId');
        const generation = integer(args.generation, 'generation');
        const expectedTick = integer(args.expectedTick, 'expectedTick');
        const ticks = integer(args.ticks, 'ticks');
        if (
          sessionId !== this.#runtimeSession.sessionId ||
          generation !== this.#runtimeSession.generation ||
          expectedTick !== this.#runtimeSession.tick
        ) {
          throw new ProjectError(
            'RUNTIME_CHECKPOINT_CONFLICT',
            'Runtime Session、Generation 或 Tick 冲突；请重新读取状态，勿重复推进。',
          );
        }
        const startedAt = performance.now();
        let result: ProjectRuntimeResult;
        try {
          result = this.#runtimeSession.advancePaused(ticks);
        } catch (error) {
          if (this.#runtimeSession.state === 'failed') {
            this.#runtime.status = 'failed';
            this.#runtime.sequence = this.#runtimeSession.sequence;
            this.#publishRuntime();
          }
          throw error;
        }
        this.#lastRuntimeResult = result;
        this.#captureProjectRuntime(
          result,
          performance.now() - startedAt,
          result.status === 'failed' ? 'failed' : 'paused',
        );
        data = result;
        message =
          result.status === 'failed'
            ? `有界推进在 Tick ${result.tick} 失败；请查看诊断后重启。`
            : `已从 Tick ${expectedTick} 有界推进到 ${result.tick}，会话保持暂停。`;
        break;
      }
      case 'runtime.export_input_log': {
        if (
          args.sessionId !== this.#runtimeSession.sessionId ||
          args.generation !== this.#runtimeSession.generation ||
          args.expectedTick !== this.#runtimeSession.tick
        )
          throw new ProjectError(
            'RUNTIME_CHECKPOINT_CONFLICT',
            '导出要求匹配当前 Session、Generation 和 Tick。',
          );
        data = saveRuntimeInputLog(
          this.#root,
          this.#runtimeSession.exportInputLog(),
        );
        message = '已导出内容寻址的完整输入记录，未修改游戏权威文件。';
        break;
      }
      case 'runtime.step_tick': {
        const scene = stringValue(
          args.scene ?? this.snapshot().entryScene,
          'scene',
        );
        const sceneDocument = JSON.parse(
          readFileSync(this.#path(scene), 'utf8'),
        ) as { schemaVersion?: string };
        if (sceneDocument.schemaVersion === '2.0.0-alpha.1') {
          this.#stopRuntimeLoop();
          const startedAt = performance.now();
          const result =
            this.#runtimeSession.generation === 0
              ? (() => {
                  const started = this.#runtimeSession.start({
                    ...this.#runtimeOptions('runtime.start', args, scene),
                    ticks: 1,
                    breakpoints: [],
                  });
                  this.#runtimeSession.pause();
                  return started;
                })()
              : this.#runtimeSession.step();
          result.status = result.status === 'failed' ? 'failed' : 'paused';
          this.#lastRuntimeResult = result;
          this.#captureProjectRuntime(
            result,
            performance.now() - startedAt,
            result.status,
          );
          data = result;
        } else {
          const replayPath = stringValue(
            args.replay ?? 'replays/smoke.input.json',
            'replay',
          );
          const input = JSON.parse(
            readFileSync(this.#path(replayPath), 'utf8'),
          ) as {
            seed: number;
            ticks: number;
            commands: Array<{ tick: number }>;
          };
          const nextTick = Math.min(
            Math.max(2, this.#runtime.tick + 1),
            input.ticks,
          );
          const stepped = {
            ...input,
            ticks: nextTick,
            commands: input.commands.filter((item) => item.tick <= nextTick),
          };
          const stagedReplay = join(
            this.#root,
            '.aigame',
            'local',
            'step.input.json',
          );
          writeFileSync(stagedReplay, `${JSON.stringify(stepped, null, 2)}\n`);
          data = this.#runKernel(['run', this.#path(scene), stagedReplay]);
          this.#captureRuntime(data, 'paused');
        }
        message = `已单步执行到 Tick ${this.#runtime.tick}`;
        break;
      }
      case 'runtime.read_trace':
        data = this.#lastRuntimeResult;
        message = this.#lastRuntimeResult
          ? '已读取最新 Runtime trace。'
          : '尚无 Runtime trace。';
        break;
      case 'runtime.capture_frame': {
        const observation = this.#captureRuntimeObservation(args);
        this.#runtime.latestObservation = structuredClone(observation);
        this.#publishRuntime();
        data = observation;
        message = `已捕获 ${observation.checkpointId} 的可寻址运行帧 ${observation.observationId}。`;
        break;
      }
      case 'runtime.navigate_checkpoint': {
        const scene = stringValue(
          args.scene ?? this.snapshot().entryScene,
          'scene',
        );
        const checkpoint = stringValue(args.checkpointId, 'checkpointId');
        const options = this.#runtimeOptions('runtime.start', args, scene);
        if (
          args.bounded === true &&
          (!Number.isSafeInteger(options.ticks) || (options.ticks ?? 0) > 10000)
        )
          throw new ProjectError(
            'RUNTIME_REPLAY_TICKS_INVALID',
            '有界对照只接受 1–10000 Tick；更长路线请拆为独立验收。',
          );
        this.#stopRuntimeLoop();
        const startedAt = performance.now();
        let result = this.#runtimeSession.start({
          ...options,
          ...(args.bounded === true
            ? { ticks: Math.min(200, options.ticks ?? 1) }
            : {}),
          persistTrace: true,
        });
        if (args.bounded === true) {
          const audioEvents = [...result.audioEvents];
          while (
            result.status === 'completed' &&
            result.tick < (options.ticks ?? 1)
          ) {
            this.#runtimeSession.pause();
            result = this.#runtimeSession.advancePaused(
              Math.min(200, (options.ticks ?? 1) - result.tick),
            );
            audioEvents.push(...result.audioEvents);
          }
          result.audioEvents = audioEvents;
        }
        this.#lastRuntimeResult = result;
        this.#captureProjectRuntime(
          result,
          performance.now() - startedAt,
          result.status === 'completed' ? 'paused' : result.status,
        );
        if (result.status !== 'failed') this.#runtimeSession.pause();
        const observation = this.#captureRuntimeObservation({
          ...args,
          checkpointId: checkpoint,
        });
        this.#runtime.latestObservation = structuredClone(observation);
        this.#publishRuntime();
        data = { result, observation };
        message = `已确定性导航到 ${observation.checkpointId}，Tick ${result.tick}。`;
        break;
      }
      case 'runtime.observation.read': {
        const id = stringValue(args.observationId, 'observationId');
        data = this.#runtimeObservations.read(id);
        message = `已读取运行观察 ${id}。`;
        break;
      }
      case 'runtime.observation.compare': {
        const left = this.#runtimeObservations.read(
          stringValue(args.leftObservationId, 'leftObservationId'),
        );
        const right = this.#runtimeObservations.read(
          stringValue(args.rightObservationId, 'rightObservationId'),
        );
        data = this.#runtimeObservations.compare(left, right);
        message = `已比较 ${left.observationId} 与 ${right.observationId}。`;
        break;
      }
      case 'runtime.hot_reload': {
        this.#stopRuntimeLoop();
        if (this.#runtimeSession.generation > 0) {
          const report = this.#runtimeSession.hotReload();
          this.#lastRuntimeResult = this.#runtimeSession.result;
          if (this.#lastRuntimeResult) {
            this.#captureProjectRuntime(
              this.#lastRuntimeResult,
              0,
              this.#runtimeSession.state === 'playing' ? 'running' : 'paused',
            );
          }
          data = report;
          message = `热重载已${report.outcome === 'restarted' ? '重启权威状态' : '仅替换展示状态'}：Generation ${report.previousGeneration} → ${report.generation}。`;
        } else {
          const compiled = this.#scriptRuntime.compile();
          data = {
            policy: compiled.manifest.hotReload ?? 'restart-authoritative',
            outcome: 'compiled-no-session',
            bundle: compiled.metadata,
          };
          message = '脚本已重新编译；当前没有运行中的权威状态。';
        }
        break;
      }
      case 'debug.breakpoint.set': {
        const breakpoint: RuntimeBreakpoint = {
          id: stringValue(args.id, 'id'),
          enabled: args.enabled === undefined ? true : Boolean(args.enabled),
          moduleId:
            args.moduleId === undefined
              ? undefined
              : stringValue(args.moduleId, 'moduleId'),
          systemId:
            args.systemId === undefined
              ? undefined
              : stringValue(args.systemId, 'systemId'),
          objectId:
            args.objectId === undefined
              ? undefined
              : stringValue(args.objectId, 'objectId'),
          hook:
            args.hook === undefined
              ? undefined
              : stringValue(args.hook, 'hook'),
          line:
            args.line === undefined ? undefined : integer(args.line, 'line'),
          column:
            args.column === undefined
              ? undefined
              : integer(args.column, 'column'),
        };
        this.#breakpoints = [
          ...this.#breakpoints.filter((item) => item.id !== breakpoint.id),
          breakpoint,
        ];
        data = structuredClone(this.#breakpoints);
        message = `已设置断点 ${breakpoint.id}`;
        break;
      }
      case 'debug.breakpoint.remove': {
        const id = stringValue(args.id, 'id');
        this.#breakpoints = this.#breakpoints.filter((item) => item.id !== id);
        data = structuredClone(this.#breakpoints);
        message = `已移除断点 ${id}`;
        break;
      }
      case 'debug.watch.set': {
        const path = stringValue(args.path, 'path');
        if (!this.#watches.includes(path)) this.#watches.push(path);
        data = structuredClone(this.#watches);
        message = `已监视 ${path}`;
        break;
      }
      case 'debug.watch.remove': {
        const path = stringValue(args.path, 'path');
        this.#watches = this.#watches.filter((item) => item !== path);
        data = structuredClone(this.#watches);
        message = `已移除监视 ${path}`;
        break;
      }
      case 'history.undo':
        this.#undo();
        changed = true;
        message = '已撤销最近事务。';
        break;
      case 'history.redo':
        this.#redo();
        changed = true;
        message = '已重做最近事务。';
        break;
      default:
        if ((SCENE_AUTHORING_COMMANDS as readonly string[]).includes(command)) {
          const mutation = this.#authoring.mutate(command, args);
          for (const file of mutation.after) {
            if (file.content !== null)
              this.#validateCandidate(file.path, file.content);
          }
          this.#mutate(mutation.label, mutation.before, mutation.after);
          changed = true;
          message = mutation.message;
          data = mutation.data;
          break;
        }
        throw new ProjectError(
          'WORKSPACE_COMMAND_UNKNOWN',
          `未知 Studio 命令：${command}`,
        );
    }
    return {
      command,
      changed,
      message,
      data,
      snapshot: this.snapshot(),
    };
  }

  applyApprovedFiles(
    label: string,
    files: Array<{ path: string; content: Buffer | null }>,
  ): void {
    if (!label.trim() || files.length === 0)
      throw new ProjectError(
        'WORKSPACE_APPROVED_FILES_INVALID',
        '已审批文件事务需要标签和至少一个文件。',
      );
    const paths = new Set<string>();
    const before: FileState[] = [];
    const after: FileState[] = [];
    for (const file of files) {
      if (paths.has(file.path))
        throw new ProjectError(
          'WORKSPACE_APPROVED_FILES_DUPLICATE',
          `已审批事务包含重复路径：${file.path}`,
        );
      paths.add(file.path);
      const target = this.#path(file.path, true);
      before.push(
        existsSync(target)
          ? {
              path: file.path,
              content: readFileSync(target).toString('base64'),
              encoding: 'base64',
            }
          : { path: file.path, content: null },
      );
      after.push(
        file.content
          ? {
              path: file.path,
              content: file.content.toString('base64'),
              encoding: 'base64',
            }
          : { path: file.path, content: null },
      );
    }
    this.#mutate(label.trim(), before, after);
  }

  captureExternalRuntimeObservation(input: {
    result: ProjectRuntimeResult;
    source: 'studio' | 'player';
    checkpointId: string;
    inputLogId?: string;
    viewport?: readonly [number, number];
    assetRoot?: string;
    rendererExecutablePath?: string;
    reachableAssetPaths?: ReadonlySet<string>;
    audioBuses?: Array<{ id: string; volume: number; muted: boolean }>;
  }): RuntimeObservation {
    return this.#runtimeObservations.captureResult(input.result, {
      source: input.source,
      checkpointId: input.checkpointId,
      sessionId: input.result.renderSnapshot.sessionId,
      generation: input.result.renderSnapshot.generation,
      ...(input.inputLogId ? { inputLogId: input.inputLogId } : {}),
      ...(input.viewport ? { viewport: input.viewport } : {}),
      ...(input.assetRoot ? { assetRoot: input.assetRoot } : {}),
      ...(input.rendererExecutablePath
        ? { rendererExecutablePath: input.rendererExecutablePath }
        : {}),
      ...(input.reachableAssetPaths
        ? { reachableAssetPaths: input.reachableAssetPaths }
        : {}),
      ...(input.audioBuses ? { audioBuses: input.audioBuses } : {}),
    });
  }

  captureExternalRuntimeSnapshot(input: {
    snapshot: ProjectRuntimeResult['renderSnapshot'];
    scene: SceneDocument;
    audioEvents?: ProjectRuntimeResult['audioEvents'];
    runtimeDiagnostics?: ProjectRuntimeResult['debugSnapshot']['payload']['diagnostics'];
    source: 'studio' | 'player';
    checkpointId: string;
    tick: number;
    stateHash: string;
    inputLogId?: string;
    viewport?: readonly [number, number];
    assetRoot?: string;
    rendererExecutablePath?: string;
    reachableAssetPaths?: ReadonlySet<string>;
    audioBuses?: Array<{ id: string; volume: number; muted: boolean }>;
  }): RuntimeObservation {
    return this.#runtimeObservations.capture({
      source: input.source,
      checkpointId: input.checkpointId,
      snapshot: input.snapshot,
      scene: input.scene,
      sessionId: input.snapshot.sessionId,
      generation: input.snapshot.generation,
      tick: input.tick,
      stateHash: input.stateHash,
      ...(input.inputLogId ? { inputLogId: input.inputLogId } : {}),
      ...(input.viewport ? { viewport: input.viewport } : {}),
      ...(input.assetRoot ? { assetRoot: input.assetRoot } : {}),
      ...(input.rendererExecutablePath
        ? { rendererExecutablePath: input.rendererExecutablePath }
        : {}),
      ...(input.reachableAssetPaths
        ? { reachableAssetPaths: input.reachableAssetPaths }
        : {}),
      ...(input.audioEvents ? { audioEvents: input.audioEvents } : {}),
      ...(input.runtimeDiagnostics
        ? { runtimeDiagnostics: input.runtimeDiagnostics }
        : {}),
      ...(input.audioBuses ? { audioBuses: input.audioBuses } : {}),
    });
  }

  compareRuntimeObservations(
    left: RuntimeObservation,
    right: RuntimeObservation,
  ) {
    return this.#runtimeObservations.compare(left, right);
  }

  #listFiles(): WorkspaceFile[] {
    const git = new Map<string, WorkspaceFile['gitStatus']>();
    const status = spawnSync(
      'git',
      ['status', '--porcelain=v1', '--untracked-files=all'],
      { cwd: this.#root, encoding: 'utf8', windowsHide: true, timeout: 5_000 },
    );
    if (status.status === 0) {
      for (const line of status.stdout.split(/\r?\n/u)) {
        if (line.length < 4) continue;
        const code = line.slice(0, 2);
        const rawPath = line.slice(3).split(' -> ').at(-1) ?? '';
        const path = rawPath.replace(/^"|"$/gu, '').replaceAll('\\', '/');
        const conflicted = ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(
          code,
        );
        const state: WorkspaceFile['gitStatus'] = conflicted
          ? 'conflicted'
          : code === '??'
            ? 'untracked'
            : code.includes('R')
              ? 'renamed'
              : code.includes('D')
                ? 'deleted'
                : code.includes('A')
                  ? 'added'
                  : 'modified';
        git.set(path, state);
      }
    }
    const ai = new Map<string, WorkspaceFile['aiActivity']>();
    const changesRoot = join(this.#root, '.aigame', 'local', 'changes');
    if (existsSync(changesRoot)) {
      for (const name of readdirSync(changesRoot)) {
        try {
          const change = JSON.parse(
            readFileSync(join(changesRoot, name), 'utf8'),
          ) as {
            status?: string;
            files?: Array<{ path?: string }>;
          };
          const activity =
            change.status === 'approved'
              ? 'approved'
              : change.status === 'awaitingApproval'
                ? 'proposed'
                : null;
          if (activity) {
            for (const file of change.files ?? []) {
              if (file.path) ai.set(file.path, activity);
            }
          }
        } catch {
          // Invalid ChangeSets are reported by their own service; never hide files.
        }
      }
    }
    const walk = (directory: string): WorkspaceFile[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name))
          return [];
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return walk(path);
        const projectPath = this.#relative(path);
        let diagnosticCount = 0;
        if (extname(path).toLowerCase() === '.json') {
          try {
            JSON.parse(readFileSync(path, 'utf8'));
          } catch {
            diagnosticCount = 1;
          }
        }
        return [
          {
            path: projectPath,
            kind: kindFor(projectPath),
            size: statSync(path).size,
            gitStatus: git.get(projectPath) ?? 'clean',
            diagnosticCount,
            aiActivity: ai.get(projectPath) ?? 'none',
          },
        ];
      });
    return walk(this.#root).sort((left, right) =>
      left.path.localeCompare(right.path),
    );
  }

  #validate(path: string): unknown {
    const source = this.readText(this.#relative(this.#path(path))).source;
    const value = JSON.parse(source) as {
      schemaVersion?: string;
      objects?: unknown;
    };
    if (
      value.schemaVersion === '2.0.0-alpha.1' &&
      Array.isArray(value.objects)
    ) {
      return this.#validateSceneDocument(value as SceneDocument);
    }
    return this.#runKernel(['validate', this.#path(path)]);
  }

  #validateCandidate(path: string, content: string): void {
    if (extname(path) === '.json') JSON.parse(content);
    if (path === 'capabilities/components.json') {
      const custom = parseProjectComponents(content);
      const manifest = readProjectManifest(
        join(this.#root, 'project.aigame.json'),
      );
      const builtIn = new Set(
        capabilitiesFor(manifest.capabilities).flatMap((capability) =>
          capability.components.map((component) => component.type),
        ),
      );
      const collision = custom.find((component) => builtIn.has(component.type));
      if (collision)
        throw new ProjectError(
          'COMPONENT_TYPE_COLLISION',
          `项目 Component 与内置 type 冲突：${collision.type}`,
        );
      return;
    }
    if (!path.endsWith('.game.json') && !path.endsWith('.scene.json')) return;
    const value = JSON.parse(content) as {
      schemaVersion?: string;
      objects?: unknown;
    };
    if (
      value.schemaVersion === '2.0.0-alpha.1' &&
      Array.isArray(value.objects)
    ) {
      this.#validateSceneDocument(value as SceneDocument);
      return;
    }
    const stage = join(
      this.#root,
      '.aigame',
      'local',
      `validate-${randomUUID()}.game.json`,
    );
    writeFileSync(stage, content, 'utf8');
    try {
      this.#runKernel(['validate', stage]);
    } finally {
      rmSync(stage, { force: true });
    }
  }

  #validateSceneDocument(scene: SceneDocument): {
    ok: true;
    kind: string;
    scene: string;
    objects: number;
  } {
    const ids = new Set<string>();
    for (const object of scene.objects) {
      if (ids.has(object.id))
        throw new ProjectError(
          'SCENE_ID_DUPLICATE',
          `对象 ID 重复：${object.id}`,
        );
      ids.add(object.id);
    }
    for (const object of scene.objects) {
      if (object.parentId && !ids.has(object.parentId))
        throw new ProjectError(
          'SCENE_PARENT_NOT_FOUND',
          `父对象不存在：${object.parentId}`,
        );
    }
    return {
      ok: true,
      kind: 'aigame/scene',
      scene: scene.id,
      objects: scene.objects.length,
    };
  }

  #runKernel(args: string[]): unknown {
    if (!existsSync(this.#kernelCliPath)) {
      throw new ProjectError(
        'WORKSPACE_KERNEL_MISSING',
        'Studio 安装中缺少 kernelctl。',
      );
    }
    const startedAt = performance.now();
    const result = spawnSync(this.#kernelCliPath, args, {
      cwd: this.#root,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 60_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    let response: unknown;
    try {
      response = JSON.parse(result.stdout);
    } catch {
      response = { ok: false, stdout: result.stdout, stderr: result.stderr };
    }
    if (result.status !== 0) {
      throw new ProjectError(
        'WORKSPACE_KERNEL_COMMAND_FAILED',
        '内核命令失败。',
        response,
      );
    }
    return response && typeof response === 'object' && !Array.isArray(response)
      ? {
          ...(response as Record<string, unknown>),
          performance: { durationMs: performance.now() - startedAt },
        }
      : response;
  }

  #runGit(args: string[], code: string): string {
    const result = spawnSync('git', args, {
      cwd: this.#root,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: MAX_TEXT_BYTES,
    });
    if (result.status !== 0) {
      throw new ProjectError(
        code,
        result.stderr.trim() || result.stdout.trim() || 'Git 命令失败。',
        { args, status: result.status },
      );
    }
    return result.stdout;
  }

  #runtimeOptions(
    command: 'runtime.start' | 'test.run' | 'runtime.run_replay',
    args: Record<string, unknown>,
    scene: string,
  ): RunProjectOptions {
    let replay: Partial<RunProjectOptions> = {};
    let replayPath: string | null = null;
    let testFile: string | undefined;
    let assertions: RuntimeTestAssertion[] = [];
    if (command === 'runtime.run_replay') {
      replayPath = stringValue(
        args.replay ?? 'replays/smoke.input.json',
        'replay',
      );
    } else if (command === 'test.run') {
      const discovered = this.#listFiles().filter(
        (file) => file.kind === 'test',
      );
      if (args.test === undefined && discovered.length === 0)
        throw new ProjectError(
          'TEST_SUITE_EMPTY',
          '项目中没有可运行的测试；不会把零测试报告为通过。',
        );
      if (args.test === undefined && discovered.length > 1)
        throw new ProjectError(
          'TEST_SELECTION_REQUIRED',
          '项目包含多个测试，请由测试面板逐项运行或指定 test 路径。',
          { tests: discovered.map((file) => file.path) },
        );
      const testPath = stringValue(args.test ?? discovered[0]?.path, 'test');
      if (kindFor(testPath) !== 'test')
        throw new ProjectError(
          'TEST_FILE_NOT_RUNNABLE',
          '请选择 .test.json 测试定义；场景 fixture 不是可运行测试。',
        );
      testFile = testPath;
      if (!existsSync(this.#path(testPath)))
        throw new ProjectError('TEST_FILE_MISSING', `测试不存在：${testPath}`);
      if (existsSync(this.#path(testPath))) {
        const test = JSON.parse(
          readFileSync(this.#path(testPath), 'utf8'),
        ) as Partial<Omit<RunProjectOptions, 'assertions'>> & {
          replay?: string;
          assertions?: unknown;
        };
        const {
          replay: testReplay,
          assertions: rawAssertions,
          ...testOptions
        } = test;
        replayPath = testReplay ?? null;
        replay = testOptions;
        assertions = parseRuntimeAssertions(rawAssertions);
      }
    } else if (args.replay !== undefined) {
      replayPath = stringValue(args.replay, 'replay');
    }
    if (replayPath) {
      if (!existsSync(this.#path(replayPath)))
        throw new ProjectError(
          'SCRIPT_REPLAY_MISSING',
          `Replay 不存在：${replayPath}`,
        );
      replay = {
        ...replay,
        ...(JSON.parse(
          readFileSync(this.#path(replayPath), 'utf8'),
        ) as Partial<RunProjectOptions>),
      };
    }
    const ticksValue =
      args.ticks ?? replay.ticks ?? (command === 'runtime.start' ? 60 : 1);
    const seedValue = args.seed ?? replay.seed ?? this.#runtime.seed;
    const ticks = integer(ticksValue, 'ticks');
    const seed = integer(seedValue, 'seed');
    if (ticks < 1 || seed < 0)
      throw new ProjectError(
        'SCRIPT_RUNTIME_RANGE_INVALID',
        'ticks 必须大于零，seed 必须为非负整数。',
      );
    return {
      ...replay,
      ...(command === 'test.run' ? { assertions, testFile } : {}),
      scene:
        args.scene === undefined && typeof replay.scene === 'string'
          ? replay.scene
          : scene,
      ticks,
      seed,
      commands: (args.commands ??
        replay.commands ??
        []) as RunProjectOptions['commands'],
      inputs: (args.inputs ??
        replay.inputs ??
        []) as RunProjectOptions['inputs'],
      controls: (args.controls ??
        replay.controls ??
        []) as RunProjectOptions['controls'],
      expectedHashes: (args.expectedHashes ??
        replay.expectedHashes ??
        []) as RunProjectOptions['expectedHashes'],
      breakpoints: this.#breakpoints,
      watches: this.#watches,
    };
  }

  #captureRuntimeObservation(
    args: Record<string, unknown>,
  ): RuntimeObservation {
    const checkpoint =
      args.checkpointId === undefined
        ? `tick-${this.#runtime.tick}`
        : stringValue(args.checkpointId, 'checkpointId');
    const width =
      args.width === undefined ? 1280 : integer(args.width, 'width');
    const height =
      args.height === undefined ? 720 : integer(args.height, 'height');
    if (width < 1 || height < 1 || width > 4096 || height > 4096) {
      throw new ProjectError(
        'RUNTIME_OBSERVATION_VIEWPORT_INVALID',
        '观察视口宽高必须在 1–4096 之间。',
      );
    }
    const inputLog =
      args.inputLogId === undefined
        ? undefined
        : stringValue(args.inputLogId, 'inputLogId');
    const workspace = this.snapshot();
    const common = {
      source: 'studio' as const,
      checkpointId: checkpoint,
      sessionId: this.#runtimeSession.sessionId,
      generation: Math.max(1, this.#runtimeSession.generation),
      ...(inputLog ? { inputLogId: inputLog } : {}),
      viewport: [width, height] as const,
      audioBuses: workspace.audioBuses ?? [],
    };
    if (this.#lastRuntimeResult && args.projectState !== true) {
      return this.#runtimeObservations.captureResult(this.#lastRuntimeResult, {
        ...common,
      });
    }
    const scenePath = stringValue(
      args.scene ?? workspace.activeScene ?? workspace.entryScene,
      'scene',
    );
    const scene = JSON.parse(
      readFileSync(this.#path(scenePath), 'utf8'),
    ) as SceneDocument;
    const snapshot = projectSceneToRenderSnapshot({
      scene,
      assets: workspace.assets,
      sessionId: this.#runtimeSession.sessionId,
      generation: Math.max(1, this.#runtimeSession.generation),
      sequence: this.#runtimeSession.sequence,
      tick: this.#runtime.tick,
    });
    return this.#runtimeObservations.capture({
      ...common,
      snapshot,
      scene,
      tick: this.#runtime.tick,
      stateHash: runtimeStateHash(scene),
    });
  }

  #captureProjectRuntime(
    result: ProjectRuntimeResult,
    durationMs: number,
    statusOverride?: WorkspaceSnapshot['runtime']['status'],
  ): void {
    const latestObservation =
      this.#runtime.latestObservation?.sessionId ===
        result.renderSnapshot.sessionId &&
      this.#runtime.latestObservation.generation ===
        result.renderSnapshot.generation
        ? this.#runtime.latestObservation
        : undefined;
    this.#runtime = {
      status: statusOverride ?? result.status,
      sessionId: this.#runtimeSession.sessionId,
      generation: this.#runtimeSession.generation,
      sequence: this.#runtimeSession.sequence,
      tick: result.tick,
      seed: result.seed,
      activeScene: result.activeScene,
      stateHash: result.stateHash,
      durationMs,
      memoryUsedBytes: result.budgets.memoryUsedBytes,
      operations: result.budgets.operations,
      events: result.timeline.filter((entry) => entry.kind === 'event:emit')
        .length,
      diagnostics: result.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        severity: diagnostic.severity,
        message: diagnostic.message,
        tick: diagnostic.tick,
        phase: diagnostic.phase,
        systemId: diagnostic.systemId,
        objectId: diagnostic.objectId,
        moduleId: diagnostic.moduleId,
        file: diagnostic.file,
        line: diagnostic.line,
        column: diagnostic.column,
      })),
      timeline: structuredClone(result.timeline),
      systemTrace: structuredClone(result.systemTrace),
      watches: structuredClone(result.watches),
      pausedAt: structuredClone(result.pausedAt),
      renderSnapshot: structuredClone(result.renderSnapshot),
      debugSnapshot: structuredClone(result.debugSnapshot),
      audioEvents: structuredClone(result.audioEvents),
      ...(latestObservation
        ? { latestObservation: structuredClone(latestObservation) }
        : {}),
    };
    this.#publishRuntime();
  }

  #captureRuntime(
    data: unknown,
    status: WorkspaceSnapshot['runtime']['status'],
  ): void {
    const envelope = data as {
      result?: {
        snapshot?: { tick?: unknown; stateHash?: unknown; seed?: unknown };
      };
      performance?: { durationMs?: unknown };
    };
    const snapshot = envelope.result?.snapshot;
    this.#runtime = {
      status,
      sessionId: this.#runtimeSession.sessionId,
      generation: this.#runtimeSession.generation,
      sequence: this.#runtimeSession.sequence,
      tick: typeof snapshot?.tick === 'number' ? snapshot.tick : 0,
      seed:
        typeof snapshot?.seed === 'number' ? snapshot.seed : this.#runtime.seed,
      stateHash:
        typeof snapshot?.stateHash === 'string' ? snapshot.stateHash : null,
      durationMs:
        typeof envelope.performance?.durationMs === 'number'
          ? envelope.performance.durationMs
          : null,
    };
    this.#publishRuntime();
  }

  #startRuntimeLoop(): void {
    if (this.#runtimeTimer) return;
    this.#runtimeTimer = setInterval(() => {
      if (this.#runtimeSession.state !== 'playing') return;
      const startedAt = performance.now();
      try {
        const result = this.#runtimeSession.advance(1);
        this.#lastRuntimeResult = result;
        this.#captureProjectRuntime(
          result,
          performance.now() - startedAt,
          result.status === 'completed' ? 'running' : undefined,
        );
        if (result.status !== 'completed') this.#stopRuntimeLoop();
      } catch (reason) {
        this.#stopRuntimeLoop();
        this.#runtime = {
          ...this.#runtime,
          status: 'failed',
          durationMs: performance.now() - startedAt,
          diagnostics: [
            {
              code:
                reason instanceof ProjectError
                  ? reason.code
                  : 'RUNTIME_SESSION_ADVANCE_FAILED',
              severity: 'error',
              message:
                reason instanceof Error ? reason.message : String(reason),
              tick: this.#runtime.tick,
              phase: 'engine:host',
              systemId: null,
              objectId: null,
              moduleId: null,
              file: 'scripts/runtime.json',
              line: 1,
              column: 1,
            },
          ],
        };
        this.#publishRuntime();
      }
    }, 50);
    this.#runtimeTimer.unref();
  }

  #stopRuntimeLoop(): void {
    if (!this.#runtimeTimer) return;
    clearInterval(this.#runtimeTimer);
    this.#runtimeTimer = null;
  }

  #publishRuntime(): void {
    this.#runtimeObserver?.(structuredClone(this.#runtime));
  }

  #mutate(label: string, before: FileState[], after: FileState[]): void {
    const entry: HistoryEntry = {
      id: randomUUID(),
      label,
      createdAt: new Date().toISOString(),
      before,
      after,
    };
    this.#writePending({ schemaVersion: '1.0.0', phase: 'prepared', entry });
    this.#applyStates(after);
    this.#writePending({ schemaVersion: '1.0.0', phase: 'applied', entry });
    this.#history.entries = this.#history.entries.slice(
      0,
      this.#history.cursor,
    );
    this.#history.entries.push(entry);
    this.#history.cursor = this.#history.entries.length;
    this.#saveHistory();
    rmSync(this.#pendingPath, { force: true });
  }

  #undo(): void {
    if (this.#history.cursor === 0) {
      throw new ProjectError('WORKSPACE_NOTHING_TO_UNDO', '没有可撤销事务。');
    }
    const entry = this.#history.entries[this.#history.cursor - 1];
    this.#applyStates(entry.before);
    this.#history.cursor -= 1;
    this.#saveHistory();
  }

  #redo(): void {
    if (this.#history.cursor >= this.#history.entries.length) {
      throw new ProjectError('WORKSPACE_NOTHING_TO_REDO', '没有可重做事务。');
    }
    const entry = this.#history.entries[this.#history.cursor];
    this.#applyStates(entry.after);
    this.#history.cursor += 1;
    this.#saveHistory();
  }

  #applyStates(states: FileState[]): void {
    for (const state of states) {
      const target = this.#path(state.path, true);
      if (state.content === null) {
        rmSync(target, { force: true });
        continue;
      }
      mkdirSync(dirname(target), { recursive: true });
      const temporary = join(dirname(target), `.${randomUUID()}.aigame-tmp`);
      writeFileSync(temporary, state.content, state.encoding ?? 'utf8');
      // Readers in the owner Studio remain active while MCP applies a
      // ChangeSet. Never move the canonical file aside: that creates an
      // ENOENT interval for resource and completion-state polling. History
      // already preserves the before image for transaction recovery.
      try {
        renameSync(temporary, target);
      } catch (error) {
        rmSync(temporary, { force: true });
        throw error;
      }
    }
  }

  #loadHistory(): HistoryFile {
    if (!existsSync(this.#historyPath)) {
      return { schemaVersion: '1.0.0', cursor: 0, entries: [] };
    }
    try {
      const history = JSON.parse(
        readFileSync(this.#historyPath, 'utf8'),
      ) as HistoryFile;
      if (
        history.schemaVersion === '1.0.0' &&
        Array.isArray(history.entries) &&
        Number.isSafeInteger(history.cursor) &&
        history.cursor >= 0 &&
        history.cursor <= history.entries.length
      ) {
        return history;
      }
    } catch {
      // Replaceable local editor history may be rebuilt without touching sources.
    }
    return { schemaVersion: '1.0.0', cursor: 0, entries: [] };
  }

  #recoverPending(): void {
    if (!existsSync(this.#pendingPath)) return;
    const pending = JSON.parse(
      readFileSync(this.#pendingPath, 'utf8'),
    ) as PendingTransaction;
    if (pending.phase === 'prepared') {
      this.#applyStates(pending.entry.before);
    } else if (
      !this.#history.entries.some((entry) => entry.id === pending.entry.id)
    ) {
      this.#history.entries = this.#history.entries.slice(
        0,
        this.#history.cursor,
      );
      this.#history.entries.push(pending.entry);
      this.#history.cursor = this.#history.entries.length;
      this.#saveHistory();
    }
    rmSync(this.#pendingPath, { force: true });
  }

  #saveHistory(): void {
    this.#atomicJson(this.#historyPath, this.#history);
  }

  #writePending(pending: PendingTransaction): void {
    this.#atomicJson(this.#pendingPath, pending);
  }

  #atomicJson(path: string, value: unknown): void {
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    if (existsSync(path)) copyFileSync(temporary, path);
    else renameSync(temporary, path);
    rmSync(temporary, { force: true });
  }

  #historySummary(): WorkspaceHistorySummary {
    return {
      canUndo: this.#history.cursor > 0,
      canRedo: this.#history.cursor < this.#history.entries.length,
      undoLabel:
        this.#history.cursor > 0
          ? this.#history.entries[this.#history.cursor - 1].label
          : null,
      redoLabel:
        this.#history.cursor < this.#history.entries.length
          ? this.#history.entries[this.#history.cursor].label
          : null,
      transactionCount: this.#history.entries.length,
    };
  }

  #path(relativePath: string, allowLocal = false): string {
    if (
      !relativePath ||
      isAbsolute(relativePath) ||
      relativePath.includes('\\') ||
      relativePath.split('/').includes('..') ||
      (!allowLocal && relativePath.startsWith('.aigame/'))
    ) {
      throw new ProjectError(
        'WORKSPACE_PATH_INVALID',
        `路径不在可编辑项目空间：${relativePath}`,
      );
    }
    const path = resolve(this.#root, relativePath);
    const fromRoot = relative(this.#root, path);
    if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
      throw new ProjectError('WORKSPACE_PATH_ESCAPE', '路径逃逸项目目录。');
    }
    return path;
  }

  #relative(path: string): string {
    return relative(this.#root, path).replaceAll('\\', '/');
  }
}
