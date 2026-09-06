import type { TurnCompletedNotification } from '../../../generated/codex-app-server/v2/TurnCompletedNotification.ts';
import type {
  ChangeOperation,
  ChangePlanInput,
  ChangeSet,
  JsonValue,
} from './kernel-control-service.ts';
import {
  ControlError,
  KernelControlService,
} from './kernel-control-service.ts';
import { CodexAppServerClient } from '../../../studio/server/codex-app-server-client.ts';

export type PlannerContext = {
  request: string;
  projectPath: string;
  project: JsonValue;
  projectSchema: JsonValue;
};

export interface ChangePlanner {
  plan(context: PlannerContext): Promise<Omit<ChangePlanInput, 'projectPath'>>;
}

/** Converts one natural-language intent into a non-mutating, validated ChangeSet. */
export class AiChangeCoordinator {
  readonly control: KernelControlService;
  readonly planner: ChangePlanner;

  constructor(control: KernelControlService, planner: ChangePlanner) {
    this.control = control;
    this.planner = planner;
  }

  async requestChange(
    request: string,
    projectPath: string,
  ): Promise<ChangeSet> {
    if (request.trim().length === 0) {
      throw new ControlError(
        'CONTROL_EMPTY_REQUEST',
        'natural-language request must not be empty',
      );
    }
    const [project, projectSchema] = await Promise.all([
      this.control.dispatch('project.query', { projectPath }),
      this.control.dispatch('schema.describe'),
    ]);
    const proposed = await this.planner.plan({
      request,
      projectPath,
      project,
      projectSchema,
    });
    return (await this.control.dispatch('change.plan', {
      projectPath,
      ...proposed,
    })) as ChangeSet;
  }
}

/** Live planner backed by the official Codex App Server streaming protocol. */
export class CodexJsonPlanner implements ChangePlanner {
  readonly client: CodexAppServerClient;
  readonly timeoutMs: number;

  constructor(client: CodexAppServerClient, timeoutMs = 120_000) {
    this.client = client;
    this.timeoutMs = timeoutMs;
  }

  async plan(
    context: PlannerContext,
  ): Promise<Omit<ChangePlanInput, 'projectPath'>> {
    const thread = await this.client.startThread({
      cwd: null,
      approvalPolicy: 'never',
      sandbox: 'read-only',
      developerInstructions:
        'Return only JSON for a Game IR ChangeSet plan. Never edit files or run commands.',
    });
    const output = await this.collectTurn(
      thread.thread.id,
      buildPlannerPrompt(context),
    );
    return parsePlannerOutput(output);
  }

  private collectTurn(threadId: string, prompt: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let text = '';
      let turnId: string | null = null;
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Codex planning turn timed out'));
      }, this.timeoutMs);
      const onDelta = (params: { delta?: unknown }) => {
        if (typeof params.delta === 'string') text += params.delta;
      };
      const onCompleted = (params: TurnCompletedNotification) => {
        if (turnId !== null && params.turn.id !== turnId) return;
        cleanup();
        if (params.turn.status === 'completed') resolve(text);
        else
          reject(
            new Error(`Codex planning turn ended as ${params.turn.status}`),
          );
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.client.events.off('item/agentMessage/delta', onDelta);
        this.client.events.off('turn/completed', onCompleted);
      };
      this.client.events.on('item/agentMessage/delta', onDelta);
      this.client.events.on('turn/completed', onCompleted);
      void this.client
        .startTurn(threadId, prompt, {
          cwd: null,
          approvalPolicy: 'never',
          sandboxPolicy: { type: 'readOnly', networkAccess: false },
        })
        .then((started) => {
          turnId = started.turn.id;
        })
        .catch((error: unknown) => {
          cleanup();
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }
}

function buildPlannerPrompt(context: PlannerContext): string {
  return [
    'Translate the request into the smallest RFC 6902-style Game IR patch.',
    'Allowed operations: add, replace, remove.',
    'Return exactly one JSON object with summary, operations, and expectedEffects.',
    `Request: ${context.request}`,
    `Project path: ${context.projectPath}`,
    `Project schema: ${JSON.stringify(context.projectSchema)}`,
    `Current project: ${JSON.stringify(context.project)}`,
  ].join('\n');
}

function parsePlannerOutput(
  output: string,
): Omit<ChangePlanInput, 'projectPath'> {
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  const source = fenced?.[1]?.trim() ?? output.trim();
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new ControlError(
      'CONTROL_PLANNER_JSON',
      `Codex did not return valid ChangeSet JSON: ${String(error)}`,
    );
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ControlError(
      'CONTROL_PLANNER_SHAPE',
      'planner output must be an object',
    );
  }
  const object = value as Record<string, unknown>;
  if (typeof object.summary !== 'string' || !Array.isArray(object.operations)) {
    throw new ControlError(
      'CONTROL_PLANNER_SHAPE',
      'planner output requires summary and operations',
    );
  }
  const operations = object.operations.map((operation, index) =>
    parseOperation(operation, index),
  );
  const expectedEffects = Array.isArray(object.expectedEffects)
    ? object.expectedEffects.map((effect, index) => {
        if (typeof effect !== 'string') {
          throw new ControlError(
            'CONTROL_PLANNER_SHAPE',
            `expectedEffects/${index} must be a string`,
          );
        }
        return effect;
      })
    : [];
  return { summary: object.summary, operations, expectedEffects };
}

function parseOperation(value: unknown, index: number): ChangeOperation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ControlError(
      'CONTROL_PLANNER_SHAPE',
      `operations/${index} must be an object`,
    );
  }
  const object = value as Record<string, unknown>;
  if (
    (object.op !== 'add' &&
      object.op !== 'replace' &&
      object.op !== 'remove') ||
    typeof object.path !== 'string'
  ) {
    throw new ControlError(
      'CONTROL_PLANNER_SHAPE',
      `operations/${index} has an invalid op or path`,
    );
  }
  if (object.op !== 'remove' && object.value === undefined) {
    throw new ControlError(
      'CONTROL_PLANNER_SHAPE',
      `operations/${index} requires a value`,
    );
  }
  return {
    op: object.op,
    path: object.path,
    ...(object.value === undefined ? {} : { value: object.value as JsonValue }),
  };
}
