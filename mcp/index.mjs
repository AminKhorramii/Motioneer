#!/usr/bin/env node
/**
 * Motioneer as a tool an agent can call.
 *
 * Three tools, one flow each. `studio` opens the room on a running site or a folder so the person
 * can pick elements and compare motions for them by hand. `motion` takes markup the agent already
 * has and hands back stylesheets that passed the gates, for when nobody needs to look first.
 * `film` runs the whole thing headless, from a url to a rendered mp4, choosing what to film with
 * the model and leaving the studio open afterwards for the edit.
 *
 * Opening the studio returns as soon as it answers, because a person choosing takes longer than
 * any sensible tool timeout, and an agent told that failed will open a second one. Filming waits,
 * because a file is what was asked for and there is nothing to hand back until it exists.
 *
 * JSON-RPC over stdio, spoken directly, so this stays dependency free like the rest.
 */

import { spawn } from 'node:child_process'
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

/**
 * Where this package was installed.
 *
 * Through fileURLToPath rather than the URL's own pathname, because a pathname is percent
 * encoded and is not a path: installed under a directory with a space in it, the space came
 * back as %20, so the package version read as 0.0.0 and the server this file spawns was looked
 * for at a path that does not exist, which reported itself as "could not open a browser". On
 * Windows the same pathname carries a leading slash before the drive letter and is not a path
 * at all. Both are ordinary places to install something.
 */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
// the one version this package has, told to clients instead of a number nobody bumps
if(process.env.MOTIONEER_WORKSPACE){
  if(!path.isAbsolute(process.env.MOTIONEER_WORKSPACE))throw Error('Cannot start MCP: MOTIONEER_WORKSPACE must be an absolute directory. Next: rerun npx motioneer setup --claude in the project.')
  process.chdir(process.env.MOTIONEER_WORKSPACE)
}
const VERSION = await readFile(path.join(ROOT, 'package.json'), 'utf8')
  .then((raw) => JSON.parse(raw).version)
  .catch(() => '0.0.0')

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n')
/**
 * A reply is words first, then pictures, then a structured copy of the same facts. The words are
 * for the person, the structure is for the agent: a film's shots, each element's fate and the
 * verdict as fields rather than as a paragraph to parse, so the next step can be reasoned about.
 */
const ok = (id, reply) => {
  const r = typeof reply === 'string' ? { text: reply } : reply
  const content = [{ type: 'text', text: r.text }, ...(r.images || []).filter((i) => i && i.data).map((i) => ({ type: 'image', data: i.data, mimeType: i.mime || 'image/jpeg' }))]
  send({ jsonrpc: '2.0', id, result: { content, ...(r.structured ? { structuredContent: r.structured } : {}) } })
}
const fail = (id, text) => send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text }] } })


/**
 * What the agent is told at connect time, which is where a server's etiquette lives.
 *
 * Tool descriptions say what each tool does; this says how to behave around them: which one to
 * reach for from what a person says, what to tell them while a film renders, and how a job ends.
 * The ending is deliberate. A file path in a wall of text is a dead end, so every finished film
 * closes with three choices the person can act on, and the open tool is what acts on them.
 */
