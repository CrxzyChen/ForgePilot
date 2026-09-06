# P15 keyboard, DPI, accessibility, and crash-restoration evidence

- Build: AI Game Studio 0.3.0-preview.1
- Machine gate: `npm run check:p15:quality`
- Design-system gate: `npm run check:studio-ui-contract`
- Installed-bundle gate: `npm run check:p20:installed`
- Result: passed

## Exercised in the real Electron renderer

- Starts the general Workbench at the minimum supported window size under a
  forced 150% device scale factor.
- Confirms there is no root horizontal or vertical overflow and the Activity
  Bar, project navigation, central document area, right Inspector/Copilot dock,
  and bottom diagnostics dock all remain visible.
- Enumerates interactive controls and fails when a control has no programmatic
  name.
- Confirms named landmarks and three focusable, oriented, value-reporting panel
  separators.
- Measures the center/right boundary, the visible right-separator axis, its
  `8px` hit target, right-dock clipping, and every visible internal divider.
  The boundary and visible axis must be equal within `0.5px`, while internal
  dividers must begin inside the right dock.
- Drives the Electron separator through a native pointer-down followed by the
  renderer's PointerEvent movement path, and uses keyboard Arrow Right to resize
  the left dock. It verifies the dock updates while the drag is active, the
  visible focus ring, Search activation with Enter, and sequential focus with
  Tab.
- Opens the real Source Control activity and verifies the complete panel, not
  an isolated button: the panel surface, three-column Git toolbar, commit
  input/button, section headers, file rows, status column, and ChangeSet file
  links all use the Studio dark palette and compact typography. The gate fails
  if any inspected control falls back to an opaque browser-native light
  surface.
- Verifies the Chromium scrollbar has the Studio thumb treatment, the Copilot
  dock uses a bounded column layout, and the enlarged title typography is
  present.
- Computes the Project Files Git-decoration styles in the real renderer and
  fails unless modified, added/untracked, deleted, renamed, conflicted, and
  mixed-folder states retain six distinct color groups on the dark palette.
- Measures the titlebar at the minimum viewport: the File/Edit menu group stays
  left without overflow and runtime controls remain within 0.5 CSS pixels of
  the window center. Codex ChangeSet file links use the same Consolas `9.5px`
  typography as Project Files and remain left-aligned.
- Opens the real File dropdown and verifies that it is aligned to its trigger,
  uses the dark Studio surface, renders `10px` menu text in `26px` rows, and is
  not trapped inside the draggable titlebar region.
- Opens a third document, proves every tab including Project Overview has a
  close control, then uses the real tab context menu to execute Close Right,
  Close Others, and Close Current in sequence. The menu also exposes Close All
  and the `Ctrl+W` / `Ctrl+Shift+W` shortcuts.
- Persists the 960×640 window state with the two-pixel tolerance required by
  Windows DPI boundary quantization.
- Force-crashes the Chromium renderer, waits for the actual
  `render-process-gone` recovery path, and verifies the same project, all five
  Workbench regions, and a user-visible recovery notice return.
- Repeats the complete gate from a copied release bundle with a clean user-data
  directory and a PATH containing only Windows system binaries.
- Opens a real project source file and fails unless the source editor fills its
  document host, Monaco retains a useful content height, and the file Inspector
  action group keeps the Studio grid, dark background, and bordered controls.
  It also measures the Inspector file metadata instead of accepting inherited
  browser typography: labels must resolve to `9.5px` and values to `10px`.
  This prevents an empty grid row from collapsing the editor while still
  allowing the optional external-conflict banner above it, and prevents file
  information from appearing a full text scale larger than the surrounding UI.
- Builds representative controls for generation, test discovery, bottom test
  results, debugging, capabilities, external conflicts, credential management,
  and Copilot approvals inside the real Electron renderer. Every sampled label
  and control must resolve between `9px` and `10px`; every button must use
  `appearance: none`, a solid Studio border, and a non-native dark surface.
- Opens `scripts/game-sdk.d.ts` in the real Electron renderer and requires at
  least four distinct computed token colors. The verified build produces seven
  color groups across TypeScript keywords, strings, types, brackets, and normal
  identifiers.

## Locked Studio design language

- The approved Studio shell language is **Midnight Workshop**, documented in
  `docs/design/STUDIO-UI-SYSTEM.md`.
- `studio/electron/renderer/studio-ui.tokens.json` exposes its 14 color roles,
  compact typography, shell geometry, and Studio-vs-game scope as a versioned,
  machine-readable contract.
- Root `AGENTS.md` routes every Studio UI task through the project Skill at
  `.agents/skills/maintain-studio-ui/SKILL.md`. The Skill requires reuse of the
  existing visual grammar, complete interaction states, a real Electron review,
  and executable evidence.
