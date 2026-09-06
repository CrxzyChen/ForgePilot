import {
  Box,
  Boxes,
  ChevronRight,
  CircleAlert,
  Clock3,
  FolderOpen,
  Gamepad2,
  Layers3,
  LoaderCircle,
  Plus,
  Settings,
  Sparkles,
  RotateCcw,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import type {
  ProjectPreset,
  ProjectSummary,
} from '../../project/project-types.ts';
import type { WorkspaceSnapshot } from '../../workspace/workspace-types.ts';
import type { AppInfo, IpcResult, ProjectLoadProgress } from '../contracts.ts';
import type { CodexStudioState } from '../codex-process-manager.ts';
import { WindowControls } from './WindowControls.tsx';
import { Workbench } from './Workbench.tsx';

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

const presets: Array<{
  id: ProjectPreset;
  name: string;
  detail: string;
  icon: typeof Box;
}> = [
  {
    id: 'empty',
    name: 'Empty',
    detail: '从通用项目开始，稍后添加 2D、3D、UI 或扩展能力。',
    icon: Box,
  },
  {
    id: 'empty-2d',
    name: 'Empty 2D',
    detail: '通用项目 + 最小 2D 能力，不包含任何游戏玩法。',
    icon: Layers3,
  },
  {
    id: 'empty-3d',
    name: 'Empty 3D',
    detail: '通用项目 + 最小 3D 能力，不包含任何游戏玩法。',
    icon: Boxes,
  },
];

export function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [name, setName] = useState('Untitled Game');
  const [preset, setPreset] = useState<ProjectPreset>('empty');
  const [parentDirectory, setParentDirectory] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [codex, setCodex] = useState<CodexStudioState | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [section, setSection] = useState<'new' | 'open' | 'examples'>('new');
  const [busy, setBusy] = useState(false);
  const [projectProgress, setProjectProgress] =
    useState<ProjectLoadProgress | null>(null);
  const [operationSeconds, setOperationSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.aiGameStudio.app
      .getInfo()
      .then(unwrap)
      .then(setAppInfo)
      .catch((reason) => setError(String(reason)));
    void window.aiGameStudio.projects
      .recent()
      .then(unwrap)
      .then(setRecent)
      .catch((reason) => setError(String(reason)));
    void window.aiGameStudio.projects.current().then((result) => {
      if (!result.ok || !result.value) return;
      setProject(result.value);
      void window.aiGameStudio.workspace
        .snapshot()
        .then(unwrap)
        .then(setWorkspace)
        .catch((reason) => setError(String(reason)));
    });
    void window.aiGameStudio.codex
      .getState()
      .then(unwrap)
      .then(setCodex)
      .catch((reason) => setError(String(reason)));
    return window.aiGameStudio.codex.onState(setCodex);
  }, []);

  useEffect(
    () => window.aiGameStudio.projects.onProgress(setProjectProgress),
    [],
  );

  useEffect(() => {
    if (!busy) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setOperationSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  const chooseParent = async () => {
    const path = unwrap(
      await window.aiGameStudio.projects.chooseParentDirectory(),
    );
    if (path) setParentDirectory(path);
    return path;
  };

  const createProject = async () => {
    if (busy) return;
    setOperationSeconds(0);
    setBusy(true);
    setError(null);
    setProjectProgress({
      operation: 'create',
      stage: parentDirectory ? 'validating' : 'choosing',
      message: parentDirectory ? '正在准备项目目录…' : '等待选择项目保存位置…',
      path: parentDirectory,
    });
    try {
      const parent = parentDirectory ?? (await chooseParent());
      if (!parent) return;
      const created = unwrap(
        await window.aiGameStudio.projects.create({
          parentDirectory: parent,
          name,
          preset,
        }),
      );
      setProject(created);
      setWorkspace(unwrap(await window.aiGameStudio.workspace.snapshot()));
      setRecent(unwrap(await window.aiGameStudio.projects.recent()));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
      setProjectProgress(null);
    }
  };

  const openProject = async (path?: string) => {
    if (busy) return;
    setOperationSeconds(0);
    setBusy(true);
    setError(null);
    setProjectProgress({
      operation: 'open',
      stage: path ? 'validating' : 'choosing',
      message: path ? '正在准备打开项目…' : '等待选择项目目录…',
      path: path ?? null,
    });
    try {
      const selected =
        path ??
        unwrap(await window.aiGameStudio.projects.chooseExistingProject());
      if (!selected) return;
      setProjectProgress({
        operation: 'open',
        stage: 'validating',
        message: '已选择目录，正在校验项目…',
        path: selected,
      });
      const opened = unwrap(await window.aiGameStudio.projects.open(selected));
      setProject(opened);
      setWorkspace(unwrap(await window.aiGameStudio.workspace.snapshot()));
      setRecent(unwrap(await window.aiGameStudio.projects.recent()));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
      setProjectProgress(null);
    }
  };

  const closeProject = async () => {
    unwrap(await window.aiGameStudio.projects.close());
    setProject(null);
    setWorkspace(null);
  };

  if (project && workspace) {
    return (
      <>
        {appInfo?.rendererRecovery && (
          <output className="renderer-recovery-notice">
            <RotateCcw />
            <span>
              Renderer 已从异常退出中恢复；项目和已保存的工作区状态已重新载入。
            </span>
            <button
              type="button"
              aria-label="关闭恢复提示"
              onClick={() =>
                setAppInfo((current) =>
                  current ? { ...current, rendererRecovery: null } : current,
                )
              }
            >
              <X />
            </button>
          </output>
        )}
        <Workbench
          key={project.root}
          project={project}
          initialWorkspace={workspace}
          codex={codex}
          onClose={closeProject}
          onError={setError}
        />
      </>
    );
  }

  return (
    <main className="start-shell">
      <header className="studio-titlebar">
        <div className="titlebar-brand">
          <span className="brand-mark">AG</span>
          <strong>AI Game Studio</strong>
        </div>
        <span className="titlebar-caption">项目管理器</span>
        <WindowControls />
      </header>

      <div className="start-layout">
        <nav className="start-nav" aria-label="项目管理器">
          <div className="start-logo">
            <Sparkles />
            <div>
              <strong>AI Game Studio</strong>
              <span>0.2 Alpha · Round 03</span>
            </div>
          </div>
          <button
            className={section === 'new' ? 'active' : ''}
            onClick={() => setSection('new')}
          >
            <Plus /> 新建项目
          </button>
          <button
            className={section === 'open' ? 'active' : ''}
            onClick={() => setSection('open')}
          >
            <FolderOpen /> 打开与最近项目
          </button>
          <button
            className={section === 'examples' ? 'active' : ''}
            onClick={() => setSection('examples')}
          >
            <Gamepad2 /> 示例
          </button>
          <div className="start-version">
            <Settings />
            <span>Studio {appInfo?.version ?? '…'}</span>
            <small>Electron {appInfo?.electron ?? '…'}</small>
          </div>
        </nav>

        <section className="start-content" aria-busy={busy}>
          {busy && projectProgress && (
            <output
              className="project-operation-overlay"
              aria-live="assertive"
              aria-label={
                projectProgress.operation === 'open'
                  ? '正在打开项目'
                  : '正在创建项目'
              }
            >
              <div className="project-operation-card">
                <LoaderCircle className="project-operation-spinner" />
                <div>
                  <strong>
                    {projectProgress.operation === 'open'
                      ? '正在打开项目'
                      : '正在创建项目'}
                  </strong>
                  <p>{projectProgress.message}</p>
                  {projectProgress.path && (
                    <small title={projectProgress.path}>
                      {projectProgress.path}
                    </small>
                  )}
                </div>
                <div
                  className="project-operation-progress"
                  data-stage={projectProgress.stage}
                  aria-hidden="true"
                >
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <em>
                  已等待 {operationSeconds} 秒 · 首次连接 Codex
                  或大型项目可能需要一些时间，请勿重复点击。
                </em>
              </div>
            </output>
          )}
          {error && (
            <div className="studio-error" role="alert">
              <CircleAlert /> {error}
            </div>
          )}

          {section === 'new' && (
            <div className="start-page">
              <header>
                <span>NEW PROJECT</span>
                <h1>从能力开始，不从游戏类型开始</h1>
                <p>
                  项目同时是 Studio 工作区和 Codex 工作目录。Tank
                  等完整玩法只属于示例。
                </p>
              </header>
              <div className="preset-grid">
                {presets.map((candidate) => {
                  const Icon = candidate.icon;
                  return (
                    <button
                      key={candidate.id}
                      className={preset === candidate.id ? 'selected' : ''}
                      onClick={() => setPreset(candidate.id)}
                    >
                      <Icon />
                      <strong>{candidate.name}</strong>
                      <span>{candidate.detail}</span>
                    </button>
                  );
                })}
              </div>
              <div className="create-form">
                <label>
                  项目名称
                  <input
                    value={name}
                    maxLength={80}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label>
                  保存位置
                  <button
                    className="directory-picker"
                    onClick={() => void chooseParent()}
                  >
                    <FolderOpen /> {parentDirectory ?? '选择项目父目录'}
                  </button>
                </label>
                <button
                  className="start-primary"
                  disabled={busy || name.trim().length === 0}
                  onClick={() => void createProject()}
                >
                  {busy ? '正在初始化项目…' : '创建项目'} <ChevronRight />
                </button>
              </div>
            </div>
          )}

          {section === 'open' && (
            <div className="start-page">
              <header>
                <span>OPEN PROJECT</span>
                <h1>继续你的游戏项目</h1>
                <p>Studio 会校验项目格式、取得单写入锁并恢复上次工作区。</p>
              </header>
              <button
                className="open-project-action"
                disabled={busy}
                onClick={() => void openProject()}
              >
                {busy ? <LoaderCircle /> : <FolderOpen />}
                {busy ? projectProgress?.message : '选择项目目录'}
              </button>
              <div className="recent-projects">
                <h2>
                  <Clock3 /> 最近项目
                </h2>
                {recent.length === 0 && <p>还没有最近项目。</p>}
                {recent.map((path) => (
                  <button
                    key={path}
                    disabled={busy}
                    onClick={() => void openProject(path)}
                  >
                    <span>{path.split(/[\\/]/u).at(-1)}</span>
                    <small>{path}</small>
                    <ChevronRight />
                  </button>
                ))}
              </div>
            </div>
          )}

          {section === 'examples' && (
            <div className="start-page">
              <header>
                <span>EXAMPLES</span>
                <h1>学习和回归用项目</h1>
                <p>
                  示例可以复制为普通项目，但不会改变 Studio 的通用产品边界。
                </p>
              </header>
              <article className="example-card">
                <Gamepad2 />
                <div>
                  <strong>Pong 2D · Collect Room 3D · Tank Arena</strong>
                  <p>
                    三者都是由 Empty 项目和通用语义命令生成的普通项目；Tank
                    仅承担旧能力回归。
                  </p>
                </div>
                <span>ROUND 03 · 已迁移</span>
              </article>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
