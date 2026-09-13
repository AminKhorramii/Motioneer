# From a chat to a film

The promise worth building toward: somebody opens a terminal, says "make me a thirty second film
of my pricing page", and a film arrives. Everything between those two moments already exists as
a route or a tool, so this page is the map an agent follows today and the two gaps that still
need a person's hand. It is written for whoever drives the tool from a conversation, whether that
is Claude Code through the MCP server or a script through the HTTP routes.

## Artistic brand films

For kinetic typography and graphic identity films, use the `reel` MCP tool. It plans an original
visual concept, builds 8 to 20 animated scenes, scores their beat grid with synthesized percussion,
and returns a 1080p, 60 fps MP4 and a storyboard. Duration is 6 to 30 seconds, defaulting to 12.
Each scene is an ordinary editable component clip; the film uses the same preview and export
renderer as a captured film. Creating a reel always creates a new project.
Concurrent prompts wait for the studio export slot, with progress messages, instead of losing
the completed plan to a busy-renderer error. Cancelling an export reports promptly.

> Make a 12-second artistic brand reel for Linear, linear.app. Precision becomes momentum:
> orbital paths align, giant Focus / Align / Move / Ship typography, violet on near-black,
> extreme scale changes, purposeful bursts and a clear final hold. Use reel and review its
> rendered storyboard before delivery.

Pass `brand`, `domain`, `direction`, optional `seconds`, optional `palette` (three six-digit hex
colors: dark, accent, paper), and an absolute output `dir`.

For a film combining actual website elements with authored graphics, use `mode: "hybrid"`.
Pass an existing captured `projectId`, or a `url` to capture automatically first. URL capture
looks for published product-video posters, including hidden carousel slides, and falls back to
the normal capture flow when fewer than two are available. Uniformly empty captures are refused. The director
sees a contact sheet of the captures and chooses product reveals, detail crops and split layouts
between graphic bursts. These scenes hold longer than the graphic beats. The result includes
capture IDs, source names, warnings and a source contact sheet next to the rendered storyboard.
The source project stays unchanged. Captured content is rendered to portable pixels to preserve
its appearance; internal UI layers are flattened, while its graphic framing and motion remain
editable scene clips. Existing capture imperfections can remain visible, so review the sheet.

> Make a 16-second hybrid film for Linear from https://linear.app. Mix real captured product
> panels with violet orbital graphics and oversized Focus / Align / Ship typography. Use reel
> with mode hybrid. Give product reveals room to read, with quick graphic bursts between them.

See [ten hybrid film prompts](hybrid-examples.md) for brand-specific directions.

`mode: "graphic"` remains the default and makes authored illustrative brand graphics only.
An optional `projectId` supplies name context in that mode. Use `film` for a capture-led edit.

The choreography vocabulary includes impact type, typographic echoes, orbital linework, modular
grids, ribbons, node diagrams, spatial tunnels, splits, card stacks, bursts and a brand/domain
resolve. The planner chooses their sequence, words, palette, motif and beat lengths. It uses the
studio's configured provider, including Claude CLI, so ordinary prompts use the same production
path as the example renders. Results vary with the model's creative plan.

Review the storyboard and sample motion within shots. Numeric proof catches missing cuts and
blank frames, not artistic quality. For another creative direction call `reel` again, preserving
the previous version. Do not use generic `revise` to recut a reel: that operation builds a
capture-style sequence, so the tool refuses authored reels before changing them. See [kinetic reel prompts](kinetic-examples.md).

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

In Claude Code, a complete starting prompt is:

> Make a polished 24-second launch film from https://linear.app at 60 fps. Keep its typography
> and dark surfaces. Show the complete product interfaces, then their details. Review the
> rendered storyboard before handing it over.

The agent passes the creative direction to `film`, receives live progress when it supplies an
MCP `_meta.progressToken`, and gets the MP4, a storyboard decoded from that MP4, and structured
coverage and frame checks. Claude CLI uses its supported `sonnet`, `opus`, and `haiku` aliases
by default, so a new setup follows the models available in the installed CLI.

Film now defaults to 60 fps and an original synthesized score: ambient for calm films, pulse
otherwise, with playful available for lighter briefs. `soundtrack: "none"` makes a silent film.
The score is an ordinary audio track with its own asset and waveform, so it can be mixed, muted,
or replaced in the editor. Recutting regenerates its timing while retaining imported audio.
`revise` accepts `fps` and `soundtrack` as finishing notes without recapturing the page.

A brief can request `theme: "dark"` or `"light"` in `film` and `inspect`. This sets the browser
color-scheme preference before capture, including after locale redirects; sites that ignore
that preference keep their own appearance. Optional `background` and `ink` accept six-digit
hex colors for the film canvas and titles; a palette-only revision preserves the cut. Shot numbers in `revise.drop` and `revise.order`
refer to the original returned cut, even when several shots are removed together.
See [ten exercised film prompts](film-examples.md) for examples and the finishing loop.

