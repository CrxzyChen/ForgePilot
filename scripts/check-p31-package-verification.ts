import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { zipSync } from 'fflate';
import { StudioGameBuildService } from '../studio/workspace/studio-game-build-service.ts';
import {
  readPackageVerification,
  verifyGamePackage,
} from '../studio/workspace/game-package-verification.ts';
import { runtimeProjectRevision } from '../studio/runtime/runtime-input-log.ts';

const root = resolve(process.cwd());
const evidence = mkdtempSync(join(root, 'artifacts/p31-package-verification-'));
const project = join(evidence, 'project');
cpSync(join(root, 'examples/pong-2d'), project, {
  recursive: true,
  filter: (path) =>
    !['.git', '.aigame', 'out', 'dist'].includes(
      path.split(/[\\/]/u).at(-1) ?? '',
    ),
});
const player = join(root, 'target/release/ai-game-player.exe');
const builder = new StudioGameBuildService({
  projectRoot: project,
  runtimeExecutablePath: player,
  scriptHostPath: join(root, 'target/release/project-script-host.exe'),
  engineVersion: '0.3.0-preview.1',
});
const revision = runtimeProjectRevision(project);
const build = builder.execute('release.package');
assert.equal(
  build.projectRevision,
  revision,
  'Build must bind current project revision before verification',
);
const options = {
  projectRoot: project,
  runtimeExecutablePath: player,
  profile: 'release' as const,
  expectedZipSha256: build.zipSha256!,
};
const expectCode = (fn: () => unknown, code: string) =>
  assert.rejects(
    async () => fn(),
    (error: unknown) =>
      !!error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === code,
  );
await expectCode(
  () => verifyGamePackage({ ...options, expectedZipSha256: '0'.repeat(64) }),
  'PACKAGE_REPORT_MISMATCH',
);
const reportPath = join(project, '.aigame/local/builds/release.json');
const originalReport = readFileSync(reportPath);
const originalZip = readFileSync(build.zipPath);
const sha = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex');
try {
  writeFileSync(build.zipPath, Buffer.from('damaged'));
  await expectCode(
    () => verifyGamePackage(options),
    'PACKAGE_ARCHIVE_TAMPERED',
  );
} finally {
  writeFileSync(build.zipPath, originalZip);
}
try {
  writeFileSync(
    reportPath,
    JSON.stringify({ ...build, zipPath: join(root, 'package.zip') }),
  );
  await expectCode(() => verifyGamePackage(options), 'PACKAGE_PATH_UNSAFE');
  writeFileSync(
    reportPath,
    JSON.stringify({
      ...build,
      files: { ...build.files, [build.executable]: '0'.repeat(64) },
    }),
  );
  await expectCode(
    () => verifyGamePackage(options),
    'PACKAGE_EXECUTABLE_UNTRUSTED',
  );
} finally {
  writeFileSync(reportPath, originalReport);
}
const badZip = zipSync({
  [`${build.packageName}/../../escaped.txt`]: Buffer.from('must not escape'),
});
try {
  writeFileSync(build.zipPath, badZip);
  writeFileSync(
    reportPath,
    JSON.stringify({ ...build, zipSha256: sha(badZip) }),
  );
  await expectCode(
    () => verifyGamePackage({ ...options, expectedZipSha256: sha(badZip) }),
    'PACKAGE_PROCESS_FAILED',
  );
  assert.equal(existsSync(join(project, '.aigame/local/escaped.txt')), false);
} finally {
  writeFileSync(build.zipPath, originalZip);
  writeFileSync(reportPath, originalReport);
}
const receipt = await verifyGamePackage(options);
assert.equal(receipt.ok, true);
assert.equal(receipt.nativeWindow.renderer, 'wgpu-surface');
assert.equal(receipt.nativeWindow.framesPresented, 5);
assert.deepEqual(receipt.startup.externalDependencies, []);
assert.deepEqual(
  readPackageVerification(project, receipt.verificationId),
  receipt,
);
assert.equal(
  runtimeProjectRevision(project),
  revision,
  'Verification must not mutate game authority',
);
const frame = join(project, receipt.frame.path);
const frameBytes = readFileSync(frame);
try {
  writeFileSync(frame, 'tampered');
  await expectCode(
    () => readPackageVerification(project, receipt.verificationId),
    'PACKAGE_VERIFICATION_TAMPERED',
  );
} finally {
  writeFileSync(frame, frameBytes);
}
const settingsPath = join(project, 'settings/project.json');
const settings = readFileSync(settingsPath);
try {
  writeFileSync(settingsPath, settings.toString() + '\n');
  await expectCode(
    () => verifyGamePackage(options),
    'PACKAGE_REVISION_CONFLICT',
  );
} finally {
  writeFileSync(settingsPath, settings);
}

// The compiled installed MCP path must expose and execute the same bounded API.
const child = spawn(
  process.execPath,
  [join(root, 'dist/electron/engine-mcp/server.js'), '--project', project],
  {
    cwd: project,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      AIGAME_STUDIO_GAME_RUNTIME: player,
      AIGAME_STUDIO_SCRIPT_HOST: join(
        root,
        'target/release/project-script-host.exe',
      ),
      AIGAME_STUDIO_KERNEL_CLI: join(root, 'target/release/kernelctl.exe'),
    },
  },
);
let nextId = 0;
let buffer = '';
const pending = new Map<number, (value: Record<string, unknown>) => void>();
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split(/\r?\n/u);
  buffer = lines.pop() ?? '';
  for (const line of lines.filter(Boolean)) {
    const value = JSON.parse(line);
    pending.get(value.id)?.(value);
    pending.delete(value.id);
  }
});
const rpc = (method: string, params: Record<string, unknown>) =>
  new Promise<Record<string, unknown>>((resolveResponse, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(
      () => reject(new Error('Package MCP test timeout')),
      90_000,
    );
    pending.set(id, (value) => {
      clearTimeout(timeout);
      resolveResponse(value);
    });
    child.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n',
    );
  });
try {
  const result = await rpc('tools/list', {});
  const tools = (result.result as { tools: Array<{ name: string }> }).tools;
  assert(tools.some((tool) => tool.name === 'build.verify_package'));
  assert(tools.some((tool) => tool.name === 'build.read_verification'));
  const bad = await rpc('tools/call', {
    name: 'build.verify_package',
    arguments: {
      profile: 'release',
      expectedZipSha256: build.zipSha256,
      executable: 'cmd.exe',
    },
  });
  assert.equal(
    (bad.result as { isError: boolean }).isError,
    true,
    'Reject extra raw command arguments',
  );
  const response = await rpc('tools/call', {
    name: 'build.verify_package',
    arguments: { profile: 'release', expectedZipSha256: build.zipSha256 },
  });
  const value = response.result as {
    isError: boolean;
    structuredContent: { verificationId: string; ok: boolean };
  };
  assert.equal(value.isError, false, JSON.stringify(response));
  assert.equal(value.structuredContent.ok, true);
  const reread = await rpc('tools/call', {
    name: 'build.read_verification',
    arguments: { id: value.structuredContent.verificationId },
  });
  assert.equal((reread.result as { isError: boolean }).isError, false);
  mkdirSync(join(evidence, 'summary'), { recursive: true });
  writeFileSync(
    join(evidence, 'summary.json'),
    JSON.stringify(
      {
        result: 'passed',
        revision,
        receipt,
        compiledMcp: value.structuredContent,
        negativeCases: 7,
        noGameMutation: true,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      gate: 'P31 bounded native package verification',
      result: 'passed',
      evidence,
    }),
  );
} finally {
  child.stdin.end();
  child.kill();
}
