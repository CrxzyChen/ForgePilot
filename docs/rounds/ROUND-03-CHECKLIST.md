# Round 03 execution checklist

- Source of truth: `docs/rounds/ROUND-03-GENERAL-AI-STUDIO.md`
- Status: Validation — P14-P20 machine implementation passed; independent unassisted human Gate open
- Rule: an item is checked only when its named artifact and evidence exist.
- Rule: a phase is complete only after both machine evidence and an unassisted
  human task pass.

## Release evidence

- `docs/testing/P20-RELEASE-EVIDENCE.md`
- `docs/testing/P20-AUTOMATED-UI-OBSERVATION.md`
- `docs/testing/ROUND-03-HUMAN-ACCEPTANCE.md` (protocol; result still open)
- `docs/RELEASE_LIMITATIONS-0.2.0-alpha.1.md`

## P14 — Product rebaseline and contracts

- [x] Publish the Round 03 development specification.
- [x] Publish this independent execution checklist.
- [x] Correct the human dashboard from “finished product” to “technical
      prototype baseline”.
- [x] Inventory Tank-, Tile-, top-down-, and fixed-2D assumptions in production
      Studio, Schema, MCP, template, renderer, and runtime paths.
- [x] Classify every P0-P13 subsystem as keep, extract to capability, move to
      demo, replace, or remove.
- [x] Freeze the core/capability/extension/demo dependency rules in ADRs.
- [x] Select and prove the sandboxed TypeScript host, determinism policy, bundle
      format, debug protocol, and version compatibility.
- [x] Define project file schemas for capabilities, Scenes, Prefabs, scripts,
      Systems, Commands, Events, settings, and editor workspace state.
- [x] Write the canonical unassisted human task and observation rubric.
- [x] Record the current Studio baseline attempt and capture every blocking gap.

### P14 exit gate

- [x] The inventory contains file/line evidence and an owner for every removal
      or extraction.
- [x] Architecture review fixes the target dependency rules and assigns every
      current Tank Demo production-boundary violation to a removal phase.
- [x] The script-host spike executes a deterministic custom behavior and Event
      in repeated native and headless runs.
- [x] The baseline human task recording and gap ledger are attached.

## P15 — Desktop shell and project experience

- [x] Implement a frameless Electron window with custom minimize,
      maximize/restore, close, drag, double-click, resize, and snap behavior.
- [x] Handle unsaved files, active runtime, build, and Agent turn on close.
- [x] Implement Project Manager with Empty, Empty 2D, Empty 3D, Open, Recent,
      and separate Examples entry points.
- [x] Implement Activity Bar and Explorer/Search/Source Control/Assets/Tests/
      Build/Extensions/Settings side panels.
- [x] Implement tree-based Project Files with file operations, drag/drop,
      context menu, Git state, diagnostics, and AI activity.
- [x] Render IDE-style Git decorations on Project Files: modified, added/
      untracked, deleted, renamed, conflicted, and mixed descendant states
      color the file or folder name and icon; `M/A/U/D/R/!` remains a
      secondary cue.
- [x] Implement Scene Outline and Project Files as resizable/collapsible panes.
- [x] Implement central multi-document tabs and editor routing.
- [x] Implement switchable Inspector/Copilot right dock.
- [x] Implement Console/Problems/Tests/Profiler/Event Timeline bottom dock.
- [x] Implement status bar and background-job visibility.
- [x] Keep File/Edit menus in the left titlebar group, center runtime controls
      geometrically, and align ChangeSet file links with Project Files
      typography.
- [x] Implement layout, open-document, panel, and window-state restoration.
- [x] Implement first-run onboarding and contextual help for every visible area.
- [x] Implement global/project/secret settings scopes and reset/recovery.

### P15 exit gate

- [x] A clean-installed Studio completes project create/open/reopen without CLI
      or another editor.
- [ ] A first-time user identifies every region and completes the navigation
      task without coaching.
- [x] Keyboard, focus, resize, high-DPI, crash restoration, and accessibility
      checks pass.
- [x] Every shell action meets the AI parity checklist below.

## P16 — Source editor and project language service

