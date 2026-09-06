import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

import {
  ControlError,
  KernelControlService,
  type JsonValue,
} from './kernel-control-service.ts';

export type ControlRequest = {
  id: string | number;
  method: string;
  params?: JsonValue;
};

export type ControlResponse =
  | { id: string | number; result: JsonValue }
  | {
      id: string | number;
      error: { code: string; message: string; data?: JsonValue };
    };

/** Converts one control request to one JSON-RPC-style response. */
export async function handleControlRequest(
  service: KernelControlService,
  request: ControlRequest,
): Promise<ControlResponse> {
  try {
    const result = await service.dispatch(request.method, request.params ?? {});
    return { id: request.id, result };
  } catch (error) {
    if (error instanceof ControlError) {
      return {
        id: request.id,
        error: {
          code: error.code,
          message: error.message,
          ...(error.data === undefined ? {} : { data: error.data }),
        },
      };
    }
    return {
      id: request.id,
      error: {
        code: 'CONTROL_INTERNAL',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/** Runs the kernel control protocol as newline-delimited JSON over stdio. */
export function serveStdio(workspaceRoot = process.cwd()): void {
  const service = new KernelControlService({ workspaceRoot });
  const lines = createInterface({ input: process.stdin });
  lines.on('line', (line) => {
    void (async () => {
      let request: ControlRequest;
      try {
        request = JSON.parse(line) as ControlRequest;
      } catch (error) {
        process.stdout.write(
          `${JSON.stringify({
            id: null,
            error: {
              code: 'CONTROL_PARSE',
              message: error instanceof Error ? error.message : String(error),
            },
          })}\n`,
        );
        return;
      }
      const response = await handleControlRequest(service, request);
      process.stdout.write(`${JSON.stringify(response)}\n`);
    })();
  });
}

const invoked = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;
if (invoked) serveStdio(process.argv[2] ?? process.cwd());
