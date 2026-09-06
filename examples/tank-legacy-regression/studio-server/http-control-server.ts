import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { pathToFileURL } from 'node:url';

import {
  AiChangeCoordinator,
  CodexJsonPlanner,
} from './ai-change-coordinator.ts';
import { CodexAppServerClient } from '../../../studio/server/codex-app-server-client.ts';
import {
  handleControlRequest,
  type ControlRequest,
  type ControlResponse,
} from './json-rpc-control-server.ts';
import {
  KernelControlService,
  type JsonValue,
} from './kernel-control-service.ts';

const MAX_BODY_BYTES = 1_048_576;

export type StudioBridgeOptions = {
  workspaceRoot: string;
  kernelRoot?: string;
};

export function createStudioBridge(options: StudioBridgeOptions) {
  const control = new KernelControlService(options);
  let codex: CodexAppServerClient | null = null;

  const dispatch = async (
    request: ControlRequest,
  ): Promise<ControlResponse> => {
    if (request.method !== 'ai.change.request') {
      return handleControlRequest(control, request);
    }
    try {
      const params = asObject(request.params);
      const naturalRequest = requiredString(params.request, 'request');
      const projectPath = requiredString(params.projectPath, 'projectPath');
      codex ??= new CodexAppServerClient({
        cwd: options.kernelRoot ?? process.cwd(),
      });
      await codex.connect().catch((error: unknown) => {
        if (
          error instanceof Error &&
          error.message.includes('already connected')
        )
          return;
        throw error;
      });
      const coordinator = new AiChangeCoordinator(
        control,
        new CodexJsonPlanner(codex),
      );
      const result = await coordinator.requestChange(
        naturalRequest,
        projectPath,
      );
      return { id: request.id, result };
    } catch (error) {
      return {
        id: request.id,
        error: {
          code: 'CONTROL_AI_PLANNER',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };

  const server = createServer((request, response) => {
    route(request, response, dispatch).catch((error: unknown) => {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          ok: false,
          error: {
            code: 'CONTROL_HTTP_ROUTE_FAILED',
            message: error instanceof Error ? error.message : String(error),
          },
        }),
      );
    });
  });

  return {
    server,
    close: async () => {
      await codex?.close();
      if (!server.listening) return;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function route(
  request: IncomingMessage,
  response: ServerResponse,
  dispatch: (request: ControlRequest) => Promise<ControlResponse>,
): Promise<void> {
  applyCors(request, response);
  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return;
  }
  if (request.method === 'GET' && request.url === '/health') {
    sendJson(response, 200, {
      ok: true,
      service: 'ai-game-kernel-studio-bridge',
      transport: 'localhost-http',
    });
    return;
  }
  if (request.method !== 'POST' || request.url !== '/rpc') {
    sendJson(response, 404, { error: 'not found' });
    return;
  }
  try {
    const source = await readBody(request);
    const message = JSON.parse(source) as ControlRequest;
    if (
      (typeof message.id !== 'string' && typeof message.id !== 'number') ||
      typeof message.method !== 'string'
    ) {
      throw new Error('request requires id and method');
    }
    sendJson(response, 200, await dispatch(message));
  } catch (error) {
    sendJson(response, 400, {
      id: null,
      error: {
        code: 'CONTROL_HTTP_REQUEST',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

function applyCors(request: IncomingMessage, response: ServerResponse): void {
  const origin = request.headers.origin;
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/u.test(origin)) {
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('vary', 'origin');
  }
  response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type');
  response.setHeader('content-type', 'application/json; charset=utf-8');
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body exceeds 1 MiB'));
        request.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  response.writeHead(status).end(JSON.stringify(value));
}

function asObject(value: JsonValue | undefined): Record<string, JsonValue> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('params must be an object');
  }
  return value;
}

function requiredString(value: JsonValue | undefined, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

const invoked = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;
if (invoked) {
  const bridge = createStudioBridge({
    workspaceRoot: process.argv[2] ?? process.cwd(),
    kernelRoot: process.cwd(),
  });
  bridge.server.listen(4617, '127.0.0.1', () => {
    console.log('[studio-bridge] http://127.0.0.1:4617');
  });
}
