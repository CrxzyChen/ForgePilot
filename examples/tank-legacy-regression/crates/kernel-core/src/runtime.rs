//! Deterministic, headless world execution and replay.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    KERNEL_PROTOCOL_VERSION, KernelConfig,
    determinism::{FixedClock, SeededRng, Tick, canonical_hash},
    ir::GameProject,
};

/// Stable system schedule. Adding or reordering an entry changes replay behavior.
pub const SYSTEM_ORDER: [SystemId; 7] = [
    SystemId::Command,
    SystemId::Movement,
    SystemId::Production,
    SystemId::Strategy,
    SystemId::Combat,
    SystemId::Interaction,
    SystemId::Victory,
];

/// Identifies the deterministic system responsible for an event or error.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SystemId {
    /// Converts source data to runtime storage.
    Loader,
    /// Validates and accepts commands for the current tick.
    Command,
    /// Applies accepted movement in stable entity-ID order.
    Movement,
    /// Advances automated production in stable entity-ID order.
    Production,
    /// Moves hostile units using deterministic strategy.
    Strategy,
    /// Resolves player and enemy projectiles in stable shooter-ID order.
    Combat,
    /// Resolves merging, combat, and strategic-site capture.
    Interaction,
    /// Evaluates terminal world outcomes.
    Victory,
    /// Serializes canonical state.
    Snapshot,
    /// Compares a replay with an expected state hash.
    Replay,
}

/// Structured execution failure suitable for AI repair loops.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelError {
    /// Stable automation code.
    pub code: String,
    /// Tick at which execution failed.
    pub tick: Tick,
    /// System that rejected the operation.
    pub system: SystemId,
    /// Related entity when available.
    pub entity_id: Option<String>,
    /// Human-readable explanation.
    pub message: String,
}

impl KernelError {
    fn new(
        code: impl Into<String>,
        tick: Tick,
        system: SystemId,
        entity_id: Option<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            code: code.into(),
            tick,
            system,
            entity_id,
            message: message.into(),
        }
    }
}

/// Kernel result with a compact boxed diagnostic error.
pub type KernelResult<T> = Result<T, KernelError>;

/// Integer position in authoritative tile space.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct TilePosition {
    /// Horizontal tile coordinate.
    pub x: i64,
    /// Vertical tile coordinate.
    pub y: i64,
}

/// Runtime state for mergeable units.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeableState {
    /// Owning faction ID.
    pub faction: String,
    /// Current unit strength.
    pub strength: u64,
}

/// Runtime state for automatic resource producers.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProducerState {
    /// Resource key.
    pub resource: String,
    /// Resource units produced per cycle.
    pub amount_per_cycle: u64,
    /// Fixed ticks in one cycle.
    pub cycle_ticks: u64,
    /// Progress accumulated since the last cycle.
    pub progress_ticks: u64,
    /// Total output accumulated at this site.
    pub stored: u64,
}

/// Runtime state for capturable strategic sites.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureSiteState {
    /// Minimum unit strength needed to capture the site.
    pub required_strength: u64,
    /// Current owning faction, if captured.
    pub owner: Option<String>,
}

/// Supported strategic site behavior.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum StrategicSiteKind {
    /// Stores grain for economy progression.
    Granary,
    /// Produces weapons that automatically strengthen the owner.
    Armory,
    /// Produces industry that strengthens the owner at double rate.
    Factory,
}

/// Runtime behavior for a named strategic site.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategicSiteState {
    /// Type of automated site.
    pub kind: StrategicSiteKind,
}

/// Deterministic hostile movement cadence.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostileAiState {
    /// Number of fixed ticks between movement decisions.
    pub move_every_ticks: u64,
}

/// Four cardinal directions used by deterministic tank aiming.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Direction {
    /// Negative Y.
    Up,
    /// Positive Y.
    Down,
    /// Negative X.
    Left,
    /// Positive X.
    Right,
}

impl Direction {
    const fn delta(self) -> TilePosition {
        match self {
            Self::Up => TilePosition { x: 0, y: -1 },
            Self::Down => TilePosition { x: 0, y: 1 },
            Self::Left => TilePosition { x: -1, y: 0 },
            Self::Right => TilePosition { x: 1, y: 0 },
        }
    }
}

/// Player/enemy role used by victory and score rules.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TankRole {
    /// Human-controlled tank.
    Player,
    /// Deterministic hostile tank.
    Enemy,
}

/// Deterministic combat state for one tank.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TankState {
    /// Stable faction ID.
    pub faction: String,
    /// Player or enemy role.
    pub role: TankRole,
    /// Current hit points.
    pub health: u64,
    /// Maximum hit points.
    pub max_health: u64,
    /// Damage per shot.
    pub damage: u64,
    /// Cardinal shot range in tiles.
    pub range: u64,
    /// Score awarded when this tank is destroyed.
    pub score_value: u64,
    /// Current deterministic aim direction.
    pub facing: Direction,
}

/// Authored terrain collision and destruction behavior.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerrainState {
    /// brick, steel, water, or foliage.
    pub kind: String,
    /// Whether tanks may enter the tile.
    pub blocks_movement: bool,
    /// Whether projectiles stop at the tile.
    pub blocks_shots: bool,
    /// Whether damage can remove the terrain.
    pub destructible: bool,
    /// Remaining terrain hit points.
    pub health: u64,
}

/// Base-defense objective state.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BaseState {
    /// Owning faction.
    pub faction: String,
    /// Current hit points.
    pub health: u64,
    /// Maximum hit points.
    pub max_health: u64,
}

/// Stable enemy movement strategy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EnemyBehaviorKind {
    /// Advances toward the player.
    Chaser,
    /// Walks a deterministic rectangular patrol.
    Patrol,
    /// Holds its authored position.
    Guard,
}

/// Enemy decision cadence.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnemyBehaviorState {
    /// Strategy kind.
    pub kind: EnemyBehaviorKind,
    /// Ticks between movement choices.
    pub move_every_ticks: u64,
    /// Ticks between aligned shots.
    pub fire_every_ticks: u64,
}

/// Built-in wave archetype used by project-authored spawners.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EnemyArchetype {
    /// Fast and fragile.
    Scout,
    /// Medium ranged attacker.
    Striker,
    /// Slow armored defender.
    Heavy,
}

/// Runtime progress for a deterministic wave spawner.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaveSpawnerState {
    /// Human-authored wave number.
    pub wave: u64,
    /// Enemy stats and behavior preset.
    pub archetype: EnemyArchetype,
    /// Spawned enemy faction.
    pub faction: String,
    /// Fixed spawn cadence.
    pub spawn_every_ticks: u64,
    /// Total enemies produced.
    pub total: u64,
    /// Enemies produced so far.
    pub spawned: u64,
}

/// Optional terminal state for worlds that declare a victory target.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "status",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum WorldOutcome {
    /// No terminal condition has been reached.
    InProgress,
    /// A faction captured the victory target.
    Won {
        /// Winning faction ID.
        faction: String,
        /// Tick on which victory was achieved.
        tick: Tick,
    },
    /// No player-controlled unit remains.
    Lost {
        /// Tick on which defeat was detected.
        tick: Tick,
    },
}

/// Deterministic entity state independent of any renderer or ECS handles.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityState {
    /// Stable Game IR ID.
    pub id: String,
    /// Human-facing label; never used as a reference.
    pub name: String,
    /// Tile transform, if present.
    pub position: Option<TilePosition>,
    /// Whether human input may address this entity.
    pub player_controlled: bool,
    /// Mergeable unit state.
    pub mergeable: Option<MergeableState>,
    /// Resource production state.
    pub producer: Option<ProducerState>,
    /// Strategic-site state.
    pub capture_site: Option<CaptureSiteState>,
    /// Named behavior for capturable economy sites.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub strategic_site: Option<StrategicSiteState>,
    /// Hostile deterministic strategy, if present.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hostile_ai: Option<HostileAiState>,
    /// Whether capturing this entity ends the world successfully.
    #[serde(default, skip_serializing_if = "is_false")]
    pub victory_target: bool,
    /// Tank combat state.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tank: Option<TankState>,
    /// Terrain collision/destruction state.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub terrain: Option<TerrainState>,
    /// Base-defense objective state.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base: Option<BaseState>,
    /// Deterministic enemy policy.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enemy_behavior: Option<EnemyBehaviorState>,
    /// Deterministic wave generation state.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wave_spawner: Option<WaveSpawnerState>,
}

