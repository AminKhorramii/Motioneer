/**
 * What an agent is shown: the card it reads at connect time and the tools it can call.
 *
 * Claude Code shows the first 2,048 characters of a server's card and nothing after, and
 * Motioneer's card had grown to twelve thousand: the routing, the failure contract and the review
 * loop were all past the cut. So the card is a short loop, and everything a tool needs to be chosen
 * correctly lives in that tool's own description, which every client shows whole. The detail that
 * fits in neither travels in each reply's `next`, at the moment it applies.
 *
 * Eight tools, one job each. The names the surface used to have still answer, so an older prompt
 * or doc keeps working, but they are not listed: two tools that both claimed "a video of a site"
 * were how a launch film ended up as a component demo.
 */
export const MUSIC = ['glass', 'liquid', 'paper', 'monolith', 'elastic', 'voltage', 'current', 'branch', 'prism', 'conversation', 'hypnosis', 'warehouse', 'submerge', 'acidline', 'fracture', 'alloy', 'keystroke', 'relay', 'tabulator', 'postmark', 'handshake', 'release']

export const INSTRUCTIONS = `Motioneer makes motion for a person's own product: from their running site, component markup, or a film made earlier. Each tool's description says when to use it; this is the loop.

- film makes the video, and any request for a video goes straight to it. Pass url, dir as the absolute project path, and the person's whole request in direction, word for word. A demo of named elements on a dev server is mode capture with pick; a launch or brand film of a site is mode auto. It takes one to five minutes: say so once, then wait, and never call it again to check on it.
- change answers every reaction to a film, such as "slower", "drop shot 3", "make the cards snappier" or "darker music". It makes a new take of the projectId with only what changes. To add elements that were never filmed, film the site again with pick.
- look shows what is on a page when the person wants to choose what gets filmed, or a film's frames by projectId.
- motion writes CSS for markup they already have. studio is for picking and comparing by hand. projects finds an earlier film to change when its projectId is not in this conversation. open is only for when they ask to open the editor, the video or its folder. doctor is for setup trouble.

Every reply carries summary and next. Repeat the verified line from the summary. Look at the storyboard image before calling a film finished. Name weak shots by number and offer one concrete change. The verdict measures cuts, blank frames and timing, not taste, so say plainly what still looks weak.

A failure starts with "Cannot" and ends with "Next:". Relay it as given, and retry only when Next says to.`

const dir = { type: 'string', description: 'Absolute path of the person\'s project. Renders are saved in its motioneer folder.' }
const colour = (what) => ({ type: 'string', description: `Optional six-digit hex ${what}, such as #101319.` })

