# Round 03 gap ledger

- Baseline: P13 technical prototype at `42a6a0a`
- Rule: blocker closure requires a clean-profile retest, not an implementation
  claim.

| ID         | Gap                                                                  | Severity | Owner phase | Status                                | Closure evidence                                                                                |
| ---------- | -------------------------------------------------------------------- | -------- | ----------- | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| R3-GAP-001 | No onboarding or legible start journey                               | blocker  | P15         | awaiting human validation             | Project Manager, Overview, in-Studio Help; clean-profile recording pending                      |
| R3-GAP-002 | Central Workbench is a Tank/Tile test surface                        | blocker  | P17         | machine closed; human retest pending  | Generic Scene/object/Component/Prefab/resource UI and P17 TypeScript production scan pass       |
| R3-GAP-003 | Visible regions lack clear purpose/help                              | blocker  | P15         | awaiting human validation             | In-Studio workspace guide and `STUDIO_USER_GUIDE.md`; first-time task pending                   |
| R3-GAP-004 | Multi-Scene create/switch/lifecycle absent                           | blocker  | P17         | machine closed; human retest pending  | Nested two-Scene lifecycle, startup guard, undo/redo, and reopen pass `check:p17:authoring`     |
| R3-GAP-005 | Default creation and runtime assume fixed 2D/Tank                    | blocker  | P15/P17/P19 | machine closed; human retest pending  | Neutral Empty/2D/3D presets and generic TypeScript runtime gates pass                           |
| R3-GAP-006 | Concepts are jargon without discoverable operations                  | major    | P15/P17     | partially closed                      | Action-labeled Scene tree, schema Inspector, workspace help; first-time observation pending     |
| R3-GAP-007 | Project lifecycle, Systems, Commands, and Events absent              | blocker  | P18         | machine gate closed; human retest due | `check:p18:runtime`; Game Runtime, Problems, Profiler, Timeline, Engine MCP                     |
| R3-GAP-008 | Textarea is not a project source editor                              | blocker  | P16         | awaiting human validation             | Offline Monaco, project language service, Diff and P16 gate pass; human repair task pending     |
| R3-GAP-009 | Existing acceptance overstates product readiness                     | blocker  | P14/P20     | mitigated                             | Round 03 user-journey gates; final retest pending                                               |
| R3-GAP-010 | Copilot login is unreachable after Workbench opens                   | blocker  | P19         | machine closed; human retest pending  | Right dock exposes login/logout, project conversations, recovery, Goal/Plan and approvals       |
| R3-GAP-011 | No 3D authoring/runtime capability                                   | blocker  | P19         | machine closed; human retest pending  | 3D Transform/Camera/Mesh/Material/Light/Collider parity plus independent Collect Room package   |
| R3-GAP-012 | Human operations lack complete AI parity inventory                   | blocker  | P15-P19     | P19 capability path closed            | Shared command/capability registry, MCP discovery, ChangeSet parity and rollback gate           |
| R3-GAP-013 | TypeScript host has only a spike, not production lifecycle/debugging | blocker  | P18         | machine closed; human retest pending  | P18 lifecycle/schedule/debug/replay/hash gate and source diagnostics                            |
| R3-GAP-014 | Standalone package inherits demo-specific build assumptions          | major    | P20         | machine closed                        | Generic player/build manifest, production vocabulary scan, and three independent package checks |

All implementation blockers have a passing machine closure path. GAP-001,
GAP-003, GAP-006, and the human-retest portions of other entries remain release
blockers until a new developer completes the unassisted acceptance protocol.
