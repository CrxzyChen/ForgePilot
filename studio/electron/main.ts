import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  watch,
  writeFileSync,
  type FSWatcher,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  session,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';

import { ProjectManager } from '../project/project-manager.ts';
import {
  externalProjectChange,
  reviewRecordChange,
} from './project-watch-filter.ts';
import {
  ProjectError,
  type CreateProjectRequest,
  type ProjectSummary,
} from '../project/project-types.ts';
import {
  IPC_CHANNELS,
  type AppInfo,
  type IpcResult,
  type ProjectLoadProgress,
  type StudioCloseState,
  type StudioWindowState,
} from './contracts.ts';
import {
  CodexProcessManager,
  type CodexTurnMode,
} from './codex-process-manager.ts';
import { StudioCommandRegistry } from '../workspace/studio-command-registry.ts';
import { StudioChangeSetService } from '../workspace/studio-change-set-service.ts';
import {
  StudioAssetJobBroker,
  normalizeAssetCapability,
  type AssetJobKind,
} from '../workspace/studio-asset-job-broker.ts';
import { StudioGameBuildService } from '../workspace/studio-game-build-service.ts';
import {
  CompletionRunService,
  type CompletionRun,
} from '../workspace/completion-run-service.ts';
import type { StudioWorkspaceState } from '../workspace/workspace-types.ts';
import {
  StudioSettingsService,
  type StudioSettingsScope,
} from '../settings/studio-settings-service.ts';
import { CredentialVaultService } from '../settings/credential-vault-service.ts';
import { CREDENTIAL_PROVIDER_DEFINITIONS } from '../settings/credential-provider-definitions.ts';
import { ProviderModelCatalogService } from '../settings/provider-model-catalog-service.ts';
import { migrateLegacyProviderConnections } from '../settings/legacy-provider-connection-migration.ts';
import { effectiveGenerationApproval } from '../settings/generation-approval-policy.ts';
import { CoalescedUpdate } from './coalesced-update.ts';
import { verifyTestFeedback } from './test-feedback-verification.ts';
import { verifyPlanStatus } from './plan-status-verification.ts';
import { verifyChangeReview } from './change-review-verification.ts';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const applicationRoot = process.env.AIGAME_STUDIO_ROOT
  ? resolve(process.env.AIGAME_STUDIO_ROOT)
  : app.isPackaged
    ? join(process.resourcesPath, 'app')
    : resolve(moduleDirectory, '..', '..', '..');
const rendererEntry = join(
  applicationRoot,
  'dist',
  'electron',
  'renderer',
  'index.html',
);
const preloadEntry = join(
  applicationRoot,
  'dist',
  'electron',
  'preload',
  'preload.cjs',
);
const p20GateParent = process.env.AIGAME_STUDIO_P20_GATE_PARENT;
const p15QualityGateParent = process.env.AIGAME_STUDIO_P15_QUALITY_GATE_PARENT;
const p23GateProject = process.env.AIGAME_STUDIO_P23_GATE_PROJECT;
const p30GateProject = process.env.AIGAME_STUDIO_P30_GATE_PROJECT;
const candidateReviewGateProject =
  process.env.AIGAME_STUDIO_CANDIDATE_REVIEW_GATE_PROJECT;
const candidateReviewGatePathFilter =
  process.env.AIGAME_STUDIO_CANDIDATE_REVIEW_GATE_PATH_FILTER?.trim() ?? '';
const candidateReviewGateExpectedCount = Number(
  process.env.AIGAME_STUDIO_CANDIDATE_REVIEW_GATE_EXPECTED_COUNT ?? '0',
);
const candidateReviewGateAudio =
  process.env.AIGAME_STUDIO_CANDIDATE_REVIEW_GATE_MEDIA === 'audio';
const candidatePreviewGateCalls = new Map<string, number>();
const smokeMode =
  process.env.AIGAME_STUDIO_SMOKE === '1' ||
  Boolean(p20GateParent) ||
  Boolean(p15QualityGateParent) ||
  Boolean(p23GateProject) ||
  Boolean(p30GateProject) ||
  Boolean(candidateReviewGateProject);

if (process.env.AIGAME_STUDIO_USER_DATA) {
  app.setPath('userData', resolve(process.env.AIGAME_STUDIO_USER_DATA));
}
if (smokeMode) app.commandLine.appendSwitch('disable-gpu');
if (p15QualityGateParent)
  app.commandLine.appendSwitch('force-device-scale-factor', '1.5');

const kernelCliPath =
  process.platform === 'win32'
    ? join(applicationRoot, 'bin', 'kernelctl.exe')
    : join(applicationRoot, 'bin', 'kernelctl');
const gameRuntimePath =
  process.platform === 'win32'
    ? join(
        applicationRoot,
        app.isPackaged ? 'bin' : 'target/debug',
        'ai-game-player.exe',
      )
    : join(
        applicationRoot,
        app.isPackaged ? 'bin' : 'target/debug',
        'ai-game-player',
      );
const projectScriptHostPath =
  process.platform === 'win32'
    ? join(
        applicationRoot,
        app.isPackaged ? 'bin' : 'target/debug',
        'project-script-host.exe',
      )
    : join(
        applicationRoot,
        app.isPackaged ? 'bin' : 'target/debug',
        'project-script-host',
      );
const projectManager = new ProjectManager({
  templateRoot: join(applicationRoot, 'templates'),
  storageDirectory: join(app.getPath('userData'), 'projects'),
  engineVersion: app.getVersion(),
  doctor: {
    kernelCliPath,
    engineMcpPath:
      process.platform === 'win32'
        ? join(applicationRoot, 'bin', 'aigame-mcp.exe')
        : join(applicationRoot, 'bin', 'aigame-mcp'),
    engineMcpEnvironment: {
      ...process.env,
      AIGAME_STUDIO_NODE_RUNTIME: process.execPath,
      AIGAME_STUDIO_ENGINE_MCP_SERVER: join(
        applicationRoot,
        'dist',
        'electron',
        'engine-mcp',
        'server.js',
      ),
      AIGAME_STUDIO_KERNEL_CLI: kernelCliPath,
      AIGAME_STUDIO_GAME_RUNTIME: gameRuntimePath,
      AIGAME_STUDIO_SCRIPT_HOST: projectScriptHostPath,
    },
  },
});
const codexManager = new CodexProcessManager({
  applicationRoot,
  runtimeExecutable: process.execPath,
});
const settingsService = new StudioSettingsService({
  userDataDirectory: app.getPath('userData'),
  getProjectRoot: () => projectManager.activeRoot,
});
function applyAgentSettings(): void {
  const values = settingsService.get('agent').values;
  if (typeof values.reasoningEffort === 'string') {
    try {
      codexManager.setReasoningEffort(values.reasoningEffort);
    } catch {
      // The selected model remains authoritative when it lacks this effort.
    }
  }
  codexManager.setPermission(
    values.approvalPolicy === 'never' ? 'read-only' : 'on-request',
  );
}
function applyAiToolSettings(): void {
  const values = settingsService.get('ai-tools').values;
  codexManager.setIntegrationPreferences({
    mcpEnabled: values.mcpEnabled !== false,
    projectSkillsEnabled: values.projectSkillsEnabled !== false,
  });
}
const credentialVault = new CredentialVaultService(
  join(app.getPath('userData'), 'credentials', 'vault.json'),
  {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (value) => safeStorage.encryptString(value),
    decrypt: (value) => safeStorage.decryptString(value),
  },
);
const providerModelCatalog = new ProviderModelCatalogService({
  resolveCredential: (id) => credentialVault.resolveProfile(id),
});
const approvedParents = new Set<string>();
const approvedProjects = new Set<string>();
let mainWindow: BrowserWindow | null = null;
let workspace: StudioCommandRegistry | null = null;
let changeSets: StudioChangeSetService | null = null;
let assetJobs: StudioAssetJobBroker | null = null;
let gameBuild: StudioGameBuildService | null = null;
let completionRuns: CompletionRunService | null = null;
let assetBrokerBridge: HttpServer | null = null;
const assetBrokerBridgeToken = randomUUID();
let projectWatcher: FSWatcher | null = null;
let projectWatcherTimer: ReturnType<typeof setTimeout> | null = null;
let reviewWatcherUpdates: CoalescedUpdate | null = null;
let rendererRecoveryTask: Promise<void> | null = null;
let rendererRecovery: AppInfo['rendererRecovery'] = null;
let allowWindowClose = false;
let closeState: StudioCloseState = {
  dirtyDocuments: 0,
  runtimeActive: false,
  buildActive: false,
  agentActive: false,
};

function assetToolArguments(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function assetToolString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ProjectError(
      'ASSET_BROKER_ARGUMENT_INVALID',
      `${name} 必须是非空字符串。`,
    );
  }
  return value;
}

function assetToolKind(value: unknown): AssetJobKind {
  const kind = assetToolString(value, 'kind') as AssetJobKind;
  if (
    !['image', 'soundEffect', 'music', 'speechGeneration', 'audio'].includes(
      kind,
    )
  ) {
    throw new ProjectError(
      'ASSET_BROKER_KIND_INVALID',
      `不支持的媒体能力：${kind}`,
    );
  }
  return kind;
}

async function dispatchAssetBrokerTool(
  name: string,
  rawArguments: unknown,
): Promise<unknown> {
  const args = assetToolArguments(rawArguments);
  switch (name) {
    case 'asset.job_list':
      return { jobs: requireAssetJobs().list() };
    case 'asset.register_tool_output':
      return requireAssetJobs().registerToolOutput({
        kind: normalizeAssetCapability(assetToolKind(args.kind)),
        providerId: assetToolString(args.providerId, 'providerId'),
        modelId: assetToolString(args.modelId, 'modelId'),
        prompt: assetToolString(args.prompt, 'prompt'),
        outputName: assetToolString(args.outputName, 'outputName'),
        sourcePath: assetToolString(args.sourcePath, 'sourcePath'),
        expectedSha256: assetToolString(args.expectedSha256, 'expectedSha256'),
        toolCallId: assetToolString(args.toolCallId, 'toolCallId'),
        idempotencyKey: assetToolString(args.idempotencyKey, 'idempotencyKey'),
        parameters:
          args.parameters &&
          typeof args.parameters === 'object' &&
          !Array.isArray(args.parameters)
            ? (args.parameters as Record<string, string | number | boolean>)
            : undefined,
      });
    case 'asset.provider_health':
      return { providers: requireAssetJobs().providers() };
    case 'asset.estimate':
      return requireAssetJobs().estimate({
        kind:
          args.kind === undefined
            ? 'image'
            : normalizeAssetCapability(assetToolKind(args.kind)),
        providerId:
          typeof args.providerId === 'string' ? args.providerId : undefined,
        modelId: typeof args.modelId === 'string' ? args.modelId : undefined,
        variants: typeof args.variants === 'number' ? args.variants : undefined,
      });
    case 'asset.cancel':
      return requireAssetJobs().cancel(assetToolString(args.id, 'id'));
    case 'asset.generate': {
      const job = requireAssetJobs().submit({
        kind: assetToolKind(args.kind),
        providerId:
          typeof args.providerId === 'string' ? args.providerId : undefined,
        modelId: typeof args.modelId === 'string' ? args.modelId : undefined,
        parameters:
          args.parameters &&
          typeof args.parameters === 'object' &&
          !Array.isArray(args.parameters)
            ? (args.parameters as Record<string, string | number | boolean>)
            : undefined,
        prompt: assetToolString(args.prompt, 'prompt'),
        outputName: assetToolString(args.outputName, 'outputName'),
        variants: typeof args.variants === 'number' ? args.variants : undefined,
      });
      return requireAssetJobs().runWithPolicy(job.id);
    }
    case 'asset.retry':
      return requireAssetJobs().retryWithPolicy(assetToolString(args.id, 'id'));
    case 'asset.resume':
      return requireAssetJobs().resumeWithPolicy(
        assetToolString(args.id, 'id'),
      );
    case 'asset.recommend':
      return requireAssetJobs().recommendCandidate(
        assetToolString(args.id, 'id'),
        assetToolString(args.candidateId, 'candidateId'),
        Array.isArray(args.reasons)
          ? args.reasons.map((reason) => assetToolString(reason, 'reason'))
          : [],
        Array.isArray(args.evidenceIds)
          ? args.evidenceIds.map((evidence) =>
              assetToolString(evidence, 'evidenceId'),
            )
          : [],
      );
    case 'asset.regenerate': {
      const job = requireAssetJobs().regenerate(
        assetToolString(args.id, 'id'),
        assetToolString(args.candidateId, 'candidateId'),
        assetToolString(args.instruction, 'instruction'),
      );
      return requireAssetJobs().runWithPolicy(job.id);
    }
    case 'asset.master_audio':
      return requireAssetJobs().masterCandidate(
        assetToolString(args.id, 'id'),
        assetToolString(args.candidateId, 'candidateId'),
        assetToolString(args.expectedSha256, 'expectedSha256'),
        args.spec,
      );
    case 'asset.inspect_candidate':
      return requireAssetJobs().inspectCandidate(
        assetToolString(args.id, 'id'),
        assetToolString(args.candidateId, 'candidateId'),
      );
    default:
      throw new ProjectError(
        'ASSET_BROKER_TOOL_NOT_FOUND',
        `安全资源 Broker 不支持工具：${name}`,
      );
  }
}

function sendAssetBrokerResponse(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  response.end(body);
}

