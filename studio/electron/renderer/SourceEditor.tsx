import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
import 'monaco-editor/esm/vs/basic-languages/wgsl/wgsl.contribution';
import 'monaco-editor/esm/vs/language/json/monaco.contribution';
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution';
import 'monaco-editor/min/vs/editor/editor.main.css';
import {
  ChevronDown,
  ChevronUp,
  Code2,
  Columns2,
  ExternalLink,
  Rows3,
  Save,
  Settings2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { DiffReviewPreferences } from '../../workspace/workspace-types.ts';

import './monaco-environment.ts';

export type EditorDiagnostic = {
  path: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  source: string;
};

type Props = {
  path: string;
  source: string;
  dirty: boolean;
  disabled?: boolean;
  onChange: (source: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onDiagnostics: (diagnostics: EditorDiagnostic[]) => void;
  navigation?: { line: number; column: number; nonce: number };
};

const sdkTypes = `
declare module '@aigame/sdk' {
  export type ObjectId = string;
  export type ComponentType = string;
  export type RuntimeComponent = { id: string; type: ComponentType; enabled?: boolean; data: Record<string, unknown> };
  export type RuntimeObject = { id: ObjectId; name?: string; enabled?: boolean; visible?: boolean; locked?: boolean; parentId?: ObjectId | null; order?: number; components: RuntimeComponent[] };
  export type ProjectEvent<T = Readonly<Record<string, unknown>>> = Readonly<{
    type: string;
    payload: T;
  }>;
  export type AuthoritativeContext = {
    readonly tick: number;
    readonly deltaSeconds: number;
    readonly objectId: ObjectId | null;
    get<T>(component: ComponentType): Readonly<T> | undefined;
    get<T>(object: ObjectId, component: ComponentType): Readonly<T> | undefined;
    set<T>(component: ComponentType, value: T): void;
    set<T>(object: ObjectId, component: ComponentType, value: T): void;
    query(components: readonly ComponentType[]): readonly ObjectId[];
    emit<T>(event: string, payload: Readonly<T>): void;
    spawn(object: RuntimeObject): ObjectId;
    destroy(object?: ObjectId): void;
    setEnabled(object: ObjectId, enabled: boolean): void;
    setVisible(object: ObjectId, visible: boolean): void;
    loadScene(scene: string): void;
    randomU32(): number;
  };
  export type FrameContext = Readonly<{
    readonly tick: number;
    readonly alpha: number;
    readonly deltaSeconds: number;
    readonly objectId: ObjectId | null;
    get<T>(component: ComponentType): Readonly<T> | undefined;
    get<T>(object: ObjectId, component: ComponentType): Readonly<T> | undefined;
    query(components: readonly ComponentType[]): readonly ObjectId[];
  }>;
  export interface Behavior {
    onStart?(context: AuthoritativeContext): void;
    onEnable?(context: AuthoritativeContext): void;
    onFixedUpdate?(context: AuthoritativeContext): void;
    onFrame?(context: FrameContext): void;
    onInput?(action: string, value: number, context: AuthoritativeContext): void;
    onCommand?(command: ProjectEvent, context: AuthoritativeContext): void;
    onEvent?(event: ProjectEvent, context: AuthoritativeContext): void;
    onCollisionEnter?(otherObject: ObjectId, context: AuthoritativeContext): void;
    onCollisionExit?(otherObject: ObjectId, context: AuthoritativeContext): void;
    onDisable?(context: AuthoritativeContext): void;
    onDestroy?(context: AuthoritativeContext): void;
  }
  export interface System {
    onFixedUpdate?(context: AuthoritativeContext & { objects: readonly ObjectId[] }): void;
    onCommand?(command: ProjectEvent, context: AuthoritativeContext & { objects: readonly ObjectId[] }): void;
    onEvent?(event: ProjectEvent, context: AuthoritativeContext & { objects: readonly ObjectId[] }): void;
  }
  export function defineBehavior<T extends Behavior>(behavior: T): T;
  export function defineSystem<T extends System>(system: T): T;
}
`;

let configured = false;

function configureLanguages() {
  if (configured) return;
  configured = true;
  monaco.editor.defineTheme('aigame-studio-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'C586C0' },
      { token: 'keyword.ts', foreground: 'C586C0' },
      { token: 'type.identifier', foreground: '4EC9B0' },
      { token: 'type.identifier.ts', foreground: '4EC9B0' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'string.ts', foreground: 'CE9178' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'number.ts', foreground: 'B5CEA8' },
      { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
      { token: 'comment.ts', foreground: '6A9955', fontStyle: 'italic' },
      { token: 'delimiter.bracket', foreground: 'FFD700' },
      { token: 'delimiter.bracket.ts', foreground: 'FFD700' },
      { token: 'string.key.json', foreground: '9CDCFE' },
      { token: 'string.value.json', foreground: 'CE9178' },
      { token: 'number.json', foreground: 'B5CEA8' },
      { token: 'keyword.json', foreground: '569CD6' },
      { token: 'comment.line.json', foreground: '6A9955', fontStyle: 'italic' },
      {
        token: 'comment.block.json',
        foreground: '6A9955',
        fontStyle: 'italic',
      },
      { token: 'delimiter.bracket.json', foreground: 'D4D4D4' },
      { token: 'delimiter.array.json', foreground: 'D4D4D4' },
      { token: 'delimiter.colon.json', foreground: '808B96' },
      { token: 'delimiter.comma.json', foreground: '808B96' },
    ],
    colors: {
      'editor.background': '#090d13',
      'editor.lineHighlightBackground': '#111923',
      'editorLineNumber.foreground': '#52606d',
      'editorLineNumber.activeForeground': '#b8c4cf',
      'editorGutter.background': '#090d13',
      'diffEditor.insertedLineBackground': '#183c2b99',
      'diffEditor.removedLineBackground': '#49242b99',
      'diffEditor.insertedTextBackground': '#2fbf714f',
      'diffEditor.removedTextBackground': '#f05b6657',
      'diffEditorGutter.insertedLineBackground': '#238a52a6',
      'diffEditorGutter.removedLineBackground': '#b53f4aa6',
      'diffEditorOverview.insertedForeground': '#45d483',
      'diffEditorOverview.removedForeground': '#ff6673',
      'diffEditor.unchangedRegionBackground': '#0d131b',
      'diffEditor.unchangedRegionForeground': '#71808d',
      'diffEditor.unchangedCodeBackground': '#090d13',
      'diffEditor.unchangedRegionShadow': '#0000008a',
      'editorOverviewRuler.border': '#00000000',
    },
  });
  monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    strict: true,
    allowNonTsExtensions: true,
    noEmit: true,
  });
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    sdkTypes,
    'aigame:///generated/game-sdk.d.ts',
  );
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: false,
    trailingCommas: 'error',
  });
}

