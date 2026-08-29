# Flows

Every path through Wall, from first run to a shipped file, with the code that carries it.
Written so someone who has never opened the app can follow what happens and where to change it.

The one act is compare and choose. Every flow below exists to serve that, so anything that
does not help you pick between pages is either absent or one keystroke away.

---

## 1. First run

Two steps, and the second one builds. Setup produces something rather than only explaining
itself, because an app that has already made eight pages is a better introduction than a tour.

| Step | What you do | Where it lives |
| --- | --- | --- |
| model | Pick from one row of marks. Claude, Claude Haiku, GPT, Gemini Flash, GLM, DeepSeek, Qwen, Kimi, MiniMax, or anything else that speaks the OpenAI shape. Paste a key, or leave it empty. | `src/Onboarding.tsx`, `src/models.tsx` |
| brief | Describe the product in a sentence or a paragraph. A model reads it into a structured brief and asks at most two questions about what it could not find. | `readBrief()` in `src/compose.ts` |

```mermaid
flowchart LR
  A[pick a model] --> B[describe the product]
  B --> C{readBrief parsed it?}
  C -- yes, no gaps --> D[build]
  C -- gaps --> E[ask at most two questions] --> D
  C -- failed --> F[fill the fields yourself] --> D
```

`localStorage['wall-onboarded']` marks it done. The help button in the header reopens the same
card in `explainOnly` mode, so the explanation is never lost.

Keys never leave the machine except as the authorization header of the call they belong to. Where
they rest depends on the shell: the desktop app puts them in the system keychain, which is
encrypted at rest and gated by the login session, a browser keeps them in `localStorage` under
`wall-key-<vendor>`, and a served deployment holds its own so none ever reaches the page. That is
flow 8.

---

## 2. Building a wall

The core flow. One click produces eight complete pages, each arguing a different case, each
built in a different visual world.

`fill()` in `src/App.tsx` runs it:

```mermaid
sequenceDiagram
  participant U as you
  participant A as App.fill
  participant W as promptWorlds
  participant P as writeOne
  participant M as the model
  U->>A: build, or "write a new wall"
  A->>A: scaffold: alternatives(base, 9), eight places marked drafting
  Note over A: the wall is on screen here, before anything has been asked
  A->>W: design 5 worlds, one call each
  A->>P: shadcn, material 3 and carbon start writing at once
  loop per world, as it finishes
    W->>M: one call, JSON of one visual system
    M-->>W: name, type, scale, density, CSS, section order
    W-->>A: restyle that place in its new world
    A->>P: write the page for it, on its own angle
    P->>M: stream one page
    M-->>P: sections arrive one at a time
    P-->>A: the written page replaces the draft in its place
  end
```

**The angles.** Eight positions a page can take on the same product, in `ANGLES`
(`src/compose.ts`): the pain, the outcome, proof first, plain and specific, the one line, for
the sceptic, the before, the craft. A wall is only worth scanning if the pages disagree, so
each angle argues a different reason to care rather than rephrasing the same one.

**The worlds.** A world is one set of decisions that propagate together: type pairing and
scale, tracking and weight, radius, density, whether sections carry hairline rules or numbers,
whether they sit in a column or bleed edge to edge, the measure in characters, how figures are
treated, which backdrop belongs to it, which form each role of the argument wears, the CSS it
brings, and which roles exist at all. `src/worlds.ts` holds six built in ones (swiss grid, editorial,
terminal, poster, catalogue, soft product); `promptWorlds()` asks the model for eight more,
designed for your product specifically.

A variant is an angle crossed with a world: what the page argues, and how it is built. That is
what makes eight pages read as eight designs rather than eight shuffles.

**Model authored worlds are clamped, not trusted.** `madeWorld()` bounds every number, since a
scale of 9 or a measure of 200 does not produce a daring page, it produces an unreadable one.
`safeCss()` strips imports and remote urls and caps the length, because a shipped page is one
file with no requests and model written CSS must not break that promise.

**The wall is up before the model is asked.** `scaffold()` arranges nine papers from the
built in worlds against the copy the brief already seeded: the page as it arrived, kept to
compare against, and eight places each holding a stand-in marked `drafting`. Every place is a
place a written page will land in, so the wall improves where it stands rather than appearing
all at once, and nothing on it is ever mistaken for finished. Three of the eight are named
systems, shadcn, material 3 and carbon, which cost nothing to design and so start writing at the
first frame; the model is asked for the other five.

**Streaming.** A page keeps one id for its whole stream, so `upsertPage()` replaces it in place
and a paper appears on its first finished section, then fills in. `scanSections()` walks a
partial reply tracking strings and brace depth, so a closing brace inside a headline does not
end an object early, and it resumes from a cursor rather than re-reading the buffer, because
copy full of braces would otherwise make one page quadratic work. The same walk recovers the
sections of a reply that was cut off, so a truncated page costs its tail rather than all of it.
Papers repaint per completed section rather than per delta, because a real stream delivers a few
characters at a time and repainting per delta would re-serialize eight pages hundreds of times
for the same content.

