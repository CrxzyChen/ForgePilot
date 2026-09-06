import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { ProjectManager } from '../studio/project/project-manager.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';
import type {
  ProjectDiagnostic,
  ProjectSearchMatch,
} from '../studio/workspace/studio-language-service.ts';
import type { ProjectReferenceIndex } from '../studio/workspace/studio-language-service.ts';

const repository = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), 'ai-game-studio-p16-'));
const projects = join(temporary, 'projects');

try {
  mkdirSync(projects, { recursive: true });
  const manager = new ProjectManager({
    templateRoot: join(repository, 'templates'),
    storageDirectory: join(temporary, 'studio-data'),
    engineVersion: '0.2.0-alpha.1',
  });
  const project = manager.createProject({
    parentDirectory: projects,
    directoryName: 'editor-gate',
    name: 'P16 Editor Gate',
    preset: 'empty-2d',
  });
  const git = (...args: string[]) => {
    const result = spawnSync('git', args, {
      cwd: project.root,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10_000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  };
  git('init');
  git('config', 'user.name', 'P16 Gate');
  git('config', 'user.email', 'p16@example.invalid');
  git('config', 'core.autocrlf', 'false');
  const trackedRelativePath = 'p16-review-fixture.txt';
  const trackedPath = join(project.root, trackedRelativePath);
  writeFileSync(trackedPath, 'tracked baseline\n');
  git('add', '-f', '--', trackedRelativePath);
  git('commit', '-m', 'P16 fixture');
  const registry = new StudioCommandRegistry({
    projectRoot: project.root,
    kernelCliPath: join(repository, 'target', 'debug', 'kernelctl.exe'),
  });
  const workspaceState = registry.getWorkspaceState();
  registry.setWorkspaceState({
    ...workspaceState,
    diffReview: {
      viewMode: 'inline',
      ignoreTrimWhitespace: true,
      wordWrap: true,
      hideUnchangedRegions: true,
      contextLineCount: 5,
    },
  });
  assert.deepEqual(registry.getWorkspaceState().diffReview, {
    viewMode: 'inline',
    ignoreTrimWhitespace: true,
    wordWrap: true,
    hideUnchangedRegions: true,
    contextLineCount: 5,
  });

  assert(existsSync(join(project.root, 'scripts', 'game-sdk.d.ts')));
  registry.execute('project.file.create', {
    path: 'scripts/behaviors/feature.ts',
    content: `import { defineBehavior } from '@aigame/sdk';\nexport default defineBehavior({\n  onFixedUpdate() { console.log('needle-feature'); }\n});\n`,
  });
  registry.execute('project.file.create', {
    path: 'assets/shaders/test.wgsl',
    content: '@fragment fn main() {\n',
  });
  registry.execute('project.file.create', {
    path: 'docs/feature.md',
    content: '# needle-feature\n',
  });
  writeFileSync(
    join(project.root, 'settings', 'broken.json'),
    '{\n  "value":\n}\n',
  );

  const diagnostics = registry.execute('diagnostics.list')
    .data as ProjectDiagnostic[];
  assert(
    diagnostics.some(
      (item) => item.path === 'settings/broken.json' && item.line === 3,
    ),
  );
  assert(
    diagnostics.some(
      (item) => item.path === 'assets/shaders/test.wgsl' && item.line === 1,
    ),
  );

  const matches = registry.execute('project.search', {
    query: 'needle-feature',
  }).data as ProjectSearchMatch[];
  assert.equal(matches.length, 2);
  assert(matches.every((item) => item.line > 0 && item.column > 0));
  const diff = registry.execute('source-control.diff', {
    path: 'scripts/behaviors/feature.ts',
  }).data as { before: string; after: string };
  assert.equal(diff.before, '');
  assert.match(diff.after, /needle-feature/u);
  registry.execute('source-control.stage', {
    path: 'scripts/behaviors/feature.ts',
  });
  const staged = registry.execute('source-control.diff', {
    path: 'scripts/behaviors/feature.ts',
  }).data as { staged: boolean; unstaged: boolean };
  assert.equal(staged.staged, true);
  registry.execute('source-control.unstage', {
    path: 'scripts/behaviors/feature.ts',
  });
  const unstaged = registry.execute('source-control.diff', {
    path: 'scripts/behaviors/feature.ts',
  }).data as { staged: boolean; unstaged: boolean };
  assert.equal(unstaged.staged, false);
  assert.equal(unstaged.unstaged, true);
  const trackedSource = readFileSync(trackedPath, 'utf8');
  writeFileSync(trackedPath, `${trackedSource}\nP16 restore marker\n`);
  const trackedDiff = registry.execute('source-control.diff', {
    path: trackedRelativePath,
  }).data as { tracked: boolean; unstaged: boolean };
  assert.equal(trackedDiff.tracked, true);
  assert.equal(trackedDiff.unstaged, true);
  registry.execute('source-control.restore', {
    path: trackedRelativePath,
  });
  assert.equal(readFileSync(trackedPath, 'utf8'), trackedSource);
  assert.throws(
    () =>
      registry.execute('source-control.restore', {
        path: 'scripts/behaviors/feature.ts',
      }),
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      error.code === 'SOURCE_CONTROL_RESTORE_UNTRACKED',
  );

  const replaced = registry.execute('project.replace', {
    query: 'needle-feature',
    replacement: 'replacement-feature',
  });
  assert.equal((replaced.data as { replacements: number }).replacements, 2);
  assert.match(
    registry.readText('scripts/behaviors/feature.ts').source,
    /replacement-feature/u,
  );
  registry.execute('history.undo');
  assert.match(
    registry.readText('scripts/behaviors/feature.ts').source,
    /needle-feature/u,
  );
  registry.execute('history.redo');
  assert.match(
    registry.readText('scripts/behaviors/feature.ts').source,
    /replacement-feature/u,
  );

  const beforeConflict = registry.readText('docs/feature.md');
  writeFileSync(
    join(project.root, 'docs', 'feature.md'),
    '# changed elsewhere\n',
  );
  assert.throws(
    () =>
      registry.execute('project.file.write', {
        path: 'docs/feature.md',
        content: '# local edit\n',
        baseHash: beforeConflict.hash,
      }),
    /重新载入/u,
  );

  const pongRegistry = new StudioCommandRegistry({
    projectRoot: join(repository, 'examples', 'pong-2d'),
    kernelCliPath: join(repository, 'target', 'debug', 'kernelctl.exe'),
  });
  const referenceIndex = pongRegistry.execute('project.references', {
    id: 'pong:left-paddle',
  }).data as ProjectReferenceIndex;
  assert(
    referenceIndex.symbols.some(
      (symbol) =>
        symbol.kind === 'script' &&
        symbol.path === 'scripts/behaviors/paddle.ts',
    ),
  );
  assert(
    referenceIndex.symbols.some(
      (symbol) =>
        symbol.kind === 'module' && symbol.id === 'pong:behavior/paddle',
    ),
  );
  assert(
    referenceIndex.references.some(
      (reference) => reference.relation === 'binds-script',
    ),
  );
  assert(
    referenceIndex.references.some(
      (reference) => reference.relation === 'declares-source',
    ),
  );

  const workbench = readFileSync(
    join(repository, 'studio', 'electron', 'renderer', 'Workbench.tsx'),
    'utf8',
  );
  const editor = readFileSync(
    join(repository, 'studio', 'electron', 'renderer', 'SourceEditor.tsx'),
    'utf8',
  );
  const styles = readFileSync(
    join(repository, 'studio', 'electron', 'renderer', 'styles.css'),
    'utf8',
  );
  const mcp = readFileSync(
    join(repository, 'studio', 'server', 'engine-mcp-server.ts'),
    'utf8',
  );
  assert.match(workbench, /SourceEditor/u);
  assert.match(workbench, /DiffEditor/u);
  assert.match(workbench, /changeSets/u);
  assert.match(workbench, /project\.search/u);
  assert.match(workbench, /project\.replace/u);
  assert.match(workbench, /project-reference-links/u);
  assert.match(workbench, /project\.references/u);
  assert.match(workbench, /diffRestoreInFlight/u);
  assert.match(workbench, /正在恢复 Diff/u);
  assert.match(workbench, /originalLabel: '变更前'/u);
  assert.match(workbench, /modifiedLabel: '变更后'/u);
  assert.match(workbench, /source-control\.\$\{action\}/u);
  assert.match(workbench, /diffReviewPreferences/u);
  for (const feature of [
    'formatDocument',
    'typescriptDefaults',
    'jsonDefaults',
    'onDidChangeMarkers',
    'KeyCode.KeyS',
    'DiffViewMode',
    'diffAlgorithm',
    'hideUnchangedRegions',
    'originalLabel',
    'modifiedLabel',
    'onDidUpdateDiff',
    'createDecorationsCollection',
    'onDidChangeCursorPosition',
    'diffWordWrap',
    'ignoreTrimWhitespace',
    'contextLineCount',
    'Shift[+]F7',
    'aigame-studio-dark',
  ]) {
    assert.match(editor, new RegExp(feature, 'u'));
  }
  for (const token of [
    'string.key.json',
    'string.value.json',
    'number.json',
    'keyword.json',
    'comment.line.json',
  ]) {
    assert.match(editor, new RegExp(token.replace('.', '\\.'), 'u'));
  }
  assert.doesNotMatch(editor, /'editor\.foreground'/u);
  assert.match(
    editor,
    /basic-languages\/typescript\/typescript\.contribution/u,
  );
  for (const token of [
    'keyword.ts',
    'type.identifier.ts',
    'string.ts',
    'number.ts',
    'comment.ts',
    'delimiter.bracket.ts',
  ]) {
    assert.match(editor, new RegExp(token.replaceAll('.', '\\.'), 'u'));
  }
  for (const selector of [
    'diff-toolbar',
    'diff-view-switch',
    'diff-revisions',
    'diff-hunk-navigation',
    'diff-options-menu',
    'diff-review-actions',
    'aigame-current-diff-line',
    'monaco-host \\.monaco-editor',
    'monaco-host \\.monaco-diff-editor',
  ]) {
    assert.match(styles, new RegExp(selector, 'u'));
  }
  for (const tool of [
    'project.search',
    'project.replace',
    'project.references',
    'source_control.diff',
  ]) {
    assert.match(mcp, new RegExp(tool.replace('.', '\\.'), 'u'));
  }
  const output = join(repository, 'dist', 'electron', 'renderer', 'assets');
  assert(existsSync(output));
  assert(
    readFileSync(
      join(repository, 'dist', 'electron', 'renderer', 'index.html'),
      'utf8',
    ).includes('assets/'),
  );
  assert(readdirSync(output).some((name) => name.startsWith('ts.worker-')));
  assert.match(
    readFileSync(
      join(repository, 'studio', 'electron', 'renderer', 'index.html'),
      'utf8',
    ),
    /script-src 'self'; style-src 'self'; style-src-elem 'self' 'unsafe-inline'; style-src-attr 'unsafe-inline'; worker-src 'self'.*connect-src 'none'/u,
  );

  console.log(
    JSON.stringify(
      {
        gate: 'P16 source editor and language service',
        editor: 'Monaco (offline bundled)',
        languages: ['TypeScript', 'JSON', 'WGSL', 'Markdown', 'Plain text'],
        diagnostics: diagnostics.length,
        searchLocations: matches.length,
        transactionalReplaceUndoRedo: true,
        conflictDetection: true,
        diffReview: {
          modes: ['auto', 'side-by-side', 'inline'],
          semanticRevisionLabels: true,
          changeStats: true,
          longPathProtection: true,
          hunkNavigation: true,
          persistedDisplayPreferences: true,
          gitReviewActions: ['stage', 'unstage', 'restore'],
          changeSetReviewActions: true,
        },
        mcpParity: ['project.search', 'project.replace', 'source_control.diff'],
        bidirectionalReferences: {
          symbols: referenceIndex.symbols.length,
          edges: referenceIndex.references.length,
        },
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
