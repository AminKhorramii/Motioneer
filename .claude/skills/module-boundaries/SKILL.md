---
name: module-boundaries
description: Decide which file owns a piece of logic in Motioneer, keep files small, and know which boundaries are load bearing. Use when adding a feature, when logic could plausibly live in two files, when a file grows past a few hundred lines, or when reviewing a change for architecture rather than for bugs.
---

# Module boundaries

Motioneer has one rule that decides most questions and three boundaries that decide the rest.

## The rule: logic lives with the data it reads

If you are about to write a function, find the file that owns the data it reads and put it
there. Not the file that calls it, and not a new `utils.ts`, because a helpers file is a place
where ownership goes to be forgotten and it grows without ever being read as a whole.

Worked examples from the existing code:

- Anything that measures a model-written stylesheet belongs in `src/written.ts`, beside the gates,
  never in the studio page or the agent side, because a second copy of a measurement is how 3.2s
  came to be read as 2s. `assembled()` lives there for that reason.
- Anything that reads a cut's shots belongs in `tools/editor/autofilm.mjs` beside `shotList`:
  `paceOf`, `scenesOf`, `assembledReport`. Anything that makes a take, such as a fork, a scoped
  refinement or a retime, belongs in `tools/editor/refinement.mjs`.
- Anything that names a verb, a number, a sound, a prompt or a rule belongs in `src/design/`, one
  file per kind of knowledge, because that is the line between taste and machinery.

## Data and machinery are different files

Opinions go in `src/design/` as data. Code that acts on opinions goes in `src/` or `tools/`. The
test is whether a change to the thing is a change of mind or a change of behaviour:
- A new verb or a different timing band is a change of mind: it goes in `src/design/motion.ts` or
  `assembled.ts`.
- A new way of measuring a sheet against them is a change of behaviour: it goes in `src/written.ts`.

## The boundaries that are load bearing

Crossing these is not a style question, it costs a fork.

**`src/core.ts`** is what node can run of the TypeScript side: the decks, the gates, the house style
and the project model, built to `dist-core` for the studio, the film pipeline and the agent.
Reaching for `document`, `window` or `localStorage` below this line breaks all three at once.

**`mcp/tools.mjs`** is everything an agent is shown, the card and the eight tools, and it has a
budget: Claude Code shows only 2,048 characters of the card. What a tool needs to be chosen
correctly belongs in its own description, and detail belongs in a reply's `next` or in
`docs/agent-skill.md`, not in the card. `verify/routing.mjs` measures any change here.

**`tools/studio.mjs`** is the one room: the proxy, the routes and the model calls. Nothing imports
from it. The agent side talks to it over HTTP, and to a studio only when that studio belongs to the
same workspace (`mcp/studio-process.mjs`).

**`shared/providers.mjs`** separates Motioneer from the vendors and the wire format from the
transport. Request shapes live there once.

## Size

Keep every file far from a thousand lines. When one is growing, take the steps in this order,
because the cheap ones usually make the expensive one unnecessary:

1. Move the data out to `src/design/`. Most growth is a list, not logic.
2. Delete a case that no longer earns its place. Ask what breaks if it goes, and if the honest
   answer is nothing, that is the change.
3. Only then split into a sibling module, named for the data it owns rather than for being the
   overflow of its neighbour. `render-helpers.ts` is a file nobody can decide what to put in.

`tools/studio.mjs` and `shared/page.mjs` are already past the budget. Shrink them when you touch
them, and do not grow them.

## Two invariants the code already holds

**Clamp, do not trust.** Every number a model chooses is bounded at the point it enters the app,
not at the point it is used, because an unbounded scale produces an unreadable page rather than
a daring one and a check at the use site will be missed by the next use site.

**Fail one, not eight.** Fan out catches per item, so one bad reply loses one page rather than
the studio. When you add a parallel path, decide where its failure stops before you write the
happy path.

## Prefer deleting complexity to rearranging it

Before adding an abstraction, try the deletion that would make it unnecessary. Rearranging keeps
the weight and moves it somewhere you will find later. Ask in this order:

1. Can this case be removed rather than handled?
2. Can two near-identical things become one thing with a parameter, without growing a
   configuration surface larger than the duplication was?
3. Is the abstraction paying for itself at two call sites, or is it speculation about a third?

An abstraction with one caller is a rename with extra steps.

## Signs a boundary is slipping

- Something under `core.ts` touches `document`, `window` or `localStorage`.
- A vendor name appears outside `shared/providers.mjs` and `shared/model.mjs`.
- The card in `mcp/tools.mjs` grows past 1,900 characters, or a reply puts something an agent needs
  only in its text, where Claude Code never shows it.
- A number from a model reaches the renderer without passing a clamp.
- A new file whose name describes its position rather than its contents: helpers, utils, misc,
  common, shared logic.
