---
name: motioneer
user-invocable: false
description: How to direct Motioneer well when someone wants motion for their own product, whether a launch or demo film of their site, CSS motion for a component, or a change to a film already made. Use it before writing a film direction, when reviewing a storyboard, and when choosing between capture and authored films.
---

# Directing Motioneer

Motioneer moves the real product. A film is made from the site's own DOM, SVG, type and colour,
and a motion is CSS for markup the person already has. Lean on that: no stock imagery and no
invented interface. Say plainly when a source is only available as a screenshot.

## Choosing what to make

- **A film of a site, with named elements:** `film` with `mode: "capture"` and `pick` in the
  person's words. This is a demo of components, such as a dev server, a pricing section or a hero.
- **A launch or brand film of a site:** `film` with `mode: "auto"`. It directs from real DOM and
  SVG details when the page has them, and falls back to honestly labelled screenshots when it does
  not. Use `native` only when they insist on DOM fidelity, because it refuses a page without two
  usable components.
- **An idea in words, with no site:** `film` with `mode: "graphic"` and `brand`.
- **CSS for markup they have:** `motion`. Send the real markup and its CSS, since selectors can
  only reach parts that are in it.
- **Picking and comparing by hand:** `studio`.

When unsure what is on a page, call `look` with the url first. Then show or describe the
contact sheet and ask which elements they want. A minute of rendering the wrong thing costs more
than a question.

## Writing the direction

Pass the person's whole request in `direction`, word for word. Every plan and every motion reads
it, and a summary loses the words they chose. Add to it only what they implied but did not say:
- the length
- the pace
- the feel of the music
- what should move first

Good directions name:
- one product object the film is about, such as an issue row, a composer or a pricing card
- the order it should be read in
- how things arrive, for example "rows print one after another" or "the send glyph draws itself
  and the camera pulls back to the composer"
- how the film ends, usually the brand alone on its own background

## The house style: Assembled

Nothing fades in. The real interface is built in front of the viewer, part by part, on time.
- **Parts move, not the whole.** Rows, labels, glyphs and controls each arrive in reading order.
- **Each part arrives once, in a mechanical way:** printing a line at a time, flipping over and
  settling, two passes coming into register, drawing itself, typing, a stamp landing once, a scan
  crossing it, or one part winding while the rest holds.
- **The numbers:** 240 to 520 milliseconds per part, starting 40 to 90 milliseconds apart, with a
  component done inside 1.4 seconds. Arriving ends on cubic-bezier(.16,1,.3,1), and anything
  mechanical uses steps(). Never ease, ease-in-out or linear on a movement, because those are the
  defaults every generated interface already wears.
- **Every shot ends on a still, legible hold.** A shot that is still moving when it cuts was never
  read.
- **One real detail carries the eye between shots,** rather than a slow zoom on everything.

## Reviewing a result

Every film and change reply carries a storyboard image and a verdict measured from the frames:
- cuts
- shot length
- arrival time
- blank frames

Look at the image before calling a film finished:
- Is each shot's subject large enough to read?
- Are two shots the same picture twice?
- Is anything clipped in its settled hold?
- Is a lone button or label filling a shot?

Name a weak shot by number and offer one concrete change, such as dropping shot 3, a slower cut,
or making the pricing cards glide in. The verdict checks structure, not taste, so never call a film
polished only because the verdict passed. Repeat the summary's verified line, because it is the
proof the film is what was asked for.

The storyboard shows each shot once, settled, so it cannot tell you whether an arrival is snappy.
To judge motion, call `look` with the projectId and `shot` for six frames across that shot, or
`at` for the seconds you want. It reuses the existing render, so it answers in seconds. Read the
reply's `assembled` notes too: they say where the film departs from the house style, such as
repeated captures, shots that cut before they hold, or motions that move the whole element at once.

Make at most two focused passes before handing over, then say what is still weak.

## Changing a film

Every reaction is `change` on the film's projectId. It makes a new take, so the original is never
lost:
- **`cut`:** pace, length, dropping shots by number or element name, reordering, titles, colours.
  Capture films only, since an authored reel's scenes are designed together.
- **`motion`:** how elements move, with timing, camera and audio kept. Name shots or elements for a
  capture film, or `trackIds` for a reel, and lock what was approved.
- **`timing`:** "snappier", "slower" or "tighter" as numbers, with no model call: `duration: 0.7`
  makes each part 30 percent faster, and `stagger: 0.5` packs the parts tighter. Prefer it over
  `motion` when the motion is right and only its tempo is wrong. Then look at the shot again.
- **`music`:** a musical identity or direction, or a finished `audioFile`.

To add elements that were never filmed, call `film` again with `pick`. When the projectId is not in
the conversation, `projects` lists earlier films and their takes.

## Music

Authored films compose an original score on the cut:
- **Dry, action-led:** keystroke, relay, tabulator, postmark, handshake and release.
- **Deep, fast techno:** hypnosis, warehouse, submerge, acidline, fracture and alloy, around 144 to
  162 BPM.

Capture films take a lighter synthesized score: ambient, pulse, playful or percussive, or `none`
for silence. Never promise stock music or a song composed to order.

## When something fails

A failure starts with "Cannot" and ends with "Next:". Relay the reason and the next step as given,
and retry only when Next says to. A site behind a sign-in or a bot check cannot be proxied. Point
the person at the bookmarklet in the studio instead.
