import {
  defineBehavior,
  type AuthoritativeContext,
  type ProjectEvent,
} from '@aigame/sdk';

type GamePhase = 'menu' | 'playing' | 'paused' | 'won' | 'lost';
type GameState = {
  phase: GamePhase;
  score: number;
  enemiesRemaining: number;
  helpVisible: boolean;
  muted: boolean;
  masterVolume: number;
};
type Unit = { team: string; health: number };
type Latches = Record<string, boolean>;
type UiText = { text: string; fontSize: number; color: string };

const HIT_SOUND = 'tank-arena-example:asset/hit-v1';
const RESULT_SOUND = 'tank-arena-example:asset/result-v1';
const UI_SOUND = 'tank-arena-example:asset/result-v1';

function setText(
  context: AuthoritativeContext,
  objectId: string,
  text: string,
) {
  const current = context.get<UiText>(objectId, 'ui:text');
  if (current) context.set(objectId, 'ui:text', { ...current, text });
}

function present(context: AuthoritativeContext, game: GameState) {
  const menu = game.phase === 'menu';
  const playing = game.phase === 'playing' || game.phase === 'paused';
  const paused = game.phase === 'paused';
  const won = game.phase === 'won';
  const lost = game.phase === 'lost';
  context.setVisible('tank:ui/title', menu);
  context.setVisible('tank:ui/start', menu);
  context.setVisible('tank:ui/help-button', menu);
  context.setVisible('tank:ui/hud-score', playing);
  context.setVisible('tank:ui/hud-health', playing);
  context.setVisible('tank:ui/hud-hint', playing && !paused);
  context.setVisible('tank:ui/pause-title', paused);
  context.setVisible('tank:ui/resume', paused);
  context.setVisible('tank:ui/win-title', won);
  context.setVisible('tank:ui/lose-title', lost);
  context.setVisible('tank:ui/restart-win', won);
  context.setVisible('tank:ui/restart-lose', lost);
  context.setVisible('tank:ui/help', game.helpVisible);
  context.setVisible('tank:ui/audio-status', true);
  context.setVisible('tank:ui/mute', true);
  context.setVisible('tank:ui/volume-down', true);
  context.setVisible('tank:ui/volume-up', true);
  setText(context, 'tank:ui/hud-score', `SCORE ${game.score}`);
  const player = context.get<Unit>('tank:player', 'tank:unit');
  setText(
    context,
    'tank:ui/hud-health',
    `ARMOR ${Math.max(0, player?.health ?? 0)}`,
  );
  setText(
    context,
    'tank:ui/audio-status',
    `${game.muted ? 'MUTED' : 'AUDIO'} ${Math.round(game.masterVolume * 100)}%`,
  );
}

export default defineBehavior({
  onStart(context) {
    const game = context.get<GameState>('tank:game-state');
    if (game) {
      context.setAudioBus('audio:bus/master', {
        volume: game.masterVolume,
        muted: game.muted,
      });
      present(context, game);
    }
  },

  onInput(action, value, context) {
    if (
      ![
        'start-game',
        'pause',
        'restart',
        'toggle-help',
        'toggle-mute',
        'volume-down',
        'volume-up',
      ].includes(action)
    )
      return;
    const latches = context.get<Latches>('tank:input-latches') ?? {};
    if (value <= 0) {
      context.set('tank:input-latches', { ...latches, [action]: false });
      return;
    }
    if (latches[action]) return;
    context.set('tank:input-latches', { ...latches, [action]: true });
    const game = context.get<GameState>('tank:game-state');
    if (!game) return;
    if (action === 'toggle-help') {
      const next = { ...game, helpVisible: !game.helpVisible };
      context.set('tank:game-state', next);
      present(context, next);
      return;
    }
    if (action === 'toggle-mute') {
      const next = { ...game, muted: !game.muted };
      context.set('tank:game-state', next);
      context.setAudioBus('audio:bus/master', { muted: next.muted });
      present(context, next);
      return;
    }
    if (action === 'volume-down' || action === 'volume-up') {
      const direction = action === 'volume-up' ? 1 : -1;
      const next = {
        ...game,
        masterVolume: Math.max(
          0,
          Math.min(
            1,
            Math.round((game.masterVolume + direction * 0.1) * 10) / 10,
          ),
        ),
      };
      context.set('tank:game-state', next);
      context.setAudioBus('audio:bus/master', { volume: next.masterVolume });
      present(context, next);
      return;
    }
    if (action === 'start-game' && game.phase === 'menu') {
      const next: GameState = { ...game, phase: 'playing', helpVisible: false };
      context.set('tank:game-state', next);
      context.playAudio(UI_SOUND, {
        instanceId: `tank:audio/ui-confirm/${context.tick}`,
        busId: 'audio:bus/ui',
        volume: 0.45,
      });
      present(context, next);
    } else if (
      action === 'pause' &&
      (game.phase === 'playing' || game.phase === 'paused')
    ) {
      const next: GameState = {
        ...game,
        phase: game.phase === 'paused' ? 'playing' : 'paused',
      };
      context.set('tank:game-state', next);
      present(context, next);
    } else if (
      action === 'restart' &&
      (game.phase === 'won' || game.phase === 'lost')
    ) {
      context.loadScene('scenes/main.game.json');
    }
  },

  onEvent(event: ProjectEvent, context) {
    const game = context.get<GameState>('tank:game-state');
    if (!game || game.phase !== 'playing') return;
    if (event.type === 'tank:enemy-destroyed') {
      const score = Number((event.payload as { score?: number }).score ?? 100);
      const next: GameState = {
        ...game,
        score: game.score + score,
        enemiesRemaining: Math.max(0, game.enemiesRemaining - 1),
      };
      if (next.enemiesRemaining === 0) next.phase = 'won';
      context.set('tank:game-state', next);
      context.playAudio(HIT_SOUND, {
        instanceId: `tank:audio/hit/${context.tick}`,
        busId: 'audio:bus/sfx',
        volume: 0.5,
      });
      if (next.phase === 'won') {
        context.playAudio(RESULT_SOUND, {
          instanceId: `tank:audio/win/${context.tick}`,
          busId: 'audio:bus/ui',
          volume: 0.7,
        });
      }
      present(context, next);
      return;
    }
    if (event.type === 'tank:player-hit') {
      const player = context.get<Unit>('tank:player', 'tank:unit');
      if (!player) return;
      const health = Math.max(0, player.health - 1);
      context.set('tank:player', 'tank:unit', { ...player, health });
      const next: GameState = {
        ...game,
        phase: health === 0 ? 'lost' : game.phase,
      };
      context.set('tank:game-state', next);
      context.playAudio(HIT_SOUND, {
        instanceId: `tank:audio/player-hit/${context.tick}`,
        busId: 'audio:bus/sfx',
      });
      present(context, next);
      return;
    }
    if (event.type === 'tank:base-hit') {
      const next: GameState = { ...game, phase: 'lost' };
      context.set('tank:game-state', next);
      context.playAudio(RESULT_SOUND, {
        instanceId: `tank:audio/lose/${context.tick}`,
        busId: 'audio:bus/ui',
        volume: 0.65,
      });
      present(context, next);
    }
  },
});
