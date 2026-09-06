import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { StudioGameBuildService } from '../studio/workspace/studio-game-build-service.ts';

const repository = resolve(process.cwd());
const project = resolve(
  process.argv[2] ?? join(repository, 'work', 'projects', 'tank-arena'),
);
const kernel = join(repository, 'target', 'release', 'kernelctl.exe');
const runtime = join(
  repository,
  'target',
  'release',
  'ai-game-kernel-runtime.exe',
);

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

function hash(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const builder = new StudioGameBuildService({
  projectRoot: project,
  kernelCliPath: kernel,
  runtimeExecutablePath: runtime,
  engineVersion: '0.1.1',
});
const development = builder.build('development');
const firstRelease = builder.build('release');
const secondRelease = builder.build('release');
assert.equal(
  firstRelease.reproducibleCoreHash,
  secondRelease.reproducibleCoreHash,
);
assert.equal(
  builder.readReport('release').reproducibleCoreHash,
  secondRelease.reproducibleCoreHash,
);
assert(existsSync(development.outputDirectory));
assert(existsSync(secondRelease.outputDirectory));
assert(existsSync(secondRelease.zipPath));
assert.equal(secondRelease.zipSha256, hash(secondRelease.zipPath));

const mcpExecutable = join(repository, 'target', 'release', 'aigame-mcp.exe');
const mcpInput = [
  { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'build.read_report',
      arguments: { profile: 'release' },
    },
  },
]
  .map((message) => JSON.stringify(message))
  .join('\n');
const mcp = spawnSync(mcpExecutable, ['--project', project], {
  input: `${mcpInput}\n`,
  env: {
    ...process.env,
    AIGAME_STUDIO_NODE_RUNTIME: process.execPath,
    AIGAME_STUDIO_ENGINE_MCP_SERVER: join(
      repository,
      'dist',
      'electron',
      'engine-mcp',
      'server.js',
    ),
    AIGAME_STUDIO_KERNEL_CLI: kernel,
    AIGAME_STUDIO_GAME_RUNTIME: runtime,
    AIGAME_STUDIO_ENGINE_VERSION: '0.1.1',
  },
  encoding: 'utf8',
  windowsHide: true,
  timeout: 30_000,
});
assert.equal(mcp.status, 0, mcp.stderr || mcp.stdout);
const mcpResponses = mcp.stdout
  .split(/\r?\n/u)
  .filter(Boolean)
  .map(
    (line) =>
      JSON.parse(line) as {
        id?: number;
        result?: {
          tools?: Array<{ name: string }>;
          structuredContent?: { reproducibleCoreHash?: string };
        };
      },
  );
const listedTools =
  mcpResponses.find((response) => response.id === 2)?.result?.tools ?? [];
for (const tool of ['build.windows', 'build.read_report', 'release.package']) {
  assert(
    listedTools.some((item) => item.name === tool),
    `MCP missing ${tool}`,
  );
}
assert.equal(
  mcpResponses.find((response) => response.id === 3)?.result?.structuredContent
    ?.reproducibleCoreHash,
  secondRelease.reproducibleCoreHash,
);

const developmentFiles = filesBelow(development.outputDirectory).map((path) =>
  relative(development.outputDirectory, path).replaceAll('\\', '/'),
);
assert(developmentFiles.some((path) => path.startsWith('diagnostics/tests/')));
assert(
  developmentFiles.some((path) => path.startsWith('diagnostics/replays/')),
);
assert(developmentFiles.includes('diagnostics/kernelctl.exe'));

const releaseFiles = filesBelow(secondRelease.outputDirectory).map((path) =>
  relative(secondRelease.outputDirectory, path).replaceAll('\\', '/'),
);
for (const forbidden of [
  'studio',
  'codex',
  'agents.md',
  '.agents',
  '.ai/',
  '.codex',
  '.aigame',
  'diagnostics/',
  'tests/',
  'replays/',
  'drafts/',
  'source/',
  'node.exe',
  'cargo.exe',
  'rustc.exe',
  'kernelctl.exe',
]) {
  assert(
    releaseFiles.every((path) => !path.toLowerCase().includes(forbidden)),
    `release contains forbidden class ${forbidden}`,
  );
}
assert.equal(
  releaseFiles.filter((path) => path.endsWith('.game.json')).length,
  5,
);
for (const required of [
  secondRelease.executable,
  'BUILD-MANIFEST.json',
  'ASSET-PROVENANCE.json',
  'THIRD-PARTY-NOTICES.txt',
  'SIGNING-LIMITATION.txt',
  'README.txt',
  'game/campaign.json',
  'game/assets/asset-manifest.json',
]) {
  assert(releaseFiles.includes(required), `release missing ${required}`);
}
for (const [path, expected] of Object.entries(secondRelease.files)) {
  assert.equal(
    hash(join(secondRelease.outputDirectory, path)),
    expected,
    `hash mismatch ${path}`,
  );
}
const inPackageManifest = readFileSync(
  join(secondRelease.outputDirectory, 'BUILD-MANIFEST.json'),
  'utf8',
);
assert(
  !/[A-Z]:\\/u.test(inPackageManifest),
  'package manifest leaked an absolute Windows path',
);
assert.match(
  readFileSync(
    join(secondRelease.outputDirectory, 'ASSET-PROVENANCE.json'),
    'utf8',
  ),
  /"reviewedBy": "human"/u,
);

