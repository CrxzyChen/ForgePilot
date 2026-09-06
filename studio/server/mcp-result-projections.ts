import type { StudioChangeSet } from '../workspace/studio-change-set-service.ts';

/** Discovery returns identities, state and scope; explicit read returns full review evidence. */
export function summarizeChange(change: StudioChangeSet) {
  return {
    ...change,
    operations: change.operations.map(({ id, command, description }) => ({
      id,
      command,
      description,
    })),
    files: change.files.map(({ path, beforeHash, afterHash }) => ({
      path,
      beforeHash,
      afterHash,
    })),
    testResult: change.testResult
      ? {
          ok: change.testResult.ok,
          testedAt: change.testResult.testedAt,
          detailsAvailable: true,
        }
      : null,
    detailTool: { name: 'change.read', arguments: { id: change.id } },
  };
}

export function summarizeTest(result: unknown) {
  const data =
    result && typeof result === 'object'
      ? (result as Record<string, unknown>)
      : {};
  const diagnostics = Array.isArray(data.diagnostics) ? data.diagnostics : [];
  return {
    passed:
      data.status === 'completed' &&
      !diagnostics.some(
        (item) =>
          item &&
          typeof item === 'object' &&
          (item as { severity?: string }).severity === 'error',
      ),
    status: data.status ?? 'unknown',
    tick: data.tick,
    seed: data.seed,
    activeScene: data.activeScene,
    stateHash: data.stateHash,
    diagnostics,
    budgets: data.budgets,
    counts: Object.fromEntries(
      [
        'snapshots',
        'timeline',
        'systemTrace',
        'audioEvents',
        'physicsEvents',
      ].map((key) => [key, Array.isArray(data[key]) ? data[key].length : 0]),
    ),
  };
}