async function handleAssetBrokerRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    if (
      request.method !== 'POST' ||
      request.url !== '/v1/asset-tools' ||
      request.headers.authorization !== `Bearer ${assetBrokerBridgeToken}`
    ) {
      sendAssetBrokerResponse(response, 404, { ok: false });
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.byteLength;
      if (size > 256 * 1024) {
        throw new ProjectError(
          'ASSET_BROKER_REQUEST_TOO_LARGE',
          '资源 Broker 请求超过 256 KiB 限制。',
        );
      }
      chunks.push(bytes);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
      projectRoot?: unknown;
      name?: unknown;
      arguments?: unknown;
    };
    if (
      typeof input.projectRoot !== 'string' ||
      resolve(input.projectRoot) !== resolve(projectManager.activeRoot ?? '')
    ) {
      throw new ProjectError(
        'ASSET_BROKER_PROJECT_REJECTED',
        '资源 Broker 请求不属于当前打开项目。',
      );
    }
    const value = await dispatchAssetBrokerTool(
      assetToolString(input.name, 'name'),
      input.arguments,
    );
    sendAssetBrokerResponse(response, 200, { ok: true, value });
  } catch (error) {
    sendAssetBrokerResponse(response, 400, {
      ok: false,
      error: {
        code:
          error instanceof ProjectError
            ? error.code
            : 'ASSET_BROKER_REQUEST_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

async function startAssetBrokerBridge(): Promise<void> {
  if (assetBrokerBridge) return;
  const server = createServer((request, response) => {
    void handleAssetBrokerRequest(request, response);
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolveListen();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('无法建立 Studio 资源 Broker 回环端口。');
  }
  assetBrokerBridge = server;
  codexManager.setAssetBrokerConnection({
    url: `http://127.0.0.1:${address.port}/v1/asset-tools`,
    token: assetBrokerBridgeToken,
  });
}

function stopAssetBrokerBridge(): void {
  codexManager.setAssetBrokerConnection(null);
  const server = assetBrokerBridge;
  assetBrokerBridge = null;
  if (!server) return;
  server.closeAllConnections();
  server.close();
  server.unref();
}

function quitWithCode(code: number): void {
  reviewWatcherUpdates?.dispose();
  workspace?.dispose();
  workspace = null;
  assetJobs = null;
  stopAssetBrokerBridge();
  for (const window of BrowserWindow.getAllWindows()) window.destroy();
  app.exit(code);
}

type PersistedWindowState = {
  bounds: Electron.Rectangle;
  maximized: boolean;
};

const windowStatePath = join(app.getPath('userData'), 'window-state.json');

function readWindowState(): PersistedWindowState | null {
  try {
    if (!existsSync(windowStatePath)) return null;
    const value = JSON.parse(
      readFileSync(windowStatePath, 'utf8'),
    ) as PersistedWindowState;
    if (
      !value.bounds ||
      !Number.isFinite(value.bounds.width) ||
      !Number.isFinite(value.bounds.height)
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function writeWindowState(window: BrowserWindow): void {
  mkdirSync(dirname(windowStatePath), { recursive: true });
  const value: PersistedWindowState = {
    bounds: window.isMaximized()
      ? window.getNormalBounds()
      : window.getBounds(),
    maximized: window.isMaximized(),
  };
  writeFileSync(windowStatePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function studioWindowState(window = mainWindow): StudioWindowState {
  return {
    maximized: window?.isMaximized() ?? false,
    fullScreen: window?.isFullScreen() ?? false,
  };
}

function publishWindowState(window: BrowserWindow): void {
  if (!window.isDestroyed()) {
    window.webContents.send(
      IPC_CHANNELS.windowState,
      studioWindowState(window),
    );
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function waitForRendererSelector(
  window: BrowserWindow,
  selector: string,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (
      await window.webContents
        .executeJavaScript(
          `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
        )
        .catch(() => false)
    ) {
      return;
    }
    await delay(50);
  }
  throw new Error(`renderer selector did not appear: ${selector}`);
}

async function runP15QualityGate(window: BrowserWindow) {
  window.webContents.setBackgroundThrottling(false);
  window.setBounds({ x: 80, y: 80, width: 960, height: 640 });
  window.show();
  window.focus();
  await waitForRendererSelector(window, '.ide-workspace');
  await delay(200);

  await waitForRendererSelector(
    window,
    '.tree-row[title^="scripts/game-sdk.d.ts"]',
    30_000,
  );
  await window.webContents.executeJavaScript(`(() => {
    const typeScriptFile = [...document.querySelectorAll('.tree-row')]
      .find((candidate) => candidate.getAttribute('title')?.startsWith('scripts/game-sdk.d.ts'));
    typeScriptFile?.click();
  })()`);
  await waitForRendererSelector(window, '.monaco-source-editor .monaco-editor');
  await waitForRendererSelector(
    window,
    '.monaco-source-editor[data-source-ready="true"]',
    30_000,
  );
  await waitForRendererSelector(
    window,
    '.monaco-source-editor .view-line span',
    30_000,
  );
  await delay(200);

  await window.webContents.executeJavaScript(`(() => {
    document.querySelector('.activity-bar button[aria-label="源代码管理"]')?.click();
  })()`);
  await waitForRendererSelector(window, '.source-control-tool');
  await delay(200);

  const before = (await window.webContents.executeJavaScript(`(() => {
    const left = document.querySelector('.left-dock');
    const interactive = [...document.querySelectorAll('button,input,textarea,select,.dock-resizer')];
    const accessibleName = (element) => {
      const labels = 'labels' in element && element.labels
        ? [...element.labels].map((label) => label.textContent ?? '').join(' ')
        : '';
      return [element.getAttribute('aria-label'), element.getAttribute('title'), labels, element.textContent]
        .filter(Boolean).join(' ').replace(/\\s+/g, ' ').trim();
    };
    const sourceControlSurface = document.querySelector('.source-control-tool');
    const sourceControlRect = sourceControlSurface?.getBoundingClientRect();
    const scmActionContainer = sourceControlSurface?.querySelector('.scm-actions');
    const scmActionButton = scmActionContainer?.querySelector('button:not(:disabled)');
    const scmCommitInput = sourceControlSurface?.querySelector('.commit-composer input');
    const scmCommitButton = sourceControlSurface?.querySelector('.commit-composer button');
    const scmSectionHeader = sourceControlSurface?.querySelector('.scm-section-header');
    const sourceControlProbeHost = document.createElement('div');
    sourceControlProbeHost.className = 'side-tool source-control-tool';
    sourceControlProbeHost.style.cssText = 'position:fixed;left:-1000px;top:0;width:244px;visibility:hidden';
    const sourceControlProbe = document.createElement('button');
    sourceControlProbe.textContent = 'probe';
    sourceControlProbeHost.append(sourceControlProbe);
    const projectFileProbe = document.createElement('button');
    projectFileProbe.className = 'tree-row';
    projectFileProbe.textContent = 'project-file-probe';
    projectFileProbe.style.cssText = 'position:fixed;left:-1000px;top:0;visibility:hidden';
    document.body.append(projectFileProbe);
    const scmFileProbe = document.createElement('div');
    scmFileProbe.className = 'scm-file';
    scmFileProbe.dataset.status = 'modified';
    scmFileProbe.innerHTML = '<button class="scm-file-main"><svg></svg><span class="scm-file-name">scripts/player.ts</span><span class="scm-file-status">M</span></button><button class="scm-stage-button">+</button>';
    sourceControlProbeHost.append(scmFileProbe);
    const changeSetProbe = document.createElement('article');
    changeSetProbe.className = 'changeset-card';
    changeSetProbe.innerHTML = '<button class="changeset-file-link"><svg></svg><span>scripts/player.ts</span></button>';
    sourceControlProbeHost.append(changeSetProbe);
    document.body.append(sourceControlProbeHost);
    const sourceControlBackground = getComputedStyle(sourceControlProbe).backgroundColor;
    const changeSetFileStyle = getComputedStyle(changeSetProbe.querySelector('button'));
    const scmFileProbeStyle = getComputedStyle(scmFileProbe);
    const scmFileMainStyle = getComputedStyle(scmFileProbe.querySelector('.scm-file-main'));
    const scmFileNameStyle = getComputedStyle(scmFileProbe.querySelector('.scm-file-name'));
    const projectFileStyle = getComputedStyle(projectFileProbe);
    const changeSetFileLayout = {
      display: changeSetFileStyle.display,
      fontFamily: changeSetFileStyle.fontFamily,
      fontSize: Number.parseFloat(changeSetFileStyle.fontSize),
      projectFontSize: Number.parseFloat(projectFileStyle.fontSize),
      textAlign: changeSetFileStyle.textAlign
    };
    const controlStyles = [scmActionButton, scmCommitInput, scmCommitButton, scmSectionHeader]
      .filter(Boolean)
      .map((element) => getComputedStyle(element));
    const sourceControlPresentation = {
      visible: Boolean(sourceControlRect && sourceControlRect.width > 0 && sourceControlRect.height > 0),
      panelBackground: sourceControlSurface ? getComputedStyle(sourceControlSurface).backgroundColor : '',
      toolbarDisplay: scmActionContainer ? getComputedStyle(scmActionContainer).display : '',
      toolbarColumns: scmActionContainer
        ? getComputedStyle(scmActionContainer).gridTemplateColumns.split(' ').filter(Boolean).length
        : 0,
      actionBackground: scmActionButton ? getComputedStyle(scmActionButton).backgroundColor : '',
      actionBorderStyle: scmActionButton ? getComputedStyle(scmActionButton).borderStyle : '',
      actionFontSize: scmActionButton ? Number.parseFloat(getComputedStyle(scmActionButton).fontSize) : 0,
      inputBackground: scmCommitInput ? getComputedStyle(scmCommitInput).backgroundColor : '',
      inputBorderStyle: scmCommitInput ? getComputedStyle(scmCommitInput).borderStyle : '',
      commitBackground: scmCommitButton ? getComputedStyle(scmCommitButton).backgroundColor : '',
      sectionHeaderBackground: scmSectionHeader ? getComputedStyle(scmSectionHeader).backgroundColor : '',
      fileRowDisplay: scmFileProbeStyle.display,
      fileRowColumns: scmFileProbeStyle.gridTemplateColumns.split(' ').filter(Boolean).length,
      fileButtonBackground: scmFileMainStyle.backgroundColor,
      fileNameFontFamily: scmFileNameStyle.fontFamily,
      fileNameFontSize: Number.parseFloat(scmFileNameStyle.fontSize),
      hasNativeLightSurface: controlStyles.some((style) => {
        const values = style.backgroundColor.match(/[\\d.]+/g)?.map(Number) ?? [];
        const opaque = values.length < 4 || (values[3] ?? 1) > 0.5;
        return opaque && values.slice(0, 3).every((channel) => channel > 180);
      })
    };
    const gitDecorationProbe = document.createElement('div');
    gitDecorationProbe.style.cssText = 'position:fixed;left:-1000px;top:0;visibility:hidden';
    gitDecorationProbe.innerHTML = ['modified','added','deleted','renamed','conflicted','mixed']
      .map((status) => '<button class="tree-row" data-git-status="' + status + '"><span class="tree-label">file</span></button>')
      .join('');
    document.body.append(gitDecorationProbe);
    const gitDecorationColors = Object.fromEntries(
      [...gitDecorationProbe.querySelectorAll('.tree-row')].map((row) => [
        row.getAttribute('data-git-status'),
        getComputedStyle(row.querySelector('.tree-label')).color
      ])
    );
    gitDecorationProbe.remove();
    projectFileProbe.remove();
    sourceControlProbeHost.remove();
    const copilotProbe = document.createElement('div');
    copilotProbe.className = 'right-content copilot-content';
    copilotProbe.style.cssText = 'position:fixed;left:-1000px;top:0;width:310px;height:520px;visibility:hidden';
    copilotProbe.innerHTML = '<header></header><div class="copilot-threadbar"></div><section class="copilot-progress" style="height:280px"></section><div class="copilot-transcript"></div><div class="copilot-settings" style="height:340px"></div><div class="copilot-approvals" style="height:160px"></div><div class="attachment-chips"></div><div class="copilot-composer"><textarea></textarea></div>';
    document.body.append(copilotProbe);
    const copilotStyle = getComputedStyle(copilotProbe);
    const copilotRect = copilotProbe.getBoundingClientRect();
    const composerRect = copilotProbe.querySelector('.copilot-composer').getBoundingClientRect();
    const transcriptRect = copilotProbe.querySelector('.copilot-transcript').getBoundingClientRect();
    const approvalRect = copilotProbe.querySelector('.copilot-approvals').getBoundingClientRect();
    if (approvalRect.height < 72 || approvalRect.bottom > composerRect.top + 0.5) {
      throw new Error('Copilot approval actions must retain visible space above the composer.');
    }
    const copilotLayout = {
      display: copilotStyle.display,
      direction: copilotStyle.flexDirection,
      overflow: copilotStyle.overflow,
      composerAnchored: composerRect.bottom <= copilotRect.bottom + 0.5 && composerRect.top >= copilotRect.top,
      transcriptHeight: transcriptRect.height
    };
    // A short/empty chat cannot reveal flex-basis starvation of Goal controls.
    copilotProbe.querySelector('.copilot-settings').remove();
    copilotProbe.querySelector('.copilot-approvals').remove();
    const longProgress = copilotProbe.querySelector('.copilot-progress');
    longProgress.innerHTML = '<article class="copilot-running-goal"><header><span>GOAL</span><strong>执行中</strong></header><p>' + '完成真实游戏并保留所有审计。'.repeat(60) + '</p><div><button>停止 Goal</button></div></article>';
    const longTranscript = copilotProbe.querySelector('.copilot-transcript');
    longTranscript.innerHTML = '<button class="copilot-history-more">加载较早的对话</button><article><pre>' + 'Long-session completed message and tool result. '.repeat(2_000) + '</pre></article>';
    const historyMore = longTranscript.querySelector('.copilot-history-more');
    const historyStyle = getComputedStyle(historyMore);
    if (historyStyle.backgroundColor !== 'rgb(17, 23, 33)' || parseFloat(historyStyle.fontSize) !== 9 || historyStyle.appearance !== 'none' || historyMore.getBoundingClientRect().height < 28) {
      throw new Error('History pagination must use compact Midnight Workshop controls, not native form styling.');
    }
    historyMore.disabled = true;
    if (parseFloat(getComputedStyle(historyMore).opacity) > 0.6) throw new Error('History loading must expose a disabled state.');
    historyMore.disabled = false;
    const longProgressRect = longProgress.getBoundingClientRect();
    const longTranscriptRect = longTranscript.getBoundingClientRect();
    if (longProgressRect.height < 120 || longTranscriptRect.height < 96) {
      throw new Error('Long Copilot history must not squeeze Goal/Plan controls into a clipped strip.');
    }
    longProgress.scrollTop = longProgress.scrollHeight;
    const goalStopRect = longProgress.querySelector('button').getBoundingClientRect();
    if (goalStopRect.top < longProgressRect.top || goalStopRect.bottom > longProgressRect.bottom + 0.5) {
      throw new Error('Goal stop must remain reachable by scrolling its own progress region.');
    }
    copilotProbe.remove();
    const scrollbarStyle = getComputedStyle(document.documentElement, '::-webkit-scrollbar-thumb');
    const titlebarRect = document.querySelector('.workbench-titlebar').getBoundingClientRect();
    const menuRect = document.querySelector('.main-menu').getBoundingClientRect();
    const runRect = document.querySelector('.titlebar-run').getBoundingClientRect();
    const titlebarLeft = document.querySelector('.titlebar-left');
    const titlebarLayout = {
      menuLeftOffset: menuRect.left - titlebarRect.left,
      runCenterOffset: Math.abs(
        runRect.left + runRect.width / 2 -
        (titlebarRect.left + titlebarRect.width / 2)
      ),
      leftGroupOverflow: titlebarLeft.scrollWidth > titlebarLeft.clientWidth
    };
    const editorWrapper = document.querySelector('.editor-with-conflict');
    const sourceEditor = editorWrapper?.querySelector('.source-editor');
    const monacoHost = sourceEditor?.querySelector('.monaco-host');
    const inspectorActions = document.querySelector('.file-inspector-actions');
    const inspectorMetadata = document.querySelector('.file-inspector dl');
    const inspectorMetadataLabel = inspectorMetadata?.querySelector('dt');
    const inspectorMetadataValue = inspectorMetadata?.querySelector('dd');
    const inspectorActionButton = [...(inspectorActions?.querySelectorAll('button') ?? [])]
      .find((button) => !button.disabled);
    const disabledInspectorAction = inspectorActions?.querySelector('button:disabled');
    const editorWrapperRect = editorWrapper?.getBoundingClientRect();
    const sourceEditorRect = sourceEditor?.getBoundingClientRect();
    const inspectorActionStyle = inspectorActionButton
      ? getComputedStyle(inspectorActionButton)
      : null;
    const typeScriptTokenColors = [...new Set(
      [...(sourceEditor?.querySelectorAll('.view-line span') ?? [])]
        .filter((token) => token.textContent?.trim())
        .map((token) => getComputedStyle(token).color)
    )];
    const editorInspectorPresentation = {
      sourceFillsDocument: Boolean(
        editorWrapperRect && sourceEditorRect &&
        sourceEditorRect.height >= editorWrapperRect.height - 1
      ),
      monacoContentHeight: monacoHost?.getBoundingClientRect().height ?? 0,
      codeViewportHeight:
        sourceEditor?.querySelector('.view-lines')?.getBoundingClientRect().height ?? 0,
      actionGroupDisplay: inspectorActions
        ? getComputedStyle(inspectorActions).display
        : '',
      actionButtonBackground: inspectorActionStyle?.backgroundColor ?? '',
      actionButtonBorderStyle: inspectorActionStyle?.borderStyle ?? '',
      disabledButtonCursor: disabledInspectorAction
        ? getComputedStyle(disabledInspectorAction).cursor
        : '',
      metadataFontSize: inspectorMetadata
        ? Number.parseFloat(getComputedStyle(inspectorMetadata).fontSize)
        : 0,
      metadataLabelFontSize: inspectorMetadataLabel
        ? Number.parseFloat(getComputedStyle(inspectorMetadataLabel).fontSize)
        : 0,
      metadataValueFontSize: inspectorMetadataValue
        ? Number.parseFloat(getComputedStyle(inspectorMetadataValue).fontSize)
        : 0,
      typeScriptTokenColors
    };
    const controlSurfaceProbe = document.createElement('div');
    controlSurfaceProbe.style.cssText = 'position:fixed;left:-2000px;top:0;width:300px;visibility:hidden';
    controlSurfaceProbe.innerHTML = [
      '<div class="side-tool asset-workflow">',
      '<section class="asset-generation-form"><header><div><strong>AI 资源生成</strong><small>候选草稿</small></div></header><label class="asset-generation-model-field" data-model-source="provider-api"><span class="asset-generation-model-heading"><span>模型</span><button class="model-mode-button">手动模型 ID</button></span><select class="asset-generation-model"><option>model</option></select><small class="asset-generation-model-source">来源：供应商接口 · 当前能力 5 / 全部 27</small></label><button>创建生成任务</button></section>',
      '<article class="asset-job-card"><header><strong>asset.png</strong><span>queued</span></header><div class="asset-job-actions"><button>运行生成</button></div></article>',
      '<h3>已导入资源</h3>',
      '</div>',
      '<div class="side-tool"><div class="test-case"><button>tests/main.test.ts</button><button>运行</button><small>未运行</small></div></div>',
      '<div class="test-results-panel"><button><span>tests/main.test.ts</span><strong>未运行</strong><small>点击打开测试源</small></button></div>',
      '<div class="debug-panel"><section><button>update · scripts/main.ts:1</button></section></div>',
      '<div class="side-tool"><article class="capability-card"><button>启用</button></article></div>',
      '<div class="external-conflict-banner"><button>载入磁盘版本</button></div>',
      '<div class="settings-editor"><div class="credential-manager"><div class="credential-row"><button>删除</button></div><form class="credential-form"><div class="credential-provider-fields"><label>API Key<input type="password"></label><label>Base URL<input value="https://api.openai.com/v1"></label></div><button>保存凭据</button></form></div><section class="settings-section generation-tools-section"><div class="generation-tool-list"><div class="generation-tool-row"><div><strong>图片生成</strong><small>角色与贴图</small></div><div class="generation-tool-control"><label>供应商<select class="generation-tool-provider"><option>OpenAI</option></select></label><label>调用凭证<select class="generation-tool-credential"><option>OpenAI Key</option></select></label><div class="generation-tool-model-field" data-model-source="provider-api"><span class="generation-tool-model-heading"><span>模型</span><button class="model-mode-button">手动模型 ID</button></span><select class="generation-tool-model"><option>gpt-image-2</option></select><small class="generation-tool-model-source">来源：供应商接口 · 当前能力 3 / 全部 40</small></div><div class="generation-tool-actions"><button>刷新模型</button></div><small class="generation-tool-status ready">已就绪</small></div></div></div></section></div>',
      '<div class="copilot-approvals"><article><div><button>批准</button><button disabled data-unsupported-approval>批准表单</button></div></article></div>'
    ].join('');
    document.body.append(controlSurfaceProbe);
    const unsupportedApproval = controlSurfaceProbe.querySelector('[data-unsupported-approval]');
    let unsupportedApprovalClicked = false;
    unsupportedApproval.addEventListener('click', () => { unsupportedApprovalClicked = true; });
    unsupportedApproval.click();
    if (unsupportedApprovalClicked || !unsupportedApproval.disabled || getComputedStyle(unsupportedApproval).cursor !== 'not-allowed') {
      throw new Error('Unsupported MCP form approval must be visibly disabled and non-interactive.');
    }
    const controlSelectors = {
      generationTitle: '.asset-generation-form header strong',
      generationLabel: '.asset-generation-form label',
      generationSelect: '.asset-generation-form select',
      generationButton: '.asset-generation-form > button',
      generationJobButton: '.asset-job-actions button',
      generationSectionTitle: '.asset-workflow > h3',
      testFileButton: '.test-case button:first-of-type',
      testRunButton: '.test-case button:nth-of-type(2)',
      testResultButton: '.test-results-panel > button',
      debugButton: '.debug-panel button',
      capabilityButton: '.capability-card button',
      conflictButton: '.external-conflict-banner button',
      credentialRowButton: '.credential-row button',
      credentialFormButton: '.credential-form button',
      settingsCredentialSecret: '.credential-provider-fields input[type="password"]',
      settingsCredentialEndpoint: '.credential-provider-fields input:not([type="password"])',
      settingsGenerationProvider: '.generation-tool-provider',
      settingsGenerationCredential: '.generation-tool-credential',
      settingsGenerationModel: '.generation-tool-model',
      settingsGenerationRefresh: '.generation-tool-actions button',
      approvalButton: '.copilot-approvals button'
    };
    const controlSamples = Object.fromEntries(
      Object.entries(controlSelectors).map(([key, selector]) => {
        const element = controlSurfaceProbe.querySelector(selector);
        const style = element ? getComputedStyle(element) : null;
        return [key, {
          fontSize: style ? Number.parseFloat(style.fontSize) : 0,
          background: style?.backgroundColor ?? '',
          borderStyle: style?.borderStyle ?? '',
          appearance: style?.appearance ?? ''
        }];
      })
    );
    const controlButtonKeys = [
      'generationButton', 'generationJobButton', 'testFileButton',
      'testRunButton', 'testResultButton', 'debugButton',
      'capabilityButton', 'conflictButton', 'credentialRowButton',
      'credentialFormButton', 'settingsCredentialSecret',
      'settingsCredentialEndpoint', 'settingsGenerationProvider',
      'settingsGenerationCredential', 'settingsGenerationModel',
      'settingsGenerationRefresh',
      'approvalButton'
    ];
    const nativeLightSurface = controlButtonKeys.some((key) => {
      const values = controlSamples[key].background.match(/[\\d.]+/g)?.map(Number) ?? [];
      const opaque = values.length < 4 || (values[3] ?? 1) > 0.5;
      return opaque && values.slice(0, 3).every((channel) => channel > 180);
    });
    const controlSurfacePresentation = {
      samples: controlSamples,
      allCompact: Object.values(controlSamples).every(
        (sample) => sample.fontSize >= 9 && sample.fontSize <= 10
      ),
      allButtonsStyled: controlButtonKeys.every((key) => {
        const sample = controlSamples[key];
        return sample.appearance === 'none' &&
          sample.borderStyle === 'solid' &&
          sample.background !== 'rgba(0, 0, 0, 0)';
      }),
      hasNativeLightSurface: nativeLightSurface
    };
    const assetModelSource = controlSurfaceProbe.querySelector(
      '.asset-generation-model-field[data-model-source="provider-api"]'
    );
    const settingsModelSource = controlSurfaceProbe.querySelector(
      '.generation-tool-model-field[data-model-source="provider-api"]'
    );
    const assetSourceLabel = assetModelSource?.querySelector(
      '.asset-generation-model-source'
    );
    const settingsSourceLabel = settingsModelSource?.querySelector(
      '.generation-tool-model-source'
    );
    const modelModeButton = settingsModelSource?.querySelector(
      '.model-mode-button'
    );
    const modelSourcePresentation = {
      assetSource: assetModelSource?.getAttribute('data-model-source') ?? '',
      settingsSource:
        settingsModelSource?.getAttribute('data-model-source') ?? '',
      assetSourceText: assetSourceLabel?.textContent ?? '',
      settingsSourceText: settingsSourceLabel?.textContent ?? '',
      assetSourceColor: assetSourceLabel
        ? getComputedStyle(assetSourceLabel).color
        : '',
      settingsSourceColor: settingsSourceLabel
        ? getComputedStyle(settingsSourceLabel).color
        : '',
      modeButtonAppearance: modelModeButton
        ? getComputedStyle(modelModeButton).appearance
        : '',
      modeButtonBorderStyle: modelModeButton
        ? getComputedStyle(modelModeButton).borderStyle
        : ''
    };
    controlSurfaceProbe.remove();
    const documentArea = document.querySelector('.document-area');
    const rightDock = document.querySelector('.right-dock');
    const rightResizer = document.querySelector('[data-quality-id="right-resizer"]');
    const documentAreaRect = documentArea?.getBoundingClientRect();
    const rightDockRect = rightDock?.getBoundingClientRect();
    const rightResizerRect = rightResizer?.getBoundingClientRect();
    const rightInternalDividers = [
      document.querySelector('.right-switcher'),
      document.querySelector('.right-content > header'),
      document.querySelector('.copilot-threadbar')
    ].filter(Boolean);
    const rightPanelDividerPresentation = {
      documentBoundary: documentAreaRect?.right ?? 0,
      dockBoundary: rightDockRect?.left ?? 0,
      visibleDividerAxis: rightResizerRect
        ? rightResizerRect.left + rightResizerRect.width / 2
        : 0,
      hitTargetWidth: rightResizerRect?.width ?? 0,
      dockOverflowX: rightDock ? getComputedStyle(rightDock).overflowX : '',
      internalDividerLeftEdges: rightInternalDividers.map(
        (element) => element.getBoundingClientRect().left
      )
    };
    return {
      devicePixelRatio: window.devicePixelRatio,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      rootOverflow: {
        horizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        vertical: document.documentElement.scrollHeight > document.documentElement.clientHeight
      },
      visibleRegions: ['.activity-bar','.left-dock','.document-area','.right-dock','.bottom-dock']
        .every((selector) => {
          const node = document.querySelector(selector);
          const rect = node?.getBoundingClientRect();
          return Boolean(rect && rect.width > 0 && rect.height > 0);
        }),
      landmarkCount: document.querySelectorAll('main,nav,aside,section[aria-label]').length,
      unnamedControls: interactive.filter((element) => !accessibleName(element)).length,
      separators: [...document.querySelectorAll('input.dock-resizer')].map((element) => ({
        label: element.getAttribute('aria-label'),
        tabIndex: element.tabIndex,
        orientation: element.getAttribute('aria-orientation')
      })),
      leftWidth: left?.getBoundingClientRect().width ?? 0,
      projectName: document.querySelector('.titlebar-brand strong')?.textContent ?? null,
      visualTheme: {
        sourceControlBackground,
        sourceControlPresentation,
        changeSetFileLayout,
        gitDecorationColors,
        scrollbarBackground: scrollbarStyle.backgroundImage,
        copilotLayout,
        titlebarLayout,
        editorInspectorPresentation,
        controlSurfacePresentation,
        modelSourcePresentation,
        rightPanelDividerPresentation,
        titleFontSize: Number.parseFloat(getComputedStyle(document.querySelector('.titlebar-brand strong')).fontSize)
      }
    };
  })()`)) as {
    devicePixelRatio: number;
    viewport: { width: number; height: number };
    rootOverflow: { horizontal: boolean; vertical: boolean };
    visibleRegions: boolean;
    landmarkCount: number;
    unnamedControls: number;
    separators: Array<{
      label: string | null;
      tabIndex: number;
      orientation: string | null;
    }>;
    leftWidth: number;
    projectName: string | null;
    visualTheme: {
      sourceControlBackground: string;
      sourceControlPresentation: {
        visible: boolean;
        panelBackground: string;
        toolbarDisplay: string;
        toolbarColumns: number;
        actionBackground: string;
        actionBorderStyle: string;
        actionFontSize: number;
        inputBackground: string;
        inputBorderStyle: string;
        commitBackground: string;
        sectionHeaderBackground: string;
        fileRowDisplay: string;
        fileRowColumns: number;
        fileButtonBackground: string;
        fileNameFontFamily: string;
        fileNameFontSize: number;
        hasNativeLightSurface: boolean;
      };
      changeSetFileLayout: {
        display: string;
        fontFamily: string;
        fontSize: number;
        projectFontSize: number;
        textAlign: string;
      };
      gitDecorationColors: Record<string, string>;
      scrollbarBackground: string;
      copilotLayout: {
        display: string;
        direction: string;
        overflow: string;
        composerAnchored: boolean;
        transcriptHeight: number;
      };
      titlebarLayout: {
        menuLeftOffset: number;
        runCenterOffset: number;
        leftGroupOverflow: boolean;
      };
      editorInspectorPresentation: {
        sourceFillsDocument: boolean;
        monacoContentHeight: number;
        codeViewportHeight: number;
        actionGroupDisplay: string;
        actionButtonBackground: string;
        actionButtonBorderStyle: string;
        disabledButtonCursor: string;
        metadataFontSize: number;
        metadataLabelFontSize: number;
        metadataValueFontSize: number;
        typeScriptTokenColors: string[];
      };
      controlSurfacePresentation: {
        samples: Record<
          string,
          {
            fontSize: number;
            background: string;
            borderStyle: string;
            appearance: string;
          }
        >;
        allCompact: boolean;
        allButtonsStyled: boolean;
        hasNativeLightSurface: boolean;
      };
      modelSourcePresentation: {
        assetSource: string;
        settingsSource: string;
        assetSourceText: string;
        settingsSourceText: string;
        assetSourceColor: string;
        settingsSourceColor: string;
        modeButtonAppearance: string;
        modeButtonBorderStyle: string;
      };
      rightPanelDividerPresentation: {
        documentBoundary: number;
        dockBoundary: number;
        visibleDividerAxis: number;
        hitTargetWidth: number;
        dockOverflowX: string;
        internalDividerLeftEdges: number[];
      };
      titleFontSize: number;
    };
  };

  await window.webContents.executeJavaScript(`(() => {
    const button = [...document.querySelectorAll('.main-menu button')]
      .find((candidate) => candidate.textContent?.trim() === '文件');
    button?.click();
  })()`);
  await delay(75);
  const menuPresentation = (await window.webContents.executeJavaScript(`(() => {
    const anchor = [...document.querySelectorAll('.main-menu button')]
      .find((candidate) => candidate.textContent?.trim() === '文件');
    const popup = document.querySelector('.main-menu-popup');
    const firstItem = popup?.querySelector('button');
    const anchorRect = anchor?.getBoundingClientRect();
    const popupRect = popup?.getBoundingClientRect();
    const popupStyle = popup ? getComputedStyle(popup) : null;
    const itemStyle = firstItem ? getComputedStyle(firstItem) : null;
    return {
      visible: Boolean(popupRect && popupRect.width > 0 && popupRect.height > 0),
      leftOffset: anchorRect && popupRect ? Math.abs(anchorRect.left - popupRect.left) : 999,
      topGap: anchorRect && popupRect ? popupRect.top - anchorRect.bottom : 999,
      fontSize: itemStyle ? Number.parseFloat(itemStyle.fontSize) : 99,
      itemHeight: firstItem?.getBoundingClientRect().height ?? 0,
      background: popupStyle?.backgroundColor ?? ''
    };
  })()`)) as {
    visible: boolean;
    leftOffset: number;
    topGap: number;
    fontSize: number;
    itemHeight: number;
    background: string;
  };
  await window.webContents.executeJavaScript(`(() => {
    const button = [...document.querySelectorAll('.main-menu button')]
      .find((candidate) => candidate.textContent?.trim() === '文件');
    button?.click();
  })()`);

  await window.webContents.executeJavaScript(`(() => {
    const help = [...document.querySelectorAll('.main-menu > button')]
      .find((candidate) => candidate.textContent?.trim() === '帮助');
    help?.click();
  })()`);
  await delay(75);
  const tabCloseControls = (await window.webContents
    .executeJavaScript(`(() => ({
    tabs: document.querySelectorAll('.document-tab').length,
    closeControls: document.querySelectorAll('.document-tab-close').length,
    overviewHasClose: Boolean(
      [...document.querySelectorAll('.document-tab')]
        .find((tab) => tab.textContent?.includes('项目概览'))
        ?.querySelector('.document-tab-close')
    )
  }))()`)) as {
    tabs: number;
    closeControls: number;
    overviewHasClose: boolean;
  };

  const openTabMenu = async (index: number) => {
    await window.webContents.executeJavaScript(`(() => {
      const tab = document.querySelectorAll('.document-tab')[${index}];
      const rect = tab?.getBoundingClientRect();
      tab?.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: rect ? rect.left + 20 : 120,
        clientY: rect ? rect.bottom - 4 : 70
      }));
    })()`);
    await delay(50);
  };
  const clickTabMenuItem = async (label: string) => {
    await window.webContents.executeJavaScript(`(() => {
      const button = [...document.querySelectorAll('.document-tab-context-menu button')]
        .find((candidate) => candidate.querySelector('span')?.textContent === ${JSON.stringify(label)});
      button?.click();
    })()`);
    await delay(75);
  };

  await openTabMenu(1);
  const tabMenuLabels = (await window.webContents.executeJavaScript(`
    [...document.querySelectorAll('.document-tab-context-menu button span')]
      .map((element) => element.textContent)
  `)) as string[];
  await clickTabMenuItem('关闭右侧');
  const afterCloseRight = (await window.webContents.executeJavaScript(
    `document.querySelectorAll('.document-tab').length`,
  )) as number;
  await openTabMenu(0);
  await clickTabMenuItem('关闭其他');
  const afterCloseOthers = (await window.webContents.executeJavaScript(
    `document.querySelectorAll('.document-tab').length`,
  )) as number;
  await window.webContents.executeJavaScript(`(() => {
    const help = [...document.querySelectorAll('.main-menu > button')]
      .find((candidate) => candidate.textContent?.trim() === '帮助');
    help?.click();
  })()`);
  await delay(75);
  await openTabMenu(1);
  await clickTabMenuItem('关闭当前');
  const afterCloseCurrent = (await window.webContents
    .executeJavaScript(`(() => ({
    count: document.querySelectorAll('.document-tab').length,
    overviewOpen: [...document.querySelectorAll('.document-tab')]
      .some((tab) => tab.textContent?.includes('项目概览'))
  }))()`)) as { count: number; overviewOpen: boolean };
  const tabActions = {
    labels: tabMenuLabels,
    afterCloseRight,
    afterCloseOthers,
    afterCloseCurrent,
  };

  const dragStart = (await window.webContents.executeJavaScript(`(() => {
    const target = document.querySelector('[data-quality-id="left-resizer"]');
    const rect = target.getBoundingClientRect();
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + Math.min(rect.height / 2, 180)),
      leftWidth: document.querySelector('.left-dock')?.getBoundingClientRect().width ?? 0
    };
  })()`)) as { x: number; y: number; leftWidth: number };
  window.webContents.sendInputEvent({
    type: 'mouseMove',
    x: dragStart.x,
    y: dragStart.y,
  });
  window.webContents.sendInputEvent({
    type: 'mouseDown',
    x: dragStart.x,
    y: dragStart.y,
    button: 'left',
    clickCount: 1,
  });
  for (const offset of [16, 32, 48]) {
    await window.webContents.executeJavaScript(`window.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        buttons: 1,
        clientX: ${dragStart.x + offset},
        clientY: ${dragStart.y},
        pointerId: 1,
        pointerType: 'mouse'
      })
    )`);
    await delay(24);
  }
  const dragMid = (await window.webContents.executeJavaScript(`(() => ({
    leftWidth: document.querySelector('.left-dock')?.getBoundingClientRect().width ?? 0,
    active: document.querySelector('.ide-workspace')?.getAttribute('data-resizing') ?? null
  }))()`)) as { leftWidth: number; active: string | null };
  window.webContents.sendInputEvent({
    type: 'mouseUp',
    x: dragStart.x + 48,
    y: dragStart.y,
    button: 'left',
    clickCount: 1,
  });
  await delay(100);

  window.focus();
  window.webContents.focus();
  await window.webContents.executeJavaScript(
    `document.querySelector('[data-quality-id="left-resizer"]')?.focus()`,
  );
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Right' });
  await delay(100);
  const resized = (await window.webContents.executeJavaScript(`(() => ({
    leftWidth: document.querySelector('.left-dock')?.getBoundingClientRect().width ?? 0,
    focused: document.activeElement?.getAttribute('data-quality-id') ?? null,
    focusVisible: getComputedStyle(document.activeElement).outlineStyle !== 'none'
  }))()`)) as {
    leftWidth: number;
    focused: string | null;
    focusVisible: boolean;
  };

  window.focus();
  window.webContents.focus();
  await window.webContents.executeJavaScript(
    `document.querySelector('.activity-bar button[aria-label="搜索"]')?.focus()`,
  );
  await window.webContents.executeJavaScript(
    `document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }))`,
  );
  await delay(100);
  const keyboard = (await window.webContents.executeJavaScript(`(() => ({
    selectedActivity: document.querySelector('.activity-bar button[aria-pressed="true"]')?.getAttribute('aria-label') ?? null,
    focusBeforeTab: document.activeElement?.getAttribute('aria-label') ?? null
  }))()`)) as {
    selectedActivity: string | null;
    focusBeforeTab: string | null;
  };
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
  await delay(100);
  const focusAfterTab = (await window.webContents.executeJavaScript(
    `document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim() ?? null`,
  )) as string | null;

  writeWindowState(window);
  const persistedWindowState = readWindowState();
  window.webContents.forcefullyCrashRenderer();
  for (let attempt = 0; attempt < 100 && !rendererRecoveryTask; attempt += 1)
    await delay(25);
  if (!rendererRecoveryTask)
    throw new Error('renderer crash did not start recovery');
  await rendererRecoveryTask;
  await waitForRendererSelector(window, '.ide-workspace');
  await waitForRendererSelector(window, '.renderer-recovery-notice');
  const afterRecovery = (await window.webContents.executeJavaScript(`(() => ({
    projectName: document.querySelector('.titlebar-brand strong')?.textContent ?? null,
    recoveryVisible: Boolean(document.querySelector('output.renderer-recovery-notice')),
    regionsRestored: ['.activity-bar','.left-dock','.document-area','.right-dock','.bottom-dock']
      .every((selector) => Boolean(document.querySelector(selector)))
  }))()`)) as {
    projectName: string | null;
    recoveryVisible: boolean;
    regionsRestored: boolean;
  };

  const sourceControlPanelStyled =
    before.visualTheme.sourceControlPresentation.visible &&
    before.visualTheme.sourceControlPresentation.panelBackground ===
      'rgb(9, 14, 21)' &&
    before.visualTheme.sourceControlPresentation.toolbarDisplay === 'grid' &&
    before.visualTheme.sourceControlPresentation.toolbarColumns === 3 &&
    before.visualTheme.sourceControlPresentation.actionBackground ===
      'rgb(13, 20, 29)' &&
    before.visualTheme.sourceControlPresentation.actionBorderStyle ===
      'solid' &&
    before.visualTheme.sourceControlPresentation.actionFontSize >= 9 &&
    before.visualTheme.sourceControlPresentation.actionFontSize <= 10 &&
    before.visualTheme.sourceControlPresentation.inputBackground ===
      'rgb(7, 11, 17)' &&
    before.visualTheme.sourceControlPresentation.inputBorderStyle === 'solid' &&
    before.visualTheme.sourceControlPresentation.sectionHeaderBackground ===
      'rgb(12, 18, 26)' &&
    before.visualTheme.sourceControlPresentation.fileRowDisplay === 'grid' &&
    before.visualTheme.sourceControlPresentation.fileRowColumns === 2 &&
    before.visualTheme.sourceControlPresentation.fileButtonBackground ===
      'rgba(0, 0, 0, 0)' &&
    before.visualTheme.sourceControlPresentation.fileNameFontFamily.includes(
      'Consolas',
    ) &&
    before.visualTheme.sourceControlPresentation.fileNameFontSize ===
      before.visualTheme.changeSetFileLayout.projectFontSize &&
    !before.visualTheme.sourceControlPresentation.hasNativeLightSurface;

  const gate = {
    ok:
      before.devicePixelRatio >= 1.25 &&
      before.viewport.width >= 940 &&
      before.viewport.height >= 600 &&
      !before.rootOverflow.horizontal &&
      !before.rootOverflow.vertical &&
      before.visibleRegions &&
      before.landmarkCount >= 5 &&
      before.unnamedControls === 0 &&
      before.separators.length === 3 &&
      before.separators.every(
        (separator) =>
          Boolean(separator.label) &&
          separator.tabIndex === 0 &&
          Boolean(separator.orientation),
      ) &&
      dragMid.leftWidth >= dragStart.leftWidth + 40 &&
      dragMid.active === 'left' &&
      resized.leftWidth > before.leftWidth &&
      resized.focused === 'left-resizer' &&
      resized.focusVisible &&
      keyboard.selectedActivity === '搜索' &&
      keyboard.focusBeforeTab === '搜索' &&
      focusAfterTab !== keyboard.focusBeforeTab &&
      Math.abs((persistedWindowState?.bounds.width ?? 0) - 960) <= 2 &&
      Math.abs((persistedWindowState?.bounds.height ?? 0) - 640) <= 2 &&
      rendererRecovery?.count === 1 &&
      afterRecovery.projectName === before.projectName &&
      afterRecovery.recoveryVisible &&
      afterRecovery.regionsRestored &&
      before.visualTheme.sourceControlBackground === 'rgb(11, 17, 25)' &&
      sourceControlPanelStyled &&
      before.visualTheme.titlebarLayout.menuLeftOffset <= 140 &&
      before.visualTheme.titlebarLayout.runCenterOffset <= 0.5 &&
      !before.visualTheme.titlebarLayout.leftGroupOverflow &&
      before.visualTheme.changeSetFileLayout.display === 'grid' &&
      before.visualTheme.changeSetFileLayout.textAlign === 'left' &&
      before.visualTheme.changeSetFileLayout.fontFamily.includes('Consolas') &&
      before.visualTheme.changeSetFileLayout.fontSize ===
        before.visualTheme.changeSetFileLayout.projectFontSize &&
      new Set(Object.values(before.visualTheme.gitDecorationColors)).size ===
        6 &&
      before.visualTheme.scrollbarBackground.includes('linear-gradient') &&
      before.visualTheme.copilotLayout.display === 'flex' &&
      before.visualTheme.copilotLayout.direction === 'column' &&
      before.visualTheme.copilotLayout.overflow === 'hidden' &&
      before.visualTheme.copilotLayout.composerAnchored &&
      before.visualTheme.copilotLayout.transcriptHeight >= 96 &&
      before.visualTheme.editorInspectorPresentation.sourceFillsDocument &&
      before.visualTheme.editorInspectorPresentation.monacoContentHeight >=
        120 &&
      before.visualTheme.editorInspectorPresentation.actionGroupDisplay ===
        'grid' &&
      before.visualTheme.editorInspectorPresentation.actionButtonBackground !==
        'rgba(0, 0, 0, 0)' &&
      before.visualTheme.editorInspectorPresentation.actionButtonBorderStyle ===
        'solid' &&
      before.visualTheme.editorInspectorPresentation.metadataFontSize >= 9 &&
      before.visualTheme.editorInspectorPresentation.metadataFontSize <= 10 &&
      before.visualTheme.editorInspectorPresentation.metadataLabelFontSize >=
        9 &&
      before.visualTheme.editorInspectorPresentation.metadataLabelFontSize <=
        10 &&
      before.visualTheme.editorInspectorPresentation.metadataValueFontSize >=
        9 &&
      before.visualTheme.editorInspectorPresentation.metadataValueFontSize <=
        10 &&
      before.visualTheme.editorInspectorPresentation.typeScriptTokenColors
        .length >= 4 &&
      before.visualTheme.controlSurfacePresentation.allCompact &&
      before.visualTheme.controlSurfacePresentation.allButtonsStyled &&
      !before.visualTheme.controlSurfacePresentation.hasNativeLightSurface &&
      before.visualTheme.modelSourcePresentation.assetSource ===
        'provider-api' &&
      before.visualTheme.modelSourcePresentation.settingsSource ===
        'provider-api' &&
      before.visualTheme.modelSourcePresentation.assetSourceText.includes(
        '来源：供应商接口',
      ) &&
      before.visualTheme.modelSourcePresentation.settingsSourceText.includes(
        '来源：供应商接口',
      ) &&
      before.visualTheme.modelSourcePresentation.assetSourceColor ===
        before.visualTheme.modelSourcePresentation.settingsSourceColor &&
      before.visualTheme.modelSourcePresentation.modeButtonAppearance ===
        'none' &&
      before.visualTheme.modelSourcePresentation.modeButtonBorderStyle ===
        'none' &&
      Math.abs(
        before.visualTheme.rightPanelDividerPresentation.documentBoundary -
          before.visualTheme.rightPanelDividerPresentation.dockBoundary,
      ) <= 1 &&
      Math.abs(
        before.visualTheme.rightPanelDividerPresentation.visibleDividerAxis -
          before.visualTheme.rightPanelDividerPresentation.dockBoundary,
      ) <= 0.5 &&
      before.visualTheme.rightPanelDividerPresentation.hitTargetWidth >= 8 &&
      before.visualTheme.rightPanelDividerPresentation.dockOverflowX ===
        'hidden' &&
      before.visualTheme.rightPanelDividerPresentation.internalDividerLeftEdges.every(
        (left) =>
          left >=
          before.visualTheme.rightPanelDividerPresentation.dockBoundary - 0.5,
      ) &&
      before.visualTheme.titleFontSize >= 12 &&
      menuPresentation.visible &&
      menuPresentation.leftOffset <= 1 &&
      menuPresentation.topGap >= 0 &&
      menuPresentation.topGap <= 4 &&
      menuPresentation.fontSize >= 9 &&
      menuPresentation.fontSize <= 10.5 &&
      menuPresentation.itemHeight >= 24 &&
      menuPresentation.itemHeight <= 28 &&
      menuPresentation.background !== 'rgba(0, 0, 0, 0)' &&
      tabCloseControls.tabs >= 3 &&
      tabCloseControls.closeControls === tabCloseControls.tabs &&
      tabCloseControls.overviewHasClose &&
      ['关闭当前', '关闭右侧', '关闭其他', '关闭全部'].every((label) =>
        tabActions.labels.includes(label),
      ) &&
      tabActions.afterCloseRight === 2 &&
      tabActions.afterCloseOthers === 1 &&
      tabActions.afterCloseCurrent.count === 1 &&
      tabActions.afterCloseCurrent.overviewOpen,
    highDpi: before.devicePixelRatio,
    minimumViewport: before.viewport,
    noRootOverflow:
      !before.rootOverflow.horizontal && !before.rootOverflow.vertical,
    visibleRegions: before.visibleRegions,
    landmarkCount: before.landmarkCount,
    unnamedControls: before.unnamedControls,
    keyboardActivity: keyboard.selectedActivity,
    sequentialFocus: focusAfterTab !== keyboard.focusBeforeTab,
    keyboardResize: resized.leftWidth > before.leftWidth,
    pointerResize:
      dragMid.leftWidth >= dragStart.leftWidth + 40 &&
      dragMid.active === 'left',
    pointerResizeDetails: { dragStart, dragMid },
    focusVisible: resized.focusVisible,
    windowStatePersisted:
      Math.abs((persistedWindowState?.bounds.width ?? 0) - 960) <= 2 &&
      Math.abs((persistedWindowState?.bounds.height ?? 0) - 640) <= 2,
    rendererCrashRecovered:
      rendererRecovery?.count === 1 && afterRecovery.regionsRestored,
    recoveryNotice: afterRecovery.recoveryVisible,
    projectRestored: afterRecovery.projectName === before.projectName,
    darkSourceControl:
      before.visualTheme.sourceControlBackground === 'rgb(11, 17, 25)',
    sourceControlPanelStyled,
    sourceControlPresentation: before.visualTheme.sourceControlPresentation,
    leftAlignedMainMenu:
      before.visualTheme.titlebarLayout.menuLeftOffset <= 140 &&
      !before.visualTheme.titlebarLayout.leftGroupOverflow,
    centeredRunControls:
      before.visualTheme.titlebarLayout.runCenterOffset <= 0.5,
    changeSetFileTypography:
      before.visualTheme.changeSetFileLayout.display === 'grid' &&
      before.visualTheme.changeSetFileLayout.textAlign === 'left' &&
      before.visualTheme.changeSetFileLayout.fontFamily.includes('Consolas') &&
      before.visualTheme.changeSetFileLayout.fontSize ===
        before.visualTheme.changeSetFileLayout.projectFontSize,
    changeSetFileLayout: before.visualTheme.changeSetFileLayout,
    gitFileDecorations:
      new Set(Object.values(before.visualTheme.gitDecorationColors)).size === 6,
    styledScrollbar:
      before.visualTheme.scrollbarBackground.includes('linear-gradient'),
    copilotLayout:
      before.visualTheme.copilotLayout.display === 'flex' &&
      before.visualTheme.copilotLayout.direction === 'column' &&
      before.visualTheme.copilotLayout.overflow === 'hidden' &&
      before.visualTheme.copilotLayout.composerAnchored &&
      before.visualTheme.copilotLayout.transcriptHeight >= 96,
    sourceEditorAndInspectorStyled:
      before.visualTheme.editorInspectorPresentation.sourceFillsDocument &&
      before.visualTheme.editorInspectorPresentation.monacoContentHeight >=
        120 &&
      before.visualTheme.editorInspectorPresentation.actionGroupDisplay ===
        'grid' &&
      before.visualTheme.editorInspectorPresentation.actionButtonBackground !==
        'rgba(0, 0, 0, 0)' &&
      before.visualTheme.editorInspectorPresentation.actionButtonBorderStyle ===
        'solid' &&
      before.visualTheme.editorInspectorPresentation.metadataFontSize >= 9 &&
      before.visualTheme.editorInspectorPresentation.metadataFontSize <= 10 &&
      before.visualTheme.editorInspectorPresentation.metadataLabelFontSize >=
        9 &&
      before.visualTheme.editorInspectorPresentation.metadataLabelFontSize <=
        10 &&
      before.visualTheme.editorInspectorPresentation.metadataValueFontSize >=
        9 &&
      before.visualTheme.editorInspectorPresentation.metadataValueFontSize <=
        10 &&
      before.visualTheme.editorInspectorPresentation.typeScriptTokenColors
        .length >= 4,
    editorInspectorPresentation: before.visualTheme.editorInspectorPresentation,
    compactControlSurfaces:
      before.visualTheme.controlSurfacePresentation.allCompact &&
      before.visualTheme.controlSurfacePresentation.allButtonsStyled &&
      !before.visualTheme.controlSurfacePresentation.hasNativeLightSurface,
    controlSurfacePresentation: before.visualTheme.controlSurfacePresentation,
    providerModelSourceStyled:
      before.visualTheme.modelSourcePresentation.assetSource ===
        'provider-api' &&
      before.visualTheme.modelSourcePresentation.settingsSource ===
        'provider-api' &&
      before.visualTheme.modelSourcePresentation.assetSourceText.includes(
        '来源：供应商接口',
      ) &&
      before.visualTheme.modelSourcePresentation.settingsSourceText.includes(
        '来源：供应商接口',
      ) &&
      before.visualTheme.modelSourcePresentation.assetSourceColor ===
        before.visualTheme.modelSourcePresentation.settingsSourceColor &&
      before.visualTheme.modelSourcePresentation.modeButtonAppearance ===
        'none' &&
      before.visualTheme.modelSourcePresentation.modeButtonBorderStyle ===
        'none',
    modelSourcePresentation: before.visualTheme.modelSourcePresentation,
    rightPanelDividerContained:
      Math.abs(
        before.visualTheme.rightPanelDividerPresentation.documentBoundary -
          before.visualTheme.rightPanelDividerPresentation.dockBoundary,
      ) <= 1 &&
      Math.abs(
        before.visualTheme.rightPanelDividerPresentation.visibleDividerAxis -
          before.visualTheme.rightPanelDividerPresentation.dockBoundary,
      ) <= 0.5 &&
      before.visualTheme.rightPanelDividerPresentation.hitTargetWidth >= 8 &&
      before.visualTheme.rightPanelDividerPresentation.dockOverflowX ===
        'hidden' &&
      before.visualTheme.rightPanelDividerPresentation.internalDividerLeftEdges.every(
        (left) =>
          left >=
          before.visualTheme.rightPanelDividerPresentation.dockBoundary - 0.5,
      ),
    rightPanelDividerPresentation:
      before.visualTheme.rightPanelDividerPresentation,
    increasedTypography: before.visualTheme.titleFontSize >= 12,
    compactMainMenu:
      menuPresentation.visible &&
      menuPresentation.leftOffset <= 1 &&
      menuPresentation.topGap >= 0 &&
      menuPresentation.topGap <= 4 &&
      menuPresentation.fontSize >= 9 &&
      menuPresentation.fontSize <= 10.5 &&
      menuPresentation.itemHeight >= 24 &&
      menuPresentation.itemHeight <= 28 &&
      menuPresentation.background !== 'rgba(0, 0, 0, 0)',
    menuPresentation,
    documentTabCloseControls:
      tabCloseControls.tabs >= 3 &&
      tabCloseControls.closeControls === tabCloseControls.tabs &&
      tabCloseControls.overviewHasClose,
    documentTabContextActions:
      ['关闭当前', '关闭右侧', '关闭其他', '关闭全部'].every((label) =>
        tabActions.labels.includes(label),
      ) &&
      tabActions.afterCloseRight === 2 &&
      tabActions.afterCloseOthers === 1 &&
      tabActions.afterCloseCurrent.count === 1 &&
      tabActions.afterCloseCurrent.overviewOpen,
    tabCloseControls,
    tabActions,
  };
  console.log(`[p15-quality-gate] ${JSON.stringify(gate)}`);
  return gate;
}

async function runP23QualityGate(window: BrowserWindow) {
  window.setBounds({ x: 100, y: 100, width: 1280, height: 760 });
  window.show();
  window.focus();
  await waitForRendererSelector(window, '.ide-workspace');
  await window.webContents.executeJavaScript(
    `document.querySelectorAll('.document-tab-select')[1]?.click()`,
  );
  await waitForRendererSelector(window, 'canvas[data-engine-viewport="scene"]');
  const scene = (await window.webContents.executeJavaScript(`(() => {
    const canvas = document.querySelector('canvas[data-engine-viewport="scene"]');
    const host = canvas?.closest('.scene-canvas');
    const bounds = canvas?.getBoundingClientRect();
    return {
      canvas: Boolean(canvas),
      width: bounds?.width ?? 0,
      height: bounds?.height ?? 0,
      domGameObjects: host?.querySelectorAll(':scope > button').length ?? -1,
      projection: host?.getAttribute('data-projection') ?? null
    };
  })()`)) as {
    canvas: boolean;
    width: number;
    height: number;
    domGameObjects: number;
    projection: string | null;
  };

  const sceneInteraction = (await window.webContents
    .executeJavaScript(`(async () => {
    const canvas = document.querySelector('canvas[data-engine-viewport="scene"]');
    const viewport = canvas?.closest('.engine-viewport');
    if (!(canvas instanceof HTMLCanvasElement) || !(viewport instanceof HTMLElement)) {
      return { selected: false, cleared: false, shortcut: '', zoomed: false, panned: false, reset: false };
    }
    canvas.setPointerCapture = () => undefined;
    canvas.releasePointerCapture = () => undefined;
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const bounds = canvas.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    canvas.dispatchEvent(new MouseEvent('click', {
      bubbles: true, button: 0, clientX: centerX, clientY: centerY
    }));
    await frame();
    const selected = Boolean(document.querySelector('.outline-object-row.selected'));
    canvas.dispatchEvent(new MouseEvent('click', {
      bubbles: true, button: 0, clientX: bounds.left + 1, clientY: bounds.top + 1
    }));
    await frame();
    const cleared = !document.querySelector('.outline-object-row.selected');
    window.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, code: 'KeyW', key: 'w'
    }));
    await frame();
    const shortcut = [...document.querySelectorAll('.scene-toolbar button.active')]
      .map((button) => button.textContent?.trim()).find(Boolean) ?? '';
    window.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, code: 'KeyQ', key: 'q'
    }));
    const distanceBefore = Number(viewport.dataset.viewDistance);
    canvas.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true, cancelable: true, deltaY: -180, clientX: centerX, clientY: centerY
    }));
    await frame();
    const distanceAfter = Number(viewport.dataset.viewDistance);
    const pointerId = 44;
    canvas.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, button: 1, buttons: 4, pointerId, clientX: centerX, clientY: centerY
    }));
    canvas.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, button: 1, buttons: 4, pointerId, clientX: centerX + 48, clientY: centerY + 24
    }));
    canvas.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, button: 1, buttons: 0, pointerId, clientX: centerX + 48, clientY: centerY + 24
    }));
    await frame();
    const panned = Number(viewport.dataset.viewPanX) !== 0 || Number(viewport.dataset.viewPanY) !== 0;
    viewport.querySelector('.engine-viewport-navigation button')?.click();
    await frame();
    return {
      selected,
      cleared,
      shortcut,
      zoomed: Number.isFinite(distanceBefore) && Number.isFinite(distanceAfter) && distanceAfter < distanceBefore,
      panned,
      reset:
        viewport.dataset.viewDistance === '1.0000' &&
        viewport.dataset.viewPanX === '0.0000' &&
        viewport.dataset.viewPanY === '0.0000'
    };
  })()`)) as {
    selected: boolean;
    cleared: boolean;
    shortcut: string;
    zoomed: boolean;
    panned: boolean;
    reset: boolean;
  };

  const authoringScenePath = requireWorkspace().snapshot().entryScene;
  const authoringSceneFile = join(
    p23GateProject ?? '',
    ...authoringScenePath.split('/'),
  );
  const inspectAuthoringScene = () =>
    requireWorkspace().execute('scene.inspect', {
      path: authoringScenePath,
    }).data as { objects: Array<{ id: string; name: string }> };
  const objectCountBefore = inspectAuthoringScene().objects.length;
  await window.webContents.executeJavaScript(`(() => {
    const addObject = [...document.querySelectorAll('.scene-toolbar button')]
      .find((button) => button.textContent?.trim() === '+ 对象');
    addObject?.click();
  })()`);
  await waitForRendererSelector(window, '.studio-text-dialog input');
  await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('.studio-text-dialog input');
    const form = document.querySelector('.studio-text-dialog form');
    if (!(input instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, 'P23 Gate Object');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    form.requestSubmit();
  })()`);
  let createdObjects = inspectAuthoringScene().objects;
  for (
    let attempt = 0;
    attempt < 50 && createdObjects.length <= objectCountBefore;
    attempt += 1
  ) {
    await delay(20);
    createdObjects = inspectAuthoringScene().objects;
  }
  const objectCreation = {
    before: objectCountBefore,
    after: createdObjects.length,
    named: createdObjects.some((object) => object.name === 'P23 Gate Object'),
    dialogClosed: !(await window.webContents.executeJavaScript(
      `Boolean(document.querySelector('.studio-text-dialog'))`,
    )),
  };
  const authoringSourceBefore = readFileSync(authoringSceneFile, 'utf8');
  const authoringHistoryBefore =
    requireWorkspace().snapshot().history.transactionCount;
  const transformPreview = (await window.webContents
    .executeJavaScript(`(async () => {
    const move = [...document.querySelectorAll('.scene-toolbar button')]
      .find((button) => button.textContent?.trim() === '移动');
    move?.click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const canvas = document.querySelector('canvas[data-engine-viewport="scene"]');
    const host = canvas?.closest('.scene-canvas');
    if (!(canvas instanceof HTMLCanvasElement) || !(host instanceof HTMLElement)) {
      return { previewing: false, latencyMs: Number.POSITIVE_INFINITY };
    }
    canvas.setPointerCapture = () => undefined;
    canvas.releasePointerCapture = () => undefined;
    const bounds = canvas.getBoundingClientRect();
    const startX = bounds.left + bounds.width / 2;
    const startY = bounds.top + bounds.height / 2;
    const pointerId = 73;
    canvas.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, button: 0, buttons: 1, pointerId, clientX: startX, clientY: startY
    }));
    const startedAt = performance.now();
    canvas.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, button: 0, buttons: 1, pointerId, clientX: startX + 64, clientY: startY + 32
    }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.__p23TransformDrag = { pointerId, clientX: startX + 64, clientY: startY + 32 };
    return {
      previewing: host.dataset.transformPreview === 'previewing',
      latencyMs: performance.now() - startedAt
    };
  })()`)) as { previewing: boolean; latencyMs: number };
  const authoringSourceDuring = readFileSync(authoringSceneFile, 'utf8');
  const commitStartedAt = performance.now();
  const releaseLatencyMs = (await window.webContents
    .executeJavaScript(`(async () => {
    const canvas = document.querySelector('canvas[data-engine-viewport="scene"]');
    const host = canvas?.closest('.scene-canvas');
    const drag = window.__p23TransformDrag;
    if (!(canvas instanceof HTMLCanvasElement) || !(host instanceof HTMLElement) || !drag) {
      return Number.POSITIVE_INFINITY;
    }
    const startedAt = performance.now();
    canvas.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      button: 0,
      buttons: 0,
      pointerId: drag.pointerId,
      clientX: drag.clientX,
      clientY: drag.clientY
    }));
    for (let attempt = 0; attempt < 30 && host.dataset.transformPreview !== 'idle'; attempt += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return performance.now() - startedAt;
  })()`)) as number;
  let authoringSourceAfter = readFileSync(authoringSceneFile, 'utf8');
  let authoringHistoryAfter =
    requireWorkspace().snapshot().history.transactionCount;
  for (
    let attempt = 0;
    attempt < 100 &&
    (authoringSourceAfter === authoringSourceBefore ||
      authoringHistoryAfter <= authoringHistoryBefore);
    attempt += 1
  ) {
    await delay(20);
    authoringSourceAfter = readFileSync(authoringSceneFile, 'utf8');
    authoringHistoryAfter =
      requireWorkspace().snapshot().history.transactionCount;
  }
  const commitLatencyMs = performance.now() - commitStartedAt;
  const transformInteraction = {
    previewingBeforePointerUp: transformPreview.previewing,
    previewLatencyMs: transformPreview.latencyMs,
    releaseLatencyMs,
    commitLatencyMs,
    fileUnchangedDuringPreview: authoringSourceDuring === authoringSourceBefore,
    fileChangedAfterPointerUp: authoringSourceAfter !== authoringSourceBefore,
    historyTransactions: authoringHistoryAfter - authoringHistoryBefore,
  };

  await window.webContents.executeJavaScript(
    `document.querySelector('.titlebar-run button')?.click()`,
  );
  await waitForRendererSelector(window, 'canvas[data-engine-viewport="game"]');
  const started = requireWorkspace().snapshot().runtime;
  await delay(220);
  const advanced = requireWorkspace().snapshot().runtime;
  const liveInputStartedAt = performance.now();
  const liveInputAccepted = requireWorkspace().queueRuntimeInput({
    action: 'input:test/live',
    value: 1,
    source: 'automation',
  });
  const liveInput = {
    observedTick: advanced.tick,
    allocatedTick: liveInputAccepted.tick,
    queueLatencyMs: performance.now() - liveInputStartedAt,
  };
  await window.webContents.executeJavaScript(
    `document.querySelector('.titlebar-run button[title="暂停"]')?.click()`,
  );
  await delay(120);
  const paused = requireWorkspace().snapshot().runtime;
  await delay(160);
  const retained = requireWorkspace().snapshot().runtime;
  await window.webContents.executeJavaScript(
    `document.querySelector('.titlebar-run button[title="单步执行一个固定 Tick"]')?.click()`,
  );
  await delay(150);
  const stepped = requireWorkspace().snapshot().runtime;
  const sequenceBeforeInput = stepped.sequence ?? 0;
  await window.webContents.executeJavaScript(
    `(() => {
      const canvas = document.querySelector('canvas[data-engine-viewport="game"]');
      canvas?.focus();
      canvas?.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        code: 'Space',
        key: ' ',
        repeat: false
      }));
    })()`,
  );
  await delay(120);
  const inputQueued = requireWorkspace().snapshot().runtime;

  let rejectedLateInput = false;
  try {
    requireWorkspace().execute('runtime.input', {
      tick: Math.max(0, stepped.tick - 1),
      action: 'input:test/late',
      value: 1,
    });
  } catch {
    rejectedLateInput = true;
  }
  const failureScript = join(
    p23GateProject ?? '',
    'scripts',
    'systems',
    'ball.ts',
  );
  const originalScript = readFileSync(failureScript, 'utf8');
  let isolatedFailure = false;
  try {
    writeFileSync(
      failureScript,
      `import { defineSystem } from '@aigame/sdk';\nexport const updateBall = defineSystem({ onFixedUpdate() { throw new Error('P23_PREVIEW_FAILURE'); } });\n`,
      'utf8',
    );
    const failed = requireWorkspace().execute('runtime.restart', {
      ticks: 1,
    }).snapshot.runtime;
    isolatedFailure =
      failed.status === 'failed' &&
      !window.isDestroyed() &&
      !window.webContents.isCrashed();
  } finally {
    writeFileSync(failureScript, originalScript, 'utf8');
  }
  requireWorkspace().execute('runtime.stop');
  const stopped = requireWorkspace().snapshot().runtime;

  const gate = {
    ok:
      scene.canvas &&
      scene.width > 400 &&
      scene.height > 240 &&
      scene.domGameObjects === 0 &&
      scene.projection === 'render.snapshot' &&
      sceneInteraction.selected &&
      sceneInteraction.cleared &&
      sceneInteraction.shortcut === '移动' &&
      sceneInteraction.zoomed &&
      sceneInteraction.panned &&
      sceneInteraction.reset &&
      objectCreation.after === objectCreation.before + 1 &&
      objectCreation.named &&
      objectCreation.dialogClosed &&
      transformInteraction.previewingBeforePointerUp &&
      transformInteraction.previewLatencyMs < 200 &&
      transformInteraction.releaseLatencyMs < 200 &&
      transformInteraction.commitLatencyMs < 1_500 &&
      transformInteraction.fileUnchangedDuringPreview &&
      transformInteraction.fileChangedAfterPointerUp &&
      transformInteraction.historyTransactions === 1 &&
      Boolean(started.sessionId) &&
      started.generation === 1 &&
      advanced.tick > started.tick &&
      liveInput.allocatedTick >= liveInput.observedTick &&
      liveInput.queueLatencyMs < 16 &&
      paused.status === 'paused' &&
      retained.tick === paused.tick &&
      stepped.tick === paused.tick + 1 &&
      stepped.sessionId === paused.sessionId &&
      (inputQueued.sequence ?? 0) > sequenceBeforeInput &&
      inputQueued.renderSnapshot?.protocolVersion === '3.0.0-preview.1' &&
      rejectedLateInput &&
      isolatedFailure &&
      stopped.status === 'stopped',
    scene,
    sceneInteraction,
    objectCreation,
    transformInteraction,
    sessionId: started.sessionId,
    generation: started.generation,
    liveAdvance: { started: started.tick, advanced: advanced.tick },
    liveInput,
    pauseRetained: { paused: paused.tick, retained: retained.tick },
    stepped: { before: paused.tick, after: stepped.tick },
    inputSequence: { before: sequenceBeforeInput, after: inputQueued.sequence },
    sharedProjection: inputQueued.renderSnapshot?.protocolVersion ?? null,
    rejectedLateInput,
    failureIsolated: isolatedFailure,
    stopped: stopped.status,
  };
  console.log(`[p23-runtime-gate] ${JSON.stringify(gate)}`);
  return gate;
}

