//! Deterministic time, random numbers, and canonical state hashing.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Simulation time. A tick advances only when the kernel explicitly steps.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Tick(pub u64);

/// A fixed-step clock isolated from wall-clock time.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FixedClock {
    current: Tick,
    tick_rate_hz: u16,
}

impl FixedClock {
    /// Creates a clock at tick zero.
    #[must_use]
    pub const fn new(tick_rate_hz: u16) -> Self {
        Self {
            current: Tick(0),
            tick_rate_hz,
        }
    }

    /// Current simulation tick.
    #[must_use]
    pub const fn now(self) -> Tick {
        self.current
    }

    /// Fixed simulation frequency.
    #[must_use]
    pub const fn tick_rate_hz(self) -> u16 {
        self.tick_rate_hz
    }

    /// Advances exactly one simulation tick.
    pub const fn advance(&mut self) {
        self.current.0 += 1;
    }
}

/// `SplitMix64` generator with fully specified cross-platform integer behavior.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SeededRng {
    state: u64,
}

impl SeededRng {
    /// Creates a deterministic stream from `seed`.
    #[must_use]
    pub const fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    /// Returns the next value in the deterministic stream.
    pub const fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut value = self.state;
        value = (value ^ (value >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        value = (value ^ (value >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        value ^ (value >> 31)
    }

    /// Serializable internal state used by snapshots.
    #[must_use]
    pub const fn state(self) -> u64 {
        self.state
    }
}

/// Produces a lowercase SHA-256 hash of a serializable, canonically ordered value.
///
/// Callers must use structs, vectors with explicit order, and ordered maps. JSON
/// objects assembled with insertion-order maps are not canonical by themselves.
///
/// # Errors
///
/// Returns serialization errors from the provided value.
pub fn canonical_hash(value: &impl Serialize) -> Result<String, serde_json::Error> {
    let bytes = serde_json::to_vec(value)?;
    let digest = Sha256::digest(bytes);
    Ok(format!("{digest:x}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splitmix64_vector_is_locked() {
        let mut random = SeededRng::new(0);
        assert_eq!(random.next_u64(), 16_294_208_416_658_607_535);
    }

    #[test]
    fn clock_never_reads_wall_time() {
        let mut clock = FixedClock::new(60);
        clock.advance();
        clock.advance();
        assert_eq!(clock.now(), Tick(2));
        assert_eq!(clock.tick_rate_hz(), 60);
    }
}
