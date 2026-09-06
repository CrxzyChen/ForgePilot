import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';

import {
  componentForProject,
  type ComponentDescriptor,
} from '../capabilities/capability-registry.ts';
import { readProjectManifest } from '../project/project-schema.ts';
import { ProjectError } from '../project/project-types.ts';

export type SceneComponentDocument = {
  id: string;
  type: string;
  enabled: boolean;
  data: Record<string, unknown>;
};

export type SceneObjectDocument = {
  id: string;
  name: string;
  enabled: boolean;
  visible?: boolean;
  locked?: boolean;
  parentId: string | null;
  order: number;
  prefab?: string;
  components: SceneComponentDocument[];
};

export type SceneDocument = {
  schemaVersion: '2.0.0-alpha.1';
  id: string;
  name: string;
  space: '2d' | '3d' | 'ui' | 'mixed';
  objects: SceneObjectDocument[];
};

export type PrefabDocument = {
  schemaVersion: '2.0.0-alpha.1';
  id: string;
  name: string;
  objects: SceneObjectDocument[];
  rootObjectIds: string[];
};

export type AuthoringFileState = { path: string; content: string | null };
export type AuthoringMutation = {
  label: string;
  message: string;
  before: AuthoringFileState[];
  after: AuthoringFileState[];
  data?: unknown;
};

export const SCENE_AUTHORING_COMMANDS = [
  'scene.create',
  'scene.rename',
  'scene.duplicate',
  'scene.trash',
  'scene.set_startup',
  'scene.object.create',
  'scene.object.update',
  'scene.object.set_parent',
  'scene.object.reorder',
  'scene.object.duplicate',
  'scene.object.trash',
  'scene.object.set_visibility',
  'scene.object.set_lock',
  'scene.transform.move',
  'scene.transform.rotate',
  'scene.transform.scale',
  'scene.component.add',
  'scene.component.update',
  'scene.component.remove',
  'prefab.create',
  'prefab.instantiate',
  'prefab.apply',
  'prefab.revert',
  'resource.reimport',
  'resource.set_import_settings',
  'resource.repair_reference',
] as const;

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new ProjectError(
      'AUTHORING_ARGUMENT_INVALID',
      `${label} 必须是非空字符串。`,
    );
  return value.trim();
}

function boolValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean')
    throw new ProjectError(
      'AUTHORING_ARGUMENT_INVALID',
      `${label} 必须是布尔值。`,
    );
  return value;
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/gu, '-')
      .replace(/^-+|-+$/gu, '') || 'item'
  );
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function prefabComponentId(
  namespace: string,
  objectId: string,
  sourceId: string,
): string {
  const identity = createHash('sha256')
    .update(JSON.stringify([objectId, sourceId]))
    .digest('hex')
    .slice(0, 24);
  return `${namespace}:component/prefab-${identity}`;
}

/** Match semantic identities; never pair repeated component types by array order. */
function prefabComponentIds(
  namespace: string,
  object: SceneObjectDocument,
  source: SceneObjectDocument,
  requested: unknown,
): Map<string, string> {
  const result = new Map<string, string>();
  const used = new Set<string>();
  const sources = source.components.filter(
    (component) => component.type !== 'core:prefab-instance',
  );
  const instances = object.components.filter(
    (component) => component.type !== 'core:prefab-instance',
  );
  if (
    requested !== undefined &&
    (!requested || typeof requested !== 'object' || Array.isArray(requested))
  ) {
    throw new ProjectError(
      'PREFAB_COMPONENT_MAP_INVALID',
      'componentIds 必须是源组件 ID 到实例组件 ID 的映射。',
    );
  }
  const bind = (
    sourceComponent: SceneComponentDocument,
    instance: SceneComponentDocument,
  ): void => {
    if (used.has(instance.id) || sourceComponent.type !== instance.type) {
      throw new ProjectError(
        'PREFAB_COMPONENT_MAP_INVALID',
        `组件映射重复或类型不一致：${sourceComponent.id} → ${instance.id}`,
      );
    }
    result.set(sourceComponent.id, instance.id);
    used.add(instance.id);
  };
  for (const [sourceId, instanceId] of Object.entries(requested ?? {})) {
    const sourceComponent = sources.find(
      (component) => component.id === sourceId,
    );
    const instance = instances.find((component) => component.id === instanceId);
    if (!sourceComponent || !instance) {
      throw new ProjectError(
        'PREFAB_COMPONENT_MAP_INVALID',
        `组件映射目标不存在：${sourceId} → ${String(instanceId)}`,
      );
    }
    bind(sourceComponent, instance);
  }
  for (const component of sources) {
    if (result.has(component.id)) continue;
    const identity = prefabComponentId(namespace, object.id, component.id);
    const exact = instances.find(
      (instance) => instance.id === component.id || instance.id === identity,
    );
    if (exact) bind(component, exact);
  }
  for (const component of sources) {
    if (result.has(component.id)) continue;
    const candidates = instances.filter(
      (instance) => instance.type === component.type && !used.has(instance.id),
    );
    if (candidates.length === 0) continue;
    const remainingSources = sources.filter(
      (candidate) =>
        candidate.type === component.type && !result.has(candidate.id),
    );
    if (candidates.length !== 1 || remainingSources.length !== 1) {
      throw new ProjectError(
        'PREFAB_COMPONENT_IDENTITY_AMBIGUOUS',
        `无法唯一匹配 ${component.id}（${component.type}）；请通过 componentIds 提供源组件 ID 到实例组件 ID 的映射。`,
      );
    }
    bind(component, candidates[0]!);
  }
  return result;
}