/// AI-authored input log used for deterministic replay.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InputLog {
    /// Protocol version used by all commands.
    pub schema_version: String,
    /// Initial deterministic random seed.
    pub seed: u64,
    /// Number of fixed ticks to execute.
    pub ticks: u64,
    /// Commands. Execution groups them by tick and stable command ID.
    pub commands: Vec<RuntimeCommand>,
}

/// Supported headless runtime commands.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum RuntimeCommand {
    /// Moves one entity to an absolute tile in the current world.
    #[serde(rename = "game:move-unit")]
    MoveUnit {
        /// Globally stable command ID.
        #[serde(rename = "commandId")]
        command_id: String,
        /// Tick on which the command is applied.
        tick: Tick,
        /// Target entity.
        #[serde(rename = "entityId")]
        entity_id: String,
        /// New tile position.
        destination: TilePosition,
    },
    /// Fires a cardinal projectile from one tank.
    #[serde(rename = "game:fire")]
    Fire {
        /// Globally stable command ID.
        #[serde(rename = "commandId")]
        command_id: String,
        /// Tick on which the command is applied.
        tick: Tick,
        /// Shooting tank.
        #[serde(rename = "entityId")]
        entity_id: String,
        /// Aim direction for this shot.
        direction: Direction,
    },
}

impl RuntimeCommand {
    /// Tick on which this command is scheduled.
    #[must_use]
    pub const fn tick(&self) -> Tick {
        match self {
            Self::MoveUnit { tick, .. } | Self::Fire { tick, .. } => *tick,
        }
    }

    /// Globally stable command identifier.
    #[must_use]
    pub fn command_id(&self) -> &str {
        match self {
            Self::MoveUnit { command_id, .. } | Self::Fire { command_id, .. } => command_id,
        }
    }
}

/// Event emitted by the Command-to-Event pipeline.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum RuntimeEventKind {
    /// A command passed transactional validation.
    CommandAccepted {
        /// Accepted command ID.
        command_id: String,
    },
    /// A unit transform changed.
    UnitMoved {
        /// Position before the command.
        from: TilePosition,
        /// Position after the command.
        to: TilePosition,
    },
    /// A producer completed one or more cycles.
    ResourceProduced {
        /// Resource key.
        resource: String,
        /// Amount added on this tick.
        amount: u64,
    },
    /// A compatible neutral unit joined the player force.
    UnitMerged {
        /// Stable ID removed from the world.
        absorbed_entity_id: String,
        /// Strength transferred to the player unit.
        strength_gained: u64,
    },
    /// A hostile unit was defeated and removed.
    UnitDefeated {
        /// Stable ID removed from the world.
        defeated_entity_id: String,
        /// Strength reward added to the winning unit.
        strength_gained: u64,
    },
    /// A strategic site changed ownership.
    SiteCaptured {
        /// Captured site ID.
        site_id: String,
        /// New owning faction.
        owner: String,
    },
    /// An owned armory or factory upgraded a unit.
    UnitUpgraded {
        /// Producing site ID.
        site_id: String,
        /// Strength added to the unit.
        strength_gained: u64,
    },
    /// A victory target was captured.
    VictoryAchieved {
        /// Winning faction.
        faction: String,
        /// Captured victory target.
        target_id: String,
    },
    /// A tank emitted one deterministic projectile.
    ShotFired {
        /// Cardinal projectile direction.
        direction: Direction,
    },
    /// A projectile reduced a target's health.
    EntityDamaged {
        /// Stable target ID.
        target_id: String,
        /// Damage applied.
        amount: u64,
        /// Health remaining after the hit.
        remaining_health: u64,
    },
    /// A projectile removed a tank, terrain tile, or base.
    EntityDestroyed {
        /// Stable target ID.
        target_id: String,
        /// Player score awarded by the target.
        score_awarded: u64,
    },
    /// A wave spawner created a deterministic enemy.
    EnemySpawned {
        /// Spawner semantic ID.
        spawner_id: String,
        /// New enemy semantic ID.
        enemy_id: String,
        /// Authored wave number.
        wave: u64,
    },
}

/// Ordered simulation event.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeEvent {
    /// Deterministic event sequence number.
    pub sequence: u64,
    /// Tick on which the event was emitted.
    pub tick: Tick,
    /// Emitting system.
    pub system: SystemId,
    /// Related entity, if any.
    pub entity_id: Option<String>,
    /// Typed event payload.
    pub event: RuntimeEventKind,
}

/// Machine-readable system trace used to locate divergence.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceRecord {
    /// Tick being processed.
    pub tick: Tick,
    /// System in the fixed schedule.
    pub system: SystemId,
    /// Related entity, if any.
    pub entity_id: Option<String>,
    /// Deterministic action label.
    pub action: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotBody {
    schema_version: String,
    project_id: String,
    world_id: String,
    tick: Tick,
    seed: u64,
    rng_state: u64,
    component_types: Vec<String>,
    entities: Vec<EntityState>,
    #[serde(skip_serializing_if = "Option::is_none")]
    outcome: Option<WorldOutcome>,
    #[serde(default, skip_serializing_if = "is_zero")]
    score: u64,
}

/// Canonical save-state payload and its integrity hash.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSnapshot {
    /// Protocol version.
    pub schema_version: String,
    /// Source project ID.
    pub project_id: String,
    /// Active world ID.
    pub world_id: String,
    /// Next tick to execute.
    pub tick: Tick,
    /// Initial replay seed.
    pub seed: u64,
    /// Current deterministic RNG state.
    pub rng_state: u64,
    /// Component types present in the loaded world.
    pub component_types: Vec<String>,
    /// Entity states sorted by stable ID.
    pub entities: Vec<EntityState>,
    /// Terminal state for gameplay worlds; absent for legacy/headless fixtures.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outcome: Option<WorldOutcome>,
    /// Player score accumulated from destroyed enemies.
    #[serde(default, skip_serializing_if = "is_zero")]
    pub score: u64,
    /// SHA-256 of all preceding deterministic state fields.
    pub state_hash: String,
}

/// Complete output of a headless execution.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayResult {
    /// Final canonical state.
    pub snapshot: RuntimeSnapshot,
    /// Ordered domain events.
    pub events: Vec<RuntimeEvent>,
    /// Ordered system execution trace.
    pub trace: Vec<TraceRecord>,
}

#[derive(Debug, Clone, Default)]
struct PreparedCommands {
    moves: BTreeMap<String, TilePosition>,
    shots: BTreeMap<String, Direction>,
}

/// Deterministic runtime world.
#[derive(Debug, Clone)]
pub struct Simulation {
    project_id: String,
    world_id: String,
    width: i64,
    height: i64,
    seed: u64,
    clock: FixedClock,
    rng: SeededRng,
    entities: BTreeMap<String, EntityState>,
    component_types: BTreeSet<String>,
    event_sequence: u64,
    events: Vec<RuntimeEvent>,
    trace: Vec<TraceRecord>,
    outcome: Option<WorldOutcome>,
    score: u64,
    tank_mode: bool,
    requires_base: bool,
}

