import { createHash, randomUUID } from 'node:crypto';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { ProjectError } from '../project/project-types.ts';
import {
  STUDIO_MUTATING_COMMANDS,
  StudioCommandRegistry,
} from './studio-command-registry.ts';

export type StudioChangeOperation = {
  id: string;
  command: string;
  input: Record<string, unknown>;
  description: string;
};

export type StudioFileDiff = {
  path: string;
  beforeHash: string | null;
  afterHash: string | null;
  beforeText: string | null;
  afterText: string | null;
};

export type StudioChangeSetStatus =
  | 'awaitingApproval'
  | 'approved'
  | 'applied'
  | 'tested'
  | 'failed'
  | 'rolledBack'
  | 'rejected';

export type StudioChangeSet = {
  schemaVersion: '1.0.0';
  id: string;
  summary: string;
  createdAt: string;
  status: StudioChangeSetStatus;
  baseFingerprint: string;
  proposalHash: string;
  operations: StudioChangeOperation[];
  selectedOperationIds: string[];
  files: StudioFileDiff[];
  approval: null | {
    contentHash: string;
    approvedAt: string;
  };
  testResult: null | {
    ok: boolean;
    testedAt: string;
    diagnostics: unknown;
  };
  error: string | null;
  /** Reviewer-owned evidence; readable by Copilot, never an approval grant. */
  rejectionFeedback?: {
    schemaVersion: '1.0.0';
    id: string;
    proposalHash: string;
    reason: string;
    recordedAt: string;
  };
};

type FileBytes = { path: string; content: Buffer };

type StoredChangeSet = StudioChangeSet & {
  approvedFiles: FileBytes[] | null;
  originalFiles: FileBytes[] | null;
};

type ServiceOptions = {
  projectRoot: string;
  kernelCliPath: string;
  registry: StudioCommandRegistry;
};

const EXCLUDED = new Set(['.git', '.aigame', 'node_modules', 'dist', 'out']);
const MAX_DIFF_TEXT = 256 * 1024;

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

function contentHash(value: unknown): string {
  return sha256(JSON.stringify(canonical(value)));
}

function textOrNull(content: Buffer | undefined): string | null {
  if (!content || content.length > MAX_DIFF_TEXT || content.includes(0)) {
    return null;
  }
  return content.toString('utf8');
}

export class StudioChangeSetService {
  readonly #root: string;
  readonly #kernelCliPath: string;
  readonly #registry: StudioCommandRegistry;
  readonly #changesRoot: string;
  readonly #auditPath: string;

