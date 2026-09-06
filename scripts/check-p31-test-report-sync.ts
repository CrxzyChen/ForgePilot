import assert from 'node:assert/strict';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';
import type { ProjectRuntimeResult } from '../studio/runtime/project-script-runtime.ts';
import { externalProjectChange } from '../studio/electron/project-watch-filter.ts';

const repository = resolve(import.meta.dirname, '..');
const evidence = mkdtempSync(
  join(repository, 'artifacts', 'p31-test-report-sync-'),
);
const projectRoot = join(evidence, 'project');
cpSync(join(repository, 'examples', 'tank-arena'), projectRoot, {
  recursive: true,
  filter: (path) =>
    !['.git', '.aigame', 'out', 'dist'].includes(
      path.split(/[\\/]/u).at(-1) ?? '',
    ),
});
mkdirSync(join(projectRoot, 'tests', 'fixtures'), { recursive: true });
writeFileSync(
  join(projectRoot, 'tests', 'fixtures', 'arena.game.json'),
  readFileSync(join(projectRoot, 'scenes', 'main.game.json')),
);
writeFileSync(
  join(projectRoot, 'tests', 'README.md'),
  'Fixtures are not executable tests.',
);
const create = () =>
  new StudioCommandRegistry({
    projectRoot,
    kernelCliPath: join(repository, 'target', 'debug', 'kernelctl.exe'),
    scriptHostPath: join(
      repository,
      'target',
      'debug',
      'project-script-host.exe',
    ),
  });
const ui = create();
const author = create();
const discovery = author.execute('test.discover').data as Array<{
  path: string;
}>;
assert(
  discovery.every((test) => test.path.endsWith('.test.json')),
  'Fixtures and documentation must not be runnable tests',
);
assert(
  !ui
    .snapshot()
    .files.some(
      (file) => file.kind === 'test' && file.path.includes('fixtures'),
    ),
);
const path = 'tests/external.test.json';
writeFileSync(join(projectRoot, path), JSON.stringify({ ticks: 1 }));
const good = author.execute('test.run', { test: path })
  .data as ProjectRuntimeResult;
assert.equal(good.status, 'completed');
const target = good.scene.objects.find((object) => object.id === 'tank:game')!;
const component = target.components.find((c) => c.type === 'tank:game-state')!;
const first = ui.snapshot().testRuns?.[path];
assert(first);
assert.equal(
  first?.status,
  'passed',
  'A separate Studio registry must see the external test result',
);
assert.match(first.testRunId, /^test-run:[a-f0-9]{24}$/u);
assert.equal(
  create().snapshot().testRuns![path]!.testRunId,
  first.testRunId,
  'Results must survive reopening',
);
writeFileSync(
  join(projectRoot, path),
  JSON.stringify({
    ticks: 1,
    assertions: [
      {
        id: 'assertion:wrong',
        tick: 0,
        target: {
          objectId: target.id,
          componentId: component.id,
          field: 'phase',
        },
        operator: 'equals',
        expected: 'impossible',
      },
    ],
  }),
);
const bad = author.execute('test.run', { test: path })
  .data as ProjectRuntimeResult;
assert.equal(bad.status, 'failed');
const latest = ui.snapshot().testRuns![path]!;
assert.equal(
  latest.status,
  'failed',
  'A new external failure must replace the prior passing badge',
);
assert.notEqual(latest.testRunId, first.testRunId);
assert.equal(
  externalProjectChange(
    `.aigame/local/test-results/${latest.testRunId.replace(':', '_')}.json`,
  ),
  `.aigame/local/test-results/${latest.testRunId.replace(':', '_')}.json`,
);
assert.equal(externalProjectChange('.aigame/local/runtime/latest.json'), null);
assert.equal(externalProjectChange('.git/index'), null);
const latestPath = join(
  projectRoot,
  '.aigame/local/test-results',
  `${latest.testRunId.replace(':', '_')}.json`,
);
const damaged = JSON.parse(readFileSync(latestPath, 'utf8'));
damaged.result.status = 'completed';
writeFileSync(latestPath, JSON.stringify(damaged));
assert.equal(
  ui.snapshot().testRuns![path]!.status,
  'unavailable',
  'Damaged history cannot masquerade as success',
);
assert.throws(
  () => author.execute('test.run', { test: 'tests/fixtures/arena.game.json' }),
  { code: 'TEST_FILE_NOT_RUNNABLE' },
);
writeFileSync(
  join(evidence, 'summary.json'),
  JSON.stringify({ ok: true, discovery, first, latest, evidence }, null, 2),
);
console.log(
  JSON.stringify({
    gate: 'P31 shared durable test feedback',
    ok: true,
    evidence,
  }),
);
