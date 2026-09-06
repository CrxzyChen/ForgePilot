export type ComponentField = {
  /** Machine-readable authoring unit; never infer units from magnitude. */
  unit?: 'degrees';
  name: string;
  type:
    | 'number'
    | 'string'
    | 'boolean'
    | 'vec2'
    | 'vec3'
    | 'color'
    | 'resource';
  default: unknown;
};

export type ComponentDescriptor = {
  type: string;
  label: string;
  capability: 'core' | '2d' | '3d' | 'ui';
  fields: ComponentField[];
  inspectorEditor?: string;
};

export type CapabilityDescriptor = {
  id: 'core' | '2d' | '3d' | 'ui';
  label: string;
  components: ComponentDescriptor[];
  editors: string[];
  runtimeAdapter: string;
  rendererAdapter: string;
  mcpNamespace: string;
  skill: string;
  tests: string[];
  migrationVersion: string;
  buildMetadata: Record<string, unknown>;
  schemaId: string;
  picking: { mode: 'bounds-2d' | 'ray-3d' | 'hierarchy'; stableId: true };
  gizmos: Array<'move' | 'rotate' | 'scale'>;
  semanticCommands: string[];
};

const definitions: CapabilityDescriptor[] = [
  {
    id: 'core',
    label: 'Core authoring',
    components: [
      {
        type: 'core:metadata',
        label: 'Metadata',
        capability: 'core',
        fields: [{ name: 'tags', type: 'string', default: '' }],
      },
      {
        type: 'core:script',
        label: 'Script Behavior',
        capability: 'core',
        fields: [
          { name: 'path', type: 'resource', default: '' },
          { name: 'enabled', type: 'boolean', default: true },
        ],
      },
      {
        type: 'core:prefab-instance',
        label: 'Prefab Instance',
        capability: 'core',
        fields: [
          { name: 'path', type: 'resource', default: '' },
          { name: 'sourceObjectId', type: 'string', default: '' },
        ],
      },
      {
        type: 'audio:source',
        label: 'Audio Source',
        capability: 'core',
        fields: [
          { name: 'clip', type: 'resource', default: '' },
          { name: 'busId', type: 'string', default: 'audio:bus/master' },
          { name: 'volume', type: 'number', default: 1 },
          { name: 'loop', type: 'boolean', default: false },
          { name: 'autoplay', type: 'boolean', default: false },
        ],
      },
    ],
    editors: ['scene', 'prefab', 'code', 'diff'],
    runtimeAdapter: 'core-runtime',
    rendererAdapter: 'none',
    mcpNamespace: 'core',
    skill: '.agents/skills/author-gameplay-feature/SKILL.md',
    tests: ['check:p17:authoring'],
    migrationVersion: '2.0.0-alpha.1',
    buildMetadata: { required: true },
    schemaId: 'aigame://schemas/core-capability/2.0.0-alpha.1',
    picking: { mode: 'hierarchy', stableId: true },
    gizmos: [],
    semanticCommands: [
      'scene.object.create',
      'scene.object.update',
      'scene.component.add',
      'scene.component.update',
    ],
  },
  {
    id: '2d',
    label: '2D',
    components: [
      {
        type: 'core:transform2d',
        label: 'Transform 2D',
        capability: '2d',
        fields: [
          { name: 'position', type: 'vec2', default: { x: 0, y: 0 } },
          { name: 'rotation', type: 'number', default: 0, unit: 'degrees' },
          { name: 'scale', type: 'vec2', default: { x: 1, y: 1 } },
        ],
      },
      {
        type: 'render:camera2d',
        label: 'Camera 2D',
        capability: '2d',
        fields: [
          { name: 'zoom', type: 'number', default: 1 },
          { name: 'primary', type: 'boolean', default: true },
          { name: 'clearColor', type: 'color', default: '#08121f' },
        ],
      },
      {
        type: 'render:shape2d',
        label: 'Shape 2D',
        capability: '2d',
        fields: [
          { name: 'shape', type: 'string', default: 'rectangle' },
          { name: 'size', type: 'vec2', default: { x: 1, y: 1 } },
          { name: 'color', type: 'color', default: '#49cddd' },
          { name: 'layer', type: 'number', default: 0 },
        ],
      },
      {
        type: 'render:sprite2d',
        label: 'Sprite 2D',
        capability: '2d',
        fields: [
          { name: 'texture', type: 'resource', default: '' },
          { name: 'size', type: 'vec2', default: { x: 1, y: 1 } },
          { name: 'pivot', type: 'vec2', default: { x: 0.5, y: 0.5 } },
          { name: 'tint', type: 'color', default: '#ffffff' },
          { name: 'filter', type: 'string', default: 'linear' },
          { name: 'layer', type: 'number', default: 0 },
          { name: 'atlasRegion', type: 'string', default: '' },
        ],
      },
      {
        type: 'render:text2d',
        label: 'Text 2D',
        capability: '2d',
        fields: [
          { name: 'text', type: 'string', default: 'TEXT' },
          { name: 'fontSize', type: 'number', default: 1 },
          { name: 'color', type: 'color', default: '#ffffff' },
          { name: 'align', type: 'string', default: 'left' },
        ],
      },
      {
        type: 'physics:collider2d',
        label: 'Collider 2D',
        capability: '2d',
        fields: [
          { name: 'shape', type: 'string', default: 'box' },
          { name: 'isTrigger', type: 'boolean', default: false },
          { name: 'size', type: 'vec2', default: { x: 1, y: 1 } },
          { name: 'offset', type: 'vec2', default: { x: 0, y: 0 } },
          { name: 'layer', type: 'string', default: 'default' },
        ],
      },
      {
        type: 'physics:rigidbody2d',
        label: 'Rigid Body 2D',
        capability: '2d',
        fields: [
          { name: 'bodyType', type: 'string', default: 'dynamic' },
          { name: 'velocity', type: 'vec2', default: { x: 0, y: 0 } },
          { name: 'gravityScale', type: 'number', default: 0 },
          { name: 'mass', type: 'number', default: 1 },
          { name: 'linearDamping', type: 'number', default: 0 },
        ],
      },
    ],
    editors: ['scene-2d', 'game'],
    runtimeAdapter: 'runtime-2d',
    rendererAdapter: 'renderer-2d-wgpu',
    mcpNamespace: 'capability.2d',
    skill: '.agents/skills/author-2d-scene/SKILL.md',
    tests: ['check:p19:capabilities'],
    migrationVersion: '2.0.0-alpha.1',
    buildMetadata: { shaders: ['shape2d.wgsl', 'sprite2d.wgsl'] },
    schemaId: 'aigame://schemas/capability-2d/2.0.0-alpha.1',
    picking: { mode: 'bounds-2d', stableId: true },
    gizmos: ['move', 'rotate', 'scale'],
    semanticCommands: [
      'scene.object.pick',
      'scene.transform.move',
      'scene.transform.rotate',
      'scene.transform.scale',
      'scene.component.add',
      'scene.component.update',
    ],
  },
  {
    id: '3d',
    label: '3D',
    components: [
      {
        type: 'core:transform3d',
        label: 'Transform 3D',
        capability: '3d',
        fields: [
          { name: 'position', type: 'vec3', default: { x: 0, y: 0, z: 0 } },
          { name: 'rotation', type: 'vec3', default: { x: 0, y: 0, z: 0 } },
          { name: 'scale', type: 'vec3', default: { x: 1, y: 1, z: 1 } },
        ],
      },
      {
        type: 'render:camera3d',
        label: 'Camera 3D',
        capability: '3d',
        fields: [
          { name: 'fieldOfView', type: 'number', default: 60 },
          { name: 'primary', type: 'boolean', default: true },
          { name: 'near', type: 'number', default: 0.1 },
          { name: 'far', type: 'number', default: 1000 },
          { name: 'clearColor', type: 'color', default: '#08121f' },
        ],
      },
      {
        type: 'render:mesh3d',
        label: 'Primitive Mesh',
        capability: '3d',
        fields: [
          { name: 'primitive', type: 'string', default: 'cube' },
          { name: 'mesh', type: 'resource', default: '' },
          { name: 'material', type: 'resource', default: '' },
        ],
      },
      {
        type: 'render:material',
        label: 'Material',
        capability: '3d',
        fields: [
          { name: 'color', type: 'color', default: '#49cddd' },
          { name: 'roughness', type: 'number', default: 0.7 },
          { name: 'texture', type: 'resource', default: '' },
        ],
      },
      {
        type: 'render:directional-light',
        label: 'Directional Light',
        capability: '3d',
        fields: [
          { name: 'color', type: 'color', default: '#ffffff' },
          { name: 'intensity', type: 'number', default: 1 },
        ],
      },
      {
        type: 'physics:collider3d',
        label: 'Collider 3D',
        capability: '3d',
        fields: [
          { name: 'shape', type: 'string', default: 'box' },
          { name: 'isTrigger', type: 'boolean', default: false },
          { name: 'size', type: 'vec3', default: { x: 1, y: 1, z: 1 } },
          { name: 'offset', type: 'vec3', default: { x: 0, y: 0, z: 0 } },
          { name: 'layer', type: 'string', default: 'default' },
        ],
      },
      {
        type: 'physics:rigidbody3d',
        label: 'Rigid Body 3D',
        capability: '3d',
        fields: [
          { name: 'bodyType', type: 'string', default: 'dynamic' },
          { name: 'velocity', type: 'vec3', default: { x: 0, y: 0, z: 0 } },
          { name: 'gravityScale', type: 'number', default: 0 },
          { name: 'mass', type: 'number', default: 1 },
          { name: 'linearDamping', type: 'number', default: 0 },
        ],
      },
    ],
    editors: ['scene-3d', 'game', 'material'],
    runtimeAdapter: 'runtime-3d',
    rendererAdapter: 'renderer-3d-wgpu',
    mcpNamespace: 'capability.3d',
    skill: '.agents/skills/author-3d-scene/SKILL.md',
    tests: ['check:p19:capabilities'],
    migrationVersion: '2.0.0-alpha.1',
    buildMetadata: { shaders: ['primitive3d.wgsl'] },
    schemaId: 'aigame://schemas/capability-3d/2.0.0-alpha.1',
    picking: { mode: 'ray-3d', stableId: true },
    gizmos: ['move', 'rotate', 'scale'],
    semanticCommands: [
      'scene.object.pick',
      'scene.transform.move',
      'scene.transform.rotate',
      'scene.transform.scale',
      'scene.component.add',
      'scene.component.update',
    ],
  },
  {
    id: 'ui',
    label: 'UI',
    components: [
      {
        type: 'core:ui-transform',
        label: 'UI Transform',
        capability: 'ui',
        fields: [
          { name: 'anchor', type: 'vec2', default: { x: 0.5, y: 0.5 } },
          { name: 'size', type: 'vec2', default: { x: 100, y: 40 } },
        ],
      },
      {
        type: 'ui:text',
        label: 'UI Text',
        capability: 'ui',
        fields: [
          { name: 'text', type: 'string', default: 'TEXT' },
          { name: 'fontSize', type: 'number', default: 24 },
          { name: 'color', type: 'color', default: '#ffffff' },
          { name: 'align', type: 'string', default: 'left' },
        ],
      },
      {
        type: 'ui:image',
        label: 'UI Image',
        capability: 'ui',
        fields: [
          { name: 'texture', type: 'resource', default: '' },
          { name: 'tint', type: 'color', default: '#ffffff' },
          { name: 'filter', type: 'string', default: 'linear' },
          { name: 'atlasRegion', type: 'string', default: '' },
        ],
      },
      {
        type: 'ui:button',
        label: 'UI Button',
        capability: 'ui',
        fields: [
          { name: 'label', type: 'string', default: 'Button' },
          { name: 'action', type: 'string', default: 'ui-action' },
          { name: 'backgroundColor', type: 'color', default: '#16344d' },
          { name: 'textColor', type: 'color', default: '#ffffff' },
          { name: 'fontSize', type: 'number', default: 24 },
          { name: 'disabled', type: 'boolean', default: false },
        ],
      },
    ],
    editors: ['ui'],
    runtimeAdapter: 'runtime-ui',
    rendererAdapter: 'renderer-ui-wgpu',
    mcpNamespace: 'capability.ui',
    skill: '.agents/skills/author-ui/SKILL.md',
    tests: ['check:p19:capabilities'],
    migrationVersion: '2.0.0-alpha.1',
    buildMetadata: {},
    schemaId: 'aigame://schemas/capability-ui/2.0.0-alpha.1',
    picking: { mode: 'bounds-2d', stableId: true },
    gizmos: ['move', 'scale'],
    semanticCommands: [
      'scene.object.pick',
      'scene.transform.move',
      'scene.transform.scale',
      'scene.component.add',
      'scene.component.update',
    ],
  },
];

