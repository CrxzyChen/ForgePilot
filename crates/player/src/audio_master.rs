//! Local candidate derivation, never provider generation or project authoring.
use crate::audio_inspection::decode_audio;
use rodio::{buffer::SamplesBuffer, source::UniformSourceIterator};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AudioMasterSpec {
    pub start_ms: u32,
    pub end_ms: u32,
    pub fade_in_ms: u32,
    pub fade_out_ms: u32,
    pub gain_db: f64,
}

pub fn master_audio(bytes: Vec<u8>, spec: &AudioMasterSpec) -> Result<Vec<u8>, String> {
    if spec.end_ms <= spec.start_ms
        || spec.end_ms > 600_000
        || spec.end_ms - spec.start_ms > 60_000
        || spec.fade_in_ms > 500
        || spec.fade_out_ms > 500
        || spec.fade_in_ms + spec.fade_out_ms > spec.end_ms - spec.start_ms
        || !spec.gain_db.is_finite()
        || !(-48.0..=48.0).contains(&spec.gain_db)
    {
        return Err("AUDIO_MASTER_SPEC_INVALID".into());
    }
    let mut selected = Vec::new();
    let source = decode_audio(bytes, |samples, rate, channels, offset| {
        let first = u64::from(spec.start_ms) * u64::from(rate) / 1000;
        let end = u64::from(spec.end_ms) * u64::from(rate) / 1000;
        let from = first
            .saturating_sub(offset)
            .min(samples.len() as u64 / channels as u64);
        let to = end
            .saturating_sub(offset)
            .min(samples.len() as u64 / channels as u64);
        if from < to {
            selected.extend_from_slice(&samples[from as usize * channels..to as usize * channels]);
        }
    })?;
    if u64::from(spec.end_ms) * u64::from(source.sample_rate_hz)
        > (source.decoded_samples / source.channels as u64) * 1000
    {
        return Err("AUDIO_MASTER_RANGE_EXCEEDS_SOURCE".into());
    }
    // Reuse the Player's existing, pinned rodio resampler; no audio device opens.
    // An extra terminal frame covers fractional sample rounding, not missing media.
    let last = selected
        .get(selected.len().saturating_sub(source.channels)..)
        .ok_or("AUDIO_MASTER_EMPTY")?
        .to_vec();
    selected.extend_from_slice(&last);
    let channels = source.channels;
    let frames = (spec.end_ms - spec.start_ms) as usize * 48;
    let input = SamplesBuffer::new(channels as u16, source.sample_rate_hz, selected);
    let mut resampled = UniformSourceIterator::new(input, channels as u16, 48_000);
    let mut wav = Vec::with_capacity(44 + frames * channels * 2);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + frames as u32 * channels as u32 * 2).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16_u32.to_le_bytes());
    wav.extend_from_slice(&1_u16.to_le_bytes());
    wav.extend_from_slice(&(channels as u16).to_le_bytes());
    wav.extend_from_slice(&48_000_u32.to_le_bytes());
    wav.extend_from_slice(&(48_000_u32 * channels as u32 * 2).to_le_bytes());
    wav.extend_from_slice(&(channels as u16 * 2).to_le_bytes());
    wav.extend_from_slice(&16_u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&(frames as u32 * channels as u32 * 2).to_le_bytes());
    let gain = 10_f64.powf(spec.gain_db / 20.0);
    for frame in 0..frames {
        let fade_in = if spec.fade_in_ms == 0 {
            1.0
        } else {
            (frame as f64 / (spec.fade_in_ms as usize * 48) as f64).min(1.0)
        };
        let fade_out = if spec.fade_out_ms == 0 {
            1.0
        } else {
            ((frames - 1 - frame) as f64 / (spec.fade_out_ms as usize * 48) as f64).min(1.0)
        };
        for _ in 0..channels {
            let sample = f64::from(resampled.next().ok_or("AUDIO_MASTER_EMPTY")?)
                * gain
                * fade_in
                * fade_out;
            if !sample.is_finite() || sample.abs() >= 1.0 {
                return Err("AUDIO_MASTER_CLIPPING: attenuate gainDb".into());
            }
            wav.extend_from_slice(&((sample * 32767.0).round() as i16).to_le_bytes());
        }
    }
    Ok(wav)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio_inspection::inspect_audio;

    fn input() -> Vec<u8> {
        let hex = include_str!("../tests/fixtures/tone.mp3.hex")
            .split_whitespace()
            .collect::<String>();
        (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
            .collect()
    }

    #[test]
    fn crop_resample_fade_decode_and_repeat_are_real() {
        let mut spec = AudioMasterSpec {
            start_ms: 10,
            end_ms: 90,
            fade_in_ms: 2,
            fade_out_ms: 8,
            gain_db: -3.0,
        };
        let wav = master_audio(input(), &spec).unwrap();
        assert_eq!(wav, master_audio(input(), &spec).unwrap());
        assert_eq!(&wav[44..46], &[0, 0]);
        assert_eq!(&wav[wav.len() - 2..], &[0, 0]);
        let report = inspect_audio(wav).unwrap();
        assert_eq!(report.duration_ms, 80);
        assert_eq!(report.sample_rate_hz, 48_000);
        assert_eq!(report.channels, 1);
        assert_eq!(report.codec, "pcm_s16le");
        assert!(report.peak > 0.03 && report.peak < 1.0);
        spec.gain_db = 48.0;
        assert!(
            master_audio(input(), &spec)
                .unwrap_err()
                .contains("CLIPPING")
        );
        spec.gain_db = -3.0;
        spec.end_ms = 500;
        assert!(
            master_audio(input(), &spec)
                .unwrap_err()
                .contains("EXCEEDS_SOURCE")
        );
        spec.end_ms = 10;
        assert!(master_audio(input(), &spec).is_err());
        spec.end_ms = 60_011;
        assert!(master_audio(input(), &spec).is_err());
        assert!(master_audio(vec![0; 100], &spec).is_err());
    }
}
