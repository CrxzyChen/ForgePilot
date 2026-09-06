//! Native window, input, persistence, and presentation host for deterministic projects.

#![forbid(unsafe_code)]

use std::{
    env, fs,
    path::{Path, PathBuf},
    process::ExitCode,
    sync::Arc,
    time::{Duration, Instant},
};

use ai_game_kernel_core::{
    determinism::Tick,
    ir::GameProject,
    runtime::{Direction, RuntimeCommand, RuntimeSnapshot, Simulation, TilePosition, WorldOutcome},
    validation::load_project,
};
use ai_game_kernel_renderer::{RenderOutcome, RenderScene, Renderer};
use serde::Serialize;
use winit::{
    application::ApplicationHandler,
    dpi::{LogicalSize, PhysicalPosition},
    event::{ElementState, KeyEvent, WindowEvent},
    event_loop::{ActiveEventLoop, ControlFlow, EventLoop},
    keyboard::{KeyCode, PhysicalKey},
    window::{Window, WindowId},
};

const PROJECT_SOURCE: &str = include_str!("../../../examples/frontier.game.json");
const RUNTIME_SEED: u64 = 42;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum InputAction {
    Move { dx: i64, dy: i64 },
    Fire,
    Continue,
    TogglePause,
    Restart,
    ToggleDebug,
    Exit,
}

fn map_key(event: &KeyEvent) -> Option<InputAction> {
    if event.state != ElementState::Pressed || event.repeat {
        return None;
    }
    match event.physical_key {
        PhysicalKey::Code(KeyCode::KeyW | KeyCode::ArrowUp) => {
            Some(InputAction::Move { dx: 0, dy: -1 })
        }
        PhysicalKey::Code(KeyCode::KeyS | KeyCode::ArrowDown) => {
            Some(InputAction::Move { dx: 0, dy: 1 })
        }
        PhysicalKey::Code(KeyCode::KeyA | KeyCode::ArrowLeft) => {
            Some(InputAction::Move { dx: -1, dy: 0 })
        }
        PhysicalKey::Code(KeyCode::KeyD | KeyCode::ArrowRight) => {
            Some(InputAction::Move { dx: 1, dy: 0 })
        }
        PhysicalKey::Code(KeyCode::Space) => Some(InputAction::Fire),
        PhysicalKey::Code(KeyCode::Enter) => Some(InputAction::Continue),
        PhysicalKey::Code(KeyCode::Escape) => Some(InputAction::TogglePause),
        PhysicalKey::Code(KeyCode::KeyR) => Some(InputAction::Restart),
        PhysicalKey::Code(KeyCode::F3) => Some(InputAction::ToggleDebug),
        PhysicalKey::Code(KeyCode::KeyQ) => Some(InputAction::Exit),
        _ => None,
    }
}

fn diagnostic_json(value: &impl Serialize) -> String {
    serde_json::to_string(value)
        .unwrap_or_else(|error| format!("diagnostic serialization failed: {error}"))
}

fn movement_command(
    snapshot: &RuntimeSnapshot,
    tick: Tick,
    sequence: u64,
    dx: i64,
    dy: i64,
) -> Option<RuntimeCommand> {
    let entity = snapshot
        .entities
        .iter()
        .find(|entity| entity.player_controlled)?;
    let position = entity.position?;
    Some(RuntimeCommand::MoveUnit {
        command_id: format!("runtime:input/{sequence:016x}"),
        tick,
        entity_id: entity.id.clone(),
        destination: TilePosition {
            x: position.x + dx,
            y: position.y + dy,
        },
    })
}

fn fire_command(snapshot: &RuntimeSnapshot, tick: Tick, sequence: u64) -> Option<RuntimeCommand> {
    let entity = snapshot
        .entities
        .iter()
        .find(|entity| entity.player_controlled && entity.tank.is_some())?;
    Some(RuntimeCommand::Fire {
        command_id: format!("runtime:input/{sequence:016x}"),
        tick,
        entity_id: entity.id.clone(),
        direction: entity
            .tank
            .as_ref()
            .map_or(Direction::Up, |tank| tank.facing),
    })
}

