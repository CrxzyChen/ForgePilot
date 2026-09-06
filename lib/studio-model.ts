export type StudioChangeStatus =
  | 'idle'
  | 'planned'
  | 'approved'
  | 'applied'
  | 'verified'
  | 'rolledBack';

export type StudioOperation = {
  id: string;
  op: 'add' | 'replace' | 'remove';
  path: string;
  before?: unknown;
  after?: unknown;
  selected: boolean;
};

export type StudioActivity = {
  id: number;
  kind: 'agent' | 'validation' | 'human' | 'runtime' | 'system';
  title: string;
  detail: string;
  state: 'done' | 'active' | 'waiting';
};

export type StudioSnapshot = {
  tick: number;
  hash: string;
  label: string;
};

export type StudioState = {
  prompt: string;
  status: StudioChangeStatus;
  changeId: string | null;
  operations: StudioOperation[];
  activity: StudioActivity[];
  tick: number;
  seed: number;
  running: boolean;
  selectedEntity: 'player' | 'granary';
  snapshots: StudioSnapshot[];
  tests: Array<{
    name: string;
    status: 'passed' | 'waiting';
    duration: string;
  }>;
  mode: 'demo' | 'local';
  error: string | null;
};

export type StudioAction =
  | { type: 'prompt'; value: string }
  | { type: 'plan'; changeId?: string; operations?: StudioOperation[] }
  | { type: 'toggle-operation'; id: string }
  | { type: 'approve' }
  | { type: 'apply' }
  | { type: 'run' }
  | { type: 'pause' }
  | { type: 'step' }
  | { type: 'rollback' }
  | { type: 'select-entity'; entity: StudioState['selectedEntity'] }
  | { type: 'set-seed'; seed: number }
  | { type: 'set-mode'; mode: StudioState['mode'] }
  | { type: 'error'; message: string | null };

export const initialStudioState: StudioState = {
  prompt: '将粮仓每周期粮食产量从 2 调整为 3，并验证回放结果',
  status: 'idle',
  changeId: null,
  operations: [],
  activity: [
    {
      id: 1,
      kind: 'system',
      title: '工作区已就绪',
      detail: 'Game IR 1.0.0 · kernel protocol 1.0.0',
      state: 'done',
    },
    {
      id: 2,
      kind: 'agent',
      title: '等待开发任务',
      detail: 'Codex 以只读规划器身份连接',
      state: 'waiting',
    },
  ],
  tick: 0,
  seed: 42,
  running: false,
  selectedEntity: 'granary',
  snapshots: [
    { tick: 0, hash: '765f4c1ea1b2', label: 'initial' },
    { tick: 35, hash: 'd6535f963652', label: 'golden replay' },
  ],
  tests: [
    { name: 'Game IR schema', status: 'waiting', duration: '—' },
    { name: 'Deterministic replay ×100', status: 'waiting', duration: '—' },
    { name: 'Rendered/headless parity', status: 'waiting', duration: '—' },
  ],
  mode: 'demo',
  error: null,
};

export const demoOperations: StudioOperation[] = [
  {
    id: 'operation:production',
    op: 'replace',
    path: '/worlds/0/entities/1/components/2/amountPerCycle',
    before: 2,
    after: 3,
    selected: true,
  },
];

export function studioReducer(
  state: StudioState,
  action: StudioAction,
): StudioState {
  switch (action.type) {
    case 'prompt':
      return { ...state, prompt: action.value };
    case 'plan': {
      const operations = action.operations ?? demoOperations;
      return appendActivity(
        {
          ...state,
          status: 'planned',
          changeId: action.changeId ?? 'change:demo-granary-production',
          operations,
          error: null,
        },
        'agent',
        'ChangeSet 已生成',
        `${operations.length} 项修改；文件尚未落盘`,
      );
    }
    case 'toggle-operation':
      if (state.status !== 'planned') return state;
      return {
        ...state,
        operations: state.operations.map((operation) =>
          operation.id === action.id
            ? { ...operation, selected: !operation.selected }
            : operation,
        ),
      };
    case 'approve':
      if (
        state.status !== 'planned' ||
        !state.operations.some((operation) => operation.selected)
      ) {
        return state;
      }
      return appendActivity(
        { ...state, status: 'approved' },
        'human',
        '人工审批通过',
        '一次性授权已签发，允许应用选中修改',
      );
    case 'apply':
      if (state.status !== 'approved') return state;
      return appendActivity(
        { ...state, status: 'applied' },
        'validation',
        '修改已原子应用',
        'Schema 校验通过 · base hash 匹配',
      );
    case 'run':
      if (state.status !== 'applied' && state.status !== 'verified')
        return state;
      return appendActivity(
        {
          ...state,
          status: 'verified',
          running: true,
          tick: 35,
          tests: state.tests.map((test, index) => ({
            ...test,
            status: 'passed',
            duration: ['18 ms', '41 ms', '1.4 ms'][index] ?? '1 ms',
          })),
          snapshots: upsertSnapshot(state.snapshots, {
            tick: 35,
            hash: 'ce2c78d14a90',
            label: 'approved change',
          }),
        },
        'runtime',
        '确定性验证完成',
        '35 Tick · 3/3 测试通过 · 可安全回滚',
      );
    case 'pause':
      return { ...state, running: false };
    case 'step':
      return {
        ...state,
        running: false,
        tick: state.tick + 1,
        snapshots: upsertSnapshot(state.snapshots, {
          tick: state.tick + 1,
          hash: `step${String(state.tick + 1).padStart(8, '0')}`,
          label: 'manual step',
        }),
      };
    case 'rollback':
      if (
        state.status !== 'applied' &&
        state.status !== 'verified' &&
        state.status !== 'approved'
      ) {
        return state;
      }
      return appendActivity(
        {
          ...state,
          status: 'rolledBack',
          running: false,
          operations: state.operations.map((operation) => ({
            ...operation,
            selected: false,
          })),
        },
        'system',
        'ChangeSet 已回滚',
        '原始文件字节与 base hash 已恢复',
      );
    case 'select-entity':
      return { ...state, selectedEntity: action.entity };
    case 'set-seed':
      return { ...state, seed: action.seed };
    case 'set-mode':
      return { ...state, mode: action.mode };
    case 'error':
      return { ...state, error: action.message };
  }
}

function appendActivity(
  state: StudioState,
  kind: StudioActivity['kind'],
  title: string,
  detail: string,
): StudioState {
  return {
    ...state,
    activity: [
      ...state.activity.map((item) =>
        item.state === 'active' ? { ...item, state: 'done' as const } : item,
      ),
      {
        id: state.activity.length + 1,
        kind,
        title,
        detail,
        state: 'done',
      },
    ],
  };
}

function upsertSnapshot(
  snapshots: StudioSnapshot[],
  snapshot: StudioSnapshot,
): StudioSnapshot[] {
  return [
    ...snapshots.filter(
      (candidate) =>
        candidate.tick !== snapshot.tick || candidate.label !== snapshot.label,
    ),
    snapshot,
  ].sort((left, right) => left.tick - right.tick);
}
