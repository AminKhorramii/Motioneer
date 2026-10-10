---
name: look
description: See what Motioneer can film on a page, or watch a film's shot frame by frame before changing it.
argument-hint: <url> | <projectId> [shot number]
disable-model-invocation: true
allowed-tools: mcp__plugin_motioneer_motioneer__look, mcp__plugin_motioneer_motioneer__projects
---

Use this plugin's Motioneer tools, named `mcp__plugin_motioneer_motioneer__<tool>`, which this command already has permission to call. Another Motioneer server may also be connected; prefer these.

Look with Motioneer at: $ARGUMENTS

- **A url:** call the Motioneer `look` tool with `url`. Describe the numbered contact sheet, list
  what is worth filming, and ask which elements the person wants, so a film is spent on the right
  thing.
- **A projectId and a shot number:** call `look` with `projectId` and `shot`. You get six frames
  across that shot; read the arrival in the first frames and the hold in the last.
- **A projectId alone:** call `look` with `projectId` for the storyboard and the measured verdict.
- **No projectId in this conversation:** call `projects` to find the film first.

Say what is weak in plain words, and suggest the matching `change`: `timing` for tempo, `motion`
for how it moves, `cut` for shots.