export function capabilitiesFor(enabled: string[]): CapabilityDescriptor[] {
  const wanted = new Set([
    'core',
    ...enabled.filter((id) => ['2d', '3d', 'ui'].includes(id)),
  ]);
  return definitions
    .filter((definition) => wanted.has(definition.id))
    .map((definition) => {
      const clone = structuredClone(definition);
      clone.components = clone.components.map((component) => ({
        ...component,
        inspectorEditor:
          component.inspectorEditor ?? `builtin:${component.type}`,
      }));
      return clone;
    });
}

export function componentFor(
  enabled: string[],
  type: string,
): ComponentDescriptor | null {
  return (
    capabilitiesFor(enabled)
      .flatMap((capability) => capability.components)
      .find((component) => component.type === type) ?? null
  );
}

export function parseProjectComponents(source: string): ComponentDescriptor[] {
  const document = JSON.parse(source) as {
    schemaVersion?: unknown;
    components?: unknown;
  };
  if (
    document.schemaVersion !== '2.0.0-alpha.1' ||
    !Array.isArray(document.components)
  )
    throw new Error('capabilities/components.json 格式无效。');
  const components = document.components.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('项目 Component 描述必须是对象。');
    const component = value as Partial<ComponentDescriptor>;
    if (
      typeof component.type !== 'string' ||
      !component.type.includes(':') ||
      typeof component.label !== 'string' ||
      !Array.isArray(component.fields)
    )
      throw new Error('项目 Component 缺少 type、label 或 fields。');
    const fields = component.fields.map((field) => {
      if (!field || typeof field !== 'object' || Array.isArray(field))
        throw new Error(`${component.type} 字段描述无效。`);
      const item = field as Partial<ComponentField>;
      if (
        typeof item.name !== 'string' ||
        ![
          'number',
          'string',
          'boolean',
          'vec2',
          'vec3',
          'color',
          'resource',
        ].includes(String(item.type)) ||
        item.default === undefined
      )
        throw new Error(`${component.type} 字段缺少 name、type 或 default。`);
      return structuredClone(item as ComponentField);
    });
    if (new Set(fields.map((field) => field.name)).size !== fields.length)
      throw new Error(`${component.type} 包含重复字段。`);
    return {
      type: component.type,
      label: component.label,
      capability: 'core' as const,
      fields,
      inspectorEditor:
        typeof component.inspectorEditor === 'string'
          ? component.inspectorEditor
          : 'generated:fields',
    };
  });
  if (
    new Set(components.map((component) => component.type)).size !==
    components.length
  )
    throw new Error('项目 Component type 不能重复。');
  return components;
}

export function projectComponents(projectRoot: string): ComponentDescriptor[] {
  const path = join(projectRoot, 'capabilities', 'components.json');
  return existsSync(path)
    ? parseProjectComponents(readFileSync(path, 'utf8'))
    : [];
}

export function capabilitiesForProject(
  projectRoot: string,
  enabled: string[],
): CapabilityDescriptor[] {
  const capabilities = capabilitiesFor(enabled);
  const core = capabilities.find((capability) => capability.id === 'core');
  const custom = projectComponents(projectRoot);
  const builtIn = new Set(
    capabilities.flatMap((capability) =>
      capability.components.map((component) => component.type),
    ),
  );
  const collision = custom.find((component) => builtIn.has(component.type));
  if (collision)
    throw new Error(`项目 Component 与内置 type 冲突：${collision.type}`);
  if (core) core.components.push(...custom);
  return capabilities;
}

export function componentForProject(
  projectRoot: string,
  enabled: string[],
  type: string,
): ComponentDescriptor | null {
  return (
    capabilitiesForProject(projectRoot, enabled)
      .flatMap((capability) => capability.components)
      .find((component) => component.type === type) ?? null
  );
}
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
