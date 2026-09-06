import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import ts from 'typescript';

const repository = resolve(import.meta.dirname, '..');
const sourcePath = join(
  repository,
  'fixtures',
  'script-host',
  'deterministic-behavior.ts',
);
const source = readFileSync(sourcePath, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.None,
    strict: true,
  },
  fileName: sourcePath,
  reportDiagnostics: true,
});
assert.deepEqual(
  transpiled.diagnostics?.filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  ),
  [],
  'fixture TypeScript must compile without diagnostics',
);

const inputs = [
  {
    tick: 0,
    seed: 42,
    state: { x: 0 },
    events: [],
  },
  {
    tick: 1,
    seed: 42,
    state: { x: 1 },
    events: [{ type: 'fixture:boost', payload: { amount: 9 } }],
  },
];

function runProbe() {
  const result = spawnSync(
    'cargo',
    [
      '--config',
      'http.proxy=""',
      'run',
      '--quiet',
      '-p',
      'ai-game-script-host',
      '--bin',
      'script-host-probe',
    ],
    {
      cwd: repository,
      encoding: 'utf8',
      input: JSON.stringify({ bundle: transpiled.outputText, inputs }),
      windowsHide: true,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as {
    outputs: Array<{
      state: { x: number; sample: number };
      events: Array<{ type: string; payload: Record<string, unknown> }>;
    }>;
    memoryUsedBytes: number;
  };
}

const native = runProbe();
for (let iteration = 0; iteration < 100; iteration += 1) {
  assert.deepEqual(runProbe(), native);
}
assert.equal(native.outputs[0]?.state.x, 1);
assert.equal(native.outputs[1]?.state.x, 11);
assert.deepEqual(native.outputs[1]?.events, [
  {
    type: 'fixture:threshold-reached',
    payload: { value: 2, tick: 1 },
  },
]);
assert.ok(native.memoryUsedBytes > 0);

console.log(
  JSON.stringify(
    {
      gate: 'P14 TypeScript script-host spike',
      fixture: 'fixtures/script-host/deterministic-behavior.ts',
      repeatedRuns: 101,
      finalState: native.outputs.at(-1)?.state,
      memoryUsedBytes: native.memoryUsedBytes,
      result: 'passed',
    },
    null,
    2,
  ),
);