**Runs carry a token.** Writing a wall takes about half a minute and starting another must not
be blocked, so `run.current` is bumped per fan out and late pages from an abandoned run are
dropped rather than mixed into the new wall.

**Without a model** nothing above runs, and the wall says so rather than looking finished. The
scaffold is already up, the drafts stay marked, and the app flashes that these pages are arranged
rather than written, because eight arranged pages read as eight real ones until you read them.
`canUseCli()` is how it knows: the desktop can answer for itself, and a served page asks its
server, which is the only side that can see whether there is a claude on the machine. Layouts,
worlds, backdrops, editing and export never need a model at all.

**What one wall costs**, measured from real captures: about 14,000 input and 16,000 output
tokens, and around 28 seconds.

**The speed knob is which model designs.** Thinking is priced in seconds and the design calls do
most of it, so `WALL_DESIGN_MODEL=haiku` is the one setting that moves the whole wall: measured
on the same brief, haiku reached the first world in 10.7s against sonnet's 23.3 and finished all
eight in 45s against 74. Both returned eight valid worlds, and sonnet reached for the more
particular object, so this is offered rather than taken. `WALL_THINKING` sets the budget directly
for anything in between, and `WALL_FAST` turns it off entirely, which is for the iteration loop
rather than for a wall you mean to keep.

---

## 3. Comparing

![the wall, eight designed pages at once](images/wall-grid.png)

Two views, switched in the header.

**one** is the studio. The paper you are on sits in the middle at full size; its neighbours sit
either side at 0.85 scale and 0.32 opacity. Move with the arrow keys, a horizontal wheel or
trackpad swipe, or by clicking a neighbour. Only five papers are mounted at a time, since the
rest cannot be seen and each one is a live iframe.

**all** is the grid: every paper at once, each labelled with its section count and taste name.
Click one to open it in the studio, and press escape to come back out, because reading one paper
is a detour from comparing eight.

The wall is eight papers and every one of them is designed. It used to open on a ninth, the page
as it arrived, kept as the thing to compare against: that made sense while the other eight were
arrangements of it, and became a fixed template sitting in front of eight designs once they were
each written whole.

The papers are real scrollable DOM in sandboxed iframes, not screenshots, which is the whole
claim: you are comparing pages, not pictures of pages.

**A finished page settles in.** Shipped pages, previews and the papers beside the centre carry
one orchestrated entrance: sections rise a few pixels in sequence, once, and then stillness,
with the pace set by the taste sheet's motion token and nothing at all under
`prefers-reduced-motion` or on a taste marked still. The editable paper in the middle never
animates, because it repaints per streamed section and per keystroke, and a page that settles
on every repaint reads as flicker.

**Narrowing is a keyboard pass.** `p` pins the paper in the middle and steps on, `x` takes an
unpinned paper off the wall, and `z` brings the last removed one back. A pinned page cannot be
removed until it is released, so one stray key cannot lose the page you meant to keep, and the
last page always stays, so the wall is never empty. In the grid every unpinned cell carries a
remove control and the survivors spread out, which turns eight pages into one by elimination
rather than by staring. Removed pages keep their ids refused, so a page still streaming in
cannot reappear after being turned away, and a page derived from a pinned one starts unpinned,
because the pin is a judgement about the paper you saw. The keys and the safety come from how
photographers cull: flag or reject with one hand, auto advance, and nothing is ever more than
one `z` from coming back.

**The triage is kept.** Pinning, culling, asking the bar for something and retyping a line on
the paper are the four judgements a session makes, and all four used to die in the browser. They
now travel twice: into the handoff as the reasoning behind this choice, and into a small file as
what you tend to keep. Section 7c is the file, and the paragraph on the cull story in 7b is what
goes to the agent.

---

## 4. Refining

![the dock](images/dock.png)

Everything here acts on the paper in the middle, which is why the dock is one panel rather than
a toolbar per concern.

**The prompt bar makes variants, never edits in place.** One instruction produces three new
pages placed to the right, so you compare rather than overwrite. `runBar()` in `src/App.tsx`
calls `promptPage()` three times in parallel and jumps you to the first new one.

**The world is a control.** The name under the paper is the world it was built in; clicking it
rebuilds the page in the next one. Copy survives the change, because a section arguing a role
the new world also wants is reused rather than rewritten.

**The sections rail** lists every section by the role it argues, claim, proof, substance, the
offer, questions, the invitation, credits, and the form it is set in. Cycle its form, drag to
reorder, hide it, add a new role, fan its forms out into new pages beside this one, or draw its
image. Role and form are the two axes of the model: what a section argues and how it is set,
because conflating them is what made every generated page assemble from the same nine
marketing categories. A world maps roles to forms, so the same offer is a table in a catalogue,
one sentence on a poster, and a transcript line in a terminal, and two rules hold at dressing
time: adjacent sections never share a form, and a repeated role never repeats its form.

**Direct manipulation on the paper.** The editable render injects a small script that makes text
`contenteditable` and posts changes back over `postMessage`. `applyEdit()` writes the value into
the page model at `sectionId.a.0.b`, so the edit flows into the model rather than only into the
pixels. Sections can also be dragged on the paper itself.

