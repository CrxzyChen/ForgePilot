# ADR 0009: Studio is a supervision surface

- Status: Accepted
- Date: 2026-09-02

## Decision

Studio visualizes the same structured objects used by automation: Game IR
entities, Codex stream activity, ChangeSet operations, approval state, fixed
Ticks, snapshots, tests, logs, and frame metrics. It does not introduce a
second editable scene format or a hidden source of runtime truth.

The browser supports an offline demonstration reducer so the complete human
workflow can be reviewed on the deployed project site without filesystem
access. During local development it discovers a loopback-only HTTP bridge at
`127.0.0.1:4617`. That bridge delegates to the P4 control service and lazily
connects to Codex App Server only for a natural-language planning request.

Browser-to-bridge requests use the same request/response envelope as the stdio
control protocol. The bridge binds only to loopback, accepts CORS origins only
from localhost, limits bodies to 1 MiB, and does not weaken ChangeSet approval,
workspace path, validation, or rollback rules.

## Consequences

Human developers can inspect a world, watch agent activity, select individual
diff operations, approve, apply, run, pause, step, choose a seed, compare
snapshots, inspect tests/performance, and roll back from one page. The deployed
demo cannot mutate local files; the local bridge exposes real operations while
preserving the exact P4 safety boundary.
