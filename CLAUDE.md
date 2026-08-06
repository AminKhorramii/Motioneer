# Working on Wall

Wall makes a wall of complete landing pages to compare, choose from, and hand back to your
agent as a spec. Read `docs/flows.md` for every path through the app and the code that
carries it, and `docs/architecture.md` for the module map.

## Where things live

- The page model is `src/sections.ts`: a section argues a role and wears a form.
- Rendering is `src/render.ts`, dressing and worlds machinery `src/worlds.ts`, the model
  path `src/compose.ts`, briefs `src/brief.ts`, the slop detector `src/slop.ts`.
- Everything opinionated is data in `src/design/`, one file per kind of knowledge: faces,
  presets, worlds, angles, craft rules, the slop catalogue, the direction library, the
  system prompts. Tune taste there without touching machinery.

## House rules

- Copy: no all caps, no em dashes, no decorative symbols, and every instruction states its
  reason. The suite asserts this against the onboarding card.
- Code: keep logic in the file that owns the data it reads, keep every file far from 1k
  lines, and prefer deleting complexity to rearranging it.
- The house obeys its own detector: `verify/app.mjs` renders every built-in world on every look
  and fails if Wall's own output trips the slop catalogue.

## Before pushing

Run `npm run build && node verify/app.mjs` at minimum; run `verify:stream` when the model path
or renderer changed, and `verify:oneline` when the handoff format changed. Commit straight
to master with a one-line sentence subject that says why, not what. No pull requests.

## More than one session at once

This repo is often worked on by two agent sessions at the same time, and mixed commits have
happened. Before editing, run `git status` and treat files you did not change as another
session's work in progress: never commit them, never revert them. If your change overlaps a
file that is already dirty, work in a git worktree from clean master and push from there,
or wait for the other session to land. Never run a commit command that sweeps the whole
tree; add files by name.