**Taste follows a reference.** Drop a screenshot anywhere on the window and `tasteFromImage()`
reads the system out of it: background, ink, dim, two accents, contrast. It becomes the taste
sheet for every page on the wall. "More like this, less like a template" becomes a spec rather
than a wish.

---

## 4b. The design layer

Everything opinionated is data in `src/design/`, one file per kind of knowledge, so tuning
taste never touches machinery and machinery never hides taste:

| File | What it holds | Read by |
| --- | --- | --- |
| `design/faces.ts` | the face vocabulary: platform stacks and the two bundled variable faces | tastes, presets, worlds |
| `design/presets.ts` | the looks offered at setup | onboarding, the brief rail |
| `design/worlds.ts` | the six built-in worlds and the palette moves | `worlds.ts`, which dresses pages |
| `design/angles.ts` | the editorial positions a wall argues from | the fan-out |
| `design/craft.ts` | the writing standards that travel in every prompt | the prompts |
| `design/slop.ts` | the catalogue of tells, copy and markup, as data | the detector in `slop.ts` |
| `design/directions.ts` | fifty one grounded design directions, dealt blind to the brief and never more than half from memory, so a wall cannot converge | `compose.ts` |
| `design/prompts.ts` | the three system prompts: writing, world design, intake | `compose.ts`, which sends them |

The split rule for the slop catalogue: a tell that is a pattern lives in the data file; a
tell that has to count or compare lives as code in the detector, because a counting
mini-language would be harder to read than the count. Add a tell, add a world, add an angle,
sharpen a prompt: each is one edit in one file, and the gate in `verify/app.mjs` re-judges the
house on the next run.

---

## 4c. Two halves of a wall: arranged and written

Five of the eight papers are **arranged**. A world picks values, the renderer assembles blocks, and
the model chooses between forms this repo enumerated: eight roles, twelve blocks, about fifteen
knobs. That is a box rather than a space, which `worlds.ts` admits to in its own opening paragraph,
and it is why the pages have a ceiling no prompt can lift.

Three are **written**. `writeWhole()` in `src/compose.ts` hands the model the tokens, the faces and
one direction and asks for the document: markup and styles, in one call rather than a design call
plus a copy call, because there is no machinery for the two halves to land in separately and
because it is the only way the type can answer to the layout.

Both halves land on the same wall wearing the same look and the same embedded faces, which is what
makes this an experiment with a control rather than a demonstration. Which approach is better is
the question a wall exists to answer, so it is answered by culling rather than by argument.

**The deck is dealt blind to the brief, and that is the engine.** A call handed a seed packet and
a call handed a fire exit plan cannot converge. Tagging the fifty one objects by industry would
hand every finance page a ledger forever and trade the best output for the safest, so it is not
done. The cost is the rare pairing that is untrue rather than surprising, and for that alone a
design call may refuse its ground: grief, health, safety, money and law are where an unexpected
register stops being daring. The hatch is deliberately too narrow to be comfortable, because a
model given room to find a ground unsuitable will find the safe version of the category next, and
that is the failure the whole deck exists to prevent. A call that refuses names what it built from
instead, and that is what reaches the memory, or the log would favour a ground no page here was
ever built from.

**Both halves are asked to draw.** Every design prompt used to say "use CSS" and mean treatment: a
dashed rule, a slab of colour, a hairline. None of them asked for the subject itself. On the first
real wall a model did it unprompted, drawing a record with grooves and a numbered "500 only" stamp
for a vinyl reissue, and that was the paper worth looking at, which said the instruction was
missing rather than the ability. Both calls now carry the same one: draw the object your ground
already names, at a size somebody notices, because a page that draws its own subject could not be
any other page. A world's CSS budget went from four thousand characters to nine thousand, since a
disc with grooves does not fit in a budget set for a dashed rule, and a written page picks the
backdrop behind it rather than inheriting whatever the place on the wall was wearing.

The three seeded built-in worlds do not respond to any of this: their CSS is written by hand in
`design/worlds.ts`. So a prompt change reaches five of the eight papers, and the other three are a
taste decision in a data file.

**Nothing about a written page is true by construction, so all of it is proved.** `src/written.ts`
filters the markup to an allowlist of tags and attributes, because a denylist is a list of the
attacks somebody thought of. Two things make that load bearing rather than tidy: a shipped page is
one file that makes no requests, and the frame a paper renders in carries `allow-scripts` with
`allow-same-origin`, which together are not a sandbox, so a surviving script would run against this
app's origin where the keys are. Links may point anywhere a reader might click; sources may only be
a data url, because the same address is a link in one and a tracking pixel in the other.

A reply with no `<h1>` is refused, since that is the one structural claim worth making about a
document nobody arranged. **A refusal is not a hole in the wall**: the place falls back to an
arranged page, because eight papers beats seven and a gap.

