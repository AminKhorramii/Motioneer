# Development notes

Everything here used to live in the README. It is the long-form record of how Wall is
built, verified, and run; the README stays minimal on purpose.

What ships today is the MCP server: an agent calls `design`, Wall opens in the browser, and
the chosen page returns as a spec. The desktop shell is built and verified in this repo but
is not released yet, so where these notes describe it, read them as how it works rather than
as how anyone reaches it. The wall below is the same code either way, which is the point of
the `host.ts` boundary.

## The look

Linear/Framer discipline: **Inter Variable** bundled (offline, no CDN), hairlines instead
of borders, one accent (indigo), 10–13px type with real tracking, controls that are
invisible until hovered, a floating dock over the canvas rather than docked toolbars, and
130ms transitions. The header is the window drag handle (controls opt out) rather than an
overlay strip.

## The wall

Brief on the left, **the paper in the middle**, sections on the right. Alternatives sit
either side of the paper — scroll sideways (or ← →) and the next one slides into the
centre. Click any alternative to make it the working page.

**AI-native.** A prompt bar runs under the paper with model chips — **Claude** or **GPT**
— and prompting makes *variants*: an instruction produces a new page placed to the
right, so you compare rather than overwrite. The desktop app's requests travel through its
own process, so there is no CORS wall and no proxy. Keys stay on your machine, in the system
keychain, and everything except copywriting works without them.

