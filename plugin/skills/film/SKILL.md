---
name: film
description: Make a motion film of a running site or dev server with Motioneer, as an MP4 and a live HTML film made of the real interface.
argument-hint: <url> [what it should feel like]
disable-model-invocation: true
allowed-tools: mcp__plugin_motioneer_motioneer__film, mcp__plugin_motioneer_motioneer__look, mcp__plugin_motioneer_motioneer__projects, mcp__plugin_motioneer_motioneer__open
---

Use this plugin's Motioneer tools, named `mcp__plugin_motioneer_motioneer__<tool>`, which this command already has permission to call. Another Motioneer server may also be connected; prefer these.

Make a Motioneer film from: $ARGUMENTS

1. Call the Motioneer `film` tool with these arguments:
   - the url from the request
   - `dir` set to this project's absolute path, so the files land beside the work
   - the person's whole request in `direction`, word for word, since every plan and motion reads it
2. Choose the mode:
   - **Named elements or a local dev server:** use `mode: "capture"` with `pick` in their words,
     such as "the pricing cards and the hero".
   - **A launch or brand film of a public site:** use `mode: "auto"`.
3. Say once that it takes one to five minutes, then wait for the result rather than calling it
   again.
4. When it returns:
   - Repeat the verified line from its summary.
   - Look at the storyboard image, and name any weak shot by number.
   - Read its `assembled` notes as the distance from the house style.
   - Give the paths of the MP4 and of the live HTML film, which can be embedded with an iframe.
5. Offer one concrete change, such as dropping a weak shot or a snappier arrival with `timing`.
