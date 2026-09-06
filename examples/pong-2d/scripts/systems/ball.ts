import { defineSystem } from '@aigame/sdk';
type Transform = {
  position: { x: number; y: number };
  rotation: number;
  scale: { x: number; y: number };
};
type Velocity = { x: number; y: number };
export const updateBall = defineSystem({
  onFixedUpdate(context) {
    for (const id of context.objects) {
      const transform = context.get(id, 'core:transform2d') as Transform;
      const velocity = context.get(id, 'pong:velocity') as Velocity;
      let x = transform.position.x + velocity.x;
      let y = transform.position.y + velocity.y;
      let vx = velocity.x;
      let vy = velocity.y;
      if (y <= 0.7 || y >= 17.3) vy = -vy;
      if (x <= 2.7 || x >= 29.3) vx = -vx;
      if (x < 0 || x > 32) {
        x = 16;
        y = 9;
        vx = x < 0 ? 0.11 : -0.11;
      }
      context.set(id, 'core:transform2d', { ...transform, position: { x, y } });
      context.set(id, 'pong:velocity', { x: vx, y: vy });
    }
  },
});
