import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { resolveBundledCodexSidecar } from '../studio/server/codex-sidecar-resolver.ts';

function filesBelow(root, directory = root) {
  return readdirSync(directory)
    .flatMap((entry) => {
      const path = join(directory, entry);
      return statSync(path).isDirectory()
        ? filesBelow(root, path)
        : [relative(root, path).replaceAll('\\', '/')];
    })
    .sort((left, right) => left.localeCompare(right));
}

const temporaryRoot = mkdtempSync(join(tmpdir(), 'ai-game-kernel-codex-'));
try {
  const generated = join(temporaryRoot, 'protocol');
  const launch = resolveBundledCodexSidecar({
    applicationRoot: process.cwd(),
    runtimeExecutable: process.execPath,
  });
  if (process.platform === 'win32') {
    assert.equal(launch.prefixArguments.length, 0);
    assert.match(launch.command, /[\\/]codex\.exe$/iu);
  }
  const result = spawnSync(
    launch.command,
    [
      ...launch.prefixArguments,
      'app-server',
      'generate-ts',
      '--out',
      generated,
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: launch.env,
      windowsHide: true,
    },
  );
  assert.equal(result.status, 0, result.stderr || result.error?.message);

  const committed = join(process.cwd(), 'generated', 'codex-app-server');
  const generatedFiles = filesBelow(generated);
  assert.deepEqual(
    filesBelow(committed),
    generatedFiles,
    'Codex App Server protocol file list drifted; regenerate bindings',
  );
  for (const file of generatedFiles) {
    assert.equal(
      readFileSync(join(committed, file), 'utf8'),
      readFileSync(join(generated, file), 'utf8'),
      `Codex App Server protocol binding drifted: ${file}`,
    );
  }
  console.log(
    `[codex-protocol] bundled Codex ${launch.version}: ${generatedFiles.length} generated bindings match`,
  );
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