- `check:studio-ui-contract` fails on token drift, missing canonical surfaces,
  prohibited light backgrounds, a lost design/Skill route, or removal of the
  real-renderer style and geometry assertions. It is part of `npm run check`.
- Game HUD and game art are explicitly outside this shell contract and remain
  governed by each game project's art-direction Skill.

## Project-manager long-operation feedback

- Open and Create acknowledge the first click immediately, enter a busy state,
  disable repeated project actions, and place a blocking progress card over the
  project manager.
- The Electron main process reports addressable `validating`, `workspace`,
  `codex`, and `finalizing` stages over the typed preload bridge. The card shows
  the current stage message, selected project path, progress segments, spinner,
  and elapsed seconds.
- The shell gate asserts the progress IPC contract, every main-process stage,
  the live-region feedback, and the duplicate-click warning. The full release
  gate and installed-bundle lifecycle pass with the resulting renderer.

## Product changes proven by the gate

The renderer now reloads automatically after an abnormal exit while the main
process keeps the project and persisted workspace authoritative. The user sees
a dismissible recovery notice. Activity and panel switches expose selected
state; document tabs, docks, and navigation expose landmarks; all dock
separators support pointer and keyboard sizing; Ctrl+W closes the active
document; and the bottom collapse control performs an actual operation.
Pointer resizing uses listeners installed for the lifetime of the Workbench and
a synchronous drag-target reference, so the first movement cannot be lost to a
React effect timing race. It updates CSS grid variables directly and commits
persisted React state only on release, avoiding whole-Workbench renders on every
move.
Copilot keeps its transcript flexible and its Composer anchored at the bottom;
settings and Goal/Plan regions are independently bounded and scrollable. The
Workbench titlebar now uses equal outer grid tracks around the runtime controls,
with project identity and menus grouped on the left. ChangeSet file links use a
dedicated code-file row instead of inheriting incidental button typography.
Titlebar dropdowns now take their position from the clicked menu button rather
than hard-coded offsets and use the same compact dark visual system as the rest
of Studio. Pinned workspace documents no longer lose their close control;
closing the final tab produces an explicit empty-editor state instead of a
hidden Project Overview tab.
Project Files now uses the file/folder name and icon as the primary Git status
decoration, including aggregated state on parent folders. The familiar
`M/A/U/D/R/!` suffix remains as a secondary textual cue and tooltip rather than
the only way to identify a changed file.
Project opening and creation no longer present an unexplained frozen-looking
start page while workspace indexing and Codex/MCP startup run. The immediate
busy acknowledgement is renderer-owned, while subsequent stage text comes from
the authoritative main-process operation so the feedback describes real work.
The source editor is pinned to the content row of its conflict-aware wrapper,
so absence of a conflict banner cannot collapse Monaco into the toolbar. File
Inspector commands use an explicit action group with dark normal, hover,
focus, disabled, and destructive states instead of browser-default buttons.
File metadata now owns compact label/value typography and line height; it no
longer inherits Chromium's roughly `16px` default definition-list text.
TypeScript now loads both the language service and Monaco's TypeScript Monarch
tokenizer. Explicit Studio theme rules cover keywords, types, strings, numbers,
comments, and brackets; loading only the worker is no longer accepted as syntax
highlighting.
Source Control now owns every visible control surface. Git actions use a compact
three-column toolbar, the commit composer has explicit focused and disabled
states, and file changes use a single-line monospace path with a separate status
cell and stage action. Commit history and Codex ChangeSets share the same section,
card, hover, status, and empty-state language. The installed-bundle gate verifies
the complete presentation at 150% scale and confirms there is no browser-default
light surface.
Generation and test workflows no longer inherit Chromium's `16px` form text,
gray `outset` buttons, or the browser-default `18.72px` level-three heading.
Their titles, labels, selects, task actions, test rows, and result rows now share
the Studio's `9–10px` hierarchy and dark hover/disabled states. The same audit
found and normalized the remaining raw controls in debug call stacks,
capability cards, external-conflict actions, credential management, and Copilot
approval actions.
The right separator now keeps its generous `8px` drag target centered across
the actual center/right boundary instead of placing the visible line four
pixels inside the right dock. This removes the false double line and prevents
Inspector/Copilot horizontal rules from visually crossing the separator.
Provider model controls now expose their provenance as part of the visual
contract. Green source text means the visible select came from the provider
API; orange denotes explicit manual-ID mode. The real Electron quality gate
checks both resource-generation and five-capability settings surfaces, along
with the compact manual-mode control, so browser defaults or an unlabeled
static fallback cannot silently return.

This record proves the repeatable machine quality checks. It does not replace
the independent first-time developer's understanding and end-to-end authoring
record required by P20.
