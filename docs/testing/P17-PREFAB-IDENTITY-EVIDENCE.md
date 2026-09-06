# P17 Prefab identity repair — 2026-09-05

The supervised Tank run exposed `prefab.revert` regenerating existing
Component IDs and `prefab.apply` replacing source IDs with instance IDs.
The actual game proposal `1d8642c5-ae8e-4bd0-91dc-66f2949f939c` was rejected,
not applied. The supervisor changed only the engine and isolated test fixtures.

`check:p17:authoring` first failed on source-ID preservation, then passes with:

- source IDs preserved through apply and instance IDs through revert;
- legacy arbitrary instance IDs retained when type matching is unambiguous;
- repeated Component types retaining the same identities after array reorder;
- ambiguous legacy matching rejected without a Scene write;
- invalid explicit mapping rejected without a Scene write;
- explicit semantic-ID mapping preserving the intended repeated components;
- changed reusable defaults reaching another instance through explicit revert;
- existing hierarchy, undo/redo, resource, MCP and ChangeSet tests retained.

`check:p32:changeset` also passes. Template/example Prefab Skills validate and
document `componentIds`, value resets and explicit synchronization. This fix
does not introduce automatic live inheritance or certify the user's game.
The earlier `7234d1d3…` Studio package predates this fix. The new package is
`3f2be8db60d406d3bb1e8ca80ce7e78cfa62474f2e259a7335139fb800314ab2`.
Its clean-package and extracted-install lifecycle/UI gates pass. The packaged
MCP server hash is `696d6a63d28ecd8d46a2a73f83d7c6a4d47625af5837393f36a9f89bbc9b1c85`,
matches its manifest and contains the repair. The actual Tank project is being
resumed in this version; its own refreshed Prefab proposal is not yet accepted.

Full `npm run check` passed through P20's runtime/release checks (100 Tank
example runs: 42,291.70 ms), then failed packaging because a concurrent Site
build removed `dist/electron`. Serial `package:studio:windows` and the installed
gate pass after rebuilding Electron. This is a recovered build-output collision,
not a successful full-command exit; future Site and Studio builds must be serial.

A subsequent complete `npm run check` exits successfully with the isolated
package variant `r5-prefab-check`. Its ZIP hash is
`abd2c43654cbafb2e93652737f1830c6172d62b25f8fcd7cffaa9794ed118d61`;
the unchanged Tank performance threshold passes at 57,668.11 ms while the actual
Studio Copilot remains active. Clean packaging and installed lifecycle/UI checks
also pass. The independent output leaves the running `3f2be8db…` install intact.
