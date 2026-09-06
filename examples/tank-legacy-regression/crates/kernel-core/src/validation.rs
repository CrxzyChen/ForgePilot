//! Schema and semantic validation for authoritative project documents.

use std::collections::{BTreeMap, BTreeSet};

use jsonschema::{ValidationError, error::ValidationErrorKind};
use serde_json::Value;

use crate::{
    KERNEL_PROTOCOL_VERSION,
    diagnostic::{Diagnostic, ValidationReport},
    ir::GameProject,
};

const GAME_IR_SCHEMA: &str = include_str!("../../../schemas/game-ir.schema.json");

/// Parses and validates a project, returning its generated Rust type on success.
///
/// # Errors
///
/// Returns all schema and semantic diagnostics in deterministic path order.
pub fn load_project(file: &str, source: &str) -> Result<GameProject, ValidationReport> {
    let document: Value = match serde_json::from_str(source) {
        Ok(document) => document,
        Err(error) => {
            return Err(ValidationReport {
                ok: false,
                schema_version: KERNEL_PROTOCOL_VERSION,
                diagnostics: vec![Diagnostic::error(
                    "IR_JSON_SYNTAX",
                    file,
                    "",
                    "",
                    format!(
                        "invalid JSON at line {}, column {}: {}",
                        error.line(),
                        error.column(),
                        error
                    ),
                )],
            });
        }
    };

    let report = validate_project_value(file, &document);
    if !report.ok {
        return Err(report);
    }

    serde_json::from_value(document).map_err(|error| ValidationReport {
        ok: false,
        schema_version: KERNEL_PROTOCOL_VERSION,
        diagnostics: vec![Diagnostic::error(
            "IR_BINDING_MISMATCH",
            file,
            "",
            "",
            format!("generated Rust binding rejected schema-valid data: {error}"),
        )],
    })
}

/// Validates an already parsed project against schema and semantic invariants.
///
/// # Panics
///
/// Panics only when the schema embedded at compile time is invalid. Repository
/// checks compile and exercise that invariant before release.
#[must_use]
pub fn validate_project_value(file: &str, document: &Value) -> ValidationReport {
    let schema: Value =
        serde_json::from_str(GAME_IR_SCHEMA).expect("embedded Game IR schema must be valid JSON");
    let validator =
        jsonschema::draft202012::new(&schema).expect("embedded Game IR schema must compile");

    let mut diagnostics = Vec::new();
    for error in validator.iter_errors(document) {
        collect_schema_diagnostics(file, &error, &mut diagnostics);
    }

    if diagnostics.is_empty() {
        validate_semantics(file, document, &mut diagnostics);
    }

    diagnostics.sort_by(|left, right| {
        (&left.file, &left.instance_path, &left.code, &left.message).cmp(&(
            &right.file,
            &right.instance_path,
            &right.code,
            &right.message,
        ))
    });
    diagnostics.dedup();

    ValidationReport {
        ok: diagnostics.is_empty(),
        schema_version: KERNEL_PROTOCOL_VERSION,
        diagnostics,
    }
}

