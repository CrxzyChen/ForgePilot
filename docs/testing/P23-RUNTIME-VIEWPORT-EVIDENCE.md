# P23 Runtime Session and engine viewport evidence

- Date: 2026-09-03
- Protocol: `3.0.0-preview.1`
- Machine gate: `npm run check:p23`
- Human retest owner: Round 04 Journey A and final clean-profile P27 run

## Delivered boundary

`RuntimeSessionService` now owns one stable Session ID, an incrementing
Generation, ordered sequence, current Tick, authoritative Scene, random state,
deferred Events, and queued timestamped inputs. Start, pause, resume, one-Tick
step, stop, restart, and reported hot reload operate on that session. Pause and
step no longer recreate Tick zero.

The script host publishes a versioned `render.snapshot` and Studio publishes a
matching `debug.snapshot`. The native Player keeps one `ProjectScriptHost` VM
for its lifetime and renders `render.snapshot` through wgpu. Studio Scene and
Game documents consume the same projection through `EngineViewport`; game
objects are painted into Canvas rather than represented as DOM buttons.

The editor overlays remain presentation-only: grid, selection outlines,
picking, camera framing, and transform gizmo controls never enter authoritative
game state except through semantic Scene commands.

After the first product-owner interaction pass exposed delayed Scene movement
and rejected live keyboard input, the viewport interaction was split into a
preview/commit transaction. Pointer movement now coalesces an in-memory Scene
projection through `requestAnimationFrame`; pointer release updates the local
projection immediately and queues exactly one durable `scene.transform.*`
command. Commits are serialized per Scene, so additional drags remain usable
without reordering authoritative writes. The source Scene is never written
during preview, and a failed commit rolls the projection back to the file-backed
state.

The same viewport now provides standard discoverable navigation: left-click
picks, clicking outside drawables clears selection, Shift/Ctrl-click adds or
removes a selection, middle/right drag or Space+left drag pans, the wheel zooms,
and Home or the visible reset control restores framing. Q/W/E/R select the
Select/Move/Rotate/Scale tools, the toolbar exposes those shortcuts, the canvas
cursor reflects the active tool, and the viewport shows current zoom plus an
inline gesture reminder. High-frequency transform and navigation events are
both frame-coalesced.

Live keyboard and pointer events now use the dedicated
`workspaceRuntimeInput` IPC route. The renderer no longer timestamps input from
its asynchronous workspace snapshot, and the runtime allocates the current
authoritative Tick. The lightweight route queues input and publishes Runtime
state without synchronously scanning project files or Git.

The `+ 对象` command and every other text-input authoring action now use a
Studio-owned modal dialog instead of `window.prompt`. Successful creation
selects the new object, opens Inspector, and records the semantic action in the
Console. Empty objects intentionally contain only Transform until a render
component is added, but their existence and selection are immediately visible
in Scene Outline and Inspector.

## Automated evidence

`scripts/check-p23-runtime-session.ts` proves:

- a paused two-Tick session stepped once begins at Tick 2 and ends at Tick 3;
- its state hash exactly matches one uninterrupted three-Tick run with the same
  seed and queued input;
- Studio's TypeScript projector and the script-host/Player projector emit the
  same RenderSnapshot payload;
- restart retains Session ID and increments Generation;
- RenderSnapshot and DebugSnapshot carry the frozen protocol version;
- Player consumes snapshots through the wgpu path and retains its script VM;
- Engine MCP discovers every lifecycle/input command and the project Skill
  teaches Codex to use the same surface.

`scripts/check-p23-studio-viewport.ts` launches a clean Electron profile and
proves:

- Scene and Game use a Canvas surface with no DOM game-object buttons;
- a real Canvas interaction picks an object, clears it from blank space,
  switches to Move with W, zooms by wheel, pans by middle drag, and resets;
- clicking `+ 对象`, entering a name, and submitting the Studio dialog creates
  exactly one named object and closes the dialog;
- object movement becomes visible before pointer release while the Scene file
  remains byte-identical;
- pointer release writes the Scene once and adds exactly one undo transaction;
- the two-frame preview and pointer-release UI probes both stay below 200 ms;
  the final repair run measured 32.5 ms and 15.7 ms respectively, while the
  serialized durable commit completed in 409.6 ms;
- live Tick advances while playing, is stable while paused, and advances by
  exactly one while stepping;
- real keyboard input through the Game canvas increments the ordered session
  sequence;
- authoritative live-input queuing stays below 16 ms; repeated repair runs
  measured 0.63–0.84 ms;
- an invalid late input is rejected without corrupting the session;
- a real project-script failure changes Runtime to `failed` while Studio and
  the project remain alive;
- stop returns the session to `stopped`.

`scripts/check-p23-interaction-regressions.ts` additionally proves that 2D, 3D,
and UI preview transforms do not mutate their source document, transform and
navigation pointer events are frame-coalesced, non-blocking commits use an
optimistic per-Scene queue, Q/W/E/R and standard navigation inputs remain wired,
the renderer does not send `workspace.runtime.tick`, and the fast IPC is
connected across renderer, preload, main, and runtime registry.

## Remaining human evidence

P23 machine gates are closed. The clean-profile discoverability observation
for Run, Pause, Step, Stop, Game, Scene, Console, Problems, and Tick remains
open until an independent participant completes Journey A. It is intentionally
not inferred from the automated Electron gate.
