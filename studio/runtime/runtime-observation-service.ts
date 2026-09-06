import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { ProjectError } from '../project/project-types.ts';
import type {
  SceneComponentDocument,
  SceneDocument,
} from '../workspace/scene-authoring-service.ts';
import type { ProjectRuntimeResult } from './project-script-runtime.ts';
import type {
  RuntimeAssetReference,
  RuntimeAudioEvent,
  RuntimeCameraProjection,
  RuntimeDiagnostic,
  RuntimeDrawableProjection,
  RuntimeRenderSnapshot,
  RuntimeSemanticId,
  RuntimeSessionId,
} from './runtime-session-protocol.ts';

export type RuntimeObservationSource = 'studio' | 'player';
export type RuntimeObservationDiagnostic = {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  tick: number;
  sceneId?: RuntimeSemanticId;
  objectId?: RuntimeSemanticId;
  componentId?: RuntimeSemanticId;
  assetId?: RuntimeSemanticId;
  systemId?: RuntimeSemanticId;
  moduleId?: RuntimeSemanticId;
  projectPath?: string;
  line?: number;
  column?: number;
  checkpointId?: `checkpoint:${string}`;
};

export type RuntimeObservation = {
  schemaVersion: '1.0.0';
  observationId: `observation:${string}`;
  source: RuntimeObservationSource;
  sessionId: RuntimeSessionId;
  generation: number;
  sceneId: RuntimeSemanticId;
  tick: number;
  checkpointId: `checkpoint:${string}`;
  inputLogId?: `input-log:${string}`;
  stateHash?: string;
  camera: {
    cameraId: RuntimeSemanticId;
    space: '2d' | '3d' | 'ui';
    projection: 'orthographic' | 'perspective' | 'screen';
    viewport: [number, number];
  };
  frameArtifact: {
    artifactId: `artifact:${string}`;
    path: string;
    mime: 'image/png';
    sha256: string;
    width: number;
    height: number;
  };
  drawables: Array<{
    drawableId: RuntimeSemanticId;
    objectId: RuntimeSemanticId;
    componentId: RuntimeSemanticId;
    primitive: RuntimeDrawableProjection['primitive'];
    visible: boolean;
    layer: number;
    order: number;
    bounds: [number, number, number, number];
    pivot: [number, number];
    scale: [number, number];
    atlasRegion?: [number, number, number, number];
    tint?: [number, number, number, number];
    resource?: {
      assetId: RuntimeSemanticId;
      sourceHash: string;
      derivedHash?: string;
      resolved: boolean;
      fallback: boolean;
      projectPath?: string;
    };
    fallback: boolean;
  }>;
  ui: Array<{
    uiId: RuntimeSemanticId;
    objectId: RuntimeSemanticId;
    componentId: RuntimeSemanticId;
    bounds: [number, number, number, number];
    visible: boolean;
    clipped: boolean;
    overflow: boolean;
    interactive: boolean;
    reachable: boolean;
    inputAction?: string;
  }>;
  audio: {
    events: Array<{
      eventId: RuntimeSemanticId;
      action: RuntimeAudioEvent['payload']['action'];
      clip?: {
        assetId: RuntimeSemanticId;
        sourceHash: string;
        derivedHash?: string;
        resolved: boolean;
        fallback: boolean;
        projectPath?: string;
      };
      busId: RuntimeSemanticId;
      volume?: number;
      muted?: boolean;
      tick: number;
    }>;
    buses: Array<{
      busId: RuntimeSemanticId;
      volume: number;
      muted: boolean;
    }>;
    missingClipIds: RuntimeSemanticId[];
    failedPlaybackIds: RuntimeSemanticId[];
  };
  diagnostics: RuntimeObservationDiagnostic[];
  capturedAt: string;
};

export type RuntimeObservationCapture = {
  source: RuntimeObservationSource;
  checkpointId: string;
  snapshot: RuntimeRenderSnapshot;
  scene: SceneDocument;
  sessionId?: RuntimeSessionId;
  generation?: number;
  tick?: number;
  stateHash?: string;
  inputLogId?: string;
  audioEvents?: readonly RuntimeAudioEvent[];
  runtimeDiagnostics?: readonly RuntimeDiagnostic[];
  audioBuses?: ReadonlyArray<{ id: string; volume: number; muted: boolean }>;
  viewport?: readonly [number, number];
  assetRoot?: string;
  rendererExecutablePath?: string;
  reachableAssetPaths?: ReadonlySet<string>;
};