function validateComponentData(
  descriptor: ComponentDescriptor,
  data: Record<string, unknown>,
  partial: boolean,
): void {
  const fields = new Map(descriptor.fields.map((field) => [field.name, field]));
  for (const [name, value] of Object.entries(data)) {
    const field = fields.get(name);
    if (!field)
      throw new ProjectError(
        'COMPONENT_FIELD_UNKNOWN',
        `${descriptor.type} 没有字段：${name}`,
      );
    const valid =
      field.type === 'number'
        ? typeof value === 'number' && Number.isFinite(value)
        : field.type === 'boolean'
          ? typeof value === 'boolean'
          : field.type === 'vec2' || field.type === 'vec3'
            ? value !== null &&
              typeof value === 'object' &&
              !Array.isArray(value) &&
              ['x', 'y', ...(field.type === 'vec3' ? ['z'] : [])].every(
                (axis) =>
                  typeof (value as Record<string, unknown>)[axis] === 'number',
              )
            : typeof value === 'string';
    if (!valid)
      throw new ProjectError(
        'COMPONENT_FIELD_INVALID',
        `${descriptor.type}.${name} 不符合 ${field.type} schema。`,
      );
  }
  if (!partial) {
    for (const field of descriptor.fields) {
      if (!(field.name in data))
        throw new ProjectError(
          'COMPONENT_FIELD_REQUIRED',
          `${descriptor.type} 缺少字段：${field.name}`,
        );
    }
  }
}

function normalizeSiblingOrder(
  scene: SceneDocument,
  parentId: string | null,
): void {
  scene.objects
    .filter((candidate) => candidate.parentId === parentId)
    .sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    )
    .forEach((candidate, index) => {
      candidate.order = index;
    });
}

export class SceneAuthoringService {
  readonly #root: string;

  constructor(projectRoot: string) {
    this.#root = resolve(projectRoot);
  }

