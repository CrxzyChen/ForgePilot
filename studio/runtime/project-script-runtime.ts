import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import ts from 'typescript';
import { runtimeProjectRevision } from './runtime-input-log.ts';

import { capabilitiesForProject } from '../capabilities/capability-registry.ts';
import { readProjectManifest } from '../project/project-schema.ts';
import { ProjectError } from '../project/project-types.ts';
import type { SceneDocument } from '../workspace/scene-authoring-service.ts';
import type { PrefabDocument } from '../workspace/scene-authoring-service.ts';
import {
  evaluateRuntimeAssertions,
  parseRuntimeAssertions,
  type RuntimeTestAssertion,
} from './runtime-test-assertions.ts';
import {
  RUNTIME_PROTOCOL_VERSION,
  type RuntimeAudioEvent,
  type RuntimeDebugSnapshot,
  type RuntimeRenderSnapshot,
  type RuntimeSessionId,
} from './runtime-session-protocol.ts';

export type ScriptModuleKind =
  | 'behavior'
  | 'system'
  | 'event-handler'
  | 'library';

export type ScriptRuntimeManifest = {
  schemaVersion: '2.0.0-alpha.1';
  sdkVersion: string;
  modules: Array<{ id: string; kind: ScriptModuleKind; source: string }>;
  systems: Array<{
    id: string;
    module: string;
    export: string;
    phase: string;
    order: number;
    query: string[];
  }>;
  commands: MessageDeclaration[];
  events: MessageDeclaration[];
  schedule: string[];
  budgets: {
    memoryBytes: number;
    stackBytes: number;
    instructionsPerTick: number;
    eventsPerTick: number;
  };
  hotReload?: 'restart-authoritative' | 'preserve-presentation';
};

type MessageDeclaration = {
  id: string;
  payloadSchema: string;
  documentation?: string;
};

export type RuntimeCommand = {
  tick: number;
  type: string;
  payload: Record<string, unknown>;
};

export type RuntimeInput = { tick: number; action: string; value: number };
export type RuntimePhysicsContact = {
  key: string;
  space: '2d' | '3d';
  objectA: string;
  colliderA: string;
  objectB: string;
  colliderB: string;
  sensor: boolean;
  normal: [number, number] | [number, number, number];
  contacts: Array<[number, number] | [number, number, number]>;
  impulse: number;
};
export type RuntimePhysicsEvent = RuntimePhysicsContact & {
  phase: 'enter' | 'stay' | 'exit';
  tick: number;
};
export type RuntimeControl = {
  tick: number;
  action: 'disable' | 'destroy';
  objectId: string;
};
export type RuntimeBreakpoint = {
  id: string;
  enabled?: boolean;
  moduleId?: string;
  systemId?: string;
  objectId?: string;
  hook?: string;
  line?: number;
  column?: number;
};

export type RuntimeDiagnostic = {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  tick: number;
  phase: string;
  systemId: string | null;
  objectId: string | null;
  moduleId: string | null;
  file: string;
  line: number;
  column: number;
  stack: string;
  state: unknown;
};

export type ProjectRuntimeResult = {
  status: 'completed' | 'paused' | 'failed';
  tick: number;
  seed: number;
  activeScene: string;
  scene: SceneDocument;
  stateHash: string;
  timeline: Array<Record<string, unknown>>;
  systemTrace: Array<Record<string, unknown>>;
  diagnostics: RuntimeDiagnostic[];
  snapshots: Array<{
    tick: number;
    activeScene: string;
    scene: SceneDocument;
    stateHash: string;
  }>;
  watches: Array<{ tick: number; path: string; value?: unknown }>;
  pausedAt: Record<string, unknown> | null;
  randomState: number;
  pendingEvents: Array<Record<string, unknown>>;
  pendingLifecycle: Array<Record<string, unknown>>;
  physicsContacts: RuntimePhysicsContact[];
  physicsEvents: RuntimePhysicsEvent[];
  audioEvents: RuntimeAudioEvent[];
  renderSnapshot: RuntimeRenderSnapshot;
  debugSnapshot: RuntimeDebugSnapshot;
  budgets: {
    operations: number;
    events: number;
    memoryUsedBytes: number;
    memoryLimitBytes: number;
  };
  bundle: {
    schemaVersion: '1.0.0';
    sdkVersion: string;
    engineCompatibility: '>=0.2.0-alpha.1 <0.3.0';
    compiler: 'typescript-5.9-es2022-commonjs';
    moduleHashes: Record<string, string>;
    sourceMapHashes: Record<string, string>;
    outputHash: string;
  };
};

