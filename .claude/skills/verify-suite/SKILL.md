---
name: verify-suite
description: How Wall proves itself, and how to add a check without adding a suite. Use when writing or changing a verification script, when a bug needs a regression check, when deciding which suite owns a path, or when choosing what to run before pushing.
---

# Verifying

Wall has no unit test framework and does not want one. Every suite drives the built app the way
a visitor drives it, because what is proved against a harness is proved for the harness.

## One way in

Every suite opens the app through `harness.mjs`: a static server over the built `dist`, and a
real browser. Suites used to launch the shell themselves, which meant six copies of a launcher
and a hard dependency on the one shell that could be driven.

Use `serveDist()` and `openApp()`. Use the shared `MOCK` and `useMock()` rather than writing a
second mock, because a mock that drifts between suites makes them disagree about what the app
does, and the disagreement surfaces as a flake rather than as a failure.

`openApp()` collects page errors and console errors for the whole session and hands them back as
`errors`. Assert that array is empty at the end of every suite, because a suite that passes
every assertion while the console fills with exceptions has not proved much.

## The ladder, in order of how much each proves

```
verify/app.mjs      the app, mock model, plus the house gate
verify/stream.mjs   the real streaming path, no mock anywhere
verify/hard.mjs     an overgrown page, copy written to break the parser
verify/beat.mjs     the heartbeat, so a long wait is not read as a hang
verify/image.mjs    the image pipeline
verify/mcp.mjs      the agent path end to end against the real MCP server
verify/server.mjs   the self hosted server, key never reaches the visitor
verify/tauri.mjs    the desktop shell, checked without a window
verify/oneline.mjs  the handoff format, including its format number
verify/update.mjs   the update channel: publishable, complete tarball, no stranded cache
```

The npm script names are unchanged and remain the way to run these: `npm run verify`,
`verify:stream`, `verify:hard`, and so on, with `verify:all` running every one.

`verify/app.mjs` runs the house gate first: every built in world on every preset look, rendered and
failed if Wall's own output trips the slop catalogue. The house obeys its own detector, because
a detector its author exempts himself from is decoration.

## Extend a suite before adding one

A new suite is warranted when the shell or the transport differs, because that is a genuinely
different way in. It is not warranted because the feature is new. Ten suites that each open the
app cost ten browser launches, and the tenth rarely proves something the first could not have
asserted in four lines.

Ask which suite already opens the path your change touches, and add the assertion there. If no
suite opens it, that is the finding: the path had no coverage, and the fix is usually one more
step in the suite that owns the nearest path.

## What a good check looks like

- State the reason in a comment above it. A check whose reason is unrecorded gets deleted the
  first time it fails, because nobody can tell a regression from an outdated expectation.
- Assert the thing the user would notice, not the implementation that currently produces it.
  Assert that eight angles produce eight distinct headlines, rather than that a particular
  function was called.
- Fail fast and loudly. A suite that waits without saying what it is waiting for is
  indistinguishable from a hang, so every wait carries a deadline and prints what it wanted.
- Assert the negative where it is cheap: the wall never exceeds nine, the console has no errors,
  the key never appears in what the server sends.

## Fixtures

`fixtures/` holds recorded upstream streams, response bodies only. They are replayed at their
recorded pace, because a replay that dumps everything at once would prove nothing about whether
papers visibly fill in.

Re-record with `WALL_KEY=$(cat ~/.wall-test-key) npm run capture`, which drives the real app
against the real API through a recording proxy. With no fixtures present the fake upstream falls
back to a synthetic stream, so the suite still runs on a fresh clone and a missing fixture never
reads as a broken repository.

Section ids are rewritten on replay to match the incoming request, because the app merges
replies by id.

## What to run before pushing

```
npm run build && node verify/app.mjs   always, this is the floor
npm run verify:stream                when the model path or the renderer changed
npm run verify:oneline               when the handoff format changed
npm run verify:all                   when you are unsure, or before a publish
```

Report what actually ran. A change described as verified when only the floor ran is a claim the
next person will trust and should not.
