import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { ProjectError } from '../project/project-types.ts';
import { runtimeProjectRevision } from '../runtime/runtime-input-log.ts';
import type {
  GameBuildProfile,
  GameBuildReport,
} from './studio-game-build-service.ts';

const digest = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex');
const fail = (code: string, message: string): never => {
  throw new ProjectError(code, message);
};
const hashPattern = /^[a-f0-9]{64}$/u;
const idPattern = /^package-verification:[a-f0-9]{64}$/u;
const maxArchive = 256 * 1024 * 1024;

// All paths come from the engine's fixed build/receipt locations. Project data
// cannot supply commands, arguments, environment variables or an executable.
function inside(root: string, target: string) {
  const path = resolve(root, target);
  const rel = relative(root, path);
  if (!rel || isAbsolute(rel) || rel.startsWith('..') || rel.includes(':'))
    fail('PACKAGE_PATH_UNSAFE', '包验证路径必须位于指定目录内。');
  let current = root;
  if (existsSync(current) && lstatSync(current).isSymbolicLink())
    fail('PACKAGE_LINK_UNSUPPORTED', '包验证不接受符号链接。');
  for (const segment of rel.split(/[\\/]/u)) {
    current = join(current, segment);
    if (existsSync(current) && lstatSync(current).isSymbolicLink())
      fail('PACKAGE_LINK_UNSUPPORTED', '包验证不接受符号链接。');
  }
  return path;
}

function readBounded(root: string, target: string, max: number) {
  const path = inside(root, target);
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.size > max)
    fail('PACKAGE_FILE_BUDGET', '包验证文件类型或大小不受支持。');
  return readFileSync(path);
}

const runtimeEnv = () => ({
  SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
  WINDIR: process.env.SystemRoot ?? 'C:\\Windows',
  PATH: join(process.env.SystemRoot ?? 'C:\\Windows', 'System32'),
  NODE_ENV: 'production' as const,
});

const execFileAsync = promisify(execFile);
async function run(
  executable: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = runtimeEnv(),
) {
  try {
    const result = await execFileAsync(executable, args, {
      cwd,
      env,
      windowsHide: true,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 128 * 1024,
    });
    return result.stdout;
  } catch {
    // Do not expose child stderr: a malformed project can put private data there.
    return fail(
      'PACKAGE_PROCESS_FAILED',
      '包验证进程失败或超过 30 秒；未记录成功。',
    );
  }
}

