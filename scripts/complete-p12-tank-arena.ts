import assert from 'node:assert/strict';
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
const transform = (x: number, y: number) => ({
  type: 'core:transform',
  position: { x, y },
});
const entity = (id: string, name: string, components: unknown[]) => ({
  id,
  name,
  components,
});
const player = (damage = 2, health = 3) =>
  entity('tank-arena:player', 'Player Tank', [
    transform(2, 9),
    { type: 'game:player-controlled' },
    {
      type: 'game:tank',
      faction: 'tank-arena:player-faction',
      role: 'player',
      health,
      maxHealth: health,
      damage,
      range: 16,
      scoreValue: 0,
    },
  ]);
const base = () =>
  entity('tank-arena:base', 'Player Base', [
    transform(4, 13),
    {
      type: 'game:base',
      faction: 'tank-arena:player-faction',
      health: 2,
      maxHealth: 2,
    },
  ]);
const terrain = (
  id: string,
  kind: 'brick' | 'steel' | 'water' | 'foliage',
  x: number,
  y: number,
) =>
  entity(`tank-arena:terrain/${id}`, `${kind} ${id}`, [
    transform(x, y),
    {
      type: 'game:terrain',
      kind,
      blocksMovement: kind !== 'foliage',
      blocksShots: kind === 'brick' || kind === 'steel',
      destructible: kind === 'brick',
      health: kind === 'brick' ? 1 : 0,
    },
  ]);
const terrainSet = () => [
  terrain('brick', 'brick', 5, 5),
  terrain('steel', 'steel', 6, 5),
  terrain('water', 'water', 7, 5),
  terrain('foliage', 'foliage', 8, 5),
];
const spawner = (
  id: string,
  archetype: 'scout' | 'striker' | 'heavy',
  x: number,
  y: number,
  wave: number,
) =>
  entity(id, `${archetype} wave ${wave}`, [
    transform(x, y),
    {
      type: 'game:wave-spawner',
      wave,
      archetype,
      faction: 'tank-arena:enemy-faction',
      spawnEveryTicks: 1,
      total: 1,
    },
  ]);
const level = (number: number, title: string, entities: unknown[]) => ({
  kind: 'ai-game-kernel/project',
  schemaVersion: '1.0.0',
  id: `tank-arena:level-${String(number).padStart(2, '0')}-project`,
  name: `Tank Arena · ${String(number).padStart(2, '0')} ${title}`,
  entryWorld: `tank-arena:level-${String(number).padStart(2, '0')}`,
  worlds: [
    {
      id: `tank-arena:level-${String(number).padStart(2, '0')}`,
      name: title,
      bounds: { width: 32, height: 18 },
      entities,
    },
  ],
});
const fire = (id: string, tick: number, direction: string) => ({
  commandId: `tank-arena:command/${id}`,
  tick,
  type: 'game:fire',
  entityId: 'tank-arena:player',
  direction,
});
const replay = (ticks: number, commands: unknown[]) => ({
  schemaVersion: '1.0.0',
  seed: 20260903,
  ticks,
  commands,
});

const levels = [
  {
    number: 2,
    title: 'Crossfire Canal',
    scene: level(2, 'Crossfire Canal', [
      player(2),
      base(),
      ...terrainSet(),
      spawner('tank-arena:level-02/a', 'striker', 7, 9, 2),
    ]),
    victory: replay(1, [fire('level-02-striker', 0, 'right')]),
    defeat: replay(10, []),
  },
  {
    number: 3,
    title: 'Steel Sentinel',
    scene: level(3, 'Steel Sentinel', [
      player(2),
      base(),
      ...terrainSet(),
      spawner('tank-arena:level-03/heavy', 'heavy', 6, 9, 3),
    ]),
    victory: replay(2, [
      fire('level-03-heavy-a', 0, 'right'),
      fire('level-03-heavy-b', 1, 'right'),
    ]),
    defeat: replay(3, []),
  },
  {
    number: 4,
    title: 'Twin Advance',
    scene: level(4, 'Twin Advance', [
      player(1),
      base(),
      ...terrainSet(),
      spawner('tank-arena:level-04/right', 'scout', 12, 9, 4),
      spawner('tank-arena:level-04/down', 'scout', 2, 16, 4),
    ]),
    victory: replay(2, [
      fire('level-04-right', 0, 'right'),
      fire('level-04-down', 1, 'down'),
    ]),
    defeat: replay(12, []),
  },
  {
    number: 5,
    title: 'Triad Citadel',
    scene: level(5, 'Triad Citadel', [
      player(2, 5),
      base(),
      ...terrainSet(),
      spawner('tank-arena:level-05/a', 'striker', 2, 2, 5),
      spawner('tank-arena:level-05/heavy', 'heavy', 10, 9, 5),
      spawner('tank-arena:level-05/scout', 'scout', 2, 16, 5),
    ]),
    victory: replay(4, [
      fire('level-05-up', 0, 'up'),
      fire('level-05-heavy-a', 1, 'right'),
      fire('level-05-heavy-b', 2, 'right'),
      fire('level-05-down', 3, 'down'),
    ]),
    defeat: replay(16, []),
  },
];

