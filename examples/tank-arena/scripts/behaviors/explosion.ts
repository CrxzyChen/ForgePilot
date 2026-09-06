import { defineBehavior } from '@aigame/sdk';

type Lifetime = { destroyAtTick: number; durationTicks: number };

export default defineBehavior({
  onStart(context) {
    const lifetime = context.get<Lifetime>('tank:lifetime');
    if (!lifetime) return;
    context.set('tank:lifetime', {
      ...lifetime,
      destroyAtTick: context.tick + Math.max(1, lifetime.durationTicks),
    });
  },

  onFixedUpdate(context) {
    const lifetime = context.get<Lifetime>('tank:lifetime');
    if (lifetime && context.tick >= lifetime.destroyAtTick) context.destroy();
  },
});
