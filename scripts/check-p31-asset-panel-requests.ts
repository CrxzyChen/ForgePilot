import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  AssetPanelRequests,
  pollAfterCompletion,
} from '../studio/electron/renderer/asset-panel-requests.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const jobs = (sha = 'hash-a', second = true) => [
  {
    id: 'job:one',
    candidates: [
      { id: 'candidate:audio', sha256: sha, mime: 'audio/wav' },
      ...(second
        ? [{ id: 'candidate:image', sha256: 'hash-b', mime: 'image/png' }]
        : []),
    ],
  },
];

let now = 1;
let active = 0;
let peak = 0;
const calls: string[] = [];
const first = deferred<string>();
let published: Record<string, string> = {};
let publications = 0;
const requests = new AssetPanelRequests(
  async (_job, id) => {
    calls.push(id);
    peak = Math.max(peak, ++active);
    const result =
      calls.length === 1 ? await first.promise : `data:${calls.length}`;
    active--;
    return result;
  },
  (value) => {
    published = value;
    publications++;
  },
  () => now,
);

requests.updateCandidates(jobs());
assert.equal(calls.length, 0, 'hidden panel does not decode');
requests.setPreviewActive(true);
for (let i = 0; i < 20; i++) requests.updateCandidates(jobs());
assert.equal(calls.length, 1, 'in-flight candidate is deduplicated');
first.resolve('data:audio');
await flush();
assert.equal(peak, 1, 'media IPC concurrency is bounded');
assert.equal(calls.length, 2);
for (let i = 0; i < 20; i++) requests.updateCandidates(jobs());
requests.setPreviewActive(false);
requests.setPreviewActive(true);
await flush();
assert.equal(calls.length, 2, 'poll and panel re-entry reuse both media kinds');
assert.equal(publications, 2, 'unchanged polls do not republish base64');
requests.updateCandidates(jobs('hash-new', false));
assert.equal(
  published['candidate:audio'],
  undefined,
  'old content hash is invalidated',
);
await flush();
assert.equal(calls.length, 3);
assert.deepEqual(Object.keys(published), ['candidate:audio']);
requests.updateCandidates([
  ...jobs('hash-new', false),
  {
    id: 'job:new',
    candidates: [{ id: 'candidate:new', sha256: 'new', mime: 'audio/mpeg' }],
  },
]);
await flush();
assert.equal(calls.length, 4, 'new candidate is discovered');

let attempts = 0;
const failures = new AssetPanelRequests(
  async () => {
    attempts++;
    if (attempts === 1) throw new Error('missing fixture');
    return 'data:recovered';
  },
  () => {},
  () => now,
);
failures.setPreviewActive(true);
failures.updateCandidates(jobs('hash-a', false));
await flush();
for (let i = 0; i < 50; i++) failures.updateCandidates(jobs('hash-a', false));
assert.equal(attempts, 1, 'failure does not retry every poll');
now += 30_000;
failures.updateCandidates(jobs('hash-a', false));
await flush();
assert.equal(attempts, 2, 'bounded retry can recover');
failures.dispose();

const obsolete = deferred<string>();
let latePublications = 0;
const oldWorkspace = new AssetPanelRequests(
  () => obsolete.promise,
  () => {
    latePublications++;
  },
);
oldWorkspace.setPreviewActive(true);
oldWorkspace.updateCandidates(jobs());
oldWorkspace.dispose();
obsolete.resolve('data:old-project');
await flush();
assert.equal(
  latePublications,
  0,
  'old workspace reply cannot reach new workspace',
);

const suspended = deferred<string>();
let suspendedCalls = 0;
const hidden = new AssetPanelRequests(
  async () => {
    suspendedCalls++;
    return suspended.promise;
  },
  () => {},
);
hidden.setPreviewActive(true);
hidden.updateCandidates(jobs());
hidden.setPreviewActive(false);
suspended.resolve('data:first');
await flush();
assert.equal(suspendedCalls, 1, 'leaving panel stops the remaining queue');
hidden.setPreviewActive(true);
await flush();
assert.equal(suspendedCalls, 2);
hidden.dispose();

const read = deferred<void>();
let readCount = 0;
const running = requests.refresh(async () => {
  readCount++;
  await read.promise;
});
await flush();
for (let i = 0; i < 20; i++)
  assert.equal(
    requests.refresh(async () => {
      readCount++;
    }),
    running,
  );
assert.equal(readCount, 1, 'slow list does not overlap');
read.resolve();
await running;
assert.equal(readCount, 2, 'manual writes get one trailing fresh read');
await assert.rejects(
  requests.refresh(async () => {
    throw new Error('read failed');
  }),
);
await requests.refresh(async () => {
  readCount++;
});
assert.equal(readCount, 3, 'refresh failure does not lock future reads');
requests.dispose();
await requests.refresh(async () => {
  readCount++;
});
assert.equal(readCount, 3);

const slowPoll = deferred<void>();
let polls = 0;
let errors = 0;
const stop = pollAfterCompletion(
  async () => {
    polls++;
    await slowPoll.promise;
  },
  () => {
    errors++;
  },
  5,
);
await sleep(40);
assert.equal(polls, 1, 'slow backend does not accumulate interval work');
stop();
slowPoll.resolve();
await sleep(20);
assert.equal(polls, 1, 'stopping during await does not reschedule');
const stopRecovery = pollAfterCompletion(
  async () => {
    polls++;
    if (polls === 2) throw new Error('one poll failed');
  },
  () => {
    errors++;
  },
  5,
);
await sleep(30);
stopRecovery();
assert.equal(errors, 1);
assert(polls >= 3, 'poll resumes after an error');
console.log(
  JSON.stringify(
    {
      gate: 'P31 asset panel request lifecycle',
      cache: 'hash-bound image/audio',
      maxPreviewConcurrency: peak,
      slowPollSingleFlight: true,
      trailingRefresh: true,
      retryCooldownMs: 30000,
      staleWorkspaceSuppressed: true,
      result: 'passed',
    },
    null,
    2,
  ),
);
