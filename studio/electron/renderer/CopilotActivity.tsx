import { useEffect, useState } from 'react';
import type { CopilotActivity, CopilotFeedback } from '../copilot-activity';

const labels: Record<string, string> = {
  inProgress: '执行中',
  completed: '已完成',
  failed: '失败',
  interrupted: '已中断',
  declined: '已拒绝',
  ended: '本轮已结束，结果未确认',
};
export function CopilotActivityRow({ item }: { item: CopilotActivity }) {
  return (
    <details className="copilot-activity" data-status={item.status}>
      <summary>
        {item.label} <span>{labels[item.status] ?? item.status}</span>
      </summary>
      <pre>{item.detail || '暂无额外输出。'}</pre>
    </details>
  );
}

export function CopilotExecutionStatus({
  feedback,
  status,
  waiting,
}: {
  feedback?: CopilotFeedback;
  status: string;
  waiting: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (status !== 'inProgress') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [status]);
  const running =
    feedback?.items.filter((item) => item.status === 'inProgress') ?? [];
  const label = waiting
    ? '等待你的处理'
    : status !== 'inProgress'
      ? status === 'completed'
        ? '本轮已结束'
        : (labels[status] ?? status)
      : running.length
        ? `正在执行：${running.at(-1)!.label}${running.length > 1 ? `（共 ${running.length} 项）` : ''}`
        : '等待 Codex 更新';
  return (
    <output className="copilot-execution-status">
      <span title={label}>{label}</span>
      {feedback && status === 'inProgress' && (
        <small>
          已用时 {Math.max(0, Math.floor((now - feedback.startedAt) / 1000))} 秒
          · {Math.max(0, Math.floor((now - feedback.updatedAt) / 1000))}{' '}
          秒前更新
        </small>
      )}
    </output>
  );
}
