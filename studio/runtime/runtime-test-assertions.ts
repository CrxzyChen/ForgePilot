import { isDeepStrictEqual } from 'node:util';

import { ProjectError } from '../project/project-types.ts';
import type { ProjectRuntimeResult } from './project-script-runtime.ts';
import {
  evaluateUiContent,
  isUiContentExpectation,
} from './runtime-ui-content-assertions.ts';

export type RuntimeTestAssertion = {
  id: string;
  tick: number;
  target: { objectId: string; componentId?: string; field?: string };
  operator:
    | 'equals'
    | 'notEquals'
    | 'exists'
    | 'absent'
    | 'lessThan'
    | 'greaterThan'
    | 'fitsUiContent';
  expected?: unknown;
  compareTick?: number;
};

const operators = [
  'equals',
  'notEquals',
  'exists',
  'absent',
  'lessThan',
  'greaterThan',
  'fitsUiContent',
];
const semanticId = /^[a-z0-9][a-z0-9_-]*:[a-z0-9][a-z0-9_./-]*$/iu;
const tick = (value: unknown) =>
  Number.isSafeInteger(value) && Number(value) >= 0;
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export function parseRuntimeAssertions(value: unknown): RuntimeTestAssertion[] {
  if (value === undefined) return [];
  const invalid = () =>
    new ProjectError(
      'TEST_ASSERTION_INVALID',
      'assertions 必须是可执行的结构化断言；文字说明请放入 documentation，不能代替验证。',
    );
  if (!Array.isArray(value) || value.length > 1000) throw invalid();
  const ids = new Set<string>();
  for (const item of value) {
    if (
      !record(item) ||
      typeof item.id !== 'string' ||
      !semanticId.test(item.id) ||
      ids.has(item.id) ||
      !tick(item.tick) ||
      !record(item.target) ||
      typeof item.target.objectId !== 'string' ||
      !semanticId.test(item.target.objectId) ||
      !operators.includes(String(item.operator))
    )
      throw invalid();
    const target = item.target;
    if (
      target.componentId !== undefined &&
      (typeof target.componentId !== 'string' ||
        !semanticId.test(target.componentId))
    )
      throw invalid();
    if (
      target.field !== undefined &&
      (typeof target.field !== 'string' ||
        !target.field ||
        !target.field
          .split('.')
          .every(
            (segment) =>
              /^[a-zA-Z_][a-zA-Z0-9_-]*$/u.test(segment) &&
              !['__proto__', 'prototype', 'constructor'].includes(segment),
          ))
    )
      throw invalid();
    if (
      Object.keys(target).some(
        (key) => !['objectId', 'componentId', 'field'].includes(key),
      ) ||
      Object.keys(item).some(
        (key) =>
          ![
            'id',
            'tick',
            'target',
            'operator',
            'expected',
            'compareTick',
          ].includes(key),
      )
    )
      throw invalid();
    if (item.operator === 'fitsUiContent') {
      if (
        typeof target.componentId !== 'string' ||
        target.field !== undefined ||
        Object.hasOwn(item, 'compareTick') ||
        !isUiContentExpectation(item.expected)
      )
        throw invalid();
      ids.add(item.id);
      continue;
    }
    const existence = item.operator === 'exists' || item.operator === 'absent';
    const hasExpected = Object.hasOwn(item, 'expected');
    const hasCompare = Object.hasOwn(item, 'compareTick');
    if (existence ? hasExpected || hasCompare : hasExpected === hasCompare)
      throw invalid();
    if (hasCompare && !tick(item.compareTick)) throw invalid();
    if (
      hasExpected &&
      (item.operator === 'lessThan' || item.operator === 'greaterThan') &&
      (typeof item.expected !== 'number' || !Number.isFinite(item.expected))
    )
      throw invalid();
    ids.add(item.id);
  }
  return value as RuntimeTestAssertion[];
}

export function evaluateRuntimeAssertions(
  result: ProjectRuntimeResult,
  assertions: RuntimeTestAssertion[],
  file: string,
): void {
  function read(atTick: number, target: RuntimeTestAssertion['target']) {
    const snapshot = result.snapshots.find((item) => item.tick === atTick);
    if (!snapshot) return { snapshot: false, found: false, value: undefined };
    const object = snapshot.scene.objects.find(
      (item) => item.id === target.objectId,
    );
    let value: unknown = target.componentId
      ? object?.components.find((item) => item.id === target.componentId)?.data
      : object;
    for (const segment of target.field?.split('.') ?? []) {
      value =
        record(value) && Object.hasOwn(value, segment)
          ? value[segment]
          : undefined;
    }
    return { snapshot: true, found: value !== undefined, value };
  }
  for (const assertion of assertions) {
    if (assertion.operator === 'fitsUiContent') {
      const snapshot = result.snapshots.find(
        (item) => item.tick === assertion.tick,
      );
      const uiContent =
        snapshot &&
        assertion.target.componentId &&
        isUiContentExpectation(assertion.expected)
          ? evaluateUiContent(
              snapshot.scene,
              {
                objectId: assertion.target.objectId,
                componentId: assertion.target.componentId,
              },
              assertion.expected,
            )
          : {
              matches: false,
              targetFound: false,
              reason: 'missing-snapshot-or-invalid-expectation',
            };
      if (uiContent.matches) continue;
      result.status = 'failed';
      result.diagnostics.push({
        code: 'TEST_ASSERTION_FAILED',
        severity: 'error',
        message: `${assertion.id} 在 Tick ${assertion.tick} 未满足 fitsUiContent。`,
        tick: assertion.tick,
        phase: 'engine:snapshot',
        systemId: null,
        objectId: assertion.target.objectId,
        moduleId: null,
        file,
        line: 1,
        column: 1,
        stack: '',
        state: {
          assertion,
          snapshotFound: Boolean(snapshot),
          targetFound: uiContent.targetFound,
          uiContent,
        },
      });
      continue;
    }
    const actual = read(assertion.tick, assertion.target);
    const expected =
      assertion.compareTick === undefined
        ? { found: true, value: assertion.expected }
        : read(assertion.compareTick, assertion.target);
    const matches =
      assertion.operator === 'exists'
        ? actual.found
        : assertion.operator === 'absent'
          ? !actual.found
          : actual.found &&
            expected.found &&
            (assertion.operator === 'equals'
              ? isDeepStrictEqual(actual.value, expected.value)
              : assertion.operator === 'notEquals'
                ? !isDeepStrictEqual(actual.value, expected.value)
                : typeof actual.value === 'number' &&
                  typeof expected.value === 'number' &&
                  (assertion.operator === 'lessThan'
                    ? actual.value < expected.value
                    : actual.value > expected.value));
    if (actual.snapshot && matches) continue;
    result.status = 'failed';
    result.diagnostics.push({
      code: 'TEST_ASSERTION_FAILED',
      severity: 'error',
      message: `${assertion.id} 在 Tick ${assertion.tick} 未满足 ${assertion.operator}。`,
      tick: assertion.tick,
      phase: 'engine:snapshot',
      systemId: null,
      objectId: assertion.target.objectId,
      moduleId: null,
      file,
      line: 1,
      column: 1,
      stack: '',
      state: {
        assertion,
        snapshotFound: actual.snapshot,
        targetFound: actual.found,
        actual: actual.value ?? null,
        expected: expected.value ?? null,
      },
    });
  }
}
