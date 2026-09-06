import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repository = resolve(process.cwd());
const packageDocument = JSON.parse(
  readFileSync(join(repository, 'package.json'), 'utf8'),
) as { version: string };
const candidateName = `AI-Game-Studio-${packageDocument.version}-win-x64.zip`;
const candidatePath = join(
  repository,
  'artifacts',
  'studio-windows',
  candidateName,
);
const sha256 = (path: string) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

assert(existsSync(candidatePath), `missing Studio candidate: ${candidatePath}`);
const candidateHash = sha256(candidatePath);
const kitRoot = join(
  repository,
  'artifacts',
  'round05-human-acceptance',
  `${packageDocument.version}-${candidateHash.slice(0, 12)}`,
);
const participantRoot = join(kitRoot, 'participant');
const observerRoot = join(kitRoot, 'observer');
const manifestPath = join(kitRoot, 'ACCEPTANCE-MANIFEST.json');
const json = <T>(path: string): T =>
  JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/u, '')) as T;

assert(existsSync(manifestPath), 'acceptance manifest was not prepared');
const manifest = json<{
  kind: string;
  version: string;
  sourceCommit: string;
  sourceDirty: boolean;
  buildSource: { commit: string; dirty: boolean; contentSha256: string } | null;
  finalCandidateEligible: boolean;
  candidate: { filename: string; sha256: string };
  inputProject: {
    filename: string;
    sha256: string;
    sourceTreeSha256: string;
    fileCount: number;
  };
  participantFiles: string[];
  observerFiles: string[];
  machineEvidenceFiles: string[];
  roleSeparation: Record<string, boolean>;
  blocker: string;
}>(manifestPath);
assert.equal(manifest.kind, 'ai-game-studio/round05-human-acceptance-kit');
assert.equal(manifest.version, packageDocument.version);
assert.match(manifest.sourceCommit, /^[a-f0-9]{40}$/u);
assert.equal(manifest.candidate.filename, candidateName);
assert.equal(manifest.candidate.sha256, candidateHash);
assert.equal(
  sha256(join(participantRoot, manifest.candidate.filename)),
  candidateHash,
);
assert.equal(
  sha256(join(participantRoot, manifest.inputProject.filename)),
  manifest.inputProject.sha256,
);
assert.match(manifest.inputProject.sourceTreeSha256, /^[a-f0-9]{64}$/u);
assert(manifest.inputProject.fileCount > 0);
assert(
  Object.values(manifest.roleSeparation).every(Boolean),
  'role separation flags must all be true',
);
assert(
  manifest.participantFiles.every((path) => path.startsWith('participant/')),
);
assert(manifest.observerFiles.every((path) => path.startsWith('observer/')));
assert(
  manifest.machineEvidenceFiles.every((path) =>
    path.startsWith('observer/machine-evidence/'),
  ),
);
for (const path of [
  ...manifest.participantFiles,
  ...manifest.observerFiles,
  ...manifest.machineEvidenceFiles,
]) {
  assert(existsSync(join(kitRoot, path)), `missing kit file: ${path}`);
}
for (const forbidden of [
  'OBSERVATION-PROTOCOL.md',
  'OBSERVER-RUN-RECORD.md',
  'OBSERVATION-RESULT.json',
  'VALIDATE-HUMAN-EVIDENCE.ps1',
]) {
  assert.equal(existsSync(join(participantRoot, forbidden)), false);
}

const participantTasks = readFileSync(
  join(participantRoot, 'PARTICIPANT-TASKS.md'),
  'utf8',
);
for (const marker of [
  'Canonical goal',
  'Journey A',
  'Journey B',
  'Journey C',
  'Journey D',
  'Journey E',
  'Do not use a terminal',
]) {
  assert(
    participantTasks.includes(marker),
    `participant sheet omitted ${marker}`,
  );
}
assert.equal(participantTasks.includes('Pass conditions:'), false);
assert.equal(participantTasks.includes('blocker —'), false);

