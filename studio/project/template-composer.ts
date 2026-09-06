import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import {
  PROJECT_FORMAT_VERSION,
  ProjectError,
  type ProjectManifest,
  type ProjectPreset,
} from './project-types.ts';

type TemplateDescriptor = {
  id: string;
  version: string;
  capabilities?: string[];
  directories?: string[];
  agentsFragment?: string;
  project?: {
    dimension?: string;
    genre?: string;
    targets?: string[];
    artWorkflow?: string;
  };
};

export type ComposeProjectOptions = {
  destination: string;
  templateRoot: string;
  name: string;
  namespace: string;
  engineVersion: string;
  preset?: ProjectPreset;
};

const textExtensions = new Set([
  '.gitignore',
  '.json',
  '.md',
  '.toml',
  '.ts',
  '.txt',
]);

function layerNames(preset: ProjectPreset = 'empty'): string[] {
  if (preset === 'empty') return ['base', 'empty', 'windows'];
  if (preset === 'empty-2d') return ['base', '2d', 'empty', 'windows'];
  if (preset === 'empty-3d') return ['base', '3d', 'empty', 'windows'];
  throw new ProjectError(
    'PROJECT_PRESET_UNKNOWN',
    `未知项目预设：${preset as string}`,
  );
}

function walkFiles(root: string, current = root): string[] {
  if (!existsSync(current)) return [];
  return readdirSync(current, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(current, entry.name);
      return entry.isDirectory()
        ? walkFiles(root, path)
        : [relative(root, path)];
    })
    .sort();
}

function extension(path: string): string {
  if (path.endsWith('.gitignore')) return '.gitignore';
  const index = path.lastIndexOf('.');
  return index < 0 ? '' : path.slice(index);
}

function render(source: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value),
    source,
  );
}

function readDescriptor(layerRoot: string): TemplateDescriptor {
  const path = join(layerRoot, 'template.json');
  let descriptor: TemplateDescriptor;
  try {
    descriptor = JSON.parse(readFileSync(path, 'utf8')) as TemplateDescriptor;
  } catch (error) {
    throw new ProjectError(
      'PROJECT_TEMPLATE_INVALID',
      `无法读取模板描述：${path}`,
      { cause: error },
    );
  }
  if (!descriptor.id || !descriptor.version) {
    throw new ProjectError(
      'PROJECT_TEMPLATE_INVALID',
      `模板缺少 id 或 version：${path}`,
    );
  }
  return descriptor;
}

export function composeProject(
  options: ComposeProjectOptions,
): ProjectManifest {
  const layers = layerNames(options.preset).map((name) => {
    const root = resolve(options.templateRoot, name);
    return { root, descriptor: readDescriptor(root) };
  });
  const values = {
    PROJECT_NAME: options.name,
    PROJECT_ID: `local:${options.namespace}`,
    PROJECT_NAMESPACE: options.namespace,
    PROJECT_SPACE:
      options.preset === 'empty-2d'
        ? '2d'
        : options.preset === 'empty-3d'
          ? '3d'
          : 'mixed',
  };
  const agentSections: string[] = [];
  const capabilities = new Set<string>();
  const targets = new Set<string>();
  const directories = new Set([
    'scenes',
    'prefabs',
    'scripts',
    'assets/source',
    'assets/generated',
    'assets/imported',
    'input',
    'tests',
    'replays',
    'build',
    'docs',
  ]);

  mkdirSync(options.destination, { recursive: true });
  for (const { root, descriptor } of layers) {
    for (const capability of descriptor.capabilities ?? []) {
      capabilities.add(capability);
    }
    for (const target of descriptor.project?.targets ?? []) targets.add(target);
    for (const directory of descriptor.directories ?? [])
      directories.add(directory);
    if (descriptor.agentsFragment) {
      agentSections.push(
        render(
          readFileSync(join(root, descriptor.agentsFragment), 'utf8').trim(),
          values,
        ),
      );
    }
    const filesRoot = join(root, 'files');
    for (const relativePath of walkFiles(filesRoot)) {
      const source = join(filesRoot, relativePath);
      const destination = join(options.destination, relativePath);
      mkdirSync(dirname(destination), { recursive: true });
      if (existsSync(destination)) {
        throw new ProjectError(
          'PROJECT_TEMPLATE_CONFLICT',
          `模板文件冲突：${relativePath}`,
          { template: descriptor.id },
        );
      }
      if (textExtensions.has(extension(relativePath))) {
        writeFileSync(
          destination,
          render(readFileSync(source, 'utf8'), values),
          'utf8',
        );
      } else if (statSync(source).isFile()) {
        copyFileSync(source, destination);
      }
    }
  }

  for (const directory of directories) {
    mkdirSync(join(options.destination, directory), { recursive: true });
  }
  writeFileSync(
    join(options.destination, 'AGENTS.md'),
    `${agentSections.join('\n\n')}\n`,
    'utf8',
  );

  const targetList = [...targets].sort();
  const manifest: ProjectManifest = {
    schemaVersion: PROJECT_FORMAT_VERSION,
    id: values.PROJECT_ID,
    name: options.name,
    engine: {
      version: options.engineVersion,
      projectFormat: PROJECT_FORMAT_VERSION,
    },
    entry: { scene: 'scenes/main.game.json' },
    templates: layers.map(({ descriptor }) => ({
      id: descriptor.id,
      version: descriptor.version,
    })),
    targets: targetList,
    defaultTarget: targetList[0] ?? 'windows-x86_64',
    capabilities: [...capabilities].sort(),
    paths: {
      assets: 'assets',
      scenes: 'scenes',
      tests: 'tests',
      replays: 'replays',
    },
  };
  writeFileSync(
    join(options.destination, 'project.aigame.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  return manifest;
}
