import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const upstreamHashes = {
  LICENSE: 'd17f227e4df5da1600391338865ce0f3055211760a36688f816941d58232d8dc',
  NOTICE: '9d71575ecfd9a843fc1677b0efb08053c6ba9fd686a0de1a6f5382fd3c220915',
};
const files = [
  'LICENSE',
  'THIRD-PARTY-NOTICES.md',
  'third-party/codex/LICENSE',
  'third-party/codex/NOTICE',
  'third-party/codex/RATATUI-MIT-LICENSE',
];

function text(path) {
  return readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
}

export function verifyLicenseSources(root) {
  const pkg = JSON.parse(text(join(root, 'package.json')));
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(
    pkg.dependencies['@openai/codex'],
    '0.152.1',
    'Codex upgrade requires reviewing and refreshing third-party licenses',
  );
  for (const [file, hash] of Object.entries(upstreamHashes)) {
    assert.equal(
      createHash('sha256')
        .update(text(join(root, 'third-party/codex', file)))
        .digest('hex'),
      hash,
      'Upstream Codex license/notice must remain intact: ' + file,
    );
  }
  assert.match(text(join(root, 'LICENSE')), /Version 2.0, January 2004/);
  for (const file of files) assert.ok(text(join(root, file)).trim().length > 0);
}

export function copyStudioLicenses(root, appRoot) {
  verifyLicenseSources(root);
  for (const file of files) {
    const destination = join(appRoot, file);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(root, file), destination);
  }
  for (const file of ['LICENSE', 'NOTICE', 'RATATUI-MIT-LICENSE']) {
    const destination = join(appRoot, 'vendor/codex', file);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(root, 'third-party/codex', file), destination);
  }
  verifyStudioLicenses(root, appRoot);
}

export function verifyStudioLicenses(root, appRoot) {
  for (const file of files)
    assert.equal(text(join(appRoot, file)), text(join(root, file)));
  for (const file of ['LICENSE', 'NOTICE', 'RATATUI-MIT-LICENSE']) {
    assert.equal(
      text(join(appRoot, 'vendor/codex', file)),
      text(join(root, 'third-party/codex', file)),
    );
  }
}
