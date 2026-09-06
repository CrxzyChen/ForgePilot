import { randomUUID } from 'node:crypto';

import { ProjectError } from '../project/project-types.ts';
import {
  ProjectScriptRuntime,
  type ProjectRuntimeResult,
  type RunProjectOptions,
  type RuntimeInput,
} from './project-script-runtime.ts';
import {
  RUNTIME_PROTOCOL_VERSION,
  type RuntimeSessionId,
  type RuntimeSessionState,
  type RuntimeStateMessage,
} from './runtime-session-protocol.ts';

export type RuntimeReloadReport = {
  policy: 'restart-authoritative' | 'preserve-presentation';
  outcome: 'restarted' | 'presentation-only';
  previousGeneration: number;
  generation: number;
  previousTick: number;
  tick: number;
  bundle: ProjectRuntimeResult['bundle'];
};

export class RuntimeSessionService {
  readonly #runtime: ProjectScriptRuntime;
  readonly #sessionId: RuntimeSessionId;
  #generation = 0;
  #sequence = 0;
  #state: RuntimeSessionState = 'stopped';
  #tick = 0;
  #started = false;
  #randomState = 0;
  #pendingEvents: Array<Record<string, unknown>> = [];
  #pendingLifecycle: ProjectRuntimeResult['pendingLifecycle'] = [];
  #physicsContacts: ProjectRuntimeResult['physicsContacts'] = [];
  #scene: ProjectRuntimeResult['scene'] | null = null;
  #activeScene: string | null = null;
  #baseOptions: RunProjectOptions | null = null;
  #lastResult: ProjectRuntimeResult | null = null;
  #queuedInputs: RuntimeInput[] = [];
  #recordedInputs: RuntimeInput[] = [];
  #recordingRevision: string | null = null;
  #recordingComplete = false;
  #executionRevision: string | null = null;

  constructor(runtime: ProjectScriptRuntime) {
    this.#runtime = runtime;
    this.#sessionId = `session:${randomUUID().replaceAll('-', '')}`;
  }

  get sessionId(): RuntimeSessionId {
    return this.#sessionId;
  }

  get generation(): number {
    return this.#generation;
  }

  get sequence(): number {
    return this.#sequence;
  }

  get state(): RuntimeSessionState {
    return this.#state;
  }

  get tick(): number {
    return this.#tick;
  }

  get result(): ProjectRuntimeResult | null {
    return this.#lastResult ? structuredClone(this.#lastResult) : null;
  }

  start(options: RunProjectOptions): ProjectRuntimeResult {
    options = {
      ...options,
      scene: options.scene ?? this.#runtime.startupScene(),
    };
    this.#generation += 1;
    this.#sequence += 1;
    this.#state = 'starting';
    this.#tick = 0;
    this.#started = false;
    this.#randomState = options.seed ?? 0;
    this.#pendingEvents = [];
    this.#pendingLifecycle = [];
    this.#physicsContacts = [];
    this.#scene = null;
    this.#activeScene = options.scene ?? null;
    this.#queuedInputs = [];
    this.#recordedInputs = structuredClone(options.inputs ?? []);
    this.#recordingRevision = this.#runtime.projectRevision();
    this.#executionRevision = null;
    this.#recordingComplete =
      !options.sceneState &&
      !options.started &&
      !options.startTick &&
      !options.activeScene &&
      options.randomState === undefined &&
      !options.pendingEvents?.length &&
      !options.pendingLifecycle?.length &&
      !options.physicsContacts?.length &&
      !options.breakpoints?.length;
    this.#baseOptions = structuredClone(options);
    return this.#run(options.ticks ?? 1, options);
  }

