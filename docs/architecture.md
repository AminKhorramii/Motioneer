# The module map

Motioneer is a motion studio. One room, served by one node program, with the parts that have to agree
with each other kept outside it.

```
tools/
  studio.mjs           the room: the proxy, the picker, the transport, the rail, the export
  film-lab.mjs         film a site through the real server and lay out every shot to judge it, the loop every film fix came from

shared/                everything the studio uses that is not the room itself
  page.mjs             the page it serves. One template literal, so watch the backslashes
  arrange.mjs          a rail as a value: when each car starts, snapping, and what the shape of it is
  model.mjs            which service writes the motion, and the catalogue of the ones it can
  providers.mjs        the two wire formats worth speaking, since most vendors speak one of them
  cli.mjs              the claude command, when that is what is writing
  component-brief.mjs   visible capture structure for the model, with frozen pixels and hidden responsive copies omitted
  guard.mjs            what the proxy may fetch, which matters the moment this is not on a laptop
  raster.mjs           a document drawn to a canvas at a chosen instant, for filming
  mp4.mjs              those canvases encoded, with a muxer, because a browser has no mp4 writer
  port.mjs             listening near a port rather than on it

src/                   what the studio imports through a built bundle, because node cannot read ts
  design/motion.ts     the two decks, and what a motion is asked to be
  written.ts           the gates: what makes a written sheet acceptable
  theme.ts, taste.ts   the palettes a preview is dressed in
  reply.ts             pulling json out of a reply that may be wrapped in prose
  core.ts              the barrel, exporting exactly what runs outside a browser

mcp/
  index.mjs            Motioneer as a tool an agent calls: inspect reads a page and shows it, film makes the video, revise changes it without filming again, studio opens the room, motion skips it, open shows what was made

tools/editor/
  autofilm.mjs         the headless driver behind film, inspect and revise: the plan it asks the model for with a contact sheet, the repair round the proof drives, and the cut read back for a revision
  survey.mjs           page discovery and capture preparation: complete product scenes, representative candidates, and their contact sheet
  review.mjs           a storyboard decoded from the delivered MP4, returned to the agent for visual review
  kinetic.mjs          the reel planner: a brand metaphor becomes beat-timed authored scenes, a new editable project, percussion and a verified render
  media-source.mjs     discovers published product-video posters, including hidden carousel slides, for a fresh hybrid capture project
  hybrid.mjs           source capture snapshots and contact sheets, product reveal/detail/split choreography with traceable source IDs
  kinetic-scenes.mjs   graphic scene vocabulary: typography, orbital systems, ribbons, nodes, stacks and portals using the shared composition runtime
  soundtrack.mjs       original synthesized music fitted to the cut, stored as editable project audio
  proof.mjs            a rendered film measured off its frames: cuts, shot length, blank frames

site/
  index.html           the landing page: one hero over a shader, in one file that loads nothing

docs/
  chat-to-film.md      the map from "make me a film" to an MP4, and what the film tool does

verify/                the suites, read as a set
  studio-sites.mjs     twenty real sites through the proxy, picked one at a time
  studio-capture.mjs   what survives being picked, by site and by kind of element
  raster.mjs           what a drawn frame keeps, against a real browser
  mp4.mjs              the container, parsed back and checked byte for byte
  model.mjs            the provider layer, against a server that speaks the wire formats
  guard.mjs            the proxy guard, against the addresses people use to get past one
  mcp.mjs              the server over stdio, driven the way an agent drives it
  cli.mjs              the claude command path
```

## Which file owns what

**The studio is one file because it is one room**, and nothing else imports from it. The proxy, the
picker, the transport and the rail are all one act and splitting them would mean four files that
only ever change together.

**What judges a sheet lives in `src/written.ts`**, never in the page. The page is a template
literal, so a regex written there loses its backslashes before a browser sees it, and a second copy
of a measurement is how `3.2s` came to be read as `2s`. There is a guard at startup that reads the
source and refuses to run when it finds one.

**Everything opinionated is data in `src/design/`**, one file per kind of knowledge, so taste is
tuned without touching machinery.

**Nothing in `shared/` imports a node builtin at module scope** except `cli.mjs`, which is loaded
only when the command line provider is chosen. That is what lets the same code serve a page, judge
a sheet and call a model somewhere with no filesystem and no shell.
