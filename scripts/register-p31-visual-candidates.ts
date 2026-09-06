import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { StudioAssetJobBroker } from '../studio/workspace/studio-asset-job-broker.ts';
import { StudioChangeSetService } from '../studio/workspace/studio-change-set-service.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';

const repository = resolve(import.meta.dirname, '..');
const projectRoot = join(repository, 'examples', 'tank-arena');
const kernelCliPath = join(repository, 'target', 'debug', 'kernelctl.exe');
const briefPath = join(
  projectRoot,
  'assets',
  'briefs',
  'tank-completion-v1.json',
);
const brief = JSON.parse(readFileSync(briefPath, 'utf8')) as {
  resources: Array<{
    id: string;
    kind: string;
    prompt: string;
    outputName: string;
  }>;
};
const registry = new StudioCommandRegistry({ projectRoot, kernelCliPath });
const changes = new StudioChangeSetService({
  projectRoot,
  kernelCliPath,
  registry,
});
const broker = new StudioAssetJobBroker({
  projectRoot,
  registry,
  changes,
});
const candidateRoot = join(
  projectRoot,
  '.aigame',
  'local',
  'asset-candidates',
  'p31-neon-bastion',
);

const registered = brief.resources
  .filter((resource) => resource.kind === 'image')
  .map((resource) => {
    const sourcePath = join(candidateRoot, resource.outputName);
    const bytes = readFileSync(sourcePath);
    const stem = resource.outputName.replace(/\.[^.]+$/u, '');
    const job = broker.registerToolOutput({
      kind: 'image',
      providerId: 'openai',
      modelId: 'codex-managed-imagegen',
      prompt: resource.prompt,
      outputName: resource.outputName,
      sourcePath,
      expectedSha256: createHash('sha256').update(bytes).digest('hex'),
      toolCallId: `tool-call:p31/${stem}`,
      idempotencyKey: `idem:p31_image_${stem.replaceAll('-', '_')}`,
      parameters: { artDirection: 'neon-bastion-v1' },
    });
    const candidate = job.candidates[0];
    if (!candidate)
      throw new Error(`registered job has no candidate: ${job.id}`);
    const recommended = broker.recommendCandidate(
      job.id,
      candidate.id,
      [
        `唯一候选已通过 PNG、尺寸、透明通道和内容哈希机器检查；主观美术选择仍由人类完成。`,
      ],
      [resource.id, 'evidence:p31-tank-foundation'],
    );
    return {
      jobId: recommended.id,
      candidateId: candidate.id,
      outputName: resource.outputName,
      sha256: candidate.sha256,
      status: recommended.status,
    };
  });

console.log(
  JSON.stringify(
    {
      operation: 'P31 visual candidates registered for Studio review',
      jobs: registered,
      projectAuthorityMutated: false,
      nextHumanGate: 'candidate-selection',
    },
    null,
    2,
  ),
);
