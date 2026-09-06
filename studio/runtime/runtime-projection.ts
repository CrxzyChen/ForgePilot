import type {
  SceneComponentDocument,
  SceneDocument,
  SceneObjectDocument,
} from '../workspace/scene-authoring-service.ts';
import {
  RUNTIME_PROTOCOL_VERSION,
  type LinearColor,
  type Quaternion,
  type RuntimeDrawableProjection,
  type RuntimeAssetReference,
  type RuntimeRenderSnapshot,
  type RuntimeSemanticId,
  type RuntimeSessionId,
  type RuntimeTransform2D,
  type RuntimeTransform3D,
  type Vector3,
} from './runtime-session-protocol.ts';

function component(
  object: SceneObjectDocument,
  type: string,
): SceneComponentDocument | undefined {
  return object.components.find(
    (candidate) => candidate.type === type && candidate.enabled !== false,
  );
}

function numeric(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeProjection<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, child: unknown) => {
      if (typeof child !== 'number' || !Number.isFinite(child)) return child;
      const rounded = Math.round(child * 1_000_000_000_000) / 1_000_000_000_000;
      return Object.is(rounded, -0) ? 0 : rounded;
    }),
  ) as T;
}

export function linearColor(
  value: unknown,
  fallback: LinearColor = [0.55, 0.65, 0.72, 1],
): LinearColor {
  if (
    typeof value !== 'string' ||
    !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(value)
  ) {
    return fallback;
  }
  const alpha =
    value.length === 9 ? Number.parseInt(value.slice(7, 9), 16) / 255 : 1;
  return [
    Number.parseInt(value.slice(1, 3), 16) / 255,
    Number.parseInt(value.slice(3, 5), 16) / 255,
    Number.parseInt(value.slice(5, 7), 16) / 255,
    alpha,
  ];
}

function transform2d(object: SceneObjectDocument): RuntimeTransform2D {
  const data =
    component(object, 'core:transform2d')?.data ??
    component(object, 'core:transform')?.data ??
    {};
  const position = record(data.position);
  const scale = record(data.scale);
  return normalizeProjection({
    position: [numeric(position.x, 0), numeric(position.y, 0)],
    rotation: numeric(data.rotation, 0),
    scale: [numeric(scale.x, 1), numeric(scale.y, 1)],
  });
}

function uiTransform2d(object: SceneObjectDocument): RuntimeTransform2D {
  const data = component(object, 'core:ui-transform')?.data ?? {};
  const anchor = record(data.anchor);
  return {
    position: [
      numeric(anchor.x, 0.5) * 1280,
      (1 - numeric(anchor.y, 0.5)) * 720,
    ],
    rotation: numeric(data.rotation, 0),
    scale: [1, 1],
  };
}

function quaternionFromEuler(value: unknown): Quaternion {
  const rotation = record(value);
  const x = (numeric(rotation.x, 0) * Math.PI) / 360;
  const y = (numeric(rotation.y, 0) * Math.PI) / 360;
  const z = (numeric(rotation.z, 0) * Math.PI) / 360;
  const [sx, cx] = [Math.sin(x), Math.cos(x)];
  const [sy, cy] = [Math.sin(y), Math.cos(y)];
  const [sz, cz] = [Math.sin(z), Math.cos(z)];
  return [
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ];
}

function transform3d(object: SceneObjectDocument): RuntimeTransform3D {
  const data = component(object, 'core:transform3d')?.data ?? {};
  const position = record(data.position);
  const scale = record(data.scale);
  return {
    position: [
      numeric(position.x, 0),
      numeric(position.y, 0),
      numeric(position.z, 0),
    ],
    rotation: quaternionFromEuler(data.rotation),
    scale: [numeric(scale.x, 1), numeric(scale.y, 1), numeric(scale.z, 1)],
  };
}