impl Simulation {
    /// Projects a schema-generated Game IR document into deterministic storage.
    ///
    /// # Errors
    ///
    /// Returns a loader error when generated data cannot be projected. This
    /// indicates a kernel/schema mismatch and is never silently repaired.
    pub fn from_project(project: &GameProject, seed: u64) -> KernelResult<Self> {
        let source = serde_json::to_value(project).map_err(|error| {
            KernelError::new(
                "KERNEL_IR_SERIALIZE",
                Tick(0),
                SystemId::Loader,
                None,
                error.to_string(),
            )
        })?;
        let project_id = string_at(&source, "/id")?;
        let entry_world = string_at(&source, "/entryWorld")?;
        let worlds = source
            .get("worlds")
            .and_then(Value::as_array)
            .ok_or_else(|| loader_error("KERNEL_WORLD_LIST", "worlds must be an array"))?;
        let world = worlds
            .iter()
            .find(|world| world.get("id").and_then(Value::as_str) == Some(&entry_world))
            .ok_or_else(|| {
                loader_error(
                    "KERNEL_ENTRY_WORLD",
                    format!("entry world {entry_world} was not found"),
                )
            })?;
        let width = integer_at(world, "/bounds/width")?;
        let height = integer_at(world, "/bounds/height")?;
        let mut entities = BTreeMap::new();
        let mut component_types = BTreeSet::new();
        for entity in world
            .get("entities")
            .and_then(Value::as_array)
            .ok_or_else(|| loader_error("KERNEL_ENTITY_LIST", "entities must be an array"))?
        {
            let state = project_entity(entity, &mut component_types)?;
            entities.insert(state.id.clone(), state);
        }
        let tank_mode = entities
            .values()
            .any(|entity| entity.tank.is_some() || entity.wave_spawner.is_some());
        let requires_base = entities.values().any(|entity| entity.base.is_some());
        let outcome = entities
            .values()
            .any(|entity| {
                entity.victory_target
                    || entity.tank.is_some()
                    || entity.base.is_some()
                    || entity.wave_spawner.is_some()
            })
            .then_some(WorldOutcome::InProgress);

        Ok(Self {
            project_id,
            world_id: entry_world,
            width,
            height,
            seed,
            clock: FixedClock::new(KernelConfig::default().tick_rate_hz()),
            rng: SeededRng::new(seed),
            entities,
            component_types,
            event_sequence: 0,
            events: Vec::new(),
            trace: Vec::new(),
            outcome,
            score: 0,
            tank_mode,
            requires_base,
        })
    }

    /// Executes an input log and returns a snapshot, event log, and trace.
    ///
    /// # Errors
    ///
    /// Returns the exact tick, system, and entity for an invalid command.
    pub fn run(mut self, input: &InputLog) -> KernelResult<ReplayResult> {
        if input.schema_version != KERNEL_PROTOCOL_VERSION {
            return Err(KernelError::new(
                "KERNEL_INPUT_VERSION",
                Tick(0),
                SystemId::Command,
                None,
                format!(
                    "input schemaVersion {} does not match {}",
                    input.schema_version, KERNEL_PROTOCOL_VERSION
                ),
            ));
        }
        if input.seed != self.seed {
            return Err(KernelError::new(
                "KERNEL_SEED_MISMATCH",
                Tick(0),
                SystemId::Replay,
                None,
                format!(
                    "simulation seed {} does not match input seed {}",
                    self.seed, input.seed
                ),
            ));
        }

        let commands = group_commands(input)?;
        for tick in 0..input.ticks {
            let scheduled = commands.get(&Tick(tick)).map_or(&[][..], Vec::as_slice);
            self.step(scheduled)?;
        }

        if let Some((tick, _)) = commands.range(Tick(input.ticks)..).next() {
            return Err(KernelError::new(
                "KERNEL_COMMAND_AFTER_END",
                *tick,
                SystemId::Command,
                None,
                format!("command is scheduled after the final tick {}", input.ticks),
            ));
        }

        let snapshot = self.snapshot()?;
        Ok(ReplayResult {
            snapshot,
            events: self.events,
            trace: self.trace,
        })
    }

    /// Returns the next fixed tick that will be executed.
    #[must_use]
    pub const fn current_tick(&self) -> Tick {
        self.clock.now()
    }

    /// Advances exactly one deterministic tick with a transactional command batch.
    ///
    /// Commands may arrive in any order; the kernel sorts them by stable ID before
    /// execution. Every command must target the current tick and have a unique ID.
    ///
    /// # Errors
    ///
    /// Returns a structured command diagnostic without mutating the world when the
    /// batch has an invalid tick, duplicate ID, missing entity, or invalid payload.
    pub fn step_commands(&mut self, commands: &[RuntimeCommand]) -> KernelResult<()> {
        let tick = self.current_tick();
        let mut command_ids = BTreeSet::new();
        for command in commands {
            if command.tick() != tick {
                return Err(KernelError::new(
                    "KERNEL_COMMAND_TICK",
                    tick,
                    SystemId::Command,
                    None,
                    format!(
                        "command {} targets tick {}, expected {}",
                        command.command_id(),
                        command.tick().0,
                        tick.0
                    ),
                ));
            }
            if !command_ids.insert(command.command_id()) {
                return Err(KernelError::new(
                    "KERNEL_DUPLICATE_COMMAND_ID",
                    tick,
                    SystemId::Command,
                    None,
                    format!("duplicate command ID {}", command.command_id()),
                ));
            }
        }
        let mut ordered = commands.iter().collect::<Vec<_>>();
        ordered.sort_by_key(|command| command.command_id());
        self.step(&ordered)
    }

    /// Captures the current canonical state without advancing simulation time.
    ///
    /// # Errors
    ///
    /// Returns a snapshot serialization diagnostic if canonical hashing fails.
    pub fn snapshot(&self) -> KernelResult<RuntimeSnapshot> {
        self.build_snapshot()
    }

    fn step(&mut self, commands: &[&RuntimeCommand]) -> KernelResult<()> {
        let tick = self.clock.now();
        let pending = self.prepare_commands(commands)?;
        for system in SYSTEM_ORDER {
            self.trace.push(TraceRecord {
                tick,
                system,
                entity_id: None,
                action: "system-start".to_owned(),
            });
            match system {
                SystemId::Command => self.accept_commands(commands),
                SystemId::Movement => self.apply_movement(pending.moves.clone()),
                SystemId::Production => self.advance_production(),
                SystemId::Strategy => {
                    self.advance_wave_spawners();
                    self.advance_hostile_strategy();
                }
                SystemId::Combat => self.resolve_combat(pending.shots.clone()),
                SystemId::Interaction => self.resolve_interactions(),
                SystemId::Victory => self.evaluate_outcome(),
                SystemId::Loader | SystemId::Snapshot | SystemId::Replay => unreachable!(),
            }
            self.trace.push(TraceRecord {
                tick,
                system,
                entity_id: None,
                action: "system-complete".to_owned(),
            });
        }
        self.clock.advance();
        Ok(())
    }

    fn prepare_commands(&self, commands: &[&RuntimeCommand]) -> KernelResult<PreparedCommands> {
        let tick = self.clock.now();
        let mut prepared = PreparedCommands::default();
        for command in commands {
            match command {
                RuntimeCommand::MoveUnit {
                    entity_id,
                    destination,
                    ..
                } => {
                    let entity = self.entities.get(entity_id).ok_or_else(|| {
                        KernelError::new(
                            "KERNEL_ENTITY_NOT_FOUND",
                            tick,
                            SystemId::Command,
                            Some(entity_id.clone()),
                            format!("entity {entity_id} does not exist"),
                        )
                    })?;
                    if entity.position.is_none() {
                        return Err(KernelError::new(
                            "KERNEL_TRANSFORM_REQUIRED",
                            tick,
                            SystemId::Command,
                            Some(entity_id.clone()),
                            "move-unit requires core:transform",
                        ));
                    }
                    if destination.x < 0
                        || destination.x >= self.width
                        || destination.y < 0
                        || destination.y >= self.height
                    {
                        return Err(KernelError::new(
                            "KERNEL_DESTINATION_OUT_OF_BOUNDS",
                            tick,
                            SystemId::Command,
                            Some(entity_id.clone()),
                            format!(
                                "destination ({}, {}) is outside {}x{}",
                                destination.x, destination.y, self.width, self.height
                            ),
                        ));
                    }
                    if prepared
                        .moves
                        .insert(entity_id.clone(), *destination)
                        .is_some()
                    {
                        return Err(KernelError::new(
                            "KERNEL_DUPLICATE_MOVE",
                            tick,
                            SystemId::Command,
                            Some(entity_id.clone()),
                            "an entity may receive only one move command per tick",
                        ));
                    }
                }
                RuntimeCommand::Fire {
                    entity_id,
                    direction,
                    ..
                } => {
                    let entity = self.entities.get(entity_id).ok_or_else(|| {
                        KernelError::new(
                            "KERNEL_ENTITY_NOT_FOUND",
                            tick,
                            SystemId::Command,
                            Some(entity_id.clone()),
                            format!("entity {entity_id} does not exist"),
                        )
                    })?;
                    if entity.position.is_none() || entity.tank.is_none() {
                        return Err(KernelError::new(
                            "KERNEL_TANK_REQUIRED",
                            tick,
                            SystemId::Command,
                            Some(entity_id.clone()),
                            "fire requires core:transform and game:tank",
                        ));
                    }
                    if prepared
                        .shots
                        .insert(entity_id.clone(), *direction)
                        .is_some()
                    {
                        return Err(KernelError::new(
                            "KERNEL_DUPLICATE_FIRE",
                            tick,
                            SystemId::Command,
                            Some(entity_id.clone()),
                            "a tank may fire only once per tick",
                        ));
                    }
                }
            }
        }
        Ok(prepared)
    }

