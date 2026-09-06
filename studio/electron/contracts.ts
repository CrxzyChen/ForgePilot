import type {
  CreateProjectRequest,
  DoctorReport,
  ProjectSummary,
} from '../project/project-types.ts';
import type {
  CodexStudioState,
  CodexTurnMode,
} from './codex-process-manager.ts';
import type {
  WorkspaceCommandResult,
  WorkspaceSnapshot,
  StudioWorkspaceState,
} from '../workspace/workspace-types.ts';
import type { StudioChangeSet } from '../workspace/studio-change-set-service.ts';
import type {
  AssetJobKind,
  AssetProviderHealth,
  StudioAssetJob,
} from '../workspace/studio-asset-job-broker.ts';
import type {
  GameBuildProfile,
  GameBuildReport,
} from '../workspace/studio-game-build-service.ts';
import type {
  StudioSettingsScope,
  StudioSettingsSnapshot,
} from '../settings/studio-settings-service.ts';
import type { CredentialSummary } from '../settings/credential-vault-service.ts';
import type { PackageVerification } from '../workspace/game-package-verification.ts';
import type { CredentialProviderDefinition } from '../settings/credential-provider-definitions.ts';
import type { ProviderModelCatalog } from '../settings/provider-model-catalog-service.ts';
import type { ThreadGoalStatus } from '../../generated/codex-app-server/v2/ThreadGoalStatus.ts';

export const IPC_CHANNELS = {
  appGetInfo: 'studio:app:get-info',
  windowGetState: 'studio:window:get-state',
  windowMinimize: 'studio:window:minimize',
  windowToggleMaximize: 'studio:window:toggle-maximize',
  windowClose: 'studio:window:close',
  windowSetCloseState: 'studio:window:set-close-state',
  windowState: 'studio:window:state',
  projectChooseParent: 'studio:project:choose-parent',
  projectChooseExisting: 'studio:project:choose-existing',
  projectCreate: 'studio:project:create',
  projectOpen: 'studio:project:open',
  projectClose: 'studio:project:close',
  projectRecent: 'studio:project:recent',
  projectDoctor: 'studio:project:doctor',
  projectCurrent: 'studio:project:current',
  projectProgress: 'studio:project:progress',
  settingsGet: 'studio:settings:get',
  settingsUpdate: 'studio:settings:update',
  settingsReset: 'studio:settings:reset',
  credentialList: 'studio:credential:list',
  credentialSet: 'studio:credential:set',
  credentialRemove: 'studio:credential:remove',
  credentialProviderList: 'studio:credential-provider:list',
  credentialModelDiscover: 'studio:credential-model:discover',
  codexGetState: 'studio:codex:get-state',
  codexLoadOlderHistory: 'studio:codex:load-older-history',
  codexLogin: 'studio:codex:login',
  codexLogout: 'studio:codex:logout',
  codexDecideApproval: 'studio:codex:decide-approval',
  codexStartTurn: 'studio:codex:start-turn',
  codexSetModel: 'studio:codex:set-model',
  codexSetReasoningEffort: 'studio:codex:set-reasoning-effort',
  codexSetPermission: 'studio:codex:set-permission',
  codexRetryTurn: 'studio:codex:retry-turn',
  codexCreateConversation: 'studio:codex:create-conversation',
  codexSelectConversation: 'studio:codex:select-conversation',
  codexSetGoal: 'studio:codex:set-goal',
  codexSetGoalStatus: 'studio:codex:set-goal-status',
  codexStopGoal: 'studio:codex:stop-goal',
  codexClearGoal: 'studio:codex:clear-goal',
  codexInterruptTurn: 'studio:codex:interrupt-turn',
  codexState: 'studio:codex:state',
  workspaceSnapshot: 'studio:workspace:snapshot',
  workspaceReadText: 'studio:workspace:read-text',
  workspaceGetState: 'studio:workspace:get-state',
  workspaceSetState: 'studio:workspace:set-state',
  workspaceExecute: 'studio:workspace:execute',
  workspaceRuntimeInput: 'studio:workspace:runtime-input',
  workspaceRuntimeState: 'studio:workspace:runtime-state',
  workspaceExternalChange: 'studio:workspace:external-change',
  workspaceImportAsset: 'studio:workspace:import-asset',
  workspaceAssetPreview: 'studio:workspace:asset-preview',
  changeSetList: 'studio:changeset:list',
  changeSetApprove: 'studio:changeset:approve',
  changeSetReject: 'studio:changeset:reject',
  changeSetRejectionFeedback: 'studio:changeset:rejection-feedback',
  changeSetChanged: 'studio:changeset:changed',
  changeSetApply: 'studio:changeset:apply',
  changeSetTest: 'studio:changeset:test',
  changeSetRollback: 'studio:changeset:rollback',
  assetJobList: 'studio:asset-job:list',
  assetJobSubmit: 'studio:asset-job:submit',
  assetJobRun: 'studio:asset-job:run',
  assetJobRetry: 'studio:asset-job:retry',
  assetJobCancel: 'studio:asset-job:cancel',
  assetProviderList: 'studio:asset-provider:list',
  assetProviderEstimate: 'studio:asset-provider:estimate',
  assetJobSelect: 'studio:asset-job:select',
  assetCandidatePreview: 'studio:asset-candidate:preview',
  assetCandidateReject: 'studio:asset-candidate:reject',
  assetCandidateRegenerate: 'studio:asset-candidate:regenerate',
  assetJobReconcile: 'studio:asset-job:reconcile',
  gameBuild: 'studio:game-build:run',
  gameBuildReadReport: 'studio:game-build:read-report',
  gameBuildVerify: 'studio:game-build:verify-package',
} as const;

