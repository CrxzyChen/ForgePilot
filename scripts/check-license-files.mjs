import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  copyStudioLicenses,
  verifyStudioLicenses,
  verifyLicenseSources,
} from './studio-license-files.mjs';

const root = resolve(import.meta.dirname, '..');
verifyLicenseSources(root);
const appRoot = mkdtempSync(join(root, 'artifacts/license-package-'));
copyStudioLicenses(root, appRoot);
verifyStudioLicenses(root, appRoot);
assert.equal(
  JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')).packages['']
    .license,
  'Apache-2.0',
);
assert.match(
  readFileSync(join(root, 'Cargo.toml'), 'utf8'),
  /license = "Apache-2.0"/,
);
const notice = join(appRoot, 'vendor/codex/NOTICE');
unlinkSync(notice);
assert.throws(() => verifyStudioLicenses(root, appRoot));
copyStudioLicenses(root, appRoot);
writeFileSync(notice, 'truncated attribution');
assert.throws(() => verifyStudioLicenses(root, appRoot));
copyStudioLicenses(root, appRoot);
const packager = readFileSync(
  join(root, 'scripts/package-studio-windows.mjs'),
  'utf8',
);
assert.match(packager, /copyStudioLicenses\(root, appRoot\)/);
console.log(
  'Apache-2.0 sources and packaged Codex notices passed (missing/tampered notice rejected).',
);
