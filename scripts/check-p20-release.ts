import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join, relative, resolve } from 'node:path';

import { ProjectScriptRuntime } from '../studio/runtime/project-script-runtime.ts';
import { StudioChangeSetService } from '../studio/workspace/studio-change-set-service.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';
import { StudioGameBuildService } from '../studio/workspace/studio-game-build-service.ts';

const repository = resolve(process.cwd());
const studioVersion = (
  JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8')) as {
    version: string;
  }
).version;
const temporary = mkdtempSync(join(tmpdir(), 'ai-game-studio-p20-'));
const player = join(repository, 'target', 'release', 'ai-game-player.exe');
const scriptHost = join(
  repository,
  'target',
  'release',
  'project-script-host.exe',
);
const legacyKernel = join(repository, 'target', 'release', 'kernelctl.exe');
const cleanPath = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32');

type Example = {
  directory: string;
  space: '2d' | '3d';
  moduleIds: string[];
};
const examples: Example[] = [
  {
    directory: 'pong-2d',
    space: '2d',
    moduleIds: ['pong:behavior/paddle', 'pong:system/ball-module'],
  },
  {
    directory: 'collect-room-3d',
    space: '3d',
    moduleIds: ['collect:behavior/player'],
  },
  {
    directory: 'tank-arena',
    space: '2d',
    moduleIds: [
      'tank:behavior/player',
      'tank:behavior/player-shell',
      'tank:behavior/enemy',
      'tank:behavior/game-controller',
      'tank:behavior/explosion',
    ],
  },
];

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
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

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