**Section by section.** The right rail lists every section: cycle its layout, move it,
hide it, add new ones — and each has **its own prompt** ("make this section about the
pain, not the feature"). Every section (and the whole page) can **copy a brief** — a
markdown spec with the copy and the design tokens, ready to paste into Claude Code, v0,
or a designer's inbox.

**Direct manipulation.** Click any text *on the paper itself* and type — the edit flows
back into the page model, not just the pixels.

## The motion studio

A second room, and the same act. `npm run studio` opens on the components in `examples/`, or on
a folder you name, or on a running dev server with `--app`. Pick a component and ask, and five
motions arrive at once, each dealt a different verb and a different errand from the deck so they
disagree by construction rather than being five takes on a fade. One scrubber holds all of them
at the same instant, which is the only way comparing them is real.

**Type an address into the sidebar** and that page is proxied and pickable, with the five most recent
kept in the rail. **Pointing at a running app** is better than pointing at a file. Reading a component out of a
`.tsx` is a brace counter and a hope; a rendered dom is the answer. The dev server is proxied
through the studio's own origin so the frame is same origin and its dom can be read, studio
routes live under `/__wall` so an app with its own `/api` cannot collide, and the websocket
upgrade is passed through so hot reload survives. A pick is captured twice: the markup and the
rules that matched it for the model, because a selector against real class names still means
something next month, and a snapshot with every computed value written onto it for the preview,
because a reconstruction leaks and the leak was measurable.

**Seven gates**, six of which read the sheet and one of which looks at it. `safeStyle` bounds
what a sheet may contain, `unmoved` rejects a transition wearing a costume, `brittle` rejects
selectors pinned to utility classes, `janky` rejects keyframes that move layout properties,
`unstill` requires a reduced motion query, and `leaks` rejects a selector that does not start from
the scope attribute and would therefore animate everything matching it in the host application. The
seventh renders the option twice, once held past the end of its motion and once without the motion at
all, and compares every element's box and opacity: a sheet can satisfy every reading of the text and
still leave the component twelve pixels down forever, or invisible, or animating nothing at all.

**Ordered by what the rendering saw.** The same pass measures how much of the component takes part,
how far anything strays outside its box, and how much is invisible at the first frame, and options are
sorted by the last two. Keyframe names are rewritten to carry the scope, since `@keyframes` is one
global namespace and a sheet defining `rise` replaces the host's own.

**Adjusting beats regenerating.** Slower, further apart, land harder: each is arithmetic on
numbers already in the sheet, so `retimed` rewrites them in place and the original stays.

**Several elements make a rail**: one motion each on a single timeline, each starting a beat
after the one above it, sequenced by holding each at `t` minus its own offset rather than by
rewriting anybody's delays.

## How it works

1. **Brief** — product, one line, what it is, audience, three things it does.
2. **Taste sheet** — pick a preset, or **drop a screenshot of a page you love** and Wall
   reads the system out of it: background, ink, accents, contrast, and turns them into an
   editable contract (density / scale / radius knobs). Everything is generated against
   this — "more like Linear, less like a template" becomes a spec, not a wish.
3. **Forge twelve** — six layout archetypes (centered · split · editorial · bento ·
   manifesto · terminal) × drifted variations of your taste, rendered as **live pages**,
   not screenshots. Instant. Local. No API key, no cloud, no template gallery.
4. **Pin · more like this · × pinned** — breeding, not prompting. Cross two variants and
   the child takes one's layout and the other's typography.
5. **Open · ship this** — exports a real self-contained `index.html` you own (inlined CSS,
   no framework, no runtime of ours), or opens it in your browser.

## First run

Onboarding runs once and ends by building your page, so the setup produces something
instead of only explaining. Two steps: which model writes, and what it writes about. Reopen
the explanation any time from the help button in the header.

Model keys are optional. Wall builds pages, layouts, and variants on your machine with no
key at all. A key is used only when you ask a model to write copy, and it stays in this
app's storage.

## House rules

Copy follows the prompt-engineering skill: no all-caps, no em-dashes, no decorative
symbols, and every instruction states its reason. `verify/app.mjs` asserts this against the
onboarding card, so a regression fails the suite rather than shipping.

Code follows the thermo-nuclear review skill. The model lives in `sections.ts`, HTML
generation in `render.ts`, markdown briefs in `brief.ts`, and the model path in
`compose.ts`. Everything opinionated, worlds, presets, faces, angles, craft rules, the slop
catalogue, the direction library, the system prompts, is data under `src/design/`, one file per kind of knowledge,
so taste is tuned without touching machinery. Keep logic in whichever file owns the data it
reads, and keep every file far from 1k lines.

## Two builds, one app

`src/host.ts` is the only file that knows where Wall is running. The desktop app answers with
Rust commands, because it can write real files and reach a vendor without preflight. The browser
answers for itself with localStorage, a Blob download, and a direct call to the model. Everything
above that boundary is the same code, so the web version is the desktop version rather than a
reduced copy.

```
npm run web          # web, at the Vite dev server, what an agent run opens
npm run app          # the desktop shell, not released yet
npm run verify       # the app, driven in a real browser
npm run verify:tauri # the desktop shell, checked without a window
```

The web build is a static `dist/`, with `base: './'`, so it hosts anywhere.

## Streaming

`shared/providers.mjs` holds one model path for both builds: request shapes, SSE splitting,
and delta extraction for Anthropic and OpenAI. `scanSections()` in `compose.ts` walks a
partial reply and yields each section object as it finishes arriving, tracking strings and
brace depth so a closing brace inside a headline does not end an object early. A page keeps
one id for its whole stream, so a paper appears on its first finished section and then fills
in, rather than arriving all at once at the end.

Papers repaint per completed section, not per delta. A real stream delivers a few characters
at a time, and repainting on every delta would re-serialize eight pages hundreds of times for
the same content.

## Verifying

Suites, in order of how much they prove:

```
npm run verify         # the app, mock model
npm run verify:stream  # the real streaming path, no mock anywhere
npm run verify:image   # the image pipeline
npm run verify:mcp     # the MCP tools over the real protocol, brief to spec, nothing stubbed but the model
npm run verify:server  # the self-hosted server, key never reaches the visitor
npm run verify:all     # everything
node tools/shots.mjs   # screenshots into shots/
```

What `verify/app.mjs` (headless Chromium) asserts: the house gate first, every built-in world
on every preset look rendered and failed if Wall's own output trips the slop catalogue ·
onboarding, intake and the required-field gate · a nine paper wall with distinct headlines ·
triage: pin survives x, remove, restore · slop chips with reasons on every grid cell · direct
edits landing in the model · ship writes a self-contained HTML file · zero page errors.

`verify:stream` runs the app against a local server speaking Anthropic's wire format, so the
reader loop, SSE framing, split frames, fenced JSON, the partial JSON walk and the
progressive repaint are all exercised. It asserts that papers appear while the models are
still writing, that the wall never exceeds nine (which is the one-id-per-stream upsert
holding), and that the eight angles produce eight distinct headlines.

`npm run verify:update` holds the update channel itself. Wall updates by publish, since `npx`
resolves the latest version on every run, so the suite asserts what that rests on: the package
answers to the name in the one line, it is publishable, the tarball npm would build carries
everything the entry points import, the version clients are told is the one in package.json,
and a redeploy cannot strand a cached page. The handoff files carry a format number, checked
live by `verify:oneline`, because the writer is always current while whatever reads the
directory can be any age.

## Capturing a real run

```
WALL_KEY=$(cat ~/.wall-test-key) npm run capture
```

This drives the real app against the real API through a recording proxy, and writes every
byte of every stream, with chunk timing, into `fixtures/`. `verify:stream` then replays those
captures at their recorded pace, so the streaming path stays covered forever without a key
and without spending tokens. Pace is recorded because a replay that dumps everything at once
would prove nothing about whether papers visibly fill in.

Section ids are rewritten on replay to match the incoming request, since the app merges
replies by id. With no fixtures present the server falls back to a synthetic stream, so the
suite runs on a fresh clone.

## Slop detection

`src/slop.ts` names the patterns a model reaches for when it has nothing specific to say,
following the catalogue at impeccable.style: hollow words, generic calls to action, vague
headlines, hero eyebrow chips, ai beige, glassmorphism, default drop shadows, italic serif
display, nested cards, card soup, interchangeable claims, unverifiable user counts, made with
love, the purple gradient, drawn terminal windows, transition on everything, over-rounding.

`src/craft.ts` is its positive counterpart: what a page does when it has something to say,
led by the swap test, that a claim must carry a detail a competitor could not paste without
lying. Slop runs as a detector over a finished page; craft travels in the system prompt, where
it shapes the writing before there is anything to detect.

It runs locally on the page model and the rendered HTML, so it is free and instant. That is
what lets it run *before* the model call, where its findings are passed into the prompt as
things to avoid, rather than only after, where they would just be a report. The film bar
shows `clean` or `N generic` for the paper in the middle, with the reasons on hover.

## Backdrops and images

A landing page needs something behind the words. Wall draws it rather than generating a
photograph, for two reasons: a generated hero image is the fastest way to look like every
other page, and one image embedded as a data URI outweighs the entire document.

`src/backdrop.ts` has three, all seeded from the taste sheet so the art changes when the
palette does: `contours` and `ridge` are WebGL2 fields of topographic lines, `grain` is a
still texture drawn once. They honour `prefers-reduced-motion`, pause when the tab is hidden,
fall back to a gradient without WebGL2, and cost about 2KB inside the page. A wall walks
through them, so the eight papers differ before you read a word.

Generated images are available where a section shows a figure, through Gemini, behind the
same host boundary as everything else. The prompt rules out text hardest of all, because
words baked into an image cannot be edited on the paper and are usually wrong. The result is
stored as a data URL in the page content, so it still ships as one file. Expect the page to
grow by roughly a megabyte per image, which is why the drawn backdrops are the default.

## Design worlds

A variant used to be a shuffle: every section picked a layout at random and the palette was
jittered. That buys variety without identity, so eight papers came out as eight shuffles
rather than eight designs.

`src/worlds.ts` defines six worlds, each one set of decisions that propagate together: type
pairing and scale, tracking and weight, radius, density, whether sections carry hairline rules
or numbers, whether they sit in a column or run edge to edge, the measure in characters, how
figures are treated, which backdrop belongs to it, and which layout each section kind wears.
Palette moves are relationships rather than random shifts: monochrome, tinted paper, pushed
contrast.

A variant is now an angle crossed with a world: what the page argues, and how it is built.
The world name sits under the paper and clicking it rebuilds the page in the next one.
`verify:stream` asserts a wall spans distinct worlds and distinct looks, so eight pages
quietly converging is a test failure rather than something you notice months later.

## Running it as a server

`server/index.mjs` is one file with no dependencies. It serves the built app and holds the
model keys, so they never reach a browser. The same `dist/` works either way: the server
announces itself by injecting a flag into the page it serves, and the app picks its host from
what is present. The desktop app uses its commands, a served page uses the server, and a plain
static build falls back to the visitor's own key.

```
ANTHROPIC_API_KEY=... npm run serve          # self hosted, your key, your machine
PORT=8080 GEMINI_API_KEY=... npm run serve   # images too
```

For a public deployment there are two ceilings, both off unless set, because an instance
paying with its own key does not need protecting from itself:

```
WALL_WALLS_PER_HOUR=5            # per address
WALL_DAILY_OUTPUT_TOKENS=500000  # whole deployment
```

The unit is the wall rather than the request, because one click is eight calls. Measured from
real captures, one wall costs about 14,000 input and 16,000 output tokens and takes around 28
seconds.

`WALL_MODEL` picks the model. The task here is short JSON copy rather than code, since the
renderer produces the HTML, so a small model may do it as well as a large one at a fraction of
the cost.

## Wall as a tool your agent can call

One line, and nothing else to install:

```
claude mcp add --scope user wall -- npx -y wall-mcp
```

Ask for a landing page. Wall opens, you pick one, and the choice arrives in your project as a
spec your agent implements.

Where it opens depends on what is there. A desktop build if `WALL_APP` points at one or a
clone has built it, and otherwise a local server and whichever browser you already have. The
browser route is the one a first run takes: no download, no toolchain, and nothing for the
operating system to refuse to open, which matters because the install is the part of a first
run that leaks most. It also means Windows and Linux work without a build, and it is why a run
is never stale: `npx` resolves the latest published version each time, where an installed app
stays whatever it was the day it was downloaded.

Keys are held by the local server in `~/.wall/config.json`, not by the page. A browser tab keeps
them per origin, so a server on a different port every run would lose them and ask again.

From a clone, point it at the file instead:

```
claude mcp add --scope user wall -- node /path/to/wall/mcp/index.mjs
```

Then ask for a landing page. Your agent calls `design` with whatever brief exists, the desktop
opens with it already filled in and skips setup entirely, you browse a wall of real pages and
press send back, and the choice returns as a spec.

The spec is what travels, not the file. It carries the tokens once, the world's structural
decisions, and every section with its copy, so your agent implements the page in your own
stack rather than handing you a static file to port. The reference render and the page model
go into `.wall/` beside it.

Three tools:

- `design` opens Wall and waits. A person browsing takes longer than any sensible timeout, so
  if it gives up the answer is still written to disk.
- `collect` reads a design chosen after `design` stopped waiting.
- `check` reports the patterns that make a page look generated, with the reason each matters.

## Roadmap

Next (M2–M4): model-written copy variants and breeding by instruction; the shader focus
layer over the live wall; generated hero art from the taste sheet; the truth loop that
brings real PostHog numbers back onto the wall.