async function runP30ObservationGate(window: BrowserWindow) {
  window.setBounds({ x: 80, y: 80, width: 1440, height: 920 });
  window.show();
  window.focus();
  await waitForRendererSelector(window, '.ide-workspace');
  await window.webContents.executeJavaScript(`(() => {
    const run = document.querySelector('.titlebar-run button[title="运行游戏"]');
    run?.click();
    return Boolean(run);
  })()`);
  await waitForRendererSelector(window, '.game-runtime-editor', 30_000);
  const captureActivated = (await window.webContents.executeJavaScript(`(() => {
    const button = [...document.querySelectorAll('.runtime-observation-card button')]
      .find((candidate) => candidate.textContent?.trim() === '捕获当前帧');
    button?.click();
    return Boolean(button && !button.disabled);
  })()`)) as boolean;
  await waitForRendererSelector(
    window,
    '.runtime-observation-card[data-has-observation="true"] img',
    30_000,
  );
  const observation = (await window.webContents.executeJavaScript(`(() => {
    const editor = document.querySelector('.game-runtime-editor');
    const card = document.querySelector('.runtime-observation-card');
    const image = card?.querySelector('img');
    const metrics = card?.querySelector('.runtime-observation-metrics');
    const diagnostics = card?.querySelector('.runtime-observation-diagnostics');
    const editorBounds = editor?.getBoundingClientRect();
    const cardBounds = card?.getBoundingClientRect();
    const style = card ? getComputedStyle(card) : null;
    return {
      card: Boolean(card),
      imageDataUrl: image?.getAttribute('src')?.startsWith('data:image/png;base64,') ?? false,
      imageWidth: image?.naturalWidth ?? 0,
      imageHeight: image?.naturalHeight ?? 0,
      checkpointVisible: metrics?.textContent?.includes('checkpoint:manual-tick-') ?? false,
      drawableVisible: metrics?.textContent?.includes('Drawable') ?? false,
      audioVisible: metrics?.textContent?.includes('Event') ?? false,
      diagnosticsVisible: Boolean(diagnostics),
      geometryContained: Boolean(
        editorBounds && cardBounds &&
        cardBounds.left >= editorBounds.left &&
        cardBounds.right <= editorBounds.right + 1
      ),
      background: style?.backgroundColor ?? '',
      border: style?.borderTopColor ?? '',
      rootOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  })()`)) as {
    card: boolean;
    imageDataUrl: boolean;
    imageWidth: number;
    imageHeight: number;
    checkpointVisible: boolean;
    drawableVisible: boolean;
    audioVisible: boolean;
    diagnosticsVisible: boolean;
    geometryContained: boolean;
    background: string;
    border: string;
    rootOverflowX: boolean;
  };
  const runtime = requireWorkspace().snapshot().runtime;
  const gate = {
    ok:
      captureActivated &&
      observation.card &&
      observation.imageDataUrl &&
      observation.imageWidth > 0 &&
      observation.imageHeight > 0 &&
      observation.checkpointVisible &&
      observation.drawableVisible &&
      observation.audioVisible &&
      observation.diagnosticsVisible &&
      observation.geometryContained &&
      !observation.rootOverflowX &&
      Boolean(runtime.latestObservation?.observationId),
    captureActivated,
    observation,
    observationId: runtime.latestObservation?.observationId ?? null,
    artifactPath: runtime.latestObservation?.frameArtifact.path ?? null,
    stableDiagnosticTargets:
      runtime.latestObservation?.diagnostics.every((diagnostic) =>
        Boolean(
          diagnostic.sceneId ||
          diagnostic.objectId ||
          diagnostic.componentId ||
          diagnostic.assetId ||
          diagnostic.systemId ||
          diagnostic.moduleId ||
          diagnostic.tick >= 0,
        ),
      ) ?? false,
  };
  console.log(`[p30-observation-gate] ${JSON.stringify(gate)}`);
  return gate;
}

