import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertReleaseSourceUnchanged,
  captureReleaseSource,
  qualifyReleaseSource,
  releaseGit,
  releaseSourcePath,
} from './release-source-provenance.mjs';
import { prepareReleaseSource } from './prepare-release-source.mjs';

const parent = join(process.cwd(), 'artifacts');
mkdirSync(parent, { recursive: true });
const fixture = mkdtempSync(join(parent, 'release-source-gate-'));
releaseGit(fixture, ['init', '-q']);
releaseGit(fixture, ['config', 'core.autocrlf', 'false']);
writeFileSync(join(fixture, '.gitignore'), 'artifacts/\n.env*\n');
writeFileSync(join(fixture, 'package.json'), '{"version":"0.4.0-preview.1"}\n');
releaseGit(fixture, ['add', '.']);
releaseGit(fixture, [
  '-c',
  'user.name=Release Gate Fixture',
  '-c',
  'user.email=fixture@invalid',
  '-c',
  'commit.gpgsign=false',
  'commit',
  '-qm',
  'Synthetic source provenance fixture',
]);
const clean = captureReleaseSource(fixture);
assert.equal(clean.source.dirty, false);
const manifest = {
  kind: 'ai-game-studio/windows-portable',
  version: '0.4.0-preview.1',
  cleanGate: { ok: true },
  source: clean.source,
};
assert.equal(
  qualifyReleaseSource(manifest, clean.source, manifest.version)
    .finalCandidateEligible,
  true,
);
writeFileSync(join(fixture, '.env.fixture'), 'not-a-real-secret');
assert.deepEqual(captureReleaseSource(fixture), clean);
writeFileSync(join(fixture, 'new-source.ts'), 'export const value = 1;\n');
const dirty = captureReleaseSource(fixture);
assert.equal(dirty.source.dirty, true);
assert.notEqual(dirty.source.contentSha256, clean.source.contentSha256);
assert.throws(
  () => assertReleaseSourceUnchanged(clean.source, dirty.source),
  /changed/u,
);
assert.throws(
  () => qualifyReleaseSource(manifest, dirty.source, manifest.version),
  /changed/u,
);
assert.equal(
  qualifyReleaseSource(
    { ...manifest, source: dirty.source },
    dirty.source,
    manifest.version,
  ).finalCandidateEligible,
  false,
);
assert.equal(
  qualifyReleaseSource(
    { ...manifest, source: undefined },
    clean.source,
    manifest.version,
  ).finalCandidateEligible,
  false,
);
assert.throws(
  () =>
    qualifyReleaseSource(
      { ...manifest, version: '0.3.0-preview.1' },
      clean.source,
      manifest.version,
    ),
  /version/u,
);
assert.throws(
  () =>
    qualifyReleaseSource(
      { ...manifest, cleanGate: { ok: false } },
      clean.source,
      manifest.version,
    ),
  /clean gate/u,
);
assert.throws(
  () =>
    qualifyReleaseSource(
      { ...manifest, source: { ...clean.source, commit: '0'.repeat(40) } },
      clean.source,
      manifest.version,
    ),
  /changed/u,
);
for (const name of [
  '../escape',
  '.git/config',
  'nested/../escape',
  'C:/escape',
  'nested\\escape',
]) {
  assert.throws(() => releaseSourcePath(fixture, name), /Unsafe|Escaping/u);
}
assert.equal(
  JSON.parse(readFileSync(join(fixture, 'package.json'), 'utf8')).version,
  manifest.version,
);
const snapshot = prepareReleaseSource(fixture);
assert.equal(snapshot.originalCheckoutUnchanged, true);
assert.deepEqual(captureReleaseSource(fixture), dirty);
assert.equal(captureReleaseSource(snapshot.checkout).source.dirty, false);
assert.equal(snapshot.contentSha256, dirty.source.contentSha256);
assert.notEqual(snapshot.sourceCommit, dirty.source.commit);
assert.equal(releaseGit(snapshot.checkout, ['remote']).trim(), '');
console.log(
  JSON.stringify({
    ok: true,
    fixture,
    cleanCandidate: true,
    dirtyAndStaleCandidateRejected: true,
    ignoredCredentialsExcluded: true,
    pathTraversalRejected: true,
    isolatedSnapshotPreservesOriginal: true,
    cleanCheckoutContentIdentical: true,
    humanAcceptance: false,
  }),
);
