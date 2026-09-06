# ADR 0015: General core, capability, extension, and demo boundaries

- Status: Accepted
- Date: 2026-09-03

## Context

The technical prototype proved an end-to-end path by compiling Tank Arena
concepts into the core schema, runtime, renderer, Studio, and default template.
That shortcut prevents the product from becoming a general 2D/3D game IDE and
makes new game genres require engine-source changes.

## Decision

The dependency direction is fixed as:

```text
platform adapters -> general core <- capability registry
                                  <- project extensions
                                  <- examples
Studio UI --------> semantic command/query registry
Engine MCP -------> semantic command/query registry
```

The general core may name Project, Scene, object, Component, resource, Prefab,
script, System, Command, Event, Tick, snapshot, test, build, ChangeSet, and
diagnostic. It must not name a game's actor, item, terrain, scoring rule, or
victory rule.

A capability is a versioned registration bundle. It supplies schemas,
inspectors, editors, gizmos, runtime and renderer adapters, semantic commands,
MCP descriptions, Skills, tests, migrations, and build metadata. The minimum
official capabilities are 2D and 3D; neither is required by the core.

A project extension uses the public SDK and the same registrations. It may not
import Studio renderer internals or private engine modules. Examples are normal
projects plus optional extensions. Examples may depend on core and capabilities;
core and capabilities may never depend on examples.

Human UI and Engine MCP are peers over one registry. UI coordinates and DOM
operations are never part of the authoring API. Every mutation is a typed
semantic command that can preview a ChangeSet, validate, apply, audit, undo, and
replay headlessly.

## Enforcement

- `scripts/check-p14-rebaseline.ts` validates the declared boundaries.
- P17 adds a zero-domain-vocabulary production scan.
- Capability manifests declare every adapter and AI-parity surface.
- Build tooling rejects reverse imports from examples into production crates or
  Studio modules.

## Consequences

The prototype's Tank runtime must migrate out of production core. Some short-term
duplication is acceptable while the public extension API is established. Game
features become slower to prototype in private Rust but become portable,
inspectable, testable, and writable by both people and Codex.