export const TOOLS = [
  {
    name: 'film', title: 'Make a motion film',
    description: 'Make a motion film of a person\'s product and return its projectId, an MP4 plus a live HTML film made of the real captures, numbered shots with track IDs, a storyboard and a verdict measured from the frames. Use it for any video, demo, reel, launch or brand film of a running site or dev server, or of an idea in words. Modes: capture films the page\'s own elements, each with a checked motion, cut to a pace, for a demo of named components (pick, count, pace and treatment apply). auto directs a brand film from the site\'s real DOM and SVG details and falls back to honestly labelled screenshots. native insists on DOM and SVG, hybrid mixes screenshots with authored graphics, and graphic is type and diagrams only. It takes one to five minutes. An image file cannot be filmed yet. For changes use change; use look first only when the person wants to choose what is filmed.',
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The running site or dev server, like http://localhost:3000 or https://linear.app. Leave it out only for an idea in words (mode graphic) or a projectId.' },
        dir,
        direction: { type: 'string', description: 'The person\'s whole request, word for word: tone, rhythm, what to emphasise, what should move and how, the feel of the music. Every plan and every motion reads it, so do not summarise it.' },
        mode: { type: 'string', enum: ['auto', 'capture', 'native', 'hybrid', 'graphic'], description: 'Without it: capture when pick, count, pace or treatment is given or the url is local, otherwise auto.' },
        seconds: { type: 'number', description: 'Length in seconds. About 12 for a fast cut and 20 for a demo; authored films take 6 to 30, 18 by default.' },
        pick: { type: 'string', description: 'capture: the elements to film, in the person\'s words, like "the pricing cards and the hero". Matched against what is on the page.' },
        count: { type: 'number', description: 'capture: how many elements, 1 to 12. Ten or more for "everything on the page".' },
        pace: { type: 'string', enum: ['calm', 'brisk', 'fast'], description: 'capture: fast is many one-second shots, brisk is a demo rhythm, calm is a few long shots.' },
        treatment: { type: 'string', enum: ['subtle', 'expressive', 'bold'], description: 'capture: how strongly each element moves. Expressive by default, subtle for calm.' },
        captureMode: { type: 'string', enum: ['dom', 'pixels'], description: 'capture: pixels photographs each element first, for when DOM capture loses its fonts, canvas or images; motion then moves a flat image.' },
        soundtrack: { type: 'string', enum: ['none', 'assembled', 'ambient', 'pulse', 'playful', 'percussive'], description: 'capture: the synthesized score. assembled by default, a dry tick on every arrival in the sound of the film\'s verbs; none for silence.' },
        brand: { type: 'string', maxLength: 24, description: 'Authored films: the company or product name. Read from the address when left out; needed for graphic.' },
        concept: { type: 'string', maxLength: 45, description: 'Authored films: a title for this creative direction, to tell variations apart.' },
        music: { type: 'string', enum: MUSIC, description: 'Authored films: the musical identity. Dry action scores: keystroke, relay, tabulator, postmark, handshake, release. Deep fast techno: hypnosis, warehouse, submerge, acidline, fracture, alloy. Electronic and keys: glass, liquid, paper, monolith, elastic, voltage, current, branch, prism, conversation. The director chooses when left out.' },
        bpm: { type: 'number', minimum: 80, maximum: 180, description: 'Authored films: one tempo for music and cuts. Deep fast techno sits at 144 to 162.' },
        art: { type: 'string', enum: ['studio', 'editorial', 'playful', 'chrome', 'technical', 'print'], description: 'Authored films: the composition and material. The site\'s own type and palette stay unless brandMode is expressive.' },
        brandMode: { type: 'string', enum: ['site', 'expressive'], description: 'Authored films: site keeps the site\'s observed font and palette (default); expressive is an explicitly requested departure.' },
        palette: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, description: 'Authored films: three hex colours in dark, accent, paper order.' },
        referenceUrls: { type: 'array', maxItems: 3, items: { type: 'string' }, description: 'Authored films: up to three documentation pages read for product facts. Keep url on the main site.' },
        soundKit: { type: 'string', description: 'Authored films: absolute path to a recorded sound kit manifest (kick, snare, hat, accent WAVs with provenance).' },
        reviewPasses: { type: 'integer', minimum: 0, maximum: 2, description: 'Authored films: automatic repair passes after a sampled-frame review, 1 by default.' },
        projectId: { type: 'string', description: 'hybrid: an earlier film whose captured visuals to reuse. It is not changed.' },
        theme: { type: 'string', enum: ['light', 'dark'], description: 'The page\'s colour scheme preference when the brief asks for one. It does not recolour captures.' },
        language: { type: 'string', description: 'Two-letter language of the request, en by default. Locale links on the page are followed; never guess a locale path.' },
        fps: { type: 'number', enum: [30, 60], description: '60 by default; 30 for smaller files.' },
        background: colour('stage background behind the captures'),
        ink: colour('title colour'),
      },
    },
  },
  {
    name: 'change', title: 'Change a film',
    description: 'Change a film or reel that was already made, by its projectId, and return a new take: a new projectId, the file, numbered shots and a storyboard. The original stays as it was. Use it for every reaction to a film. cut changes pace, length, shot order, dropped shots, titles, colours or frame rate of a capture film. motion rewrites how elements move while keeping timing and audio: name shots or elements for a capture film, or trackIds for a reel, and lock what was approved. music replaces only the score with a musical identity or direction, or with a finished audio file. timing rescales how fast parts move, how far apart they start, or their easing, with no model call. Give one of cut, motion, timing or music; cut and motion can go together. It takes 30 seconds to three minutes. To film elements that were never filmed, call film again with pick.',
    annotations: { destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'The film or take to change, from a film, change or projects reply.' },
        dir,
        cut: {
          type: 'object', description: 'A capture film\'s cut. Authored reels cannot be recut; change their motion or music instead.',
          properties: {
            pace: { type: 'string', enum: ['calm', 'brisk', 'fast'] },
            seconds: { type: 'number' },
            drop: { type: 'array', items: { type: 'string' }, description: 'Shot numbers from the reply like "3", or words from an element\'s name like "footer".' },
            order: { type: 'array', items: { type: 'number' }, description: 'Shot numbers in their new order, first ones first; the rest follow.' },
            opening: { type: 'string', description: 'A new opening title, two to five words.' },
            closing: { type: 'string', description: 'A new closing title.' },
            background: colour('stage background'),
            ink: colour('title colour'),
            fps: { type: 'number', enum: [30, 60] },
            soundtrack: { type: 'string', enum: ['none', 'assembled', 'ambient', 'pulse', 'playful', 'percussive'], description: 'Replace or remove the generated score; imported audio stays.' },
          },
        },
        motion: {
          type: 'object', description: 'How elements move. A new version of each motion; placement, timing, camera and audio are kept.',
          properties: {
            direction: { type: 'string', description: 'What should change, in the person\'s words: "glide in more slowly", "sharper arrival".' },
            elements: { type: 'array', items: { type: 'string' }, description: 'Capture films: shot numbers, words from element names or subject IDs. All visible elements when left out.' },
            trackIds: { type: 'array', items: { type: 'string' }, maxItems: 12, description: 'Reels: exact track IDs from the shots. For a carry, its track and both endpoints.' },
            lockedTrackIds: { type: 'array', items: { type: 'string' }, description: 'Approved tracks to protect, and keep locked on the new take.' },
            reviewPasses: { type: 'integer', minimum: 0, maximum: 2, description: 'Reels: extra automatic repair passes after the sampled-frame review.' },
          },
          required: ['direction'],
        },
        timing: {
          type: 'object', description: 'A capture film\'s motion timing, rescaled exactly with no model: new versions, cut and audio kept.',
          properties: {
            duration: { type: 'number', minimum: 0.25, maximum: 4, description: 'Scale each part\'s movement: 0.7 is 30 percent snappier, 1.5 is slower.' },
            stagger: { type: 'number', minimum: 0, maximum: 4, description: 'Scale the gaps between parts: 0.5 packs them tighter, 2 spreads them out.' },
            ease: { type: 'string', enum: ['arrive', 'leave', 'mechanical'], description: 'arrive settles with a long tail, leave accelerates away, mechanical steps.' },
            elements: { type: 'array', items: { type: 'string' }, description: 'Shot numbers or words from element names. Every visible element when left out.' },
          },
        },
        music: {
          type: 'object', description: 'Only the music. Visuals, timing and camera are kept.',
          properties: {
            identity: { type: 'string', enum: [...MUSIC, 'none'], description: 'A musical identity, or none to remove the generated score.' },
            direction: { type: 'string', description: 'Instrumentation, groove and feeling, for a newly composed phrase.' },
            bpm: { type: 'number', minimum: 40, maximum: 400 },
            audioFile: { type: 'string', description: 'Absolute path to a finished soundtrack that covers the film. Trimmed, never looped or stretched.' },
            replaceAudioTrackIds: { type: 'array', items: { type: 'string' }, description: 'Imported audio tracks to replace. Generated scores are replaced anyway.' },
          },
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'look', title: 'Look at a page or a film',
    description: 'See before filming or after rendering. With url it lists what on a page is worth filming, each element with its role, size, image and text, plus a contact sheet image with numbered tiles; follow with film, passing pick in the person\'s words. It also reads the motion the page already has, as house-style tokens, a Tailwind preset and an audit. With projectId it returns a storyboard of that film\'s shots with stable track IDs and the measured verdict; at gives frames at chosen seconds, and shot gives one shot as a filmstrip of six frames, which is how to see an arrival move. critique true also has the configured model list concrete visible issues, which does not certify taste. It never changes a project, and reuses a render of the same revision.',
    annotations: { readOnlyHint: true, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The running site or dev server to look at.' },
        projectId: { type: 'string', description: 'A film or take to look at.' },
        at: { type: 'array', maxItems: 12, items: { type: 'number' }, description: 'projectId: seconds to see frames at, such as [1.2, 1.35, 1.5].' },
        shot: { type: 'number', description: 'projectId: a shot number from the reply, shown as six frames from its start to its end.' },
        critique: { type: 'boolean', description: 'projectId: also ask the model for concrete visible issues, by track.' },
        theme: { type: 'string', enum: ['light', 'dark'] },
        language: { type: 'string', description: 'Two-letter language, en by default.' },
      },
    },
  },
  {
    name: 'motion', title: 'Write motion CSS',
    description: 'Write motion for a component the person already has, as stylesheets to append, and nothing else: keyframes scoped to one data attribute put on the root, reaching the parts by structure so they survive a class edit, staggered so the parts arrive in order rather than sliding in whole. Several options come back, each checked for moving parts, layout that stays put, selectors that do not leak and prefers-reduced-motion, then rendered on the markup and watched. Use it when they want CSS for markup they have, with nothing to look at first; use studio when they want to pick and compare by hand, and film for a video.',
    annotations: { readOnlyHint: true, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        html: { type: 'string', description: 'The component markup as it stands. Send the real thing rather than a summary.' },
        css: { type: 'string', description: 'Its stylesheet, if you have it. Optional; the timing fits better with it.' },
        purpose: { type: 'string', enum: ['entrance', 'emphasis', 'idle', 'interaction'], description: 'What the motion is for. Entrance by default.' },
        intensity: { type: 'string', enum: ['range', 'subtle', 'expressive', 'bold'], description: 'How strong. range compares three.' },
        duration: { type: 'number', description: 'Target length in milliseconds, 200 to 10000.' },
        direction: { type: 'string', description: 'Specific direction in the person\'s words.' },
        options: { type: 'number', description: 'How many different motions, three by default, six at most.' },
      },
      required: ['html'],
    },
  },
  {
    name: 'projects', title: 'Find earlier films',
    description: 'List the films and takes made in this workspace, newest first: id, name, source, kind (film or reel), pace, length, shots, and which take each came from. With projectId it returns that one project\'s numbered shots with track IDs and element names, which tracks are locked, and the files already written for it. Use it when the person wants to change or reopen earlier work, like the Linear film from yesterday, and its projectId is not in this conversation. To film a site again, call film. Read-only.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'One project to describe in full.' },
        limit: { type: 'number', description: 'How many to list, 20 by default.' },
      },
    },
  },
  {
    name: 'studio', title: 'Open the motion studio',
    description: 'Open the motion studio, where the person points at a running site or a folder of components, picks elements and compares several motions for them on one timeline, then cuts what they keep into a film. Use it when they would rather choose than describe, or say studio. It returns as soon as the studio is open, which is the normal outcome: choosing takes minutes, so tell them where it is rather than waiting. If one is already open for this workspace it says so rather than starting a second.',
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'A running site or dev server to aim it at, like http://localhost:3000.' },
        dir: { type: 'string', description: 'Absolute path of a folder of components to open on when there is no url.' },
      },
    },
  },
  {
    name: 'open', title: 'Open the editor or a file',
    description: 'Open something Motioneer made on the person\'s machine: the film editor in their browser (on a project when projectId is given), a rendered video in their player, or the folder it sits in. Call it only when they ask to open something or choose that option; making a video is not a request to play it. It returns at once.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', enum: ['editor', 'video', 'folder'], description: 'editor is the studio\'s film editor; video and folder need path.' },
        projectId: { type: 'string', description: 'editor: the film to open on.' },
        path: { type: 'string', description: 'video and folder: the absolute path of the video.' },
      },
      required: ['target'],
    },
  },
  {
    name: 'doctor', title: 'Check the setup',
    description: 'Check this workspace\'s model configuration, packaged files and local renderer without making a film or downloading anything, and return each check with the next step when one fails. Authentication is checked on the first model request. Use it on setup trouble, or when a tool fails in a way that points at setup.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: { type: 'object', properties: { dir: { type: 'string', description: 'Absolute workspace directory. Defaults to the connected project.' } } },
  },
]
