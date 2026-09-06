'use client';

import {
  Activity,
  Bot,
  Box,
  Braces,
  Check,
  ChevronRight,
  CirclePause,
  CirclePlay,
  Clock3,
  Code2,
  Database,
  FlaskConical,
  GitCompare,
  Layers3,
  MousePointer2,
  PanelLeft,
  RotateCcw,
  Send,
  ShieldCheck,
  SkipForward,
  Sparkles,
  TerminalSquare,
  UserCheck,
  X,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useReducer, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  initialStudioState,
  studioReducer,
  type StudioActivity,
  type StudioOperation,
} from '@/lib/studio-model';

const CONTROL_URL = 'http://127.0.0.1:4617';

const activityIcons: Record<StudioActivity['kind'], typeof Bot> = {
  agent: Bot,
  validation: ShieldCheck,
  human: UserCheck,
  runtime: Zap,
  system: TerminalSquare,
};

const statusLabels = {
  idle: '等待任务',
  planned: '等待审查',
  approved: '已批准',
  applied: '已应用',
  verified: '验证通过',
  rolledBack: '已回滚',
} as const;

type RpcResponse<Result> =
  | { id: number; result: Result }
  | { id: number; error: { code: string; message: string } };

async function rpc<Result>(method: string, params: unknown): Promise<Result> {
  const response = await fetch(`${CONTROL_URL}/rpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: Date.now(), method, params }),
  });
  const body = (await response.json()) as RpcResponse<Result>;
  if ('error' in body)
    throw new Error(`${body.error.code}: ${body.error.message}`);
  return body.result;
}

export default function StudioPage() {
  const [state, dispatch] = useReducer(studioReducer, initialStudioState);
  const [busy, setBusy] = useState(false);
  const approvalToken = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 700);
    void fetch(`${CONTROL_URL}/health`, { signal: controller.signal })
      .then((response) => {
        if (response.ok) dispatch({ type: 'set-mode', mode: 'local' });
      })
      .catch(() => {})
      .finally(() => window.clearTimeout(timeout));
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, []);

  const invoke = async (
    action: 'plan' | 'approve' | 'apply' | 'run' | 'rollback',
  ) => {
    if (state.mode === 'demo') {
      dispatch({ type: action });
      return;
    }
    setBusy(true);
    dispatch({ type: 'error', message: null });
    try {
      if (action === 'plan') {
        const change = await rpc<{
          id: string;
          preview: Array<{
            op: StudioOperation['op'];
            path: string;
            before?: unknown;
            after?: unknown;
          }>;
        }>('ai.change.request', {
          request: state.prompt,
          projectPath:
            'examples/tank-legacy-regression/examples/minimal.game.json',
        });
        dispatch({
          type: 'plan',
          changeId: change.id,
          operations: change.preview.map((operation, index) => ({
            id: `operation:${index}`,
            selected: true,
            ...operation,
          })),
        });
      } else if (action === 'approve' && state.changeId) {
        const grant = await rpc<{ token: string }>('change.approve', {
          changeId: state.changeId,
        });
        approvalToken.current = grant.token;
        dispatch({ type: 'approve' });
      } else if (
        action === 'apply' &&
        state.changeId &&
        approvalToken.current
      ) {
        await rpc('change.apply', {
          changeId: state.changeId,
          approvalToken: approvalToken.current,
        });
        dispatch({ type: 'apply' });
      } else if (action === 'run') {
        await rpc('simulation.run', {
          projectPath:
            'examples/tank-legacy-regression/examples/minimal.game.json',
          inputPath:
            'examples/tank-legacy-regression/fixtures/replay/movement.input.json',
        });
        dispatch({ type: 'run' });
      } else if (action === 'rollback' && state.changeId) {
        await rpc('change.rollback', { changeId: state.changeId });
        dispatch({ type: 'rollback' });
      }
    } catch (error) {
      dispatch({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const selected =
    state.selectedEntity === 'player'
      ? {
          name: 'Player Column',
          id: 'demo:frontier/player',
          position: '2, 9',
          components: [
            'core:transform',
            'game:player-controlled',
            'game:mergeable',
          ],
          metric: 'strength 10',
        }
      : {
          name: 'Granary',
          id: 'demo:frontier/granary',
          position: '12, 6',
          components: ['core:transform', 'game:capture-site', 'game:producer'],
          metric:
            state.status === 'applied' || state.status === 'verified'
              ? 'grain +3'
              : 'grain +2',
        };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#080b11]/92 backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between gap-4 px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <div className="grid size-8 place-items-center rounded-lg border border-cyan-300/20 bg-cyan-300/10">
              <Braces className="size-4 text-cyan-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                AI Game Kernel <span className="text-slate-600">/</span> Studio
              </div>
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-600">
                human supervision console
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                state.mode === 'local'
                  ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                  : 'border-violet-400/20 bg-violet-400/10 text-violet-300'
              }
            >
              <span className="size-1.5 rounded-full bg-current" />
              {state.mode === 'local' ? 'LOCAL BRIDGE' : 'DEMO MODE'}
            </Badge>
            <Link
              href="/"
              className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-slate-300 transition-colors hover:bg-white/[0.07]"
            >
              查看路线图
            </Link>
          </div>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-3.5rem)] lg:grid-cols-[250px_minmax(480px,1fr)_340px]">
        <aside className="hidden border-r border-white/[0.07] bg-[#0a0e15]/80 p-4 lg:block">
          <div className="mb-5 flex items-center gap-2 px-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
            <PanelLeft className="size-3.5" /> Project
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2 rounded-lg bg-cyan-300/[0.07] px-2.5 py-2 text-cyan-100">
              <ChevronRight className="size-3.5" />
              <Database className="size-3.5 text-cyan-300" /> frontier.game.json
            </div>
            <div className="ml-5 flex items-center gap-2 px-2.5 py-2 text-slate-400">
              <ChevronRight className="size-3.5 rotate-90" />
              <Layers3 className="size-3.5" /> demo:frontier/map
            </div>
            <button
              type="button"
              onClick={() =>
                dispatch({ type: 'select-entity', entity: 'player' })
              }
              className={`ml-10 flex w-[calc(100%-2.5rem)] items-center gap-2 rounded-md px-2.5 py-2 text-left ${state.selectedEntity === 'player' ? 'bg-white/[0.07] text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <MousePointer2 className="size-3.5" /> Player Column
            </button>
            <button
              type="button"
              onClick={() =>
                dispatch({ type: 'select-entity', entity: 'granary' })
              }
              className={`ml-10 flex w-[calc(100%-2.5rem)] items-center gap-2 rounded-md px-2.5 py-2 text-left ${state.selectedEntity === 'granary' ? 'bg-white/[0.07] text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Box className="size-3.5" /> Granary
            </button>
          </div>

          <div className="mt-6 border-t border-white/[0.07] pt-5">
            <div className="mb-3 px-2 font-mono text-[10px] uppercase tracking-wider text-slate-600">
              Inspector
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
              <p className="text-sm font-medium text-slate-200">
                {selected.name}
              </p>
              <p className="mt-1 break-all font-mono text-[9px] text-cyan-300/70">
                {selected.id}
              </p>
              <dl className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <dt className="text-slate-600">position</dt>
                  <dd className="font-mono text-slate-300">
                    {selected.position}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">runtime</dt>
                  <dd className="font-mono text-emerald-300">
                    {selected.metric}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 space-y-1.5">
                {selected.components.map((component) => (
                  <div
                    key={component}
                    className="rounded border border-white/[0.06] bg-black/20 px-2 py-1.5 font-mono text-[9px] text-slate-500"
                  >
                    {component}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0 p-4 sm:p-5">
          <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <h1 className="text-lg font-semibold">开发任务</h1>
                <Badge className="border-white/10 bg-white/[0.04] text-[10px] text-slate-400">
                  {statusLabels[state.status]}
                </Badge>
              </div>
              <p className="text-xs text-slate-500">
                Codex 只规划，内核校验与人类批准决定是否写入。
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] p-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => dispatch({ type: 'step' })}
                className="h-8 text-xs text-slate-300"
              >
                <SkipForward /> 单步
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  dispatch({ type: state.running ? 'pause' : 'run' })
                }
                disabled={
                  !state.running &&
                  state.status !== 'applied' &&
                  state.status !== 'verified'
                }
                className="h-8 text-xs text-slate-300"
              >
                {state.running ? <CirclePause /> : <CirclePlay />}
                {state.running ? '暂停' : '运行'}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
            <div className="space-y-4">
              <section className="rounded-xl border border-white/[0.08] bg-card p-4">
                <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-cyan-300">
                  <Sparkles className="size-3.5" /> Natural language task
                </div>
                <Textarea
                  value={state.prompt}
                  onChange={(event) =>
                    dispatch({ type: 'prompt', value: event.target.value })
                  }
                  className="min-h-24 resize-none border-white/[0.08] bg-black/20 text-sm leading-6"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-[10px] text-slate-600">
                    {state.mode === 'local'
                      ? '将调用本机 Codex App Server'
                      : '交互演示，不写入本机文件'}
                  </span>
                  <Button
                    onClick={() => void invoke('plan')}
                    disabled={busy || state.prompt.trim().length === 0}
                    className="h-9 bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                  >
                    <Send /> 生成 ChangeSet
                  </Button>
                </div>
              </section>

              {state.error && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.08] p-3 text-xs text-rose-200">
                  <X className="mt-0.5 size-3.5 shrink-0" /> {state.error}
                </div>
              )}

              <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-card">
                <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Code2 className="size-4 text-violet-300" /> ChangeSet diff
                  </div>
                  <span className="font-mono text-[9px] text-slate-600">
                    {state.changeId ?? 'not planned'}
                  </span>
                </div>
                {state.operations.length === 0 ? (
                  <div className="grid min-h-44 place-items-center p-6 text-center">
                    <div>
                      <GitCompare className="mx-auto mb-3 size-7 text-slate-700" />
                      <p className="text-sm text-slate-500">
                        生成计划后在这里逐项审查
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3">
                    {state.operations.map((operation) => (
                      <div
                        key={operation.id}
                        className="flex gap-3 rounded-lg border border-white/[0.06] bg-black/15 p-3"
                      >
                        <input
                          type="checkbox"
                          aria-label={`选择修改 ${operation.path}`}
                          checked={operation.selected}
                          disabled={state.status !== 'planned'}
                          onChange={() =>
                            dispatch({
                              type: 'toggle-operation',
                              id: operation.id,
                            })
                          }
                          className="mt-1 accent-cyan-300"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge className="border-violet-400/20 bg-violet-400/10 font-mono text-[9px] text-violet-300">
                              {operation.op}
                            </Badge>
                            <code className="truncate text-[10px] text-slate-400">
                              {operation.path}
                            </code>
                          </div>
                          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 font-mono text-xs">
                            <div className="rounded bg-rose-400/[0.07] px-3 py-2 text-rose-300">
                              − {JSON.stringify(operation.before)}
                            </div>
                            <ChevronRight className="size-3.5 text-slate-700" />
                            <div className="rounded bg-emerald-400/[0.07] px-3 py-2 text-emerald-300">
                              + {JSON.stringify(operation.after)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.07] bg-black/10 p-3">
                  <Button
                    variant="outline"
                    onClick={() => void invoke('rollback')}
                    disabled={
                      busy ||
                      !['approved', 'applied', 'verified'].includes(
                        state.status,
                      )
                    }
                    className="h-8 border-white/10 bg-transparent text-xs text-slate-400"
                  >
                    <RotateCcw /> 回滚
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void invoke('approve')}
                    disabled={busy || state.status !== 'planned'}
                    className="h-8 border-cyan-300/20 bg-cyan-300/[0.06] text-xs text-cyan-200"
                  >
                    <UserCheck /> 批准选中项
                  </Button>
                  <Button
                    onClick={() => void invoke('apply')}
                    disabled={busy || state.status !== 'approved'}
                    className="h-8 bg-emerald-300 text-xs text-slate-950 hover:bg-emerald-200"
                  >
                    <Check /> 应用修改
                  </Button>
                </div>
              </section>
            </div>

            <section className="rounded-xl border border-white/[0.08] bg-card">
              <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Activity className="size-4 text-cyan-300" /> Agent activity
                </div>
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
              </div>
              <div className="max-h-[560px] space-y-1 overflow-y-auto p-3">
                {state.activity.map((item, index) => {
                  const Icon = activityIcons[item.kind];
                  return (
                    <div
                      key={item.id}
                      className="relative flex gap-3 rounded-lg p-2.5 hover:bg-white/[0.025]"
                    >
                      {index < state.activity.length - 1 && (
                        <span className="absolute left-[21px] top-9 h-[calc(100%-1rem)] w-px bg-white/[0.07]" />
                      )}
                      <span className="relative z-10 grid size-6 shrink-0 place-items-center rounded-full border border-white/10 bg-[#111722]">
                        <Icon className="size-3 text-slate-400" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-300">
                          {item.title}
                        </p>
                        <p className="mt-1 text-[10px] leading-4 text-slate-600">
                          {item.detail}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </section>

        <aside className="border-l border-white/[0.07] bg-[#0a0e15]/75 p-4">
          <section className="rounded-xl border border-white/[0.07] bg-card p-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CirclePlay className="size-4 text-emerald-300" /> Runtime
              </div>
              <span className="font-mono text-[9px] text-emerald-300">
                60 Hz fixed
              </span>
            </div>
            <div className="relative aspect-video overflow-hidden rounded-lg border border-white/[0.08] bg-[#07121a]">
              <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(34,211,238,.2)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,.2)_1px,transparent_1px)] [background-size:8.33%_16.66%]" />
              <button
                type="button"
                title="demo:frontier/player"
                onClick={() =>
                  dispatch({ type: 'select-entity', entity: 'player' })
                }
                className="absolute left-[8%] top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-sm bg-cyan-300 shadow-[0_0_16px_rgba(34,211,238,.5)]"
              >
                <MousePointer2 className="size-3 text-slate-950" />
              </button>
              <button
                type="button"
                title="demo:frontier/granary"
                onClick={() =>
                  dispatch({ type: 'select-entity', entity: 'granary' })
                }
                className="absolute left-[38%] top-[34%] grid size-5 place-items-center rounded-sm bg-amber-300 shadow-[0_0_16px_rgba(251,191,36,.35)]"
              >
                <Box className="size-3 text-slate-950" />
              </button>
              <div className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 font-mono text-[9px] text-slate-400">
                tick {state.tick} · {state.running ? 'running' : 'paused'}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <label
                htmlFor="runtime-seed"
                className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-black/15 px-3"
              >
                <span className="font-mono text-[9px] text-slate-600">
                  SEED
                </span>
                <Input
                  id="runtime-seed"
                  type="number"
                  value={state.seed}
                  onChange={(event) =>
                    dispatch({
                      type: 'set-seed',
                      seed: Number(event.target.value),
                    })
                  }
                  className="h-8 border-0 bg-transparent px-0 font-mono text-xs shadow-none"
                />
              </label>
              <Button
                onClick={() => void invoke('run')}
                disabled={
                  busy || !['applied', 'verified'].includes(state.status)
                }
                className="h-10 bg-emerald-300 text-slate-950 hover:bg-emerald-200"
              >
                <CirclePlay /> 验证
              </Button>
            </div>
          </section>

          <section className="mt-4 rounded-xl border border-white/[0.07] bg-card p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Clock3 className="size-4 text-violet-300" /> Snapshot timeline
            </div>
            <div className="space-y-2">
              {state.snapshots.slice(-4).map((snapshot, index) => (
                <div
                  key={`${snapshot.tick}-${snapshot.label}`}
                  className="flex items-center gap-3 rounded-lg bg-white/[0.025] p-2.5"
                >
                  <span
                    className={`size-2 rounded-full ${index === state.snapshots.slice(-4).length - 1 ? 'bg-violet-300' : 'bg-slate-700'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-slate-400">{snapshot.label}</span>
                      <span className="font-mono text-slate-600">
                        T{snapshot.tick}
                      </span>
                    </div>
                    <p className="mt-1 truncate font-mono text-[9px] text-slate-600">
                      {snapshot.hash}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-4 rounded-xl border border-white/[0.07] bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <FlaskConical className="size-4 text-cyan-300" /> Tests &
                performance
              </div>
              <span className="font-mono text-[9px] text-slate-600">
                1.4 ms/frame
              </span>
            </div>
            <div className="space-y-2">
              {state.tests.map((test) => (
                <div
                  key={test.name}
                  className="flex items-center gap-2 text-xs"
                >
                  <span
                    className={`grid size-4 place-items-center rounded-full ${test.status === 'passed' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/[0.05] text-slate-700'}`}
                  >
                    <Check className="size-2.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-400">
                    {test.name}
                  </span>
                  <span className="font-mono text-[9px] text-slate-600">
                    {test.duration}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