    fn accept_commands(&mut self, commands: &[&RuntimeCommand]) {
        let tick = self.clock.now();
        for command in commands {
            let entity_id = match command {
                RuntimeCommand::MoveUnit { entity_id, .. }
                | RuntimeCommand::Fire { entity_id, .. } => Some(entity_id.clone()),
            };
            self.emit(
                tick,
                SystemId::Command,
                entity_id,
                RuntimeEventKind::CommandAccepted {
                    command_id: command.command_id().to_owned(),
                },
            );
        }
    }

    fn apply_movement(&mut self, moves: BTreeMap<String, TilePosition>) {
        let tick = self.clock.now();
        for (entity_id, destination) in moves {
            let from = self.entities[&entity_id]
                .position
                .expect("commands were transactionally validated");
            let blocked = self.entities.iter().any(|(other_id, other)| {
                other_id != &entity_id
                    && other.position == Some(destination)
                    && (other
                        .terrain
                        .as_ref()
                        .is_some_and(|terrain| terrain.blocks_movement)
                        || other.tank.is_some()
                        || other.base.is_some())
            });
            if blocked {
                self.trace.push(TraceRecord {
                    tick,
                    system: SystemId::Movement,
                    entity_id: Some(entity_id),
                    action: "movement-blocked".to_owned(),
                });
                continue;
            }
            let entity = self
                .entities
                .get_mut(&entity_id)
                .expect("commands were transactionally validated");
            entity.position = Some(destination);
            if let Some(tank) = &mut entity.tank {
                let dx = destination.x - from.x;
                let dy = destination.y - from.y;
                tank.facing = if dx.abs() >= dy.abs() && dx != 0 {
                    if dx < 0 {
                        Direction::Left
                    } else {
                        Direction::Right
                    }
                } else if dy < 0 {
                    Direction::Up
                } else {
                    Direction::Down
                };
            }
            self.trace.push(TraceRecord {
                tick,
                system: SystemId::Movement,
                entity_id: Some(entity_id.clone()),
                action: "position-updated".to_owned(),
            });
            self.emit(
                tick,
                SystemId::Movement,
                Some(entity_id),
                RuntimeEventKind::UnitMoved {
                    from,
                    to: destination,
                },
            );
        }
    }

    fn advance_production(&mut self) {
        let tick = self.clock.now();
        let mut production_events = Vec::new();
        for (entity_id, entity) in &mut self.entities {
            if entity.strategic_site.is_some()
                && entity
                    .capture_site
                    .as_ref()
                    .is_none_or(|site| site.owner.is_none())
            {
                continue;
            }
            let Some(producer) = &mut entity.producer else {
                continue;
            };
            producer.progress_ticks += 1;
            if producer.progress_ticks >= producer.cycle_ticks {
                let cycles = producer.progress_ticks / producer.cycle_ticks;
                let amount = cycles * producer.amount_per_cycle;
                producer.progress_ticks %= producer.cycle_ticks;
                producer.stored += amount;
                production_events.push((
                    entity_id.clone(),
                    producer.resource.clone(),
                    amount,
                    entity.strategic_site.as_ref().map(|site| site.kind),
                    entity
                        .capture_site
                        .as_ref()
                        .and_then(|site| site.owner.clone()),
                ));
            }
        }
        for (entity_id, resource, amount, site_kind, owner) in production_events {
            self.trace.push(TraceRecord {
                tick,
                system: SystemId::Production,
                entity_id: Some(entity_id.clone()),
                action: "resource-produced".to_owned(),
            });
            self.emit(
                tick,
                SystemId::Production,
                Some(entity_id.clone()),
                RuntimeEventKind::ResourceProduced { resource, amount },
            );
            let upgrade = match site_kind {
                Some(StrategicSiteKind::Armory) => amount,
                Some(StrategicSiteKind::Factory) => amount.saturating_mul(2),
                Some(StrategicSiteKind::Granary) | None => 0,
            };
            let Some(owner) = owner.filter(|_| upgrade > 0) else {
                continue;
            };
            let unit_id = self.entities.iter().find_map(|(unit_id, unit)| {
                (unit.player_controlled
                    && unit
                        .mergeable
                        .as_ref()
                        .is_some_and(|unit| unit.faction == owner))
                .then(|| unit_id.clone())
            });
            let Some(unit_id) = unit_id else {
                continue;
            };
            self.entities
                .get_mut(&unit_id)
                .and_then(|unit| unit.mergeable.as_mut())
                .expect("upgrade target was selected from mergeable units")
                .strength += upgrade;
            self.trace.push(TraceRecord {
                tick,
                system: SystemId::Production,
                entity_id: Some(unit_id.clone()),
                action: "unit-upgraded".to_owned(),
            });
            self.emit(
                tick,
                SystemId::Production,
                Some(unit_id),
                RuntimeEventKind::UnitUpgraded {
                    site_id: entity_id,
                    strength_gained: upgrade,
                },
            );
        }
    }

    fn advance_wave_spawners(&mut self) {
        let tick = self.clock.now();
        let ready = self
            .entities
            .iter()
            .filter_map(|(id, entity)| {
                let spawner = entity.wave_spawner.as_ref()?;
                (spawner.spawned < spawner.total
                    && tick.0.is_multiple_of(spawner.spawn_every_ticks))
                .then(|| {
                    (
                        id.clone(),
                        entity.position,
                        spawner.wave,
                        spawner.archetype,
                        spawner.faction.clone(),
                        spawner.spawned,
                    )
                })
            })
            .collect::<Vec<_>>();
        for (spawner_id, position, wave, archetype, faction, index) in ready {
            let Some(position) = position else {
                continue;
            };
            let enemy_id = format!("{spawner_id}/enemy-{:03}", index + 1);
            let (health, damage, range, behavior, move_every_ticks, fire_every_ticks, score) =
                match archetype {
                    EnemyArchetype::Scout => (1, 1, 4, EnemyBehaviorKind::Chaser, 1, 3, 100),
                    EnemyArchetype::Striker => (2, 1, 6, EnemyBehaviorKind::Patrol, 2, 2, 200),
                    EnemyArchetype::Heavy => (4, 2, 5, EnemyBehaviorKind::Guard, 4, 2, 400),
                };
            self.entities.insert(
                enemy_id.clone(),
                EntityState {
                    id: enemy_id.clone(),
                    name: format!("Wave {wave} {archetype:?} {}", index + 1),
                    position: Some(position),
                    player_controlled: false,
                    mergeable: None,
                    producer: None,
                    capture_site: None,
                    strategic_site: None,
                    hostile_ai: None,
                    victory_target: false,
                    tank: Some(TankState {
                        faction,
                        role: TankRole::Enemy,
                        health,
                        max_health: health,
                        damage,
                        range,
                        score_value: score,
                        facing: Direction::Down,
                    }),
                    terrain: None,
                    base: None,
                    enemy_behavior: Some(EnemyBehaviorState {
                        kind: behavior,
                        move_every_ticks,
                        fire_every_ticks,
                    }),
                    wave_spawner: None,
                },
            );
            self.entities
                .get_mut(&spawner_id)
                .and_then(|entity| entity.wave_spawner.as_mut())
                .expect("wave spawner was collected")
                .spawned += 1;
            self.component_types.insert("game:tank".to_owned());
            self.component_types
                .insert("game:enemy-behavior".to_owned());
            self.emit(
                tick,
                SystemId::Strategy,
                Some(enemy_id.clone()),
                RuntimeEventKind::EnemySpawned {
                    spawner_id,
                    enemy_id,
                    wave,
                },
            );
        }
    }