// .NET is the same Windows ZIP implementation used by the packager. Validate
// every entry BEFORE extraction, cap aggregate expansion, reject ADS, traversal,
// directory/file aliases and case-insensitive duplicate targets. Never invoke a
// project-provided PowerShell program or Expand-Archive on unchecked names.
const extractScript = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($env:AIGAME_VERIFY_ZIP)
try {
  $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $total = [long]0
  if ($archive.Entries.Count -gt 10000) { throw 'entry budget' }
  foreach ($entry in $archive.Entries) {
    $name = $entry.FullName.Replace('\', '/')
    $parts = $name.TrimEnd('/').Split('/')
    if ($parts.Length -lt 2 -or $parts[0] -cne $env:AIGAME_VERIFY_NAME) { throw 'root' }
    foreach ($part in $parts) {
      if (!$part -or $part -eq '.' -or $part -eq '..' -or $part -match '[:<>"|?*\x00-\x1f]' -or $part -match '[. ]$' -or $part -match '^(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)') { throw 'path' }
    }
    if (!$seen.Add($name.TrimEnd('/'))) { throw 'duplicate' }
    $total += $entry.Length
    if ($total -gt 536870912 -or $entry.Length -gt 268435456) { throw 'byte budget' }
    $target = [IO.Path]::GetFullPath([IO.Path]::Combine($env:AIGAME_VERIFY_DEST, $name))
    if (!$target.StartsWith($env:AIGAME_VERIFY_DEST + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'escape' }
  }
  foreach ($entry in $archive.Entries) {
    $name = $entry.FullName.Replace('\', '/')
    $target = [IO.Path]::Combine($env:AIGAME_VERIFY_DEST, $name)
    if ($name.EndsWith('/')) { [IO.Directory]::CreateDirectory($target) | Out-Null }
    else {
      [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
      [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $false)
    }
  }
} finally { $archive.Dispose() }
`;

export type PackageVerification = {
  schemaVersion: '1.0.0';
  verificationId: string;
  profile: GameBuildProfile;
  zipSha256: string;
  projectRevision: string;
  packageName: string;
  projectId: string;
  reportSha256: string;
  verifiedFiles: number;
  trustedPlayerSha256: string;
  completedAt: string;
  ok: true;
  startup: { scriptStatus: 'completed'; externalDependencies: [] };
  nativeWindow: {
    renderer: 'wgpu-surface';
    framesPresented: 5;
    ticksExecuted: number;
  };
  frame: { path: string; sha256: string; mimeType: 'image/png' };
  evidencePath: string;
  limitation: string;
};

export async function verifyGamePackage(options: {
  projectRoot: string;
  runtimeExecutablePath: string;
  profile: GameBuildProfile;
  expectedZipSha256: string;
}): Promise<PackageVerification> {
  const root = resolve(options.projectRoot);
  if (process.platform !== 'win32')
    fail('PACKAGE_PLATFORM_UNSUPPORTED', '当前包验证只支持 Windows。');
  if (
    !['development', 'release'].includes(options.profile) ||
    !hashPattern.test(options.expectedZipSha256)
  )
    fail(
      'PACKAGE_VERIFY_INPUT_INVALID',
      '请提供 profile 和构建报告中的 ZIP SHA-256。',
    );
  const reportPath = inside(
    root,
    `.aigame/local/builds/${options.profile}.json`,
  );
  const reportBytes = readBounded(root, reportPath, 8 * 1024 * 1024);
  const report = JSON.parse(reportBytes.toString('utf8')) as GameBuildReport;
  if (
    report.kind !== 'ai-game-kernel/game-build' ||
    report.ok !== true ||
    report.profile !== options.profile ||
    report.zipSha256 !== options.expectedZipSha256 ||
    !/^[a-zA-Z0-9._-]+$/u.test(report.packageName) ||
    !report.files ||
    Object.keys(report.files).length > 9999
  )
    fail('PACKAGE_REPORT_MISMATCH', '构建报告与请求不一致，请读取当前报告。');
  const revision = runtimeProjectRevision(root);
  if (report.projectRevision !== revision)
    fail('PACKAGE_REVISION_CONFLICT', '包不是当前项目版本；请重新构建再验证。');
  const zipPath = inside(
    root,
    `out/windows-${options.profile}/${report.packageName}.zip`,
  );
  if (
    resolve(report.zipPath) !== zipPath ||
    resolve(report.outputDirectory) !== zipPath.slice(0, -4)
  )
    fail('PACKAGE_PATH_UNSAFE', '构建报告不能指定任意包路径。');
  const archiveBytes = readBounded(root, zipPath, maxArchive);
  if (digest(archiveBytes) !== options.expectedZipSha256)
    fail('PACKAGE_ARCHIVE_TAMPERED', 'ZIP 内容与构建哈希不符。');
  if (
    basename(report.executable) !== report.executable ||
    !report.executable.endsWith('.exe')
  )
    fail('PACKAGE_EXECUTABLE_UNTRUSTED', '构建报告包含无效 Player 路径。');
  const trustedBytes = readFileSync(options.runtimeExecutablePath);
  const trustedHash = digest(trustedBytes);
  if (report.files[report.executable] !== trustedHash)
    fail(
      'PACKAGE_EXECUTABLE_UNTRUSTED',
      '包内 Player 与当前安装的可信运行时不一致，请重新构建。',
    );
  const evidenceRelative = `.aigame/local/package-verifications/run-${randomUUID()}`;
  const evidence = inside(root, evidenceRelative);
  mkdirSync(evidence, { recursive: true });
  // Snapshot the verified ZIP; a later build cannot replace the archive we unpack.
  const archiveCopy = join(evidence, 'verified-package.zip');
  writeFileSync(archiveCopy, archiveBytes, { flag: 'wx' });
  const unpacked = join(evidence, 'extracted');
  mkdirSync(unpacked);
  await run(
    join(
      runtimeEnv().SystemRoot,
      'System32/WindowsPowerShell/v1.0/powershell.exe',
    ),
    ['-NoProfile', '-NonInteractive', '-Command', extractScript],
    evidence,
    {
      ...runtimeEnv(),
      AIGAME_VERIFY_ZIP: archiveCopy,
      AIGAME_VERIFY_NAME: report.packageName,
      AIGAME_VERIFY_DEST: unpacked,
    },
  );
  const bundle = inside(unpacked, report.packageName);
  const allFiles: string[] = [];
  const walk = (directory: string, depth = 0) => {
    if (depth > 32) fail('PACKAGE_FILE_BUDGET', '包目录深度超限。');
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = inside(bundle, join(directory, entry.name));
      if (entry.isDirectory()) walk(path, depth + 1);
      else allFiles.push(relative(bundle, path).replaceAll('\\', '/'));
    }
  };
  walk(bundle);
  const expectedFiles = [
    ...Object.keys(report.files),
    'BUILD-MANIFEST.json',
  ].sort();
  if (JSON.stringify(allFiles.sort()) !== JSON.stringify(expectedFiles))
    fail('PACKAGE_CONTENT_MISMATCH', 'ZIP 文件清单与构建报告不一致。');
  for (const [path, expected] of Object.entries(report.files)) {
    if (
      !hashPattern.test(expected) ||
      digest(readBounded(bundle, path, maxArchive)) !== expected
    )
      fail('PACKAGE_CONTENT_MISMATCH', 'ZIP 内容哈希校验失败。');
    if (
      path !== report.executable &&
      /\.(?:exe|dll|com|bat|cmd|ps1)$/iu.test(path)
    )
      fail('PACKAGE_EXECUTABLE_UNTRUSTED', '独立游戏包包含非可信可执行文件。');
    if (
      options.profile === 'release' &&
      /(^|\/)(?:diagnostics|tests|replays|studio|codex|node_modules|src|\.agents|\.ai|\.codex|\.aigame|AGENTS\.md|\.env(?:\.[^/]*)?)(\/|$)|\.(?:ts|tsx|map)$/iu.test(
        path,
      )
    )
      fail('PACKAGE_RELEASE_BOUNDARY', 'Release 包包含开发或私有文件。');
  }
  const packagedManifest = JSON.parse(
    readBounded(bundle, 'BUILD-MANIFEST.json', 8 * 1024 * 1024).toString(),
  );
  if (
    JSON.stringify(packagedManifest) !==
    JSON.stringify({
      ...report,
      outputDirectory: '.',
      zipPath: `${report.packageName}.zip`,
      zipSha256: null,
    })
  )
    fail('PACKAGE_CONTENT_MISMATCH', '包内清单与构建报告不一致。');
  const executable = inside(bundle, report.executable);
  if (digest(readBounded(bundle, executable, maxArchive)) !== trustedHash)
    fail(
      'PACKAGE_EXECUTABLE_UNTRUSTED',
      '解压后的 Player 与可信运行时不一致。',
    );
  const startup = JSON.parse(await run(executable, ['--verify'], bundle));
  if (
    startup.ok !== true ||
    startup.scriptStatus !== 'completed' ||
    !Array.isArray(startup.externalDependencies) ||
    startup.externalDependencies.length !== 0 ||
    startup.projectId !== report.projectId
  )
    fail('PACKAGE_STARTUP_FAILED', '独立 Player 启动自检未通过。');
  const framePath = join(evidence, 'native-window.png');
  const smoke = JSON.parse(
    await run(
      executable,
      ['--smoke', '5', '--smoke-capture', framePath],
      bundle,
    ),
  );
  if (
    smoke.ok !== true ||
    smoke.renderer !== 'wgpu-surface' ||
    smoke.framesPresented !== 5 ||
    smoke.capturedGpuFrame !== true ||
    !Number.isInteger(smoke.ticksExecuted) ||
    smoke.ticksExecuted <= 0 ||
    smoke.projectId !== report.projectId
  )
    fail('PACKAGE_WINDOW_FAILED', '独立 Player 未完成原生窗口渲染。');
  const frameBytes = readBounded(evidence, framePath, 32 * 1024 * 1024);
  if (frameBytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
    fail('PACKAGE_WINDOW_FAILED', '原生窗口截图无效。');
  if (
    runtimeProjectRevision(root) !== revision ||
    digest(readBounded(root, reportPath, 8 * 1024 * 1024)) !==
      digest(reportBytes)
  )
    fail('PACKAGE_REVISION_CONFLICT', '验证期间项目或构建已改变；请重新验证。');
  const body = {
    schemaVersion: '1.0.0' as const,
    profile: options.profile,
    zipSha256: options.expectedZipSha256,
    projectRevision: revision,
    projectId: report.projectId,
    packageName: report.packageName,
    reportSha256: digest(reportBytes),
    verifiedFiles: expectedFiles.length,
    trustedPlayerSha256: trustedHash,
    completedAt: new Date().toISOString(),
    ok: true as const,
    startup: {
      scriptStatus: 'completed' as const,
      externalDependencies: [] as [],
    },
    nativeWindow: {
      renderer: 'wgpu-surface' as const,
      framesPresented: 5 as const,
      ticksExecuted: Number(smoke.ticksExecuted),
    },
    frame: {
      path: `${evidenceRelative}/native-window.png`,
      sha256: digest(frameBytes),
      mimeType: 'image/png' as const,
    },
    evidencePath: evidenceRelative,
    limitation:
      'Startup and five native frames only; not full gameplay, audible review, network isolation or independent P33 acceptance.',
  };
  const verificationId = `package-verification:${digest(JSON.stringify(body))}`;
  const receipt = { ...body, verificationId };
  writeFileSync(
    inside(
      root,
      `.aigame/local/package-verifications/${verificationId.slice(21)}.json`,
    ),
    JSON.stringify(receipt),
    { flag: 'wx' },
  );
  return receipt;
}

export function readPackageVerification(
  rootPath: string,
  id: string,
): PackageVerification {
  const root = resolve(rootPath);
  if (!idPattern.test(id))
    fail('PACKAGE_VERIFICATION_ID_INVALID', '请提供包验证返回的稳定 ID。');
  const receipt = JSON.parse(
    readBounded(
      root,
      `.aigame/local/package-verifications/${id.slice(21)}.json`,
      1024 * 1024,
    ).toString(),
  ) as PackageVerification;
  const { verificationId, ...body } = receipt;
  if (
    verificationId !== id ||
    `package-verification:${digest(JSON.stringify(body))}` !== id ||
    receipt.schemaVersion !== '1.0.0' ||
    receipt.ok !== true
  )
    fail('PACKAGE_VERIFICATION_TAMPERED', '包验证记录内容校验失败。');
  if (
    !/^\.aigame\/local\/package-verifications\/run-[a-f0-9-]+\/native-window\.png$/u.test(
      receipt.frame.path,
    ) ||
    digest(readBounded(root, receipt.frame.path, 32 * 1024 * 1024)) !==
      receipt.frame.sha256
  )
    fail('PACKAGE_VERIFICATION_TAMPERED', '包验证截图内容校验失败。');
  return receipt;
}
