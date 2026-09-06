# P20 installed Studio automated UI observation

- Operator: Codex computer-use harness
- Build: `AI-Game-Studio-0.2.0-alpha.5-win-x64`
- Date: 2026-09-03
- Scope: visible wiring and navigation only
- Result: automated pass after fixing startup Scene data restoration

## Observed

- The app opens to a frameless Project Manager with custom minimize,
  maximize/restore, and close controls.
- New Project visibly separates Empty, Empty 2D, and Empty 3D.
- Examples are separated from project types and identify Pong 2D, Collect Room
  3D, and Tank Arena; Tank is described as regression-only.
- The system directory picker opens an ordinary project directory without an
  external editor.
- Pong opens into the general Workbench: Activity Bar, Scene/object outline,
  tree Project Files, central document tabs, Inspector/Copilot right dock,
  Console/Problems/Tests/Profiler/Event Timeline, status bar, and runtime
  controls are visible.
- Project-owned `AGENTS.md`, Skills, AI routing, Scene, scripts, input, tests,
  replay, build settings, and asset manifest are all discoverable in the tree.
- Opening the startup Scene routes it to the Scene document instead of replacing
  the whole IDE with a game-specific map editor.
- The packaged Workbench also passes the 150% DPI/minimum-window, keyboard
  focus/navigation/resize, accessible-name, window-state, and injected renderer
  crash-restoration gate documented in `P15-UI-QUALITY-EVIDENCE.md`.

## Gap found and closed

Restored Scene tabs did not load their Scene file into renderer state, so a
valid Pong Scene displayed `空 Scene`. `Workbench` now asynchronously loads any
active Scene document missing from the in-memory Scene map. Lint/typecheck pass;
the installed package is rebuilt and rechecked by the final P20 gate.

The first packaged run also exposed a visible Windows Terminal window when
Codex started the native Engine MCP proxy. The MCP proxy and player now use the
Windows GUI subsystem while retaining inherited stdio pipes. The final package
opened Pong with Codex/Engine MCP ready and no console window; the Scene outline
and canvas both showed all six objects.

A later project-open regression exposed a second console path: Studio launched
the bundled Codex JavaScript shim through Electron-as-Node, and the shim then
created native `codex.exe`. Windows builds now resolve the packaged native
`codex.exe` and launch `app-server` directly with hidden-window creation and
stdio pipes. The resolver gate rejects a missing native binary instead of
falling back to the shim. The final installed package opened the real Tank
project with Codex `ready`; process inspection showed native `codex.exe
app-server` as Studio's direct child, while the visible-window inventory showed
only Studio and no console window.

Diff Review 1.0 was then observed in the same installed Tank project. The real
`build/windows.development.json` Git Diff rendered a single-row toolbar with
`HEAD → 工作区`, `+1/-1`, `1/1` hunk navigation, auto/side-by-side/inline modes,
display options, open-file, stage, and restore actions. Inserted/deleted lines,
changed words, the gutter, overview ruler, and current hunk remained distinct in
both adaptive inline and explicit side-by-side layouts. The options popover
exposed trim-whitespace, word-wrap, unchanged-region, and context-line controls
without covering or displacing the toolbar. A real `hud.ts` Codex ChangeSet
rendered `变更前 → 变更后` and the lifecycle-appropriate Test/Rollback actions.
After closing and reopening the packaged Studio, the ChangeSet snapshot and
explicit side-by-side preference were restored. No Git or ChangeSet mutation
action was invoked against the Tank acceptance project.

The installed Tank `prefabs/projectile.prefab.json` review exposed a CSP theme
regression: JSON diagnostics and the colored minimap worked, but the main token
text was monochrome because Monaco's generated theme style element was blocked.
The renderer now permits Monaco's inline style element and attributes while
retaining self-only scripts and `connect-src 'none'`. The rebuilt package was
reopened on the same file and visibly distinguished blue property names and
booleans, orange strings, pale-green numbers, punctuation, and bracket guides.
The `hud.ts` ChangeSet Diff was rechecked immediately afterward; inherited
TypeScript token colors and Diff line/word colors remained active.

The Project Files tree was then rechecked against a copy of the same Tank
project after adding IDE-style Git decorations. Untracked files and their
single-state parent folders rendered green; modified files and parent folders
rendered gold; mixed descendants use their own neutral-gold group. File names
and type icons carry the primary signal, selection/hover preserves it, and the
right-edge `M/A/U/D/R/!` marker remains a secondary cue. The P15 renderer gate
also synthesizes modified, added, deleted, renamed, conflicted, and mixed rows
and requires six distinct computed colors.
The parallel `git-decor` Windows artifact was used because the canonical
portable directory was open during verification. Its clean install, update,
150% DPI quality, portable uninstall, and user-data-preservation lifecycle all
passed; archive SHA-256 is
`7035ad1e687da76a13cbdaaf911ea558408b3ea3ea632f60788805a45171e293`.

## Not certified by this record

Automation cannot establish that a new developer understands terminology or
can finish the full 2D/3D/Codex/debug/release journey without coaching. That
manual record remains blank and is the only Round 03 completion signature.
