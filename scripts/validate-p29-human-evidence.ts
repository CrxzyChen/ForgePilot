import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const path = resolve(
  process.argv[2] ?? 'docs/testing/evidence/P29-HUMAN-RESULT.json',
);
assert(existsSync(path), `P29 human result not found: ${path}`);
const result = JSON.parse(readFileSync(path, 'utf8')) as {
  schemaVersion?: string;
  participant?: { id?: string; didNotImplementP29?: boolean };
  startedAt?: string;
  endedAt?: string;
  journeyB?: Record<string, boolean | number>;
  forbiddenWorkarounds?: Record<string, boolean>;
  secretObserved?: boolean;
  blockers?: unknown[];
  evidence?: {
    recordingPath?: string;
    transcriptPath?: string;
    assetJobIds?: string[];
    changeSetIds?: string[];
  };
  outcome?: string;
  signoff?: { name?: string; at?: string };
};

assert.equal(result.schemaVersion, '1.0.0');
assert(result.participant?.id?.trim(), 'participant id is required');
assert.equal(result.participant?.didNotImplementP29, true);
assert.match(result.startedAt ?? '', /^\d{4}-\d{2}-\d{2}T/u);
assert.match(result.endedAt ?? '', /^\d{4}-\d{2}-\d{2}T/u);
const journey = result.journeyB ?? {};
for (const item of [
  'capabilityOnlyImageRequested',
  'perCallApprovalObserved',
  'candidateRejected',
  'candidateSelected',
  'importChangeSetReviewed',
  'importApplied',
  'provenanceInspected',
  'importRolledBack',
  'soundEffectPlayed',
  'jobCancelled',
  'transientFailureRetried',
  'budgetPolicyObserved',
]) {
  assert.equal(journey[item], true, `Journey B item did not pass: ${item}`);
}
assert(
  Number(journey.imageCandidatesCompared) >= 2,
  'at least two image candidates must be compared',
);
for (const [name, used] of Object.entries(result.forbiddenWorkarounds ?? {})) {
  assert.equal(used, false, `forbidden workaround used: ${name}`);
}
assert.equal(result.secretObserved, false, 'a credential secret was observed');
assert.deepEqual(result.blockers, [], 'P29 human blockers remain open');
assert.match(result.evidence?.recordingPath ?? '', /\S/u);
assert.match(result.evidence?.transcriptPath ?? '', /\S/u);
assert((result.evidence?.assetJobIds?.length ?? 0) >= 3);
assert((result.evidence?.changeSetIds?.length ?? 0) >= 1);
assert.equal(result.outcome, 'passed');
assert(result.signoff?.name?.trim(), 'participant signoff is required');
assert.match(result.signoff?.at ?? '', /^\d{4}-\d{2}-\d{2}T/u);

console.log(
  JSON.stringify(
    {
      gate: 'P29 independent human Journey B',
      participant: result.participant.id,
      assetJobs: result.evidence?.assetJobIds?.length,
      changeSets: result.evidence?.changeSetIds?.length,
      result: 'passed',
    },
    null,
    2,
  ),
);
