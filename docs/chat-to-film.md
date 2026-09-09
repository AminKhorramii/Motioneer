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
| Look first | `inspect` MCP tool with `{ url }` lists what is worth filming, by role and section |
| The whole thing | `film` MCP tool with `{ url, pace?, pick?, seconds?, look?, count? }` returns an MP4 path and a measured verdict |
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
It needs the local renderer, which it installs on first use, because it needs the renderer to make
the file at all.

What it adds is judgement, and all of it comes from one model call through the studio's `ask`
route, so it works with whichever provider the person configured. It tags the visible elements of
the page, describes each by role, section, size, image and text, and asks the model for a plan:
which elements to film, what the product is in a few words, an opening and a closing title taken
from the page rather than imagined, and one sentence of direction per element such as "the price
lands last". The titles go on the first cut's title tracks, the direction goes into each motion's
brief, and every selector it clicks is one it wrote onto the page, so a chosen element always
resolves. When the person said what they want, `pick` carries their words and outranks the
defaults. When the model cannot be asked, prominence chooses and the film says so.

`inspect` reads a page the same way without filming it, and returns the list, so an agent can say
what it sees and ask which to film before a minute of rendering is spent.

## Pace, and the proof

"A fast video" is a fast cut, not a quiet motion. `pace` is what shapes it, and it lives in the
one cut function the editor's button also calls, so the two never disagree:

| Pace | Titles | Shots | What it is for |
| --- | --- | --- | --- |
| calm | 3 seconds | one per kept motion, spread across the film | the editor's button, an elegant piece |
| brisk | 2 seconds | about 2.4 seconds each, filling the length | a demo, the default |
| fast | 1.2 seconds | about 1.3 seconds each, filling the length | "fast", "quick", "lots of cuts" |

When there are fewer kept motions than shots, the elements come round again with the frame
nudged and tightened a little, so a repeat reads as a new shot and not a freeze. A fast film also
asks each motion to be over in under half a second, so it lands before the next cut.

Every film is then measured off its rendered frames rather than trusted. `tools/editor/proof.mjs`
decodes the file at four frames a second, counts the cuts as sharp changes between neighbours,
times the shots between them, and checks that nothing is blank. The verdict compares that to the
pace requested and the reply carries it: "Verified from the frames: 12 cuts in 12 seconds, shots
of 0.9s on average, nothing blank", or "Checked the frames: only 3 cuts in 12 seconds, fast asks
for at least 6". The agent is told to repeat that line, and to say plainly when a film came out
slower than asked rather than call it fast because it was meant to be. The same check guards the
suite, so a change that makes fast films slow fails before it ships.

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
same instructions tell the agent which tool to reach for from what a person says: "fast" means
pace fast and about twelve seconds, "demo" means brisk and about twenty, "calm" means a subtle
look, "the pricing cards" means `film` with `pick`, "what could you film" means `inspect`, and
"studio" means open the room and hand it over rather than wait.

Failures follow one shape so the agent relays rather than guesses: the message starts with
"Cannot", names the reason, and ends with "Next:" and the one thing to do. The instructions tell
the agent to repeat that next step as given and to retry only when it says to.

## What still needs a person

**A signed in page.** Capture reads the live page through the proxy, and an app that authenticates
against its own api on another host cannot be proxied. For those the bookmarklet still picks from
the browser the person is already signed into, and the `film` tool cannot reach them.

**A page with nothing the heuristics recognise.** Candidates come from headings, buttons, cards,
heroes and images by tag and class. A page built entirely from anonymous divs offers the model
nothing to choose from, and `inspect` will say so; the studio's picker still works there by hand.

## Where the code is

- `tools/editor/routes.mjs` serves every route in the table and nothing else.
- `tools/editor/render.mjs` owns the renderer, its install and its jobs, and lends its browser and
  ffmpeg to the driver and the proof.
- `tools/editor/proof.mjs` measures a rendered film off its frames: cuts, shot length, blank frames.
- `src/editor/project.ts` holds `firstCut`, where pace lives, used by the editor's button and the film tool alike.
- `tools/studio.mjs` owns the proxy, the picker, `target` and `generate`.
- `mcp/index.mjs` is the server an agent talks to; its `film` tool makes the whole video, its
  `studio` tool opens the room, its `motion` tool writes a stylesheet for markup you have, and
  its `open` tool acts on the choices a finished film offers. Its instructions carry the etiquette.
- `tools/editor/autofilm.mjs` is the headless driver behind `film` and `inspect`, and holds the plan
  prompt; `verify/film.mjs` proves it from a url to an MP4 with a fake site and model, including
  that the plan's titles and direction land.
- `tools/studio.mjs` also serves `/__motioneer/ask`, the one route that puts a question to the
  configured model, so judgement works with any provider.
- `src/editor/project.ts` is the project document, and the only schema an agent needs.
