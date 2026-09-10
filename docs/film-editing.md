# Editing a film

Film keeps the library on the left, the canvas in the middle, the inspector on the right, and the
timeline below. Collapse either side panel with its toolbar button to give the canvas more room.
Canvas zoom, panel visibility, timeline height, and the timeline view stay in this browser.

## Start or refine a cut

Preview a capture or media item by clicking its library row. Its plus button adds it at the
playhead; dragging it onto the timeline places it where it lands. Search and the Components and
Media filters help find it again. Capture returns to Motion, Title inserts editable text, and
Media imports an image or audio file into the project and film.

Create first cut lets you choose kept captures, pace, length, and opening and closing text.
Replacing an existing cut saves its tracks, camera, and film settings as an arrangement. Compare
it beside the current cut or use it to restore the saved version. Older arrangements without
settings use the current film settings.

Select a component clip and use Change motion to choose another motion for that capture. Preview
alternatives together with the play button. Changing the motion keeps the clip's timing,
placement, and authored movement; the original motion remains available.

## Timeline and canvas

Clips packs sequential elements into compact rows, with sound below. Layers gives every element
its own row in the original stacking order. Switching views never changes the composition.

Selecting a clip pauses playback and seeks to it when the playhead is elsewhere. Go to clip in
the inspector returns to its start. Drag a clip to move it, or either edge to trim it. Linked
clips move together once; moving a linked child alone changes its gap. Audio trims stay within
the imported recording. Locked layers keep their position.

Drag the ruler to scrub. The time field accepts seconds. Transport buttons step a frame or jump
to a clip boundary; timeline zoom stays anchored near the playhead. The curve button reveals
camera movement and the selected layers' movement spans.

Select and drag a visible layer on the canvas to place it. Its corner resizes it proportionally.
Handles follow camera and element movement. Shift adds to selection; Cmd or Ctrl toggles an
item. Dragging several selected layers preserves their spacing. The inspector shows mixed values
where selected layers differ, and Group starts at moves their timing together.

Film and Camera open their own inspector controls. Linked timing and movement details expand
when needed. Add movement at playhead uses the current time and the remaining clip or film span.

## Keyboard and recovery

- Space plays or pauses when the workspace has focus. Focused buttons retain their normal action.
- On the ruler, arrows step one frame, Shift arrows step ten, and Home or End seek to a boundary.
- On a clip, arrows move it one frame; on a trim handle, they trim that edge. Shift uses ten frames.
- Alt during a drag bypasses snapping. Escape cancels an unfinished drag.
- Cmd/Ctrl Z undoes; Shift Cmd/Ctrl Z redoes. A drag or field edit is one undo step.
- Delete or Backspace removes selected unlocked layers. Editing shortcuts are suspended in dialogs.

Export film renders a saved snapshot. Close the dialog to keep editing; export progress and the
completed result stay accessible from the header.

## Verification

Run `npm run build` followed by `npm run verify:editor` for deterministic editing and browser
coverage. `node verify/editor.mjs --render` also checks a 30-second MP4 against preview frames
when the local renderer is installed. The normal `npm run verify:all` remains the baseline for
CLI, provider, proxy, rail, encoding, and MCP regressions.
