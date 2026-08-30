# Wall

**Choose the feeling you like.**

[![npm](https://img.shields.io/npm/v/wall-mcp?logo=npm&color=cb3837)](https://www.npmjs.com/package/wall-mcp)
[![MCP](https://img.shields.io/badge/MCP-server-111?logo=claude&logoColor=D97757)](https://modelcontextprotocol.io)
[![Node](https://img.shields.io/node/v/wall-mcp?logo=nodedotjs&logoColor=fff&color=5FA04E)](package.json)
[![License](https://img.shields.io/npm/l/wall-mcp?color=blue)](LICENSE)

Generating a page is solved. What nobody gives you is *many at once*, live, side by side,
which is how design decisions are actually made. Wall's one act is **compare and choose**.

It does that twice. A **wall** of complete landing pages, and a **studio** where several
motions for one component play on a single timeline. Same act, different material.

## From your agent

One line, nothing else to install:

```
claude mcp add --scope user wall -- npx -y wall-mcp
```

Ask for a landing page. Wall opens in your browser, you browse a wall of real pages, pick
one, and the choice returns to your project as a **spec your agent implements in your own
stack** — design tokens, structure, and copy, not a static file to port.

Nothing else to download: `npx` resolves the latest version on every run, so Windows and
Linux work without a build and a run is never stale. A desktop app is coming.

Five tools: `design` opens Wall and answers within seconds, so your agent is free while you
read · `collect` hands it the page you chose, whenever you choose it · `check` names the
patterns that make a page look generated · `studio` opens the motion studio pointed at your
running app · `motion` writes motion straight into your code without opening anything.

## Motion, for components you already have

Two ways in, and they reach the same room. Ask your agent, which opens it for you:

> open the motion studio on localhost:3000

Or bring it up yourself:

```
npm run studio                                     the components in examples/
npm run studio -- ~/app/src/ui --css ~/app/globals.css
npm run studio -- --app http://localhost:3000      your dev server
```

Use `studio` when you want to look at several motions and choose. Use `motion` when you want
the stylesheet written into your code without stopping to look, which is the same gates and
the same deck with nobody watching.

Or open it with no arguments and **type an address into the sidebar**: `localhost:3000`,
`stripe.com`, anything reachable. The five most recent stay in the rail with their favicons.

Click any element and get several motions for it at once. Each is dealt a different verb and
a different errand from the deck, so they disagree by construction rather than being five
takes on a fade. One scrubber holds them all at the same instant, which is the only way
comparing them is real. **Open** fills the screen with one; **More like this** varies the one
that nearly worked; the inspector makes it slower or wider apart without asking again.

Reading a component out of a `.tsx` is guesswork, so it does not: with `--app` your dev
server is proxied through the studio's own origin, which makes the frame same origin, which
makes its dom readable. A picked element brings the rules that actually matched it.

Save what you like and it stays in the browser, so a restart does not lose it, and it comes
away as one file that opens anywhere. **Film** renders what is on screen frame by frame and
encodes it in the page itself, so posting a clip needs nothing installed.

What comes out is a `.motion.css` scoped to one attribute, which ships in your product.
Six gates read that sheet and a seventh renders it: one that leaves the component twelve
pixels down forever, or invisible, or animating nothing at all, passes every reading of the
text and fails on sight. Options are then ordered by what the rendering saw, so the ones you
can actually see from the first frame come first.

Select several elements and they become a rail: one motion each, played on one timeline, a
beat apart. A camera pass puts any of it on a locked, pushing, drifting or orbiting shot, and
**Export** writes the lot to one html file that makes no requests.

## From a clone

```
npm install
npm run web     # browser, the same code the MCP server opens
npm run serve   # self-hosted; ANTHROPIC_API_KEY stays on the server
npm run app     # the desktop shell, not released yet
npm run studio  # motion for components you have, or for an app that is running
```

Model keys are optional. Layouts, variants, and export all run locally with no key;
a key is used only for model-written copy, and it never leaves your machine.

## What it does

- **Forge twelve** — six layout archetypes × your taste sheet, rendered as live pages,
  not screenshots. Instant, local, no template gallery.
- **Taste from a screenshot** — drop a page you love and Wall reads the design system
  out of it into an editable contract.
- **Breed, don't prompt** — pin two variants and the child takes one's layout and the
  other's typography.
- **Ship a real file** — a self-contained `index.html` you own: inlined CSS, no
  framework, no runtime of ours.
- **Give it motion** — several motions for one component, compared on one timeline,
  adjusted without asking again, exported as one file that makes no requests.

## Docs

- [Development notes](docs/development.md) — verification suites, streaming, slop
  detection, design worlds, server deployment
- [Flows](docs/flows.md) — every path through the app, and the code that carries it
- [Architecture](docs/architecture.md) — the module map and the boundaries
- [Landing page prompt](docs/landing-page-prompt.md) — the brief for Wall's own page
- [Original design doc](docs/design-original.md) — the first sketch, kept as a record

Verify everything with `npm run verify:all` — real browsers, recorded streams, no key
and no tokens spent. The studio has two suites of its own, both of which run against real
sites because every bug the proxy has had was found by pointing it at one:
`node verify/studio-sites.mjs` asks whether twenty of them can be reached and picked from,
and `node verify/studio-capture.mjs --deep` asks what survives being picked, by kind of
element.

MIT © [Amin Khorramii](https://github.com/AminKhorramii)
