import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { CompletionRunService } from '../studio/workspace/completion-run-service.ts';
import { StudioChangeSetService } from '../studio/workspace/studio-change-set-service.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';

const repository = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), 'aigame-p32-agent-run-'));
const projectRoot = join(temporary, 'project');
let child: ReturnType<typeof spawn> | null = null;

try {
  cpSync(join(repository, 'examples', 'tank-arena'), projectRoot, {
    recursive: true,
    filter: (source) =>
      !['.git', '.aigame', 'out', 'dist'].includes(
        source.split(/[\\/]/u).at(-1) ?? '',
      ),
  });
  const completionRuns = new CompletionRunService({ projectRoot });
  const run = completionRuns.syncGoal({
    threadId: 'thread-p32-agent-bridge',
    objective: 'Exercise the agent-native Completion Run bridge.',
    status: 'active',
    createdAt: 1_788_550_000,
    updatedAt: 1_788_550_001,
    plan: [
      { step: 'Generate one reviewed fixture', status: 'inProgress' },
      { step: 'Propose a project change', status: 'pending' },
    ],
    authority: {
      providerApprovalMode: 'pre-authorized',
      candidateSelectionMode: 'human-required',
      changeSetApprovalMode: 'human-required',
      budgetCurrency: 'CNY',
      budgetLimit: 0,
    },
  });

  const runningChild = spawn(
    process.execPath,
    [
      join(repository, 'dist', 'electron', 'engine-mcp', 'server.js'),
      '--project',
      projectRoot,
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        AIGAME_STUDIO_KERNEL_CLI: join(
          repository,
          'target',
          'debug',
          'kernelctl.exe',
        ),
        AIGAME_STUDIO_SCRIPT_HOST: join(
          repository,
          'target',
          'debug',
          'project-script-host.exe',
        ),
        AIGAME_STUDIO_GAME_RUNTIME: join(
          repository,
          'target',
          'debug',
          'ai-game-player.exe',
        ),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  child = runningChild;
  let stderr = '';
  runningChild.stderr.setEncoding('utf8');
  runningChild.stderr.on('data', (chunk) => (stderr += String(chunk)));
  let stdout = '';
  const pending = new Map<number, (value: Record<string, unknown>) => void>();
  runningChild.stdout.setEncoding('utf8');
  runningChild.stdout.on('data', (chunk) => {
    stdout += String(chunk);
    const lines = stdout.split(/\r?\n/u);
    stdout = lines.pop() ?? '';
    for (const line of lines.filter((item) => item.trim())) {
      const message = JSON.parse(line) as { id?: number } & Record<
        string,
        unknown
      >;
      if (typeof message.id === 'number') {
        pending.get(message.id)?.(message);
        pending.delete(message.id);
      }
    }
  });
  const rpc = (
    id: number,
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> =>
    new Promise((resolveResponse, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(`P32 MCP bridge timed out at ${id} ${method}: ${stderr}`),
          ),
        15_000,
      );
      pending.set(id, (value) => {
        clearTimeout(timer);
        resolveResponse(value);
      });
      runningChild.stdin.write(
        `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`,
      );
    });
  const structured = <T>(response: Record<string, unknown>): T =>
    (response.result as { structuredContent: T }).structuredContent;

  const listed = await rpc(1, 'tools/list', {});
  const names = (
    listed.result as { tools?: Array<{ name?: string }> }
  ).tools?.map((tool) => tool.name);
  assert(names?.includes('completion.run_current'));
  assert(names?.includes('completion.run_list'));
  assert.equal(names?.includes('completion.run_stop'), false);
  assert.equal(names?.includes('completion.run_remove'), false);
  assert(names?.includes('script.api'));
  const sdkPath = join(projectRoot, 'scripts/game-sdk.d.ts');
  const previousSdk = readFileSync(sdkPath, 'utf8');
  writeFileSync(sdkPath, '// outdated fixture SDK\n');
  const sdk = structured<{
    source: string;
    content: string;
    projectMatches: boolean;
  }>(await rpc(101, 'tools/call', { name: 'script.api', arguments: {} }));
  assert.equal(sdk.source, 'installed-engine');
  assert.equal(sdk.projectMatches, false);
  assert.match(sdk.content, /playAudio\(/u);
  assert.match(sdk.content, /setAudioBus\(/u);
  for (const control of ['stopAudio', 'pauseAudio', 'resumeAudio']) {
    assert(
      sdk.content.includes(`${control}(instanceId: string, busId?: string)`),
    );
  }
  assert.match(sdk.content, /spawnPrefab\(/u);
  assert.equal(
    readFileSync(sdkPath, 'utf8'),
    '// outdated fixture SDK\n',
    'SDK query must not mutate project typings',
  );
  writeFileSync(sdkPath, previousSdk);

  const initial = structured<{ runId: string; status: string }>(
    await rpc(2, 'tools/call', {
      name: 'completion.run_current',
      arguments: {},
    }),
  );
  assert.equal(initial.runId, run.runId);
  assert.equal(initial.status, 'running');

  const media = structured<{
    id: string;
    completionRunId: string;
    planStepId: string;
    toolCallId: string;
    status: string;
  }>(
    await rpc(3, 'tools/call', {
      name: 'asset.generate',
      arguments: {
        kind: 'image',
        providerId: 'local-placeholder',
        modelId: 'deterministic-image',
        prompt: 'P32 deterministic agent bridge fixture',
        outputName: 'p32-agent.svg',
        variants: 1,
      },
    }),
  );
  assert.equal(media.completionRunId, run.runId);
  assert.equal(media.planStepId, run.activePlanStepId);
  assert.match(media.toolCallId, /^tool-call:/u);
  assert.equal(media.status, 'awaitingReview');

  const change = structured<{ id: string; status: string }>(
    await rpc(4, 'tools/call', {
      name: 'project.create_file',
      arguments: {
        path: 'notes/p32-agent-proposal.txt',
        source: 'This content exists only inside a ChangeSet preview.\n',
      },
    }),
  );
  assert.match(change.id, /^changeset:/u);
  assert.equal(change.status, 'awaitingApproval');
  const changeList = structured<{
    changes: Array<{ id: string; files: unknown[] }>;
  }>(await rpc(401, 'tools/call', { name: 'change.list', arguments: {} }));
  assert.equal(changeList.changes[0]?.id, change.id);
  assert(!JSON.stringify(changeList).includes('beforeText'));
  assert(!JSON.stringify(changeList).includes('This content exists only'));
  const changeDetails = structured<{ files: Array<{ afterText: string }> }>(
    await rpc(402, 'tools/call', {
      name: 'change.read',
      arguments: { id: change.id },
    }),
  );
  assert.match(changeDetails.files[0]?.afterText ?? '', /ChangeSet preview/u);
  const proposalPath = join(projectRoot, 'notes/p32-agent-proposal.txt');
  const deniedApply = await rpc(41, 'tools/call', {
    name: 'change.apply',
    arguments: { id: change.id },
  });
  assert.match(JSON.stringify(deniedApply), /CHANGESET_APPROVAL_REQUIRED/u);
  assert.equal(existsSync(proposalPath), false);
  assert.equal(names?.includes('change.approve'), false);
  const applyTool = (
    listed.result as {
      tools: Array<{ name: string; annotations: { readOnlyHint: boolean } }>;
    }
  ).tools.find((tool) => tool.name === 'change.apply');
  assert.equal(applyTool?.annotations.readOnlyHint, false);
  const reviewerRegistry = new StudioCommandRegistry({
    projectRoot,
    kernelCliPath: join(repository, 'target/debug/kernelctl.exe'),
  });
  const reviewer = new StudioChangeSetService({
    projectRoot,
    kernelCliPath: join(repository, 'target/debug/kernelctl.exe'),
    registry: reviewerRegistry,
  });
  reviewer.approve(change.id);
  const applied = structured<{ status: string }>(
    await rpc(42, 'tools/call', {
      name: 'change.apply',
      arguments: { id: change.id },
    }),
  );
  assert.equal(applied.status, 'applied');
  assert.match(readFileSync(proposalPath, 'utf8'), /ChangeSet preview/u);
  const duplicate = await rpc(43, 'tools/call', {
    name: 'change.apply',
    arguments: { id: change.id },
  });
  assert.match(JSON.stringify(duplicate), /CHANGESET_APPROVAL_REQUIRED/u);
  const rejected = reviewer.propose({
    summary: 'Review feedback remains visible to an already-running MCP reader',
    operations: [
      {
        command: 'project.file.create',
        input: {
          path: 'notes/rejected-review.txt',
          content: 'never apply\n',
        },
      },
    ],
  });
  reviewer.reject(rejected.id);
  const feedback = reviewer.recordRejectionFeedback(rejected.id, {
    proposalHash: rejected.proposalHash,
    reason:
      'Tick 0 fixture failure: required UI object is missing. Revise the fixture and rerun, without weakening assertions.',
  });
  const rejectedRead = structured<{
    status: string;
    rejectionFeedback: unknown;
  }>(
    await rpc(44, 'tools/call', {
      name: 'change.read',
      arguments: { id: rejected.id },
    }),
  );
  assert.equal(rejectedRead.status, 'rejected');
  assert.deepEqual(rejectedRead.rejectionFeedback, feedback.rejectionFeedback);
  assert.equal(names?.includes('change.recordRejectionFeedback'), false);
  assert.equal(names?.includes('change.reject'), false);
  const rejectedApply = await rpc(45, 'tools/call', {
    name: 'change.apply',
    arguments: { id: rejected.id },
  });
  assert.match(JSON.stringify(rejectedApply), /CHANGESET_APPROVAL_REQUIRED/u);
  assert.equal(
    existsSync(join(projectRoot, 'notes/rejected-review.txt')),
    false,
  );
  reviewerRegistry.dispose();

  const runtime = structured<{ sessionId: string }>(
    await rpc(5, 'tools/call', {
      name: 'runtime.run',
      arguments: { ticks: 1, seed: 20260905 },
    }),
  );
  assert.match(
    runtime.sessionId ?? '',
    /^session:/u,
    JSON.stringify(runtime, null, 2),
  );
  const observation = structured<{
    observationId: string;
    sessionId: string;
  }>(
    await rpc(6, 'tools/call', {
      name: 'runtime.capture_frame',
      arguments: { checkpointId: 'p32-agent-bridge' },
    }),
  );
  assert.match(observation.observationId, /^observation:/u);
  assert.equal(observation.sessionId, runtime.sessionId);
  const testRun = structured<{
    testRunId: string;
    status: string;
    passed: boolean;
  }>(
    await rpc(7, 'tools/call', {
      name: 'test.run',
      arguments: { path: 'tests/tank-example.test.json' },
    }),
  );
  assert.match(testRun.testRunId, /^test-run:/u);
  assert.notEqual(testRun.status, 'failed');
  assert.equal(testRun.passed, true);
  assert(
    JSON.stringify(testRun).length < 32_000,
    'MCP test summary must not inline all frames',
  );
  const report = structured<{
    result: { snapshots: unknown[]; stateHash: string };
  }>(
    await rpc(701, 'tools/call', {
      name: 'test.result',
      arguments: { id: testRun.testRunId },
    }),
  );
  assert(
    report.result.snapshots.length > 0,
    'Full test evidence remains addressable',
  );
  const failurePath = join(projectRoot, 'tests/p32-failure.test.json');
  writeFileSync(
    failurePath,
    JSON.stringify({
      schemaVersion: '1.0.0',
      kind: 'runtime-scenario',
      ticks: 1,
      assertions: [
        {
          id: 'assertion:missing-object',
          tick: 0,
          target: { objectId: 'tank:missing-object' },
          operator: 'exists',
        },
      ],
    }),
  );
  const failedResponse = await rpc(702, 'tools/call', {
    name: 'test.run',
    arguments: { path: 'tests/p32-failure.test.json' },
  });
  const failure = structured<{
    passed: boolean;
    status: string;
    diagnostics: Array<{ code: string }>;
    testRunId: string;
  }>(failedResponse);
  assert.equal(failure.passed, false);
  assert.equal(failure.status, 'failed');
  assert.equal((failedResponse.result as { isError: boolean }).isError, true);
  assert(
    failure.diagnostics.some((item) => item.code === 'TEST_ASSERTION_FAILED'),
  );
  assert.notEqual(failure.testRunId, testRun.testRunId);
  const originalReport = structured<{ result: { stateHash: string } }>(
    await rpc(703, 'tools/call', {
      name: 'test.result',
      arguments: { id: testRun.testRunId },
    }),
  );
  assert.equal(
    originalReport.result.stateHash,
    report.result.stateHash,
    'Later runs cannot overwrite earlier evidence',
  );
  rmSync(failurePath);
  const developmentBuild = structured<{ buildId: string; ok: true }>(
    await rpc(8, 'tools/call', {
      name: 'build.windows',
      arguments: { profile: 'development' },
    }),
  );
  assert.match(developmentBuild.buildId, /^build:/u);
  const releasePackage = structured<{
    buildId: string;
    packageId: string;
    ok: true;
  }>(
    await rpc(9, 'tools/call', {
      name: 'release.package',
      arguments: {},
    }),
  );
  assert.match(releasePackage.buildId, /^build:/u);
  assert.match(releasePackage.packageId, /^package:/u);

  const reconciled = structured<{
    runId: string;
    status: string;
    links: {
      toolCalls: string[];
      assetJobs: string[];
      changeSets: string[];
      runtimeSessions: string[];
      observations: string[];
      tests: string[];
      builds: string[];
      packages: string[];
    };
    planSteps: Array<{ waitReason?: string }>;
  }>(
    await rpc(10, 'tools/call', {
      name: 'completion.run_current',
      arguments: {},
    }),
  );
  assert.equal(reconciled.runId, run.runId);
  assert.equal(reconciled.status, 'waiting');
  assert.equal(reconciled.links.assetJobs.includes(media.id), true);
  assert.equal(reconciled.links.toolCalls.includes(media.toolCallId), true);
  assert.equal(reconciled.links.changeSets.includes(change.id), true);
  assert.equal(
    reconciled.links.runtimeSessions.includes(runtime.sessionId),
    true,
  );
  assert.equal(
    reconciled.links.observations.includes(observation.observationId),
    true,
  );
  assert.equal(reconciled.links.tests.includes(testRun.testRunId), true);
  assert.equal(
    reconciled.links.builds.includes(developmentBuild.buildId),
    true,
  );
  assert.equal(
    reconciled.links.packages.includes(releasePackage.packageId),
    true,
  );
  assert.equal(reconciled.planSteps[0]?.waitReason, 'candidate-review');

  const allRuns = structured<{ runs: Array<{ runId: string }> }>(
    await rpc(11, 'tools/call', {
      name: 'completion.run_list',
      arguments: {},
    }),
  );
  assert.equal(
    allRuns.runs.some((item) => item.runId === run.runId),
    true,
  );

  console.log(
    JSON.stringify(
      {
        gate: 'P32 agent-native Completion Run bridge',
        currentRunQueryable: true,
        assetJobAutoLinked: true,
        toolCallAutoLinked: true,
        changeSetAutoLinked: true,
        runtimeAndObservationAutoLinked: true,
        testBuildAndPackageAutoLinked: true,
        humanStopAndRemoveNotAgentCallable: true,
        compactChangesWithExplicitDiffRead: true,
        failedTestsAreVisibleToolErrors: true,
        durableTestEvidenceSurvivesLaterRuns: true,
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  if (child && child.exitCode === null) {
    child.kill();
    await Promise.race([
      new Promise<void>((resolveClose) => child?.once('close', resolveClose)),
      new Promise<void>((resolveTimeout) => setTimeout(resolveTimeout, 2_000)),
    ]);
  }
  rmSync(temporary, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
