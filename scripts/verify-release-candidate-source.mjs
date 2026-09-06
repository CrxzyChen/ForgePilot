import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  captureReleaseSource,
  qualifyReleaseSource,
} from './release-source-provenance.mjs';

const archive = resolve(process.argv[2] ?? '');
const root = resolve(process.argv[3] ?? process.cwd());
function tar(args) {
  const result = spawnSync('tar', args, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
    timeout: 60_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Cannot read candidate archive: ${result.stderr}`);
  return result.stdout;
}
const entries = tar(['-tf', archive]).split(/\r?\n/u).filter(Boolean);
const manifests = entries.filter((entry) =>
  /^[^/\\]+[/\\]STUDIO-BUILD-MANIFEST\.json$/u.test(entry),
);
if (
  manifests.length !== 1 ||
  entries.some((entry) => entry.replaceAll('\\', '/').split('/').includes('..'))
) {
  throw new Error(
    'Candidate archive must contain exactly one safely located Studio build manifest.',
  );
}
const manifest = JSON.parse(tar(['-xOf', archive, manifests[0]]));
const version = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8'),
).version;
const { source } = captureReleaseSource(root);
console.log(
  JSON.stringify({
    ...qualifyReleaseSource(manifest, source, version),
    source,
    archiveSource: manifest.source ?? null,
  }),
);