async function runCandidateReviewGate(window: BrowserWindow) {
  window.setBounds({ x: 80, y: 80, width: 1440, height: 920 });
  window.show();
  window.focus();
  await waitForRendererSelector(window, '.ide-workspace');
  const assetsActivated = (await window.webContents.executeJavaScript(`(() => {
    const button = document.querySelector('.activity-bar button[aria-label="资源"]');
    button?.click();
    return Boolean(button);
  })()`)) as boolean;
  try {
    await waitForRendererSelector(window, '.asset-job-card .asset-candidates');
  } catch (error) {
    console.log(
      '[candidate-review-initialization] ' +
        JSON.stringify({
          jobs: requireAssetJobs()
            .list()
            .map((job) => ({ id: job.id, status: job.status })),
          panel: await window.webContents.executeJavaScript(
            `document.querySelector('.left-dock')?.textContent`,
          ),
        }),
    );
    throw error;
  }
  let ready = false;
  for (let attempt = 0; attempt < 200 && !ready; attempt += 1) {
    ready = (await window.webContents.executeJavaScript(`(() => {
      const pathFilter = ${JSON.stringify(candidateReviewGatePathFilter)};
      const expectedCount = ${JSON.stringify(candidateReviewGateExpectedCount)};
      const candidates = [...document.querySelectorAll('.asset-candidates > div')]
        .filter((candidate) => candidate.querySelector('small')?.textContent?.includes(pathFilter));
      return candidates.length === expectedCount && candidates.every((candidate) => {
        if (${candidateReviewGateAudio}) {
          const audio = candidate.querySelector('audio');
          return audio instanceof HTMLAudioElement && audio.readyState >= 1 &&
            Number.isFinite(audio.duration) && audio.duration > 0 && !audio.error;
        }
        const image = candidate.querySelector('img');
        return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
      });
    })()`)) as boolean;
    if (!ready) await delay(50);
  }
  // Observe several real polling cycles: cached media must not be decoded again.
  await new Promise((resolve) => setTimeout(resolve, 3_200));
  const previewRequests = Object.fromEntries(candidatePreviewGateCalls);
  const previewsLoadedOnce =
    candidatePreviewGateCalls.size > 0 &&
    [...candidatePreviewGateCalls.values()].every((count) => count === 1);
  const presentation = (await window.webContents.executeJavaScript(`(() => {
    const pathFilter = ${JSON.stringify(candidateReviewGatePathFilter)};
    const dock = document.querySelector('.left-dock');
    const browser = document.querySelector('.asset-job-browser');
    const filterButtons = [...document.querySelectorAll('.asset-job-browser button')];
    const selectedFilter = filterButtons.find((button) => button.getAttribute('aria-pressed') === 'true');
    const allFilter = filterButtons.find((button) => button.textContent?.includes('全部'));
    const candidates = [...document.querySelectorAll('.asset-candidates > div')]
      .filter((candidate) => candidate.querySelector('small')?.textContent?.includes(pathFilter));
    const cards = [...new Set(candidates.map((candidate) => candidate.closest('.asset-job-card')).filter(Boolean))];
    const paths = candidates
      .map((candidate) => candidate.querySelector('small')?.textContent?.trim() ?? '')
      .filter(Boolean);
    const images = candidates
      .map((candidate) => candidate.querySelector('img'))
      .filter((image) => image instanceof HTMLImageElement);
    const audio = candidates.map((candidate) => candidate.querySelector('audio'))
      .filter((element) => element instanceof HTMLAudioElement);
    const metadata = candidates.map((candidate) =>
      [...candidate.querySelectorAll('small')].map((value) => value.textContent ?? '').join(' ')
    );
    const actionLabels = candidates.map((candidate) =>
      [...candidate.querySelectorAll('button')].map((button) => button.textContent?.trim() ?? '')
    );
    const dockBounds = dock?.getBoundingClientRect();
    const candidateBounds = candidates.map((candidate) => candidate.getBoundingClientRect());
    const cardStyle = cards[0] ? getComputedStyle(cards[0]) : null;
    const filterStyle = selectedFilter ? getComputedStyle(selectedFilter) : null;
    return {
      activitySelected: document.querySelector('.activity-bar button[aria-label="资源"]')?.getAttribute('aria-pressed') === 'true',
      jobCount: cards.length,
      candidateCount: candidates.length,
      paths,
      filterBar: Boolean(browser),
      filterButtonCount: filterButtons.length,
      selectedFilterAria: selectedFilter?.getAttribute('aria-label') ?? '',
      allFilterAria: allFilter?.getAttribute('aria-label') ?? '',
      filterFontSize: Number.parseFloat(filterStyle?.fontSize ?? '0'),
      filterBackground: filterStyle?.backgroundColor ?? '',
      filterBorderStyle: filterStyle?.borderTopStyle ?? '',
      loadedImageCount: images.filter((image) => image.complete && image.naturalWidth > 0).length,
      loadedAudioCount: audio.filter((element) => element.readyState >= 1 && !element.error).length,
      dataUrlCount: ${candidateReviewGateAudio}
        ? audio.filter((element) => element.getAttribute('src')?.startsWith('data:audio/')).length
        : images.filter((image) => image.getAttribute('src')?.startsWith('data:image/')).length,
      metadataComplete: metadata.every((value) => value.includes('SHA-256') && value.includes('awaitingReview')),
      actionsComplete: actionLabels.every((labels) =>
        ['选择并提议导入', '拒绝', '按意见再生成'].every((label) => labels.includes(label))
      ),
      geometryContained: Boolean(dockBounds) && candidateBounds.every((bounds) =>
        bounds.left >= dockBounds.left && bounds.right <= dockBounds.right + 1
      ),
      darkSurface: cardStyle?.backgroundColor !== 'rgb(255, 255, 255)',
      rootOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  })()`)) as {
    activitySelected: boolean;
    jobCount: number;
    candidateCount: number;
    paths: string[];
    filterBar: boolean;
    filterButtonCount: number;
    selectedFilterAria: string;
    allFilterAria: string;
    filterFontSize: number;
    filterBackground: string;
    filterBorderStyle: string;
    loadedImageCount: number;
    loadedAudioCount: number;
    dataUrlCount: number;
    metadataComplete: boolean;
    actionsComplete: boolean;
    geometryContained: boolean;
    darkSurface: boolean;
    rootOverflowX: boolean;
  };
  const jobs = requireAssetJobs()
    .list()
    .filter((job) =>
      job.candidates.some((candidate) =>
        candidate.path.includes(candidateReviewGatePathFilter),
      ),
    );
  const names = presentation.paths
    .map((path) => path.replaceAll('\\', '/').split('/').at(-1) ?? '')
    .sort();
  const audioPlayback = candidateReviewGateAudio
    ? ((await window.webContents.executeJavaScript(
        `(async () => {
        const players = [...document.querySelectorAll('.asset-candidates audio')];
        const results = [];
        for (const player of players) {
          player.muted = true;
          player.currentTime = 0;
          let playError = null;
          try { await player.play(); } catch (error) { playError = String(error); }
          await new Promise(resolve => setTimeout(resolve, 250));
          results.push({duration: player.duration, currentTime: player.currentTime,
            errorCode: player.error?.code ?? null, playError});
          player.pause();
        }
        const policy = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? '';
        const externalMediaBlocked = await new Promise(resolve => {
          const probe = document.createElement('audio');
          const url = 'https://example.invalid/studio-audio-policy-probe.wav';
          const finish = value => {
            clearTimeout(timer);
            document.removeEventListener('securitypolicyviolation', onViolation);
            probe.removeAttribute('src');
            probe.load();
            resolve(value);
          };
          const onViolation = event => {
            if (event.effectiveDirective === 'media-src' && event.blockedURI === url) finish(true);
          };
          const timer = setTimeout(() => finish(false), 1500);
          document.addEventListener('securitypolicyviolation', onViolation);
          probe.src = url;
          probe.load();
        });
        return {results, policy, externalMediaBlocked};
      })()`,
        true,
      )) as {
        results: Array<{
          duration: number;
          currentTime: number;
          errorCode: number | null;
          playError: string | null;
        }>;
        policy: string;
        externalMediaBlocked: boolean;
      })
    : null;
  const gate = {
    ok:
      assetsActivated &&
      ready &&
      previewsLoadedOnce &&
      presentation.activitySelected &&
      presentation.filterBar &&
      presentation.filterButtonCount === 5 &&
      presentation.selectedFilterAria.includes(
        `${candidateReviewGateExpectedCount} 个`,
      ) &&
      presentation.allFilterAria.includes(
        `${requireAssetJobs().list().length} 个`,
      ) &&
      presentation.filterFontSize > 0 &&
      presentation.filterFontSize <= 10 &&
      presentation.filterBackground !== 'rgb(255, 255, 255)' &&
      presentation.filterBorderStyle === 'solid' &&
      candidateReviewGatePathFilter.length > 0 &&
      Number.isInteger(candidateReviewGateExpectedCount) &&
      candidateReviewGateExpectedCount > 0 &&
      presentation.jobCount === candidateReviewGateExpectedCount &&
      presentation.candidateCount === candidateReviewGateExpectedCount &&
      (candidateReviewGateAudio
        ? presentation.loadedAudioCount === candidateReviewGateExpectedCount &&
          audioPlayback?.results.length === candidateReviewGateExpectedCount &&
          audioPlayback.results.every(
            (result) =>
              result.currentTime > 0 && !result.errorCode && !result.playError,
          ) &&
          audioPlayback.externalMediaBlocked
        : presentation.loadedImageCount === candidateReviewGateExpectedCount) &&
      presentation.dataUrlCount === candidateReviewGateExpectedCount &&
      presentation.metadataComplete &&
      presentation.actionsComplete &&
      presentation.geometryContained &&
      presentation.darkSurface &&
      !presentation.rootOverflowX &&
      names.length === candidateReviewGateExpectedCount &&
      jobs.length === candidateReviewGateExpectedCount &&
      jobs.every(
        (job) =>
          job.status === 'awaitingReview' &&
          job.selectedCandidateId === null &&
          job.reviewDecisionId === null &&
          job.importedAssetId === null &&
          job.importChangeSetId === null,
      ),
    assetsActivated,
    ready,
    previewsLoadedOnce,
    previewRequests,
    presentation,
    candidateNames: names,
    audioPlayback,
    durableReviewState: jobs.map((job) => ({
      jobId: job.id,
      status: job.status,
      candidateId: job.candidates[0]?.id ?? null,
      selectedCandidateId: job.selectedCandidateId,
      importChangeSetId: job.importChangeSetId,
    })),
  };
  console.log(`[candidate-review-gate] ${JSON.stringify(gate)}`);
  return gate;
}

