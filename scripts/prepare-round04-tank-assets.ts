import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { StudioAssetJobBroker } from '../studio/workspace/studio-asset-job-broker.ts';
import { StudioChangeSetService } from '../studio/workspace/studio-change-set-service.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';

const repository = resolve(import.meta.dirname, '..');
const projectRoot = join(repository, 'examples', 'tank-arena');
const registry = new StudioCommandRegistry({
  projectRoot,
  kernelCliPath: join(repository, 'target', 'debug', 'kernelctl.exe'),
});
const changes = new StudioChangeSetService({
  projectRoot,
  kernelCliPath: join(repository, 'target', 'debug', 'kernelctl.exe'),
  registry,
});
const broker = new StudioAssetJobBroker({
  projectRoot,
  registry,
  changes,
});

const definitions = [
  {
    id: 'tank-arena-example:asset/tank-sprite-v1',
    kind: 'image' as const,
    prompt:
      'original high-contrast top-down tank sprite, geometric emerald pixel-art, transparent silhouette',
    outputName: 'tank-sprite.svg',
  },
  {
    id: 'tank-arena-example:asset/fire-v1',
    kind: 'audio' as const,
    prompt: 'short dry arcade cannon shot with a rapid decay',
    outputName: 'fire.wav',
  },
  {
    id: 'tank-arena-example:asset/hit-v1',
    kind: 'audio' as const,
    prompt: 'short bright arcade impact cue with a rapid decay',
    outputName: 'hit.wav',
  },
  {
    id: 'tank-arena-example:asset/result-v1',
    kind: 'audio' as const,
    prompt: 'short arcade result cue with a confident pulse',
    outputName: 'result.wav',
  },
];

for (const definition of definitions) {
  if (registry.snapshot().assets.some((asset) => asset.id === definition.id)) {
    continue;
  }
  const submitted = broker.submit({
    kind: definition.kind,
    providerId: 'local-placeholder',
    prompt: definition.prompt,
    outputName: definition.outputName,
    variants: 1,
  });
  const review = broker.run(submitted.id);
  const candidate = review.candidates[0];
  if (!candidate || !existsSync(join(projectRoot, candidate.path))) {
    throw new Error(`Generation job ${submitted.id} produced no candidate`);
  }
  const imported = broker.select(submitted.id, candidate.id, 'human');
  changes.approve(imported.importChangeSetId!);
  changes.apply(imported.importChangeSetId!);
  const completed = broker.list().find((job) => job.id === submitted.id);
  if (completed?.importedAssetId !== definition.id) {
    throw new Error(
      `Expected ${definition.id}, imported ${String(completed?.importedAssetId)}`,
    );
  }
}

console.log(
  JSON.stringify(
    {
      project: projectRoot,
      assets: registry.snapshot().assets.map((asset) => ({
        id: asset.id,
        path: asset.path,
        mime: asset.mime,
      })),
    },
    null,
    2,
  ),
);