Pass `language` as the request's two-letter language code (English by default). The survey
follows a matching language link already on the page when available, instead of guessing a
locale URL. Page-not-found screens are rejected before generation. Source entrance animations
settle before capture, and motion instructions preserve the transforms already positioning UI.

When the reference looks correct but DOM capture loses canvas graphics, imagery or fonts,
`film` can use `captureMode: "pixels"`. It photographs each selected source element before
generating motion. The film stays editable, but each photographed element is one flat image;
its internal text and layers cannot move separately. DOM capture remains the default.

The agent should inspect the delivered storyboard and make up to two focused revision passes
when a shot is visibly weak. Storyboards sample the later part of each shot so a deliberate
entrance is not mistaken for lasting cropping. The opening identifies the brand and the closing
uses its domain or a specific invitation from the page; an exact requested title takes priority.

For a note such as "make the planning panels glide more slowly", call `revise` with
`motionDirection` and `motionElements` (subject IDs or words from the returned element names).
It creates new motion versions and updates their clip references, preserving placement, timing,
camera, and audio when no cut change is requested. Every revision saves the previous tracks,
camera, and film settings as an arrangement. A rejected refinement leaves the saved film intact.

The storyboard is for visual judgment; the numeric verdict checks cuts, arrival, and blank
frames. Neither is a claim of artistic quality. Report partial coverage and capture warnings,
and inspect cropped text, weak contrast, and repeated shots before calling a film finished.

| Step | How an agent does it |
| --- | --- |
| Look first | `inspect` MCP tool with `{ url }` lists what is worth filming, by role and section |
| The whole thing | `film` MCP tool with `{ url, pace?, pick?, seconds?, fps?, look?, count?, direction? }` returns an MP4, storyboard, coverage, and measured verdict |
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

A pick resolves to what a viewer would see, not to the element that matched. On notion.so five of
eight picks once rendered blank: stretched links, an anchor with `position: absolute; inset: 0`
laid over a card as its click target and holding one non-breaking space, and a card's content box
whose white text only reads on its parent's dark ground. An invisible overlay now stands for the
card beneath it, and a content box takes the container that carries its look when that container
is not much bigger. The element is then handed to the picker with a synthetic mousemove rather
than clicked, because the pointer over a card lands on the overlay and the picker takes whatever
is under the pointer. Large look-alikes stay separate, since three feature cards are three shots;
only small runs such as a sidebar's buttons fold into one line.

A fast film wants many elements: eight by default, up to twelve, and "lots of elements" means
ten or more. Their motions are all written at once, each subject briefed and started before the
next is touched, so eight elements cost one model round rather than eight. Measured on notion.so,
a fast fifteen second film of eight elements takes about a minute from the request to the file.

`inspect` reads a page the same way without filming it, and returns the list, so an agent can say
what it sees and ask which to film before a minute of rendering is spent.

## What real landing pages taught

Every one of these came from filming linear.app, notion.so and framer.com and looking at every
shot, not from reasoning about pages in the abstract, and each has a check in the suite:

- Decoration is not a shot. Linear's hero glow is a real PNG that is itself a soft blob, so no
  style rule can flag it. A picture has edges: measured on a 48 by 27 downscale the glow scored
  3.3 and every real screenshot 12 to 28, so an image under 6 is left out. The pixels are read
  through the studio's asset proxy from the editor page, since inside the proxied frame a
  cross-origin image taints the canvas and cannot be read at all.
- A captured root is sized border-box at its measured width. The picker inlines the content-box
  width, so a heading measured 1030 wide came back as 1030 plus 32 of padding a side and lost the
  end of every line to its own frame. It also gets a sixth more room below, because a site's
  webfont is often unreadable across origins and the fallback face runs taller.
- Exact duplicates fold whatever their size. Framer carries the same screenshot twice in its
  markup, and filmed it as two of eight elements.
- A one-line h3 is a label, and a label or a button is never a shot on its own. Asked in the
  prompt, the model still filmed a lone button, so the rule is enforced when scenes are mapped.
- A motion that hides its root before revealing it makes a blank shot. Asked for a slow arrival,
  the model once held the root invisible for 850ms of a 1200ms shot. The brief now asks for every
  part visible and moving from the first frame, and the proof counts shots still empty a third of
  a second in.

## What makes it agent native

An agent does not watch the studio; it reads replies and calls tools. Four things make that a
conversation rather than a single shot:

- The planner sees the page. Every candidate is screenshotted where it stands and laid on a
  contact sheet, one jpeg with each tile numbered, that goes to the model with the list. The
  same sheet comes back from inspect as an image, so the agent can show the person what is there
  and choose with them. Pictures reach the model whichever provider writes: as content blocks on
  the wire, and as a stream-json turn into the claude command.
- The verdict acts before it reports. The film is measured off its frames, and when the proof
  names a shot that starts empty or a cut that did not show, the driver mends that one thing,
  asking once more for the motion or dropping the shot, and cuts and renders again. One round,
  since every failed verdict over forty sites was one such item and a render is twenty seconds.
- A film is revised, not remade. `revise` takes the projectId a film returned and a change: pace,
  length, titles, shots to drop by number or element by name, another order. The captures and
  motions stay, the shape of the cut is read back from the project, and the film is cut, rendered
  and measured again in about half a minute. Only new elements need film again, with pick.