const cleanRoot = mkdtempSync(join(tmpdir(), 'ai-game-p13-clean-'));
const expanded = join(cleanRoot, 'expanded');
const localAppData = join(cleanRoot, 'user-data');
const powershell = join(
  process.env.SystemRoot ?? 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe',
);
const expand = spawnSync(
  powershell,
  [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    'Expand-Archive -LiteralPath $env:AIGAME_RELEASE_ZIP -DestinationPath $env:AIGAME_RELEASE_DEST -Force',
  ],
  {
    env: {
      ...process.env,
      AIGAME_RELEASE_ZIP: secondRelease.zipPath,
      AIGAME_RELEASE_DEST: expanded,
    },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120_000,
  },
);
assert.equal(expand.status, 0, expand.stderr);
const executable = filesBelow(expanded).find(
  (path) => basename(path) === secondRelease.executable,
);
assert(executable, 'release executable was not found after clean unzip');
const cleanPath = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32');
const cleanEnvironment = {
  SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
  WINDIR: process.env.WINDIR ?? 'C:\\Windows',
  PATH: cleanPath,
  LOCALAPPDATA: localAppData,
  APPDATA: localAppData,
  NODE_ENV: 'production' as const,
};
const smoke = spawnSync(executable, ['--smoke', '5'], {
  cwd: resolve(executable, '..'),
  env: cleanEnvironment,
  encoding: 'utf8',
  windowsHide: true,
  timeout: 90_000,
});
assert.equal(smoke.status, 0, smoke.stderr || smoke.stdout);
const smokeReport = smoke.stdout
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter(Boolean)
  .map(
    (line) => JSON.parse(line) as { kind?: string; framesPresented?: number },
  )
  .find((item) => item.kind === 'ai-game-kernel/runtime-smoke');
assert.equal(smokeReport?.framesPresented, 5);

const instantVictory = JSON.parse(
  readFileSync(join(project, 'scenes', 'main.game.json'), 'utf8'),
) as {
  worlds: Array<{ entities: Array<{ components: Array<{ type?: string }> }> }>;
};
instantVictory.worlds[0]!.entities = instantVictory.worlds[0]!.entities.filter(
  (entity) =>
    !entity.components.some(
      (component) => component.type === 'game:wave-spawner',
    ),
);
const instantVictoryPath = join(cleanRoot, 'instant-victory.game.json');
writeFileSync(instantVictoryPath, JSON.stringify(instantVictory));
const saveSmoke = spawnSync(
  executable,
  ['--project', instantVictoryPath, '--smoke', '1'],
  {
    cwd: resolve(executable, '..'),
    env: cleanEnvironment,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 90_000,
  },
);
assert.equal(saveSmoke.status, 0, saveSmoke.stderr || saveSmoke.stdout);
const savePath = join(
  localAppData,
  'AI Game Kernel',
  'Tank Arena',
  'save.json',
);
assert(
  existsSync(savePath),
  'runtime did not save under isolated LocalAppData',
);
assert.equal(
  (
    JSON.parse(readFileSync(savePath, 'utf8')) as {
      highestUnlockedLevel: number;
    }
  ).highestUnlockedLevel,
  1,
);

rmSync(expanded, { recursive: true, force: true });
assert(
  !existsSync(expanded),
  'portable package could not be deleted after exit',
);
assert(
  existsSync(savePath),
  'portable uninstall unexpectedly deleted user save data',
);
rmSync(cleanRoot, { recursive: true, force: true });

console.log(
  JSON.stringify({
    ok: true,
    developmentFiles: development.fileCount,
    releaseFiles: secondRelease.fileCount,
    releaseZip: secondRelease.zipPath,
    zipSha256: secondRelease.zipSha256,
    reproducibleCoreHash: secondRelease.reproducibleCoreHash,
    cleanPath,
    smoke: smokeReport,
    saveLocation: '%LOCALAPPDATA%/AI Game Kernel/Tank Arena/save.json',
    gameLevels: 5,
    signing: secondRelease.signing,
    mcpBuildTools: 3,
  }),
);
