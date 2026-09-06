import assert from 'node:assert/strict';
import fs, {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { mock } from 'node:test';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { ProjectError } from '../studio/project/project-types.ts';
import { StudioChangeSetService } from '../studio/workspace/studio-change-set-service.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';

const repository = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), 'aigame-p32-changeset-'));
const projectRoot = join(temporary, 'project');
const kernelCliPath = join(repository, 'target', 'debug', 'kernelctl.exe');

try {
  cpSync(join(repository, 'examples', 'tank-arena'), projectRoot, {
    recursive: true,
    filter: (source) =>
      !['.git', '.aigame', 'out', 'dist'].includes(
        source.split(/[\\/]/u).at(-1) ?? '',
      ),
  });
  let registry = new StudioCommandRegistry({ projectRoot, kernelCliPath });
  let changes = new StudioChangeSetService({
    projectRoot,
    kernelCliPath,
    registry,
  });

  const rejected = changes.propose({
    summary: 'P32 rejected fixture with actionable review evidence',
    operations: [
      {
        command: 'project.file.create',
        input: {
          path: 'notes/rejected-fixture.txt',
          content: 'must not be applied\n',
        },
      },
    ],
  });
  const feedback = {
    proposalHash: rejected.proposalHash,
    reason:
      'Tick 0: fixture is missing the UI object required by its active system.',
  };
  const feedbackError = (code: string) => (error: unknown) =>
    error instanceof ProjectError && error.code === code;
  assert.throws(
    () => changes.recordRejectionFeedback(rejected.id, feedback),
    feedbackError('CHANGESET_NOT_REJECTED'),
  );
  changes.reject(rejected.id);
  assert.throws(
    () =>
      changes.recordRejectionFeedback(rejected.id, {
        ...feedback,
        proposalHash: '0'.repeat(64),
      }),
    feedbackError('CHANGESET_REVIEW_STALE'),
  );
  for (const reason of ['', ' ', 'x'.repeat(4097), 'bad\u0000reason']) {
    assert.throws(
      () =>
        changes.recordRejectionFeedback(rejected.id, { ...feedback, reason }),
      feedbackError('CHANGESET_FEEDBACK_INVALID'),
    );
  }
  const reviewed = changes.recordRejectionFeedback(rejected.id, feedback);
  assert.equal(reviewed.status, 'rejected');
  assert.equal(reviewed.approval, null);
  assert.equal(reviewed.rejectionFeedback?.reason, feedback.reason);
  assert.equal(reviewed.rejectionFeedback?.proposalHash, rejected.proposalHash);
  assert.match(
    reviewed.rejectionFeedback?.id ?? '',
    /^review-feedback:[0-9a-f]{64}$/u,
  );
  const auditAfterFeedback = readFileSync(
    join(projectRoot, '.aigame/audit.jsonl'),
    'utf8',
  );
  assert.deepEqual(
    changes.recordRejectionFeedback(rejected.id, feedback),
    reviewed,
  );
  assert.equal(
    readFileSync(join(projectRoot, '.aigame/audit.jsonl'), 'utf8'),
    auditAfterFeedback,
  );
  assert.throws(
    () =>
      changes.recordRejectionFeedback(rejected.id, {
        ...feedback,
        reason: 'rewrite old review',
      }),
    feedbackError('CHANGESET_FEEDBACK_IMMUTABLE'),
  );
  assert.equal(
    new StudioChangeSetService({ projectRoot, kernelCliPath, registry }).read(
      rejected.id,
    ).rejectionFeedback?.reason,
    feedback.reason,
  );
  assert.throws(
    () => changes.apply(rejected.id),
    feedbackError('CHANGESET_APPROVAL_REQUIRED'),
  );
  assert.equal(
    existsSync(join(projectRoot, 'notes/rejected-fixture.txt')),
    false,
  );
  assert.match(auditAfterFeedback, /changeset.rejection-feedback/u);
  // Leave the historical rejected record available; later checks count only their own proposals.

  const createdPath = 'notes/p32-owned.txt';
  assert.throws(
    () =>
      changes.propose({
        summary: 'Invalid write of a missing file',
        operations: [
          {
            command: 'project.file.write',
            input: { path: createdPath, content: 'must not appear\n' },
          },
        ],
      }),
    (error: unknown) => {
      if (!(error instanceof ProjectError)) return false;
      const details = error.details as Record<string, unknown> | undefined;
      return (
        error.code === 'WORKSPACE_FILE_NOT_FOUND' &&
        details?.path === createdPath &&
        details?.suggestedCommand === 'project.file.create'
      );
    },
    'A missing-file write must tell the agent how to create a file',
  );
  assert.equal(existsSync(join(projectRoot, createdPath)), false);
  assert.equal(changes.list().length, 1);
  const createChange = changes.propose({
    summary: 'P32 create an owned file',
    operations: [
      {
        command: 'project.file.create',
        input: { path: createdPath, content: 'ChangeSet-owned bytes\n' },
      },
    ],
  });
  const storedChangePath = join(
    projectRoot,
    '.aigame',
    'local',
    'changes',
    `${createChange.id.replace(':', '_')}.json`,
  );
  const originalRename = fs.renameSync;
  const renameProbe = mock.method(
    fs,
    'renameSync',
    (...args: Parameters<typeof fs.renameSync>) => {
      originalRename(...args);
      assert.ok(
        existsSync(storedChangePath),
        'concurrent readers must never see a missing ChangeSet during replacement',
      );
    },
  );
  syncBuiltinESMExports();
  try {
    changes.approve(createChange.id);
  } finally {
    renameProbe.mock.restore();
    syncBuiltinESMExports();
  }
  changes.apply(createChange.id);
  assert.equal(existsSync(join(projectRoot, createdPath)), true);
  assert.throws(
    () => changes.apply(createChange.id),
    (error: unknown) =>
      error instanceof ProjectError &&
      error.code === 'CHANGESET_APPROVAL_REQUIRED',
  );

  let validationOk = true;
  let replayStatus = 'failed';
  const originalExecute = registry.execute.bind(registry);
  const testProbe = mock.method(
    registry,
    'execute',
    (...args: Parameters<typeof registry.execute>) => {
      if (args[0] === 'project.validate' || args[0] === 'test.run')
        return {
          command: args[0],
          changed: false,
          message: 'Injected non-throwing test outcome',
          data:
            args[0] === 'project.validate'
              ? { ok: validationOk }
              : {
                  status: replayStatus,
                  diagnostics:
                    replayStatus === 'failed'
                      ? [
                          {
                            code: 'TEST_ASSERTION_FAILED',
                            severity: 'error',
                            message: 'Wrong expected state',
                          },
                        ]
                      : [],
                },
        } as ReturnType<typeof registry.execute>;
      return originalExecute(...args);
    },
  );
  try {
    const failed = changes.test(createChange.id);
    assert.equal(
      failed.status,
      'failed',
      'Non-throwing failed runtime result cannot certify a ChangeSet',
    );
    assert.equal(failed.testResult?.ok, false);
    assert.match(
      JSON.stringify(failed.testResult?.diagnostics),
      /TEST_ASSERTION_FAILED/,
    );
    replayStatus = 'completed';
    validationOk = false;
    assert.equal(
      changes.test(createChange.id).testResult?.ok,
      false,
      'Validation failure must remain a failed check',
    );
    validationOk = true;
    assert.equal(changes.test(createChange.id).status, 'tested');
  } finally {
    testProbe.mock.restore();
  }

  const unrelatedPath = join(projectRoot, 'notes', 'human-unrelated.txt');
  mkdirSync(dirname(unrelatedPath), { recursive: true });
  writeFileSync(unrelatedPath, 'human work must survive\n', 'utf8');
  registry.dispose();
  registry = new StudioCommandRegistry({ projectRoot, kernelCliPath });
  changes = new StudioChangeSetService({
    projectRoot,
    kernelCliPath,
    registry,
  });
  const rolledBack = changes.rollback(createChange.id);
  assert.equal(rolledBack.status, 'rolledBack');
  assert.equal(existsSync(join(projectRoot, createdPath)), false);
  assert.equal(
    readFileSync(unrelatedPath, 'utf8'),
    'human work must survive\n',
  );

  const conflictPath = join(projectRoot, 'notes', 'human-conflict.txt');
  writeFileSync(conflictPath, 'original bytes\n', 'utf8');
  const current = registry.readText('notes/human-conflict.txt');
  const conflictChange = changes.propose({
    summary: 'P32 update one owned file',
    operations: [
      {
        command: 'project.file.write',
        input: {
          path: 'notes/human-conflict.txt',
          content: 'approved ChangeSet bytes\n',
          baseHash: current.hash,
        },
      },
    ],
  });
  const conflictRecordPath = join(
    projectRoot,
    '.aigame',
    'local',
    'changes',
    `${conflictChange.id.replace(':', '_')}.json`,
  );
  const previousRecord = readFileSync(conflictRecordPath, 'utf8');
  const deniedReplacement = mock.method(
    fs,
    'renameSync',
    (...args: Parameters<typeof fs.renameSync>) => {
      if (String(args[1]) === conflictRecordPath)
        throw Object.assign(new Error('Injected replacement failure'), {
          code: 'EPERM',
        });
      return originalRename(...args);
    },
  );
  syncBuiltinESMExports();
  try {
    assert.throws(
      () => changes.approve(conflictChange.id),
      /Injected replacement failure/,
    );
    assert.equal(
      readFileSync(conflictRecordPath, 'utf8'),
      previousRecord,
      'failed replacement must preserve the original reviewable record',
    );
    assert.equal(changes.read(conflictChange.id).status, 'awaitingApproval');
  } finally {
    deniedReplacement.mock.restore();
    syncBuiltinESMExports();
  }
  changes.approve(conflictChange.id);
  changes.apply(conflictChange.id);
  writeFileSync(conflictPath, 'later human bytes\n', 'utf8');
  registry.dispose();
  registry = new StudioCommandRegistry({ projectRoot, kernelCliPath });
  changes = new StudioChangeSetService({
    projectRoot,
    kernelCliPath,
    registry,
  });
  assert.throws(
    () => changes.rollback(conflictChange.id),
    (error: unknown) =>
      error instanceof ProjectError &&
      error.code === 'CHANGESET_ROLLBACK_CONFLICT',
  );
  assert.equal(readFileSync(conflictPath, 'utf8'), 'later human bytes\n');

  const reviewable = changes.propose({
    summary: 'P32 atomic desktop rejection with feedback',
    operations: [
      {
        command: 'project.file.create',
        input: {
          path: 'notes/review-never-applied.txt',
          content: 'draft only\n',
        },
      },
    ],
  });
  const decision = {
    proposalHash: reviewable.proposalHash,
    reason: 'Fix the missing fixture dependency before resubmitting.',
  };
  assert.throws(
    () =>
      changes.reject(reviewable.id, {
        ...decision,
        proposalHash: '0'.repeat(64),
      }),
    feedbackError('CHANGESET_REVIEW_STALE'),
  );
  assert.equal(changes.read(reviewable.id).status, 'awaitingApproval');
  assert.throws(
    () => changes.reject(reviewable.id, { ...decision, reason: ' ' }),
    feedbackError('CHANGESET_FEEDBACK_INVALID'),
  );
  assert.equal(changes.read(reviewable.id).status, 'awaitingApproval');
  const rejectedTogether = changes.reject(reviewable.id, decision);
  assert.equal(rejectedTogether.status, 'rejected');
  assert.equal(rejectedTogether.rejectionFeedback?.reason, decision.reason);
  assert.equal(
    rejectedTogether.rejectionFeedback?.proposalHash,
    reviewable.proposalHash,
  );
  assert.equal(rejectedTogether.approval, null);
  assert.deepEqual(
    changes.read(reviewable.id).rejectionFeedback,
    rejectedTogether.rejectionFeedback,
  );
  assert.equal(
    existsSync(join(projectRoot, 'notes/review-never-applied.txt')),
    false,
  );
  registry.dispose();

  console.log(
    JSON.stringify(
      {
        gate: 'P32 ChangeSet rollback isolation',
        duplicateApplyRejected: true,
        unrelatedHumanEditPreserved: true,
        sameFileHumanEditProtectedBeforeMutation: true,
        restartRollbackUsesStoredBytes: true,
        atomicVersionBoundRejection: true,
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
