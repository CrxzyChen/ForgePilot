import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';

import {
  demoOperations,
  initialStudioState,
  studioReducer,
} from '../lib/studio-model.ts';
import { createStudioBridge } from '../examples/tank-legacy-regression/studio-server/http-control-server.ts';

let state = studioReducer(initialStudioState, {
  type: 'plan',
  operations: demoOperations,
});
assert.equal(state.status, 'planned');
state = studioReducer(state, {
  type: 'toggle-operation',
  id: 'operation:production',
});
assert.equal(studioReducer(state, { type: 'approve' }).status, 'planned');
state = studioReducer(state, {
  type: 'toggle-operation',
  id: 'operation:production',
});
state = studioReducer(state, { type: 'approve' });
assert.equal(state.status, 'approved');
state = studioReducer(state, { type: 'apply' });
assert.equal(state.status, 'applied');
state = studioReducer(state, { type: 'run' });
assert.equal(state.status, 'verified');
assert.equal(state.tick, 35);
assert.ok(state.tests.every((test) => test.status === 'passed'));
state = studioReducer(state, { type: 'pause' });
state = studioReducer(state, { type: 'step' });
assert.equal(state.tick, 36);
state = studioReducer(state, { type: 'rollback' });
assert.equal(state.status, 'rolledBack');

const source = readFileSync('app/studio/page.tsx', 'utf8');
for (const capability of [
  'Agent activity',
  'ChangeSet diff',
  'Snapshot timeline',
  'Tests &',
  '批准选中项',
  '回滚',
]) {
  assert.ok(source.includes(capability), `Studio UI is missing ${capability}`);
}

const bridge = createStudioBridge({
  workspaceRoot: process.cwd(),
  kernelRoot: process.cwd(),
});
await new Promise<void>((resolve, reject) => {
  bridge.server.once('error', reject);
  bridge.server.listen(0, '127.0.0.1', resolve);
});
try {
  const address = bridge.server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}`;
  const health = (await fetch(`${base}/health`).then((response) =>
    response.json(),
  )) as { ok: boolean };
  assert.equal(health.ok, true);
  const queried = await fetch(`${base}/rpc`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://127.0.0.1:3000',
    },
    body: JSON.stringify({
      id: 1,
      method: 'project.query',
      params: {
        projectPath:
          'examples/tank-legacy-regression/examples/minimal.game.json',
        pointer: '/name',
      },
    }),
  });
  assert.equal(
    queried.headers.get('access-control-allow-origin'),
    'http://127.0.0.1:3000',
  );
  const payload = (await queried.json()) as { result: unknown };
  assert.equal(payload.result, 'Frontier');
} finally {
  await bridge.close();
}

console.log('[P5] Studio supervision workflow and localhost bridge passed');