function requireWorkspace(): StudioCommandRegistry {
  if (!workspace) {
    throw new ProjectError('WORKSPACE_NOT_OPEN', '当前没有打开的项目工作区。');
  }
  return workspace;
}

function openWorkspace(projectRoot: string): void {
  reviewWatcherUpdates?.dispose();
  workspace?.dispose();
  projectWatcher?.close();
  projectWatcher = null;
  workspace = new StudioCommandRegistry({
    projectRoot,
    kernelCliPath,
    scriptHostPath: projectScriptHostPath,
    playerExecutablePath: gameRuntimePath,
  });
  workspace.onRuntimeUpdate((runtime) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.workspaceRuntimeState, runtime);
    }
  });
  changeSets = new StudioChangeSetService({
    projectRoot,
    kernelCliPath,
    registry: workspace,
  });
  completionRuns = new CompletionRunService({ projectRoot });
  assetJobs = new StudioAssetJobBroker({
    projectRoot,
    audioInspectorPath: gameRuntimePath,
    registry: workspace,
    changes: changeSets,
    getCompletionContext: () => completionRuns?.context() ?? null,
    onExternalLink: (completionRunId, kind, id) =>
      completionRuns?.link(completionRunId, kind, id),
    resolveCredential: (id) => credentialVault.resolve(id),
    getCredentialRef: (providerId) => {
      return (
        credentialVault
          .list()
          .find((credential) => credential.provider === providerId)?.id ?? null
      );
    },
    getProviderConnection: (providerId, requestedCredentialRef) => {
      const values = settingsService.get('ai-tools').values;
      const connections =
        values.providerConnections &&
        typeof values.providerConnections === 'object' &&
        !Array.isArray(values.providerConnections)
          ? (values.providerConnections as Record<string, unknown>)
          : {};
      const raw =
        connections[providerId] &&
        typeof connections[providerId] === 'object' &&
        !Array.isArray(connections[providerId])
          ? (connections[providerId] as Record<string, unknown>)
          : {};
      const legacyRef = values.providerCredentialRef;
      const credentialRef =
        requestedCredentialRef ||
        credentialVault
          .list()
          .find((credential) => credential.provider === providerId)?.id ||
        (typeof raw.credentialRef === 'string' ? raw.credentialRef : '') ||
        (typeof legacyRef === 'string' ? legacyRef : '');
      let configuration: Record<string, string> = {};
      if (credentialRef) {
        try {
          const profile = credentialVault.resolveProfile(credentialRef);
          if (profile.provider === providerId) {
            configuration = profile.configuration;
          }
        } catch {
          // Health reporting below will expose a missing/unreadable reference.
        }
      }
      const region =
        configuration.region ||
        (typeof raw.region === 'string' && raw.region
          ? raw.region
          : 'cn-beijing');
      const workspaceId = configuration.workspaceId || raw.workspaceId;
      const apiHost =
        providerId === 'openai' || providerId === 'elevenlabs'
          ? configuration.baseUrl
          : configuration.apiHost;
      return {
        credentialRef: credentialRef || null,
        region,
        workspaceId:
          typeof workspaceId === 'string' && workspaceId ? workspaceId : null,
        apiHost: apiHost || null,
      };
    },
    getApprovalPolicy: () => {
      return currentGenerationApproval();
    },
  });
  gameBuild = new StudioGameBuildService({
    projectRoot,
    kernelCliPath,
    runtimeExecutablePath: gameRuntimePath,
    scriptHostPath: projectScriptHostPath,
    engineVersion: app.getVersion(),
  });
  reviewWatcherUpdates = new CoalescedUpdate(() => {
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send(IPC_CHANNELS.changeSetChanged);
  }, 80);
  projectWatcher = watch(
    projectRoot,
    { recursive: true },
    (_event, filename) => {
      if (reviewRecordChange(filename)) {
        reviewWatcherUpdates?.request();
        return;
      }
      const path = externalProjectChange(filename);
      if (!path) return;
      if (projectWatcherTimer) clearTimeout(projectWatcherTimer);
      projectWatcherTimer = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed())
          mainWindow.webContents.send(
            IPC_CHANNELS.workspaceExternalChange,
            path,
          );
      }, 80);
    },
  );
}

