import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  activityText,
  projectActivity,
  reduceFeedback,
} from '../studio/electron/copilot-activity.ts';
let state = reduceFeedback(
  undefined,
  'item/started',
  {
    item: {
      id: 'tool:one',
      type: 'mcpToolCall',
      server: 'engine',
      tool: 'runtime.capture',
      arguments: { secret: 'never-show' },
    },
  },
  100,
);
assert.equal(state.items[0].label, 'engine.runtime.capture');
assert(!JSON.stringify(state).includes('never-show'));
state = reduceFeedback(
  state,
  'item/mcpToolCall/progress',
  { itemId: 'tool:one', message: 'GPU ready' },
  200,
);
assert.match(state.items[0].detail, /GPU ready/);
state = reduceFeedback(
  state,
  'item/completed',
  {
    item: {
      id: 'tool:one',
      type: 'mcpToolCall',
      server: 'engine',
      tool: 'runtime.capture',
      status: 'failed',
      error: { token: 'never-show' },
    },
  },
  300,
);
assert.equal(state.items.length, 1);
assert.equal(state.items[0].startedAt, 100);
assert.equal(state.items[0].status, 'failed');
state = reduceFeedback(
  state,
  'item/started',
  {
    item: {
      id: 'cmd:one',
      type: 'commandExecution',
      command: 'npm test',
      status: 'inProgress',
    },
  },
  400,
);
state = reduceFeedback(
  state,
  'item/commandExecution/outputDelta',
  { itemId: 'cmd:one', delta: 'ok\n'.repeat(5000) },
  500,
);
assert(state.items[1].detail.length <= 6000);
state = reduceFeedback(state, 'turn/completed', {}, 600);
assert.equal(state.items[1].status, 'ended');
assert.equal(
  projectActivity({ id: 'private', type: 'reasoning', content: ['hidden'] }, 0),
  null,
);
assert(
  !activityText(
    'api_key=secret-value Bearer private-token sk-private-key',
  ).includes('secret-value'),
);
console.log(
  'Copilot activity projection passed: lifecycle, progress, failure, bounds, redaction, no private reasoning',
);
const capability = readFileSync(
  new URL('../studio/capabilities/capability-registry.ts', import.meta.url),
  'utf8',
);
assert.match(capability, /name: 'rotation',[\s\S]{0,100}unit: 'degrees'/);
