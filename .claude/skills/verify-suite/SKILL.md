---
name: verify-suite
description: How Motioneer proves itself, and how to add a check without adding a suite. Use when writing or changing a verification script, when a bug needs a regression check, when deciding which suite owns a path, or when choosing what to run before pushing.
---

# Verifying

Motioneer has no unit test framework and does not want one. Every suite drives the real thing: the
MCP server over stdio, a studio on its own port, a real browser and real renders. What is proved
against a harness is proved for the harness.

## What runs, and what it proves

`npm run verify:all` builds, then runs these. None needs the network beyond DNS, but several need
the cached renderer (`npx motioneer setup`).

```
verify/security.mjs          loopback binding, Host and Origin checks, private model settings
verify/launch.mjs            the motioneer command: doctor, setup merging and upgrades, the skill install
verify/claude-desktop.mjs    Desktop setup into a temporary home
verify/cli.mjs, model.mjs, codex.mjs   the providers: the claude command, the wire formats, codex
verify/guard.mjs             what the proxy may fetch
verify/studio-capture.mjs --rail   the rail and the editor timeline, offline
verify/mp4.mjs               the container, parsed back byte for byte
verify/website-media.mjs, layer-capture.mjs, native-reel.mjs, source-choreography.mjs   reel capture
verify/agentic-film.mjs      takes and forks, reviews and repairs, the deck, the house style report, retiming
verify/product-motion.mjs, rescore.mjs   product scenes and music-only takes
verify/mcp.mjs               the agent contract: the card's budget, the eight tools, envelopes,
                             refusals, studio ownership, projects, the queue and cancellation
```

Also run these before pushing anything that touches their path:
- `npm run verify:editor`: the React editor and film editing.
- `node verify/film.mjs`: url to MP4 through autofilm, against a fake site and a fake model.

These need the network or model calls, so they run by hand:
- `npm run verify:studio` and `npm run verify:capture`: real sites through the proxy and the picker.
- `node verify/routing.mjs --runs 3`: whether a real model picks the right tool for 38 requests,
  through the real card and tool list. Run it before and after any change to `mcp/tools.mjs`, and
  put both numbers in the commit message.
- `npm run verify:package`: the packed npm tarball, end to end.

## Ports

Suites use 4390 to 4399 and kill only what they started. The person's own studio may be on 4321:
never kill or reuse it. Use 4340 and up for drives and labs.

## Drive it for real

A fixture cannot show what an agent receives. After changing anything an agent touches, run a
separate `claude -p --strict-mcp-config --mcp-config <file>` session. Point it at a page served
locally, with its own `MOTIONEER_WORKSPACE` and a 43xx `MOTIONEER_PORT`, and read the stream-json
it writes:
- which tool it called
- what the result carried, structured copy and images
- what it told the person

## Extend a suite before adding one

A new suite is warranted when the way in differs: a different process, transport or client. It is
not warranted because the feature is new. Ask which suite already opens the path your change
touches, and add the assertion there:
- the agent contract goes in `mcp.mjs`
- takes and the house style go in `agentic-film.mjs`
- the capture pipeline goes in `film.mjs`

If no suite opens the path, that is the finding.

## What a good check looks like

- **State the reason.** Write the check's text as the reason, `ok('a cancelled call sends no
  reply', ...)`. A check whose reason is unrecorded gets deleted the first time it fails.
- **Assert what a person or an agent would notice,** not the implementation that currently
  produces it.
- **Fail fast and loudly.** Every wait carries a deadline and says what it wanted.
- **Assert the negative where it is cheap:** a cancelled call sends nothing, and a key never
  appears in what is printed.
