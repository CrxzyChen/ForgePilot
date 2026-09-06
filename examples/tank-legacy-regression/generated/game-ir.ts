/* Generated from examples/tank-legacy-regression/schemas/game-ir.schema.json. Do not edit by hand. */

/**
 * Stable namespace:path identifier. IDs are permanent once published.
 *
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "ResourceId".
 */
export type ResourceId = string;
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "DisplayName".
 */
export type DisplayName = string;
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "Component".
 */
export type Component =
  | TransformComponent
  | PlayerControlledComponent
  | MergeableComponent
  | ProducerComponent
  | CaptureSiteComponent
  | StrategicSiteComponent
  | HostileAiComponent
  | TankComponent
  | TerrainComponent
  | BaseComponent
  | EnemyBehaviorComponent
  | WaveSpawnerComponent
  | VictoryTargetComponent;
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "Command".
 */
export type Command = MoveUnitCommand | FireCommand;
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "EventPayload".
 */
export type EventPayload =
  | CommandAcceptedEvent
  | UnitMovedEvent
  | ResourceProducedEvent
  | UnitMergedEvent
  | UnitDefeatedEvent
  | SiteCapturedEvent
  | UnitUpgradedEvent
  | VictoryAchievedEvent
  | ShotFiredEvent
  | EntityDamagedEvent
  | EntityDestroyedEvent
  | EnemySpawnedEvent;
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "WorldOutcome".
 */
export type WorldOutcome =
  | {
      status: 'in-progress';
    }
  | {
      status: 'won';
      faction: ResourceId;
      tick: number;
    }
  | {
      status: 'lost';
      tick: number;
    };

/**
 * Authoritative, AI-editable source for an AI Game Kernel project.
 */
