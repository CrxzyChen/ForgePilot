import { defineBehavior, type AuthoritativeContext } from '@aigame/sdk';

type Transform3D = {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
};
type PlayerState = { collected: number };
type ItemState = { active: boolean };
type UiText = { text: string; fontSize: number; color: string };

const movement: Record<string, { x: number; z: number }> = {
  'move-forward': { x: 0, z: -1 },
  'move-back': { x: 0, z: 1 },
  'move-left': { x: -1, z: 0 },
  'move-right': { x: 1, z: 0 },
};

function updateUi(context: AuthoritativeContext, total: number) {
  const score = context.get<UiText>('collect:ui/score', 'ui:text');
  if (score) {
    context.set('collect:ui/score', 'ui:text', {
      ...score,
      text: `CRYSTALS ${total} / 3`,
    });
  }
  context.setVisible('collect:ui/win', total === 3);
  context.setVisible('collect:ui/restart', total === 3);
}

export default defineBehavior({
  onStart(context) {
    const state = context.get<PlayerState>('collect:player-state');
    updateUi(context, state?.collected ?? 0);
  },

  onInput(action, value, context) {
    if (value <= 0) return;
    const state = context.get<PlayerState>('collect:player-state');
    if (action === 'restart' && state?.collected === 3) {
      context.loadScene('scenes/main.game.json');
      return;
    }
    const delta = movement[action];
    if (!delta) return;
    const transform = context.get<Transform3D>('core:transform3d');
    if (!transform) return;
    const distance = 4.2 * context.deltaSeconds;
    context.set('core:transform3d', {
      ...transform,
      position: {
        ...transform.position,
        x: Math.max(
          -4.25,
          Math.min(4.25, transform.position.x + delta.x * distance),
        ),
        z: Math.max(
          -4.25,
          Math.min(4.25, transform.position.z + delta.z * distance),
        ),
      },
    });
  },

  onCollisionEnter(otherObject, context) {
    const item = context.get<ItemState>(otherObject, 'collect:item');
    if (!item?.active) return;
    const state = context.get<PlayerState>('collect:player-state');
    if (!state) return;
    const next = { collected: state.collected + 1 };
    context.set(otherObject, 'collect:item', { active: false });
    context.setVisible(otherObject, false);
    context.set('collect:player-state', next);
    updateUi(context, next.collected);
    context.emit('collect:item-picked', {
      itemId: otherObject,
      total: next.collected,
    });
  },
});
