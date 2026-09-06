# ADR 0021: capability registry and Copilot control plane

## Decision

Round 03 uses one capability registry as the discovery contract for Studio, the project Inspector, Runtime/Renderer adapter selection, Engine MCP, project Skills, tests, migrations, and builds. A capability registration is incomplete unless it supplies all of those references plus a versioned Schema ID, stable-ID picking policy, semantic Gizmo commands, and build metadata.

The 2D and 3D authoring surfaces do not mutate Scene arrays directly. Viewport and hierarchy selection resolves through `scene.object.pick`; move, rotate, and scale use `scene.transform.*`. The same commands are listed by the capability registry, executed by `StudioCommandRegistry`, proposed by Engine MCP as ChangeSets, diagnosed by the authoring service, recorded in the workspace audit, and reversed through the transaction journal.

Codex remains an embedded project control plane rather than a privileged file writer. The right Copilot dock owns ChatGPT login/logout, project-scoped conversation selection and recovery, transcript/activity streaming, model and reasoning selection, Ask/Plan/Agent/Goal modes, attachments, permissions, approvals, retry/interrupt, and durable Goal state. Engine mutations still stop at the ChangeSet review boundary.

Approved ChangeSets apply the exact bytes shown in the reviewed Diff as one crash-recoverable workspace transaction. They are not re-materialized after approval. This makes generated stable IDs, binary assets, interruption recovery, approval hashes, and exact rollback compatible.

## Consequences

- Human Gizmos and Codex tools have the same semantic operation and durable output.
- A renderer or custom Inspector can be replaced without changing project authority.
- New 2D/3D capability features must extend the shared registration contract and parity test.
- Project conversations and Goals recover independently from source control; credentials remain in the system vault.
- A ChangeSet approval covers immutable file bytes, while command intent remains visible in the proposal and audit.
