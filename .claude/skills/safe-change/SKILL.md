---
name: safe-change
description: The loop for changing Wall when a second agent session may be working in the same tree. Use before editing, before staging anything, when your change overlaps a file that is already dirty, and when writing the commit.
---

# Making a change safely

This repository is often worked on by two agent sessions at once, and mixed commits have
happened. Everything here exists because of that, not as ceremony.

## Before editing

Run `git status`. Treat every file you did not change as another session's work in progress:
never commit it, never revert it, never rebase over it. You cannot tell an abandoned edit from a
half finished feature by looking, so the safe reading is always that it is in progress.

Note the dirty list before you start. That is your record of what was not yours, and it is worth
more than memory once a few tool calls have gone by.

## When your change overlaps a dirty file

Work in a worktree from clean master and push from there, or wait for the other session to land.
Editing a file another session is mid way through means whichever of you commits second commits
both changes, and the diff will not show which line belonged to whom.

```
git worktree add ../wall-<topic> master
cd ../wall-<topic>
npm install
```

Build and verify inside the worktree, because a suite run in the dirty tree proves nothing about
the change you are about to push. Remove it when you are done: `git worktree remove ../wall-<topic>`.

## Staging

Add files by name. Never run a command that sweeps the tree, which means no `git add .`, no
`git add -A`, and no `git commit -a`, because each of those will pick up the other session's
files and there is no way to notice from the command's own output.

```
git add src/render.ts src/design/craft.ts
git status                      # confirm nothing else is staged
git commit -m "..."
```

Read the staged list before committing. That check takes a second and is the only thing standing
between a clean history and a mixed commit.

## The gates

```
npm run build && node verify/app.mjs
```

is the floor for every change. Add `verify:stream` when the model path or the renderer changed,
and `verify:oneline` when the handoff format changed, because those are the paths the floor does
not open.

If a suite fails, say so with its output. A failure reported as a pass costs more than the bug,
because it spends the trust that makes the next report worth reading.

## The commit message

One line, a sentence, saying why rather than what. The diff already says what. Recent history is
the model to follow:

```
The views hold still so the wall feels fast
Fifty directions, and the practices written down
A minute of silence is indistinguishable from a hang, so it beats
```

No prefixes, no ticket numbers, no conventional commit tags, because the subject line is the
only place the reason survives and a prefix spends its first ten characters saying nothing.

Commit straight to master. No pull requests.

## After

Leave the tree as you found it, minus your change. Delete temporary scripts you wrote, or the
next session will treat them as work in progress and route around them for weeks.
