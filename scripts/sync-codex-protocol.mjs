import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

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

const workspaceRoot = resolve(process.cwd());
const committedRoot = resolve(workspaceRoot, 'generated', 'codex-app-server');
assert.ok(
  committedRoot.startsWith(`${workspaceRoot}\\`),
  'generated protocol target must stay inside the workspace',
);

const temporaryRoot = mkdtempSync(join(tmpdir(), 'ai-game-kernel-codex-sync-'));
try {
  const generatedRoot = join(temporaryRoot, 'protocol');
  const launch = resolveBundledCodexSidecar({
    applicationRoot: workspaceRoot,
    runtimeExecutable: process.execPath,
  });
  const result = spawnSync(
    launch.command,
    [
      ...launch.prefixArguments,
      'app-server',
      'generate-ts',
      '--out',
      generatedRoot,
    ],
    { cwd: workspaceRoot, encoding: 'utf8', env: launch.env },
  );
  assert.equal(result.status, 0, result.stderr || result.error?.message);

  const generatedFiles = filesBelow(generatedRoot);
  const generatedSet = new Set(generatedFiles);
  for (const file of filesBelow(committedRoot)) {
    if (!generatedSet.has(file)) rmSync(join(committedRoot, file));
  }
  for (const file of generatedFiles) {
    const target = join(committedRoot, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(generatedRoot, file), target);
  }
  console.log(
    `[codex-protocol] synchronized ${generatedFiles.length} bindings from bundled Codex ${launch.version}`,
  );
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
