# The landing page prompt

A brief for building Wall's own marketing page: dark, minimal, and built around lines and
curves in motion, since that is the language the product's own backdrops already speak.

Hand the whole of the section below to a model, or to a person. The product facts in it are
taken from the code rather than from the pitch, so they are safe to make claims from.

One number to keep straight: `ANGLES` and `fill()` both ship eight, so the page says eight.
The older wording of twelve predates the code.

---

# Build a landing page for WALL

You are designing and building a single page marketing site for a desktop app called WALL.
Read every section below before writing code. The product facts are not negotiable; the design
direction is, within the constraints given.

## 1. What the product actually is

WALL is a desktop app (Electron, also a plain web build and a self hosted server) for solo
founders and builders who need a landing page.

**The one act: compare and choose.** Generating a landing page is solved. What nobody gives you
is many pages at once, live, side by side. Design decisions are comparative. Art directors work
from contact sheets. Founders get a chat window. WALL gives them the contact sheet.

You describe your product once. WALL writes eight complete landing pages in parallel, each
arguing a different case for the product, each built in a different visual world, all of them
real scrollable DOM rather than screenshots. They appear while the models are still writing. You
scroll sideways through them, pick one, refine it, and export a single self contained
`index.html` that you own.

### The loop

1. **Pick a model, say what you are launching.** Two steps, then it builds. Setup produces
   something instead of only explaining.
2. **Eight angles.** Each page argues a different reason to care, so the wall is worth scanning.
   The angles are: the pain, the outcome, proof first, plain and specific, the one line, for the
   sceptic, the before, the craft.
3. **Eight worlds.** A world is one set of decisions that propagate together: type pairing and
   scale, tracking and weight, radius, density, whether sections carry hairline rules or numbers,
   whether they sit in a column or run edge to edge, the measure in characters, how figures are
   treated, which backdrop belongs to it, which layout each section wears, and which sections
   exist at all. Six are built in (swiss grid, editorial, terminal, poster, catalogue, soft
   product); the rest are designed by the model for your specific product, including the CSS they
   bring with them. A variant is an angle crossed with a world: what the page argues, and how it
   is built.
4. **Compare.** One paper in the middle, the alternatives either side. Scroll sideways or press
   the arrow keys and the next one slides into the centre. Or switch to the grid and see all
   eight at once.
5. **Refine.** A prompt bar under the paper. One instruction makes three new pages placed to the
   right, so you compare rather than overwrite. Click any text on the paper itself and type.
   Drag sections around. Cycle a section's layout, hide it, add one.
6. **Ship.** One self contained `index.html`, inlined CSS, no framework, no runtime of ours, no
   lock in. Or open it in your browser first.

### Details that make it real, and are the proof

- **Streaming that means something.** A page keeps one id for its whole stream, so a paper
  appears on its first finished section and then fills in, rather than arriving all at once at
  the end. Papers repaint per completed section, not per delta.
- **Slop detection.** A local checker names the patterns a model reaches for when it has nothing
  specific to say: hollow words, generic calls to action, vague headlines, hero eyebrow chips, ai
  beige, glassmorphism, default drop shadows, italic serif display, nested cards, card soup. It
  is free and instant, which is what lets it run before the model call, where its findings go
  into the prompt as things to avoid, rather than only after, where they would just be a report.
- **Drawn backdrops, not stock photography.** WebGL2 fields of topographic lines and a still film
  grain, seeded from your palette so the art changes when the colours do. About 2KB inside the
  page. A generated hero image is the fastest way to look like every other page, and one image as
  a data URI outweighs the entire document.
- **The taste sheet.** Pick a look, or drop a screenshot of a page you love and WALL reads the
  system out of it: background, ink, accents, contrast, turned into an editable contract with
  density, scale and radius knobs. "More like Linear, less like a template" becomes a spec
  instead of a wish.
- **Works without a key.** Layouts, worlds, variants and export all run locally. A key is used
  only when you ask a model to write copy, and it stays in this app's storage.
