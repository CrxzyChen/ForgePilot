import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { effectiveGenerationApproval } from '../studio/settings/generation-approval-policy.ts';

const projectRoot = resolve('examples/tank-arena');
const context = {
  projectRoot,
  threadId: 'thread-r5',
  goalStatus: 'active',
  completionRunId: 'completion-run:r5',
};
const now = Date.parse('2026-09-05T06:00:00Z');
const defaults = { mode: 'always', autoApproveMaxCny: 1 };
const grant = {
  id: 'generation-grant:r5-explicit-owner',
  projectRoot,
  threadId: 'thread-r5',
  purpose:
    'Complete Round 05 Tank; owner explicitly delegates paid generation.',
  authorizedAt: '2026-09-05T05:30:00Z',
  expiresAt: '2026-09-06T05:30:00Z',
  allowUnknownCost: true,
};
const values = {
  generationApprovalMode: 'always',
  generationAutoApproveMaxCny: 1,
  generationAuthorizations: [grant],
};

assert.deepEqual(effectiveGenerationApproval(values, context, now), {
  mode: 'auto',
  autoApproveMaxCny: 0,
  authorizationId: grant.id,
  completionRunId: context.completionRunId,
});
for (const other of [
  { ...context, projectRoot: resolve('examples/pong-2d') },
  { ...context, projectRoot: null },
  { ...context, threadId: 'another-thread' },
  { ...context, threadId: null },
  { ...context, completionRunId: null },
  ...['complete', 'blocked', 'paused', 'cancelled', null].map((goalStatus) => ({
    ...context,
    goalStatus,
  })),
]) {
  assert.deepEqual(effectiveGenerationApproval(values, other, now), defaults);
}
assert.deepEqual(
  effectiveGenerationApproval(values, context, now + 86_400_000),
  defaults,
);
for (const patch of [
  { id: '' },
  { purpose: '' },
  { authorizedAt: 'not-a-date' },
  { authorizedAt: '2026-09-05T07:00:00Z' },
  { expiresAt: 'not-a-date' },
  { allowUnknownCost: false },
  { revokedAt: '2026-09-05T05:59:00Z' },
]) {
  assert.deepEqual(
    effectiveGenerationApproval(
      { ...values, generationAuthorizations: [{ ...grant, ...patch }] },
      context,
      now,
    ),
    defaults,
  );
}
// An Agent cannot activate a grant by placing it in project routing or permissions.
assert.deepEqual(effectiveGenerationApproval({}, context, now), {
  mode: 'always',
  autoApproveMaxCny: 0,
});
assert.deepEqual(
  effectiveGenerationApproval(
    { generationApprovalMode: 'budget', generationAutoApproveMaxCny: 3 },
    context,
    now,
  ),
  {
    mode: 'budget',
    autoApproveMaxCny: 3,
  },
);
console.log(
  'P32 scoped generation authorization passed: exact project/thread, active Goal, expiry, revocation, unknown-cost consent and default isolation.',
);
