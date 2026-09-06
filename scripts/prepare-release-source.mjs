import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertReleaseSourceUnchanged,
  captureReleaseSource,
  releaseGit,
  releaseSourcePath,
} from './release-source-provenance.mjs';

// All writes are confined to a newly allocated artifacts child. The user's
// checkout, index, branch, source files and existing installations are untouched.
export function prepareReleaseSource(directory) {
  const root = realpathSync(directory);
  const before = captureReleaseSource(root);
  const artifactRoot = join(root, 'artifacts');
  mkdirSync(artifactRoot, { recursive: true });
  const destination = mkdtempSync(join(artifactRoot, 'r5-release-source-'));
  const staging = join(destination, 'snapshot');
  const checkout = join(destination, 'checkout');
  const hooks = join(destination, 'empty-hooks');
  mkdirSync(hooks);
  releaseGit(root, [
    'clone',
    '--no-hardlinks',
    '--no-checkout',
    '--local',
    root,
    staging,
  ]);
  releaseGit(staging, ['config', 'core.autocrlf', 'false']);
  releaseGit(staging, ['config', 'core.hooksPath', hooks]);
  releaseGit(staging, [
    'branch',
    'codex/r5-release-snapshot',
    before.source.commit,
  ]);
  releaseGit(staging, [
    'symbolic-ref',
    'HEAD',
    'refs/heads/codex/r5-release-snapshot',
  ]);
  for (const file of before.files) {
    const sourcePath = releaseSourcePath(root, file.path);
    const destinationPath = releaseSourcePath(staging, file.path);
    mkdirSync(dirname(destinationPath), { recursive: true });
    copyFileSync(sourcePath, destinationPath);
    if (
      createHash('sha256')
        .update(readFileSync(destinationPath))
        .digest('hex') !== file.sha256
    ) {
      throw new Error(
        `Source changed while copying ${file.path}; keep this failed snapshot for diagnosis.`,
      );
    }
  }
  assertReleaseSourceUnchanged(
    before.source,
    captureReleaseSource(root).source,
  );
  releaseGit(staging, ['add', '--all']);
  releaseGit(staging, [
    '-c',
    'user.name=AI Game Studio Release Snapshot',
    '-c',
    'user.email=release-snapshot@invalid',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--allow-empty',
    '-qm',
    `Local R5 release snapshot of ${before.source.commit}\n\nOriginal working-source SHA-256: ${before.source.contentSha256}\nThis isolated snapshot does not modify the owner's branch or index.`,
  ]);
  releaseGit(staging, ['remote', 'remove', 'origin']);
  const snapshot = captureReleaseSource(staging);
  if (
    snapshot.source.dirty ||
    snapshot.source.contentSha256 !== before.source.contentSha256
  ) {
    throw new Error(
      'Snapshot content does not exactly match the original working source.',
    );
  }
  releaseGit(root, [
    'clone',
    '--no-hardlinks',
    '--local',
    '-c',
    'core.autocrlf=false',
    '-c',
    `core.hooksPath=${hooks}`,
    staging,
    checkout,
  ]);
  releaseGit(checkout, ['remote', 'remove', 'origin']);
  const clean = captureReleaseSource(checkout);
  assertReleaseSourceUnchanged(snapshot.source, clean.source);
  assertReleaseSourceUnchanged(
    before.source,
    captureReleaseSource(root).source,
  );
  const bundle = join(destination, 'release-source.bundle');
  releaseGit(staging, ['bundle', 'create', bundle, 'HEAD']);
  const receipt = {
    kind: 'ai-game-studio/isolated-release-source',
    schemaVersion: '1.0.0',
    originalRoot: root,
    originalSource: before.source,
    snapshotSource: clean.source,
    sourceFiles: before.files,
    checkout,
    sourceBundle: bundle,
    sourceBundleSha256: createHash('sha256')
      .update(readFileSync(bundle))
      .digest('hex'),
    originalCheckoutUnchanged: true,
    built: false,
    humanAccepted: false,
  };
  const receiptPath = join(destination, 'SOURCE-SNAPSHOT.json');
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return {
    ok: true,
    receiptPath,
    checkout,
    sourceCommit: clean.source.commit,
    contentSha256: clean.source.contentSha256,
    fileCount: clean.source.fileCount,
    originalCheckoutUnchanged: true,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  console.log(
    JSON.stringify(prepareReleaseSource(process.argv[2] ?? process.cwd())),
  );
}