- **Your choice of model.** Claude, Claude Haiku, GPT, Gemini Flash, GLM, DeepSeek, Qwen, Kimi,
  MiniMax, or any OpenAI compatible endpoint you point it at. The task is short JSON copy rather
  than code, so a small model does it well and cheaply.
- **Three shells, one codebase.** Desktop over IPC, browser with localStorage and a Blob
  download, or a self hosted server that holds the keys so they never reach a visitor's browser.
  One file decides which. The web version is the desktop version, not a reduced copy.
- **Cost, measured rather than estimated.** One wall is about 14,000 input and 16,000 output
  tokens and takes around 28 seconds.
- **Copy a brief.** Any section or the whole page exports a markdown spec with the copy and the
  design tokens, ready to paste into Claude Code, v0, or a designer's inbox.

### What it deliberately is not

No multi page sites, no CMS, no component library, no accounts, no hosting of ours, no chat
surface, no template gallery. Recipes are not templates; they are generated against your taste
sheet.

## 2. Page structure

Minimal. Long scroll, few sections, a lot of air. Every section earns its place.

1. **Hero.** The full viewport. A single large headline, one supporting line, one primary
   action, one secondary. Animated line field behind or through the type. Nothing else. No
   eyebrow chip, no logo strip, no badge.
2. **The problem, in one line.** A single centred statement about comparison being how design
   decisions are made, and how everyone hands you a chat window instead. Type only, set large,
   with a lot of space around it.
3. **The wall.** The centrepiece and the only place with real density. Eight page thumbnails in
   a horizontally scrolling film strip. The centre one is at full opacity and scale; the
   neighbours are smaller and dimmed. It moves on scroll, on drag, and on the arrow keys,
   exactly like the app. Each thumbnail is labelled with its angle and its world, for example
   "the pain / swiss grid" or "the craft / terminal". Make the eight visibly different in type,
   density and colour, because the whole claim of the product is that they disagree.
4. **How it works.** Three or four steps, set as a numbered sequence with hairline rules rather
   than cards. Describe, compare, refine, ship.
5. **Under the hood.** Four to six short items for the reader who is suspicious of AI tools:
   streaming that shows you pages while they are written, slop detection that runs before the
   prompt and not after, drawn backdrops instead of stock imagery, keys that stay on your
   machine, export as one file you own, works with no key at all.
6. **Ship.** Show the export as a fact rather than a promise: one file, inlined CSS, no
   framework, no runtime. A small code shaped block is allowed here.
7. **Close.** One line, one action, a footer of two or three links. Nothing more.

## 3. Art direction

Dark, quiet, and confident. The app's own chrome is the reference: surfaces recede and content
leads.

**Palette.** Near black background around `#08090a`, a raised surface around `#0d0e10`, ink at
`#eceef1`, secondary ink at `#b4b9c0`, dim at `#7c828c`. Hairlines are `rgba(255,255,255,0.055)`
and `rgba(255,255,255,0.09)`, never a solid border. Keep colour almost entirely out of the chrome
so the eight thumbnails carry every hue in the room. If you want one accent, make it a single
cool light and use it in under five places on the whole page.

**Type.** Inter Variable, or a variable grotesk of the same character. Real tracking: negative on
display sizes, near zero on body. Body around 13 to 15px. Display large and tight, weight 600 to
800. No all caps headlines. No italic serif display, since it is on the app's own slop list.

**Surfaces.** Hairlines instead of borders. Radius at 7 to 11px on chrome, 0 where the grid
should read as a grid. No card soup, no nested cards, no default drop shadows, no glassmorphism
panels. One glass element at most, and only if it is the single primary action.

**Density.** Airy at the top and bottom, dense only inside the wall section. The contrast between
the two is the page's rhythm.

## 4. Motion: lines and curves

