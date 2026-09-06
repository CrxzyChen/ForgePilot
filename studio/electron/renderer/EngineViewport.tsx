import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  LinearColor,
  RuntimeDrawableProjection,
  RuntimeRenderSnapshot,
} from '../../runtime/runtime-session-protocol.ts';
import { drawWebGl3D } from './webgl3d-renderer.ts';

type Props = {
  snapshot: RuntimeRenderSnapshot;
  mode: 'scene' | 'game';
  selectedObjectIds?: readonly string[];
  showGrid?: boolean;
  assetSources?: Readonly<Record<string, string>>;
  onPick?: (objectId: string | null, additive: boolean) => void;
  onTransformDelta?: (
    objectId: string,
    delta: { x: number; y: number },
  ) => void | Promise<void>;
  onTransformPreview?: (
    objectId: string,
    delta: { x: number; y: number } | null,
  ) => void;
  onInput?: (input: {
    action: string;
    value: number;
    source: 'keyboard' | 'pointer';
  }) => void;
};

type HitRegion = {
  objectId: string;
  inputAction?: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type EditorNavigation = {
  yaw: number;
  pitch: number;
  distance: number;
  panX: number;
  panY: number;
};

function cssColor(color: LinearColor | undefined, alpha = 1): string {
  const [r, g, b, a] = color ?? [0.55, 0.65, 0.72, 1];
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(
    b * 255,
  )}, ${Math.max(0, Math.min(1, a * alpha))})`;
}

function world2d(
  snapshot: RuntimeRenderSnapshot,
  aspect: number,
  navigation?: Readonly<EditorNavigation>,
) {
  const camera = snapshot.payload.cameras.find(
    (candidate) => candidate.space === '2d' && candidate.primary,
  );
  const height =
    (camera?.orthographicHeight ?? 18) * (navigation?.distance ?? 1);
  const cameraCenter = camera?.transform2d?.position ?? [16, 9];
  const center = [
    cameraCenter[0] + (navigation?.panX ?? 0),
    cameraCenter[1] + (navigation?.panY ?? 0),
  ] as const;
  return { center, width: height * aspect, height };
}

function drawGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  spacing = 32,
) {
  context.save();
  context.strokeStyle = 'rgba(112, 144, 162, 0.13)';
  context.lineWidth = 1;
  for (let x = Math.round(width / 2) % spacing; x < width; x += spacing) {
    context.beginPath();
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, height);
    context.stroke();
  }
  for (let y = Math.round(height / 2) % spacing; y < height; y += spacing) {
    context.beginPath();
    context.moveTo(0, y + 0.5);
    context.lineTo(width, y + 0.5);
    context.stroke();
  }
  context.restore();
}

function drawWorldGrid2d(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  snapshot: RuntimeRenderSnapshot,
  navigation: Readonly<EditorNavigation>,
) {
  const world = world2d(snapshot, width / Math.max(1, height), navigation);
  const scale = height / world.height;
  let worldSpacing = 1;
  while (worldSpacing * scale < 26) worldSpacing *= 2;
  while (worldSpacing * scale > 72) worldSpacing /= 2;
  const spacing = Math.max(8, worldSpacing * scale);
  const originX = width / 2 - world.center[0] * scale;
  const originY = height / 2 + world.center[1] * scale;
  const firstX = ((originX % spacing) + spacing) % spacing;
  const firstY = ((originY % spacing) + spacing) % spacing;
  context.save();
  context.strokeStyle = 'rgba(112, 144, 162, 0.13)';
  context.lineWidth = 1;
  for (let x = firstX; x < width; x += spacing) {
    context.beginPath();
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, height);
    context.stroke();
  }
  for (let y = firstY; y < height; y += spacing) {
    context.beginPath();
    context.moveTo(0, y + 0.5);
    context.lineTo(width, y + 0.5);
    context.stroke();
  }
  context.restore();
}

function draw2d(
  context: CanvasRenderingContext2D,
  drawable: RuntimeDrawableProjection,
  width: number,
  height: number,
  snapshot: RuntimeRenderSnapshot,
  images: ReadonlyMap<string, HTMLImageElement>,
  editorNavigation?: Readonly<EditorNavigation>,
): HitRegion | null {
  const transform = drawable.transform2d;
  if (!transform) return null;
  const world = world2d(
    snapshot,
    width / Math.max(1, height),
    editorNavigation,
  );
  const scale = height / world.height;
  const ui = drawable.space === 'ui';
  const scaleX = ui ? width / 1280 : scale;
  const scaleY = ui ? height / 720 : scale;
  const x = ui
    ? transform.position[0] * scaleX
    : width / 2 + (transform.position[0] - world.center[0]) * scale;
  const y = ui
    ? height - transform.position[1] * scaleY
    : height / 2 - (transform.position[1] - world.center[1]) * scale;
  const size = drawable.size ?? [1, 1];
  const drawWidth = Math.max(2, size[0] * transform.scale[0] * scaleX);
  const drawHeight = Math.max(2, size[1] * transform.scale[1] * scaleY);
  context.save();
  context.translate(x, y);
  context.rotate((-transform.rotation * Math.PI) / 180);
  context.fillStyle = cssColor(drawable.tint);
  const left = -drawWidth * (drawable.pivot?.[0] ?? 0.5);
  const top = -drawHeight * (drawable.pivot?.[1] ?? 0.5);
  if (
    (drawable.primitive === 'sprite2d' || drawable.primitive === 'ui-image') &&
    drawable.asset
  ) {
    const image = images.get(drawable.asset.projectPath);
    if (image?.complete && image.naturalWidth > 0) {
      context.imageSmoothingEnabled = drawable.filter !== 'nearest';
      const region = drawable.atlasRegion;
      if (region) {
        const normalized = region.every((value) => value >= 0 && value <= 1);
        const [sourceX, sourceY, sourceWidth, sourceHeight] = normalized
          ? [
              region[0] * image.naturalWidth,
              region[1] * image.naturalHeight,
              region[2] * image.naturalWidth,
              region[3] * image.naturalHeight,
            ]
          : region;
        context.drawImage(
          image,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          left,
          top,
          drawWidth,
          drawHeight,
        );
      } else {
        context.drawImage(image, left, top, drawWidth, drawHeight);
      }
      if (drawable.tint && drawable.tint.some((value) => value < 0.999)) {
        context.globalCompositeOperation = 'multiply';
        context.fillRect(left, top, drawWidth, drawHeight);
        context.globalCompositeOperation = 'source-over';
      }
    } else {
      context.strokeStyle = '#ff6b7a';
      context.strokeRect(left, top, drawWidth, drawHeight);
    }
  } else if (
    drawable.primitive === 'text2d' ||
    drawable.primitive === 'ui-text'
  ) {
    context.font = `${Math.max(10, drawWidth)}px Inter, system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(drawable.text ?? '', 0, 0);
  } else {
    context.fillRect(left, top, drawWidth, drawHeight);
  }
  context.restore();
  return {
    objectId: drawable.objectId,
    inputAction: drawable.inputAction,
    left: x + left,
    top: y + top,
    right: x + left + drawWidth,
    bottom: y + top + drawHeight,
  };
}

