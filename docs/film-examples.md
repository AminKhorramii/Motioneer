# Ten film prompts

These briefs were exercised through Claude Code and the public Motioneer MCP tools against live pages. The resulting cuts used 1080p, 60 fps and editable synthesized audio. They are examples for visual regression, not deterministic golden outputs: source pages and model choices change.

## Linear

> Turn linear.app into a 20-second launch film. Dark, precise, effortless. Let the product do the talking.

## Stripe

> Make stripe.com feel like the future of money. Fluid motion, bold typography, crisp product details. 20 seconds.

## Notion

> Give notion.com a playful 15-second product film. Clean layouts, clever reveals, calm confidence.

## Vercel

> Make vercel.com a cinematic 20-second developer launch. Sharp contrast, precise movement, a powerful finish.

## Figma

> Turn figma.com into 20 seconds of creative momentum. Color, collaboration, and expressive layered motion.

## Raycast

> Make raycast.com a punchy 12-second power-user film. Fast cuts, tight detail shots, zero wasted frames.

## Supabase

> Give supabase.com an epic 20-second developer showcase. Dark surfaces, green accents, real interfaces.

## GitHub

> Turn github.com into a 20-second story of building together. Code, collaboration, momentum.

## Framer

> Make framer.com a stunning 15-second design reel. Beautiful pages, confident movement, seamless pacing.

## Slack

> Give slack.com a lively 18-second collaboration film. Conversations become action. Warm, rhythmic, human.

## The finishing loop

Ask Claude to review the returned storyboard for framing, readable content, repetition and source fidelity before delivery. Use `revise` for timing, title, soundtrack and motion changes. Use `inspect` then `film` with an explicit `pick` when the capture selection is weak. Pass `theme: "dark"` for a dark brief on a site that supports system appearance, and `language: "en"` for English content.

A useful follow-up is:

> Review the rendered storyboard. Remove clipped, empty or repeated filler shots. Prefer complete product interfaces over small labels or customer testimonial cards. Keep the requested duration, open with the brand name and close with its domain. Preserve the site’s typography and real content. Render the refined film and report any remaining capture limitations.

The September 2026 run found concrete limits: some inaccessible styles and embedded content cannot be captured faithfully; Vercel offered only three clean non-widget elements; several Figma and Raycast candidates were excluded after motion or blank-frame checks. A numeric frame verdict is not a visual quality guarantee. The normal Claude Code workflow uses the same tools as these examples; it can still need a focused follow-up.
