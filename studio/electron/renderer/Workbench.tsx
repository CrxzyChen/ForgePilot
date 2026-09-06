import {
  Bot,
  Box,
  Boxes,
  Braces,
  Bug,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Cpu,
  File,
  FileCode2,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  GitBranch,
  Image,
  Inspect,
  Lock,
  Unlock,
  Layers3,
  ListChecks,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pause,
  Play,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  TestTube2,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { CopilotTranscript } from './CopilotTranscript';
import { CopilotProgressCard } from './CopilotProgressCard';
import { CopilotActivityRow, CopilotExecutionStatus } from './CopilotActivity';

import type { ProjectSummary } from '../../project/project-types.ts';
import type {
  DiffReviewPreferences,
  SceneWorldSummary,
  StudioDocumentKind,
  StudioWorkspaceState,
  WorkspaceFile,
  WorkspaceSnapshot,
} from '../../workspace/workspace-types.ts';
import type {
  CodexStudioState,
  CodexTurnMode,
} from '../codex-process-manager.ts';
import type { IpcResult } from '../contracts.ts';
import type { StudioSettingsSnapshot } from '../../settings/studio-settings-service.ts';
import type { CredentialSummary } from '../../settings/credential-vault-service.ts';
import type { CredentialProviderDefinition } from '../../settings/credential-provider-definitions.ts';
import { generationToolAdapterReady } from './generation-tool-readiness.ts';
import {
  copilotPlanPresentation,
  copilotTurnStatusLabels,
  completionWaitLabels,
} from './copilot-plan-presentation.ts';
import {
  AssetPanelRequests,
  pollAfterCompletion,
} from './asset-panel-requests.ts';
import type {
  ProviderModelCatalog,
  ProviderModelDescriptor,
} from '../../settings/provider-model-catalog-service.ts';
import type {
  AssetGenerationCapability,
  AssetProviderHealth,
  StudioAssetJob,
} from '../../workspace/studio-asset-job-broker.ts';
import type {
  ProjectReferenceIndex,
  ProjectSearchMatch,
} from '../../workspace/studio-language-service.ts';
import type { StudioChangeSet } from '../../workspace/studio-change-set-service.ts';
import type {
  PrefabDocument,
  SceneDocument,
} from '../../workspace/scene-authoring-service.ts';
import type {
  ComponentDescriptor,
  ComponentField,
} from '../../capabilities/capability-registry.ts';
import { WindowControls } from './WindowControls.tsx';
import {
  DiffEditor,
  SourceEditor,
  type DiffReviewAction,
  type EditorDiagnostic,
} from './SourceEditor.tsx';
import { EngineViewport } from './EngineViewport.tsx';
import { ChangeSetReviewDialog } from './ChangeSetReviewDialog.tsx';
import {
  applySceneTransformPreview,
  sceneTransformDeltaFromPointer,
  type SceneTransformPreview,
} from './scene-transform-preview.ts';

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
import { projectSceneToRenderSnapshot } from '../../runtime/runtime-projection.ts';

type GenerationToolId =
  | 'image'
  | 'video'
  | 'soundEffect'
  | 'music'
  | 'speechRecognition'
  | 'speechGeneration';

type GenerationToolDefinition = {
  id: GenerationToolId;
  label: string;
  description: string;
  modelKind: AssetGenerationCapability | null;
};

type AssetJobView = 'review' | 'active' | 'attention' | 'imported' | 'all';

const assetJobViews: Array<{ id: AssetJobView; label: string }> = [
  { id: 'review', label: '待审核' },
  { id: 'active', label: '进行中' },
  { id: 'attention', label: '需处理' },
  { id: 'imported', label: '已导入' },
  { id: 'all', label: '全部' },
];

function assetJobMatchesView(job: StudioAssetJob, view: AssetJobView): boolean {
  if (view === 'all') return true;
  if (view === 'review')
    return ['awaitingReview', 'awaitingImportApproval'].includes(job.status);
  if (view === 'active')
    return ['queued', 'awaitingApproval', 'running'].includes(job.status);
  if (view === 'attention')
    return ['failed', 'cancelled', 'rejected'].includes(job.status);
  return job.status === 'imported';
}

const generationTools: GenerationToolDefinition[] = [
  {
    id: 'image',
    label: '图片生成',
    description: '角色、场景、贴图与 UI 素材。',
    modelKind: 'image',
  },
  {
    id: 'video',
    label: '视频生成',
    description: '过场动画、宣传片段与动态素材。',
    modelKind: null,
  },
  {
    id: 'soundEffect',
    label: '音效生成',
    description: '射击、碰撞、爆炸、UI 与环境音效。',
    modelKind: 'soundEffect',
  },
  {
    id: 'music',
    label: '音乐生成',
    description: '背景音乐、循环乐段与氛围音乐。',
    modelKind: 'music',
  },
  {
    id: 'speechRecognition',
    label: '语音识别',
    description: '将语音转为文本或时间轴。',
    modelKind: null,
  },
  {
    id: 'speechGeneration',
    label: '语音生成',
    description: '角色台词、旁白与系统播报。',
    modelKind: 'speechGeneration',
  },
];

function providerDisplayName(providerId: string): string {
  if (providerId === 'openai') return 'OpenAI';
  if (providerId === 'aliyun-bailian') return '阿里云百炼';
  if (providerId === 'elevenlabs') return 'ElevenLabs';
  if (providerId === 'local-placeholder') return '本地测试';
  return providerId;
}

function providerCatalogModels(
  catalog: ProviderModelCatalog | undefined,
  providerId: string,
  credentialId: string,
  capability: GenerationToolId,
): ProviderModelDescriptor[] {
  if (
    !catalog ||
    catalog.source !== 'provider-api' ||
    catalog.providerId !== providerId ||
    catalog.credentialId !== credentialId
  )
    return [];
  return catalog.models.filter((model) =>
    model.capabilities.includes(capability),
  );
}

function providerCatalogTime(fetchedAt: string): string {
  const value = new Date(fetchedAt);
  return Number.isNaN(value.valueOf())
    ? fetchedAt
    : value.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
}

type Props = {
  project: ProjectSummary;
  initialWorkspace: WorkspaceSnapshot;
  codex: CodexStudioState | null;
  onClose: () => Promise<void>;
  onError: (message: string | null) => void;
};

type Activity = StudioWorkspaceState['activity'];
type RightPanel = StudioWorkspaceState['rightPanel'];
type BottomPanel = StudioWorkspaceState['bottomPanel'];
type DocumentTab = StudioWorkspaceState['openDocuments'][number];
type EditorBuffer = {
  source: string;
  savedSource: string;
  baseHash: string;
  externalConflict?: boolean;
  externalSource?: string;
  externalHash?: string;
};
type SceneTool = 'select' | 'move' | 'rotate' | 'scale';
type TextPromptState = {
  title: string;
  label: string;
  value: string;
  multiline: boolean;
  confirmLabel: string;
};
type PopupPosition = {
  x: number;
  y: number;
};
type DocumentTabMenuState = PopupPosition & {
  path: string;
};
const defaultDiffReviewPreferences: DiffReviewPreferences = {
  viewMode: 'auto',
  ignoreTrimWhitespace: false,
  wordWrap: false,
  hideUnchangedRegions: true,
  contextLineCount: 3,
};
type TreeNode = {
  name: string;
  path: string;
  children: TreeNode[];
  file?: WorkspaceFile;
};
type GitDecorationStatus = NonNullable<WorkspaceFile['gitStatus']> | 'mixed';

const gitDecoration = {
  clean: { label: '无更改', badge: '' },
  modified: { label: '已修改', badge: 'M' },
  added: { label: '已新增', badge: 'A' },
  deleted: { label: '已删除', badge: 'D' },
  renamed: { label: '已重命名', badge: 'R' },
  untracked: { label: '未跟踪', badge: 'U' },
  conflicted: { label: '存在冲突', badge: '!' },
  mixed: { label: '包含多种更改', badge: '' },
} satisfies Record<GitDecorationStatus, { label: string; badge: string }>;

const activityItems: Array<{
  id: Activity;
  label: string;
  icon: typeof FolderOpen;
}> = [
  { id: 'explorer', label: '资源管理器', icon: FolderOpen },
  { id: 'search', label: '搜索', icon: Search },
  { id: 'source-control', label: '源代码管理', icon: GitBranch },
  { id: 'assets', label: '资源', icon: Image },
  { id: 'tests', label: '测试', icon: TestTube2 },
  { id: 'build', label: '构建', icon: Wrench },
  { id: 'extensions', label: '扩展与能力', icon: Boxes },
  { id: 'settings', label: '设置', icon: Settings },
];

const bottomItems: Array<{ id: BottomPanel; label: string }> = [
  { id: 'console', label: '控制台' },
  { id: 'problems', label: '问题' },
  { id: 'tests', label: '测试' },
  { id: 'debug', label: '调试' },
  { id: 'tasks', label: '任务输出' },
  { id: 'profiler', label: '性能' },
  { id: 'event-timeline', label: '事件时间线' },
];

const goalStatusLabels: Record<string, string> = {
  active: '执行中',
  paused: '已停止',
  blocked: '受阻',
  usageLimited: '用量受限',
  budgetLimited: '预算用尽',
  complete: '已完成',
};

const completionRunStatusLabels: Record<string, string> = {
  planned: '已规划',
  running: '运行中',
  waiting: '等待人工或外部结果',
  paused: '已暂停',
  stopping: '正在停止',
  stopped: '已停止并保留证据',
  succeeded: '已完成',
  failed: '已失败',
};

const planStatusLabels: Record<string, string> = {
  pending: '待执行',
  inProgress: '当前步骤',
  completed: '已完成',
};

const changeSetStatusLabels = {
  awaitingApproval: '待批准',
  approved: '已批准',
  applied: '已应用',
  tested: '已测试',
  failed: '失败',
  rolledBack: '已回滚',
  rejected: '已拒绝',
} satisfies Record<StudioChangeSet['status'], string>;

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok)
    throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}

function documentKind(file: WorkspaceFile): StudioDocumentKind {
  if (file.kind === 'scene') return 'scene-2d';
  if (file.kind === 'prefab') return 'prefab';
  if (file.kind === 'asset') return 'resource';
  if (file.path.endsWith('.material.json')) return 'material';
  if (file.path.endsWith('.animation.json')) return 'animation';
  if (file.path.endsWith('.wgsl')) return 'material';
  if (file.kind === 'script' || /\.(?:json|md|toml|txt|ts)$/u.test(file.path))
    return 'code';
  return 'code';
}

function sceneWorld(scene: SceneDocument): SceneWorldSummary {
  return {
    id: scene.id,
    name: scene.name,
    bounds: { width: 32, height: 18 },
    entities: scene.objects.map((object) => ({
      id: object.id,
      name: object.name,
      enabled: object.enabled,
      visible: object.visible ?? true,
      locked: object.locked ?? false,
      parentId: object.parentId,
      order: object.order,
      prefab: object.prefab,
      components: object.components.map((component) => ({
        id: component.id,
        type: component.type,
        enabled: component.enabled,
        ...component.data,
      })),
    })),
  };
}

function fileIcon(file: WorkspaceFile) {
  if (file.kind === 'scene') return Layers3;
  if (file.kind === 'script') return FileCode2;
  if (file.kind === 'prefab') return Box;
  if (file.kind === 'asset') return Image;
  if (file.kind === 'test') return TestTube2;
  return File;
}

function buildTree(files: WorkspaceFile[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', children: [] };
  for (const file of files) {
    let parent = root;
    const segments = file.path.split('/');
    segments.forEach((segment, index) => {
      const path = segments.slice(0, index + 1).join('/');
      let node = parent.children.find(
        (candidate) => candidate.name === segment,
      );
      if (!node) {
        node = { name: segment, path, children: [] };
        parent.children.push(node);
      }
      if (index === segments.length - 1) node.file = file;
      parent = node;
    });
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((left, right) => {
      const leftFolder = left.children.length > 0 ? 0 : 1;
      const rightFolder = right.children.length > 0 ? 0 : 1;
      return leftFolder - rightFolder || left.name.localeCompare(right.name);
    });
    nodes.forEach((node) => sort(node.children));
  };
  sort(root.children);
  return root.children;
}

function treeGitStatus(node: TreeNode): GitDecorationStatus {
  if (node.file) return node.file.gitStatus ?? 'clean';
  const changed = new Set(
    node.children
      .map((child) => treeGitStatus(child))
      .filter((status) => status !== 'clean'),
  );
  if (changed.size === 0) return 'clean';
  return changed.size === 1
    ? (changed.values().next().value ?? 'clean')
    : 'mixed';
}

function componentDescriptor(
  descriptors: ComponentDescriptor[],
  type: unknown,
): ComponentDescriptor | undefined {
  return descriptors.find((descriptor) => descriptor.type === String(type));
}

function componentValue(
  component: Record<string, unknown>,
  field: string,
): unknown {
  const data = component.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return (data as Record<string, unknown>)[field];
  }
  return component[field];
}

function displayValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return `${value}`;
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}

function inputText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return value === null || value === undefined ? '' : JSON.stringify(value);
}

