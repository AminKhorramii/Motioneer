# Grounded films and careful revisions

Motioneer uses the same capture, direction, composition and export path from MCP and
its terminal tools. These additions make that path inspectable and preserve approved
work. They do not guarantee that every prompt reaches the bespoke Figma studies.

## From product evidence to motion

Pass the landing page as `reel.url`, relevant documentation as `referenceUrls`, and the
full creative request as `direction`. For an authenticated dashboard, use the studio's
existing capture flow and pass its project; the agent does not invent a login session.
The product brief records source quotes with stable evidence IDs and a capability
inventory. Story steps cite those IDs. Citations establish traceability, not factual
verification; inspect unsupported claims and keep conceptual graphics clearly labeled.

Retained captures expose named targets, selectors, kinds and bounds. Text, controls,
SVGs and rows can move independently when retained. Embedded images and readable
canvas captures remain flat images. Source scripts and shadow DOM are not recreated;
unreadable canvas elements are omitted and reported.

Scenes have stable IDs and tracks have exact IDs for subsequent edits. For real object
continuity, a director plan can declare:

```json
{
  "id": "request-detail",
  "type": "native-detail",
  "capture": 0,
  "anchor": 0,
  "carry": {"to": "request-context", "anchor": 0, "targetAnchor": 0}
}
```

The destination must be a later native scene using the same retained capture and text
or SVG anchor, with at most one graphic scene between them. The renderer carries the
original fragment along a curved path, hides its source copies during transfer, and
restores them for reduced motion. Consecutive matching source details can also receive
this transfer automatically. `action` and `handoff` prose remain planning notes.
`transitions` describes the implemented transfers; it does not imply arbitrary morphs.

## Review and refine from your agent

Ask your connected agent:

> Review this film's exported frames. Keep the approved ending and music. Refine only
> the source reveal: make its arrival more decisive, keep the settled text readable,
> and preserve the product content. Return the new take and editor link.

The tools are:

- `review`: pass `projectId` and optionally `dir`. Renders and reviews without changing
  the saved project. Returns exact track IDs, sampled observations and technical proof.
- `refine`: pass `projectId`, `trackIds`, `direction`, optional `lockedTrackIds` and
  `dir`. Creates new motion versions in an independent project with copied asset bytes.
- `reel.reviewPasses`: 0 to 2 automatic repair attempts, default 1. Zero still reviews.
- `refine.reviewPasses`: 0 to 2 additional automatic repair attempts, default 0.

Refinement currently supports additive motion CSS, not story restructuring. It keeps
source markup, fonts, film timing, camera, unselected tracks and audio. Patches cannot
import assets or replace text with CSS content. Overrides apply only when reduced
motion is not requested. Select a carry overlay and all connected endpoints together;
locked tracks cannot be selected. New takes retain requested locks, including when the
model proposes no motion changes. No-op edits without new locks reuse the source take.

The model reviews decoded arrival, action and settled frames. Observations cite a
sample and track; invalid citations make the review incomplete. Automatic repairs
address blocking observations in settled samples only (arrival/action concerns are advisory), save each candidate separately, and accept it only
when technical proof passes and a complete follow-up review reports fewer blocking
observations. Failed candidates never replace the prior take.

Check `review.status`, unresolved `issues`, and `attempts`. An unavailable or incomplete
review is not approval. Sampling cannot judge continuous motion, sound quality, or
artistic merit. Play the finished film and listen before publishing it.

Events use the renderer's initial visual clock. `eventStatus: "renderer-clock"` means
that metadata still matches the visual edit. Refinement or manual visual edits can
invalidate it; stale events are omitted from tool results and automatic rescoring.
The stored direction remains provenance. Recheck carried-object alignment after edits.

## Terminal commands

Start the local studio using your configured model provider. In a source checkout,
replace `npx motioneer` below with `node tools/cli.mjs` to test unpublished changes.

```sh
npx motioneer review --project PROJECT_ID --out ./takes --json
npx motioneer refine --project PROJECT_ID --tracks TRACK_ID --direction "Sharpen the arrival; retain the readable hold" --out ./takes --json
npx motioneer benchmark --dry-run --json
npx motioneer benchmark --out ./benchmark --limit 1 --json
```

Use `--at http://localhost:PORT` for a different studio. Rendering tools prepare the
local renderer if needed. The studio must already be running. Progress goes to stderr;
JSON results go to stdout. `--lock ID,ID` protects tracks on a refined take.

## Recorded percussion

Pass an absolute `soundKit` path to `reel`. No sample pack is downloaded or bundled.
The manifest points at four local WAV files, relative to its own directory:

```json
{
  "name": "My dry drum kit",
  "provenance": "Recorded by me; cleared for use in this film.",
  "samples": {
    "kick": "kick.wav",
    "snare": "snare.wav",
    "hat": "closed-hat.wav",
    "accent": "metal-click.wav"
  }
}
```

Each sample must be under 16 MB and contain audible audio. The arranger decodes up to
four seconds per sample, normalizes it, and uses short envelopes. Recorded percussion
and synthesized bass follow the cut and semantic action cues at the requested BPM.
The output is ordinary editable stereo WAV audio. The supplied provenance is recorded
with the take; Motioneer does not verify rights or claim unique commercial composition.
Built-in music profiles remain procedural synthesis. To replace an existing film's
music with a finished composition, use `rescore.audioFile` and explicitly name any
imported music tracks to replace; voiceover and effects remain intact.

## Evaluate ordinary prompts

[The benchmark manifest](benchmarks/products.json) covers 20 public products and three
focused revision prompts per film: arrival, incidental motion, and exit. Live execution
renders 18-second films, preserves their takes, copies MP4s, and saves `report.json`
after each product. It reports failures, technical proof, sampled reviews and elapsed
time. The partial report is recoverable evidence; automatic resume is not implemented.

Dry-run validates prompts without invoking a model or rendering. Use `--manifest` for
a different suite and `--limit 1` before a full run. Model usage/cost is currently unknown
and reported as null. The suite definition is not a completed evaluation.

Have reviewers compare original and revised films without model-generated taste scores.
Record source fidelity, product relevance, choreography, music, and overall preference
in the report's human fields. Check whole-film rhythm and audio, legibility during holds,
brand typography/color, and whether the exact requested revision preserved approved
work. Keep these scores unrated until a person actually reviews the films. Use repeated
failures to improve the shared pipeline and rerun the same cases before claiming gains.
