//! Bounded, device-free media inspection using the Player's codec backend.
use serde::Serialize;
use std::{
    io::Cursor,
    time::{Duration, Instant},
};
use symphonia::core::{
    audio::SampleBuffer,
    codecs::{CODEC_TYPE_NULL, DecoderOptions},
    errors::Error,
    formats::FormatOptions,
    io::{MediaSourceStream, MediaSourceStreamOptions},
    meta::MetadataOptions,
    probe::Hint,
};

pub const MAX_INPUT_BYTES: usize = 25 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioInspection {
    pub kind: &'static str,
    pub codec: String,
    pub duration_ms: u64,
    pub sample_rate_hz: u32,
    pub channels: usize,
    pub decoded_samples: u64,
    pub peak: f64,
    pub rms: f64,
}

pub fn inspect_audio(bytes: Vec<u8>) -> Result<AudioInspection, String> {
    decode_audio(bytes, |_, _, _, _| {})
}

pub fn decode_audio(
    bytes: Vec<u8>,
    mut visit: impl FnMut(&[f32], u32, usize, u64),
) -> Result<AudioInspection, String> {
    if bytes.is_empty() || bytes.len() > MAX_INPUT_BYTES {
        return Err("AUDIO_SIZE_INVALID: input must be 1 byte to 25 MiB".into());
    }
    let start = Instant::now();
    let media = MediaSourceStream::new(
        Box::new(Cursor::new(bytes)),
        MediaSourceStreamOptions::default(),
    );
    let mut format = symphonia::default::get_probe()
        .format(
            &Hint::new(),
            media,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|_| "AUDIO_DECODE_FAILED: unsupported or malformed container")?
        .format;
    let track = format
        .tracks()
        .iter()
        .find(|track| track.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or("AUDIO_TRACK_MISSING")?;
    let track_id = track.id;
    let codecs = symphonia::default::get_codecs();
    let codec = codecs
        .get_codec(track.codec_params.codec)
        .ok_or("AUDIO_CODEC_UNSUPPORTED")?
        .short_name
        .to_owned();
    let mut decoder = codecs
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|_| "AUDIO_CODEC_UNSUPPORTED")?;
    let mut rate = 0;
    let mut channels = 0;
    let mut samples = 0_u64;
    let mut peak = 0.0_f64;
    let mut squares = 0.0;
    loop {
        if start.elapsed() > Duration::from_secs(15) {
            return Err("AUDIO_DECODE_TIMEOUT".into());
        }
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(Error::IoError(error)) if error.kind() == std::io::ErrorKind::UnexpectedEof => {
                break;
            }
            Err(_) => return Err("AUDIO_DECODE_FAILED: malformed packet".into()),
        };
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = decoder
            .decode(&packet)
            .map_err(|_| "AUDIO_DECODE_FAILED: corrupt audio frame")?;
        let spec = *decoded.spec();
        let count = spec.channels.count();
        if !(8_000..=192_000).contains(&spec.rate) || !(1..=2).contains(&count) {
            return Err("AUDIO_FORMAT_UNSUPPORTED: expected mono/stereo at 8–192 kHz".into());
        }
        if samples > 0 && (rate != spec.rate || channels != count) {
            return Err("AUDIO_FORMAT_CHANGED".into());
        }
        rate = spec.rate;
        channels = count;
        if decoded.capacity() > 192_000 {
            return Err("AUDIO_FRAME_TOO_LARGE".into());
        }
        let mut buffer = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
        buffer.copy_interleaved_ref(decoded);
        for &sample in buffer.samples() {
            if !sample.is_finite() {
                return Err("AUDIO_SAMPLE_INVALID".into());
            }
            let sample = f64::from(sample);
            peak = peak.max(sample.abs());
            squares += sample * sample;
        }
        visit(buffer.samples(), rate, channels, samples / channels as u64);
        samples += buffer.samples().len() as u64;
        if samples > u64::from(rate) * channels as u64 * 601 {
            return Err(
                "AUDIO_DURATION_EXCEEDED: maximum 601 seconds including codec padding".into(),
            );
        }
    }
    if samples == 0 || rate == 0 || channels == 0 {
        return Err("AUDIO_EMPTY".into());
    }
    Ok(AudioInspection {
        kind: "audio",
        codec,
        duration_ms: samples * 1000 / (u64::from(rate) * channels as u64),
        sample_rate_hz: rate,
        channels,
        decoded_samples: samples,
        peak,
        rms: (squares / samples as f64).sqrt(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invalid_and_fake_mp3_are_not_media() {
        assert!(inspect_audio(vec![]).is_err());
        assert!(inspect_audio(b"ID3P29-DETERMINISTIC-AUDIO".to_vec()).is_err());
        assert!(inspect_audio(vec![0; MAX_INPUT_BYTES + 1]).is_err());
    }
    #[test]
    fn measured_mp3_metadata_is_not_the_request_duration() {
        let hex = include_str!("../tests/fixtures/tone.mp3.hex")
            .split_whitespace()
            .collect::<String>();
        let bytes = (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
            .collect();
        let report = inspect_audio(bytes).unwrap();
        assert_eq!(report.codec, "mp3");
        assert_eq!(report.sample_rate_hz, 44_100);
        assert_eq!(report.channels, 1);
        assert!((100..=160).contains(&report.duration_ms));
        assert!(report.peak > 0.1 && report.rms > 0.05);
    }
}