export function EngineViewport({
  snapshot,
  mode,
  selectedObjectIds = [],
  showGrid = mode === 'scene',
  assetSources = {},
  onPick,
  onTransformDelta,
  onTransformPreview,
  onInput,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webGlCanvasRef = useRef<HTMLCanvasElement>(null);
  const hitRegions = useRef<HitRegion[]>([]);
  const images = useRef(new Map<string, HTMLImageElement>());
  const drag = useRef<{
    objectId: string;
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const pendingTransformPreview = useRef<{
    objectId: string;
    delta: { x: number; y: number };
  } | null>(null);
  const transformPreviewFrame = useRef<number | null>(null);
  const navigationFrame = useRef<number | null>(null);
  const suppressSceneClickPick = useRef(false);
  const spaceNavigationHeld = useRef(false);
  const navigationDrag = useRef<{
    pointerId: number;
    mode: 'orbit' | 'pan';
    x: number;
    y: number;
  } | null>(null);
  const navigation = useRef<EditorNavigation>({
    yaw: 0,
    pitch: 0,
    distance: 1,
    panX: 0,
    panY: 0,
  });
  const [editorNavigation, setEditorNavigation] = useState<EditorNavigation>({
    yaw: 0,
    pitch: 0,
    distance: 1,
    panX: 0,
    panY: 0,
  });
  const selected = useMemo(
    () => new Set(selectedObjectIds),
    [selectedObjectIds],
  );
  const has3d = snapshot.payload.drawables.some(
    (drawable) => drawable.visible && drawable.space === '3d',
  );

  const resetNavigation = useCallback(() => {
    const next = {
      yaw: 0,
      pitch: 0,
      distance: 1,
      panX: 0,
      panY: 0,
    };
    navigation.current = next;
    setEditorNavigation(next);
  }, []);

  const scheduleNavigationRender = () => {
    if (navigationFrame.current !== null) return;
    navigationFrame.current = requestAnimationFrame(() => {
      navigationFrame.current = null;
      setEditorNavigation({ ...navigation.current });
    });
  };

  const flushNavigationRender = () => {
    if (navigationFrame.current !== null) {
      cancelAnimationFrame(navigationFrame.current);
      navigationFrame.current = null;
    }
    setEditorNavigation({ ...navigation.current });
  };

  const pointerTransformDelta = (
    event: Pick<PointerEvent, 'clientX' | 'clientY'>,
    active: { x: number; y: number },
  ) => ({
    x:
      ((event.clientX - active.x) / 32) *
      (mode === 'scene' ? navigation.current.distance : 1),
    y:
      ((active.y - event.clientY) / 32) *
      (mode === 'scene' ? navigation.current.distance : 1),
  });

  const cancelTransformPreviewFrame = () => {
    if (transformPreviewFrame.current === null) return;
    cancelAnimationFrame(transformPreviewFrame.current);
    transformPreviewFrame.current = null;
  };

  const scheduleTransformPreview = (
    objectId: string,
    delta: { x: number; y: number },
  ) => {
    pendingTransformPreview.current = { objectId, delta };
    if (transformPreviewFrame.current !== null) return;
    transformPreviewFrame.current = requestAnimationFrame(() => {
      transformPreviewFrame.current = null;
      const pending = pendingTransformPreview.current;
      pendingTransformPreview.current = null;
      if (pending) onTransformPreview?.(pending.objectId, pending.delta);
    });
  };

  const flushTransformPreview = (
    objectId: string,
    delta: { x: number; y: number },
  ) => {
    cancelTransformPreviewFrame();
    pendingTransformPreview.current = null;
    onTransformPreview?.(objectId, delta);
  };

  const clearTransformPreview = (objectId: string) => {
    cancelTransformPreviewFrame();
    pendingTransformPreview.current = null;
    onTransformPreview?.(objectId, null);
  };

  useEffect(
    () => () => {
      cancelTransformPreviewFrame();
      if (navigationFrame.current !== null) {
        cancelAnimationFrame(navigationFrame.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (mode !== 'scene') return;
    const isEditableTarget = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.matches('input, textarea, select, [contenteditable="true"]') ||
        Boolean(target.closest('.monaco-editor')));
    const keyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.code === 'Space') {
        spaceNavigationHeld.current = true;
        event.preventDefault();
      } else if (event.code === 'Home') {
        resetNavigation();
        event.preventDefault();
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      spaceNavigationHeld.current = false;
      if (!isEditableTarget(event.target)) event.preventDefault();
    };
    const clearHeldKeys = () => {
      spaceNavigationHeld.current = false;
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', clearHeldKeys);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', clearHeldKeys);
    };
  }, [mode, resetNavigation]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const webGlCanvas = webGlCanvasRef.current;
    if (!canvas || !webGlCanvas) return;
    const draw = () => {
      const rectangle = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rectangle.width));
      const height = Math.max(1, Math.round(rectangle.height));
      const pixelWidth = Math.round(width * ratio);
      const pixelHeight = Math.round(height * ratio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      const context = canvas.getContext('2d');
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const regions: HitRegion[] = [];
      if (has3d) {
        regions.push(
          ...drawWebGl3D({
            canvas: webGlCanvas,
            snapshot,
            width,
            height,
            pixelRatio: ratio,
            assetSources,
            images: images.current,
            editorNavigation: mode === 'scene' ? editorNavigation : undefined,
          }),
        );
      } else {
        webGlCanvas.width = 1;
        webGlCanvas.height = 1;
        const camera = snapshot.payload.cameras.find(
          (candidate) => candidate.primary,
        );
        context.fillStyle = cssColor(camera?.clearColor, 1);
        context.fillRect(0, 0, width, height);
      }
      if (showGrid) {
        if (has3d) drawGrid(context, width, height);
        else
          drawWorldGrid2d(context, width, height, snapshot, editorNavigation);
      }
      const drawables = [...snapshot.payload.drawables]
        .filter((drawable) => drawable.visible)
        .sort(
          (left, right) =>
            left.layer - right.layer || left.id.localeCompare(right.id),
        );
      for (const drawable of drawables) {
        if (drawable.space === '3d') continue;
        const region = draw2d(
          context,
          drawable,
          width,
          height,
          snapshot,
          images.current,
          mode === 'scene' && !has3d ? editorNavigation : undefined,
        );
        if (region) regions.push(region);
      }
      if (mode === 'scene') {
        context.save();
        context.strokeStyle = '#55d6e3';
        context.lineWidth = 1.5;
        context.setLineDash([5, 3]);
        for (const region of regions.filter((candidate) =>
          selected.has(candidate.objectId),
        )) {
          context.strokeRect(
            region.left - 4,
            region.top - 4,
            region.right - region.left + 8,
            region.bottom - region.top + 8,
          );
        }
        context.restore();
      }
      hitRegions.current = regions;
    };
    for (const [path, source] of Object.entries(assetSources)) {
      const existing = images.current.get(path);
      if (existing?.src === source) continue;
      const image = new Image();
      image.onload = draw;
      image.src = source;
      images.current.set(path, image);
    }
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [
    assetSources,
    has3d,
    mode,
    editorNavigation,
    selected,
    showGrid,
    snapshot,
  ]);

  return (
    <div
      className="engine-viewport"
      data-engine-viewport={mode}
      data-renderer={has3d ? 'webgl2-depth' : 'canvas2d'}
      data-view-distance={editorNavigation.distance.toFixed(4)}
      data-view-pan-x={editorNavigation.panX.toFixed(4)}
      data-view-pan-y={editorNavigation.panY.toFixed(4)}
    >
      <canvas
        ref={webGlCanvasRef}
        className="engine-viewport-surface engine-viewport-webgl"
        aria-hidden="true"
      />
      <canvas
        ref={canvasRef}
        className="engine-viewport-surface engine-viewport-overlay"
        data-engine-viewport={mode}
        data-renderer={has3d ? 'webgl2-depth-overlay' : 'canvas2d'}
        aria-label={mode === 'scene' ? '引擎 Scene 视口' : '实时 Game 视口'}
        tabIndex={0}
        onPointerDown={(event) => {
          const navigationRequested =
            mode === 'scene' &&
            (event.button === 1 ||
              event.button === 2 ||
              (event.button === 0 && spaceNavigationHeld.current) ||
              (has3d && event.button === 0 && event.altKey));
          if (navigationRequested) {
            navigationDrag.current = {
              pointerId: event.pointerId,
              mode:
                has3d &&
                (event.button === 2 ||
                  (event.button === 0 && event.altKey && !event.shiftKey))
                  ? 'orbit'
                  : 'pan',
              x: event.clientX,
              y: event.clientY,
            };
            suppressSceneClickPick.current = event.button === 0;
            event.currentTarget.setPointerCapture(event.pointerId);
            event.preventDefault();
            return;
          }
          if (mode !== 'scene' || event.button !== 0 || !onTransformDelta)
            return;
          const rectangle = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rectangle.left;
          const y = event.clientY - rectangle.top;
          const hit = [...hitRegions.current]
            .reverse()
            .find(
              (region) =>
                x >= region.left &&
                x <= region.right &&
                y >= region.top &&
                y <= region.bottom,
            );
          if (!hit) return;
          drag.current = {
            objectId: hit.objectId,
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          suppressSceneClickPick.current = true;
          onPick?.(
            hit.objectId,
            event.ctrlKey || event.metaKey || event.shiftKey,
          );
        }}
        onPointerMove={(event) => {
          const activeNavigation = navigationDrag.current;
          if (
            activeNavigation &&
            activeNavigation.pointerId === event.pointerId
          ) {
            const deltaX = event.clientX - activeNavigation.x;
            const deltaY = event.clientY - activeNavigation.y;
            activeNavigation.x = event.clientX;
            activeNavigation.y = event.clientY;
            if (activeNavigation.mode === 'orbit') {
              navigation.current.yaw += deltaX * 0.006;
              navigation.current.pitch = Math.max(
                -1.2,
                Math.min(1.2, navigation.current.pitch + deltaY * 0.006),
              );
            } else {
              const panScale = has3d ? 0.02 : 0.04;
              navigation.current.panX -=
                deltaX * panScale * navigation.current.distance;
              navigation.current.panY +=
                deltaY * panScale * navigation.current.distance;
            }
            scheduleNavigationRender();
            return;
          }
          const activeTransform = drag.current;
          if (!activeTransform || activeTransform.pointerId !== event.pointerId)
            return;
          scheduleTransformPreview(
            activeTransform.objectId,
            pointerTransformDelta(event.nativeEvent, activeTransform),
          );
        }}
        onPointerUp={(event) => {
          const activeNavigation = navigationDrag.current;
          if (
            activeNavigation &&
            activeNavigation.pointerId === event.pointerId
          ) {
            navigationDrag.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
            flushNavigationRender();
            return;
          }
          const active = drag.current;
          if (!active || active.pointerId !== event.pointerId) return;
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          const { x, y } = pointerTransformDelta(event.nativeEvent, active);
          if (Math.abs(x) + Math.abs(y) >= 0.08) {
            const delta = { x, y };
            flushTransformPreview(active.objectId, delta);
            try {
              const committed = onTransformDelta?.(active.objectId, delta);
              clearTransformPreview(active.objectId);
              void Promise.resolve(committed).catch(() => undefined);
            } catch {
              clearTransformPreview(active.objectId);
            }
          } else {
            clearTransformPreview(active.objectId);
          }
        }}
        onPointerCancel={() => {
          const activeTransform = drag.current;
          drag.current = null;
          navigationDrag.current = null;
          if (activeTransform) clearTransformPreview(activeTransform.objectId);
        }}
        onContextMenu={(event) => event.preventDefault()}
        onWheel={(event) => {
          if (mode !== 'scene') return;
          navigation.current.distance = Math.max(
            0.25,
            Math.min(
              4,
              navigation.current.distance * Math.exp(event.deltaY * 0.001),
            ),
          );
          scheduleNavigationRender();
          event.preventDefault();
        }}
        onClick={(event) => {
          const rectangle = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rectangle.left;
          const y = event.clientY - rectangle.top;
          const hit = [...hitRegions.current]
            .reverse()
            .find(
              (region) =>
                x >= region.left &&
                x <= region.right &&
                y >= region.top &&
                y <= region.bottom,
            );
          if (mode === 'scene') {
            if (!suppressSceneClickPick.current) {
              onPick?.(
                hit?.objectId ?? null,
                event.ctrlKey || event.metaKey || event.shiftKey,
              );
            }
            suppressSceneClickPick.current = false;
          } else {
            onInput?.({
              action: hit?.inputAction ?? 'pointer:Mouse0',
              value: 1,
              source: 'pointer',
            });
          }
          event.currentTarget.focus();
        }}
        onKeyDown={(event) => {
          if (event.repeat) return;
          if (mode === 'scene' && event.code === 'Space') {
            spaceNavigationHeld.current = true;
            event.preventDefault();
            return;
          }
          if (mode === 'scene' && event.code === 'Home') {
            resetNavigation();
            event.preventDefault();
            return;
          }
          onInput?.({
            action: `keyboard:${event.code}`,
            value: 1,
            source: 'keyboard',
          });
        }}
        onKeyUp={(event) => {
          if (mode === 'scene' && event.code === 'Space') {
            spaceNavigationHeld.current = false;
            event.preventDefault();
            return;
          }
          onInput?.({
            action: `keyboard:${event.code}`,
            value: 0,
            source: 'keyboard',
          });
        }}
      />
      {mode === 'scene' && (
        <div className="engine-viewport-navigation" aria-label="Scene 视图控制">
          <output>{Math.round(100 / editorNavigation.distance)}%</output>
          <button
            type="button"
            title="重置 Scene 视图 (Home)"
            onClick={resetNavigation}
          >
            重置视图
          </button>
        </div>
      )}
    </div>
  );
}
