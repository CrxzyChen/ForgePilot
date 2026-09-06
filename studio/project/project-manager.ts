import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { hostname } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import {
  runProjectDoctor,
  type ProjectDoctorOptions,
} from './project-doctor.ts';
import { readProjectManifest } from './project-schema.ts';
import { composeProject } from './template-composer.ts';
import {
  ProjectError,
  type CreateProjectRequest,
  type DoctorReport,
  type ProjectSummary,
} from './project-types.ts';

type ProjectManagerOptions = {
  templateRoot: string;
  storageDirectory: string;
  engineVersion: string;
  doctor?: ProjectDoctorOptions;
};

type LockRecord = {
  token: string;
  pid: number;
  hostname: string;
  createdAt: string;
};

type ActiveProject = {
  root: string;
  lockPath: string;
  lock: LockRecord;
};

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

function projectNamespace(name: string): string {
  const ascii = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48);
  if (ascii) return ascii;
  return `game-${createHash('sha256').update(name).digest('hex').slice(0, 10)}`;
}

function hasWindowsControlCharacter(value: string): boolean {
  for (const character of value) {
    if (character.charCodeAt(0) <= 0x1f) return true;
  }
  return false;
}

function safeDirectoryName(value: string): string {
  const name = value.trim();
  if (
    !name ||
    name === '.' ||
    name === '..' ||
    /[<>:"/\\|?*]/u.test(name) ||
    hasWindowsControlCharacter(name) ||
    /[. ]$/u.test(name)
  ) {
    throw new ProjectError(
      'PROJECT_DIRECTORY_INVALID',
      '项目目录名包含 Windows 不支持的字符。',
    );
  }
  return name;
}

export class ProjectManager {
  readonly #options: ProjectManagerOptions;
  #active: ActiveProject | null = null;

  constructor(options: ProjectManagerOptions) {
    this.#options = options;
    mkdirSync(options.storageDirectory, { recursive: true });
  }

  get activeRoot(): string | null {
    return this.#active?.root ?? null;
  }

  getActiveProject(): ProjectSummary | null {
    if (!this.#active) return null;
    const root = this.#active.root;
    return {
      root,
      manifest: readProjectManifest(join(root, 'project.aigame.json')),
      gitInitialized: existsSync(join(root, '.git')),
    };
  }

  createProject(request: CreateProjectRequest): ProjectSummary {
    if (this.#active) {
      throw new ProjectError(
        'PROJECT_ALREADY_OPEN',
        '请先关闭当前项目再创建新项目。',
      );
    }
    const name = request.name.trim();
    if (!name || name.length > 80) {
      throw new ProjectError(
        'PROJECT_NAME_INVALID',
        '项目名称必须为 1–80 个字符。',
      );
    }
    const parent = resolve(request.parentDirectory);
    if (!existsSync(parent)) {
      throw new ProjectError(
        'PROJECT_PARENT_MISSING',
        '所选项目父目录不存在。',
      );
    }
    const namespace = projectNamespace(name);
    const directoryName = safeDirectoryName(request.directoryName ?? namespace);
    const target = resolve(parent, directoryName);
    if (dirname(target).toLowerCase() !== parent.toLowerCase()) {
      throw new ProjectError(
        'PROJECT_PATH_ESCAPES_PARENT',
        '项目目录必须直接位于已选择的父目录中。',
      );
    }
    if (existsSync(target)) {
      throw new ProjectError(
        'PROJECT_DESTINATION_EXISTS',
        `目标目录已存在：${basename(target)}`,
      );
    }

    const temporary = join(
      parent,
      `.${directoryName}.creating-${randomUUID()}`,
    );
    try {
      composeProject({
        destination: temporary,
        templateRoot: this.#options.templateRoot,
        name,
        namespace,
        engineVersion: this.#options.engineVersion,
        preset: request.preset,
      });
      renameSync(temporary, target);
    } catch (error) {
      rmSync(temporary, { recursive: true, force: true });
      throw error;
    }

    const git =
      request.initializeGit === false
        ? { initialized: false, message: 'Git 初始化已由请求关闭。' }
        : this.#initializeGit(target);
    this.#acquire(target);
    this.#remember(target);
    return {
      root: target,
      manifest: readProjectManifest(join(target, 'project.aigame.json')),
      gitInitialized: git.initialized,
      gitMessage: git.message,
    };
  }

  openProject(projectRoot: string): ProjectSummary {
    if (this.#active) {
      throw new ProjectError(
        'PROJECT_ALREADY_OPEN',
        '请先关闭当前项目再打开另一个项目。',
      );
    }
    const root = resolve(projectRoot);
    const manifest = readProjectManifest(join(root, 'project.aigame.json'));
    this.#acquire(root);
    this.#remember(root);
    return {
      root,
      manifest,
      gitInitialized: existsSync(join(root, '.git')),
    };
  }

  closeProject(): void {
    if (!this.#active) return;
    const { lockPath, lock } = this.#active;
    try {
      const current = JSON.parse(readFileSync(lockPath, 'utf8')) as LockRecord;
      if (current.token === lock.token) rmSync(lockPath, { force: true });
    } finally {
      this.#active = null;
    }
  }

  doctor(): DoctorReport {
    if (!this.#active) {
      throw new ProjectError('PROJECT_NOT_OPEN', '当前没有打开的项目。');
    }
    return runProjectDoctor(this.#active.root, this.#options.doctor);
  }

  listRecent(): string[] {
    const path = this.#recentPath();
    if (!existsSync(path)) return [];
    try {
      const entries = JSON.parse(readFileSync(path, 'utf8')) as unknown;
      return Array.isArray(entries)
        ? entries.filter(
            (entry): entry is string =>
              typeof entry === 'string' &&
              existsSync(join(entry, 'project.aigame.json')),
          )
        : [];
    } catch {
      return [];
    }
  }

  #acquire(root: string): void {
    const localDirectory = join(root, '.aigame', 'local');
    const lockPath = join(localDirectory, 'project.lock');
    mkdirSync(localDirectory, { recursive: true });
    if (existsSync(lockPath)) {
      let existing: LockRecord | null = null;
      try {
        existing = JSON.parse(readFileSync(lockPath, 'utf8')) as LockRecord;
      } catch {
        // Malformed lock files are preserved as stale evidence below.
      }
      if (
        !existing ||
        existing.hostname !== hostname() ||
        processExists(existing.pid)
      ) {
        throw new ProjectError(
          'PROJECT_LOCKED',
          '项目正在被另一个 Studio 进程使用。',
          existing,
        );
      }
      renameSync(lockPath, `${lockPath}.stale-${Date.now()}`);
    }
    const lock: LockRecord = {
      token: randomUUID(),
      pid: process.pid,
      hostname: hostname(),
      createdAt: new Date().toISOString(),
    };
    const handle = openSync(lockPath, 'wx');
    try {
      writeFileSync(handle, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
    } finally {
      closeSync(handle);
    }
    this.#active = { root, lockPath, lock };
  }

  #initializeGit(root: string): { initialized: boolean; message?: string } {
    const run = (args: string[]) =>
      spawnSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 30_000,
      });
    const init = run(['init', '-b', 'main']);
    if (init.status !== 0) {
      return {
        initialized: false,
        message: (init.stderr || init.error?.message || 'Git 不可用').trim(),
      };
    }
    const add = run(['add', '.']);
    if (add.status !== 0) {
      return { initialized: false, message: add.stderr.trim() };
    }
    const commit = run([
      '-c',
      'user.name=AI Game Studio',
      '-c',
      'user.email=studio@localhost',
      'commit',
      '-m',
      'Initialize AI Game project',
    ]);
    return commit.status === 0
      ? { initialized: true }
      : { initialized: false, message: commit.stderr.trim() };
  }

  #remember(root: string): void {
    const recent = [
      root,
      ...this.listRecent().filter((path) => path !== root),
    ].slice(0, 12);
    const path = this.#recentPath();
    const temporary = `${path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(recent, null, 2)}\n`, 'utf8');
    renameSync(temporary, path);
  }

  #recentPath(): string {
    return join(this.#options.storageDirectory, 'recent-projects.json');
  }
}
