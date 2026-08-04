# WALL

**Twelve landing pages, then one.**

Generating a page is solved. What nobody gives you is *many at once*, live, side by side —
which is how design decisions are actually made. WALL's one act is **compare and choose**.

Docs: [flows](docs/flows.md) (every path through the app, and the code that carries it) ·
[architecture](docs/architecture.md) (the module map and the boundaries) ·
[landing page prompt](docs/landing-page-prompt.md) (a brief for Wall's own marketing page).

## The look

Linear/Framer discipline: **Inter Variable** bundled (offline, no CDN), hairlines instead
of borders, one accent (indigo), 10–13px type with real tracking, controls that are
invisible until hovered, a floating dock over the canvas rather than docked toolbars, and
130ms transitions. The header is the window drag handle (controls opt out) — the standard
Electron pattern, not an overlay strip.

## The studio

Brief on the left, **the paper in the middle**, sections on the right. Alternatives sit
either side of the paper — scroll sideways (or ← →) and the next one slides into the
centre. Click any alternative to make it the working page.

**AI-native.** A prompt bar runs under the paper with model chips — **Claude** or **GPT**
— and prompting makes *variants*: one instruction produces three new pages placed to the
right, so you compare rather than overwrite. Both providers are called from Electron's
main process, so there is no CORS wall and no proxy. Keys stay on your machine, and
everything except copywriting works without them.

**Section by section.** The right rail lists every section: cycle its layout, move it,
hide it, add new ones — and each has **its own prompt** ("make this section about the
pain, not the feature"). Every section (and the whole page) can **copy a brief** — a
markdown spec with the copy and the design tokens, ready to paste into Claude Code, v0,
or a designer's inbox.

**Direct manipulation.** Click any text *on the paper itself* and type — the edit flows
back into the page model, not just the pixels.

## How it works

1. **Brief** — product, one line, what it is, audience, three things it does.
2. **Taste sheet** — pick a preset, or **drop a screenshot of a page you love** and WALL
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

## Verified (`node verify.mjs`, headless Electron)

twelve cells covering all six archetypes · **12 structurally distinct documents**, not
clones (checked by computed styles inside each iframe) · pages are live DOM with real
headings and working links · pin + cross produces a child variant · **ship writes a
5.6 KB self-contained HTML file** containing your headline · zero errors.

Run: `npm install && npm run build && npm start`.

Design: `DESIGN.md`. Next (M2–M4): model-written copy variants and breeding by
instruction; the shader focus layer over the live wall; generated hero art from the taste
sheet; the truth loop that brings real PostHog numbers back onto the wall.

## First run

Onboarding runs once and ends by building your page, so the setup produces something
instead of only explaining. Three steps: what Wall is, your product, your taste. Reopen the
explanation any time from the help button in the header.

Model keys are optional. Wall builds pages, layouts, and variants on your machine with no
key at all. A key is used only when you ask a model to write copy, and it stays in this
app's storage.

## House rules

Copy follows the prompt-engineering skill: no all-caps, no em-dashes, no decorative
symbols, and every instruction states its reason. `verify.mjs` asserts this against the
onboarding card, so a regression fails the suite rather than shipping.

Code follows the thermo-nuclear review skill. The model lives in `sections.ts`, HTML
generation in `render.ts`, markdown briefs in `brief.ts`, and the model path in
`compose.ts`. Keep logic in whichever of those owns the data it reads, and keep every file
far from 1k lines.

## Verifying

```
npm run build && node verify.mjs   # full suite against the real Electron app
node shots.mjs                     # screenshots into shots/
```

## Two builds, one app

`src/host.ts` is the only file that knows where Wall is running. Electron answers over IPC,
because the main process has no CORS wall and can write real files. The browser answers for
itself with localStorage, a Blob download, and a direct call to the model. Everything above
that boundary is the same code, so the web version is the desktop version rather than a
reduced copy.

```
npm run app          # desktop
npm run web          # web, at the Vite dev server
npm run verify       # desktop suite
npm run verify:web   # the same assertions in plain Chromium
```

The web build is a static `dist/`, with `base: './'`, so it hosts anywhere.

## Streaming

`shared/providers.mjs` holds one model path for both builds: request shapes, SSE splitting,
and delta extraction for Anthropic and OpenAI. `streamedSections()` in `compose.ts` walks a
partial reply and yields each section object as it finishes arriving, tracking strings and
brace depth so a closing brace inside a headline does not end an object early. A page keeps
one id for its whole stream, so a paper appears on its first finished section and then fills
in, rather than arriving all at once at the end.

Papers repaint per completed section, not per delta. A real stream delivers a few characters
at a time, and repainting on every delta would re-serialize eight pages hundreds of times for
the same content.

## Verifying the stream

Three suites, in order of how much they prove:

```
npm run verify         # desktop, mock model
npm run verify:web     # the same assertions in plain Chromium
npm run verify:stream  # the real streaming path, no mock anywhere
npm run verify:all     # all three
```

`verify:stream` runs the app against a local server speaking Anthropic's wire format, so the
reader loop, SSE framing, split frames, fenced JSON, the partial JSON walk and the
progressive repaint are all exercised. It asserts that papers appear while the models are
still writing, that the wall never exceeds nine (which is the one-id-per-stream upsert
holding), and that the eight angles produce eight distinct headlines.

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
display, nested cards, card soup.

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
what is present. Electron uses its bridge, a served page uses the server, and a plain static
build falls back to the visitor's own key.

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

`npm run verify:server` runs the real server against a recorded upstream in a real browser,
and asserts the visitor never holds a key.

## Wall as a tool your agent can call

One line, and nothing else to install:

```
claude mcp add --scope user wall -- npx -y wall-mcp
```

Ask for a landing page. Wall opens, you pick one, and the choice arrives in your project as a
spec your agent implements.

Where it opens depends on what is there. A desktop app if one is installed, and otherwise a
local server and whichever browser you already have. The browser route is the one a first run
takes: no download, no toolchain, and nothing for the operating system to refuse to open, which
matters because the install is the part of a first run that leaks most. It also means Windows
and Linux work without a build.

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

`npm run verify:mcp` speaks the protocol to the real server, launches the real desktop with a
request file, drives it the way a person would, and reads the handoff back through `collect`.