    #[allow(
        clippy::too_many_lines,
        reason = "strategy projection keeps deterministic selection and movement together"
    )]
    fn advance_hostile_strategy(&mut self) {
        let tick = self.clock.now();
        let players = self
            .entities
            .iter()
            .filter(|(_, entity)| entity.player_controlled && entity.position.is_some())
            .map(|(id, entity)| (id.clone(), entity.position.expect("position was checked")))
            .collect::<Vec<_>>();
        if players.is_empty() {
            return;
        }

        let hostile_ids = self
            .entities
            .iter()
            .filter_map(|(id, entity)| {
                let cadence = entity
                    .enemy_behavior
                    .as_ref()
                    .map(|behavior| behavior.move_every_ticks)
                    .or_else(|| entity.hostile_ai.as_ref().map(|ai| ai.move_every_ticks))?;
                tick.0
                    .is_multiple_of(cadence)
                    .then_some(())
                    .and(entity.position)
                    .map(|_| id.clone())
            })
            .collect::<Vec<_>>();
        for entity_id in hostile_ids {
            let from = self.entities[&entity_id]
                .position
                .expect("hostile entity position was checked");
            let target = players
                .iter()
                .min_by_key(|(player_id, position)| {
                    (
                        (position.x - from.x).abs() + (position.y - from.y).abs(),
                        player_id,
                    )
                })
                .map(|(_, position)| *position)
                .expect("players is non-empty");
            let behavior = self.entities[&entity_id]
                .enemy_behavior
                .as_ref()
                .map_or(EnemyBehaviorKind::Chaser, |behavior| behavior.kind);
            if behavior == EnemyBehaviorKind::Guard {
                continue;
            }
            let mut to = from;
            if behavior == EnemyBehaviorKind::Patrol {
                let phase = (tick.0 + entity_id.bytes().map(u64::from).sum::<u64>()) % 4;
                let direction = match phase {
                    0 => Direction::Right,
                    1 => Direction::Down,
                    2 => Direction::Left,
                    _ => Direction::Up,
                };
                let delta = direction.delta();
                to = TilePosition {
                    x: from.x + delta.x,
                    y: from.y + delta.y,
                };
            } else if from.x != target.x {
                to.x += (target.x - from.x).signum();
            } else if from.y != target.y {
                to.y += (target.y - from.y).signum();
            }
            if to.x < 0
                || to.x >= self.width
                || to.y < 0
                || to.y >= self.height
                || self.position_blocked(&entity_id, to)
            {
                continue;
            }
            if to == from {
                continue;
            }
            let entity = self
                .entities
                .get_mut(&entity_id)
                .expect("hostile entity ID was collected");
            entity.position = Some(to);
            if let Some(tank) = &mut entity.tank {
                tank.facing = if to.x < from.x {
                    Direction::Left
                } else if to.x > from.x {
                    Direction::Right
                } else if to.y < from.y {
                    Direction::Up
                } else {
                    Direction::Down
                };
            }
            self.trace.push(TraceRecord {
                tick,
                system: SystemId::Strategy,
                entity_id: Some(entity_id.clone()),
                action: "hostile-advanced".to_owned(),
            });
            self.emit(
                tick,
                SystemId::Strategy,
                Some(entity_id),
                RuntimeEventKind::UnitMoved { from, to },
            );
        }
    }

    fn position_blocked(&self, moving_id: &str, position: TilePosition) -> bool {
        self.entities.iter().any(|(id, entity)| {
            id != moving_id
                && entity.position == Some(position)
                && (entity
                    .terrain
                    .as_ref()
                    .is_some_and(|terrain| terrain.blocks_movement)
                    || entity.tank.is_some()
                    || entity.base.is_some())
        })
    }

    #[allow(
        clippy::too_many_lines,
        reason = "combat resolution is one stable-order transaction over a shot batch"
    )]
    fn resolve_combat(&mut self, mut shots: BTreeMap<String, Direction>) {
        let tick = self.clock.now();
        let player_targets = self
            .entities
            .iter()
            .filter_map(|(id, entity)| {
                (entity.player_controlled || entity.base.is_some())
                    .then_some(entity.position)
                    .flatten()
                    .map(|position| (id.clone(), position))
            })
            .collect::<Vec<_>>();
        for (id, entity) in &self.entities {
            let (Some(position), Some(tank), Some(behavior)) = (
                entity.position,
                entity.tank.as_ref(),
                entity.enemy_behavior.as_ref(),
            ) else {
                continue;
            };
            if tank.role != TankRole::Enemy || !tick.0.is_multiple_of(behavior.fire_every_ticks) {
                continue;
            }
            let aligned = player_targets
                .iter()
                .filter_map(|(_, target)| {
                    let (distance, direction) = if target.x == position.x {
                        (
                            (target.y - position.y).unsigned_abs(),
                            if target.y < position.y {
                                Direction::Up
                            } else {
                                Direction::Down
                            },
                        )
                    } else if target.y == position.y {
                        (
                            (target.x - position.x).unsigned_abs(),
                            if target.x < position.x {
                                Direction::Left
                            } else {
                                Direction::Right
                            },
                        )
                    } else {
                        return None;
                    };
                    (distance > 0 && distance <= tank.range).then_some((distance, direction))
                })
                .min_by_key(|(distance, _)| *distance);
            if let Some((_, direction)) = aligned {
                shots.entry(id.clone()).or_insert(direction);
            }
        }

        for (shooter_id, direction) in shots {
            let Some(shooter) = self.entities.get(&shooter_id) else {
                continue;
            };
            let (Some(origin), Some(tank)) = (shooter.position, shooter.tank.as_ref()) else {
                continue;
            };
            let range = tank.range;
            let damage = tank.damage;
            let shooter_faction = tank.faction.clone();
            let shooter_is_player = tank.role == TankRole::Player;
            self.entities
                .get_mut(&shooter_id)
                .and_then(|entity| entity.tank.as_mut())
                .expect("shooter tank was checked")
                .facing = direction;
            self.emit(
                tick,
                SystemId::Combat,
                Some(shooter_id.clone()),
                RuntimeEventKind::ShotFired { direction },
            );
            let delta = direction.delta();
            let target = self
                .entities
                .iter()
                .filter(|(id, entity)| {
                    let allied_tank = entity
                        .tank
                        .as_ref()
                        .is_some_and(|tank| tank.faction == shooter_faction);
                    let allied_base = entity
                        .base
                        .as_ref()
                        .is_some_and(|base| base.faction == shooter_faction);
                    *id != &shooter_id
                        && entity.position.is_some()
                        && !allied_tank
                        && !allied_base
                        && (entity.tank.is_some()
                            || entity.base.is_some()
                            || entity
                                .terrain
                                .as_ref()
                                .is_some_and(|terrain| terrain.blocks_shots))
                })
                .filter_map(|(id, entity)| {
                    let position = entity.position.expect("position was checked");
                    let offset_x = position.x - origin.x;
                    let offset_y = position.y - origin.y;
                    let distance = if delta.x != 0 && offset_y == 0 && offset_x.signum() == delta.x
                    {
                        offset_x.unsigned_abs()
                    } else if delta.y != 0 && offset_x == 0 && offset_y.signum() == delta.y {
                        offset_y.unsigned_abs()
                    } else {
                        return None;
                    };
                    (distance <= range).then_some((distance, id.clone()))
                })
                .min_by(Ord::cmp);
            let Some((_, target_id)) = target else {
                continue;
            };

            let target = self
                .entities
                .get_mut(&target_id)
                .expect("combat target was collected");
            let score_value = target
                .tank
                .as_ref()
                .filter(|tank| tank.role == TankRole::Enemy)
                .map_or(0, |tank| tank.score_value);
            let health = if let Some(tank) = &mut target.tank {
                Some(&mut tank.health)
            } else if let Some(base) = &mut target.base {
                Some(&mut base.health)
            } else if let Some(terrain) = &mut target.terrain {
                terrain.destructible.then_some(&mut terrain.health)
            } else {
                None
            };
            let Some(health) = health else {
                continue;
            };
            let applied = damage.min(*health);
            *health -= applied;
            let remaining = *health;
            self.emit(
                tick,
                SystemId::Combat,
                Some(shooter_id.clone()),
                RuntimeEventKind::EntityDamaged {
                    target_id: target_id.clone(),
                    amount: applied,
                    remaining_health: remaining,
                },
            );
            if remaining == 0 {
                self.entities.remove(&target_id);
                let awarded = if shooter_is_player { score_value } else { 0 };
                self.score += awarded;
                self.emit(
                    tick,
                    SystemId::Combat,
                    Some(shooter_id),
                    RuntimeEventKind::EntityDestroyed {
                        target_id,
                        score_awarded: awarded,
                    },
                );
            }
        }
    }

    #[allow(
        clippy::too_many_lines,
        reason = "the interaction system keeps one explicit stable-order transaction"
    )]
    fn resolve_interactions(&mut self) {
        let tick = self.clock.now();
        let player_ids = self
            .entities
            .iter()
            .filter(|(_, entity)| entity.player_controlled)
            .map(|(id, _)| id.clone())
            .collect::<Vec<_>>();
        for player_id in player_ids {
            let Some(player) = self.entities.get(&player_id) else {
                continue;
            };
            let (Some(position), Some(mergeable)) = (player.position, player.mergeable.as_ref())
            else {
                continue;
            };
            let faction = mergeable.faction.clone();

            let occupants = self
                .entities
                .iter()
                .filter(|(id, entity)| {
                    *id != &player_id
                        && entity.position == Some(position)
                        && entity.mergeable.is_some()
                })
                .map(|(id, _)| id.clone())
                .collect::<Vec<_>>();
            for other_id in occupants {
                let Some(other) = self.entities.get(&other_id) else {
                    continue;
                };
                let other_unit = other
                    .mergeable
                    .as_ref()
                    .expect("occupants were selected as mergeable");
                let other_faction = other_unit.faction.clone();
                let other_strength = other_unit.strength;
                if other_faction == faction && !other.player_controlled {
                    self.entities.remove(&other_id);
                    self.entities
                        .get_mut(&player_id)
                        .and_then(|entity| entity.mergeable.as_mut())
                        .expect("player mergeable was checked")
                        .strength += other_strength;
                    self.trace.push(TraceRecord {
                        tick,
                        system: SystemId::Interaction,
                        entity_id: Some(player_id.clone()),
                        action: "unit-merged".to_owned(),
                    });
                    self.emit(
                        tick,
                        SystemId::Interaction,
                        Some(player_id.clone()),
                        RuntimeEventKind::UnitMerged {
                            absorbed_entity_id: other_id,
                            strength_gained: other_strength,
                        },
                    );
                    continue;
                }
                if other_faction == faction {
                    continue;
                }

                let player_strength = self.entities[&player_id]
                    .mergeable
                    .as_ref()
                    .expect("player mergeable was checked")
                    .strength;
                if player_strength >= other_strength {
                    let reward = (other_strength / 2).max(1);
                    self.entities.remove(&other_id);
                    self.entities
                        .get_mut(&player_id)
                        .and_then(|entity| entity.mergeable.as_mut())
                        .expect("player mergeable was checked")
                        .strength += reward;
                    self.trace.push(TraceRecord {
                        tick,
                        system: SystemId::Interaction,
                        entity_id: Some(player_id.clone()),
                        action: "hostile-defeated".to_owned(),
                    });
                    self.emit(
                        tick,
                        SystemId::Interaction,
                        Some(player_id.clone()),
                        RuntimeEventKind::UnitDefeated {
                            defeated_entity_id: other_id,
                            strength_gained: reward,
                        },
                    );
                } else {
                    self.entities.remove(&player_id);
                    self.trace.push(TraceRecord {
                        tick,
                        system: SystemId::Interaction,
                        entity_id: Some(player_id.clone()),
                        action: "player-defeated".to_owned(),
                    });
                    break;
                }
            }

            let Some(player) = self.entities.get(&player_id) else {
                continue;
            };
            let (Some(position), Some(mergeable)) = (player.position, player.mergeable.as_ref())
            else {
                continue;
            };
            let strength = mergeable.strength;
            let faction = mergeable.faction.clone();
            let sites = self
                .entities
                .iter()
                .filter_map(|(id, entity)| {
                    let site = entity.capture_site.as_ref()?;
                    (entity.position == Some(position)
                        && strength >= site.required_strength
                        && site.owner.as_deref() != Some(faction.as_str()))
                    .then(|| id.clone())
                })
                .collect::<Vec<_>>();
            for site_id in sites {
                self.entities
                    .get_mut(&site_id)
                    .and_then(|entity| entity.capture_site.as_mut())
                    .expect("capture site ID was collected")
                    .owner = Some(faction.clone());
                self.trace.push(TraceRecord {
                    tick,
                    system: SystemId::Interaction,
                    entity_id: Some(site_id.clone()),
                    action: "site-captured".to_owned(),
                });
                self.emit(
                    tick,
                    SystemId::Interaction,
                    Some(player_id.clone()),
                    RuntimeEventKind::SiteCaptured {
                        site_id,
                        owner: faction.clone(),
                    },
                );
            }
        }
    }

    fn evaluate_outcome(&mut self) {
        if self.outcome != Some(WorldOutcome::InProgress) {
            return;
        }
        let tick = self.clock.now();
        if self.tank_mode {
            let player = self.entities.values().find_map(|entity| {
                entity
                    .tank
                    .as_ref()
                    .filter(|tank| tank.role == TankRole::Player)
                    .map(|tank| tank.faction.clone())
            });
            let base_alive = self.entities.values().any(|entity| entity.base.is_some());
            if player.is_none() || (self.requires_base && !base_alive) {
                self.outcome = Some(WorldOutcome::Lost { tick });
                return;
            }
            let enemy_alive = self.entities.values().any(|entity| {
                entity
                    .tank
                    .as_ref()
                    .is_some_and(|tank| tank.role == TankRole::Enemy)
            });
            let waves_complete = self.entities.values().all(|entity| {
                entity
                    .wave_spawner
                    .as_ref()
                    .is_none_or(|spawner| spawner.spawned >= spawner.total)
            });
            if !enemy_alive && waves_complete {
                let faction = player.expect("player presence was checked");
                self.outcome = Some(WorldOutcome::Won {
                    faction: faction.clone(),
                    tick,
                });
                self.emit(
                    tick,
                    SystemId::Victory,
                    None,
                    RuntimeEventKind::VictoryAchieved {
                        faction,
                        target_id: format!("{}/all-waves-cleared", self.world_id),
                    },
                );
            }
            return;
        }
        let winner = self.entities.iter().find_map(|(id, entity)| {
            entity
                .victory_target
                .then(|| {
                    entity
                        .capture_site
                        .as_ref()?
                        .owner
                        .clone()
                        .map(|owner| (id.clone(), owner))
                })
                .flatten()
        });
        if let Some((target_id, faction)) = winner {
            self.outcome = Some(WorldOutcome::Won {
                faction: faction.clone(),
                tick,
            });
            self.emit(
                tick,
                SystemId::Victory,
                Some(target_id.clone()),
                RuntimeEventKind::VictoryAchieved { faction, target_id },
            );
        } else if !self
            .entities
            .values()
            .any(|entity| entity.player_controlled)
        {
            self.outcome = Some(WorldOutcome::Lost { tick });
        }
    }

    fn emit(
        &mut self,
        tick: Tick,
        system: SystemId,
        entity_id: Option<String>,
        event: RuntimeEventKind,
    ) {
        self.events.push(RuntimeEvent {
            sequence: self.event_sequence,
            tick,
            system,
            entity_id,
            event,
        });
        self.event_sequence += 1;
    }

    fn build_snapshot(&self) -> KernelResult<RuntimeSnapshot> {
        let body = SnapshotBody {
            schema_version: KERNEL_PROTOCOL_VERSION.to_owned(),
            project_id: self.project_id.clone(),
            world_id: self.world_id.clone(),
            tick: self.clock.now(),
            seed: self.seed,
            rng_state: self.rng.state(),
            component_types: self.component_types.iter().cloned().collect(),
            entities: self.entities.values().cloned().collect(),
            outcome: self.outcome.clone(),
            score: self.score,
        };
        let state_hash = canonical_hash(&body).map_err(|error| {
            KernelError::new(
                "KERNEL_SNAPSHOT_SERIALIZE",
                self.clock.now(),
                SystemId::Snapshot,
                None,
                error.to_string(),
            )
        })?;
        Ok(RuntimeSnapshot {
            schema_version: body.schema_version,
            project_id: body.project_id,
            world_id: body.world_id,
            tick: body.tick,
            seed: body.seed,
            rng_state: body.rng_state,
            component_types: body.component_types,
            entities: body.entities,
            outcome: body.outcome,
            score: body.score,
            state_hash,
        })
    }
}

