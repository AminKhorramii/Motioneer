---
name: motion
description: Give a component in this repo Assembled motion with Motioneer, then add the chosen option to the code.
argument-hint: <component file or name> [what the motion is for]
disable-model-invocation: true
allowed-tools: mcp__plugin_motioneer_motioneer__motion
---

Use this plugin's Motioneer tools, named `mcp__plugin_motioneer_motioneer__<tool>`, which this command already has permission to call. Another Motioneer server may also be connected; prefer these.

Write motion with Motioneer for: $ARGUMENTS

1. Find the component in the repo and read it. Write out the markup it renders as plain HTML,
   keeping its real elements and classes, because the keyframes reach the parts by structure. Read
   its stylesheet too.
2. Call the Motioneer `motion` tool with `html`, `css`, the `purpose` (entrance by default), and the
   person's words in `direction`.
3. Present the options by the verb each was dealt, such as type, flap or register, and say which
   one fits the component and why.
4. Once the person chooses, or if they asked you to pick:
   - put the option's scope attribute on the component's root element
   - append its css to the component's stylesheet
   - keep the prefers-reduced-motion wrapper it comes in

   Do not change the component's markup otherwise.