export type RunProjectOptions = {
  scene?: string;
  sceneState?: SceneDocument;
  activeScene?: string;
  startTick?: number;
  started?: boolean;
  randomState?: number;
  pendingEvents?: Array<Record<string, unknown>>;
  pendingLifecycle?: Array<Record<string, unknown>>;
  physicsContacts?: RuntimePhysicsContact[];
  sessionId?: RuntimeSessionId;
  generation?: number;
  sequence?: number;
  ticks?: number;
  seed?: number;
  commands?: RuntimeCommand[];
  inputs?: RuntimeInput[];
  controls?: RuntimeControl[];
  breakpoints?: RuntimeBreakpoint[];
  watches?: string[];
  expectedHashes?: Array<{ tick: number; stateHash: string }>;
  assertions?: RuntimeTestAssertion[];
  testFile?: string;
  persistTrace?: boolean;
};

type JsonSchema = Record<string, unknown>;

function sha256(source: string | Buffer): string {
  return createHash('sha256').update(source).digest('hex');
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function projectPath(root: string, path: string): string {
  const target = resolve(root, path);
  const inside = relative(root, target);
  if (!inside || inside.startsWith('..') || inside.includes(':')) {
    throw new ProjectError(
      'SCRIPT_PROJECT_PATH_INVALID',
      `脚本运行时路径必须位于项目内：${path}`,
    );
  }
  return target;
}

function readJson<T>(root: string, path: string): T {
  const target = projectPath(root, path);
  if (!existsSync(target)) {
    throw new ProjectError('SCRIPT_FILE_MISSING', `项目文件不存在：${path}`);
  }
  try {
    return JSON.parse(readFileSync(target, 'utf8')) as T;
  } catch (reason) {
    throw new ProjectError(
      'SCRIPT_JSON_INVALID',
      `JSON 无法解析：${path}`,
      String(reason),
    );
  }
}

function validatePayload(
  value: unknown,
  schema: JsonSchema,
  path = '$',
): string[] {
  const issues: string[] = [];
  if (schema.const !== undefined && value !== schema.const)
    issues.push(`${path} 必须等于 ${JSON.stringify(schema.const)}`);
  if (Array.isArray(schema.enum) && !schema.enum.includes(value))
    issues.push(`${path} 不在允许值中`);
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      issues.push(`${path} 必须是对象`);
      return issues;
    }
    const record = value as Record<string, unknown>;
    for (const key of Array.isArray(schema.required) ? schema.required : []) {
      if (typeof key === 'string' && !(key in record))
        issues.push(`${path}.${key} 为必填字段`);
    }
    const properties =
      schema.properties && typeof schema.properties === 'object'
        ? (schema.properties as Record<string, JsonSchema>)
        : {};
    for (const [key, child] of Object.entries(record)) {
      if (properties[key])
        issues.push(
          ...validatePayload(child, properties[key], `${path}.${key}`),
        );
      else if (schema.additionalProperties === false)
        issues.push(`${path}.${key} 是未声明字段`);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) issues.push(`${path} 必须是数组`);
    else if (schema.items && typeof schema.items === 'object')
      value.forEach((child, index) =>
        issues.push(
          ...validatePayload(
            child,
            schema.items as JsonSchema,
            `${path}[${index}]`,
          ),
        ),
      );
  } else if (schema.type === 'string' && typeof value !== 'string') {
    issues.push(`${path} 必须是字符串`);
  } else if (schema.type === 'number' && typeof value !== 'number') {
    issues.push(`${path} 必须是数字`);
  } else if (
    schema.type === 'integer' &&
    (typeof value !== 'number' || !Number.isInteger(value))
  ) {
    issues.push(`${path} 必须是整数`);
  } else if (schema.type === 'boolean' && typeof value !== 'boolean') {
    issues.push(`${path} 必须是布尔值`);
  }
  return issues;
}