const INSTRUCTIONS = `Motioneer makes motion for a person's own product. On setup trouble, call doctor for structured readiness. Film and reel install their renderer automatically on first use; no manual setup tool call is needed. Choose by what they want to hold at the end:
- film: they want a faithful component demo or a capture-led edit that preserves the page composition. For an artistic landing-page promo, launch film or branded motion video use reel with mode native instead. One call does everything and returns an MP4 path. Always pass dir as the absolute path of their project so the file lands beside their work. Pace is the cut: "fast", "quick", "punchy" or "lots of cuts" means pace "fast", which is many one second shots of many elements, about 12 seconds and eight elements unless they say otherwise; "demo" or "showcase" means pace "brisk" and about 20; "calm", "slow" or "elegant" means pace "calm" with look "subtle". "Lots of elements", "everything on the page" or "a lot of motions" means count 10 to 12. Fast and brisk films use look "expressive" unless they ask otherwise.
- studio: they want to pick elements and compare motions by hand, or say "studio". It returns as soon as the room is open; do not wait or retry, tell them where it is.
- motion: they want CSS for markup they already have, with nothing to look at first.
- inspect: they want to see or choose what gets filmed first, or ask what is on a page. It returns the list and a contact sheet image of the elements, each tile numbered; look at it, describe or show what is there, then follow with film and pick.
- revise: they react to a film with a change: slower, faster, shorter, longer, different titles, drop a shot or an element, another order. Pass the projectId the film returned; the captures and motions are kept and only the cut and render are redone, in about half a minute. Only filming again with pick adds elements that were never filmed.
- open: after a film, or whenever they ask to see the editor or a file.

How people say it, and what to call:
- "make me a snappy video of my site", "motion film of linear.app", "a launch film for notion.so": reel with mode native, source url, brand, direction, 20 seconds unless specified, and dir.
- "demo of localhost:3000", "film these pricing cards": film with the url and dir.
- "film the pricing cards", "just the hero": film with pick set to those words. If you are not sure what is on the page, inspect first and offer the list.
- a long or detailed request, with tone, rhythm, mood or how things should move: pass the whole of it in direction, word for word, and the elements it names in pick. Do not summarise it; the plan and every motion read it.
- "what could you film on this page": inspect, then relay the list in plain words and ask which they want.
- "open the studio on my app", "let me pick": studio with the url.
- "animate this component", with markup pasted: motion.
- "make it slower", "too long, ten seconds", "drop the footer shot", "put the hero last", "call it Ship Faster": revise with the projectId and only the fields that change. "drop" takes shot numbers from the reply or words from an element's name; "order" takes shot numbers.
- "add the pricing cards": film again with the same url, pick naming them, and the same pace and seconds.
- "cinematic", "polished launch film", or "state of the art": reel with mode native, seconds 20 unless specified, the source url, brand and full direction. Prefer real source details and a coherent product story.
- "make the cards glide more slowly": revise with motionDirection carrying the note and motionElements naming the cards from the last reply. This preserves the cut and creates new motion versions.

When a tool fails its message starts with "Cannot" and ends with "Next:". Relay the reason and the next step as given, and do not invent a different cause. Retry only when the next step says to.

For super-snappy, artistic brand films, kinetic typography, motion-identity references, or crazy creative launch videos, use reel. Ground the brief in a distinct brand metaphor and pass the full direction. Reel authors graphic scenes with typography, diagrams and a coordinated instrumental score; it is a different creative mode from filming captured interfaces. For the polished detail-to-interface bar, prefer mode native with the landing url, usually 20 seconds: it retains real DOM/SVG, measures the chosen detail, assembles neighboring layers, synchronizes sound cues and ends on the brand alone. It refuses insufficient sources or plans instead of silently substituting generic graphics. Review source sheets AND exported motion; proof checks structure, not artistic merit. When native capture is unavailable, explain the limitation and use a relevant accessible product page or honestly labeled hybrid. For a mix of flattened website elements and artistic graphics use mode hybrid with a captured projectId or url. Hybrid renders real capture pixels, while its diagrams are illustrative. Name the source fidelity plainly. Use a new reel call for visual revisions, preserving the previous project. For music-only changes use rescore: it creates a new take with the same visual edit. Reel supports 6–30 seconds, including 20-second films. Preserve brand identity by default: supply the source url or domain, keep brandMode site, and let the source font and palette guide the film. Use brandMode expressive only for an explicitly requested visual departure. Art changes composition and material while site typography remains. Use the landing page as the primary visual source: its product images, components, typography and colors should carry the film. Keep url pointed at that page. When more product detail is needed, pass relevant documentation pages through referenceUrls; they supplement the landing captures. Use at least two timed mechanism scenes in hybrid films with referenceUrls. Explain actual product actions and carry those shapes into adjoining captures. For unique dry sound, use keystroke, relay, tabulator, postmark, handshake or release; action sounds follow the mechanism choreography. Choose a distinct music profile for each brand and carry musical direction through the brief. For deep fast techno use hypnosis, warehouse, submerge, acidline, fracture or alloy, and set bpm (144–162 works well).

While film runs it can take a minute or two: it opens the site, captures, writes motions, cuts and renders. Say that once, then wait for the result rather than polling or calling it again.

Pass theme dark or light when the creative brief specifies that appearance; this sets the source browser preference, not a recoloring of captured interfaces. Set background and ink when the brief requests a particular stage/title palette; the page preference alone does not set the film canvas. Keep the full creative prompt in direction and honor its requested duration. Pass language as the request's two-letter language code; the tool follows locale links actually present on the page. Do not guess /en or other paths after a locale mismatch.

Films default to 60 fps with an original, editable synthesized soundtrack (ambient for calm, pulse otherwise). Use playful for a light, colorful brief. Honor requests for silence with soundtrack none. Do not promise commercial stock music or a composed-to-order song.

Film and revise also return a storyboard decoded from the final MP4. Look at it before calling the result finished: inspect legibility, framing, repetition and missing content. If a shot is visibly weak, make up to two focused revision passes before delivery: remove irrelevant shots, adjust the cut, or refine a named motion. If essential content is absent, inspect and film again with an explicit pick. When source references look correct but the DOM render loses images, fonts or canvas content, use captureMode pixels to preserve the selected visuals and disclose that motion then moves flattened images. Review the new storyboard after each pass. Do not silently accept a film of tiny labels or near-identical shots as a polished showcase. The numeric verdict checks cuts and blank frames, not artistic quality. Name any remaining limitation plainly. Coverage reports whether the requested captures actually reached the final cut; never describe partial coverage as complete. Use the returned artifact paths to hand over the video and storyboard. If your client supports MCP progress, pass a progressToken to receive the live stages.

Film and revise return the same facts twice: as words, and as structured content with the projectId, the file, every shot numbered with its elements and layout, each element's fate (filmed, rendered empty, no motion with the reason, not captured), the verdict and the repairs it made to itself. Reason from the fields: name a weak shot by number when offering a change, and pass the projectId to revise. When film returns it includes a line measured from the rendered frames, "Verified" or "Checked": how many cuts, how long the shots are, whether anything is blank. Repeat that line, it is the proof the film is what they asked for. If it says the film came out slower than asked, say so plainly and offer to film again with count 6 rather than claiming it is fast. Then relay what it filmed and where the file is in one or two sentences, and offer exactly these three choices, as selectable options if you can present options, otherwise as a short list:
1. Open the editor, to change the cut, swap a motion or add a title.
2. Open the video.
3. Continue chatting.
Call open only when the person explicitly asks to open something or selects that option. Creating a video is not a request to launch a player. For the third, ask what they would like next, and offer one concrete revision you can see in the fields, like dropping a shot whose element is a bare heading, or a slower cut when the shots average under a second.

A site that needs a sign in cannot be proxied; if capture finds nothing, say so and point them to the bookmarklet in the studio rather than retrying.`