const resultPath = join(observerRoot, 'OBSERVATION-RESULT.json');
const result = json<{
  decision: string;
  candidate: { sha256: string };
  inputProject: { sha256: string };
  journeys: Record<string, { result: string }>;
  openBlockerIds: string[];
}>(resultPath);
assert.equal(result.decision, 'RETEST_REQUIRED');
assert.equal(result.candidate.sha256, candidateHash);
assert.equal(result.inputProject.sha256, manifest.inputProject.sha256);
assert.deepEqual(Object.keys(result.journeys), ['A', 'B', 'C', 'D', 'E']);
assert(
  Object.values(result.journeys).every(
    (journey) => journey.result === 'NOT_RUN',
  ),
);
assert.deepEqual(result.openBlockerIds, ['R5-OBS-001']);

const repeatedPreparation = spawnSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    join(repository, 'scripts', 'prepare-round05-human-acceptance.ps1'),
  ],
  { encoding: 'utf8', windowsHide: true },
);
assert.equal(
  repeatedPreparation.status,
  0,
  `repeated acceptance-kit preparation failed: ${repeatedPreparation.stderr}`,
);
const repeatedManifest = json<typeof manifest>(manifestPath);
assert.equal(
  repeatedManifest.inputProject.sha256,
  manifest.inputProject.sha256,
  'identical Tank input must produce an identical archive hash',
);
assert.equal(
  repeatedManifest.inputProject.sourceTreeSha256,
  manifest.inputProject.sourceTreeSha256,
);
assert.equal(
  repeatedManifest.inputProject.fileCount,
  manifest.inputProject.fileCount,
);

const proofPath = join(observerRoot, 'ACCEPTANCE-PROOF.json');
rmSync(proofPath, { force: true });
const validation = spawnSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    join(observerRoot, 'VALIDATE-HUMAN-EVIDENCE.ps1'),
    '-ResultPath',
    resultPath,
    '-EvidenceRoot',
    join(observerRoot, 'evidence'),
    '-ManifestPath',
    manifestPath,
    '-ParticipantRoot',
    participantRoot,
    '-ProofPath',
    proofPath,
  ],
  { encoding: 'utf8', windowsHide: true },
);
assert.notEqual(
  validation.status,
  0,
  'an unperformed human run must never validate',
);
assert.match(validation.stdout, /result\.decision must be PASS/u);
assert.match(validation.stdout, /journeys\.A\.result must be PASS/u);
assert.equal(existsSync(proofPath), false);

const eligibleExpectation =
  !manifest.sourceDirty &&
  manifest.buildSource !== null &&
  packageDocument.version.startsWith('0.4.0-preview');
assert.equal(manifest.finalCandidateEligible, eligibleExpectation);
if (manifest.finalCandidateEligible) {
  assert.equal(manifest.buildSource?.commit, manifest.sourceCommit);
  assert.equal(manifest.buildSource?.dirty, false);
  assert.match(manifest.buildSource?.contentSha256 ?? '', /^[a-f0-9]{64}$/u);
}
assert.match(manifest.blocker, /R5-OBS-001/u);

console.log(
  JSON.stringify(
    {
      gate: 'P33 role-separated independent acceptance kit',
      kitRoot,
      candidate: basename(candidatePath),
      candidateSha256: candidateHash,
      inputProjectSha256: manifest.inputProject.sha256,
      inputProjectSourceTreeSha256: manifest.inputProject.sourceTreeSha256,
      inputProjectFileCount: manifest.inputProject.fileCount,
      deterministicInputArchive: true,
      roleSeparated: true,
      offlineValidatorRejectsIncompleteRun: true,
      sourceDirty: manifest.sourceDirty,
      finalCandidateEligible: manifest.finalCandidateEligible,
      humanEvidenceAccepted: false,
      blocker: manifest.blocker,
      result: 'passed',
    },
    null,
    2,
  ),
);
