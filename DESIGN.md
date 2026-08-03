# WALL — see twelve landing pages, pick one. Design document.

*2026-08-03. Desktop (Electron). For solo founders shipping fast.*

## The one act

**Compare and choose.** Generating a landing page is solved (v0, Lovable, Framer, Cursor).
What nobody gives you is *many at once*, side by side, live — because design decisions are
comparative. Art directors work from contact sheets; founders get a chat window.

WALL's act: brief → **a wall of live variants** → pin, breed, refine → ship.

## Load-bearing test

Remove the beauty → it is still the fastest way to see twelve real pages and pick one.
Remove the function → a wall of pages is meaningless. Passes.

## The three inputs

1. **The brief** — one paragraph about the product. (Or point at a repo/README and it
   drafts one you correct.)
2. **The taste sheet** — drop screenshots or URLs of pages you love. WALL extracts a real,
   *editable* system: palette, type scale, spacing rhythm, density, radius, motion
   character. This is the contract everything is generated against — the GROND dictionary
   move applied to design. "More like Linear, less like a template" becomes a spec.
3. **The axes** — what to vary: layout archetype, headline voice, palette temperature,
   density. You choose which knobs the wall turns.

## The wall (the app, and the hero)

A grid of **live pages** — real scrollable, clickable DOM, not screenshots. Each is a full
variant. Hover to bring one forward; click to open it full-size; **pin** the good ones.

- **Breed**: "more like this" (inherits its DNA), or cross two — *this one's layout, that
  one's palette*.
- **Refine in place**: click any element on the live page to edit its copy inline; or
  point at a region and only that region regenerates.
- **The art**: unpinned variants dim and defocus under a shader while the pinned ones hold
  their light — many live pages breathing at once. Only html-in-canvas can shade pages
  that stay interactive underneath. One hero, per the method.

## Ship

Export a real static `index.html` (self-contained, inlined CSS, no framework) or a React
component. No lock-in, no runtime of ours. Optional: deploy to a URL.

## Works without a key

Variants come from **recipes** — layout archetypes × the taste sheet — generated locally
and instantly, so the wall is full and useful with no API key at all. A Claude key (stored
locally) upgrades *copy* and lets you breed by instruction. An image key adds generated
hero art matched to the taste sheet. Nothing is required; everything degrades quietly.

## Truth loop (M3)

Once a page is live, pull its real numbers back onto the wall (PostHog first — already in
this founder's stack), so the page you *liked* sits beside the page that *worked*.

## Cut (v1)

❌ No multi-page sites, no CMS, no components library, no accounts, no hosting of ours,
❌ no chat surface, ❌ no template gallery (recipes are not templates — they're generated
against your taste sheet).

## Verification

Headless Electron: a brief + taste sheet produces N structurally distinct variants ·
each renders as live DOM with working links · pin/breed produces a child that measurably
inherits the parent's system · export writes a self-contained HTML file that opens
standalone · keyless path works end to end · zero errors. Then the human pass: does the
wall make choosing fast?

## Build order

M1 brief + taste sheet + recipe wall + pin + export. M2 model-driven copy & breeding.
M3 the shader focus layer + generated hero art. M4 truth loop.