const sources = new Map<string, string>();
const visualCapture = (
  number: number,
  title: string,
) => `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" shape-rendering="crispEdges">
  <rect width="640" height="360" fill="#101827"/>
  <path d="M0 180H640M320 0V360" stroke="#26354d" stroke-width="2"/>
  <rect x="40" y="160" width="20" height="20" fill="#4de2c5"/>
  <rect x="100" y="100" width="20" height="20" fill="#bf6544"/>
  <rect x="120" y="100" width="20" height="20" fill="#8e97a6"/>
  <rect x="140" y="100" width="20" height="20" fill="#3e84cc"/>
  <rect x="160" y="100" width="20" height="20" fill="#438d59"/>
  <text x="20" y="30" fill="#f6b858" font-family="monospace" font-size="18">Tank Arena ${String(number).padStart(2, '0')} · ${title}</text>
</svg>\n`;
sources.set(
  'tests/visual/level-01.capture.svg',
  visualCapture(1, 'First Contact'),
);
for (const item of levels) {
  const id = String(item.number).padStart(2, '0');
  sources.set(`scenes/level-${id}.game.json`, json(item.scene));
  sources.set(`replays/level-${id}.victory.input.json`, json(item.victory));
  sources.set(`replays/level-${id}.defeat.input.json`, json(item.defeat));
  sources.set(
    `scenes/level-${id}.tiles.json`,
    json({
      schemaVersion: '1.0.0',
      width: 32,
      height: 18,
      tileSize: 32,
      layers: [
        {
          id: 'terrain',
          tiles: [
            { x: 5, y: 5, tileId: 'tank-arena:tile/brick' },
            { x: 6, y: 5, tileId: 'tank-arena:tile/steel' },
            { x: 7, y: 5, tileId: 'tank-arena:tile/water' },
            { x: 8, y: 5, tileId: 'tank-arena:tile/foliage' },
          ],
        },
      ],
    }),
  );
  sources.set(
    `tests/visual/level-${id}.capture.svg`,
    visualCapture(item.number, item.title),
  );
}

sources.set(
  '.ai/providers.json',
  json({
    schemaVersion: '2.0.0',
    providers: [
      {
        id: 'local-placeholder',
        kind: 'local-placeholder',
        paid: false,
        enabled: true,
        defaultModelByKind: {
          image: 'deterministic-image',
          soundEffect: 'deterministic-sound-effect',
          music: 'deterministic-music',
          speechGeneration: 'deterministic-speech',
        },
        models: [
          {
            id: 'deterministic-image',
            kind: 'image',
            adapter: 'local-placeholder',
            maxVariants: 4,
            costPerCandidateCny: 0,
            defaults: {},
          },
          {
            id: 'deterministic-sound-effect',
            kind: 'soundEffect',
            adapter: 'local-placeholder',
            maxVariants: 4,
            costPerCandidateCny: 0,
            defaults: {},
          },
          {
            id: 'deterministic-music',
            kind: 'music',
            adapter: 'local-placeholder',
            maxVariants: 4,
            costPerCandidateCny: 0,
            defaults: {},
          },
          {
            id: 'deterministic-speech',
            kind: 'speechGeneration',
            adapter: 'local-placeholder',
            maxVariants: 4,
            costPerCandidateCny: 0,
            defaults: {},
          },
        ],
      },
      {
        id: 'recovery-fixture',
        kind: 'test-fixture',
        paid: false,
        failFirstAttempts: 1,
      },
      {
        id: 'aliyun-bailian',
        kind: 'aliyun-bailian',
        paid: true,
        enabled: true,
        defaultModelByKind: {
          image: 'wan2.6-t2i',
          speechGeneration: 'qwen-audio-3.0-tts-flash',
        },
        models: [
          {
            id: 'wan2.6-t2i',
            kind: 'image',
            adapter: 'aliyun-bailian-image',
            maxVariants: 4,
            costPerCandidateCny: 0.14,
            defaults: {
              size: '1280*1280',
              watermark: false,
              promptExtend: true,
            },
          },
          {
            id: 'qwen-audio-3.0-tts-flash',
            kind: 'speechGeneration',
            adapter: 'aliyun-bailian-tts',
            maxVariants: 1,
            defaults: {
              voice: 'longanhuan_v3.6',
              format: 'wav',
              sampleRate: 24000,
            },
          },
        ],
      },
    ],
  }),
);
sources.set(
  '.gitignore',
  `.aigame/cache/
.aigame/local/
.codex/tmp/
assets/drafts/
out/
dist/
*.log
*.tmp
.env
.env.*
!.env.example
`,
);