The detector reads a written page's markup rather than its sections. A written page keeps sections
so the brief and the handoff have something to describe, and those still hold the defaults nobody
rewrote, so reading them judged the page on copy the reader could not see. The gap that remains is
that the tells scoped to a field, a witness, a call to action, a logo row, name a slot the arranged
model has and a written page does not.

---

## 5. Slop detection

`src/slop.ts` names the patterns a model reaches for when it has nothing specific to say:
hollow words, generic calls to action, vague headlines, hero eyebrow chips, ai beige,
glassmorphism, default drop shadows, italic serif display, nested cards, card soup.

It runs locally against the page model and the rendered HTML, because several of the patterns
are visual rather than textual. Being local and instant is what lets it run **before** the model
call, where its findings are passed into the prompt as things to avoid. A checker that only runs
afterwards is a report; one that runs first is a constraint.

The same catalogue covers the tells of generated writing, not only generated decoration: the
"not X, it is Y" pivot, "whether you are A or B", the headline that asks a question the page
answers, stock filler phrases, chained em dashes, rows of bare statistics, placeholder company
logos, the coloured left border, glowing text. `src/craft.ts` carries the inverse of each into
the system prompt, so the writing is shaped before there is anything to detect.

**It only ever asked half the question.** The catalogue answers whether a design is generic and
subtracts. Nothing asked whether it is anything at all, so a world could pass every check by being
careful: a column, nothing leaving it, a scale in the middle of the range, no art behind it and
ten lines of CSS. Clean and undesigned are different states and only one of them was measurable.
`unspent()` in `src/worlds.ts` is the other half, counting five moves a world can make and calling
it timid if it made fewer than two of them, and a timid world goes back through the same repair a
flawed one does. It counts decisions rather than volume, because the opposite of timid is not
loud: a gallery card with enormous margins, one hairline and nothing else has committed twice
over. `verify/app.mjs` holds the house to it, and asserts that the restrained world still passes,
because without that this becomes a demand to be loud and a wall of eight loud pages is one note.

**It reads the whole page.** The copy half used to walk a section's top level strings and drop
everything that was not one, so every list, table and group was invisible to it: on the default
page that is 58 of 84 strings and 57% of the characters. The headline and the sub were policed
and the substance items, the pricing plans, the objection answers and the footer were not, which
is the half of a page that actually fills up with filler. One tell in the catalogue could never
fire at all, because the only place company names live is an array. A leaf now keeps the key
nearest to it, so a plan's name is still a `name` and the key scoped tells go on meaning what
they meant.

**What it finds in copy is now repaired, not only reported.** A world that trips the detector has
always gone back to the model with its faults named and been kept only if it improved. Copy that
tripped it got a chip and shipped: a recorded wall handed back a testimonial signed "A real
person" at "founder, somewhere", which is this app's own placeholder for a page with no customer
yet, left untouched because the writing call is given the page as it stands and rewrites what it
chooses to. `mendCopy()` in `src/compose.ts` closes that asymmetry. Only a page that failed pays
for it, it pays once, it lands after the page is already on the wall so nothing waits for it, and
the answer is kept only when it carries strictly fewer tells, because a rewrite that trades one
for another is a second opinion rather than a fix.

**The placeholders in the defaults are ones the detector can see.** A blank page has to put
something under a testimonial, and admitting there is no customer yet beats inventing one, so the
defaults are honest stand-ins: "A real person", "founder, somewhere", "Replace these with real
names". The danger is the other end, so each has a tell of its own and `verify/app.mjs` fails if
any of them stops firing. The house gate judges those same pages on the design half only, for the
reason `flawsIn` gives: the copy there is placeholder on purpose and no world can fix it.

**The verdict travels with the paper.** The dock shows `clean` or `N generic` beside ship for
the page in the middle, with every reason in the tooltip, and the grid shows the same chip on
every cell. It sits with triage on purpose: the generic pages announce themselves while you are
deciding which cells to cull.

---

## 6. Images and backdrops

A landing page needs something behind the words. Wall draws it rather than generating a
photograph, for two reasons: a generated hero image is the fastest way to look like every other
page, and one image embedded as a data URI outweighs the entire document.

`src/backdrop.ts` has three, all seeded from the taste sheet so the art changes when the palette
does. `contours` and `ridge` are WebGL2 fields of topographic lines, `grain` is a still texture
drawn once. They honour `prefers-reduced-motion`, pause when the tab is hidden, fall back to a
gradient without WebGL2, and cost about 2KB inside the page. Each world brings its own.

Generated images are available where a section shows a figure, through Gemini, behind the same
host boundary as everything else. `illustrate()` returns a data URL that is stored in the page
content, so it still ships as one file. The prompt rules out text hardest of all, because words
baked into an image cannot be edited on the paper and are usually wrong.

**The image pipeline.** A generated image is the one thing in a Wall page measured in megabytes,
so it is the one thing worth compressing. Before the data URL reaches page content it goes
through `crates/wall-image`: decode, fit the long edge to 1400 because a page renders at 1280
wide and a figure is never all of it, flatten transparency onto the page background rather than
onto white, re-encode as JPEG at quality 82, and drop the metadata with the re-encode. On a
2400x1200 generated image that is **7.9MB down to 91KB, in 302ms**.

