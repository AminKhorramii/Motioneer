# Direct the product's construction

Reference: [Michael Nowak's interface detail film](https://x.com/mnowakdesign/status/2098789521429319951), reviewed from its 19-second video on September 13, 2026.

The sequence moves from corner geometry and dimension guides into a rounded icon, draws its glyph, constructs another icon, reveals sidebar labels, then pulls back to the complete interface and a restrained closing mark. Perspective changes maintain a sense of one designed surface. Small highlights and measured spacing carry the visual interest.

Apply these principles to product films:

- Build a sequence around one recognizable product object. Keep its shape and position legible across the detail, assembly and full-interface views.
- Let a close-up earn its place: a corner, status glyph, connector or alignment should reveal something about the interface.
- Use construction lines to explain real geometry. Numeric measurements must come from the source, not invented technical-looking annotations.
- Stage an action in order: establish an anchor, draw the structure, reveal the content, settle, then pull back. Leave a short readable hold.
- Use camera movement to reveal relationships between details. Preserve directional continuity through the cut.
- Give the materials weight through easing, subtle highlight changes and small settling movements. Loud effects are optional.
- Place dry sound cues on actual drawing, snapping and alignment events; give the completed state room to breathe.

For Linear, useful subjects include an issue status glyph resolving into its row, filter chips organizing a view, a request linking to an issue, or a pull-request connection resolving into the full issue detail. Keep Linear's own typography and colors throughout.

## Retaining real source layers

The default reel path still uses flattened product screenshots alongside authored graphics. A curated capture path now retains selected homepage components as DOM/SVG through `captureLayers` in `tools/editor/layer-capture.mjs`:

```js
const capture = await captureLayers(page, {
  selector: '.composer',
  name: 'Message composer',
  layers: { copy: '.message', send: 'button.send', glyph: 'button.send svg path' },
  fontCSS: embeddedBrandFontCSS,
})
```

Inspect the live component first and pass its actual selectors. The returned HTML preserves source text, SVG geometry, computed styles, pseudo-elements and embedded images. Named descendants receive `data-motion-layer` and `data-motion-index` attributes for authored keyframes. Add the capture as an ordinary subject and the animation as a motion; the existing editor and renderer seek those animations normally. Supply embedded font CSS to keep the source typography offline.

“Voice into Work” uses this path for Linear’s actual message, composer, conversation and issue card. Its Send icon draws at macro scale before the camera reveals the composer. Those internal elements animate individually; two documentation views remain flattened captures. Preserve that distinction in source sheets and prompts.

This is selected DOM capture, not automatic reconstruction from pixels or automatic choreography from any URL. Source scripts, canvas contents and shadow roots are not retained. Choose small, stable components (at most 1,500 nodes), inspect the isolated result, and verify inner-element animation at multiple playhead times. Keep the source capture separate from authored shot subjects so it stays reusable. Measure the same glyph in both camera views to maintain continuity; use the project's actual resolved cut times when reviewing an edited take.

## Detail-to-interface reveals

The approved Send-glyph-to-composer transition is the direction to carry forward: an actual source detail stays recognizable while the camera reveals its purpose in the interface. Further “Voice into Work” studies apply this to a captured `@Linear` mention opening into its conversation and the genuine assignee SVG resolving into its issue card. Preserve an approved transition exactly when refining the surrounding film.

Measure the anchor's bounds in the retained DOM. Position the initial camera from that center, crop the component to the detail, then expand the crop while pulling back into the original layout. Reveal neighboring text and controls as the camera settles. Keep a brief detail hold and a readable full-interface hold; vary the anchor and direction between sequences. Draw real SVG paths when present, and preserve real text rather than substituting a look-alike. Keep the score and edited cut times fixed when the request is for visual refinement. Captured inline styles can pin SVG strokes or text fill: inspect computed stroke, fill and clipping at multiple playhead times, then check decoded transition frames.