/// Runs a complete deterministic replay from a generated Game IR project.
///
/// # Errors
///
/// Returns structured loader, command, system, or snapshot failures.
pub fn replay(project: &GameProject, input: &InputLog) -> KernelResult<ReplayResult> {
    Simulation::from_project(project, input.seed)?.run(input)
}

/// Replays and verifies an expected canonical state hash.
///
/// # Errors
///
/// Returns `REPLAY_HASH_MISMATCH` with replay context when state diverges.
pub fn verify_replay(
    project: &GameProject,
    input: &InputLog,
    expected_hash: &str,
) -> KernelResult<ReplayResult> {
    let result = replay(project, input)?;
    if result.snapshot.state_hash != expected_hash {
        return Err(KernelError::new(
            "REPLAY_HASH_MISMATCH",
            result.snapshot.tick,
            SystemId::Replay,
            None,
            format!(
                "expected state hash {expected_hash}, got {}",
                result.snapshot.state_hash
            ),
        ));
    }
    Ok(result)
}

fn group_commands(input: &InputLog) -> KernelResult<BTreeMap<Tick, Vec<&RuntimeCommand>>> {
    let mut grouped = BTreeMap::<Tick, Vec<&RuntimeCommand>>::new();
    let mut command_ids = BTreeSet::new();
    for command in &input.commands {
        if !command_ids.insert(command.command_id()) {
            return Err(KernelError::new(
                "KERNEL_DUPLICATE_COMMAND_ID",
                command.tick(),
                SystemId::Command,
                None,
                format!("duplicate command ID {}", command.command_id()),
            ));
        }
        grouped.entry(command.tick()).or_default().push(command);
    }
    for commands in grouped.values_mut() {
        commands.sort_by_key(|command| command.command_id());
    }
    Ok(grouped)
}

