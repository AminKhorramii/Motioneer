# Architecture

Where everything lives, and the rule that decides which file owns what: logic goes in whichever
module owns the data it reads. Files stay far from a thousand lines.

## The map

```
src/
  sections.ts   the page model. the single source of shape
  worlds.ts     design worlds: one set of decisions that propagate together
  taste.ts      taste in both senses: the sheet a variant is made against, and what you keep
  render.ts     page model to standalone HTML
  backdrop.ts   drawn art, seeded from the taste sheet
  brief.ts      page model to a markdown spec
  slop.ts       the generic patterns, checked locally
  written.ts    a page the model wrote whole, and the filter between its markup and the wall
  reply.ts      reading an object out of a model reply that is partial, fenced or not quite JSON
  compose.ts    the model path: angles, fan out, streaming, partial JSON
  host.ts       the only file that knows where Wall is running
  core.ts       the headless core, exported for shells with no DOM

  App.tsx       the studio: state, the wall, keyboard and wheel, persistence
  Dock.tsx      what you ask for, and where you are
  SectionsRail.tsx  the section list and its controls
  BriefRail.tsx     the brief and the taste sheet
  Onboarding.tsx    first run, in two steps
  models.tsx    the vendors, and their marks drawn rather than fetched
  wall.css      the chrome

  imagepipe.ts  the image pipeline as the app sees it, wasm underneath
  imagewasm.ts  generated: the crate, inlined as base64

shared/providers.mjs   one model path for every shell
shared/port.mjs        binds the port asked for, or the next free one, and says which
mcp/index.mjs          the three tools an agent calls, and how Wall is opened
src-tauri/             the desktop shell, built but not released yet
crates/wall-image/     decode, fit, flatten, re-encode. compiled to wasm
server/index.mjs       serves dist and holds the keys
fixtures/              recorded upstream streams, response bodies only

verify/                the suites, in order of how much they prove
  harness.mjs          one way to open the app for a suite
  fake-upstream.mjs    a local vendor, replaying fixtures at their recorded pace
  app.mjs              the app, mock model, and the house gate first
  stream.mjs           the real streaming path, no mock anywhere
  hard.mjs             an overgrown page, copy written to break the parser
  beat.mjs             the heartbeat the server sends so a wait is not a hang
  image.mjs            the image pipeline
  mcp.mjs              the agent path end to end, protocol to handoff
  server.mjs           the self hosted server, key never reaches the visitor
  tauri.mjs            the desktop shell, checked without a window
  oneline.mjs          the handoff format, and its format number
  update.mjs           the update channel: publishable, complete, never stranded
  studio-sites.mjs     twenty real sites through the proxy, picked one at a time
  studio-capture.mjs   what survives being picked, by site and by kind of element

tools/                 run by hand or at author time, never at run time
  try.mjs              the loop for working on Wall itself
  studio.mjs           motion for components you already have, or for a running app
  animate.mjs          the same job as one command, for a file rather than a room
  motion.mjs           moving marks, drawn and animated in one call
  shot.mjs             a camera pass over a component: macro, tilted, shallow focus
  film.mjs             renders a folder of shots frame by frame, mp4 if ffmpeg is there
  capture.mjs          record real streams into fixtures/
  shots.mjs            screenshots into shots/
  wallclock.mjs        how long a whole wall takes, measured through the real app
  fonts.mjs            generates src/typefaces.ts, committed
  wasm.mjs             generates src/imagewasm.ts from the crate, committed

examples/components/   shadcn shaped components with repeated parts, what the studio opens on
```

## The data model

```ts
Page {
  id
  taste: Taste          // colours, faces, scale, radius, density, weight, caps, motion
  sections: Section[]   // ordered
  angle?: string        // what this page argues
  world?: WorldId       // how it is built
  backdrop?: Backdrop
}

Section { id, kind, variant, on, content }
```

Nine kinds exist: hero, logos, features, showcase, quote, pricing, faq, cta, footer. Each has
between one and four layout variants. A world chooses which kinds exist, in what order, and
which variant each one wears, so pages differ in silhouette rather than only in surface.

Content is an untyped bag per kind because it is what a model fills in and what `applyEdit()`
writes into by path. Everything that reads it is one `switch` in `render.ts`.

## The boundaries that matter

**`host.ts`** separates the app from its shell. Above it, one codebase; below it, three
answers for state, export, preview, streaming and images. Adding a fourth shell is a file, not
a fork.

**`core.ts`** separates page making from the browser. The model, the renderer, the worlds and
the checks have no DOM dependency, which is what makes an agent tool or a render service cheap.

**`shared/providers.mjs`** separates Wall from the vendors. Two wire formats, Anthropic and
OpenAI, cover every model in the picker; a new vendor is a row in `models.tsx` with a base URL.

It also separates the wire format from the transport. `setFetch()` lets a shell hand in the
fetch it needs without bringing a second copy of the request shapes with it: Node and a browser
holding its own key use the global, and the desktop app hands in one that travels through Rust,
because its webview is a real browser origin that would otherwise negotiate preflight with every
vendor. That is the difference between three shells and three implementations.

**`crates/wall-image`** is the only place with real compute, and it is one crate rather than one
per shell. Compiled to wasm and inlined, the desktop app, the web build and a served deployment
run the same binary. Rust is there because a generated image is the one thing in a Wall page
measured in megabytes, not because the rest of the app is slow: a whole wall of eight pages
renders in 0.18ms, which is a hundredth of a frame.

**The iframe** separates a paper from the app. Model authored CSS runs inside a sandboxed frame
holding nothing but the page, and `safeCss()` still strips imports and remote urls, because the
promise that a shipped page is one file with no requests is worth more than the flexibility.

## Two rules the code follows

**Clamp, do not trust.** Every number a model chooses for a world is bounded. The model chooses
inside a range and does not get to leave it, because an unbounded scale produces an unreadable
page rather than a daring one.

**Fail one, not eight.** Fan out catches per angle, so one bad reply loses one page. Runs carry
a token, so a wall started while another is streaming abandons the first rather than mixing them.
