import assert from 'node:assert/strict';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ProjectScriptRuntime } from '../studio/runtime/project-script-runtime.ts';

const temporary = mkdtempSync(join(tmpdir(), 'aigame-compile-cache-'));
const root = join(temporary, 'pong');
const host = resolve('target/debug/project-script-host.exe');
try {
  cpSync(resolve('examples/pong-2d'), root, { recursive: true });
  const runtime = new ProjectScriptRuntime({
    projectRoot: root,
    scriptHostPath: host,
  });
  const baseline = runtime.compile();
  assert.deepEqual(runtime.compile(), baseline);
  const sourcePath = join(root, baseline.modules[0]!.source);
  const original = readFileSync(sourcePath, 'utf8');
  const stamp = statSync(sourcePath);
  const revised = original.replace('-0.8 : 0.8', '-0.4 : 0.4');
  assert.notEqual(revised, original);
  assert.equal(revised.length, original.length);
  writeFileSync(sourcePath, revised);
  utimesSync(sourcePath, stamp.atime, stamp.mtime);
  const changed = runtime.compile();
  assert.notEqual(changed.metadata.outputHash, baseline.metadata.outputHash);
  assert.notEqual(
    changed.metadata.moduleHashes[baseline.modules[0]!.id],
    baseline.metadata.moduleHashes[baseline.modules[0]!.id],
  );
  assert.deepEqual(
    changed,
    new ProjectScriptRuntime({
      projectRoot: root,
      scriptHostPath: host,
    }).compile(),
  );
  const validChanged = structuredClone(changed);
  changed.modules[0]!.code = 'untrusted caller mutation';
  changed.manifest.modules.length = 0;
  changed.metadata.outputHash = 'caller-mutated';
  assert.deepEqual(runtime.compile(), validChanged);
  writeFileSync(sourcePath, 'export default { invalid: ;');
  assert.throws(
    () => runtime.compile(),
    (error: unknown) =>
      (error as { code?: string }).code === 'SCRIPT_COMPILE_FAILED',
  );
  writeFileSync(sourcePath, original);
  assert.deepEqual(runtime.compile(), baseline);
  const manifestPath = join(root, 'scripts/runtime.json');
  const manifestText = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestText);
  manifest.modules = [...manifest.modules, manifest.modules[0]];
  writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.throws(() => runtime.compile());
  writeFileSync(manifestPath, manifestText);
  const replay = JSON.parse(
    readFileSync(join(root, 'replays/smoke.replay.json'), 'utf8'),
  );
  const options = {
    ticks: 60,
    seed: 20260902,
    inputs: replay.inputs ?? [],
    persistTrace: false,
  };
  const first = runtime.run(options);
  const second = runtime.run(options);
  assert.equal(first.status, 'completed');
  assert.equal(second.stateHash, first.stateHash);
  assert.deepEqual(
    second.snapshots.map((s) => s.stateHash),
    first.snapshots.map((s) => s.stateHash),
  );
  console.log(
    JSON.stringify({
      gate: 'p18-compile-cache',
      status: 'passed',
      sameSizeSameMtimeEdit: true,
      callerIsolation: true,
      errorRecovery: true,
      snapshotParity: true,
    }),
  );
} finally {
  assert(temporary.startsWith(join(tmpdir(), 'aigame-compile-cache-')));
  rmSync(temporary, { recursive: true, force: true });
}
