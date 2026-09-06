import { defineBehavior } from '@aigame/sdk';
type Transform = {
  position: { x: number; y: number };
  rotation: number;
  scale: { x: number; y: number };
};
export default defineBehavior({
  onInput(action, value, context) {
    if (value <= 0) return;
    const paddle = context.get('pong:paddle') as { side: string };
    const up = paddle.side === 'left' ? 'left-up' : 'right-up';
    const down = paddle.side === 'left' ? 'left-down' : 'right-down';
    if (action !== up && action !== down) return;
    const transform = context.get('core:transform2d') as Transform;
    const y = Math.max(
      2,
      Math.min(16, transform.position.y + (action === up ? -0.8 : 0.8)),
    );
    context.set('core:transform2d', {
      ...transform,
      position: { ...transform.position, y },
    });
  },
});