function languageFor(path: string): string {
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.wgsl')) return 'wgsl';
  if (path.endsWith('.md')) return 'markdown';
  return 'plaintext';
}

function severity(value: monaco.MarkerSeverity): EditorDiagnostic['severity'] {
  if (value >= monaco.MarkerSeverity.Error) return 'error';
  if (value >= monaco.MarkerSeverity.Warning) return 'warning';
  return 'info';
}

export function SourceEditor(props: Props) {
  const {
    path,
    source,
    navigation,
    onChange: handleChange,
    onSave: handleSave,
    onDiagnostics: handleDiagnostics,
  } = props;
  const host = useRef<HTMLDivElement | null>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const model = useRef<monaco.editor.ITextModel | null>(null);
  const initialSource = useRef(source);
  const onChange = useRef(handleChange);
  const onSave = useRef(handleSave);
  const onDiagnostics = useRef(handleDiagnostics);
  const [position, setPosition] = useState('Ln 1, Col 1');
  const [diagnosticCount, setDiagnosticCount] = useState(0);

  useEffect(() => {
    onChange.current = (nextSource) => handleChange(nextSource);
    onSave.current = () => handleSave();
    onDiagnostics.current = (diagnostics) => handleDiagnostics(diagnostics);
  }, [handleChange, handleSave, handleDiagnostics]);

  useEffect(() => {
    configureLanguages();
    if (!host.current) return;
    const uri = monaco.Uri.from({ scheme: 'aigame', path: `/${path}` });
    const textModel =
      monaco.editor.getModel(uri) ??
      monaco.editor.createModel(initialSource.current, languageFor(path), uri);
    model.current = textModel;
    if (textModel.getValue() !== initialSource.current)
      textModel.setValue(initialSource.current);
    const instance = monaco.editor.create(host.current, {
      model: textModel,
      theme: 'aigame-studio-dark',
      ariaLabel: `源码编辑器 ${path}`,
      automaticLayout: true,
      fontFamily: 'Cascadia Code, Consolas, monospace',
      fontSize: 13,
      lineHeight: 20,
      minimap: { enabled: true },
      stickyScroll: { enabled: true },
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      formatOnPaste: true,
      scrollBeyondLastLine: false,
      tabSize: 2,
    });
    editor.current = instance;
    const change = instance.onDidChangeModelContent(() =>
      onChange.current((() => instance.getValue())()),
    );
    const cursor = instance.onDidChangeCursorPosition((event) =>
      setPosition(
        `Ln ${event.position.lineNumber}, Col ${event.position.column}`,
      ),
    );
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () =>
      (() => onSave.current())(),
    );
    const markers = monaco.editor.onDidChangeMarkers((resources) => {
      if (!resources.some((resource) => resource.toString() === uri.toString()))
        return;
      const diagnostics = monaco.editor
        .getModelMarkers({ resource: uri })
        .map((marker) => ({
          path,
          line: marker.startLineNumber,
          column: marker.startColumn,
          endLine: marker.endLineNumber,
          endColumn: marker.endColumn,
          severity: severity(marker.severity),
          message: marker.message,
          source: marker.source ?? 'language-service',
        }));
      setDiagnosticCount(diagnostics.length);
      (() => onDiagnostics.current(diagnostics))();
    });
    instance.focus();
    return () => {
      change.dispose();
      cursor.dispose();
      markers.dispose();
      instance.dispose();
      editor.current = null;
    };
  }, [path]);

  useEffect(() => {
    if (model.current && model.current.getValue() !== source) {
      model.current.setValue(source);
      editor.current?.layout();
      editor.current?.render(true);
    }
  }, [source]);

  useEffect(() => {
    if (!navigation || !editor.current) return;
    editor.current.setPosition({
      lineNumber: navigation.line,
      column: navigation.column,
    });
    editor.current.revealLineInCenter(navigation.line);
    editor.current.focus();
  }, [navigation]);

  return (
    <div
      className="source-editor monaco-source-editor"
      data-source-ready={source.length > 0 ? 'true' : 'false'}
    >
      <div className="source-actions">
        <span>
          <Code2 /> {path}
        </span>
        <button
          disabled={!props.dirty || props.disabled}
          onClick={() => props.onSave()}
        >
          <Save /> 保存
        </button>
        <button
          onClick={() =>
            void editor.current
              ?.getAction('editor.action.formatDocument')
              ?.run()
          }
        >
          <Sparkles /> 格式化
        </button>
        <button
          aria-label={`删除 ${path}`}
          title={`删除 ${path}`}
          onClick={() => props.onDelete()}
        >
          <Trash2 />
        </button>
      </div>
      <div ref={host} className="monaco-host" />
      <footer>
        <span>{languageFor(path)}</span>
        <span>{diagnosticCount} problems</span>
        <span>{position}</span>
      </footer>
    </div>
  );
}