export type RuntimeObservationComparison = {
  schemaVersion: '1.0.0';
  comparisonId: `observation-comparison:${string}`;
  leftObservationId: RuntimeObservation['observationId'];
  rightObservationId: RuntimeObservation['observationId'];
  checkpointId: RuntimeObservation['checkpointId'];
  stateHashMatches: boolean;
  drawableIdentityMatches: boolean;
  resourceIdentityMatches: boolean;
  audioIdentityMatches: boolean;
  mismatches: Array<{
    code: string;
    semanticId?: RuntimeSemanticId;
    left?: unknown;
    right?: unknown;
  }>;
};

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function runtimeStateHash(value: unknown): string {
  return sha256(canonical(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSemanticId(value: unknown): value is RuntimeSemanticId {
  return (
    typeof value === 'string' &&
    /^[a-z][a-z0-9_-]*:[a-z0-9][a-z0-9_./-]*$/u.test(value)
  );
}

function invalidObservation(message: string, details?: unknown): never {
  throw new ProjectError(
    'RUNTIME_OBSERVATION_DOCUMENT_INVALID',
    message,
    details,
  );
}

function validateObservationDocument(
  value: unknown,
  expectedId: `observation:${string}`,
  projectRoot: string,
): RuntimeObservation {
  if (!isRecord(value)) invalidObservation('运行观察文件必须是 JSON 对象。');
  if (value.schemaVersion !== '1.0.0') {
    const actualVersion =
      typeof value.schemaVersion === 'string'
        ? value.schemaVersion
        : value.schemaVersion === undefined
          ? 'missing'
          : 'invalid';
    throw new ProjectError(
      'RUNTIME_OBSERVATION_MIGRATION_REQUIRED',
      `运行观察版本 ${actualVersion} 无法按 1.0.0 读取，必须先迁移或重新捕获。`,
      { expected: '1.0.0', actual: value.schemaVersion ?? null },
    );
  }
  if (value.observationId !== expectedId) {
    invalidObservation('运行观察 ID 与文件名不一致。', {
      expected: expectedId,
      actual: value.observationId ?? null,
    });
  }
  if (value.source !== 'studio' && value.source !== 'player') {
    invalidObservation('运行观察缺少有效 source。');
  }
  if (
    !isSemanticId(value.sessionId) ||
    !isSemanticId(value.sceneId) ||
    typeof value.checkpointId !== 'string' ||
    !/^checkpoint:[a-z0-9][a-z0-9_-]*$/u.test(value.checkpointId) ||
    !Number.isInteger(value.generation) ||
    Number(value.generation) < 1 ||
    !Number.isInteger(value.tick) ||
    Number(value.tick) < 0
  ) {
    invalidObservation(
      '运行观察缺少可寻址的 Session、Scene、Checkpoint、Generation 或 Tick。',
    );
  }
  if (
    value.stateHash !== undefined &&
    (typeof value.stateHash !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(value.stateHash))
  ) {
    invalidObservation('运行观察 stateHash 无效。');
  }
  const camera = value.camera;
  if (
    !isRecord(camera) ||
    !isSemanticId(camera.cameraId) ||
    !Array.isArray(camera.viewport) ||
    camera.viewport.length !== 2 ||
    !camera.viewport.every((item) => Number.isInteger(item) && item > 0)
  ) {
    invalidObservation('运行观察缺少可寻址相机或有效视口。');
  }
  const frame = value.frameArtifact;
  if (
    !isRecord(frame) ||
    typeof frame.artifactId !== 'string' ||
    !/^artifact:[a-z0-9][a-z0-9_-]*$/u.test(frame.artifactId) ||
    typeof frame.path !== 'string' ||
    typeof frame.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(frame.sha256) ||
    frame.mime !== 'image/png'
  ) {
    invalidObservation('运行观察缺少有效且可寻址的帧产物。');
  }
  for (const [field, requiredIds] of [
    ['drawables', ['drawableId', 'objectId', 'componentId']],
    ['ui', ['uiId', 'objectId', 'componentId']],
    ['diagnostics', []],
  ] as const) {
    const items = value[field];
    if (!Array.isArray(items))
      invalidObservation(`运行观察 ${field} 必须是数组。`);
    for (const [index, item] of items.entries()) {
      if (!isRecord(item))
        invalidObservation(`${field}[${index}] 必须是对象。`);
      for (const id of requiredIds) {
        if (!isSemanticId(item[id])) {
          invalidObservation(`${field}[${index}].${id} 缺少稳定语义 ID。`);
        }
      }
    }
  }
  const audio = value.audio;
  if (
    !isRecord(audio) ||
    !Array.isArray(audio.events) ||
    !Array.isArray(audio.buses) ||
    !Array.isArray(audio.missingClipIds) ||
    !Array.isArray(audio.failedPlaybackIds)
  ) {
    invalidObservation('运行观察缺少结构化音频证据。');
  }
  if (
    typeof value.capturedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.capturedAt))
  ) {
    invalidObservation('运行观察 capturedAt 无效。');
  }

  const observation = value as RuntimeObservation;
  const identitySeed = [
    observation.source,
    observation.sessionId,
    observation.generation,
    observation.sceneId,
    observation.tick,
    observation.checkpointId,
    observation.camera.viewport.join('x'),
    observation.stateHash ?? '',
  ].join('|');
  if (stableId('observation', identitySeed) !== expectedId) {
    invalidObservation('运行观察的稳定 ID 与其权威身份字段不一致。');
  }
  const framePath = insideRoot(projectRoot, observation.frameArtifact.path);
  if (!framePath || !existsSync(framePath)) {
    throw new ProjectError(
      'RUNTIME_OBSERVATION_ARTIFACT_MISSING',
      `运行观察帧不存在：${observation.frameArtifact.path}`,
    );
  }
  const actualFrameHash = sha256(readFileSync(framePath));
  if (actualFrameHash !== observation.frameArtifact.sha256) {
    throw new ProjectError(
      'RUNTIME_OBSERVATION_ARTIFACT_HASH_MISMATCH',
      `运行观察帧哈希不一致：${observation.frameArtifact.path}`,
      { expected: observation.frameArtifact.sha256, actual: actualFrameHash },
    );
  }
  return structuredClone(observation);
}

function stableId<TPrefix extends string>(
  prefix: TPrefix,
  value: string,
): `${TPrefix}:${string}` {
  return `${prefix}:${sha256(value).slice(0, 24)}`;
}

function checkpointId(value: string): `checkpoint:${string}` {
  const normalized = value
    .toLowerCase()
    .replace(/^checkpoint:/u, '')
    .replace(/[^a-z0-9_-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  if (!normalized) {
    throw new ProjectError(
      'RUNTIME_CHECKPOINT_ID_INVALID',
      'checkpointId 必须包含可寻址名称。',
    );
  }
  return `checkpoint:${normalized}`;
}

function inputLogId(
  value: string | undefined,
): `input-log:${string}` | undefined {
  if (!value) return undefined;
  const normalized = value
    .toLowerCase()
    .replace(/^input-log:/u, '')
    .replace(/[^a-z0-9_-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return normalized ? `input-log:${normalized}` : undefined;
}

function round(value: number): number {
  const result = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(result, -0) ? 0 : result;
}

function componentFor(
  scene: SceneDocument,
  drawable: RuntimeDrawableProjection,
): SceneComponentDocument | undefined {
  const components =
    scene.objects.find((object) => object.id === drawable.objectId)
      ?.components ?? [];
  return [...components]
    .sort((left, right) => right.id.length - left.id.length)
    .find(
      (component) =>
        drawable.id === component.id ||
        drawable.id.startsWith(`${component.id}/`),
    );
}

function expectedResource(
  component: SceneComponentDocument | undefined,
): string | undefined {
  if (!component) return undefined;
  for (const name of ['texture', 'mesh', 'font', 'audio', 'clip']) {
    const value = component.data[name];
    if (typeof value === 'string' && value) return value;
  }
  return undefined;
}

function insideRoot(root: string, projectPath: string): string | null {
  const target = resolve(root, projectPath);
  const child = relative(root, target);
  return child && !child.startsWith('..') && !child.includes(':')
    ? target
    : null;
}

function resourceIdentity(
  reference: RuntimeAssetReference | undefined,
  assetRoot: string,
): {
  identity?: RuntimeObservation['drawables'][number]['resource'];
  resolved: boolean;
  failure?: 'missing' | 'hash-mismatch' | 'unsafe-path';
} {
  if (!reference) return { resolved: false, failure: 'missing' };
  const target = insideRoot(assetRoot, reference.projectPath);
  if (!target) {
    return {
      identity: {
        assetId: reference.id,
        sourceHash: reference.sourceHash,
        ...(reference.derivedHash
          ? { derivedHash: reference.derivedHash }
          : {}),
        resolved: false,
        fallback: true,
        projectPath: reference.projectPath,
      },
      resolved: false,
      failure: 'unsafe-path',
    };
  }
  const actual = existsSync(target) ? sha256(readFileSync(target)) : null;
  const resolved = actual === reference.sourceHash;
  return {
    identity: {
      assetId: reference.id,
      sourceHash: reference.sourceHash,
      ...(reference.derivedHash ? { derivedHash: reference.derivedHash } : {}),
      resolved,
      fallback: !resolved,
      projectPath: reference.projectPath,
    },
    resolved,
    ...(actual === null
      ? { failure: 'missing' as const }
      : actual !== reference.sourceHash
        ? { failure: 'hash-mismatch' as const }
        : {}),
  };
}

function primaryCamera(
  snapshot: RuntimeRenderSnapshot,
): RuntimeCameraProjection | undefined {
  return (
    snapshot.payload.cameras.find((camera) => camera.primary) ??
    snapshot.payload.cameras[0]
  );
}

export function drawableBounds(
  drawable: RuntimeDrawableProjection,
  camera: RuntimeCameraProjection | undefined,
  viewport: readonly [number, number],
): [number, number, number, number] {
  const [viewportWidth, viewportHeight] = viewport;
  const transform = drawable.transform2d;
  if (!transform) return [0, 0, 0, 0];
  const screen = drawable.space === 'ui';
  const height = camera?.orthographicHeight ?? 18;
  const width = height * (viewportWidth / viewportHeight);
  const center = camera?.transform2d?.position ?? [16, 9];
  const scaleX = screen ? viewportWidth / 1280 : viewportWidth / width;
  const scaleY = screen ? viewportHeight / 720 : viewportHeight / height;
  const x = screen
    ? transform.position[0] * scaleX
    : viewportWidth / 2 + (transform.position[0] - center[0]) * scaleX;
  const y = screen
    ? viewportHeight - transform.position[1] * scaleY
    : viewportHeight / 2 - (transform.position[1] - center[1]) * scaleY;
  const size = drawable.size ?? [1, 1];
  if (screen && drawable.primitive === 'ui-text') {
    // The Player renders a centered 5x7 bitmap font, with a 6-cell advance
    // and 9-cell line pitch. size is its font size, not the label rectangle.
    // Match snapshot_render_items/push_bitmap_text, including the 8-unit
    // minimum and the first-line-centered, subsequent-lines-down baseline.
    const source = drawable.text ?? '';
    const lines = source ? source.split(/\r?\n/u) : [];
    if (source.endsWith('\n')) lines.pop();
    const longest = lines.reduce(
      (maximum, line) => Math.max(maximum, Array.from(line).length),
      0,
    );
    if (longest === 0) return [round(x), round(y), 0, 0];
    const fontSize = Math.max(8, Math.abs(size[0]));
    const cell = fontSize / 7;
    const textWidth = (longest * 6 - 1) * cell * scaleX;
    const textHeight = (fontSize + (lines.length - 1) * cell * 9) * scaleY;
    return [
      round(x - textWidth / 2),
      round(y - (fontSize * scaleY) / 2),
      round(textWidth),
      round(textHeight),
    ];
  }
  const renderedWidth = Math.abs(size[0] * transform.scale[0] * scaleX);
  const renderedHeight = Math.abs(size[1] * transform.scale[1] * scaleY);
  const pivot = drawable.pivot ?? [0.5, 0.5];
  const left = -renderedWidth * pivot[0];
  const top = -renderedHeight * pivot[1];
  const radians = (-transform.rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = [
    [left, top],
    [left + renderedWidth, top],
    [left + renderedWidth, top + renderedHeight],
    [left, top + renderedHeight],
  ].map(([cornerX, cornerY]) => [
    x + cornerX * cosine - cornerY * sine,
    y + cornerX * sine + cornerY * cosine,
  ]);
  const xs = corners.map(([cornerX]) => cornerX);
  const ys = corners.map(([, cornerY]) => cornerY);
  const minimumX = Math.min(...xs);
  const minimumY = Math.min(...ys);
  return [
    round(minimumX),
    round(minimumY),
    round(Math.max(...xs) - minimumX),
    round(Math.max(...ys) - minimumY),
  ];
}

function intersectsViewport(
  bounds: readonly [number, number, number, number],
  viewport: readonly [number, number],
): boolean {
  return (
    bounds[2] > 0 &&
    bounds[3] > 0 &&
    bounds[0] < viewport[0] &&
    bounds[1] < viewport[1] &&
    bounds[0] + bounds[2] > 0 &&
    bounds[1] + bounds[3] > 0
  );
}

function isClipped(
  bounds: readonly [number, number, number, number],
  viewport: readonly [number, number],
): boolean {
  return (
    bounds[0] < 0 ||
    bounds[1] < 0 ||
    bounds[0] + bounds[2] > viewport[0] ||
    bounds[1] + bounds[3] > viewport[1]
  );
}

export class RuntimeObservationService {
  readonly #projectRoot: string;
  readonly #playerExecutablePath: string;
  readonly #observationRoot: string;

  constructor(options: { projectRoot: string; playerExecutablePath: string }) {
    this.#projectRoot = resolve(options.projectRoot);
    this.#playerExecutablePath = resolve(options.playerExecutablePath);
    this.#observationRoot = join(
      this.#projectRoot,
      '.aigame',
      'local',
      'runtime-observations',
    );
    mkdirSync(this.#observationRoot, { recursive: true });
  }

  captureResult(
    result: ProjectRuntimeResult,
    input: Omit<
      RuntimeObservationCapture,
      | 'snapshot'
      | 'scene'
      | 'audioEvents'
      | 'runtimeDiagnostics'
      | 'tick'
      | 'stateHash'
    >,
  ): RuntimeObservation {
    return this.capture({
      ...input,
      snapshot: result.renderSnapshot,
      scene: result.scene,
      audioEvents: result.audioEvents,
      runtimeDiagnostics: result.debugSnapshot.payload.diagnostics,
      tick: result.tick,
      stateHash: result.stateHash,
    });
  }

  capture(input: RuntimeObservationCapture): RuntimeObservation {
    const rendererExecutablePath = resolve(
      input.rendererExecutablePath ?? this.#playerExecutablePath,
    );
    if (!existsSync(rendererExecutablePath)) {
      throw new ProjectError(
        'RUNTIME_OBSERVATION_RENDERER_MISSING',
        '缺少用于生成可检查帧的通用 Player 渲染器。',
        rendererExecutablePath,
      );
    }
    const viewport: [number, number] = [
      Math.max(1, Math.round(input.viewport?.[0] ?? 1280)),
      Math.max(1, Math.round(input.viewport?.[1] ?? 720)),
    ];
    const stableCheckpoint = checkpointId(input.checkpointId);
    const sessionId = input.sessionId ?? input.snapshot.sessionId;
    const generation = input.generation ?? input.snapshot.generation;
    const tick = input.tick ?? input.snapshot.tick;
    const sceneId = input.snapshot.payload.activeSceneId;
    const identitySeed = [
      input.source,
      sessionId,
      generation,
      sceneId,
      tick,
      stableCheckpoint,
      viewport.join('x'),
      input.stateHash ?? '',
    ].join('|');
    const observationId = stableId('observation', identitySeed);
    const localName = observationId.slice('observation:'.length);
    const snapshotPath = join(
      this.#observationRoot,
      `${localName}.snapshot.json`,
    );
    const framePath = join(this.#observationRoot, `${localName}.png`);
    writeFileSync(snapshotPath, `${JSON.stringify(input.snapshot, null, 2)}\n`);
    const assetRoot = resolve(input.assetRoot ?? this.#projectRoot);
    const rendered = spawnSync(
      rendererExecutablePath,
      [
        '--render-snapshot',
        snapshotPath,
        '--asset-root',
        assetRoot,
        '--output',
        framePath,
        '--width',
        String(viewport[0]),
        '--height',
        String(viewport[1]),
      ],
      {
        cwd: assetRoot,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 30_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    if (rendered.status !== 0 || !existsSync(framePath)) {
      throw new ProjectError(
        'RUNTIME_OBSERVATION_FRAME_FAILED',
        'Player 无法生成运行观察帧。',
        {
          status: rendered.status,
          stdout: rendered.stdout,
          stderr: rendered.stderr,
        },
      );
    }

    const diagnostics: RuntimeObservationDiagnostic[] = [];
    const camera = primaryCamera(input.snapshot);
    const sorted = [...input.snapshot.payload.drawables].sort(
      (left, right) =>
        left.layer - right.layer || left.id.localeCompare(right.id),
    );
    const drawables: RuntimeObservation['drawables'] = sorted.map(
      (drawable, order) => {
        const component = componentFor(input.scene, drawable);
        const componentId = (component?.id ?? drawable.id) as RuntimeSemanticId;
        const expected = expectedResource(component);
        const resource = resourceIdentity(
          drawable.asset ?? drawable.texture,
          assetRoot,
        );
        const resourceBacked = ['sprite2d', 'ui-image', 'mesh3d'].includes(
          drawable.primitive,
        );
        const fallback = resourceBacked && !resource.resolved;
        const bounds = drawableBounds(drawable, camera, viewport);
        const pivot: [number, number] = [
          round(drawable.pivot?.[0] ?? 0.5),
          round(drawable.pivot?.[1] ?? 0.5),
        ];
        const scale: [number, number] = [
          round(drawable.transform2d?.scale[0] ?? 1),
          round(drawable.transform2d?.scale[1] ?? 1),
        ];
        if (fallback) {
          const code =
            resource.failure === 'hash-mismatch'
              ? 'RUNTIME_RESOURCE_HASH_MISMATCH'
              : resource.failure === 'unsafe-path'
                ? 'RUNTIME_RESOURCE_PATH_UNSAFE'
                : 'RUNTIME_RESOURCE_REFERENCE_MISSING';
          diagnostics.push({
            code,
            severity: 'error',
            message:
              resource.failure === 'hash-mismatch'
                ? `资源 ${drawable.asset?.projectPath ?? expected ?? componentId} 的内容哈希与清单不一致。`
                : `可绘制对象 ${drawable.id} 无法解析资源 ${expected ?? '（未声明）'}，观察帧使用洋红回退标记。`,
            tick,
            sceneId,
            objectId: drawable.objectId,
            componentId,
            ...(resource.identity
              ? { assetId: resource.identity.assetId }
              : {}),
            checkpointId: stableCheckpoint,
          });
        }
        if (
          drawable.visible &&
          drawable.space !== '3d' &&
          !intersectsViewport(bounds, viewport)
        ) {
          diagnostics.push({
            code: 'RUNTIME_DRAWABLE_OFFSCREEN',
            severity: 'warning',
            message: `可见对象 ${drawable.id} 位于相机视口之外。`,
            tick,
            sceneId,
            objectId: drawable.objectId,
            componentId,
            checkpointId: stableCheckpoint,
          });
        }
        if (scale.some((value) => Math.abs(value) < 0.000_001)) {
          diagnostics.push({
            code: 'RUNTIME_DRAWABLE_ZERO_SCALE',
            severity: 'error',
            message: `可绘制对象 ${drawable.id} 的缩放为零。`,
            tick,
            sceneId,
            objectId: drawable.objectId,
            componentId,
            checkpointId: stableCheckpoint,
          });
        }
        if (pivot.some((value) => value < 0 || value > 1)) {
          diagnostics.push({
            code: 'RUNTIME_DRAWABLE_PIVOT_OUT_OF_RANGE',
            severity: 'warning',
            message: `可绘制对象 ${drawable.id} 的 pivot 超出 0–1 范围。`,
            tick,
            sceneId,
            objectId: drawable.objectId,
            componentId,
            checkpointId: stableCheckpoint,
          });
        }
        if (
          resource.identity?.projectPath &&
          input.reachableAssetPaths &&
          !input.reachableAssetPaths.has(resource.identity.projectPath)
        ) {
          diagnostics.push({
            code: 'RUNTIME_PACKAGE_RESOURCE_UNREACHABLE',
            severity: 'error',
            message: `资源 ${resource.identity.projectPath} 未进入 Player 可达资源集合。`,
            tick,
            sceneId,
            objectId: drawable.objectId,
            componentId,
            assetId: resource.identity.assetId,
            projectPath: resource.identity.projectPath,
            checkpointId: stableCheckpoint,
          });
        }
        return {
          drawableId: stableId('drawable', drawable.id),
          objectId: drawable.objectId,
          componentId,
          primitive: drawable.primitive,
          visible: drawable.visible,
          layer: round(drawable.layer),
          order,
          bounds,
          pivot,
          scale,
          ...(drawable.atlasRegion
            ? {
                atlasRegion: drawable.atlasRegion.map(round) as [
                  number,
                  number,
                  number,
                  number,
                ],
              }
            : {}),
          ...(drawable.tint
            ? {
                tint: drawable.tint.map(round) as [
                  number,
                  number,
                  number,
                  number,
                ],
              }
            : {}),
          ...(resource.identity ? { resource: resource.identity } : {}),
          fallback,
        };
      },
    );

    for (const target of drawables.filter(
      (drawable) => drawable.visible && drawable.resource && !drawable.fallback,
    )) {
      const targetRight = target.bounds[0] + target.bounds[2];
      const targetBottom = target.bounds[1] + target.bounds[3];
      const covering = drawables.find((candidate) => {
        if (
          !candidate.visible ||
          candidate.layer <= target.layer ||
          candidate.primitive !== 'shape2d' ||
          (candidate.tint?.[3] ?? 1) < 0.98
        ) {
          return false;
        }
        return (
          candidate.bounds[0] <= target.bounds[0] &&
          candidate.bounds[1] <= target.bounds[1] &&
          candidate.bounds[0] + candidate.bounds[2] >= targetRight &&
          candidate.bounds[1] + candidate.bounds[3] >= targetBottom
        );
      });
      if (covering) {
        diagnostics.push({
          code: 'RUNTIME_DRAWABLE_FULLY_OCCLUDED',
          severity: 'error',
          message: `可绘制对象 ${target.componentId} 被更高层 ${covering.componentId} 完全遮挡。`,
          tick,
          sceneId,
          objectId: target.objectId,
          componentId: target.componentId,
          assetId: target.resource?.assetId,
          checkpointId: stableCheckpoint,
        });
      }
    }

    const ui = sorted
      .filter((drawable) => drawable.space === 'ui')
      .map((drawable) => {
        const component = componentFor(input.scene, drawable);
        const componentId = (component?.id ?? drawable.id) as RuntimeSemanticId;
        const bounds = drawableBounds(drawable, camera, viewport);
        const visible = drawable.visible;
        const clipped = visible && isClipped(bounds, viewport);
        const interactive = Boolean(drawable.inputAction);
        const reachable =
          visible &&
          intersectsViewport(bounds, viewport) &&
          bounds[2] > 0 &&
          bounds[3] > 0;
        if (clipped) {
          diagnostics.push({
            code: 'RUNTIME_UI_BOUNDS_OVERFLOW',
            severity: 'warning',
            message: `UI ${drawable.id} 超出 ${viewport[0]}×${viewport[1]} 视口。`,
            tick,
            sceneId,
            objectId: drawable.objectId,
            componentId,
            checkpointId: stableCheckpoint,
          });
        }
        if (visible && interactive && !reachable) {
          diagnostics.push({
            code: 'RUNTIME_UI_TARGET_UNREACHABLE',
            severity: 'error',
            message: `交互目标 ${drawable.inputAction} 在当前检查点不可到达。`,
            tick,
            sceneId,
            objectId: drawable.objectId,
            componentId,
            checkpointId: stableCheckpoint,
          });
        }
        return {
          uiId: stableId('ui', drawable.id),
          objectId: drawable.objectId,
          componentId,
          bounds,
          visible,
          clipped,
          overflow: clipped,
          interactive,
          reachable,
          ...(drawable.inputAction
            ? { inputAction: drawable.inputAction }
            : {}),
        };
      });

    const busMap = new Map(
      (
        input.audioBuses ?? [
          { id: 'audio:bus/master', volume: 1, muted: false },
        ]
      ).map((bus) => [bus.id, bus]),
    );
    const missingClipIds = new Set<RuntimeSemanticId>();
    const failedPlaybackIds = new Set<RuntimeSemanticId>();
    const audioEvents = (input.audioEvents ?? []).map((event) => {
      const eventId = event.payload.eventId as RuntimeSemanticId;
      const clip = resourceIdentity(event.payload.clip, assetRoot);
      if (event.payload.clip && !clip.resolved) {
        missingClipIds.add(event.payload.clip.id);
        failedPlaybackIds.add(eventId);
        diagnostics.push({
          code:
            clip.failure === 'hash-mismatch'
              ? 'RUNTIME_AUDIO_HASH_MISMATCH'
              : 'RUNTIME_AUDIO_CLIP_MISSING',
          severity: 'error',
          message: `音频事件 ${eventId} 无法解析片段 ${event.payload.clip.id}。`,
          tick: event.tick,
          sceneId,
          assetId: event.payload.clip.id,
          checkpointId: stableCheckpoint,
        });
      }
      if (!busMap.has(event.payload.busId)) {
        failedPlaybackIds.add(eventId);
        diagnostics.push({
          code: 'RUNTIME_AUDIO_BUS_UNKNOWN',
          severity: 'error',
          message: `音频事件 ${eventId} 引用了未声明 Bus ${event.payload.busId}。`,
          tick: event.tick,
          sceneId,
          checkpointId: stableCheckpoint,
        });
      }
      const bus = busMap.get(event.payload.busId);
      return {
        eventId,
        action: event.payload.action,
        ...(clip.identity ? { clip: clip.identity } : {}),
        busId: event.payload.busId,
        ...(event.payload.volume === undefined
          ? {}
          : { volume: round(event.payload.volume) }),
        ...(event.payload.muted === undefined && bus === undefined
          ? {}
          : { muted: event.payload.muted ?? bus?.muted ?? false }),
        tick: event.tick,
      };
    });

    for (const diagnostic of input.runtimeDiagnostics ?? []) {
      const referencedAsset =
        /(?:asset|资源)\s*['“]?([a-z][a-z0-9_-]*:[a-z0-9_./-]+)/iu.exec(
          diagnostic.message,
        )?.[1] as RuntimeSemanticId | undefined;
      diagnostics.push({
        code: diagnostic.code,
        severity: diagnostic.severity,
        message: diagnostic.message,
        tick: diagnostic.tick,
        sceneId,
        ...(diagnostic.objectId ? { objectId: diagnostic.objectId } : {}),
        ...(diagnostic.systemId ? { systemId: diagnostic.systemId } : {}),
        ...(diagnostic.moduleId ? { moduleId: diagnostic.moduleId } : {}),
        ...(referencedAsset ? { assetId: referencedAsset } : {}),
        ...(diagnostic.projectPath
          ? { projectPath: diagnostic.projectPath }
          : {}),
        ...(diagnostic.line === undefined ? {} : { line: diagnostic.line }),
        ...(diagnostic.column === undefined
          ? {}
          : { column: diagnostic.column }),
        checkpointId: stableCheckpoint,
      });
    }

    const frame = readFileSync(framePath);
    const observation: RuntimeObservation = {
      schemaVersion: '1.0.0',
      observationId,
      source: input.source,
      sessionId,
      generation: Math.max(1, generation),
      sceneId,
      tick: Math.max(0, tick),
      checkpointId: stableCheckpoint,
      ...(inputLogId(input.inputLogId)
        ? { inputLogId: inputLogId(input.inputLogId) }
        : {}),
      ...(input.stateHash ? { stateHash: input.stateHash } : {}),
      camera: {
        cameraId: camera?.id ?? 'camera:observation-default',
        space: camera?.space ?? '2d',
        projection:
          camera?.space === '3d'
            ? 'perspective'
            : camera?.space === 'ui'
              ? 'screen'
              : 'orthographic',
        viewport,
      },
      frameArtifact: {
        artifactId: stableId('artifact', `${observationId}|frame`),
        path: relative(this.#projectRoot, framePath).replaceAll('\\', '/'),
        mime: 'image/png',
        sha256: sha256(frame),
        width: viewport[0],
        height: viewport[1],
      },
      drawables,
      ui,
      audio: {
        events: audioEvents,
        buses: [...busMap.values()].map((bus) => ({
          busId: bus.id as RuntimeSemanticId,
          volume: round(bus.volume),
          muted: bus.muted,
        })),
        missingClipIds: [...missingClipIds].sort(),
        failedPlaybackIds: [...failedPlaybackIds].sort(),
      },
      diagnostics: diagnostics.sort(
        (left, right) =>
          left.tick - right.tick ||
          left.code.localeCompare(right.code) ||
          (left.objectId ?? '').localeCompare(right.objectId ?? ''),
      ),
      capturedAt: new Date().toISOString(),
    };
    writeFileSync(
      join(this.#observationRoot, `${localName}.json`),
      `${JSON.stringify(observation, null, 2)}\n`,
    );
    return structuredClone(observation);
  }

  read(id: string): RuntimeObservation {
    const normalized = id.replace(/^observation:/u, '');
    if (!/^[a-f0-9]{24}$/u.test(normalized)) {
      throw new ProjectError(
        'RUNTIME_OBSERVATION_ID_INVALID',
        `观察 ID 无效：${id}`,
      );
    }
    const path = join(this.#observationRoot, `${normalized}.json`);
    if (!existsSync(path)) {
      throw new ProjectError(
        'RUNTIME_OBSERVATION_NOT_FOUND',
        `观察不存在：observation:${normalized}`,
      );
    }
    let document: unknown;
    try {
      document = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      throw new ProjectError(
        'RUNTIME_OBSERVATION_DOCUMENT_INVALID',
        `运行观察 JSON 无法读取：observation:${normalized}`,
        error instanceof Error ? error.message : String(error),
      );
    }
    return validateObservationDocument(
      document,
      `observation:${normalized}`,
      this.#projectRoot,
    );
  }

  compare(
    left: RuntimeObservation,
    right: RuntimeObservation,
  ): RuntimeObservationComparison {
    if (left.checkpointId !== right.checkpointId) {
      throw new ProjectError(
        'RUNTIME_OBSERVATION_CHECKPOINT_MISMATCH',
        '只能比较同一 checkpointId 的 Studio 与 Player 观察。',
        { left: left.checkpointId, right: right.checkpointId },
      );
    }
    const mismatches: RuntimeObservationComparison['mismatches'] = [];
    if (left.inputLogId !== right.inputLogId) {
      mismatches.push({
        code: 'RUNTIME_INPUT_LOG_DIVERGED',
        left: left.inputLogId,
        right: right.inputLogId,
      });
    }
    if (left.stateHash !== right.stateHash) {
      mismatches.push({
        code: 'RUNTIME_STATE_HASH_DIVERGED',
        left: left.stateHash,
        right: right.stateHash,
      });
    }
    const leftDrawables = new Map(
      left.drawables.map((drawable) => [drawable.drawableId, drawable]),
    );
    const rightDrawables = new Map(
      right.drawables.map((drawable) => [drawable.drawableId, drawable]),
    );
    for (const id of new Set([
      ...leftDrawables.keys(),
      ...rightDrawables.keys(),
    ])) {
      const leftDrawable = leftDrawables.get(id);
      const rightDrawable = rightDrawables.get(id);
      if (!leftDrawable || !rightDrawable) {
        mismatches.push({
          code: 'RUNTIME_DRAWABLE_IDENTITY_DIVERGED',
          semanticId: id,
          left: Boolean(leftDrawable),
          right: Boolean(rightDrawable),
        });
        continue;
      }
      if (
        JSON.stringify({
          objectId: leftDrawable.objectId,
          componentId: leftDrawable.componentId,
          primitive: leftDrawable.primitive,
          visible: leftDrawable.visible,
          layer: leftDrawable.layer,
          bounds: leftDrawable.bounds,
          fallback: leftDrawable.fallback,
        }) !==
        JSON.stringify({
          objectId: rightDrawable.objectId,
          componentId: rightDrawable.componentId,
          primitive: rightDrawable.primitive,
          visible: rightDrawable.visible,
          layer: rightDrawable.layer,
          bounds: rightDrawable.bounds,
          fallback: rightDrawable.fallback,
        })
      ) {
        mismatches.push({
          code: 'RUNTIME_DRAWABLE_PROJECTION_DIVERGED',
          semanticId: id,
          left: leftDrawable,
          right: rightDrawable,
        });
      }
      if (
        leftDrawable.resource?.assetId !== rightDrawable.resource?.assetId ||
        leftDrawable.resource?.sourceHash !== rightDrawable.resource?.sourceHash
      ) {
        mismatches.push({
          code: 'RUNTIME_RESOURCE_IDENTITY_DIVERGED',
          semanticId: id,
          left: leftDrawable.resource,
          right: rightDrawable.resource,
        });
      }
    }
    const audioIdentity = (observation: RuntimeObservation) =>
      observation.audio.events.map((event) => ({
        eventId: event.eventId,
        action: event.action,
        clip: event.clip?.assetId,
        sourceHash: event.clip?.sourceHash,
        busId: event.busId,
        tick: event.tick,
      }));
    if (
      JSON.stringify(audioIdentity(left)) !==
      JSON.stringify(audioIdentity(right))
    ) {
      mismatches.push({
        code: 'RUNTIME_AUDIO_IDENTITY_DIVERGED',
        left: audioIdentity(left),
        right: audioIdentity(right),
      });
    }
    return {
      schemaVersion: '1.0.0',
      comparisonId: stableId(
        'observation-comparison',
        `${left.observationId}|${right.observationId}`,
      ),
      leftObservationId: left.observationId,
      rightObservationId: right.observationId,
      checkpointId: left.checkpointId,
      stateHashMatches: !mismatches.some(
        (mismatch) => mismatch.code === 'RUNTIME_STATE_HASH_DIVERGED',
      ),
      drawableIdentityMatches: !mismatches.some((mismatch) =>
        mismatch.code.startsWith('RUNTIME_DRAWABLE_'),
      ),
      resourceIdentityMatches: !mismatches.some(
        (mismatch) => mismatch.code === 'RUNTIME_RESOURCE_IDENTITY_DIVERGED',
      ),
      audioIdentityMatches: !mismatches.some(
        (mismatch) => mismatch.code === 'RUNTIME_AUDIO_IDENTITY_DIVERGED',
      ),
      mismatches,
    };
  }
}
