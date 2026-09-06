import { existsSync, readFileSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';

export const PINNED_CODEX_VERSION = '0.152.1';

export type CodexSidecarLaunch = {
  command: string;
  prefixArguments: string[];
  env: NodeJS.ProcessEnv;
  packageRoot: string;
  toolchainBin: string;
  version: string;
};

export class CodexSidecarError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CodexSidecarError';
    this.code = code;
  }
}

/** Resolves only Studio-owned Codex files; global CLI installations are ignored. */
export function resolveBundledCodexSidecar(options: {
  applicationRoot: string;
  runtimeExecutable?: string;
}): CodexSidecarLaunch {
  const applicationRoot = resolve(options.applicationRoot);
  const candidates = [
    join(applicationRoot, 'vendor', 'codex'),
    join(applicationRoot, 'node_modules', '@openai', 'codex'),
  ];
  const packageRoot = candidates.find((candidate) =>
    existsSync(join(candidate, 'package.json')),
  );
  if (!packageRoot) {
    throw new CodexSidecarError(
      'CODEX_SIDECAR_MISSING',
      'Studio 安装中缺少内置 Codex App Server。请修复或重新安装 Studio。',
    );
  }
  const packageJson = JSON.parse(
    readFileSync(join(packageRoot, 'package.json'), 'utf8'),
  ) as { version?: string };
  if (packageJson.version !== PINNED_CODEX_VERSION) {
    throw new CodexSidecarError(
      'CODEX_SIDECAR_VERSION_MISMATCH',
      `Studio 需要 Codex ${PINNED_CODEX_VERSION}，实际为 ${String(packageJson.version)}。`,
    );
  }
  const script = join(packageRoot, 'bin', 'codex.js');
  if (!existsSync(script)) {
    throw new CodexSidecarError(
      'CODEX_SIDECAR_ENTRY_MISSING',
      '内置 Codex 缺少启动入口。',
    );
  }
  const nativeWindowsCandidates = [
    join(packageRoot, 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe'),
    join(
      applicationRoot,
      'node_modules',
      '@openai',
      'codex-win32-x64',
      'vendor',
      'x86_64-pc-windows-msvc',
      'bin',
      'codex.exe',
    ),
  ];
  const nativeWindowsExecutable = nativeWindowsCandidates.find((candidate) =>
    existsSync(candidate),
  );
  if (process.platform === 'win32' && !nativeWindowsExecutable) {
    throw new CodexSidecarError(
      'CODEX_SIDECAR_NATIVE_MISSING',
      'Studio 安装中缺少内置 Codex Windows 程序。请修复或重新安装 Studio。',
    );
  }
  const installedBin = join(applicationRoot, 'bin');
  const developmentBin = join(applicationRoot, 'target', 'debug');
  const toolchainBin = existsSync(installedBin) ? installedBin : developmentBin;
  if (!existsSync(toolchainBin)) {
    throw new CodexSidecarError(
      'CODEX_TOOLCHAIN_MISSING',
      'Studio 安装中缺少 Engine MCP 与内核工具目录。',
    );
  }
  const inheritedPath = process.env.PATH ?? '';
  const nodeRuntime = options.runtimeExecutable ?? process.execPath;
  const useNativeWindowsExecutable = process.platform === 'win32';
  return {
    command: useNativeWindowsExecutable
      ? (nativeWindowsExecutable as string)
      : nodeRuntime,
    prefixArguments: useNativeWindowsExecutable ? [] : [script],
    env: {
      ...process.env,
      ...(useNativeWindowsExecutable ? {} : { ELECTRON_RUN_AS_NODE: '1' }),
      AIGAME_STUDIO_NODE_RUNTIME: nodeRuntime,
      AIGAME_STUDIO_ENGINE_MCP_SERVER: join(
        applicationRoot,
        'dist',
        'electron',
        'engine-mcp',
        'server.js',
      ),
      AIGAME_STUDIO_KERNEL_CLI: join(
        toolchainBin,
        process.platform === 'win32' ? 'kernelctl.exe' : 'kernelctl',
      ),
      AIGAME_STUDIO_GAME_RUNTIME: join(
        toolchainBin,
        process.platform === 'win32' ? 'ai-game-player.exe' : 'ai-game-player',
      ),
      PATH: [toolchainBin, inheritedPath].filter(Boolean).join(delimiter),
    },
    packageRoot,
    toolchainBin,
    version: packageJson.version,
  };
}