function currentGenerationApproval() {
  const state = codexManager.getState();
  return effectiveGenerationApproval(settingsService.get('ai-tools').values, {
    projectRoot: projectManager.activeRoot,
    threadId: state.threadId,
    goalStatus: state.goal?.status ?? null,
    completionRunId: completionRuns?.context()?.completionRunId ?? null,
  });
}

function completionAuthority(): Omit<
  CompletionRun['authority'],
  'capturedAt' | 'policyHash'
> {
  const policy = currentGenerationApproval();
  const approvalMode = policy.mode;
  const limit = policy.autoApproveMaxCny;
  return {
    providerApprovalMode:
      approvalMode === 'auto'
        ? 'pre-authorized'
        : approvalMode === 'budget'
          ? 'known-budget'
          : 'per-call',
    candidateSelectionMode: 'human-required',
    changeSetApprovalMode: 'human-required',
    budgetCurrency: 'CNY',
    budgetLimit: Number.isFinite(limit) ? Math.max(0, limit) : 0,
  };
}

function reconcileCompletionRun(runId: string): CompletionRun | null {
  if (!completionRuns) return null;
  return completionRuns.reconcile(runId, {
    assetJobs: assetJobs?.list() ?? [],
    changeSets: changeSets?.list() ?? [],
  });
}