sources.set(
  'campaign/campaign.json',
  json({
    schemaVersion: '1.0.0',
    title: 'Tank Arena',
    progression: 'linear',
    save: 'save/slot.json',
    levels: [
      {
        id: 'tank-arena:level-01',
        scene: 'scenes/main.game.json',
        difficulty: 1,
      },
      ...levels.map((item) => ({
        id: `tank-arena:level-${String(item.number).padStart(2, '0')}`,
        scene: `scenes/level-${String(item.number).padStart(2, '0')}.game.json`,
        difficulty: item.number,
      })),
    ],
  }),
);
sources.set(
  'waves/waves.json',
  json({
    schemaVersion: '1.0.0',
    archetypes: {
      scout: {
        behavior: 'chaser',
        health: 1,
        damage: 1,
        moveEveryTicks: 1,
        fireEveryTicks: 3,
      },
      striker: {
        behavior: 'patrol',
        health: 2,
        damage: 1,
        moveEveryTicks: 2,
        fireEveryTicks: 2,
      },
      heavy: {
        behavior: 'guard',
        health: 4,
        damage: 2,
        moveEveryTicks: 4,
        fireEveryTicks: 2,
      },
    },
  }),
);
sources.set(
  'prefabs/player-tank.prefab.json',
  json({
    schemaVersion: '1.0.0',
    id: 'tank-arena:prefab/player-tank',
    components: ['core:transform', 'game:player-controlled', 'game:tank'],
    defaults: { health: 3, damage: 1, range: 16 },
  }),
);
sources.set(
  'prefabs/wave-spawner.prefab.json',
  json({
    schemaVersion: '1.0.0',
    id: 'tank-arena:prefab/wave-spawner',
    components: ['core:transform', 'game:wave-spawner'],
    requiredOverrides: ['wave', 'archetype', 'position'],
  }),
);
sources.set(
  'progression/upgrades.json',
  json({
    schemaVersion: '1.0.0',
    scoreThresholds: [0, 300, 700, 1200],
    upgrades: [
      { id: 'reinforced-armor', maxHealthDelta: 1 },
      { id: 'twin-shell', damageDelta: 1 },
      { id: 'long-barrel', rangeDelta: 2 },
    ],
  }),
);
sources.set(
  'presentation/animation.json',
  json({
    schemaVersion: '1.0.0',
    clips: ['tank-idle', 'tank-move', 'muzzle-flash', 'base-destroyed'],
    fixedTickSampling: true,
  }),
);
sources.set(
  'presentation/particles.json',
  json({
    schemaVersion: '1.0.0',
    systems: [
      { id: 'impact', deterministicBurst: 6 },
      { id: 'destruction', deterministicBurst: 12 },
    ],
  }),
);
sources.set(
  'presentation/audio.json',
  json({
    schemaVersion: '1.0.0',
    music: [{ id: 'arena-loop', path: 'assets/generated/arena-loop.wav' }],
    effects: [
      { id: 'fire', path: 'assets/generated/fire.wav' },
      { id: 'impact', path: 'assets/generated/impact.wav' },
    ],
  }),
);
sources.set(
  'accessibility/settings.json',
  json({
    schemaVersion: '1.0.0',
    remappableInput: true,
    reducedFlash: true,
    screenShake: { default: 0, range: [0, 1] },
    highContrastPalette: true,
    masterVolume: { default: 0.8, range: [0, 1] },
  }),
);
sources.set(
  'tests/performance-budget.json',
  json({
    schemaVersion: '1.0.0',
    headlessReplayMs: 500,
    runtimeAverageFrameMs: 33.34,
    maxEntities: 256,
    batchRunsPerLevel: 100,
  }),
);
sources.set(
  'tests/invalid/missing-health.fixture.json',
  json({
    expectedCode: 'IR_SCHEMA_VALIDATION',
    document: { type: 'game:tank', role: 'enemy' },
  }),
);
sources.set(
  'migration/p11-project.aigame.v1.json',
  registry.readText('project.aigame.json').source,
);
sources.set(
  'migration/P12-MIGRATION-REPORT.md',
  '# P11 to P12 migration report\n\nThe P11 project copy opens under format 1.0.0 without destructive migration. P12 adds campaign, prefabs, waves, presentation, accessibility and tests as additive project files. The Project Doctor regression gate runs against an isolated copy.\n',
);

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
  summary: 'Complete P12 five-level Tank Arena authoring depth',
  operations: [...sources].map(([path, content]) => operation(path, content)),
});
changes.approve(proposal.id);
changes.apply(proposal.id);

for (const item of levels) {
  const id = String(item.number).padStart(2, '0');
  for (const outcome of ['victory', 'defeat'] as const) {
    const result = registry.execute('runtime.run_replay', {
      scene: `scenes/level-${id}.game.json`,
      replay: `replays/level-${id}.${outcome}.input.json`,
    }).data as {
      result?: { snapshot?: { outcome?: { status?: string }; score?: number } };
    };
    assert.equal(
      result.result?.snapshot?.outcome?.status,
      outcome === 'victory' ? 'won' : 'lost',
      `level ${id} ${outcome}`,
    );
  }
}
assert.equal(changes.test(proposal.id).status, 'tested');
console.log(
  JSON.stringify({
    ok: true,
    changeId: proposal.id,
    proposalHash: proposal.proposalHash,
    levels: 5,
  }),
);