#[derive(Debug, Default)]
struct RuntimeOptions {
    smoke_target: Option<u32>,
    project_path: Option<PathBuf>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SmokeReport {
    kind: &'static str,
    frames_presented: u32,
    ticks_executed: u64,
    average_frame_ms: f64,
    adapter: String,
    backend: String,
    final_state_hash: String,
    headless_boundary: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveRecord {
    schema_version: &'static str,
    highest_unlocked_level: usize,
    high_score: u64,
}

#[derive(Debug)]
struct RuntimeApp {
    projects: Vec<GameProject>,
    project_names: Vec<String>,
    level_index: usize,
    project_name: String,
    simulation: Simulation,
    campaign_score: u64,
    paused: bool,
    saved_outcome: Option<WorldOutcome>,
    renderer: Option<Renderer>,
    window: Option<Arc<Window>>,
    pending_commands: Vec<RuntimeCommand>,
    command_sequence: u64,
    smoke_target: Option<u32>,
    frames_presented: u32,
    frame_time: Duration,
    debug_overlay: bool,
    cursor: Option<PhysicalPosition<f64>>,
    advance_requested: bool,
}

impl RuntimeApp {
    fn new(options: &RuntimeOptions) -> Result<Self, String> {
        let (projects, project_names) = load_runtime_projects(options.project_path.as_deref())?;
        let project_name = project_names[0].clone();
        let simulation = Simulation::from_project(&projects[0], RUNTIME_SEED)
            .map_err(|error| diagnostic_json(&error))?;
        Ok(Self {
            projects,
            project_names,
            level_index: 0,
            project_name,
            simulation,
            campaign_score: 0,
            paused: false,
            saved_outcome: None,
            renderer: None,
            window: None,
            pending_commands: Vec::new(),
            command_sequence: 0,
            smoke_target: options.smoke_target,
            frames_presented: 0,
            frame_time: Duration::ZERO,
            debug_overlay: true,
            cursor: None,
            advance_requested: options.smoke_target.is_some(),
        })
    }

    fn fail(event_loop: &ActiveEventLoop, message: impl AsRef<str>) {
        eprintln!("[runtime] {}", message.as_ref());
        event_loop.exit();
    }

    fn restart_level(&mut self) -> Result<(), String> {
        self.simulation = Simulation::from_project(&self.projects[self.level_index], RUNTIME_SEED)
            .map_err(|error| diagnostic_json(&error))?;
        self.pending_commands.clear();
        self.paused = false;
        self.saved_outcome = None;
        self.advance_requested = false;
        Ok(())
    }

    fn advance_level(&mut self) -> Result<(), String> {
        self.campaign_score += self
            .simulation
            .snapshot()
            .map_err(|error| diagnostic_json(&error))?
            .score;
        self.level_index += 1;
        self.project_name = self.project_names[self.level_index].clone();
        self.restart_level()?;
        Self::save_progress(self.level_index + 1, self.campaign_score)
    }

    fn save_progress(highest_unlocked_level: usize, high_score: u64) -> Result<(), String> {
        let directory = env::var_os("LOCALAPPDATA")
            .or_else(|| env::var_os("APPDATA"))
            .map_or_else(env::temp_dir, PathBuf::from)
            .join("AI Game Kernel")
            .join("Tank Arena");
        fs::create_dir_all(&directory)
            .map_err(|error| format!("failed to create save directory: {error}"))?;
        let path = directory.join("save.json");
        let temporary = directory.join("save.json.tmp");
        let source = serde_json::to_vec_pretty(&SaveRecord {
            schema_version: "1.0.0",
            highest_unlocked_level,
            high_score,
        })
        .map_err(|error| format!("failed to serialize save: {error}"))?;
        fs::write(&temporary, source).map_err(|error| format!("failed to stage save: {error}"))?;
        if path.exists() {
            fs::remove_file(&path).map_err(|error| format!("failed to replace save: {error}"))?;
        }
        fs::rename(&temporary, &path).map_err(|error| format!("failed to commit save: {error}"))
    }

    #[allow(
        clippy::too_many_lines,
        reason = "input dispatch keeps the player-visible action contract in one place"
    )]
    fn handle_action(&mut self, action: InputAction, event_loop: &ActiveEventLoop) {
        match action {
            InputAction::Exit => event_loop.exit(),
            InputAction::ToggleDebug => self.debug_overlay = !self.debug_overlay,
            InputAction::TogglePause => self.paused = !self.paused,
            InputAction::Restart => {
                if let Err(error) = self.restart_level() {
                    Self::fail(event_loop, error);
                    return;
                }
            }
            InputAction::Continue => {
                let outcome = self
                    .simulation
                    .snapshot()
                    .ok()
                    .and_then(|snapshot| snapshot.outcome);
                match outcome {
                    Some(WorldOutcome::Won { .. })
                        if self.level_index + 1 < self.projects.len() =>
                    {
                        if let Err(error) = self.advance_level() {
                            Self::fail(event_loop, error);
                            return;
                        }
                    }
                    Some(WorldOutcome::Lost { .. }) => {
                        if let Err(error) = self.restart_level() {
                            Self::fail(event_loop, error);
                            return;
                        }
                    }
                    _ if !self.paused => self.advance_requested = true,
                    _ => {}
                }
            }
            InputAction::Fire => {
                if self.paused {
                    return;
                }
                let snapshot = match self.simulation.snapshot() {
                    Ok(snapshot) => snapshot,
                    Err(error) => {
                        Self::fail(event_loop, diagnostic_json(&error));
                        return;
                    }
                };
                self.command_sequence += 1;
                if let Some(command) = fire_command(
                    &snapshot,
                    self.simulation.current_tick(),
                    self.command_sequence,
                ) {
                    self.pending_commands.clear();
                    self.pending_commands.push(command);
                }
                self.advance_requested = true;
            }
            InputAction::Move { dx, dy } => {
                if self.paused {
                    return;
                }
                let snapshot = match self.simulation.snapshot() {
                    Ok(snapshot) => snapshot,
                    Err(error) => {
                        Self::fail(event_loop, diagnostic_json(&error));
                        return;
                    }
                };
                self.command_sequence += 1;
                if let Some(command) = movement_command(
                    &snapshot,
                    self.simulation.current_tick(),
                    self.command_sequence,
                    dx,
                    dy,
                ) {
                    self.pending_commands.clear();
                    self.pending_commands.push(command);
                    self.advance_requested = true;
                }
            }
        }
        if let Some(window) = &self.window {
            window.request_redraw();
        }
    }

