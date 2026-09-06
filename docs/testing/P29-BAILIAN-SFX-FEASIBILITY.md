# P29 Bailian sound-effect alternative — research checkpoint

Status: investigated, not implemented or production-accepted. No new provider
call, charge, credential read, route change or generated asset resulted from
this investigation. The current R5 production SFX adapter is still ElevenLabs
and lacks a usable configured credential.

## Verified provider capability

The official [Wan 2.7 text-to-video API](https://help.aliyun.com/zh/model-studio/text-to-video-api-reference)
documents automatically generated background music or sound effects when no
input audio is supplied. Its output is an MP4 video, not a standalone sound
effect. Submission is asynchronous; the returned task ID must be retained and
queried rather than repeatedly submitting. The documented regional API/key
requirements still apply. The user's existing account/model permission has
not been verified for this operation.

Inference: generating a short, isolated event video and extracting its audio
could be an alternative using the existing Bailian credential. It must be
labelled a video-derived route; it is not evidence of an existing pure-SFX API
or guaranteed isolated/no-speech/no-music quality. TTS imitation remains out.

## Required implementation and acceptance before use

- Add a named video-derived adapter without silently relabelling the current
  speech route or changing unrelated project defaults. Provider model identity
  must still come from the provider catalog.
- Persist the paid asynchronous task identity, cancellation limitations and
  ambiguity reconciliation before polling; never duplicate submissions on
  restart or timeout. Retain scoped R5 spending authorization and actual usage.
- Introduce bounded, portable MP4 audio extraction. At the initial investigation
  the Player enabled WAV/Vorbis only; `P29-AUDIO-CODEC-FOLLOWUP.md` now verifies
  MP3 support in a new candidate, but not MP4/AAC or audio extraction.
  `ffmpeg` was not found on the task PATH. Do not assume a
  codec or executable exists, or add an undeclared runtime prerequisite.
- Retain source-video hash, extraction parameters, output WAV hash and job/
  candidate ancestry. Import only reviewed audio through normal ChangeSets.
- Test missing audio, decode errors, silent/clipped output, oversized media,
  unsafe URLs, credential isolation, retry/recovery, provenance and rollback.
- Start with one non-speech gameplay cue and actually audition it. Proceed to
  the required cue set only if isolated effect quality is acceptable. Generated
  video with unwanted dialogue/music is not a completed game sound effect.

This is an alternative engineering path, not a reason to mark the audio gate
complete or to require the user to approve the existing paid-work grant again.
