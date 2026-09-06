declare module '@aigame/sdk' {
  export type ObjectId = string;
  export type ComponentType = string;

  export type RuntimeComponent = {
    id: string;
    type: ComponentType;
    enabled?: boolean;
    data: Record<string, unknown>;
  };

  export type RuntimeObject = {
    id: ObjectId;
    name?: string;
    enabled?: boolean;
    visible?: boolean;
    locked?: boolean;
    parentId?: ObjectId | null;
    order?: number;
    components: RuntimeComponent[];
  };

  export type PrefabSpawnOptions = {
    objectId: ObjectId;
    name?: string;
    parentId?: ObjectId | null;
    order?: number;
    position?: Readonly<{ x: number; y: number }>;
    componentOverrides?: Readonly<
      Record<ComponentType, Readonly<Record<string, unknown>>>
    >;
  };

  export type SceneLoadOptions = {
    /** Shallow data patches applied before destination onStart/onEnable. */
    componentOverrides?: readonly Readonly<{
      objectId: ObjectId;
      componentId: string;
      data: Readonly<Record<string, unknown>>;
    }>[];
  };

  export type ProjectEvent<T = Readonly<Record<string, unknown>>> = Readonly<{
    type: string;
    payload: T;
  }>;

  export type AuthoritativeContext = {
    readonly tick: number;
    readonly deltaSeconds: number;
    readonly objectId: ObjectId | null;
    get<T>(component: ComponentType): Readonly<T> | undefined;
    get<T>(object: ObjectId, component: ComponentType): Readonly<T> | undefined;
    set<T>(component: ComponentType, value: T): void;
    set<T>(object: ObjectId, component: ComponentType, value: T): void;
    query(components: readonly ComponentType[]): readonly ObjectId[];
    emit<T>(event: string, payload: Readonly<T>): void;
    playAudio(
      clip: string,
      options?: Readonly<{
        instanceId?: string;
        busId?: string;
        volume?: number;
        loop?: boolean;
      }>,
    ): string;
    /** Pass the same Bus as playAudio; omitted Bus defaults to audio:bus/master. */
    stopAudio(instanceId: string, busId?: string): void;
    /** Pass the same Bus as playAudio; no device/global instance history is inferred. */
    pauseAudio(instanceId: string, busId?: string): void;
    /** Pass the same Bus as playAudio; omitted Bus defaults to audio:bus/master. */
    resumeAudio(instanceId: string, busId?: string): void;
    setAudioBus(
      busId: string,
      settings: Readonly<{ volume?: number; muted?: boolean }>,
    ): void;
    spawn(object: RuntimeObject): ObjectId;
    spawnPrefab(prefab: string, options: PrefabSpawnOptions): ObjectId;
    destroy(object?: ObjectId): void;
    setEnabled(object: ObjectId, enabled: boolean): void;
    setVisible(object: ObjectId, visible: boolean): void;
    loadScene(scene: string, options?: SceneLoadOptions): void;
    randomU32(): number;
  };

  export type FrameContext = Readonly<{
    tick: number;
    alpha: number;
    deltaSeconds: number;
    objectId: ObjectId | null;
    get<T>(component: ComponentType): Readonly<T> | undefined;
    get<T>(object: ObjectId, component: ComponentType): Readonly<T> | undefined;
    query(components: readonly ComponentType[]): readonly ObjectId[];
  }>;

  export interface Behavior {
    onStart?(context: AuthoritativeContext): void;
    onEnable?(context: AuthoritativeContext): void;
    onFixedUpdate?(context: AuthoritativeContext): void;
    onFrame?(context: FrameContext): void;
    onInput?(
      action: string,
      value: number,
      context: AuthoritativeContext,
    ): void;
    onCommand?(command: ProjectEvent, context: AuthoritativeContext): void;
    onEvent?(event: ProjectEvent, context: AuthoritativeContext): void;
    onCollisionEnter?(
      otherObject: ObjectId,
      context: AuthoritativeContext,
    ): void;
    onCollisionStay?(
      otherObject: ObjectId,
      context: AuthoritativeContext,
    ): void;
    onCollisionExit?(
      otherObject: ObjectId,
      context: AuthoritativeContext,
    ): void;
    onDisable?(context: AuthoritativeContext): void;
    onDestroy?(context: AuthoritativeContext): void;
  }

  export interface System {
    onFixedUpdate?(
      context: AuthoritativeContext & { objects: readonly ObjectId[] },
    ): void;
    onCommand?(
      command: ProjectEvent,
      context: AuthoritativeContext & { objects: readonly ObjectId[] },
    ): void;
    onEvent?(
      event: ProjectEvent,
      context: AuthoritativeContext & { objects: readonly ObjectId[] },
    ): void;
  }

  export function defineBehavior<T extends Behavior>(behavior: T): T;
  export function defineSystem<T extends System>(system: T): T;
}
