import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { ProjectError } from '../project/project-types.ts';

function reportDirectory(root: string) {
  let directory = root;
  for (const segment of ['.aigame', 'local', 'test-results']) {
    directory = join(directory, segment);
    if (existsSync(directory) && lstatSync(directory).isSymbolicLink())
      throw new ProjectError(
        'TEST_RESULT_LINK_UNSUPPORTED',
        '测试历史目录不接受符号链接。',
      );
  }
  return directory;
}

export type RuntimeTestSummary = {
  status: 'passed' | 'failed' | 'unavailable';
  testRunId: string;
  completedAt: string;
  tick?: number;
  durationMs?: number;
  error?: string;
};

export function persistRuntimeTestReport(
  root: string,
  path: string,
  testResult: unknown,
) {
  const testRunId = `test-run:${createHash('sha256').update(JSON.stringify({ path, testResult })).digest('hex').slice(0, 24)}`;
  const directory = reportDirectory(root);
  mkdirSync(directory, { recursive: true });
  const reportPath = join(directory, `${testRunId.replace(':', '_')}.json`);
  const report = JSON.stringify({ testRunId, path, result: testResult });
  if (!existsSync(reportPath))
    writeFileSync(reportPath, report, { flag: 'wx' });
  else {
    if (
      lstatSync(reportPath).isSymbolicLink() ||
      readFileSync(reportPath, 'utf8') !== report
    )
      throw new ProjectError(
        'TEST_RESULT_ID_COLLISION',
        'Existing test report content does not match its identity.',
      );
    // Identical content keeps its address; completion time still reflects this run.
    const now = new Date();
    utimesSync(reportPath, now, now);
  }
  return { testRunId, report, reportPath };
}

/** Read compact feedback, not hundreds of full debug histories on every poll. */
export class RuntimeTestReportStore {
  #root: string;
  #directory: string;
  #cache = new Map<
    string,
    { stamp: string; path?: string; summary?: RuntimeTestSummary }
  >();
  constructor(root: string) {
    this.#root = root;
    this.#directory = join(root, '.aigame', 'local', 'test-results');
  }
  latest(paths: string[]): Record<string, RuntimeTestSummary> {
    try {
      reportDirectory(this.#root);
    } catch {
      return {};
    }
    if (
      !existsSync(this.#directory) ||
      lstatSync(this.#directory).isSymbolicLink()
    )
      return {};
    const wanted = new Set(paths);
    const result: Record<string, RuntimeTestSummary> = {};
    let bytesRead = 0;
    const reports = readdirSync(this.#directory)
      .filter((name) => /^test-run_[a-f0-9]{24}\.json$/u.test(name))
      .flatMap((name) => {
        try {
          return [{ name, stats: lstatSync(join(this.#directory, name)) }];
        } catch {
          return [];
        }
      })
      .filter(({ stats }) => stats.isFile() && !stats.isSymbolicLink())
      .sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);
    const present = new Set(reports.map(({ name }) => name));
    for (const name of this.#cache.keys())
      if (!present.has(name)) this.#cache.delete(name);
    for (const { name, stats } of reports.slice(0, 3000)) {
      if (wanted.size === 0) break;
      const stamp = `${stats.mtimeMs}:${stats.ctimeMs}:${stats.size}`;
      let cached = this.#cache.get(name);
      const source = join(this.#directory, name);
      if (!cached || cached.stamp !== stamp) {
        cached = { stamp };
        this.#cache.set(name, cached);
        const header = Buffer.alloc(Math.min(stats.size, 4096));
        let descriptor: number;
        try {
          descriptor = openSync(source, 'r');
        } catch {
          continue;
        }
        try {
          readSync(descriptor, header, 0, header.length, 0);
        } finally {
          closeSync(descriptor);
        }
        // These are the existing compact, content-addressed MCP report headers.
        const match =
          /^\{"testRunId":("(?:[^"\\]|\\.)*"),"path":("(?:[^"\\]|\\.)*"),"result":/u.exec(
            header.toString('utf8'),
          );
        if (match) {
          try {
            cached.path = JSON.parse(match[2]!);
          } catch {
            /* malformed local metadata */
          }
        }
      }
      if (!cached.path || !wanted.has(cached.path)) continue;
      if (!cached.summary) {
        const id = name.slice(0, -5).replace('_', ':');
        cached.summary = {
          status: 'unavailable',
          testRunId: id,
          completedAt: stats.mtime.toISOString(),
          error: '测试历史不可读取或校验失败，请重新运行。',
        };
        if (
          stats.size <= 16 * 1024 * 1024 &&
          bytesRead + stats.size <= 128 * 1024 * 1024
        ) {
          bytesRead += stats.size;
          try {
            const report = JSON.parse(readFileSync(source, 'utf8'));
            const expected = `test-run:${createHash('sha256')
              .update(
                JSON.stringify({
                  path: report.path,
                  testResult: report.result,
                }),
              )
              .digest('hex')
              .slice(0, 24)}`;
            if (
              report.testRunId === id &&
              expected === id &&
              report.path === cached.path &&
              ['completed', 'failed'].includes(report.result?.status)
            ) {
              cached.summary = {
                status:
                  report.result.status === 'completed' ? 'passed' : 'failed',
                testRunId: id,
                completedAt: stats.mtime.toISOString(),
                tick: report.result.tick,
                ...(report.result.status === 'failed'
                  ? {
                      error: String(
                        report.result.diagnostics?.[0]?.message ?? '测试失败',
                      ).slice(0, 500),
                    }
                  : {}),
              };
            }
          } catch {
            /* Never convert damaged history into a passing badge. */
          }
        }
      }
      result[cached.path] = cached.summary;
      wanted.delete(cached.path);
    }
    return result;
  }
}