    fn finish_smoke(&self, event_loop: &ActiveEventLoop, snapshot: &RuntimeSnapshot) {
        let average = if self.frames_presented == 0 {
            0.0
        } else {
            self.frame_time.as_secs_f64() * 1000.0 / f64::from(self.frames_presented)
        };
        let Some(renderer) = &self.renderer else {
            return;
        };
        let report = SmokeReport {
            kind: "ai-game-kernel/runtime-smoke",
            frames_presented: self.frames_presented,
            ticks_executed: snapshot.tick.0,
            average_frame_ms: average,
            adapter: renderer.adapter_name().to_owned(),
            backend: renderer.backend().to_owned(),
            final_state_hash: snapshot.state_hash.clone(),
            headless_boundary: "renderer-consumes-snapshot-only",
        };
        match serde_json::to_string(&report) {
            Ok(json) => println!("{json}"),
            Err(error) => eprintln!("[runtime] smoke report failed: {error}"),
        }
        event_loop.exit();
    }

    #[allow(
        clippy::cast_possible_truncation,
        reason = "cursor coordinates are intentionally projected to GPU-compatible f32 space"
    )]
    fn redraw(&mut self, event_loop: &ActiveEventLoop) {
        let started = Instant::now();
        if !self.paused && (self.smoke_target.is_some() || self.advance_requested) {
            if let Err(error) = self.simulation.step_commands(&self.pending_commands) {
                Self::fail(event_loop, diagnostic_json(&error));
                return;
            }
            self.pending_commands.clear();
            self.advance_requested = self.smoke_target.is_some();
        }
        let snapshot = match self.simulation.snapshot() {
            Ok(snapshot) => snapshot,
            Err(error) => {
                Self::fail(event_loop, diagnostic_json(&error));
                return;
            }
        };
        let scene = RenderScene::from_snapshot(&snapshot, self.debug_overlay);
        let Some(renderer) = &mut self.renderer else {
            Self::fail(event_loop, "renderer is unavailable");
            return;
        };
        match renderer.render(&scene) {
            Ok(RenderOutcome::Presented) => {
                self.frames_presented += 1;
                self.frame_time += started.elapsed();
            }
            Ok(RenderOutcome::Skipped) => {}
            Err(error) => {
                Self::fail(event_loop, error.to_string());
                return;
            }
        }

        let hovered = self.cursor.and_then(|cursor| {
            let viewport = renderer.viewport();
            let world = scene
                .camera
                .screen_to_world([cursor.x as f32, cursor.y as f32], viewport);
            scene.pick_entity(world)
        });
        let average = if self.frames_presented == 0 {
            0.0
        } else {
            self.frame_time.as_secs_f64() * 1000.0 / f64::from(self.frames_presented)
        };
        let player = snapshot
            .entities
            .iter()
            .find(|entity| entity.player_controlled);
        let status = player.map_or_else(
            || "player unavailable".to_owned(),
            |entity| {
                entity.tank.as_ref().map_or_else(
                    || {
                        format!(
                            "strength {}",
                            entity.mergeable.as_ref().map_or(0, |unit| unit.strength)
                        )
                    },
                    |tank| format!("HP {}/{}", tank.health, tank.max_health),
                )
            },
        );
        let outcome = match &snapshot.outcome {
            Some(WorldOutcome::Won { .. }) => "VICTORY — Enter next level",
            Some(WorldOutcome::Lost { .. }) => "DEFEAT — Enter restart",
            Some(WorldOutcome::InProgress) | None => "IN PROGRESS",
        };
        if snapshot.outcome != self.saved_outcome {
            if matches!(snapshot.outcome, Some(WorldOutcome::Won { .. })) {
                let score = self.campaign_score + snapshot.score;
                if let Err(error) =
                    Self::save_progress((self.level_index + 2).min(self.projects.len()), score)
                {
                    eprintln!("[runtime] {error}");
                }
            }
            self.saved_outcome.clone_from(&snapshot.outcome);
        }
        let pause_label = if self.paused { "PAUSED · " } else { "" };
        let score = self.campaign_score + snapshot.score;
        if let Some(window) = &self.window {
            window.set_title(&format!(
                "{} · level {}/{} · tick {} · {status} · score {score} · {pause_label}{outcome} · {average:.2} ms · hover {}",
                self.project_name,
                self.level_index + 1,
                self.projects.len(),
                snapshot.tick.0,
                hovered.unwrap_or("none")
            ));
        }

        if self
            .smoke_target
            .is_some_and(|target| self.frames_presented >= target)
        {
            self.finish_smoke(event_loop, &snapshot);
        } else if self.smoke_target.is_some()
            && let Some(window) = &self.window
        {
            window.request_redraw();
        }
    }
}

