# Working on Wall

Wall is a motion studio. You point it at a running site, pick elements off it, and get several
motions for each to compare on one timeline. It used to also make walls of landing pages; that
half was removed, and anything in git history about sections, worlds, composing or slop belongs
to it rather than to this. Read `docs/flows.md` for every path through the studio and the code
that carries it, `docs/architecture.md` for the module map, and `docs/rail.md` for the plan for
multi selection.

## Where things live

- The studio is `tools/studio.mjs`: the proxy, the picker, the transport, the rail. It is one
  file because it is one room, and nothing else imports from it.
- The page it serves is `shared/page.mjs`, lifted out because a worker has no filesystem to
  read a component folder from. It is one template literal, so **watch the backslashes**: a
  regex written there loses its escapes before a browser sees it. There is a startup guard that
  reads the source and refuses to run when it finds one, because this has cost seven bugs.
- Everything opinionated is data in `src/design/`, one file per kind of knowledge. The two decks
  and what a motion is asked to be are `src/design/motion.ts`; the palettes are `presets.ts`.
  Tune taste there without touching machinery.
- What judges model written css lives in `src/written.ts` beside the other gates, never in the
  studio page: `unmoved`, `brittle`, `janky`, `unstill`, `leaks`, `scopeOf`, `tempo`, `retimed`,
  `namespaced`. A second copy of a measurement is how `3.2s` came to be read as `2s`.
- Nothing in `shared/` imports a node builtin at module scope except `cli.mjs`, which is loaded
  only when the command line provider is chosen. Keep it that way.

## House rules

- Copy: no all caps, no em dashes, no decorative symbols, and every instruction states its
  reason. The suite asserts this against the onboarding card.
- Code: keep logic in the file that owns the data it reads, keep every file far from 1k
  lines, and prefer deleting complexity to rearranging it.
- Gates are calibrated against real output before they are enforced, never against an imagined
  distribution. Measured over 23 real motions, every one already respected reduced motion, so
  requiring it costs nothing; only 70 percent landed inside the timings the prompt asks for, and
  the tail was the errands that are supposed to be slow, so those are reported and not enforced.
  A gate tuned by taste is how a field guide gets rejected for the italics its subject requires.
- The house obeys its own detector: `verify/app.mjs` renders every built-in world on every look
  and fails if Wall's own output trips the slop catalogue. Those pages wear placeholder copy on
  purpose, so the gate judges the design half, and the copy half of the defaults is asserted
  separately: each placeholder has a tell of its own and the suite fails if one stops firing,
  because a stand-in the writing call leaves alone is one that ships.

## Before pushing

Run `npm run verify:all` at minimum, which builds and runs everything that needs no network.
When the studio changed, drive it: `npm run verify:studio` for the proxy and the picker,
`npm run verify:capture` for what survives being picked. Both need the network and both are
worth the minutes, because every proxy bug so far was invisible to a fixture.

Drive the actual room for anything a person touches. Three separate faults in one sitting came
from reading a `let` before its line ran, which kills the whole page script and takes every
listener below it with it, and none of those were visible to `node --check`.

`npm run studio` watches its own sources, so editing it restarts it in about half a second and
the page puts your work back: the aim, the picks and the options all survive, because losing two
minutes of generation on every save is how you end up not changing anything. The server half is
kept in `.studio/session.json` and only read back if it was written in the last twenty seconds,
so opening the studio tomorrow is a fresh start rather than a haunting.

Kill the old studio by port before starting a new one anyway when driving it from a script. A busy
port makes it roam to 4322 and say so, which is right for a person and a trap for a script: `for p
in 4321 4322 4323; do lsof -ti tcp:$p | xargs -r kill -9; done`. Testing a stale process cost four
wrong diagnoses in one session. Commit straight
to master with a one-line sentence subject that says why, not what. No pull requests.

## More than one session at once

This repo is often worked on by two agent sessions at the same time, and mixed commits have
happened. Before editing, run `git status` and treat files you did not change as another
session's work in progress: never commit them, never revert them. If your change overlaps a
file that is already dirty, work in a git worktree from clean master and push from there,
or wait for the other session to land. Never run a commit command that sweeps the whole
tree; add files by name.
