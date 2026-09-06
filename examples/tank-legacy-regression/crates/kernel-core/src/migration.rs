//! Pure, ordered migrations into the current Game IR version.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::{KERNEL_PROTOCOL_VERSION, diagnostic::Diagnostic};

/// Result of a pure migration. The caller decides whether to write it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationResult {
    /// Migrated document.
    pub document: Value,
    /// Ordered human-readable transform log.
    pub applied: Vec<String>,
}

/// Migrates a JSON document to the current schema without touching the source.
///
/// # Errors
///
/// Returns a structured diagnostic for an absent or unsupported source version.
pub fn migrate_to_current(
    mut document: Value,
    file: &str,
) -> Result<MigrationResult, Box<Diagnostic>> {
    let version = document
        .get("schemaVersion")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            Box::new(Diagnostic::error(
                "IR_MISSING_VERSION",
                file,
                "/schemaVersion",
                "",
                "schemaVersion is required before migration",
            ))
        })?;

    if version == KERNEL_PROTOCOL_VERSION {
        return Ok(MigrationResult {
            document,
            applied: Vec::new(),
        });
    }

    if version != "0.1.0" {
        return Err(Box::new(Diagnostic::error(
            "IR_UNSUPPORTED_VERSION",
            file,
            "/schemaVersion",
            "",
            format!(
                "cannot migrate schemaVersion {version}; supported source versions are 0.1.0 and {KERNEL_PROTOCOL_VERSION}"
            ),
        )));
    }

    migrate_v0_1_to_v1(&mut document).map_err(|message| {
        Box::new(Diagnostic::error(
            "IR_MIGRATION_FAILED",
            file,
            "",
            "",
            message,
        ))
    })?;

    Ok(MigrationResult {
        document,
        applied: vec!["0.1.0 -> 1.0.0: scene/object vocabulary normalized".into()],
    })
}

fn migrate_v0_1_to_v1(document: &mut Value) -> Result<(), String> {
    let project = document
        .as_object_mut()
        .ok_or_else(|| "project root must be an object".to_owned())?;

    rename(project, "title", "name");
    rename(project, "entryScene", "entryWorld");
    let mut worlds = project
        .remove("scenes")
        .ok_or_else(|| "0.1.0 project is missing scenes".to_owned())?;

    let world_list = worlds
        .as_array_mut()
        .ok_or_else(|| "0.1.0 scenes must be an array".to_owned())?;
    for world in world_list {
        let world = world
            .as_object_mut()
            .ok_or_else(|| "0.1.0 scene must be an object".to_owned())?;
        rename(world, "title", "name");
        rename(world, "size", "bounds");
        rename(world, "objects", "entities");
    }

    project.insert("worlds".to_owned(), worlds);
    project.insert(
        "schemaVersion".to_owned(),
        Value::String(KERNEL_PROTOCOL_VERSION.to_owned()),
    );
    Ok(())
}

fn rename(object: &mut Map<String, Value>, old: &str, new: &str) {
    if let Some(value) = object.remove(old) {
        object.insert(new.to_owned(), value);
    }
}
