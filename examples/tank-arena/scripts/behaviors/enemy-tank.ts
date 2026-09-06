import { defineBehavior } from '@aigame/sdk';

type Transform2D = {
  position: { x: number; y: number };
  rotation: number;
  scale: { x: number; y: number };
};

type GameState = {
  phase: 'menu' | 'playing' | 'paused' | 'won' | 'lost';
};

type EnemyState = {
  breached: boolean;
  speed: number;
};

export default defineBehavior({
  onFixedUpdate(context) {
    const game = context.get<GameState>('tank:game', 'tank:game-state');
    const enemy = context.get<EnemyState>('tank:enemy-state');
    const transform = context.get<Transform2D>('core:transform2d');
    if (
      !game ||
      game.phase !== 'playing' ||
      !enemy ||
      enemy.breached ||
      !transform
    )
      return;
    context.set('core:transform2d', {
      ...transform,
      position: {
        x: transform.position.x,
        y: transform.position.y + enemy.speed * context.deltaSeconds,
      },
    });
  },

  onCollisionEnter(otherObject, context) {
    const game = context.get<GameState>('tank:game', 'tank:game-state');
    const enemy = context.get<EnemyState>('tank:enemy-state');
    if (!game || game.phase !== 'playing' || !enemy || enemy.breached) return;
    if (otherObject !== 'tank:player' && otherObject !== 'tank:base') return;
    context.set('tank:enemy-state', { ...enemy, breached: true });
    context.destroy();
    context.emit(
      otherObject === 'tank:base' ? 'tank:base-hit' : 'tank:player-hit',
      { enemyId: context.objectId, targetId: otherObject },
    );
  },
});
