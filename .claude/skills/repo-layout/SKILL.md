---
name: repo-layout
description: Decide where a new file belongs in Motioneer and keep the repository root readable. Use before creating any file outside src/, when about to add a root level script, when a suite or tool needs a home, or when asked to tidy or reorganize the tree.
---

# Where a file goes

The root is the first thing anyone reads. It should answer "what is this project and how do I
start it" in one screen, because a root that scrolls forces a newcomer to open files at random
to find the entry point.

## The rule

The root holds configuration, licences, readmes, and nothing that runs. Everything that runs
lives in a directory named for what it is. A file earns a place in the root only if a tool
requires it there, which is true of `package.json`, `tsconfig*.json`, `vite.config.ts`,
`index.html`, and the markdown files a reader expects to find first.

## Where each kind of thing belongs

| What you are writing | Where it goes | Why |
| --- | --- | --- |
| App or core logic | `src/` | it is the app |
| An opinion, a catalogue, a preset, a prompt | `src/design/`, one file per kind of knowledge | taste is tuned without touching machinery |
| A verification suite | `verify/` | suites are one family and are read as a set |
| Shared suite machinery, mocks, fake upstreams | `verify/` beside the suites | a mock that drifts between suites makes them disagree about what the app does |
| A developer tool you run by hand | `tools/` | a tool is not a test and should not be read as one |
| A build step that writes a committed artefact | `tools/` | it runs at author time, not at run time |
| Recorded upstream traffic | `fixtures/` | already the convention here |
| The desktop shell | `src-tauri/` | already the convention here |
| Anything genuinely temporary | delete it before you commit, or name it and gitignore it | an unexplained root file is indistinguishable from an abandoned one |

## Where the runnable files live

The root once carried seventeen `.mjs` files: three different kinds of thing wearing the same
coat, which is why it read as sprawl even though each file was sound. They now sit in two
directories named for what they are.

```
verify/          harness.mjs, fake-upstream.mjs, and the suites: app, stream, hard,
                 beat, image, mcp, server, tauri, oneline, update
tools/           try.mjs, capture.mjs, shots.mjs, fonts.mjs, wasm.mjs
```

The npm script names did not change, because they are the public interface of the repository
and there was no reason to spend anyone's muscle memory on this. `npm run verify` still runs
the app suite, now at `verify/app.mjs`.

Nothing else about the tree needs to change. `src/`, `src/design/`, `shared/`, `mcp/`,
`server/`, `crates/` and `fixtures/` already hold one idea each.

## Moving a file without breaking the build

A move is five edits, and skipping any one of them fails quietly rather than loudly, so do all
five in the same change:

1. `git mv` the file, so history follows it and the diff reads as a move.
2. Fix its own relative imports. A suite at `verify/x.mjs` reaches `mcp/index.mjs` as
   `../mcp/index.mjs`, and anything that computes a path from `process.cwd()` still resolves
   against the directory npm was run in, not the file, so those lines usually stay as they are.
   Check each one rather than assuming.
3. Update every `scripts` entry in `package.json` that names the old path, because those paths
   are the public interface of the repository and a stale one fails only when someone runs it.
4. Update the map in `docs/architecture.md`, because a
   map that lies is worse than no map.
5. Run `npm run build && node verify/app.mjs`, then run the moved suite itself. A move that is
   not exercised is a move that is not done.

Check `files` in `package.json` before moving anything that ships. `verify/` and `tools/` are
not published, so they stay out of that list.

## Naming

Name a directory for what it contains, not for the language or the tool that reads it. `verify/`
says what those files prove, where `scripts/` says only that somebody runs them, which is true
of every file in the repository.

Drop the prefix once the directory carries it: `verify/stream.mjs` rather than
`verify/verify-stream.mjs`, because the path already said it twice. The one suite with no
qualifier of its own became `verify/app.mjs`, since what it drives is the app.