  constructor(options: ServiceOptions) {
    this.#root = resolve(options.projectRoot);
    this.#kernelCliPath = resolve(options.kernelCliPath);
    this.#registry = options.registry;
    this.#changesRoot = join(this.#root, '.aigame', 'local', 'changes');
    this.#auditPath = join(this.#root, '.aigame', 'audit.jsonl');
    mkdirSync(this.#changesRoot, { recursive: true });
  }

  propose(input: {
    summary: string;
    operations: Array<{
      command: string;
      input?: Record<string, unknown>;
      description?: string;
    }>;
  }): StudioChangeSet {
    const summary = input.summary?.trim();
    if (
      !summary ||
      !Array.isArray(input.operations) ||
      input.operations.length === 0
    ) {
      throw new ProjectError(
        'CHANGESET_ARGUMENT_INVALID',
        'ChangeSet 需要摘要和至少一个语义操作。',
      );
    }
    const operations = input.operations.map((operation, index) => {
      if (!STUDIO_MUTATING_COMMANDS.has(operation.command)) {
        throw new ProjectError(
          'CHANGESET_COMMAND_NOT_MUTATING',
          `不允许作为 AI ChangeSet 的命令：${operation.command}`,
        );
      }
      return {
        id: `operation:${index + 1}`,
        command: operation.command,
        input: structuredClone(operation.input ?? {}),
        description: operation.description?.trim() || operation.command,
      };
    });
    const baseFingerprint = this.#fingerprint(this.#root);
    const materialized = this.#materialize(operations);
    const proposalPayload = {
      summary,
      baseFingerprint,
      operations,
      files: materialized.diffs.map(({ path, beforeHash, afterHash }) => ({
        path,
        beforeHash,
        afterHash,
      })),
    };
    const stored: StoredChangeSet = {
      schemaVersion: '1.0.0',
      id: `changeset:${randomUUID()}`,
      summary,
      createdAt: new Date().toISOString(),
      status: 'awaitingApproval',
      baseFingerprint,
      proposalHash: contentHash(proposalPayload),
      operations,
      selectedOperationIds: operations.map(({ id }) => id),
      files: materialized.diffs,
      approval: null,
      testResult: null,
      error: null,
      approvedFiles: null,
      originalFiles: null,
    };
    this.#save(stored);
    this.#audit('changeset.propose', stored, 'ok');
    return this.#public(stored);
  }

  list(): StudioChangeSet[] {
    return readdirSync(this.#changesRoot)
      .filter((name) => name.endsWith('.json'))
      .map((name) => this.#readFile(join(this.#changesRoot, name)))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((change) => this.#public(change));
  }

  read(changeId: string): StudioChangeSet {
    return this.#public(this.#load(changeId));
  }

  approve(changeId: string, selectedOperationIds?: string[]): StudioChangeSet {
    const change = this.#load(changeId);
    if (change.status !== 'awaitingApproval') {
      throw new ProjectError(
        'CHANGESET_NOT_AWAITING_APPROVAL',
        `ChangeSet 当前状态为 ${change.status}。`,
      );
    }
    this.#assertBase(change);
    const selected =
      selectedOperationIds ?? change.operations.map(({ id }) => id);
    const selectedSet = new Set(selected);
    if (
      selected.length === 0 ||
      selectedSet.size !== selected.length ||
      selected.some(
        (id) => !change.operations.some((operation) => operation.id === id),
      )
    ) {
      throw new ProjectError(
        'CHANGESET_SELECTION_INVALID',
        '审批操作列表为空、重复或包含未知操作。',
      );
    }
    const operations = change.operations.filter((operation) =>
      selectedSet.has(operation.id),
    );
    const materialized = this.#materialize(operations);
    const approvalPayload = {
      changeId,
      baseFingerprint: change.baseFingerprint,
      operations,
      files: materialized.diffs.map(({ path, beforeHash, afterHash }) => ({
        path,
        beforeHash,
        afterHash,
      })),
    };
    change.selectedOperationIds = operations.map(({ id }) => id);
    change.files = materialized.diffs;
    change.approvedFiles = materialized.files;
    change.originalFiles = materialized.originalFiles;
    change.approval = {
      contentHash: contentHash(approvalPayload),
      approvedAt: new Date().toISOString(),
    };
    change.status = 'approved';
    change.error = null;
    this.#save(change);
    this.#audit('changeset.approve', change, 'ok');
    return this.#public(change);
  }

  reject(
    changeId: string,
    feedback?: { proposalHash: string; reason: string },
  ): StudioChangeSet {
    const change = this.#load(changeId);
    if (change.status !== 'awaitingApproval') {
      throw new ProjectError(
        'CHANGESET_NOT_REVIEWABLE',
        'ChangeSet 已不能拒绝。',
      );
    }
    // Validate before changing the decision, then persist both in one record.
    if (feedback)
      change.rejectionFeedback = this.#reviewFeedback(change, feedback);
    change.status = 'rejected';
    this.#save(change);
    this.#audit('changeset.reject', change, 'rejected');
    if (feedback)
      this.#audit('changeset.rejection-feedback', change, 'rejected');
    return this.#public(change);
  }

  /** Record a reviewer's reason after rejection, including legacy rejections.
   * This is a reviewer service API, deliberately not an agent-writable MCP tool.
   */
  recordRejectionFeedback(
    changeId: string,
    input: { proposalHash: string; reason: string },
  ): StudioChangeSet {
    const change = this.#load(changeId);
    if (change.status !== 'rejected') {
      throw new ProjectError(
        'CHANGESET_NOT_REJECTED',
        '只能为已拒绝的提案记录审核反馈。',
      );
    }
    const feedback = this.#reviewFeedback(change, input);
    if (change.rejectionFeedback) {
      if (change.rejectionFeedback.id === feedback.id)
        return this.#public(change);
      throw new ProjectError(
        'CHANGESET_FEEDBACK_IMMUTABLE',
        '已记录的审核反馈不能被覆盖；请提交新的修订提案。',
      );
    }
    change.rejectionFeedback = feedback;
    this.#save(change);
    this.#audit('changeset.rejection-feedback', change, 'rejected');
    return this.#public(change);
  }

  #reviewFeedback(
    change: StoredChangeSet,
    input: { proposalHash: string; reason: string },
  ): NonNullable<StudioChangeSet['rejectionFeedback']> {
    if (input?.proposalHash !== change.proposalHash) {
      throw new ProjectError(
        'CHANGESET_REVIEW_STALE',
        '审核反馈与提案版本不匹配。',
      );
    }
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (
      !reason ||
      reason.length > 4096 ||
      Array.from(reason).some((character) => {
        const code = character.charCodeAt(0);
        return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
      })
    ) {
      throw new ProjectError(
        'CHANGESET_FEEDBACK_INVALID',
        '审核原因需要 1–4096 个字符，且不能包含控制字符。',
      );
    }
    return {
      schemaVersion: '1.0.0',
      id: `review-feedback:${contentHash({ changeId: change.id, proposalHash: change.proposalHash, reason })}`,
      proposalHash: change.proposalHash,
      reason,
      recordedAt: new Date().toISOString(),
    };
  }

  apply(changeId: string): StudioChangeSet {
    const change = this.#load(changeId);
    if (
      change.status !== 'approved' ||
      !change.approval ||
      !change.approvedFiles
    ) {
      throw new ProjectError(
        'CHANGESET_APPROVAL_REQUIRED',
        '需要有效的人类审批。',
      );
    }
    this.#assertBase(change);
    const selected = new Set(change.selectedOperationIds);
    const operations = change.operations.filter((operation) =>
      selected.has(operation.id),
    );
    const approvalHash = contentHash({
      changeId,
      baseFingerprint: change.baseFingerprint,
      operations,
      files: change.files.map(({ path, beforeHash, afterHash }) => ({
        path,
        beforeHash,
        afterHash,
      })),
    });
    if (approvalHash !== change.approval.contentHash) {
      throw new ProjectError(
        'CHANGESET_APPROVAL_HASH_MISMATCH',
        'ChangeSet 内容已变化，原审批失效。',
      );
    }
    let committed = false;
    try {
      const approved = new Map(
        change.approvedFiles.map((file) => [file.path, file.content]),
      );
      const exactFiles = change.files.map((diff) => {
        const content =
          diff.afterHash === null ? null : approved.get(diff.path);
        if (
          diff.afterHash !== null &&
          (!content || sha256(content) !== diff.afterHash)
        ) {
          throw new ProjectError(
            'CHANGESET_APPROVED_BYTES_INVALID',
            `已审批文件内容缺失或哈希不符：${diff.path}`,
          );
        }
        return { path: diff.path, content: content ?? null };
      });
      this.#registry.applyApprovedFiles(
        `应用 ChangeSet ${change.id}: ${change.summary}`,
        exactFiles,
      );
      committed = true;
      for (const expected of change.files) {
        const path = this.#safeProjectPath(expected.path);
        if (
          expected.afterHash !== null &&
          (!existsSync(path) ||
            sha256(readFileSync(path)) !== expected.afterHash)
        ) {
          throw new ProjectError(
            'CHANGESET_APPLY_DIVERGED',
            `应用结果与已审批内容不一致：${expected.path}`,
          );
        }
        if (expected.afterHash === null && existsSync(path)) {
          throw new ProjectError(
            'CHANGESET_APPLY_DIVERGED',
            `已审批删除未发生：${expected.path}`,
          );
        }
      }
    } catch (error) {
      if (committed) {
        try {
          this.#registry.execute('history.undo');
        } catch {
          // Recovery journal will reconcile an interrupted file transaction.
        }
      }
      throw error;
    }
    change.status = 'applied';
    change.error = null;
    this.#save(change);
    this.#audit('changeset.apply', change, 'ok');
    return this.#public(change);
  }

  test(changeId: string): StudioChangeSet {
    const change = this.#load(changeId);
    if (change.status !== 'applied' && change.status !== 'failed') {
      throw new ProjectError('CHANGESET_NOT_APPLIED', '请先应用 ChangeSet。');
    }
    try {
      const validation = this.#registry.execute('project.validate').data;
      const replay = this.#registry.execute('test.run').data;
      const validationState = validation as { ok?: boolean } | null;
      const runtimeState = replay as {
        status?: string;
        diagnostics?: Array<{ severity?: string }>;
      } | null;
      if (
        validationState?.ok === false ||
        (runtimeState?.status !== undefined &&
          runtimeState.status !== 'completed') ||
        runtimeState?.diagnostics?.some((item) => item.severity === 'error')
      ) {
        throw new ProjectError(
          'CHANGESET_TEST_FAILED',
          '项目验证或运行测试失败，请检查结构化诊断。',
          { validation, replay },
        );
      }
      change.testResult = {
        ok: true,
        testedAt: new Date().toISOString(),
        diagnostics: { validation, replay },
      };
      change.status = 'tested';
      change.error = null;
      this.#audit('changeset.test', change, 'ok');
    } catch (error) {
      change.testResult = {
        ok: false,
        testedAt: new Date().toISOString(),
        diagnostics: error instanceof ProjectError ? error.details : null,
      };
      change.status = 'failed';
      change.error = error instanceof Error ? error.message : String(error);
      this.#audit('changeset.test', change, 'rejected');
    }
    this.#save(change);
    return this.#public(change);
  }

  rollback(changeId: string): StudioChangeSet {
    const change = this.#load(changeId);
    if (!['applied', 'tested', 'failed'].includes(change.status)) {
      throw new ProjectError(
        'CHANGESET_NOT_ROLLBACKABLE',
        'ChangeSet 当前不能回滚。',
      );
    }
    if (!change.originalFiles || !change.approvedFiles) {
      throw new ProjectError(
        'CHANGESET_ROLLBACK_BYTES_MISSING',
        '旧版 ChangeSet 缺少逐文件回滚字节，已拒绝不安全的全局 Undo。',
      );
    }
    for (const expected of change.files) {
      const path = this.#safeProjectPath(expected.path);
      const exists = existsSync(path);
      const currentHash = exists ? sha256(readFileSync(path)) : null;
      if (currentHash !== expected.afterHash) {
        throw new ProjectError(
          'CHANGESET_ROLLBACK_CONFLICT',
          `文件在 ChangeSet 应用后被再次修改，已拒绝覆盖：${expected.path}`,
          {
            path: expected.path,
            expectedHash: expected.afterHash,
            currentHash,
          },
        );
      }
    }
    const originals = new Map(
      change.originalFiles.map((file) => [file.path, file.content]),
    );
    const restoreFiles = change.files.map((diff) => {
      const content =
        diff.beforeHash === null ? null : originals.get(diff.path);
      if (
        diff.beforeHash !== null &&
        (!content || sha256(content) !== diff.beforeHash)
      ) {
        throw new ProjectError(
          'CHANGESET_ROLLBACK_BYTES_INVALID',
          `ChangeSet 原始字节缺失或哈希不符：${diff.path}`,
        );
      }
      return { path: diff.path, content: content ?? null };
    });
    this.#registry.applyApprovedFiles(
      `回滚 ChangeSet ${change.id}: ${change.summary}`,
      restoreFiles,
    );
    for (const expected of change.files) {
      const path = this.#safeProjectPath(expected.path);
      const restoredHash = existsSync(path) ? sha256(readFileSync(path)) : null;
      if (restoredHash !== expected.beforeHash) {
        throw new ProjectError(
          'CHANGESET_ROLLBACK_DIVERGED',
          `ChangeSet 拥有的文件未精确恢复：${expected.path}`,
        );
      }
    }
    change.status = 'rolledBack';
    change.error = null;
    this.#save(change);
    this.#audit('changeset.rollback', change, 'rolledBack');
    return this.#public(change);
  }

