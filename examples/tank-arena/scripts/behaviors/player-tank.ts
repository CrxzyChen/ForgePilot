import { defineBehavior } from '@aigame/sdk';

type Transform2D = {
  position: { x: number; y: number };
  rotation: number;
  scale: { x: number; y: number };
};

type GameState = {
  phase: 'menu' | 'playing' | 'paused' | 'won' | 'lost';
  score: number;
  enemiesRemaining: number;
};

type WeaponState = {
  nextFireTick: number;
  direction: { x: number; y: number };
};

const FIRE_SOUND = 'tank-arena-example:asset/fire-v1';
const movement: Record<string, { x: number; y: number }> = {
  'move-up': { x: 0, y: -1 },
  'move-down': { x: 0, y: 1 },
  'move-left': { x: -1, y: 0 },
  'move-right': { x: 1, y: 0 },
};

export default defineBehavior({
  onInput(action, value, context) {
    const game = context.get<GameState>('tank:game', 'tank:game-state');
    if (!game || game.phase !== 'playing' || value <= 0) return;

    const delta = movement[action];
    if (delta) {
      const transform = context.get<Transform2D>('core:transform2d');
      const weapon = context.get<WeaponState>('tank:weapon');
      if (!transform || !weapon) return;
      const distance = 5.4 * context.deltaSeconds;
      context.set('core:transform2d', {
        ...transform,
        position: {
          x: Math.max(
            0.9,
            Math.min(31.1, transform.position.x + delta.x * distance),
          ),
          y: Math.max(
            1.2,
            Math.min(16.6, transform.position.y + delta.y * distance),
          ),
        },
      });
      context.set('tank:weapon', { ...weapon, direction: delta });
      return;
    }

    if (action !== 'fire') return;
    const transform = context.get<Transform2D>('core:transform2d');
    const weapon = context.get<WeaponState>('tank:weapon');
    if (!transform || !weapon || context.tick < weapon.nextFireTick) return;
    const id = `tank:bullet/${context.tick}`;
    const direction = weapon.direction;
    context.spawnPrefab('prefabs/player-shell.prefab.json', {
      objectId: id,
      name: `Player shell ${context.tick}`,
      order: 30,
      position: {
        x: transform.position.x + direction.x * 0.9,
        y: transform.position.y + direction.y * 0.9,
      },
      componentOverrides: {
        'physics:rigidbody2d': {
          velocity: { x: direction.x * 12, y: direction.y * 12 },
        },
        'tank:projectile': { owner: context.objectId, spent: false },
      },
    });
    context.set('tank:weapon', {
      ...weapon,
      nextFireTick: context.tick + 8,
    });
    context.playAudio(FIRE_SOUND, {
      instanceId: `tank:audio/fire/${context.tick}`,
      busId: 'audio:bus/sfx',
      volume: 0.55,
    });
    context.emit('tank:fired', { unitId: context.objectId, projectileId: id });
  },
});