const TOOLS = [
  {name:'doctor',description:'Check this workspace’s model configuration, packaged files and local renderer without generating a film or downloading anything. Returns structured readiness and concrete next steps; authentication is checked on the first model request.',inputSchema:{type:'object',properties:{dir:{type:'string',description:'Absolute workspace directory. Defaults to the connected project.'}}}},
  {
    name: 'studio',
    description:
      'Open the motion studio, so the person can point at a running site or a component, pick '
      + 'elements off it, and compare several motions for them on one timeline. Use this when '
      + 'somebody wants motion for something they already have and would rather choose than '
      + 'describe, or when they say the words motion studio. Prefer the motion tool instead when '
      + 'they want the stylesheet written straight into their code without looking at it first. '
      + 'This returns as soon as the studio is open, which is the normal outcome and not a '
      + 'failure: picking and comparing takes minutes. If one is already open it says so rather '
      + 'than starting a second, because a second would take the port and roam elsewhere.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description:
            'A running site or dev server to aim it at, like http://localhost:3000. Its elements '
            + 'become pickable. Leave it out to open on a folder of components instead.',
        },
        dir: {
          type: 'string',
          description:
            'Absolute path of the project, so the studio opens on its components when no url is '
            + 'given. Always pass it. This server runs as its own process and its working '
            + 'directory is not necessarily the project you are in.',
        },
      },
    },
  },
  {
    name: 'motion',
    description:
      'Give a component you already have motion that is not a 300ms fade. Send the markup and get '
      + 'back stylesheets to append: keyframes scoped to one data attribute you add to the root, '
      + 'reaching the parts by structure so they survive a class edit, staggering them so the '
      + 'parts so the thing assembles itself rather than sliding in whole. Each option takes its '
      + 'timing from a real object, a split flap turning, paper leaving a printer, a stamp landing, '
      + 'so several of them disagree rather than all easing the same way. Your markup is never '
      + 'changed and never returned, everything is wrapped in prefers-reduced-motion, and options '
      + 'that only move it as one piece, or that pin their selectors to utility classes, are '
      + 'rejected before you see them.',
    inputSchema: {
      type: 'object',
      properties: {
        html: {
          type: 'string',
          description:
            'The component markup as it stands, so the motion can reach its parts by structure. '
            + 'Send the real thing rather than a summary.',
        },
        css: {
          type: 'string',
          description: 'Its stylesheet, if you have it. Optional, and it makes the timing fit better.',
        },
        purpose: { type: 'string', enum: ['entrance', 'emphasis', 'idle', 'interaction'], description: 'What this motion is for. Entrance by default.' },
        intensity: { type: 'string', enum: ['range', 'subtle', 'expressive', 'bold'], description: 'Treatment intensity. Range compares three treatments.' },
        duration: { type: 'number', description: 'Target duration in milliseconds, between 200 and 10000.' },
        direction: { type: 'string', description: 'Specific creative direction for the motion.' },
        options: {
          type: 'number',
          description: 'How many different motions to write. Three by default, six at most.',
        },
      },
      required: ['html'],
    },
  },
  {
    name: 'film',
    description:
      'Make a short motion film of a running site with no clicks, and return the path to an MP4. '
      + 'Use this when somebody wants a video, a demo reel or a motion film of a site or dev server '
      + 'and is happy to let the tool choose what to film and edit it afterwards. It opens the site, '
      + 'reads its elements, picks a few worth filming, writes one motion for each through the same '
      + 'gates the studio uses, cuts them into a titled sequence and renders it locally. It needs the '
      + 'local renderer, which it installs on first use, so the first run on a machine takes an extra '
      + 'minute. It leaves the studio open so the person can change the cut. Prefer the studio tool '
      + 'when they would rather pick and compare by hand, and the motion tool when they want CSS for '
      + 'markup they already have rather than a video.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The running site or dev server to film, like http://localhost:3000.' },
        dir: { type: 'string', description: 'Absolute project path. The MP4 is saved here; pass it so the file lands where the person is working.' },
        captureMode: { type: 'string', enum: ['dom','pixels'], description: 'film only: dom preserves editable internal structure (default). pixels photographs each selected source element before generating motion, preserving fonts, canvas and images when DOM capture loses them; motion then moves a flat image.' },
        theme: { type: 'string', enum: ['light','dark'], description: 'Preferred source-page color scheme. Pass dark or light when the brief requests it; sites that support system appearance will use that theme. Captured content keeps its source colors.' },
        language: { type: 'string', description: 'Two-letter language code, en by default. If the site opens in another language, follows an existing locale link when available. Use the language of the request; never guess a locale URL.' },
        seconds: { type: 'number', description: 'How long the film should be. About 20 by default.' },
        fps: { type: 'number', enum: [30,60], description: 'Frames per second. 60 by default for smooth product movement; 30 for smaller exports.' },
        background: { type: 'string', description: 'Optional six-digit hex stage background, such as #101319. Changes the film canvas, not captured source colors.' },
        ink: { type: 'string', description: 'Optional six-digit hex title color. Without it, titles contrast with the stage background.' },
        soundtrack: { type: 'string', enum: ['none','ambient','pulse','playful','percussive'], description: 'Original synthesized music fitted to the cut. Defaults to ambient for calm films and pulse otherwise. Use playful for a light rhythmic feel, none for silent output.' },
        look: { type: 'string', enum: ['subtle', 'expressive', 'bold'], description: 'The single treatment written for each element. Subtle by default, which reads as fast and calm.' },
        count: { type: 'number', description: 'How many elements to film, 1 to 12. Eight by default for a fast film, five for brisk, three for calm; when the page offers fewer, the ones found repeat across the shots.' },
        pace: { type: 'string', enum: ['calm', 'brisk', 'fast'], description: 'How it is cut. fast is many short shots of about a second with short titles, brisk is a demo rhythm, calm is a few long shots. Brisk by default.' },
        pick: { type: 'string', description: 'Which elements the person wants filmed, in their own words, like "the pricing cards and the hero". The model matches it against what is on the page. Leave it out to let the model choose.' },
        direction: { type: 'string', description: 'The creative direction for the whole film, in the person\'s words, up to a paragraph: the tone, the rhythm, what to emphasise, how things should arrive, what the titles should feel like. It shapes the plan, the titles and every motion. Pass a detailed request through here whole rather than summarising it.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'reel',
    description: 'Create an art-directed kinetic brand film with original animated graphics, huge typography, diagrams, spatial motifs, fast cuts and a beat-matched original instrumental score. Prefer this for artistic, snappy launch films and brand identity reels. Native mode retains DOM/SVG with measured detail-to-interface reveals; prefer it for high-quality source-based brand films. Hybrid mode combines actual website captures with authored graphics; pass projectId or url. Graphic mode uses illustrative graphics only. A new editable project preserves the original film.',
    inputSchema: {type:'object',properties:{
      mode:{type:'string',enum:['graphic','hybrid','native'],description:'Prefer native for polished source-element motion: real DOM/SVG details reveal their full component, with inner-layer animation, branded typography and a clean ending. Requires an accessible url with at least two usable components. Hybrid preserves flattened capture pixels; graphic uses authored graphics only.'},
      url:{type:'string',description:'Brand landing page to capture; required for native mode unless a domain or source project provides its URL.'},
      brand:{type:'string',minLength:1,maxLength:24,description:'Company or product name.'},
      concept:{type:'string',maxLength:45,description:'Optional title for this creative direction. Keep brand as the actual company name; use concept to name variations in a collection.'},
      domain:{type:'string',description:'Brand domain for the closing card, without protocol.'},
      projectId:{type:'string',description:'Optional existing film in this studio; hybrid mode uses its actual captured visuals; graphic mode uses names as context. It is not modified.'},
      direction:{type:'string',description:'The full creative brief: concept, metaphors, typography, rhythm, reference observations. Give each brand a distinct idea.'},
      seconds:{type:'number',minimum:6,maximum:30,description:'6 to 30 seconds, 12 by default.'},
      referenceUrls:{type:'array',maxItems:3,items:{type:'string'},description:'Up to three documentation URLs relevant to this film. Read for product facts. Hybrid also imports published screenshots; native uses the reference text as evidence while retaining the landing-page DOM/SVG. Sources share the contact sheet fairly. Keep url as the main brand website.'},
      brandMode:{type:'string',enum:['site','expressive'],description:'Site by default: inspect the source website and embed its actual font, using its observed palette unless palette is explicitly supplied. Expressive intentionally uses the art preset typography and freely directed colors.'},
      bpm:{type:'number',minimum:80,maximum:180,description:'Optional target tempo shared by music and cuts. Fits whole beats to the exact film length; actual BPM is returned. Deep fast techno usually uses 144 to 162.'},
      art:{type:'string',enum:['studio','editorial','playful','chrome','technical','print'],description:'Visual direction with bundled display typography and material treatment. Studio is sculptural, editorial is serif-led, playful is elastic, chrome is luminous, technical is precise, print is bold and optical.'},
      music:{type:'string',enum:['glass','liquid','paper','monolith','elastic','voltage','current','branch','prism','conversation','hypnosis','warehouse','submerge','acidline','fracture','alloy','keystroke','relay','tabulator','postmark','handshake','release'],description:'Musical identity: glass minimal electronica, liquid swung garage, paper intimate keys, monolith cinematic sub, elastic electro funk, voltage acid breaks, current dub techno, branch digital counterpoint, prism melodic electronica, conversation warm broken soul. For dry action-led, non-ambient scores use keystroke (typing), relay (switching), tabulator (data), postmark (inbox), handshake (request/response), or release (launch). For deep fast techno use hypnosis (rolling), warehouse (industrial), submerge (dub), acidline (acid), fracture (broken), or alloy (metallic). The director chooses when omitted.'},
      palette:{type:'array',minItems:3,maxItems:3,items:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},description:'Three six-digit hex colors in dark, accent, paper order. Optional; the director chooses when omitted.'},
      dir:{type:'string',description:'Absolute output folder for the MP4 and storyboard.'}
    },required:['brand']}
  },
  {
    name:'rescore',
    description:'Change only the music of an existing film or reel. Creates a new independent editable take, preserving visuals, timing, camera and the original project. Composes an original instrumental score and returns MP4, WAV and storyboard. Use for a new musical identity without rebuilding the visuals.',
    inputSchema:{type:'object',properties:{
      projectId:{type:'string',description:'Existing film or reel projectId.'},
      music:{type:'string',enum:['glass','liquid','paper','monolith','elastic','voltage','current','branch','prism','conversation','hypnosis','warehouse','submerge','acidline','fracture','alloy','keystroke','relay','tabulator','postmark','handshake','release'],description:'Musical identity. Choose a different orchestration and groove for each brand.'},
      direction:{type:'string',description:'Musical brief: instrumentation, groove, feeling and melodic character. The composer writes a phrase for this direction.'},
      bpm:{type:'number',minimum:40,maximum:400,description:'Use the original reel BPM to keep music on its edit grid. Inferred from clip lengths when omitted.'},
      dir:{type:'string',description:'Absolute output directory for MP4, WAV and storyboard.'}
    },required:['projectId']}
  },
  {
    name: 'inspect',
    description:
      'Look at a running site the way film would and list what on it is worth filming: each element '
      + 'with its role, where it sits, its size, whether it carries an image, and its text. Use it '
      + 'when the person wants to choose or discuss what gets filmed before spending a minute on a '
      + 'render, or asks what Motioneer can see on a page. It opens the site in the studio and reads '
      + 'it in a headless browser, so it takes a few seconds and needs the renderer like film does. '
      + 'Follow it with film, passing pick in the person\'s words.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The running site or dev server to look at.' },
        theme: { type: 'string', enum: ['light','dark'], description: 'Preferred source-page color scheme. Pass dark or light when the brief requests it; sites that support system appearance will use that theme. Captured content keeps its source colors.' },
        language: { type: 'string', description: 'Two-letter preferred language, en by default. Follows a linked locale when available.' },
        dir: { type: 'string', description: 'Absolute project path, so a studio opened for this lands on their project.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'revise',
    description:
      'Change a film that film already made, without filming it again: a different pace or length, '
      + 'new titles, shots dropped, elements taken out, or the shots in another order. The captures '
      + 'and motions are kept, the film is cut and rendered again in about half a minute, measured '
      + 'off its frames, and a new MP4 path comes back. Use it whenever the person reacts to a film '
      + 'with a change: "slower", "shorter", "drop the footer", "put the hero last", "call it X". To '
      + 'add elements that were not filmed, call film again with pick.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'The projectId the last film reply carried.' },
        dir: { type: 'string', description: 'Absolute project path, where the new MP4 is saved.' },
        pace: { type: 'string', enum: ['calm', 'brisk', 'fast'], description: 'A new cut rhythm. Leave out to keep the current one.' },
        seconds: { type: 'number', description: 'A new length. Leave out to keep the current one.' },
        opening: { type: 'string', description: 'A new opening title, two to five words.' },
        closing: { type: 'string', description: 'A new closing title.' },
        drop: { type: 'array', items: { type: 'string' }, description: 'Shots or elements to remove: a shot number from the reply like "3", an exact subjectId, or words from an element\'s name like "footer" or "pricing".' },
        order: { type: 'array', items: { type: 'number' }, description: 'Shot numbers in the order they should now come, first ones first; unnamed shots follow.' },
        fps: { type: 'number', enum: [30,60], description: 'Change export frame rate without changing the edit.' },
        background: { type: 'string', description: 'Optional six-digit hex stage background, such as #101319. Changes the film canvas, not captured source colors.' },
        ink: { type: 'string', description: 'Optional six-digit hex title color. Without it, titles contrast with the stage background.' },
        soundtrack: { type: 'string', enum: ['none','ambient','pulse','playful','percussive'], description: 'Add or replace the generated score; none removes only the generated score. Existing imported audio is preserved.' },
        motionDirection: { type: 'string', description: 'How to change existing motions. Creates new versions while preserving placement, timing, camera, and audio unless a cut change is also requested.' },
        motionElements: { type: 'array', items: { type: 'string' }, description: 'Subject IDs or words from element names whose motions should change. Leave out to refine all visible component elements. Requires motionDirection.' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'open',
    description:
      'Open something Motioneer made, on the person\'s machine: the editor in their browser, a '
      + 'rendered video in their player, or the folder a file sits in. Use it after film when they '
      + 'choose to open the editor or the video, or whenever they ask to see one. It launches the '
      + 'system opener and returns at once.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', enum: ['editor', 'video', 'folder'], description: 'What to open. editor is the studio in the browser; video and folder need path.' },
        path: { type: 'string', description: 'Absolute path of the video, for video and folder.' },
      },
      required: ['target'],
    },
  },
]

