# ADR 0016: Sandboxed TypeScript project runtime

- Status: Accepted for Round 03 Alpha
- Date: 2026-09-03
- Spike: `crates/script-host`, `fixtures/script-host/deterministic-behavior.ts`

## Decision

TypeScript 5.9 is the first project scripting language. Studio compiles project
modules to reviewed ES2022 JavaScript bundles. The native engine embeds QuickJS
through `rquickjs` 0.12.2. Source TypeScript and source maps remain authoritative;
the generated bundle is a reproducible cache artifact.

The host exposes a versioned, capability-derived API. It does not expose the
filesystem, network, process, wall clock, locale, dynamic native modules, or
ambient randomness. Authoritative code receives Tick, seed, copied state,
ordered input Events, deterministic random functions, and an Event queue.
Memory and stack limits apply per runtime; later P18 adds instruction/time and
Event-volume budgets.

Authoritative callbacks run on a fixed Tick. Presentation callbacks receive a
read-only projection. Events are immutable values delivered after the producer
phase in stable `(phase, system order, object ID, emission index)` order. Event
delivery is queued and non-reentrant.

The bundle header records SDK version, engine compatibility range, capability
versions, source hashes, compiler options, output hash, and source-map hash.
Load fails with structured diagnostics when any compatibility or integrity check
fails. Debug records include Tick, phase, System, object, source file, line,
column, stack, and relevant state paths; debug control is a semantic protocol,
not a JavaScript-engine handle.

## Spike evidence

`npm run check:p14:script-host` compiles the tracked TypeScript fixture, sends
the bundle and JSON state/events to the native host, and compares 101 isolated
runs. Rust tests separately prove deterministic custom behavior/Event handling
and the absence of clock, network, process, CommonJS, and ambient randomness.
The same host has no renderer dependency and is therefore the headless path.

## Rejected alternatives

- Node.js in exported players: too broad an authority surface and would make
  Node a player dependency.
- An editor-only TypeScript interpreter: would make preview and player behavior
  diverge.
- Compiling every project behavior into the engine crate: violates portable
  projects and requires engine-source changes.
- Inventing a TypeScript VM: unnecessary and outside the product's purpose.

## Follow-up

P18 must implement the full lifecycle, module graph, schedule, budgets, source
maps, pause/step/watch protocol, Event Timeline, replay integration, and 100-run
authoritative hash gate before this host is considered production-ready.