function requireChangeSets(): StudioChangeSetService {
  if (!changeSets) {
    throw new ProjectError('WORKSPACE_NOT_OPEN', '当前没有打开的项目工作区。');
  }
  return changeSets;
}

function requireAssetJobs(): StudioAssetJobBroker {
  if (!assetJobs) {
    throw new ProjectError('WORKSPACE_NOT_OPEN', '当前没有打开的项目工作区。');
  }
  return assetJobs;
}

function requireGameBuild(): StudioGameBuildService {
  if (!gameBuild) {
    throw new ProjectError('WORKSPACE_NOT_OPEN', '当前没有打开的项目工作区。');
  }
  return gameBuild;
}

// Notifications can arrive once per streamed token, including tool arguments.
// Read the current canonical state at flush time; never reconcile all project
// ChangeSets or flood renderer IPC once for every intermediate snapshot.
function publishCodexState(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(
      IPC_CHANNELS.codexState,
      codexManager.getState(),
    );
  }
}

const codexStateUpdates = new CoalescedUpdate(
  () => {
    const state = codexManager.getState();
    if (completionRuns && state.goal && state.threadId) {
      const run = completionRuns.syncGoal({
        threadId: state.threadId,
        objective: state.goal.objective,
        status: state.goal.status,
        createdAt: state.goal.createdAt,
        updatedAt: state.goal.updatedAt,
        plan:
          state.activeTurn?.mode === 'goal' && state.activeTurn.plan.length > 0
            ? state.activeTurn.plan
            : state.goalPlan,
        authority: completionAuthority(),
      });
      codexManager.setCompletionRunSnapshot(reconcileCompletionRun(run.runId));
    } else {
      codexManager.setCompletionRunSnapshot(null);
    }
    publishCodexState();
  },
  100,
  () => {
    // Presentation failure must not open Electron's blocking uncaught-error
    // dialog. Preserve the last verified run snapshot, publish live turn state,
    // and retry reconciliation on the next invalidation, without a retry loop.
    console.warn(
      '[studio] Completion snapshot refresh failed; retaining the last verified snapshot until the next update.',
    );
    publishCodexState();
  },
);
codexManager.events.on('invalidated', () => codexStateUpdates.request());
app.once('will-quit', () => codexStateUpdates.dispose());

function result<T>(operation: () => T | Promise<T>): Promise<IpcResult<T>> {
  return Promise.resolve()
    .then(operation)
    .then((value) => ({ ok: true as const, value }))
    .catch((error: unknown) => ({
      ok: false as const,
      error: {
        code:
          error instanceof ProjectError
            ? error.code
            : 'STUDIO_OPERATION_FAILED',
        message: error instanceof Error ? error.message : String(error),
        details: error instanceof ProjectError ? error.details : undefined,
      },
    }));
}

function validateSender(event: IpcMainInvokeEvent): void {
  if (event.senderFrame?.url !== pathToFileURL(rendererEntry).href) {
    throw new ProjectError(
      'STUDIO_IPC_SENDER_REJECTED',
      'IPC 请求不是来自受信任的 Studio renderer。',
    );
  }
}

function handle<Args extends unknown[], Value>(
  channel: string,
  operation: (...args: Args) => Value | Promise<Value>,
): void {
  ipcMain.handle(channel, (event, ...args: Args) => {
    validateSender(event);
    return result(() => operation(...args));
  });
}

function sendProjectProgress(progress: ProjectLoadProgress): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.projectProgress, progress);
  }
}

function registerIpc(): void {
  handle(
    IPC_CHANNELS.appGetInfo,
    (): AppInfo => ({
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      electron: process.versions.electron,
      rendererRecovery,
    }),
  );
  handle(IPC_CHANNELS.windowGetState, () => studioWindowState());
  handle(IPC_CHANNELS.windowMinimize, () => {
    mainWindow?.minimize();
    return studioWindowState();
  });
  handle(IPC_CHANNELS.windowToggleMaximize, () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
    return studioWindowState();
  });
  handle(IPC_CHANNELS.windowClose, () => {
    mainWindow?.close();
    return null;
  });
  handle(IPC_CHANNELS.windowSetCloseState, (state: StudioCloseState) => {
    closeState = {
      dirtyDocuments: Math.max(0, Number(state.dirtyDocuments) || 0),
      runtimeActive: Boolean(state.runtimeActive),
      buildActive: Boolean(state.buildActive),
      agentActive: Boolean(state.agentActive),
    };
    return null;
  });
  handle(IPC_CHANNELS.projectChooseParent, async () => {
    const choice = await dialog.showOpenDialog({
      title: '选择游戏项目父目录',
      properties: ['openDirectory', 'createDirectory'],
    });
    const path = choice.canceled ? null : resolve(choice.filePaths[0]);
    if (path) approvedParents.add(path);
    return path;
  });
  handle(IPC_CHANNELS.projectChooseExisting, async () => {
    const choice = await dialog.showOpenDialog({
      title: '打开 AI Game 项目',
      properties: ['openDirectory'],
    });
    const path = choice.canceled ? null : resolve(choice.filePaths[0]);
    if (path) approvedProjects.add(path);
    return path;
  });
  handle<[CreateProjectRequest], ProjectSummary>(
    IPC_CHANNELS.projectCreate,
    async (request) => {
      const parent = resolve(request.parentDirectory);
      sendProjectProgress({
        operation: 'create',
        stage: 'validating',
        message: '正在校验项目名称与目标目录…',
        path: parent,
      });
      if (!approvedParents.has(parent)) {
        throw new ProjectError(
          'PROJECT_PARENT_NOT_APPROVED',
          '请先通过系统目录选择器授权项目父目录。',
        );
      }
      const project = projectManager.createProject(request);
      approvedProjects.add(project.root);
      sendProjectProgress({
        operation: 'create',
        stage: 'workspace',
        message: '正在建立引擎工作区并索引项目文件…',
        path: project.root,
      });
      openWorkspace(project.root);
      applyAiToolSettings();
      sendProjectProgress({
        operation: 'create',
        stage: 'codex',
        message: '正在连接项目 Codex 与 Engine MCP…',
        path: project.root,
      });
      await codexManager.start(project.root);
      sendProjectProgress({
        operation: 'create',
        stage: 'finalizing',
        message: '正在恢复 Studio 布局与项目状态…',
        path: project.root,
      });
      applyAgentSettings();
      return project;
    },
  );
  handle(IPC_CHANNELS.projectOpen, async (path: string) => {
    const root = resolve(path);
    sendProjectProgress({
      operation: 'open',
      stage: 'validating',
      message: '正在校验项目格式并取得写入锁…',
      path: root,
    });
    const recent = projectManager.listRecent().map((item) => resolve(item));
    if (!approvedProjects.has(root) && !recent.includes(root)) {
      throw new ProjectError(
        'PROJECT_PATH_NOT_APPROVED',
        '请先通过系统目录选择器选择项目。',
      );
    }
    const project = projectManager.openProject(root);
    sendProjectProgress({
      operation: 'open',
      stage: 'workspace',
      message: '正在载入引擎工作区、资源与场景索引…',
      path: project.root,
    });
    openWorkspace(project.root);
    applyAiToolSettings();
    sendProjectProgress({
      operation: 'open',
      stage: 'codex',
      message: '正在连接项目 Codex 与 Engine MCP…',
      path: project.root,
    });
    await codexManager.start(project.root);
    sendProjectProgress({
      operation: 'open',
      stage: 'finalizing',
      message: '正在恢复上次的文档与面板布局…',
      path: project.root,
    });
    applyAgentSettings();
    return project;
  });
  handle(IPC_CHANNELS.projectClose, async () => {
    reviewWatcherUpdates?.dispose();
    reviewWatcherUpdates = null;
    await codexManager.stop();
    workspace?.dispose();
    projectWatcher?.close();
    projectWatcher = null;
    workspace = null;
    changeSets = null;
    assetJobs = null;
    gameBuild = null;
    completionRuns = null;
    projectManager.closeProject();
    return null;
  });
  handle(IPC_CHANNELS.projectRecent, () => projectManager.listRecent());
  handle(IPC_CHANNELS.projectDoctor, () => projectManager.doctor());
  handle(IPC_CHANNELS.projectCurrent, () => projectManager.getActiveProject());
  handle(IPC_CHANNELS.settingsGet, (scope: StudioSettingsScope) =>
    settingsService.get(scope),
  );
  handle(
    IPC_CHANNELS.settingsUpdate,
    async (scope: StudioSettingsScope, patch: Record<string, unknown>) => {
      const result = settingsService.update(scope, patch);
      if (scope === 'agent') applyAgentSettings();
      if (scope === 'ai-tools') {
        await codexManager.applyIntegrationPreferences({
          mcpEnabled: result.values.mcpEnabled !== false,
          projectSkillsEnabled: result.values.projectSkillsEnabled !== false,
        });
      }
      return result;
    },
  );
  handle(IPC_CHANNELS.settingsReset, async (scope: StudioSettingsScope) => {
    const reset = settingsService.reset(scope);
    if (scope === 'agent') applyAgentSettings();
    if (scope === 'ai-tools')
      await codexManager.applyIntegrationPreferences({
        mcpEnabled: reset.values.mcpEnabled !== false,
        projectSkillsEnabled: reset.values.projectSkillsEnabled !== false,
      });
    return reset;
  });
  handle(IPC_CHANNELS.credentialList, () => credentialVault.list());
  handle(IPC_CHANNELS.credentialProviderList, () =>
    structuredClone(CREDENTIAL_PROVIDER_DEFINITIONS),
  );
  handle(
    IPC_CHANNELS.credentialSet,
    (input: Parameters<CredentialVaultService['set']>[0]) =>
      credentialVault.set(input),
  );
  handle(IPC_CHANNELS.credentialRemove, (id: string) =>
    credentialVault.remove(id),
  );
  handle(
    IPC_CHANNELS.credentialModelDiscover,
    (input: Parameters<ProviderModelCatalogService['discover']>[0]) =>
      providerModelCatalog.discover(input),
  );
  handle(IPC_CHANNELS.workspaceSnapshot, () => requireWorkspace().snapshot());
  handle(IPC_CHANNELS.workspaceReadText, (path: string) =>
    requireWorkspace().readText(path),
  );
  handle(IPC_CHANNELS.workspaceGetState, () =>
    requireWorkspace().getWorkspaceState(),
  );
  handle(IPC_CHANNELS.workspaceSetState, (state: StudioWorkspaceState) =>
    requireWorkspace().setWorkspaceState(state),
  );
  handle(
    IPC_CHANNELS.workspaceExecute,
    (command: string, input: Record<string, unknown> = {}) =>
      requireWorkspace().execute(command, input),
  );
  handle(
    IPC_CHANNELS.workspaceRuntimeInput,
    (input: Record<string, unknown> = {}) =>
      requireWorkspace().queueRuntimeInput(input),
  );
  handle(IPC_CHANNELS.workspaceImportAsset, async () => {
    const choice = await dialog.showOpenDialog({
      title: '导入项目资源',
      properties: ['openFile'],
      filters: [
        {
          name: 'Game assets',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg', 'wav', 'ogg'],
        },
      ],
    });
    if (choice.canceled) return null;
    return requireWorkspace().importAsset(choice.filePaths[0]);
  });
  handle(IPC_CHANNELS.workspaceAssetPreview, (path: string) =>
    requireWorkspace().readAssetPreview(path),
  );
  handle(IPC_CHANNELS.assetJobList, () => requireAssetJobs().list());
  handle(
    IPC_CHANNELS.assetJobSubmit,
    (input: Parameters<StudioAssetJobBroker['submit']>[0]) =>
      requireAssetJobs().submit(input),
  );
  handle(IPC_CHANNELS.assetJobRun, (id: string) =>
    requireAssetJobs().approveAndRun(id),
  );
  handle(IPC_CHANNELS.assetJobRetry, (id: string) =>
    requireAssetJobs().approveAndRetry(id),
  );
  handle(IPC_CHANNELS.assetJobCancel, (id: string) =>
    requireAssetJobs().cancel(id),
  );
  handle(IPC_CHANNELS.assetProviderList, () => requireAssetJobs().providers());
  handle(
    IPC_CHANNELS.assetProviderEstimate,
    (input: Parameters<StudioAssetJobBroker['estimate']>[0]) =>
      requireAssetJobs().estimate(input),
  );
  handle(IPC_CHANNELS.assetJobSelect, (id: string, candidateId: string) =>
    requireAssetJobs().select(id, candidateId),
  );
  handle(
    IPC_CHANNELS.assetCandidatePreview,
    (id: string, candidateId: string) => {
      if (candidateReviewGateProject) {
        const key = `${id}/${candidateId}`;
        candidatePreviewGateCalls.set(
          key,
          (candidatePreviewGateCalls.get(key) ?? 0) + 1,
        );
      }
      return requireAssetJobs().previewCandidate(id, candidateId);
    },
  );
  handle(
    IPC_CHANNELS.assetCandidateReject,
    (id: string, candidateId: string, reason: string) =>
      requireAssetJobs().rejectCandidate(id, candidateId, reason),
  );
  handle(
    IPC_CHANNELS.assetCandidateRegenerate,
    async (id: string, candidateId: string, instruction: string) => {
      const job = requireAssetJobs().regenerate(id, candidateId, instruction);
      return requireAssetJobs().runWithPolicy(job.id);
    },
  );
  handle(
    IPC_CHANNELS.assetJobReconcile,
    (id: string, outcome: 'confirmed-not-run' | 'confirmed-run') =>
      requireAssetJobs().reconcileAmbiguousTimeout(id, outcome),
  );
  handle(IPC_CHANNELS.gameBuild, (profile: 'development' | 'release') =>
    requireGameBuild().execute('build.windows', { profile }),
  );
  handle(
    IPC_CHANNELS.gameBuildVerify,
    (profile: 'development' | 'release', expectedZipSha256: string) =>
      requireGameBuild().verifyPackage(profile, expectedZipSha256),
  );
  handle(
    IPC_CHANNELS.gameBuildReadReport,
    (profile: 'development' | 'release') =>
      requireGameBuild().execute('build.read_report', { profile }),
  );
  handle(IPC_CHANNELS.changeSetList, () => requireChangeSets().list());
  handle(
    IPC_CHANNELS.changeSetApprove,
    (id: string, selectedOperationIds: string[]) =>
      requireChangeSets().approve(id, selectedOperationIds),
  );
  handle(
    IPC_CHANNELS.changeSetReject,
    (id: string, feedback?: { proposalHash: string; reason: string }) =>
      requireChangeSets().reject(id, feedback),
  );
  handle(
    IPC_CHANNELS.changeSetRejectionFeedback,
    (id: string, feedback: { proposalHash: string; reason: string }) =>
      requireChangeSets().recordRejectionFeedback(id, feedback),
  );
  handle(IPC_CHANNELS.changeSetApply, (id: string) =>
    requireChangeSets().apply(id),
  );
  handle(IPC_CHANNELS.changeSetTest, (id: string) =>
    requireChangeSets().test(id),
  );
  handle(IPC_CHANNELS.changeSetRollback, (id: string) =>
    requireChangeSets().rollback(id),
  );
  handle(IPC_CHANNELS.codexGetState, () => codexManager.getState());
  handle(IPC_CHANNELS.codexLoadOlderHistory, () =>
    codexManager.loadOlderHistory(),
  );
  handle(IPC_CHANNELS.codexLogin, async () => {
    const login = await codexManager.loginChatGpt();
    const url = new URL(login.authUrl);
    const trustedHost =
      url.hostname === 'chatgpt.com' ||
      url.hostname.endsWith('.chatgpt.com') ||
      url.hostname === 'openai.com' ||
      url.hostname.endsWith('.openai.com');
    if (url.protocol !== 'https:' || !trustedHost) {
      throw new ProjectError(
        'CODEX_AUTH_URL_REJECTED',
        'Codex 返回了不受信任的登录地址。',
      );
    }
    await shell.openExternal(url.href);
    return codexManager.getState();
  });
  handle(IPC_CHANNELS.codexLogout, () => codexManager.logout());
  handle(IPC_CHANNELS.codexStartTurn, (mode: CodexTurnMode, prompt: string) => {
    if (!['ask', 'plan', 'agent', 'goal'].includes(mode)) {
      throw new ProjectError('CODEX_MODE_INVALID', 'Codex 模式无效。');
    }
    return codexManager.startTurn(mode, prompt);
  });
  handle(IPC_CHANNELS.codexSetModel, (model: string) =>
    codexManager.setModel(model),
  );
  handle(IPC_CHANNELS.codexSetReasoningEffort, (effort: string) =>
    codexManager.setReasoningEffort(effort),
  );
  handle(
    IPC_CHANNELS.codexSetPermission,
    (permission: 'read-only' | 'on-request') => {
      if (!['read-only', 'on-request'].includes(permission))
        throw new ProjectError(
          'CODEX_PERMISSION_INVALID',
          'Codex 权限模式无效。',
        );
      return codexManager.setPermission(permission);
    },
  );
  handle(IPC_CHANNELS.codexRetryTurn, () => codexManager.retryTurn());
  handle(IPC_CHANNELS.codexCreateConversation, () =>
    codexManager.createConversation(),
  );
  handle(IPC_CHANNELS.codexSelectConversation, (threadId: string) =>
    codexManager.selectConversation(threadId),
  );
  handle(
    IPC_CHANNELS.codexSetGoal,
    (objective: string, tokenBudget?: number | null) =>
      codexManager.setGoal(objective, tokenBudget),
  );
  handle(
    IPC_CHANNELS.codexSetGoalStatus,
    (
      status:
        | 'active'
        | 'paused'
        | 'blocked'
        | 'usageLimited'
        | 'budgetLimited'
        | 'complete',
    ) => codexManager.setGoalStatus(status),
  );
  handle(IPC_CHANNELS.codexStopGoal, async () => {
    const state = await codexManager.stopGoal();
    if (state.threadId) {
      const run = completionRuns?.latestForThread(state.threadId);
      if (run && !['stopped', 'succeeded', 'failed'].includes(run.status)) {
        codexManager.setCompletionRunSnapshot(
          completionRuns?.stop(run.runId) ?? null,
        );
      }
    }
    return state;
  });
  handle(IPC_CHANNELS.codexClearGoal, async () => {
    const before = codexManager.getState();
    const run = before.threadId
      ? completionRuns?.latestForThread(before.threadId)
      : null;
    if (run && !['stopped', 'succeeded', 'failed'].includes(run.status)) {
      throw new ProjectError(
        'COMPLETION_RUN_NOT_TERMINAL',
        '请先停止或完成 Goal，再从 Copilot 面板移除。',
      );
    }
    const state = await codexManager.clearGoal();
    if (run) completionRuns?.removePresentation(run.runId);
    return state;
  });
  handle(IPC_CHANNELS.codexInterruptTurn, () => codexManager.interruptTurn());
  handle(
    IPC_CHANNELS.codexDecideApproval,
    (id: string | number, decision: 'accept' | 'decline') => {
      if (decision !== 'accept' && decision !== 'decline') {
        throw new ProjectError(
          'CODEX_APPROVAL_INVALID',
          'Codex 审批决策无效。',
        );
      }
      return codexManager.decideApproval(id, decision);
    },
  );
}