impl ApplicationHandler for RuntimeApp {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.window.is_some() {
            return;
        }
        let attributes = Window::default_attributes()
            .with_title(format!(
                "{} · WASD/Arrows move · Space fires · Enter continues · Esc pauses · R restarts · Q quits",
                self.project_name
            ))
            .with_inner_size(if self.smoke_target.is_some() {
                LogicalSize::new(640.0, 360.0)
            } else {
                LogicalSize::new(960.0, 540.0)
            })
            .with_visible(true);
        let window = match event_loop.create_window(attributes) {
            Ok(window) => Arc::new(window),
            Err(error) => {
                Self::fail(event_loop, format!("window creation failed: {error}"));
                return;
            }
        };
        let renderer = match pollster::block_on(Renderer::new(
            event_loop.owned_display_handle(),
            window.clone(),
        )) {
            Ok(renderer) => renderer,
            Err(error) => {
                Self::fail(event_loop, error.to_string());
                return;
            }
        };
        self.renderer = Some(renderer);
        self.window = Some(window.clone());
        window.request_redraw();
    }

    fn window_event(
        &mut self,
        event_loop: &ActiveEventLoop,
        _window_id: WindowId,
        event: WindowEvent,
    ) {
        match event {
            WindowEvent::CloseRequested => event_loop.exit(),
            WindowEvent::KeyboardInput { event, .. } => {
                if let Some(action) = map_key(&event) {
                    self.handle_action(action, event_loop);
                }
            }
            WindowEvent::CursorMoved { position, .. } => self.cursor = Some(position),
            WindowEvent::Resized(size) => {
                if let Some(renderer) = &mut self.renderer {
                    renderer.resize(size);
                }
            }
            WindowEvent::RedrawRequested => self.redraw(event_loop),
            _ => {}
        }
    }
}

fn parse_options() -> Result<RuntimeOptions, String> {
    let mut options = RuntimeOptions::default();
    let mut args = env::args().skip(1);
    while let Some(argument) = args.next() {
        match argument.as_str() {
            "--smoke" => {
                let value = args
                    .next()
                    .ok_or_else(|| "--smoke requires a positive frame count".to_owned())?;
                let frames = value
                    .parse::<u32>()
                    .map_err(|_| format!("invalid smoke frame count {value}"))?;
                if frames == 0 {
                    return Err("smoke frame count must be greater than zero".to_owned());
                }
                options.smoke_target = Some(frames);
            }
            "--project" => {
                let value = args
                    .next()
                    .ok_or_else(|| "--project requires a Game IR file path".to_owned())?;
                options.project_path = Some(PathBuf::from(value));
            }
            _ => {
                return Err(format!(
                    "unknown argument {argument}; expected --project <path> or --smoke <frames>"
                ));
            }
        }
    }
    Ok(options)
}

fn project_name(source: &str) -> String {
    serde_json::from_str::<serde_json::Value>(source)
        .ok()
        .and_then(|value| {
            value
                .get("name")
                .and_then(|name| name.as_str())
                .map(str::to_owned)
        })
        .unwrap_or_else(|| "AI Game".to_owned())
}

