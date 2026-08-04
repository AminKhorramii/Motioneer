# WALL

**Twelve landing pages, then one.**

[![npm](https://img.shields.io/npm/v/wall-mcp?logo=npm&color=cb3837)](https://www.npmjs.com/package/wall-mcp)
[![MCP](https://img.shields.io/badge/MCP-server-111?logo=claude&logoColor=D97757)](https://modelcontextprotocol.io)
[![Tauri](https://img.shields.io/badge/desktop-Tauri-24C8D8?logo=tauri&logoColor=fff)](https://tauri.app)
[![Node](https://img.shields.io/node/v/wall-mcp?logo=nodedotjs&logoColor=fff&color=5FA04E)](package.json)
[![License](https://img.shields.io/npm/l/wall-mcp?color=blue)](LICENSE)

Generating a page is solved. What nobody gives you is *many at once*, live, side by side —
which is how design decisions are actually made. Wall's one act is **compare and choose**.

## From your agent

One line, nothing else to install:

```
claude mcp add --scope user wall -- npx -y wall-mcp
```

Ask for a landing page. Wall opens, you browse a wall of real pages, pick one, and the
choice returns to your project as a **spec your agent implements in your own stack** —
design tokens, structure, and copy, not a static file to port.

Three tools: `design` opens Wall and waits · `collect` reads a choice made after it
stopped waiting · `check` names the patterns that make a page look generated.

## From a clone

```
npm install
npm run app     # desktop
npm run web     # browser — same code, not a reduced copy
npm run serve   # self-hosted; ANTHROPIC_API_KEY stays on the server
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

## Docs

- [Development notes](docs/development.md) — verification suites, streaming, slop
  detection, design worlds, server deployment
- [Flows](docs/flows.md) — every path through the app, and the code that carries it
- [Architecture](docs/architecture.md) — the module map and the boundaries
- [DESIGN.md](DESIGN.md) — the visual language

Verify everything with `npm run verify:all` — real browsers, recorded streams, no key
and no tokens spent.

MIT © [Amin Khorramii](https://github.com/AminKhorramii)
