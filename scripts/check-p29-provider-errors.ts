import assert from 'node:assert/strict';
import { readElevenLabsProviderFailure } from '../studio/workspace/elevenlabs-provider-error.ts';

const privateMarker = 'PRIVATE_PROVIDER_BODY_MUST_NOT_LEAK';
const cases = [
  [400, { status: 'quota_exceeded' }, 'quota', false],
  [401, { status: 'quota_exceeded' }, 'quota', false],
  [
    402,
    { code: 'insufficient_credits', type: 'payment_required' },
    'quota',
    false,
  ],
  [400, { status: 'invalid_api_key' }, 'missing-credential', false],
  [403, { code: 'insufficient_permissions' }, 'missing-credential', false],
  [403, { code: 'model_access_denied' }, 'unsupported-model', false],
  [400, { status: 'max_character_limit_exceeded' }, 'invalid-parameter', false],
  [422, { type: 'validation_error' }, 'invalid-parameter', false],
  [429, { status: 'too_many_concurrent_requests' }, 'rate-limit', true],
  [429, { code: 'system_busy' }, 'rate-limit', true],
  [400, { code: 'system_busy' }, 'rate-limit', false],
  [429, { code: 'insufficient_credits' }, 'quota', false],
] as const;
for (const [status, detail, category, retryable] of cases) {
  const result = await readElevenLabsProviderFailure(
    Response.json(
      {
        detail: {
          ...detail,
          message: privateMarker,
          request_id: privateMarker,
        },
        api_key: privateMarker,
      },
      { status },
    ),
  );
  assert.equal(result?.category, category);
  assert.equal(result?.retryable, retryable);
  assert.equal(JSON.stringify(result).includes(privateMarker), false);
}
for (const detail of [
  privateMarker,
  null,
  ['quota_exceeded'],
  { code: privateMarker, type: 'payment_required' },
  { status: `quota_exceeded ${privateMarker}` },
  { code: '__proto__' },
  { code: 'constructor' },
  { status: 'unknown_provider_error', message: 'quota_exceeded' },
]) {
  assert.equal(
    await readElevenLabsProviderFailure(
      Response.json({ detail }, { status: 400 }),
    ),
    null,
  );
}
for (const status of [200, 408, 500, 504]) {
  assert.equal(
    await readElevenLabsProviderFailure(
      Response.json({ detail: { status: 'quota_exceeded' } }, { status }),
    ),
    null,
  );
}
assert.equal(
  await readElevenLabsProviderFailure(
    new Response(privateMarker, {
      status: 400,
      headers: { 'content-type': 'application/json' },
    }),
  ),
  null,
);
assert.equal(
  await readElevenLabsProviderFailure(
    new Response('{"detail":{"status":"quota_exceeded"}}', {
      status: 400,
      headers: { 'content-type': 'text/html' },
    }),
  ),
  null,
);
assert.equal(
  await readElevenLabsProviderFailure(new Response(null, { status: 400 })),
  null,
);

let oversizeCancelled = false;
const oversized = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(new Uint8Array(16 * 1024 + 1));
  },
  cancel() {
    oversizeCancelled = true;
  },
});
assert.equal(
  await readElevenLabsProviderFailure(
    new Response(oversized, {
      status: 400,
      headers: { 'content-type': 'application/json' },
    }),
  ),
  null,
);
assert.equal(oversizeCancelled, true);

let stalledCancelled = false;
const stalled = new ReadableStream<Uint8Array>({
  cancel() {
    stalledCancelled = true;
  },
});
const start = performance.now();
assert.equal(
  await readElevenLabsProviderFailure(
    new Response(stalled, {
      status: 400,
      headers: { 'content-type': 'application/json' },
    }),
  ),
  null,
);
assert.equal(stalledCancelled, true);
assert(performance.now() - start < 3000, 'Error body reads must be bounded');

const broken = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.error(new Error(privateMarker));
  },
});
assert.equal(
  await readElevenLabsProviderFailure(
    new Response(broken, {
      status: 400,
      headers: { 'content-type': 'application/json' },
    }),
  ),
  null,
);
console.log(
  JSON.stringify(
    {
      gate: 'P29 safe provider error categories',
      knownCases: cases.length,
      privateBodyExcluded: true,
      unknownCodeRejected: true,
      maxBodyBytes: 16 * 1024,
      maxReadMs: 1000,
      ambiguousTimeoutUnchanged: true,
      result: 'passed',
    },
    null,
    2,
  ),
);
