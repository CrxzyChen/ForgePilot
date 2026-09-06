import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { readProjectManifest } from './project-schema.ts';
import {
  type DoctorCheck,
  type DoctorDiagnostic,
  type DoctorReport,
  ProjectError,
} from './project-types.ts';

export type ProjectDoctorOptions = {
  kernelCliPath?: string;
  engineMcpPath?: string;
  engineMcpEnvironment?: NodeJS.ProcessEnv;
};

function filesNamed(root: string, filename: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return filesNamed(path, filename);
    return entry.name === filename ? [path] : [];
  });
}

function insideProject(projectRoot: string, path: string): boolean {
  const pathFromRoot = relative(resolve(projectRoot), resolve(path));
  return (
    pathFromRoot === '' ||
    (!isAbsolute(pathFromRoot) &&
      pathFromRoot !== '..' &&
      !pathFromRoot.startsWith(
        `..${process.platform === 'win32' ? '\\' : '/'}`,
      ))
  );
}

export function runProjectDoctor(
  projectRoot: string,
  options: ProjectDoctorOptions = {},
): DoctorReport {
  const root = resolve(projectRoot);
  const checks: DoctorCheck[] = [];
  const diagnostics: DoctorDiagnostic[] = [];
  const check = (
    id: string,
    label: string,
    status: DoctorCheck['status'],
  ): void => {
    checks.push({ id, label, status });
  };
  const diagnose = (diagnostic: DoctorDiagnostic): void => {
    diagnostics.push(diagnostic);
  };

  let manifest;
  try {
    manifest = readProjectManifest(join(root, 'project.aigame.json'));
    check('manifest', '项目清单与格式版本', 'passed');
  } catch (error) {
    const projectError =
      error instanceof ProjectError
        ? error
        : new ProjectError('PROJECT_MANIFEST_READ_FAILED', String(error));
    diagnose({
      code: projectError.code,
      severity: 'error',
      message: projectError.message,
      path: 'project.aigame.json',
      remediation: '修复或迁移项目清单后重新运行 Project Doctor。',
    });
    check('manifest', '项目清单与格式版本', 'failed');
  }

  if (manifest) {
    const entryPath = resolve(root, manifest.entry.scene);
    if (!insideProject(root, entryPath) || !existsSync(entryPath)) {
      diagnose({
        code: 'PROJECT_ENTRY_MISSING',
        severity: 'error',
        message: '入口场景不存在或逃逸项目目录。',
        path: manifest.entry.scene,
      });
      check('entry', '入口场景', 'failed');
    } else {
      try {
        const entry = JSON.parse(readFileSync(entryPath, 'utf8')) as {
          schemaVersion?: string;
          id?: string;
          name?: string;
          space?: string;
          objects?: unknown;
        };
        if (
          entry.schemaVersion !== '2.0.0-alpha.1' ||
          !entry.id ||
          !entry.name ||
          !['2d', '3d', 'ui', 'mixed'].includes(entry.space ?? '') ||
          !Array.isArray(entry.objects)
        ) {
          throw new Error('入口场景不是受支持的通用 Scene 2.0 项目');
        }
        check('entry', '入口场景', 'passed');
      } catch (error) {
        diagnose({
          code: 'PROJECT_ENTRY_INVALID',
          severity: 'error',
          message: String(error),
          path: manifest.entry.scene,
        });
        check('entry', '入口场景', 'failed');
      }
    }
  }

  const agentsPath = join(root, 'AGENTS.md');
  if (
    !existsSync(agentsPath) ||
    readFileSync(agentsPath, 'utf8').trim().length < 80
  ) {
    diagnose({
      code: 'PROJECT_AGENTS_MISSING',
      severity: 'error',
      message: '缺少可用的根 AGENTS.md。',
      path: 'AGENTS.md',
    });
    check('agents', 'Codex 项目规则', 'failed');
  } else {
    check('agents', 'Codex 项目规则', 'passed');
  }

  const skillRoot = join(root, '.agents', 'skills');
  const skillFiles = filesNamed(skillRoot, 'SKILL.md');
  const requiredSkillNames = [
    'author-scene',
    'author-gameplay-feature',
    'author-prefab-resource',
    'build-and-test-game',
    'prepare-standalone-release',
    'repair-game-failure',
  ];
  const discoveredSkillNames = new Set(
    skillFiles.map((path) => relative(skillRoot, path).split(/[\\/]/u)[0]),
  );
  if (skillFiles.length === 0) {
    diagnose({
      code: 'PROJECT_SKILLS_MISSING',
      severity: 'error',
      message: '项目没有可发现的 Skills。',
      path: '.agents/skills',
    });
    check('skills', '项目 Skills', 'failed');
  } else {
    const invalidSkill = skillFiles.find(
      (path) =>
        !readFileSync(path, 'utf8').startsWith('---\n') &&
        !readFileSync(path, 'utf8').startsWith('---\r\n'),
    );
    const missingSkill = requiredSkillNames.find(
      (name) => !discoveredSkillNames.has(name),
    );
    if (invalidSkill || missingSkill) {
      diagnose({
        code: invalidSkill ? 'PROJECT_SKILL_INVALID' : 'PROJECT_SKILL_MISSING',
        severity: 'error',
        message: invalidSkill
          ? 'Skill 缺少 YAML frontmatter。'
          : `项目缺少必要 Skill：${missingSkill}`,
        path: invalidSkill
          ? relative(root, invalidSkill).replaceAll('\\', '/')
          : `.agents/skills/${missingSkill}/SKILL.md`,
      });
      check('skills', '项目 Skills', 'failed');
    } else {
      check('skills', `项目 Skills（${skillFiles.length}）`, 'passed');
    }
  }

  const codexConfigPath = join(root, '.codex', 'config.toml');
  const codexConfig = existsSync(codexConfigPath)
    ? readFileSync(codexConfigPath, 'utf8')
    : '';
  const mcpConfigured =
    codexConfig.includes('[mcp_servers.ai-game-engine]') &&
    codexConfig.includes('command = "aigame-mcp"') &&
    codexConfig.includes('args = ["--project", "."]');
  if (!mcpConfigured) {
    diagnose({
      code: 'PROJECT_ENGINE_MCP_MISSING',
      severity: 'error',
      message: '项目缺少可移植的 ai-game-engine MCP 配置。',
      path: '.codex/config.toml',
    });
    check('mcp', 'Engine MCP 配置', 'failed');
  } else if (options.engineMcpPath && existsSync(options.engineMcpPath)) {
    const health = spawnSync(options.engineMcpPath, ['--project', root], {
      cwd: root,
      input: `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10_000,
      env: options.engineMcpEnvironment ?? process.env,
    });
    const messages = health.stdout
      .split(/\r?\n/u)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as { result?: unknown }];
        } catch {
          return [];
        }
      });
    const tools = messages[1]?.result as
      | { tools?: Array<{ name?: string }> }
      | undefined;
    if (
      health.status === 0 &&
      tools?.tools?.some((tool) => tool.name === 'project.validate') &&
      tools.tools.some((tool) => tool.name === 'replay.run') &&
      (!options.engineMcpEnvironment ||
        tools.tools.some((tool) => tool.name === 'change.propose'))
    ) {
      check('mcp', 'Engine MCP 配置与握手', 'passed');
    } else {
      diagnose({
        code: 'PROJECT_ENGINE_MCP_UNHEALTHY',
        severity: 'error',
        message: (health.stderr || 'Engine MCP 握手或工具发现失败。').trim(),
        path: '.codex/config.toml',
      });
      check('mcp', 'Engine MCP 配置与握手', 'failed');
    }
  } else {
    diagnose({
      code: 'PROJECT_ENGINE_MCP_UNAVAILABLE',
      severity: 'warning',
      message: '当前环境未提供 aigame-mcp；已验证可移植配置但跳过握手。',
    });
    check('mcp', 'Engine MCP 配置', 'warning');
  }

  const requiredPaths = [
    'assets/asset-manifest.json',
    'build/windows.release.json',
    'capabilities/components.json',
    'settings/project.json',
    'scripts/runtime.json',
    '.ai/providers.json',
    '.ai/tool-routing.json',
    '.gitignore',
  ];
  const missing = requiredPaths.filter((path) => !existsSync(join(root, path)));
  if (missing.length > 0) {
    diagnose({
      code: 'PROJECT_REQUIRED_FILES_MISSING',
      severity: 'error',
      message: `缺少初始化文件：${missing.join(', ')}`,
    });
    check('files', '模板必需文件', 'failed');
  } else {
    check('files', '模板必需文件', 'passed');
  }

  check('runtime-contract', '通用 Scene 与脚本运行契约', 'passed');

  const gitPath = join(root, '.git');
  if (existsSync(gitPath) && statSync(gitPath).isDirectory()) {
    check('git', 'Git 初始快照', 'passed');
  } else {
    diagnose({
      code: 'PROJECT_GIT_UNAVAILABLE',
      severity: 'warning',
      message: '项目未初始化 Git；游戏仍可运行，但缺少默认版本历史。',
    });
    check('git', 'Git 初始快照', 'warning');
  }

  return {
    ok: diagnostics.every((item) => item.severity !== 'error'),
    projectRoot: root,
    manifest,
    checks,
    diagnostics,
  };
}