#[allow(
    clippy::too_many_lines,
    reason = "schema component projection remains an explicit exhaustive type registry"
)]
fn project_entity(
    entity: &Value,
    component_types: &mut BTreeSet<String>,
) -> KernelResult<EntityState> {
    let id = string_at(entity, "/id")?;
    let name = string_at(entity, "/name")?;
    let components = entity
        .get("components")
        .and_then(Value::as_array)
        .ok_or_else(|| loader_error("KERNEL_COMPONENT_LIST", "components must be an array"))?;
    let mut state = EntityState {
        id,
        name,
        position: None,
        player_controlled: false,
        mergeable: None,
        producer: None,
        capture_site: None,
        strategic_site: None,
        hostile_ai: None,
        victory_target: false,
        tank: None,
        terrain: None,
        base: None,
        enemy_behavior: None,
        wave_spawner: None,
    };
    for component in components {
        let component_type = string_at(component, "/type")?;
        component_types.insert(component_type.clone());
        match component_type.as_str() {
            "core:transform" => {
                state.position = Some(TilePosition {
                    x: integer_at(component, "/position/x")?,
                    y: integer_at(component, "/position/y")?,
                });
            }
            "game:player-controlled" => state.player_controlled = true,
            "game:mergeable" => {
                state.mergeable = Some(MergeableState {
                    faction: string_at(component, "/faction")?,
                    strength: unsigned_at(component, "/strength")?,
                });
            }
            "game:producer" => {
                state.producer = Some(ProducerState {
                    resource: string_at(component, "/resource")?,
                    amount_per_cycle: unsigned_at(component, "/amountPerCycle")?,
                    cycle_ticks: unsigned_at(component, "/cycleTicks")?,
                    progress_ticks: 0,
                    stored: 0,
                });
            }
            "game:capture-site" => {
                state.capture_site = Some(CaptureSiteState {
                    required_strength: unsigned_at(component, "/requiredStrength")?,
                    owner: None,
                });
            }
            "game:strategic-site" => {
                let kind = match string_at(component, "/kind")?.as_str() {
                    "granary" => StrategicSiteKind::Granary,
                    "armory" => StrategicSiteKind::Armory,
                    "factory" => StrategicSiteKind::Factory,
                    other => {
                        return Err(loader_error(
                            "KERNEL_STRATEGIC_SITE_KIND",
                            format!("unsupported strategic site kind {other}"),
                        ));
                    }
                };
                state.strategic_site = Some(StrategicSiteState { kind });
            }
            "game:hostile-ai" => {
                state.hostile_ai = Some(HostileAiState {
                    move_every_ticks: unsigned_at(component, "/moveEveryTicks")?,
                });
            }
            "game:tank" => {
                let role = match string_at(component, "/role")?.as_str() {
                    "player" => TankRole::Player,
                    "enemy" => TankRole::Enemy,
                    other => {
                        return Err(loader_error(
                            "KERNEL_TANK_ROLE",
                            format!("unsupported tank role {other}"),
                        ));
                    }
                };
                state.tank = Some(TankState {
                    faction: string_at(component, "/faction")?,
                    role,
                    health: unsigned_at(component, "/health")?,
                    max_health: unsigned_at(component, "/maxHealth")?,
                    damage: unsigned_at(component, "/damage")?,
                    range: unsigned_at(component, "/range")?,
                    score_value: unsigned_at(component, "/scoreValue")?,
                    facing: Direction::Up,
                });
            }
            "game:terrain" => {
                state.terrain = Some(TerrainState {
                    kind: string_at(component, "/kind")?,
                    blocks_movement: boolean_at(component, "/blocksMovement")?,
                    blocks_shots: boolean_at(component, "/blocksShots")?,
                    destructible: boolean_at(component, "/destructible")?,
                    health: unsigned_at(component, "/health")?,
                });
            }
            "game:base" => {
                state.base = Some(BaseState {
                    faction: string_at(component, "/faction")?,
                    health: unsigned_at(component, "/health")?,
                    max_health: unsigned_at(component, "/maxHealth")?,
                });
            }
            "game:enemy-behavior" => {
                let kind = match string_at(component, "/kind")?.as_str() {
                    "chaser" => EnemyBehaviorKind::Chaser,
                    "patrol" => EnemyBehaviorKind::Patrol,
                    "guard" => EnemyBehaviorKind::Guard,
                    other => {
                        return Err(loader_error(
                            "KERNEL_ENEMY_BEHAVIOR",
                            format!("unsupported enemy behavior {other}"),
                        ));
                    }
                };
                state.enemy_behavior = Some(EnemyBehaviorState {
                    kind,
                    move_every_ticks: unsigned_at(component, "/moveEveryTicks")?,
                    fire_every_ticks: unsigned_at(component, "/fireEveryTicks")?,
                });
            }
            "game:wave-spawner" => {
                let archetype = match string_at(component, "/archetype")?.as_str() {
                    "scout" => EnemyArchetype::Scout,
                    "striker" => EnemyArchetype::Striker,
                    "heavy" => EnemyArchetype::Heavy,
                    other => {
                        return Err(loader_error(
                            "KERNEL_ENEMY_ARCHETYPE",
                            format!("unsupported enemy archetype {other}"),
                        ));
                    }
                };
                state.wave_spawner = Some(WaveSpawnerState {
                    wave: unsigned_at(component, "/wave")?,
                    archetype,
                    faction: string_at(component, "/faction")?,
                    spawn_every_ticks: unsigned_at(component, "/spawnEveryTicks")?,
                    total: unsigned_at(component, "/total")?,
                    spawned: 0,
                });
            }
            "game:victory-target" => state.victory_target = true,
            _ => {
                return Err(loader_error(
                    "KERNEL_COMPONENT_UNKNOWN",
                    format!("component type {component_type} is not registered"),
                ));
            }
        }
    }
    Ok(state)
}

#[allow(
    clippy::trivially_copy_pass_by_ref,
    reason = "serde skip_serializing_if requires a borrowed field"
)]
const fn is_false(value: &bool) -> bool {
    !*value
}

