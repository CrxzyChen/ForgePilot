//! Native stdin/stdout boundary used by Studio and exported players to run a
//! compiled project TypeScript bundle without Node.js.

use std::io::{self, Read};

use ai_game_script_host::{ProjectScriptHost, ScriptHostLimits};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectHostRequest {
    request: Value,
    #[serde(default)]
    memory_bytes: Option<usize>,
    #[serde(default)]
    stack_bytes: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectHostResponse {
    result: Value,
    memory_used_bytes: usize,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut source = String::new();
    io::stdin().read_to_string(&mut source)?;
    let request: ProjectHostRequest = serde_json::from_str(&source)?;
    let defaults = ScriptHostLimits::default();
    let limits = ScriptHostLimits {
        memory_bytes: request.memory_bytes.unwrap_or(defaults.memory_bytes),
        stack_bytes: request.stack_bytes.unwrap_or(defaults.stack_bytes),
    };
    let host = ProjectScriptHost::new(limits)?;
    let result = host.run(&request.request)?;
    println!(
        "{}",
        serde_json::to_string(&ProjectHostResponse {
            result,
            memory_used_bytes: host.memory_used_bytes(),
        })?
    );
    Ok(())
}
