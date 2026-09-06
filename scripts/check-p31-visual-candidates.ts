import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

type ImageBrief = {
  id: string;
  kind: 'image';
  assetId: string;
  outputName: string;
  transparent: boolean;
  review: string[];
};

type Candidate = {
  id: string;
  artifactId: string;
  path: string;
  sha256: string;
  mime: string;
  bytes: number;
  media: {
    kind: string;
    width: number;
    height: number;
    format: string;
    hasAlpha: boolean;
  };
  reviewState: string;
  decision: unknown;
  recommendation: { recommended: boolean; evidenceIds: string[] };
};

type AssetJob = {
  id: string;
  idempotencyKey: string;
  executionSource: string;
  kind: string;
  requestedKind: string;
  providerId: string;
  modelId: string;
  endpointClass: string;
  outputName: string;
  status: string;
  candidates: Candidate[];
  selectedCandidateId: string | null;
  importedAssetId: string | null;
  importChangeSetId: string | null;
  reviewDecisionId: string | null;
  providerOperationId: string;
};

const projectRoot = resolve(process.cwd(), 'examples', 'tank-arena');
const briefPath = join(
  projectRoot,
  'assets',
  'briefs',
  'tank-completion-v1.json',
);
const jobsPath = join(
  projectRoot,
  '.aigame',
  'local',
  'asset-jobs',
  'jobs.json',
);
const candidateRoot = resolve(
  projectRoot,
  '.aigame',
  'local',
  'asset-candidates',
  'p31-neon-bastion',
);
const json = <T>(path: string): T =>
  JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/u, '')) as T;
const digest = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');

const briefDocument = json<{
  id: string;
  artDirectionSkill: string;
  artDirectionVersion: string;
  resources: Array<ImageBrief | { kind: string }>;
}>(briefPath);
const jobDocument = json<{ schemaVersion: string; jobs: AssetJob[] }>(jobsPath);
const imageBriefs = briefDocument.resources.filter(
  (resource): resource is ImageBrief => resource.kind === 'image',
);

assert.equal(briefDocument.id, 'asset-brief:tank-completion-v1');
assert.equal(briefDocument.artDirectionVersion, '1.0.0');
assert.equal(imageBriefs.length, 9);
assert.equal(jobDocument.schemaVersion, '1.0.0');

const results: Array<Record<string, unknown>> = [];
const candidateIds = new Set<string>();
const artifactIds = new Set<string>();
const jobIds = new Set<string>();
const idempotencyKeys = new Set<string>();

for (const brief of imageBriefs) {
  const matchingJobs = jobDocument.jobs.filter(
    (job) =>
      job.executionSource === 'codex-media-tool' &&
      job.outputName === brief.outputName,
  );
  assert.equal(
    matchingJobs.length,
    1,
    `${brief.id} needs exactly one Codex job`,
  );
  const job = matchingJobs[0];
  assert(job);
  assert.match(job.id, /^asset-job:[0-9a-f-]{36}$/u);
  assert.equal(jobIds.has(job.id), false);
  jobIds.add(job.id);
  assert.match(job.idempotencyKey, /^idem:p31_image_[a-z0-9_]+$/u);
  assert.equal(idempotencyKeys.has(job.idempotencyKey), false);
  idempotencyKeys.add(job.idempotencyKey);
  assert.equal(job.kind, 'image');
  assert.equal(job.requestedKind, 'image');
  assert.equal(job.providerId, 'openai');
  assert.equal(job.modelId, 'codex-managed-imagegen');
  assert.equal(job.endpointClass, 'local');
  assert.equal(job.status, 'awaitingReview');
  assert.equal(job.selectedCandidateId, null);
  assert.equal(job.importedAssetId, null);
  assert.equal(job.importChangeSetId, null);
  assert.equal(job.reviewDecisionId, null);
  assert.equal(
    job.providerOperationId,
    `tool-call:p31/${brief.outputName.slice(0, -4)}`,
  );
  assert.equal(job.candidates.length, 1);

  const candidate = job.candidates[0];
  assert(candidate);
  assert.match(candidate.id, /^candidate:[0-9a-f-]{36}$/u);
  assert.equal(candidateIds.has(candidate.id), false);
  candidateIds.add(candidate.id);
  assert.match(candidate.artifactId, /^artifact:[0-9a-f-]{36}$/u);
  assert.equal(artifactIds.has(candidate.artifactId), false);
  artifactIds.add(candidate.artifactId);
  assert.equal(candidate.reviewState, 'awaitingReview');
  assert.equal(candidate.decision, null);
  assert.equal(candidate.recommendation.recommended, true);
  assert(candidate.recommendation.evidenceIds.includes(brief.id));
  assert(
    candidate.recommendation.evidenceIds.includes(
      'evidence:p31-tank-foundation',
    ),
  );

  const candidatePath = resolve(projectRoot, candidate.path);
  const containedPrefix = candidateRoot.endsWith(sep)
    ? candidateRoot
    : `${candidateRoot}${sep}`;
  assert(
    candidatePath.startsWith(containedPrefix),
    `${brief.id} candidate escaped the local review area`,
  );
  assert.equal(dirname(candidatePath), candidateRoot);
  assert.equal(relative(candidateRoot, candidatePath), brief.outputName);
  const bytes = readFileSync(candidatePath);
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
    `${brief.id} is not a PNG`,
  );
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  const hasAlphaChannel = colorType === 4 || colorType === 6;
  assert.equal(width, candidate.media.width);
  assert.equal(height, candidate.media.height);
  assert.equal(bitDepth, 8);
  assert.equal(hasAlphaChannel, brief.transparent);
  assert.equal(candidate.media.hasAlpha, brief.transparent);
  assert.equal(candidate.media.kind, 'image');
  assert.equal(candidate.media.format, 'png');
  assert.equal(candidate.mime, 'image/png');
  assert.equal(candidate.bytes, bytes.byteLength);
  assert.equal(candidate.sha256, digest(bytes));
  assert.match(candidate.sha256, /^[a-f0-9]{64}$/u);
  assert(width >= 512 && height >= 512);
  assert(brief.review.length >= 2);

  results.push({
    briefId: brief.id,
    assetId: brief.assetId,
    jobId: job.id,
    candidateId: candidate.id,
    artifactId: candidate.artifactId,
    path: candidate.path,
    sha256: candidate.sha256,
    width,
    height,
    hasAlphaChannel,
    reviewState: candidate.reviewState,
    humanSelectionRequired: true,
  });
}

assert.equal(results.length, 9);
console.log(
  JSON.stringify(
    {
      gate: 'P31 visual candidate technical readiness',
      artDirectionSkill: briefDocument.artDirectionSkill,
      artDirectionVersion: briefDocument.artDirectionVersion,
      candidateCount: results.length,
      allCandidatesRemainOutsideProjectAuthority: true,
      allCandidatesAwaitHumanSelection: true,
      candidates: results,
      result: 'passed',
    },
    null,
    2,
  ),
);
