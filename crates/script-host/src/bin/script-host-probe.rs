//! JSON-line probe used by the Round 03 TypeScript host acceptance gate.

use std::io::{self, Read};

use ai_game_script_host::{ScriptHost, ScriptHostLimits, ScriptStepInput, ScriptStepOutput};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProbeRequest {
    bundle: String,
    inputs: Vec<ScriptStepInput>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProbeResponse {
    outputs: Vec<ScriptStepOutput>,
    memory_used_bytes: usize,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut source = String::new();
    io::stdin().read_to_string(&mut source)?;
    let request: ProbeRequest = serde_json::from_str(&source)?;
    let host = ScriptHost::new(&request.bundle, ScriptHostLimits::default())?;
    let mut outputs = Vec::with_capacity(request.inputs.len());
    for input in &request.inputs {
        outputs.push(host.step(input)?);
    }
    println!(
        "{}",
        serde_json::to_string(&ProbeResponse {
            outputs,
            memory_used_bytes: host.memory_used_bytes(),
        })?
    );
    Ok(())
}
