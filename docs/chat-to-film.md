# From a chat to a film

The promise worth building toward: somebody opens a terminal, says "make me a thirty second film
of my pricing page", and a film arrives. Everything between those two moments already exists as
a route or a tool, so this page is the map an agent follows today and the two gaps that still
need a person's hand. It is written for whoever drives the tool from a conversation, whether that
is Claude Code through the MCP server or a script through the HTTP routes.

## What is there today

Start the studio on the site. It proxies the page so the picker can read it, and it serves the
editor on the same port.

```
npx motioneer localhost:3000
```

Everything below talks to that port. The prefix `/__motioneer/` keeps the studio's own routes
apart from the proxied site's.

| Step | How an agent does it now |
| --- | --- |
| Open a site | `POST /__motioneer/target` with `{ "url": "…" }`, or start the studio on it |
| Capture an element | needs a browser and a hand: the picker in the editor, or the bookmarklet on a signed in page |
| Write three motions | `POST /__motioneer/generate` with the captured subject, a brief and a treatment |
| Keep one | edit the project: set `saved` on the motion, `PUT /__motioneer/projects/:id` |
| Cut a film | edit the project's `tracks`, or press "Create first cut" in the editor |
| Render an MP4 | `POST /__motioneer/projects/:id/renders`, poll `GET …/renders`, fetch the `url` |
| Hand over the file | `GET /__motioneer/projects/:id/html` for an editable single file, or the MP4 above |

The project document is the whole state: subjects, motions, tracks, settings, camera. An agent
that can read and write JSON can do every step the editor does, because the editor does nothing
the routes cannot.

### The shape of a generate call

```json
{
  "subject": { "id": "…", "name": "Pricing card", "html": "…", "css": "…", "w": 500, "h": 300 },
  "brief": { "purpose": "entrance", "intensity": "range", "duration": 1000, "direction": "" },
  "treatment": "expressive"
}
```

The reply is a motion that already passed the gates, with `css`, `scope`, `duration` and what
the browser check saw. Call it once per treatment; the editor fires three in parallel. A failed
reply carries `error` and the reason, which is worth feeding back into the next attempt, since the
model corrects a named fault far more often than an unnamed one.

### The shape of a render

```
POST /__motioneer/projects/:id/renders      -> { "id": "…", "state": "queued" }
GET  /__motioneer/projects/:id/renders      -> [ { "id", "state", "message", "done", "total", "url" } ]
```

The renderer is installed once per machine with `POST /__motioneer/renderer` and reports its
state on `GET`. A render draws every frame of the saved revision in a real browser and encodes
them locally, which is why it takes about a minute for fifteen seconds of film and why the film
matches the preview.

## The two gaps

**Capture has no route.** Picking reads the live page through a browser, freezes its images and
fonts, and trims the stylesheet to what the element uses. The MCP `motion` tool takes markup a
person already has, and the studio's picker takes a click, but nothing takes a selector and a
url. That is the step that would let an agent go from "the pricing card on my site" to a subject
without anyone touching a mouse. Playwright is already a dependency, and the picker's capture
code already runs inside the proxied page, so the route is a matter of driving the same code from
a headless browser: open the proxy, find the selector, run the capture, return the subject.

**The film has no words.** A first cut places the kept motions a beat apart with an opening and
a closing title, but the titles are placeholders. An agent that knows what the product does can
write them, and the project document accepts any text on a title track, so this is a prompt away
rather than a feature away.

## What an agent conversation looks like once both close

```
> make a short film of the pricing page on localhost:3000

Opening localhost:3000. Capturing the pricing card, the plan toggle and the footer.
Writing three motions for each and keeping the expressive ones.
Cutting fifteen seconds: opening title, the three cards a beat apart, a closing line.
Rendering. The film is at ./motioneer/pricing.mp4, and the editor is open if you want to change it.
```

Every sentence in that reply maps to a route above. The studio stays open at the end on purpose,
because a film nobody can adjust is a film that gets re-rendered from scratch for every note.

## Where the code is

- `tools/editor/routes.mjs` serves every route in the table and nothing else.
- `tools/editor/render.mjs` owns the renderer, its install and its jobs.
- `tools/studio.mjs` owns the proxy, the picker, `target` and `generate`.
- `mcp/index.mjs` is the server an agent talks to; its `studio` tool opens the room and its
  `motion` tool writes a stylesheet for markup you already have.
- `src/editor/project.ts` is the project document, and the only schema an agent needs.
