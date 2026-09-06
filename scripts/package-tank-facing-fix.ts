import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { runtimeProjectRevision } from '../studio/runtime/runtime-input-log.ts';
import { StudioGameBuildService } from '../studio/workspace/studio-game-build-service.ts';

assert(
  process.argv[2] && !process.argv[2].startsWith('--'),
  'Pass the Tank project path as the first argument',
);
const source = resolve(process.argv[2]);
const evidence = mkdtempSync(resolve('artifacts/tank-facing-delivery-'));
const projectRoot = join(evidence, 'project');
const revision = runtimeProjectRevision(source);
cpSync(source, projectRoot, {
  recursive: true,
  filter: (path) =>
    ![
      '.git',
      '.aigame',
      '.codex',
      '.ai',
      'out',
      'node_modules',
      'dist',
    ].includes(basename(path)),
});
assert.equal(runtimeProjectRevision(projectRoot), revision);
const service = new StudioGameBuildService({
  projectRoot,
  runtimeExecutablePath: resolve('target/release/ai-game-player.exe'),
  scriptHostPath: resolve('target/release/project-script-host.exe'),
  engineVersion: '0.4.0-preview.1',
});
const packages = [];
for (const profile of ['development', 'release'] as const) {
  const build = service.build(profile);
  assert.equal(build.projectRevision, revision);
  assert(build.zipSha256);
  const verification = await service.verifyPackage(profile, build.zipSha256);
  assert.equal(verification.ok, true);
  packages.push({
    profile,
    zipPath: build.zipPath,
    zipSha256: build.zipSha256,
    executable: build.executable,
    verificationId: verification.verificationId,
  });
}
assert.equal(runtimeProjectRevision(source), revision);
writeFileSync(
  join(evidence, 'delivery.json'),
  JSON.stringify({ source, revision, packages }, null, 2),
);
console.log(JSON.stringify({ evidence, revision, packages }));
