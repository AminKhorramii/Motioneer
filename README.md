# Motioneer

**Motion for components you already have.**

[![npm](https://img.shields.io/npm/v/motioneer?logo=npm&color=cb3837)](https://www.npmjs.com/package/motioneer)
[![MCP](https://img.shields.io/badge/MCP-server-111?logo=claude&logoColor=D97757)](https://modelcontextprotocol.io)
[![Node](https://img.shields.io/node/v/motioneer?logo=nodedotjs&logoColor=fff&color=5FA04E)](package.json)
[![License](https://img.shields.io/npm/l/motioneer?color=blue)](LICENSE)

Point it at your running app, click an element, and get several motions for it at once, playing
side by side on one timeline. Keep the one you like as a stylesheet that ships in your product.

Generating one animation is solved. What nobody gives you is *many at once, live, on the same
clock*, which is the only way choosing between them is real.

## Prompt a landing-page film

In Claude Code with the Motioneer MCP server connected:

> Make a 20-second snappy launch film from notion.so. Use the native detail film standard: actual source elements, macro details that reveal the full component, source typography and colors, a distinctive action score, and a clean brand ending. Review the exported motion and give me the video and editor links.

This uses `reel` with `mode: "native"`. It retains source DOM/SVG, validates detail anchors, and keeps the result editable. Embedded screenshots stay flattened; unavailable native sources produce an explicit limitation. See the [prompt-to-film workflow](docs/chat-to-film.md) and [example prompts](docs/native-examples.md).

## Open it

Nothing to install. If you have [Node](https://nodejs.org) 20 or newer, one line opens it:

```
npx motioneer
```

That opens on the seven components it ships with, so there is something to animate before you have
pointed it at anything. To open it on your own app instead, give it the address your dev server is
already running on:

```
npx motioneer localhost:3000
npx motioneer ~/app/src/ui --css ~/app/globals.css    a folder, with your stylesheet
```

Installed once, it is just `motioneer`:

```
npm install -g motioneer
motioneer localhost:3000
```

Everything after that happens in the browser tab it opens. Nothing is uploaded: the proxy, the
picker and the film all run on your machine.

**One thing it needs.** Every motion is written by a model, so it wants either
[Claude Code](https://claude.com/claude-code) on your PATH or an api key, and it says which is
missing on the way up. Settings in the studio takes a key for Anthropic, OpenAI or anything speaking
their shapes, and remembers it.

### Or give it to your agent

The same studio, opened for you when you ask:

> open the motion studio on localhost:3000

```
claude mcp add --scope user motioneer -- npx -y -p motioneer motioneer-mcp
```

The agent side also has `motion`, which writes a sheet for markup you hand it without opening
anything. Choosing between several at once is the part that wants eyes, so that stays in the room.

With no arguments, **type an address into the sidebar**: `localhost:3000`, `stripe.com`, anything
reachable. The five most recent stay in the rail with their favicons.

## What it does

**Pick anything on the page.** Reading a component out of a `.tsx` is guesswork, so it does not:
your app is proxied through the studio's own origin, which makes the frame same origin, which makes
its dom readable. A picked element brings the rules that actually matched it, plus a snapshot of
every computed value, so it looks like itself once it is lifted out.

**Several motions, one clock.** Each option is dealt a different verb and a different errand from
two decks, so they disagree by construction rather than being five takes on a fade. One scrubber
holds all of them at the same instant. Open one to fill the screen, ask for more like the one that
nearly worked, or adjust its speed and spacing without asking again.

**Pick several elements** and they become a rail: one motion each, played on one timeline, with
each start draggable and each subject able to carry its own camera.

**Judged before you see it.** Ten gates read the sheet and an eleventh renders it: a motion that
leaves the component twelve pixels down forever, or invisible, or animating nothing at all, passes
every reading of the text and fails on sight. Options are ordered by what the rendering measured,
so the ones you can actually see come first.

**Keep what you like.** Saved motions live in your browser, so a restart does not lose them, and
each comes away as one file that opens anywhere. **Film** renders what is on screen frame by frame
and encodes it in the page itself, so posting a clip needs nothing installed.
The [Film editing guide](docs/film-editing.md) covers cuts, layers, movement, and keyboard controls.

## The stylesheet

What comes out is a `.motion.css` scoped to one data attribute you add to the root element. No
runtime, no dependency, no framework. Keyframe names are rewritten so a sheet defining `rise`
cannot replace whatever your application already called `rise`, and everything is wrapped in
`prefers-reduced-motion`.

## For an agent

`studio` opens the room, for when somebody wants to look at several motions and choose.
`motion` writes the stylesheet straight into your code without opening anything, for when they
do not. Same decks, same gates, nobody watching.

## Developing on it

```
npm run studio        watches its own sources: save a file and it is back in half a second
                      with your aim, your picks and your options put back
npm run verify:all    the suites that need no network
npm run verify:studio twenty real sites through the proxy
```

`docs/architecture.md` is the module map and `docs/flows.md` is every path through the studio and the
code that carries it.