- The reply is structured as well as said. Film and revise return the projectId, the file, every
  shot with its elements and layout, each element's fate (filmed, rendered empty, no motion and
  why, not captured), the verdict and the repairs, so the agent names a weak shot by number and
  offers a specific change instead of "want another?".

A refused motion is retried with its refusal in the brief, and when the refusal was that no
selector reached anything, with an outline of the element's own markup, so the second sheet names
parts that exist.

## What forty landing pages taught

The same loop over forty sites, `tools/film-lab.mjs` with a file of addresses, found the classes a
single page never shows. Each is fixed in the driver and most are pinned in `verify/film.mjs`:

- A page that hydrates on the client is scanned only once its text or images have arrived, and
  one that throws the frame back to its own origin is loaded again with scripts refused.
- Gates are lifted. slack.com hides everything under display none until a script confirms, and
  nextjs.org keeps every section below its hero under a hidden attribute; when most headings sit
  under hidden containers those containers are shown, and the page reads as thirty things, not three.
- A row of equal blocks that each carry a heading is a row of cards whatever their class, and a
  large link with an image is a card, not a button. anthropic.com's release banners were columns.
- A capture that renders empty is left out before a motion is written for it, and a kept motion is
  played once through the composition and looked at a third of the way in; one that starts empty is
  refined once with the fault named, the proof's own rule.
- A motion the studio refused is an answer, not a wait. The driver used to wait five minutes on the
  pending card of every refused element, which read as a hang. The refusal now goes into the next
  brief, since the same element asked again blind fails the same gate.
- A capture on a heavy page takes seconds, so the pointer fallback fires only after a long wait,
  and each element keeps the index of the subject that arrived for it. mongodb.com captures run a
  megabyte each with their stylesheet and fonts, so the studio's body limit is against a runaway only.
- A block page answers 200 and reads as a page of headings. replit.com's was filmed and verified
  before the title was checked; a title that says blocked is refused as a bot check.
- Bot checks that answer 403 or a challenge cannot be passed by a proxy: canva, lovable and
  perplexity say so in one line and point at the bookmarklet.

## Scenes

The plan speaks in scenes, not only in elements: an ordered list of shots, each with one or two
elements, a layout and a hold. `full` is one element centred; `detail` is one pushed in close;
`pair` is two side by side, the second arriving a beat after the first; `stack` is a heading above
the visual it introduces on the page. `long` holds the hero, `short` passes a small detail. The
cut lays each scene out, weights the holds so they still fill the length asked for, and caps how
far a small element is blown up at 2.4 times its natural size, because a 300 pixel card drawn five
times over is a blur where a heading, being vector, is not. Without a plan every kept motion is
one full shot, which is what the editor's button makes. The reply says the shape: "10 shots of 8
distinct elements in 3 layouts".

## Pace, and the proof

"A fast video" is a fast cut, not a quiet motion. `pace` is what shapes it, and it lives in the
one cut function the editor's button also calls, so the two never disagree:

| Pace | Titles | Shots | What it is for |
| --- | --- | --- | --- |
| calm | 3 seconds | one per kept motion, spread across the film | the editor's button, an elegant piece |
| brisk | 2 seconds | about 2.4 seconds each, filling the length | a demo, the default |
| fast | 1.2 seconds | about 1.3 seconds each, filling the length | "fast", "quick", "lots of cuts" |

The film stands on the site's own colours. The driver reads the rendered page's background,
falling through body to html to white the way a browser paints, and the cut takes it as the film's
background with title ink chosen for contrast on it. A dark headline captured off a light page is
therefore still a dark headline on a light film, rather than lost on a dark stage.

When there are fewer kept motions than shots, the elements come round again, each time round
tighter and swung to the other side, so a repeat reads as a new shot and not a freeze. A four
percent nudge was measured as no cut at all off the frames of a one-heading film, which is why
the swing is what it is. A captured root also drops the margin the picker inlined from the page:
the frame is sized to the element's own box, and a heading with a 16px top margin once rendered
16px down and lost its foot. Each brisk or
fast shot also keeps moving after its motion lands, a slow push in or a slow drift, because a
motion that is over in the first tenth of a shot followed by a second of stillness reads as a
slideshow. The motion itself is asked to fill most of the shot, 0.9 seconds of a 1.3 second fast
shot, and to use the whole of that rather than an easing that is finished in the first third.

Every film is then measured off its rendered frames rather than trusted. `tools/editor/proof.mjs`
decodes the file at ten frames a second, checks each cut the plan made at its own time rather than
guessing cuts from pixels, times the shots between them, measures how long each element takes to
arrive after a cut, and checks that nothing is blank, judging content against the frame's own
ground colour so a light film and a dark one are read the same way. Arrival is the number behind "the elements are not animated": a
450 millisecond motion with the model's usual ease-out settled in about 135 milliseconds, a pop,
and the verdict now says so rather than calling it a motion. The verdict compares that to the
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
