//! Stable, machine-readable diagnostics shared by the CLI and Studio.

use serde::{Deserialize, Serialize};

/// Severity of a validation or migration diagnostic.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    /// The document cannot be loaded or executed.
    Error,
    /// The document is valid but should be reviewed.
    Warning,
}

/// A diagnostic with both source and structured-value locations.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    /// Stable code suitable for automation.
    pub code: String,
    /// Error or warning.
    pub severity: Severity,
    /// Project-relative source file when known.
    pub file: String,
    /// RFC 6901 JSON Pointer into the source document.
    pub instance_path: String,
    /// JSON Pointer into the authoritative schema when applicable.
    pub schema_path: String,
    /// Concise human-readable explanation.
    pub message: String,
}

impl Diagnostic {
    /// Creates a blocking diagnostic.
    #[must_use]
    pub fn error(
        code: impl Into<String>,
        file: impl Into<String>,
        instance_path: impl Into<String>,
        schema_path: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            code: code.into(),
            severity: Severity::Error,
            file: file.into(),
            instance_path: instance_path.into(),
            schema_path: schema_path.into(),
            message: message.into(),
        }
    }
}

/// Complete validation result. Diagnostics are deterministically sorted.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationReport {
    /// Whether the document can be loaded.
    pub ok: bool,
    /// Schema version accepted by the kernel.
    pub schema_version: &'static str,
    /// All collected diagnostics.
    pub diagnostics: Vec<Diagnostic>,
}
