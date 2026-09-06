# R5 Studio conversation and asset-panel follow-up

For the newer composer-adjacent card and current startup entry, see
[Composer progress card](./R5-COMPOSER-PROGRESS-CARD.md). The package below is the
earlier UI follow-up and remains preserved as historical evidence.

Date: 2026-09-06. Scope: the owner's reported resource overflow and Copilot
conversation usability defects. This does not close independent R5 acceptance.

## Delivered behavior

- Asset generation forms, candidate audio/video controls, long paths, model
  names, and job headers fit the left dock. Long metadata wraps deliberately.
- Goal / Plan defaults to a compact disclosure summary, reset per conversation.
  Detailed status and existing stop/remove controls remain available on expansion;
  the detail area has a bounded independent scroll region.
- The active Plan is no longer duplicated in the conversation body.
- Conversations initially open at the bottom. Updates and viewport/content
  resizing follow the bottom while pinned, using a 24px near-bottom threshold.
- Scrolling up suspends following and exposes a “回到底部” button. Clicking it
  immediately returns to the newest content and resumes following.
- Prepending older history preserves the existing message's visual anchor, even
  when the active reply grows in the same update. Conversation changes reset
  following without retaining duplicate or stale progress elements.

The approved Midnight Workshop tokens, density, and existing control styles are
preserved. No original Tank project, provider configuration, approval authority,
or game resource was changed. No new paid generation was requested.

## Verification

- `npm run check:studio-ui-contract`: passed.
- Real Electron P15 checks: minimum 960px window, 150% scale, eight Plan states,
  seven dock geometries, compact and expanded disclosure, streaming, detached
  reading, jump-to-bottom, concurrent history prepend/streaming, and conversation
  switching passed.
- Native audio controls, long metadata, and a long model selector were measured
  in a 180px-wide fixture: client width and scroll width both 180px; all child
  bounds contained.
- Final full `npm run check`: exit 0, including P15–P21 applicable gates,
  deterministic examples, actual packaged startup, and installed-style lifecycle
  with user data preserved.
- Latest UI evidence: `artifacts/p32-plan-status-ui-wEsh4Y/`.
- Complete gate log: `artifacts/r5-ui-conversation-check-delivery.log`.

Earlier failures are retained in the preceding follow-up logs. The final checks
fix duplicate React sibling keys on conversation switching, wait for actual IPC
snapshot rendering instead of a guessed delay, and update P19's source inspection
to validate the newly extracted transcript component and its Workbench use.

Screenshot review: 9/10 (hierarchy 2, surface discipline 1, typography 2, state
clarity 2, rendered finish 2). Existing detailed Goal framing was preserved;
the default compact state restores the conversation's space.

## Run the fix

Close the old Studio after saving, then start:

`D:/game-creator/artifacts/studio-windows/AI-Game-Studio-0.4.0-preview.1-win-x64/AI Game Studio.exe`

ZIP: `artifacts/studio-windows/AI-Game-Studio-0.4.0-preview.1-win-x64.zip`

SHA-256: `a346eca615b0f0d747a06bca6b53e49de8cebad30b9eec32b2914756e8ca0c05`

This is the tested working-tree UI-fix preview. It does not replace the immutable
clean-source R5 candidate or its hash-pinned acceptance kit. The previously
installed owner's Studio was not overwritten or restarted automatically.
