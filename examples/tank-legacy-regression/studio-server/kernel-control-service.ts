import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ChangeOperation = {
  op: 'add' | 'replace' | 'remove';
  path: string;
  value?: JsonValue;
};

export type ChangePlanInput = {
  projectPath: string;
  summary: string;
  operations: ChangeOperation[];
  expectedEffects?: string[];
};

export type ChangeStatus =
  | 'planned'
  | 'invalid'
  | 'approved'
  | 'applied'
  | 'rolledBack';

export type ChangeSet = {
  id: string;
  projectPath: string;
  summary: string;
  baseHash: string;
  candidateHash: string;
  operations: ChangeOperation[];
  expectedEffects: string[];
  preview: ChangePreview[];
  diagnostics: JsonValue;
  status: ChangeStatus;
  approvalRequired: true;
};

export type ChangePreview = {
  op: ChangeOperation['op'];
  path: string;
  before?: JsonValue;
  after?: JsonValue;
};

export type ApprovalGrant = {
  changeId: string;
  token: string;
};

export type AuditEvent = {
  sequence: number;
  timestamp: string;
  action: string;
  changeId?: string;
  projectPath?: string;
  status: 'ok' | 'rejected' | 'rolledBack';
  details?: JsonValue;
};

type StoredChange = {
  public: ChangeSet;
  previousSource: string;
  candidateSource: string;
  appliedHash?: string;
};

export type ControlServiceOptions = {
  workspaceRoot: string;
  kernelRoot?: string;
  permission?: 'readOnly' | 'approvalRequired';
  persistAudit?: boolean;
};

export type RecoveryReport = {
  recovered: string[];
  discarded: string[];
  conflicts: string[];
};

export class ControlError extends Error {
  readonly code: string;
  readonly data?: JsonValue;

  constructor(code: string, message: string, data?: JsonValue) {
    super(message);
    this.name = 'ControlError';
    this.code = code;
    this.data = data;
  }
}

/**
 * AI-facing control plane. Reads and plans are non-mutating; writes require a
 * separate human approval grant and preserve enough state for guarded rollback.
 */
export class KernelControlService {
  readonly #workspaceRoot: string;
  readonly #kernelRoot: string;
  readonly #permission: 'readOnly' | 'approvalRequired';
  readonly #persistAudit: boolean;
  readonly #changes = new Map<string, StoredChange>();
  readonly #grants = new Map<string, string>();
  readonly #audit: AuditEvent[] = [];