/// Validates a protocol value against one named `$defs` entry in the Game IR.
///
/// This keeps input logs, events, snapshots, and change sets on the same schema
/// contract as project authoring data.
///
/// # Panics
///
/// Panics only when the schema embedded at compile time is invalid.
#[must_use]
pub fn validate_definition_value(
    definition: &str,
    file: &str,
    document: &Value,
) -> ValidationReport {
    let schema: Value =
        serde_json::from_str(GAME_IR_SCHEMA).expect("embedded Game IR schema must be valid JSON");
    let definitions = schema
        .get("$defs")
        .cloned()
        .expect("embedded Game IR schema must define $defs");
    if definitions.get(definition).is_none() {
        return ValidationReport {
            ok: false,
            schema_version: KERNEL_PROTOCOL_VERSION,
            diagnostics: vec![Diagnostic::error(
                "IR_SCHEMA_DEFINITION",
                file,
                "",
                "",
                format!("unknown Game IR schema definition {definition}"),
            )],
        };
    }
    let wrapper = serde_json::json!({
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": format!("#/$defs/{definition}"),
        "$defs": definitions,
    });
    let validator =
        jsonschema::draft202012::new(&wrapper).expect("embedded Game IR definition must compile");
    let mut diagnostics = Vec::new();
    for error in validator.iter_errors(document) {
        collect_schema_diagnostics(file, &error, &mut diagnostics);
    }
    diagnostics.sort_by(|left, right| {
        (&left.instance_path, &left.code, &left.message).cmp(&(
            &right.instance_path,
            &right.code,
            &right.message,
        ))
    });
    diagnostics.dedup();
    ValidationReport {
        ok: diagnostics.is_empty(),
        schema_version: KERNEL_PROTOCOL_VERSION,
        diagnostics,
    }
}

fn collect_schema_diagnostics(
    file: &str,
    error: &ValidationError<'_>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    match error.kind() {
        ValidationErrorKind::AnyOf { context } | ValidationErrorKind::OneOfNotValid { context } => {
            if let Some(best_branch) = context.iter().min_by_key(|branch| branch.len()) {
                for nested in best_branch {
                    collect_schema_diagnostics(file, nested, diagnostics);
                }
                return;
            }
        }
        _ => {}
    }

    let keyword = error
        .kind()
        .keyword()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_uppercase()
            } else {
                '_'
            }
        })
        .collect::<String>();
    diagnostics.push(Diagnostic::error(
        format!("IR_SCHEMA_{keyword}"),
        file,
        error.instance_path().to_string(),
        error.schema_path().to_string(),
        error.to_string(),
    ));
}

fn validate_semantics(file: &str, document: &Value, diagnostics: &mut Vec<Diagnostic>) {
    let Some(project) = document.as_object() else {
        return;
    };
    let mut ids = BTreeMap::<&str, String>::new();

    if let Some(id) = project.get("id").and_then(Value::as_str) {
        register_id(file, id, "/id", &mut ids, diagnostics);
    }

    let entry_world = project.get("entryWorld").and_then(Value::as_str);
    let mut world_ids = BTreeSet::new();
    if let Some(worlds) = project.get("worlds").and_then(Value::as_array) {
        for (world_index, world) in worlds.iter().enumerate() {
            let world_path = format!("/worlds/{world_index}");
            let Some(world) = world.as_object() else {
                continue;
            };
            if let Some(id) = world.get("id").and_then(Value::as_str) {
                world_ids.insert(id);
                register_id(file, id, &format!("{world_path}/id"), &mut ids, diagnostics);
            }

            let width = world
                .get("bounds")
                .and_then(|bounds| bounds.get("width"))
                .and_then(Value::as_i64)
                .unwrap_or_default();
            let height = world
                .get("bounds")
                .and_then(|bounds| bounds.get("height"))
                .and_then(Value::as_i64)
                .unwrap_or_default();
            if let Some(entities) = world.get("entities").and_then(Value::as_array) {
                for (entity_index, entity) in entities.iter().enumerate() {
                    let entity_path = format!("{world_path}/entities/{entity_index}");
                    let Some(entity) = entity.as_object() else {
                        continue;
                    };
                    if let Some(id) = entity.get("id").and_then(Value::as_str) {
                        register_id(
                            file,
                            id,
                            &format!("{entity_path}/id"),
                            &mut ids,
                            diagnostics,
                        );
                    }
                    validate_components(
                        file,
                        entity.get("components"),
                        &entity_path,
                        width,
                        height,
                        diagnostics,
                    );
                }
            }
        }
    }

    if let Some(entry_world) = entry_world
        && !world_ids.contains(entry_world)
    {
        diagnostics.push(Diagnostic::error(
            "IR_REFERENCE_NOT_FOUND",
            file,
            "/entryWorld",
            "",
            format!("entryWorld references unknown world ID {entry_world}"),
        ));
    }
}