This is where the page should be memorable. The app draws topographic line fields as its
backdrops, so lines and curves are the product's own language rather than decoration borrowed
from somewhere else.

**The line field.** A canvas behind the hero drawing slow topographic contours, the same family
as the app's `contours` and `ridge` backdrops. Lines drift, converge, and separate. Very low
contrast, close to the background, so it reads as texture rather than as an image. It should
respond faintly to the pointer: the field bends away from the cursor, or the lines thicken near
it. Keep it under 60fps cost on a laptop; if you cannot, ship fewer lines.

**Type that is drawn rather than typed.** The hero headline arrives as stroke rather than as
fade. Pick one and commit:

- SVG paths of the headline drawn on with `stroke-dashoffset`, then filled once the stroke
  completes.
- A curved clip path sweeping across the words so they are revealed along an arc rather than a
  straight line.
- Per word masks that lift on a curve, each word starting a beat after the last.

**Curves as structure.** Long, slow bezier rules between sections instead of straight lines. They
redraw themselves as you scroll into them, left to right, over about 700ms. This is the page's
one recurring motif; use it three or four times and no more.

**Scroll driven, not time driven.** Prefer scroll progress over autoplay for anything below the
fold. The line field is the exception since it is ambient.

**The wall interaction.** The eight thumbnails must actually move. Horizontal scroll, pointer
drag, and arrow keys all drive the same index. The centre paper scales to 1 at full opacity;
neighbours sit at about 0.85 scale and 0.32 opacity, translated sideways, which is the app's real
geometry. Transitions around 400ms with a soft ease.

**Timing.** Chrome interactions at 130ms with `cubic-bezier(0.2, 0.7, 0.3, 1)`, which is the
app's own transition. Content reveals at 400 to 700ms. Nothing bounces. Nothing springs past its
target. The motion is calm and deliberate rather than playful.

**Reduced motion.** Honour `prefers-reduced-motion` for real: the line field renders one still
frame, headlines appear without stroking, curves draw instantly, the wall becomes a plain
scroller. This is the same discipline the product applies to its own backdrops.

## 5. Technical constraints

- One self contained HTML file with inlined CSS and JS, no framework and no build step, if you
  can manage it. If you use a framework, keep the output dependency free at runtime.
- No external requests at all. No CDN scripts, no webfonts fetched at load, no remote images.
  Embed what you need. The product's whole export promise is one file with no requests, so a
  landing page that pulls from six hosts contradicts it.
- Canvas or WebGL for the line field, with a static gradient fallback when the context is
  unavailable. Pause it when the tab is hidden.
- Responsive down to 390px. On small screens the wall becomes a snap scrolling strip and the hero
  type drops a step, but the line field stays.
- Semantic HTML, real focus states on every control, keyboard reachable throughout, and contrast
  that passes AA on body text.
- Total page weight under about 400KB. If the line field pushes past it, simplify the field.

## 6. Copy rules

Follow the product's own house rules, because the page is a demonstration of them.

- No all caps. No em dashes. No decorative symbols or emoji.
- Every claim is concrete. Prefer a number to an adjective. "About 28 seconds and 30,000 tokens
  for eight pages" beats "blazing fast".
- No hollow words: seamless, effortless, powerful, revolutionary, unlock, elevate, supercharge,
  game changing.
- No generic calls to action. "Get started" and "Learn more" are banned. Say what the button does.
- No vague headlines. The headline should be falsifiable.
- The page must pass the app's own slop detector. If you would flag it in WALL, do not ship it
  here.

Headline candidates, to steer voice rather than to be copied:

- "Eight landing pages, then one."
- "Design decisions are comparative. Your tools are not."
- "See eight real pages argue for your product, then keep the one that wins."

## 7. Deliverable

A complete, working landing page. Ship the line field, the type motion, the curve rules, and the
interactive wall. Do not stub the animations or leave placeholders. If a choice is ambiguous,
pick the quieter option, because the product's entire aesthetic argument is that restraint reads
as craft.
