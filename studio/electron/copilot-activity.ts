/** Bounded, display-safe projection. Never forward raw tool payloads or reasoning. */
export type CopilotActivity = {
  id: string;
  label: string;
  status: string;
  detail: string;
  startedAt: number;
  updatedAt: number;
};
export type CopilotFeedback = {
  startedAt: number;
  updatedAt: number;
  items: CopilotActivity[];
};

export function activityText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .slice(0, 4000)
    .replace(/(?:sk-|Bearer\s+)[A-Za-z0-9_.-]+/gi, '[redacted]')
    .replace(
      /((?:api[_-]?key|token|password|secret|authorization)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi,
      '$1[redacted]',
    );
}

export function projectActivity(
  item: Record<string, unknown>,
  now: number,
): CopilotActivity | null {
  if (typeof item.id !== 'string') return null;
  const type = item.type;
  let label = '';
  let detail = '';
  if (type === 'mcpToolCall' || type === 'dynamicToolCall') {
    label = [item.server ?? item.namespace, item.tool]
      .filter((v) => typeof v === 'string')
      .join('.');
    // Results may contain images, credentials and enormous JSON. Only expose a safe summary.
    detail = item.error
      ? '工具返回错误，请查看诊断。'
      : item.result || item.contentItems
        ? '工具已返回结果。'
        : '';
    const args = item.arguments;
    if (args && typeof args === 'object') {
      const fields = [
        'path',
        'scene',
        'objectId',
        'componentId',
        'jobId',
        'candidateId',
        'changeSetId',
        'test',
        'profile',
        'width',
        'height',
        'ticks',
      ];
      const lines = fields.flatMap((key) => {
        const value = (args as Record<string, unknown>)[key];
        return typeof value === 'string' || typeof value === 'number'
          ? [`${key}: ${activityText(String(value))}`]
          : [];
      });
      detail = [...lines, detail].filter(Boolean).join('\n');
    }
  } else if (type === 'commandExecution') {
    label = '执行命令';
    detail = activityText(item.command);
    if (item.aggregatedOutput)
      detail += '\n' + activityText(item.aggregatedOutput);
    if (typeof item.exitCode === 'number')
      detail += `\n退出码：${item.exitCode}`;
  } else if (type === 'fileChange') {
    label = '修改文件';
    detail = Array.isArray(item.changes)
      ? item.changes
          .slice(0, 30)
          .map((c) => activityText(c?.path))
          .join('\n')
      : '';
  } else if (type === 'webSearch') {
    label = '搜索网页';
    detail = activityText(item.query);
  } else if (type === 'imageView') {
    label = '查看图片';
    detail = activityText(item.path);
  } else if (type === 'contextCompaction') label = '整理会话上下文';
  else if (type === 'collabAgentToolCall' || type === 'collabToolCall')
    label = '协作代理活动';
  else return null;
  return {
    id: item.id,
    label: activityText(label),
    detail: detail.slice(-6000),
    status: typeof item.status === 'string' ? item.status : 'inProgress',
    startedAt: now,
    updatedAt: now,
  };
}

export function reduceFeedback(
  previous: CopilotFeedback | undefined,
  method: string,
  value: Record<string, unknown>,
  now: number,
): CopilotFeedback {
  const state = previous ?? { startedAt: now, updatedAt: now, items: [] };
  const items = [...state.items];
  const raw = value.item;
  if (
    (method === 'item/started' || method === 'item/completed') &&
    raw &&
    typeof raw === 'object'
  ) {
    const item = projectActivity(raw as Record<string, unknown>, now);
    if (item) {
      const index = items.findIndex((old) => old.id === item.id);
      if (index >= 0) item.startedAt = items[index].startedAt;
      if (method === 'item/completed' && item.status === 'inProgress')
        item.status = 'completed';
      if (index >= 0) items[index] = item;
      else items.push(item);
    }
  } else if (
    method === 'item/commandExecution/outputDelta' ||
    method === 'item/mcpToolCall/progress'
  ) {
    const index = items.findIndex((item) => item.id === value.itemId);
    if (index >= 0)
      items[index] = {
        ...items[index],
        updatedAt: now,
        detail: (
          items[index].detail +
          '\n' +
          activityText(value.delta ?? value.message)
        ).slice(-6000),
      };
  } else if (method === 'turn/completed') {
    for (let index = 0; index < items.length; index++) {
      if (items[index].status === 'inProgress')
        items[index] = { ...items[index], status: 'ended', updatedAt: now };
    }
  }
  return { ...state, updatedAt: now, items: items.slice(-80) };
}
