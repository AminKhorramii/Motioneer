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

The whole loop is now one MCP tool. `film` takes a url and returns the path to a rendered MP4,
choosing what to film with the model and cutting and rendering with no clicks. The steps below
are what it does inside, and what an agent can still drive one at a time when it wants control.

| Step | How an agent does it |
| --- | --- |
| The whole thing | `film` MCP tool with `{ url, seconds?, look?, count? }` returns an MP4 path |
| Open a site | `POST /__motioneer/target` with `{ "url": "…" }`, or the `studio` tool |
| Capture an element | the `film` tool does it headless; by hand it is the picker or the bookmarklet |
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

## How the film tool closes the loop

The `film` tool drives the real editor in a headless browser rather than reimplementing any of
it, so capture, the gates, the first cut and the render are the same code a person uses by hand.
The one judgement it makes on its own is what to film: it tags the visible elements of the page,
hands that list to the model, and films whichever the model names. Every selector it clicks is
one it wrote onto the page, so a chosen element always resolves. It needs the local renderer,
which it installs on first use, because it needs the renderer to make the file at all.

```
> I want a fast motion video from linear.app

Opening linear.app and reading its elements. Filming the hero headline, a feature card and an image.
Writing a subtle motion for each and keeping them. Cutting sixteen seconds with an opening and a closing title.
Rendering. The film is at ./motioneer-film-2026-09-08-10-45-02.mp4, and the studio is open if you want to change it.
```

The studio stays open at the end on purpose, because a film nobody can adjust is a film that gets
re-rendered from scratch for every note.

## How a job ends

A file path in a wall of text is a dead end, so the server tells the agent at connect time, through
its MCP instructions, how every film closes: relay what was filmed and where it is, then offer three
choices, as selectable options where the client can draw them.

1. Open the editor, to change the cut, swap a motion or add a title.
2. Open the video.
3. Continue chatting.

The first two call the `open` tool with `{ target: "editor" }` or `{ target: "video", path }`, which
launches the system opener and returns at once. `folder` opens the directory the file sits in. The
same instructions tell the agent which tool to reach for from what a person says: "fast" means a
subtle look and about twelve seconds, "demo" means expressive and about twenty, and "studio" means
open the room and hand it over rather than wait.

## What still needs a person

**A signed in page.** Capture reads the live page through the proxy, and an app that authenticates
against its own api on another host cannot be proxied. For those the bookmarklet still picks from
the browser the person is already signed into, and the `film` tool cannot reach them.

**Model choice across providers.** The `film` tool asks the model which elements to film through
the Claude command line, the shipped default. With an api provider configured instead, it falls
back to a prominence heuristic rather than a model choice, which is worth closing by routing the
question through the studio's configured provider.

## Where the code is

- `tools/editor/routes.mjs` serves every route in the table and nothing else.
- `tools/editor/render.mjs` owns the renderer, its install and its jobs.
- `tools/studio.mjs` owns the proxy, the picker, `target` and `generate`.
- `mcp/index.mjs` is the server an agent talks to; its `film` tool makes the whole video, its
  `studio` tool opens the room, its `motion` tool writes a stylesheet for markup you have, and
  its `open` tool acts on the choices a finished film offers. Its instructions carry the etiquette.
- `tools/editor/autofilm.mjs` is the headless driver the `film` tool runs, and `verify/film.mjs`
  proves it from a url to an MP4 with a fake site and model.
- `src/editor/project.ts` is the project document, and the only schema an agent needs.
