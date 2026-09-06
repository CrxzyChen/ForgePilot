import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import type { InitializeResponse } from '../../generated/codex-app-server/InitializeResponse.ts';
import type { ServerNotification } from '../../generated/codex-app-server/ServerNotification.ts';
import type { ServerRequest } from '../../generated/codex-app-server/ServerRequest.ts';
import type { ThreadStartParams } from '../../generated/codex-app-server/v2/ThreadStartParams.ts';
import type { ThreadStartResponse } from '../../generated/codex-app-server/v2/ThreadStartResponse.ts';
import type { ThreadResumeParams } from '../../generated/codex-app-server/v2/ThreadResumeParams.ts';
import type { ThreadResumeResponse } from '../../generated/codex-app-server/v2/ThreadResumeResponse.ts';
import type { TurnStartParams } from '../../generated/codex-app-server/v2/TurnStartParams.ts';
import type { TurnStartResponse } from '../../generated/codex-app-server/v2/TurnStartResponse.ts';
import type { TurnInterruptResponse } from '../../generated/codex-app-server/v2/TurnInterruptResponse.ts';
import type { ModelListParams } from '../../generated/codex-app-server/v2/ModelListParams.ts';
import type { ModelListResponse } from '../../generated/codex-app-server/v2/ModelListResponse.ts';

type RequestId = string | number;

