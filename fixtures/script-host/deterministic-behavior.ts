type ScriptEvent<TPayload = Record<string, unknown>> = {
  type: string;
  payload: TPayload;
};

type FixedUpdateContext = {
  tick: number;
  seed: number;
  state: Record<string, number>;
  events: ScriptEvent[];
  randomU32(): number;
  emit(type: string, payload: Record<string, unknown>): void;
};

type Behavior = {
  onFixedUpdate?(context: FixedUpdateContext): void;
  onEvent?(event: ScriptEvent, context: FixedUpdateContext): void;
};

declare function defineBehavior(behavior: Behavior): void;

defineBehavior({
  onFixedUpdate(context) {
    context.state.x = (context.state.x ?? 0) + 1;
    context.state.sample = context.randomU32();
    if (context.state.x === 2) {
      context.emit('fixture:threshold-reached', {
        value: context.state.x,
        tick: context.tick,
      });
    }
  },
  onEvent(event, context) {
    if (event.type === 'fixture:boost') {
      const amount = Number(event.payload.amount ?? 0);
      context.state.x += amount;
    }
  },
});