  constructor(options: ControlServiceOptions) {
    this.#workspaceRoot = resolve(options.workspaceRoot);
    this.#kernelRoot = resolve(options.kernelRoot ?? process.cwd());
    this.#permission = options.permission ?? 'approvalRequired';
    this.#persistAudit = options.persistAudit ?? true;
    const recovery = recoverInterruptedTransactions(this.#workspaceRoot);
    if (recovery.conflicts.length > 0) {
      throw new ControlError(
        'CONTROL_RECOVERY_CONFLICT',
        'an interrupted write conflicts with newer workspace content',
        {
          recovered: recovery.recovered,
          discarded: recovery.discarded,
          conflicts: recovery.conflicts,
        },
      );
    }
    if (recovery.recovered.length > 0) {
      this.record({
        action: 'recovery.restore',
        status: 'rolledBack',
        details: {
          recovered: recovery.recovered,
          discarded: recovery.discarded,
          conflicts: recovery.conflicts,
        },
      });
    }
  }

  /** Dispatches one stable tool method used by JSON-RPC, Studio, or tests. */
  async dispatch(method: string, params: JsonValue = {}): Promise<JsonValue> {
    const object = asObject(params, 'params');
    switch (method) {
      case 'schema.describe':
        return this.describeSchema(optionalString(object.definition));
      case 'project.query':
        return this.queryProject(
          requiredString(object.projectPath, 'projectPath'),
          optionalString(object.pointer),
        );
      case 'world.query':
        return this.queryWorld(
          requiredString(object.projectPath, 'projectPath'),
          requiredString(object.worldId, 'worldId'),
        );
      case 'change.plan':
        return this.planChange(asChangePlanInput(object));
      case 'change.validate':
        return this.validateChange(requiredString(object.changeId, 'changeId'));
      case 'change.approve':
        return this.approveChange(requiredString(object.changeId, 'changeId'));
      case 'change.apply':
        return this.applyChange(
          requiredString(object.changeId, 'changeId'),
          requiredString(object.approvalToken, 'approvalToken'),
        );
      case 'change.rollback':
        return this.rollbackChange(requiredString(object.changeId, 'changeId'));
      case 'simulation.run':
        return this.runSimulation(
          requiredString(object.projectPath, 'projectPath'),
          requiredString(object.inputPath, 'inputPath'),
        );
      case 'simulation.snapshot': {
        const result = this.runSimulation(
          requiredString(object.projectPath, 'projectPath'),
          requiredString(object.inputPath, 'inputPath'),
        );
        const envelope = asObject(result, 'simulation result');
        return asObject(
          asObject(envelope.result, 'result').snapshot,
          'snapshot',
        );
      }
      case 'simulation.compare':
        return this.compareSimulation(
          requiredString(object.projectPath, 'projectPath'),
          requiredString(object.inputPath, 'inputPath'),
          requiredString(object.expectedHash, 'expectedHash'),
        );
      case 'failure.explain':
        return explainFailure(object.failure);
      case 'audit.list':
        return { events: structuredClone(this.#audit) };
      default:
        throw new ControlError(
          'CONTROL_METHOD_NOT_FOUND',
          `unknown method ${method}`,
        );
    }
  }

  private describeSchema(definition?: string): JsonValue {
    const schema = JSON.parse(
      readFileSync(
        resolve(
          this.#kernelRoot,
          'examples/tank-legacy-regression/schemas/game-ir.schema.json',
        ),
        'utf8',
      ),
    ) as JsonValue;
    if (!definition) return schema;
    const definitions = asObject(asObject(schema, 'schema').$defs, '$defs');
    const value = definitions[definition];
    if (value === undefined) {
      throw new ControlError(
        'CONTROL_SCHEMA_DEFINITION',
        `schema definition ${definition} does not exist`,
      );
    }
    return structuredClone(value);
  }

  private queryProject(projectPath: string, pointer?: string): JsonValue {
    const project = this.readProject(projectPath).document;
    if (!pointer) return project;
    const value = valueAtPointer(project, pointer);
    if (value === undefined) {
      throw new ControlError(
        'CONTROL_POINTER_NOT_FOUND',
        `JSON pointer ${pointer} does not exist`,
      );
    }
    return structuredClone(value);
  }

  private queryWorld(projectPath: string, worldId: string): JsonValue {
    const project = asObject(this.queryProject(projectPath), 'project');
    const worlds = asArray(project.worlds, 'worlds');
    const world = worlds.find(
      (candidate) => asObject(candidate, 'world').id === worldId,
    );
    if (world === undefined) {
      throw new ControlError(
        'CONTROL_WORLD_NOT_FOUND',
        `world ${worldId} does not exist`,
      );
    }
    return structuredClone(world);
  }

  private planChange(input: ChangePlanInput): JsonValue {
    const current = this.readProject(input.projectPath);
    const candidate = applyOperations(current.document, input.operations);
    const candidateSource = `${JSON.stringify(candidate, null, 2)}\n`;
    const validation = this.validateSource(input.projectPath, candidateSource);
    const id = `change:${randomUUID()}`;
    const status: ChangeStatus = validation.ok ? 'planned' : 'invalid';
    const change: ChangeSet = {
      id,
      projectPath: input.projectPath,
      summary: input.summary,
      baseHash: hash(current.source),
      candidateHash: hash(candidateSource),
      operations: structuredClone(input.operations),
      expectedEffects: structuredClone(input.expectedEffects ?? []),
      preview: previewOperations(current.document, input.operations),
      diagnostics: validation,
      status,
      approvalRequired: true,
    };
    this.#changes.set(id, {
      public: change,
      previousSource: current.source,
      candidateSource,
    });
    this.record({
      action: 'change.plan',
      changeId: id,
      projectPath: input.projectPath,
      status: validation.ok ? 'ok' : 'rejected',
      details: {
        summary: input.summary,
        operationCount: input.operations.length,
      },
    });
    return structuredClone(change);
  }

  private validateChange(changeId: string): JsonValue {
    const stored = this.requireChange(changeId);
    const current = this.readProject(stored.public.projectPath);
    const baseMatches = hash(current.source) === stored.public.baseHash;
    const diagnostics = this.validateSource(
      stored.public.projectPath,
      stored.candidateSource,
    );
    const ok = baseMatches && diagnostics.ok;
    return {
      ok,
      baseMatches,
      diagnostics,
      candidateHash: stored.public.candidateHash,
    };
  }

  private approveChange(changeId: string): JsonValue {
    this.requireWritable();
    const stored = this.requireChange(changeId);
    if (stored.public.status !== 'planned') {
      throw new ControlError(
        'CONTROL_CHANGE_NOT_PLANNED',
        `change ${changeId} is ${stored.public.status}`,
      );
    }
    const validation = asObject(this.validateChange(changeId), 'validation');
    if (validation.ok !== true) {
      throw new ControlError(
        'CONTROL_CHANGE_INVALID',
        `change ${changeId} no longer validates`,
        validation,
      );
    }
    const token = randomUUID();
    this.#grants.set(changeId, token);
    stored.public.status = 'approved';
    this.record({
      action: 'change.approve',
      changeId,
      projectPath: stored.public.projectPath,
      status: 'ok',
    });
    return { changeId, token } satisfies ApprovalGrant;
  }

  private applyChange(changeId: string, approvalToken: string): JsonValue {
    this.requireWritable();
    const stored = this.requireChange(changeId);
    if (
      stored.public.status !== 'approved' ||
      this.#grants.get(changeId) !== approvalToken
    ) {
      this.record({
        action: 'change.apply',
        changeId,
        projectPath: stored.public.projectPath,
        status: 'rejected',
        details: { code: 'CONTROL_APPROVAL_REQUIRED' },
      });
      throw new ControlError(
        'CONTROL_APPROVAL_REQUIRED',
        'a separate valid human approval grant is required',
      );
    }
    const current = this.readProject(stored.public.projectPath);
    if (hash(current.source) !== stored.public.baseHash) {
      throw new ControlError(
        'CONTROL_BASE_CHANGED',
        'project changed after the ChangeSet was planned; re-plan before applying',
      );
    }
    const target = this.resolveProjectPath(stored.public.projectPath);
    atomicWrite(this.#workspaceRoot, target, stored.candidateSource, changeId);
    const postValidation = this.validateSource(
      stored.public.projectPath,
      readFileSync(target, 'utf8'),
    );
    if (!postValidation.ok) {
      atomicWrite(
        this.#workspaceRoot,
        target,
        stored.previousSource,
        `${changeId}-recovery`,
      );
      stored.public.status = 'rolledBack';
      this.record({
        action: 'change.apply',
        changeId,
        projectPath: stored.public.projectPath,
        status: 'rolledBack',
        details: postValidation,
      });
      throw new ControlError(
        'CONTROL_POST_APPLY_INVALID',
        'post-apply validation failed; original project was restored',
        postValidation,
      );
    }
    stored.public.status = 'applied';
    stored.appliedHash = hash(stored.candidateSource);
    this.#grants.delete(changeId);
    this.record({
      action: 'change.apply',
      changeId,
      projectPath: stored.public.projectPath,
      status: 'ok',
      details: { candidateHash: stored.public.candidateHash },
    });
    return structuredClone(stored.public);
  }

  private rollbackChange(changeId: string): JsonValue {
    this.requireWritable();
    const stored = this.requireChange(changeId);
    if (stored.public.status !== 'applied') {
      throw new ControlError(
        'CONTROL_CHANGE_NOT_APPLIED',
        `change ${changeId} is ${stored.public.status}`,
      );
    }
    const target = this.resolveProjectPath(stored.public.projectPath);
    const currentSource = readFileSync(target, 'utf8');
    if (hash(currentSource) !== stored.appliedHash) {
      throw new ControlError(
        'CONTROL_ROLLBACK_CONFLICT',
        'project changed after apply; automatic rollback would overwrite newer work',
      );
    }
    atomicWrite(
      this.#workspaceRoot,
      target,
      stored.previousSource,
      `${changeId}-rollback`,
    );
    stored.public.status = 'rolledBack';
    this.record({
      action: 'change.rollback',
      changeId,
      projectPath: stored.public.projectPath,
      status: 'rolledBack',
      details: { restoredHash: stored.public.baseHash },
    });
    return structuredClone(stored.public);
  }

  private runSimulation(projectPath: string, inputPath: string): JsonValue {
    const project = this.resolveProjectPath(projectPath);
    const input = this.resolveWorkspacePath(inputPath);
    return this.runKernel(['run', project, input]);
  }

  private compareSimulation(
    projectPath: string,
    inputPath: string,
    expectedHash: string,
  ): JsonValue {
    const project = this.resolveProjectPath(projectPath);
    const input = this.resolveWorkspacePath(inputPath);
    const value = this.runKernel(
      ['verify', project, input, expectedHash],
      true,
    );
    const result = asObject(value, 'verification result');
    if (result.ok === true) {
      return { equal: true, stateHash: result.stateHash };
    }
    return { equal: false, failure: result.error };
  }

  private validateSource(
    projectPath: string,
    source: string,
  ): {
    ok: boolean;
    [key: string]: JsonValue;
  } {
    return this.runKernel(['validate', '-'], true, source) as {
      ok: boolean;
      [key: string]: JsonValue;
    };
  }

  private runKernel(
    args: string[],
    allowFailure = false,
    input?: string,
  ): JsonValue {
    const executable = process.env.AI_GAME_KERNEL_CLI;
    const command = executable ?? 'cargo';
    const commandArgs = executable
      ? args
      : ['run', '--quiet', '-p', 'ai-game-kernel-cli', '--', ...args];
    const result = spawnSync(command, commandArgs, {
      cwd: this.#kernelRoot,
      encoding: 'utf8',
      input,
      windowsHide: true,
    });
    if (result.error) {
      throw new ControlError('CONTROL_KERNEL_SPAWN', result.error.message);
    }
    let output: JsonValue;
    try {
      output = JSON.parse(result.stdout) as JsonValue;
    } catch {
      throw new ControlError(
        'CONTROL_KERNEL_PROTOCOL',
        'kernel did not return valid JSON',
        { status: result.status, stderr: result.stderr },
      );
    }
    if (result.status !== 0 && !allowFailure) {
      throw new ControlError(
        'CONTROL_KERNEL_FAILED',
        `kernel exited with status ${result.status}`,
        output,
      );
    }
    return output;
  }

  private readProject(projectPath: string): {
    source: string;
    document: JsonValue;
  } {
    const target = this.resolveProjectPath(projectPath);
    const source = readFileSync(target, 'utf8');
    return { source, document: JSON.parse(source) as JsonValue };
  }

  private resolveProjectPath(projectPath: string): string {
    if (!projectPath.endsWith('.game.json')) {
      throw new ControlError(
        'CONTROL_PROJECT_EXTENSION',
        'project writes are restricted to .game.json files',
      );
    }
    return this.resolveWorkspacePath(projectPath);
  }

  private resolveWorkspacePath(path: string): string {
    if (isAbsolute(path)) {
      const normalized = resolve(path);
      const inside = relative(this.#workspaceRoot, normalized);
      if (inside.startsWith('..') || isAbsolute(inside)) {
        throw new ControlError(
          'CONTROL_SANDBOX_ESCAPE',
          'path leaves the workspace',
        );
      }
      return normalized;
    }
    const target = resolve(this.#workspaceRoot, path);
    const inside = relative(this.#workspaceRoot, target);
    if (inside.startsWith('..') || isAbsolute(inside)) {
      throw new ControlError(
        'CONTROL_SANDBOX_ESCAPE',
        'path leaves the workspace',
      );
    }
    return target;
  }

  private requireChange(changeId: string): StoredChange {
    const stored = this.#changes.get(changeId);
    if (!stored) {
      throw new ControlError(
        'CONTROL_CHANGE_NOT_FOUND',
        `change ${changeId} does not exist in this session`,
      );
    }
    return stored;
  }

  private requireWritable(): void {
    if (this.#permission === 'readOnly') {
      throw new ControlError(
        'CONTROL_READ_ONLY',
        'workspace permission is read-only',
      );
    }
  }

  private record(event: Omit<AuditEvent, 'sequence' | 'timestamp'>): void {
    const complete: AuditEvent = {
      sequence: this.#audit.length,
      timestamp: new Date().toISOString(),
      ...event,
    };
    this.#audit.push(complete);
    if (this.#persistAudit) {
      const auditPath = resolve(
        this.#workspaceRoot,
        '.ai-game-kernel',
        'audit.jsonl',
      );
      mkdirSync(dirname(auditPath), { recursive: true });
      appendFileSync(auditPath, `${JSON.stringify(complete)}\n`, 'utf8');
    }
  }
}

function asChangePlanInput(object: Record<string, JsonValue>): ChangePlanInput {
  const operations = asArray(object.operations, 'operations').map(
    (operation, index) => {
      const value = asObject(operation, `operations/${index}`);
      const op = requiredString(value.op, `operations/${index}/op`);
      if (op !== 'add' && op !== 'replace' && op !== 'remove') {
        throw new ControlError(
          'CONTROL_PATCH_OP',
          `unsupported patch operation ${op}`,
        );
      }
      const typedOperation: ChangeOperation['op'] = op;
      return {
        op: typedOperation,
        path: requiredString(value.path, `operations/${index}/path`),
        ...(value.value === undefined ? {} : { value: value.value }),
      };
    },
  );
  return {
    projectPath: requiredString(object.projectPath, 'projectPath'),
    summary: requiredString(object.summary, 'summary'),
    operations,
    expectedEffects: object.expectedEffects
      ? asArray(object.expectedEffects, 'expectedEffects').map(
          (effect, index) => requiredString(effect, `expectedEffects/${index}`),
        )
      : [],
  };
}

function applyOperations(
  source: JsonValue,
  operations: ChangeOperation[],
): JsonValue {
  const target = structuredClone(source);
  for (const operation of operations) applyOperation(target, operation);
  return target;
}

function applyOperation(root: JsonValue, operation: ChangeOperation): void {
  const tokens = pointerTokens(operation.path);
  if (tokens.length === 0) {
    throw new ControlError(
      'CONTROL_PATCH_ROOT',
      'root replacement is not permitted',
    );
  }
  let parent: JsonValue = root;
  for (const token of tokens.slice(0, -1)) {
    const next = childAt(parent, token);
    if (next === undefined) {
      throw new ControlError(
        'CONTROL_PATCH_PATH',
        `patch parent ${operation.path} does not exist`,
      );
    }
    parent = next;
  }
  const key = tokens.at(-1) ?? '';
  if (Array.isArray(parent)) {
    const index =
      key === '-' ? parent.length : parseArrayIndex(key, parent.length);
    if (operation.op === 'add') {
      requirePatchValue(operation);
      parent.splice(index, 0, structuredClone(operation.value));
    } else {
      if (index >= parent.length) {
        throw new ControlError(
          'CONTROL_PATCH_PATH',
          `array index ${index} is missing`,
        );
      }
      if (operation.op === 'remove') parent.splice(index, 1);
      else {
        requirePatchValue(operation);
        parent[index] = structuredClone(operation.value);
      }
    }
    return;
  }
  const object = asObject(parent, operation.path);
  const exists = Object.hasOwn(object, key);
  if (operation.op !== 'add' && !exists) {
    throw new ControlError(
      'CONTROL_PATCH_PATH',
      `property ${operation.path} is missing`,
    );
  }
  if (operation.op === 'remove') delete object[key];
  else {
    requirePatchValue(operation);
    object[key] = structuredClone(operation.value);
  }
}

function previewOperations(
  source: JsonValue,
  operations: ChangeOperation[],
): ChangePreview[] {
  const working = structuredClone(source);
  return operations.map((operation) => {
    const before = valueAtPointer(working, operation.path);
    applyOperation(working, operation);
    const after = valueAtPointer(working, operation.path);
    return {
      op: operation.op,
      path: operation.path,
      ...(before === undefined ? {} : { before: structuredClone(before) }),
      ...(after === undefined ? {} : { after: structuredClone(after) }),
    };
  });
}

function valueAtPointer(
  root: JsonValue,
  pointer: string,
): JsonValue | undefined {
  let value: JsonValue | undefined = root;
  for (const token of pointerTokens(pointer)) {
    if (value === undefined) return undefined;
    value = childAt(value, token);
  }
  return value;
}

function childAt(parent: JsonValue, token: string): JsonValue | undefined {
  if (Array.isArray(parent)) {
    if (!/^\d+$/u.test(token)) return undefined;
    return parent[Number(token)];
  }
  if (typeof parent === 'object' && parent !== null) return parent[token];
  return undefined;
}

function pointerTokens(pointer: string): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) {
    throw new ControlError(
      'CONTROL_POINTER_SYNTAX',
      `JSON pointer must start with /: ${pointer}`,
    );
  }
  return pointer
    .slice(1)
    .split('/')
    .map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'));
}

function parseArrayIndex(token: string, upperBound: number): number {
  if (!/^\d+$/u.test(token)) {
    throw new ControlError(
      'CONTROL_PATCH_INDEX',
      `invalid array index ${token}`,
    );
  }
  const index = Number(token);
  if (!Number.isSafeInteger(index) || index > upperBound) {
    throw new ControlError(
      'CONTROL_PATCH_INDEX',
      `array index ${token} is out of range`,
    );
  }
  return index;
}

function requirePatchValue(
  operation: ChangeOperation,
): asserts operation is ChangeOperation & { value: JsonValue } {
  if (operation.value === undefined) {
    throw new ControlError(
      'CONTROL_PATCH_VALUE',
      `${operation.op} requires a value at ${operation.path}`,
    );
  }
}

type RecoveryJournal = {
  version: 1;
  id: string;
  target: string;
  temporary: string;
  previousSource: string;
  candidateHash: string;
};

function atomicWrite(
  workspaceRoot: string,
  target: string,
  source: string,
  operationId: string,
): void {
  const safeId = operationId.replaceAll(/[^a-zA-Z0-9_-]/gu, '_');
  const temporary = resolve(
    dirname(target),
    `.ai-game-kernel-write-${safeId}.tmp`,
  );
  const transactionDirectory = resolve(
    workspaceRoot,
    '.ai-game-kernel',
    'transactions',
  );
  mkdirSync(transactionDirectory, { recursive: true });
  const journalPath = resolve(transactionDirectory, `${safeId}.json`);
  const journal: RecoveryJournal = {
    version: 1,
    id: safeId,
    target: workspaceRelativePath(workspaceRoot, target),
    temporary: workspaceRelativePath(workspaceRoot, temporary),
    previousSource: readFileSync(target, 'utf8'),
    candidateHash: hash(source),
  };
  writeFileSync(journalPath, `${JSON.stringify(journal)}\n`, 'utf8');
  writeFileSync(temporary, source, 'utf8');
  renameSync(temporary, target);
  unlinkSync(journalPath);
}

/**
 * Rolls back a write whose journal survived a process or machine crash.
 * A journal is touched only when both paths remain inside the workspace and
 * the target still contains either the old or intended candidate bytes.
 */
export function recoverInterruptedTransactions(
  workspaceRoot: string,
): RecoveryReport {
  const root = resolve(workspaceRoot);
  const transactionDirectory = resolve(root, '.ai-game-kernel', 'transactions');
  const report: RecoveryReport = {
    recovered: [],
    discarded: [],
    conflicts: [],
  };
  if (!existsSync(transactionDirectory)) return report;
  for (const name of readdirSync(transactionDirectory).sort()) {
    if (!name.endsWith('.json')) continue;
    const journalPath = resolve(transactionDirectory, name);
    let journal: RecoveryJournal;
    try {
      journal = JSON.parse(
        readFileSync(journalPath, 'utf8'),
      ) as RecoveryJournal;
    } catch {
      report.conflicts.push(name);
      continue;
    }
    if (
      journal.version !== 1 ||
      typeof journal.id !== 'string' ||
      typeof journal.target !== 'string' ||
      typeof journal.temporary !== 'string' ||
      typeof journal.previousSource !== 'string' ||
      typeof journal.candidateHash !== 'string'
    ) {
      report.conflicts.push(name);
      continue;
    }
    let target: string;
    let temporary: string;
    try {
      target = workspacePathFromJournal(root, journal.target);
      temporary = workspacePathFromJournal(root, journal.temporary);
    } catch {
      report.conflicts.push(journal.id);
      continue;
    }
    if (!existsSync(target)) {
      report.conflicts.push(journal.id);
      continue;
    }
    const currentSource = readFileSync(target, 'utf8');
    const currentHash = hash(currentSource);
    const previousHash = hash(journal.previousSource);
    if (currentHash === journal.candidateHash) {
      const recoveryTemporary = resolve(
        dirname(target),
        `.ai-game-kernel-recovery-${journal.id}.tmp`,
      );
      writeFileSync(recoveryTemporary, journal.previousSource, 'utf8');
      renameSync(recoveryTemporary, target);
      report.recovered.push(journal.id);
    } else if (currentHash === previousHash) {
      report.discarded.push(journal.id);
    } else {
      report.conflicts.push(journal.id);
      continue;
    }
    if (existsSync(temporary)) unlinkSync(temporary);
    unlinkSync(journalPath);
  }
  return report;
}

function workspaceRelativePath(workspaceRoot: string, target: string): string {
  const inside = relative(resolve(workspaceRoot), resolve(target));
  if (inside.startsWith('..') || isAbsolute(inside)) {
    throw new ControlError(
      'CONTROL_TRANSACTION_ESCAPE',
      'transaction path leaves the workspace',
    );
  }
  return inside.replaceAll('\\', '/');
}

function workspacePathFromJournal(workspaceRoot: string, path: string): string {
  if (isAbsolute(path)) {
    throw new ControlError(
      'CONTROL_TRANSACTION_ESCAPE',
      'transaction journal contains an absolute path',
    );
  }
  const target = resolve(workspaceRoot, path);
  workspaceRelativePath(workspaceRoot, target);
  return target;
}

function hash(source: string): string {
  return createHash('sha256').update(source, 'utf8').digest('hex');
}

function asObject(
  value: JsonValue | undefined,
  label: string,
): Record<string, JsonValue> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ControlError('CONTROL_TYPE', `${label} must be an object`);
  }
  return value;
}

function asArray(value: JsonValue | undefined, label: string): JsonValue[] {
  if (!Array.isArray(value)) {
    throw new ControlError('CONTROL_TYPE', `${label} must be an array`);
  }
  return value;
}

function requiredString(value: JsonValue | undefined, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ControlError(
      'CONTROL_TYPE',
      `${label} must be a non-empty string`,
    );
  }
  return value;
}

