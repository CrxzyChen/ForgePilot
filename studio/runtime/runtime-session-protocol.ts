export const RUNTIME_PROTOCOL_VERSION = '3.0.0-preview.1' as const;

export type RuntimeProtocolVersion = typeof RUNTIME_PROTOCOL_VERSION;
export type RuntimeSessionId = `session:${string}`;
export type RuntimeSemanticId = `${string}:${string}`;
export type RuntimeHash = string;
export type Vector2 = readonly [number, number];
export type Vector3 = readonly [number, number, number];
export type Quaternion = readonly [number, number, number, number];
export type LinearColor = readonly [number, number, number, number];

export type RuntimeSessionState =
  | 'stopped'
  | 'starting'
  | 'playing'
  | 'paused'
  | 'stepping'
  | 'reloading'
  | 'stopping'
  | 'failed';

export type RuntimeEnvelope<TKind extends string, TPayload> = Readonly<{
  protocolVersion: RuntimeProtocolVersion;
  kind: TKind;
  sessionId: RuntimeSessionId;
  generation: number;
  sequence: number;
  tick: number;
  correlationId?: RuntimeSemanticId;
  payload: Readonly<TPayload>;
}>;

export type RuntimeControlAction =
  | 'start'
  | 'pause'
  | 'resume'
  | 'step'
  | 'stop'
  | 'restart'
  | 'reload';

export type RuntimeControlMessage = RuntimeEnvelope<
  'session.control',
  {
    action: RuntimeControlAction;
    seed?: number;
    expectedState?: RuntimeSessionState;
    reloadPolicy?:
      | 'migrate-authoritative'
      | 'restart-authoritative'
      | 'presentation-only';
  }
>;

export type RuntimeStateMessage = RuntimeEnvelope<
  'session.state',
  {
    state: RuntimeSessionState;
    previousState?: RuntimeSessionState;
    projectHash: RuntimeHash;
    activeSceneId: RuntimeSemanticId;
    stateHash: RuntimeHash | null;
    reloadOutcome?: 'not-applicable' | 'migrated' | 'restarted' | 'rejected';
    reason?: string;
  }
>;

export type RuntimeInputValue = boolean | number | Vector2 | Vector3;

export type RuntimeInputActionMessage = RuntimeEnvelope<
  'input.action',
  {
    actionId: RuntimeSemanticId;
    phase: 'pressed' | 'released' | 'value';
    targetTick: number;
    value: RuntimeInputValue;
    source?: 'keyboard' | 'pointer' | 'gamepad' | 'replay' | 'automation';
  }
>;

export type RuntimePhysicsEventMessage = RuntimeEnvelope<
  'physics.event',
  {
    phase: 'enter' | 'stay' | 'exit';
    space: '2d' | '3d';
    objectA: RuntimeSemanticId;
    colliderA: RuntimeSemanticId;
    objectB: RuntimeSemanticId;
    colliderB: RuntimeSemanticId;
    sensor: boolean;
    normal?: Vector2 | Vector3;
    contacts?: readonly (Vector2 | Vector3)[];
    impulse?: number;
  }
>;

export type RuntimeAssetReference = Readonly<{
  id: RuntimeSemanticId;
  kind: 'image' | 'audio' | 'font' | 'mesh' | 'material' | 'shader';
  sourceHash: RuntimeHash;
  derivedHash?: RuntimeHash;
  projectPath: string;
  variant?: string;
}>;

export type RuntimeTransform2D = Readonly<{
  position: Vector2;
  /** Degrees, counter-clockwise in the Y-up world (not radians). */
  rotation: number;
  scale: Vector2;
}>;

export type RuntimeTransform3D = Readonly<{
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
}>;

export type RuntimeCameraProjection = Readonly<{
  id: RuntimeSemanticId;
  space: '2d' | '3d' | 'ui';
  primary: boolean;
  transform2d?: RuntimeTransform2D;
  transform3d?: RuntimeTransform3D;
  orthographicHeight?: number;
  verticalFovRadians?: number;
  near?: number;
  far?: number;
  clearColor?: LinearColor;
}>;

