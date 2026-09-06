import { defineBehavior, type AuthoritativeContext } from '@aigame/sdk';

type Transform2D = {
  position: { x: number; y: number };
};

type Projectile = {
  owner: string;
  spent: boolean;
};

type Unit = {
  team: string;
  health: number;
};

type Wall = { destructible: boolean; health: number };

const HIT_SOUND = 'tank-arena-example:asset/hit-v1';

function spawnExplosion(
  context: AuthoritativeContext,
  position: { x: number; y: number },
) {
  context.spawnPrefab('prefabs/explosion.prefab.json', {
    objectId: `tank:explosion/${context.tick}/${context.objectId?.replace(/[^a-z0-9_-]/giu, '-') ?? 'effect'}`,
    name: 'Impact Explosion',
    position,
    order: 40,
  });
}

export default defineBehavior({
  onFixedUpdate(context) {
    const transform = context.get<Transform2D>('core:transform2d');
    if (
      transform &&
      (transform.position.x < -1 ||
        transform.position.x > 33 ||
        transform.position.y < -1 ||
        transform.position.y > 19)
    ) {
      context.destroy();
    }
  },

  onCollisionEnter(otherObject, context) {
    const projectile = context.get<Projectile>('tank:projectile');
    if (!projectile || projectile.spent || otherObject === projectile.owner)
      return;
    const wall = context.get<Wall>(otherObject, 'tank:wall');
    if (wall) {
      const transform = context.get<Transform2D>('core:transform2d');
      context.set('tank:projectile', { ...projectile, spent: true });
      context.destroy();
      let destroyed = false;
      if (wall.destructible) {
        const health = Math.max(0, wall.health - 1);
        destroyed = health === 0;
        if (destroyed) context.destroy(otherObject);
        else context.set(otherObject, 'tank:wall', { ...wall, health });
      }
      if (transform) spawnExplosion(context, transform.position);
      context.playAudio(HIT_SOUND, {
        instanceId: `tank:audio/wall-hit/${context.tick}`,
        busId: 'audio:bus/sfx',
        volume: 0.5,
      });
      context.emit('tank:wall-hit', {
        wallId: otherObject,
        projectileId: context.objectId,
        destroyed,
      });
      return;
    }
    const unit = context.get<Unit>(otherObject, 'tank:unit');
    if (!unit || unit.team !== 'enemy') return;
    const transform = context.get<Transform2D>('core:transform2d');
    context.set('tank:projectile', { ...projectile, spent: true });
    context.set(otherObject, 'tank:unit', { ...unit, health: 0 });
    context.destroy(otherObject);
    context.destroy();
    if (transform) spawnExplosion(context, transform.position);
    context.emit('tank:enemy-destroyed', {
      enemyId: otherObject,
      projectileId: context.objectId,
      score: 100,
    });
  },
});