- [x] Integrate the production source editor as a central document type.
- [x] Support TypeScript, JSON, WGSL, Markdown, and plain text.
- [x] Preserve Monaco runtime token-theme styles under the renderer CSP and
      verify distinct JSON key/value/number/boolean plus TypeScript colors in
      the installed Tank project.
- [x] Implement multi-tab open, close, dirty state, save, Save All, conflicts,
      and recovery.
- [x] Implement syntax highlighting, formatting, completion, hover, diagnostics,
      definition, references, rename, symbols, and project-wide search/replace.
- [x] Generate and expose engine/project TypeScript types.
- [x] Navigate diagnostic output to exact file, line, and column.
- [x] Show Git changes and Codex ChangeSets as adaptive, inline, and side-by-side
      Diff with semantic revision labels, change counts, syntax-aware rendering,
      long-path protection, and restart restoration.
- [x] Deliver Diff Review 1.0 with high-contrast line/word/gutter colors,
      previous/next hunk navigation (F7/Shift+F7), persisted whitespace/wrap/
      unchanged-region/context options, open-file action, Git stage/unstage/safe
      restore, and lifecycle-aware whole-ChangeSet review actions.
- [x] Link Scene objects, Components, scripts, Events, and Systems bidirectionally.
- [x] Add file attachments and active selection to Copilot context.
- [x] Cover undo/redo across text, filesystem, and semantic commands.

### P16 exit gate

- [ ] A user authors and repairs a multi-file TypeScript feature without leaving
      Studio.
- [x] Injected syntax, type, runtime, and merge errors navigate to correct source
      locations.
- [x] Human and Codex edits produce equivalent saved files, diagnostics, Diff,
      undo, and audit results.

## P17 — General Scene, object, Component, resource, and Prefab authoring

- [x] Implement create/open/switch/rename/duplicate/trash/startup Scene actions.
- [x] Implement Scene Outline hierarchy, multi-select, parent/reparent, reorder,
      duplicate, trash, visibility, lock, and stable IDs.
- [x] Implement capability-driven object and Component creation.
- [x] Implement schema-driven Inspector editors and custom editor registration.
- [x] Implement generic Transform2D, Transform3D, and UI transform editing.
- [x] Implement Prefab create, isolated edit, instantiate, override, apply,
      revert, and dependency tracking.
- [x] Implement resource tree, import settings, reimport, dependency graph,
      preview, and missing-reference repair.
- [x] Separate Scene authoring and Game runtime documents.
- [x] Route 2D, 3D, UI, code, Prefab, material, animation, Diff, and report files
      to correct central editors.
- [x] Remove hard-coded Tank and terrain controls from production Studio.
- [x] Move Tank components, Commands, Events, Systems, Skills, and content into
      the example/extension boundary.

### P17 exit gate

- [x] A project creates and switches two Scenes, composes one Prefab, adds a
      custom Component, and reopens with identical state.
- [x] Production core/Studio scans contain no game-specific Tank, Bullet, Brick,
      Pong, or Collectible behavior.
- [x] All Scene/object/Component/Prefab/resource actions pass AI parity.

## P18 — Script lifecycle, Systems, Events, and debugging

- [x] Implement versioned TypeScript SDK and sandboxed project script host.
- [x] Implement `onStart`, `onEnable`, `onFixedUpdate`, `onFrame`, `onInput`,
      `onEvent`, collision, disable, and destroy lifecycle.
- [x] Enforce authoritative fixed-Tick and presentation-only frame boundaries.
- [x] Implement project-defined Components and stable query-based Systems.
- [x] Implement typed project Commands and immutable typed Events.
- [x] Implement explicit phase scheduling and stable execution order.
- [x] Implement queued, non-reentrant Event delivery and producer/consumer index.
- [x] Implement script stack traces, state watches, pause, step, breakpoints, and
      hot-reload/restart policy.
- [x] Implement Event Timeline, System trace, snapshot comparison, and replay.
- [x] Implement script CPU, allocation, and Event-volume budgets.
- [x] Expose complete runtime observation and debugging through Engine MCP.

### P18 exit gate

- [x] Project TypeScript implements deterministic per-Tick movement without
      engine-source changes.
- [x] A custom Event crosses producer and consumer scripts with typed payload.
- [x] A deliberately failing replay identifies Tick, phase, System, object,
      script file, line, and relevant state.