function multiplyQuaternion(left: Quaternion, right: Quaternion): Quaternion {
  const [ax, ay, az, aw] = left;
  const [bx, by, bz, bw] = right;
  const value: Quaternion = [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
  const length = Math.hypot(...value) || 1;
  return [
    value[0] / length,
    value[1] / length,
    value[2] / length,
    value[3] / length,
  ];
}

function rotateVector3(value: Vector3, rotation: Quaternion): Vector3 {
  const [x, y, z, w] = rotation;
  const [vx, vy, vz] = value;
  const ix = w * vx + y * vz - z * vy;
  const iy = w * vy + z * vx - x * vz;
  const iz = w * vz + x * vy - y * vx;
  const iw = -x * vx - y * vy - z * vz;
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ];
}

function semantic(value: string): RuntimeSemanticId {
  return value as RuntimeSemanticId;
}

export function projectSceneToRenderSnapshot(input: {
  scene: SceneDocument;
  assets?: ReadonlyArray<Record<string, unknown>>;
  sessionId?: RuntimeSessionId;
  generation?: number;
  sequence?: number;
  tick?: number;
}): RuntimeRenderSnapshot {
  const { scene } = input;
  const cameras: RuntimeRenderSnapshot['payload']['cameras'][number][] = [];
  const drawables: RuntimeDrawableProjection[] = [];
  const lights: RuntimeRenderSnapshot['payload']['lights'][number][] = [];
  const resources: RuntimeAssetReference[] = [];
  const assetReference = (
    value: unknown,
    kind: RuntimeAssetReference['kind'],
  ): RuntimeAssetReference | undefined => {
    if (typeof value !== 'string') return undefined;
    const asset = input.assets?.find(
      (candidate) => candidate.id === value || candidate.path === value,
    );
    if (
      !asset ||
      typeof asset.id !== 'string' ||
      typeof asset.path !== 'string' ||
      typeof asset.sha256 !== 'string'
    )
      return undefined;
    const reference: RuntimeAssetReference = {
      id: semantic(asset.id),
      kind,
      sourceHash: asset.sha256,
      derivedHash:
        typeof asset.derivedHash === 'string'
          ? asset.derivedHash
          : asset.sha256,
      projectPath: asset.path,
      variant: typeof asset.variant === 'string' ? asset.variant : 'default',
    };
    if (!resources.some((candidate) => candidate.id === reference.id))
      resources.push(reference);
    return reference;
  };
  const objects = [...scene.objects].sort(
    (left, right) =>
      left.order - right.order || left.id.localeCompare(right.id),
  );
  const objectsById = new Map(objects.map((object) => [object.id, object]));
  const worldTransformCache = new Map<string, RuntimeTransform3D>();
  const worldTransform3d = (
    object: SceneObjectDocument,
    ancestry: ReadonlySet<string> = new Set(),
  ): RuntimeTransform3D => {
    const cached = worldTransformCache.get(object.id);
    if (cached) return cached;
    const local = transform3d(object);
    if (!object.parentId || ancestry.has(object.id)) {
      worldTransformCache.set(object.id, local);
      return local;
    }
    const parent = objectsById.get(object.parentId);
    if (!parent) {
      worldTransformCache.set(object.id, local);
      return local;
    }
    const nextAncestry = new Set(ancestry).add(object.id);
    const parentWorld = worldTransform3d(parent, nextAncestry);
    const scaledLocal: Vector3 = [
      local.position[0] * parentWorld.scale[0],
      local.position[1] * parentWorld.scale[1],
      local.position[2] * parentWorld.scale[2],
    ];
    const rotatedLocal = rotateVector3(scaledLocal, parentWorld.rotation);
    const world = normalizeProjection<RuntimeTransform3D>({
      position: [
        parentWorld.position[0] + rotatedLocal[0],
        parentWorld.position[1] + rotatedLocal[1],
        parentWorld.position[2] + rotatedLocal[2],
      ],
      rotation: multiplyQuaternion(parentWorld.rotation, local.rotation),
      scale: [
        parentWorld.scale[0] * local.scale[0],
        parentWorld.scale[1] * local.scale[1],
        parentWorld.scale[2] * local.scale[2],
      ],
    });
    worldTransformCache.set(object.id, world);
    return world;
  };

  for (const object of objects) {
    if (object.enabled === false) continue;
    const camera2d = component(object, 'render:camera2d');
    const camera3d = component(object, 'render:camera3d');
    if (camera2d) {
      cameras.push({
        id: semantic(camera2d.id),
        space: '2d',
        primary: camera2d.data.primary !== false,
        transform2d: transform2d(object),
        orthographicHeight: 18 / numeric(camera2d.data.zoom, 1),
        clearColor: linearColor(
          camera2d.data.clearColor,
          [0.03, 0.05, 0.075, 1],
        ),
      });
    }
    if (camera3d) {
      cameras.push({
        id: semantic(camera3d.id),
        space: '3d',
        primary: camera3d.data.primary !== false,
        transform3d: worldTransform3d(object),
        verticalFovRadians:
          (numeric(camera3d.data.fieldOfView, 60) * Math.PI) / 180,
        near: numeric(camera3d.data.near, 0.1),
        far: numeric(camera3d.data.far, 1000),
        clearColor: linearColor(
          camera3d.data.clearColor,
          [0.03, 0.05, 0.075, 1],
        ),
      });
    }

    const shape = component(object, 'render:shape2d');
    const sprite = component(object, 'render:sprite2d');
    const text = component(object, 'render:text2d');
    const mesh = component(object, 'render:mesh3d');
    const material = component(object, 'render:material');
    const uiTransform = component(object, 'core:ui-transform');
    const uiText = component(object, 'ui:text');
    const uiImage = component(object, 'ui:image');
    const uiButton = component(object, 'ui:button');
    if (shape) {
      const size = record(shape.data.size);
      drawables.push({
        id: semantic(shape.id),
        objectId: semantic(object.id),
        space: scene.space === 'ui' ? 'ui' : '2d',
        primitive: 'shape2d',
        visible: object.visible !== false,
        layer: numeric(shape.data.layer, object.order),
        transform2d: transform2d(object),
        tint: linearColor(shape.data.color),
        size: [numeric(size.x, 1), numeric(size.y, 1)],
      });
    }
    if (sprite) {
      const size = record(sprite.data.size);
      const pivot = record(sprite.data.pivot);
      const region =
        typeof sprite.data.atlasRegion === 'string' &&
        sprite.data.atlasRegion.trim()
          ? sprite.data.atlasRegion
              .split(',')
              .map((entry) => Number(entry.trim()))
          : [];
      drawables.push({
        id: semantic(sprite.id),
        objectId: semantic(object.id),
        space: scene.space === 'ui' ? 'ui' : '2d',
        primitive: 'sprite2d',
        visible: object.visible !== false,
        layer: numeric(sprite.data.layer, object.order),
        transform2d: transform2d(object),
        asset: assetReference(sprite.data.texture, 'image'),
        tint: linearColor(sprite.data.tint, [1, 1, 1, 1]),
        size: [numeric(size.x, 1), numeric(size.y, 1)],
        pivot: [numeric(pivot.x, 0.5), numeric(pivot.y, 0.5)],
        filter: sprite.data.filter === 'nearest' ? 'nearest' : 'linear',
        atlasRegion:
          region.length === 4 && region.every(Number.isFinite)
            ? (region as [number, number, number, number])
            : undefined,
      });
    }
    if (text) {
      const fontSize = numeric(text.data.fontSize, 1);
      drawables.push({
        id: semantic(text.id),
        objectId: semantic(object.id),
        space: scene.space === 'ui' ? 'ui' : '2d',
        primitive: scene.space === 'ui' ? 'ui-text' : 'text2d',
        visible: object.visible !== false,
        layer: numeric(text.data.layer, object.order),
        transform2d: transform2d(object),
        tint: linearColor(text.data.color, [1, 1, 1, 1]),
        text: typeof text.data.text === 'string' ? text.data.text : '',
        size: [fontSize, fontSize],
      });
    }
    if (uiTransform && uiText) {
      const fontSize = numeric(uiText.data.fontSize, 24);
      drawables.push({
        id: semantic(uiText.id),
        objectId: semantic(object.id),
        space: 'ui',
        primitive: 'ui-text',
        visible: object.visible !== false,
        layer: 10_000 + object.order,
        transform2d: uiTransform2d(object),
        tint: linearColor(uiText.data.color, [1, 1, 1, 1]),
        text: typeof uiText.data.text === 'string' ? uiText.data.text : '',
        size: [fontSize, fontSize],
        pivot: [0.5, 0.5],
      });
    }
    if (uiTransform && uiImage) {
      const size = record(uiTransform.data.size);
      const region =
        typeof uiImage.data.atlasRegion === 'string' &&
        uiImage.data.atlasRegion.trim()
          ? uiImage.data.atlasRegion
              .split(',')
              .map((entry) => Number(entry.trim()))
          : [];
      drawables.push({
        id: semantic(uiImage.id),
        objectId: semantic(object.id),
        space: 'ui',
        primitive: 'ui-image',
        visible: object.visible !== false,
        layer: 10_000 + object.order,
        transform2d: uiTransform2d(object),
        asset: assetReference(uiImage.data.texture, 'image'),
        tint: linearColor(uiImage.data.tint, [1, 1, 1, 1]),
        size: [numeric(size.x, 100), numeric(size.y, 40)],
        pivot: [0.5, 0.5],
        filter: uiImage.data.filter === 'nearest' ? 'nearest' : 'linear',
        atlasRegion:
          region.length === 4 && region.every(Number.isFinite)
            ? (region as [number, number, number, number])
            : undefined,
      });
    }
    if (uiTransform && uiButton && uiButton.data.disabled !== true) {
      const size = record(uiTransform.data.size);
      const action =
        typeof uiButton.data.action === 'string' && uiButton.data.action
          ? uiButton.data.action
          : 'ui-action';
      const transform = uiTransform2d(object);
      drawables.push({
        id: semantic(`${uiButton.id}/background`),
        objectId: semantic(object.id),
        space: 'ui',
        primitive: 'shape2d',
        visible: object.visible !== false,
        layer: 10_000 + object.order,
        transform2d: transform,
        tint: linearColor(uiButton.data.backgroundColor, [0.08, 0.2, 0.3, 1]),
        size: [numeric(size.x, 180), numeric(size.y, 48)],
        pivot: [0.5, 0.5],
        inputAction: action,
      });
      const fontSize = numeric(uiButton.data.fontSize, 24);
      drawables.push({
        id: semantic(`${uiButton.id}/label`),
        objectId: semantic(object.id),
        space: 'ui',
        primitive: 'ui-text',
        visible: object.visible !== false,
        layer: 10_000 + object.order + 0.001,
        transform2d: transform,
        tint: linearColor(uiButton.data.textColor, [1, 1, 1, 1]),
        text:
          typeof uiButton.data.label === 'string'
            ? uiButton.data.label
            : 'Button',
        size: [fontSize, fontSize],
        pivot: [0.5, 0.5],
        inputAction: action,
      });
    }
    if (mesh) {
      drawables.push({
        id: semantic(mesh.id),
        objectId: semantic(object.id),
        space: '3d',
        primitive: 'mesh3d',
        visible: object.visible !== false,
        layer: numeric(mesh.data.layer, object.order),
        transform3d: worldTransform3d(object),
        asset: assetReference(mesh.data.mesh, 'mesh'),
        texture: assetReference(material?.data.texture, 'image'),
        tint: linearColor(material?.data.color),
      });
    }
    const light = component(object, 'render:directional-light');
    if (light) {
      const world = worldTransform3d(object);
      const direction = rotateVector3([0, -1, -0.35], world.rotation);
      lights.push({
        id: semantic(light.id),
        objectId: semantic(object.id),
        kind: 'directional',
        color: linearColor(light.data.color, [1, 1, 1, 1]),
        intensity: numeric(light.data.intensity, 1),
        direction,
      });
    }
  }

  return normalizeProjection({
    protocolVersion: RUNTIME_PROTOCOL_VERSION,
    kind: 'render.snapshot',
    sessionId: input.sessionId ?? 'session:editor',
    generation: input.generation ?? 1,
    sequence: input.sequence ?? 0,
    tick: input.tick ?? 0,
    payload: {
      activeSceneId: semantic(scene.id),
      cameras,
      drawables,
      lights,
      resources,
    },
  });
}
