import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

export type ProjectDiagnostic = {
  path: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  source: 'typescript' | 'json' | 'wgsl';
};

export type ProjectSearchMatch = {
  path: string;
  line: number;
  column: number;
  length: number;
  preview: string;
};

export type ProjectSymbolKind =
  | 'scene'
  | 'object'
  | 'component'
  | 'component-type'
  | 'script'
  | 'module'
  | 'system'
  | 'command'
  | 'event'
  | 'schema';

export type ProjectSymbol = {
  key: string;
  kind: ProjectSymbolKind;
  id: string;
  label: string;
  path: string;
  line: number;
  column: number;
};

export type ProjectReference = {
  from: string;
  to: string;
  relation:
    | 'contains'
    | 'instance-of'
    | 'binds-script'
    | 'declares-source'
    | 'uses-module'
    | 'queries-component'
    | 'uses-message'
    | 'validates-with';
};

export type ProjectReferenceIndex = {
  symbols: ProjectSymbol[];
  references: ProjectReference[];
};

const EXCLUDED = new Set(['.git', '.aigame', 'node_modules', 'dist', 'out']);
const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.json',
  '.wgsl',
  '.md',
  '.txt',
  '.toml',
  '.css',
  '.html',
]);

function position(
  source: string,
  offset: number,
): { line: number; column: number } {
  const before = source.slice(0, offset);
  const lines = before.split('\n');
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

export class StudioLanguageService {
  readonly #root: string;

  constructor(projectRoot: string) {
    this.#root = resolve(projectRoot);
  }

  search(query: string, paths?: string[]): ProjectSearchMatch[] {
    if (!query) return [];
    const selected = paths ? new Set(paths) : null;
    const matches: ProjectSearchMatch[] = [];
    for (const path of this.#textFiles()) {
      if (selected && !selected.has(path)) continue;
      const source = readFileSync(join(this.#root, path), 'utf8');
      let offset = 0;
      while (matches.length < 5_000) {
        const index = source.indexOf(query, offset);
        if (index < 0) break;
        const location = position(source, index);
        const lineSource = source.split('\n')[location.line - 1] ?? '';
        matches.push({
          path,
          line: location.line,
          column: location.column,
          length: query.length,
          preview: lineSource.trim().slice(0, 240),
        });
        offset = index + Math.max(1, query.length);
      }
    }
    return matches;
  }

  diagnostics(path?: string): ProjectDiagnostic[] {
    const files = path ? [path] : this.#textFiles();
    return files.flatMap((projectPath) => this.#diagnose(projectPath));
  }

  references(
    filter: { id?: string; path?: string } = {},
  ): ProjectReferenceIndex {
    const symbols = new Map<string, ProjectSymbol>();
    const references: ProjectReference[] = [];
    const add = (
      kind: ProjectSymbolKind,
      id: string,
      label: string,
      path: string,
      source: string,
    ) => {
      const location = position(
        source,
        Math.max(0, source.indexOf(JSON.stringify(id))),
      );
      const key = `${kind}:${id}`;
      symbols.set(key, { key, kind, id, label, path, ...location });
      return key;
    };
    const edge = (
      from: string,
      to: string,
      relation: ProjectReference['relation'],
    ) => {
      if (
        !references.some(
          (item) =>
            item.from === from && item.to === to && item.relation === relation,
        )
      )
        references.push({ from, to, relation });
    };

    for (const path of this.#textFiles().filter(
      (candidate) =>
        (candidate.startsWith('scenes/') || candidate.startsWith('prefabs/')) &&
        candidate.endsWith('.json'),
    )) {
      const source = readFileSync(join(this.#root, path), 'utf8');
      let document: {
        id?: string;
        name?: string;
        objects?: Array<Record<string, unknown>>;
      };
      try {
        document = JSON.parse(source) as typeof document;
      } catch {
        continue;
      }
      if (!document.id || !Array.isArray(document.objects)) continue;
      const sceneKey = add(
        'scene',
        document.id,
        document.name ?? document.id,
        path,
        source,
      );
      for (const value of document.objects) {
        if (typeof value.id !== 'string') continue;
        const objectKey = add(
          'object',
          value.id,
          typeof value.name === 'string' ? value.name : value.id,
          path,
          source,
        );
        edge(sceneKey, objectKey, 'contains');
        const components = Array.isArray(value.components)
          ? value.components
          : [];
        for (const component of components) {
          if (
            !component ||
            typeof component !== 'object' ||
            Array.isArray(component)
          )
            continue;
          const item = component as Record<string, unknown>;
          if (typeof item.id !== 'string' || typeof item.type !== 'string')
            continue;
          const componentKey = add(
            'component',
            item.id,
            item.type,
            path,
            source,
          );
          const typeKey = `component-type:${item.type}`;
          if (!symbols.has(typeKey))
            add('component-type', item.type, item.type, path, source);
          edge(objectKey, componentKey, 'contains');
          edge(componentKey, typeKey, 'instance-of');
          const data =
            item.data &&
            typeof item.data === 'object' &&
            !Array.isArray(item.data)
              ? (item.data as Record<string, unknown>)
              : {};
          if (item.type === 'core:script' && typeof data.path === 'string') {
            const scriptKey = `script:${data.path}`;
            if (!symbols.has(scriptKey)) {
              const scriptSource = existsSync(join(this.#root, data.path))
                ? readFileSync(join(this.#root, data.path), 'utf8')
                : '';
              add(
                'script',
                data.path,
                data.path.split('/').at(-1) ?? data.path,
                data.path,
                scriptSource,
              );
            }
            edge(componentKey, scriptKey, 'binds-script');
          }
        }
      }
    }

    const componentPath = 'capabilities/components.json';
    if (existsSync(join(this.#root, componentPath))) {
      const source = readFileSync(join(this.#root, componentPath), 'utf8');
      try {
        const document = JSON.parse(source) as {
          components?: Array<{ type?: string; label?: string }>;
        };
        for (const component of document.components ?? []) {
          if (typeof component.type === 'string') {
            add(
              'component-type',
              component.type,
              component.label ?? component.type,
              componentPath,
              source,
            );
          }
        }
      } catch {
        /* diagnostics report malformed JSON separately */
      }
    }

    const runtimePath = 'scripts/runtime.json';
    if (existsSync(join(this.#root, runtimePath))) {
      const source = readFileSync(join(this.#root, runtimePath), 'utf8');
      try {
        const runtime = JSON.parse(source) as {
          modules?: Array<{ id?: string; source?: string }>;
          systems?: Array<{ id?: string; module?: string; query?: string[] }>;
          commands?: Array<{ id?: string; payloadSchema?: string }>;
          events?: Array<{ id?: string; payloadSchema?: string }>;
        };
        for (const declaration of runtime.modules ?? []) {
          if (
            typeof declaration.id !== 'string' ||
            typeof declaration.source !== 'string'
          )
            continue;
          const moduleKey = add(
            'module',
            declaration.id,
            declaration.id,
            runtimePath,
            source,
          );
          const scriptKey = `script:${declaration.source}`;
          if (!symbols.has(scriptKey)) {
            const scriptSource = existsSync(
              join(this.#root, declaration.source),
            )
              ? readFileSync(join(this.#root, declaration.source), 'utf8')
              : '';
            add(
              'script',
              declaration.source,
              declaration.source.split('/').at(-1) ?? declaration.source,
              declaration.source,
              scriptSource,
            );
          }
          edge(moduleKey, scriptKey, 'declares-source');
        }
        for (const system of runtime.systems ?? []) {
          if (
            typeof system.id !== 'string' ||
            typeof system.module !== 'string'
          )
            continue;
          const systemKey = add(
            'system',
            system.id,
            system.id,
            runtimePath,
            source,
          );
          edge(systemKey, `module:${system.module}`, 'uses-module');
          for (const type of system.query ?? []) {
            const typeKey = `component-type:${type}`;
            if (!symbols.has(typeKey))
              add('component-type', type, type, runtimePath, source);
            edge(systemKey, typeKey, 'queries-component');
          }
        }
        for (const [kind, declarations] of [
          ['command', runtime.commands ?? []],
          ['event', runtime.events ?? []],
        ] as const) {
          for (const declaration of declarations) {
            if (
              typeof declaration.id !== 'string' ||
              typeof declaration.payloadSchema !== 'string'
            )
              continue;
            const declarationKey = add(
              kind,
              declaration.id,
              declaration.id,
              runtimePath,
              source,
            );
            const schemaKey = `schema:${declaration.payloadSchema}`;
            if (!symbols.has(schemaKey)) {
              const schemaSource = existsSync(
                join(this.#root, declaration.payloadSchema),
              )
                ? readFileSync(
                    join(this.#root, declaration.payloadSchema),
                    'utf8',
                  )
                : '';
              add(
                'schema',
                declaration.payloadSchema,
                declaration.payloadSchema.split('/').at(-1) ??
                  declaration.payloadSchema,
                declaration.payloadSchema,
                schemaSource,
              );
            }
            edge(declarationKey, schemaKey, 'validates-with');
            for (const script of symbols.values()) {
              if (
                script.kind === 'script' &&
                existsSync(join(this.#root, script.path)) &&
                readFileSync(join(this.#root, script.path), 'utf8').includes(
                  declaration.id,
                )
              ) {
                edge(script.key, declarationKey, 'uses-message');
              }
            }
          }
        }
      } catch {
        /* diagnostics report malformed JSON separately */
      }
    }

    const orderedSymbols = [...symbols.values()].sort(
      (left, right) =>
        left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id),
    );
    const selected = orderedSymbols.filter(
      (symbol) =>
        (filter.id === undefined || symbol.id === filter.id) &&
        (filter.path === undefined || symbol.path === filter.path),
    );
    if (filter.id === undefined && filter.path === undefined) {
      return { symbols: orderedSymbols, references };
    }
    const selectedKeys = new Set(selected.map((symbol) => symbol.key));
    for (let depth = 0; depth < 5; depth += 1) {
      for (const reference of references) {
        if (selectedKeys.has(reference.from)) selectedKeys.add(reference.to);
        if (selectedKeys.has(reference.to) && reference.relation !== 'contains')
          selectedKeys.add(reference.from);
      }
    }
    const filteredReferences = references.filter(
      (reference) =>
        selectedKeys.has(reference.from) && selectedKeys.has(reference.to),
    );
    return {
      symbols: orderedSymbols.filter((symbol) => selectedKeys.has(symbol.key)),
      references: filteredReferences,
    };
  }

  #diagnose(path: string): ProjectDiagnostic[] {
    const absolute = resolve(this.#root, path);
    if (
      absolute !== this.#root &&
      !absolute.startsWith(`${this.#root}\\`) &&
      !absolute.startsWith(`${this.#root}/`)
    )
      return [];
    if (!existsSync(absolute) || !statSync(absolute).isFile()) return [];
    const source = readFileSync(absolute, 'utf8');
    const extension = extname(path).toLowerCase();
    if (extension === '.ts' || extension === '.tsx') {
      if (path.endsWith('.d.ts')) return [];
      const output = ts.transpileModule(source, {
        fileName: path,
        reportDiagnostics: true,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          strict: true,
          noEmitOnError: false,
        },
      });
      return (output.diagnostics ?? []).map((diagnostic) => {
        const start = position(source, diagnostic.start ?? 0);
        const end = position(
          source,
          (diagnostic.start ?? 0) + (diagnostic.length ?? 1),
        );
        return {
          path,
          line: start.line,
          column: start.column,
          endLine: end.line,
          endColumn: end.column,
          severity:
            diagnostic.category === ts.DiagnosticCategory.Warning
              ? 'warning'
              : 'error',
          code: `TS${diagnostic.code}`,
          message: ts.flattenDiagnosticMessageText(
            diagnostic.messageText,
            '\n',
          ),
          source: 'typescript' as const,
        };
      });
    }
    if (extension === '.json') {
      try {
        JSON.parse(source);
        return [];
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const parsed = ts.parseConfigFileTextToJson(path, source);
        const diagnostic = parsed.error;
        const explicit = /line (\d+) column (\d+)/iu.exec(message);
        const offset =
          diagnostic?.start ??
          Number(/position (\d+)/iu.exec(message)?.[1] ?? 0);
        const start = explicit
          ? { line: Number(explicit[1]), column: Number(explicit[2]) }
          : position(source, offset);
        return [
          {
            path,
            line: start.line,
            column: start.column,
            endLine: start.line,
            endColumn: start.column + 1,
            severity: 'error',
            code: diagnostic ? `JSON${diagnostic.code}` : 'JSON_PARSE_ERROR',
            message: diagnostic
              ? ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
              : message,
            source: 'json',
          },
        ];
      }
    }
    if (extension === '.wgsl') {
      const stack: Array<{ token: string; offset: number }> = [];
      const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
      for (let offset = 0; offset < source.length; offset += 1) {
        const token = source[offset]!;
        if ('([{'.includes(token)) stack.push({ token, offset });
        if (')]}'.includes(token)) {
          const opening = stack.pop();
          if (!opening || opening.token !== pairs[token]) {
            const start = position(source, offset);
            return [
              {
                path,
                line: start.line,
                column: start.column,
                endLine: start.line,
                endColumn: start.column + 1,
                severity: 'error',
                code: 'WGSL_UNBALANCED_DELIMITER',
                message: `Unexpected ${token}`,
                source: 'wgsl',
              },
            ];
          }
        }
      }
      if (stack.length > 0) {
        const opening = stack.at(-1)!;
        const start = position(source, opening.offset);
        return [
          {
            path,
            line: start.line,
            column: start.column,
            endLine: start.line,
            endColumn: start.column + 1,
            severity: 'error',
            code: 'WGSL_UNCLOSED_DELIMITER',
            message: `Unclosed ${opening.token}`,
            source: 'wgsl',
          },
        ];
      }
    }
    return [];
  }

  #textFiles(): string[] {
    const walk = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        if (entry.isDirectory() && EXCLUDED.has(entry.name)) return [];
        const absolute = join(directory, entry.name);
        if (entry.isDirectory()) return walk(absolute);
        if (!TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())) return [];
        if (statSync(absolute).size > 4 * 1024 * 1024) return [];
        return [relative(this.#root, absolute).replaceAll('\\', '/')];
      });
    return walk(this.#root).sort();
  }
}