async function createWindow(): Promise<void> {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    },
  );
  if (p15QualityGateParent && !projectManager.activeRoot) {
    const project = projectManager.createProject({
      parentDirectory: resolve(p15QualityGateParent),
      name: 'P15 Quality Gate',
      preset: 'empty-2d',
      initializeGit: false,
    });
    openWorkspace(project.root);
  }
  const requestedProject =
    process.env.AIGAME_STUDIO_OPEN_PROJECT ??
    p23GateProject ??
    p30GateProject ??
    candidateReviewGateProject;
  if (requestedProject && !projectManager.activeRoot) {
    const root = resolve(requestedProject);
    approvedProjects.add(root);
    const project = projectManager.openProject(root);
    openWorkspace(project.root);
    if (!p23GateProject && !p30GateProject && !candidateReviewGateProject) {
      applyAiToolSettings();
      await codexManager.start(project.root);
      applyAgentSettings();
    }
  }
  const persistedWindow = readWindowState();
  const window = new BrowserWindow({
    ...(persistedWindow?.bounds ?? { width: 1440, height: 920 }),
    minWidth: 960,
    minHeight: 640,
    frame: false,
    show: !smokeMode,
    backgroundColor: '#080b11',
    webPreferences: {
      preload: preloadEntry,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  mainWindow = window;
  window.webContents.on('render-process-gone', (_event, details) => {
    if (window.isDestroyed() || details.reason === 'clean-exit') return;
    rendererRecovery = {
      count: (rendererRecovery?.count ?? 0) + 1,
      reason: details.reason,
      recoveredAt: new Date().toISOString(),
    };
    rendererRecoveryTask = window.loadFile(rendererEntry).then(() => undefined);
  });
  if (persistedWindow?.maximized) window.maximize();
  window.on('maximize', () => publishWindowState(window));
  window.on('unmaximize', () => publishWindowState(window));
  window.on('enter-full-screen', () => publishWindowState(window));
  window.on('leave-full-screen', () => publishWindowState(window));
  window.on('close', (event) => {
    if (allowWindowClose) {
      writeWindowState(window);
      return;
    }
    const risks = [
      closeState.dirtyDocuments > 0
        ? `${closeState.dirtyDocuments} 个未保存文档`
        : null,
      closeState.runtimeActive ? '正在运行的游戏' : null,
      closeState.buildActive ? '正在执行的构建' : null,
      closeState.agentActive ? '正在执行的 Agent 任务' : null,
    ].filter((value): value is string => Boolean(value));
    if (risks.length === 0) {
      writeWindowState(window);
      return;
    }
    event.preventDefault();
    const decision = dialog.showMessageBoxSync(window, {
      type: 'warning',
      title: '关闭 AI Game Studio？',
      message: '仍有工作正在进行',
      detail: `${risks.join('、')}。关闭可能中断工作；未保存文档不会自动丢弃。`,
      buttons: ['返回 Studio', '仍然关闭'],
      defaultId: 0,
      cancelId: 0,
    });
    if (decision === 1) {
      allowWindowClose = true;
      writeWindowState(window);
      window.close();
    }
  });
  window.once('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== pathToFileURL(rendererEntry).href) event.preventDefault();
  });
  await window.loadFile(rendererEntry);

  if (p15QualityGateParent) {
    const gate = await runP15QualityGate(window);
    const feedback = await verifyTestFeedback(
      window,
      projectManager.activeRoot!,
      applicationRoot,
      { kernelCliPath, scriptHostPath: projectScriptHostPath },
    );
    const reviewFeedback = await verifyChangeReview(
      window,
      projectManager.activeRoot!,
      applicationRoot,
      kernelCliPath,
    );
    const planStatus = await verifyPlanStatus(
      window,
      projectManager.activeRoot!,
      applicationRoot,
    );
    projectManager.closeProject();
    quitWithCode(
      gate.ok && feedback.ok && reviewFeedback.ok && planStatus.ok ? 0 : 1,
    );
  } else if (p20GateParent) {
    const project = projectManager.createProject({
      parentDirectory: resolve(p20GateParent),
      name: 'P20 Clean Studio Gate',
      preset: 'empty-2d',
      initializeGit: false,
    });
    openWorkspace(project.root);
    applyAiToolSettings();
    const doctor = projectManager.doctor();
    const codex = await codexManager.start(project.root);
    const created = requireWorkspace().execute('scene.object.create', {
      scene: project.manifest.entry.scene,
      name: 'Clean Gate Object',
    }).data as { id: string };
    requireWorkspace().execute('scene.component.add', {
      scene: project.manifest.entry.scene,
      objectId: created.id,
      type: 'render:shape2d',
    });
    const validation = requireWorkspace().execute('project.validate').data as {
      ok?: boolean;
    };
    const runtime = requireWorkspace().execute('runtime.start', {
      ticks: 3,
      seed: 20260902,
    }).data as { status?: string };
    const build = requireGameBuild().execute('release.package');
    const player = spawnSync(
      join(build.outputDirectory, build.executable),
      ['--verify'],
      {
        cwd: project.root,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 30_000,
      },
    );
    let playerResult: { ok?: boolean } = {};
    try {
      playerResult = JSON.parse(player.stdout) as { ok?: boolean };
    } catch {
      playerResult = {};
    }
    const gate = {
      ok:
        doctor.ok &&
        codex.status === 'ready' &&
        codex.version === '0.152.1' &&
        validation.ok === true &&
        runtime.status === 'completed' &&
        player.status === 0 &&
        playerResult.ok === true,
      doctor: doctor.ok,
      codex: codex.status,
      codexVersion: codex.version,
      account: codex.account?.type ?? null,
      projectThread: Boolean(codex.threadId),
      semanticAuthoring: validation.ok === true,
      sandboxRuntime: runtime.status,
      standalonePlayer: playerResult.ok === true,
    };
    console.log(`[p20-clean-gate] ${JSON.stringify(gate)}`);
    await codexManager.stop();
    projectManager.closeProject();
    quitWithCode(gate.ok ? 0 : 1);
  } else if (p23GateProject) {
    const gate = await runP23QualityGate(window);
    workspace?.dispose();
    projectManager.closeProject();
    quitWithCode(gate.ok ? 0 : 1);
  } else if (p30GateProject) {
    const gate = await runP30ObservationGate(window);
    workspace?.dispose();
    projectManager.closeProject();
    quitWithCode(gate.ok ? 0 : 1);
  } else if (candidateReviewGateProject) {
    const gate = await runCandidateReviewGate(window);
    workspace?.dispose();
    projectManager.closeProject();
    quitWithCode(gate.ok ? 0 : 1);
  } else if (smokeMode) {
    const probe = (await window.webContents.executeJavaScript(`({
      hasBridge: typeof window.aiGameStudio === 'object',
      bridgeKeys: Object.keys(window.aiGameStudio ?? {}).sort(),
      windowControls: [...document.querySelectorAll('.window-controls button')].map((button) => button.getAttribute('aria-label')),
      projectPresets: [...document.querySelectorAll('.preset-grid button strong')].map((element) => element.textContent),
      hasRequire: typeof globalThis.require !== 'undefined',
      hasNodeProcess: typeof globalThis.process !== 'undefined'
    })`)) as {
      hasBridge: boolean;
      bridgeKeys: string[];
      windowControls: Array<string | null>;
      projectPresets: Array<string | null>;
      hasRequire: boolean;
      hasNodeProcess: boolean;
    };
    const ok =
      probe.hasBridge &&
      probe.bridgeKeys.join(',') ===
        'app,codex,projects,settings,window,workspace' &&
      probe.windowControls.join(',') === '最小化窗口,最大化窗口,关闭窗口' &&
      probe.projectPresets.join(',') === 'Empty,Empty 2D,Empty 3D' &&
      !probe.hasRequire &&
      !probe.hasNodeProcess;
    console.log(`[electron-smoke] ${JSON.stringify({ ok, ...probe })}`);
    quitWithCode(ok ? 0 : 1);
  }
}

void app
  .whenReady()
  .then(async () => {
    app.setAppUserModelId('dev.aigamekernel.studio');
    migrateLegacyProviderConnections(settingsService, credentialVault);
    if (!smokeMode || p20GateParent) await startAssetBrokerBridge();
    registerIpc();
    await createWindow();
  })
  .catch((error: unknown) => {
    console.error(error);
    app.exit(1);
  });

app.on('before-quit', () => {
  void codexManager.stop();
  stopAssetBrokerBridge();
  projectManager.closeProject();
});
app.on('window-all-closed', () => {
  void codexManager.stop();
  projectManager.closeProject();
  if (process.platform !== 'darwin') app.quit();
});