It is Rust compiled to wasm and inlined as base64, which means one implementation for the
desktop app, the web build and a served deployment, and no fetch for an asset in a shell that
loads its page over `file://`. It fails soft everywhere: an image that will not decode, a wasm
that will not instantiate, or a re-encode that came out larger all return the original, because
a slightly large picture is a better outcome than no picture.

Rust is here for this and not for the rest of the app. A whole wall of eight pages renders to
HTML in 0.18ms, which is a hundredth of a frame, so there is nothing else in the compute path
worth moving.

---

## 7. Shipping

`renderPage()` in `src/render.ts` turns the page model into standalone HTML: every token comes
from the taste sheet, the world's CSS is inlined, the backdrop is a couple of kilobytes of
inline script, and there is no framework and no runtime of ours.

- **full view** opens it in your browser. Desktop writes a temp file, the web build uses a Blob url.
- **download** writes it out. Desktop saves a real file and reports the path; the web build
  downloads it and reports the byte count.
The markdown spec still exists and is what the handoff writes, in `src/brief.ts`. There is no
longer a button that copies it: it lived in the brief rail, and that rail is gone along with the
section list's permanent column, because a wall of eight designs is not improved by two columns of
chrome standing beside it. If copying comes back it belongs on the dock beside download.

No accounts, no hosting of ours, no lock-in. The file is yours and it opens on its own.

---

## 7b. Handing back to the agent

The flow Wall exists for. You ask Claude Code for a landing page, it calls `design`, a wall opens
with your brief already in it, you pick one, and the choice comes back as a spec your agent
implements in your own codebase. Choosing happens where choosing is easy and building happens
where the code lives. `mcp/index.mjs` is the whole of it, in three tools: `design`, `collect`
and `check`.

```mermaid
sequenceDiagram
  participant C as your agent
  participant D as design
  participant S as the server it starts
  participant U as you
  C->>D: brief, name, oneLiner, what, audience, cta, dir
  D->>D: write dir/.wall/request.json, stamped format 1
  D->>S: start it, open a browser at it
  D-->>C: the wall is open at this url, call collect when they have chosen
  Note over C,U: seconds, not minutes. The agent is free and you are still reading.
  U->>S: pick a page, press "to Claude"
  S->>S: write chosen.html, chosen.json, chosen.md, taste.json, in that order
  C->>D: collect dir
  D-->>C: the spec, plus paths to the render and the structured page
```

**Returning without a choice is the normal answer, not an error.** `design` used to hold the call
for fifteen minutes, which is longer than any MCP client waits, so the usual outcome of a working
wall was a tool error, and an agent that reads an error tries again, which replaces the wall you
are halfway through reading. It now waits `WALL_WAIT_MS`, 25 seconds by default, in case the
choice is instant, and otherwise answers that the wall is open and that `collect` is the pickup.
The tool descriptions teach that two step, because they are the only place an agent can learn it.

**Everything the caller knows travels.** The agent has already read your project, so `design` asks
it for the one liner, the audience and the button label, and writes all of them into
`request.json`. When the one liner is there the app skips intake entirely, which is a model call
and about forty seconds. When it is not, the wall is arranged from the brief as it stands and put
on screen first, and the reading happens behind it under a line saying so.

**Every file carries a version.** `npx` keeps the writer current while whatever reads the
directory can be any age, so `request.json` is stamped `format: 1`, `chosen.json` is stamped
`format: 2` and `taste.json` is stamped `format: 1`, and each reader refuses a shape it does not
know rather than half reading it into a wrong answer.

**The cull story travels with the winner.** A page handed over on its own reads as though it
arrived on its own, and the next screen an agent writes drifts straight back into whatever was
culled. So `chosen.json` carries a `story` field, and `chosen.md` closes on a `## Why this one`
section written from it: what was pinned, what was turned away and what the detector read on it,
what was typed into the prompt bar and whether that page won, and which lines were retyped by
hand. The field is additive under the same `format: 2` on purpose. Bumping the number would make
every installed reader refuse the whole file to protect it from a field it can safely ignore.

**The order of the handoff is load bearing.** `chosen.md` is both the spec and the marker the
agent watches for, so it is written last of the three: the desktop shell takes a `BTreeMap` and
gets that for free, and the server sorts by name for the same reason. Finding it means the render
and the structured page are already there. `taste.json` sorts after it and that is fine, because
nothing polls for the memory: it is read at the start of the next wall, not at the end of this one.

**The server outlives the call and then stops on its own.** It holds API keys, so leaving it
running until logout is not acceptable, and killing it when `design` returns would close the
window mid-choice. So `WALL_IDLE_MS` is set to ten minutes by the spawner: any request resets the
clock, an open tab beats every twenty seconds by asking `/api/config`, and silence for that long
means the tab is gone and there is nobody left to serve. Unset means run forever, so `npm run
serve` and any deployment are untouched.

**Nothing to write with is said out loud.** After opening, `design` asks `/api/config` what the
machine holds, and if there is no key and no claude the reply says the eight pages are arranged
rather than written, so your agent can tell you before you spend time choosing between them.

