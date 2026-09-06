# AI control protocol 1.0

> Historical P0-P13 control plane. Round 03 uses the project Engine MCP and
> shared semantic command registry documented in `ENGINE_MCP_AND_SKILLS.md`.

The control process uses newline-delimited JSON request/response objects over
stdio. The loopback Studio bridge exposes the same envelope at `POST /rpc`.

```json
{
  "id": 1,
  "method": "project.query",
  "params": { "projectPath": "examples/frontier.game.json", "pointer": "/name" }
}
```

A success returns `{"id":1,"result":...}`. A failure returns an error with a
stable `code`, readable `message`, and optional structured `data`.

| Method                | Required parameters               | Mutates    | Purpose                                          |
| --------------------- | --------------------------------- | ---------- | ------------------------------------------------ |
| `schema.describe`     | optional `definition`             | No         | Read all Game IR schema or one definition.       |
| `project.query`       | `projectPath`, optional `pointer` | No         | Read a project or JSON pointer.                  |
| `world.query`         | `projectPath`, `worldId`          | No         | Read one world by stable ID.                     |
| `change.plan`         | path, summary, operations         | No         | Build and validate a previewable ChangeSet.      |
| `change.validate`     | `changeId`                        | No         | Recheck candidate and base hash.                 |
| `change.approve`      | `changeId`                        | Grant only | Issue a one-use human approval token.            |
| `change.apply`        | `changeId`, `approvalToken`       | Yes        | Atomically write the validated candidate.        |
| `change.rollback`     | `changeId`                        | Yes        | Restore exact prior bytes if no conflict exists. |
| `simulation.run`      | project and input paths           | No         | Return snapshot, events, and trace.              |
| `simulation.snapshot` | project and input paths           | No         | Return only the canonical snapshot.              |
| `simulation.compare`  | paths and expected hash           | No         | Verify replay equality.                          |
| `failure.explain`     | `failure`                         | No         | Convert diagnostics into repair context.         |
| `audit.list`          | none                              | No         | Read the current session audit stream.           |

`change.plan` operations are `add`, `replace`, or `remove` with an RFC 6901 JSON
pointer and, where needed, a JSON `value`. Project writes are restricted to
`.game.json` paths inside the selected workspace. Planning never writes files;
approval cannot bypass validation; grants are deleted after use.