try {
  assert(existsSync(player), 'release ai-game-player.exe is missing');
  const playerSource = readFileSync(
    join(repository, 'crates', 'player', 'src', 'main.rs'),
    'utf8',
  );
  for (const marker of [
    'active_inputs: BTreeMap<String, f64>',
    'KeyCode::KeyR => "KeyR"',
    'KeyCode::Escape => "Escape"',
    '"tick": self.tick',
    'ElementState::Released',
  ]) {
    assert(playerSource.includes(marker), marker);
  }
  assert(existsSync(scriptHost), 'release project-script-host.exe is missing');
  assert(
    existsSync(legacyKernel),
    'legacy regression kernelctl.exe is missing',
  );

  const reports = [];
  for (const example of examples) {
    const root = join(repository, 'examples', example.directory);
    const manifest = JSON.parse(
      readFileSync(join(root, 'project.aigame.json'), 'utf8'),
    ) as {
      id: string;
      name: string;
      templates: Array<{ id: string }>;
      entry: { scene: string };
    };
    assert(
      manifest.templates.some(
        (template) =>
          template.id === (example.space === '3d' ? 'core:3d' : 'core:2d'),
      ),
    );
    assert(manifest.templates.some((template) => template.id === 'core:empty'));
    assert(existsSync(join(root, 'docs', 'BUILD_FROM_EMPTY.md')));
    const runtimeDocument = JSON.parse(
      readFileSync(join(root, 'scripts', 'runtime.json'), 'utf8'),
    ) as { modules: Array<{ id: string }> };
    assert.deepEqual(
      runtimeDocument.modules.map((module) => module.id),
      example.moduleIds,
      `${example.directory} runtime module identity changed`,
    );

    const runtime = new ProjectScriptRuntime({
      projectRoot: root,
      scriptHostPath: scriptHost,
    });
    const hashes = new Set<string>();
    const startedAt = performance.now();
    for (let run = 0; run < 100; run += 1) {
      hashes.add(
        runtime.run({ ticks: 60, seed: 20260902, persistTrace: false })
          .stateHash,
      );
    }
    const durationMs = performance.now() - startedAt;
    console.log(
      JSON.stringify({
        gate: 'p20-deterministic-batch',
        example: example.directory,
        runs: 100,
        ticksPerRun: 60,
        durationMs: Number(durationMs.toFixed(2)),
        distinctStateHashes: hashes.size,
      }),
    );
    assert.equal(hashes.size, 1, `${example.directory} is nondeterministic`);
    assert(
      durationMs < 60_000,
      `${example.directory} deterministic batch exceeded 60 s`,
    );

    const registry = new StudioCommandRegistry({
      projectRoot: root,
      kernelCliPath: legacyKernel,
      scriptHostPath: scriptHost,
    });
    const validation = registry.execute('project.validate').data as {
      ok: boolean;
    };
    assert.equal(validation.ok, true);
    const replay = registry.execute('runtime.run_replay', {
      replay: 'replays/smoke.replay.json',
    }).data as { status: string; diagnostics: unknown[] };
    assert.equal(replay.status, 'completed');
    assert.equal(replay.diagnostics.length, 0);
    const references = registry.execute('project.references').data as {
      symbols: Array<{ kind: string }>;
    };
    assert(references.symbols.some((symbol) => symbol.kind === 'script'));

    const builder = new StudioGameBuildService({
      projectRoot: root,
      runtimeExecutablePath: player,
      scriptHostPath: scriptHost,
      engineVersion: studioVersion,
    });
    const first = builder.execute('release.package');
    const firstHash = first.reproducibleCoreHash;
    const second = builder.execute('release.package');
    assert.equal(second.reproducibleCoreHash, firstHash);
    assert(existsSync(second.zipPath));
    assert.equal(second.zipSha256, sha256(second.zipPath));

    const packageFiles = filesBelow(second.outputDirectory).map((path) =>
      relative(second.outputDirectory, path).replaceAll('\\', '/'),
    );
    const forbiddenFile = packageFiles.find(
      (path) =>
        /(^|\/)(?:studio|codex|tests|replays|src|\.agents|\.ai|\.codex)(\/|$)/iu.test(
          path,
        ) || ['.ts', '.tsx', '.map'].includes(extname(path).toLowerCase()),
    );
    assert.equal(
      forbiddenFile,
      undefined,
      `forbidden release file: ${forbiddenFile}`,
    );
    assert(packageFiles.includes('game/player-package.json'));
    assert(packageFiles.includes('BUILD-MANIFEST.json'));
    assert(
      !packageFiles.some((path) =>
        /kernelctl|project-script-host/iu.test(path),
      ),
    );
    for (const path of packageFiles.filter((name) =>
      ['.json', '.txt'].includes(extname(name).toLowerCase()),
    )) {
      const source = readFileSync(join(second.outputDirectory, path), 'utf8');
      assert(
        !/(?:api[_-]?key|access[_-]?token|secret)\s*[=:]\s*["'][^"']+/iu.test(
          source,
        ),
      );
    }

    const executablePath = join(second.outputDirectory, second.executable);
    const verified = spawnSync(executablePath, ['--verify'], {
      cwd: second.outputDirectory,
      env: {
        NODE_ENV: 'production',
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        PATH: cleanPath,
      },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 30_000,
    });
    assert.equal(verified.status, 0, verified.stderr);
    const verify = JSON.parse(verified.stdout) as {
      ok: boolean;
      sceneSpace: string;
      moduleCount: number;
      externalDependencies: unknown[];
    };
    assert.equal(verify.ok, true);
    assert.equal(verify.sceneSpace, example.space);
    assert.equal(verify.moduleCount, example.moduleIds.length);
    assert.deepEqual(verify.externalDependencies, []);
    const windowed = spawnSync(executablePath, ['--smoke', '5'], {
      cwd: second.outputDirectory,
      env: {
        NODE_ENV: 'production',
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        PATH: cleanPath,
      },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 45_000,
    });
    assert.equal(windowed.status, 0, windowed.stderr || windowed.stdout);
    const windowSmoke = JSON.parse(windowed.stdout) as {
      ok: boolean;
      kind: string;
      framesPresented: number;
      ticksExecuted: number;
      renderer: string;
      drawableCount: number;
    };
    assert.equal(windowSmoke.ok, true);
    assert.equal(windowSmoke.kind, 'ai-game-player/window-smoke');
    assert.equal(windowSmoke.renderer, 'wgpu-surface');
    assert.equal(windowSmoke.framesPresented, 5);
    assert(windowSmoke.ticksExecuted > 0);
    assert(windowSmoke.drawableCount > 0);
    reports.push({
      example: example.directory,
      projectId: manifest.id,
      deterministicRuns: 100,
      deterministicHash: [...hashes][0],
      durationMs: Number(durationMs.toFixed(2)),
      files: packageFiles.length,
      zip: basename(second.zipPath),
      zipSha256: second.zipSha256,
      standaloneVerify: verify,
      nativeWindowSmoke: windowSmoke,
    });
  }

  const aiProject = join(temporary, 'ai-parity-pong');
  cpSync(join(repository, 'examples', 'pong-2d'), aiProject, {
    recursive: true,
    filter: (source) => !source.includes(`${join('pong-2d', 'out')}`),
  });
  const aiRegistry = new StudioCommandRegistry({
    projectRoot: aiProject,
    kernelCliPath: legacyKernel,
    scriptHostPath: scriptHost,
  });
  const changes = new StudioChangeSetService({
    projectRoot: aiProject,
    kernelCliPath: legacyKernel,
    registry: aiRegistry,
  });
  const beforeScene = aiRegistry.readText('scenes/main.game.json').source;
  const proposal = changes.propose({
    summary: 'AI adds a neutral playfield marker through semantic authoring',
    operations: [
      {
        command: 'scene.object.create',
        input: {
          scene: 'scenes/main.game.json',
          name: 'AI Marker',
          id: 'pong:ai-marker',
        },
      },
    ],
  });
  changes.approve(proposal.id);
  changes.apply(proposal.id);
  assert.match(
    aiRegistry.readText('scenes/main.game.json').source,
    /pong:ai-marker/u,
  );
  assert.equal(
    (
      aiRegistry.execute('runtime.start', { ticks: 3 }).data as {
        status: string;
      }
    ).status,
    'completed',
  );
  changes.rollback(proposal.id);
  assert.equal(
    aiRegistry.readText('scenes/main.game.json').source,
    beforeScene,
  );

  const legacy = spawnSync(
    legacyKernel,
    [
      'batch',
      join(
        repository,
        'examples/tank-legacy-regression/examples/tank-combat.game.json',
      ),
      join(
        repository,
        'examples/tank-legacy-regression/fixtures/replay/tank-combat.input.json',
      ),
      '100',
    ],
    { cwd: repository, encoding: 'utf8', windowsHide: true, timeout: 60_000 },
  );
  assert.equal(legacy.status, 0, legacy.stderr);
  const legacyResult = JSON.parse(legacy.stdout) as { ok: boolean };
  assert.equal(legacyResult.ok, true);

  const productionRoots = [
    'crates/player',
    'crates/script-host',
    'crates/engine-mcp',
    'studio/capabilities',
    'studio/runtime',
    'studio/workspace',
    'templates',
  ];
  const forbiddenProductionTerms: string[] = [];
  for (const root of productionRoots) {
    for (const path of filesBelow(join(repository, root))) {
      if (
        !['.ts', '.tsx', '.rs', '.json', '.md', '.wgsl'].includes(extname(path))
      )
        continue;
      const source = readFileSync(path, 'utf8');
      if (/\b(?:tank|bullet|brick|pong|collectible)\b/iu.test(source)) {
        forbiddenProductionTerms.push(
          relative(repository, path).replaceAll('\\', '/'),
        );
      }
    }
  }
  assert.deepEqual(forbiddenProductionTerms, []);

  const evidence = {
    gate: 'P20 independent validation and Alpha release',
    studioVersion,
    examples: reports,
    aiChangeSet: {
      preview: true,
      approval: true,
      exactRollback: true,
      semanticHash: createHash('sha256')
        .update(canonical(beforeScene))
        .digest('hex'),
    },
    legacyTankRegression: { runs: 100, isolatedUnderExamples: true },
    security: {
      cleanPath: true,
      noCredentialLeak: true,
      releaseExclusions: true,
      noExternalRuntimeDependency: true,
    },
    result: 'passed',
  };
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
