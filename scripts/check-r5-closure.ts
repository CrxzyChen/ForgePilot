import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { phases, roadmapMeta } from '../lib/roadmap.ts';

const decision = JSON.parse(
  readFileSync(
    new URL('../docs/rounds/ROUND-05-ACCEPTANCE.json', import.meta.url),
    'utf8',
  ),
);
assert.equal(decision.decision, 'owner-accepted');
assert.equal(decision.closed, true);
assert.equal(decision.independentAcceptance.status, 'deferred');
assert.equal(decision.independentAcceptance.result, 'NOT_RUN');
assert.equal(roadmapMeta.ownerAccepted, true);
assert.match(roadmapMeta.acceptanceSummary, /P33.*延期/);
const p33 = phases.find((p) => p.code === 'P33')!;
assert.notEqual(p33.status, 'completed');
assert(
  p33.tasks.filter((t) => t.label.startsWith('执行')).every((t) => !t.done),
);
assert.match(
  readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8'),
  /roadmapMeta.ownerAccepted/,
);
console.log(
  'R5 owner closure passed; independent P33 evidence remains NOT_RUN.',
);