type DiffViewMode = DiffReviewPreferences['viewMode'];

export type DiffReviewAction = {
  id: string;
  label: string;
  title: string;
  tone?: 'default' | 'positive' | 'danger';
  onInvoke: () => void;
};

type DiffStats = {
  added: number;
  removed: number;
  hunks: number;
};

export function DiffEditor(props: {
  path: string;
  before: string;
  after: string;
  source: 'git' | 'changeset';
  context?: string;
  originalLabel: string;
  modifiedLabel: string;
  preferences: DiffReviewPreferences;
  disabled?: boolean;
  actions?: DiffReviewAction[];
  onOpenFile?: () => void;
  onPreferencesChange: (preferences: DiffReviewPreferences) => void;
}) {
  const root = useRef<HTMLDivElement | null>(null);
  const host = useRef<HTMLDivElement | null>(null);
  const editor = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const lineChanges = useRef<monaco.editor.ILineChange[]>([]);
  const originalDecorations =
    useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const modifiedDecorations =
    useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [stats, setStats] = useState<DiffStats | null>(null);
  const [currentHunk, setCurrentHunk] = useState(0);
  const [diffGeneration, setDiffGeneration] = useState(0);
  const currentHunkRef = useRef(0);
  const sideBySide =
    props.preferences.viewMode === 'side-by-side' ||
    (props.preferences.viewMode === 'auto' && availableWidth >= 960);

  const updatePreference = <Key extends keyof DiffReviewPreferences>(
    key: Key,
    value: DiffReviewPreferences[Key],
  ) => props.onPreferencesChange({ ...props.preferences, [key]: value });

  const goToHunk = useCallback((delta: number) => {
    const changes = lineChanges.current;
    if (changes.length === 0) return;
    const next =
      (currentHunkRef.current + delta + changes.length) % changes.length;
    const change = changes[next]!;
    const originalLine = Math.max(1, change.originalStartLineNumber);
    const modifiedLine = Math.max(1, change.modifiedStartLineNumber);
    currentHunkRef.current = next;
    setCurrentHunk(next);
    editor.current?.getOriginalEditor().revealLineInCenter(originalLine);
    editor.current?.getModifiedEditor().revealLineInCenter(modifiedLine);
    const focusModified = change.modifiedEndLineNumber !== 0;
    const target = focusModified
      ? editor.current?.getModifiedEditor()
      : editor.current?.getOriginalEditor();
    target?.setPosition({
      lineNumber: focusModified ? modifiedLine : originalLine,
      column: 1,
    });
    target?.focus();
  }, []);

  useEffect(() => {
    if (!root.current) return;
    const resizeObserver = new ResizeObserver(([entry]) => {
      if (entry) setAvailableWidth(entry.contentRect.width);
    });
    resizeObserver.observe(root.current);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    configureLanguages();
    if (!host.current) return;
    setStats(null);
    currentHunkRef.current = 0;
    setCurrentHunk(0);
    const language = languageFor(props.path);
    const nonce = crypto.randomUUID();
    const original = monaco.editor.createModel(
      props.before,
      language,
      monaco.Uri.parse(`aigame-diff-original:///${nonce}/${props.path}`),
    );
    const modified = monaco.editor.createModel(
      props.after,
      language,
      monaco.Uri.parse(`aigame-diff-modified:///${nonce}/${props.path}`),
    );
    const instance = monaco.editor.createDiffEditor(host.current, {
      theme: 'aigame-studio-dark',
      automaticLayout: true,
      readOnly: true,
      renderSideBySide: true,
      enableSplitViewResizing: true,
      splitViewDefaultRatio: 0.5,
      useInlineViewWhenSpaceIsLimited: false,
      compactMode: false,
      diffAlgorithm: 'advanced',
      ignoreTrimWhitespace: false,
      renderIndicators: true,
      renderMarginRevertIcon: false,
      renderOverviewRuler: true,
      hideUnchangedRegions: {
        enabled: true,
        revealLineCount: 3,
        minimumLineCount: 8,
        contextLineCount: 3,
      },
      fontFamily: 'Cascadia Code, Consolas, monospace',
      fontSize: 12,
      lineHeight: 19,
      lineNumbersMinChars: 3,
      glyphMargin: false,
      folding: false,
      stickyScroll: { enabled: false },
      diffWordWrap: 'off',
      wordWrap: 'off',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      padding: { top: 8, bottom: 8 },
      scrollbar: {
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
      },
    });
    editor.current = instance;
    instance.setModel({ original, modified });
    for (const codeEditor of [
      instance.getOriginalEditor(),
      instance.getModifiedEditor(),
    ]) {
      codeEditor.addCommand(monaco.KeyCode.F7, () => goToHunk(1));
      codeEditor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.F7, () =>
        goToHunk(-1),
      );
    }
    originalDecorations.current = instance
      .getOriginalEditor()
      .createDecorationsCollection();
    modifiedDecorations.current = instance
      .getModifiedEditor()
      .createDecorationsCollection();
    const selectClosestHunk = (
      side: 'original' | 'modified',
      lineNumber: number,
    ) => {
      const changes = lineChanges.current;
      if (changes.length === 0) return;
      let closest = 0;
      let distance = Number.POSITIVE_INFINITY;
      for (const [index, change] of changes.entries()) {
        const line = Math.max(
          1,
          side === 'original'
            ? change.originalStartLineNumber
            : change.modifiedStartLineNumber,
        );
        const nextDistance = Math.abs(lineNumber - line);
        if (nextDistance < distance) {
          closest = index;
          distance = nextDistance;
        }
      }
      currentHunkRef.current = closest;
      setCurrentHunk(closest);
    };
    const updateStats = () => {
      const nextLineChanges = instance.getLineChanges();
      if (!nextLineChanges) return;
      lineChanges.current = nextLineChanges;
      setStats(
        nextLineChanges.reduce(
          (total, change) => ({
            removed:
              total.removed +
              (change.originalEndLineNumber === 0
                ? 0
                : change.originalEndLineNumber -
                  change.originalStartLineNumber +
                  1),
            added:
              total.added +
              (change.modifiedEndLineNumber === 0
                ? 0
                : change.modifiedEndLineNumber -
                  change.modifiedStartLineNumber +
                  1),
            hunks: total.hunks + 1,
          }),
          { added: 0, removed: 0, hunks: 0 },
        ),
      );
      setCurrentHunk((current) => {
        const next = Math.min(current, Math.max(0, nextLineChanges.length - 1));
        currentHunkRef.current = next;
        return next;
      });
      setDiffGeneration((current) => current + 1);
    };
    const diffUpdate = instance.onDidUpdateDiff(updateStats);
    const originalCursor = instance
      .getOriginalEditor()
      .onDidChangeCursorPosition((event) =>
        selectClosestHunk('original', event.position.lineNumber),
      );
    const modifiedCursor = instance
      .getModifiedEditor()
      .onDidChangeCursorPosition((event) =>
        selectClosestHunk('modified', event.position.lineNumber),
      );
    updateStats();
    return () => {
      diffUpdate.dispose();
      originalCursor.dispose();
      modifiedCursor.dispose();
      originalDecorations.current?.clear();
      modifiedDecorations.current?.clear();
      originalDecorations.current = null;
      modifiedDecorations.current = null;
      lineChanges.current = [];
      instance.dispose();
      original.dispose();
      modified.dispose();
      editor.current = null;
    };
  }, [props.path, props.before, props.after, goToHunk]);

  useEffect(() => {
    const instance = editor.current;
    if (!instance) return;
    instance.updateOptions({
      renderSideBySide: sideBySide,
      ignoreTrimWhitespace: props.preferences.ignoreTrimWhitespace,
      diffWordWrap: props.preferences.wordWrap ? 'on' : 'off',
      wordWrap: props.preferences.wordWrap ? 'on' : 'off',
      hideUnchangedRegions: {
        enabled: props.preferences.hideUnchangedRegions,
        revealLineCount: 3,
        minimumLineCount: 8,
        contextLineCount: props.preferences.contextLineCount,
      },
    });
  }, [sideBySide, props.preferences]);

  useEffect(() => {
    const change = lineChanges.current[currentHunk];
    const instance = editor.current;
    if (!change || !instance) {
      originalDecorations.current?.clear();
      modifiedDecorations.current?.clear();
      return;
    }
    const range = (
      model: monaco.editor.ITextModel,
      startLineNumber: number,
      endLineNumber: number,
    ) => {
      const start = Math.min(
        model.getLineCount(),
        Math.max(1, startLineNumber),
      );
      const end = Math.min(
        model.getLineCount(),
        Math.max(start, endLineNumber || startLineNumber),
      );
      return new monaco.Range(start, 1, end, model.getLineMaxColumn(end));
    };
    const originalModel = instance.getOriginalEditor().getModel();
    const modifiedModel = instance.getModifiedEditor().getModel();
    if (originalModel)
      originalDecorations.current?.set([
        {
          range: range(
            originalModel,
            change.originalStartLineNumber,
            change.originalEndLineNumber,
          ),
          options: {
            isWholeLine: true,
            className: 'aigame-current-diff-line',
            marginClassName: 'aigame-current-diff-margin',
          },
        },
      ]);
    if (modifiedModel)
      modifiedDecorations.current?.set([
        {
          range: range(
            modifiedModel,
            change.modifiedStartLineNumber,
            change.modifiedEndLineNumber,
          ),
          options: {
            isWholeLine: true,
            className: 'aigame-current-diff-line',
            marginClassName: 'aigame-current-diff-margin',
          },
        },
      ]);
  }, [currentHunk, diffGeneration]);

  const sourceLabel = props.source === 'changeset' ? 'Codex ChangeSet' : 'Git';
  return (
    <section
      className="diff-editor"
      data-layout={sideBySide ? 'side-by-side' : 'inline'}
      ref={root}
      aria-label={`Diff 审查：${props.path}`}
    >
      <header className="diff-toolbar">
        <div className="diff-title">
          <Code2 />
          <strong
            title={`${props.path}${props.context ? `\n${props.context}` : ''}`}
          >
            {props.path}
          </strong>
          <small>{sourceLabel}</small>
          <span className="diff-revisions" aria-label="Diff 版本">
            <b data-revision="original">{props.originalLabel}</b>
            <i>→</i>
            <b data-revision="modified">{props.modifiedLabel}</b>
          </span>
        </div>
        <div className="diff-toolbar-actions">
          <span className="diff-stats" aria-label="Diff 行数统计">
            {stats ? (
              <>
                <b data-tone="added">+{stats.added}</b>
                <b data-tone="removed">-{stats.removed}</b>
              </>
            ) : (
              <small>比较中…</small>
            )}
          </span>
          <span className="diff-hunk-navigation" aria-label="变更导航">
            <button
              disabled={!stats?.hunks}
              onClick={() => goToHunk(-1)}
              title="上一处变更 (Shift+F7)"
            >
              <ChevronUp />
            </button>
            <output aria-live="polite">
              {stats?.hunks ? currentHunk + 1 : 0}/{stats?.hunks ?? 0}
            </output>
            <button
              disabled={!stats?.hunks}
              onClick={() => goToHunk(1)}
              title="下一处变更 (F7)"
            >
              <ChevronDown />
            </button>
          </span>
          <fieldset className="diff-view-switch" aria-label="Diff 视图">
            <button
              aria-label="自动布局"
              aria-pressed={props.preferences.viewMode === 'auto'}
              onClick={() =>
                updatePreference('viewMode', 'auto' as DiffViewMode)
              }
              title="根据编辑区宽度自动选择布局"
            >
              A
            </button>
            <button
              aria-label="并排布局"
              aria-pressed={props.preferences.viewMode === 'side-by-side'}
              onClick={() =>
                updatePreference('viewMode', 'side-by-side' as DiffViewMode)
              }
              title="并排 Diff"
            >
              <Columns2 />
            </button>
            <button
              aria-label="内联布局"
              aria-pressed={props.preferences.viewMode === 'inline'}
              onClick={() =>
                updatePreference('viewMode', 'inline' as DiffViewMode)
              }
              title="内联 Diff"
            >
              <Rows3 />
            </button>
          </fieldset>
          <details className="diff-options-menu">
            <summary title="Diff 显示选项" aria-label="Diff 显示选项">
              <Settings2 />
            </summary>
            <div>
              <strong>显示选项</strong>
              <label>
                <input
                  type="checkbox"
                  checked={props.preferences.ignoreTrimWhitespace}
                  onChange={(event) =>
                    updatePreference(
                      'ignoreTrimWhitespace',
                      event.target.checked,
                    )
                  }
                />
                忽略首尾空白
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={props.preferences.wordWrap}
                  onChange={(event) =>
                    updatePreference('wordWrap', event.target.checked)
                  }
                />
                自动换行
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={props.preferences.hideUnchangedRegions}
                  onChange={(event) =>
                    updatePreference(
                      'hideUnchangedRegions',
                      event.target.checked,
                    )
                  }
                />
                折叠未修改区域
              </label>
              <label>
                上下文行
                <select
                  value={props.preferences.contextLineCount}
                  disabled={!props.preferences.hideUnchangedRegions}
                  onChange={(event) =>
                    updatePreference(
                      'contextLineCount',
                      Number(event.target.value) as 3 | 5 | 10,
                    )
                  }
                >
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                </select>
              </label>
            </div>
          </details>
          {props.onOpenFile && (
            <button
              className="diff-open-file"
              onClick={props.onOpenFile}
              title="在编辑器中打开文件"
              aria-label="在编辑器中打开文件"
            >
              <ExternalLink />
            </button>
          )}
          {props.actions && props.actions.length > 0 && (
            <span className="diff-review-actions" aria-label="审查动作">
              {props.actions.map((action) => (
                <button
                  key={action.id}
                  data-tone={action.tone ?? 'default'}
                  disabled={props.disabled}
                  onClick={action.onInvoke}
                  title={action.title}
                >
                  {action.label}
                </button>
              ))}
            </span>
          )}
        </div>
      </header>
      <div ref={host} className="monaco-host" />
    </section>
  );
}