export type RuntimeDrawableProjection = Readonly<{
  id: RuntimeSemanticId;
  objectId: RuntimeSemanticId;
  space: '2d' | '3d' | 'ui';
  primitive:
    | 'sprite2d'
    | 'shape2d'
    | 'text2d'
    | 'mesh3d'
    | 'ui-text'
    | 'ui-image';
  visible: boolean;
  layer: number;
  transform2d?: RuntimeTransform2D;
  transform3d?: RuntimeTransform3D;
  asset?: RuntimeAssetReference;
  material?: RuntimeAssetReference;
  texture?: RuntimeAssetReference;
  tint?: LinearColor;
  text?: string;
  size?: Vector2;
  pivot?: Vector2;
  filter?: 'nearest' | 'linear';
  atlasRegion?: readonly [number, number, number, number];
  inputAction?: string;
}>;

export type RuntimeLightProjection = Readonly<{
  id: RuntimeSemanticId;
  objectId: RuntimeSemanticId;
  kind: 'directional';
  color: LinearColor;
  intensity: number;
  direction?: Vector3;
}>;

export type RuntimeRenderSnapshot = RuntimeEnvelope<
  'render.snapshot',
  {
    activeSceneId: RuntimeSemanticId;
    cameras: readonly RuntimeCameraProjection[];
    drawables: readonly RuntimeDrawableProjection[];
    lights: readonly RuntimeLightProjection[];
    resources: readonly RuntimeAssetReference[];
  }
>;

export type RuntimeAudioEvent = RuntimeEnvelope<
  'audio.event',
  {
    eventId: RuntimeSemanticId;
    action: 'play' | 'stop' | 'pause' | 'resume' | 'set-volume' | 'set-muted';
    busId: RuntimeSemanticId;
    clip?: RuntimeAssetReference;
    instanceId?: RuntimeSemanticId;
    volume?: number;
    loop?: boolean;
    muted?: boolean;
  }
>;

export type RuntimeDiagnostic = Readonly<{
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  tick: number;
  phase?: RuntimeSemanticId;
  systemId?: RuntimeSemanticId;
  moduleId?: RuntimeSemanticId;
  objectId?: RuntimeSemanticId;
  projectPath?: string;
  line?: number;
  column?: number;
}>;

export type RuntimeDebugSnapshot = RuntimeEnvelope<
  'debug.snapshot',
  {
    stateHash: RuntimeHash;
    diagnostics: readonly RuntimeDiagnostic[];
    watches: Readonly<Record<string, unknown>>;
    systemTrace: readonly Readonly<Record<string, unknown>>[];
    budgets: Readonly<{
      memoryBytes: number;
      instructions: number;
      events: number;
    }>;
  }
>;

export type RuntimeSessionMessage =
  | RuntimeControlMessage
  | RuntimeStateMessage
  | RuntimeInputActionMessage
  | RuntimePhysicsEventMessage
  | RuntimeRenderSnapshot
  | RuntimeAudioEvent
  | RuntimeDebugSnapshot;

export const PREVIEW_HOST_PROTOCOL_VERSION = RUNTIME_PROTOCOL_VERSION;

export type PreviewHostId = `preview-host:${string}`;
export type PreviewSurfaceId = `surface:${string}`;
export type PreviewHostMessageKind =
  | 'host.hello'
  | 'host.ready'
  | 'surface.attach'
  | 'surface.resize'
  | 'surface.detach'
  | 'frame.ready'
  | 'frame.ack'
  | 'host.health'
  | 'host.failure'
  | 'host.shutdown';

export type PreviewHostMessage = Readonly<{
  protocolVersion: RuntimeProtocolVersion;
  kind: PreviewHostMessageKind;
  hostId: PreviewHostId;
  sequence: number;
  correlationId?: RuntimeSemanticId;
  payload: Readonly<Record<string, unknown>>;
}>;

export function isRuntimeSessionId(value: string): value is RuntimeSessionId {
  return /^session:[a-z0-9][a-z0-9_-]*$/u.test(value);
}

export function isRuntimeSemanticId(value: string): value is RuntimeSemanticId {
  return /^[a-z][a-z0-9_-]*:[a-z0-9][a-z0-9_./-]*$/u.test(value);
}

export function assertRuntimeSequence(
  previous: Pick<
    RuntimeSessionMessage,
    'sessionId' | 'generation' | 'sequence'
  >,
  next: Pick<RuntimeSessionMessage, 'sessionId' | 'generation' | 'sequence'>,
): void {
  if (
    previous.sessionId !== next.sessionId ||
    previous.generation !== next.generation ||
    next.sequence <= previous.sequence
  ) {
    throw new Error('RUNTIME_PROTOCOL_SEQUENCE_INVALID');
  }
}
