import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { StudioChangeSetService } from '../studio/workspace/studio-change-set-service.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';

const repository = resolve(process.cwd());
const projectRoot = resolve(
  process.argv[2] ?? join(repository, 'work', 'projects', 'tank-arena'),
);
const kernelCliPath = join(repository, 'target', 'debug', 'kernelctl.exe');
const registry = new StudioCommandRegistry({ projectRoot, kernelCliPath });
const changes = new StudioChangeSetService({
  projectRoot,
  kernelCliPath,
  registry,
});
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const sources = new Map<string, string>([
  [
    'build/windows.development.json',
    json({
      schemaVersion: '1.0.0',
      target: 'windows-x86_64',
      profile: 'development',
      version: '0.1.0',
      entry: 'campaign/campaign.json',
      output: 'out/windows-development',
      includeDiagnostics: true,
    }),
  ],
  [
    'build/windows.release.json',
    json({
      schemaVersion: '1.0.0',
      target: 'windows-x86_64',
      profile: 'release',
      version: '0.1.0',
      entry: 'campaign/campaign.json',
      output: 'out/windows-release',
      includeDiagnostics: false,
      signing: {
        status: 'accepted-limitation',
        requirement: 'organization-code-signing-certificate',
      },
    }),
  ],
  [
    'licenses/PROJECT-ASSETS.txt',
    'Tank Arena Game IR, visual placeholders, generated selections, and audio cues are project-owned original work created for this dogfood project. Generated selections retain provider/job/candidate hashes in assets/asset-manifest.json.\n',
  ],
  [
    'docs/RELEASE.md',
    `# Tank Arena Windows release

Studio's Release Build produces a portable player-only ZIP. It contains the native runtime, five compiled/runtime Game IR documents, selected runtime assets, accessibility/presentation data, per-file hashes, notices and provenance.

It excludes Studio, Electron, Codex, AGENTS.md, Skills, provider configuration, credentials, tests, replays, caches, audit history and draft/source-only assets.

The MVP output is deliberately unsigned. Public distribution requires an organization code-signing certificate, a signed installer, timestamping and reputation testing. The portable folder is uninstalled by deleting it; save data is stored separately under Windows LocalAppData.
`,
  ],
]);

function operation(path: string, content: string) {
  if (!existsSync(join(projectRoot, path))) {
    return { command: 'project.file.create', input: { path, content } };
  }
  const current = registry.readText(path);
  return {
    command: 'project.file.write',
    input: { path, content, baseHash: current.hash },
  };
}

const proposal = changes.propose({
  summary: 'Prepare Tank Arena P13 independent Windows release',
  operations: [...sources].map(([path, content]) => operation(path, content)),
});
changes.approve(proposal.id);
changes.apply(proposal.id);
console.log(
  JSON.stringify({
    ok: true,
    changeId: proposal.id,
    proposalHash: proposal.proposalHash,
  }),
);
