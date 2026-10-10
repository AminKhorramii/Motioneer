---
name: change
description: Change a Motioneer film as a new take, such as a snappier shot, a dropped shot, a new title or new music.
argument-hint: <what should change> [projectId]
disable-model-invocation: true
allowed-tools: mcp__plugin_motioneer_motioneer__change, mcp__plugin_motioneer_motioneer__look, mcp__plugin_motioneer_motioneer__projects
---

Use this plugin's Motioneer tools, named `mcp__plugin_motioneer_motioneer__<tool>`, which this command already has permission to call. Another Motioneer server may also be connected; prefer these.

Change a Motioneer film: $ARGUMENTS

1. Find the projectId. It may be in the request or earlier in this conversation; otherwise call the
   Motioneer `projects` tool and pick the film the person means.
2. Call `change` with only what changes, since the original is kept and every change is a new take:
   - **`timing`:** snappier, slower or tighter, as numbers with no model call. For example,
     `duration: 0.7` makes each part 30 percent faster.
   - **`cut`:** pace, length, dropped shots by number or name, order, titles or colours. Capture
     films only.
   - **`motion`:** how elements move, in the person's words, with `elements` or a reel's
     `trackIds`.
   - **`music`:** a musical identity, a direction or a finished `audioFile`.
3. Look at the changed shot with `look` and `shot` before calling it done, and report the new MP4
   and live HTML film.
