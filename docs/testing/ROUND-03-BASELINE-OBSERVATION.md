# Round 03 baseline usability observation

- Build: P13 technical prototype, baseline commit `42a6a0a`
- Date: 2026-09-03
- Participant: product owner
- Method: owner independently opened the installed Studio and reported the
  questions verbatim in the product task thread; no completion was inferred.
- Result: Failed with blockers

## Observed task transcript and findings

| Observation                                                    | Evidence from participant                                                     | Severity | Gap        |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------- | ---------- |
| Product purpose is unclear                                     | “没看懂，这是什么”; “我打开studio了，但我没看到怎么用”                        | blocker  | R3-GAP-001 |
| It appears to be a map/Tank editor, not a game IDE             | “为啥进去后是个地图编辑器的东西”                                              | blocker  | R3-GAP-002 |
| Regions do not communicate their jobs                          | “我没看懂各个区域要做什么”                                                    | blocker  | R3-GAP-003 |
| Scene creation and switching are absent                        | “怎么添加，切换场景？”                                                        | blocker  | R3-GAP-004 |
| Product boundary looks 2D/Tank-specific                        | “现在这是tank游戏的专门开发IDE还是2D游戏，还是通用游戏面板”                   | blocker  | R3-GAP-005 |
| Engine concepts are exposed without an authoring model         | Questions about Entity, Component, Transform, Scene, Resource, System, Camera | major    | R3-GAP-006 |
| Per-frame behavior and Events cannot be authored or understood | “不知道现在你是怎么出来事件，比如对象每一帧做什么，怎么处理事件”              | blocker  | R3-GAP-007 |
| There is no credible in-Studio source editor                   | “这个studio就想要一个文件编辑器也要”                                          | blocker  | R3-GAP-008 |
| The missing surface is broader than the prompted issues        | “所以缺的不是一心半点，问题也只是我提出这些”                                  | blocker  | R3-GAP-009 |

The participant did not complete the canonical task and could not reasonably be
asked to continue. This is valid baseline failure evidence, not P20 acceptance.
P20 requires a new clean-profile recording by a previously unassisted developer.
