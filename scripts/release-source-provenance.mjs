import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export function releaseGit(root, args) {
  const result = spawnSync(
    'git',
    ['--no-optional-locks', '-c', 'core.safecrlf=false', '-C', root, ...args],
    { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Release source Git operation failed: ${args[0]}\n${result.stderr}`,
    );
  }
  return result.stdout;
}

export function releaseSourcePath(root, name) {
  if (
    !name ||
    isAbsolute(name) ||
    name.includes('\\') ||
    name.split('/').some((part) => !part || part === '..' || part === '.git')
  ) {
    throw new Error(`Unsafe release source path: ${name}`);
  }
  const path = resolve(root, name);
  const contained = relative(root, path);
  if (
    !contained ||
    contained === '..' ||
    contained.startsWith(`..${sep}`) ||
    isAbsolute(contained)
  ) {
    throw new Error(`Escaping release source path: ${name}`);
  }
  return path;
}

export function captureReleaseSource(directory) {
  const root = realpathSync(directory);
  const top = realpathSync(
    releaseGit(root, ['rev-parse', '--show-toplevel']).trim(),
  );
  if (root !== top)
    throw new Error('Release source must be a repository root.');
  const commit = releaseGit(root, ['rev-parse', 'HEAD']).trim();
  const tree = releaseGit(root, ['rev-parse', 'HEAD^{tree}']).trim();
  const status = releaseGit(root, [
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
  ]);
  const names = [
    ...new Set(
      releaseGit(root, [
        'ls-files',
        '-z',
        '--cached',
        '--others',
        '--exclude-standard',
      ])
        .split('\0')
        .filter(Boolean),
    ),
  ].sort();
  const files = [];
  for (const name of names) {
    const path = releaseSourcePath(root, name);
    let stat;
    try {
      stat = lstatSync(path);
    } catch (error) {
      if (error.code === 'ENOENT') continue; // A tracked deletion is part of the snapshot.
      throw error;
    }
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      realpathSync(path) !== path
    ) {
      throw new Error(
        `Release source must contain regular, non-linked files: ${name}`,
      );
    }
    files.push({
      path: name,
      sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
    });
  }
  if (!files.length) throw new Error('Release source cannot be empty.');
  return {
    source: {
      kind: 'ai-game-studio/git-source',
      schemaVersion: '1.0.0',
      commit,
      tree,
      dirty: status.length > 0,
      statusSha256: createHash('sha256').update(status).digest('hex'),
      contentSha256: createHash('sha256')
        .update(files.map((file) => `${file.sha256}  ${file.path}`).join('\n'))
        .digest('hex'),
      fileCount: files.length,
    },
    files,
  };
}

export function assertReleaseSourceUnchanged(before, after) {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(
      'Release source changed during preparation/build; discard this candidate and retry from a fixed checkout.',
    );
  }
}

export function qualifyReleaseSource(manifest, current, version) {
  if (manifest.version !== version)
    throw new Error('Studio archive version does not match the checkout.');
  if (
    manifest.kind !== 'ai-game-studio/windows-portable' ||
    manifest.cleanGate?.ok !== true
  ) {
    throw new Error('Studio archive has no successful portable clean gate.');
  }
  if (!manifest.source)
    return {
      finalCandidateEligible: false,
      reason: 'Legacy archive has no build-source binding.',
    };
  assertReleaseSourceUnchanged(manifest.source, current);
  const eligible = !current.dirty && /^0\.4\.0-preview(?:\.|$)/u.test(version);
  return {
    finalCandidateEligible: eligible,
    reason: eligible
      ? 'Archive matches this clean, hash-pinned source checkout.'
      : 'Development candidate: a clean 0.4.0-preview checkout is required.',
  };
}
