import assert from 'node:assert/strict';
import fs, {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { mock } from 'node:test';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';

const evidence = mkdtempSync(
  join(tmpdir(), 'aigame-p32-authoring-publication-'),
);
const projectRoot = join(evidence, 'project');
cpSync(resolve('examples/tank-arena'), projectRoot, {
  recursive: true,
  filter: (path) =>
    !['.git', '.aigame', 'out', 'dist'].includes(basename(path)),
});
const registry = new StudioCommandRegistry({
  projectRoot,
  kernelCliPath: resolve('target/debug/kernelctl.exe'),
});
const relative = 'assets/asset-manifest.json',
  target = join(projectRoot, relative);
const before = readFileSync(target, 'utf8'),
  after = before + '\n';
const originalRename = fs.renameSync;
let observedReplacements = 0;
const probe = mock.method(
  fs,
  'renameSync',
  (...args: Parameters<typeof fs.renameSync>) => {
    originalRename(...args);
    if (
      resolve(String(args[0])) === resolve(target) ||
      resolve(String(args[1])) === resolve(target)
    ) {
      assert(
        existsSync(target),
        'authoritative asset manifest must remain readable between every filesystem operation',
      );
      const content = readFileSync(target, 'utf8');
      assert([before, after].includes(content));
      JSON.parse(content);
      observedReplacements++;
    }
  },
);
syncBuiltinESMExports();
try {
  registry.execute('project.file.write', {
    path: relative,
    content: after,
    baseHash: registry.readText(relative).hash,
  });
  assert.equal(readFileSync(target, 'utf8'), after);
  registry.execute('history.undo');
  assert.equal(readFileSync(target, 'utf8'), before);
  registry.execute('history.redo');
  assert.equal(readFileSync(target, 'utf8'), after);
  assert.equal(observedReplacements, 3);
} finally {
  probe.mock.restore();
  syncBuiltinESMExports();
}
let injected = false;
const denied = mock.method(
  fs,
  'renameSync',
  (...args: Parameters<typeof fs.renameSync>) => {
    if (!injected && resolve(String(args[1])) === resolve(target)) {
      injected = true;
      throw Object.assign(new Error('Injected authoring replacement denied'), {
        code: 'EPERM',
      });
    }
    originalRename(...args);
  },
);
syncBuiltinESMExports();
try {
  assert.throws(
    () =>
      registry.execute('project.file.write', {
        path: relative,
        content: before,
        baseHash: registry.readText(relative).hash,
      }),
    /Injected authoring replacement denied/,
  );
  assert.equal(
    readFileSync(target, 'utf8'),
    after,
    'failed publication preserves previous authority',
  );
  assert.equal(
    readdirSync(join(projectRoot, 'assets')).some(
      (name) => name.endsWith('.aigame-tmp') || name.endsWith('.aigame-old'),
    ),
    false,
    'no leaked publication temporary files',
  );
} finally {
  denied.mock.restore();
  syncBuiltinESMExports();
  registry.dispose();
}
console.log(
  JSON.stringify({
    gate: 'P32 atomic authoring publication',
    result: 'passed',
    observedReplacements,
    failedReplacementPreservedAuthority: true,
    evidence,
  }),
);