/**
 * Open the motion studio, or say that one is already open.
 *
 * A second studio does not replace the first, it finds the port busy and roams to 4322, which is
 * right for a person reading the terminal and wrong for an agent that has just told somebody to
 * look at 4321. So this asks first.
 *
 * It waits for the server to actually answer rather than reporting success on spawn. A studio that
 * failed to start looks exactly like one that started, right up until the person opens the address
 * and finds nothing there, and by then the agent has already said it worked.
 */
const STUDIO_AT = () => `http://localhost:${Number(process.env.MOTIONEER_PORT || 4321)}`
const answering = async (at) => {
  try { return (await fetch(`${at}/__motioneer/model`, { signal: AbortSignal.timeout(700) })).ok }
  catch { return false }
}

/** Start a studio aimed at url/dir and wait until it actually answers. Returns whether it is up. */
async function spawnStudio({ url, dir, at, headless=true }) {
  if (await answering(at)) return true
  const args = [path.join(ROOT, 'tools', 'studio.mjs')]
  if (url) args.push('--app', String(url))
  else if (dir) args.push(String(dir))
  // process.execPath rather than the word node: an agent launched from a desktop icon carries a
  // login shell's PATH, which on any machine using nvm or fnm has no node on it at all
  const child = spawn(process.execPath, args, { stdio: 'ignore', detached: true, cwd: dir || process.cwd(), env:{...process.env,...(headless?{MOTIONEER_NO_OPEN:'1'}:{})} })
  const started = await new Promise((done) => {
    child.on('error', () => done(false))
    child.on('spawn', () => { child.unref(); done(true) })
  })
  if (!started) return false
  for (let n = 0; n < 40; n++) {
    if (await answering(at)) return true
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}

async function studio({ url, dir }) {
  const at = STUDIO_AT()
  if (await answering(at)) {
    return `A motion studio is already open at ${at}. Tell them to use that one rather than `
      + 'opening another, and if they want it pointed somewhere else there is an address bar in '
      + 'the top left of it.'
  }
  const up = await spawnStudio({ url, dir, at, headless:false })
  if (!up) {
    return `The studio was started but has not answered at ${at} within ten seconds, or could not `
      + 'be started at all. Ask them to run `npx motioneer` themselves.'
  }
  return `The motion studio is open at ${at}.${url ? ` It is aimed at ${url}.` : ''} Tell them `
    + 'to pick one or more elements and press Give it motion, and that several motions come '
    + 'back to compare on one timeline. Choosing takes minutes, so do not wait on it: they can '
    + 'save what they like from the studio itself.'
}

/**
 * The whole loop, from a running site to a rendered film, with nobody clicking.
 *
 * It reuses the room the person would use by hand: the studio proxies the site, the editor runs
 * headless against it and captures, generates and cuts through the same code and the same gates,
 * and the renderer draws the frames. The one judgement this tool makes on its own is what to film,
 * and it makes it by handing the model the elements already on the page and filming whichever it
 * names, so a choice can never point at something that is not there.
 *
 * Rendering needs the local renderer, which it also needs to make the file at all, so this asks for
 * it to be installed rather than pretending a film happened. The studio is left open, because the
 * first thing anybody wants after seeing a first cut is to change one thing about it.
 */
/**
 * Open the editor, a video, or its folder with whatever the system uses, and say what was opened.
 *
 * Detached and unreferenced so the server never waits on a browser or a player. MOTIONEER_NO_OPEN
 * reports instead of launching, the same switch the studio honours, so suites can drive this path
 * without windows appearing on the machine that runs them.
 */
async function open({ target, path: file }) {
  const at = STUDIO_AT()
  let what, where
  if (target === 'editor') {
    if (!(await answering(at))) throw new Error(`No studio is open at ${at}. Run film or studio first.`)
    what = 'the editor'; where = `${at}/__motioneer/editor/`
  } else if (target === 'video' || target === 'folder') {
    if (!file || !path.isAbsolute(String(file))) throw new Error(`open ${target} needs the absolute path of the video.`)
    const there = await readFile(file).then(() => true, () => false)
    if (!there) throw new Error(`There is no file at ${file}.`)
    what = target === 'video' ? 'the video' : 'its folder'; where = target === 'video' ? String(file) : path.dirname(String(file))
  } else throw new Error('open needs a target of editor, video or folder.')
  if (process.env.MOTIONEER_NO_OPEN) return `Would open ${what} at ${where}.`
  const cmd = process.platform === 'darwin' ? ['open', [where]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', where]] : ['xdg-open', [where]]
  const child = spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true })
  child.on('error', () => {}); child.unref()
  return `Opened ${what} at ${where}.`
}

