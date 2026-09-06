import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { readProjectManifest } from '../project/project-schema.ts';
import { ProjectError } from '../project/project-types.ts';
import { ProjectScriptRuntime } from '../runtime/project-script-runtime.ts';
import { runtimeProjectRevision } from '../runtime/runtime-input-log.ts';
import {
  readPackageVerification,
  verifyGamePackage,
} from './game-package-verification.ts';
import type { SceneDocument } from './scene-authoring-service.ts';

export type GameBuildProfile = 'development' | 'release';

export type GameBuildReport = {
  ok: true;
  kind: 'ai-game-kernel/game-build';
  profile: GameBuildProfile;
  projectId: string;
  projectRevision?: string;
  gameVersion: string;
  engineVersion: string;
  target: 'windows-x86_64';
  packageName: string;
  outputDirectory: string;
  executable: string;
  zipPath: string;
  zipSha256: string | null;
  fileCount: number;
  reproducibleCoreHash: string;
  files: Record<string, string>;
  excludedClasses: string[];
  diagnosticsIncluded: boolean;
  signing: 'unsigned-portable-mvp';
  reachability: {
    scenes: string[];
    prefabs: string[];
    scripts: string[];
    assets: string[];
    orphanedAssets: string[];
  };
  diagnostics: Array<{
    code: string;
    severity: 'warning' | 'info';
    path: string;
    message: string;
  }>;
};

type PlayerPackagePreparation = {
  payload: Record<string, unknown>;
  reachableAssets: Set<string>;
  reachability: GameBuildReport['reachability'];
};

export type StudioGameBuildServiceOptions = {
  projectRoot: string;
  kernelCliPath?: string;
  runtimeExecutablePath: string;
  scriptHostPath?: string;
  engineVersion: string;
};

const EXCLUDED_CLASSES = [
  'Studio/Electron',
  'Codex/App Server',
  'AGENTS.md and project Skills',
  '.ai provider configuration and credentials',
  '.codex configuration',
  '.aigame cache/audit/recovery data',
  'tests and replays (Release)',
  'source-only and draft assets',
  'TypeScript source and source maps',
];

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? filesBelow(path) : [path];
    })
    .sort((left, right) => left.localeCompare(right));
}

function portableName(name: string): string {
  const value = name.replace(/[^a-zA-Z0-9_-]+/gu, '-').replace(/^-+|-+$/gu, '');
  return value || 'AI-Game';
}

function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(stringsIn);
  }
  return [];
}

export class StudioGameBuildService {
  readonly #root: string;
  readonly #runtimeExecutablePath: string;
  readonly #scriptRuntime: ProjectScriptRuntime;
  readonly #engineVersion: string;

