//! Stable execution boundary for the AI Game Kernel.
//!
//! The authoring model and public command protocol live outside runtime storage.
//! This crate must never expose renderer, physics, or ECS-native handles through
//! its public API.

#![forbid(unsafe_code)]

use std::fmt;

pub mod determinism;
pub mod diagnostic;
pub mod ir;
pub mod migration;
pub mod runtime;
pub mod validation;

/// Current kernel protocol version.
pub const KERNEL_PROTOCOL_VERSION: &str = "1.0.0";

/// Minimal configuration shared by headless and rendered runtimes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KernelConfig {
    tick_rate_hz: u16,
}

impl KernelConfig {
    /// Creates a validated kernel configuration.
    ///
    /// # Errors
    ///
    /// Returns [`KernelConfigError`] when `tick_rate_hz` is zero.
    pub const fn new(tick_rate_hz: u16) -> Result<Self, KernelConfigError> {
        if tick_rate_hz == 0 {
            return Err(KernelConfigError::ZeroTickRate);
        }

        Ok(Self { tick_rate_hz })
    }

    /// Fixed simulation frequency in ticks per second.
    #[must_use]
    pub const fn tick_rate_hz(self) -> u16 {
        self.tick_rate_hz
    }
}

impl Default for KernelConfig {
    fn default() -> Self {
        Self { tick_rate_hz: 60 }
    }
}

/// Configuration validation failure.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KernelConfigError {
    /// A fixed-step simulation cannot use a zero tick rate.
    ZeroTickRate,
}

impl fmt::Display for KernelConfigError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ZeroTickRate => formatter.write_str("tick_rate_hz must be greater than zero"),
        }
    }
}

impl std::error::Error for KernelConfigError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_tick_rate_is_stable() {
        assert_eq!(KernelConfig::default().tick_rate_hz(), 60);
    }

    #[test]
    fn zero_tick_rate_is_rejected() {
        assert_eq!(KernelConfig::new(0), Err(KernelConfigError::ZeroTickRate));
    }
}
