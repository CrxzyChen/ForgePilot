'use client';

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Box,
  Braces,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Cpu,
  Gamepad2,
  GitBranch,
  Layers3,
  PanelTop,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  TerminalSquare,
  TestTube2,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
} from '@/components/ui/progress';
import {
  aiParityDimensions,
  baselineFindings,
  phases,
  risks,
  roadmapMeta,
  roundDeliverables,
  stack,
  type PhaseStatus,
} from '@/lib/roadmap';

const statusMeta: Record<
  PhaseStatus,
  { label: string; className: string; dot: string }
> = {
  completed: {
    label: '已完成',
    className: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    dot: 'bg-emerald-400',
  },
  active: {
    label: '进行中',
    className: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300',
    dot: 'bg-cyan-400',
  },
  validation: {
    label: '机器通过 · 待人验收',
    className: 'border-violet-400/20 bg-violet-400/10 text-violet-300',
    dot: 'bg-violet-400',
  },
  planned: {
    label: '未开始',
    className: 'border-white/10 bg-white/[0.04] text-slate-400',
    dot: 'bg-slate-600',
  },
  blocked: {
    label: '阻塞',
    className: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
    dot: 'bg-amber-400',
  },
};

type Filter = 'all' | PhaseStatus;

function percent(done: number, total: number) {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

export default function Home() {
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string>(
    () =>
      phases.find((phase) => phase.status === 'active')?.code ??
      phases.at(-1)?.code ??
      'P0',
  );
  const [copied, setCopied] = useState(false);

  const summary = useMemo(() => {
    const tasks = phases.flatMap((phase) => phase.tasks);
    const baselineTasks = phases
      .filter((phase) => phase.track !== roadmapMeta.activeTrack)
      .flatMap((phase) => phase.tasks);
    const roundTasks = phases
      .filter((phase) => phase.track === roadmapMeta.activeTrack)
      .flatMap((phase) => phase.tasks);
    const done = tasks.filter((task) => task.done).length;
    const baselineDone = baselineTasks.filter((task) => task.done).length;
    const roundDone = roundTasks.filter((task) => task.done).length;
    const blocked = phases.filter((phase) => phase.status === 'blocked').length;
    return {
      done,
      total: tasks.length,
      baselineDone,
      baselineTotal: baselineTasks.length,
      roundDone,
      roundTotal: roundTasks.length,
      blocked,
      overallProgress: percent(done, tasks.length),
      roundProgress: percent(roundDone, roundTasks.length),
    };
  }, []);

  const visiblePhases = phases.filter(
    (phase) =>
      phase.track === roadmapMeta.activeTrack &&
      (filter === 'all' || phase.status === filter),
  );
  const currentPhase =
    phases.find((phase) => phase.status === 'active') ?? phases.at(-1)!;
  const nextTask = roadmapMeta.ownerAccepted
    ? 'R5 已结项；P33 独立验收待后续另行安排'
    : (currentPhase.tasks.find((task) => !task.done)?.label ??
      phases
        .filter((phase) => phase.track === roadmapMeta.activeTrack)
        .flatMap((phase) => phase.tasks)
        .find((task) => !task.done)?.label);
  const roundComplete = summary.roundDone === summary.roundTotal;

  const copyUpdate = async () => {
    const update = [
      `AI Game Kernel · ${roadmapMeta.currentRound}`,
      `基线：${roadmapMeta.baselineRelease}（${summary.baselineDone}/${summary.baselineTotal}）`,
      `当前阶段：${currentPhase.code} ${currentPhase.title}`,
      `本轮完成：${summary.roundDone}/${summary.roundTotal} 项（${summary.roundProgress}%）`,
      `阻塞阶段：${summary.blocked}`,
      `状态：${roadmapMeta.ownerAccepted ? roadmapMeta.acceptanceSummary : roundComplete ? `${roadmapMeta.currentRound} 已完成` : '推进中'}`,
      `下一动作：${nextTask ?? '完成阶段复核'}`,
      `最终门禁：${currentPhase.gate}`,
    ].join('\n');
    await navigator.clipboard.writeText(update);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#080b11]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 shadow-[inset_0_0_24px_rgba(34,211,238,.08)]">
              <Braces className="size-4 text-cyan-300" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base">
                  AI Game Studio
                </h1>
                <Badge className="hidden border-cyan-300/15 bg-cyan-300/10 text-[10px] text-cyan-300 sm:inline-flex">
                  {roadmapMeta.currentRound} CONTROL
                </Badge>
              </div>
              <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                Human-readable delivery surface
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-xs text-slate-400 md:flex">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
              Source of truth · repository
            </div>
            <Button
              onClick={copyUpdate}
              variant="outline"
              className="h-9 border-white/10 bg-white/[0.04] px-3 text-slate-200 hover:bg-white/[0.08]"
            >
              {copied ? <Check /> : <Copy />}
              <span className="hidden sm:inline">
                {copied ? '已复制' : '复制周报'}
              </span>
            </Button>
            <Link
              href="/studio"
              className="hidden h-9 items-center gap-2 rounded-lg bg-cyan-300 px-3 text-xs font-medium text-slate-950 transition-colors hover:bg-cyan-200 sm:flex"
            >
              <PanelTop className="size-4" /> 查看旧技术原型
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,.8fr)]">
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-card p-5 sm:p-7">
            <div className="pointer-events-none absolute -right-20 -top-28 size-72 rounded-full bg-cyan-400/[0.07] blur-3xl" />
            <div className="relative">
              <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em] text-cyan-300">
                    <Target className="size-3.5" /> {roadmapMeta.currentRound}{' '}
                    {roadmapMeta.ownerAccepted ? '已验收结项' : '成功定义'}
                  </div>
                  <h2 className="max-w-4xl text-balance text-2xl font-semibold leading-tight tracking-[-0.03em] sm:text-3xl">
                    {roadmapMeta.objective}
                  </h2>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Badge className="border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-emerald-200">
                    {roadmapMeta.baselineRelease}
                  </Badge>
                  <Badge className="border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-amber-200">
                    {roadmapMeta.estimate}
                  </Badge>
                </div>
              </div>

              <Progress value={summary.roundProgress} className="gap-2">
                <ProgressLabel className="font-mono text-xs text-slate-400">
                  {roadmapMeta.currentRound} PROGRESS
                </ProgressLabel>
                <span className="ml-auto font-mono text-xs text-cyan-300">
                  {summary.roundProgress}%
                </span>
                <ProgressTrack className="h-2 bg-white/[0.06]">
                  <ProgressIndicator className="bg-gradient-to-r from-cyan-400 to-emerald-400 shadow-[0_0_18px_rgba(34,211,238,.4)]" />
                </ProgressTrack>
              </Progress>

              <Progress value={summary.overallProgress} className="mt-4 gap-2">
                <ProgressLabel className="font-mono text-[10px] text-slate-500">
                  P0–P33 OVERALL
                </ProgressLabel>
                <span className="ml-auto font-mono text-[10px] text-slate-500">
                  {summary.done}/{summary.total} · {summary.overallProgress}%
                </span>
                <ProgressTrack className="h-1 bg-white/[0.05]">
                  <ProgressIndicator className="bg-slate-500" />
                </ProgressTrack>
              </Progress>

              <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.07] sm:grid-cols-4">
                {[
                  {
                    label: '既有轮次基线',
                    value: `${summary.baselineDone}/${summary.baselineTotal}`,
                    Icon: Check,
                  },
                  {
                    label: '本轮完成',
                    value: `${summary.roundDone}/${summary.roundTotal}`,
                    Icon: Activity,
                  },
                  {
                    label: '当前阶段',
                    value: currentPhase.code,
                    Icon: ShieldCheck,
                  },
                  {
                    label: '阻塞阶段',
                    value: String(summary.blocked),
                    Icon: AlertTriangle,
                  },
                ].map(({ label, value, Icon }) => (
                  <div key={label} className="bg-[#0d1119] px-4 py-4">
                    <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
                      <Icon className="size-3.5" /> {label}
                    </div>
                    <div className="font-mono text-xl font-semibold text-slate-100">
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="rounded-2xl border border-cyan-300/15 bg-[linear-gradient(145deg,rgba(21,35,49,.92),rgba(12,16,24,.96))] p-5 sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="size-4 text-cyan-300" />
                当前阶段
              </div>
              <span className="font-mono text-[10px] text-slate-500">
                {currentPhase.duration}
              </span>
            </div>
            <p className="text-lg font-semibold text-white">
              {currentPhase.title}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {currentPhase.outcome}
            </p>
            <div className="my-5 h-px bg-white/[0.08]" />
            <div className="space-y-3">
              <div className="flex items-start gap-3 text-sm">
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-cyan-300" />
                <span>
                  <b className="text-slate-200">状态：</b>
                  {nextTask ?? '完成阶段复核'}
                </span>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-300" />
                <span>
                  <b className="text-slate-200">门禁：</b>
                  {currentPhase.gate}
                </span>
              </div>
            </div>
          </aside>
        </section>

        <section className="mb-6 rounded-2xl border border-cyan-300/15 bg-[linear-gradient(145deg,rgba(12,31,42,.78),rgba(12,16,24,.96))] p-5 sm:p-6">
          <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300">
                <Target className="size-3.5" /> Frozen delivery contract
              </div>
              <h2 className="text-lg font-semibold">当前轮次必须交付</h2>
            </div>
            <span className="font-mono text-[10px] text-slate-500">
              P28–P33 · 6 EXIT GATES
            </span>
          </div>
          <div className="grid gap-px overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.07] sm:grid-cols-2 xl:grid-cols-3">
            {roundDeliverables.map((item) => (
              <article key={item.label} className="bg-[#0d1119] p-4 sm:p-5">
                <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  {item.label}
                </p>
                <p className="mt-2 text-xl font-semibold tracking-tight text-cyan-200">
                  {item.value}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {item.detail}
                </p>
              </article>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300/10 bg-amber-300/[0.04] px-3 py-2 text-xs leading-5 text-slate-500">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
            Round 05 从完整游戏结果重新计数。Round 04 的 Runtime、Studio、
            Engine MCP 和 Provider 能力继续复用，但“已有工具”或“生成了素材”
            不等于 Copilot 完成游戏；只有经过审核导入、真实运行观察、测试、
            恢复、独立打包和无指导真人验证后才计为完成。
          </div>
        </section>

        <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
          <div>
            <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  阶段与验收清单
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  只有通过阶段门禁，进度才算真实完成。
                </p>
              </div>
              <div className="flex flex-wrap gap-1 rounded-lg border border-white/[0.07] bg-white/[0.025] p-1">
                {(
                  [
                    ['all', '全部'],
                    ['active', '进行中'],
                    ['validation', '待人验收'],
                    ['planned', '未开始'],
                    ['blocked', '阻塞'],
                    ['completed', '已完成'],
                  ] as [Filter, string][]
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    className={`rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                      filter === value
                        ? 'bg-white/10 text-white'
                        : 'text-slate-500 hover:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {visiblePhases.map((phase) => {
                const done = phase.tasks.filter((task) => task.done).length;
                const phaseProgress = percent(done, phase.tasks.length);
                const isExpanded = expanded === phase.code;
                const meta = statusMeta[phase.status];
                return (
                  <article
                    key={phase.code}
                    className={`overflow-hidden rounded-xl border bg-card transition-colors ${
                      isExpanded ? 'border-cyan-300/20' : 'border-white/[0.07]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpanded(isExpanded ? '' : phase.code)}
                      aria-expanded={isExpanded}
                      className="grid w-full gap-4 p-4 text-left sm:grid-cols-[54px_minmax(0,1fr)_130px_24px] sm:items-center sm:p-5"
                    >
                      <div className="font-mono text-sm font-semibold text-cyan-300">
                        {phase.code}
                      </div>
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-slate-100">
                            {phase.title}
                          </h3>
                          <span className="font-mono text-[9px] uppercase tracking-wider text-slate-600">
                            {phase.track}
                          </span>
                          <Badge variant="outline" className={meta.className}>
                            <span
                              className={`size-1.5 rounded-full ${meta.dot}`}
                            />
                            {meta.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-500">
                          {phase.outcome}
                        </p>
                      </div>
                      <div>
                        <div className="mb-1.5 flex justify-between font-mono text-[10px] text-slate-500">
                          <span>
                            {done}/{phase.tasks.length}
                          </span>
                          <span>{phase.duration}</span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-white/[0.07]">
                          <div
                            className="h-full rounded-full bg-cyan-400 transition-[width]"
                            style={{ width: `${phaseProgress}%` }}
                          />
                        </div>
                      </div>
                      <ChevronRight
                        className={`size-4 text-slate-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      />
                    </button>

                    {isExpanded && (
                      <div className="border-t border-white/[0.07] bg-black/10 px-4 py-5 sm:px-[74px]">
                        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                          <div className="space-y-2">
                            {phase.tasks.map((task) => (
                              <div
                                key={task.label}
                                className="flex items-start gap-3 rounded-lg px-2 py-2 text-sm hover:bg-white/[0.025]"
                              >
                                <span
                                  className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border ${
                                    task.done
                                      ? 'border-emerald-400/30 bg-emerald-400/15 text-emerald-300'
                                      : 'border-white/15 text-transparent'
                                  }`}
                                >
                                  <Check className="size-3" />
                                </span>
                                <span
                                  className={
                                    task.done
                                      ? 'text-slate-500 line-through'
                                      : 'text-slate-300'
                                  }
                                >
                                  {task.label}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="rounded-lg border border-emerald-300/10 bg-emerald-300/[0.035] p-4">
                            <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-emerald-300">
                              <ShieldCheck className="size-3.5" /> Exit gate
                            </div>
                            <p className="text-sm leading-6 text-slate-300">
                              {phase.gate}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24">
            <section className="rounded-xl border border-amber-300/15 bg-[linear-gradient(145deg,rgba(48,35,15,.48),rgba(12,16,24,.96))] p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="size-4 text-amber-300" /> 当前产品实况
              </div>
              <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-300/10 bg-amber-300/[0.04] px-3 py-2">
                <span className="text-xs text-slate-400">产品级别</span>
                <Badge className="border-amber-300/20 bg-amber-300/10 text-amber-200">
                  Architecture Alpha
                </Badge>
              </div>
              <div className="space-y-2">
                {baselineFindings.map((finding) => (
                  <p
                    key={finding}
                    className="flex items-start gap-2 text-xs leading-5 text-slate-500"
                  >
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-amber-300/70" />
                    {finding}
                  </p>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-cyan-300/15 bg-[linear-gradient(145deg,rgba(16,40,52,.78),rgba(12,16,24,.96))] p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Gamepad2 className="size-4 text-cyan-300" /> Preview 验证主线
              </div>
              <p className="text-sm font-semibold text-slate-100">
                {roadmapMeta.firstGame}
              </p>
              <div className="mt-4 space-y-2 text-xs leading-5 text-slate-400">
                <p>
                  从 Empty 2D 完成真实 Sprite、Physics、Audio 与 UI 的 Tank。
                </p>
                <p>从 Empty 3D 完成透视、深度、灯光和碰撞的 Collect Room。</p>
                <p>每项能力必须同时通过人类、AI、Player、测试和回滚门禁。</p>
              </div>
            </section>

            <section className="rounded-xl border border-white/[0.07] bg-card p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Layers3 className="size-4 text-violet-300" /> 技术边界
              </div>
              <div className="space-y-1">
                {stack.map((item) => {
                  const icons = {
                    AI: Bot,
                    IDE: TerminalSquare,
                    Protocol: GitBranch,
                    Kernel: Cpu,
                    Graphics: Box,
                    Shader: Sparkles,
                    Assets: Sparkles,
                    Test: TestTube2,
                  };
                  const Icon = icons[item.kind];
                  return (
                    <div
                      key={item.kind}
                      className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-white/[0.025]"
                    >
                      <Icon className="size-4 shrink-0 text-slate-500" />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[9px] uppercase tracking-wider text-slate-600">
                          {item.kind}
                        </div>
                        <div className="truncate text-sm text-slate-300">
                          {item.value}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl border border-violet-300/15 bg-[linear-gradient(145deg,rgba(34,23,56,.55),rgba(12,16,24,.96))] p-5">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Bot className="size-4 text-violet-300" /> AI 全链路铁律
              </div>
              <p className="mb-4 text-xs leading-5 text-slate-500">
                任一能力缺少下面一个维度，就不能在 Checklist 中标记完成。
              </p>
              <div className="grid grid-cols-2 gap-2">
                {aiParityDimensions.map((dimension) => (
                  <div
                    key={dimension}
                    className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-black/10 px-2.5 py-2 text-[11px] text-slate-400"
                  >
                    <span className="size-1.5 rounded-full bg-violet-300" />
                    {dimension}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-white/[0.07] bg-card p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="size-4 text-amber-300" /> 风险雷达
              </div>
              <div className="space-y-4">
                {risks.map((risk) => (
                  <div key={risk.title}>
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="text-sm text-slate-300">
                        {risk.title}
                      </span>
                      <span
                        className={`font-mono text-[10px] ${risk.level === '高' ? 'text-amber-300' : 'text-slate-500'}`}
                      >
                        {risk.level}
                      </span>
                    </div>
                    <p className="text-xs leading-5 text-slate-600">
                      {risk.response}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-dashed border-white/[0.11] bg-white/[0.018] p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Clock3 className="size-4 text-slate-500" /> 更新规则
              </div>
              <ol className="space-y-2 text-xs leading-5 text-slate-500">
                <li>1. 每个任务必须有可验证产物。</li>
                <li>2. 完成状态随代码一起提交。</li>
                <li>3. 阻塞超过一天必须写明原因。</li>
                <li>4. 未通过 Exit gate 不进入下一阶段。</li>
              </ol>
              <div className="mt-4 flex items-center gap-2 border-t border-white/[0.06] pt-4 font-mono text-[10px] text-slate-600">
                <RotateCcw className="size-3" /> LAST REVIEW ·{' '}
                {roadmapMeta.lastReview}
              </div>
            </section>
          </aside>
        </section>

        <footer className="mt-10 flex flex-col justify-between gap-3 border-t border-white/[0.07] py-6 text-xs text-slate-600 sm:flex-row">
          <span>AI Game Studio · Copilot-driven game completion</span>
          <span className="font-mono">
            PLAN → BUILD → OBSERVE → VERIFY → ROLLBACK
          </span>
        </footer>
      </div>
    </main>
  );
}
