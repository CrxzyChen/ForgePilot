import type { SceneDocument } from '../../workspace/scene-authoring-service.ts';

export type SceneTransformTool = 'move' | 'rotate' | 'scale';
export type ViewportTransformDelta = Readonly<{ x: number; y: number }>;
export type SceneTransformDelta =
  | number
  | Readonly<{ x: number; y: number; z?: number }>;

export type SceneTransformPreview = Readonly<{
  scenePath: string;
  objectId: string;
  tool: SceneTransformTool;
  delta: SceneTransformDelta;
}>;

export function sceneTransformDeltaFromPointer(
  tool: SceneTransformTool,
  space: SceneDocument['space'],
  delta: ViewportTransformDelta,
): SceneTransformDelta {
  if (tool === 'move') {
    if (space === 'ui') {
      return {
        x: (delta.x * 32) / 1280,
        y: (-delta.y * 32) / 720,
      };
    }
    return space === '3d' ? { ...delta, z: 0 } : delta;
  }
  if (tool === 'rotate') {
    return space === '3d'
      ? { x: -delta.y * 15, y: delta.x * 15, z: 0 }
      : delta.x * 15;
  }
  if (space === 'ui') {
    return { x: delta.x * 32, y: delta.y * 32 };
  }
  return space === '3d'
    ? { x: delta.x * 0.1, y: delta.y * 0.1, z: 0 }
    : { x: delta.x * 0.1, y: delta.y * 0.1 };
}

export function applySceneTransformPreview(
  source: SceneDocument,
  preview: SceneTransformPreview | null,
): SceneDocument {
  if (!preview) return source;
  const scene = structuredClone(source);
  const object = scene.objects.find(
    (candidate) => candidate.id === preview.objectId,
  );
  if (!object) return source;
  const transform = object.components.find((component) =>
    ['core:transform2d', 'core:transform3d', 'core:ui-transform'].includes(
      component.type,
    ),
  );
  if (!transform) return source;
  const field =
    preview.tool === 'move'
      ? transform.type === 'core:ui-transform'
        ? 'anchor'
        : 'position'
      : preview.tool === 'rotate'
        ? 'rotation'
        : transform.type === 'core:ui-transform'
          ? 'size'
          : 'scale';
  const current = transform.data[field];
  if (typeof current === 'number' && typeof preview.delta === 'number') {
    transform.data[field] = current + preview.delta;
    return scene;
  }
  if (
    current &&
    typeof current === 'object' &&
    !Array.isArray(current) &&
    preview.delta &&
    typeof preview.delta === 'object'
  ) {
    const currentVector = current as Record<string, unknown>;
    const deltaVector = preview.delta as Record<string, unknown>;
    transform.data[field] = Object.fromEntries(
      Object.keys(currentVector).map((axis) => [
        axis,
        Number(currentVector[axis] ?? 0) + Number(deltaVector[axis] ?? 0),
      ]),
    );
    return scene;
  }
  return source;
}