#[allow(
    clippy::trivially_copy_pass_by_ref,
    reason = "serde skip_serializing_if requires a borrowed field"
)]
const fn is_zero(value: &u64) -> bool {
    *value == 0
}

fn boolean_at(value: &Value, pointer: &str) -> KernelResult<bool> {
    value
        .pointer(pointer)
        .and_then(Value::as_bool)
        .ok_or_else(|| loader_error("KERNEL_IR_FIELD", format!("expected boolean at {pointer}")))
}

fn string_at(value: &Value, pointer: &str) -> KernelResult<String> {
    value
        .pointer(pointer)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| loader_error("KERNEL_IR_FIELD", format!("expected string at {pointer}")))
}

fn integer_at(value: &Value, pointer: &str) -> KernelResult<i64> {
    value
        .pointer(pointer)
        .and_then(Value::as_i64)
        .ok_or_else(|| loader_error("KERNEL_IR_FIELD", format!("expected integer at {pointer}")))
}

fn unsigned_at(value: &Value, pointer: &str) -> KernelResult<u64> {
    value
        .pointer(pointer)
        .and_then(Value::as_u64)
        .ok_or_else(|| {
            loader_error(
                "KERNEL_IR_FIELD",
                format!("expected unsigned integer at {pointer}"),
            )
        })
}

fn loader_error(code: &str, message: impl Into<String>) -> KernelError {
    KernelError::new(code, Tick(0), SystemId::Loader, None, message)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::validation::{load_project, validate_definition_value};

    const PROJECT: &str = include_str!("../../../examples/minimal.game.json");
    const INPUT: &str = include_str!("../../../fixtures/replay/movement.input.json");
    const FRONTIER_PROJECT: &str = include_str!("../../../examples/frontier.game.json");
    const FRONTIER_INPUT: &str = include_str!("../../../fixtures/replay/frontier.input.json");
    const TANK_PROJECT: &str = include_str!("../../../examples/tank-combat.game.json");
    const TANK_INPUT: &str = include_str!("../../../fixtures/replay/tank-combat.input.json");

    fn fixture() -> (GameProject, InputLog) {
        let project = load_project("examples/minimal.game.json", PROJECT).unwrap();
        let input = serde_json::from_str(INPUT).unwrap();
        (project, input)
    }

    #[test]
    fn replay_is_identical_one_hundred_times() {
        let (project, input) = fixture();
        let hashes = (0..100)
            .map(|_| replay(&project, &input).unwrap().snapshot.state_hash)
            .collect::<BTreeSet<_>>();
        assert_eq!(hashes.len(), 1);
    }

    #[test]
    fn replay_moves_entity_and_automates_production() {
        let (project, input) = fixture();
        let result = replay(&project, &input).unwrap();
        let player = result
            .snapshot
            .entities
            .iter()
            .find(|entity| entity.id == "demo:frontier/player")
            .unwrap();
        assert_eq!(player.position, Some(TilePosition { x: 4, y: 9 }));
        assert!(result.events.iter().any(|event| {
            event.system == SystemId::Production
                && event.entity_id.as_deref() == Some("demo:frontier/granary")
        }));
        let snapshot = serde_json::to_value(&result.snapshot).unwrap();
        assert!(validate_definition_value("Snapshot", "snapshot.json", &snapshot).ok);
        for event in &result.events {
            let event = serde_json::to_value(event).unwrap();
            assert!(validate_definition_value("Event", "events.json", &event).ok);
        }
    }

    #[test]
    fn input_log_matches_authoritative_schema() {
        let input: Value = serde_json::from_str(INPUT).unwrap();
        assert!(validate_definition_value("InputLog", "movement.input.json", &input).ok);
    }

    #[test]
    fn command_error_identifies_tick_system_and_entity() {
        let (project, mut input) = fixture();
        input.commands = vec![RuntimeCommand::MoveUnit {
            command_id: "demo:command/outside".to_owned(),
            tick: Tick(3),
            entity_id: "demo:frontier/player".to_owned(),
            destination: TilePosition { x: -1, y: 9 },
        }];
        let error = replay(&project, &input).unwrap_err();
        assert_eq!(error.tick, Tick(3));
        assert_eq!(error.system, SystemId::Command);
        assert_eq!(error.entity_id.as_deref(), Some("demo:frontier/player"));
    }

    #[test]
    fn frontier_campaign_completes_the_strategy_loop() {
        let project = load_project("examples/frontier.game.json", FRONTIER_PROJECT).unwrap();
        let input: InputLog = serde_json::from_str(FRONTIER_INPUT).unwrap();
        let result = replay(&project, &input).unwrap();
        assert_eq!(
            result.snapshot.outcome,
            Some(WorldOutcome::Won {
                faction: "demo:player".to_owned(),
                tick: Tick(14),
            })
        );
        let player = result
            .snapshot
            .entities
            .iter()
            .find(|entity| entity.id == "demo:frontier-campaign/player")
            .unwrap();
        assert_eq!(player.position, Some(TilePosition { x: 12, y: 2 }));
        assert_eq!(player.mergeable.as_ref().unwrap().strength, 35);
        for event_type in [
            "unit-merged",
            "unit-defeated",
            "site-captured",
            "unit-upgraded",
            "victory-achieved",
        ] {
            assert!(result.events.iter().any(|event| {
                serde_json::to_value(&event.event).unwrap()["type"] == event_type
            }));
        }
        let snapshot = serde_json::to_value(&result.snapshot).unwrap();
        assert!(validate_definition_value("Snapshot", "frontier.snapshot.json", &snapshot).ok);
        for event in &result.events {
            let event = serde_json::to_value(event).unwrap();
            assert!(validate_definition_value("Event", "frontier.events.json", &event).ok);
        }
    }

    #[test]
    fn frontier_balance_batch_wins_one_hundred_seeded_runs() {
        let project = load_project("examples/frontier.game.json", FRONTIER_PROJECT).unwrap();
        let base_input: InputLog = serde_json::from_str(FRONTIER_INPUT).unwrap();
        let outcomes = (0..100)
            .map(|offset| {
                let mut input = base_input.clone();
                input.seed += offset;
                replay(&project, &input).unwrap().snapshot.outcome
            })
            .collect::<Vec<_>>();
        assert!(outcomes.iter().all(|outcome| {
            matches!(
                outcome,
                Some(WorldOutcome::Won { faction, tick })
                    if faction == "demo:player" && *tick == Tick(14)
            )
        }));
    }

    #[test]
    fn tank_combat_vertical_slice_is_deterministic_and_schema_valid() {
        let project = load_project("examples/tank-combat.game.json", TANK_PROJECT).unwrap();
        let input: InputLog = serde_json::from_str(TANK_INPUT).unwrap();
        let results = (0..100)
            .map(|_| replay(&project, &input).unwrap())
            .collect::<Vec<_>>();
        let hashes = results
            .iter()
            .map(|result| result.snapshot.state_hash.as_str())
            .collect::<BTreeSet<_>>();
        assert_eq!(hashes.len(), 1);

        let result = &results[0];
        assert_eq!(result.snapshot.score, 100);
        assert_eq!(
            result.snapshot.outcome,
            Some(WorldOutcome::Won {
                faction: "tankarena:player-faction".to_owned(),
                tick: Tick(1),
            })
        );
        assert!(
            result
                .snapshot
                .entities
                .iter()
                .all(|entity| entity.id != "tankarena:brick")
        );
        assert!(result.snapshot.entities.iter().all(|entity| {
            entity
                .tank
                .as_ref()
                .is_none_or(|tank| tank.role != TankRole::Enemy)
        }));
        for event_type in [
            "enemy-spawned",
            "shot-fired",
            "entity-damaged",
            "entity-destroyed",
            "victory-achieved",
        ] {
            assert!(result.events.iter().any(|event| {
                serde_json::to_value(&event.event).unwrap()["type"] == event_type
            }));
        }
        let snapshot = serde_json::to_value(&result.snapshot).unwrap();
        assert!(validate_definition_value("Snapshot", "tank.snapshot.json", &snapshot).ok);
        for event in &result.events {
            let event = serde_json::to_value(event).unwrap();
            assert!(validate_definition_value("Event", "tank.events.json", &event).ok);
        }
    }
}