  #materialize(operations: StudioChangeOperation[]): {
    diffs: StudioFileDiff[];
    files: FileBytes[];
    originalFiles: FileBytes[];
  } {
    const temporary = mkdtempSync(join(tmpdir(), 'aigame-changeset-'));
    const project = join(temporary, 'project');
    try {
      cpSync(this.#root, project, {
        recursive: true,
        filter: (source) => {
          const inside = relative(this.#root, source);
          if (!inside) return true;
          return !inside.split(/[\\/]/u).some((part) => EXCLUDED.has(part));
        },
      });
      const registry = new StudioCommandRegistry({
        projectRoot: project,
        kernelCliPath: this.#kernelCliPath,
      });
      const before = this.#files(project);
      for (const operation of operations) {
        registry.execute(operation.command, operation.input);
      }
      const after = this.#files(project);
      const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
      const diffs = paths.flatMap((path) => {
        const oldBytes = before.get(path);
        const newBytes = after.get(path);
        if (oldBytes?.equals(newBytes ?? Buffer.alloc(0))) return [];
        return [
          {
            path,
            beforeHash: oldBytes ? sha256(oldBytes) : null,
            afterHash: newBytes ? sha256(newBytes) : null,
            beforeText: textOrNull(oldBytes),
            afterText: textOrNull(newBytes),
          },
        ];
      });
      return {
        diffs,
        files: diffs.flatMap((diff) => {
          const content = after.get(diff.path);
          return content ? [{ path: diff.path, content }] : [];
        }),
        originalFiles: diffs.flatMap((diff) => {
          const content = before.get(diff.path);
          return content ? [{ path: diff.path, content }] : [];
        }),
      };
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }

  #files(root: string): Map<string, Buffer> {
    const files = new Map<string, Buffer>();
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && EXCLUDED.has(entry.name)) continue;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) walk(path);
        else
          files.set(
            relative(root, path).replaceAll('\\', '/'),
            readFileSync(path),
          );
      }
    };
    walk(root);
    return files;
  }

  #fingerprint(root: string): string {
    return contentHash(
      [...this.#files(root)].map(([path, content]) => [path, sha256(content)]),
    );
  }

  #assertBase(change: StoredChangeSet): void {
    if (this.#fingerprint(this.#root) !== change.baseFingerprint) {
      throw new ProjectError(
        'CHANGESET_BASE_CHANGED',
        '项目在规划后发生变化，请让 Codex 重新生成 ChangeSet。',
      );
    }
  }

  #safeProjectPath(relativePath: string): string {
    if (
      !relativePath ||
      isAbsolute(relativePath) ||
      relativePath.includes('..')
    ) {
      throw new ProjectError(
        'CHANGESET_PATH_INVALID',
        `非法项目路径：${relativePath}`,
      );
    }
    const target = resolve(this.#root, relativePath);
    const inside = relative(this.#root, target);
    if (inside.startsWith('..') || isAbsolute(inside)) {
      throw new ProjectError(
        'CHANGESET_PATH_ESCAPE',
        `路径逃逸：${relativePath}`,
      );
    }
    return target;
  }

  #path(changeId: string): string {
    if (!/^changeset:[0-9a-f-]+$/u.test(changeId)) {
      throw new ProjectError('CHANGESET_ID_INVALID', 'ChangeSet ID 无效。');
    }
    return join(this.#changesRoot, `${changeId.replace(':', '_')}.json`);
  }

  #load(changeId: string): StoredChangeSet {
    const path = this.#path(changeId);
    if (!existsSync(path)) {
      throw new ProjectError(
        'CHANGESET_NOT_FOUND',
        `ChangeSet 不存在：${changeId}`,
      );
    }
    return this.#readFile(path);
  }

  #readFile(path: string): StoredChangeSet {
    const serialized = JSON.parse(readFileSync(path, 'utf8')) as Omit<
      StoredChangeSet,
      'approvedFiles' | 'originalFiles'
    > & {
      approvedFiles: Array<{ path: string; content: string }> | null;
      originalFiles?: Array<{ path: string; content: string }> | null;
    };
    return {
      ...serialized,
      approvedFiles:
        serialized.approvedFiles?.map((file) => ({
          path: file.path,
          content: Buffer.from(file.content, 'base64'),
        })) ?? null,
      originalFiles:
        serialized.originalFiles?.map((file) => ({
          path: file.path,
          content: Buffer.from(file.content, 'base64'),
        })) ?? null,
    };
  }

  #save(change: StoredChangeSet): void {
    const path = this.#path(change.id);
    mkdirSync(dirname(path), { recursive: true });
    const serialized = {
      ...change,
      approvedFiles:
        change.approvedFiles?.map((file) => ({
          path: file.path,
          content: file.content.toString('base64'),
        })) ?? null,
      originalFiles:
        change.originalFiles?.map((file) => ({
          path: file.path,
          content: file.content.toString('base64'),
        })) ?? null,
    };
    const temporary = `${path}.${randomUUID()}.tmp`;
    writeFileSync(
      temporary,
      `${JSON.stringify(serialized, null, 2)}\n`,
      'utf8',
    );
    // Replace in one rename. Moving the old file aside first creates an
    // ENOENT window for the Studio/broker readers running in other processes.
    // A failed replacement leaves the previous canonical record untouched.
    try {
      renameSync(temporary, path);
    } catch (error) {
      rmSync(temporary, { force: true });
      throw error;
    }
  }

  #public(change: StoredChangeSet): StudioChangeSet {
    const {
      approvedFiles: _approvedFiles,
      originalFiles: _originalFiles,
      ...visible
    } = change;
    return structuredClone(visible);
  }

  #audit(
    action: string,
    change: StoredChangeSet,
    status: 'ok' | 'rejected' | 'rolledBack',
  ): void {
    mkdirSync(dirname(this.#auditPath), { recursive: true });
    appendFileSync(
      this.#auditPath,
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        action,
        status,
        changeId: change.id,
        proposalHash: change.proposalHash,
        approvalHash: change.approval?.contentHash ?? null,
        ...(change.rejectionFeedback
          ? { reviewFeedbackId: change.rejectionFeedback.id }
          : {}),
        selectedOperationIds: change.selectedOperationIds,
      })}\n`,
      'utf8',
    );
  }
}