`verify/mcp.mjs` drives this whole path over the real protocol, and `verify/oneline.mjs` drives
the first run version of it where nothing at all is installed.

---

## 7c. What the wall remembers

Every session labels design data and every session used to throw it away, so the tenth wall knew
exactly as much about you as the first. It now keeps a small file, and the next wall is dealt
with it in hand.

**The file.** `.wall/taste.json` in the project, beside the handoff, when an agent opened the
window. `localStorage['wall-taste']` when you opened it yourself. The two never merge, because a
taste belongs to the thing being designed and mixing a client's brand into a side project would
be worse than remembering nothing. It is stamped `format: 1`, and a shape this build does not
know reads as no memory at all.

**What is in it.** Up to twelve walls, newest last. Per wall: the date, the kind of thing it was
for, the pages kept with the chosen one first, the pages culled with the design tells they wore,
and what was typed into the bar. A page is written down as the handful of traits a preference
could be made of, the direction it grew from most of all, because a world's own name is whatever
the model called it that day and the direction is the stable thing. Nothing derived is stored.
Every signal is recomputed from the walls each time the file is read, which is what makes
deleting a line the way to forget a wall.

**Written at the choice, and only then.** Pressing "to Claude" writes it into the project;
pressing download writes it to the browser. A wall nobody chose from leaves nothing behind, and
choosing twice from one wall is still one wall, because a wall counted twice would weigh double
against every other wall in the file.

**How it biases the next wall.** `tasteLean()` reads the last eight walls of the same kind and
scores each direction: three for being chosen, two for surviving triage pinned, minus one for
being culled. Three things then happen, in `src/compose.ts`:

- the deal takes at most two of the five hands from what scored well, and never deals a direction
  scored down twice
- the design call for a favoured hand is told what your kept pages have in common; every hand,
  favoured or not, is told which tells you have removed pages for
- the copy call is told the same removals, after the detector's own note about the page in front
  of it

**At least three hands are always wild.** This is the whole risk of the feature and the guarantee
is structural rather than tuned. The failure mode of a system that learns your taste is that it
stops showing you anything else, and a wall of eight pages you already like is not a wall. So the
favoured count is capped at two, a dislike has to be repeated before anything stops being dealt,
the note about what you like never reaches a wild hand, and the log is capped at twelve so a
taste can move rather than only accumulate. `verify/app.mjs` deals twelve walls from a log biased
as hard as a log can be and fails if any deal takes more than two favoured hands, if a shunned
direction is dealt at all, or if fewer than ten of the twelve deals differ.

**Deleting a line is how you forget.** It is a small JSON file written to be read: open it, take
out the wall you regret, and the bias follows on the next build, because the scores were never
stored anywhere else. Deleting the file entirely starts you over.

---

## 8. One app, three shells

`src/host.ts` is the only file that knows where Wall is running. Everything above it is the same
code, so the web version is the desktop version rather than a reduced copy.

| Shell | State | Export | Model calls | Keys |
| --- | --- | --- | --- | --- |
| Tauri | a command to the Rust side | a real file on disk | the page, over a fetch that travels through Rust | the system keychain |
| Web | `localStorage` | Blob download | straight from the tab | your browser |
| Served | `localStorage` | Blob download | `/api/stream` on the server | the server only |

Which host answers is decided by what is present: Tauri injects `__TAURI_INTERNALS__`, a server
injects a flag into the page it serves, and neither means the visitor brings their own key.

**Why Tauri, and what it does not change.** Electron shipped a whole browser, so the download was
150 to 250MB; the Tauri build is a 5.9MB app and a 3.0MB dmg, which is 46 times smaller. Nothing
got faster: the wall is model latency, and the compute path was already a hundredth of a frame. It
is a distribution change, and it matters for the day the desktop app ships, because a 200MB
download is a decision and a 6MB one is not.

What ships today asks for neither. An agent run opens the browser, since `npx` needs no toolchain
and gives the operating system nothing to refuse to open, which is why Windows and Linux work
without a build and why a run is never stale.

The one thing it could have cost is the rule that `shared/providers.mjs` is the only model path.
A Rust main process would mean the request shapes, the SSE splitting and the delta extraction
written twice, and the second copy drifting. It does not, because only the transport moves:
`setFetch()` takes Tauri's fetch, which goes through Rust and so has no preflight to negotiate,
and every line above it is the same file the browser runs.

Two smaller differences are real and handled. The window drag handle is `-webkit-app-region` in
Chromium and a `data-tauri-drag-region` attribute in WebKit, so the header carries the attribute
under Tauri or the window cannot be moved by its own header. And what a command is allowed to do
is declared in `src-tauri/capabilities/default.json` rather than implied, which is why the model
endpoints are listed there.

`server/index.mjs` is one file with no dependencies. It serves the built `dist/` and holds the
keys, and `/api/config` tells the app which providers it already has, so the app stops asking for
a key it does not need. Two ceilings exist for public deployments, both off unless set, because
an instance paying with its own key does not need protecting from itself:

```
WALL_WALLS_PER_HOUR=5             # per address
WALL_DAILY_OUTPUT_TOKENS=500000   # whole deployment
WALL_IDLE_MS=600000               # stop after this much silence, unset means never
```

The unit is the wall rather than the request, because one click is eight calls. `WALL_IDLE_MS` is
for the copy an agent starts, which nothing else is in a position to end; a deployment leaves it
unset and runs until it is stopped.

`shared/providers.mjs` is the single model path for every shell: request shapes, SSE splitting,
and delta extraction for the Anthropic and OpenAI wire formats. Two shapes cover every vendor in
the picker.

---

## 8b. The motion studio

Everything above makes whole pages. This is the other half: motion for a component that already
exists, either one of yours on disk or one in an app that is running right now.

```
npm run studio                                            opens on examples/components
npm run studio -- ~/app/src/components --css ~/app/src/globals.css
npm run studio -- --app http://localhost:3000             your dev server, elements picked by hand
```

The loop is try several and keep one, which is why it is a room rather than a command. Pick a
component and it renders straight away; ask for motion and `dealMotions` deals a different verb from
the deck to each slot, so the options disagree by construction rather than being four takes on a
fade. Every option is held at the same instant by one transport, so comparing them is a real
comparison. `More like this` keeps the one that nearly worked and varies how it is carried out,
because four fresh unrelated ideas is the right way to start and the wrong way to finish.

Four gates stand between a reply and a card on screen, and they are the same ones the MCP `motion`
tool uses: `safeStyle` for what is allowed in a sheet at all, `unmoved` for a motion that is really
one transition wearing a costume, `brittle` for selectors pinned to utility classes that will stop
matching the first time somebody changes a width, and `scopeOf`, which reads the attribute the sheet
hangs on out of the sheet rather than believing the field beside it. A slot a gate turns down is
retried once, told what was wrong, because being handed one option after asking for four is a bad
trade when the complaint was specific.

Two things make it work on real components rather than only on toys:

- **shadcn needs Tailwind to be shadcn.** Rendered without it a card is a column of unstyled text,
  and motion written against a component with no cards is motion for a layout that does not exist.
  The browser build is fetched once into `.studio/` and served from there, so every preview after the
  first makes no network request. Colours come from `themeOf`, so the component can be seen in eight
  palettes that have already passed a contrast gate.
- **A running app is better input than a file.** Reading a component out of a `.tsx` is a brace
  counter and a hope. With `--app` the dev server is served through the studio's own origin, which
  makes the iframe same origin, which makes its dom readable. Clicking an element sends up the
  rendered subtree, the rules that actually matched it, and the custom properties in force on it,
  since an app declares its tokens on whatever ancestor it likes and those rules match the ancestor
  rather than the element. Studio routes live under `/__wall` so an app with its own `/api` cannot
  collide, everything else is forwarded, and the websocket upgrade is passed through so hot reload
  survives.

Four gates read the css and a fifth one looks. `unmoved`, `brittle`, `janky` and `scopeOf` all take a
string, which leaves the hardest promise in the prompt unchecked: a component has to be exactly where
it started once the animation is over. A sheet can stagger properly, use a named curve, animate only
transform, and still end on `translateY(12px)` or `opacity: 0`, which nudges somebody's layout for
good or leaves the component invisible. So each option is also rendered twice, once with the motion
held past its end and once without it at all, and every element's box and opacity are compared. Both
of those failures were reproduced first and confirmed to pass all four textual gates.

A pick is captured twice, for two readers. The model gets the markup and the rules that matched it,
because a selector written against real class names still means something after somebody edits the
component. A preview gets a snapshot: a clone with every computed value written onto it, which needs
no collected rules and cannot be let down by one that was missed. Measured across four sites, a
heading that laid out at 31 percent of its height came back at 100, a button at 57 came back at 100,
a list at 62 came back at 100, and nothing got worse. It costs a kilobyte or three.

`node verify/studio-capture.mjs --deep` asks what survives being picked: twenty sites by ten kinds of
element, each capture re-rendered on its own and measured against the element it came from. It found
that captures kept every node and still collapsed, because font size and line height are inherited and
so live on an ancestor no matched rule mentions. Stripe's heading came back at 18 percent of its
height before that was fixed and 100 percent after. Svg is the weakest kind at 5 of 11 and is the
obvious next thing to chase.

`node verify/studio-sites.mjs` aims the studio at twenty real sites in turn and checks four things
for each: that the frame stays inside the proxy, that its dom arrives, that its stylesheets can be
read, and that clicking something hands back an element with css attached. Every proxy bug so far was
found this way and none of them appear against a fixture. Nineteen of the twenty work; npm sits behind
a bot check, which a proxy cannot pass and which the studio says out loud rather than showing a blank
frame.

`Export` writes one html file with every option in it, the transport included, no requests at all.
The options share a document rather than sitting in iframes, which they can only do because each
sheet is already scoped to an attribute: option two gets `data-motion-fold-2` and its selectors are
rewritten to match, so four sheets coexist. That file is the thing you attach to a pull request.

