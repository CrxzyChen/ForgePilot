//! Native launcher for the installed Studio Engine MCP server.
//!
//! The command registry, capability registry, project runtime and validation
//! live in the bundled Studio server. This executable deliberately contains no
//! game-specific fallback implementation.

#![forbid(unsafe_code)]
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use std::{
    env,
    process::{Command, ExitCode, Stdio},
};

fn main() -> ExitCode {
    let Some(runtime) = env::var_os("AIGAME_STUDIO_NODE_RUNTIME") else {
        eprintln!("AIGAME_STUDIO_NODE_RUNTIME is required");
        return ExitCode::FAILURE;
    };
    let Some(server) = env::var_os("AIGAME_STUDIO_ENGINE_MCP_SERVER") else {
        eprintln!("AIGAME_STUDIO_ENGINE_MCP_SERVER is required");
        return ExitCode::FAILURE;
    };
    match Command::new(runtime)
        .arg(server)
        .args(env::args_os().skip(1))
        .env("ELECTRON_RUN_AS_NODE", "1")
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
    {
        Ok(status) if status.success() => ExitCode::SUCCESS,
        Ok(status) => {
            ExitCode::from(u8::try_from(status.code().unwrap_or(1).clamp(1, 255)).unwrap_or(1))
        }
        Err(error) => {
            eprintln!("cannot start Studio Engine MCP server: {error}");
            ExitCode::FAILURE
        }
    }
}