/**
 * Read a page the way film would, and say what is on it, so the agent can talk about it and the
 * person can point at what they want filmed before a minute of rendering is spent.
 */
async function inspect({ url, dir, language, theme }) {
  if (!url) throw new Error('Cannot inspect: inspect needs a url. Next: pass the running site or dev server.')
  const at = STUDIO_AT()
  if (!(await spawnStudio({ url, dir, at }))) throw new Error(`Cannot inspect: no studio would open at ${at}. Next: run \`npx motioneer\` and ask again.`)
  const { inspectSite, describe } = await import(pathToFileURL(path.join(ROOT, 'tools', 'editor', 'autofilm.mjs')).href)
  const {prepareRenderer}=await import('../tools/environment.mjs');await prepareRenderer(at)
  const seen = await inspectSite({ at, url, language, theme })
  const lines = seen.candidates.map(describe)
  const text = `${seen.title || seen.source} has ${seen.candidates.length} things worth filming:\n${lines.join('\n')}\n\n`
    + (seen.sheet ? `The image is a contact sheet of the first ${seen.sheet.tiles} of them, each tile labelled with its index, so you can see what each looks like and show or describe them to the person.\n` : '')
    + `To film some of them, call film with the same url and pick set to what the person wants in their words, `
    + `for example "the pricing cards and the hero", or the indices; the model matches pick against this list. Without pick it chooses the best on its own.`
  return { text, images: seen.sheet ? [seen.sheet] : [], structured: { title: seen.title, source: seen.source, background: seen.colours?.background, elements: seen.candidates.map((c) => ({ index: c.i, role: c.role, section: c.section, width: c.w, height: c.h, image: !!c.image, text: c.text || '', alike: c.alike || 0 })) } }
}

async function film({ url, dir, language, theme, captureMode, seconds, fps, soundtrack, background, ink, look, count, pick, pace, direction }, progress = () => {}) {
  if (!url) throw new Error('film needs a url, a running site or dev server like http://localhost:3000.')
  const at = STUDIO_AT()
  const up = await spawnStudio({ url, dir, at })
  if (!up) throw new Error(`Could not open a studio at ${at}. Run \`npx motioneer\` and try again.`)

  const {prepareRenderer}=await import('../tools/environment.mjs');await prepareRenderer(at,progress)

  const { autofilm } = await import(pathToFileURL(path.join(ROOT, 'tools', 'editor', 'autofilm.mjs')).href)
  const steps = []
  const wantPace = ['calm', 'brisk', 'fast'].includes(pace) ? pace : 'brisk'
  const wantSeconds = Number(seconds) || (wantPace === 'fast' ? 12 : 20)
  // a fast film wants many elements; a calm one a few. the cap is what a render can carry in a few minutes
  const max = Math.max(1, Math.min(12, Number(count) || (wantPace === 'fast' ? 8 : wantPace === 'brisk' ? 5 : 3)))
  const result = await autofilm({ at, url, language, theme, captureMode, background, ink, pick: String(pick || '').slice(0, 600), direction: String(direction || '').slice(0, 1400), seconds: wantSeconds, fps: fps ?? 60, soundtrack: soundtrack ?? (wantPace === 'calm' ? 'ambient' : 'pulse'), look: look || (wantPace === 'calm' ? 'subtle' : 'expressive'), pace: wantPace, max, onStep: (m) => {steps.push(m);progress(m)} })
  const file = await keepFile(result, dir)
  const review = await reviewResult(result,file,progress)
  const buf = { length: (await stat(file)).size }
  const { proofLine } = await import(pathToFileURL(path.join(ROOT, 'tools', 'editor', 'proof.mjs')).href)
  const verified = proofLine(result.proof)
  const structured = shape(result, file, wantPace)
  const mended = result.repairs?.length ? ` It mended itself once before the final render: ${result.repairs.join('; ')}.` : ''
  const fates = result.elements.filter((e) => e.status !== 'filmed')
  const leftOut = fates.length ? ` Left out: ${fates.map((e) => `${e.name} (${e.status})`).join('; ')}.` : ''
  return { structured, images: review ? [review] : [], text: `Filmed ${result.distinct} of ${result.elements.length} selected element${result.elements.length === 1 ? '' : 's'} from ${url}${result.product ? `, "${result.product}",` : ''} into a ${Math.round(result.seconds)} second ${wantPace} film`
    + `${result.opening ? ` titled "${result.opening}"` : ''}, ${result.shots} shots of ${result.distinct} distinct element${result.distinct === 1 ? '' : 's'} in ${result.layouts} layout${result.layouts === 1 ? '' : 's'}, saved to ${file} (${(buf.length / 1e6).toFixed(1)} MB). ${verified} The studio is still open at ${at}. What it did: ${steps.join(' ')}\n\n`
    + mended + leftOut + ` The shots are numbered in the structured result; revise with this projectId (${result.projectId}) changes the cut without filming again. `
    + `Review the storyboard before delivery. If it has weak framing or repeated minor elements, use a focused revision or inspect and film again. Then hand over the video and storyboard with any remaining limitations. `
    + `Only call open if the person asks to launch the editor or player.` }
}