function validateManifest(manifest: ScriptRuntimeManifest): void {
  if (
    manifest.schemaVersion !== '2.0.0-alpha.1' ||
    !manifest.sdkVersion ||
    !Array.isArray(manifest.modules) ||
    !Array.isArray(manifest.systems) ||
    !Array.isArray(manifest.schedule) ||
    manifest.schedule.length === 0
  ) {
    throw new ProjectError(
      'SCRIPT_RUNTIME_MANIFEST_INVALID',
      'scripts/runtime.json 不符合 2.0 Alpha 运行时契约。',
    );
  }
  const moduleIds = new Set(manifest.modules.map((module) => module.id));
  if (moduleIds.size !== manifest.modules.length)
    throw new ProjectError(
      'SCRIPT_MODULE_DUPLICATE',
      '脚本 module id 不能重复。',
    );
  const systemIds = new Set<string>();
  for (const system of manifest.systems) {
    if (!moduleIds.has(system.module))
      throw new ProjectError(
        'SCRIPT_SYSTEM_MODULE_MISSING',
        `System ${system.id} 引用了不存在的 module ${system.module}。`,
      );
    if (!manifest.schedule.includes(system.phase))
      throw new ProjectError(
        'SCRIPT_SYSTEM_PHASE_INVALID',
        `System ${system.id} 的 phase 不在 schedule 中。`,
      );
    if (systemIds.has(system.id))
      throw new ProjectError(
        'SCRIPT_SYSTEM_DUPLICATE',
        `System id 重复：${system.id}`,
      );
    systemIds.add(system.id);
  }
}

function componentValueMatches(type: string, value: unknown): boolean {
  if (type === 'number')
    return typeof value === 'number' && Number.isFinite(value);
  if (type === 'string' || type === 'color' || type === 'resource')
    return typeof value === 'string';
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'vec2' || type === 'vec3') {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return false;
    const vector = value as Record<string, unknown>;
    const axes = type === 'vec3' ? ['x', 'y', 'z'] : ['x', 'y'];
    return axes.every(
      (axis) =>
        typeof vector[axis] === 'number' && Number.isFinite(vector[axis]),
    );
  }
  return false;
}

export class ProjectScriptRuntime {
  readonly #root: string;
  readonly #hostPath: string;
  #executionRevision: string | null = null;

  get executionRevision(): string | null {
    return this.#executionRevision;
  }
  // Derived, instance-local cache: re-read and hash source on every compile.
  // Retain only the latest successful output for each currently listed source.
  readonly #moduleCache = new Map<
    string,
    {
      sourceHash: string;
      code: string;
      sourceMapHash: string;
    }
  >();

  constructor(options: { projectRoot: string; scriptHostPath: string }) {
    this.#root = resolve(options.projectRoot);
    this.#hostPath = resolve(options.scriptHostPath);
  }