- [x] 100 repeated headless/native runs preserve the expected authoritative
      hash under the documented policy.

## P19 — 2D/3D capabilities and complete AI parity

- [x] Register minimum 2D Transform, Camera, Sprite/shape, picking, gizmo, and
      Collider capabilities.
- [x] Register minimum 3D Transform, Camera, primitive Mesh, Material/color,
      light, picking, gizmo, and Collider capabilities.
- [x] Ensure capability registration supplies Schema, Inspector, runtime,
      renderer, MCP, Skill, test, migration, and build metadata.
- [x] Implement Codex login/logout/recovery inside the right Copilot panel.
- [x] Implement conversation list, transcript, streaming activity, retry, and
      interrupt.
- [x] Implement composer text, attachments, context chips, model, reasoning,
      Ask/Plan/Agent/Goal, permissions, send, and stop.
- [x] Implement Goal creation/attachment/progress and Plan visibility/control.
- [x] Implement Agent, model, approval, budget, context, MCP, Skill, provider,
      and credential-reference settings.
- [x] Generate or expose semantic AI tools from the same capability and command
      registries used by Studio.
- [x] Prove interrupted Agent and ChangeSet recovery without project corruption.

### P19 exit gate

- [ ] Human and Codex complete the same 2D and 3D authoring task without UI
      automation or direct internal-file guessing.
- [x] Durable project output and tests are semantically equivalent.
- [x] No delivered Studio command lacks query, MCP, Skill, diagnostics, test,
      undo/rollback, and audit coverage.

## P20 — Independent validation and Alpha release

- [x] Build 2D Pong from Empty 2D without changing engine source.
- [x] Build 3D Collect Room from Empty 3D without changing engine source.
- [x] Migrate Tank Arena into a normal example/extension project and run its
      regression suite.
- [ ] Run the canonical unassisted human journey on a clean Studio install.
- [ ] Close every blocking usability gap and rerun from a new clean profile.
- [x] Run deterministic, replay, performance, crash, migration, security,
      credential-leak, and build-exclusion gates.
- [x] Export standalone Windows player packages for all three examples.
- [x] Verify the player packages without Studio, Codex, Node.js, Rust, source,
      tests, credentials, or engine checkout.
- [x] Publish user guide, script API, Engine MCP/Skill guide, extension guide,
      migration guide, test evidence, and remaining limitations.
- [x] Package AI Game Studio 0.2.0 Alpha and verify clean installation/update/
      uninstall behavior.
- [x] Launch bundled Codex directly as a hidden native Windows child and verify
      that opening a project creates no visible console window.

### P20 exit gate

- [ ] A new developer completes the entire canonical journey without coaching.
- [ ] Both a 2D and a 3D project are authored, debugged, AI-modified, tested, and
      exported only through installed Studio.
- [x] Tank Arena passes as regression evidence and appears only under Examples.
- [ ] The release gap ledger has no blocking item.

## Per-feature AI parity checklist

Apply this checklist to every new or migrated authoring capability:

- [x] Human UI action exists and is discoverable.
- [x] File representation is documented and versioned.
- [x] Read/query API returns stable IDs and machine-readable state.
- [x] Semantic command uses typed input and structured diagnostics.
- [x] Engine MCP exposes discovery, query, and action tools.
- [x] Project/engine Skill teaches Codex correct use and limits.
- [x] Mutation produces a previewable ChangeSet and audit record.
- [x] Headless automated test covers success and failure.
- [x] Undo and exact rollback preserve newer unrelated work.
- [x] Permission, secret, cost, and destructive-action policy is explicit.

## Canonical human observation record

For each clean-profile test, record:

- Tester and build identity.
- Task start/end time and completion result.
- Every question asked and every term that required explanation.
- Every wrong turn, hidden control, disabled action, and misleading success state.
- Every use of terminal, external IDE, engine checkout, or manual file workaround.
- Every AI tool unavailable to the human UI or human action unavailable to AI.
- Crash, recovery, data loss, nondeterminism, and performance evidence.
- Blocking, major, and minor gaps with owner and retest status.

The dashboard reports only checked items backed by this repository and these
records. It must never infer product completion from implementation tests alone.
