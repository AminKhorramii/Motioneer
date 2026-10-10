# Working on Motioneer

Motioneer makes motion for a person's own product, and is mostly driven by agents. It turns a
running site into a film, writes CSS motion for components somebody already has, and changes a
film into new takes. A person can also open the studio to pick elements and compare motions by
hand, and edit any film in the editor. It used to also make walls of landing pages; that half was
removed, and anything in git history about sections, worlds, composing or slop belongs to it rather
than to this. `docs/architecture.md` is the module map; `docs/flows.md` covers the studio itself.

## What an agent sees, and why it is small

Claude Code shows an MCP server's connect-time card only up to 2,048 characters, and when a reply
carries structuredContent it gives the model that JSON and the images and drops the prose. So:
- The card in `mcp/tools.mjs` stays under 1,900 characters (the suite checks), and every tool
  description stands on its own within 900.
- Every reply goes through `answer()` in `mcp/reply.mjs`. It puts `summary` and `next` inside
  the structured copy, and puts the ids another call needs in the text.
- The eight listed tools are film, change, look, motion, projects, studio, open and doctor. The
  older names (reel, revise, refine, rescore, review, inspect) still answer, but are not listed.
- Long guidance lives in `plugin/skills/motioneer/SKILL.md`. The Claude Code plugin in `plugin/`
  carries it as a skill, and `setup --claude` installs the same file. The repo root's
  `.claude-plugin/marketplace.json` publishes the plugin; check both with
  `claude plugin validate --strict`.
- A change to the card or a description is measured with `node verify/routing.mjs --runs 3`
  (needs the claude command, spends model calls). It asks a real model what it would call for 38
  requests. Keep the number up, and put it in the commit message.
- A new listed field costs routing even when no description changes, because the model reads the
  schema as what a tool needs. `url` and `check` on motion and `refresh` on film each took one
  request from 6 of 6 to about 3 of 6. They answer unlisted, and the skill teaches them. Measure
  one intent with `--only <n> --runs 6` before and after a schema change.

## The house style

Assembled: nothing fades in; the real interface is built part by part, on time. The numbers, the
sound each verb makes and the guides are data in `src/design/assembled.ts`. The deck of verbs (print,
flap, register, draw, type, stamp, scan, wind) is in `src/design/motion.ts`, and `/generate` deals
one per option. `assembled()` in `src/written.ts` reports how far a sheet is from the style, and
`assembledReport()` in `tools/editor/autofilm.mjs` does the same for a cut. Both are advisory until
real output calibrates them. See `docs/assembled.md`.

Capture films are art directed: `src/design/looks.ts` holds two looks, Plate (the interface printed on
stock with printer's marks) and Editorial (a page of type beside a cropped passage), and the first
cut composes shots in a mix of them. The runtime in `src/editor/composition.ts` draws them; it is
serialized into every film, so it takes the looks as data and can close over nothing.

## Where things live

- `mcp/` is the agent side. The protocol is in `index.mjs`, the card and schemas in `tools.mjs`,
  the envelope in `reply.mjs`, and `studio-process.mjs` decides which studio a call talks to. A
  studio belongs to a workspace: it writes `.studio/studio.json` and answers `/__motioneer/health`,
  and is reused only when both match.
- The studio is `tools/studio.mjs`: the proxy, the picker, the routes and the model calls. Nothing
  else imports from it.
- The page it serves is `shared/page.mjs`. It is one template literal, so **watch the
  backslashes**: a regex written there loses its escapes before a browser sees it. A startup guard
  refuses to run when it finds one.
- `tools/editor/` is the film pipeline:
  - `autofilm.mjs`: capture films, revise, recipes and the cut's style report
  - `kinetic.mjs` and `native-reel.mjs`: authored reels
  - `proof.mjs`: measurements from frames
  - `refinement.mjs`: takes, scoped refinement and model-free retiming
  - `projects.mjs`: the store and forks
  - `live-film.mjs`: the live HTML film
  - `motion-system.mjs`: a product's own motion read off its page, turned into tokens and an audit
- `tools/lint.mjs` is `npx motioneer lint`, and `tools/film-cli.mjs` holds the terminal's `film`,
  `refresh` and `films`. Both drive the same code as the MCP server.
- Everything opinionated is data in `src/design/`, one file per kind of knowledge. Tune taste there
  without touching machinery.
- What judges model-written css lives in `src/written.ts` beside the other gates, never in the
  studio page. A second copy of a measurement is how `3.2s` came to be read as `2s`.
- Nothing in `shared/` imports a node builtin at module scope except `cli.mjs` and `codex.mjs`,
  which load only when their provider is chosen.

## House rules

- Copy: no all caps, no em dashes, no decorative symbols, and every instruction states its
  reason.
- Code: keep logic in the file that owns the data it reads, keep every file far from 1k lines, and
  prefer deleting complexity to rearranging it.
- Gates are calibrated against real output before they are enforced, never against an imagined
  distribution. The Assembled report and the frame holds are reported, not enforced, for that reason.
- A failure reads "Cannot … Next: …", through `cannot()` in `mcp/reply.mjs`.

## Before pushing

Run `npm run verify:all`, `npm run verify:editor` and `node verify/film.mjs`. When the studio
changed, also run `npm run verify:studio` and `npm run verify:capture`; both need the network and
are worth the minutes, because every proxy bug so far was invisible to a fixture.

Drive the real thing for anything a person or an agent touches. For agents, run a separate
`claude -p --strict-mcp-config` session against a page served locally (see `.context` drives from
earlier sessions), and read what the agent actually received. Three faults in one sitting came from
reading a `let` before its line ran, and none were visible to `node --check`.

Ports: the person's own studio may be on 4321, so never kill or reuse it. Suites use 4390 to 4399;
use 4340 and up for anything else. Commit straight to master with a one-line sentence subject that
says why, not what. No pull requests.

## More than one session at once

This repo is often worked on by two agent sessions at the same time, and mixed commits have
happened. Before editing, run `git status` and treat files you did not change as another session's
work in progress: never commit them, never revert them. If your change overlaps a file that is
already dirty, work in a git worktree from clean master and push from there, or wait for the other
session to land. Never run a commit command that sweeps the whole tree; add files by name.
