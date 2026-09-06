use std::{
    collections::BTreeSet,
    env, fs,
    io::{self, Read},
    path::{Path, PathBuf},
    process::ExitCode,
};

use ai_game_kernel_core::{
    KERNEL_PROTOCOL_VERSION, KernelConfig,
    diagnostic::{Diagnostic, ValidationReport},
    ir::GameProject,
    migration::migrate_to_current,
    runtime::{InputLog, WorldOutcome, replay, verify_replay},
    validation::load_project,
};
use serde_json::{Value, json};

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err((code, value)) => {
            print_json(&value);
            ExitCode::from(code)
        }
    }
}

fn run() -> Result<(), (u8, Value)> {
    let mut args = env::args().skip(1);
    match args.next().as_deref() {
        None | Some("info") => {
            print_info();
            Ok(())
        }
        Some("validate") => {
            let path = exactly_one_path(args, "validate")?;
            let source = read_source(&path)?;
            match load_project(&path.to_string_lossy(), &source) {
                Ok(_) => {
                    print_json(&ValidationReport {
                        ok: true,
                        schema_version: KERNEL_PROTOCOL_VERSION,
                        diagnostics: Vec::new(),
                    });
                    Ok(())
                }
                Err(report) => Err((
                    2,
                    serde_json::to_value(report).expect("serializable report"),
                )),
            }
        }
        Some("migrate") => {
            let path = exactly_one_path(args, "migrate")?;
            let source = read_source(&path)?;
            let document: Value = serde_json::from_str(&source).map_err(|error| {
                (
                    2,
                    serde_json::to_value(ValidationReport {
                        ok: false,
                        schema_version: KERNEL_PROTOCOL_VERSION,
                        diagnostics: vec![Diagnostic::error(
                            "IR_JSON_SYNTAX",
                            path.to_string_lossy(),
                            "",
                            "",
                            error.to_string(),
                        )],
                    })
                    .expect("serializable report"),
                )
            })?;
            match migrate_to_current(document, &path.to_string_lossy()) {
                Ok(result) => {
                    print_json(&json!({ "ok": true, "migration": result }));
                    Ok(())
                }
                Err(diagnostic) => Err((
                    2,
                    serde_json::to_value(ValidationReport {
                        ok: false,
                        schema_version: KERNEL_PROTOCOL_VERSION,
                        diagnostics: vec![*diagnostic],
                    })
                    .expect("serializable report"),
                )),
            }
        }
        Some("run") => {
            let [project_path, input_path] = exactly_two_paths(args, "run")?;
            let project = load_project_path(&project_path)?;
            let input = load_input(&input_path)?;
            match replay(&project, &input) {
                Ok(result) => {
                    print_json(&json!({ "ok": true, "result": result }));
                    Ok(())
                }
                Err(error) => Err((3, json!({ "ok": false, "error": error }))),
            }
        }
        Some("verify") => {
            let [project_path, input_path, expected_hash] = exactly_three(args, "verify")?;
            let project_path = PathBuf::from(project_path);
            let input_path = PathBuf::from(input_path);
            let project = load_project_path(&project_path)?;
            let input = load_input(&input_path)?;
            match verify_replay(&project, &input, &expected_hash) {
                Ok(result) => {
                    print_json(&json!({
                        "ok": true,
                        "stateHash": result.snapshot.state_hash,
                    }));
                    Ok(())
                }
                Err(error) => Err((3, json!({ "ok": false, "error": error }))),
            }
        }
        Some("batch") => run_batch(args),
        Some(command) => Err((
            1,
            json!({
                "ok": false,
                "code": "CLI_UNKNOWN_COMMAND",
                "message": format!("unknown command {command}; expected info, validate, migrate, run, verify, or batch"),
            }),
        )),
    }
}

fn run_batch(args: impl Iterator<Item = String>) -> Result<(), (u8, Value)> {
    let [project_path, input_path, runs] = exactly_three(args, "batch")?;
    let project_path = PathBuf::from(project_path);
    let input_path = PathBuf::from(input_path);
    let project = load_project_path(&project_path)?;
    let base_input = load_input(&input_path)?;
    let runs = runs.parse::<u64>().map_err(|_| batch_runs_error())?;
    if !(1..=10_000).contains(&runs) {
        return Err(batch_runs_error());
    }
    let mut wins = 0_u64;
    let mut losses = 0_u64;
    let mut incomplete = 0_u64;
    let mut victory_ticks = Vec::new();
    let mut hashes = Vec::new();
    for offset in 0..runs {
        let mut input = base_input.clone();
        input.seed = base_input.seed.checked_add(offset).ok_or_else(|| {
            (
                1,
                json!({
                    "ok": false,
                    "code": "CLI_BATCH_SEED_OVERFLOW",
                    "message": "batch seed range exceeds u64",
                }),
            )
        })?;
        let result = replay(&project, &input)
            .map_err(|error| (3, json!({ "ok": false, "error": error })))?;
        match &result.snapshot.outcome {
            Some(WorldOutcome::Won { tick, .. }) => {
                wins += 1;
                victory_ticks.push(tick.0);
            }
            Some(WorldOutcome::Lost { .. }) => losses += 1,
            Some(WorldOutcome::InProgress) | None => incomplete += 1,
        }
        hashes.push(result.snapshot.state_hash);
    }
    let first_state_hash = hashes.first().cloned();
    let last_state_hash = hashes.last().cloned();
    print_json(&json!({
        "ok": true,
        "batch": {
            "runs": runs,
            "seedStart": base_input.seed,
            "seedEnd": base_input.seed + runs - 1,
            "wins": wins,
            "losses": losses,
            "incomplete": incomplete,
            "winRatePermille": wins * 1000 / runs,
            "victoryTickMin": victory_ticks.iter().min(),
            "victoryTickMax": victory_ticks.iter().max(),
            "uniqueStateHashes": hashes.iter().collect::<BTreeSet<_>>().len(),
            "firstStateHash": first_state_hash,
            "lastStateHash": last_state_hash,
        }
    }));
    Ok(())
}

