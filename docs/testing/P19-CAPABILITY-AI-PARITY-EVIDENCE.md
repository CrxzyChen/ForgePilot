# P19 capability and AI parity evidence

## Automated gate

Run:

```powershell
npm run check:p19:capabilities
```

The gate creates independent Empty 2D and Empty 3D projects. For each space it authors the same Scene twice: once through direct Studio semantic commands (the human UI path) and once through an Engine MCP-compatible ChangeSet (the Codex path). Stable object IDs, normalized Component output, Transform values, cameras, render Components, colliders, materials, lights, picking, and Gizmo results must be semantically identical.

The gate also verifies:

- every enabled capability exposes Schema, Inspector, runtime, renderer, MCP, Skill, test, migration, picking/Gizmo, and build metadata;
- Engine MCP returns the same capability and command registry used by Studio;
- a proposed ChangeSet survives service reconstruction before approval;
- approved Diff bytes apply exactly and roll back to the original project fingerprint;
- a simulated process interruption at the prepared transaction phase restores the previous Scene bytes on reopen;
- the embedded Codex control plane contains project conversation list/read, transcript activity, retry, interrupt, reasoning, approvals, and durable Goal protocol support.

## Result

The current machine gate passes for 2D and 3D semantic parity, durable conversation/Goal/Plan plumbing, approval recovery, prepared-transaction recovery, and exact rollback. This is implementation evidence, not a substitute for the clean-profile unassisted human observation required by P20.

## Electron visual interaction check

The built Electron renderer was opened against a generated Empty 3D project with two ordinary objects. Through the rendered DOM, the check opened `main.game.json`, selected `QA Cube`, switched to Move Gizmo, invoked `+X`, verified the durable Scene position changed from `x: 0` to `x: 1`, switched Inspector to Copilot, and opened Copilot settings. Captures are retained under `artifacts/qa/p19-studio-cdp.png`, `p19-studio-copilot.png`, and `p19-studio-copilot-settings.png` for local review.

This confirms the controls are visible and wired in the actual frameless Electron layout. It does not count as the independent, uncoached P20 tester journey.