  projectRevision(): string {
    return runtimeProjectRevision(this.#root);
  }

  startupScene(): string {
    const scene = readJson<{ startupScene: string | null }>(
      this.#root,
      'settings/project.json',
    ).startupScene;
    if (!scene)
      throw new ProjectError(
        'SCRIPT_STARTUP_SCENE_MISSING',
        '项目没有 startup Scene。',
      );
    return scene;
  }

  compile(): {
    manifest: ScriptRuntimeManifest;
    modules: Array<{
      id: string;
      kind: ScriptModuleKind;
      source: string;
      code: string;
    }>;
    metadata: ProjectRuntimeResult['bundle'];
  } {
    const settings = readJson<{ scriptRuntime: string }>(
      this.#root,
      'settings/project.json',
    );
    const manifest = readJson<ScriptRuntimeManifest>(
      this.#root,
      settings.scriptRuntime,
    );
    validateManifest(manifest);
    const currentSources = new Set(
      manifest.modules.map((module) => module.source),
    );
    for (const path of this.#moduleCache.keys()) {
      if (!currentSources.has(path)) this.#moduleCache.delete(path);
    }
    const moduleHashes: Record<string, string> = {};
    const sourceMapHashes: Record<string, string> = {};
    const modules = manifest.modules.map((module) => {
      const source = readFileSync(
        projectPath(this.#root, module.source),
        'utf8',
      );
      const sourceHash = sha256(source);
      const cached = this.#moduleCache.get(module.source);
      if (cached?.sourceHash === sourceHash) {
        moduleHashes[module.id] = sourceHash;
        sourceMapHashes[module.id] = cached.sourceMapHash;
        return { ...module, code: cached.code };
      }
      const transpiled = ts.transpileModule(source, {
        fileName: module.source,
        reportDiagnostics: true,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
          strict: true,
          sourceMap: true,
          inlineSources: true,
          esModuleInterop: false,
        },
      });
      const errors = (transpiled.diagnostics ?? []).filter(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
      );
      if (errors.length > 0) {
        throw new ProjectError(
          'SCRIPT_COMPILE_FAILED',
          `${module.source} 编译失败。`,
          errors.map((diagnostic) => ({
            code: diagnostic.code,
            message: ts.flattenDiagnosticMessageText(
              diagnostic.messageText,
              '\n',
            ),
            line: diagnostic.file?.getLineAndCharacterOfPosition(
              diagnostic.start ?? 0,
            ).line,
          })),
        );
      }
      const code = transpiled.outputText.replace(
        /\/\/# sourceMappingURL=.*$/gmu,
        '',
      );
      moduleHashes[module.id] = sourceHash;
      const sourceMapHash = sha256(transpiled.sourceMapText ?? '');
      sourceMapHashes[module.id] = sourceMapHash;
      this.#moduleCache.set(module.source, { sourceHash, code, sourceMapHash });
      return { ...module, code };
    });
    const outputHash = sha256(canonical(modules));
    return {
      manifest,
      modules,
      metadata: {
        schemaVersion: '1.0.0',
        sdkVersion: manifest.sdkVersion,
        engineCompatibility: '>=0.2.0-alpha.1 <0.3.0',
        compiler: 'typescript-5.9-es2022-commonjs',
        moduleHashes,
        sourceMapHashes,
        outputHash,
      },
    };
  }

  run(options: RunProjectOptions = {}): ProjectRuntimeResult {
    if (!existsSync(this.#hostPath)) {
      throw new ProjectError(
        'SCRIPT_HOST_MISSING',
        'Studio 安装缺少 project-script-host 原生运行时。',
        this.#hostPath,
      );
    }
    const settings = readJson<{
      startupScene: string | null;
      tickRate: number;
    }>(this.#root, 'settings/project.json');
    const scenePath = options.scene ?? settings.startupScene;
    if (!scenePath)
      throw new ProjectError(
        'SCRIPT_STARTUP_SCENE_MISSING',
        '项目没有 startup Scene。',
      );
    const scene = options.sceneState
      ? structuredClone(options.sceneState)
      : readJson<SceneDocument>(this.#root, scenePath);
    const project = readProjectManifest(
      join(this.#root, 'project.aigame.json'),
    );
    const assetManifest = readJson<{
      assets?: Array<{
        id: string;
        path: string;
        kind: string;
        status?: string;
        sha256: string;
        derivedHash?: string;
        variant?: string;
      }>;
    }>(this.#root, 'assets/asset-manifest.json');
    const assets = assetManifest.assets ?? [];
    this.#validateRuntimeResources(scene, assets);
    const sceneDirectory = projectPath(this.#root, project.paths.scenes);
    const scenes = Object.fromEntries(
      (readdirSync(sceneDirectory, { recursive: true }) as string[])
        .filter((name) => name.endsWith('.json'))
        .sort((left, right) => left.localeCompare(right))
        .map((name) => {
          const path = `${project.paths.scenes}/${name.replaceAll('\\', '/')}`;
          return [path, readJson<SceneDocument>(this.#root, path)];
        }),
    );
    const prefabDirectory = projectPath(this.#root, 'prefabs');
    const prefabs = existsSync(prefabDirectory)
      ? Object.fromEntries(
          (readdirSync(prefabDirectory, { recursive: true }) as string[])
            .filter((name) => name.endsWith('.json'))
            .sort((left, right) => left.localeCompare(right))
            .map((name) => {
              const path = `prefabs/${name.replaceAll('\\', '/')}`;
              const prefab = readJson<PrefabDocument>(this.#root, path);
              this.#validateRuntimeResources(
                {
                  schemaVersion: '2.0.0-alpha.1',
                  id: `${prefab.id}/resource-validation`,
                  name: prefab.name,
                  space: scene.space,
                  objects: prefab.objects,
                },
                assets,
              );
              return [path, prefab];
            }),
        )
      : {};
    const activeScene = options.activeScene ?? scenePath;
    // The live world is supplied separately as `scene`. loadScene (including
    // same-scene restart) must use authored defaults, not the resumed world.
    if (!scenes[activeScene]) {
      scenes[activeScene] = readJson<SceneDocument>(this.#root, activeScene);
    }
    const compiled = this.compile();
    // Reuse already-read authoring inputs. Do not hash every image/audio file
    // again on each live Tick merely to maintain the replay recording guard.
    this.#executionRevision = sha256(
      canonical({
        project,
        settings,
        prefabs,
        assets,
        manifest: compiled.manifest,
        modules: compiled.metadata.moduleHashes,
        scenes: Object.fromEntries(
          Object.entries(scenes).filter(([path]) =>
            path.startsWith(`${project.paths.scenes}/`),
          ),
        ),
        initialScene: readJson<SceneDocument>(this.#root, scenePath),
      }),
    );
    this.#validateMessages(
      options.commands ?? [],
      compiled.manifest.commands,
      'Command',
    );
    const ticks = options.ticks ?? 1;
    if (!Number.isSafeInteger(ticks) || ticks < 1 || ticks > 100_000)
      throw new ProjectError(
        'SCRIPT_TICK_COUNT_INVALID',
        'ticks 必须是 1 到 100000 的整数。',
      );
    const request = {
      scene,
      scenes,
      prefabs,
      activeScene,
      manifest: compiled.manifest,
      modules: compiled.modules,
      assets,
      tickRate: settings.tickRate,
      ticks,
      seed: options.seed ?? 0,
      startTick: options.startTick ?? 0,
      started: options.started ?? false,
      randomState: options.randomState,
      pendingEvents: options.pendingEvents ?? [],
      pendingLifecycle: options.pendingLifecycle ?? [],
      sessionId: options.sessionId ?? 'session:standalone',
      generation: options.generation ?? 1,
      sequence: options.sequence ?? 0,
      commands: options.commands ?? [],
      inputs: options.inputs ?? [],
      physicsContacts: options.physicsContacts ?? [],
      controls: options.controls ?? [],
      breakpoints: options.breakpoints ?? [],
      watches: options.watches ?? [],
    };
    const startedAt = performance.now();
    const child = spawnSync(this.#hostPath, [], {
      cwd: this.#root,
      input: JSON.stringify({
        request,
        memoryBytes: compiled.manifest.budgets.memoryBytes,
        stackBytes: compiled.manifest.budgets.stackBytes,
      }),
      encoding: 'utf8',
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    if (child.status !== 0) {
      const quickJsTimeout = /script\.project\.timeout/u.test(
        child.stderr ?? '',
      );
      throw new ProjectError(
        child.signal || quickJsTimeout
          ? 'SCRIPT_HOST_TIMEOUT'
          : 'SCRIPT_HOST_FAILED',
        child.signal || quickJsTimeout
          ? quickJsTimeout
            ? '项目脚本超过 25 秒 QuickJS 执行上限。'
            : '项目脚本超过 30 秒宿主进程上限。'
          : '项目脚本宿主执行失败。',
        { stdout: child.stdout, stderr: child.stderr, signal: child.signal },
      );
    }
    let envelope: {
      result: Omit<ProjectRuntimeResult, 'stateHash' | 'bundle' | 'budgets'> & {
        budgets: { operations: number; events: number };
        snapshots: Array<{
          tick: number;
          activeScene: string;
          scene: SceneDocument;
        }>;
      };
      memoryUsedBytes: number;
    };
    try {
      envelope = JSON.parse(child.stdout) as typeof envelope;
    } catch (reason) {
      throw new ProjectError(
        'SCRIPT_HOST_RESPONSE_INVALID',
        '脚本宿主返回了无效响应。',
        String(reason),
      );
    }
    const result = envelope.result as ProjectRuntimeResult;
    result.snapshots = envelope.result.snapshots.map((snapshot) => ({
      ...snapshot,
      stateHash: sha256(canonical(snapshot.scene)),
    }));
    result.stateHash = sha256(canonical(result.scene));
    result.bundle = compiled.metadata;
    result.budgets = {
      ...envelope.result.budgets,
      memoryUsedBytes: envelope.memoryUsedBytes,
      memoryLimitBytes: compiled.manifest.budgets.memoryBytes,
    };
    evaluateRuntimeAssertions(
      result,
      parseRuntimeAssertions(options.assertions),
      options.testFile ?? 'tests/runtime.test.json',
    );
    result.debugSnapshot = {
      protocolVersion: RUNTIME_PROTOCOL_VERSION,
      kind: 'debug.snapshot',
      sessionId: options.sessionId ?? 'session:standalone',
      generation: options.generation ?? 1,
      sequence: options.sequence ?? 0,
      tick: Math.max(0, result.tick),
      payload: {
        stateHash: result.stateHash,
        diagnostics: result.diagnostics.map((diagnostic) => ({
          code: diagnostic.code,
          severity: diagnostic.severity,
          message: diagnostic.message,
          tick: diagnostic.tick,
          phase: diagnostic.phase as `${string}:${string}`,
          systemId: (diagnostic.systemId ?? undefined) as
            | `${string}:${string}`
            | undefined,
          moduleId: (diagnostic.moduleId ?? undefined) as
            | `${string}:${string}`
            | undefined,
          objectId: (diagnostic.objectId ?? undefined) as
            | `${string}:${string}`
            | undefined,
          projectPath: diagnostic.file,
          line: diagnostic.line,
          column: diagnostic.column,
        })),
        watches: Object.fromEntries(
          result.watches.map((watch) => [watch.path, watch.value]),
        ),
        systemTrace: structuredClone(result.systemTrace),
        budgets: {
          memoryBytes: envelope.memoryUsedBytes,
          instructions: result.budgets.operations,
          events: result.budgets.events,
        },
      },
    };
    this.#validateSceneState(result.scene);
    this.#validateMessages(
      result.timeline
        .filter((entry) => entry.kind === 'event:emit')
        .map((entry) => ({
          tick: Number(entry.tick),
          type: String(entry.type),
          payload: (entry.payload ?? {}) as Record<string, unknown>,
        })),
      compiled.manifest.events,
      'Event',
    );
    for (const expected of options.expectedHashes ?? []) {
      const actual = result.snapshots.find(
        (snapshot) => snapshot.tick === expected.tick,
      );
      if (!actual || actual.stateHash !== expected.stateHash) {
        result.status = 'failed';
        result.diagnostics.push({
          code: 'REPLAY_HASH_MISMATCH',
          severity: 'error',
          message: `Tick ${expected.tick} 状态哈希不一致：期望 ${expected.stateHash}，实际 ${actual?.stateHash ?? 'missing'}。`,
          tick: expected.tick,
          phase: 'engine:snapshot',
          systemId: null,
          objectId: null,
          moduleId: null,
          file: 'replays/replay.json',
          line: 1,
          column: 1,
          stack: '',
          state: actual?.scene ?? null,
        });
      }
    }
    result.timeline.push({
      tick: result.tick,
      phase: 'engine:host',
      kind: 'profile',
      durationMs: performance.now() - startedAt,
      memoryUsedBytes: envelope.memoryUsedBytes,
    });
    if (options.persistTrace !== false) this.#persist(result);
    return result;
  }

  #validateMessages(
    messages: RuntimeCommand[],
    declarations: MessageDeclaration[],
    label: 'Command' | 'Event',
  ): void {
    for (const message of messages) {
      const declaration = declarations.find(
        (candidate) => candidate.id === message.type,
      );
      if (!declaration)
        throw new ProjectError(
          `SCRIPT_${label.toUpperCase()}_UNDECLARED`,
          `${label} 未在 scripts/runtime.json 声明：${message.type}`,
        );
      const schema = readJson<JsonSchema>(
        this.#root,
        declaration.payloadSchema,
      );
      const issues = validatePayload(message.payload, schema);
      if (issues.length > 0)
        throw new ProjectError(
          `SCRIPT_${label.toUpperCase()}_PAYLOAD_INVALID`,
          `${label} ${message.type} payload 不符合 Schema。`,
          issues,
        );
    }
  }

  #validateSceneState(scene: SceneDocument): void {
    const manifest = readProjectManifest(
      join(this.#root, 'project.aigame.json'),
    );
    const descriptors = capabilitiesForProject(
      this.#root,
      manifest.capabilities,
    ).flatMap((capability) => capability.components);
    for (const object of scene.objects) {
      for (const component of object.components) {
        const descriptor = descriptors.find(
          (candidate) => candidate.type === component.type,
        );
        if (!descriptor)
          throw new ProjectError(
            'SCRIPT_COMPONENT_UNDECLARED',
            `脚本输出了未声明 Component：${component.type}`,
            { objectId: object.id, componentId: component.id },
          );
        const fields = new Map(
          descriptor.fields.map((field) => [field.name, field]),
        );
        for (const [name, value] of Object.entries(component.data)) {
          const field = fields.get(name);
          if (!field)
            throw new ProjectError(
              'SCRIPT_COMPONENT_FIELD_UNDECLARED',
              `脚本写入了未声明字段：${component.type}.${name}`,
              { objectId: object.id, componentId: component.id },
            );
          if (!componentValueMatches(field.type, value))
            throw new ProjectError(
              'SCRIPT_COMPONENT_FIELD_INVALID',
              `脚本写入字段类型错误：${component.type}.${name}`,
              { objectId: object.id, componentId: component.id, value },
            );
        }
      }
    }
  }

  #validateRuntimeResources(
    scene: SceneDocument,
    assets: Array<{
      id: string;
      path: string;
      status?: string;
      sha256: string;
    }>,
  ): void {
    for (const object of scene.objects) {
      for (const component of object.components) {
        if (
          component.enabled === false ||
          !['render:sprite2d', 'ui:image'].includes(component.type)
        )
          continue;
        const texture = component.data.texture;
        if (typeof texture !== 'string' || !texture) {
          throw new ProjectError(
            'RUNTIME_SPRITE_TEXTURE_REQUIRED',
            `Sprite2D ${component.id} 缺少 texture 资源引用。`,
            { objectId: object.id, componentId: component.id },
          );
        }
        const asset = assets.find(
          (candidate) => candidate.id === texture || candidate.path === texture,
        );
        if (!asset || asset.status !== 'ready') {
          throw new ProjectError(
            'RUNTIME_RESOURCE_REFERENCE_MISSING',
            `Sprite2D ${component.id} 引用了不可用资源：${texture}`,
            { objectId: object.id, componentId: component.id, texture },
          );
        }
        const path = projectPath(this.#root, asset.path);
        if (!existsSync(path)) {
          throw new ProjectError(
            'RUNTIME_RESOURCE_FILE_MISSING',
            `资源清单存在，但文件缺失：${asset.path}`,
            {
              objectId: object.id,
              componentId: component.id,
              assetId: asset.id,
            },
          );
        }
        const actual = sha256(readFileSync(path));
        if (actual !== asset.sha256) {
          throw new ProjectError(
            'RUNTIME_RESOURCE_HASH_MISMATCH',
            `资源哈希与清单不一致：${asset.path}`,
            { assetId: asset.id, expected: asset.sha256, actual },
          );
        }
      }
    }
  }

  #persist(result: ProjectRuntimeResult): void {
    const path = join(this.#root, '.aigame', 'local', 'runtime', 'latest.json');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
}
