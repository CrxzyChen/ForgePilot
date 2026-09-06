/** Dedicated presentation invalidation; never an authoring/Git refresh. */
export function reviewRecordChange(filename: string | null): boolean {
  return /^\.aigame\/local\/changes\/changeset_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.json$/u.test(
    String(filename ?? '').replaceAll('\\', '/'),
  );
}

/** Return a project-relative authoring path, or null for internal state. */
export function externalProjectChange(filename: string | null): string | null {
  const path = String(filename ?? '').replaceAll('\\', '/');
  // Windows also emits the directory entry itself when an internal child
  // changes. In particular git status may refresh its index: observing that
  // as an authoring edit causes snapshot -> git -> watcher -> snapshot loops.
  const root = path.split('/')[0]?.toLowerCase();
  if (
    /^\.aigame\/local\/test-results\/test-run_[a-f0-9]{24}\.json$/u.test(path)
  )
    return path;
  if (!path || root === '.git' || root === '.aigame') return null;
  return path;
}
