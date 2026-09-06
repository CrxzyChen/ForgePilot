---
name: repair-game-failure
description: Diagnose and repair a structured validation, runtime, replay, test, or build failure.
---

# Repair a game failure

1. Reproduce the failure with the same project revision, seed, input log, and target.
2. Read `runtime.read_trace`, including Event Timeline, System trace, snapshot hashes, state watches, budgets, and structured diagnostics; inspect the smallest relevant project files.
3. Identify root cause by stable code, Tick, phase, System, object/module ID, source line, and relevant state path.
4. Propose the smallest semantic ChangeSet that fixes the cause rather than hiding the symptom.
5. Add a regression replay/test with the failing Tick hash, request approval, apply, and run both narrow and affected suites.