fn batch_runs_error() -> (u8, Value) {
    (
        1,
        json!({
            "ok": false,
            "code": "CLI_BATCH_RUNS",
            "message": "batch runs must be an integer from 1 to 10000",
        }),
    )
}

fn print_info() {
    let config = KernelConfig::default();
    print_json(&json!({
        "ok": true,
        "protocolVersion": KERNEL_PROTOCOL_VERSION,
        "tickRateHz": config.tick_rate_hz(),
    }));
}

fn exactly_two_paths(
    mut args: impl Iterator<Item = String>,
    command: &str,
) -> Result<[PathBuf; 2], (u8, Value)> {
    let values = exact_arguments(&mut args, command, 2, "<project.game.json> <input.json>")?;
    Ok([values[0].clone().into(), values[1].clone().into()])
}

fn exactly_three(
    mut args: impl Iterator<Item = String>,
    command: &str,
) -> Result<[String; 3], (u8, Value)> {
    let third = if command == "batch" {
        "<runs>"
    } else {
        "<expected-hash>"
    };
    let usage = format!("<project.game.json> <input.json> {third}");
    let values = exact_arguments(&mut args, command, 3, &usage)?;
    Ok([values[0].clone(), values[1].clone(), values[2].clone()])
}

fn exact_arguments(
    args: &mut impl Iterator<Item = String>,
    command: &str,
    count: usize,
    usage: &str,
) -> Result<Vec<String>, (u8, Value)> {
    let values: Vec<_> = args.collect();
    if values.len() != count {
        return Err((
            1,
            json!({
                "ok": false,
                "code": "CLI_ARGUMENT_COUNT",
                "message": format!("usage: kernelctl {command} {usage}"),
            }),
        ));
    }
    Ok(values)
}

fn exactly_one_path(
    mut args: impl Iterator<Item = String>,
    command: &str,
) -> Result<PathBuf, (u8, Value)> {
    let Some(path) = args.next() else {
        return Err((
            1,
            json!({
                "ok": false,
                "code": "CLI_MISSING_PATH",
                "message": format!("usage: kernelctl {command} <project.game.json>"),
            }),
        ));
    };
    if args.next().is_some() {
        return Err((
            1,
            json!({
                "ok": false,
                "code": "CLI_TOO_MANY_ARGUMENTS",
                "message": format!("usage: kernelctl {command} <project.game.json>"),
            }),
        ));
    }
    Ok(path.into())
}

fn read_source(path: &Path) -> Result<String, (u8, Value)> {
    if path == Path::new("-") {
        let mut source = String::new();
        io::stdin().read_to_string(&mut source).map_err(|error| {
            (
                1,
                json!({
                    "ok": false,
                    "code": "CLI_STDIN_FAILED",
                    "file": "-",
                    "message": error.to_string(),
                }),
            )
        })?;
        return Ok(source);
    }
    fs::read_to_string(path).map_err(|error| {
        (
            1,
            json!({
                "ok": false,
                "code": "CLI_READ_FAILED",
                "file": path.to_string_lossy(),
                "message": error.to_string(),
            }),
        )
    })
}

fn load_project_path(path: &Path) -> Result<GameProject, (u8, Value)> {
    let source = read_source(path)?;
    load_project(&path.to_string_lossy(), &source).map_err(|report| {
        (
            2,
            serde_json::to_value(report).expect("serializable report"),
        )
    })
}

fn load_input(path: &Path) -> Result<InputLog, (u8, Value)> {
    let source = read_source(path)?;
    serde_json::from_str(&source).map_err(|error| {
        (
            2,
            json!({
                "ok": false,
                "code": "CLI_INPUT_JSON",
                "file": path.to_string_lossy(),
                "message": error.to_string(),
            }),
        )
    })
}

fn print_json(value: &impl serde::Serialize) {
    println!(
        "{}",
        serde_json::to_string_pretty(value).expect("machine output must serialize")
    );
}
