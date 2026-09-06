import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';
import { StudioChangeSetService } from '../studio/workspace/studio-change-set-service.ts';

// Default: isolated verification only. Original writes require an explicit apply invocation.
assert(
  process.argv[2] && !process.argv[2].startsWith('--'),
  'Pass the Tank project path as the first argument',
);
const source = resolve(process.argv[2]);
const apply = process.argv.includes('--apply');
const evidence = mkdtempSync(resolve('artifacts/tank-angle-units-'));
const projectRoot = apply ? source : join(evidence, 'project');
if (!apply)
  cpSync(source, projectRoot, {
    recursive: true,
    filter: (path) =>
      ![
        '.git',
        '.aigame',
        '.codex',
        '.ai',
        'out',
        'node_modules',
        'dist',
      ].includes(basename(path)),
  });
const registry = new StudioCommandRegistry({
  projectRoot,
  kernelCliPath: resolve('target/debug/kernelctl.exe'),
});
const changes = new StudioChangeSetService({
  projectRoot,
  kernelCliPath: resolve('target/debug/kernelctl.exe'),
  registry,
});
try {
  const paths = [
    'scripts/systems/tank-movement.ts',
    'scripts/systems/weapon.ts',
  ];
  const operations = paths.map((path) => {
    const file = registry.readText(path);
    const expression = 'Math.atan2(direction.y, direction.x) - Math.PI / 2';
    assert.equal(
      file.source.split(expression).length,
      2,
      `${path}: expected one angle expression`,
    );
    return {
      command: 'project.file.write',
      input: {
        path,
        baseHash: file.hash,
        content: file.source.replace(
          expression,
          `(${expression}) * 180 / Math.PI`,
        ),
      },
    };
  });
  const path = 'tests/cardinal-direction.test.json';
  const file = registry.readText(path);
  const test = JSON.parse(file.source);
  let updated = 0;
  for (const assertion of test.assertions) {
    if (
      assertion.target?.field === 'rotation' &&
      typeof assertion.expected === 'number'
    ) {
      assertion.expected = Math.round((assertion.expected * 180) / Math.PI);
      updated++;
    }
  }
  assert.equal(updated, 8);
  operations.push({
    command: 'project.file.write',
    input: {
      path,
      baseHash: file.hash,
      content: JSON.stringify(test, null, 2) + '\n',
    },
  });
  const proposal = changes.propose({
    summary:
      'Fix Tank radians/degrees mismatch; preserve engine degree contract and projectile spawn direction',
    operations,
  });
  assert.equal(proposal.files.length, 3);
  writeFileSync(
    join(evidence, 'preview.json'),
    JSON.stringify(proposal, null, 2),
  );
  // Review exact materialized edits before invoking the normal approval/apply path.
  for (const diff of proposal.files)
    assert(paths.includes(diff.path) || diff.path === path);
  changes.approve(proposal.id);
  changes.apply(proposal.id);
  const results = [];
  for (const testFile of readdirSync(join(projectRoot, 'tests')).filter(
    (name) => name.endsWith('.test.json'),
  )) {
    const result = registry.execute('test.run', { test: `tests/${testFile}` });
    const data = result.data as { status?: string; diagnostics?: unknown };
    assert.equal(
      data.status,
      'completed',
      `${testFile}: ${JSON.stringify(data.diagnostics)}`,
    );
    results.push({ testFile, status: data.status });
  }
  writeFileSync(
    join(evidence, 'result.json'),
    JSON.stringify(
      { projectRoot, apply, changeSetId: proposal.id, results },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      evidence,
      apply,
      changeSetId: proposal.id,
      tests: results.length,
    }),
  );
} finally {
  registry.dispose();
}
