# MVP performance budgets

Baseline machine: Windows 11, NVIDIA GeForce RTX 3060 Laptop GPU, Node.js
24.11.1, Rust 1.91.1. These are regression budgets rather than hardware minimums.

| Path                               |                      Baseline |         P7 budget |
| ---------------------------------- | ----------------------------: | ----------------: |
| Native Vulkan frame, 3-frame smoke |            1.4–1.9 ms average |           < 50 ms |
| Headless Frontier balance batch    |         1,000 runs in 80.6 ms | 1,000 runs < 10 s |
| Deterministic campaign result      |            victory at Tick 14 |   exactly Tick 14 |
| Studio production build            | measured by `package:windows` |           < 5 min |

`npm run check:p3` enforces the GPU budget and snapshot equivalence.
`npm run check:p7` uses the packaged release CLI for the headless budget and
verifies the release manifest, runtime smoke, Studio route, and control bridge.