  listScenes(): Array<{
    path: string;
    id: string;
    name: string;
    space: SceneDocument['space'];
    startup: boolean;
  }> {
    const manifest = readProjectManifest(
      join(this.#root, 'project.aigame.json'),
    );
    const directory = join(this.#root, manifest.paths.scenes);
    return (readdirSync(directory, { recursive: true }) as string[])
      .filter((name) => name.endsWith('.json'))
      .flatMap((name) => {
        const path = `${manifest.paths.scenes}/${name.replaceAll('\\', '/')}`;
        try {
          const scene = this.readScene(path);
          return [
            {
              path,
              id: scene.id,
              name: scene.name,
              space: scene.space,
              startup: path === manifest.entry.scene,
            },
          ];
        } catch {
          return [];
        }
      })
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  readScene(path: string): SceneDocument {
    const value = JSON.parse(
      readFileSync(this.#path(path), 'utf8'),
    ) as Partial<SceneDocument>;
    if (
      value.schemaVersion !== '2.0.0-alpha.1' ||
      !Array.isArray(value.objects) ||
      !value.id ||
      !value.name ||
      !value.space
    ) {
      throw new ProjectError(
        'SCENE_FORMAT_UNSUPPORTED',
        `Scene 不是 Round 03 通用格式：${path}`,
      );
    }
    return structuredClone(value as SceneDocument);
  }

  mutate(command: string, input: Record<string, unknown>): AuthoringMutation {
    const manifestPath = 'project.aigame.json';
    const manifest = readProjectManifest(join(this.#root, manifestPath));
    const scenePath =
      typeof input.scene === 'string' ? input.scene : manifest.entry.scene;
    if (command === 'scene.create') {
      const name = stringValue(input.name, 'name');
      const path = stringValue(input.path, 'path');
      if (existsSync(this.#path(path)))
        throw new ProjectError(
          'WORKSPACE_FILE_EXISTS',
          `Scene 已存在：${path}`,
        );
      const space = ['2d', '3d', 'ui', 'mixed'].includes(String(input.space))
        ? (input.space as SceneDocument['space'])
        : 'mixed';
      const namespace = manifest.id.split(':')[1] ?? 'game';
      const scene: SceneDocument = {
        schemaVersion: '2.0.0-alpha.1',
        id: `${namespace}:scene/${slug(name)}-${randomUUID().slice(0, 8)}`,
        name,
        space,
        objects: [],
      };
      return {
        label: `创建 Scene ${name}`,
        message: `已创建 ${path}`,
        before: [{ path, content: null }],
        after: [{ path, content: json(scene) }],
        data: scene,
      };
    }
    if (command === 'scene.rename') {
      const scene = this.readScene(scenePath);
      const name = stringValue(input.name, 'name');
      const target = typeof input.path === 'string' ? input.path : scenePath;
      if (target !== scenePath && existsSync(this.#path(target)))
        throw new ProjectError(
          'WORKSPACE_FILE_EXISTS',
          `目标已存在：${target}`,
        );
      scene.name = name;
      const before: AuthoringFileState[] = [
        {
          path: scenePath,
          content: readFileSync(this.#path(scenePath), 'utf8'),
        },
      ];
      const after: AuthoringFileState[] =
        target === scenePath
          ? [{ path: scenePath, content: json(scene) }]
          : [
              { path: scenePath, content: null },
              { path: target, content: json(scene) },
            ];
      if (target !== scenePath) before.push({ path: target, content: null });
      if (manifest.entry.scene === scenePath && target !== scenePath) {
        const source = readFileSync(this.#path(manifestPath), 'utf8');
        manifest.entry.scene = target;
        before.push({ path: manifestPath, content: source });
        after.push({ path: manifestPath, content: json(manifest) });
      }
      return {
        label: `重命名 Scene ${scenePath}`,
        message: `已重命名为 ${name}`,
        before,
        after,
        data: { path: target, scene },
      };
    }
    if (command === 'scene.duplicate') {
      const scene = this.readScene(scenePath);
      const target = stringValue(input.path, 'path');
      const name = stringValue(input.name ?? `${scene.name} Copy`, 'name');
      if (existsSync(this.#path(target)))
        throw new ProjectError(
          'WORKSPACE_FILE_EXISTS',
          `目标已存在：${target}`,
        );
      const copy = structuredClone(scene);
      copy.id = `${scene.id}-copy-${randomUUID().slice(0, 8)}`;
      copy.name = name;
      return {
        label: `复制 Scene ${scenePath}`,
        message: `已复制到 ${target}`,
        before: [{ path: target, content: null }],
        after: [{ path: target, content: json(copy) }],
        data: copy,
      };
    }
    if (command === 'scene.trash') {
      if (manifest.entry.scene === scenePath)
        throw new ProjectError(
          'SCENE_IS_STARTUP',
          '启动 Scene 不能删除，请先设置另一个启动 Scene。',
        );
      return {
        label: `删除 Scene ${scenePath}`,
        message: `已删除 ${scenePath}`,
        before: [
          {
            path: scenePath,
            content: readFileSync(this.#path(scenePath), 'utf8'),
          },
        ],
        after: [{ path: scenePath, content: null }],
      };
    }
    if (command === 'scene.set_startup') {
      this.readScene(scenePath);
      const source = readFileSync(this.#path(manifestPath), 'utf8');
      manifest.entry.scene = scenePath;
      const before: AuthoringFileState[] = [
        { path: manifestPath, content: source },
      ];
      const after: AuthoringFileState[] = [
        { path: manifestPath, content: json(manifest) },
      ];
      const settingsPath = 'settings/project.json';
      if (existsSync(this.#path(settingsPath))) {
        const settingsSource = readFileSync(this.#path(settingsPath), 'utf8');
        const settings = JSON.parse(settingsSource) as Record<string, unknown>;
        settings.startupScene = scenePath;
        before.push({ path: settingsPath, content: settingsSource });
        after.push({ path: settingsPath, content: json(settings) });
      }
      const buildDirectory = join(this.#root, 'build');
      if (existsSync(buildDirectory)) {
        for (const name of readdirSync(buildDirectory).sort()) {
          if (extname(name).toLowerCase() !== '.json') continue;
          const buildPath = `build/${name}`;
          const buildSource = readFileSync(this.#path(buildPath), 'utf8');
          const build = JSON.parse(buildSource) as Record<string, unknown>;
          build.entry = scenePath;
          before.push({ path: buildPath, content: buildSource });
          after.push({ path: buildPath, content: json(build) });
        }
      }
      return {
        label: `设置启动 Scene ${scenePath}`,
        message: `启动 Scene 已设为 ${scenePath}`,
        before,
        after,
      };
    }
    if (command === 'resource.reimport') {
      const path = stringValue(input.path, 'path');
      const assetManifestPath = 'assets/asset-manifest.json';
      const source = readFileSync(this.#path(assetManifestPath), 'utf8');
      const document = JSON.parse(source) as {
        assets: Array<Record<string, unknown>>;
      };
      const asset = document.assets.find(
        (candidate) => candidate.path === path,
      );
      if (!asset)
        throw new ProjectError(
          'RESOURCE_NOT_REGISTERED',
          `资源清单中不存在：${path}`,
        );
      const bytes = readFileSync(this.#path(path));
      asset.bytes = statSync(this.#path(path)).size;
      asset.sha256 = createHash('sha256').update(bytes).digest('hex');
      asset.status = 'ready';
      return {
        label: `重新导入资源 ${path}`,
        message: `已重新导入 ${path}`,
        before: [{ path: assetManifestPath, content: source }],
        after: [{ path: assetManifestPath, content: json(document) }],
        data: asset,
      };
    }
    if (command === 'resource.set_import_settings') {
      const path = stringValue(input.path, 'path');
      if (
        !input.settings ||
        typeof input.settings !== 'object' ||
        Array.isArray(input.settings)
      )
        throw new ProjectError(
          'RESOURCE_IMPORT_SETTINGS_INVALID',
          'settings 必须是对象。',
        );
      const assetManifestPath = 'assets/asset-manifest.json';
      const source = readFileSync(this.#path(assetManifestPath), 'utf8');
      const document = JSON.parse(source) as {
        assets: Array<Record<string, unknown>>;
      };
      const asset = document.assets.find(
        (candidate) => candidate.path === path,
      );
      if (!asset)
        throw new ProjectError(
          'RESOURCE_NOT_REGISTERED',
          `资源清单中不存在：${path}`,
        );
      asset.importSettings = structuredClone(
        input.settings as Record<string, unknown>,
      );
      asset.status = 'source-changed';
      return {
        label: `设置资源导入参数 ${path}`,
        message: `已更新 ${path} 的导入参数，请重新导入。`,
        before: [{ path: assetManifestPath, content: source }],
        after: [{ path: assetManifestPath, content: json(document) }],
        data: asset,
      };
    }
    if (command === 'resource.repair_reference') {
      const missingPath = stringValue(input.missingPath, 'missingPath');
      const replacementPath = stringValue(
        input.replacementPath,
        'replacementPath',
      );
      if (!existsSync(this.#path(replacementPath)))
        throw new ProjectError(
          'RESOURCE_REPLACEMENT_MISSING',
          `替换资源不存在：${replacementPath}`,
        );
      const before: AuthoringFileState[] = [];
      const after: AuthoringFileState[] = [];
      for (const path of this.#textProjectFiles()) {
        const source = readFileSync(this.#path(path), 'utf8');
        if (!source.includes(missingPath)) continue;
        before.push({ path, content: source });
        after.push({
          path,
          content: source.replaceAll(missingPath, replacementPath),
        });
      }
      if (after.length === 0)
        throw new ProjectError(
          'RESOURCE_REFERENCE_NOT_FOUND',
          `没有文件引用 ${missingPath}`,
        );
      return {
        label: `修复资源引用 ${missingPath}`,
        message: `已将 ${after.length} 个文件中的缺失引用替换为 ${replacementPath}`,
        before,
        after,
        data: {
          missingPath,
          replacementPath,
          files: after.map((file) => file.path),
        },
      };
    }

    const sceneSource = readFileSync(this.#path(scenePath), 'utf8');
    const scene = this.readScene(scenePath);
    const objectId = typeof input.objectId === 'string' ? input.objectId : '';
    const object = scene.objects.find((candidate) => candidate.id === objectId);
    const namespace = scene.id.split(':')[0];

    if (command === 'scene.object.create') {
      const name = stringValue(input.name, 'name');
      const parentId =
        typeof input.parentId === 'string' ? input.parentId : null;
      if (
        parentId &&
        !scene.objects.some((candidate) => candidate.id === parentId)
      )
        throw new ProjectError(
          'SCENE_PARENT_NOT_FOUND',
          `父对象不存在：${parentId}`,
        );
      const transformType =
        scene.space === '2d'
          ? 'core:transform2d'
          : scene.space === '3d'
            ? 'core:transform3d'
            : scene.space === 'ui'
              ? 'core:ui-transform'
              : null;
      const transform = transformType
        ? componentForProject(this.#root, manifest.capabilities, transformType)
        : null;
      const components: SceneComponentDocument[] = transform
        ? [
            {
              id: `${namespace}:component/${randomUUID().slice(0, 8)}`,
              type: transform.type,
              enabled: true,
              data: Object.fromEntries(
                transform.fields.map((field) => [
                  field.name,
                  structuredClone(field.default),
                ]),
              ),
            },
          ]
        : [];
      const created: SceneObjectDocument = {
        id:
          typeof input.id === 'string'
            ? input.id
            : `${namespace}:object/${slug(name)}-${randomUUID().slice(0, 8)}`,
        name,
        enabled: true,
        visible: true,
        locked: false,
        parentId,
        order: scene.objects.filter(
          (candidate) => candidate.parentId === parentId,
        ).length,
        components,
      };
      scene.objects.push(created);
      return this.#sceneMutation(
        scenePath,
        sceneSource,
        scene,
        `创建对象 ${name}`,
        `已创建 ${created.id}`,
        created,
      );
    }
    if (command === 'prefab.instantiate') {
      const path = stringValue(input.path, 'path');
      const prefab = JSON.parse(
        readFileSync(this.#path(path), 'utf8'),
      ) as PrefabDocument;
      const idMap = new Map(
        prefab.objects.map((item) => [
          item.id,
          `${namespace}:object/${slug(item.name)}-${randomUUID().slice(0, 8)}`,
        ]),
      );
      const parentId =
        typeof input.parentId === 'string' ? input.parentId : null;
      for (const original of prefab.objects) {
        const copy = structuredClone(original);
        copy.id = idMap.get(original.id)!;
        copy.parentId =
          original.parentId && idMap.has(original.parentId)
            ? idMap.get(original.parentId)!
            : parentId;
        copy.prefab = path;
        copy.components = copy.components.map((component) => ({
          ...component,
          id: prefabComponentId(namespace, copy.id, component.id),
        }));
        if (prefab.rootObjectIds.includes(original.id))
          copy.components.push({
            id: `${namespace}:component/${randomUUID().slice(0, 8)}`,
            type: 'core:prefab-instance',
            enabled: true,
            data: { path, sourceObjectId: original.id },
          });
        scene.objects.push(copy);
      }
      return this.#sceneMutation(
        scenePath,
        sceneSource,
        scene,
        `实例化 Prefab ${path}`,
        `已实例化 ${path}`,
        { objectIds: [...idMap.values()] },
      );
    }
    if (!object)
      throw new ProjectError(
        'SCENE_OBJECT_NOT_FOUND',
        `对象不存在：${objectId}`,
      );
    if (command === 'scene.object.update') {
      if (typeof input.name === 'string' && input.name.trim())
        object.name = input.name.trim();
      if (typeof input.enabled === 'boolean') object.enabled = input.enabled;
    } else if (command === 'scene.object.set_parent') {
      const parentId =
        typeof input.parentId === 'string' ? input.parentId : null;
      if (parentId === object.id)
        throw new ProjectError(
          'SCENE_HIERARCHY_CYCLE',
          '对象不能作为自己的父对象。',
        );
      let cursor = parentId;
      while (cursor) {
        if (cursor === object.id)
          throw new ProjectError(
            'SCENE_HIERARCHY_CYCLE',
            '父子关系会形成循环。',
          );
        cursor =
          scene.objects.find((candidate) => candidate.id === cursor)
            ?.parentId ?? null;
      }
      const oldParentId = object.parentId;
      object.parentId = parentId;
      object.order = scene.objects.filter(
        (candidate) =>
          candidate.parentId === parentId && candidate.id !== object.id,
      ).length;
      normalizeSiblingOrder(scene, oldParentId);
      normalizeSiblingOrder(scene, parentId);
    } else if (command === 'scene.object.reorder') {
      if (!Number.isInteger(input.order) || Number(input.order) < 0)
        throw new ProjectError(
          'AUTHORING_ARGUMENT_INVALID',
          'order 必须是非负整数。',
        );
      const siblings = scene.objects
        .filter(
          (candidate) =>
            candidate.parentId === object.parentId &&
            candidate.id !== object.id,
        )
        .sort(
          (left, right) =>
            left.order - right.order || left.id.localeCompare(right.id),
        );
      siblings.splice(
        Math.min(Number(input.order), siblings.length),
        0,
        object,
      );
      siblings.forEach((candidate, index) => {
        candidate.order = index;
      });
    } else if (command === 'scene.object.set_visibility') {
      object.visible = boolValue(input.visible, 'visible');
    } else if (command === 'scene.object.set_lock') {
      object.locked = boolValue(input.locked, 'locked');
    } else if (
      command === 'scene.transform.move' ||
      command === 'scene.transform.rotate' ||
      command === 'scene.transform.scale'
    ) {
      const transform = object.components.find((component) =>
        ['core:transform2d', 'core:transform3d', 'core:ui-transform'].includes(
          component.type,
        ),
      );
      if (!transform)
        throw new ProjectError(
          'SCENE_TRANSFORM_NOT_FOUND',
          `${object.name} 没有可由 Gizmo 编辑的 Transform。`,
        );
      const field =
        command === 'scene.transform.move'
          ? transform.type === 'core:ui-transform'
            ? 'anchor'
            : 'position'
          : command === 'scene.transform.rotate'
            ? 'rotation'
            : transform.type === 'core:ui-transform'
              ? 'size'
              : 'scale';
      const current = transform.data[field];
      const exact = input.value;
      const delta = input.delta;
      if (typeof current === 'number') {
        const next =
          typeof exact === 'number'
            ? exact
            : typeof delta === 'number'
              ? current + delta
              : Number.NaN;
        if (!Number.isFinite(next))
          throw new ProjectError(
            'AUTHORING_ARGUMENT_INVALID',
            `${field} 需要有限数值 value 或 delta。`,
          );
        transform.data[field] = next;
      } else if (current && typeof current === 'object') {
        const currentVector = current as Record<string, unknown>;
        const inputVector =
          exact && typeof exact === 'object' && !Array.isArray(exact)
            ? (exact as Record<string, unknown>)
            : delta && typeof delta === 'object' && !Array.isArray(delta)
              ? (delta as Record<string, unknown>)
              : null;
        if (!inputVector)
          throw new ProjectError(
            'AUTHORING_ARGUMENT_INVALID',
            `${field} 需要向量 value 或 delta。`,
          );
        transform.data[field] = Object.fromEntries(
          Object.keys(currentVector).map((axis) => {
            const operand = Number(inputVector[axis] ?? 0);
            const base = Number(currentVector[axis] ?? 0);
            if (!Number.isFinite(operand) || !Number.isFinite(base))
              throw new ProjectError(
                'AUTHORING_ARGUMENT_INVALID',
                `${field}.${axis} 必须是有限数值。`,
              );
            return [axis, exact ? operand : base + operand];
          }),
        );
      } else {
        throw new ProjectError(
          'SCENE_TRANSFORM_INVALID',
          `${object.name} 的 ${field} 不是可编辑数值。`,
        );
      }
    } else if (command === 'scene.object.trash') {
      const removed = new Set([object.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const candidate of scene.objects)
          if (
            candidate.parentId &&
            removed.has(candidate.parentId) &&
            !removed.has(candidate.id)
          ) {
            removed.add(candidate.id);
            changed = true;
          }
      }
      scene.objects = scene.objects.filter(
        (candidate) => !removed.has(candidate.id),
      );
    } else if (command === 'scene.object.duplicate') {
      const selected = new Set([object.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const candidate of scene.objects)
          if (
            candidate.parentId &&
            selected.has(candidate.parentId) &&
            !selected.has(candidate.id)
          ) {
            selected.add(candidate.id);
            changed = true;
          }
      }
      const idMap = new Map(
        [...selected].map((id) => [
          id,
          `${namespace}:object/copy-${randomUUID().slice(0, 8)}`,
        ]),
      );
      for (const original of scene.objects.filter((candidate) =>
        selected.has(candidate.id),
      )) {
        const copy = structuredClone(original);
        copy.id = idMap.get(original.id)!;
        copy.name =
          original.id === object.id ? `${original.name} Copy` : original.name;
        copy.parentId =
          original.parentId && idMap.has(original.parentId)
            ? idMap.get(original.parentId)!
            : original.parentId;
        copy.components = copy.components.map((component) => ({
          ...component,
          id: `${namespace}:component/${randomUUID().slice(0, 8)}`,
        }));
        scene.objects.push(copy);
      }
    } else if (command === 'scene.component.add') {
      const type = stringValue(input.type, 'type');
      const descriptor = componentForProject(
        this.#root,
        manifest.capabilities,
        type,
      );
      if (!descriptor)
        throw new ProjectError(
          'COMPONENT_TYPE_UNAVAILABLE',
          `当前 capability 未注册 Component：${type}`,
        );
      if (object.components.some((candidate) => candidate.type === type))
        throw new ProjectError(
          'COMPONENT_ALREADY_EXISTS',
          `${object.name} 已有 ${type}`,
        );
      const defaults = Object.fromEntries(
        descriptor.fields.map((field) => [
          field.name,
          structuredClone(field.default),
        ]),
      );
      const data =
        input.data &&
        typeof input.data === 'object' &&
        !Array.isArray(input.data)
          ? { ...defaults, ...(input.data as Record<string, unknown>) }
          : defaults;
      validateComponentData(descriptor, data, false);
      object.components.push({
        id: `${namespace}:component/${randomUUID().slice(0, 8)}`,
        type,
        enabled: true,
        data,
      });
    } else if (command === 'scene.component.update') {
      const componentId = stringValue(input.componentId, 'componentId');
      const component = object.components.find(
        (candidate) => candidate.id === componentId,
      );
      if (!component)
        throw new ProjectError(
          'COMPONENT_NOT_FOUND',
          `Component 不存在：${componentId}`,
        );
      if (
        !input.data ||
        typeof input.data !== 'object' ||
        Array.isArray(input.data)
      )
        throw new ProjectError(
          'AUTHORING_ARGUMENT_INVALID',
          'data 必须是对象。',
        );
      const descriptor = componentForProject(
        this.#root,
        manifest.capabilities,
        component.type,
      );
      if (!descriptor)
        throw new ProjectError(
          'COMPONENT_TYPE_UNAVAILABLE',
          `当前 capability 未注册 Component：${component.type}`,
        );
      validateComponentData(
        descriptor,
        input.data as Record<string, unknown>,
        true,
      );
      component.data = {
        ...component.data,
        ...structuredClone(input.data as Record<string, unknown>),
      };
    } else if (command === 'scene.component.remove') {
      const componentId = stringValue(input.componentId, 'componentId');
      if (!object.components.some((candidate) => candidate.id === componentId))
        throw new ProjectError(
          'COMPONENT_NOT_FOUND',
          `Component 不存在：${componentId}`,
        );
      object.components = object.components.filter(
        (candidate) => candidate.id !== componentId,
      );
    } else if (command === 'prefab.create') {
      const path = stringValue(input.path, 'path');
      const name = stringValue(input.name, 'name');
      if (existsSync(this.#path(path)))
        throw new ProjectError(
          'WORKSPACE_FILE_EXISTS',
          `Prefab 已存在：${path}`,
        );
      const selectedIds = Array.isArray(input.objectIds)
        ? input.objectIds.filter(
            (value): value is string => typeof value === 'string',
          )
        : [object.id];
      const selected = new Set(selectedIds);
      let changed = true;
      while (changed) {
        changed = false;
        for (const candidate of scene.objects)
          if (
            candidate.parentId &&
            selected.has(candidate.parentId) &&
            !selected.has(candidate.id)
          ) {
            selected.add(candidate.id);
            changed = true;
          }
      }
      const prefab: PrefabDocument = {
        schemaVersion: '2.0.0-alpha.1',
        id: `${namespace}:prefab/${slug(name)}`,
        name,
        objects: scene.objects
          .filter((candidate) => selected.has(candidate.id))
          .map((candidate) => structuredClone(candidate)),
        rootObjectIds: selectedIds,
      };
      return {
        label: `创建 Prefab ${name}`,
        message: `已创建 ${path}`,
        before: [{ path, content: null }],
        after: [{ path, content: json(prefab) }],
        data: prefab,
      };
    } else if (command === 'prefab.apply' || command === 'prefab.revert') {
      const marker = object.components.find(
        (component) => component.type === 'core:prefab-instance',
      );
      const path = marker?.data.path;
      const sourceObjectId = marker?.data.sourceObjectId;
      if (typeof path !== 'string' || typeof sourceObjectId !== 'string')
        throw new ProjectError(
          'PREFAB_INSTANCE_REQUIRED',
          '所选对象不是 Prefab 根实例。',
        );
      const prefabSource = readFileSync(this.#path(path), 'utf8');
      const prefab = JSON.parse(prefabSource) as PrefabDocument;
      const sourceObject = prefab.objects.find(
        (candidate) => candidate.id === sourceObjectId,
      );
      if (!sourceObject)
        throw new ProjectError(
          'PREFAB_SOURCE_MISSING',
          'Prefab 源对象已不存在。',
        );
      const componentIds = prefabComponentIds(
        namespace,
        object,
        sourceObject,
        input.componentIds,
      );
      if (command === 'prefab.apply') {
        sourceObject.name = object.name;
        sourceObject.components = object.components
          .filter((component) => component.type !== 'core:prefab-instance')
          .map((component) => ({
            ...structuredClone(component),
            id:
              [...componentIds].find(
                ([, instanceId]) => instanceId === component.id,
              )?.[0] ?? component.id,
          }));
        return {
          label: `应用 Prefab ${path}`,
          message: `已应用实例到 ${path}`,
          before: [{ path, content: prefabSource }],
          after: [{ path, content: json(prefab) }],
          data: prefab,
        };
      }
      const markerCopy = structuredClone(marker!);
      object.name = sourceObject.name;
      object.components = sourceObject.components
        .filter((component) => component.type !== 'core:prefab-instance')
        .map((component) => ({
          ...structuredClone(component),
          id:
            componentIds.get(component.id) ??
            prefabComponentId(namespace, object.id, component.id),
        }));
      object.components.push(markerCopy);
    } else {
      throw new ProjectError(
        'AUTHORING_COMMAND_UNKNOWN',
        `未知 authoring 命令：${command}`,
      );
    }
    return this.#sceneMutation(
      scenePath,
      sceneSource,
      scene,
      command,
      `已执行 ${command}`,
      object,
    );
  }

  dependencies(path: string): {
    path: string;
    referencedBy: string[];
    references: string[];
  } {
    const references = new Set<string>();
    const referencedBy: string[] = [];
    const target = this.#path(path);
    if (
      existsSync(target) &&
      ['.json', '.ts', '.md', '.wgsl'].includes(extname(path))
    ) {
      const source = readFileSync(target, 'utf8');
      for (const match of source.matchAll(
        /(?:assets|prefabs|scenes|scripts)\/[a-zA-Z0-9_./-]+/gu,
      ))
        references.add(match[0]);
    }
    for (const directory of ['scenes', 'prefabs', 'scripts']) {
      const root = join(this.#root, directory);
      if (!existsSync(root)) continue;
      for (const name of readdirSync(root, { recursive: true }) as string[]) {
        const absolute = join(root, name);
        try {
          if (readFileSync(absolute, 'utf8').includes(path))
            referencedBy.push(`${directory}/${name}`.replaceAll('\\', '/'));
        } catch {
          /* directories and binary files are ignored */
        }
      }
    }
    return {
      path,
      referencedBy: [...new Set(referencedBy)].sort(),
      references: [...references].sort(),
    };
  }

  missingReferences(): Array<{ path: string; referencedBy: string[] }> {
    const missing = new Map<string, Set<string>>();
    for (const sourcePath of this.#textProjectFiles()) {
      const source = readFileSync(this.#path(sourcePath), 'utf8');
      for (const match of source.matchAll(
        /(?:assets|prefabs|scenes|scripts)\/[a-zA-Z0-9_./-]+/gu,
      )) {
        const path = match[0];
        if (existsSync(this.#path(path))) continue;
        const references = missing.get(path) ?? new Set<string>();
        references.add(sourcePath);
        missing.set(path, references);
      }
    }
    const manifestPath = 'assets/asset-manifest.json';
    if (existsSync(this.#path(manifestPath))) {
      const manifest = JSON.parse(
        readFileSync(this.#path(manifestPath), 'utf8'),
      ) as { assets?: Array<{ path?: unknown }> };
      for (const asset of manifest.assets ?? []) {
        if (
          typeof asset.path === 'string' &&
          !existsSync(this.#path(asset.path))
        ) {
          const references = missing.get(asset.path) ?? new Set<string>();
          references.add(manifestPath);
          missing.set(asset.path, references);
        }
      }
    }
    return [...missing.entries()]
      .map(([path, referencedBy]) => ({
        path,
        referencedBy: [...referencedBy].sort(),
      }))
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  #sceneMutation(
    path: string,
    source: string,
    scene: SceneDocument,
    label: string,
    message: string,
    data?: unknown,
  ): AuthoringMutation {
    return {
      label,
      message,
      before: [{ path, content: source }],
      after: [{ path, content: json(scene) }],
      data,
    };
  }

  #path(projectPath: string): string {
    const value = resolve(this.#root, projectPath);
    if (
      value !== this.#root &&
      !value.startsWith(`${this.#root}\\`) &&
      !value.startsWith(`${this.#root}/`)
    )
      throw new ProjectError(
        'PROJECT_PATH_ESCAPE',
        `路径越过项目根目录：${projectPath}`,
      );
    if (projectPath.includes('..') || dirname(projectPath) === '.') {
      if (!['project.aigame.json'].includes(basename(projectPath)))
        throw new ProjectError(
          'PROJECT_PATH_INVALID',
          `项目路径无效：${projectPath}`,
        );
    }
    return value;
  }

  #textProjectFiles(): string[] {
    const paths: string[] = [];
    for (const directory of [
      'scenes',
      'prefabs',
      'scripts',
      'settings',
      'capabilities',
      'assets',
      'audio',
      'input',
      'tests',
      'replays',
    ]) {
      const root = join(this.#root, directory);
      if (!existsSync(root)) continue;
      const visit = (absolute: string) => {
        for (const entry of readdirSync(absolute, { withFileTypes: true })) {
          const target = join(absolute, entry.name);
          if (entry.isDirectory()) visit(target);
          else if (['.json', '.ts', '.md', '.wgsl'].includes(extname(target)))
            paths.push(
              target.slice(this.#root.length + 1).replaceAll('\\', '/'),
            );
        }
      };
      visit(root);
    }
    return paths.sort();
  }
}
