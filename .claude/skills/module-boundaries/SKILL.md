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

- Anything that walks a `Section` belongs in `sections.ts` or in the one `switch` in
  `render.ts`, because `content` is an untyped bag and every reader of it should be findable in
  one place.
- Anything that decides how a page looks as a set belongs in `worlds.ts`, because a world is one
  set of decisions that propagate together and splitting them re-creates the shuffle that
  worlds replaced.
- Anything that names a pattern, a preset, a face, an angle, a prompt or a rule belongs in
  `src/design/`, one file per kind of knowledge, because that is the line between taste and
  machinery.

## Data and machinery are different files

Opinions go in `src/design/` as data. Code that acts on opinions goes in `src/`. The test is
whether a change to the thing is a change of mind or a change of behaviour: a new slop pattern
is a change of mind and belongs in `src/design/slop.ts`, where a new way of scanning for slop is
a change of behaviour and belongs in `src/slop.ts`.

Keeping them apart is what lets taste be tuned by editing a list, which is the only way a
catalogue stays current.

## The three boundaries that are load bearing

Crossing these is not a style question, it costs a fork.

**`src/host.ts`** is the only file that knows where Motioneer is running. Above it there is one
codebase, below it there are answers for state, export, preview, streaming and images per
shell. If you find yourself asking "am I in Tauri" anywhere else, the answer belongs in
`host.ts` as a capability the caller asks for by name, because a fourth shell should be a file
rather than a sweep through the app.

**`src/core.ts`** is page making without a browser. The model, the renderer, the worlds and the
checks have no DOM dependency. Reaching for `document`, `window` or `localStorage` below this
line breaks the agent tool and the render service at once, so if a function needs the DOM it is
not core logic and belongs in a component.

**`shared/providers.mjs`** separates Motioneer from the vendors and, separately, the wire format from
the transport. Request shapes and SSE parsing live there once. A shell that needs a different
fetch hands one in with `setFetch()` rather than carrying its own copy of the request shapes,
because two copies of a wire format drift and then disagree in production only.

## Size

Keep every file far from a thousand lines. When one is growing, take the steps in this order,
because the cheap ones usually make the expensive one unnecessary:

1. Move the data out to `src/design/`. Most growth is a list, not logic.
2. Delete a case that no longer earns its place. Ask what breaks if it goes, and if the honest
   answer is nothing, that is the change.
3. Only then split into a sibling module, named for the data it owns rather than for being the
   overflow of its neighbour. `render-helpers.ts` is a file nobody can decide what to put in.

`src/imagewasm.ts` is generated and inlined, so it is exempt. Generated files do not count
against a budget meant to keep human-read files readable.

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

- A component imports from `src-tauri` or branches on the shell it is running in.
- Something under `core.ts` touches `document`, `window` or `localStorage`.
- A vendor name appears outside `shared/providers.mjs` and `models.tsx`.
- A number from a model reaches the renderer without passing a clamp.
- A new file whose name describes its position rather than its contents: helpers, utils, misc,
  common, shared logic.
