---
name: author-ui
description: Build and verify a game's menus, HUD, overlays, and semantic buttons with the AI Game Kernel UI capability. Does not style Studio chrome.
---

# Author game UI

Read `capabilities.list`, `component.types`, `script.api`, the target Scene,
input actions and existing UI state Systems. Enable `ui` through an approved
`capability.set` ChangeSet if needed. This guide is available in all new project
presets; its presence does not mean the capability is enabled.

Use `core:ui-transform` with `ui:text`, `ui:image`, or `ui:button` for screen UI.
`render:text2d` is world text, not a screen-layout substitute. UI anchors are
normalized, with `(0,0)` at the top left and `(1,1)` at the bottom right. The
runtime projection uses a 1280 by 720 reference canvas; size and fontSize are
reference-canvas units. Do not assume CSS layout, automatic wrapping, responsive
reflow, or that a Transform size clips or measures text. Inspect actual runtime
frames at the target aspect ratios and viewport sizes.

Keep object and Component IDs stable when replacing presentation Components.
Preserve gameplay, collision and state Components. Declare new Systems and
semantic actions in the project protocols; set `ui:button.action` to a real
action understood by the game's input/Command path. Exercise that path, rather
than testing only that a string exists. Verify hidden and disabled buttons
cannot trigger gameplay, and check keyboard as well as pointer interaction.

Keep UI state, score, health, volume and mute in Components. Bind labels to the
real state and test changes, not just initial values. Scene transitions must
use the installed SDK's supported state transfer; module globals do not survive
all runtime request boundaries. Test help/settings return destinations, pause
freezing gameplay, and restart/menu transitions where those features exist.

Use ready project resource IDs or paths for images. `atlasRegion` is a source
pixel rectangle `x,y,width,height`; retain its aspect ratio for icons. A button
icon is not a scalable blank panel. Judge transparency from alpha/compositing,
not RGB hidden under transparent pixels. Generated resources keep the project's
review, provenance, import and rollback workflow; changing layout is not by
itself a reason to bill for another generation.

Submit a coherent ChangeSet containing presentation, bindings and regression
tests. Apply only after its effective approval policy is satisfied. Then use
`test.run`, replay and `runtime.capture_frame` / `runtime.observation.read`.
Check text clipping and overlap, atlas proportions, readable contrast, real
values, reachable controls and every relevant menu/overlay state. Structured
UI bounds and diagnostics are evidence, not a substitute for viewing the frame:
no overflow warning does not prove readable text or correct button behavior.
Compare Studio with the standalone Player before claiming the UI complete.

Follow this game's art direction, not the Studio shell theme. Record missing
engine capabilities or missing files as project gaps; do not replace the engine
protocol with mouse automation or silently relax existing gameplay assertions.
