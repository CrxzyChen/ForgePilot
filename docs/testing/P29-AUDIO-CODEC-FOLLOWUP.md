# P29 production audio decoder follow-up

Status: source repair, targeted tests, full regression and isolated candidate
installation checks pass. After the owner closed Studio, candidate `aa63a769…`
was installed at 2026-09-05 23:45 +08:00 with 287 content hashes verified and
the old installation recoverably backed up. Its installed audio inspector was
retested successfully. No real provider request or game asset was generated.
This is supervised engineering, not completed Tank audio or P33.

## Defects reproduced

The ElevenLabs sound-effect and music routes default to MP3. The Player's rodio
configuration enabled only WAV/Vorbis. A real encoded synthetic fixture added
before the repair fails `production_mp3_sound_effect_decodes_without_audio_device`
with `UnrecognizedFormat`. Existing P24 tested only a WAV tone; existing P29
returned the non-audio string `ID3P29-DETERMINISTIC-AUDIO` and therefore proved
transport/routing, not decoder compatibility.

The broker's old MP3 metadata used requested duration/sample rate and hard-coded
two channels; it did not inspect the bytes. The WAV path assumed a fixed 44-byte
header and could read a JUNK chunk as its audio data length. Raw PCM outputs were
also labelled `.wav` without an actual RIFF container.

## Repair scope

- Enable MP3 in locked rodio 0.21.1 and Symphonia 0.5.5. Local upstream Cargo
  feature definitions confirm `mp3` selects the Symphonia MP3 decoder; see
  [rodio 0.21.1](https://docs.rs/crate/rodio/0.21.1).
- Add a device-free native `--inspect-audio-stdin` operation. The main-process
  broker passes only candidate bytes and a minimal non-secret environment to
  its packaged Player. It decodes packets, reports measured codec/duration/
  sample rate/channels and checks finite samples. Limits: 25 MiB input, mono/
  stereo, 8–192 kHz, 601 seconds including encoder padding, 15-second decoding
  deadline plus 20-second supervising process timeout. No sound device or GPU
  is opened. Decoder, MIME mismatch, budget and missing-helper failures do not
  fabricate metadata or trigger another paid generation request.
- Reinspect audio on preview and selection, so stored request-derived metadata
  cannot authorize an invalid legacy candidate for import. No candidate is
  automatically selected or imported by successful decoding.
- A damaged pre-metadata audio candidate becomes a failed, unverified historical
  job rather than preventing the whole project history from opening. Its bytes
  and ID remain intact; a restart does not issue another provider request.
- Derive extension from response media type. Reject unsupported raw PCM/μ-law/
  A-law sound-effect/music requests before a paid call instead of pretending the bytes
  are WAV. Explicit conversion remains a separate undelivered capability.
- Replace the P29 fake MP3 success response with a valid encoded test signal;
  retain the fake bytes as a rejection test. The synthetic fixture is only test
  data and must never count as Tank's formal generated sound effects.

## Current evidence

- All 17 Player tests pass (including prior native/lifecycle tests and three
  audio regressions). MP3 decoding requires no audio device.
- `check:p29:media` passes: real fixture is measured as mono 44,100 Hz, 130 ms
  including padding, not the one-second request default. Fake MP3 fails with
  `ASSET_AUDIO_DECODE_FAILED`, zero candidates and no automatic retry.
- `check-p29-audio-inspection.ts` verifies that MP3 plus a valid 100 ms PCM WAV
  with an extra JUNK chunk have correct metadata. Empty/oversized data, fake
  MP3, invalid WAV, MIME mismatch and missing helper are rejected.
- `check:p29:import` passes existing review/import/rollback/tamper checks.
- `check:p24:audio` now passes separate WAV and MP3 project/runtime/build cases:
  play, volume, mute, pause, resume and stop events retain resource identity;
  the copied standalone executable validates its packaged audio without Studio.
  These are decoder/event/package checks, not an audible quality or independent
  human listening claim.
- Typecheck and lint pass. Initial full check stops at Cargo.toml formatting;
  the formatted rerun subsequently passes. A newly added migration test initially
  reused the existing `legacy` variable name; the renamed test passes, as do
  fresh typecheck, format and lint checks after that correction.

## Verified candidate and owner installation

The full `npm run check` exits 0 (execution session 80310), including real Electron
quality, lifecycle, native window, 100-run deterministic batches, packaging and
clean/updated install plus crash recovery. P20's Tank example runs 100 times in
21,971.46 ms with one state hash. Additional P29 media/import/agent bridge and P32
retry gates pass. The release and packaged audio inspectors both report the same
measured MP3/WAV metadata and pass their malformed-input negatives.

Candidate archive:
`artifacts/studio-windows/AI-Game-Studio-0.3.0-preview.1-r5-audio-mp3-check-win-x64.zip`

- ZIP SHA-256: `aa63a7691dfbd969e737f68d2efcd54bf58357e52fa19bc436d8fe83c1f9534e`.
- All 287 content hashes verified; 288 files including the build manifest.
- Packaged Player SHA-256: `b277641c5ba2694792dd9df3c44565a937721d57b546bb27ce652d4bbe534871`.
- Original Tank revision still `a33717f43878300f9615bfe02b187a8c12589b7814e448547bf141c5e03b2e8a`.

The official [sound-effect API](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert)
and [music API](https://elevenlabs.io/docs/api-reference/music/compose) document
their encoded output formats; the v2 music default remains `mp3_48000_192`.
These references establish provider protocol, not permission or a successful
paid call for the user's account.

The fixture bytes are 2,089 bytes with SHA-256
`14b7d6a7177a1aa0bf24e7254c27d88f0ad86046daebcc712681bb147d212fdb`.
Its upstream encoder and exact reproduction are recorded under
`crates/player/tests/fixtures/README.md`; no encoder is a shipping dependency.

The first dependency fetch hit an unavailable process-local proxy at 127.0.0.1: 2080. A command-local empty Cargo/HTTP proxy override fetched the single new
MP3 decoder crate successfully; OS settings and persistent proxy configuration
were not modified.

## Open exits

The installed canonical Studio is now `aa63a769…`; the same original Tank
conversation received the repair handoff and is executing. Game direction/layout repairs,
formal SFX provider execution and selection, updated game packages and P33
remain open. This repair does not create a missing ElevenLabs credential or
implement the investigated Bailian video-derived alternative.
Metadata-only vault inspection still finds Bailian/OpenAI references and no
ElevenLabs reference; no secret was read or decrypted. The repair cannot by
itself satisfy production SFX or subjective listening acceptance.
