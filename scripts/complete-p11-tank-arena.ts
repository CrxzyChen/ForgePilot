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
const victoryReplay = {
  schemaVersion: '1.0.0',
  seed: 20260903,
  ticks: 2,
  commands: [
    {
      commandId: 'tank-arena:command/level-01-break-brick',
      tick: 0,
      type: 'game:fire',
      entityId: 'tank-arena:player',
      direction: 'right',
    },
    {
      commandId: 'tank-arena:command/level-01-destroy-scout',
      tick: 1,
      type: 'game:fire',
      entityId: 'tank-arena:player',
      direction: 'down',
    },
  ],
};
const defeatReplay = {
  schemaVersion: '1.0.0',
  seed: 20260903,
  ticks: 4,
  commands: [],
};

const sources = new Map<string, string>([
  ['replays/level-01.victory.input.json', json(victoryReplay)],
  ['replays/level-01.defeat.input.json', json(defeatReplay)],
  ['replays/smoke.input.json', json(victoryReplay)],
  [
    'tests/level-01.test.json',
    json({
      schemaVersion: '1.0.0',
      name: 'Tank Arena Level 01 victory and defeat',
      scene: 'scenes/main.game.json',
      replays: [
        { path: 'replays/level-01.victory.input.json', outcome: 'won' },
        { path: 'replays/level-01.defeat.input.json', outcome: 'lost' },
      ],
      performanceBudgetMs: 500,
    }),
  ],
  [
    'gameplay/hud.json',
    json({
      schemaVersion: '1.0.0',
      fields: ['level', 'health', 'score', 'outcome'],
      pauseAction: 'pause',
      restartAction: 'restart',
      presentation: 'native-window-title-and-studio-preview',
    }),
  ],
  [
    'save/slot.json',
    json({
      schemaVersion: '1.0.0',
      storage: 'user-data',
      fields: { highestUnlockedLevel: 1, highScore: 0 },
      writePolicy: 'atomic-on-level-complete',
    }),
  ],
  [
    'assets/source/tank-arena-placeholder.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" shape-rendering="crispEdges">
  <rect width="64" height="64" fill="#101827"/>
  <rect x="12" y="18" width="40" height="36" fill="#4de2c5"/>
  <rect x="28" y="4" width="8" height="30" fill="#f6b858"/>
  <rect x="6" y="22" width="8" height="28" fill="#758fff"/>
  <rect x="50" y="22" width="8" height="28" fill="#758fff"/>
</svg>\n`,
  ],
  [
    'assets/source/audio-cues.json',
    json({
      schemaVersion: '1.0.0',
      ownership: 'project-authored',
      synthesis: 'square-wave-placeholder',
      cues: [
        { id: 'fire', frequencyHz: 220, durationMs: 80 },
        { id: 'hit', frequencyHz: 110, durationMs: 120 },
        { id: 'victory', frequencyHz: 660, durationMs: 240 },
      ],
    }),
  ],
  [
    'input/actions.json',
    json({
      schemaVersion: '1.0.0',
      actions: [
        { id: 'move-up', bindings: ['KeyW', 'ArrowUp'] },
        { id: 'move-down', bindings: ['KeyS', 'ArrowDown'] },
        { id: 'move-left', bindings: ['KeyA', 'ArrowLeft'] },
        { id: 'move-right', bindings: ['KeyD', 'ArrowRight'] },
        { id: 'fire', bindings: ['Space'] },
        { id: 'pause', bindings: ['Escape'] },
        { id: 'restart', bindings: ['KeyR'] },
        { id: 'continue', bindings: ['Enter'] },
      ],
    }),
  ],
  [
    'docs/IDE_GAP_LEDGER.md',
    `# IDE gap ledger

| ID | Workflow | Reproduction | Expected Studio capability | Severity | Resolution | Regression evidence |
| --- | --- | --- | --- | --- | --- | --- |
| GAP-001 | Author tank combat | Initial Game IR had only merge/strategy components | Schema-native tank, terrain, base, enemy behavior, wave and fire commands | blocker | Added generic deterministic kernel components and combat system | kernel-core tank vertical-slice test |
| GAP-002 | Create files from Codex | MCP exposed write for existing files only | AI can propose new project files without bypassing approval | blocker | Added project.create_file backed by StudioCommandRegistry | P10/P11 Engine MCP tool-list and ChangeSet gates |
| GAP-003 | Run arbitrary project | Native runtime embedded the engine example | Runtime loads project Game IR supplied by Studio/build | blocker | Added --project and packaged game/project.game.json discovery | kernel-runtime project/fire tests |
| GAP-004 | Distinguish tank assets | Renderer palette exposed only generic player/site/entity | Snapshot projection represents tanks, terrain, base and spawner | major | Expanded stable logical palette atlas | kernel-renderer projection tests |

All P11 blocker entries are closed. Deferred authoring depth is tracked by P12 rather than bypassed in the project.
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
  summary: 'Complete P11 Tank Arena vertical slice evidence',
  operations: [...sources].map(([path, content]) => operation(path, content)),
});
changes.approve(proposal.id);
changes.apply(proposal.id);

const victory = registry.execute('runtime.run_replay', {
  scene: 'scenes/main.game.json',
  replay: 'replays/level-01.victory.input.json',
}).data as {
  result?: { snapshot?: { outcome?: { status?: string }; score?: number } };
};
const defeat = registry.execute('runtime.run_replay', {
  scene: 'scenes/main.game.json',
  replay: 'replays/level-01.defeat.input.json',
}).data as { result?: { snapshot?: { outcome?: { status?: string } } } };
assert.equal(victory.result?.snapshot?.outcome?.status, 'won');
assert.equal(victory.result?.snapshot?.score, 100);
assert.equal(defeat.result?.snapshot?.outcome?.status, 'lost');
assert.equal(changes.test(proposal.id).status, 'tested');

console.log(
  JSON.stringify({
    ok: true,
    changeId: proposal.id,
    proposalHash: proposal.proposalHash,
    victory: victory.result?.snapshot,
    defeat: defeat.result?.snapshot,
  }),
);
