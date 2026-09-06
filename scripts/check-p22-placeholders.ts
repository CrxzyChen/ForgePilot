import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repository = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(repository, path), 'utf8');

type PlaceholderProbe = {
  id: string;
  inventory: string[];
  owner: string;
  description: string;
  open: () => boolean;
};

const workbench = read('studio/electron/renderer/Workbench.tsx');
const registry = read('studio/workspace/studio-command-registry.ts');
const player = read('crates/player/src/main.rs');
const playerCargo = read('crates/player/Cargo.toml');
const scriptHost = read('crates/script-host/src/lib.rs');
const assetBroker = read('studio/workspace/studio-asset-job-broker.ts');
const capabilities = read('studio/capabilities/capability-registry.ts');

const probes: PlaceholderProbe[] = [
  {
    id: 'R4-PROBE-DOM-VIEWPORT',
    inventory: ['R4-INV-001', 'R4-INV-002'],
    owner: 'P23',
    description: 'Scene viewport still renders generic DOM object buttons.',
    open: () =>
      workbench.includes('className="scene-canvas"') &&
      /className=\{[\s\S]{0,300}selectedEntityIds[\s\S]{0,500}<Box \/>/u.test(
        workbench,
      ) &&
      workbench.includes('bounds: { width: 32, height: 18 }'),
  },
  {
    id: 'R4-PROBE-BOUNDED-RUNTIME',
    inventory: ['R4-INV-003', 'R4-INV-005'],
    owner: 'P23',
    description:
      'Run remains a bounded synchronous script-host request/report.',
    open: () =>
      registry.includes("command === 'runtime.start' ? 60 : 1") &&
      registry.includes('const result = this.#scriptRuntime.run(options)') &&
      workbench.includes('<h2>Game Runtime</h2>') &&
      workbench.includes('className="runtime-summary-grid"'),
  },
  {
    id: 'R4-PROBE-REPLAYED-STEP',
    inventory: ['R4-INV-004'],
    owner: 'P23',
    description: 'Step reruns from the beginning through current Tick + 1.',
    open: () =>
      registry.includes('ticks: Math.max(1, this.#runtime.tick + 1)') &&
      registry.includes("case 'runtime.pause':"),
  },
  {
    id: 'R4-PROBE-SYNTHETIC-COLLISION',
    inventory: ['R4-INV-006'],
    owner: 'P24/P25',
    description:
      'Collision events are supplied by requests rather than computed.',
    open: () =>
      registry.includes('collisions: (args.collisions ??') &&
      scriptHost.includes('request.collisions || []'),
  },
  {
    id: 'R4-PROBE-PLAYER-NO-PHYSICS',
    inventory: ['R4-INV-007'],
    owner: 'P24/P25',
    description: 'Native Player sends an empty collision collection.',
    open: () => /"collisions": \[\]/u.test(player),
  },
  {
    id: 'R4-PROBE-NO-SPRITE-AUDIO',
    inventory: ['R4-INV-008', 'R4-INV-009'],
    owner: 'P24',
    description: 'Player has no Sprite2D texture or audio runtime path.',
    open: () =>
      !player.includes('render:sprite2d') &&
      !capabilities.includes('render:sprite2d') &&
      !/\b(?:kira|rodio|cpal|image)\s*=/u.test(playerCargo),
  },
  {
    id: 'R4-PROBE-ISOMETRIC-3D',
    inventory: ['R4-INV-010'],
    owner: 'P25',
    description: '3D is manually projected into 2D primitive rectangles.',
    open: () =>
      player.includes('position[0] * 1.35 - position[2] * 0.8') &&
      player.includes('position[1] * 1.15 + position[2] * 0.52'),
  },
  {
    id: 'R4-PROBE-PLACEHOLDER-PROVIDER',
    inventory: ['R4-INV-011'],
    owner: 'P26',
    description: 'Asset jobs only execute placeholder/test providers.',
    open: () =>
      !assetBroker.includes("providerKind(provider) !== 'aliyun-bailian'") ||
      !assetBroker.includes('async runAsync(id: string)') ||
      !assetBroker.includes('approveAndRun(id: string)') ||
      !assetBroker.includes('aliyun-bailian-tts') ||
      !assetBroker.includes('estimatedCostCny') ||
      !assetBroker.includes('cancel(id: string)'),
  },
  {
    id: 'R4-PROBE-INEFFECTIVE-SETTINGS',
    inventory: ['R4-INV-012', 'R4-INV-013'],
    owner: 'P26',
    description: 'Visible settings persist values without complete effects.',
    open: () => {
      const queryReferences = workbench.match(/settingsQuery/gu)?.length ?? 0;
      return (
        queryReferences === 2 &&
        workbench.includes("updateSetting('mcpEnabled'") &&
        workbench.includes("updateSetting('providerEndpoint'")
      );
    },
  },
  {
    id: 'R4-PROBE-INERT-MENUS',
    inventory: ['R4-INV-014'],
    owner: 'P26',
    description:
      'View, Project, and Run title-bar menu buttons have no actions.',
    open: () =>
      workbench.includes('<button>视图</button>') &&
      workbench.includes('<button>项目</button>') &&
      workbench.includes('<button>运行</button>'),
  },
  {
    id: 'R4-PROBE-FALSE-TEST-SUCCESS',
    inventory: ['R4-INV-015'],
    owner: 'P26',
    description: 'Missing smoke test falls back to a one-Tick successful run.',
    open: () =>
      registry.includes("args.test ?? 'tests/smoke.test.json'") &&
      registry.includes("command === 'runtime.start' ? 60 : 1"),
  },
  {
    id: 'R4-PROBE-INERT-EXTENSIONS',
    inventory: ['R4-INV-016'],
    owner: 'P26',
    description: 'Capability buttons have no enable/disable/configure action.',
    open: () =>
      /project\.manifest\.capabilities\.map\(\(capability\) => \([\s\S]{0,180}<button key=\{capability\}>/u.test(
        workbench,
      ),
  },
];

const results = probes.map((probe) => ({
  id: probe.id,
  inventory: probe.inventory,
  owner: probe.owner,
  description: probe.description,
  status: probe.open() ? ('open' as const) : ('closed-signature' as const),
}));
const open = results.filter((result) => result.status === 'open');
const baselineMode = process.argv.includes('--baseline');

if (baselineMode) {
  assert.equal(
    probes.length,
    12,
    'P22 inventory probe count changed unexpectedly.',
  );
  assert.equal(
    new Set(results.map((result) => result.id)).size,
    results.length,
    'P22 inventory contains duplicate probe IDs.',
  );
  console.log(
    JSON.stringify(
      {
        gate: 'P22 known-placeholder baseline',
        expected:
          'all known probes remain inventoried while implementation may close signatures',
        openCount: open.length,
        closedCount: results.length - open.length,
        probes: results,
        result: 'passed-inventory-integrity',
      },
      null,
      2,
    ),
  );
} else if (open.length > 0) {
  console.error(
    JSON.stringify(
      {
        gate: 'Round 04 placeholder closure',
        openCount: open.length,
        probes: open,
        result: 'failed-open-placeholders',
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        gate: 'Round 04 placeholder closure',
        openCount: 0,
        probes: results,
        result: 'passed',
      },
      null,
      2,
    ),
  );
}
