# Architecture

Where everything lives, and the rule that decides which file owns what: logic goes in whichever
module owns the data it reads. Files stay far from a thousand lines.

## The map

```
src/
  sections.ts   the page model. the single source of shape
  worlds.ts     design worlds: one set of decisions that propagate together
  taste.ts      the taste sheet, the contract every variant is generated against
  render.ts     page model to standalone HTML
  backdrop.ts   drawn art, seeded from the taste sheet
  brief.ts      page model to a markdown spec
  slop.ts       the generic patterns, checked locally
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
electron/              main process and preload bridge
src-tauri/             the same desktop app as a download a tenth the size
crates/wall-image/     decode, fit, flatten, re-encode. compiled to wasm
server/index.mjs       serves dist and holds the keys
fixtures/              recorded upstream streams, response bodies only
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
fetch it needs without bringing a second copy of the request shapes with it: Electron's main
process and Node use the global, and Tauri hands in one that travels through Rust because its
webview is a real browser origin that would otherwise negotiate preflight with every vendor.
That is the difference between four shells and four implementations.

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
