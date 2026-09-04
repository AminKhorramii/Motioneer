# The rail

Several elements, each with its own motion, played on one timeline. This is the newest part of the
studio and the least finished, and this is the plan for finishing it.

## The finding this is built around

`options()` keeps `kept[0]` and discards the rest. A rail of four elements generates motions for
each and shows you the first one it judged acceptable, with no way to see or reach the others, and
nothing in the page offers to swap or re-roll a car.

Motioneer's whole argument is that choosing beats describing, and comparison is how choosing happens. The
rail is the one place in the product where you cannot choose. Everything below follows from fixing
that.

## The spine, before any of it

`cars` is a global that is mutated in place. An arrangement should be a value:

```js
{ id, cars: [{ pick, motion, alternatives, at, after, shot, tune }], camera, span }
```

Fork, compare, save, undo, export and film all become operations on a value rather than special
cases written against a global. This is a day of work and it decides whether the phases below are
straightforward or miserable, so it comes first.

## Phase one, the timeline behaving like a timeline

The operations a person reaches for a hundred times an hour, all currently missing.

- **Rows can be selected.** Shift for a range, the platform modifier to toggle, a marquee to sweep.
  Dragging any selected bar moves every selected bar. Note that the multi-selection feature today
  selects *elements* and not *rows*, which is why moving three cars together is impossible.
- **Bars snap.** To zero, to the playhead, to the starts and ends of their neighbours, and to a
  coarse grid, with a modifier to defeat it. Without snapping you get 419ms beside 421ms, and the
  composition reads as careless for a reason nobody can point at.
- **Keys work.** Arrows nudge, shift and arrows nudge further, select all, delete, duplicate. Undo
  already covers the composition, which is what makes all of these safe to try.

## Phase two, giving the choosing back

The cheapest large win, because the alternatives are already generated, already judged, and then
thrown away.

- Keep the whole set per element rather than stopping at the first.
- A row cycles through its alternatives. No model call: they exist already.
- More like this, on one car, which the refine path already supports by id.

## Phase three, relative timing

Absolute offsets mean that changing one car's duration forces every car after it to be dragged
again by hand.

- `after: carId` and `with: carId` beside `at`.
- A solver: topological order, cycle detection, absolute as the fallback when nothing is linked.
- The gesture is a drag from one row's edge onto another.

Third rather than first because it changes the shape of the data, which is worth doing once the
shape is a value rather than a global.

## Phase four, comparing arrangements

The move that has no equivalent anywhere else, and it is Motioneer's own idea one level up: the wall
compares pages, this compares compositions.

- Two or three arrangements of the same elements, side by side, held on one clock.
- Fork an arrangement, change one thing, watch both at the same instant.
- Keep the winner. Which is the wall, applied to time instead of to layout.

## Phase five, craft

- A bezier editor, because four easing presets is a ceiling on taste.
- One camera over the whole composition, with the per-car camera as an override rather than as the
  only way to have one.
- Markers, so beats can be aligned to something rather than to each other by eye.
- A density readout. "Everything lands inside the first 400ms and then nothing happens for two
  seconds" is a real criticism the tool is in a position to make about its own output.

## What to prove

No new suite; these belong beside the studio suites that exist. The three worth writing first are
the ones whose failure is silent rather than loud:

- the solver against a cycle, where A follows B follows A must not hang,
- a bar dragged past the end of the timeline, where snapping has nothing to snap to,
- a multi-row drag, where the relative offsets between the selected rows have to survive.

## Where the difficulty is

Phase three touches the rail renderer, the timeline, the undo snapshots and the export in one
change, which is the shape of change this repository has historically got wrong in exactly one
place and not noticed.

Phase four puts several rail frames on one clock. The hold transport already addresses frames by
index so it should carry, but three arrangements of five cars is fifteen live subjects and that is
worth measuring before the layout is committed to.
