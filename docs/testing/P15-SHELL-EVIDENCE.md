# P15 desktop shell evidence

- Build: Round 03 working tree, 2026-09-03
- Machine gates: `npm run check:p15:shell` and `npm run check:p15:quality`
- Result: passed

## Covered automatically

- Empty, Empty 2D, and Empty 3D create neutral projects without Tank/terrain
  vocabulary and initialize AGENTS, Skills, script, project settings, and build
  files.
- Workspace tabs, active panel, selection, collapsed folders, and dock sizes
  persist and restore.
- Studio/project/Agent/AI-tool setting scopes persist independently and reject
  plaintext secret-shaped keys.
- The credential vault stores only encrypted payloads, never returns secret
  values from list operations, deletes references, and fails closed when OS
  encryption is unavailable.
- Electron runs with `frame: false`, exposes only the typed bridge, reports the
  three project presets and custom window controls, and exits cleanly in smoke
  mode.
- At 150% device scale and the minimum window size, every major region remains
  visible without root overflow; every interactive control has a programmatic
  name; keyboard focus, Enter activation, Tab order, panel resizing, and focus
  indication pass.
- A forced Chromium renderer crash automatically reloads the same project and
  persisted workspace and exposes a visible recovery notice. The same quality
  gate passes from the copied release bundle under a system-only PATH.

## Developer visual observation

The built Electron window was opened at 1440×920 with an Empty 3D project. The
activity bar, Scene outline, project tree, central document tabs, right
Inspector/Copilot switcher, bottom tools, status bar, and custom window controls
were simultaneously visible and accessible by name. A grid-placement defect
that moved Project Files behind the right dock was observed, fixed by assigning
the left dock to grid column 2, and re-observed successfully.

Detailed repeatable results are in `docs/testing/P15-UI-QUALITY-EVIDENCE.md`.
This is engineering evidence, not the independent first-time-user acceptance
required by P20. The uncoached clean-install journey must not be inferred from
this record.
