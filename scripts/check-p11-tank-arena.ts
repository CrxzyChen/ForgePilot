import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repository = resolve(process.cwd());
const project = resolve(
  process.argv[2] ?? join(repository, 'work', 'projects', 'tank-arena'),
);
const kernel = join(repository, 'target', 'debug', 'kernelctl.exe');

function run(replay: string) {
  const result = spawnSync(
    kernel,
    ['run', join(project, 'scenes', 'main.game.json'), join(project, replay)],
    { cwd: project, encoding: 'utf8', windowsHide: true },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout) as {
    result: {
      snapshot: {
        outcome: { status: string };
        score?: number;
        stateHash: string;
      };
      events: Array<{ event: { type: string } }>;
    };
  };
}

for (const path of [
  'project.aigame.json',
  'AGENTS.md',
  '.codex/config.toml',
  'gameplay/hud.json',
  'save/slot.json',
  'assets/source/tank-arena-placeholder.svg',
  'assets/source/audio-cues.json',
  'docs/IDE_GAP_LEDGER.md',
]) {
  assert(existsSync(join(project, path)), `missing P11 project file ${path}`);
}

const scene = readFileSync(join(project, 'scenes', 'main.game.json'), 'utf8');
for (const component of [
  'game:tank',
  'game:base',
  'game:terrain',
  'game:wave-spawner',
]) {
  assert(scene.includes(`"${component}"`), `missing ${component}`);
}
const ledger = readFileSync(join(project, 'docs', 'IDE_GAP_LEDGER.md'), 'utf8');
assert.match(ledger, /All P11 blocker entries are closed/u);

const victory = run('replays/level-01.victory.input.json');
const defeat = run('replays/level-01.defeat.input.json');
assert.equal(victory.result.snapshot.outcome.status, 'won');
assert.equal(victory.result.snapshot.score, 100);
assert.equal(defeat.result.snapshot.outcome.status, 'lost');
for (const event of [
  'enemy-spawned',
  'shot-fired',
  'entity-damaged',
  'entity-destroyed',
]) {
  assert(
    victory.result.events.some((item) => item.event.type === event),
    `missing runtime event ${event}`,
  );
}

console.log(
  JSON.stringify({
    ok: true,
    project,
    victoryHash: victory.result.snapshot.stateHash,
    defeatHash: defeat.result.snapshot.stateHash,
    score: victory.result.snapshot.score,
    blockerGaps: 0,
  }),
);