export interface GameProject {
  kind: 'ai-game-kernel/project';
  schemaVersion: '1.0.0';
  id: ResourceId;
  name: DisplayName;
  entryWorld: ResourceId;
  /**
   * @minItems 1
   */
  worlds: [World, ...World[]];
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "World".
 */
export interface World {
  id: ResourceId;
  name: DisplayName;
  bounds: WorldBounds;
  entities: Entity[];
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "WorldBounds".
 */
export interface WorldBounds {
  width: number;
  height: number;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "Entity".
 */
export interface Entity {
  id: ResourceId;
  name: DisplayName;
  /**
   * @minItems 1
   */
  components: [Component, ...Component[]];
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "TransformComponent".
 */
export interface TransformComponent {
  type: 'core:transform';
  position: TilePosition;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "TilePosition".
 */
export interface TilePosition {
  x: number;
  y: number;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "PlayerControlledComponent".
 */
export interface PlayerControlledComponent {
  type: 'game:player-controlled';
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "MergeableComponent".
 */
export interface MergeableComponent {
  type: 'game:mergeable';
  faction: ResourceId;
  strength: number;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "ProducerComponent".
 */
export interface ProducerComponent {
  type: 'game:producer';
  resource: 'grain' | 'weapons' | 'industry';
  amountPerCycle: number;
  cycleTicks: number;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "CaptureSiteComponent".
 */
export interface CaptureSiteComponent {
  type: 'game:capture-site';
  requiredStrength: number;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "StrategicSiteComponent".
 */
export interface StrategicSiteComponent {
  type: 'game:strategic-site';
  kind: 'granary' | 'armory' | 'factory';
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "HostileAiComponent".
 */
export interface HostileAiComponent {
  type: 'game:hostile-ai';
  moveEveryTicks: number;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "TankComponent".
 */
export interface TankComponent {
  type: 'game:tank';
  faction: ResourceId;
  role: 'player' | 'enemy';
  health: number;
  maxHealth: number;
  damage: number;
  range: number;
  scoreValue: number;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "TerrainComponent".
 */
export interface TerrainComponent {
  type: 'game:terrain';
  kind: 'brick' | 'steel' | 'water' | 'foliage';
  blocksMovement: boolean;
  blocksShots: boolean;
  destructible: boolean;
  health: number;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "BaseComponent".
 */
export interface BaseComponent {
  type: 'game:base';
  faction: ResourceId;
  health: number;
  maxHealth: number;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "EnemyBehaviorComponent".
 */
export interface EnemyBehaviorComponent {
  type: 'game:enemy-behavior';
  kind: 'chaser' | 'patrol' | 'guard';
  moveEveryTicks: number;
  fireEveryTicks: number;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "WaveSpawnerComponent".
 */
export interface WaveSpawnerComponent {
  type: 'game:wave-spawner';
  wave: number;
  archetype: 'scout' | 'striker' | 'heavy';
  faction: ResourceId;
  spawnEveryTicks: number;
  total: number;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "VictoryTargetComponent".
 */
export interface VictoryTargetComponent {
  type: 'game:victory-target';
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "MoveUnitCommand".
 */
export interface MoveUnitCommand {
  commandId: ResourceId;
  tick: number;
  type: 'game:move-unit';
  entityId: ResourceId;
  destination: TilePosition;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "FireCommand".
 */
export interface FireCommand {
  commandId: ResourceId;
  tick: number;
  type: 'game:fire';
  entityId: ResourceId;
  direction: 'up' | 'down' | 'left' | 'right';
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "InputLog".
 */
export interface InputLog {
  schemaVersion: '1.0.0';
  seed: number;
  ticks: number;
  commands: Command[];
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "CommandAcceptedEvent".
 */
export interface CommandAcceptedEvent {
  type: 'command-accepted';
  commandId: ResourceId;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "UnitMovedEvent".
 */
export interface UnitMovedEvent {
  type: 'unit-moved';
  from: TilePosition;
  to: TilePosition;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "ResourceProducedEvent".
 */
export interface ResourceProducedEvent {
  type: 'resource-produced';
  resource: 'grain' | 'weapons' | 'industry';
  amount: number;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "UnitMergedEvent".
 */
export interface UnitMergedEvent {
  type: 'unit-merged';
  absorbedEntityId: ResourceId;
  strengthGained: number;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "UnitDefeatedEvent".
 */
export interface UnitDefeatedEvent {
  type: 'unit-defeated';
  defeatedEntityId: ResourceId;
  strengthGained: number;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "SiteCapturedEvent".
 */
export interface SiteCapturedEvent {
  type: 'site-captured';
  siteId: ResourceId;
  owner: ResourceId;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "UnitUpgradedEvent".
 */
export interface UnitUpgradedEvent {
  type: 'unit-upgraded';
  siteId: ResourceId;
  strengthGained: number;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "VictoryAchievedEvent".
 */
export interface VictoryAchievedEvent {
  type: 'victory-achieved';
  faction: ResourceId;
  targetId: ResourceId;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "ShotFiredEvent".
 */
export interface ShotFiredEvent {
  type: 'shot-fired';
  direction: 'up' | 'down' | 'left' | 'right';
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "EntityDamagedEvent".
 */
export interface EntityDamagedEvent {
  type: 'entity-damaged';
  targetId: ResourceId;
  amount: number;
  remainingHealth: number;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "EntityDestroyedEvent".
 */
export interface EntityDestroyedEvent {
  type: 'entity-destroyed';
  targetId: ResourceId;
  scoreAwarded: number;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "EnemySpawnedEvent".
 */
export interface EnemySpawnedEvent {
  type: 'enemy-spawned';
  spawnerId: ResourceId;
  enemyId: ResourceId;
  wave: number;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "Event".
 */
export interface Event {
  sequence: number;
  tick: number;
  system:
    | 'command'
    | 'movement'
    | 'production'
    | 'strategy'
    | 'combat'
    | 'interaction'
    | 'victory';
  entityId: ResourceId | null;
  event: EventPayload;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "MergeableSnapshot".
 */
export interface MergeableSnapshot {
  faction: ResourceId;
  strength: number;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "ProducerSnapshot".
 */
export interface ProducerSnapshot {
  resource: 'grain' | 'weapons' | 'industry';
  amountPerCycle: number;
  cycleTicks: number;
  progressTicks: number;
  stored: number;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "CaptureSiteSnapshot".
 */
export interface CaptureSiteSnapshot {
  requiredStrength: number;
  owner: ResourceId | null;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "StrategicSiteSnapshot".
 */
export interface StrategicSiteSnapshot {
  kind: 'granary' | 'armory' | 'factory';
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "HostileAiSnapshot".
 */
export interface HostileAiSnapshot {
  moveEveryTicks: number;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "TankSnapshot".
 */
export interface TankSnapshot {
  faction: ResourceId;
  role: 'player' | 'enemy';
  health: number;
  maxHealth: number;
  damage: number;
  range: number;
  scoreValue: number;
  facing: 'up' | 'down' | 'left' | 'right';
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "TerrainSnapshot".
 */
export interface TerrainSnapshot {
  kind: 'brick' | 'steel' | 'water' | 'foliage';
  blocksMovement: boolean;
  blocksShots: boolean;
  destructible: boolean;
  health: number;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "BaseSnapshot".
 */
export interface BaseSnapshot {
  faction: ResourceId;
  health: number;
  maxHealth: number;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "EnemyBehaviorSnapshot".
 */
export interface EnemyBehaviorSnapshot {
  kind: 'chaser' | 'patrol' | 'guard';
  moveEveryTicks: number;
  fireEveryTicks: number;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "WaveSpawnerSnapshot".
 */
export interface WaveSpawnerSnapshot {
  wave: number;
  archetype: 'scout' | 'striker' | 'heavy';
  faction: ResourceId;
  spawnEveryTicks: number;
  total: number;
  spawned: number;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "EntitySnapshot".
 */
export interface EntitySnapshot {
  id: ResourceId;
  name: DisplayName;
  position: TilePosition | null;
  playerControlled: boolean;
  mergeable: MergeableSnapshot | null;
  producer: ProducerSnapshot | null;
  captureSite: CaptureSiteSnapshot | null;
  strategicSite?: StrategicSiteSnapshot;
  hostileAi?: HostileAiSnapshot;
  victoryTarget?: boolean;
  tank?: TankSnapshot;
  terrain?: TerrainSnapshot;
  base?: BaseSnapshot;
  enemyBehavior?: EnemyBehaviorSnapshot;
  waveSpawner?: WaveSpawnerSnapshot;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "Snapshot".
 */
export interface Snapshot {
  schemaVersion: '1.0.0';
  projectId: ResourceId;
  worldId: ResourceId;
  tick: number;
  seed: number;
  rngState: number;
  componentTypes: ResourceId[];
  entities: EntitySnapshot[];
  outcome?: WorldOutcome;
  score?: number;
  stateHash: string;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "ChangeOperation".
 */
export interface ChangeOperation {
  op: 'add' | 'replace' | 'remove';
  path: string;
  value?: unknown;
}
/**
 * This interface was referenced by `GameProject`'s JSON-Schema
 * via the `definition` "ChangeSet".
 */
export interface ChangeSet {
  id: ResourceId;
  baseRevision: string;
  reason: string;
  /**
   * @minItems 1
   */
  operations: [ChangeOperation, ...ChangeOperation[]];
}
