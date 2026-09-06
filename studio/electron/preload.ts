import { contextBridge, ipcRenderer } from 'electron';

import {
  IPC_CHANNELS,
  type AppInfo,
  type IpcResult,
  type ProjectLoadProgress,
  type StudioCloseState,
  type StudioDesktopApi,
  type StudioWindowState,
} from './contracts.ts';
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
import type { StudioAssetJob } from '../workspace/studio-asset-job-broker.ts';
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

const invoke = <T>(
  channel: string,
  ...args: unknown[]
): Promise<IpcResult<T>> =>
  ipcRenderer.invoke(channel, ...args) as Promise<IpcResult<T>>;

const api: StudioDesktopApi = Object.freeze({
  app: Object.freeze({
    getInfo: () => invoke<AppInfo>(IPC_CHANNELS.appGetInfo),
  }),
  window: Object.freeze({
    getState: () => invoke<StudioWindowState>(IPC_CHANNELS.windowGetState),
    minimize: () => invoke<StudioWindowState>(IPC_CHANNELS.windowMinimize),
    toggleMaximize: () =>
      invoke<StudioWindowState>(IPC_CHANNELS.windowToggleMaximize),
    close: () => invoke<null>(IPC_CHANNELS.windowClose),
    setCloseState: (state: StudioCloseState) =>
      invoke<null>(IPC_CHANNELS.windowSetCloseState, state),
    onState: (listener: (state: StudioWindowState) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: unknown) =>
        listener(state as StudioWindowState);
      ipcRenderer.on(IPC_CHANNELS.windowState, handler);
      return () =>
        ipcRenderer.removeListener(IPC_CHANNELS.windowState, handler);
    },
  }),
  projects: Object.freeze({
    chooseParentDirectory: () =>
      invoke<string | null>(IPC_CHANNELS.projectChooseParent),
    chooseExistingProject: () =>
      invoke<string | null>(IPC_CHANNELS.projectChooseExisting),
    create: (request: CreateProjectRequest) =>
      invoke<ProjectSummary>(IPC_CHANNELS.projectCreate, request),
    open: (path: string) =>
      invoke<ProjectSummary>(IPC_CHANNELS.projectOpen, path),
    close: () => invoke<null>(IPC_CHANNELS.projectClose),
    recent: () => invoke<string[]>(IPC_CHANNELS.projectRecent),
    doctor: () => invoke<DoctorReport>(IPC_CHANNELS.projectDoctor),
    current: () => invoke<ProjectSummary | null>(IPC_CHANNELS.projectCurrent),
    onProgress: (listener: (progress: ProjectLoadProgress) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: unknown) =>
        listener(progress as ProjectLoadProgress);
      ipcRenderer.on(IPC_CHANNELS.projectProgress, handler);
      return () =>
        ipcRenderer.removeListener(IPC_CHANNELS.projectProgress, handler);
    },
  }),
  settings: Object.freeze({
    get: (scope: StudioSettingsScope) =>
      invoke<StudioSettingsSnapshot>(IPC_CHANNELS.settingsGet, scope),
    update: (scope: StudioSettingsScope, patch: Record<string, unknown>) =>
      invoke<StudioSettingsSnapshot>(IPC_CHANNELS.settingsUpdate, scope, patch),
    reset: (scope: StudioSettingsScope) =>
      invoke<StudioSettingsSnapshot>(IPC_CHANNELS.settingsReset, scope),
    credentials: Object.freeze({
      providers: () =>
        invoke<CredentialProviderDefinition[]>(
          IPC_CHANNELS.credentialProviderList,
        ),
      list: () => invoke<CredentialSummary[]>(IPC_CHANNELS.credentialList),
      set: (input: {
        id?: string;
        provider: string;
        label: string;
        configuration?: Record<string, string>;
        secrets?: Record<string, string>;
      }) => invoke<CredentialSummary>(IPC_CHANNELS.credentialSet, input),
      remove: (id: string) =>
        invoke<boolean>(IPC_CHANNELS.credentialRemove, id),
      discoverModels: (input: {
        providerId: string;
        credentialId: string;
        refresh?: boolean;
      }) =>
        invoke<ProviderModelCatalog>(
          IPC_CHANNELS.credentialModelDiscover,
          input,
        ),
    }),
  }),
  codex: Object.freeze({
    getState: () => invoke<CodexStudioState>(IPC_CHANNELS.codexGetState),
    loadOlderHistory: () =>
      invoke<CodexStudioState>(IPC_CHANNELS.codexLoadOlderHistory),
    login: () => invoke<CodexStudioState>(IPC_CHANNELS.codexLogin),
    logout: () => invoke<CodexStudioState>(IPC_CHANNELS.codexLogout),
    decideApproval: (id: string | number, decision: 'accept' | 'decline') =>
      invoke<CodexStudioState>(IPC_CHANNELS.codexDecideApproval, id, decision),
    startTurn: (mode: CodexTurnMode, prompt: string) =>
      invoke<CodexStudioState>(IPC_CHANNELS.codexStartTurn, mode, prompt),
    setModel: (model: string) =>
      invoke<CodexStudioState>(IPC_CHANNELS.codexSetModel, model),
    setReasoningEffort: (effort: string) =>
      invoke<CodexStudioState>(IPC_CHANNELS.codexSetReasoningEffort, effort),
    setPermission: (permission: 'read-only' | 'on-request') =>
      invoke<CodexStudioState>(IPC_CHANNELS.codexSetPermission, permission),
    retryTurn: () => invoke<CodexStudioState>(IPC_CHANNELS.codexRetryTurn),
    createConversation: () =>
      invoke<CodexStudioState>(IPC_CHANNELS.codexCreateConversation),
    selectConversation: (threadId: string) =>
      invoke<CodexStudioState>(IPC_CHANNELS.codexSelectConversation, threadId),
    setGoal: (objective: string, tokenBudget?: number | null) =>
      invoke<CodexStudioState>(
        IPC_CHANNELS.codexSetGoal,
        objective,
        tokenBudget,
      ),
    setGoalStatus: (
      status:
        | 'active'
        | 'paused'
        | 'blocked'
        | 'usageLimited'
        | 'budgetLimited'
        | 'complete',
    ) => invoke<CodexStudioState>(IPC_CHANNELS.codexSetGoalStatus, status),
    stopGoal: () => invoke<CodexStudioState>(IPC_CHANNELS.codexStopGoal),
    clearGoal: () => invoke<CodexStudioState>(IPC_CHANNELS.codexClearGoal),
    interruptTurn: () =>
      invoke<CodexStudioState>(IPC_CHANNELS.codexInterruptTurn),
    onState: (listener: (state: CodexStudioState) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: unknown) =>
        listener(state as Parameters<typeof listener>[0]);
      ipcRenderer.on(IPC_CHANNELS.codexState, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.codexState, handler);
    },
  }),
  workspace: Object.freeze({
    snapshot: () => invoke<WorkspaceSnapshot>(IPC_CHANNELS.workspaceSnapshot),
    readText: (path: string) =>
      invoke<{ path: string; source: string; hash: string }>(
        IPC_CHANNELS.workspaceReadText,
        path,
      ),
    getState: () =>
      invoke<StudioWorkspaceState>(IPC_CHANNELS.workspaceGetState),
    setState: (state: StudioWorkspaceState) =>
      invoke<StudioWorkspaceState>(IPC_CHANNELS.workspaceSetState, state),
    execute: (command: string, input: Record<string, unknown> = {}) =>
      invoke<WorkspaceCommandResult>(
        IPC_CHANNELS.workspaceExecute,
        command,
        input,
      ),
    runtimeInput: (
      input: Parameters<StudioDesktopApi['workspace']['runtimeInput']>[0],
    ) =>
      invoke<
        Awaited<
          ReturnType<StudioDesktopApi['workspace']['runtimeInput']>
        > extends IpcResult<infer Value>
          ? Value
          : never
      >(IPC_CHANNELS.workspaceRuntimeInput, input),
    onRuntimeState: (
      listener: (runtime: WorkspaceSnapshot['runtime']) => void,
    ) => {
      const handler = (_event: Electron.IpcRendererEvent, runtime: unknown) =>
        listener(runtime as WorkspaceSnapshot['runtime']);
      ipcRenderer.on(IPC_CHANNELS.workspaceRuntimeState, handler);
      return () =>
        ipcRenderer.removeListener(IPC_CHANNELS.workspaceRuntimeState, handler);
    },
    onExternalChange: (listener: (path: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, path: unknown) =>
        listener(String(path));
      ipcRenderer.on(IPC_CHANNELS.workspaceExternalChange, handler);
      return () =>
        ipcRenderer.removeListener(
          IPC_CHANNELS.workspaceExternalChange,
          handler,
        );
    },
    importAsset: () =>
      invoke<WorkspaceCommandResult | null>(IPC_CHANNELS.workspaceImportAsset),
    assetPreview: (path: string) =>
      invoke<{ path: string; dataUrl: string }>(
        IPC_CHANNELS.workspaceAssetPreview,
        path,
      ),
    assetJobs: Object.freeze({
      list: () => invoke<StudioAssetJob[]>(IPC_CHANNELS.assetJobList),
      submit: (
        input: Parameters<
          StudioDesktopApi['workspace']['assetJobs']['submit']
        >[0],
      ) => invoke<StudioAssetJob>(IPC_CHANNELS.assetJobSubmit, input),
      run: (id: string) => invoke<StudioAssetJob>(IPC_CHANNELS.assetJobRun, id),
      retry: (id: string) =>
        invoke<StudioAssetJob>(IPC_CHANNELS.assetJobRetry, id),
      cancel: (id: string) =>
        invoke<StudioAssetJob>(IPC_CHANNELS.assetJobCancel, id),
      providers: () =>
        invoke<
          import('../workspace/studio-asset-job-broker.ts').AssetProviderHealth[]
        >(IPC_CHANNELS.assetProviderList),
      estimate: (input: {
        kind?: import('../workspace/studio-asset-job-broker.ts').AssetJobKind;
        providerId: string;
        modelId?: string;
        variants?: number;
      }) =>
        invoke<{
          providerId: string;
          modelId: string;
          variants: number;
          currency: 'CNY';
          estimatedCostCny: number;
          costConfigured: boolean;
        }>(IPC_CHANNELS.assetProviderEstimate, input),
      select: (id: string, candidateId: string) =>
        invoke<StudioAssetJob>(IPC_CHANNELS.assetJobSelect, id, candidateId),
      preview: (id: string, candidateId: string) =>
        invoke<{
          candidate: StudioAssetJob['candidates'][number];
          dataUrl: string;
        }>(IPC_CHANNELS.assetCandidatePreview, id, candidateId),
      reject: (id: string, candidateId: string, reason: string) =>
        invoke<StudioAssetJob>(
          IPC_CHANNELS.assetCandidateReject,
          id,
          candidateId,
          reason,
        ),
      regenerate: (id: string, candidateId: string, instruction: string) =>
        invoke<StudioAssetJob>(
          IPC_CHANNELS.assetCandidateRegenerate,
          id,
          candidateId,
          instruction,
        ),
      reconcile: (id: string, outcome: 'confirmed-not-run' | 'confirmed-run') =>
        invoke<StudioAssetJob>(IPC_CHANNELS.assetJobReconcile, id, outcome),
    }),
    builds: Object.freeze({
      verify: (profile: GameBuildProfile, expectedZipSha256: string) =>
        invoke<PackageVerification>(
          IPC_CHANNELS.gameBuildVerify,
          profile,
          expectedZipSha256,
        ),
      run: (profile: GameBuildProfile) =>
        invoke<GameBuildReport>(IPC_CHANNELS.gameBuild, profile),
      readReport: (profile: GameBuildProfile) =>
        invoke<GameBuildReport>(IPC_CHANNELS.gameBuildReadReport, profile),
    }),
    changeSets: Object.freeze({
      onChanged: (listener: () => void) => {
        const handler = () => listener();
        ipcRenderer.on(IPC_CHANNELS.changeSetChanged, handler);
        return () =>
          ipcRenderer.removeListener(IPC_CHANNELS.changeSetChanged, handler);
      },
      list: () => invoke<StudioChangeSet[]>(IPC_CHANNELS.changeSetList),
      approve: (id: string, selectedOperationIds: string[]) =>
        invoke<StudioChangeSet>(
          IPC_CHANNELS.changeSetApprove,
          id,
          selectedOperationIds,
        ),
      reject: (
        id: string,
        feedback?: { proposalHash: string; reason: string },
      ) => invoke<StudioChangeSet>(IPC_CHANNELS.changeSetReject, id, feedback),
      recordRejectionFeedback: (
        id: string,
        feedback: { proposalHash: string; reason: string },
      ) =>
        invoke<StudioChangeSet>(
          IPC_CHANNELS.changeSetRejectionFeedback,
          id,
          feedback,
        ),
      apply: (id: string) =>
        invoke<StudioChangeSet>(IPC_CHANNELS.changeSetApply, id),
      test: (id: string) =>
        invoke<StudioChangeSet>(IPC_CHANNELS.changeSetTest, id),
      rollback: (id: string) =>
        invoke<StudioChangeSet>(IPC_CHANNELS.changeSetRollback, id),
    }),
  }),
});

contextBridge.exposeInMainWorld('aiGameStudio', api);
