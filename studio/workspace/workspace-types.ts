export type WorkspaceFileKind =
  | 'scene'
  | 'prefab'
  | 'script'
  | 'asset'
  | 'test'
  | 'replay'
  | 'config'
  | 'text';

export type WorkspaceFile = {
  path: string;
  kind: WorkspaceFileKind;
  size: number;
  gitStatus?:
    | 'clean'
    | 'modified'
    | 'added'
    | 'deleted'
    | 'renamed'
    | 'untracked'
    | 'conflicted';
  diagnosticCount?: number;
  aiActivity?: 'none' | 'proposed' | 'approved';
};

export type SceneEntitySummary = {
  id: string;
  name: string;
  enabled?: boolean;
  visible?: boolean;
  locked?: boolean;
  parentId?: string | null;
  order?: number;
  prefab?: string;
  components: Array<Record<string, unknown>>;
};

export type SceneWorldSummary = {
  id: string;
  name: string;
  bounds: { width: number; height: number };
  entities: SceneEntitySummary[];
};

export type WorkspaceHistorySummary = {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  transactionCount: number;
};

export type RuntimeSessionSummary = {
  status: 'stopped' | 'running' | 'paused' | 'completed' | 'failed';
  sessionId?: RuntimeSessionId;
  generation?: number;
  sequence?: number;
  tick: number;
  seed: number;
  activeScene?: string;
  stateHash: string | null;
  durationMs: number | null;
  memoryUsedBytes?: number;
  operations?: number;
  events?: number;
  diagnostics?: Array<{
    code: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    tick: number;
    phase: string;
    systemId: string | null;
    objectId: string | null;
    moduleId: string | null;
    file: string;
    line: number;
    column: number;
  }>;
  timeline?: Array<Record<string, unknown>>;
  systemTrace?: Array<Record<string, unknown>>;
  watches?: Array<{ tick: number; path: string; value?: unknown }>;
  pausedAt?: Record<string, unknown> | null;
  renderSnapshot?: RuntimeRenderSnapshot;
  debugSnapshot?: RuntimeDebugSnapshot;
  audioEvents?: RuntimeAudioEvent[];
  latestObservation?: RuntimeObservation;
};

export type WorkspaceSnapshot = {
  root: string;
  files: WorkspaceFile[];
  entryScene: string;
  scenes?: Array<{
    path: string;
    id: string;
    name: string;
    space: '2d' | '3d' | 'ui' | 'mixed';
    startup: boolean;
  }>;
  activeScene?: string;
  capabilities?: Array<Record<string, unknown>>;
  assets: Array<Record<string, unknown>>;
  inputActions?: Array<{ id: string; bindings: string[] }>;
  audioBuses?: Array<{ id: string; volume: number; muted: boolean }>;
  runtime: RuntimeSessionSummary;
  testRuns?: Record<
    string,
    import('../runtime/runtime-test-reports.ts').RuntimeTestSummary
  >;
  history: WorkspaceHistorySummary;
  commands: string[];
};

export type WorkspaceCommandResult = {
  command: string;
  changed: boolean;
  message: string;
  data?: unknown;
  snapshot: WorkspaceSnapshot;
};

export type StudioDocumentKind =
  | 'overview'
  | 'scene-2d'
  | 'scene-3d'
  | 'game'
  | 'code'
  | 'prefab'
  | 'ui'
  | 'material'
  | 'animation'
  | 'resource'
  | 'diff'
  | 'build-report';

export type DiffReviewPreferences = {
  viewMode: 'auto' | 'side-by-side' | 'inline';
  ignoreTrimWhitespace: boolean;
  wordWrap: boolean;
  hideUnchangedRegions: boolean;
  contextLineCount: 3 | 5 | 10;
};

export type StudioWorkspaceState = {
  schemaVersion: '2.0.0-alpha.1';
  activity:
    | 'explorer'
    | 'search'
    | 'source-control'
    | 'assets'
    | 'tests'
    | 'build'
    | 'extensions'
    | 'settings';
  rightPanel: 'inspector' | 'copilot';
  bottomPanel:
    | 'console'
    | 'problems'
    | 'tests'
    | 'debug'
    | 'tasks'
    | 'profiler'
    | 'event-timeline';
  openDocuments: Array<{
    path: string;
    title: string;
    kind: StudioDocumentKind;
    pinned: boolean;
  }>;
  activeDocument: string | null;
  selectedEntityId: string | null;
  collapsedFolders: string[];
  diffReview?: DiffReviewPreferences;
  layout: {
    leftWidth: number;
    rightWidth: number;
    bottomHeight: number;
    outlineCollapsed: boolean;
    filesCollapsed: boolean;
  };
};
import type {
  RuntimeAudioEvent,
  RuntimeDebugSnapshot,
  RuntimeRenderSnapshot,
  RuntimeSessionId,
} from '../runtime/runtime-session-protocol.ts';
import type { RuntimeObservation } from '../runtime/runtime-observation-service.ts';
