# Assembled, the house style

Nothing fades in. Motioneer builds the real interface in front of the viewer, part by part, on
time.

No video model or template kit can do this. A video model invents an interface, and a template
moves a screenshot. Motioneer has the product's own DOM and SVG, so every row, label, glyph and
control can arrive by itself, timed like the machine it borrows from.

## The rules

1. **Real parts at a readable size.** Only real DOM/SVG layers or real pixels move, large enough
   to read.
2. **Construction first.** Hairlines trace the real boxes of the parts about to land, with at most
   two labels. Every value comes from the captured computed style.
3. **Parts arrive in reading order, on mechanical time.**
   - Each part gets one verb: print, flap, register, draw, type, stamp, scan or wind.
   - A part moves for 240 to 520ms and starts 40 to 90ms after the last; a component is built
     within 1.4s.
   - Arrivals end on cubic-bezier(.16,1,.3,1), and anything mechanical uses steps(). Never ease,
     ease-in-out or linear.
4. **One object carries the eye.** Neighbouring shots share a real detail, never a constant drift.
5. **Every arrival makes a sound.** A dry tick lands on each part's arrival:

   | verb | sound |
   |---|---|
   | print | tabulator |
   | flap | relay |
   | type | keystroke |
   | stamp | postmark |
   | draw, scan | handshake |
   | register | release |
   | wind | a slowed relay |
6. **Hold to read.** Each shot ends still and legible for at least 600ms, or 300ms at fast pace.
7. **No repeats, one ending.** A capture appears once unless it is carried or shown at a new
   scale. The film ends on the brand mark drawing itself.

The numbers, the sound map and the guide spec are data in `src/design/assembled.ts`. The verbs
are the deck in `src/design/motion.ts`.

## The looks

A capture film is composed in a mix of two looks, data in `src/design/looks.ts`, rather than one
centred box on a flat colour. They are the decisions an art director makes once and holds across a
film: a ground, a material, a type system and how the interface is presented.

- **Plate** makes the house style visible. The interface is printed onto stock as a plate of its own
  ground, with crop marks, registration targets, its real width measured above it and a colour
  strip below, and the type is set like a job sheet in the product's own faces. In motion the marks
  draw, the plate prints from the top, the cyan and magenta plates close to a hair off register, and
  the parts assemble.
- **Editorial** is a spread. A page holds a headline on a grid, light beside a dark product and dark
  beside a light one, and the interface is cropped hard into one passage at twice its size, drifting
  a little closer while it holds.

The mix, composed by the first cut in `src/editor/project.ts`:
- The opening and closing are sheets of type, a short name set large.
- A heading captured on its own is set as type on its own sheet. It stays its capture's track, so
  the shot keeps its number.
- An interface alternates between its whole sheet, printed beside its headline, and a passage of it.
  An element that comes round again returns as a passage, a new scale rather than a nudge.
- Headlines are the capture's own heading, or the plan's name for it without its generic noun. A
  shot with neither prints its sheet alone, larger.
- A pair prints as two sheets, and a heading paired with its visual is set as the headline beside
  it; shown again, the pair becomes a spread.
- Shots are framed before they are timed. A shot framed exactly as an earlier one is dropped and its
  time goes to the others, so a page with few things on it makes fewer, longer shots rather than
  repeats. A fast film is many short shots, so it may cut back to a framing, and drops only a shot
  identical to the one before it.
- A passage that comes back centres on another part of the capture, from four focus points.
- The film's own camera stays still, so the stock never moves under the print, and each shot moves
  once on its own.

Every capture's faces come with it, so the type is set in the product's own fonts, and the grain is
a few hundred bytes of drawn noise. Nothing is fetched. Authored reels keep their own scenes and font
themes in `tools/editor/art-direction.mjs` for now.

## What is in place

- **The deck is dealt again.**
  - Every path that writes motion now goes through `/generate`: the editor's Explore, capture
    films, `change`, and the agent `motion` tool.
  - `/generate` deals a verb, plus an errand that fits the motion's purpose. A batch never repeats a
    verb, and a refinement keeps its verb.
  - The verb is stored on the motion and shown in the editor's version picker.
- **Films brief the style.** Each element's motion is briefed with the Assembled timing contract,
  after the person's own words, and a retry's reason is never cut.
  - The old pace note asked every motion to fill its shot.
  - On the same fast film of one page, shots that never held still went from six of twelve to one
    of seven.
- **Measured, and advisory.**
  - `assembled()` in `src/written.ts` reports how a stylesheet departs from rules 3 and 6.
  - The proof measures each shot's closing hold. A frame counts as still when under 1.2 percent of
    it changes past a 90-level threshold, so the cut's slow zoom does not count as motion and an
    arriving part does.
  - `assembledReport()` combines each motion's report with repeated captures and short holds.
    Film and change replies carry it as `assembled`, so an agent can name what to fix.
- **Seeing and adjusting.** `look` with `shot` shows six frames across a shot, which is how an
  arrival is judged. `change` with `timing` rescales speed, spacing or easing exactly, with no
  model.
- **Every arrival makes a sound, in capture films.** The `assembled` soundtrack is the capture
  default.
  - Its instrument is the sound of the verb the film's parts mostly move by, from the map above.
  - Its cues are read from each motion's own css: a part lands two fifths into its motion, which
    is where the arrival curve has carried it most of the way, and the last part settles the shot.
  - A recut scores again on the new timing, because the score is recorded as itself.
  - This lives in `arrivalCues()` in `tools/editor/film-events.mjs` and the house score in
    `tools/editor/soundtrack.mjs`.

## Not yet

- **Rule 2:** construction guides drawn from capture bounds.
- **Rule 4:** detail-to-interface moves in capture films instead of the linear zoom.
- **Rule 5:** one instrument per film; a shot whose verb differs still ticks in the film's sound.
- **Rule 7:** repeats replaced by a crop of one part and a pull-back, and the logo drawing its own
  paths.
- **Enforcement:** nothing here refuses a motion yet. The pass rates will be measured over real
  films (film-lab for capture films, the benchmark for reels), and a rule is enforced only above
  what real output supports.
