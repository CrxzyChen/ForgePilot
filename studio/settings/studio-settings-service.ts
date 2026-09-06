import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { ProjectError } from '../project/project-types.ts';

export type StudioSettingsScope = 'studio' | 'project' | 'agent' | 'ai-tools';

export type StudioSettingsSnapshot = {
  schemaVersion: '1.0.0';
  scope: StudioSettingsScope;
  storage: 'global-user' | 'versioned-project';
  values: Record<string, unknown>;
};

export type StudioSettingsServiceOptions = {
  userDataDirectory: string;
  getProjectRoot(): string | null;
};

const defaults: Record<
  Exclude<StudioSettingsScope, 'project'>,
  Record<string, unknown>
> = {
  studio: {
    locale: 'zh-CN',
    theme: 'dark',
    autosave: 'off',
    restoreWorkspace: true,
    telemetry: false,
  },
  agent: {
    defaultMode: 'agent',
    reasoningEffort: 'medium',
    approvalPolicy: 'on-request',
    goalEnabled: true,
    planVisible: true,
    contextScope: 'project',
    goalTokenBudget: null,
  },
  'ai-tools': {
    mcpEnabled: true,
    projectSkillsEnabled: true,
    generationApprovalMode: 'always',
    generationAutoApproveMaxCny: 1,
  },
};

function containsSecret(value: unknown, path = ''): string | null {
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    const next = path ? `${path}.${key}` : key;
    if (
      /(password|accessToken|refreshToken|apiKey|secret)$/iu.test(key) &&
      !/(credentialRef|secretRef)$/iu.test(key)
    ) {
      return next;
    }
    const nested = containsSecret(child, next);
    if (nested) return nested;
  }
  return null;
}

export class StudioSettingsService {
  readonly #options: StudioSettingsServiceOptions;

  constructor(options: StudioSettingsServiceOptions) {
    this.#options = options;
  }

  get(scope: StudioSettingsScope): StudioSettingsSnapshot {
    const path = this.#path(scope);
    const fallback = this.#default(scope);
    let values = fallback;
    try {
      if (existsSync(path)) {
        const value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          values = {
            ...fallback,
            ...(value as Record<string, unknown>),
          };
        }
      }
    } catch (error) {
      throw new ProjectError('SETTINGS_INVALID', `设置文件无法读取：${path}`, {
        cause: error,
      });
    }
    return {
      schemaVersion: '1.0.0',
      scope,
      storage: scope === 'project' ? 'versioned-project' : 'global-user',
      values: structuredClone(values),
    };
  }

  update(
    scope: StudioSettingsScope,
    patch: Record<string, unknown>,
  ): StudioSettingsSnapshot {
    const secretPath = containsSecret(patch);
    if (secretPath) {
      throw new ProjectError(
        'SETTINGS_SECRET_REJECTED',
        `设置不能保存明文凭据：${secretPath}。请使用系统凭据引用。`,
      );
    }
    const values = { ...this.get(scope).values, ...structuredClone(patch) };
    this.#write(this.#path(scope), values);
    return this.get(scope);
  }

  reset(scope: StudioSettingsScope): StudioSettingsSnapshot {
    this.#write(this.#path(scope), this.#default(scope));
    return this.get(scope);
  }

  #path(scope: StudioSettingsScope): string {
    if (scope === 'project') {
      const root = this.#options.getProjectRoot();
      if (!root) {
        throw new ProjectError('PROJECT_NOT_OPEN', '项目设置需要先打开项目。');
      }
      return join(root, 'settings', 'project.json');
    }
    return join(this.#options.userDataDirectory, 'settings', `${scope}.json`);
  }

  #default(scope: StudioSettingsScope): Record<string, unknown> {
    if (scope !== 'project') return structuredClone(defaults[scope]);
    return {
      schemaVersion: '2.0.0-alpha.1',
      startupScene: 'scenes/main.game.json',
      tickRate: 60,
      capabilities: [],
      scriptRuntime: 'scripts/runtime.json',
      buildTargets: ['windows-x86_64'],
      project: {},
    };
  }

  #write(path: string, value: Record<string, unknown>): void {
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    renameSync(temporary, path);
  }
}
