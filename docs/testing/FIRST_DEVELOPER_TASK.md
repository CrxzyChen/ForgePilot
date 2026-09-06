# First developer task

This is the invitation and feedback sheet for the first external MVP session.
Target time is 30 minutes from extracted package to verified change.

## Task

1. Start the game and identify the player, one neutral unit, the armory, factory,
   and capital.
2. Finish one campaign using movement keys and Space.
3. Start Studio and ask it to increase factory output from 2 to 3.
4. Inspect every proposed operation. Reject once, then approve and apply.
5. Run the replay test, inspect the final outcome and state hash, then rollback.
6. Add a granary through a second request without editing Rust.

## Pass criteria

- No mouse-driven scene editing or source-code knowledge is required.
- No project bytes change before explicit approval.
- The modified campaign still reaches `won`; rollback restores exact bytes.
- The developer can find the failing field, Tick, system, and entity when given
  an invalid change.

The automated rehearsal in `scripts/check-p7.ts` performs this workflow from a
fresh temporary workspace using only the packaged executable and control files.
Human testers should record elapsed minutes, the first confusing step, failed
commands, whether the diff was understandable, and one desired improvement.
