import { readFileSync } from 'node:fs';
import { isAbsolute, normalize, sep } from 'node:path';

import {
  PROJECT_FORMAT_VERSION,
  ProjectError,
  type ProjectManifest,
} from './project-types.ts';

const semanticId = /^[a-z][a-z0-9_-]*:[a-z0-9][a-z0-9_./-]*$/u;

export function isSafeProjectRelativePath(value: string): boolean {
  if (!value || isAbsolute(value) || value.includes('\\')) return false;
  const normalized = normalize(value).replaceAll(sep, '/');
  return (
    normalized === value &&
    normalized !== '..' &&
    !normalized.startsWith('../') &&
    !normalized.split('/').includes('..')
  );
}

export function parseProjectManifest(source: string): ProjectManifest {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new ProjectError(
      'PROJECT_MANIFEST_JSON_INVALID',
      '项目清单不是有效 JSON。',
      {
        cause: error,
      },
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProjectError(
      'PROJECT_MANIFEST_INVALID',
      '项目清单根节点必须是对象。',
    );
  }
  const manifest = value as Partial<ProjectManifest>;
  if (manifest.schemaVersion !== PROJECT_FORMAT_VERSION) {
    throw new ProjectError(
      'PROJECT_FORMAT_UNSUPPORTED',
      `不支持的项目格式 ${String(manifest.schemaVersion)}。`,
    );
  }
  if (!manifest.id || !semanticId.test(manifest.id)) {
    throw new ProjectError(
      'PROJECT_ID_INVALID',
      '项目 ID 必须是稳定的 namespace:path 语义 ID。',
    );
  }
  if (!manifest.name || manifest.name.length > 80) {
    throw new ProjectError(
      'PROJECT_NAME_INVALID',
      '项目名称必须为 1–80 个字符。',
    );
  }
  if (
    !manifest.engine ||
    manifest.engine.projectFormat !== PROJECT_FORMAT_VERSION ||
    typeof manifest.engine.version !== 'string'
  ) {
    throw new ProjectError(
      'PROJECT_ENGINE_INVALID',
      '项目缺少兼容的引擎版本声明。',
    );
  }
  if (!manifest.entry || !isSafeProjectRelativePath(manifest.entry.scene)) {
    throw new ProjectError(
      'PROJECT_ENTRY_INVALID',
      '入口场景必须是项目内的安全相对路径。',
    );
  }
  if (
    !Array.isArray(manifest.templates) ||
    manifest.templates.length === 0 ||
    manifest.templates.some(
      (item) =>
        !item ||
        typeof item.id !== 'string' ||
        typeof item.version !== 'string',
    )
  ) {
    throw new ProjectError(
      'PROJECT_TEMPLATES_INVALID',
      '项目必须记录完整模板血缘和版本。',
    );
  }
  if (
    !Array.isArray(manifest.targets) ||
    manifest.targets.length === 0 ||
    !manifest.defaultTarget ||
    !manifest.targets.includes(manifest.defaultTarget)
  ) {
    throw new ProjectError(
      'PROJECT_TARGET_INVALID',
      '默认构建目标必须存在于 targets 中。',
    );
  }
  if (!Array.isArray(manifest.capabilities)) {
    throw new ProjectError(
      'PROJECT_CAPABILITIES_INVALID',
      '项目 capabilities 必须是数组。',
    );
  }
  if (
    !manifest.paths ||
    typeof manifest.paths !== 'object' ||
    !['assets', 'scenes', 'tests', 'replays'].every(
      (key) =>
        typeof manifest.paths?.[key as keyof typeof manifest.paths] ===
        'string',
    )
  ) {
    throw new ProjectError(
      'PROJECT_PATHS_INVALID',
      '项目必须声明 assets、scenes、tests 和 replays 路径。',
    );
  }
  for (const path of Object.values(manifest.paths)) {
    if (typeof path !== 'string' || !isSafeProjectRelativePath(path)) {
      throw new ProjectError(
        'PROJECT_PATH_INVALID',
        '项目路径必须是项目内的安全相对路径。',
      );
    }
  }
  return manifest as ProjectManifest;
}

export function readProjectManifest(path: string): ProjectManifest {
  return parseProjectManifest(readFileSync(path, 'utf8'));
}