function optionalString(value: JsonValue | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  return requiredString(value, 'value');
}

function explainFailure(failure: JsonValue | undefined): JsonValue {
  const object = asObject(failure, 'failure');
  const code = typeof object.code === 'string' ? object.code : 'UNKNOWN';
  if (code === 'CONTROL_APPROVAL_REQUIRED') {
    return {
      code,
      rootCause:
        'The ChangeSet has no valid grant from the human approval boundary.',
      suggestedAction:
        'Review the preview, call change.approve, then retry change.apply.',
    };
  }
  if (code.startsWith('IR_')) {
    return {
      code,
      rootCause:
        object.message ?? 'Game IR validation rejected the candidate document.',
      location: {
        file: object.file ?? null,
        instancePath: object.instancePath ?? null,
      },
      suggestedAction:
        'Repair the cited Game IR field and validate the ChangeSet again.',
    };
  }
  if (code.startsWith('KERNEL_') || code.startsWith('REPLAY_')) {
    return {
      code,
      rootCause:
        object.message ?? 'Deterministic simulation rejected or diverged.',
      runtimeContext: {
        tick: object.tick ?? null,
        system: object.system ?? null,
        entityId: object.entityId ?? null,
      },
      suggestedAction:
        'Inspect the reported tick, system, entity, and replay input.',
    };
  }
  return {
    code,
    rootCause:
      object.message ??
      'The operation failed without a recognized diagnostic code.',
    suggestedAction: 'Inspect the complete machine-readable failure payload.',
  };
}
