import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

import { resolveBuildEnvironment } from './msvc-environment.mjs';

const root = resolve(process.cwd());
const version = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8'),
).version;
const releaseName = `AI-Game-Kernel-MVP-${version}`;
const artifactRoot = resolve(root, 'artifacts', 'windows');
const bundleRoot = resolve(artifactRoot, releaseName);
const zipPath = resolve(artifactRoot, `${releaseName}.zip`);
const zipHashPath = `${zipPath}.sha256`;

for (const target of [artifactRoot, bundleRoot, zipPath, zipHashPath]) {
  const inside = relative(root, target);
  if (inside.startsWith('..') || resolve(target) === root) {
    throw new Error(`refusing package target outside workspace: ${target}`);
  }
}

const environment = resolveBuildEnvironment();
if (!environment) {
  throw new Error('Visual Studio C++ Build Tools are required on Windows');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...environment, ...options.env },
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
  return result.stdout?.trim() ?? '';
}

function copy(relativeSource, relativeDestination = relativeSource) {
  const source = resolve(root, relativeSource);
  const destination = resolve(bundleRoot, relativeDestination);
  mkdirSync(resolve(destination, '..'), { recursive: true });
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

mkdirSync(artifactRoot, { recursive: true });
rmSync(bundleRoot, { recursive: true, force: true });
rmSync(zipPath, { force: true });
rmSync(zipHashPath, { force: true });

const npmCli = resolve(
  dirname(process.execPath),
  'node_modules',
  'npm',
  'bin',
  'npm-cli.js',
);
run(process.execPath, [
  npmCli,
  'ci',
  '--dry-run',
  '--ignore-scripts',
  '--no-audit',
  '--no-fund',
]);
run(process.execPath, [npmCli, 'run', 'build'], {
  env: {
    __VINEXT_SHARED_REVALIDATE_SECRET: `ai-game-kernel-mvp-${version}-reproducible-revalidation-secret`,
  },
});
run('cargo', [
  'build',
  '--release',
  '--locked',
  '-p',
  'ai-game-kernel-cli',
  '-p',
  'ai-game-kernel-runtime',
]);

mkdirSync(join(bundleRoot, 'bin'), { recursive: true });
copyFileSync(
  join(root, 'target', 'release', 'kernelctl.exe'),
  join(bundleRoot, 'bin', 'kernelctl.exe'),
);
copyFileSync(
  join(root, 'target', 'release', 'ai-game-kernel-runtime.exe'),
  join(bundleRoot, 'bin', 'ai-game-kernel-runtime.exe'),
);

for (const path of [
  'dist/client',
  'dist/server',
  'examples/tank-legacy-regression/studio-server',
  'generated/codex-app-server',
  'examples/tank-legacy-regression/schemas',
  'examples/tank-legacy-regression/examples',
  'examples/tank-legacy-regression/fixtures/replay',
  'docs',
  'package.json',
  'package-lock.json',
  '.nvmrc',
  'rust-toolchain.toml',
  'README.md',
]) {
  copy(path);
}
copy('packaging/windows/Start-Game.cmd', 'Start-Game.cmd');
copy('packaging/windows/Start-Studio.cmd', 'Start-Studio.cmd');
copy('packaging/windows/Start-Studio.ps1', 'Start-Studio.ps1');

const fileHashes = Object.fromEntries(
  filesBelow(bundleRoot).map((path) => [
    relative(bundleRoot, path).replaceAll('\\', '/'),
    sha256(path),
  ]),
);
const reproducibleCoreFiles = Object.fromEntries(
  Object.entries(fileHashes).filter(([path]) => !path.startsWith('dist/')),
);
const manifest = {
  kind: 'ai-game-kernel/windows-release',
  version,
  target: 'x86_64-pc-windows-msvc',
  node: run('node', ['--version'], { capture: true }),
  rustc: run('rustc', ['--version'], { capture: true }),
  cargoLocked: true,
  sourceDate: '2026-09-02',
  studioBuildId: readFileSync(
    join(bundleRoot, 'dist', 'server', 'BUILD_ID'),
    'utf8',
  ).trim(),
  reproducibleCoreHash: createHash('sha256')
    .update(JSON.stringify(reproducibleCoreFiles))
    .digest('hex'),
  files: fileHashes,
};
writeFileSync(
  join(bundleRoot, 'BUILD-MANIFEST.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

run(
  'powershell',
  [
    '-NoProfile',
    '-Command',
    'Compress-Archive -LiteralPath $env:AI_GAME_PACKAGE_SOURCE -DestinationPath $env:AI_GAME_PACKAGE_ZIP -CompressionLevel Optimal',
  ],
  {
    timeout: 300_000,
    env: {
      AI_GAME_PACKAGE_SOURCE: bundleRoot,
      AI_GAME_PACKAGE_ZIP: zipPath,
    },
  },
);
const zipHash = sha256(zipPath);
writeFileSync(zipHashPath, `${zipHash}  ${basename(zipPath)}\n`, 'utf8');

console.log(
  JSON.stringify({
    ok: true,
    bundleRoot,
    zipPath,
    zipHash,
    fileCount: Object.keys(fileHashes).length + 1,
  }),
);
