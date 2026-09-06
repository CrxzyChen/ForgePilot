import { drawableBounds } from './runtime-observation-service.ts';
import { projectSceneToRenderSnapshot } from './runtime-projection.ts';
import type { SceneDocument } from '../workspace/scene-authoring-service.ts';

type SemanticTarget = { objectId: string; componentId: string };
export type UiContentExpectation = {
  container: SemanticTarget;
  inset: { left: number; right: number; top: number; bottom: number };
  viewport: { width: number; height: number };
  minimumMargin: number;
};
const record = (v: unknown): v is Record<string, unknown> =>
  Boolean(v && typeof v === 'object' && !Array.isArray(v));
const exact = (v: unknown, keys: string[]): v is Record<string, unknown> =>
  record(v) &&
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
const semantic = (v: unknown) =>
  typeof v === 'string' &&
  /^[a-z0-9][a-z0-9_-]*:[a-z0-9][a-z0-9_./-]*$/iu.test(v);
const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

export function isUiContentExpectation(v: unknown): v is UiContentExpectation {
  if (
    !exact(v, ['container', 'inset', 'viewport', 'minimumMargin']) ||
    !exact(v.container, ['objectId', 'componentId']) ||
    !semantic(v.container.objectId) ||
    !semantic(v.container.componentId) ||
    !exact(v.inset, ['left', 'right', 'top', 'bottom']) ||
    !exact(v.viewport, ['width', 'height'])
  )
    return false;
  const inset = v.inset;
  if (!Object.values(inset).every((n) => finite(n) && n >= 0 && n < 1))
    return false;
  return (
    Number(inset.left) + Number(inset.right) < 1 &&
    Number(inset.top) + Number(inset.bottom) < 1 &&
    Object.values(v.viewport).every(
      (n) => finite(n) && Number.isInteger(n) && n > 0 && n <= 8192,
    ) &&
    finite(v.minimumMargin) &&
    v.minimumMargin >= 0 &&
    v.minimumMargin <= 8192
  );
}

// Pure derived geometry; no frame capture, assets, GPU, device or project writes.
// Insets describe the art's author-selected interior, not an inferred alpha box.
export function evaluateUiContent(
  scene: SceneDocument,
  target: SemanticTarget,
  expected: UiContentExpectation,
) {
  const authored = (selected: SemanticTarget, types: string[]) =>
    scene.objects
      .find((o) => o.id === selected.objectId)
      ?.components.some(
        (c) =>
          c.id === selected.componentId &&
          c.enabled !== false &&
          types.includes(c.type),
      );
  if (
    !authored(target, ['ui:text', 'ui:button']) ||
    !authored(expected.container, ['ui:image', 'ui:button'])
  )
    return {
      matches: false,
      targetFound: false,
      reason: 'missing-authored-ui-component',
    };
  const projected = projectSceneToRenderSnapshot({ scene });
  const belongs = (id: string, componentId: string) =>
    id === componentId || id.startsWith(componentId + '/');
  const texts = projected.payload.drawables.filter(
    (d) =>
      d.objectId === target.objectId &&
      belongs(d.id, target.componentId) &&
      d.space === 'ui' &&
      d.primitive === 'ui-text',
  );
  const panels = projected.payload.drawables.filter(
    (d) =>
      d.objectId === expected.container.objectId &&
      belongs(d.id, expected.container.componentId) &&
      d.space === 'ui' &&
      ['ui-image', 'shape2d'].includes(d.primitive),
  );
  const found = texts.length === 1 && panels.length === 1;
  if (!found)
    return {
      matches: false,
      targetFound: false,
      reason: 'missing-or-ambiguous-ui-target',
    };
  const text = texts[0],
    panel = panels[0];
  // A button may intentionally render only its label. Its own layout remains
  // the label's hit area, but cannot serve as another label's visible panel.
  const ownButton =
    target.objectId === expected.container.objectId &&
    target.componentId === expected.container.componentId &&
    authored(target, ['ui:button']);
  if (
    !text.visible ||
    !panel.visible ||
    (text.tint?.[3] ?? 1) <= 0 ||
    ((panel.tint?.[3] ?? 1) <= 0 && !ownButton)
  )
    return { matches: false, targetFound: true, reason: 'hidden-ui-target' };
  if (
    Math.abs(panel.transform2d?.rotation ?? 0) > 0.000001 ||
    Math.abs(text.transform2d?.rotation ?? 0) > 0.000001
  )
    return {
      matches: false,
      targetFound: true,
      reason: 'rotated-ui-content-unsupported',
    };
  const viewport: [number, number] = [
    expected.viewport.width,
    expected.viewport.height,
  ];
  const bounds = drawableBounds(text, undefined, viewport);
  const panelBounds = drawableBounds(panel, undefined, viewport);
  const inset = expected.inset;
  const interior = [
    panelBounds[0] + panelBounds[2] * inset.left,
    panelBounds[1] + panelBounds[3] * inset.top,
    panelBounds[2] * (1 - inset.left - inset.right),
    panelBounds[3] * (1 - inset.top - inset.bottom),
  ];
  const margins = {
    left: bounds[0] - interior[0],
    top: bounds[1] - interior[1],
    right: interior[0] + interior[2] - bounds[0] - bounds[2],
    bottom: interior[1] + interior[3] - bounds[1] - bounds[3],
  };
  const onScreen = [bounds, panelBounds].every(
    (rect) =>
      rect[0] >= 0 &&
      rect[1] >= 0 &&
      rect[0] + rect[2] <= viewport[0] &&
      rect[1] + rect[3] <= viewport[1],
  );
  const nonempty =
    Boolean(text.text?.trim()) &&
    bounds[2] > 0 &&
    bounds[3] > 0 &&
    (panel.size?.[0] ?? 0) > 0 &&
    (panel.size?.[1] ?? 0) > 0;
  const matches =
    nonempty &&
    onScreen &&
    Object.values(margins).every((n) => n + 0.000001 >= expected.minimumMargin);
  return {
    matches,
    targetFound: true,
    reason: matches
      ? 'fits'
      : !nonempty
        ? 'empty-ui-target'
        : !onScreen
          ? 'viewport-clipped'
          : 'content-inset-overflow',
    textBounds: bounds,
    panelBounds,
    contentBounds: interior,
    contentKind: ownButton ? 'button-hit-area' : 'panel-interior',
    margins,
    viewport,
  };
}