  pause(): void {
    if (this.#state === 'stopped') {
      throw new ProjectError(
        'RUNTIME_SESSION_NOT_STARTED',
        '请先启动 Runtime Session。',
      );
    }
    if (this.#state !== 'failed') this.#state = 'paused';
    this.#sequence += 1;
  }

  resume(ticks = 1): ProjectRuntimeResult {
    if (this.#state !== 'paused') {
      throw new ProjectError(
        'RUNTIME_SESSION_NOT_PAUSED',
        '只有已暂停的 Runtime Session 可以继续。',
      );
    }
    this.#state = 'playing';
    return this.#run(ticks);
  }

  advance(ticks = 1): ProjectRuntimeResult {
    if (this.#state !== 'playing') {
      throw new ProjectError(
        'RUNTIME_SESSION_NOT_PLAYING',
        'Runtime Session 当前不在播放状态。',
      );
    }
    return this.#run(ticks);
  }

  advancePaused(ticks: number): ProjectRuntimeResult {
    if (!Number.isSafeInteger(ticks) || ticks < 1 || ticks > 200) {
      throw new ProjectError(
        'RUNTIME_BATCH_TICKS_INVALID',
        '暂停会话每批只能推进 1–200 个 Tick。',
      );
    }
    if (this.#state !== 'paused') {
      throw new ProjectError(
        'RUNTIME_SESSION_NOT_PAUSED',
        '有界推进只接受已暂停的 Runtime Session。',
      );
    }
    this.#state = 'stepping';
    try {
      const result = this.#run(ticks);
      if (result.status !== 'failed') this.#state = 'paused';
      return result;
    } catch (error) {
      this.#state = 'failed';
      throw error;
    }
  }

  step(): ProjectRuntimeResult {
    if (this.#state === 'stopped') {
      if (!this.#baseOptions) {
        throw new ProjectError(
          'RUNTIME_SESSION_NOT_CONFIGURED',
          '请先运行一次项目以建立 Runtime Session。',
        );
      }
      const result = this.start({ ...this.#baseOptions, ticks: 1 });
      if (result.status !== 'failed') this.#state = 'paused';
      return result;
    }
    if (this.#state === 'failed') {
      throw new ProjectError(
        'RUNTIME_SESSION_FAILED',
        '运行时处于失败状态，请先重新启动。',
      );
    }
    this.#state = 'stepping';
    const result = this.#run(1);
    if (result.status !== 'failed') this.#state = 'paused';
    return result;
  }

  stop(): void {
    this.#state = 'stopping';
    this.#sequence += 1;
    this.#tick = 0;
    this.#started = false;
    this.#randomState = this.#baseOptions?.seed ?? 0;
    this.#pendingEvents = [];
    this.#pendingLifecycle = [];
    this.#physicsContacts = [];
    this.#scene = null;
    this.#activeScene = this.#baseOptions?.scene ?? null;
    this.#queuedInputs = [];
    this.#lastResult = null;
    this.#state = 'stopped';
    this.#sequence += 1;
  }

  restart(ticks?: number): ProjectRuntimeResult {
    if (!this.#baseOptions) {
      throw new ProjectError(
        'RUNTIME_SESSION_NOT_CONFIGURED',
        '请先运行一次项目以建立 Runtime Session。',
      );
    }
    return this.start({
      ...this.#baseOptions,
      ticks: ticks ?? this.#baseOptions.ticks ?? 1,
    });
  }

  queueInput(input: RuntimeInput): void {
    if (!Number.isSafeInteger(input.tick) || input.tick < this.#tick) {
      throw new ProjectError(
        'RUNTIME_INPUT_TICK_INVALID',
        `输入目标 Tick 必须不早于当前 Tick ${this.#tick}。`,
      );
    }
    this.#queuedInputs.push(structuredClone(input));
    this.#queuedInputs.sort(
      (left, right) =>
        left.tick - right.tick || left.action.localeCompare(right.action),
    );
    this.#sequence += 1;
  }

  exportInputLog() {
    if (
      !this.#recordingComplete ||
      !this.#baseOptions ||
      !this.#lastResult ||
      this.#state !== 'paused' ||
      this.#lastResult.status === 'failed'
    ) {
      throw new ProjectError(
        'RUNTIME_INPUT_LOG_UNAVAILABLE',
        '只有从权威初始场景录制的完整、成功、已暂停会话可以导出输入记录。',
      );
    }
    if (this.#runtime.projectRevision() !== this.#recordingRevision)
      throw new ProjectError(
        'RUNTIME_INPUT_LOG_REVISION_CONFLICT',
        '录制期间项目已改变，请重新开始会话。',
      );
    return {
      projectRevision: this.#recordingRevision!,
      sessionId: this.#sessionId,
      generation: this.#generation,
      tick: this.#tick,
      stateHash: this.#lastResult.stateHash,
      request: {
        scene: this.#baseOptions.scene,
        seed: this.#baseOptions.seed ?? 0,
        ticks: this.#tick,
        inputs: structuredClone(
          this.#recordedInputs.filter((input) => input.tick < this.#tick),
        ),
        commands: structuredClone(
          (this.#baseOptions.commands ?? []).filter(
            (input) => input.tick < this.#tick,
          ),
        ),
        controls: structuredClone(
          (this.#baseOptions.controls ?? []).filter(
            (input) => input.tick < this.#tick,
          ),
        ),
      },
    };
  }

  hotReload(): RuntimeReloadReport {
    const compiled = this.#runtime.compile();
    const policy = compiled.manifest.hotReload ?? 'restart-authoritative';
    const previousGeneration = this.#generation;
    const previousTick = this.#tick;
    const wasPlaying = this.#state === 'playing';
    this.#state = 'reloading';
    if (policy === 'restart-authoritative' && this.#baseOptions) {
      const result = this.start({ ...this.#baseOptions, ticks: 1 });
      if (!wasPlaying && result.status !== 'failed') this.#state = 'paused';
      return {
        policy,
        outcome: 'restarted',
        previousGeneration,
        generation: this.#generation,
        previousTick,
        tick: this.#tick,
        bundle: result.bundle,
      };
    }
    this.#generation += 1;
    this.#recordingComplete = false;
    this.#sequence += 1;
    this.#state = wasPlaying ? 'playing' : 'paused';
    return {
      policy,
      outcome: 'presentation-only',
      previousGeneration,
      generation: this.#generation,
      previousTick,
      tick: this.#tick,
      bundle: compiled.metadata,
    };
  }

  stateMessage(projectHash: string): RuntimeStateMessage {
    return {
      protocolVersion: RUNTIME_PROTOCOL_VERSION,
      kind: 'session.state',
      sessionId: this.#sessionId,
      generation: Math.max(1, this.#generation),
      sequence: this.#sequence,
      tick: this.#tick,
      payload: {
        state: this.#state,
        projectHash,
        activeSceneId: (this.#scene?.id ??
          'scene:unavailable') as `${string}:${string}`,
        stateHash: this.#lastResult?.stateHash ?? null,
      },
    };
  }

  #run(
    ticks: number,
    initialOptions: RunProjectOptions | null = null,
  ): ProjectRuntimeResult {
    if (!this.#baseOptions) {
      throw new ProjectError(
        'RUNTIME_SESSION_NOT_CONFIGURED',
        'Runtime Session 缺少启动配置。',
      );
    }
    const endTick = this.#tick + ticks;
    const queued = this.#queuedInputs.filter(
      (input) => input.tick >= this.#tick && input.tick < endTick,
    );
    this.#queuedInputs = this.#queuedInputs.filter(
      (input) => input.tick >= endTick,
    );
    this.#sequence += 1;
    const result = this.#runtime.run({
      ...this.#baseOptions,
      ...initialOptions,
      sceneState: this.#scene ?? initialOptions?.sceneState,
      activeScene: this.#activeScene ?? initialOptions?.activeScene,
      startTick: this.#tick,
      started: this.#started,
      randomState: this.#randomState,
      pendingEvents: this.#pendingEvents,
      pendingLifecycle: this.#pendingLifecycle,
      physicsContacts: this.#physicsContacts,
      inputs: [...(this.#baseOptions.inputs ?? []), ...queued],
      ticks,
      sessionId: this.#sessionId,
      generation: this.#generation,
      sequence: this.#sequence,
      persistTrace: initialOptions?.persistTrace,
    });
    if (this.#executionRevision === null)
      this.#executionRevision = this.#runtime.executionRevision;
    else if (this.#executionRevision !== this.#runtime.executionRevision)
      this.#recordingComplete = false;
    this.#recordedInputs.push(
      ...structuredClone(queued.filter((input) => input.tick < result.tick)),
    );
    this.#lastResult = result;
    this.#tick = result.tick;
    this.#started = true;
    this.#randomState = result.randomState;
    this.#pendingEvents = structuredClone(result.pendingEvents);
    this.#pendingLifecycle = structuredClone(result.pendingLifecycle);
    this.#physicsContacts = structuredClone(result.physicsContacts);
    this.#scene = structuredClone(result.scene);
    this.#activeScene = result.activeScene;
    this.#state =
      result.status === 'failed'
        ? 'failed'
        : result.status === 'paused'
          ? 'paused'
          : 'playing';
    return structuredClone(result);
  }
}