fn register_id<'a>(
    file: &str,
    id: &'a str,
    path: &str,
    ids: &mut BTreeMap<&'a str, String>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    if let Some(previous) = ids.insert(id, path.to_owned()) {
        diagnostics.push(Diagnostic::error(
            "IR_DUPLICATE_ID",
            file,
            path,
            "",
            format!("ID {id} is already declared at {previous}"),
        ));
    }

    let (_, resource_path) = id.split_once(':').unwrap_or_default();
    if resource_path
        .split('/')
        .any(|part| part == "." || part == "..")
    {
        diagnostics.push(Diagnostic::error(
            "IR_UNSTABLE_ID",
            file,
            path,
            "",
            "ID paths may not contain . or .. segments",
        ));
    }
}

fn validate_components(
    file: &str,
    components: Option<&Value>,
    entity_path: &str,
    width: i64,
    height: i64,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let Some(components) = components.and_then(Value::as_array) else {
        return;
    };
    let mut types = BTreeMap::<&str, usize>::new();
    for (index, component) in components.iter().enumerate() {
        let Some(component) = component.as_object() else {
            continue;
        };
        let Some(component_type) = component.get("type").and_then(Value::as_str) else {
            continue;
        };
        let path = format!("{entity_path}/components/{index}");
        if let Some(previous) = types.insert(component_type, index) {
            diagnostics.push(Diagnostic::error(
                "IR_DUPLICATE_COMPONENT",
                file,
                format!("{path}/type"),
                "",
                format!("component type {component_type} is already present at index {previous}"),
            ));
        }

        if component_type == "core:transform" {
            let x = component
                .get("position")
                .and_then(|position| position.get("x"))
                .and_then(Value::as_i64)
                .unwrap_or_default();
            let y = component
                .get("position")
                .and_then(|position| position.get("y"))
                .and_then(Value::as_i64)
                .unwrap_or_default();
            if x < 0 || x >= width || y < 0 || y >= height {
                diagnostics.push(Diagnostic::error(
                    "IR_POSITION_OUT_OF_BOUNDS",
                    file,
                    format!("{path}/position"),
                    "",
                    format!("position ({x}, {y}) is outside world bounds {width}x{height}"),
                ));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migration::migrate_to_current;

    const VALID: &str = include_str!("../../../examples/minimal.game.json");
    const INVALID: &str = include_str!("../../../fixtures/invalid/wrong-coordinate.game.json");
    const V0: &str = include_str!("../../../fixtures/v0/minimal.game.json");
    const MIGRATED_V0: &str = include_str!("../../../fixtures/golden/migrated-v0.game.json");

    #[test]
    fn valid_fixture_loads_into_generated_type() {
        let project = load_project("examples/minimal.game.json", VALID).unwrap();
        assert_eq!(project.id.to_string(), "demo:frontier");
    }

    #[test]
    fn invalid_fixture_reports_exact_coordinate_path() {
        let report =
            load_project("fixtures/invalid/wrong-coordinate.game.json", INVALID).unwrap_err();
        assert!(report.diagnostics.iter().any(|diagnostic| {
            diagnostic.instance_path == "/worlds/0/entities/0/components/0/position/x"
        }));
    }

    #[test]
    fn v0_fixture_migrates_and_validates() {
        let document = serde_json::from_str(V0).unwrap();
        let migrated = migrate_to_current(document, "fixtures/v0/minimal.game.json").unwrap();
        let golden: Value = serde_json::from_str(MIGRATED_V0).unwrap();
        assert_eq!(migrated.document, golden);
        let source = serde_json::to_string(&migrated.document).unwrap();
        load_project("migrated.game.json", &source).unwrap();
        assert_eq!(migrated.applied.len(), 1);
    }
}