export type AppInfo = {
  name: string;
  version: string;
  platform: string;
  electron: string;
  rendererRecovery: {
    count: number;
    reason: string;
    recoveredAt: string;
  } | null;
};

export type StudioWindowState = {
  maximized: boolean;
  fullScreen: boolean;
};

export type StudioCloseState = {
  dirtyDocuments: number;
  runtimeActive: boolean;
  buildActive: boolean;
  agentActive: boolean;
};

export type ProjectLoadProgress = {
  operation: 'create' | 'open';
  stage: 'choosing' | 'validating' | 'workspace' | 'codex' | 'finalizing';
  message: string;
  path: string | null;
};

export type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

export type StudioDesktopApi = {
  app: {
    getInfo(): Promise<IpcResult<AppInfo>>;
  };
  window: {
    getState(): Promise<IpcResult<StudioWindowState>>;
    minimize(): Promise<IpcResult<StudioWindowState>>;
    toggleMaximize(): Promise<IpcResult<StudioWindowState>>;
    close(): Promise<IpcResult<null>>;
    setCloseState(state: StudioCloseState): Promise<IpcResult<null>>;
    onState(listener: (state: StudioWindowState) => void): () => void;
  };
  projects: {
    chooseParentDirectory(): Promise<IpcResult<string | null>>;
    chooseExistingProject(): Promise<IpcResult<string | null>>;
    create(request: CreateProjectRequest): Promise<IpcResult<ProjectSummary>>;
    open(path: string): Promise<IpcResult<ProjectSummary>>;
    close(): Promise<IpcResult<null>>;
    recent(): Promise<IpcResult<string[]>>;
    doctor(): Promise<IpcResult<DoctorReport>>;
    current(): Promise<IpcResult<ProjectSummary | null>>;
    onProgress(listener: (progress: ProjectLoadProgress) => void): () => void;
  };
  settings: {
    get(scope: StudioSettingsScope): Promise<IpcResult<StudioSettingsSnapshot>>;
    update(
      scope: StudioSettingsScope,
      patch: Record<string, unknown>,
    ): Promise<IpcResult<StudioSettingsSnapshot>>;
    reset(
      scope: StudioSettingsScope,
    ): Promise<IpcResult<StudioSettingsSnapshot>>;
    credentials: {
      providers(): Promise<IpcResult<CredentialProviderDefinition[]>>;
      list(): Promise<IpcResult<CredentialSummary[]>>;
      set(input: {
        id?: string;
        provider: string;
        label: string;
        configuration?: Record<string, string>;
        secrets?: Record<string, string>;
      }): Promise<IpcResult<CredentialSummary>>;
      remove(id: string): Promise<IpcResult<boolean>>;
      discoverModels(input: {
        providerId: string;
        credentialId: string;
        refresh?: boolean;
      }): Promise<IpcResult<ProviderModelCatalog>>;
    };
  };
  codex: {
    getState(): Promise<IpcResult<CodexStudioState>>;
    loadOlderHistory(): Promise<IpcResult<CodexStudioState>>;
    login(): Promise<IpcResult<CodexStudioState>>;
    logout(): Promise<IpcResult<CodexStudioState>>;
    decideApproval(
      id: string | number,
      decision: 'accept' | 'decline',
    ): Promise<IpcResult<CodexStudioState>>;
    startTurn(
      mode: CodexTurnMode,
      prompt: string,
    ): Promise<IpcResult<CodexStudioState>>;
    setModel(model: string): Promise<IpcResult<CodexStudioState>>;
    setReasoningEffort(effort: string): Promise<IpcResult<CodexStudioState>>;
    setPermission(
      permission: 'read-only' | 'on-request',
    ): Promise<IpcResult<CodexStudioState>>;
    retryTurn(): Promise<IpcResult<CodexStudioState>>;
    createConversation(): Promise<IpcResult<CodexStudioState>>;
    selectConversation(threadId: string): Promise<IpcResult<CodexStudioState>>;
    setGoal(
      objective: string,
      tokenBudget?: number | null,
    ): Promise<IpcResult<CodexStudioState>>;
    setGoalStatus(
      status: ThreadGoalStatus,
    ): Promise<IpcResult<CodexStudioState>>;
    stopGoal(): Promise<IpcResult<CodexStudioState>>;
    clearGoal(): Promise<IpcResult<CodexStudioState>>;
    interruptTurn(): Promise<IpcResult<CodexStudioState>>;
    onState(listener: (state: CodexStudioState) => void): () => void;
  };
  workspace: {
    snapshot(): Promise<IpcResult<WorkspaceSnapshot>>;
    readText(
      path: string,
    ): Promise<IpcResult<{ path: string; source: string; hash: string }>>;
    getState(): Promise<IpcResult<StudioWorkspaceState>>;
    setState(
      state: StudioWorkspaceState,
    ): Promise<IpcResult<StudioWorkspaceState>>;
    execute(
      command: string,
      input?: Record<string, unknown>,
    ): Promise<IpcResult<WorkspaceCommandResult>>;
    runtimeInput(input: {
      tick?: number;
      action: string;
      value: number;
      source: 'keyboard' | 'pointer' | 'gamepad' | 'replay' | 'automation';
    }): Promise<
      IpcResult<{
        tick: number;
        action: string;
        value: number;
        source: 'keyboard' | 'pointer' | 'gamepad' | 'replay' | 'automation';
      }>
    >;
    onRuntimeState(
      listener: (runtime: WorkspaceSnapshot['runtime']) => void,
    ): () => void;
    onExternalChange(listener: (path: string) => void): () => void;
    importAsset(): Promise<IpcResult<WorkspaceCommandResult | null>>;
    assetPreview(
      path: string,
    ): Promise<IpcResult<{ path: string; dataUrl: string }>>;
    assetJobs: {
      list(): Promise<IpcResult<StudioAssetJob[]>>;
      submit(input: {
        kind: AssetJobKind;
        providerId?: string;
        credentialRef?: string;
        modelId?: string;
        parameters?: Record<string, string | number | boolean>;
        prompt: string;
        outputName: string;
        variants?: number;
      }): Promise<IpcResult<StudioAssetJob>>;
      run(id: string): Promise<IpcResult<StudioAssetJob>>;
      retry(id: string): Promise<IpcResult<StudioAssetJob>>;
      cancel(id: string): Promise<IpcResult<StudioAssetJob>>;
      providers(): Promise<IpcResult<AssetProviderHealth[]>>;
      estimate(input: {
        kind?: AssetJobKind;
        providerId: string;
        modelId?: string;
        variants?: number;
      }): Promise<
        IpcResult<{
          providerId: string;
          modelId: string;
          variants: number;
          currency: 'CNY';
          estimatedCostCny: number;
          costConfigured: boolean;
        }>
      >;
      select(
        id: string,
        candidateId: string,
      ): Promise<IpcResult<StudioAssetJob>>;
      preview(
        id: string,
        candidateId: string,
      ): Promise<
        IpcResult<{
          candidate: StudioAssetJob['candidates'][number];
          dataUrl: string;
        }>
      >;
      reject(
        id: string,
        candidateId: string,
        reason: string,
      ): Promise<IpcResult<StudioAssetJob>>;
      regenerate(
        id: string,
        candidateId: string,
        instruction: string,
      ): Promise<IpcResult<StudioAssetJob>>;
      reconcile(
        id: string,
        outcome: 'confirmed-not-run' | 'confirmed-run',
      ): Promise<IpcResult<StudioAssetJob>>;
    };
    builds: {
      verify(
        profile: GameBuildProfile,
        expectedZipSha256: string,
      ): Promise<IpcResult<PackageVerification>>;
      run(profile: GameBuildProfile): Promise<IpcResult<GameBuildReport>>;
      readReport(
        profile: GameBuildProfile,
      ): Promise<IpcResult<GameBuildReport>>;
    };
    changeSets: {
      onChanged(listener: () => void): () => void;
      list(): Promise<IpcResult<StudioChangeSet[]>>;
      approve(
        id: string,
        selectedOperationIds: string[],
      ): Promise<IpcResult<StudioChangeSet>>;
      reject(
        id: string,
        feedback?: { proposalHash: string; reason: string },
      ): Promise<IpcResult<StudioChangeSet>>;
      recordRejectionFeedback(
        id: string,
        feedback: { proposalHash: string; reason: string },
      ): Promise<IpcResult<StudioChangeSet>>;
      apply(id: string): Promise<IpcResult<StudioChangeSet>>;
      test(id: string): Promise<IpcResult<StudioChangeSet>>;
      rollback(id: string): Promise<IpcResult<StudioChangeSet>>;
    };
  };
};
