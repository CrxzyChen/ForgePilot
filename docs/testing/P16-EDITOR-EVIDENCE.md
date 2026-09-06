# P16 source editor evidence

- Gate: `npm run check:p16:editor`
- Result: passed on 2026-09-03

The gate creates an Empty 2D project, verifies generated Game SDK types, adds
TypeScript/WGSL/Markdown files, injects JSON and WGSL syntax failures, and
asserts exact project-relative diagnostic locations. It verifies content
search, transactional replace, undo, redo, stale-base conflict rejection,
Git Diff, Engine MCP parity, offline Monaco workers, and the scoped CSP needed
for correct line layout.

Developer visual QA opened `scripts/behaviors/player.ts` in the built Electron
application. The first run exposed that the strict CSP ignored Monaco's inline
line-position styles, causing all source rows to overlap. A later JSON review
showed that the same policy also blocked Monaco's generated token-theme style
element: the minimap was colored while editor text fell back to monochrome.
The policy now permits Monaco's inline style attributes and generated style
element while keeping scripts self-only and network connections disabled. The
same files were then re-opened with distinct lines and token colors, syntax
highlighting, line numbers, minimap, zero-problem status, and visible Save/
Format controls.
Restored source tabs now reload their editor buffer after restart.

The installed Tank project exposed a second persistence defect: restored Diff
tabs retained their document URI but lost the in-memory before/after snapshots,
falling through to the unsupported-editor empty state. Diff tabs now reconstruct
Git or ChangeSet snapshots from their persisted URI, show an explicit loading or
stale-snapshot error state, and recover directly after restart. ChangeSet paths
are kept separate from their human summary, restoring TypeScript/JSON language
detection. The review surface now reports added/removed lines, labels Git as
`HEAD / 工作区` and ChangeSets as `变更前 / 变更后`, defaults to an adaptive
layout, and offers explicit side-by-side and inline controls. Long paths and
summaries ellipsize independently, unchanged regions collapse with context, and
the inherited Monaco focus outline no longer draws a bright frame around the
entire editor. The installed app was exercised with both a real Tank ChangeSet
and a Git working-tree Diff, including a process restart and both layout modes.

Diff Review 1.0 adds a compact single-row review toolbar and a dedicated dark
Monaco theme with distinct inserted/deleted line, word, gutter, overview-ruler,
and active-hunk colors. Reviewers can move by hunk with toolbar buttons or
F7/Shift+F7, open the modified file directly, and persist layout, trim-
whitespace, word-wrap, unchanged-region, and 3/5/10-line context preferences in
the project workspace state. A temporary Git repository gate exercises stage,
unstage, and tracked-file restore. Restore refuses to delete untracked files.
Codex review buttons act on the semantic ChangeSet as a whole—approve/reject,
apply, test, or rollback according to lifecycle state—so a multi-file operation
is never mislabeled as a file-only acceptance.

An independent multi-file repair journey remains part of the P20 clean-profile
human acceptance and is not claimed by this engineering record.
