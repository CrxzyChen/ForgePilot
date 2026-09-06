import assert from 'node:assert/strict';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { ProjectError } from '../studio/project/project-types.ts';
import { StudioAssetJobBroker } from '../studio/workspace/studio-asset-job-broker.ts';
import { StudioChangeSetService } from '../studio/workspace/studio-change-set-service.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';

const repository = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), 'aigame-p29-import-'));
const projectRoot = join(temporary, 'project');
const kernelCliPath = join(repository, 'target', 'debug', 'kernelctl.exe');

try {
  cpSync(join(repository, 'examples', 'tank-arena'), projectRoot, {
    recursive: true,
    filter: (source) =>
      !['.git', '.aigame', 'out', 'dist'].includes(
        source.split(/[\\/]/u).at(-1) ?? '',
      ),
  });
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
  const scenePath = join(projectRoot, 'scenes', 'main.game.json');
  const sceneBefore = readFileSync(scenePath, 'utf8');
  const assetsBefore = registry.snapshot().assets.length;
  const submitted = broker.submit({
    kind: 'image',
    providerId: 'local-placeholder',
    prompt: 'coherent emerald top-down player tank with transparent background',
    outputName: 'p29-player-tank.svg',
    variants: 2,
  });
  const review = broker.run(submitted.id);
  assert.equal(review.status, 'awaitingReview');
  assert.equal(review.candidates.length, 2);
  assert.equal(registry.snapshot().assets.length, assetsBefore);
  assert(
    review.candidates.every((candidate) =>
      candidate.path.startsWith('.aigame/local/asset-candidates/'),
    ),
  );
  const preview = broker.previewCandidate(review.id, review.candidates[0]!.id);
  assert.match(preview.dataUrl, /^data:image\/svg\+xml;base64,/u);
  assert.equal(preview.candidate.media.kind, 'image');

  const recommended = broker.recommendCandidate(
    review.id,
    review.candidates[0]!.id,
    [
      'silhouette is readable at gameplay scale',
      'transparent background is preserved',
    ],
    ['runtime-observation:p29-comparison'],
  );
  assert.equal(recommended.candidates[0]?.recommendation?.recommended, true);
  const rejected = broker.rejectCandidate(
    review.id,
    review.candidates[1]!.id,
    'barrel direction is ambiguous',
  );
  assert.equal(rejected.candidates[1]?.reviewState, 'rejected');
  const regeneration = broker.regenerate(
    review.id,
    review.candidates[1]!.id,
    'make the barrel point clearly upward',
  );
  assert.equal(
    regeneration.regeneration?.parentCandidateId,
    review.candidates[1]!.id,
  );
  assert.equal(broker.run(regeneration.id).status, 'awaitingReview');

  const proposed = broker.select(review.id, review.candidates[0]!.id, 'human', {
    reason: 'accepted after side-by-side Studio review',
    artDirectionSkillId: 'skill:tank-art-direction-v1',
    artDirectionSkillHash: 'a'.repeat(64),
    assetBriefId: 'asset-brief:p29-player-tank',
    assetBriefHash: 'b'.repeat(64),
    sourceHashes: ['c'.repeat(64)],
    license: 'provider-output-terms-reviewed',
    restrictions: ['no trademarked insignia'],
    importSettings: { filter: 'nearest', alpha: true },
    references: [
      {
        scene: 'scenes/main.game.json',
        objectId: 'tank:player',
        componentId: 'tank:player/sprite',
        property: 'texture',
      },
    ],
  });
  assert.equal(proposed.status, 'awaitingImportApproval');
  assert.equal(readFileSync(scenePath, 'utf8'), sceneBefore);
  assert.equal(registry.snapshot().assets.length, assetsBefore);
  const change = changes.read(proposed.importChangeSetId!);
  assert.equal(change.status, 'awaitingApproval');
  assert.equal(change.operations[0]?.command, 'asset.generated.import');
  assert.equal(change.operations[1]?.command, 'scene.component.update');
  assert.deepEqual(change.files.map((file) => file.path).sort(), [
    'assets/asset-manifest.json',
    'assets/import-settings/p29-player-tank.json',
    'assets/imported/p29-player-tank.svg',
    'assets/provenance/p29-player-tank.json',
    'scenes/main.game.json',
  ]);

  const resumedRegistry = new StudioCommandRegistry({
    projectRoot,
    kernelCliPath,
  });
  const resumedChanges = new StudioChangeSetService({
    projectRoot,
    kernelCliPath,
    registry: resumedRegistry,
  });
  const resumedBroker = new StudioAssetJobBroker({
    projectRoot,
    registry: resumedRegistry,
    changes: resumedChanges,
  });
  assert.equal(
    resumedBroker.list().find((job) => job.id === review.id)?.status,
    'awaitingImportApproval',
  );
  resumedChanges.approve(change.id);
  resumedChanges.apply(change.id);
  const imported = resumedBroker.list().find((job) => job.id === review.id)!;
  assert.equal(imported.status, 'imported');
  const jobsPath = join(projectRoot, '.aigame/local/asset-jobs/jobs.json');
  const stableImportedStore = readFileSync(jobsPath, 'utf8');
  for (let index = 0; index < 10; index++) resumedBroker.list();
  assert.equal(
    readFileSync(jobsPath, 'utf8'),
    stableImportedStore,
    'unchanged imported-asset inspection must not rewrite timestamps and durable state',
  );
  assert.equal(
    imported.importedAssetId,
    'tank-arena-example:asset/p29-player-tank',
  );
  const importedPath = join(
    projectRoot,
    'assets',
    'imported',
    'p29-player-tank.svg',
  );
  assert(existsSync(importedPath));
  assert.equal(readFileSync(importedPath).toString('utf8').length > 0, true);
  const sceneAfter = readFileSync(scenePath, 'utf8');
  assert.match(sceneAfter, /tank-arena-example:asset\/p29-player-tank/u);
  const provenance = JSON.parse(
    readFileSync(
      join(projectRoot, 'assets', 'provenance', 'p29-player-tank.json'),
      'utf8',
    ),
  ) as Record<string, unknown>;
  assert.equal(provenance.providerId, 'local-placeholder');
  assert.equal(provenance.modelId, 'deterministic-image');
  assert.equal(provenance.license, 'provider-output-terms-reviewed');
  assert.deepEqual(provenance.restrictions, ['no trademarked insignia']);
  assert.equal(typeof provenance.promptSha256, 'string');
  assert.equal(provenance.artDirectionSkillHash, 'a'.repeat(64));
  assert.equal(provenance.assetBriefHash, 'b'.repeat(64));
  assert.deepEqual(provenance.sourceHashes, ['c'.repeat(64)]);
  assert.deepEqual(provenance.derivedContentHashes, [preview.candidate.sha256]);
  assert.equal('prompt' in provenance, false);

  resumedChanges.rollback(change.id);
  const rolledBack = resumedBroker.list().find((job) => job.id === review.id)!;
  assert.equal(rolledBack.status, 'awaitingReview');
  assert.equal(rolledBack.importedAssetId, null);
  assert.equal(existsSync(importedPath), false);
  assert.equal(readFileSync(scenePath, 'utf8'), sceneBefore);
  assert.equal(registry.snapshot().assets.length, assetsBefore);

  // An agent may re-propose an already selected candidate on a new project
  // baseline, through the same reviewed ChangeSet service (without selecting
  // or paying again). The broker must follow that exact replacement record.
  const staleImport = resumedBroker.select(
    review.id,
    imported.selectedCandidateId!,
  );
  const staleChange = resumedChanges.read(staleImport.importChangeSetId!);
  resumedChanges.reject(staleChange.id);
  const replacement = resumedChanges.propose({
    summary: 'Rebase reviewed import without regenerating',
    operations: staleChange.operations,
  });
  assert.equal(
    resumedBroker.list().find((job) => job.id === review.id)?.status,
    'awaitingReview',
  );
  resumedChanges.approve(replacement.id);
  assert.equal(
    resumedBroker.list().find((job) => job.id === review.id)?.status,
    'awaitingReview',
    'approval alone is not an import',
  );
  resumedChanges.apply(replacement.id);
  const relinked = resumedBroker.list().find((job) => job.id === review.id)!;
  assert.equal(
    relinked.status,
    'imported',
    'a verified applied replacement must not remain awaitingReview',
  );
  assert.equal(relinked.importChangeSetId, replacement.id);
  assert.equal(
    relinked.reviewDecisionId,
    staleImport.reviewDecisionId,
    'relinking does not manufacture a new selection',
  );
  resumedChanges.rollback(replacement.id);
  assert.equal(
    resumedBroker.list().find((job) => job.id === review.id)?.status,
    'awaitingReview',
  );

  const tamper = broker.submit({
    kind: 'image',
    providerId: 'local-placeholder',
    prompt: 'tamper verification fixture',
    outputName: 'tamper.svg',
    variants: 1,
  });
  const tamperReview = broker.run(tamper.id);
  const tamperCandidate = tamperReview.candidates[0]!;
  appendFileSync(join(projectRoot, tamperCandidate.path), '<!-- tampered -->');
  assert.throws(
    () => broker.select(tamper.id, tamperCandidate.id),
    (error: unknown) =>
      error instanceof ProjectError &&
      error.code === 'ASSET_CANDIDATE_HASH_MISMATCH',
  );

  const audit = readFileSync(
    join(projectRoot, '.aigame', 'audit.jsonl'),
    'utf8',
  );
  assert.match(audit, /changeset\.propose/u);
  assert.match(audit, /changeset\.approve/u);
  assert.match(audit, /changeset\.apply/u);
  assert.match(audit, /changeset\.rollback/u);
  const assetAudit = readFileSync(
    join(projectRoot, '.aigame', 'local', 'asset-jobs', 'audit.jsonl'),
    'utf8',
  );
  assert.match(assetAudit, /asset-candidate\.recommended/u);
  assert.match(assetAudit, /asset-candidate\.rejected/u);
  assert.match(assetAudit, /asset-candidate\.regenerated/u);
  assert.match(assetAudit, /asset-candidate\.selected/u);
  console.log(
    JSON.stringify(
      {
        gate: 'P29 reviewed transactional import',
        candidatePreview: true,
        recommendation: true,
        rejectionAndRegenerationAncestry: true,
        changeSetFiles: change.files.length,
        referenceUpdatedAtomically: true,
        exactRollback: true,
        tamperRejected: true,
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