It opens on port 4321, and a port that is already answering steps to the next free one and says so,
because two studios at once is a reasonable pair to want: one on a folder of components, one on a
running app. The same is true of `npm run serve` on 8080. `PORT=0` still means whatever is free,
which is what the suites rely on so a leftover process cannot quietly answer for a new one.

`shot.mjs` and `film.mjs` are the other end of it: a camera pass over a component, then that move
rendered frame by frame. The frames are the deliverable and mp4 only happens if ffmpeg is installed,
which is said out loud rather than silently skipped.

---

## 9. Development flows

```
npm run web            # the Vite dev server, what an agent run opens
npm run app            # the desktop shell, not released yet
npm run app:bundle     # a real .app and dmg, for when it is
npm run serve          # the built app behind the server, with its own keys
npm run try            # what an agent run does, without needing an agent: brief, server, browser
npm run watch          # rebuild dist on every change, so try and the suites are never stale
npm run wallclock      # how long a whole wall takes, measured through the real app
npm run studio         # motion for components you have, or for an app that is running
npm run build:wasm     # rebuild the image crate and inline it, needs Rust
```

`npm run build` already builds the headless core, since `dist-core/core.js` is what the `check`
tool imports and a stale one would answer for a detector nobody is running.

Only `build:wasm` needs the Rust toolchain, and only someone changing `crates/wall-image` needs
to run it, because its output is committed. A fresh clone builds, runs and verifies without Rust
installed. Building the desktop app needs Rust; building and verifying the web app does not.

### Verifying

In order of how much they prove:

```
npm run verify         # the app in a real browser against a mock model, and the house gate
npm run verify:server  # the real server against a recorded upstream, asserting the visitor holds no key
npm run verify:stream  # the real streaming path, no mock anywhere
npm run verify:hard    # copy that fights back: markup, braces, other scripts, other alphabets
npm run verify:beat    # the thinking beat, and that none of it reaches the reply
npm run verify:cli     # what a failed local session says it failed for
npm run verify:image   # the image pipeline, no browser and no Rust needed
npm run verify:tauri   # the desktop shell's own commands, in Rust, with no window
npm run verify:mcp     # the agent path over the real protocol, brief to spec
npm run verify:oneline # the same path on a machine with nothing installed
npm run verify:update  # what the published tarball carries, and how it is cached
npm run verify:all     # all of them
```

`npm run verify` is the house gate and runs `verify/layout.mjs` inside itself, which renders
every built in world on every look at three widths and fails if Wall's own output trips its own
slop catalogue. There is no separate command for it, because a geometry check nobody runs is a
geometry check nobody has. It also opens no browser for its first three sections: the house gate,
the escaping check, and the two node level checks on the taste log, one feeding it a hostile file
and one proving the deal stays wild under a log biased as hard as a log can be.

The two agent suites stand in for the local Claude with `verify/fakebin/claude`, which they put
on PATH along with a do-nothing `open`. Both are in the repository rather than in a temporary
directory, because a fixture a reboot can take away does not fail loudly when it goes: the suite
starts calling the real model instead, which is slow, costs money, and on a machine with no
session fails fast enough that a wall of unwritten drafts reads as a pass.

`verify:image` reads the committed wasm rather than the crate's build output, because that is
what ships, and builds its own input with zlib rather than loading a fixture, because a suite
with a binary to explain is a suite that rots. The input is low frequency colour with grain over
it rather than static: pure noise is the one thing JPEG cannot compress and no model produces, so
a suite built on it would measure the worst case and report it as the normal one.

`verify:stream` runs the app against a local server speaking Anthropic's wire format, so the
reader loop, SSE framing, split frames, fenced JSON, the partial JSON walk and the progressive
repaint are all exercised. It asserts that papers appear while the models are still writing,
that the wall never exceeds nine (which is the one id per stream upsert holding), that the eight
angles produce eight distinct headlines, and that a wall spans distinct worlds and distinct
looks. Eight pages quietly converging is a test failure rather than something noticed months
later.

Copy rules are asserted too: no all caps, no em dashes, no decorative symbols. A regression fails
the suite rather than shipping.

### Capturing a real run

```
WALL_KEY=$(cat ~/.wall-test-key) npm run capture
```

This drives the real app against the real API through a recording proxy and writes every byte of
every stream, with chunk timing, into `fixtures/`. `verify:stream` replays those captures at
their recorded pace, so the streaming path stays covered forever without a key and without
spending tokens. Pace is recorded because a replay that dumps everything at once would prove
nothing about whether papers visibly fill in.

The fixtures hold response bodies only. No request headers are recorded, so no key can end up in
them. Section ids are rewritten on replay to match the incoming request, since the app merges
replies by id, and with no fixtures present the server falls back to a synthetic stream so the
suite runs on a fresh clone.

### Screenshots

```
node tools/shots.mjs   # into shots/, which is not committed
```

`shots/` is generated output and stays out of the repo. The two images in `docs/images/` are
copies kept deliberately, and they go stale unless refreshed with the flow they illustrate.
