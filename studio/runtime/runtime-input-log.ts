import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { ProjectError } from '../project/project-types.ts';
import type { RunProjectOptions } from './project-script-runtime.ts';

export type RuntimeInputLog = {
  schemaVersion: '1.0.0';
  inputLogId: string;
  projectRevision: string;
  sessionId: string;
  generation: number;
  tick: number;
  stateHash: string;
  request: Pick<
    RunProjectOptions,
    'scene' | 'seed' | 'ticks' | 'inputs' | 'commands' | 'controls'
  >;
};

const excluded = new Set([
  '.git',
  '.aigame',
  '.codex',
  '.agents',
  '.ai',
  'node_modules',
  'out',
  'dist',
  'target',
]);
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Conservative revision guard: include all non-local project files, not only
// currently reachable modules. Never read credentials or agent-local state.
export function runtimeProjectRevision(root: string): string {
  const files: Array<[string, string]> = [];
  const walk = (directory: string, prefix: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      if (
        excluded.has(entry.name) ||
        entry.name === '.env' ||
        entry.name.startsWith('.env.')
      )
        continue;
      if (entry.isSymbolicLink())
        throw new ProjectError(
          'RUNTIME_INPUT_LOG_LINK_UNSUPPORTED',
          '输入记录不接受符号链接项目文件。',
        );
      const path = prefix + entry.name;
      if (entry.isDirectory()) walk(join(directory, entry.name), `${path}/`);
      else if (entry.isFile())
        files.push([
          path,
          createHash('sha256')
            .update(readFileSync(join(directory, entry.name)))
            .digest('hex'),
        ]);
    }
  };
  walk(root, '');
  return digest(files);
}

export function saveRuntimeInputLog(
  root: string,
  data: Omit<RuntimeInputLog, 'schemaVersion' | 'inputLogId'>,
): RuntimeInputLog {
  const body = { schemaVersion: '1.0.0' as const, ...data };
  const inputLogId = `input-log:${digest(body)}`;
  const log = { ...body, inputLogId };
  const source = `${JSON.stringify(log, null, 2)}\n`;
  if (Buffer.byteLength(source, 'utf8') > 8 * 1024 * 1024)
    throw new ProjectError(
      'RUNTIME_INPUT_LOG_BUDGET_EXCEEDED',
      '输入记录超过 8 MiB，请拆分独立录制。',
    );
  const directory = join(root, '.aigame', 'local', 'runtime-input-logs');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `${inputLogId.slice(10)}.json`), source);
  return log;
}

export function readRuntimeInputLog(
  root: string,
  inputLogId: string,
): RuntimeInputLog {
  if (!/^input-log:[a-f0-9]{64}$/u.test(inputLogId))
    throw new ProjectError(
      'RUNTIME_INPUT_LOG_ID_INVALID',
      '请使用 runtime.export_input_log 返回的内容寻址 ID。',
    );
  let parsed: RuntimeInputLog;
  try {
    const path = join(
      root,
      '.aigame',
      'local',
      'runtime-input-logs',
      `${inputLogId.slice(10)}.json`,
    );
    if (statSync(path).size > 8 * 1024 * 1024)
      throw new Error('Input log size exceeds 8 MiB');
    parsed = JSON.parse(
      readFileSync(
        join(
          root,
          '.aigame',
          'local',
          'runtime-input-logs',
          `${inputLogId.slice(10)}.json`,
        ),
        'utf8',
      ),
    ) as RuntimeInputLog;
  } catch {
    throw new ProjectError(
      'RUNTIME_INPUT_LOG_MISSING',
      '输入记录不存在或损坏；检查点名称不能恢复输入历史。',
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new ProjectError(
      'RUNTIME_INPUT_LOG_TAMPERED',
      '输入记录必须是有效对象。',
    );
  const { inputLogId: storedId, ...body } = parsed;
  if (
    storedId !== inputLogId ||
    `input-log:${digest(body)}` !== inputLogId ||
    parsed.schemaVersion !== '1.0.0'
  )
    throw new ProjectError(
      'RUNTIME_INPUT_LOG_TAMPERED',
      '输入记录内容校验失败。',
    );
  if (parsed.projectRevision !== runtimeProjectRevision(root))
    throw new ProjectError(
      'RUNTIME_INPUT_LOG_REVISION_CONFLICT',
      '项目已改变；请在当前版本重新录制，不能把旧路线冒充当前游戏证据。',
    );
  return parsed;
}