async function reel({brand,domain,projectId,url,mode='graphic',direction,seconds=12,palette,music,art,concept,bpm,brandMode='site',referenceUrls=[],dir},progress=()=>{}) {
  const at=STUDIO_AT()
  if(!(await answering(at))&&!(await spawnStudio({url:domain?'https://'+domain:undefined,dir,at})))throw new Error('Cannot make a reel: the studio could not start. Next: open the studio and retry.')
  const {prepareRenderer}=await import('../tools/environment.mjs');await prepareRenderer(at,progress)
  const {kineticReel}=await import(pathToFileURL(path.join(ROOT,'tools/editor/kinetic.mjs')).href)
  const result=await kineticReel({at,brand,domain,projectId,url,mode,direction,seconds,palette,music,art,concept,bpm,brandMode,referenceUrls,onStep:progress})
  const file=await keepFile(result,dir),review=await reviewResult(result,file,progress)
  const sourceSheet=result.sourceSheet?file.replace(/\.mp4$/,'-sources.jpg'):null
  if(sourceSheet)await writeFile(sourceSheet,Buffer.from(result.sourceSheet.data,'base64'))
  return {structured:{projectId:result.projectId,editor:`${at}/__motioneer/editor/?project=${encodeURIComponent(result.projectId)}&view=film`,studio:at,file,seconds,fps:60,style:mode==='native'?'native':mode==='hybrid'?'hybrid':'kinetic',soundtrack:result.soundtrack,music:result.music,bpm:result.bpm,concept:result.plan.concept,plan:result.plan,shots:result.shotList,sourceProjectId:result.sourceProjectId,artifacts:{video:file,storyboard:result.storyboard||null,sources:sourceSheet},reviewError:result.reviewError||null,verdict:result.proof,quality:mode==='native'?{profile:'native-detail-v1',nativeReveals:result.plan.scenes.filter(s=>s.type.startsWith('native-')).length,sourceComponents:result.captures.length,transitionReview:true,visualReviewRequired:true}:null,captureSkipped:result.captureSkipped||[],captures:result.captures,limitation:result.limitation},images:review?[review]:[],text:`Created ${brand}: ${result.plan.concept}. ${result.shotList.length} animated scenes in ${seconds} seconds, 60 fps, with original ${result.music.label} music. Video: ${file}. Review the storyboard for typography and composition. The original film is preserved. For music-only changes use rescore. For a new visual direction use reel again; generic revise rebuilds a capture-style cut and is not appropriate for these authored scenes. ${result.limitation}`}
}

async function rescore(args,progress=()=>{}){
  const at=STUDIO_AT()
  if(!(await answering(at)))throw new Error('Cannot rescore: the studio is not running. Next: open the original studio first.')
  const {prepareRenderer}=await import('../tools/environment.mjs');await prepareRenderer(at,progress)
  const {rescoreFilm}=await import(pathToFileURL(path.join(ROOT,'tools/editor/rescore.mjs')).href)
  const result=await rescoreFilm({...args,at,onStep:progress})
  const file=await keepFile(result,args.dir),review=await reviewResult(result,file,progress),audio=file.replace(/\.mp4$/,'-score.wav')
  const response=await fetch(result.audioUrl)
  if(!response.ok)throw new Error('Cannot deliver the score: its audio file is unavailable. Next: export the saved take from the studio.')
  await writeFile(audio,Buffer.from(await response.arrayBuffer()))
  return {structured:{projectId:result.projectId,editor:`${at}/__motioneer/editor/?project=${encodeURIComponent(result.projectId)}&view=film`,sourceProjectId:result.sourceProjectId,studio:at,file,seconds:result.seconds,fps:result.fps,soundtrack:result.soundtrack,music:result.music,bpm:result.bpm,shots:result.shotList,verdict:result.proof,artifacts:{video:file,audio,storyboard:result.storyboard||null}},images:review?[review]:[],text:`Created a new ${result.music.label} musical take. ${result.music.description} The visual edit and original project are preserved. MP4: ${file}. Original synthesized stereo score: ${audio}.`}
}

/** The rendered file, moved from where the driver measured it to where the person works. */
async function keepFile(result, dir) {
  const outDir = dir && path.isAbsolute(dir) ? dir : process.cwd()
  await mkdir(outDir,{recursive:true})
  const file = path.join(outDir, `motioneer-film-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.mp4`)
  const buf = result.file ? await readFile(result.file).catch(() => null) : null
  await writeFile(file, buf || Buffer.from(await (await fetch(result.url)).arrayBuffer()))
  return file
}

async function reviewResult(result,file,progress) {
  progress('Inspecting frames from the finished video.')
  try {
    const {reviewFilm}=await import(pathToFileURL(path.join(ROOT,'tools','editor','review.mjs')).href)
    const review=await reviewFilm(file,{shots:result.reviewShotList||result.shotList,seconds:result.seconds,maxSamples:result.reviewShotList?32:20})
    result.storyboard=review.path;return review
  } catch(e) {result.reviewError=String(e.message||e);return null}
}

/** The same facts as fields: what an agent reasons about between one film and the next. */
function shape(result, file, pace) {
  return {
    projectId: result.projectId, editor: `${result.at}/__motioneer/editor/?project=${encodeURIComponent(result.projectId)}&view=film`, studio: result.at, file, source: result.source, seconds: Math.round(result.seconds), fps: result.fps, soundtrack: result.soundtrack, pace,
    titles: { opening: result.opening || '', closing: result.closing || '' }, background: result.background,
    shots: (result.shotList || []).map((s) => ({ shot: s.shot, at: s.at, seconds: s.seconds, elements: s.elements, layout: s.layout })),
    elements: result.elements || [],
    coverage: {selected:result.elements?.length || 0,filmed:result.distinct,complete:(result.elements || []).every(e=>e.status==='filmed')},
    planning: result.byModel === undefined ? 'existing cut' : result.byModel ? 'model' : 'prominence fallback',
    artifacts: {video:file,storyboard:result.storyboard || null},
    reviewError: result.reviewError || null,
    verdict: { ok: !!result.proof?.ok, notes: result.proof?.notes || [], cuts: result.proof?.cuts, arriveMs: result.proof?.arriveMs, blank: result.proof?.blank },
    repairs: result.repairs || result.changes || [],
    next: ['open the editor', 'open the video', 'revise: pace, seconds, titles, drop, order', 'film again with pick to add elements'],
  }
}