  constructor(options: StudioGameBuildServiceOptions) {
    this.#root = resolve(options.projectRoot);
    this.#runtimeExecutablePath = resolve(options.runtimeExecutablePath);
    this.#scriptRuntime = new ProjectScriptRuntime({
      projectRoot: this.#root,
      scriptHostPath:
        options.scriptHostPath ??
        join(
          dirname(this.#runtimeExecutablePath),
          process.platform === 'win32'
            ? 'project-script-host.exe'
            : 'project-script-host',
        ),
    });
    this.#engineVersion = options.engineVersion;
  }

  execute(
    command: 'build.windows' | 'build.read_report' | 'release.package',
    input: { profile?: GameBuildProfile } = {},
  ): GameBuildReport {
    const profile: GameBuildProfile =
      command === 'release.package'
        ? 'release'
        : (input.profile ?? 'development');
    if (!['development', 'release'].includes(profile)) {
      throw new ProjectError(
        'BUILD_PROFILE_INVALID',
        '构建 profile 必须是 development 或 release。',
      );
    }
    if (command === 'build.read_report') return this.readReport(profile);
    return this.build(profile);
  }

  build(profile: GameBuildProfile): GameBuildReport {
    const projectRevision = runtimeProjectRevision(this.#root);
    if (!existsSync(this.#runtimeExecutablePath)) {
      throw new ProjectError(
        'BUILD_TOOLCHAIN_MISSING',
        'Studio 安装缺少通用 ai-game-player Runtime。',
      );
    }
    const manifest = readProjectManifest(
      join(this.#root, 'project.aigame.json'),
    );
    const buildConfigPath = join(
      this.#root,
      'build',
      `windows.${profile}.json`,
    );
    const fallbackConfigPath = join(
      this.#root,
      'build',
      'windows.release.json',
    );
    const configPath = existsSync(buildConfigPath)
      ? buildConfigPath
      : fallbackConfigPath;
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      version?: string;
    };
    const gameVersion = config.version ?? '0.1.0';
    const prepared = this.#playerPackage(
      manifest.id,
      manifest.name,
      gameVersion,
      manifest.entry.scene,
    );
    const playerPackage = prepared.payload;

    const packageName = `${portableName(manifest.name)}-${gameVersion}-${profile}-win-x64`;
    const profileRoot = this.#outputRoot(profile);
    const bundle = join(profileRoot, packageName);
    this.#assertOutput(bundle);
    mkdirSync(profileRoot, { recursive: true });
    rmSync(bundle, { recursive: true, force: true });
    mkdirSync(join(bundle, 'game'), { recursive: true });

    const executableName =
      profile === 'release'
        ? `${manifest.name}.exe`
        : `${manifest.name} Development.exe`;
    copyFileSync(this.#runtimeExecutablePath, join(bundle, executableName));
    writeFileSync(
      join(bundle, 'game', 'player-package.json'),
      `${JSON.stringify(playerPackage, null, 2)}\n`,
      'utf8',
    );
    this.#copyRuntimeAssets(bundle, prepared.reachableAssets);
    if (profile === 'development') {
      for (const directory of ['tests', 'replays']) {
        if (existsSync(join(this.#root, directory))) {
          cpSync(
            join(this.#root, directory),
            join(bundle, 'diagnostics', directory),
            { recursive: true },
          );
        }
      }
    }

    writeFileSync(
      join(bundle, 'THIRD-PARTY-NOTICES.txt'),
      'AI Game Kernel runtime: MIT OR Apache-2.0.\nwgpu, winit, serde and transitive Rust dependencies retain their upstream licenses.\nProject assets and Scene documents: project-owned or appropriately licensed content.\n',
      'utf8',
    );
    writeFileSync(
      join(bundle, 'SIGNING-LIMITATION.txt'),
      'This MVP Windows package is unsigned. Public distribution requires an organization code-signing certificate and installer reputation workflow.\n',
      'utf8',
    );
    writeFileSync(
      join(bundle, 'README.txt'),
      `${manifest.name}\n\nRun ${executableName}. Controls follow the game's authored input bindings and in-game help. Escape is a game action, not a forced exit. Close the window to exit; Q also exits when the project has not bound it. This portable player contains the generic wgpu renderer and sandboxed project script runtime. It does not require AI Game Studio, Codex, Node.js, Rust, source files, tests, credentials, or an engine checkout. Delete this folder to uninstall.\n`,
      'utf8',
    );
    this.#writeProvenance(bundle, prepared.reachableAssets);

    const payloadHashes = Object.fromEntries(
      filesBelow(bundle).map((path) => [
        relative(bundle, path).replaceAll('\\', '/'),
        sha256(path),
      ]),
    );
    const reproducibleCoreHash = createHash('sha256')
      .update(JSON.stringify(payloadHashes))
      .digest('hex');
    const report: GameBuildReport = {
      ok: true,
      kind: 'ai-game-kernel/game-build',
      profile,
      projectId: manifest.id,
      projectRevision,
      gameVersion,
      engineVersion: this.#engineVersion,
      target: 'windows-x86_64',
      packageName,
      outputDirectory: bundle,
      executable: executableName,
      zipPath: `${bundle}.zip`,
      zipSha256: null,
      fileCount: Object.keys(payloadHashes).length + 1,
      reproducibleCoreHash,
      files: payloadHashes,
      excludedClasses: EXCLUDED_CLASSES,
      diagnosticsIncluded: profile === 'development',
      signing: 'unsigned-portable-mvp',
      reachability: prepared.reachability,
      diagnostics: prepared.reachability.orphanedAssets.map((path) => ({
        code: 'BUILD_ASSET_ORPHANED',
        severity: 'warning' as const,
        path,
        message: `资源未从入口 Scene 到达，已从包中排除：${path}`,
      })),
    };
    writeFileSync(
      join(bundle, 'BUILD-MANIFEST.json'),
      `${JSON.stringify({ ...report, outputDirectory: '.', zipPath: `${packageName}.zip` }, null, 2)}\n`,
      'utf8',
    );
    this.#zip(bundle, report.zipPath);
    if (runtimeProjectRevision(this.#root) !== projectRevision)
      throw new ProjectError(
        'BUILD_REVISION_CONFLICT',
        '构建期间项目已改变，请重新构建。',
      );
    report.zipSha256 = sha256(report.zipPath);
    const reportRoot = join(this.#root, '.aigame', 'local', 'builds');
    mkdirSync(reportRoot, { recursive: true });
    writeFileSync(
      join(reportRoot, `${profile}.json`),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );
    return report;
  }

  readReport(profile: GameBuildProfile): GameBuildReport {
    const path = join(
      this.#root,
      '.aigame',
      'local',
      'builds',
      `${profile}.json`,
    );
    if (!existsSync(path))
      throw new ProjectError(
        'BUILD_REPORT_NOT_FOUND',
        `尚未运行 ${profile} 构建。`,
      );
    return JSON.parse(readFileSync(path, 'utf8')) as GameBuildReport;
  }

  verifyPackage(profile: GameBuildProfile, expectedZipSha256: string) {
    return verifyGamePackage({
      projectRoot: this.#root,
      runtimeExecutablePath: this.#runtimeExecutablePath,
      profile,
      expectedZipSha256,
    });
  }

  readVerification(id: string) {
    return readPackageVerification(this.#root, id);
  }

  #playerPackage(
    projectId: string,
    projectName: string,
    gameVersion: string,
    entryScene: string,
  ): PlayerPackagePreparation {
    let scene: SceneDocument;
    try {
      scene = JSON.parse(
        readFileSync(this.#projectPath(entryScene), 'utf8'),
      ) as SceneDocument;
    } catch (error) {
      throw new ProjectError(
        'BUILD_SCENE_INVALID',
        `启动 Scene 无法读取：${entryScene}`,
        String(error),
      );
    }
    if (
      scene.schemaVersion !== '2.0.0-alpha.1' ||
      !['2d', '3d', 'ui', 'mixed'].includes(scene.space) ||
      !Array.isArray(scene.objects)
    ) {
      throw new ProjectError(
        'BUILD_SCENE_INVALID',
        '启动 Scene 必须是 Round 03 通用 Scene 2.0 格式。',
      );
    }
    const compiled = this.#scriptRuntime.compile();
    const projectManifest = readProjectManifest(
      join(this.#root, 'project.aigame.json'),
    );
    const sceneRoot = this.#projectPath(projectManifest.paths.scenes);
    const scenes = Object.fromEntries(
      (readdirSync(sceneRoot, { recursive: true }) as string[])
        .filter((name) => name.endsWith('.json'))
        .sort((left, right) => left.localeCompare(right))
        .map((name) => {
          const path = `${projectManifest.paths.scenes}/${name.replaceAll('\\', '/')}`;
          return [
            path,
            JSON.parse(
              readFileSync(this.#projectPath(path), 'utf8'),
            ) as SceneDocument,
          ];
        }),
    );
    const projectSettings = JSON.parse(
      readFileSync(this.#projectPath('settings/project.json'), 'utf8'),
    ) as { tickRate?: number };
    let inputActions: Array<{ id: string; keys: string[] }> = [];
    const assets =
      (
        JSON.parse(
          readFileSync(this.#projectPath('assets/asset-manifest.json'), 'utf8'),
        ) as { assets?: Array<Record<string, unknown>> }
      ).assets ?? [];
    const inputPath = join(this.#root, 'input', 'actions.json');
    if (existsSync(inputPath)) {
      const input = JSON.parse(readFileSync(inputPath, 'utf8')) as {
        actions?: Array<{ id?: string; bindings?: string[] }>;
      };
      inputActions = (input.actions ?? []).flatMap((action) =>
        typeof action.id === 'string' && Array.isArray(action.bindings)
          ? [{ id: action.id, keys: action.bindings }]
          : [],
      );
    }
    const audioBusPath = join(this.#root, 'audio', 'buses.json');
    const audioBuses = existsSync(audioBusPath)
      ? ((
          JSON.parse(readFileSync(audioBusPath, 'utf8')) as {
            buses?: Array<{ id: string; volume: number; muted: boolean }>;
          }
        ).buses ?? [])
      : [{ id: 'audio:bus/master', volume: 1, muted: false }];
    const assetRecords = assets.flatMap((asset) => {
      const id = typeof asset.id === 'string' ? asset.id : null;
      const path = typeof asset.path === 'string' ? asset.path : null;
      return id && path ? [{ id, path, asset }] : [];
    });
    const prefabRoot = join(this.#root, 'prefabs');
    const prefabs = existsSync(prefabRoot)
      ? Object.fromEntries(
          (readdirSync(prefabRoot, { recursive: true }) as string[])
            .filter((name) => name.endsWith('.json'))
            .sort((left, right) => left.localeCompare(right))
            .map((name) => {
              const path = `prefabs/${name.replaceAll('\\', '/')}`;
              return [
                path,
                JSON.parse(
                  readFileSync(this.#projectPath(path), 'utf8'),
                ) as Record<string, unknown>,
              ];
            }),
        )
      : {};
    const reachableScenes = new Set([entryScene]);
    const reachablePrefabs = new Set<string>();
    const reachableScripts = new Set<string>();
    const reachableAssets = new Set<string>();
    for (const system of compiled.manifest.systems) {
      const declaration = compiled.manifest.modules.find(
        (module) => module.id === system.module,
      );
      if (declaration) reachableScripts.add(declaration.source);
    }
    const scan = (value: unknown) => {
      const values = new Set(stringsIn(value));
      for (const [path, document] of Object.entries(scenes)) {
        if (values.has(path) || values.has(document.id))
          reachableScenes.add(path);
      }
      for (const path of Object.keys(prefabs)) {
        if (values.has(path)) reachablePrefabs.add(path);
      }
      for (const moduleEntry of compiled.manifest.modules) {
        if (values.has(moduleEntry.source))
          reachableScripts.add(moduleEntry.source);
      }
      for (const asset of assetRecords) {
        if (values.has(asset.id) || values.has(asset.path)) {
          reachableAssets.add(asset.path);
        }
      }
    };
    const processedScenes = new Set<string>();
    const processedPrefabs = new Set<string>();
    const processedScripts = new Set<string>();
    let changed = true;
    while (changed) {
      changed = false;
      for (const path of [...reachableScenes].sort()) {
        if (processedScenes.has(path)) continue;
        const document = scenes[path];
        if (!document) {
          throw new ProjectError(
            'BUILD_REACHABLE_SCENE_MISSING',
            `可达 Scene 不存在：${path}`,
          );
        }
        processedScenes.add(path);
        scan(document);
        changed = true;
      }
      for (const path of [...reachablePrefabs].sort()) {
        if (processedPrefabs.has(path)) continue;
        const document = prefabs[path];
        if (!document) {
          throw new ProjectError(
            'BUILD_REACHABLE_PREFAB_MISSING',
            `可达 Prefab 不存在：${path}`,
          );
        }
        processedPrefabs.add(path);
        scan(document);
        changed = true;
      }
      for (const path of [...reachableScripts].sort()) {
        if (processedScripts.has(path)) continue;
        if (!existsSync(this.#projectPath(path))) {
          throw new ProjectError(
            'BUILD_REACHABLE_SCRIPT_MISSING',
            `可达脚本不存在：${path}`,
          );
        }
        processedScripts.add(path);
        const source = readFileSync(this.#projectPath(path), 'utf8');
        const literals = [
          ...Object.keys(scenes),
          ...Object.values(scenes).map((document) => document.id),
          ...Object.keys(prefabs),
          ...assetRecords.flatMap((asset) => [asset.id, asset.path]),
          ...compiled.manifest.modules.map((module) => module.source),
        ].filter((value): value is string => typeof value === 'string');
        scan(literals.filter((literal) => source.includes(literal)));
        changed = true;
      }
    }
    const reachableModuleIds = new Set(
      compiled.manifest.modules
        .filter((module) => reachableScripts.has(module.source))
        .map((module) => module.id),
    );
    const runtimeManifest = {
      ...compiled.manifest,
      modules: compiled.manifest.modules.filter((module) =>
        reachableModuleIds.has(module.id),
      ),
      systems: compiled.manifest.systems.filter((system) =>
        reachableModuleIds.has(system.module),
      ),
    };
    const runtimeModules = compiled.modules.filter((module) =>
      reachableModuleIds.has(module.id),
    );
    const runtimeMetadata = {
      ...compiled.metadata,
      moduleHashes: Object.fromEntries(
        Object.entries(compiled.metadata.moduleHashes).filter(([id]) =>
          reachableModuleIds.has(id),
        ),
      ),
      sourceMapHashes: Object.fromEntries(
        Object.entries(compiled.metadata.sourceMapHashes).filter(([id]) =>
          reachableModuleIds.has(id),
        ),
      ),
      outputHash: createHash('sha256')
        .update(JSON.stringify(runtimeModules))
        .digest('hex'),
    };
    const reachableAssetRecords = assetRecords
      .filter((asset) => reachableAssets.has(asset.path))
      .map((asset) => asset.asset);
    const reachability: GameBuildReport['reachability'] = {
      scenes: [...reachableScenes].sort(),
      prefabs: [...reachablePrefabs].sort(),
      scripts: [...reachableScripts].sort(),
      assets: [...reachableAssets].sort(),
      orphanedAssets: assetRecords
        .filter((asset) => !reachableAssets.has(asset.path))
        .map((asset) => asset.path)
        .sort(),
    };
    const payload = {
      schemaVersion: '1.0.0',
      kind: 'ai-game-studio/player-package',
      engineVersion: this.#engineVersion,
      project: { id: projectId, name: projectName, version: gameVersion },
      entryScene,
      scene,
      scenes: Object.fromEntries(
        Object.entries(scenes).filter(([path]) => reachableScenes.has(path)),
      ),
      prefabs: Object.fromEntries(
        Object.entries(prefabs).filter(([path]) => reachablePrefabs.has(path)),
      ),
      runtime: {
        tickRate: projectSettings.tickRate ?? 60,
        manifest: runtimeManifest,
        modules: runtimeModules,
        metadata: runtimeMetadata,
        memoryBytes: compiled.manifest.budgets.memoryBytes,
        stackBytes: compiled.manifest.budgets.stackBytes,
      },
      inputActions,
      audioBuses,
      assets: reachableAssetRecords,
      reachability,
    };
    return { payload, reachableAssets, reachability };
  }

  #copyRuntimeAssets(bundle: string, reachableAssets: Set<string>): void {
    const manifestPath = join(this.#root, 'assets', 'asset-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      assets?: Array<{ path?: string; status?: string }>;
    };
    const outputManifest = {
      ...manifest,
      assets: [] as Array<{ path?: string; status?: string }>,
    };
    for (const asset of manifest.assets ?? []) {
      if (
        asset.status !== 'ready' ||
        typeof asset.path !== 'string' ||
        !reachableAssets.has(asset.path)
      )
        continue;
      this.#copyProjectFile(asset.path, join(bundle, 'game', asset.path));
      outputManifest.assets.push(asset);
    }
    mkdirSync(join(bundle, 'game', 'assets'), { recursive: true });
    writeFileSync(
      join(bundle, 'game', 'assets', 'asset-manifest.json'),
      `${JSON.stringify(outputManifest, null, 2)}\n`,
      'utf8',
    );
  }

  #writeProvenance(bundle: string, reachableAssets: Set<string>): void {
    const manifest = JSON.parse(
      readFileSync(join(this.#root, 'assets', 'asset-manifest.json'), 'utf8'),
    ) as { assets?: unknown[] };
    writeFileSync(
      join(bundle, 'ASSET-PROVENANCE.json'),
      `${JSON.stringify(
        {
          schemaVersion: '1.0.0',
          assets: (manifest.assets ?? []).filter(
            (asset) =>
              asset &&
              typeof asset === 'object' &&
              typeof (asset as { path?: unknown }).path === 'string' &&
              reachableAssets.has((asset as { path: string }).path),
          ),
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  }

  #projectPath(path: string): string {
    const target = resolve(this.#root, path);
    const inside = relative(this.#root, target);
    if (!inside || inside.startsWith('..') || inside.includes(':')) {
      throw new ProjectError(
        'BUILD_PROJECT_PATH_INVALID',
        `项目文件路径无效：${path}`,
      );
    }
    return target;
  }

  #copyProjectFile(path: string, destination: string): void {
    const source = this.#projectPath(path);
    if (!statSync(source).isFile())
      throw new ProjectError('BUILD_INPUT_MISSING', `构建输入不存在：${path}`);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  }

  #outputRoot(profile: GameBuildProfile): string {
    return join(
      this.#root,
      'out',
      profile === 'release' ? 'windows-release' : 'windows-development',
    );
  }

  #assertOutput(path: string): void {
    const outputRoot = join(this.#root, 'out');
    const inside = relative(outputRoot, resolve(path));
    if (!inside || inside.startsWith('..') || inside.includes(':')) {
      throw new ProjectError(
        'BUILD_OUTPUT_UNSAFE',
        '构建输出必须位于项目 out/ 目录内。',
      );
    }
  }

  #zip(bundle: string, zipPath: string): void {
    this.#assertOutput(zipPath);
    rmSync(zipPath, { force: true });
    const windowsRoot = process.env.SystemRoot ?? 'C:\\Windows';
    const powershell = join(
      windowsRoot,
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    );
    const result = spawnSync(
      powershell,
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Compress-Archive -LiteralPath $env:AIGAME_BUILD_SOURCE -DestinationPath $env:AIGAME_BUILD_ZIP -CompressionLevel Optimal',
      ],
      {
        cwd: dirname(bundle),
        env: {
          ...process.env,
          AIGAME_BUILD_SOURCE: bundle,
          AIGAME_BUILD_ZIP: zipPath,
        },
        encoding: 'utf8',
        windowsHide: true,
        timeout: 120_000,
      },
    );
    if (result.status !== 0) {
      throw new ProjectError(
        'BUILD_ZIP_FAILED',
        'Windows ZIP 打包失败。',
        result.stderr,
      );
    }
  }
}