fn load_one_project(path: &Path) -> Result<(GameProject, String), String> {
    let source = fs::read_to_string(path)
        .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
    let name = project_name(&source);
    let project = load_project(&path.display().to_string(), &source)
        .map_err(|report| diagnostic_json(&report))?;
    Ok((project, name))
}

#[allow(
    clippy::too_many_lines,
    reason = "project discovery handles explicit, packaged-campaign, packaged-single, and embedded modes"
)]
fn load_runtime_projects(
    explicit: Option<&Path>,
) -> Result<(Vec<GameProject>, Vec<String>), String> {
    if let Some(path) = explicit {
        let (project, name) = load_one_project(path)?;
        return Ok((vec![project], vec![name]));
    }
    let executable_directory = env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf));
    if let Some(directory) = executable_directory {
        let campaign_path = directory.join("game/campaign.json");
        if campaign_path.is_file() {
            let source = fs::read_to_string(&campaign_path)
                .map_err(|error| format!("failed to read campaign: {error}"))?;
            let value: serde_json::Value = serde_json::from_str(&source)
                .map_err(|error| format!("invalid campaign manifest: {error}"))?;
            let levels = value
                .get("levels")
                .and_then(serde_json::Value::as_array)
                .ok_or_else(|| "campaign levels must be an array".to_owned())?;
            let loaded = levels
                .iter()
                .map(|level| {
                    let relative = level
                        .get("scene")
                        .and_then(serde_json::Value::as_str)
                        .ok_or_else(|| "campaign level scene must be a string".to_owned())?;
                    if relative.contains("..") || Path::new(relative).is_absolute() {
                        return Err("campaign scene path must stay inside game/".to_owned());
                    }
                    load_one_project(&directory.join("game").join(relative))
                })
                .collect::<Result<Vec<_>, _>>()?;
            let (projects, names): (Vec<_>, Vec<_>) = loaded.into_iter().unzip();
            if projects.is_empty() {
                return Err("campaign must contain at least one level".to_owned());
            }
            return Ok((projects, names));
        }
        let project_path = directory.join("game/project.game.json");
        if project_path.is_file() {
            let (project, name) = load_one_project(&project_path)?;
            return Ok((vec![project], vec![name]));
        }
    }
    let project = load_project("examples/frontier.game.json", PROJECT_SOURCE)
        .map_err(|report| diagnostic_json(&report))?;
    Ok((vec![project], vec![project_name(PROJECT_SOURCE)]))
}

fn run() -> Result<(), String> {
    let options = parse_options()?;
    let event_loop = EventLoop::new().map_err(|error| error.to_string())?;
    event_loop.set_control_flow(ControlFlow::Poll);
    let mut app = RuntimeApp::new(&options)?;
    event_loop
        .run_app(&mut app)
        .map_err(|error| error.to_string())
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("[runtime] {error}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn movement_is_a_command_for_the_current_tick() {
        let project = load_project("example", PROJECT_SOURCE).unwrap();
        let simulation = Simulation::from_project(&project, RUNTIME_SEED).unwrap();
        let snapshot = simulation.snapshot().unwrap();
        let command = movement_command(&snapshot, Tick(0), 7, 1, 0).unwrap();
        assert_eq!(command.tick(), Tick(0));
        assert_eq!(command.command_id(), "runtime:input/0000000000000007");
    }

    #[test]
    fn fire_uses_the_player_tank_facing() {
        let project = load_project(
            "tank-combat",
            include_str!("../../../examples/tank-combat.game.json"),
        )
        .unwrap();
        let simulation = Simulation::from_project(&project, RUNTIME_SEED).unwrap();
        let snapshot = simulation.snapshot().unwrap();
        let command = fire_command(&snapshot, Tick(0), 8).unwrap();
        assert!(matches!(
            command,
            RuntimeCommand::Fire {
                direction: Direction::Up,
                ..
            }
        ));
    }

    #[test]
    fn explicit_project_loading_is_independent_of_engine_examples() {
        let temporary = env::temp_dir().join(format!(
            "ai-game-runtime-project-{}-{}.game.json",
            std::process::id(),
            RUNTIME_SEED
        ));
        fs::write(
            &temporary,
            include_str!("../../../examples/tank-combat.game.json"),
        )
        .unwrap();
        let (projects, names) = load_runtime_projects(Some(&temporary)).unwrap();
        fs::remove_file(temporary).unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(names, ["Tank Combat Fixture"]);
    }
}