/**
 * A film changed rather than remade. The studio that made it is still open with the project,
 * so this goes straight to the cut and the render, and comes back in the time a render takes.
 */
async function revise({ projectId, dir, pace, seconds, opening, closing, drop, order, motionDirection, motionElements, fps, soundtrack, background, ink }, progress = () => {}) {
  if (!projectId) throw new Error('Cannot revise: revise needs the projectId a film returned. Next: pass it, or film first.')
  const at = STUDIO_AT()
  if (!(await answering(at))) throw new Error(`Cannot revise: the studio at ${at} is not open any more, so the project is not reachable. Next: film again.`)
  const {prepareRenderer}=await import('../tools/environment.mjs');await prepareRenderer(at,progress)
  const { revise: reviseFilm } = await import(pathToFileURL(path.join(ROOT, 'tools', 'editor', 'autofilm.mjs')).href)
  const steps = []
  const result = await reviseFilm({ at, projectId: String(projectId), pace, seconds, opening, closing, drop, order, motionDirection, motionElements, fps, soundtrack, background, ink, onStep: (m) => {steps.push(m);progress(m)} })
  const file = await keepFile(result, dir)
  const review=await reviewResult(result,file,progress)
  const { proofLine } = await import(pathToFileURL(path.join(ROOT, 'tools', 'editor', 'proof.mjs')).href)
  return { structured: shape(result, file, result.pace), images: review ? [review] : [], text: `Revised the film: ${result.changes.join('; ') || 'cut again as it was'}. Now ${result.shots} shots of ${result.distinct} element${result.distinct === 1 ? '' : 's'} in ${Math.round(result.seconds)} seconds, ${result.pace}, saved to ${file}. ${proofLine(result.proof)} `
    + `Offer the same three choices: open the editor, open the video, or continue chatting; the video is at "${file}".` }
}

/**
 * Motion for a component somebody else built, handed back as a stylesheet and nothing else.
 *
 * Several at once for the reason the wall exists: asked once, every call reaches for the same
 * easing, and measured on this repository's own output eight independent calls drew one watch dial
 * and would fade one way. Each option is dealt a different motion from the deck, taken from what a
 * real object does, so they disagree by construction rather than by being asked to.
 *
 * The gate is the point of returning anything at all. unmoved reads whether the parts arrive at
 * different times, which is the whole difference between a mechanism and a slideshow, and an option
 * that only slides the finished component is dropped rather than shown: a caller handed four
 * options where one is a fade has to do the judging this tool exists to have already done.
 */
async function motion(args) {
  const html = String(args?.html ?? '')
  if (!html.trim()) throw new Error('motion needs the component markup, so the keyframes can name its parts.')
  const want = Math.max(1, Math.min(6, Number(args?.options) || 3))
  const core = await import(pathToFileURL(path.join(ROOT, 'dist-core', 'core.js')).href)
  const { runClaude } = await import(pathToFileURL(path.join(ROOT, 'shared', 'cli.mjs')).href)
  const brief = core.motionBrief(args)
  const motions = Array.from({ length: want }, (_, i) => brief.intensity === 'range' ? ['subtle','expressive','bold'][i % 3] : brief.intensity)
  // the markup is what the selectors have to name, so it goes over whole rather than summarised
  const seen = html.slice(0, 6000)
  const styles = args?.css ? `\n\nIts stylesheet, for the timing to fit:\n${String(args.css).slice(0, 4000)}` : ''
  let browserPromise
  const browserForChecks=()=>browserPromise ||= (async()=>{
    const {loadChromium}=await import(pathToFileURL(path.join(ROOT,'tools','editor','render.mjs')).href)
    const installed=await loadChromium(), chromium=installed || (await import('playwright').catch(()=>null))?.chromium
    return chromium ? chromium.launch(installed?{channel:'chromium'}:{}) : null
  })().catch(()=>null)

  /**
   * How many distinct frames a component shows over four seconds with a stylesheet applied.
   *
   * Distinct rather than merely different: a screenshot is compared by its bytes, so a frame that
   * differs by one antialiased pixel counts as a change, and that is the honest reading. What is
   * being asked is whether anything at all is happening on screen, which is the question the css
   * cannot answer about itself.
   */
  async function frames(markup, scope, css) {
    /**
     * Only when a browser is actually here.
     *
     * playwright is a development dependency and this package ships mcp/ without it, so on a normal
     * install this import throws and the whole tool would fail on a check rather than on the work.
     * Missing is not failing: the source gates still ran, and the reply says plainly which options
     * were watched and which were only read, because a check reported as done when it was skipped
     * is the one kind of green this repository refuses to print.
     */
    const browser = await browserForChecks()
    if(!browser)return null
    const ctx = await browser.newContext({ viewport: { width: 420, height: 420 } })
    try {
      const tab = await ctx.newPage()
      const scoped = scope ? markup.replace(/<(\w+)/, `<$1 ${scope}`) : markup
      await tab.setContent(`<style>${core.safeStyle(args?.css || '')}\n${css}</style>${scoped}`, { waitUntil: 'load' })
      const shots = new Set()
      for (let i = 0; i < 8; i++) {
        await tab.waitForTimeout(i === 0 ? 60 : 480)
        shots.add((await tab.screenshot()).toString('base64'))
      }
      return { distinct: shots.size }
    } finally {
      await ctx.close()
    }
  }

  const tried = await Promise.all(motions.map(async (m) => {
    const prompt = `The component:\n${seen}${styles}\n\n${core.motionDirection(brief, m)}`
    /**
     * One retry, because a dropped reply is not an opinion about the component.
     *
     * Run over eight real components, the only outright failure was a reply that came back
     * unparseable, and a caller told "no option moved the parts" for that reason has been given a
     * verdict where there was only a hiccup. The second attempt is allowed to think, since the
     * first was probably running under the fast dial, and thinking is the thing that was skipped.
     */
    let reply = await runClaude(core.MOTION_SYSTEM, prompt).catch(() => null)
    let raw = reply ? core.grabJson(typeof reply === 'string' ? reply : reply.text ?? '') : null
    if (!raw) {
      reply = await runClaude(core.MOTION_SYSTEM, prompt, { thinking: undefined }).catch(() => null)
      raw = reply ? core.grabJson(typeof reply === 'string' ? reply : reply.text ?? '') : null
    }
    const judged = raw ? core.judgeMotion(raw, undefined, false) : { why: 'No usable CSS came back.' }
    if (!judged.css) return { m, css: '', scope: '', note: '', faults: [judged.why] }
    return { m, css: judged.css, scope: judged.scope, note: judged.note, faults: [] }

  }))

  /**
   * And then watch each one, because reading the css cannot tell you whether anything moved.
   *
   * Every gate that has ever gone wrong in this repository went wrong by reading source. An option
   * with six keyframes and staggered delays reads perfectly and can still be a four hundred
   * millisecond entrance that is over before anybody looks, or a set of rules whose selectors match
   * nothing in the component they were written for. Frames settle both questions: the component is
   * rendered with the stylesheet appended, sampled across four seconds, and an option whose frames
   * are all identical did not move whatever its css says.
   */
  const watched = await Promise.all(tried.map(async (t) => {
    if (!t || t.faults.length) return t
    const seen = await frames(html, t.scope, t.css).catch(() => null)
    if (seen === null) return { ...t, unwatched: true }
    if (seen.distinct < 2) {
      return { ...t, faults: [...t.faults, 'rendered, nothing on it changed. Either the selectors match '
        + 'nothing in this component, or the movement is over before anybody could see it.'] }
    }
    return { ...t, distinct: seen.distinct }
  }))
  await browserPromise?.then(b=>b?.close()).catch(()=>{})

  const kept = watched.filter((t) => t && !t.faults.length)
  const dropped = tried.filter((t) => t && t.faults.length)
  if (!kept.length) {
    /**
     * A component with one part cannot have a mechanism, and saying otherwise is unhelpful.
     *
     * Run over eight real shadcn components, six got staggered motion and the button did not: it is
     * an icon and a label, so there is nothing to arrive in sequence and every option correctly came
     * back as a transition. The gate was right and the message was wrong, because it blamed the
     * options for a property of the component. Counting the elements separates "this did not work"
     * from "there is nothing here to stagger", and only the first is worth retrying.
     */
    const parts = (html.match(/<(?!\/)(?!br|hr|img|input|meta|link)[a-zA-Z]/g) ?? []).length
    const why = dropped[0]?.faults[0] ?? 'no usable reply came back'
    if (parts < 5 && dropped.some((d) => d.faults.some((f) => f.includes('at once')))) {
      throw new Error(
        `This component has ${parts} element${parts === 1 ? '' : 's'}, so there is nothing to `
        + 'stagger: motion on it can only be the whole thing moving, which is the transition you '
        + 'already have. Send a component with parts that can arrive in sequence, rows, cards, '
        + 'fields, cells, and the motion has something to be made of.')
    }
    throw new Error(`No option moved the parts. ${why}`)
  }
  const why = [...new Set(dropped.flatMap((d) => d.faults.map((f) => f.split('.')[0])))]
  // said out loud, because an option that was only read is a weaker claim than one that was watched
  const unwatched = kept.some((k) => k.unwatched)
  return kept.map((k, i) =>
    `## ${i + 1}. ${k.note || 'untitled'}\n\n`
    + `Takes its timing from ${k.m}\n\n`
    + (k.scope ? `Put \`${k.scope}\` on the component's outermost element, then append:\n\n` : 'Append:\n\n')
    + `\`\`\`css\n${k.css}\n\`\`\``,
  ).join('\n\n') + (dropped.length
    ? `\n\n---\n\n${dropped.length} other option${dropped.length === 1 ? ' was' : 's were'} written and dropped: `
      + `${why.join('; ')}.`
    : '')
    + (unwatched
      ? '\n\nThese were checked by reading the css rather than by watching them, because no browser '
        + 'is installed here. Selectors that match nothing, and movement that is over before anybody '
        + 'sees it, both read as correct and are only visible when rendered.'
      : '\n\nEach of these was rendered on your component and watched for four seconds, so the '
        + 'selectors are known to match and the movement is known to be visible.')
}