type WireResponse = {
  id: RequestId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export type CodexAppServerClientOptions = {
  cwd: string;
  binary?: string;
  prefixArguments?: string[];
  env?: NodeJS.ProcessEnv;
  requestTimeoutMs?: number;
};

export type CodexStreamEvent = ServerNotification;

/** Typed JSONL client for the official `codex app-server` stdio transport. */
export class CodexAppServerClient {
  readonly events = new EventEmitter();
  readonly #options: {
    cwd: string;
    binary: string;
    env: NodeJS.ProcessEnv;
    requestTimeoutMs: number;
  };
  readonly #prefixArguments: string[];
  readonly #pending = new Map<RequestId, PendingRequest>();
  #process: ChildProcessWithoutNullStreams | null = null;
  #requestId = 0;

  constructor(options: CodexAppServerClientOptions) {
    const windowsScript = join(
      process.env.APPDATA ?? '',
      'npm',
      'node_modules',
      '@openai',
      'codex',
      'bin',
      'codex.js',
    );
    const useWindowsScript = process.platform === 'win32' && !options.binary;
    this.#options = {
      cwd: options.cwd,
      binary: options.binary ?? (useWindowsScript ? process.execPath : 'codex'),
      env: options.env ?? process.env,
      requestTimeoutMs: options.requestTimeoutMs ?? 30_000,
    };
    this.#prefixArguments =
      options.prefixArguments ?? (useWindowsScript ? [windowsScript] : []);
  }

  /** Starts the process and performs the required initialize/initialized handshake. */
  async connect(): Promise<InitializeResponse> {
    if (this.#process) throw new Error('Codex App Server is already connected');
    const child = spawn(
      this.#options.binary,
      [...this.#prefixArguments, 'app-server'],
      {
        cwd: this.#options.cwd,
        env: this.#options.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    this.#process = child;
    child.stderr.on('data', (chunk: Buffer) => {
      this.events.emit('stderr', chunk.toString('utf8'));
    });
    child.once('exit', (code, signal) => {
      const error = new Error(
        `Codex App Server exited (${code ?? 'null'}, ${signal ?? 'no signal'})`,
      );
      for (const pending of this.#pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(error);
      }
      this.#pending.clear();
      this.#process = null;
      this.events.emit('exit', { code, signal });
    });
    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => this.#receive(line));

    const initialized = await this.request<InitializeResponse>('initialize', {
      clientInfo: {
        name: 'ai_game_kernel_studio',
        title: 'AI Game Kernel Studio',
        version: '0.1.1',
      },
      capabilities: { experimentalApi: true },
    });
    this.notify('initialized');
    return initialized;
  }

  /** Creates a Codex thread constrained to this workspace. */
  startThread(
    overrides: Partial<ThreadStartParams> = {},
  ): Promise<ThreadStartResponse> {
    const params: ThreadStartParams = {
      model: null,
      modelProvider: null,
      cwd: this.#options.cwd,
      approvalPolicy: 'on-request',
      sandbox: 'workspace-write',
      config: null,
      baseInstructions: null,
      developerInstructions: null,
      ...overrides,
    };
    return this.request('thread/start', params);
  }

  /** Resumes one persisted project thread without copying conversation content. */
  resumeThread(
    threadId: string,
    overrides: Partial<ThreadResumeParams> = {},
  ): Promise<ThreadResumeResponse> {
    const params: ThreadResumeParams = {
      threadId,
      model: null,
      modelProvider: null,
      cwd: this.#options.cwd,
      approvalPolicy: 'on-request',
      sandbox: 'workspace-write',
      config: null,
      baseInstructions: null,
      developerInstructions: null,
      ...overrides,
    };
    return this.request('thread/resume', params);
  }

  /** Starts one turn; progress continues through the `notification` event. */
  startTurn(
    threadId: string,
    prompt: string,
    overrides: Partial<TurnStartParams> = {},
  ): Promise<TurnStartResponse> {
    const params: TurnStartParams = {
      threadId,
      input: [{ type: 'text', text: prompt, text_elements: [] }],
      cwd: this.#options.cwd,
      approvalPolicy: 'on-request',
      sandboxPolicy: null,
      model: null,
      effort: null,
      summary: null,
      ...overrides,
    };
    return this.request('turn/start', params);
  }

  /** Lists models currently available to the authenticated account. */
  listModels(params: ModelListParams = {}): Promise<ModelListResponse> {
    return this.request('model/list', params);
  }

  /** Interrupts an in-progress turn while preserving the containing thread. */
  interruptTurn(
    threadId: string,
    turnId: string,
  ): Promise<TurnInterruptResponse> {
    return this.request('turn/interrupt', { threadId, turnId });
  }

  /** Sends one typed request and rejects structured server errors and timeouts. */
  request<Result>(method: string, params: unknown): Promise<Result> {
    const id = ++this.#requestId;
    return new Promise<Result>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Codex App Server request timed out: ${method}`));
      }, this.#options.requestTimeoutMs);
      this.#pending.set(id, {
        resolve: (value) => resolve(value as Result),
        reject,
        timer,
      });
      this.#send({ id, method, params });
    });
  }

  /** Sends a protocol notification without a response ID. */
  notify(method: string, params?: unknown): void {
    this.#send(params === undefined ? { method } : { method, params });
  }

  /** Replies to one server-initiated request such as a human approval. */
  respond(id: RequestId, result: unknown): void {
    this.#send({ id, result });
  }

  /** Gracefully ends App Server so it can terminate its project MCP children. */
  close(timeoutMs = 5_000): Promise<void> {
    const child = this.#process;
    if (!child || child.exitCode !== null) return Promise.resolve();
    return new Promise((resolveClose) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolveClose();
      };
      const timer = setTimeout(() => {
        child.kill();
        setTimeout(finish, 250);
      }, timeoutMs);
      child.once('exit', finish);
      child.stdin.end();
    });
  }

  #send(message: unknown): void {
    if (!this.#process?.stdin.writable) {
      throw new Error('Codex App Server is not connected');
    }
    this.#process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #receive(line: string): void {
    let message: WireResponse | CodexStreamEvent | ServerRequest;
    try {
      message = JSON.parse(line) as
        | WireResponse
        | CodexStreamEvent
        | ServerRequest;
    } catch (error) {
      this.events.emit('protocolError', { line, error });
      return;
    }
    if ('id' in message && 'method' in message) {
      this.events.emit('serverRequest', message);
      return;
    }
    if ('id' in message) {
      const pending = this.#pending.get(message.id);
      if (!pending) {
        this.events.emit('protocolError', {
          line,
          error: new Error(`response has unknown id ${message.id}`),
        });
        return;
      }
      clearTimeout(pending.timer);
      this.#pending.delete(message.id);
      if (message.error) {
        pending.reject(
          new Error(`${message.error.code}: ${message.error.message}`, {
            cause: message.error.data,
          }),
        );
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    this.events.emit('notification', message);
    if (message.method === 'error') {
      this.events.emit('serverError', message.params);
    } else {
      this.events.emit(message.method, message.params);
    }
  }
}
