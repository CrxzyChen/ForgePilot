import assert from 'node:assert/strict';
import {
  appendFileSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

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
const candidateHash = createHash('sha256')
  .update(readFileSync(candidatePath))
  .digest('hex');
const sourceKit = join(
  repository,
  'artifacts',
  'round05-human-acceptance',
  `${packageDocument.version}-${candidateHash.slice(0, 12)}`,
);
const temporary = mkdtempSync(join(tmpdir(), 'aigame-r5-validator-fixture-'));
const participantRoot = join(temporary, 'participant');
const observerRoot = join(temporary, 'observer');
const evidenceRoot = join(observerRoot, 'evidence');
const manifestPath = join(temporary, 'ACCEPTANCE-MANIFEST.json');
const resultPath = join(observerRoot, 'OBSERVATION-RESULT.json');
const proofPath = join(observerRoot, 'ACCEPTANCE-PROOF.json');
const validatorPath = join(observerRoot, 'VALIDATE-HUMAN-EVIDENCE.ps1');
const json = <T>(path: string): T =>
  JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/u, '')) as T;

const runValidator = () =>
  spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      validatorPath,
      '-ResultPath',
      resultPath,
      '-EvidenceRoot',
      evidenceRoot,
      '-ManifestPath',
      manifestPath,
      '-ParticipantRoot',
      participantRoot,
      '-ProofPath',
      proofPath,
    ],
    { encoding: 'utf8', windowsHide: true },
  );

try {
  cpSync(join(sourceKit, 'participant'), participantRoot, { recursive: true });
  cpSync(join(sourceKit, 'observer'), observerRoot, { recursive: true });
  const manifest = json<Record<string, unknown>>(
    join(sourceKit, 'ACCEPTANCE-MANIFEST.json'),
  );
  manifest.sourceDirty = false;
  manifest.finalCandidateEligible = true;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const evidenceFiles = [
    'run-record.json',
    'recording.txt',
    'input-project.txt',
    'completed-project.txt',
    'development-package.txt',
    'release-package.txt',
    'tests.json',
    'replay.json',
    'runtime-menu.json',
    'runtime-play.json',
    'runtime-pause.json',
    'runtime-win.json',
    'runtime-lose.json',
    'audit.json',
    'credential-scan.json',
    'package-scan.json',
    'cost-report.json',
  ];
  for (const file of evidenceFiles) {
    writeFileSync(
      join(evidenceRoot, file),
      `${JSON.stringify({ fixture: true, file })}\n`,
    );
  }

  const journey = (id: string) => ({
    started: true,
    completedWithoutHelp: true,
    activeMinutes: 1,
    result: 'PASS',
    recordingTimeRange: `${id}:00-${id}:59`,
    outputArtifactPaths: ['run-record.json'],
  });
  const result = {
    kind: 'ai-game-studio/round05-human-observation-result',
    schemaVersion: '1.0.0',
    observationId: 'R5-VALIDATOR-SYNTHETIC-FIXTURE',
    decision: 'PASS',
    candidate: manifest.candidate,
    inputProject: {
      filename: (manifest.inputProject as { filename: string }).filename,
      sha256: (manifest.inputProject as { sha256: string }).sha256,
    },
    environment: {
      windowsVersion: 'synthetic',
      cleanProfileEvidence: 'synthetic-fixture',
      displayResolution: '1280x720',
      displayScalePercent: 100,
      locale: 'zh-CN',
    },
    participant: {
      identifier: 'synthetic-participant',
      experience: 'synthetic',
      didNotImplementRound05: true,
      neverUsedBuild: true,
    },
    observer: { identifier: 'synthetic-observer' },
    consent: { screenAndVoiceRecording: true },
    timing: {
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: '2026-01-01T00:05:00.000Z',
      activeMinutes: 5,
    },
    journeys: {
      A: journey('A'),
      B: journey('B'),
      C: journey('C'),
      D: journey('D'),
      E: journey('E'),
    },
    checks: {
      cleanWindowsProfile: true,
      noExternalTools: true,
      noCoaching: true,
      studioPlayerParity: true,
      noCredentialLeak: true,
      noPrivateProviderResponseLeak: true,
      allArtifactsCollected: true,
      noDuplicateSideEffects: true,
      budgetIntegrity: true,
      noOpenBlockersOrRetested: true,
      bothPackagesOffline: true,
    },
    counts: {
      coachingEvents: 0,
      forbiddenWorkaroundEvents: 0,
      duplicateSideEffects: 0,
    },
    cost: {
      currency: 'CNY',
      approvedBudget: 1,
      actual: 0.5,
      unknownCostCalls: 0,
      duplicateBilledCalls: 0,
    },
    ids: {
      goalIds: ['goal:fixture'],
      planStepIds: ['plan-step:fixture'],
      toolCallIds: ['tool-call:fixture'],
      jobIds: ['asset-job:fixture'],
      reviewDecisionIds: ['review:fixture'],
      changeSetIds: ['changeset:fixture'],
      runtimeSessionIds: ['runtime-session:fixture'],
      observationIds: [
        'observation:menu',
        'observation:play',
        'observation:pause',
        'observation:win',
        'observation:lose',
      ],
      testRunIds: ['test-run:fixture'],
      buildIds: ['build:development', 'build:release'],
      packageIds: ['package:development', 'package:release'],
    },
    openBlockerIds: [],
    evidenceRefs: {
      runRecordPaths: ['run-record.json'],
      recordingPaths: ['recording.txt'],
      inputProjectArchivePaths: ['input-project.txt'],
      completedProjectArchivePaths: ['completed-project.txt'],
      developmentPackagePaths: ['development-package.txt'],
      releasePackagePaths: ['release-package.txt'],
      testResultPaths: ['tests.json'],
      replayPaths: ['replay.json'],
      runtimeObservationPaths: [
        'runtime-menu.json',
        'runtime-play.json',
        'runtime-pause.json',
        'runtime-win.json',
        'runtime-lose.json',
      ],
      auditExportPaths: ['audit.json'],
      credentialScanPaths: ['credential-scan.json'],
      packageScanPaths: ['package-scan.json'],
      costReportPaths: ['cost-report.json'],
    },
    signatures: {
      observer: 'synthetic-observer',
      participant: 'synthetic-participant',
      signedAt: '2026-01-01T00:06:00.000Z',
    },
    notes: 'Synthetic validator fixture; never human evidence.',
  };
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);

  const accepted = runValidator();
  assert.equal(
    accepted.status,
    0,
    `complete synthetic fixture was rejected: ${accepted.stdout}\n${accepted.stderr}`,
  );
  const proof = json<{ ok: boolean; observationId: string }>(proofPath);
  assert.equal(proof.ok, true);
  assert.equal(proof.observationId, 'R5-VALIDATOR-SYNTHETIC-FIXTURE');

  appendFileSync(
    join(
      participantRoot,
      (manifest.inputProject as { filename: string }).filename,
    ),
    Buffer.from([0]),
  );
  rmSync(proofPath, { force: true });
  const tampered = runValidator();
  assert.notEqual(tampered.status, 0);
  assert.match(
    tampered.stdout,
    /Input project bytes do not match the kit manifest/u,
  );
  assert.equal(
    (() => {
      try {
        readFileSync(proofPath);
        return true;
      } catch {
        return false;
      }
    })(),
    false,
  );

  console.log(
    JSON.stringify(
      {
        gate: 'P33 offline validator synthetic fixture',
        completeFixtureAccepted: true,
        proofContainsOk: true,
        tamperedInputRejected: true,
        humanEvidenceAccepted: false,
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