export function Workbench({
  project,
  initialWorkspace,
  codex,
  onClose,
  onError,
}: Props) {
  const initialSpace = initialWorkspace.scenes?.find(
    (scene) => scene.path === initialWorkspace.entryScene,
  )?.space;
  const defaultDocuments: DocumentTab[] = [
    {
      path: 'studio://overview',
      title: '项目概览',
      kind: 'overview',
      pinned: true,
    },
    {
      path: initialWorkspace.entryScene,
      title: initialWorkspace.entryScene.split('/').at(-1) ?? 'Scene',
      kind:
        initialSpace === '3d'
          ? 'scene-3d'
          : initialSpace === 'ui'
            ? 'ui'
            : 'scene-2d',
      pinned: false,
    },
  ];
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [activity, setActivity] = useState<Activity>('explorer');
  const [rightPanel, setRightPanel] = useState<RightPanel>('inspector');
  const [bottomPanel, setBottomPanel] = useState<BottomPanel>('console');
  const [documents, setDocuments] = useState<DocumentTab[]>(defaultDocuments);
  const [activeDocument, setActiveDocument] = useState<string | null>(
    defaultDocuments[0]!.path,
  );
  const [buffers, setBuffers] = useState<Record<string, EditorBuffer>>({});
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [sceneTool, setSceneTool] = useState<SceneTool>('select');
  const [sceneTransformPreview, setSceneTransformPreview] =
    useState<SceneTransformPreview | null>(null);
  const [sceneTransformCommitCount, setSceneTransformCommitCount] = useState(0);
  const [collapsedFolders, setCollapsedFolders] = useState<string[]>([]);
  const [consoleLines, setConsoleLines] = useState<string[]>([
    `[studio] 已打开 ${project.manifest.name}`,
    `[project] ${project.root}`,
  ]);
  const [busy, setBusy] = useState(false);
  const [changeReview, setChangeReview] = useState<StudioChangeSet | null>(
    null,
  );
  const [buildActive, setBuildActive] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [searchResults, setSearchResults] = useState<ProjectSearchMatch[]>([]);
  const [copilotPrompt, setCopilotPrompt] = useState('');
  const [copilotMode, setCopilotMode] = useState<CodexTurnMode>('agent');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [showCopilotSettings, setShowCopilotSettings] = useState(false);
  const [goalDraft, setGoalDraft] = useState('');
  const [goalBudget, setGoalBudget] = useState('');
  const [settingsScope, setSettingsScope] = useState<
    'studio' | 'project' | 'agent' | 'ai-tools'
  >('studio');
  const [settings, setSettings] = useState<StudioSettingsSnapshot | null>(null);
  const [studioPreferences, setStudioPreferences] = useState<
    Record<string, unknown>
  >({
    locale: 'zh-CN',
    autosave: 'off',
  });
  const [agentPreferences, setAgentPreferences] = useState<
    Record<string, unknown>
  >({
    defaultMode: 'agent',
    contextScope: 'project',
  });
  const [aiToolPreferences, setAiToolPreferences] = useState<
    Record<string, unknown>
  >({
    mcpEnabled: true,
    projectSkillsEnabled: true,
  });
  const [credentials, setCredentials] = useState<CredentialSummary[]>([]);
  const [credentialProviders, setCredentialProviders] = useState<
    CredentialProviderDefinition[]
  >([]);
  const [showCredentialManager, setShowCredentialManager] = useState(false);
  const [credentialDraft, setCredentialDraft] = useState({
    provider: '',
    label: '',
    fields: {} as Record<string, string>,
  });
  const [modelCatalogs, setModelCatalogs] = useState<
    Record<string, ProviderModelCatalog>
  >({});
  const [modelCatalogLoading, setModelCatalogLoading] = useState<string[]>([]);
  const [modelCatalogErrors, setModelCatalogErrors] = useState<
    Record<string, string>
  >({});
  const [manualGenerationModels, setManualGenerationModels] = useState<
    Partial<Record<GenerationToolId, boolean>>
  >({});
  const manualGenerationModelsRef = useRef<
    Partial<Record<GenerationToolId, boolean>>
  >({});
  const [assetJobManualModel, setAssetJobManualModel] = useState(false);
  const assetJobManualModelRef = useRef(false);
  const [leftWidth, setLeftWidth] = useState(244);
  const [rightWidth, setRightWidth] = useState(310);
  const [bottomHeight, setBottomHeight] = useState(190);
  const [outlineCollapsed, setOutlineCollapsed] = useState(false);
  const [filesCollapsed, setFilesCollapsed] = useState(false);
  const [diffReviewPreferences, setDiffReviewPreferences] =
    useState<DiffReviewPreferences>(defaultDiffReviewPreferences);
  const [resizeTarget, setResizeTarget] = useState<
    'left' | 'right' | 'bottom' | null
  >(null);
  const resizeTargetRef = useRef<'left' | 'right' | 'bottom' | null>(null);
  const resizeValuesRef = useRef({ leftWidth, rightWidth, bottomHeight });
  const workspaceRef = useRef<HTMLDivElement>(null);
  const sceneTransformCommitQueues = useRef(new Map<string, Promise<void>>());
  const [fileMenu, setFileMenu] = useState<{
    path: string;
    x: number;
    y: number;
  } | null>(null);
  const [documentTabMenu, setDocumentTabMenu] =
    useState<DocumentTabMenuState | null>(null);
  const [textPrompt, setTextPrompt] = useState<TextPromptState | null>(null);
  const textPromptResolver = useRef<((value: string | null) => void) | null>(
    null,
  );
  const [mainMenu, setMainMenu] = useState<
    'file' | 'edit' | 'view' | 'project' | 'run' | null
  >(null);
  const [mainMenuPosition, setMainMenuPosition] = useState<PopupPosition>({
    x: 0,
    y: 38,
  });
  const [testRuns, setTestRuns] = useState<
    Record<
      string,
      {
        status: 'idle' | 'running' | 'passed' | 'failed';
        baseResult: string | undefined;
        durationMs?: number;
        tick?: number;
        error?: string;
      }
    >
  >({});
  const currentTestRun = (path: string) => {
    const local = testRuns[path];
    const durable = workspace.testRuns?.[path];
    return local &&
      (local.status === 'running' ||
        !durable ||
        `${durable.testRunId}:${durable.completedAt}` === local.baseResult)
      ? local
      : (durable ?? local);
  };
  const testStatusLabel = (status?: string) =>
    ({
      running: '运行中',
      passed: '上次通过',
      failed: '上次失败',
      unavailable: '历史不可用',
    })[status ?? ''] ?? '暂无记录';
  const [gitWorkspace, setGitWorkspace] = useState<{
    branch: string;
    history: Array<{
      commit?: string;
      author?: string;
      date?: string;
      subject?: string;
    }>;
    branches: string[];
    remotes: Array<{ name?: string; url?: string; direction?: string }>;
    stashes: Array<{ ref?: string; subject?: string }>;
  }>({ branch: '', history: [], branches: [], remotes: [], stashes: [] });
  const [commitMessage, setCommitMessage] = useState('');
  const [editorDiagnostics, setEditorDiagnostics] = useState<
    Record<string, EditorDiagnostic[]>
  >({});
  const [editorNavigation, setEditorNavigation] = useState<{
    path: string;
    line: number;
    column: number;
    nonce: number;
  } | null>(null);
  const [diffs, setDiffs] = useState<
    Record<
      string,
      {
        path: string;
        before: string;
        after: string;
        source: 'git' | 'changeset';
        context?: string;
        originalLabel: string;
        modifiedLabel: string;
        gitStatus?: WorkspaceFile['gitStatus'];
        tracked?: boolean;
        staged?: boolean;
        unstaged?: boolean;
        changeSetId?: string;
      }
    >
  >({});
  const [diffRestoreErrors, setDiffRestoreErrors] = useState<
    Record<string, string>
  >({});
  const diffRestoreInFlight = useRef(new Set<string>());
  const audioInstancesRef = useRef(
    new Map<
      string,
      { element: HTMLAudioElement; busId: string; baseVolume: number }
    >(),
  );
  const audioBusesRef = useRef(
    new Map([['audio:bus/master', { volume: 1, muted: false }]]),
  );
  const processedAudioEventsRef = useRef(new Set<string>());
  const [changeSets, setChangeSets] = useState<StudioChangeSet[]>([]);
  const [buildReports, setBuildReports] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [packageFeedback, setPackageFeedback] = useState({
    status: 'idle',
    text: '先构建，再验证已有 ZIP；验证不会自动重建。',
  });
  const [sceneDocuments, setSceneDocuments] = useState<
    Record<string, SceneDocument>
  >({});
  const [assetJobs, setAssetJobs] = useState<StudioAssetJob[]>([]);
  const [assetJobView, setAssetJobView] = useState<AssetJobView>('review');
  const [assetProviders, setAssetProviders] = useState<AssetProviderHealth[]>(
    [],
  );
  const [assetRoutes, setAssetRoutes] = useState<
    Partial<
      Record<
        GenerationToolId,
        { providerId: string; credentialRef?: string; modelId: string }
      >
    >
  >({
    image: { providerId: 'openai', modelId: 'gpt-image-2' },
    speechGeneration: {
      providerId: 'aliyun-bailian',
      modelId: 'qwen-audio-3.0-tts-flash',
    },
  });
  const [assetCandidatePreviews, setAssetCandidatePreviews] = useState<
    Record<string, string>
  >({});
  const assetPanelRequests = useRef<AssetPanelRequests | null>(null);
  useEffect(() => {
    const requests = new AssetPanelRequests(
      async (jobId, candidateId) =>
        unwrap(
          await window.aiGameStudio.workspace.assetJobs.preview(
            jobId,
            candidateId,
          ),
        ).dataUrl,
      setAssetCandidatePreviews,
    );
    assetPanelRequests.current = requests;
    return () => {
      requests.dispose();
      assetPanelRequests.current = null;
    };
  }, []);
  const [assetJobDraft, setAssetJobDraft] = useState({
    kind: 'image' as AssetGenerationCapability,
    providerId: 'local-placeholder',
    credentialRef: '',
    modelId: 'deterministic-image',
    parameters: {} as Record<string, string | number | boolean>,
    prompt: '',
    outputName: 'generated-asset.png',
    variants: 2,
  });
  const [animationPlayhead, setAnimationPlayhead] = useState(0);
  const [selectedPrefabObjectId, setSelectedPrefabObjectId] = useState<
    string | null
  >(null);
  const [prefabOverrideResult, setPrefabOverrideResult] = useState<{
    key: string;
    overrides: Array<{ field: string; source: unknown; instance: unknown }>;
  }>({ key: '', overrides: [] });

  const [assetPreviews, setAssetPreviews] = useState<Record<string, string>>(
    {},
  );
  const [resourceDependencies, setResourceDependencies] = useState<
    Record<string, { referencedBy: string[]; references: string[] }>
  >({});
  const [missingResources, setMissingResources] = useState<
    Array<{ path: string; referencedBy: string[] }>
  >([]);
  const [referenceIndex, setReferenceIndex] =
    useState<ProjectReferenceIndex | null>(null);

  const requestText = (
    title: string,
    initialValue = '',
    options: {
      label?: string;
      multiline?: boolean;
      confirmLabel?: string;
    } = {},
  ) =>
    new Promise<string | null>((resolve) => {
      textPromptResolver.current?.(null);
      textPromptResolver.current = resolve;
      setTextPrompt({
        title,
        label: options.label ?? title,
        value: initialValue,
        multiline: options.multiline ?? false,
        confirmLabel: options.confirmLabel ?? '确定',
      });
    });

  const resolveTextPrompt = (value: string | null) => {
    const resolve = textPromptResolver.current;
    textPromptResolver.current = null;
    setTextPrompt(null);
    resolve?.(value);
  };

  useEffect(
    () => () => {
      textPromptResolver.current?.(null);
      textPromptResolver.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!resizeTargetRef.current)
      resizeValuesRef.current = { leftWidth, rightWidth, bottomHeight };
  }, [leftWidth, rightWidth, bottomHeight]);

  const tree = useMemo(() => buildTree(workspace.files), [workspace.files]);
  const activeTab =
    documents.find((document) => document.path === activeDocument) ?? null;
  const activeBuffer = activeTab ? buffers[activeTab.path] : undefined;
  const activeFile = activeTab
    ? workspace.files.find((file) => file.path === activeTab.path)
    : undefined;
  const runtimeDiagnostics = workspace.runtime.diagnostics ?? [];
  const dirtyPaths = Object.entries(buffers)
    .filter(([, buffer]) => buffer.source !== buffer.savedSource)
    .map(([path]) => path);
  const activeSceneDocument = activeTab
    ? sceneDocuments[activeTab.path]
    : undefined;
  const activeWorld = activeSceneDocument
    ? sceneWorld(activeSceneDocument)
    : undefined;
  const previewedSceneDocument = useMemo(
    () =>
      activeSceneDocument &&
      sceneTransformPreview?.scenePath === activeTab?.path
        ? applySceneTransformPreview(activeSceneDocument, sceneTransformPreview)
        : activeSceneDocument,
    [activeSceneDocument, activeTab?.path, sceneTransformPreview],
  );
  const activeSceneProjection = useMemo(
    () =>
      previewedSceneDocument
        ? projectSceneToRenderSnapshot({
            scene: previewedSceneDocument,
            assets: workspace.assets,
          })
        : null,
    [previewedSceneDocument, workspace.assets],
  );
  const projectedAssetPaths = useMemo(
    () =>
      [
        ...(activeSceneProjection?.payload.resources ?? []),
        ...(workspace.runtime.renderSnapshot?.payload.resources ?? []),
        ...(workspace.runtime.audioEvents ?? []).flatMap((event) =>
          event.payload.clip ? [event.payload.clip] : [],
        ),
      ]
        .map((resource) => resource.projectPath)
        .filter((path, index, values) => values.indexOf(path) === index),
    [
      activeSceneProjection,
      workspace.runtime.audioEvents,
      workspace.runtime.renderSnapshot,
    ],
  );
  const selectedEntity = activeWorld?.entities.find(
    (entity) => entity.id === selectedEntityId,
  );
  const prefabOverrideKey =
    activeTab?.kind.startsWith('scene') && selectedEntity?.prefab
      ? `${activeTab.path}:${selectedEntity.id}:${selectedEntity.prefab}`
      : '';
  const prefabOverrides =
    prefabOverrideResult.key === prefabOverrideKey
      ? prefabOverrideResult.overrides
      : [];
  const selectedReferenceSymbols = useMemo(() => {
    if (!referenceIndex || !selectedEntityId) return [];
    const reached = new Set([`object:${selectedEntityId}`]);
    for (let depth = 0; depth < 4; depth += 1) {
      for (const reference of referenceIndex.references) {
        if (reached.has(reference.from)) reached.add(reference.to);
        if (reached.has(reference.to)) reached.add(reference.from);
      }
    }
    return referenceIndex.symbols.filter(
      (symbol) => symbol.id !== selectedEntityId && reached.has(symbol.key),
    );
  }, [referenceIndex, selectedEntityId]);
  const componentTypes = (workspace.capabilities ?? []).flatMap(
    (capability) => (capability.components ?? []) as ComponentDescriptor[],
  );
  const activePrefab = (() => {
    if (activeTab?.kind !== 'prefab' || !activeBuffer) return null;
    try {
      const value = JSON.parse(activeBuffer.source) as PrefabDocument;
      return Array.isArray(value.objects) ? value : null;
    } catch {
      return null;
    }
  })();
  const activeMaterial = (() => {
    if (activeTab?.kind !== 'material' || !activeBuffer) return null;
    try {
      const value = JSON.parse(activeBuffer.source) as Record<string, unknown>;
      return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
    } catch {
      return null;
    }
  })();
  const activeAnimation = (() => {
    if (activeTab?.kind !== 'animation' || !activeBuffer) return null;
    try {
      const value = JSON.parse(activeBuffer.source) as Record<string, unknown>;
      return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
    } catch {
      return null;
    }
  })();
  const settingString = (key: string, fallback: string) => {
    const value = settings?.values[key];
    return typeof value === 'string' ? value : fallback;
  };

  const updateStructuredDocument = (patch: Record<string, unknown>) => {
    if (!activeTab || !activeBuffer) return;
    try {
      const document = JSON.parse(activeBuffer.source) as Record<
        string,
        unknown
      >;
      const source = `${JSON.stringify({ ...document, ...patch }, null, 2)}\n`;
      setBuffers((current) => ({
        ...current,
        [activeTab.path]: { ...activeBuffer, source },
      }));
    } catch {
      onError('先修复 JSON 语法，才能使用可视化编辑器。');
    }
  };

  const appendConsole = (line: string) =>
    setConsoleLines((current) => [...current.slice(-199), line]);

  const selectEntity = (id: string | null, additive = false) => {
    if (!id) {
      if (!additive) {
        setSelectedEntityIds([]);
        setSelectedEntityId(null);
      }
      return;
    }
    setSelectedEntityIds((current) =>
      additive
        ? current.includes(id)
          ? current.filter((candidate) => candidate !== id)
          : [...current, id]
        : [id],
    );
    setSelectedEntityId(id);
    setRightPanel('inspector');
  };

  const guarded = async (operation: () => Promise<void>) => {
    setBusy(true);
    onError(null);
    try {
      await operation();
    } catch (reason) {
      const message = String(reason);
      onError(message);
      appendConsole(`[error] ${message}`);
      setBottomPanel('problems');
    } finally {
      setBusy(false);
    }
  };

  const execute = async (
    command: string,
    input: Record<string, unknown> = {},
  ) => {
    const result = unwrap(
      await window.aiGameStudio.workspace.execute(command, input),
    );
    setWorkspace(result.snapshot);
    appendConsole(
      `[${result.changed ? 'change' : 'command'}] ${result.message}`,
    );
    return result;
  };

  const loadSceneDocument = async (path: string) => {
    const value = unwrap(await window.aiGameStudio.workspace.readText(path));
    const scene = JSON.parse(value.source) as SceneDocument;
    setSceneDocuments((current) => ({ ...current, [path]: scene }));
    return scene;
  };

  const runAuthoring = async (
    command: string,
    input: Record<string, unknown> = {},
  ) => {
    const scene =
      typeof input.scene === 'string'
        ? input.scene
        : activeTab?.kind.startsWith('scene')
          ? activeTab.path
          : (workspace.activeScene ?? workspace.entryScene);
    const result = await execute(command, { ...input, scene });
    if (result.snapshot.files.some((file) => file.path === scene)) {
      await loadSceneDocument(scene);
    }
    return result;
  };

  const queueSceneTransformCommit = (
    scenePath: string,
    objectId: string,
    tool: Exclude<SceneTool, 'select'>,
    delta: SceneTransformPreview['delta'],
  ) => {
    const previous =
      sceneTransformCommitQueues.current.get(scenePath) ?? Promise.resolve();
    setSceneTransformCommitCount((count) => count + 1);
    const commit = previous
      .catch(() => undefined)
      .then(async () => {
        const result = await execute(`scene.transform.${tool}`, {
          scene: scenePath,
          objectId,
          delta,
        });
        if (
          sceneTransformCommitQueues.current.get(scenePath) === commit &&
          result.snapshot.files.some((file) => file.path === scenePath)
        ) {
          await loadSceneDocument(scenePath);
        }
      })
      .catch(async (reason: unknown) => {
        const message = String(reason);
        onError(message);
        appendConsole(`[error] ${message}`);
        setBottomPanel('problems');
        if (sceneTransformCommitQueues.current.get(scenePath) === commit) {
          await loadSceneDocument(scenePath).catch(() => undefined);
        }
      })
      .finally(() => {
        setSceneTransformCommitCount((count) => Math.max(0, count - 1));
        if (sceneTransformCommitQueues.current.get(scenePath) === commit) {
          sceneTransformCommitQueues.current.delete(scenePath);
        }
      });
    sceneTransformCommitQueues.current.set(scenePath, commit);
    return commit;
  };

  const createScene = () =>
    void guarded(async () => {
      const name = await requestText('新建 Scene', 'New Scene', {
        label: 'Scene 名称',
        confirmLabel: '下一步',
      });
      if (!name?.trim()) return;
      const normalizedName = name.trim();
      const suggested = `scenes/${normalizedName.toLowerCase().replace(/[^a-z0-9_-]+/gu, '-') || 'scene'}.scene.json`;
      const path = await requestText('新建 Scene', suggested, {
        label: 'Scene 项目相对路径',
        confirmLabel: '创建',
      });
      if (!path?.trim()) return;
      const normalizedPath = path.trim();
      const defaultSpace = project.manifest.capabilities.includes('3d')
        ? '3d'
        : project.manifest.capabilities.includes('2d')
          ? '2d'
          : 'mixed';
      const result = await runAuthoring('scene.create', {
        path: normalizedPath,
        name: normalizedName,
        space: defaultSpace,
      });
      const file = result.snapshot.files.find(
        (candidate) => candidate.path === normalizedPath,
      );
      if (file) await openFile(file);
    });

  const addSceneObject = () =>
    void guarded(async () => {
      if (!activeTab?.kind.startsWith('scene')) {
        throw new Error('请先打开一个 Scene，再添加对象。');
      }
      const existingNames = new Set(
        (activeWorld?.entities ?? []).map((entity) => entity.name),
      );
      let suggestedName = 'Game Object';
      let suffix = 2;
      while (existingNames.has(suggestedName)) {
        suggestedName = `Game Object ${suffix}`;
        suffix += 1;
      }
      const name = await requestText('添加对象', suggestedName, {
        label: '对象名称',
        confirmLabel: '创建',
      });
      if (!name?.trim()) return;
      const result = await runAuthoring('scene.object.create', {
        scene: activeTab.path,
        name: name.trim(),
        parentId: selectedEntityId,
      });
      const created = result.data as { id?: string };
      if (created.id) {
        setSelectedEntityId(created.id);
        setSelectedEntityIds([created.id]);
        setRightPanel('inspector');
        appendConsole(`[scene] 已创建 ${created.id}`);
      }
    });

  const addComponent = (type: string) => {
    if (!selectedEntity || !activeTab?.kind.startsWith('scene')) return;
    void guarded(async () => {
      await runAuthoring('scene.component.add', {
        scene: activeTab.path,
        objectId: selectedEntity.id,
        type,
      });
    });
  };

  const updateComponent = (
    componentId: string,
    field: string,
    value: unknown,
  ) => {
    if (!selectedEntity || !activeTab?.kind.startsWith('scene')) return;
    void guarded(async () => {
      await runAuthoring('scene.component.update', {
        scene: activeTab.path,
        objectId: selectedEntity.id,
        componentId,
        data: { [field]: value },
      });
    });
  };

  const applySceneGizmo = (axis: 'x' | 'y' | 'z', direction: -1 | 1) => {
    if (
      sceneTool === 'select' ||
      !activeTab?.kind.startsWith('scene') ||
      selectedEntityIds.length === 0
    )
      return;
    const threeDimensional = activeTab.kind === 'scene-3d';
    const command = `scene.transform.${sceneTool}`;
    const delta =
      sceneTool === 'rotate' && !threeDimensional
        ? direction * 15
        : {
            x: axis === 'x' ? direction * (sceneTool === 'scale' ? 0.1 : 1) : 0,
            y: axis === 'y' ? direction * (sceneTool === 'scale' ? 0.1 : 1) : 0,
            ...(threeDimensional
              ? {
                  z:
                    axis === 'z'
                      ? direction * (sceneTool === 'scale' ? 0.1 : 1)
                      : 0,
                }
              : {}),
          };
    void guarded(async () => {
      for (const objectId of selectedEntityIds) {
        await runAuthoring(command, {
          scene: activeTab.path,
          objectId,
          delta,
        });
      }
    });
  };

  const createPrefab = () =>
    void guarded(async () => {
      if (!selectedEntity || !activeTab?.kind.startsWith('scene')) return;
      const name = await requestText('创建 Prefab', selectedEntity.name, {
        label: 'Prefab 名称',
        confirmLabel: '下一步',
      });
      if (!name?.trim()) return;
      const normalizedName = name.trim();
      const path = await requestText(
        '创建 Prefab',
        `prefabs/${normalizedName.toLowerCase().replace(/[^a-z0-9_-]+/gu, '-')}.prefab.json`,
        { label: 'Prefab 项目相对路径', confirmLabel: '创建' },
      );
      if (!path?.trim()) return;
      await runAuthoring('prefab.create', {
        scene: activeTab.path,
        objectId: selectedEntity.id,
        objectIds: selectedEntityIds.includes(selectedEntity.id)
          ? selectedEntityIds
          : [selectedEntity.id],
        name: normalizedName,
        path: path.trim(),
      });
    });

  const instantiatePrefab = () =>
    void guarded(async () => {
      if (!activeTab?.kind.startsWith('scene')) return;
      const path = await requestText(
        '实例化 Prefab',
        'prefabs/example.prefab.json',
        { label: 'Prefab 项目相对路径', confirmLabel: '实例化' },
      );
      if (!path?.trim()) return;
      await runAuthoring('prefab.instantiate', {
        scene: activeTab.path,
        objectId: selectedEntityId ?? activeWorld?.entities[0]?.id,
        path: path.trim(),
        parentId: selectedEntityId,
      });
    });

  const renameActiveScene = () =>
    void guarded(async () => {
      if (!activeSceneDocument || !activeTab?.kind.startsWith('scene')) return;
      const name = await requestText('重命名 Scene', activeSceneDocument.name, {
        label: 'Scene 名称',
        confirmLabel: '重命名',
      });
      if (!name?.trim() || name.trim() === activeSceneDocument.name) return;
      await runAuthoring('scene.rename', {
        scene: activeTab.path,
        name: name.trim(),
      });
    });

  const duplicateActiveScene = () =>
    void guarded(async () => {
      if (!activeSceneDocument || !activeTab?.kind.startsWith('scene')) return;
      const defaultPath = activeTab.path.replace(/(\.[^./]+)$/u, '-copy$1');
      const path = await requestText('复制 Scene', defaultPath, {
        label: '目标项目相对路径',
        confirmLabel: '下一步',
      });
      if (!path?.trim()) return;
      const name = await requestText(
        '复制 Scene',
        `${activeSceneDocument.name} Copy`,
        { label: '新 Scene 名称', confirmLabel: '复制' },
      );
      if (!name?.trim()) return;
      const normalizedPath = path.trim();
      const result = await runAuthoring('scene.duplicate', {
        scene: activeTab.path,
        path: normalizedPath,
        name: name.trim(),
      });
      const file = result.snapshot.files.find(
        (candidate) => candidate.path === normalizedPath,
      );
      if (file) await openFile(file);
    });

  const trashActiveScene = () => {
    if (!activeTab?.kind.startsWith('scene')) return;
    if (!window.confirm(`将 Scene “${activeTab.path}”移到项目回收站？`)) return;
    void guarded(async () => {
      await runAuthoring('scene.trash', { scene: activeTab.path });
      closeDocument(activeTab.path);
    });
  };

  const setStartupScene = () => {
    if (!activeTab?.kind.startsWith('scene')) return;
    void guarded(async () => {
      await runAuthoring('scene.set_startup', { scene: activeTab.path });
    });
  };

  const mutateObject = (
    objectId: string,
    command: string,
    input: Record<string, unknown> = {},
  ) => {
    if (!activeTab?.kind.startsWith('scene')) return;
    void guarded(async () => {
      await runAuthoring(command, {
        scene: activeTab.path,
        objectId,
        ...input,
      });
      if (command === 'scene.object.trash') {
        setSelectedEntityId(null);
        setSelectedEntityIds((current) =>
          current.filter((candidate) => candidate !== objectId),
        );
      }
    });
  };

  const mutateSelectedObject = (
    command: string,
    input: Record<string, unknown> = {},
  ) => {
    if (!selectedEntity) return;
    mutateObject(selectedEntity.id, command, input);
  };

  const removeComponent = (componentId: string) => {
    if (!window.confirm('移除这个 Component？该语义事务可以撤销。')) return;
    mutateSelectedObject('scene.component.remove', { componentId });
  };

  const applyPrefab = (mode: 'apply' | 'revert') => {
    mutateSelectedObject(`prefab.${mode}`);
  };

  const reimportActiveResource = () => {
    if (activeTab?.kind !== 'resource') return;
    void guarded(async () => {
      await execute('resource.reimport', { path: activeTab.path });
      const preview = unwrap(
        await window.aiGameStudio.workspace.assetPreview(activeTab.path),
      );
      setAssetPreviews((current) => ({
        ...current,
        [activeTab.path]: preview.dataUrl,
      }));
    });
  };

  const configureActiveResource = () =>
    void guarded(async () => {
      if (activeTab?.kind !== 'resource') return;
      const asset = workspace.assets.find(
        (candidate) => candidate.path === activeTab.path,
      );
      const source = await requestText(
        '资源导入设置',
        JSON.stringify(
          asset?.importSettings ?? { colorSpace: 'srgb' },
          null,
          2,
        ),
        {
          label: 'JSON 对象',
          multiline: true,
          confirmLabel: '应用',
        },
      );
      if (!source?.trim()) return;
      await runAuthoring('resource.set_import_settings', {
        path: activeTab.path,
        settings: JSON.parse(source) as Record<string, unknown>,
      });
    });

  const scanMissingResources = () =>
    void guarded(async () => {
      const result = await execute('resource.missing');
      setMissingResources(
        (result.data ?? []) as Array<{
          path: string;
          referencedBy: string[];
        }>,
      );
    });

  const repairMissingResource = (missingPath: string) =>
    void guarded(async () => {
      const replacementPath = await requestText(
        '修复缺失资源',
        'assets/imported/',
        { label: `${missingPath} 的替换资源路径`, confirmLabel: '替换' },
      );
      if (!replacementPath?.trim()) return;
      await runAuthoring('resource.repair_reference', {
        missingPath,
        replacementPath: replacementPath.trim(),
      });
      scanMissingResources();
    });

  const refreshAssetJobs = async () => {
    const requests = assetPanelRequests.current;
    if (!requests || requests.disposed) return;
    return requests.refresh(async () => {
      const [jobs, providers] = await Promise.all([
        window.aiGameStudio.workspace.assetJobs.list(),
        window.aiGameStudio.workspace.assetJobs.providers(),
      ]);
      const nextJobs = unwrap(jobs);
      if (requests.disposed) return;
      setAssetJobs(nextJobs);
      const nextProviders = unwrap(providers);
      setAssetProviders(nextProviders);
      const routing = await window.aiGameStudio.workspace.readText(
        '.ai/tool-routing.json',
      );
      if (requests.disposed) return;
      if (routing.ok) {
        const document = JSON.parse(routing.value.source) as {
          routes?: Partial<
            Record<
              GenerationToolId | 'audio',
              {
                providerId?: string;
                credentialRef?: string;
                modelId?: string;
              }
            >
          >;
        };
        const speechGeneration =
          document.routes?.speechGeneration ?? document.routes?.audio;
        setAssetRoutes((current) => {
          const next = { ...current };
          for (const tool of generationTools) {
            const configured =
              tool.id === 'speechGeneration'
                ? speechGeneration
                : document.routes?.[tool.id];
            if (configured?.providerId && configured.modelId) {
              next[tool.id] = {
                providerId: configured.providerId,
                credentialRef: configured.credentialRef,
                modelId: configured.modelId,
              };
            }
          }
          next.image ??= {
            providerId: 'openai',
            modelId: 'gpt-image-2',
          };
          next.speechGeneration ??= {
            providerId: 'aliyun-bailian',
            modelId: 'qwen-audio-3.0-tts-flash',
          };
          return next;
        });
      }
      setAssetJobDraft((current) => {
        const provider =
          nextProviders.find((item) => item.id === current.providerId) ??
          nextProviders[0];
        const model =
          provider?.models.find(
            (item) => item.id === current.modelId && item.kind === current.kind,
          ) ??
          (!current.modelId
            ? provider?.models.find((item) => item.kind === current.kind)
            : undefined);
        return provider
          ? {
              ...current,
              providerId: provider.id,
              modelId: model?.id ?? current.modelId,
              parameters: model
                ? { ...model.defaults, ...current.parameters }
                : current.parameters,
              variants: model
                ? Math.min(current.variants, model.maxVariants)
                : current.variants,
            }
          : current;
      });
      requests.updateCandidates(nextJobs);
    });
  };

  const refreshCredentialModels = async (
    providerId: string,
    credentialId: string,
    refresh = false,
  ): Promise<ProviderModelCatalog | undefined> => {
    if (!providerId || !credentialId) return undefined;
    setModelCatalogLoading((current) =>
      current.includes(credentialId) ? current : [...current, credentialId],
    );
    setModelCatalogErrors((current) => {
      const next = { ...current };
      delete next[credentialId];
      return next;
    });
    try {
      const result =
        await window.aiGameStudio.settings.credentials.discoverModels({
          providerId,
          credentialId,
          refresh,
        });
      if (!result.ok)
        throw new Error(`${result.error.code}: ${result.error.message}`);
      setModelCatalogs((current) => ({
        ...current,
        [credentialId]: result.value,
      }));
      setAssetRoutes((current) => {
        const next = { ...current };
        for (const tool of generationTools) {
          const route = current[tool.id];
          if (
            !route ||
            route.providerId !== providerId ||
            route.credentialRef !== credentialId ||
            route.modelId ||
            manualGenerationModelsRef.current[tool.id]
          )
            continue;
          const first = providerCatalogModels(
            result.value,
            providerId,
            credentialId,
            tool.id,
          )[0];
          if (first) next[tool.id] = { ...route, modelId: first.id };
        }
        return next;
      });
      setAssetJobDraft((current) => {
        if (
          current.providerId !== providerId ||
          current.credentialRef !== credentialId ||
          current.modelId ||
          assetJobManualModelRef.current
        )
          return current;
        const capability = current.kind;
        const first = providerCatalogModels(
          result.value,
          providerId,
          credentialId,
          capability,
        )[0];
        return first ? { ...current, modelId: first.id } : current;
      });
      return result.value;
    } catch (reason) {
      setModelCatalogErrors((current) => ({
        ...current,
        [credentialId]:
          reason instanceof Error ? reason.message : String(reason),
      }));
    } finally {
      setModelCatalogLoading((current) =>
        current.filter((candidate) => candidate !== credentialId),
      );
    }
    return undefined;
  };

  const submitAssetJob = () =>
    void guarded(async () => {
      const credentialRef = credentials.some(
        (credential) =>
          credential.id === assetJobDraft.credentialRef &&
          credential.provider === assetJobDraft.providerId,
      )
        ? assetJobDraft.credentialRef
        : credentials.find(
            (credential) => credential.provider === assetJobDraft.providerId,
          )?.id;
      unwrap(
        await window.aiGameStudio.workspace.assetJobs.submit({
          ...assetJobDraft,
          credentialRef: credentialRef || undefined,
        }),
      );
      setAssetJobDraft((current) => ({ ...current, prompt: '' }));
      await refreshAssetJobs();
    });

  const runAssetJob = (job: StudioAssetJob, retry = false) =>
    void guarded(async () => {
      const result = retry
        ? await window.aiGameStudio.workspace.assetJobs.retry(job.id)
        : await window.aiGameStudio.workspace.assetJobs.run(job.id);
      unwrap(result);
      await refreshAssetJobs();
    });

  const selectAssetCandidate = (jobId: string, candidateId: string) =>
    void guarded(async () => {
      unwrap(
        await window.aiGameStudio.workspace.assetJobs.select(
          jobId,
          candidateId,
        ),
      );
      const [changes, snapshot] = await Promise.all([
        window.aiGameStudio.workspace.changeSets.list(),
        window.aiGameStudio.workspace.snapshot(),
      ]);
      setChangeSets(unwrap(changes));
      setWorkspace(unwrap(snapshot));
      await refreshAssetJobs();
    });

  const rejectAssetCandidate = (jobId: string, candidateId: string) =>
    void guarded(async () => {
      const reason = await requestText('拒绝候选', '', {
        label: '拒绝原因',
        confirmLabel: '拒绝',
      });
      if (!reason?.trim()) return;
      unwrap(
        await window.aiGameStudio.workspace.assetJobs.reject(
          jobId,
          candidateId,
          reason.trim(),
        ),
      );
      await refreshAssetJobs();
    });

  const regenerateAssetCandidate = (jobId: string, candidateId: string) =>
    void guarded(async () => {
      const instruction = await requestText('重新生成候选', '', {
        label: '修改要求',
        confirmLabel: '创建新任务',
      });
      if (!instruction?.trim()) return;
      unwrap(
        await window.aiGameStudio.workspace.assetJobs.regenerate(
          jobId,
          candidateId,
          instruction.trim(),
        ),
      );
      await refreshAssetJobs();
    });

  const runProjectSearch = () =>
    void guarded(async () => {
      const result = await execute('project.search', { query: searchText });
      setSearchResults((result.data ?? []) as ProjectSearchMatch[]);
    });

  const runTest = async (path: string) => {
    const previous = workspace.testRuns?.[path];
    const baseResult = previous
      ? `${previous.testRunId}:${previous.completedAt}`
      : undefined;
    setTestRuns((current) => ({
      ...current,
      [path]: { status: 'running', baseResult },
    }));
    try {
      const result = await execute('test.run', { test: path });
      const runtime = result.data as {
        status?: string;
        tick?: number;
        durationMs?: number;
      };
      if (runtime.status === 'failed') throw new Error(result.message);
      setTestRuns((current) => ({
        ...current,
        [path]: {
          status: 'passed',
          baseResult,
          durationMs: runtime.durationMs ?? 0,
          tick: runtime.tick,
        },
      }));
    } catch (reason) {
      setTestRuns((current) => ({
        ...current,
        [path]: {
          status: 'failed',
          baseResult,
          durationMs: 0,
          error: String(reason),
        },
      }));
      throw reason;
    }
  };

  const runAllTests = () =>
    void guarded(async () => {
      const discovery = await execute('test.discover');
      const tests = (discovery.data ?? []) as Array<{ path: string }>;
      if (tests.length === 0)
        throw new Error('TEST_SUITE_EMPTY: 项目中没有测试。');
      setBottomPanel('tests');
      for (const test of tests) await runTest(test.path);
    });

  const refreshGitWorkspace = () =>
    void guarded(async () => {
      const [status, history, branches, remotes, stashes] = await Promise.all([
        execute('source-control.status'),
        execute('source-control.history'),
        execute('source-control.branch.list'),
        execute('source-control.remote.list'),
        execute('source-control.stash.list'),
      ]);
      const statusData = status.data as { branch?: string };
      const branchData = branches.data as { branches?: string[] };
      setGitWorkspace({
        branch: statusData.branch ?? '',
        history: (history.data ?? []) as typeof gitWorkspace.history,
        branches: branchData.branches ?? [],
        remotes: (remotes.data ?? []) as typeof gitWorkspace.remotes,
        stashes: (stashes.data ?? []) as typeof gitWorkspace.stashes,
      });
    });

  const replaceProjectSearch = () => {
    if (
      !window.confirm(
        `替换项目中全部 ${searchResults.length} 处“${searchText}”？该事务可以撤销。`,
      )
    )
      return;
    void guarded(async () => {
      await execute('project.replace', {
        query: searchText,
        replacement: replaceText,
      });
      setSearchResults([]);
      setBuffers({});
    });
  };

  const openSearchResult = async (match: ProjectSearchMatch) => {
    const file = workspace.files.find(
      (candidate) => candidate.path === match.path,
    );
    if (!file) return;
    await openFile(file);
    setEditorNavigation({
      path: match.path,
      line: match.line,
      column: match.column,
      nonce: (editorNavigation?.nonce ?? 0) + 1,
    });
  };

  const openDiff = (path: string) =>
    void guarded(async () => {
      const result = await execute('source-control.diff', { path });
      const diff = result.data as {
        path: string;
        before: string;
        after: string;
        gitStatus: WorkspaceFile['gitStatus'];
        tracked: boolean;
        staged: boolean;
        unstaged: boolean;
      };
      const documentPath = `studio://diff/${path}`;
      setDiffs((current) => ({
        ...current,
        [documentPath]: {
          ...diff,
          source: 'git',
          originalLabel: 'HEAD',
          modifiedLabel: '工作区',
        },
      }));
      setDocuments((current) =>
        current.some((item) => item.path === documentPath)
          ? current
          : [
              ...current,
              {
                path: documentPath,
                title: `${path.split('/').at(-1) ?? path} (Diff)`,
                kind: 'diff',
                pinned: false,
              },
            ],
      );
      setActiveDocument(documentPath);
    });

  const openChangeSetDiff = (change: StudioChangeSet, path: string) => {
    const file = change.files.find((candidate) => candidate.path === path);
    if (!file) return;
    const documentPath = `studio://changeset/${change.id}/${path}`;
    setDiffs((current) => ({
      ...current,
      [documentPath]: {
        path,
        before: file.beforeText ?? '',
        after: file.afterText ?? '',
        source: 'changeset',
        changeSetId: change.id,
        context: change.summary,
        originalLabel: '变更前',
        modifiedLabel: '变更后',
      },
    }));
    setDocuments((current) =>
      current.some((item) => item.path === documentPath)
        ? current
        : [
            ...current,
            {
              path: documentPath,
              title: `${path.split('/').at(-1) ?? path} (AI Diff)`,
              kind: 'diff',
              pinned: false,
            },
          ],
    );
    setActiveDocument(documentPath);
  };

  useEffect(() => {
    if (activeTab?.kind !== 'diff' || diffs[activeTab.path]) return;
    if (diffRestoreInFlight.current.has(activeTab.path)) return;
    const documentPath = activeTab.path;
    diffRestoreInFlight.current.add(documentPath);
    let cancelled = false;

    const restoreDiff = async () => {
      try {
        if (documentPath.startsWith('studio://diff/')) {
          const path = documentPath.slice('studio://diff/'.length);
          const result = unwrap(
            await window.aiGameStudio.workspace.execute('source-control.diff', {
              path,
            }),
          );
          if (cancelled) return;
          const diff = result.data as {
            path: string;
            before: string;
            after: string;
            gitStatus: WorkspaceFile['gitStatus'];
            tracked: boolean;
            staged: boolean;
            unstaged: boolean;
          };
          setDiffs((current) => ({
            ...current,
            [documentPath]: {
              ...diff,
              source: 'git',
              originalLabel: 'HEAD',
              modifiedLabel: '工作区',
            },
          }));
        } else if (documentPath.startsWith('studio://changeset/')) {
          const remainder = documentPath.slice('studio://changeset/'.length);
          const separator = remainder.indexOf('/');
          if (separator < 1) throw new Error('ChangeSet Diff 地址无效。');
          const changeSetId = remainder.slice(0, separator);
          const path = remainder.slice(separator + 1);
          const changes = unwrap(
            await window.aiGameStudio.workspace.changeSets.list(),
          );
          if (cancelled) return;
          setChangeSets(changes);
          const change = changes.find(
            (candidate) => candidate.id === changeSetId,
          );
          const file = change?.files.find(
            (candidate) => candidate.path === path,
          );
          if (!change || !file)
            throw new Error('原 ChangeSet 已不存在，无法恢复此 Diff。');
          setDiffs((current) => ({
            ...current,
            [documentPath]: {
              path,
              before: file.beforeText ?? '',
              after: file.afterText ?? '',
              source: 'changeset',
              changeSetId,
              context: change.summary,
              originalLabel: '变更前',
              modifiedLabel: '变更后',
            },
          }));
        } else {
          throw new Error('无法识别此 Diff 文档。');
        }
        setDiffRestoreErrors((current) => {
          if (!current[documentPath]) return current;
          const next = { ...current };
          delete next[documentPath];
          return next;
        });
      } catch (reason) {
        if (!cancelled)
          setDiffRestoreErrors((current) => ({
            ...current,
            [documentPath]: String(reason),
          }));
      } finally {
        diffRestoreInFlight.current.delete(documentPath);
      }
    };

    void restoreDiff();
    return () => {
      cancelled = true;
    };
  }, [activeTab, diffs]);

  const runChangeSetAction = (
    change: StudioChangeSet,
    action: 'approve' | 'apply' | 'test' | 'rollback',
  ) =>
    void guarded(async () => {
      if (action === 'approve')
        unwrap(
          await window.aiGameStudio.workspace.changeSets.approve(
            change.id,
            change.operations.map((operation) => operation.id),
          ),
        );
      else if (action === 'apply')
        unwrap(await window.aiGameStudio.workspace.changeSets.apply(change.id));
      else if (action === 'test')
        unwrap(await window.aiGameStudio.workspace.changeSets.test(change.id));
      else
        unwrap(
          await window.aiGameStudio.workspace.changeSets.rollback(change.id),
        );
      const [changes, snapshot] = await Promise.all([
        window.aiGameStudio.workspace.changeSets.list(),
        window.aiGameStudio.workspace.snapshot(),
      ]);
      setChangeSets(unwrap(changes));
      setWorkspace(unwrap(snapshot));
      appendConsole(`[changeset] ${action} ${change.id}`);
    });

  const runGitReviewAction = (
    documentPath: string,
    path: string,
    action: 'stage' | 'unstage' | 'restore',
  ) => {
    if (
      action === 'restore' &&
      !window.confirm(
        `还原 ${path} 的未暂存修改？\n\n该操作会用 Git 索引版本覆盖当前工作区内容。`,
      )
    )
      return;
    void guarded(async () => {
      await execute(`source-control.${action}`, { path });
      const refreshed = await execute('source-control.diff', { path });
      const diff = refreshed.data as {
        path: string;
        before: string;
        after: string;
        gitStatus: WorkspaceFile['gitStatus'];
        tracked: boolean;
        staged: boolean;
        unstaged: boolean;
      };
      if (diff.before === diff.after) {
        closeDocument(documentPath);
      } else {
        setDiffs((current) => ({
          ...current,
          [documentPath]: {
            ...diff,
            source: 'git',
            originalLabel: 'HEAD',
            modifiedLabel: '工作区',
          },
        }));
      }
      appendConsole(`[git] ${action} ${path}`);
    });
  };

  const diffReviewActions = (
    documentPath: string,
    diff: (typeof diffs)[string],
  ): DiffReviewAction[] => {
    if (diff.source === 'git') {
      const actions: DiffReviewAction[] = [];
      if (diff.staged)
        actions.push({
          id: 'unstage',
          label: '取消暂存',
          title: '将此文件从 Git 暂存区移回工作区',
          onInvoke: () =>
            runGitReviewAction(documentPath, diff.path, 'unstage'),
        });
      else if (diff.gitStatus !== 'clean')
        actions.push({
          id: 'stage',
          label: '暂存',
          title: '暂存此文件的全部工作区变更',
          tone: 'positive',
          onInvoke: () => runGitReviewAction(documentPath, diff.path, 'stage'),
        });
      if (diff.tracked && diff.unstaged)
        actions.push({
          id: 'restore',
          label: '还原',
          title: '丢弃此文件尚未暂存的工作区变更',
          tone: 'danger',
          onInvoke: () =>
            runGitReviewAction(documentPath, diff.path, 'restore'),
        });
      return actions;
    }

    const change = changeSets.find(
      (candidate) => candidate.id === diff.changeSetId,
    );
    if (!change) return [];
    if (change.status === 'awaitingApproval')
      return [
        {
          id: 'approve',
          label: '批准变更集',
          title: '批准此文件所属 ChangeSet 的全部语义操作',
          tone: 'positive',
          onInvoke: () => runChangeSetAction(change, 'approve'),
        },
        {
          id: 'reject',
          label: '拒绝变更集',
          title: '拒绝此文件所属的整个 ChangeSet',
          tone: 'danger',
          onInvoke: () => setChangeReview(change),
        },
      ];
    if (change.status === 'approved')
      return [
        {
          id: 'apply',
          label: '应用变更集',
          title: '应用已经批准的 ChangeSet',
          tone: 'positive',
          onInvoke: () => runChangeSetAction(change, 'apply'),
        },
      ];
    if (['applied', 'failed'].includes(change.status))
      return [
        {
          id: 'test',
          label: '测试',
          title: '运行项目验证与回放测试',
          onInvoke: () => runChangeSetAction(change, 'test'),
        },
        {
          id: 'rollback',
          label: '回滚',
          title: '回滚整个 ChangeSet',
          tone: 'danger',
          onInvoke: () => {
            if (window.confirm(`回滚整个 ChangeSet？\n\n${change.summary}`))
              runChangeSetAction(change, 'rollback');
          },
        },
      ];
    if (change.status === 'tested')
      return [
        {
          id: 'rollback',
          label: '回滚',
          title: '回滚整个 ChangeSet',
          tone: 'danger',
          onInvoke: () => {
            if (window.confirm(`回滚整个 ChangeSet？\n\n${change.summary}`))
              runChangeSetAction(change, 'rollback');
          },
        },
      ];
    return [];
  };

  const openBuildReport = (
    profile: 'development' | 'release',
    report: Record<string, unknown>,
  ) => {
    const path = `studio://build-report/${profile}`;
    setBuildReports((current) => ({ ...current, [path]: report }));
    setDocuments((current) =>
      current.some((item) => item.path === path)
        ? current
        : [
            ...current,
            {
              path,
              title: `${profile} Build Report`,
              kind: 'build-report',
              pinned: false,
            },
          ],
    );
    setActiveDocument(path);
  };

  const openFile = async (file: WorkspaceFile) => {
    let kind = documentKind(file);
    let textValue: { path: string; source: string; hash: string } | null = null;
    if (
      file.kind === 'scene' ||
      file.kind === 'prefab' ||
      kind === 'code' ||
      kind === 'material' ||
      kind === 'animation'
    ) {
      textValue = unwrap(
        await window.aiGameStudio.workspace.readText(file.path),
      );
    }
    if (file.kind === 'scene' && textValue) {
      const scene = JSON.parse(textValue.source) as SceneDocument;
      if (scene.schemaVersion === '2.0.0-alpha.1') {
        setSceneDocuments((current) => ({ ...current, [file.path]: scene }));
        kind =
          scene.space === '3d'
            ? 'scene-3d'
            : scene.space === 'ui'
              ? 'ui'
              : 'scene-2d';
      }
    }
    const tab: DocumentTab = {
      path: file.path,
      title: file.path.split('/').at(-1) ?? file.path,
      kind,
      pinned: false,
    };
    setDocuments((current) =>
      current.some((document) => document.path === file.path)
        ? current
        : [...current, tab],
    );
    setActiveDocument(file.path);
    if (kind === 'resource') {
      await guarded(async () => {
        const preview = unwrap(
          await window.aiGameStudio.workspace.assetPreview(file.path),
        );
        const dependencies = (
          await execute('resource.dependencies', { path: file.path })
        ).data as { referencedBy: string[]; references: string[] };
        setAssetPreviews((current) => ({
          ...current,
          [file.path]: preview.dataUrl,
        }));
        setResourceDependencies((current) => ({
          ...current,
          [file.path]: dependencies,
        }));
      });
    } else if (
      kind === 'code' ||
      kind === 'material' ||
      kind === 'animation' ||
      kind === 'prefab'
    ) {
      await guarded(async () => {
        const value =
          textValue ??
          unwrap(await window.aiGameStudio.workspace.readText(file.path));
        setBuffers((current) => ({
          ...current,
          [file.path]: {
            source: value.source,
            savedSource: value.source,
            baseHash: value.hash,
          },
        }));
      });
    }
  };

  const saveActive = async () => {
    if (
      !activeTab ||
      !activeBuffer ||
      activeBuffer.source === activeBuffer.savedSource
    )
      return;
    await guarded(async () => {
      const result = await execute('project.file.write', {
        path: activeTab.path,
        content: activeBuffer.source,
        baseHash: activeBuffer.baseHash,
      });
      const saved = unwrap(
        await window.aiGameStudio.workspace.readText(activeTab.path),
      );
      setBuffers((current) => ({
        ...current,
        [activeTab.path]: {
          source: saved.source,
          savedSource: saved.source,
          baseHash: saved.hash,
        },
      }));
      setWorkspace(result.snapshot);
    });
  };

  const saveAll = async () => {
    const dirty = Object.entries(buffers).filter(
      ([, buffer]) => buffer.source !== buffer.savedSource,
    );
    if (dirty.length === 0) return;
    await guarded(async () => {
      const next = { ...buffers };
      let latest: WorkspaceSnapshot | null = null;
      for (const [path, buffer] of dirty) {
        const result = unwrap(
          await window.aiGameStudio.workspace.execute('project.file.write', {
            path,
            content: buffer.source,
            baseHash: buffer.baseHash,
          }),
        );
        latest = result.snapshot;
        const saved = unwrap(
          await window.aiGameStudio.workspace.readText(path),
        );
        next[path] = {
          source: saved.source,
          savedSource: saved.source,
          baseHash: saved.hash,
        };
      }
      setBuffers(next);
      if (latest) setWorkspace(latest);
      appendConsole(`[files] 已保存全部 ${dirty.length} 个文档。`);
    });
  };

  // The save callback intentionally follows the current editor buffers.
  // oxlint-disable react-hooks/exhaustive-deps
  useEffect(() => {
    if (studioPreferences.autosave !== 'focus') return;
    const saveOnBlur = () => void saveAll();
    window.addEventListener('blur', saveOnBlur);
    return () => window.removeEventListener('blur', saveOnBlur);
  }, [buffers, studioPreferences.autosave]);
  // oxlint-enable react-hooks/exhaustive-deps

  // The delayed save is restarted whenever the current buffers change.
  // oxlint-disable react-hooks/exhaustive-deps
  useEffect(() => {
    if (studioPreferences.autosave !== 'delay' || dirtyPaths.length === 0)
      return;
    const timer = window.setTimeout(() => void saveAll(), 1_000);
    return () => window.clearTimeout(timer);
  }, [buffers, studioPreferences.autosave]);
  // oxlint-enable react-hooks/exhaustive-deps

  const refreshExternalChanges = async () => {
    const snapshotResult = await window.aiGameStudio.workspace.snapshot();
    if (!snapshotResult.ok) return;
    setWorkspace(snapshotResult.value);
    for (const [path, buffer] of Object.entries(buffers)) {
      const result = await window.aiGameStudio.workspace.readText(path);
      if (!result.ok || result.value.hash === buffer.baseHash) continue;
      setBuffers((current) => {
        const latest = current[path];
        if (!latest || latest.baseHash === result.value.hash) return current;
        if (latest.source === latest.savedSource) {
          return {
            ...current,
            [path]: {
              source: result.value.source,
              savedSource: result.value.source,
              baseHash: result.value.hash,
            },
          };
        }
        return {
          ...current,
          [path]: {
            ...latest,
            externalConflict: true,
            externalSource: result.value.source,
            externalHash: result.value.hash,
          },
        };
      });
    }
  };

  // The watcher must compare external files with the current buffer set.
  // oxlint-disable react-hooks/exhaustive-deps
  useEffect(() => {
    const unsubscribe = window.aiGameStudio.workspace.onExternalChange(() => {
      void refreshExternalChanges();
    });
    const fallback = window.setInterval(
      () => void refreshExternalChanges(),
      10_000,
    );
    return () => {
      unsubscribe();
      window.clearInterval(fallback);
    };
  }, [buffers]);
  // oxlint-enable react-hooks/exhaustive-deps

  const closeDocuments = (paths: string[], preferredPath?: string) => {
    const closeSet = new Set(paths);
    if (closeSet.size === 0) {
      setDocumentTabMenu(null);
      return;
    }
    const dirtyDocuments = documents.filter(
      (document) =>
        closeSet.has(document.path) &&
        buffers[document.path]?.source !== buffers[document.path]?.savedSource,
    );
    if (
      dirtyDocuments.length > 0 &&
      !window.confirm(
        dirtyDocuments.length === 1
          ? `“${dirtyDocuments[0]!.path}”尚未保存，仍要关闭吗？`
          : `${dirtyDocuments.length} 个文档尚未保存，仍要关闭吗？`,
      )
    ) {
      setDocumentTabMenu(null);
      return;
    }

    const firstClosedIndex = documents.findIndex((document) =>
      closeSet.has(document.path),
    );
    const next = documents.filter((document) => !closeSet.has(document.path));
    let nextActive = activeDocument;
    if (
      preferredPath &&
      next.some((document) => document.path === preferredPath)
    ) {
      nextActive = preferredPath;
    } else if (activeDocument && closeSet.has(activeDocument)) {
      nextActive =
        next[Math.min(Math.max(firstClosedIndex, 0), next.length - 1)]?.path ??
        null;
    }
    setDocuments(next);
    setActiveDocument(nextActive);
    setDocumentTabMenu(null);
  };

  const closeDocument = (path: string) => closeDocuments([path]);

  const createFile = async () => {
    const path = await requestText('新建文件', 'scripts/behaviors/player.ts', {
      label: '项目内相对路径',
      confirmLabel: '创建',
    });
    if (!path?.trim()) return;
    const normalizedPath = path.trim();
    await guarded(async () => {
      const result = await execute('project.file.create', {
        path: normalizedPath,
        content: '',
      });
      const file = result.snapshot.files.find(
        (candidate) => candidate.path === normalizedPath,
      );
      if (file) await openFile(file);
    });
  };

  const fileAction = async (
    action: 'rename' | 'duplicate' | 'trash',
    path: string,
  ) => {
    setFileMenu(null);
    if (action === 'trash') {
      if (!window.confirm(`将“${path}”移到项目回收站？`)) return;
      await guarded(async () => {
        await execute('project.file.trash', { path });
        closeDocument(path);
      });
      return;
    }
    const target = await requestText(
      action === 'rename' ? '移动/重命名文件' : '复制文件',
      path.replace(/(\.[^./]+)$/u, action === 'duplicate' ? '-copy$1' : '$1'),
      {
        label: '目标项目相对路径',
        confirmLabel: action === 'rename' ? '移动' : '复制',
      },
    );
    if (!target?.trim() || target.trim() === path) return;
    const normalizedTarget = target.trim();
    await guarded(async () => {
      await execute(
        action === 'rename' ? 'project.file.rename' : 'project.file.duplicate',
        action === 'rename'
          ? { from: path, to: normalizedTarget }
          : { from: path, to: normalizedTarget },
      );
      if (action === 'rename') closeDocument(path);
    });
  };

  // This is an imperative audio-device adapter backed by refs rather than
  // render state; React Compiler cannot infer that ownership boundary.
  // oxlint-disable react/react-compiler
  useEffect(() => {
    void window.aiGameStudio.workspace.getState().then((result) => {
      if (!result.ok) return;
      const state = result.value;
      setActivity(state.activity);
      setRightPanel(state.rightPanel);
      setBottomPanel(state.bottomPanel);
      setCollapsedFolders(state.collapsedFolders);
      setSelectedEntityId(state.selectedEntityId);
      setSelectedEntityIds(
        state.selectedEntityId ? [state.selectedEntityId] : [],
      );
      setLeftWidth(state.layout?.leftWidth ?? 244);
      setRightWidth(state.layout?.rightWidth ?? 310);
      setBottomHeight(state.layout?.bottomHeight ?? 190);
      setOutlineCollapsed(state.layout?.outlineCollapsed ?? false);
      setFilesCollapsed(state.layout?.filesCollapsed ?? false);
      setDiffReviewPreferences({
        ...defaultDiffReviewPreferences,
        ...state.diffReview,
      });
      const validDocuments = state.openDocuments.filter(
        (document) =>
          document.path.startsWith('studio://') ||
          initialWorkspace.files.some((file) => file.path === document.path),
      );
      if (validDocuments.length > 0) {
        setDocuments(validDocuments);
        setActiveDocument(
          validDocuments.some(
            (document) => document.path === state.activeDocument,
          )
            ? (state.activeDocument ?? validDocuments[0]!.path)
            : validDocuments[0]!.path,
        );
      }
    });
  }, [initialWorkspace.files]);

  useEffect(
    () =>
      window.aiGameStudio.workspace.onRuntimeState((runtime) => {
        setWorkspace((current) => ({ ...current, runtime }));
      }),
    [],
  );

  useEffect(() => {
    for (const path of projectedAssetPaths) {
      if (assetPreviews[path]) continue;
      void window.aiGameStudio.workspace.assetPreview(path).then((result) => {
        if (!result.ok) return;
        setAssetPreviews((current) => ({
          ...current,
          [path]: result.value.dataUrl,
        }));
      });
    }
  }, [assetPreviews, projectedAssetPaths]);

  const observationFramePath =
    workspace.runtime.latestObservation?.frameArtifact.path;
  useEffect(() => {
    if (!observationFramePath || assetPreviews[observationFramePath]) return;
    void window.aiGameStudio.workspace
      .assetPreview(observationFramePath)
      .then((result) => {
        if (!result.ok) return;
        setAssetPreviews((current) => ({
          ...current,
          [observationFramePath]: result.value.dataUrl,
        }));
      });
  }, [assetPreviews, observationFramePath]);

  useEffect(() => {
    for (const bus of workspace.audioBuses ?? []) {
      audioBusesRef.current.set(bus.id, {
        volume: Math.max(0, Math.min(1, bus.volume)),
        muted: bus.muted,
      });
    }
  }, [workspace.audioBuses]);

  useEffect(() => {
    const effectiveVolume = (busId: string, baseVolume: number) => {
      const bus = audioBusesRef.current.get(busId) ?? {
        volume: 1,
        muted: false,
      };
      return bus.muted ? 0 : baseVolume * bus.volume;
    };
    const refreshBus = (busId: string) => {
      for (const instance of audioInstancesRef.current.values()) {
        if (instance.busId === busId) {
          instance.element.volume = effectiveVolume(busId, instance.baseVolume);
        }
      }
    };
    for (const event of workspace.runtime.audioEvents ?? []) {
      const payload = event.payload;
      if (processedAudioEventsRef.current.has(payload.eventId)) continue;
      if (payload.action === 'play') {
        const source = payload.clip
          ? assetPreviews[payload.clip.projectPath]
          : undefined;
        if (!source || !payload.instanceId) continue;
        const element = new Audio(source);
        const busId = payload.busId || 'audio:bus/master';
        const baseVolume = Math.max(0, Math.min(1, payload.volume ?? 1));
        element.loop = payload.loop === true;
        element.volume = effectiveVolume(busId, baseVolume);
        element.addEventListener(
          'ended',
          () => audioInstancesRef.current.delete(payload.instanceId!),
          { once: true },
        );
        audioInstancesRef.current.get(payload.instanceId)?.element.pause();
        audioInstancesRef.current.set(payload.instanceId, {
          element,
          busId,
          baseVolume,
        });
        void element.play().catch((reason: unknown) => {
          onError(`音频播放失败：${String(reason)}`);
        });
      } else if (payload.action === 'stop' && payload.instanceId) {
        const instance = audioInstancesRef.current.get(payload.instanceId);
        instance?.element.pause();
        audioInstancesRef.current.delete(payload.instanceId);
      } else if (payload.action === 'pause' && payload.instanceId) {
        audioInstancesRef.current.get(payload.instanceId)?.element.pause();
      } else if (payload.action === 'resume' && payload.instanceId) {
        const instance = audioInstancesRef.current.get(payload.instanceId);
        if (instance) void instance.element.play();
      } else if (payload.action === 'set-volume') {
        const current = audioBusesRef.current.get(payload.busId) ?? {
          volume: 1,
          muted: false,
        };
        audioBusesRef.current.set(payload.busId, {
          ...current,
          volume: Math.max(0, Math.min(1, payload.volume ?? 1)),
        });
        refreshBus(payload.busId);
      } else if (payload.action === 'set-muted') {
        const current = audioBusesRef.current.get(payload.busId) ?? {
          volume: 1,
          muted: false,
        };
        audioBusesRef.current.set(payload.busId, {
          ...current,
          muted: payload.muted === true,
        });
        refreshBus(payload.busId);
      }
      processedAudioEventsRef.current.add(payload.eventId);
    }
    if (workspace.runtime.status === 'stopped') {
      for (const instance of audioInstancesRef.current.values()) {
        instance.element.pause();
      }
      audioInstancesRef.current.clear();
      processedAudioEventsRef.current.clear();
    }
  }, [
    assetPreviews,
    onError,
    workspace.runtime.audioEvents,
    workspace.runtime.status,
  ]);

  useEffect(() => {
    void window.aiGameStudio.workspace
      .execute('project.references', {})
      .then((result) => {
        if (result.ok)
          setReferenceIndex(result.value.data as ProjectReferenceIndex);
      });
  }, [workspace.files]);

  useEffect(() => {
    if (!activeTab || buffers[activeTab.path]) return;
    if (!['code', 'material', 'animation', 'prefab'].includes(activeTab.kind))
      return;
    void window.aiGameStudio.workspace
      .readText(activeTab.path)
      .then((result) => {
        if (!result.ok) {
          onError(`${result.error.code}: ${result.error.message}`);
          return;
        }
        setBuffers((current) =>
          current[activeTab.path]
            ? current
            : {
                ...current,
                [activeTab.path]: {
                  source: result.value.source,
                  savedSource: result.value.source,
                  baseHash: result.value.hash,
                },
              },
        );
      });
  }, [activeTab, buffers, onError]);
  // oxlint-enable react/react-compiler

  useEffect(() => {
    if (!activeTab?.kind.startsWith('scene')) return;
    if (sceneDocuments[activeTab.path]) return;
    void window.aiGameStudio.workspace
      .readText(activeTab.path)
      .then((result) => {
        if (!result.ok) {
          onError(`${result.error.code}: ${result.error.message}`);
          return;
        }
        const scene = JSON.parse(result.value.source) as SceneDocument;
        setSceneDocuments((current) => ({
          ...current,
          [activeTab.path]: scene,
        }));
      })
      .catch((reason: unknown) => {
        onError(`无法读取 Scene：${String(reason)}`);
      });
  }, [activeTab, sceneDocuments, onError]);

  useEffect(() => {
    if (!selectedEntity?.prefab || !activeTab?.kind.startsWith('scene')) return;
    const key = `${activeTab.path}:${selectedEntity.id}:${selectedEntity.prefab}`;
    void window.aiGameStudio.workspace
      .execute('prefab.overrides', {
        scene: activeTab.path,
        objectId: selectedEntity.id,
      })
      .then((result) => {
        if (result.ok) {
          const value = result.value.data as {
            overrides?: Array<{
              field: string;
              source: unknown;
              instance: unknown;
            }>;
          };
          setPrefabOverrideResult({ key, overrides: value.overrides ?? [] });
        } else {
          setPrefabOverrideResult({ key, overrides: [] });
        }
      });
  }, [
    activeTab?.kind,
    activeTab?.path,
    selectedEntity?.id,
    selectedEntity?.prefab,
    workspace.history.transactionCount,
  ]);

  useEffect(() => {
    const state: StudioWorkspaceState = {
      schemaVersion: '2.0.0-alpha.1',
      activity,
      rightPanel,
      bottomPanel,
      openDocuments: documents,
      activeDocument,
      selectedEntityId,
      collapsedFolders,
      diffReview: diffReviewPreferences,
      layout: {
        leftWidth,
        rightWidth,
        bottomHeight,
        outlineCollapsed,
        filesCollapsed,
      },
    };
    const timeout = window.setTimeout(() => {
      void window.aiGameStudio.workspace.setState(state);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [
    activity,
    rightPanel,
    bottomPanel,
    documents,
    activeDocument,
    selectedEntityId,
    collapsedFolders,
    diffReviewPreferences,
    leftWidth,
    rightWidth,
    bottomHeight,
    outlineCollapsed,
    filesCollapsed,
  ]);

  const resizeDockByKeyboard = (
    event: ReactKeyboardEvent<HTMLInputElement>,
    side: 'left' | 'right',
  ) => {
    const minimum = Number(event.currentTarget.min);
    const maximum = Number(event.currentTarget.max);
    const visibleWidth = workspaceRef.current
      ?.querySelector(`.${side}-dock`)
      ?.getBoundingClientRect().width;
    if (!visibleWidth) return;
    const increment =
      event.key === 'PageUp'
        ? (maximum - minimum) / 10
        : event.key === 'PageDown'
          ? -(maximum - minimum) / 10
          : ['ArrowRight', 'ArrowUp'].includes(event.key)
            ? 1
            : ['ArrowLeft', 'ArrowDown'].includes(event.key)
              ? -1
              : 0;
    if (!increment && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const nextWidth =
      event.key === 'Home'
        ? minimum
        : event.key === 'End'
          ? maximum
          : Math.min(
              maximum,
              Math.max(minimum, Math.round(visibleWidth) + increment),
            );
    if (side === 'left') setLeftWidth(nextWidth);
    else setRightWidth(nextWidth);
  };

  useEffect(() => {
    const move = (event: PointerEvent | MouseEvent) => {
      const target = resizeTargetRef.current;
      if (!target) return;
      const workspaceElement = workspaceRef.current;
      if (!workspaceElement) return;
      const workspaceRect = workspaceElement.getBoundingClientRect();
      if (target === 'left') {
        const leftDock = workspaceElement.querySelector('.left-dock');
        const leftEdge = leftDock?.getBoundingClientRect().left ?? 44;
        const nextWidth = Math.min(
          440,
          Math.max(180, event.clientX - leftEdge),
        );
        resizeValuesRef.current.leftWidth = nextWidth;
        workspaceElement.style.setProperty(
          '--left-dock-width',
          `${nextWidth}px`,
        );
      } else if (target === 'right') {
        const nextWidth = Math.min(
          520,
          Math.max(250, workspaceRect.right - event.clientX),
        );
        resizeValuesRef.current.rightWidth = nextWidth;
        workspaceElement.style.setProperty(
          '--right-dock-width',
          `${nextWidth}px`,
        );
      } else {
        const nextHeight = Math.min(
          360,
          Math.max(32, workspaceRect.bottom - event.clientY),
        );
        resizeValuesRef.current.bottomHeight = nextHeight;
        workspaceElement.style.setProperty(
          '--bottom-dock-height',
          `${nextHeight}px`,
        );
      }
    };
    const stop = () => {
      const target = resizeTargetRef.current;
      if (!target) return;
      const values = resizeValuesRef.current;
      if (target === 'left') setLeftWidth(values.leftWidth);
      else if (target === 'right') setRightWidth(values.rightWidth);
      else setBottomHeight(values.bottomHeight);
      resizeTargetRef.current = null;
      setResizeTarget(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('mousemove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('mouseup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, []);

  useEffect(() => {
    const dismissPopups = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        mainMenu &&
        !target.closest('.main-menu') &&
        !target.closest('.main-menu-popup')
      ) {
        setMainMenu(null);
      }
      if (
        documentTabMenu &&
        !target.closest('.document-tab') &&
        !target.closest('.document-tab-context-menu')
      ) {
        setDocumentTabMenu(null);
      }
      if (fileMenu && !target.closest('.file-context-menu')) {
        setFileMenu(null);
      }
    };
    window.addEventListener('pointerdown', dismissPopups);
    return () => window.removeEventListener('pointerdown', dismissPopups);
  }, [documentTabMenu, fileMenu, mainMenu]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const editingText =
        target instanceof HTMLElement &&
        (target.matches('input, textarea, select, [contenteditable="true"]') ||
          Boolean(target.closest('.monaco-editor')));
      const sceneActive = Boolean(
        activeTab && ['scene-2d', 'scene-3d', 'ui'].includes(activeTab.kind),
      );
      if (event.key === 'Escape') {
        setMainMenu(null);
        setDocumentTabMenu(null);
        setFileMenu(null);
        if (sceneActive && !editingText) {
          setSceneTransformPreview(null);
          setSceneTool('select');
        }
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 's'
      ) {
        event.preventDefault();
        void saveAll();
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'w'
      ) {
        event.preventDefault();
        closeDocuments(documents.map((document) => document.path));
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'w'
      ) {
        event.preventDefault();
        if (activeDocument) closeDocument(activeDocument);
      } else if (
        sceneActive &&
        !editingText &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        const toolByCode = {
          KeyQ: 'select',
          KeyW: 'move',
          KeyE: 'rotate',
          KeyR: 'scale',
        } as const;
        const tool = toolByCode[event.code as keyof typeof toolByCode];
        if (tool && !(activeTab?.kind === 'ui' && tool === 'rotate')) {
          event.preventDefault();
          setSceneTransformPreview(null);
          setSceneTool(tool);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  useEffect(() => {
    void window.aiGameStudio.window.setCloseState({
      dirtyDocuments: dirtyPaths.length,
      runtimeActive: workspace.runtime.status === 'running',
      buildActive,
      agentActive: codex?.activeTurn?.status === 'inProgress',
    });
  }, [
    dirtyPaths.length,
    workspace.runtime.status,
    buildActive,
    codex?.activeTurn?.status,
  ]);

  useEffect(() => {
    if (activity !== 'settings' && activeDocument !== 'studio://settings')
      return;
    void window.aiGameStudio.settings.get(settingsScope).then((result) => {
      if (result.ok) setSettings(result.value);
      else onError(`${result.error.code}: ${result.error.message}`);
    });
  }, [activity, activeDocument, settingsScope, onError]);

  useEffect(() => {
    void Promise.all([
      window.aiGameStudio.settings.get('studio'),
      window.aiGameStudio.settings.get('agent'),
      window.aiGameStudio.settings.get('ai-tools'),
    ]).then(([studioResult, agentResult, aiToolsResult]) => {
      if (studioResult.ok) setStudioPreferences(studioResult.value.values);
      if (agentResult.ok) {
        setAgentPreferences(agentResult.value.values);
        const mode = agentResult.value.values.defaultMode;
        if (['ask', 'plan', 'agent', 'goal'].includes(String(mode)))
          setCopilotMode(mode as CodexTurnMode);
        const budget = Number(agentResult.value.values.goalTokenBudget ?? 0);
        if (Number.isSafeInteger(budget) && budget > 0)
          setGoalBudget(String(budget));
      }
      if (aiToolsResult.ok) {
        setAiToolPreferences(aiToolsResult.value.values);
      }
    });
  }, []);

  // Asset refresh is asynchronous and reports failures through the shared error surface.
  // oxlint-disable react-hooks/exhaustive-deps, react/react-compiler
  useEffect(() => {
    if (activity !== 'assets') return;
    const requests = assetPanelRequests.current;
    requests?.setPreviewActive(true);
    const stop = pollAfterCompletion(refreshAssetJobs, (reason: unknown) => {
      onError(`资源任务刷新失败：${String(reason)}`);
    });
    return () => {
      stop();
      requests?.setPreviewActive(false);
    };
  }, [activity]);
  // oxlint-enable react-hooks/exhaustive-deps, react/react-compiler

  // Source-control refresh is deferred so the effect itself does not synchronously
  // drive the guarded busy state.
  // oxlint-disable react-hooks/exhaustive-deps
  useEffect(() => {
    if (activity !== 'source-control') return;
    const timer = window.setTimeout(refreshGitWorkspace, 0);
    let cancelled = false;
    let running = false;
    let refreshAgain = false;
    const refreshReviews = async () => {
      if (running) {
        refreshAgain = true;
        return;
      }
      running = true;
      try {
        do {
          refreshAgain = false;
          const result = await window.aiGameStudio.workspace.changeSets.list();
          if (!cancelled) {
            if (result.ok) setChangeSets(result.value);
            else onError(`${result.error.code}: ${result.error.message}`);
          }
        } while (refreshAgain && !cancelled);
      } catch (error) {
        if (!cancelled) onError(`审核记录刷新失败：${String(error)}`);
      } finally {
        running = false;
      }
    };
    const unsubscribe = window.aiGameStudio.workspace.changeSets.onChanged(
      () => void refreshReviews(),
    );
    void refreshReviews();
    return () => {
      cancelled = true;
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [activity, onError]);
  // oxlint-enable react-hooks/exhaustive-deps

  // Provider state comes from Electron and intentionally refreshes when the
  // AI Tools scope becomes visible.
  // oxlint-disable react-hooks/exhaustive-deps, react/react-compiler
  useEffect(() => {
    if (settingsScope !== 'ai-tools' && activity !== 'assets') return;
    void Promise.all([
      window.aiGameStudio.settings.credentials.providers(),
      window.aiGameStudio.settings.credentials.list(),
      refreshAssetJobs(),
    ]).then(([providersResult, credentialsResult]) => {
      if (providersResult.ok) setCredentialProviders(providersResult.value);
      else
        onError(
          `${providersResult.error.code}: ${providersResult.error.message}`,
        );
      if (credentialsResult.ok) {
        setCredentials(credentialsResult.value);
        for (const credential of credentialsResult.value) {
          void refreshCredentialModels(
            credential.provider,
            credential.id,
            false,
          );
        }
      } else {
        onError(
          `${credentialsResult.error.code}: ${credentialsResult.error.message}`,
        );
      }
    });
  }, [activity, settingsScope, onError]);
  // oxlint-enable react-hooks/exhaustive-deps, react/react-compiler

  const updateSetting = async (
    key: string,
    value: unknown,
    companionPatch: Record<string, unknown> = {},
  ) => {
    await guarded(async () => {
      const updated = unwrap(
        await window.aiGameStudio.settings.update(settingsScope, {
          [key]: value,
          ...companionPatch,
        }),
      );
      setSettings(updated);
      if (settingsScope === 'studio') setStudioPreferences(updated.values);
      if (settingsScope === 'agent') setAgentPreferences(updated.values);
      if (settingsScope === 'agent' && key === 'goalEnabled' && value === false)
        setCopilotMode((current) => (current === 'goal' ? 'agent' : current));
      if (settingsScope === 'ai-tools') {
        setAiToolPreferences(updated.values);
      }
      appendConsole(`[settings] 已更新 ${settingsScope}.${key}`);
    });
  };

  const updateAssetRoute = (
    kind: GenerationToolId,
    route: { providerId: string; credentialRef?: string; modelId: string },
  ) =>
    void guarded(async () => {
      const file = unwrap(
        await window.aiGameStudio.workspace.readText('.ai/tool-routing.json'),
      );
      const document = JSON.parse(file.source) as {
        schemaVersion?: string;
        routes?: Record<string, unknown>;
      };
      await execute('project.file.write', {
        path: '.ai/tool-routing.json',
        content: `${JSON.stringify(
          {
            ...document,
            schemaVersion: '2.0.0',
            routes: { ...document.routes, [kind]: route },
          },
          null,
          2,
        )}\n`,
        baseHash: file.hash,
      });
      setAssetRoutes((current) => ({ ...current, [kind]: route }));
      appendConsole(
        `[asset-route] ${kind} -> ${route.providerId}/${route.modelId}`,
      );
    });

  const saveCredential = () =>
    void guarded(async () => {
      const provider = credentialProviders.find(
        (candidate) => candidate.id === credentialDraft.provider,
      );
      if (!provider) throw new Error('请先选择凭证供应商。');
      const missing = provider.fields.find(
        (field) => field.required && !credentialDraft.fields[field.id]?.trim(),
      );
      if (missing) throw new Error(`请填写${missing.label}。`);
      const configuration = Object.fromEntries(
        provider.fields
          .filter((field) => !field.secret)
          .map((field) => [field.id, credentialDraft.fields[field.id] ?? '']),
      );
      const secrets = Object.fromEntries(
        provider.fields
          .filter((field) => field.secret)
          .map((field) => [field.id, credentialDraft.fields[field.id] ?? '']),
      );
      const saved = unwrap(
        await window.aiGameStudio.settings.credentials.set({
          provider: credentialDraft.provider,
          label: credentialDraft.label,
          configuration,
          secrets,
        }),
      );
      setCredentialDraft({ provider: '', label: '', fields: {} });
      const nextCredentials = unwrap(
        await window.aiGameStudio.settings.credentials.list(),
      );
      setCredentials(nextCredentials);
      void refreshCredentialModels(saved.provider, saved.id, true);
      appendConsole('[credentials] 已保存到操作系统加密存储；项目中只有引用。');
    });

  const removeCredential = (id: string) => {
    if (!window.confirm('删除这个系统凭据？使用该引用的生成任务将无法运行。'))
      return;
    void guarded(async () => {
      unwrap(await window.aiGameStudio.settings.credentials.remove(id));
      setCredentials(
        unwrap(await window.aiGameStudio.settings.credentials.list()),
      );
    });
  };

  const renderTree = (nodes: TreeNode[], depth = 0): React.ReactNode =>
    nodes.map((node) => {
      const isFolder = node.children.length > 0;
      const collapsed = collapsedFolders.includes(node.path);
      const gitStatus = treeGitStatus(node);
      const gitStatusLabel = gitDecoration[gitStatus].label;
      const Icon = node.file
        ? fileIcon(node.file)
        : collapsed
          ? Folder
          : FolderOpen;
      return (
        <div key={node.path}>
          <button
            className={`tree-row ${activeDocument === node.path ? 'selected' : ''}`}
            data-git-status={gitStatus === 'clean' ? undefined : gitStatus}
            style={{ paddingLeft: 8 + depth * 14 }}
            title={`${node.path}${gitStatus === 'clean' ? '' : ` · Git：${gitStatusLabel}`}`}
            draggable={Boolean(node.file)}
            onDragStart={(event) => {
              if (node.file)
                event.dataTransfer.setData('text/plain', node.file.path);
            }}
            onDragOver={(event) => {
              if (isFolder) event.preventDefault();
            }}
            onDrop={(event) => {
              if (!isFolder) return;
              event.preventDefault();
              const from = event.dataTransfer.getData('text/plain');
              const name = from.split('/').at(-1);
              if (from && name && from !== `${node.path}/${name}`) {
                void guarded(async () => {
                  await execute('project.file.rename', {
                    from,
                    to: `${node.path}/${name}`,
                  });
                  closeDocument(from);
                });
              }
            }}
            onContextMenu={(event) => {
              if (!node.file) return;
              event.preventDefault();
              setFileMenu({
                path: node.file.path,
                x: event.clientX,
                y: event.clientY,
              });
            }}
            onClick={() => {
              if (isFolder) {
                setCollapsedFolders((current) =>
                  collapsed
                    ? current.filter((path) => path !== node.path)
                    : [...current, node.path],
                );
              } else if (node.file) {
                void openFile(node.file);
              }
            }}
          >
            {isFolder ? (
              collapsed ? (
                <ChevronRight />
              ) : (
                <ChevronDown />
              )
            ) : (
              <span className="tree-spacer" />
            )}
            <Icon className="tree-item-icon" />
            <span className="tree-label">{node.name}</span>
            {node.file?.diagnosticCount ? (
              <span className="tree-badge error" title="文件诊断">
                {node.file.diagnosticCount}
              </span>
            ) : null}
            {node.file && node.file.aiActivity !== 'none' && (
              <span
                className="tree-badge ai"
                title={`AI ChangeSet: ${node.file.aiActivity}`}
              >
                AI
              </span>
            )}
            {node.file && node.file.gitStatus !== 'clean' && (
              <span className="tree-badge git" title={`Git：${gitStatusLabel}`}>
                {gitDecoration[gitStatus].badge}
              </span>
            )}
          </button>
          {isFolder && !collapsed && renderTree(node.children, depth + 1)}
        </div>
      );
    });

  const renderObjectOutline = (
    parentId: string | null,
    depth = 0,
  ): React.ReactNode => {
    if (!activeWorld) return null;
    return activeWorld.entities
      .filter((entity) => (entity.parentId ?? null) === parentId)
      .sort(
        (left, right) =>
          (left.order ?? 0) - (right.order ?? 0) ||
          left.name.localeCompare(right.name),
      )
      .map((entity) => (
        <div key={entity.id}>
          <div
            className={`outline-object-row ${selectedEntityIds.includes(entity.id) ? 'selected' : ''}`}
            style={{ paddingLeft: 8 + depth * 14 }}
            draggable={!entity.locked}
            onDragStart={(event) =>
              event.dataTransfer.setData(
                'application/x-aigame-object',
                entity.id,
              )
            }
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const objectId = event.dataTransfer.getData(
                'application/x-aigame-object',
              );
              if (
                !objectId ||
                objectId === entity.id ||
                !activeTab?.kind.startsWith('scene')
              )
                return;
              void guarded(async () => {
                await runAuthoring('scene.object.set_parent', {
                  scene: activeTab.path,
                  objectId,
                  parentId: entity.id,
                });
              });
            }}
          >
            <button
              className="outline-object-select"
              onClick={(event) =>
                selectEntity(entity.id, event.ctrlKey || event.metaKey)
              }
            >
              <Box /> <span>{entity.name}</span>
            </button>
            <button
              title={entity.visible === false ? '显示对象' : '隐藏对象'}
              onClick={() =>
                mutateObject(entity.id, 'scene.object.set_visibility', {
                  visible: entity.visible === false,
                })
              }
            >
              {entity.visible === false ? <EyeOff /> : <Eye />}
            </button>
            <button
              title={entity.locked ? '解锁对象' : '锁定对象'}
              onClick={() =>
                mutateObject(entity.id, 'scene.object.set_lock', {
                  locked: !entity.locked,
                })
              }
            >
              {entity.locked ? <Lock /> : <Unlock />}
            </button>
          </div>
          {renderObjectOutline(entity.id, depth + 1)}
        </div>
      ));
  };

  const assetJobCredentials = credentials.filter(
    (credential) => credential.provider === assetJobDraft.providerId,
  );
  const assetJobCredentialId = assetJobCredentials.some(
    (credential) => credential.id === assetJobDraft.credentialRef,
  )
    ? assetJobDraft.credentialRef
    : (assetJobCredentials[0]?.id ?? '');
  const assetJobCapability: GenerationToolId = assetJobDraft.kind;
  const assetJobCatalog = assetJobCredentialId
    ? modelCatalogs[assetJobCredentialId]
    : undefined;
  const assetJobCatalogModels = providerCatalogModels(
    assetJobCatalog,
    assetJobDraft.providerId,
    assetJobCredentialId,
    assetJobCapability,
  );
  const assetJobStaticModels =
    assetProviders
      .find((provider) => provider.id === assetJobDraft.providerId)
      ?.models.filter((model) => model.kind === assetJobDraft.kind) ?? [];
  const assetJobIsLocal = assetJobDraft.providerId === 'local-placeholder';
  const assetJobModelOptions = assetJobIsLocal
    ? assetJobStaticModels.map((model) => ({
        id: model.id,
        label: model.label,
      }))
    : assetJobCatalogModels;
  const assetJobModelInCatalog = assetJobModelOptions.some(
    (model) => model.id === assetJobDraft.modelId,
  );
  const assetJobUsesManualModel =
    !assetJobIsLocal &&
    (assetJobManualModel ||
      Boolean(
        assetJobDraft.modelId &&
        (assetJobCatalog || modelCatalogErrors[assetJobCredentialId]) &&
        !assetJobModelInCatalog,
      ));
  const assetJobCatalogLoading =
    modelCatalogLoading.includes(assetJobCredentialId);
  const assetJobCatalogError = modelCatalogErrors[assetJobCredentialId];
  const assetJobModelSource = assetJobIsLocal
    ? 'local-catalog'
    : assetJobUsesManualModel
      ? 'manual'
      : (assetJobCatalog?.source ??
        (assetJobCatalogError ? 'error' : 'pending'));
  const visibleAssetJobs = useMemo(
    () => assetJobs.filter((job) => assetJobMatchesView(job, assetJobView)),
    [assetJobView, assetJobs],
  );
  const assetJobViewCounts = useMemo(
    () =>
      Object.fromEntries(
        assetJobViews.map((view) => [
          view.id,
          assetJobs.filter((job) => assetJobMatchesView(job, view.id)).length,
        ]),
      ) as Record<AssetJobView, number>,
    [assetJobs],
  );

  const renderLeftPanel = () => {
    if (activity === 'explorer') {
      return (
        <>
          <section className="outline-section">
            <div className="panel-section-title">
              <button
                className="section-toggle"
                onClick={() => setOutlineCollapsed((value) => !value)}
              >
                {outlineCollapsed ? <ChevronRight /> : <ChevronDown />}
                <span title="场景大纲">Scene 与对象</span>
              </button>
              <button title="新建 Scene" onClick={createScene}>
                +
              </button>
            </div>
            {!outlineCollapsed &&
              (activeWorld ? (
                <div className="outline-tree">
                  <div className="scene-picker-row">
                    <select
                      value={
                        activeTab?.kind.startsWith('scene')
                          ? activeTab.path
                          : ''
                      }
                      onChange={(event) => {
                        const file = workspace.files.find(
                          (candidate) => candidate.path === event.target.value,
                        );
                        if (file) void openFile(file);
                      }}
                    >
                      <option value="" disabled>
                        选择 Scene
                      </option>
                      {(workspace.scenes ?? []).map((scene) => (
                        <option key={scene.path} value={scene.path}>
                          {scene.startup ? '★ ' : ''}
                          {scene.name} · {scene.space}
                        </option>
                      ))}
                    </select>
                    <button title="添加对象" onClick={addSceneObject}>
                      +
                    </button>
                  </div>
                  <div className="scene-actions">
                    <button onClick={renameActiveScene}>重命名</button>
                    <button onClick={duplicateActiveScene}>复制</button>
                    <button onClick={setStartupScene}>设为启动</button>
                    <button onClick={trashActiveScene}>
                      <Trash2 />
                    </button>
                  </div>
                  <div
                    className="outline-root-drop"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      const objectId = event.dataTransfer.getData(
                        'application/x-aigame-object',
                      );
                      if (objectId && activeTab?.kind.startsWith('scene'))
                        void guarded(async () => {
                          await runAuthoring('scene.object.set_parent', {
                            scene: activeTab.path,
                            objectId,
                            parentId: null,
                          });
                        });
                    }}
                  >
                    <Layers3 /> {activeWorld.name}
                  </div>
                  {renderObjectOutline(null)}
                  {activeWorld.entities.length === 0 && (
                    <p>此场景还没有对象。</p>
                  )}
                  <div className="scene-actions">
                    <button onClick={addSceneObject}>+ 对象</button>
                    <button onClick={instantiatePrefab}>实例化 Prefab</button>
                  </div>
                </div>
              ) : (
                <p className="panel-empty">打开 Scene 后显示对象层级。</p>
              ))}
          </section>
          <section className="files-section">
            <div className="panel-section-title">
              <button
                className="section-toggle"
                onClick={() => setFilesCollapsed((value) => !value)}
              >
                {filesCollapsed ? <ChevronRight /> : <ChevronDown />}
                <span>项目文件</span>
              </button>
              <button title="新建文件" onClick={() => void createFile()}>
                +
              </button>
            </div>
            {!filesCollapsed && (
              <div className="file-tree">{renderTree(tree)}</div>
            )}
          </section>
        </>
      );
    }
    if (activity === 'search') {
      return (
        <div className="side-tool search-tool">
          <input
            placeholder="在项目内容中搜索"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && searchText) runProjectSearch();
            }}
          />
          <input
            placeholder="替换为"
            value={replaceText}
            onChange={(event) => setReplaceText(event.target.value)}
          />
          <div className="search-actions">
            <button disabled={!searchText} onClick={runProjectSearch}>
              <Search /> 搜索
            </button>
            <button
              disabled={searchResults.length === 0}
              onClick={replaceProjectSearch}
            >
              全部替换
            </button>
          </div>
          <small>{searchResults.length} 个匹配</small>
          {searchResults.map((match, index) => (
            <button
              key={`${match.path}:${match.line}:${match.column}:${index}`}
              onClick={() => void openSearchResult(match)}
            >
              <span>
                {match.path}:{match.line}:{match.column}
              </span>
              <small>{match.preview}</small>
            </button>
          ))}
        </div>
      );
    }
    if (activity === 'source-control') {
      const changed = workspace.files.filter(
        (file) => file.gitStatus && file.gitStatus !== 'clean',
      );
      return (
        <div className="side-tool source-control-tool">
          <header className="scm-workspace-header">
            <GitBranch />
            <div>
              <strong>源代码管理</strong>
              <small>{gitWorkspace.branch || '正在读取分支…'}</small>
            </div>
          </header>
          <nav className="scm-actions" aria-label="Git 工作区操作">
            <button onClick={refreshGitWorkspace}>刷新</button>
            <button
              onClick={() =>
                void guarded(async () => {
                  const name = await requestText('新建分支', '', {
                    label: '分支名称',
                    confirmLabel: '创建',
                  });
                  if (!name?.trim()) return;
                  await execute('source-control.branch.create', {
                    name: name.trim(),
                  });
                  refreshGitWorkspace();
                })
              }
            >
              新建分支
            </button>
            <button
              onClick={() =>
                void guarded(async () => {
                  const name = await requestText(
                    '切换分支',
                    gitWorkspace.branches[0] ?? '',
                    { label: '分支名称', confirmLabel: '切换' },
                  );
                  if (!name?.trim()) return;
                  await execute('source-control.branch.switch', {
                    name: name.trim(),
                  });
                  refreshGitWorkspace();
                })
              }
            >
              切换分支
            </button>
            <button
              onClick={() =>
                void guarded(async () => {
                  await execute('source-control.stash.push', {
                    message: 'AI Game Studio work in progress',
                  });
                  refreshGitWorkspace();
                })
              }
            >
              Stash
            </button>
            <button
              disabled={gitWorkspace.stashes.length === 0}
              onClick={() =>
                void guarded(async () => {
                  await execute('source-control.stash.pop', {
                    ref: gitWorkspace.stashes[0]?.ref,
                  });
                  refreshGitWorkspace();
                })
              }
            >
              Pop Stash
            </button>
            <button
              disabled={gitWorkspace.remotes.length === 0}
              onClick={() =>
                void guarded(async () => {
                  await execute('source-control.remote.fetch', {
                    remote: gitWorkspace.remotes[0]?.name,
                  });
                  refreshGitWorkspace();
                })
              }
            >
              Fetch
            </button>
          </nav>
          <label className="commit-composer">
            <input
              aria-label="Git 提交说明"
              value={commitMessage}
              placeholder="提交说明"
              maxLength={200}
              onChange={(event) => setCommitMessage(event.target.value)}
            />
            <button
              disabled={!commitMessage.trim()}
              onClick={() =>
                void guarded(async () => {
                  await execute('source-control.commit', {
                    message: commitMessage,
                  });
                  setCommitMessage('');
                  refreshGitWorkspace();
                })
              }
            >
              提交已暂存
            </button>
          </label>
          <section className="scm-section" aria-label="Git 文件更改">
            <header className="scm-section-header">
              <strong>更改</strong>
              <span className="scm-count">{changed.length}</span>
            </header>
            <small className="scm-section-hint">
              选择文件查看只读 Diff，使用 + 加入暂存区。
            </small>
            <div className="scm-file-list">
              {changed.map((file) => {
                const status = file.gitStatus ?? 'clean';
                const decoration = gitDecoration[status];
                return (
                  <div
                    className="scm-file"
                    data-status={status}
                    key={file.path}
                  >
                    <button
                      className="scm-file-main"
                      title={`打开 ${file.path} 的 Diff`}
                      onClick={() => openDiff(file.path)}
                    >
                      <FileCode2 />
                      <span className="scm-file-name">{file.path}</span>
                      <span
                        className="scm-file-status"
                        title={decoration.label}
                        aria-label={decoration.label}
                      >
                        {decoration.badge || '•'}
                      </span>
                    </button>
                    <button
                      className="scm-stage-button"
                      title={`暂存 ${file.path}`}
                      aria-label={`暂存 ${file.path}`}
                      onClick={() =>
                        void guarded(async () => {
                          await execute('source-control.stage', {
                            path: file.path,
                          });
                          refreshGitWorkspace();
                        })
                      }
                    >
                      +
                    </button>
                  </div>
                );
              })}
            </div>
            {changed.length === 0 && (
              <small className="scm-empty">
                工作区干净，没有未提交的更改。
              </small>
            )}
          </section>
          <details className="scm-history">
            <summary>
              提交历史 <span>{gitWorkspace.history.length}</span>
            </summary>
            {gitWorkspace.history.slice(0, 20).map((entry) => (
              <div key={entry.commit} className="scm-history-row">
                <code>{entry.commit?.slice(0, 8)}</code>
                <span>{entry.subject}</span>
                <small>{entry.author}</small>
              </div>
            ))}
          </details>
          <section
            className="scm-section scm-changesets"
            aria-label="Codex ChangeSets"
          >
            <header className="scm-section-header">
              <strong>
                <Bot /> Codex ChangeSets
              </strong>
              <span className="scm-count">{changeSets.length}</span>
            </header>
            {changeSets.map((change) => (
              <article
                className="changeset-card"
                data-status={change.status}
                data-change-id={change.id}
                key={change.id}
              >
                <header>
                  <Bot />
                  <div>
                    <strong>{change.summary}</strong>
                    <small>{changeSetStatusLabels[change.status]}</small>
                  </div>
                </header>
                {change.files.map((file) => (
                  <button
                    className="changeset-file-link"
                    key={`${change.id}:${file.path}`}
                    title={`打开 ${file.path} 的 ChangeSet Diff`}
                    onClick={() => openChangeSetDiff(change, file.path)}
                  >
                    <FileCode2 />
                    <span>{file.path}</span>
                  </button>
                ))}
                {change.rejectionFeedback && (
                  <details
                    className="changeset-review-feedback"
                    data-review-feedback-id={change.rejectionFeedback.id}
                  >
                    <summary>审核意见 · 已记录</summary>
                    <p>{change.rejectionFeedback.reason}</p>
                    <code title={change.rejectionFeedback.id}>
                      {change.rejectionFeedback.id}
                    </code>
                  </details>
                )}
                <footer>
                  {change.status === 'awaitingApproval' && (
                    <>
                      <button
                        data-change-action="reject"
                        onClick={() => setChangeReview(change)}
                      >
                        拒绝
                      </button>
                      <button
                        onClick={() => runChangeSetAction(change, 'approve')}
                      >
                        批准
                      </button>
                    </>
                  )}
                  {change.status === 'rejected' &&
                    !change.rejectionFeedback && (
                      <button
                        data-change-action="feedback"
                        onClick={() => setChangeReview(change)}
                      >
                        补充审核意见
                      </button>
                    )}
                  {change.status === 'approved' && (
                    <button onClick={() => runChangeSetAction(change, 'apply')}>
                      应用
                    </button>
                  )}
                  {change.status === 'applied' && (
                    <button onClick={() => runChangeSetAction(change, 'test')}>
                      测试
                    </button>
                  )}
                  {['applied', 'tested', 'failed'].includes(change.status) && (
                    <button
                      onClick={() => runChangeSetAction(change, 'rollback')}
                    >
                      回滚
                    </button>
                  )}
                </footer>
              </article>
            ))}
            {changeSets.length === 0 && (
              <small className="scm-empty">没有待审查的 AI 变更。</small>
            )}
          </section>
        </div>
      );
    }
    if (activity === 'assets')
      return (
        <div className="side-tool asset-workflow">
          <button
            onClick={() =>
              void guarded(async () => {
                const imported = unwrap(
                  await window.aiGameStudio.workspace.importAsset(),
                );
                if (imported) setWorkspace(imported.snapshot);
              })
            }
          >
            <Image /> 导入资源
          </button>
          <button onClick={scanMissingResources}>
            <CircleAlert /> 扫描缺失引用
          </button>
          <section className="asset-generation-form">
            <header>
              <Sparkles />
              <div>
                <strong>AI 资源生成</strong>
                <small>候选先进入草稿，审阅后才写入资源清单</small>
              </div>
            </header>
            <select
              aria-label="资源生成 Provider"
              value={assetJobDraft.providerId}
              onChange={(event) => {
                const provider = assetProviders.find(
                  (item) => item.id === event.target.value,
                );
                const credentialRef =
                  credentials.find(
                    (credential) => credential.provider === provider?.id,
                  )?.id ?? '';
                const discovered = providerCatalogModels(
                  modelCatalogs[credentialRef],
                  provider?.id ?? '',
                  credentialRef,
                  assetJobCapability,
                )[0];
                const model = provider?.models.find(
                  (item) => item.kind === assetJobDraft.kind,
                );
                if (!provider) return;
                const isLocal = provider.id === 'local-placeholder';
                assetJobManualModelRef.current = false;
                setAssetJobManualModel(false);
                setAssetJobDraft((current) => ({
                  ...current,
                  providerId: provider.id,
                  credentialRef,
                  modelId: isLocal ? (model?.id ?? '') : (discovered?.id ?? ''),
                  parameters: model
                    ? structuredClone(model.defaults)
                    : current.parameters,
                  variants: model
                    ? Math.min(current.variants, model.maxVariants)
                    : current.variants,
                  outputName:
                    (model?.kind ?? current.kind) === 'image'
                      ? 'generated-asset.png'
                      : 'generated-audio.wav',
                }));
                if (credentialRef)
                  void refreshCredentialModels(provider.id, credentialRef);
              }}
            >
              {assetProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.id}
                  {provider.testOnly
                    ? ' · 仅测试'
                    : provider.paid
                      ? ' · 付费'
                      : ''}
                </option>
              ))}
            </select>
            <label>
              调用凭证
              <select
                aria-label="资源生成调用凭证"
                disabled={assetJobDraft.providerId === 'local-placeholder'}
                value={
                  assetJobDraft.providerId === 'local-placeholder'
                    ? ''
                    : assetJobCredentialId
                }
                onChange={(event) => {
                  const credentialRef = event.target.value;
                  const discovered = providerCatalogModels(
                    modelCatalogs[credentialRef],
                    assetJobDraft.providerId,
                    credentialRef,
                    assetJobCapability,
                  )[0];
                  assetJobManualModelRef.current = false;
                  setAssetJobManualModel(false);
                  setAssetJobDraft((current) => ({
                    ...current,
                    credentialRef,
                    modelId: discovered?.id ?? '',
                  }));
                  void refreshCredentialModels(
                    assetJobDraft.providerId,
                    credentialRef,
                  );
                }}
              >
                <option value="">
                  {assetJobDraft.providerId === 'local-placeholder'
                    ? '不需要凭证'
                    : '选择凭证'}
                </option>
                {assetJobCredentials.map((credential) => (
                  <option key={credential.id} value={credential.id}>
                    {credential.label}
                  </option>
                ))}
              </select>
              {assetJobDraft.providerId !== 'local-placeholder' && (
                <button
                  disabled={
                    !assetJobCredentialId ||
                    modelCatalogLoading.includes(assetJobCredentialId)
                  }
                  onClick={() =>
                    void refreshCredentialModels(
                      assetJobDraft.providerId,
                      assetJobCredentialId,
                      true,
                    )
                  }
                >
                  <RotateCcw />
                  {modelCatalogLoading.includes(assetJobCredentialId)
                    ? '读取模型中'
                    : '刷新供应商模型'}
                </button>
              )}
            </label>
            {assetProviders
              .filter((provider) => provider.id === assetJobDraft.providerId)
              .map((provider) => (
                <div
                  className={`provider-health ${provider.available ? 'ready' : 'unavailable'}`}
                  key={provider.id}
                >
                  <strong>{provider.available ? '可用' : '不可用'}</strong>
                  <small>{provider.reason}</small>
                  <span>
                    {assetJobModelOptions.length} 个当前能力模型 ·
                    凭证配置存于用户安全存储
                  </span>
                </div>
              ))}
            <select
              aria-label="资源类型"
              value={assetJobDraft.kind}
              onChange={(event) => {
                const kind = event.target.value as AssetGenerationCapability;
                const provider = assetProviders.find(
                  (item) => item.id === assetJobDraft.providerId,
                );
                const capability = kind;
                const discovered = providerCatalogModels(
                  modelCatalogs[assetJobCredentialId],
                  assetJobDraft.providerId,
                  assetJobCredentialId,
                  capability,
                )[0];
                const model = provider?.models.find(
                  (item) => item.kind === kind,
                );
                assetJobManualModelRef.current = false;
                setAssetJobManualModel(false);
                setAssetJobDraft((current) => ({
                  ...current,
                  kind,
                  modelId:
                    current.providerId === 'local-placeholder'
                      ? (model?.id ?? '')
                      : (discovered?.id ?? ''),
                  parameters: model
                    ? structuredClone(model.defaults)
                    : current.parameters,
                  variants: model
                    ? Math.min(current.variants, model.maxVariants)
                    : current.variants,
                  outputName:
                    kind === 'image'
                      ? 'generated-asset.png'
                      : 'generated-audio.wav',
                }));
              }}
            >
              <option value="image">图片</option>
              <option value="soundEffect">游戏音效</option>
              <option value="music">音乐</option>
              <option value="speechGeneration">语音生成</option>
            </select>
            <label
              className="asset-generation-model-field"
              data-model-source={assetJobModelSource}
            >
              <span className="asset-generation-model-heading">
                <span>模型</span>
                {!assetJobIsLocal && (
                  <button
                    type="button"
                    className="model-mode-button"
                    disabled={
                      !assetJobCredentialId ||
                      (assetJobUsesManualModel &&
                        assetJobModelOptions.length === 0)
                    }
                    onClick={() => {
                      const manual = !assetJobUsesManualModel;
                      assetJobManualModelRef.current = manual;
                      setAssetJobManualModel(manual);
                      if (!manual) {
                        setAssetJobDraft((current) => ({
                          ...current,
                          modelId: assetJobModelOptions[0]?.id ?? '',
                        }));
                      }
                    }}
                  >
                    {assetJobUsesManualModel ? '使用接口目录' : '手动模型 ID'}
                  </button>
                )}
              </span>
              {assetJobUsesManualModel ? (
                <input
                  className="asset-generation-model-manual"
                  aria-label="资源生成手动模型 ID"
                  placeholder="输入供应商接受的模型 ID"
                  value={assetJobDraft.modelId}
                  onChange={(event) => {
                    assetJobManualModelRef.current = true;
                    setAssetJobManualModel(true);
                    setAssetJobDraft((current) => ({
                      ...current,
                      modelId: event.target.value,
                    }));
                  }}
                />
              ) : (
                <select
                  className="asset-generation-model"
                  aria-label="资源生成供应商接口模型"
                  disabled={
                    !assetJobIsLocal &&
                    (!assetJobCredentialId || assetJobCatalogLoading)
                  }
                  value={assetJobModelInCatalog ? assetJobDraft.modelId : ''}
                  onChange={(event) => {
                    const model = assetJobStaticModels.find(
                      (item) => item.id === event.target.value,
                    );
                    setAssetJobDraft((current) => ({
                      ...current,
                      modelId: event.target.value,
                      parameters: model
                        ? structuredClone(model.defaults)
                        : current.parameters,
                      variants: model
                        ? Math.min(current.variants, model.maxVariants)
                        : current.variants,
                    }));
                  }}
                >
                  <option value="">
                    {assetJobCatalogLoading
                      ? '正在读取供应商模型…'
                      : assetJobModelOptions.length === 0
                        ? '没有接口返回的兼容模型'
                        : '选择接口返回的模型'}
                  </option>
                  {assetJobModelOptions.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label === model.id
                        ? model.id
                        : `${model.label} · ${model.id}`}
                    </option>
                  ))}
                </select>
              )}
              <small className="asset-generation-model-source">
                {assetJobIsLocal
                  ? `来源：内置本地测试目录 · ${assetJobModelOptions.length} 个模型`
                  : assetJobUsesManualModel
                    ? assetJobManualModel
                      ? '来源：手动模型 ID · 不作为接口返回模型显示'
                      : '当前项目值（供应商接口未返回）· 已进入手动模式'
                    : assetJobCatalogError
                      ? `供应商接口读取失败：${assetJobCatalogError}`
                      : assetJobCatalogLoading
                        ? '正在调用供应商模型目录接口'
                        : assetJobCatalog
                          ? `来源：供应商接口 · 当前能力 ${assetJobModelOptions.length} / 全部 ${assetJobCatalog.models.length} · ${providerCatalogTime(assetJobCatalog.fetchedAt)}`
                          : '尚未读取供应商模型目录'}
              </small>
              {assetProviders
                .find((item) => item.id === assetJobDraft.providerId)
                ?.models.filter((model) => model.id === assetJobDraft.modelId)
                .map((model) => (
                  <small key={model.id}>
                    {model.costConfigured
                      ? `项目估价：¥${model.costPerCandidateCny.toFixed(2)}/候选`
                      : '未配置人民币估价 · 费用以供应商账单为准'}
                  </small>
                ))}
              {!assetJobIsLocal &&
                !assetJobStaticModels.some(
                  (model) => model.id === assetJobDraft.modelId,
                ) && <small>当前无本地估价，费用以供应商账单为准</small>}
            </label>
            {assetJobDraft.kind === 'image' ? (
              <label>
                输出尺寸
                <input
                  aria-label="图片输出尺寸"
                  value={String(assetJobDraft.parameters.size ?? '1280*1280')}
                  onChange={(event) =>
                    setAssetJobDraft((current) => ({
                      ...current,
                      parameters: {
                        ...current.parameters,
                        size: event.target.value,
                      },
                    }))
                  }
                />
              </label>
            ) : assetJobDraft.kind === 'speechGeneration' ? (
              <label>
                音色 ID
                <input
                  aria-label="百炼音色 ID"
                  value={String(
                    assetJobDraft.parameters.voice ?? 'longanhuan_v3.6',
                  )}
                  onChange={(event) =>
                    setAssetJobDraft((current) => ({
                      ...current,
                      parameters: {
                        ...current.parameters,
                        voice: event.target.value,
                      },
                    }))
                  }
                />
              </label>
            ) : assetJobDraft.kind === 'soundEffect' ? (
              <label>
                音效时长（秒）
                <input
                  aria-label="音效时长"
                  type="number"
                  min="0.5"
                  max="30"
                  step="0.5"
                  value={Number(assetJobDraft.parameters.durationSeconds ?? 1)}
                  onChange={(event) =>
                    setAssetJobDraft((current) => ({
                      ...current,
                      parameters: {
                        ...current.parameters,
                        durationSeconds: event.target.valueAsNumber,
                      },
                    }))
                  }
                />
              </label>
            ) : (
              <label>
                音乐时长（毫秒）
                <input
                  aria-label="音乐时长"
                  type="number"
                  min="3000"
                  max="600000"
                  step="1000"
                  value={Number(
                    assetJobDraft.parameters.musicLengthMs ?? 30000,
                  )}
                  onChange={(event) =>
                    setAssetJobDraft((current) => ({
                      ...current,
                      parameters: {
                        ...current.parameters,
                        musicLengthMs: event.target.valueAsNumber,
                      },
                    }))
                  }
                />
              </label>
            )}
            <textarea
              aria-label="资源提示词"
              value={assetJobDraft.prompt}
              placeholder="描述资源内容、构图、风格和透明背景要求"
              onChange={(event) =>
                setAssetJobDraft((current) => ({
                  ...current,
                  prompt: event.target.value,
                }))
              }
            />
            <input
              aria-label="资源输出名"
              value={assetJobDraft.outputName}
              onChange={(event) =>
                setAssetJobDraft((current) => ({
                  ...current,
                  outputName: event.target.value,
                }))
              }
            />
            <label>
              候选数
              <input
                type="number"
                min="1"
                max="4"
                value={assetJobDraft.variants}
                onChange={(event) =>
                  setAssetJobDraft((current) => ({
                    ...current,
                    variants: event.target.valueAsNumber,
                  }))
                }
              />
            </label>
            <button
              disabled={
                !assetJobDraft.prompt.trim() ||
                !assetJobDraft.modelId.trim() ||
                (assetJobDraft.providerId !== 'local-placeholder' &&
                  !assetJobCredentialId)
              }
              onClick={submitAssetJob}
            >
              创建生成任务
            </button>
          </section>
          <section className="asset-job-browser" aria-label="生成任务筛选">
            <header>
              <strong>生成任务</strong>
              <small>
                显示 {visibleAssetJobs.length} / {assetJobs.length}
              </small>
            </header>
            <fieldset aria-label="按任务状态筛选">
              {assetJobViews.map((view) => (
                <button
                  key={view.id}
                  aria-label={`${view.label}任务 ${assetJobViewCounts[view.id]} 个`}
                  aria-pressed={assetJobView === view.id}
                  onClick={() => setAssetJobView(view.id)}
                >
                  <span>{view.label}</span>
                  <output>{assetJobViewCounts[view.id]}</output>
                </button>
              ))}
            </fieldset>
          </section>
          {visibleAssetJobs.length === 0 && (
            <output className="asset-job-empty">
              当前筛选没有任务；可切换“全部”查看历史记录。
            </output>
          )}
          {visibleAssetJobs.map((job) => (
            <article
              className="asset-job-card"
              key={job.id}
              data-status={job.status}
            >
              <header>
                <strong>{job.outputName}</strong>
                <span>{job.status}</span>
              </header>
              <small>
                {job.providerId} · {job.modelId} · {job.kind} ·{' '}
                {job.costEstimateConfigured
                  ? `预估 ¥${Number(job.estimatedCostCny ?? 0).toFixed(2)}`
                  : '费用以供应商账单为准'}
              </small>
              <small>
                {job.progress.message} · 尝试 {job.attemptHistory.length} 次 ·
                幂等键 {job.idempotencyKey}
              </small>
              {typeof job.progress.fraction === 'number' && (
                <progress
                  aria-label={`${job.outputName} 生成进度`}
                  max={1}
                  value={job.progress.fraction}
                />
              )}
              <p>{job.prompt}</p>
              <small>参数：{JSON.stringify(job.parameters)}</small>
              {job.failure && (
                <code>
                  {job.failure.category} · {job.failure.code} ·{' '}
                  {job.failure.message}
                </code>
              )}
              <div className="asset-job-actions">
                {['queued', 'awaitingApproval'].includes(job.status) && (
                  <button onClick={() => runAssetJob(job)}>运行生成</button>
                )}
                {job.status === 'running' && (
                  <button
                    onClick={() =>
                      void guarded(async () => {
                        unwrap(
                          await window.aiGameStudio.workspace.assetJobs.cancel(
                            job.id,
                          ),
                        );
                        await refreshAssetJobs();
                      })
                    }
                  >
                    取消
                  </button>
                )}
                {['failed', 'cancelled'].includes(job.status) && (
                  <button
                    disabled={job.failure?.category === 'timeout-ambiguous'}
                    onClick={() => runAssetJob(job, true)}
                  >
                    重试
                  </button>
                )}
                {job.failure?.category === 'timeout-ambiguous' && (
                  <>
                    <button
                      onClick={() =>
                        void guarded(async () => {
                          unwrap(
                            await window.aiGameStudio.workspace.assetJobs.reconcile(
                              job.id,
                              'confirmed-not-run',
                            ),
                          );
                          await refreshAssetJobs();
                        })
                      }
                    >
                      确认原请求未执行
                    </button>
                    <button
                      onClick={() =>
                        void guarded(async () => {
                          if (
                            !window.confirm(
                              '确认供应商已执行原请求？确认后会继续禁止重复调用，等待找回原结果。',
                            )
                          )
                            return;
                          unwrap(
                            await window.aiGameStudio.workspace.assetJobs.reconcile(
                              job.id,
                              'confirmed-run',
                            ),
                          );
                          await refreshAssetJobs();
                        })
                      }
                    >
                      确认原请求已执行
                    </button>
                  </>
                )}
              </div>
              {job.candidates.length > 0 && (
                <div className="asset-candidates">
                  {job.candidates.map((candidate) => (
                    <div key={candidate.id}>
                      {assetCandidatePreviews[candidate.id] &&
                      candidate.mime.startsWith('audio/') ? (
                        // Draft music/SFX can have no speech transcript.
                        // oxlint-disable-next-line jsx-a11y/media-has-caption
                        <audio
                          controls
                          aria-label={`试听音频候选 ${candidate.path}`}
                          preload="metadata"
                          src={assetCandidatePreviews[candidate.id]}
                        />
                      ) : assetCandidatePreviews[candidate.id] ? (
                        // oxlint-disable-next-line next/no-img-element
                        <img
                          src={assetCandidatePreviews[candidate.id]}
                          alt={candidate.path}
                        />
                      ) : (
                        <Image />
                      )}
                      <small>{candidate.path}</small>
                      <small>
                        {candidate.media.kind === 'image'
                          ? `${candidate.media.width}×${candidate.media.height} · ${candidate.media.format} · ${candidate.media.hasAlpha ? '透明通道' : '无透明通道'}`
                          : `${(candidate.media.durationMs / 1000).toFixed(2)}s · ${candidate.media.codec} · ${candidate.media.sampleRateHz}Hz · ${candidate.media.channels}ch`}
                      </small>
                      <small>
                        SHA-256 {candidate.sha256.slice(0, 12)}… ·{' '}
                        {candidate.reviewState}
                      </small>
                      {candidate.recommendation?.recommended && (
                        <small>
                          Copilot 推荐：
                          {candidate.recommendation.reasons.join('；')}
                        </small>
                      )}
                      <button
                        disabled={
                          job.status === 'imported' ||
                          job.status === 'awaitingImportApproval' ||
                          candidate.reviewState === 'rejected'
                        }
                        onClick={() =>
                          selectAssetCandidate(job.id, candidate.id)
                        }
                      >
                        {job.status === 'awaitingImportApproval' &&
                        job.selectedCandidateId === candidate.id
                          ? '等待 ChangeSet 审批'
                          : job.selectedCandidateId === candidate.id &&
                              job.status === 'imported'
                            ? '已导入'
                            : '选择并提议导入'}
                      </button>
                      <button
                        disabled={
                          candidate.reviewState === 'rejected' ||
                          job.status === 'imported'
                        }
                        onClick={() =>
                          rejectAssetCandidate(job.id, candidate.id)
                        }
                      >
                        拒绝
                      </button>
                      <button
                        disabled={
                          candidate.reviewState !== 'rejected' ||
                          job.status === 'imported'
                        }
                        onClick={() =>
                          regenerateAssetCandidate(job.id, candidate.id)
                        }
                      >
                        按意见再生成
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
          <h3>已导入资源</h3>
          {workspace.assets.map((asset, index) => {
            const assetId =
              typeof asset.id === 'string' ? asset.id : `asset-${index}`;
            const path = typeof asset.path === 'string' ? asset.path : null;
            const file = path
              ? workspace.files.find((candidate) => candidate.path === path)
              : undefined;
            return (
              <button
                key={assetId}
                onClick={() => file && void openFile(file)}
                title={path ?? assetId}
              >
                <Image />
                <span>{path ?? assetId}</span>
                <small>{displayValue(asset.status ?? 'unknown')}</small>
              </button>
            );
          })}
          {missingResources.map((missing) => (
            <button
              key={missing.path}
              className="missing-resource"
              onClick={() => repairMissingResource(missing.path)}
            >
              <CircleAlert />
              <span>{missing.path}</span>
              <small>{missing.referencedBy.length} 个引用 · 点击修复</small>
            </button>
          ))}
        </div>
      );
    if (activity === 'tests')
      return (
        <div className="side-tool">
          <button onClick={runAllTests}>
            <TestTube2 /> 运行全部测试
          </button>
          {workspace.files
            .filter((file) => file.kind === 'test')
            .map((file) => (
              <div
                className="test-case"
                key={file.path}
                data-status={currentTestRun(file.path)?.status ?? 'idle'}
                data-test-path={file.path}
              >
                <button onClick={() => void openFile(file)}>{file.path}</button>
                <button
                  aria-label={`运行 ${file.path}`}
                  disabled={currentTestRun(file.path)?.status === 'running'}
                  onClick={() => void guarded(() => runTest(file.path))}
                >
                  <Play />
                </button>
                <small>
                  {testStatusLabel(currentTestRun(file.path)?.status)}
                  {currentTestRun(file.path)?.durationMs !== undefined
                    ? ` · ${currentTestRun(file.path)!.durationMs!.toFixed(1)} ms`
                    : ''}
                </small>
              </div>
            ))}
        </div>
      );
    if (activity === 'build')
      return (
        <div className="side-tool">
          <p>
            <Wrench /> Windows 构建
          </p>
          <button
            disabled={buildActive}
            onClick={() =>
              void guarded(async () => {
                setBuildActive(true);
                try {
                  const report = unwrap(
                    await window.aiGameStudio.workspace.builds.run(
                      'development',
                    ),
                  );
                  appendConsole(`[build] ${report.packageName} ready`);
                  openBuildReport(
                    'development',
                    report as unknown as Record<string, unknown>,
                  );
                } finally {
                  setBuildActive(false);
                }
              })
            }
          >
            Development
          </button>
          <button
            disabled={buildActive}
            onClick={() =>
              void guarded(async () => {
                setBuildActive(true);
                try {
                  const report = unwrap(
                    await window.aiGameStudio.workspace.builds.run('release'),
                  );
                  appendConsole(`[build] ${report.packageName} ready`);
                  openBuildReport(
                    'release',
                    report as unknown as Record<string, unknown>,
                  );
                } finally {
                  setBuildActive(false);
                }
              })
            }
          >
            Release
          </button>
          {(['development', 'release'] as const).map((profile) => (
            <button
              key={profile}
              data-verify-package={profile}
              disabled={buildActive}
              onClick={() =>
                void guarded(async () => {
                  setBuildActive(true);
                  setPackageFeedback({
                    status: 'running',
                    text: `正在验证 ${profile} ZIP、启动自检与原生窗口…`,
                  });
                  try {
                    const report = unwrap(
                      await window.aiGameStudio.workspace.builds.readReport(
                        profile,
                      ),
                    );
                    if (!report.zipSha256)
                      throw new Error('构建报告缺少 ZIP 哈希，请先重新构建。');
                    const verification = unwrap(
                      await window.aiGameStudio.workspace.builds.verify(
                        profile,
                        report.zipSha256,
                      ),
                    );
                    openBuildReport(profile, { ...report, verification });
                    setPackageFeedback({
                      status: 'passed',
                      text: `${profile} 包验证通过：文件哈希、启动自检、5 帧原生渲染。完整玩法与听审仍需单独验证。`,
                    });
                  } catch (error) {
                    setPackageFeedback({
                      status: 'failed',
                      text:
                        error instanceof Error ? error.message : String(error),
                    });
                  } finally {
                    setBuildActive(false);
                  }
                })
              }
            >
              验证现有 {profile === 'release' ? 'Release' : 'Development'} 包
            </button>
          ))}
          <output
            className="package-verification-feedback"
            data-status={packageFeedback.status}
          >
            {packageFeedback.text}
          </output>
        </div>
      );
    if (activity === 'extensions')
      return (
        <div className="side-tool">
          <p>
            <Boxes /> 引擎能力
          </p>
          {['2d', '3d', 'ui'].map((capability) => {
            const descriptor = (workspace.capabilities ?? []).find(
              (candidate) => candidate.id === capability,
            );
            const enabled = Boolean(descriptor);
            return (
              <article
                className="capability-card"
                key={capability}
                data-enabled={enabled}
              >
                <header>
                  <Cpu />
                  <strong>{capability.toUpperCase()}</strong>
                  <small>{enabled ? '健康 · ready' : '未启用'}</small>
                </header>
                <p>
                  {enabled
                    ? `${String(descriptor?.runtimeAdapter)} · ${String(descriptor?.rendererAdapter)}`
                    : '启用后写入 project.aigame.json，并立即刷新 Component、MCP 与 Skill 能力。'}
                </p>
                <button
                  onClick={() =>
                    void guarded(async () => {
                      await execute('capability.set', {
                        id: capability,
                        enabled: !enabled,
                      });
                    })
                  }
                >
                  {enabled ? '停用' : '启用'}
                </button>
              </article>
            );
          })}
          <small>
            高级 PBR、骨骼动画、地形、导航与联网在 0.3.0 Preview 中不可用。
          </small>
        </div>
      );
    return (
      <div className="side-tool settings-nav">
        {(['studio', 'project', 'agent', 'ai-tools'] as const).map((scope) => (
          <button
            className={settingsScope === scope ? 'selected' : ''}
            key={scope}
            onClick={() => {
              setSettingsScope(scope);
              setActiveDocument('studio://settings');
              if (
                !documents.some(
                  (document) => document.path === 'studio://settings',
                )
              )
                setDocuments((current) => [
                  ...current,
                  {
                    path: 'studio://settings',
                    title: '设置',
                    kind: 'overview',
                    pinned: true,
                  },
                ]);
            }}
          >
            {scope === 'studio'
              ? 'Studio 设置'
              : scope === 'project'
                ? '项目设置'
                : scope === 'agent'
                  ? 'Agent 设置'
                  : 'AI 工具'}
          </button>
        ))}
      </div>
    );
  };

  const renderSettings = () => {
    const selectedCredentialProvider = credentialProviders.find(
      (provider) => provider.id === credentialDraft.provider,
    );
    const credentialDraftComplete = Boolean(
      selectedCredentialProvider &&
      credentialDraft.label.trim() &&
      selectedCredentialProvider.fields.every(
        (field) => !field.required || credentialDraft.fields[field.id]?.trim(),
      ),
    );
    const generationProviderIds = [
      ...credentialProviders.map((provider) => provider.id),
      ...assetProviders
        .filter((provider) => provider.testOnly)
        .map((provider) => provider.id),
    ].filter(
      (providerId, index, values) => values.indexOf(providerId) === index,
    );
    const modelsForTool = (
      tool: GenerationToolDefinition,
      providerId: string,
      credentialId: string,
    ): ProviderModelDescriptor[] => {
      if (providerId !== 'local-placeholder')
        return providerCatalogModels(
          modelCatalogs[credentialId],
          providerId,
          credentialId,
          tool.id,
        );
      if (!tool.modelKind) return [];
      return (
        assetProviders
          .find((provider) => provider.id === providerId)
          ?.models.filter((model) => model.kind === tool.modelKind)
          .map((model) => ({
            id: model.id,
            label: model.label,
            author: providerId,
            capabilities: [tool.id],
          })) ?? []
      );
    };

    return (
      <div className="settings-editor">
        <header>
          <Settings />
          <div>
            <h2>
              {settingsScope === 'studio'
                ? 'Studio 设置'
                : settingsScope === 'project'
                  ? '项目设置'
                  : settingsScope === 'agent'
                    ? 'Agent 设置'
                    : 'AI 工具'}
            </h2>
            <p>
              {settingsScope === 'studio'
                ? '全局用户作用域 · 保存在系统应用数据目录'
                : settingsScope === 'project'
                  ? '版本化项目作用域 · 可由人类和 Codex 审查'
                  : settingsScope === 'agent'
                    ? '模型、权限、上下文、Goal 与 Plan 默认值'
                    : 'MCP、Skills、生成提供商与系统凭据引用'}
            </p>
          </div>
        </header>
        {settingsScope === 'studio' && (
          <>
            <label>
              <span>
                界面语言
                <small>
                  0.3.0 Preview 仅提供简体中文；其他语言明确不可用。
                </small>
              </span>
              <select
                value={settingString('locale', 'zh-CN')}
                disabled
                title="0.3.0 Preview 仅提供简体中文界面"
              >
                <option value="zh-CN">简体中文</option>
              </select>
            </label>
            <label>
              <span>
                自动保存<small>切换文档或失去焦点时保存。</small>
              </span>
              <select
                value={settingString('autosave', 'off')}
                onChange={(event) =>
                  void updateSetting('autosave', event.target.value)
                }
              >
                <option value="off">关闭</option>
                <option value="focus">失去焦点</option>
                <option value="delay">延迟保存</option>
              </select>
            </label>
          </>
        )}
        {settingsScope === 'project' && (
          <>
            <label>
              <span>
                固定 Tick 频率<small>权威模拟每秒执行次数。</small>
              </span>
              <input
                type="number"
                min="1"
                max="1000"
                value={Number(settings?.values.tickRate ?? 60)}
                onChange={(event) =>
                  void updateSetting('tickRate', event.target.valueAsNumber)
                }
              />
            </label>
            <label>
              <span>
                启动 Scene<small>运行 Game 时首先载入。</small>
              </span>
              <input
                value={settingString('startupScene', '')}
                onChange={(event) =>
                  void updateSetting('startupScene', event.target.value)
                }
              />
            </label>
            <label>
              <span>
                Renderer adapter
                <small>
                  Studio 预览使用 WebGL2，Player 使用 wgpu；共享
                  RenderSnapshot。
                </small>
              </span>
              <select disabled title="0.3.0 Preview 的渲染适配器固定">
                <option>WebGL2 / wgpu（固定）</option>
              </select>
            </label>
            <label>
              <span>
                构建目标
                <small>0.3.0 Preview 只交付 Windows x86_64。</small>
              </span>
              <select disabled title="其他导出目标尚未交付">
                <option>Windows x86_64（固定）</option>
              </select>
            </label>
          </>
        )}
        {settingsScope === 'agent' && (
          <>
            <label>
              <span>
                Agent 默认模式
                <small>新对话使用 Ask、Plan、Agent 或 Goal。</small>
              </span>
              <select
                value={settingString('defaultMode', 'agent')}
                onChange={(event) =>
                  void updateSetting('defaultMode', event.target.value)
                }
              >
                <option value="ask">Ask</option>
                <option value="plan">Plan</option>
                <option value="agent">Agent</option>
                <option value="goal">Goal</option>
              </select>
            </label>
            <label>
              <span>
                审批策略<small>AI 写入必须走可审查 ChangeSet。</small>
              </span>
              <select
                value={settingString('approvalPolicy', 'on-request')}
                onChange={(event) =>
                  void updateSetting('approvalPolicy', event.target.value)
                }
              >
                <option value="on-request">按需审批</option>
                <option value="never">只读</option>
              </select>
            </label>
            <label>
              <span>
                推理强度<small>新 turn 的默认 reasoning effort。</small>
              </span>
              <select
                value={settingString('reasoningEffort', 'medium')}
                onChange={(event) =>
                  void updateSetting('reasoningEffort', event.target.value)
                }
              >
                {['low', 'medium', 'high', 'xhigh'].map((effort) => (
                  <option key={effort} value={effort}>
                    {effort}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>
                Goal token budget<small>留空表示不限制项目 Goal。</small>
              </span>
              <input
                type="number"
                min="1"
                value={Number(settings?.values.goalTokenBudget ?? 0) || ''}
                placeholder="不限制"
                onChange={(event) =>
                  void updateSetting(
                    'goalTokenBudget',
                    event.target.value ? event.target.valueAsNumber : null,
                  )
                }
              />
            </label>
            <label>
              <span>
                Goal 模式<small>控制 Copilot 是否允许新建持久 Goal。</small>
              </span>
              <select
                value={settings?.values.goalEnabled === false ? 'off' : 'on'}
                onChange={(event) =>
                  void updateSetting('goalEnabled', event.target.value === 'on')
                }
              >
                <option value="on">启用</option>
                <option value="off">停用</option>
              </select>
            </label>
            <label>
              <span>
                显示 Plan<small>控制 Copilot 顶部是否显示执行计划。</small>
              </span>
              <select
                value={settings?.values.planVisible === false ? 'off' : 'on'}
                onChange={(event) =>
                  void updateSetting('planVisible', event.target.value === 'on')
                }
              >
                <option value="on">显示</option>
                <option value="off">隐藏</option>
              </select>
            </label>
            <label>
              <span>
                上下文范围<small>选择默认附加项目、Scene 或当前文件。</small>
              </span>
              <select
                value={settingString('contextScope', 'project')}
                onChange={(event) =>
                  void updateSetting('contextScope', event.target.value)
                }
              >
                <option value="project">整个项目</option>
                <option value="scene">当前 Scene</option>
                <option value="file">当前文件</option>
              </select>
            </label>
          </>
        )}
        {settingsScope === 'ai-tools' && (
          <div className="ai-tools-settings">
            <section className="settings-section">
              <header className="settings-section-header">
                <div>
                  <strong>Agent 工具接入</strong>
                  <small>控制 Codex 是否获取引擎工具和项目工作流。</small>
                </div>
              </header>
              <label className="settings-field-row">
                <span>
                  Engine MCP
                  <small>切换后保留旧对话，新对话采用新配置。</small>
                </span>
                <select
                  value={settings?.values.mcpEnabled === false ? 'off' : 'on'}
                  onChange={(event) =>
                    void updateSetting(
                      'mcpEnabled',
                      event.target.value === 'on',
                    )
                  }
                >
                  <option value="on">启用</option>
                  <option value="off">停用</option>
                </select>
              </label>
              <label className="settings-field-row">
                <span>
                  项目 Skills<small>加载项目内引擎与美术工作流说明。</small>
                </span>
                <select
                  value={
                    settings?.values.projectSkillsEnabled === false
                      ? 'off'
                      : 'on'
                  }
                  onChange={(event) =>
                    void updateSetting(
                      'projectSkillsEnabled',
                      event.target.value === 'on',
                    )
                  }
                >
                  <option value="on">启用</option>
                  <option value="off">停用</option>
                </select>
              </label>
            </section>

            <section className="settings-section credential-vault-section">
              <header className="settings-section-header">
                <div>
                  <strong>凭证管理</strong>
                  <small>
                    选择供应商后填写对应表单；同一供应商可保存多个命名凭证。
                  </small>
                </div>
                <button
                  className="settings-section-action"
                  onClick={() => setShowCredentialManager((value) => !value)}
                >
                  {showCredentialManager ? '收起' : '管理凭据'}
                </button>
              </header>
              <p className="settings-section-summary">
                已保存 {credentials.length} 个凭据，密文不会写入游戏项目或传给
                Agent。
              </p>
              {showCredentialManager && (
                <div className="credential-manager">
                  <header>
                    <ShieldCheck />
                    <div>
                      <strong>系统安全凭据</strong>
                      <small>
                        密文保存在 Studio 用户目录，保存后不可回读。
                      </small>
                    </div>
                  </header>
                  {credentials.map((credential) => (
                    <div className="credential-row" key={credential.id}>
                      <div>
                        <strong>{credential.label}</strong>
                        <small>
                          {providerDisplayName(credential.provider)} ·{' '}
                          {credential.configuredSecretFields.join('、')} 已设置
                        </small>
                        {Object.entries(credential.configuration)
                          .filter(([, value]) => value)
                          .slice(0, 2)
                          .map(([key, value]) => (
                            <small key={key}>
                              {key}: {value}
                            </small>
                          ))}
                      </div>
                      <button onClick={() => removeCredential(credential.id)}>
                        <Trash2 /> 删除
                      </button>
                    </div>
                  ))}
                  {credentials.length === 0 && <p>尚未配置凭据。</p>}
                  <div className="credential-form">
                    <select
                      aria-label="凭据所属供应商"
                      value={credentialDraft.provider}
                      onChange={(event) => {
                        const providerId = event.target.value;
                        const definition = credentialProviders.find(
                          (provider) => provider.id === providerId,
                        );
                        setCredentialDraft((value) => ({
                          ...value,
                          provider: providerId,
                          fields: Object.fromEntries(
                            (definition?.fields ?? []).map((field) => [
                              field.id,
                              field.defaultValue ?? '',
                            ]),
                          ),
                        }));
                      }}
                    >
                      <option value="">选择供应商</option>
                      {credentialProviders.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="凭据名称"
                      placeholder="显示名称"
                      value={credentialDraft.label}
                      onChange={(event) =>
                        setCredentialDraft((value) => ({
                          ...value,
                          label: event.target.value,
                        }))
                      }
                    />
                    {selectedCredentialProvider && (
                      <div className="credential-provider-fields">
                        <p>{selectedCredentialProvider.description}</p>
                        {selectedCredentialProvider.fields.map((field) => (
                          <label key={field.id}>
                            <span>{field.label}</span>
                            {field.kind === 'select' ? (
                              <select
                                aria-label={field.label}
                                value={credentialDraft.fields[field.id] ?? ''}
                                onChange={(event) =>
                                  setCredentialDraft((value) => ({
                                    ...value,
                                    fields: {
                                      ...value.fields,
                                      [field.id]: event.target.value,
                                    },
                                  }))
                                }
                              >
                                {field.options?.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                aria-label={field.label}
                                type={
                                  field.kind === 'password'
                                    ? 'password'
                                    : 'text'
                                }
                                autoComplete="off"
                                placeholder={field.placeholder}
                                value={credentialDraft.fields[field.id] ?? ''}
                                onChange={(event) =>
                                  setCredentialDraft((value) => ({
                                    ...value,
                                    fields: {
                                      ...value.fields,
                                      [field.id]: event.target.value,
                                    },
                                  }))
                                }
                              />
                            )}
                          </label>
                        ))}
                        <small>
                          密钥保存后仅显示“已设置”，不会回读到界面。
                        </small>
                      </div>
                    )}
                    <button
                      disabled={!credentialDraftComplete || busy}
                      onClick={saveCredential}
                    >
                      <ShieldCheck /> 加密保存
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="settings-section generation-tools-section">
              <header className="settings-section-header">
                <div>
                  <strong>生成工具</strong>
                  <small>
                    供应商、调用凭证和模型分别选择；模型目录由所选供应商接口读取。
                  </small>
                </div>
              </header>
              <div className="generation-tool-list">
                {generationTools.map((tool) => {
                  const route = assetRoutes[tool.id];
                  const providerId = route?.providerId ?? '';
                  const providerCredentials = credentials.filter(
                    (credential) => credential.provider === providerId,
                  );
                  const credentialId = providerCredentials.some(
                    (credential) => credential.id === route?.credentialRef,
                  )
                    ? (route?.credentialRef ?? '')
                    : (providerCredentials[0]?.id ?? '');
                  const providerModels = modelsForTool(
                    tool,
                    providerId,
                    credentialId,
                  );
                  const isLocal = providerId === 'local-placeholder';
                  const catalog = credentialId
                    ? modelCatalogs[credentialId]
                    : undefined;
                  const loading = modelCatalogLoading.includes(credentialId);
                  const catalogError = modelCatalogErrors[credentialId];
                  const modelId = route?.modelId ?? '';
                  const modelInCatalog = providerModels.some(
                    (model) => model.id === modelId,
                  );
                  const usesManualModel =
                    !isLocal &&
                    (Boolean(manualGenerationModels[tool.id]) ||
                      Boolean(
                        modelId && (catalog || catalogError) && !modelInCatalog,
                      ));
                  const modelSource = isLocal
                    ? 'local-catalog'
                    : usesManualModel
                      ? 'manual'
                      : (catalog?.source ??
                        (catalogError ? 'error' : 'pending'));
                  const adapterReady = generationToolAdapterReady({
                    toolId: tool.id,
                    providerId,
                    modelId,
                    hasStaticModelKind: Boolean(
                      tool.modelKind &&
                      assetProviders
                        .find((provider) => provider.id === providerId)
                        ?.models.some((model) => model.kind === tool.modelKind),
                    ),
                  });
                  const canApply = Boolean(
                    providerId && modelId.trim() && (isLocal || credentialId),
                  );
                  return (
                    <div
                      className="generation-tool-row"
                      data-tool-capability={tool.id}
                      key={tool.id}
                    >
                      <div>
                        <strong>{tool.label}</strong>
                        <small>{tool.description}</small>
                      </div>
                      <div className="generation-tool-control">
                        <label>
                          <span>供应商</span>
                          <select
                            className="generation-tool-provider"
                            aria-label={`${tool.label}供应商`}
                            value={providerId}
                            onChange={(event) => {
                              const nextProviderId = event.target.value;
                              const nextCredentialId =
                                credentials.find(
                                  (credential) =>
                                    credential.provider === nextProviderId,
                                )?.id ?? '';
                              const nextModels = modelsForTool(
                                tool,
                                nextProviderId,
                                nextCredentialId,
                              );
                              manualGenerationModelsRef.current = {
                                ...manualGenerationModelsRef.current,
                                [tool.id]: false,
                              };
                              setManualGenerationModels((current) => ({
                                ...current,
                                [tool.id]: false,
                              }));
                              setAssetRoutes((current) => ({
                                ...current,
                                [tool.id]: {
                                  providerId: nextProviderId,
                                  credentialRef: nextCredentialId || undefined,
                                  modelId: nextModels[0]?.id ?? '',
                                },
                              }));
                              if (nextCredentialId)
                                void refreshCredentialModels(
                                  nextProviderId,
                                  nextCredentialId,
                                );
                            }}
                          >
                            <option value="">选择供应商</option>
                            {generationProviderIds.map((candidate) => (
                              <option key={candidate} value={candidate}>
                                {providerDisplayName(candidate)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>调用凭证</span>
                          <select
                            className="generation-tool-credential"
                            aria-label={`${tool.label}调用凭证`}
                            disabled={!providerId || isLocal}
                            value={isLocal ? '' : credentialId}
                            onChange={(event) => {
                              const nextCredentialId = event.target.value;
                              const nextModels = modelsForTool(
                                tool,
                                providerId,
                                nextCredentialId,
                              );
                              manualGenerationModelsRef.current = {
                                ...manualGenerationModelsRef.current,
                                [tool.id]: false,
                              };
                              setManualGenerationModels((current) => ({
                                ...current,
                                [tool.id]: false,
                              }));
                              setAssetRoutes((current) => ({
                                ...current,
                                [tool.id]: {
                                  providerId,
                                  credentialRef: nextCredentialId,
                                  modelId: nextModels[0]?.id ?? '',
                                },
                              }));
                              void refreshCredentialModels(
                                providerId,
                                nextCredentialId,
                              );
                            }}
                          >
                            <option value="">
                              {isLocal ? '不需要凭证' : '选择凭证'}
                            </option>
                            {providerCredentials.map((credential) => (
                              <option key={credential.id} value={credential.id}>
                                {credential.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div
                          className="generation-tool-model-field"
                          data-model-source={modelSource}
                        >
                          <span className="generation-tool-model-heading">
                            <span>模型</span>
                            {!isLocal && (
                              <button
                                type="button"
                                className="model-mode-button"
                                disabled={
                                  !credentialId ||
                                  (usesManualModel &&
                                    providerModels.length === 0)
                                }
                                onClick={() => {
                                  const manual = !usesManualModel;
                                  manualGenerationModelsRef.current = {
                                    ...manualGenerationModelsRef.current,
                                    [tool.id]: manual,
                                  };
                                  setManualGenerationModels((current) => ({
                                    ...current,
                                    [tool.id]: manual,
                                  }));
                                  if (!manual) {
                                    setAssetRoutes((current) => ({
                                      ...current,
                                      [tool.id]: {
                                        providerId,
                                        credentialRef:
                                          credentialId || undefined,
                                        modelId: providerModels[0]?.id ?? '',
                                      },
                                    }));
                                  }
                                }}
                              >
                                {usesManualModel
                                  ? '使用接口目录'
                                  : '手动模型 ID'}
                              </button>
                            )}
                          </span>
                          {usesManualModel ? (
                            <input
                              className="generation-tool-model generation-tool-model-manual"
                              aria-label={`${tool.label}手动模型 ID`}
                              placeholder="输入供应商接受的模型 ID"
                              value={modelId}
                              onChange={(event) => {
                                manualGenerationModelsRef.current = {
                                  ...manualGenerationModelsRef.current,
                                  [tool.id]: true,
                                };
                                setManualGenerationModels((current) => ({
                                  ...current,
                                  [tool.id]: true,
                                }));
                                setAssetRoutes((current) => ({
                                  ...current,
                                  [tool.id]: {
                                    providerId,
                                    credentialRef: credentialId || undefined,
                                    modelId: event.target.value,
                                  },
                                }));
                              }}
                            />
                          ) : (
                            <select
                              className="generation-tool-model"
                              aria-label={`${tool.label}供应商接口模型`}
                              disabled={!isLocal && (!credentialId || loading)}
                              value={modelInCatalog ? modelId : ''}
                              onChange={(event) =>
                                setAssetRoutes((current) => ({
                                  ...current,
                                  [tool.id]: {
                                    providerId,
                                    credentialRef: credentialId || undefined,
                                    modelId: event.target.value,
                                  },
                                }))
                              }
                            >
                              <option value="">
                                {loading
                                  ? '正在读取供应商模型…'
                                  : providerModels.length === 0
                                    ? '没有接口返回的兼容模型'
                                    : '选择接口返回的模型'}
                              </option>
                              {providerModels.map((model) => (
                                <option key={model.id} value={model.id}>
                                  {model.label === model.id
                                    ? model.id
                                    : `${model.label} · ${model.id}`}
                                </option>
                              ))}
                            </select>
                          )}
                          <small className="generation-tool-model-source">
                            {isLocal
                              ? `来源：内置本地测试目录 · ${providerModels.length} 个模型`
                              : usesManualModel
                                ? manualGenerationModels[tool.id]
                                  ? '来源：手动模型 ID · 不作为接口返回模型显示'
                                  : '当前项目值（供应商接口未返回）· 已进入手动模式'
                                : catalogError
                                  ? `供应商接口读取失败：${catalogError}`
                                  : loading
                                    ? '正在调用供应商模型目录接口'
                                    : catalog
                                      ? `来源：供应商接口 · 当前能力 ${providerModels.length} / 全部 ${catalog.models.length} · ${providerCatalogTime(catalog.fetchedAt)}`
                                      : '尚未读取供应商模型目录'}
                          </small>
                        </div>
                        <div className="generation-tool-actions">
                          <button
                            disabled={!credentialId || loading || isLocal}
                            title="重新调用供应商模型列表接口"
                            onClick={() =>
                              void refreshCredentialModels(
                                providerId,
                                credentialId,
                                true,
                              )
                            }
                          >
                            <RotateCcw /> {loading ? '读取中' : '刷新模型'}
                          </button>
                          <button
                            disabled={!canApply || busy}
                            onClick={() =>
                              updateAssetRoute(tool.id, {
                                providerId,
                                credentialRef: credentialId || undefined,
                                modelId: modelId.trim(),
                              })
                            }
                          >
                            应用
                          </button>
                        </div>
                        <small
                          className={`generation-tool-status ${canApply && adapterReady ? 'ready' : 'unavailable'}`}
                          title={catalogError}
                        >
                          {!providerId
                            ? '请选择供应商'
                            : !isLocal && !credentialId
                              ? '该供应商还没有凭证'
                              : catalogError && !usesManualModel
                                ? '模型目录读取失败，可切换手动模型 ID'
                                : loading
                                  ? '正在从供应商读取模型目录'
                                  : !modelId
                                    ? `已发现 ${providerModels.length} 个兼容模型`
                                    : adapterReady
                                      ? usesManualModel
                                        ? '手动模型路由已就绪'
                                        : `已就绪 · ${providerModels.length} 个接口模型`
                                      : '路由可配置 · 执行适配器待接入'}
                        </small>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="settings-section generation-policy-section">
              <header className="settings-section-header">
                <div>
                  <strong>执行策略</strong>
                  <small>仅控制远程生成调用；候选素材导入仍可审阅。</small>
                </div>
              </header>
              <label className="settings-field-row">
                <span>
                  生成审批策略
                  <small>可选每次确认、预算内自动或全部自动。</small>
                </span>
                <select
                  aria-label="生成审批策略"
                  value={settingString('generationApprovalMode', 'always')}
                  onChange={(event) =>
                    void updateSetting(
                      'generationApprovalMode',
                      event.target.value,
                    )
                  }
                >
                  <option value="always">每次询问</option>
                  <option value="budget">预算内自动</option>
                  <option value="auto">自动执行</option>
                </select>
              </label>
              {settingString('generationApprovalMode', 'always') ===
                'budget' && (
                <label className="settings-field-row">
                  <span>
                    单任务自动批准上限
                    <small>未知价格的调用仍会等待确认。</small>
                  </span>
                  <input
                    aria-label="单任务自动批准上限"
                    type="number"
                    min="0"
                    step="0.1"
                    value={Number(
                      settings?.values.generationAutoApproveMaxCny ?? 1,
                    )}
                    onChange={(event) =>
                      void updateSetting(
                        'generationAutoApproveMaxCny',
                        Math.max(0, event.target.valueAsNumber || 0),
                      )
                    }
                  />
                </label>
              )}
            </section>
          </div>
        )}
        <button
          className="settings-reset"
          onClick={() => {
            if (window.confirm(`重置 ${settingsScope} 设置？`))
              void guarded(async () => {
                setSettings(
                  unwrap(
                    await window.aiGameStudio.settings.reset(settingsScope),
                  ),
                );
              });
          }}
        >
          <RotateCcw /> 重置当前作用域
        </button>
      </div>
    );
  };

  const renderCenter = () => {
    if (activeDocument === 'studio://settings') return renderSettings();
    if (activeDocument === 'studio://help') {
      return (
        <div className="help-editor">
          <header>
            <Sparkles />
            <div>
              <h1>Studio 工作区导览</h1>
              <p>
                所有开发动作都落到项目文件和语义命令；人类界面与 Codex
                操作同一份状态。
              </p>
            </div>
          </header>
          <div className="help-grid">
            <article>
              <strong>顶部标题栏</strong>
              <p>
                项目菜单、运行/暂停/停止和系统窗口控制；空白处可拖动，双击切换最大化。
              </p>
            </article>
            <article>
              <strong>左侧活动栏</strong>
              <p>切换项目文件、搜索、Git、资源、测试、构建、能力和设置。</p>
            </article>
            <article>
              <strong>Scene 大纲与项目文件</strong>
              <p>上方管理当前 Scene 对象层级；下方树是磁盘上的权威项目文件。</p>
            </article>
            <article>
              <strong>中央文档</strong>
              <p>
                Scene、Game、代码、Prefab、材质、Diff 和报告分别以标签页打开。
              </p>
            </article>
            <article>
              <strong>右侧 Inspector / Copilot</strong>
              <p>
                Inspector 编辑当前选择；Copilot 让 Codex 读取同一项目、调用
                Engine MCP 并提交 ChangeSet。
              </p>
            </article>
            <article>
              <strong>底部诊断与状态栏</strong>
              <p>
                查看 Console、Problems、Tests、Profiler、Event
                Timeline、运行状态与后台任务。
              </p>
            </article>
          </div>
        </div>
      );
    }
    if (activeTab?.kind === 'diff') {
      const diff = diffs[activeTab.path];
      if (diff) {
        const file = workspace.files.find(
          (candidate) => candidate.path === diff.path,
        );
        return (
          <DiffEditor
            {...diff}
            preferences={diffReviewPreferences}
            disabled={busy}
            actions={diffReviewActions(activeTab.path, diff)}
            onOpenFile={file ? () => void openFile(file) : undefined}
            onPreferencesChange={setDiffReviewPreferences}
          />
        );
      }
      const restoreError = diffRestoreErrors[activeTab.path];
      return (
        <div className="diff-loading" data-error={Boolean(restoreError)}>
          {restoreError ? <CircleAlert /> : <RotateCcw />}
          <strong>{restoreError ? '无法恢复 Diff' : '正在恢复 Diff'}</strong>
          <span>
            {restoreError ?? '正在重新读取项目版本与 ChangeSet 快照…'}
          </span>
          {restoreError && (
            <button onClick={() => closeDocument(activeTab.path)}>
              关闭此标签
            </button>
          )}
        </div>
      );
    }
    if (activeTab?.kind === 'build-report') {
      return (
        <div className="build-report-editor">
          <header>
            <Wrench />
            <div>
              <h2>{activeTab.title}</h2>
              <p>由 Studio 构建服务生成的只读机器报告。</p>
            </div>
          </header>
          <pre>
            {JSON.stringify(buildReports[activeTab.path] ?? {}, null, 2)}
          </pre>
        </div>
      );
    }
    if (activeTab?.kind === 'game') {
      const runtimeProjection =
        workspace.runtime.renderSnapshot ?? activeSceneProjection;
      const observation = workspace.runtime.latestObservation;
      const observationErrors =
        observation?.diagnostics.filter((item) => item.severity === 'error') ??
        [];
      const observationWarnings =
        observation?.diagnostics.filter(
          (item) => item.severity === 'warning',
        ) ?? [];
      return (
        <div className="game-runtime-editor">
          <header>
            <Play />
            <div>
              <h2>Game Runtime</h2>
              <p>
                Scene 设计状态保持不变；这里显示沙箱 TypeScript
                运行产生的临时快照、断点和诊断。
              </p>
            </div>
            <span data-status={workspace.runtime.status}>
              {workspace.runtime.status}
            </span>
          </header>
          {runtimeProjection ? (
            <EngineViewport
              snapshot={runtimeProjection}
              mode="game"
              showGrid={false}
              assetSources={assetPreviews}
              onInput={(input) => {
                if (
                  workspace.runtime.status !== 'running' &&
                  workspace.runtime.status !== 'paused'
                )
                  return;
                const raw =
                  input.action.startsWith('keyboard:') ||
                  input.action.startsWith('pointer:');
                const binding = input.action.split(':').at(-1) ?? input.action;
                const action = raw
                  ? (workspace.inputActions?.find((candidate) =>
                      candidate.bindings.includes(binding),
                    )?.id ?? `input:${input.action.replace(':', '/')}`)
                  : input.action;
                void window.aiGameStudio.workspace
                  .runtimeInput({
                    action,
                    value: input.value,
                    source: input.source,
                  })
                  .then((result) => {
                    if (result.ok) return;
                    const message = `${result.error.code}: ${result.error.message}`;
                    onError(message);
                    appendConsole(`[error] ${message}`);
                    setBottomPanel('problems');
                  })
                  .catch((reason: unknown) => {
                    const message = `运行时输入失败：${String(reason)}`;
                    onError(message);
                    appendConsole(`[error] ${message}`);
                    setBottomPanel('problems');
                  });
              }}
            />
          ) : (
            <div className="engine-viewport-unavailable">
              尚无 RenderSnapshot；请先运行项目。
            </div>
          )}
          <div className="runtime-summary-grid">
            <article>
              <small>Tick</small>
              <strong>{workspace.runtime.tick}</strong>
            </article>
            <article>
              <small>权威状态哈希</small>
              <code>{workspace.runtime.stateHash?.slice(0, 16) ?? '—'}</code>
            </article>
            <article>
              <small>脚本内存</small>
              <strong>
                {workspace.runtime.memoryUsedBytes
                  ? `${(workspace.runtime.memoryUsedBytes / 1024).toFixed(1)} KiB`
                  : '—'}
              </strong>
            </article>
            <article>
              <small>Events</small>
              <strong>{workspace.runtime.events ?? 0}</strong>
            </article>
          </div>
          <section
            className="runtime-observation-card"
            data-has-observation={Boolean(observation)}
          >
            <header>
              <Eye />
              <div>
                <strong>运行观察</strong>
                <span>可寻址画面、资源、UI 与音频证据，不依赖屏幕坐标。</span>
              </div>
              <button
                disabled={busy || !runtimeProjection}
                onClick={() =>
                  void guarded(async () => {
                    await execute('runtime.capture_frame', {
                      checkpointId: `manual-tick-${workspace.runtime.tick}`,
                    });
                  })
                }
              >
                捕获当前帧
              </button>
            </header>
            {observation ? (
              <div className="runtime-observation-body">
                <div className="runtime-observation-preview">
                  {assetPreviews[observation.frameArtifact.path] ? (
                    /* oxlint-disable-next-line next/no-img-element */ <img
                      src={assetPreviews[observation.frameArtifact.path]}
                      alt={`${observation.checkpointId} 运行观察`}
                    />
                  ) : (
                    <Image />
                  )}
                </div>
                <div className="runtime-observation-metrics">
                  <span>
                    <small>检查点</small>
                    <code>{observation.checkpointId}</code>
                  </span>
                  <span>
                    <small>画面</small>
                    <strong>
                      {observation.drawables.length} Drawable ·{' '}
                      {observation.ui.length} UI
                    </strong>
                  </span>
                  <span>
                    <small>声音</small>
                    <strong>{observation.audio.events.length} Event</strong>
                  </span>
                  <span>
                    <small>诊断</small>
                    <strong
                      data-severity={
                        observationErrors.length
                          ? 'error'
                          : observationWarnings.length
                            ? 'warning'
                            : 'ok'
                      }
                    >
                      {observationErrors.length} 错误 ·{' '}
                      {observationWarnings.length} 警告
                    </strong>
                  </span>
                  <span>
                    <small>帧哈希</small>
                    <code>{observation.frameArtifact.sha256.slice(0, 16)}</code>
                  </span>
                </div>
                <div className="runtime-observation-diagnostics">
                  {observation.diagnostics.slice(0, 5).map((diagnostic) => (
                    <code
                      key={`${diagnostic.code}:${diagnostic.objectId ?? diagnostic.assetId ?? diagnostic.tick}`}
                      data-severity={diagnostic.severity}
                      title={diagnostic.message}
                    >
                      {diagnostic.code} ·{' '}
                      {diagnostic.objectId ??
                        diagnostic.componentId ??
                        diagnostic.assetId ??
                        `Tick ${diagnostic.tick}`}
                    </code>
                  ))}
                  {observation.diagnostics.length === 0 && (
                    <p>该检查点未发现资源、布局或音频诊断。</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="runtime-observation-empty">
                捕获后可在 Studio 与 Copilot 中按稳定 ID 查看同一份证据。
              </p>
            )}
          </section>
          {workspace.runtime.pausedAt && (
            <section className="runtime-break-card">
              <Bug />
              <div>
                <strong>已命中语义断点</strong>
                <code>{JSON.stringify(workspace.runtime.pausedAt)}</code>
              </div>
            </section>
          )}
          <section className="runtime-watch-grid">
            <div>
              <strong>状态监视</strong>
              {(workspace.runtime.watches ?? []).slice(-20).map((watch) => (
                <code key={`${watch.tick}:${watch.path}`}>
                  T{watch.tick} {watch.path} = {JSON.stringify(watch.value)}
                </code>
              ))}
              {(workspace.runtime.watches ?? []).length === 0 && (
                <p>从调试命令或 Copilot 添加稳定状态路径。</p>
              )}
            </div>
            <div>
              <strong>System trace</strong>
              {(workspace.runtime.systemTrace ?? [])
                .slice(-20)
                .map((trace, index) => (
                  <code
                    key={`${String(trace.tick)}:${String(trace.systemId)}:${index}`}
                  >
                    T{String(trace.tick)} · {String(trace.phase)} ·{' '}
                    {String(trace.systemId)} · {String(trace.status)}
                  </code>
                ))}
              {(workspace.runtime.systemTrace ?? []).length === 0 && (
                <p>项目没有运行 System，或尚未开始运行。</p>
              )}
            </div>
          </section>
        </div>
      );
    }
    if (!activeTab) {
      return (
        <div className="empty-document-editor">
          <FileCode2 />
          <strong>没有打开的编辑器</strong>
          <span>从左侧项目文件中打开 Scene、脚本或资源。</span>
        </div>
      );
    }
    if (activeTab.kind === 'overview') {
      return (
        <div className="overview-editor">
          <Sparkles />
          <h1>{project.manifest.name}</h1>
          <p>
            这是项目概览，不是地图编辑器。文件、Scene、代码、Prefab、Diff
            和构建报告都会在中央以独立文档打开。
          </p>
          <div className="overview-grid">
            <button onClick={() => setActivity('explorer')}>
              <FolderOpen />
              <strong>项目文件</strong>
              <span>浏览磁盘上的权威文件</span>
            </button>
            <button
              onClick={() => {
                setActivity('explorer');
                const file = workspace.files.find(
                  (candidate) => candidate.path === workspace.entryScene,
                );
                if (file) void openFile(file);
              }}
            >
              <Layers3 />
              <strong>Scene</strong>
              <span>设计对象与空间组合</span>
            </button>
            <button onClick={() => setRightPanel('copilot')}>
              <Bot />
              <strong>Copilot</strong>
              <span>让 Codex 读取同一项目并提出 ChangeSet</span>
            </button>
            <button onClick={() => setActivity('build')}>
              <Wrench />
              <strong>构建与发布</strong>
              <span>生成独立玩家包</span>
            </button>
          </div>
        </div>
      );
    }
    if (
      activeTab.kind === 'scene-2d' ||
      activeTab.kind === 'scene-3d' ||
      activeTab.kind === 'ui'
    ) {
      const threeDimensional = activeTab.kind === 'scene-3d';
      return (
        <div
          className={`scene-editor ${threeDimensional ? 'scene-editor-3d' : ''}`}
        >
          <div className="scene-toolbar">
            {(['select', 'move', 'rotate', 'scale'] as const).map((tool) => (
              <button
                key={tool}
                className={sceneTool === tool ? 'active' : ''}
                data-shortcut={
                  { select: 'Q', move: 'W', rotate: 'E', scale: 'R' }[tool]
                }
                aria-keyshortcuts={
                  { select: 'Q', move: 'W', rotate: 'E', scale: 'R' }[tool]
                }
                title={`${
                  tool === 'select'
                    ? '选择'
                    : tool === 'move'
                      ? '移动'
                      : tool === 'rotate'
                        ? '旋转'
                        : '缩放'
                } (${{ select: 'Q', move: 'W', rotate: 'E', scale: 'R' }[tool]})`}
                onClick={() => {
                  setSceneTransformPreview(null);
                  setSceneTool(tool);
                }}
                disabled={activeTab.kind === 'ui' && tool === 'rotate'}
              >
                {tool === 'select'
                  ? '选择'
                  : tool === 'move'
                    ? '移动'
                    : tool === 'rotate'
                      ? '旋转'
                      : '缩放'}
              </button>
            ))}
            <button onClick={addSceneObject}>+ 对象</button>
            <button onClick={instantiatePrefab}>Prefab</button>
            {selectedEntityIds.length > 1 && (
              <small>{selectedEntityIds.length} 个对象已多选</small>
            )}
            {sceneTransformCommitCount > 0 && (
              <small className="scene-transform-status">保存变换…</small>
            )}
            <span />{' '}
            <small>
              {activeSceneDocument?.space?.toUpperCase()} · 文件即权威状态
            </small>
            <button onClick={() => setActiveDocument('studio://help')}>
              帮助
            </button>
          </div>
          <div
            className="scene-canvas"
            data-scene-tool={sceneTool}
            data-projection="render.snapshot"
            data-transform-preview={
              sceneTransformPreview?.scenePath === activeTab.path
                ? 'previewing'
                : 'idle'
            }
          >
            {activeSceneProjection && (
              <EngineViewport
                key={activeTab.path}
                snapshot={activeSceneProjection}
                mode="scene"
                assetSources={assetPreviews}
                selectedObjectIds={selectedEntityIds}
                onPick={selectEntity}
                onTransformPreview={
                  sceneTool !== 'select'
                    ? (objectId, delta) => {
                        setSceneTransformPreview(
                          delta
                            ? {
                                scenePath: activeTab.path,
                                objectId,
                                tool: sceneTool,
                                delta: sceneTransformDeltaFromPointer(
                                  sceneTool,
                                  activeSceneDocument?.space ??
                                    (threeDimensional ? '3d' : '2d'),
                                  delta,
                                ),
                              }
                            : null,
                        );
                      }
                    : undefined
                }
                onTransformDelta={
                  sceneTool !== 'select'
                    ? (objectId, delta) => {
                        const tool = sceneTool;
                        const semanticDelta = sceneTransformDeltaFromPointer(
                          tool,
                          activeSceneDocument?.space ??
                            (threeDimensional ? '3d' : '2d'),
                          delta,
                        );
                        setSceneTransformPreview(null);
                        setSceneDocuments((current) => {
                          const source = current[activeTab.path];
                          if (!source) return current;
                          return {
                            ...current,
                            [activeTab.path]: applySceneTransformPreview(
                              source,
                              {
                                scenePath: activeTab.path,
                                objectId,
                                tool,
                                delta: semanticDelta,
                              },
                            ),
                          };
                        });
                        return queueSceneTransformCommit(
                          activeTab.path,
                          objectId,
                          tool,
                          semanticDelta,
                        );
                      }
                    : undefined
                }
              />
            )}
            <div className="scene-controls-hint">
              左键选择 · 拖动变换 · 中/右键或 Space+左键平移 · 滚轮缩放 ·
              Q/W/E/R 切换工具
            </div>
            <div className="scene-axis">
              {threeDimensional ? 'X · Y · Z' : 'X · Y'}
            </div>
            <div className="scene-empty-hint">
              {activeWorld?.entities.length
                ? `${activeWorld.name} · ${activeWorld.entities.length} objects`
                : '空 Scene · 使用“+ 对象”开始搭建'}
            </div>
            {sceneTool !== 'select' && selectedEntityIds.length > 0 && (
              <div className="scene-gizmo" data-tool={sceneTool}>
                <strong>{sceneTool.toUpperCase()} Gizmo</strong>
                {(
                  ['x', 'y', ...(threeDimensional ? ['z'] : [])] as Array<
                    'x' | 'y' | 'z'
                  >
                ).map((axis) => (
                  <span key={axis} data-axis={axis}>
                    <button onClick={() => applySceneGizmo(axis, -1)}>
                      −{axis.toUpperCase()}
                    </button>
                    <button onClick={() => applySceneGizmo(axis, 1)}>
                      +{axis.toUpperCase()}
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }
    if (activeTab.kind === 'resource') {
      const dependencies = resourceDependencies[activeTab.path];
      return (
        <div className="resource-editor">
          <header>
            <Image />
            <div>
              <h2>{activeTab.title}</h2>
              <code>{activeTab.path}</code>
            </div>
            <button onClick={configureActiveResource}>导入设置</button>
            <button onClick={reimportActiveResource}>重新导入</button>
          </header>
          <div className="resource-preview">
            {assetPreviews[activeTab.path] ? (
              /* oxlint-disable-next-line next/no-img-element */ <img
                src={assetPreviews[activeTab.path]}
                alt={activeTab.title}
              />
            ) : (
              <Image />
            )}
          </div>
          <section>
            <strong>依赖</strong>
            <p>
              被引用：
              {dependencies?.referencedBy.length
                ? dependencies.referencedBy.join('、')
                : '无'}
            </p>
            <p>
              引用：
              {dependencies?.references.length
                ? dependencies.references.join('、')
                : '无'}
            </p>
          </section>
        </div>
      );
    }
    if (activeTab.kind === 'material' && activeBuffer) {
      const color = stringValue(
        activeMaterial?.baseColor ?? activeMaterial?.color,
        '#65d3e2',
      );
      const texture = stringValue(activeMaterial?.texture);
      return (
        <div className="specialized-editor material-editor">
          <aside>
            <header>
              <Sparkles />
              <div>
                <strong>材质预览</strong>
                <small>基础颜色与纹理 · 高级材质图在本版本不可用</small>
              </div>
            </header>
            <div className="material-preview-stage">
              <div
                className="material-preview-orb"
                style={
                  {
                    '--material-color': color,
                    backgroundImage:
                      texture && assetPreviews[texture]
                        ? `url(${assetPreviews[texture]})`
                        : undefined,
                  } as CSSProperties
                }
              />
            </div>
            {activeMaterial ? (
              <div className="material-fields">
                <label>
                  基础颜色
                  <input
                    type="color"
                    value={/^#[0-9a-f]{6}$/iu.test(color) ? color : '#65d3e2'}
                    onChange={(event) =>
                      updateStructuredDocument({
                        baseColor: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  纹理资源路径
                  <input
                    value={texture}
                    placeholder="assets/imported/texture.png"
                    onChange={(event) =>
                      updateStructuredDocument({ texture: event.target.value })
                    }
                  />
                </label>
                <label>
                  粗糙度
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={Number(activeMaterial.roughness ?? 0.65)}
                    onChange={(event) =>
                      updateStructuredDocument({
                        roughness: event.target.valueAsNumber,
                      })
                    }
                  />
                </label>
              </div>
            ) : (
              <p>修复 JSON 后显示材质控件。</p>
            )}
          </aside>
          <section>
            <SourceEditor
              path={activeTab.path}
              source={activeBuffer.source}
              dirty={activeBuffer.source !== activeBuffer.savedSource}
              disabled={busy}
              onSave={() => void saveActive()}
              onDelete={() => void fileAction('trash', activeTab.path)}
              onChange={(source) =>
                setBuffers((current) => ({
                  ...current,
                  [activeTab.path]: { ...activeBuffer, source },
                }))
              }
              onDiagnostics={(diagnostics) =>
                setEditorDiagnostics((current) => ({
                  ...current,
                  [activeTab.path]: diagnostics,
                }))
              }
            />
          </section>
        </div>
      );
    }
    if (activeTab.kind === 'animation' && activeBuffer) {
      const duration = Math.max(0.001, Number(activeAnimation?.duration ?? 1));
      const tracks = Array.isArray(activeAnimation?.tracks)
        ? (activeAnimation.tracks as Array<Record<string, unknown>>)
        : [];
      return (
        <div className="specialized-editor animation-editor">
          <aside>
            <header>
              <Play />
              <div>
                <strong>Animation Timeline</strong>
                <small>
                  {duration.toFixed(2)} s · {tracks.length} tracks
                </small>
              </div>
            </header>
            <label className="animation-scrubber">
              <span>时间 {animationPlayhead.toFixed(2)} s</span>
              <input
                type="range"
                min="0"
                max={duration}
                step={Math.max(0.001, duration / 240)}
                value={Math.min(animationPlayhead, duration)}
                onChange={(event) =>
                  setAnimationPlayhead(event.target.valueAsNumber)
                }
              />
            </label>
            <div className="animation-tracks">
              {tracks.map((track, trackIndex) => {
                const keyframes = Array.isArray(track.keyframes)
                  ? (track.keyframes as Array<Record<string, unknown>>)
                  : [];
                return (
                  <div
                    className="animation-track"
                    key={`${stringValue(track.target, 'track')}:${trackIndex}`}
                  >
                    <strong>
                      {stringValue(track.target, 'object')} ·{' '}
                      {stringValue(track.property, 'value')}
                    </strong>
                    <div>
                      {keyframes.map((keyframe, keyIndex) => {
                        const time = Number(keyframe.time ?? 0);
                        return (
                          <button
                            aria-label={`关键帧 T=${time} 秒`}
                            key={`${time}:${keyIndex}`}
                            title={`T=${time}s · ${JSON.stringify(keyframe.value)}`}
                            style={{
                              left: `${Math.max(0, Math.min(100, (time / duration) * 100))}%`,
                            }}
                            onClick={() => setAnimationPlayhead(time)}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {tracks.length === 0 && (
                <p>在 JSON 中添加 tracks/keyframes 后显示时间轴。</p>
              )}
            </div>
          </aside>
          <section>
            <SourceEditor
              path={activeTab.path}
              source={activeBuffer.source}
              dirty={activeBuffer.source !== activeBuffer.savedSource}
              disabled={busy}
              onSave={() => void saveActive()}
              onDelete={() => void fileAction('trash', activeTab.path)}
              onChange={(source) =>
                setBuffers((current) => ({
                  ...current,
                  [activeTab.path]: { ...activeBuffer, source },
                }))
              }
              onDiagnostics={(diagnostics) =>
                setEditorDiagnostics((current) => ({
                  ...current,
                  [activeTab.path]: diagnostics,
                }))
              }
            />
          </section>
        </div>
      );
    }
    if (activeTab.kind === 'prefab' && activeBuffer) {
      return (
        <div className="prefab-editor">
          <aside>
            <header>
              <Box />
              <div>
                <strong>{activePrefab?.name ?? activeTab.title}</strong>
                <small>Prefab 隔离编辑</small>
              </div>
            </header>
            {activePrefab?.objects.map((object) => (
              <button
                key={object.id}
                className={
                  selectedPrefabObjectId === object.id ? 'selected' : ''
                }
                onClick={() => setSelectedPrefabObjectId(object.id)}
              >
                <Box />
                <span>{object.name}</span>
                <small>{object.components.length} Components</small>
              </button>
            ))}
            {!activePrefab && <p>修复 JSON 后显示对象结构。</p>}
          </aside>
          <section>
            <SourceEditor
              path={activeTab.path}
              source={activeBuffer.source}
              dirty={activeBuffer.source !== activeBuffer.savedSource}
              disabled={busy}
              onSave={() => void saveActive()}
              onDelete={() => void fileAction('trash', activeTab.path)}
              onChange={(source) =>
                setBuffers((current) => ({
                  ...current,
                  [activeTab.path]: { ...activeBuffer, source },
                }))
              }
              onDiagnostics={(diagnostics) =>
                setEditorDiagnostics((current) => ({
                  ...current,
                  [activeTab.path]: diagnostics,
                }))
              }
              navigation={
                editorNavigation?.path === activeTab.path
                  ? editorNavigation
                  : undefined
              }
            />
          </section>
        </div>
      );
    }
    if (activeBuffer) {
      return (
        <div className="editor-with-conflict">
          {activeBuffer.externalConflict && (
            <div className="external-conflict-banner">
              <CircleAlert /> 文件已被外部修改。
              <button
                onClick={() =>
                  setBuffers((current) => ({
                    ...current,
                    [activeTab.path]: {
                      source: activeBuffer.externalSource ?? '',
                      savedSource: activeBuffer.externalSource ?? '',
                      baseHash:
                        activeBuffer.externalHash ?? activeBuffer.baseHash,
                    },
                  }))
                }
              >
                载入磁盘版本
              </button>
              <button
                onClick={() =>
                  void guarded(async () => {
                    const result = await execute('project.file.write', {
                      path: activeTab.path,
                      content: activeBuffer.source,
                      baseHash: activeBuffer.externalHash,
                    });
                    const saved = unwrap(
                      await window.aiGameStudio.workspace.readText(
                        activeTab.path,
                      ),
                    );
                    setBuffers((current) => ({
                      ...current,
                      [activeTab.path]: {
                        source: saved.source,
                        savedSource: saved.source,
                        baseHash: saved.hash,
                      },
                    }));
                    setWorkspace(result.snapshot);
                  })
                }
              >
                用编辑器版本覆盖
              </button>
            </div>
          )}
          <SourceEditor
            path={activeTab.path}
            source={activeBuffer.source}
            dirty={activeBuffer.source !== activeBuffer.savedSource}
            disabled={busy}
            onSave={() => void saveActive()}
            onDelete={() => void fileAction('trash', activeTab.path)}
            onChange={(source) =>
              setBuffers((current) => ({
                ...current,
                [activeTab.path]: { ...activeBuffer, source },
              }))
            }
            onDiagnostics={(diagnostics) =>
              setEditorDiagnostics((current) => ({
                ...current,
                [activeTab.path]: diagnostics,
              }))
            }
            navigation={
              editorNavigation?.path === activeTab.path
                ? editorNavigation
                : undefined
            }
          />
        </div>
      );
    }
    return (
      <div className="center-empty">
        <CircleAlert />
        无法为此文档选择编辑器。
      </div>
    );
  };

  const loginCodex = () =>
    void guarded(async () => {
      unwrap(await window.aiGameStudio.codex.login());
    });
  const sendToCodex = () =>
    void guarded(async () => {
      const scope = stringValue(agentPreferences.contextScope, 'project');
      const automaticContext =
        scope === 'file'
          ? [`current-file: ${activeTab?.path ?? '(none)'}`]
          : scope === 'scene'
            ? [
                `current-scene: ${activeSceneDocument ? activeTab?.path : workspace.entryScene}`,
                `selected-object: ${selectedEntityId ?? '(none)'}`,
              ]
            : [
                `project-root: ${project.root}`,
                `entry-scene: ${workspace.entryScene}`,
                `current-file: ${activeTab?.path ?? '(none)'}`,
              ];
      const contextItems = [
        ...automaticContext,
        ...attachments,
        `engine-mcp: ${aiToolPreferences.mcpEnabled === false ? 'disabled' : 'enabled'}`,
        `project-skills: ${aiToolPreferences.projectSkillsEnabled === false ? 'disabled' : 'enabled'}`,
      ];
      const context = `\n\nAttached Studio context (${scope}):\n${contextItems
        .map((item) => `- ${item}`)
        .join('\n')}`;
      if (copilotMode === 'goal' && !codex?.goal) {
        const defaultBudget = Number(agentPreferences.goalTokenBudget ?? 0);
        const budget = goalBudget
          ? Number(goalBudget)
          : Number.isSafeInteger(defaultBudget) && defaultBudget > 0
            ? defaultBudget
            : null;
        unwrap(
          await window.aiGameStudio.codex.setGoal(copilotPrompt.trim(), budget),
        );
      }
      unwrap(
        await window.aiGameStudio.codex.startTurn(
          copilotMode,
          `${copilotPrompt}${context}`,
        ),
      );
      setCopilotPrompt('');
    });

  const renderComponentField = (
    component: Record<string, unknown>,
    field: ComponentField,
  ) => {
    const componentId = String(component.id);
    const value = componentValue(component, field.name);
    if (field.type === 'boolean') {
      return (
        <label className="component-field" key={field.name}>
          <span>{field.name}</span>
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) =>
              updateComponent(componentId, field.name, event.target.checked)
            }
          />
        </label>
      );
    }
    if (field.type === 'vec2' || field.type === 'vec3') {
      const vector =
        value && typeof value === 'object'
          ? (value as Record<string, unknown>)
          : {};
      const axes = field.type === 'vec3' ? ['x', 'y', 'z'] : ['x', 'y'];
      return (
        <label className="component-field vector-field" key={field.name}>
          <span>{field.name}</span>
          <span>
            {axes.map((axis) => (
              <input
                key={axis}
                aria-label={`${field.name}.${axis}`}
                type="number"
                value={Number(vector[axis] ?? 0)}
                onChange={(event) =>
                  updateComponent(componentId, field.name, {
                    ...vector,
                    [axis]: event.target.valueAsNumber,
                  })
                }
              />
            ))}
          </span>
        </label>
      );
    }
    if (field.type === 'number') {
      return (
        <label className="component-field" key={field.name}>
          <span>
            {field.name}
            {field.unit === 'degrees' ? ' (°)' : ''}
          </span>
          <input
            type="number"
            value={Number(value ?? 0)}
            onChange={(event) =>
              updateComponent(
                componentId,
                field.name,
                event.target.valueAsNumber,
              )
            }
          />
        </label>
      );
    }
    if (field.type === 'color') {
      return (
        <label className="component-field color-field" key={field.name}>
          <span>{field.name}</span>
          <span>
            <input
              type="color"
              value={typeof value === 'string' ? value : '#ffffff'}
              onChange={(event) =>
                updateComponent(componentId, field.name, event.target.value)
              }
            />
            <input
              value={inputText(value)}
              onChange={(event) =>
                updateComponent(componentId, field.name, event.target.value)
              }
            />
          </span>
        </label>
      );
    }
    return (
      <label className="component-field" key={field.name}>
        <span>{field.name}</span>
        <input
          value={inputText(value)}
          placeholder={field.type === 'resource' ? '项目资源路径' : ''}
          onChange={(event) =>
            updateComponent(componentId, field.name, event.target.value)
          }
        />
      </label>
    );
  };

  const renderRight = () => {
    if (rightPanel === 'inspector') {
      return (
        <div className="right-content inspector-content">
          <header>
            <Inspect />
            <div>
              <strong>Inspector</strong>
              <span>Schema 驱动 · 所有修改都是语义事务</span>
            </div>
          </header>
          {selectedEntity ? (
            <>
              <section className="selection-summary">
                <Box />
                <div>
                  <input
                    aria-label="对象名称"
                    defaultValue={selectedEntity.name}
                    onBlur={(event) => {
                      if (
                        event.target.value.trim() &&
                        event.target.value.trim() !== selectedEntity.name
                      )
                        mutateSelectedObject('scene.object.update', {
                          name: event.target.value.trim(),
                        });
                    }}
                  />
                  <code>{selectedEntity.id}</code>
                </div>
              </section>
              <section className="object-controls">
                <label>
                  <span>启用</span>
                  <input
                    type="checkbox"
                    checked={selectedEntity.enabled !== false}
                    onChange={(event) =>
                      mutateSelectedObject('scene.object.update', {
                        enabled: event.target.checked,
                      })
                    }
                  />
                </label>
                <label>
                  <span>可见</span>
                  <input
                    type="checkbox"
                    checked={selectedEntity.visible !== false}
                    onChange={(event) =>
                      mutateSelectedObject('scene.object.set_visibility', {
                        visible: event.target.checked,
                      })
                    }
                  />
                </label>
                <label>
                  <span>锁定</span>
                  <input
                    type="checkbox"
                    checked={Boolean(selectedEntity.locked)}
                    onChange={(event) =>
                      mutateSelectedObject('scene.object.set_lock', {
                        locked: event.target.checked,
                      })
                    }
                  />
                </label>
                <label>
                  <span>父对象</span>
                  <select
                    value={selectedEntity.parentId ?? ''}
                    onChange={(event) =>
                      mutateSelectedObject('scene.object.set_parent', {
                        parentId: event.target.value || null,
                      })
                    }
                  >
                    <option value="">Scene 根</option>
                    {activeWorld?.entities
                      .filter((entity) => entity.id !== selectedEntity.id)
                      .map((entity) => (
                        <option key={entity.id} value={entity.id}>
                          {entity.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span>同级顺序</span>
                  <input
                    type="number"
                    min="0"
                    value={selectedEntity.order ?? 0}
                    onChange={(event) =>
                      mutateSelectedObject('scene.object.reorder', {
                        order: event.target.valueAsNumber,
                      })
                    }
                  />
                </label>
                <div>
                  <button
                    onClick={() =>
                      mutateSelectedObject('scene.object.duplicate')
                    }
                  >
                    复制对象
                  </button>
                  <button onClick={createPrefab}>创建 Prefab</button>
                  <button
                    onClick={() => mutateSelectedObject('scene.object.trash')}
                  >
                    <Trash2 /> 删除
                  </button>
                </div>
                {selectedEntity.prefab && (
                  <div className="prefab-instance-controls">
                    <code>{selectedEntity.prefab}</code>
                    <strong>
                      {prefabOverrides.length === 0
                        ? '与 Prefab 源一致'
                        : `${prefabOverrides.length} 项实例覆盖`}
                    </strong>
                    {prefabOverrides.map((override) => (
                      <details key={override.field}>
                        <summary>{override.field}</summary>
                        <small>源：{JSON.stringify(override.source)}</small>
                        <small>实例：{JSON.stringify(override.instance)}</small>
                      </details>
                    ))}
                    <button onClick={() => applyPrefab('apply')}>
                      应用到 Prefab
                    </button>
                    <button onClick={() => applyPrefab('revert')}>
                      还原实例
                    </button>
                  </div>
                )}
                {referenceIndex && (
                  <div className="project-reference-links">
                    <strong>项目引用</strong>
                    {selectedReferenceSymbols.map((symbol) => (
                      <button
                        key={symbol.key}
                        title={`${symbol.path}:${symbol.line}:${symbol.column}`}
                        onClick={() => {
                          const file = workspace.files.find(
                            (candidate) => candidate.path === symbol.path,
                          );
                          if (file) void openFile(file);
                          setEditorNavigation({
                            path: symbol.path,
                            line: symbol.line,
                            column: symbol.column,
                            nonce: (editorNavigation?.nonce ?? 0) + 1,
                          });
                        }}
                      >
                        {symbol.kind} · {symbol.label}
                      </button>
                    ))}
                  </div>
                )}
              </section>
              {selectedEntity.components.map((component) => {
                const descriptor = componentDescriptor(
                  componentTypes,
                  component.type,
                );
                return (
                  <section
                    className="generic-component"
                    key={String(component.id ?? component.type)}
                    data-inspector-editor={
                      descriptor?.inspectorEditor ?? 'generated:fields'
                    }
                  >
                    <header>
                      <strong>
                        <Braces /> {descriptor?.label ?? String(component.type)}
                      </strong>
                      <button
                        title="移除 Component"
                        onClick={() => removeComponent(String(component.id))}
                      >
                        <Trash2 />
                      </button>
                    </header>
                    <code>
                      {String(component.type)} · Inspector{' '}
                      {descriptor?.inspectorEditor ?? 'generated:fields'}
                    </code>
                    {descriptor ? (
                      <div
                        className={
                          descriptor.inspectorEditor &&
                          descriptor.inspectorEditor !== 'generated:fields'
                            ? 'registered-component-editor'
                            : 'generated-component-editor'
                        }
                      >
                        {descriptor.fields.map((field) =>
                          renderComponentField(component, field),
                        )}
                      </div>
                    ) : (
                      <pre>{JSON.stringify(component, null, 2)}</pre>
                    )}
                  </section>
                );
              })}
              <select
                className="add-component"
                defaultValue=""
                onChange={(event) => {
                  if (event.target.value) addComponent(event.target.value);
                  event.target.value = '';
                }}
              >
                <option value="" disabled>
                  + 添加 Component
                </option>
                {componentTypes
                  .filter(
                    (descriptor) =>
                      !selectedEntity.components.some(
                        (component) => component.type === descriptor.type,
                      ),
                  )
                  .map((descriptor) => (
                    <option key={descriptor.type} value={descriptor.type}>
                      {descriptor.label} · {descriptor.capability}
                    </option>
                  ))}
              </select>
            </>
          ) : activeTab?.kind === 'resource' ? (
            <div className="file-inspector">
              <Image />
              <strong>{activeTab.title}</strong>
              <code>{activeTab.path}</code>
              <dl>
                <dt>类型</dt>
                <dd>{activeFile?.kind ?? 'asset'}</dd>
                <dt>大小</dt>
                <dd>{activeFile?.size ?? 0} bytes</dd>
                <dt>Git</dt>
                <dd>{activeFile?.gitStatus ?? 'clean'}</dd>
                <dt>状态</dt>
                <dd>
                  {displayValue(
                    workspace.assets.find(
                      (asset) => asset.path === activeTab.path,
                    )?.status ?? 'unknown',
                  )}
                </dd>
              </dl>
              <p>
                被引用：
                {resourceDependencies[activeTab.path]?.referencedBy.join(
                  '、',
                ) || '无'}
              </p>
              <div className="file-inspector-actions">
                <button onClick={configureActiveResource}>导入设置</button>
                <button onClick={reimportActiveResource}>重新导入</button>
                <button onClick={scanMissingResources}>扫描缺失引用</button>
              </div>
            </div>
          ) : activeFile ? (
            <div className="file-inspector">
              <FileCode2 />
              <strong>{activeTab?.title}</strong>
              <code>{activeFile.path}</code>
              <dl>
                <dt>类型</dt>
                <dd>{activeFile.kind}</dd>
                <dt>大小</dt>
                <dd>{activeFile.size} bytes</dd>
                <dt>Git</dt>
                <dd>{activeFile.gitStatus ?? 'clean'}</dd>
                <dt>诊断</dt>
                <dd>{activeFile.diagnosticCount ?? 0}</dd>
                <dt>AI 状态</dt>
                <dd>{activeFile.aiActivity ?? 'none'}</dd>
              </dl>
              <div className="file-inspector-actions">
                <button
                  onClick={() => void saveActive()}
                  disabled={!activeBuffer}
                >
                  保存
                </button>
                <button
                  onClick={() => void fileAction('duplicate', activeFile.path)}
                >
                  复制
                </button>
                <button
                  onClick={() => void fileAction('rename', activeFile.path)}
                >
                  重命名
                </button>
                <button
                  className="file-inspector-danger"
                  onClick={() => void fileAction('trash', activeFile.path)}
                >
                  移到项目回收站
                </button>
              </div>
            </div>
          ) : (
            <div className="right-empty">
              <Inspect />
              <strong>没有选择</strong>
              <p>
                从 Scene 大纲或中央画布选择对象；选择文件时这里将显示文件属性。
              </p>
            </div>
          )}
        </div>
      );
    }
    const planPresentation = copilotPlanPresentation(codex);
    return (
      <div className="right-content copilot-content">
        <header>
          <Bot />
          <div>
            <strong>Codex Copilot</strong>
            <span>
              {codex?.account
                ? `${codex.status} · ${codex.model ?? '默认模型'}`
                : '未登录'}
            </span>
          </div>
          <button
            title="更多设置"
            onClick={() => setShowCopilotSettings((value) => !value)}
          >
            <MoreHorizontal />
          </button>
        </header>
        {!codex?.account ? (
          <div className="copilot-login">
            <Sparkles />
            <h2>让 Codex 进入这个项目</h2>
            <p>
              登录后，Codex 会读取项目的 AGENTS.md、Skills 和 Engine
              MCP，并通过可审查 ChangeSet 工作。
            </p>
            <button onClick={loginCodex}>使用 ChatGPT 登录</button>
            <small>
              <ShieldCheck /> 凭据由 Codex 管理，不写入游戏项目。
            </small>
          </div>
        ) : (
          <>
            <div className="copilot-threadbar">
              <select
                aria-label="Codex 项目对话"
                value={codex.threadId ?? ''}
                onChange={(event) =>
                  void window.aiGameStudio.codex.selectConversation(
                    event.target.value,
                  )
                }
              >
                {codex.threadId &&
                  !codex.conversations.some(
                    (conversation) => conversation.id === codex.threadId,
                  ) && <option value={codex.threadId}>当前项目对话</option>}
                {codex.conversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>
                    {conversation.title}
                  </option>
                ))}
              </select>
              <button
                title="新建项目对话"
                onClick={() =>
                  void window.aiGameStudio.codex.createConversation()
                }
              >
                + 对话
              </button>
            </div>
            <CopilotTranscript
              key={`conversation:${codex.threadId}`}
              firstEntryId={codex.transcript[0]?.id}
            >
              {(codex.history?.hasMore || codex.history?.loading) && (
                <button
                  className="copilot-history-more"
                  disabled={codex.history.loading}
                  aria-busy={codex.history.loading}
                  onClick={() =>
                    void window.aiGameStudio.codex.loadOlderHistory()
                  }
                >
                  {codex.history.loading ? '正在加载对话…' : '加载较早的对话'}
                </button>
              )}
              {codex.transcript.map((entry) => (
                <article
                  key={entry.id}
                  data-role={entry.role}
                  data-transcript-entry={entry.id}
                >
                  <span>
                    {entry.role} {entry.status ? `· ${entry.status}` : ''}
                  </span>
                  {entry.activity ? (
                    <CopilotActivityRow item={entry.activity} />
                  ) : (
                    <pre>{entry.text}</pre>
                  )}
                </article>
              ))}
              {codex.activeTurn ? (
                <article data-role="active">
                  <span>
                    {codex.activeTurn.mode} ·{' '}
                    {copilotTurnStatusLabels[codex.activeTurn.status]}
                  </span>
                  <strong>{codex.activeTurn.prompt}</strong>
                  {codex.activeTurn.text && <pre>{codex.activeTurn.text}</pre>}
                  {codex.activeTurn.feedback?.items.map((item) => (
                    <CopilotActivityRow key={item.id} item={item} />
                  ))}
                  {codex.activeTurn.status !== 'inProgress' && (
                    <button
                      className="copilot-retry"
                      onClick={() => void window.aiGameStudio.codex.retryTurn()}
                    >
                      <RotateCcw /> 重试此请求
                    </button>
                  )}
                </article>
              ) : codex.transcript.length === 0 ? (
                <div className="copilot-welcome">
                  <MessageSquare />
                  <p>
                    描述要制作、检查或修复的内容。可以附加当前文件、对象和诊断。
                  </p>
                </div>
              ) : null}
            </CopilotTranscript>
            {showCopilotSettings && (
              <div className="copilot-settings">
                <label>
                  模型
                  <select
                    value={codex.model ?? ''}
                    onChange={(event) =>
                      void window.aiGameStudio.codex.setModel(
                        event.target.value,
                      )
                    }
                  >
                    {codex.models.map((model) => (
                      <option key={model.model} value={model.model}>
                        {model.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  推理
                  <select
                    value={codex.reasoningEffort}
                    onChange={(event) =>
                      void window.aiGameStudio.codex.setReasoningEffort(
                        event.target.value,
                      )
                    }
                  >
                    {(
                      codex.models.find((model) => model.model === codex.model)
                        ?.supportedReasoningEfforts ?? []
                    ).map((option) => (
                      <option
                        key={option.reasoningEffort}
                        value={option.reasoningEffort}
                      >
                        {option.reasoningEffort}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  权限
                  <select
                    value={codex.permission}
                    onChange={(event) =>
                      void window.aiGameStudio.codex.setPermission(
                        event.target.value as 'read-only' | 'on-request',
                      )
                    }
                  >
                    <option value="read-only">只读</option>
                    <option value="on-request">项目写入需审批</option>
                  </select>
                </label>
                <div className="copilot-runtime-info">
                  <span>
                    MCP{' '}
                    {codex.mcpServers.reduce(
                      (count, server) => count + server.toolCount,
                      0,
                    )}{' '}
                    tools
                  </span>
                  <span>Skills · 项目 .agents/skills</span>
                </div>
                {!codex.goal && agentPreferences.goalEnabled !== false && (
                  <section className="copilot-goal-create">
                    <input
                      aria-label="Goal objective"
                      value={goalDraft}
                      placeholder="建立这个项目的 Goal"
                      onChange={(event) => setGoalDraft(event.target.value)}
                    />
                    <input
                      aria-label="Goal token budget"
                      type="number"
                      min="1"
                      value={goalBudget}
                      placeholder="可选 token budget"
                      onChange={(event) => setGoalBudget(event.target.value)}
                    />
                    <button
                      disabled={!goalDraft.trim()}
                      onClick={() => {
                        void window.aiGameStudio.codex.setGoal(
                          goalDraft,
                          goalBudget ? Number(goalBudget) : null,
                        );
                        setGoalDraft('');
                        setGoalBudget('');
                      }}
                    >
                      开启 Goal
                    </button>
                  </section>
                )}
                <button
                  onClick={() => {
                    setActivity('settings');
                    setSettingsScope('agent');
                  }}
                >
                  打开 Agent 设置
                </button>
                <button onClick={() => void window.aiGameStudio.codex.logout()}>
                  退出 Codex 登录
                </button>
              </div>
            )}
            {codex.pendingApprovals.length > 0 && (
              <div className="copilot-approvals">
                {codex.pendingApprovals.map((approval) => (
                  <article key={String(approval.id)}>
                    <strong>需要审批 · {approval.method}</strong>
                    <p>
                      {approval.reason ??
                        approval.itemId ??
                        'Codex 请求执行操作'}
                    </p>
                    <div>
                      <button
                        onClick={() =>
                          void window.aiGameStudio.codex.decideApproval(
                            approval.id,
                            'decline',
                          )
                        }
                      >
                        拒绝
                      </button>
                      <button
                        disabled={approval.canAccept === false}
                        onClick={() =>
                          void window.aiGameStudio.codex.decideApproval(
                            approval.id,
                            'accept',
                          )
                        }
                      >
                        批准
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <div className="attachment-chips">
              {attachments.map((attachment) => (
                <button
                  key={attachment}
                  onClick={() =>
                    setAttachments((current) =>
                      current.filter((item) => item !== attachment),
                    )
                  }
                >
                  {attachment}
                  <X />
                </button>
              ))}
            </div>
            {(codex.goal ||
              (agentPreferences.planVisible !== false &&
                codex.goalPlan.length > 0) ||
              (codex.activeTurn && codex.activeTurn.mode !== 'ask')) && (
              <CopilotProgressCard
                key={`progress:${codex.threadId}`}
                summary={
                  <>
                    {codex.goal && (
                      <span>
                        Goal ·{' '}
                        {goalStatusLabels[codex.goal.status] ??
                          codex.goal.status}
                      </span>
                    )}
                    {agentPreferences.planVisible !== false && (
                      <span>Plan · {planPresentation.label}</span>
                    )}
                    <small
                      title={
                        codex.goal?.objective ?? planPresentation.description
                      }
                    >
                      {codex.goal?.objective ??
                        planPresentation.steps.find(
                          (step) => step.status === 'inProgress',
                        )?.step ??
                        planPresentation.description}
                    </small>
                  </>
                }
                actions={
                  codex.goal ? (
                    <>
                      {codex.goal.status !== 'active' &&
                      codex.goal.status !== 'complete' ? (
                        <button
                          onClick={() =>
                            void window.aiGameStudio.codex.setGoalStatus(
                              'active',
                            )
                          }
                        >
                          <Play /> 继续
                        </button>
                      ) : codex.goal.status === 'active' ? (
                        <button
                          onClick={() =>
                            void window.aiGameStudio.codex.stopGoal()
                          }
                        >
                          <Square /> 停止
                        </button>
                      ) : null}
                      <button
                        className="danger"
                        disabled={
                          Boolean(codex.completionRun) &&
                          !['stopped', 'succeeded', 'failed'].includes(
                            codex.completionRun?.status ?? '',
                          )
                        }
                        title={
                          codex.completionRun &&
                          !['stopped', 'succeeded', 'failed'].includes(
                            codex.completionRun.status,
                          )
                            ? '请先停止或完成 Goal；移除只隐藏记录，不删除审计。'
                            : '从面板移除，保留审计和项目结果'
                        }
                        onClick={() =>
                          void window.aiGameStudio.codex.clearGoal()
                        }
                      >
                        <Trash2 /> 移除
                      </button>
                    </>
                  ) : codex.activeTurn?.status === 'inProgress' ? (
                    <button
                      onClick={() =>
                        void window.aiGameStudio.codex.interruptTurn()
                      }
                    >
                      <Square /> 停止
                    </button>
                  ) : codex.activeTurn &&
                    ['failed', 'interrupted'].includes(
                      codex.activeTurn.status,
                    ) ? (
                    <button
                      onClick={() => void window.aiGameStudio.codex.retryTurn()}
                    >
                      <RotateCcw /> 重试
                    </button>
                  ) : null
                }
              >
                <section className="copilot-progress">
                  {codex.goal && (
                    <article
                      className="copilot-running-goal"
                      data-status={codex.goal.status}
                    >
                      <header>
                        <span>GOAL</span>
                        <strong>
                          {goalStatusLabels[codex.goal.status] ??
                            codex.goal.status}
                        </strong>
                      </header>
                      <p>{codex.goal.objective}</p>
                      {codex.completionRun && (
                        <dl className="copilot-completion-run">
                          <div>
                            <dt>恢复状态</dt>
                            <dd>
                              {completionRunStatusLabels[
                                codex.completionRun.status
                              ] ?? codex.completionRun.status}
                            </dd>
                          </div>
                          {codex.completionRun.activePlanStepId && (
                            <div>
                              <dt>当前等待</dt>
                              <dd>
                                {completionWaitLabels[
                                  codex.completionRun.planSteps.find(
                                    (step) =>
                                      step.id ===
                                      codex.completionRun?.activePlanStepId,
                                  )?.waitReason ?? ''
                                ] ?? '可继续执行'}
                              </dd>
                            </div>
                          )}
                          <div>
                            <dt>预算</dt>
                            <dd>
                              {codex.completionRun.budget.committed.toFixed(2)}{' '}
                              /{' '}
                              {codex.completionRun.budget.limit > 0
                                ? codex.completionRun.budget.limit.toFixed(2)
                                : '不限额'}{' '}
                              {codex.completionRun.budget.currency}
                            </dd>
                          </div>
                          <div>
                            <dt>恢复点</dt>
                            <dd>#{codex.completionRun.checkpoint.sequence}</dd>
                          </div>
                        </dl>
                      )}
                      <small>
                        {codex.goal.tokensUsed}
                        {codex.goal.tokenBudget
                          ? ` / ${codex.goal.tokenBudget}`
                          : ''}{' '}
                        tokens · {codex.goal.timeUsedSeconds}s
                      </small>
                    </article>
                  )}
                  {agentPreferences.planVisible !== false &&
                    ((codex.activeTurn && codex.activeTurn.mode !== 'ask') ||
                      codex.goalPlan.length > 0) && (
                      <article
                        className="copilot-running-plan"
                        data-status={planPresentation.status}
                      >
                        <header>
                          <span>PLAN</span>
                          <strong title={planPresentation.description}>
                            {planPresentation.label}
                          </strong>
                        </header>
                        {planPresentation.steps.length > 0 ? (
                          <ol>
                            {planPresentation.steps.map((step, index) => (
                              <li
                                key={`${step.step}-${index}`}
                                data-status={step.status}
                              >
                                <span>{index + 1}</span>
                                <p>{step.step}</p>
                                <small>
                                  {planStatusLabels[step.status] ?? step.status}
                                </small>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p>{planPresentation.emptyMessage}</p>
                        )}
                      </article>
                    )}
                </section>
              </CopilotProgressCard>
            )}
            <div className="copilot-composer">
              {codex.activeTurn && (
                <CopilotExecutionStatus
                  feedback={codex.activeTurn.feedback}
                  status={codex.activeTurn.status}
                  waiting={codex.pendingApprovals.length > 0}
                />
              )}
              <textarea
                value={copilotPrompt}
                onChange={(event) => setCopilotPrompt(event.target.value)}
                placeholder="向当前游戏项目提问或分配任务…"
              />
              <div>
                <button
                  title="附加当前上下文"
                  onClick={() =>
                    activeTab &&
                    setAttachments((current) =>
                      current.includes(activeTab.path)
                        ? current
                        : [...current, activeTab.path],
                    )
                  }
                >
                  <Paperclip />
                </button>
                <select
                  value={copilotMode}
                  onChange={(event) =>
                    setCopilotMode(event.target.value as CodexTurnMode)
                  }
                >
                  <option value="ask">Ask</option>
                  <option value="plan">Plan</option>
                  <option value="agent">Agent</option>
                  <option
                    value="goal"
                    disabled={agentPreferences.goalEnabled === false}
                  >
                    Goal
                  </option>
                </select>
                {codex.activeTurn?.status === 'inProgress' ? (
                  <button
                    onClick={() =>
                      void window.aiGameStudio.codex.interruptTurn()
                    }
                  >
                    <Square /> 停止
                  </button>
                ) : (
                  <button
                    disabled={!copilotPrompt.trim()}
                    onClick={sendToCodex}
                  >
                    <Sparkles /> 发送
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <main className="ide-shell-v2">
      <header className="studio-titlebar workbench-titlebar">
        <div className="titlebar-left">
          <div className="titlebar-brand">
            <span className="brand-mark">AG</span>
            <strong>{project.manifest.name}</strong>
          </div>
          <nav className="main-menu" aria-label="主菜单">
            {(
              [
                ['file', '文件'],
                ['edit', '编辑'],
                ['view', '视图'],
                ['project', '项目'],
                ['run', '运行'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                aria-expanded={mainMenu === id}
                onClick={(event) => {
                  const opening = mainMenu !== id;
                  if (opening) {
                    const bounds = event.currentTarget.getBoundingClientRect();
                    setMainMenuPosition({
                      x: Math.min(bounds.left, window.innerWidth - 204),
                      y: bounds.bottom + 2,
                    });
                  }
                  setMainMenu(opening ? id : null);
                  setDocumentTabMenu(null);
                  setFileMenu(null);
                }}
              >
                {label}
              </button>
            ))}
            <button onClick={() => setRightPanel('copilot')}>Agent</button>
            <button
              onClick={() => {
                setDocuments((current) =>
                  current.some((item) => item.path === 'studio://help')
                    ? current
                    : [
                        ...current,
                        {
                          path: 'studio://help',
                          title: '工作区导览',
                          kind: 'overview',
                          pinned: false,
                        },
                      ],
                );
                setActiveDocument('studio://help');
              }}
            >
              帮助
            </button>
          </nav>
          {mainMenu && (
            <div
              className="main-menu-popup"
              data-menu={mainMenu}
              style={{
                left: mainMenuPosition.x,
                top: mainMenuPosition.y,
              }}
            >
              {mainMenu === 'file' && (
                <>
                  <button
                    onClick={() => {
                      setMainMenu(null);
                      void createFile();
                    }}
                  >
                    新建文件
                  </button>
                  <button
                    onClick={() => {
                      setMainMenu(null);
                      createScene();
                    }}
                  >
                    新建 Scene
                  </button>
                  <button
                    onClick={() => {
                      setMainMenu(null);
                      void saveActive();
                    }}
                  >
                    保存
                  </button>
                  <button
                    onClick={() => {
                      setMainMenu(null);
                      void saveAll();
                    }}
                  >
                    保存全部
                  </button>
                  <button
                    onClick={() => {
                      setMainMenu(null);
                      void onClose();
                    }}
                  >
                    关闭项目
                  </button>
                </>
              )}
              {mainMenu === 'edit' && (
                <>
                  <button
                    onClick={() => {
                      setMainMenu(null);
                      void execute('history.undo');
                    }}
                  >
                    撤销语义事务
                  </button>
                  <button
                    onClick={() => {
                      setMainMenu(null);
                      void execute('history.redo');
                    }}
                  >
                    重做语义事务
                  </button>
                  <button
                    onClick={() => {
                      setMainMenu(null);
                      setActivity('search');
                    }}
                  >
                    项目搜索 / 替换
                  </button>
                </>
              )}
              {mainMenu === 'view' && (
                <>
                  <button
                    onClick={() => {
                      setMainMenu(null);
                      setActivity('explorer');
                    }}
                  >
                    项目文件 / Scene Outline
                  </button>
                  <button
                    onClick={() => {
                      setMainMenu(null);
                      setRightPanel('inspector');
                    }}
                  >
                    Inspector
                  </button>
                  <button
                    onClick={() => {
                      setMainMenu(null);
                      setRightPanel('copilot');
                    }}
                  >
                    Copilot
                  </button>
                  <button
                    onClick={() => {
                      setMainMenu(null);
                      setBottomPanel('console');
                    }}
                  >
                    控制台
                  </button>
                  <button
                    onClick={() => {
                      setMainMenu(null);
                      setBottomPanel('debug');
                    }}
                  >
                    调试器
                  </button>
                  <button
                    onClick={() => {
                      setMainMenu(null);
                      setBottomPanel('tasks');
                    }}
                  >
                    任务输出
                  </button>
                </>
              )}
              {mainMenu === 'project' && (
                <>
                  <button
                    onClick={() => {
                      setMainMenu(null);
                      void guarded(async () => {
                        const report = unwrap(
                          await window.aiGameStudio.projects.doctor(),
                        );
                        appendConsole(
                          `[project] Doctor ${report.ok ? 'passed' : 'failed'}`,
                        );
                        setBottomPanel('problems');
                      });
                    }}
                  >
                    Project Doctor
                  </button>
                  <button
                    onClick={() => {
                      setMainMenu(null);
                      setActivity('extensions');
                    }}
                  >
                    能力与扩展
                  </button>
                  <button
                    onClick={() => {
                      setMainMenu(null);
                      setActivity('settings');
                      setSettingsScope('project');
                      setActiveDocument('studio://settings');
                    }}
                  >
                    项目设置
                  </button>
                  <button
                    onClick={() => {
                      setMainMenu(null);
                      setActivity('build');
                    }}
                  >
                    构建与发布
                  </button>
                </>
              )}
              {mainMenu === 'run' && (
                <>
                  <button
                    onClick={() => {
                      setMainMenu(null);
                      void execute('runtime.start');
                    }}
                  >
                    运行 / 继续
                  </button>
                  <button
                    onClick={() => {
                      setMainMenu(null);
                      void execute('runtime.pause');
                    }}
                  >
                    暂停
                  </button>
                  <button
                    onClick={() => {
                      setMainMenu(null);
                      void execute('runtime.step_tick');
                    }}
                  >
                    单 Tick
                  </button>
                  <button
                    onClick={() => {
                      setMainMenu(null);
                      void execute('runtime.restart');
                    }}
                  >
                    重启
                  </button>
                  <button
                    onClick={() => {
                      setMainMenu(null);
                      void execute('runtime.stop');
                    }}
                  >
                    停止
                  </button>
                  <button
                    onClick={() => {
                      setMainMenu(null);
                      runAllTests();
                    }}
                  >
                    运行全部测试
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <div className="titlebar-run">
          <button
            title={
              workspace.runtime.status === 'paused' ? '继续游戏' : '运行游戏'
            }
            onClick={() =>
              void guarded(async () => {
                await execute(
                  workspace.runtime.status === 'paused'
                    ? 'runtime.resume'
                    : 'runtime.start',
                );
                setDocuments((current) =>
                  current.some((item) => item.path === 'studio://game')
                    ? current
                    : [
                        ...current,
                        {
                          path: 'studio://game',
                          title: 'Game Runtime',
                          kind: 'game',
                          pinned: false,
                        },
                      ],
                );
                setActiveDocument('studio://game');
              })
            }
          >
            <Play />
          </button>
          <button title="暂停" onClick={() => void execute('runtime.pause')}>
            <Pause />
          </button>
          <button
            title="单步执行一个固定 Tick"
            onClick={() => void execute('runtime.step_tick')}
          >
            <ChevronRight />
          </button>
          <button
            title="重新编译项目脚本并按策略重启"
            onClick={() => void execute('runtime.hot_reload')}
          >
            <RotateCcw />
          </button>
          <button
            title="从初始 Scene 重新启动运行会话"
            onClick={() => void execute('runtime.restart')}
          >
            <Play />
          </button>
          <button title="停止" onClick={() => void execute('runtime.stop')}>
            <Square />
          </button>
        </div>
        <WindowControls />
      </header>

      <div
        ref={workspaceRef}
        className="ide-workspace"
        data-resizing={resizeTarget ?? undefined}
        style={
          {
            '--left-dock-width': `${leftWidth}px`,
            '--right-dock-width': `${rightWidth}px`,
            '--bottom-dock-height': `${bottomHeight}px`,
          } as CSSProperties
        }
      >
        <nav className="activity-bar" aria-label="主要工具">
          {activityItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={activity === item.id ? 'active' : ''}
                title={item.label}
                aria-label={item.label}
                aria-pressed={activity === item.id}
                onClick={() => setActivity(item.id)}
                onKeyDown={(event) => {
                  if (!['Enter', ' '].includes(event.key)) return;
                  event.preventDefault();
                  setActivity(item.id);
                }}
              >
                <Icon />
              </button>
            );
          })}
        </nav>
        <aside className="left-dock" aria-label="项目导航">
          <div className="dock-title">
            <strong>
              {activityItems.find((item) => item.id === activity)?.label}
            </strong>
            <MoreHorizontal />
          </div>
          {renderLeftPanel()}
        </aside>
        <input
          type="range"
          className="dock-resizer left-resizer"
          data-quality-id="left-resizer"
          aria-label="调整左侧面板宽度"
          aria-orientation="vertical"
          min={180}
          max={440}
          value={leftWidth}
          onKeyDown={(event) => resizeDockByKeyboard(event, 'left')}
          onChange={(event) => {
            if (!resizeTargetRef.current)
              setLeftWidth(Number(event.target.value));
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            resizeTargetRef.current = 'left';
            setResizeTarget('left');
          }}
        />

        <section className="document-area" aria-label="中央文档工作区">
          <div className="document-tabs" role="tablist" aria-label="打开的文档">
            {documents.map((document) => (
              <div
                key={document.path}
                className={`document-tab ${activeDocument === document.path ? 'active' : ''}`}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setActiveDocument(document.path);
                  setDocumentTabMenu({
                    path: document.path,
                    x: Math.min(event.clientX, window.innerWidth - 204),
                    y: Math.min(event.clientY, window.innerHeight - 174),
                  });
                  setMainMenu(null);
                  setFileMenu(null);
                }}
              >
                <button
                  className="document-tab-select"
                  role="tab"
                  aria-selected={activeDocument === document.path}
                  title={document.path}
                  onClick={() => setActiveDocument(document.path)}
                >
                  <span>
                    {dirtyPaths.includes(document.path) ? '● ' : ''}
                    {document.title}
                  </span>
                </button>
                <button
                  className="document-tab-close"
                  aria-label={`关闭 ${document.title}`}
                  title={`关闭 ${document.title}`}
                  onClick={() => closeDocument(document.path)}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          <div className="document-editor">{renderCenter()}</div>
        </section>

        <aside className="right-dock" aria-label="属性与 AI 助手">
          <div className="right-switcher" role="tablist" aria-label="右侧面板">
            <button
              className={rightPanel === 'inspector' ? 'active' : ''}
              role="tab"
              aria-selected={rightPanel === 'inspector'}
              onClick={() => setRightPanel('inspector')}
            >
              <Inspect /> Inspector
            </button>
            <button
              className={rightPanel === 'copilot' ? 'active' : ''}
              role="tab"
              aria-selected={rightPanel === 'copilot'}
              onClick={() => setRightPanel('copilot')}
            >
              <Bot /> Copilot
            </button>
          </div>
          {renderRight()}
        </aside>
        <input
          type="range"
          className="dock-resizer right-resizer"
          data-quality-id="right-resizer"
          aria-label="调整右侧面板宽度"
          aria-orientation="vertical"
          min={250}
          max={520}
          value={rightWidth}
          onKeyDown={(event) => resizeDockByKeyboard(event, 'right')}
          onChange={(event) => {
            if (!resizeTargetRef.current)
              setRightWidth(Number(event.target.value));
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            resizeTargetRef.current = 'right';
            setResizeTarget('right');
          }}
        />

        <section className="bottom-dock" aria-label="诊断与调试工具">
          <nav aria-label="底部工具">
            {bottomItems.map((item) => (
              <button
                key={item.id}
                className={bottomPanel === item.id ? 'active' : ''}
                aria-pressed={bottomPanel === item.id}
                onClick={() => {
                  setBottomPanel(item.id);
                  setBottomHeight((current) => Math.max(110, current));
                }}
              >
                {item.label}
                {item.id === 'problems' && (
                  <span>
                    {Object.values(editorDiagnostics).flat().length +
                      runtimeDiagnostics.length}
                  </span>
                )}
              </button>
            ))}
            <button
              className="bottom-close"
              aria-label="折叠底部工具"
              title="折叠底部工具"
              onClick={() => setBottomHeight(32)}
            >
              <X />
            </button>
          </nav>
          <div className="bottom-output">
            {bottomPanel === 'console' && <pre>{consoleLines.join('\n')}</pre>}
            {bottomPanel === 'problems' &&
              (Object.values(editorDiagnostics).flat().length === 0 &&
              runtimeDiagnostics.length === 0 ? (
                <div className="tool-empty">
                  <CircleAlert /> 当前没有结构化问题。
                </div>
              ) : (
                <div className="problems-list">
                  {Object.values(editorDiagnostics)
                    .flat()
                    .map((diagnostic, index) => (
                      <button
                        key={`${diagnostic.path}:${diagnostic.line}:${diagnostic.column}:${index}`}
                        data-severity={diagnostic.severity}
                        onClick={() => {
                          const file = workspace.files.find(
                            (candidate) => candidate.path === diagnostic.path,
                          );
                          if (file) void openFile(file);
                          setEditorNavigation({
                            path: diagnostic.path,
                            line: diagnostic.line,
                            column: diagnostic.column,
                            nonce: (editorNavigation?.nonce ?? 0) + 1,
                          });
                        }}
                      >
                        {diagnostic.path}:{diagnostic.line}:{diagnostic.column}{' '}
                        — {diagnostic.message}
                      </button>
                    ))}
                  {runtimeDiagnostics.map((diagnostic, index) => (
                    <button
                      key={`runtime:${diagnostic.file}:${diagnostic.line}:${index}`}
                      data-severity={diagnostic.severity}
                      onClick={() => {
                        const file = workspace.files.find(
                          (candidate) => candidate.path === diagnostic.file,
                        );
                        if (file) void openFile(file);
                        setEditorNavigation({
                          path: diagnostic.file,
                          line: diagnostic.line,
                          column: diagnostic.column,
                          nonce: (editorNavigation?.nonce ?? 0) + 1,
                        });
                      }}
                    >
                      T{diagnostic.tick} · {diagnostic.phase} ·{' '}
                      {diagnostic.file}:{diagnostic.line}:{diagnostic.column} —{' '}
                      {diagnostic.message}
                    </button>
                  ))}
                </div>
              ))}
            {bottomPanel === 'tests' && (
              <div className="test-results-panel">
                {workspace.files
                  .filter((file) => file.kind === 'test')
                  .map((file) => {
                    const run = currentTestRun(file.path);
                    return (
                      <button
                        key={file.path}
                        data-status={run?.status ?? 'idle'}
                        data-test-path={file.path}
                        onClick={() => void openFile(file)}
                      >
                        <ListChecks />
                        <span>{file.path}</span>
                        <strong>{testStatusLabel(run?.status)}</strong>
                        <small>
                          {run?.error ??
                            (run?.tick !== undefined
                              ? `Tick ${run.tick}`
                              : '点击打开测试源')}
                        </small>
                      </button>
                    );
                  })}
              </div>
            )}
            {bottomPanel === 'debug' && (
              <div className="debug-panel">
                <section>
                  <strong>Call Stack</strong>
                  {(
                    (workspace.runtime.pausedAt?.callStack as
                      | Array<Record<string, unknown>>
                      | undefined) ?? []
                  ).map((frame, index) => (
                    <button
                      key={`${stringValue(frame.file)}:${Number(frame.line ?? 1)}:${index}`}
                      onClick={() => {
                        const path = stringValue(frame.file);
                        const file = workspace.files.find(
                          (item) => item.path === path,
                        );
                        if (file) void openFile(file);
                        setEditorNavigation({
                          path,
                          line: Number(frame.line ?? 1),
                          column: Number(frame.column ?? 1),
                          nonce: (editorNavigation?.nonce ?? 0) + 1,
                        });
                      }}
                    >
                      {stringValue(frame.name, 'frame')} ·{' '}
                      {stringValue(frame.file)}:{Number(frame.line ?? 1)}
                    </button>
                  ))}
                  {!workspace.runtime.pausedAt && (
                    <small>运行到源码断点后显示。</small>
                  )}
                </section>
                <section>
                  <strong>Scopes</strong>
                  <pre>
                    {JSON.stringify(
                      workspace.runtime.pausedAt?.scopes ?? {},
                      null,
                      2,
                    )}
                  </pre>
                </section>
                <section>
                  <strong>Watches</strong>
                  {(workspace.runtime.watches ?? []).slice(-30).map((watch) => (
                    <code key={`${watch.tick}:${watch.path}`}>
                      T{watch.tick} {watch.path} = {JSON.stringify(watch.value)}
                    </code>
                  ))}
                </section>
              </div>
            )}
            {bottomPanel === 'tasks' && (
              <pre className="task-output" aria-label="受限任务输出">
                {consoleLines
                  .filter((line) =>
                    /^\[(?:build|test|command|change|files|settings)\]/u.test(
                      line,
                    ),
                  )
                  .join('\n') ||
                  '任务输出只显示 Studio 注册任务；Preview 不开放任意 Shell，避免项目脚本绕过权限边界。'}
              </pre>
            )}
            {bottomPanel === 'profiler' && (
              <div className="tool-empty">
                <Cpu /> Runtime{' '}
                {workspace.runtime.durationMs?.toFixed(2) ?? '—'} ms · Tick{' '}
                {workspace.runtime.tick} ·{' '}
                {workspace.runtime.memoryUsedBytes
                  ? `${(workspace.runtime.memoryUsedBytes / 1024).toFixed(1)} KiB`
                  : '—'}{' '}
                · {workspace.runtime.operations ?? 0} operations ·{' '}
                {workspace.runtime.events ?? 0} Events
              </div>
            )}
            {bottomPanel === 'event-timeline' && (
              <div className="event-timeline-list">
                {(workspace.runtime.timeline ?? [])
                  .filter((entry) =>
                    [
                      'command',
                      'event:emit',
                      'event:deliver',
                      'script:hook',
                      'debug:breakpoint',
                    ].includes(String(entry.kind)),
                  )
                  .slice(-120)
                  .map((entry, index) => (
                    <div
                      key={`${String(entry.tick)}:${String(entry.kind)}:${index}`}
                    >
                      <strong>T{String(entry.tick)}</strong>
                      <span>{String(entry.phase)}</span>
                      <code>{String(entry.kind)}</code>
                      <span>
                        {displayValue(
                          entry.type ??
                            entry.hook ??
                            entry.systemId ??
                            entry.objectId ??
                            '',
                        )}
                      </span>
                    </div>
                  ))}
                {(workspace.runtime.timeline ?? []).length === 0 && (
                  <div className="tool-empty">
                    <Bug /> 运行 Game 后显示 Command、生命周期、System 和
                    Event。
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
        <input
          type="range"
          className="dock-resizer bottom-resizer"
          data-quality-id="bottom-resizer"
          aria-label="调整底部工具高度"
          aria-orientation="horizontal"
          min={32}
          max={360}
          value={bottomHeight}
          onChange={(event) => {
            if (!resizeTargetRef.current)
              setBottomHeight(Number(event.target.value));
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            resizeTargetRef.current = 'bottom';
            setResizeTarget('bottom');
          }}
        />
        {documentTabMenu && (
          <div
            className="document-tab-context-menu"
            role="menu"
            aria-label="文档选项卡操作"
            style={{ left: documentTabMenu.x, top: documentTabMenu.y }}
          >
            <button
              role="menuitem"
              onClick={() => closeDocument(documentTabMenu.path)}
            >
              <span>关闭当前</span>
              <kbd>Ctrl+W</kbd>
            </button>
            <button
              role="menuitem"
              disabled={
                documents.findIndex(
                  (document) => document.path === documentTabMenu.path,
                ) >=
                documents.length - 1
              }
              onClick={() => {
                const index = documents.findIndex(
                  (document) => document.path === documentTabMenu.path,
                );
                closeDocuments(
                  documents.slice(index + 1).map((document) => document.path),
                  documentTabMenu.path,
                );
              }}
            >
              <span>关闭右侧</span>
            </button>
            <button
              role="menuitem"
              disabled={documents.length <= 1}
              onClick={() =>
                closeDocuments(
                  documents
                    .filter(
                      (document) => document.path !== documentTabMenu.path,
                    )
                    .map((document) => document.path),
                  documentTabMenu.path,
                )
              }
            >
              <span>关闭其他</span>
            </button>
            <div className="context-menu-separator" />
            <button
              role="menuitem"
              onClick={() =>
                closeDocuments(documents.map((document) => document.path))
              }
            >
              <span>关闭全部</span>
              <kbd>Ctrl+Shift+W</kbd>
            </button>
          </div>
        )}
        {fileMenu && (
          <div
            className="file-context-menu"
            style={{ left: fileMenu.x, top: fileMenu.y }}
          >
            <button onClick={() => void fileAction('rename', fileMenu.path)}>
              重命名 / 移动
            </button>
            <button onClick={() => void fileAction('duplicate', fileMenu.path)}>
              复制
            </button>
            <button onClick={() => void fileAction('trash', fileMenu.path)}>
              移到项目回收站
            </button>
          </div>
        )}
      </div>

      {changeReview && (
        <ChangeSetReviewDialog
          key={changeReview.id}
          change={changeReview}
          onClose={() => setChangeReview(null)}
          onSubmit={async (reason) => {
            const feedback = {
              proposalHash: changeReview.proposalHash,
              reason,
            };
            const api = window.aiGameStudio.workspace.changeSets;
            const reviewed = unwrap(
              await (changeReview.status === 'rejected'
                ? api.recordRejectionFeedback(changeReview.id, feedback)
                : api.reject(changeReview.id, feedback)),
            );
            setChangeSets((current) =>
              current.map((change) =>
                change.id === reviewed.id ? reviewed : change,
              ),
            );
            appendConsole(`[changeset] rejection-feedback ${reviewed.id}`);
          }}
        />
      )}
      {textPrompt && (
        <div className="studio-dialog-backdrop">
          <dialog
            open
            className="studio-text-dialog"
            aria-modal="true"
            aria-labelledby="studio-text-dialog-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                resolveTextPrompt(null);
              }
            }}
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const value = textPrompt.value.trim();
                if (value) resolveTextPrompt(value);
              }}
            >
              <header>
                <strong id="studio-text-dialog-title">
                  {textPrompt.title}
                </strong>
                <button
                  type="button"
                  title="取消"
                  aria-label="取消"
                  onClick={() => resolveTextPrompt(null)}
                >
                  <X />
                </button>
              </header>
              <label>
                <span>{textPrompt.label}</span>
                {textPrompt.multiline ? (
                  <textarea
                    autoFocus
                    value={textPrompt.value}
                    onChange={(event) =>
                      setTextPrompt((current) =>
                        current
                          ? { ...current, value: event.target.value }
                          : current,
                      )
                    }
                  />
                ) : (
                  <input
                    autoFocus
                    value={textPrompt.value}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) =>
                      setTextPrompt((current) =>
                        current
                          ? { ...current, value: event.target.value }
                          : current,
                      )
                    }
                  />
                )}
              </label>
              <footer>
                <button type="button" onClick={() => resolveTextPrompt(null)}>
                  取消
                </button>
                <button type="submit" disabled={!textPrompt.value.trim()}>
                  {textPrompt.confirmLabel}
                </button>
              </footer>
            </form>
          </dialog>
        </div>
      )}

      <footer className="status-bar">
        <button onClick={() => setActivity('source-control')}>
          <GitBranch /> main
        </button>
        <span>0 errors · 0 warnings</span>
        <span className="status-spacer" />
        <span>{project.manifest.defaultTarget}</span>
        <span>
          {workspace.runtime.status} · Tick {workspace.runtime.tick}
        </span>
        <button onClick={() => setRightPanel('copilot')}>
          <Bot /> {codex?.account ? codex.status : '登录 Codex'}
        </button>
        <button onClick={() => void onClose()}>关闭项目</button>
      </footer>
    </main>
  );
}