async function call(name, args, id, meta) {
  let step=0
  const progress=message=>{if(typeof meta?.progressToken==='string'||typeof meta?.progressToken==='number')send({jsonrpc:'2.0',method:'notifications/progress',params:{progressToken:meta.progressToken,progress:step++,message}})}
  if(name==='film'||name==='revise'||name==='reel')progress('Preparing the film workspace.')
  if(name==='doctor'){const {diagnose}=await import('../tools/environment.mjs');const report=await diagnose(args||{});return ok(id,{structured:report,text:report.ready?'Motioneer is configured and its renderer works. Model authentication is checked on the first request.':report.checks.filter(c=>!c.ok).map(c=>c.message+' '+(c.next||'')).join('\n')})}
  if (name === 'studio') return ok(id, await studio(args ?? {}))
  if (name === 'motion') return ok(id, await motion(args ?? {}))
  if (name === 'rescore') return ok(id, await rescore(args ?? {},progress))
  if (name === 'reel') return ok(id, await reel(args ?? {},progress))
  if (name === 'film') return ok(id, await film(args ?? {},progress))
  if (name === 'inspect') return ok(id, await inspect(args ?? {}))
  if (name === 'revise') return ok(id, await revise(args ?? {},progress))
  if (name === 'open') return ok(id, await open(args ?? {}))
  /**
   * A name nobody serves is answered rather than ignored.
   *
   * This fell through and sent nothing at all, which is not a small thing over a protocol where the
   * caller is waiting on an id: the agent does not get an error it can report, it gets silence, and
   * it waits until whatever timeout it happens to have. Naming the tools that do exist also covers
   * the usual cause, which is a model reaching for a tool it read about somewhere else.
   */
  return fail(id, `There is no tool called ${name}. This server offers `
    + `${TOOLS.map((t) => t.name).join(' and ')}.`)
}

/**
 * A person who ran this by hand, told what it is instead of left waiting.
 *
 * An agent starts this with pipes and speaks JSON-RPC into them. Somebody who read the package name
 * and typed it into a terminal gets neither: no output, no prompt, and no exit, which is what a
 * hung program looks like and is the worst possible first contact with a tool. A terminal on stdin
 * is the difference, and it is the one signal that cannot be faked by the thing that should be here.
 */
if (process.stdin.isTTY) {
  console.log(`\n  Motioneer ${VERSION}, the motion studio.\n`)
  console.log('  This command is the agent side of it and speaks a protocol rather than English,')
  console.log('  which is why nothing is happening. What you almost certainly want is:\n')
  console.log('    npx motioneer                 open the studio on the components it ships with')
  console.log('    npx motioneer localhost:3000     open it on your own app\n')
  console.log('  To give it to an agent instead:\n')
  console.log('    claude mcp add --scope user motioneer -- npx -y -p motioneer motioneer-mcp\n')
  process.exit(0)
}

let buffer = ''
process.stdin.on('data', async (chunk) => {
  buffer += chunk
  const lines = buffer.split('\n')
  buffer = lines.pop() ?? ''
  for (const line of lines) {
    if (!line.trim()) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      continue
    }
    if (msg.method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: msg.params?.protocolVersion ?? '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'motioneer', version: VERSION },
          instructions: INSTRUCTIONS,
        },
      })
    } else if (msg.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } })
    } else if (msg.method === 'tools/call') {
      await call(msg.params?.name, msg.params?.arguments, msg.id, msg.params?._meta).catch((e) =>
        fail(msg.id, String(e instanceof Error ? e.message : e).slice(0, 300)),
      )
    } else if (msg.id !== undefined) {
      send({ jsonrpc: '2.0', id: msg.id, result: {} })
    }
  }
})
