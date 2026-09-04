#!/usr/bin/env node
/**
 * Wall as a tool an agent can call.
 *
 * The flow it exists for: you ask Claude Code for a landing page, it calls `design`, the
 * desktop opens with your brief already in it, you browse a wall of real pages and pick one,
 * and the choice comes back as a spec your agent implements in your actual codebase. The point
 * is that choosing happens where choosing is easy, and building happens where the code lives.
 *
 * The handoff is files in a directory rather than a return value, because a person browsing
 * takes longer than any sensible tool timeout. So `design` opens the wall, waits a few seconds
 * in case the choice is instant, and otherwise answers that the wall is open. That is not a
 * failure and is not reported as one: it is what happens almost every time, and an agent told
 * it failed will try again and throw away the wall the person is reading. `collect` is the
 * pickup, and the files stay on disk for it however long choosing takes.
 *
 * JSON-RPC over stdio, spoken directly, so this stays dependency free like the rest.
 */

import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
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
const VERSION = await readFile(path.join(ROOT, 'package.json'), 'utf8')
  .then((raw) => JSON.parse(raw).version)
  .catch(() => '0.0.0')

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n')
const ok = (id, text) => send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } })
const fail = (id, text) => send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text }] } })

const TOOLS = [
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
        options: {
          type: 'number',
          description: 'How many different motions to write. Three by default, six at most.',
        },
      },
      required: ['html'],
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
async function studio({ url, dir }) {
  const port = Number(process.env.WALL_PORT || 4321)
  const at = `http://localhost:${port}`
  const answering = async () => {
    try {
      const r = await fetch(`${at}/__wall/model`, { signal: AbortSignal.timeout(700) })
      return r.ok
    } catch { return false }
  }
  if (await answering()) {
    return `A motion studio is already open at ${at}. Tell them to use that one rather than `
      + 'opening another, and if they want it pointed somewhere else there is an address bar in '
      + 'the top left of it.'
  }
  const args = [path.join(ROOT, 'tools', 'studio.mjs')]
  if (url) args.push('--app', String(url))
  else if (dir) args.push(String(dir))
  // process.execPath rather than the word node: an agent launched from a desktop icon carries a
  // login shell's PATH, which on any machine using nvm or fnm has no node on it at all
  const child = spawn(process.execPath, args, { stdio: 'ignore', detached: true, cwd: dir || ROOT })
  const started = await new Promise((done) => {
    child.on('error', () => done(false))
    child.on('spawn', () => { child.unref(); done(true) })
  })
  if (!started) return 'The studio could not be started from here. `npm run studio` in the project will do it.'
  for (let n = 0; n < 40; n++) {
    if (await answering()) {
      return `The motion studio is open at ${at}.${url ? ` It is aimed at ${url}.` : ''} Tell them `
        + 'to pick one or more elements and press Give it motion, and that several motions come '
        + 'back to compare on one timeline. Choosing takes minutes, so do not wait on it: they can '
        + 'save what they like from the studio itself.'
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  return `The studio was started but has not answered at ${at} within ten seconds. Ask them to `
    + 'check the terminal, or run `npm run studio` themselves.'
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
  const motions = core.dealMotions(want)
  // the markup is what the selectors have to name, so it goes over whole rather than summarised
  const seen = html.slice(0, 6000)
  const styles = args?.css ? `\n\nIts stylesheet, for the timing to fit:\n${String(args.css).slice(0, 4000)}` : ''

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
    const pw = await import('playwright').catch(() => null)
    if (!pw) return null
    const { chromium } = pw
    const browser = await chromium.launch()
    try {
      const ctx = await browser.newContext({ viewport: { width: 420, height: 420 } })
      const tab = await ctx.newPage()
      const scoped = scope ? markup.replace(/<(\w+)/, `<$1 ${scope}`) : markup
      await tab.setContent(`<style>${css}</style>${scoped}`, { waitUntil: 'load' })
      const shots = new Set()
      for (let i = 0; i < 8; i++) {
        await tab.waitForTimeout(i === 0 ? 60 : 480)
        shots.add((await tab.screenshot()).toString('base64'))
      }
      return { distinct: shots.size }
    } finally {
      await browser.close()
    }
  }

  const tried = await Promise.all(motions.map(async (m) => {
    const brief = `The component:\n${seen}${styles}\n\nMove it by ${m} Take the timing from that `
      + `object: it is how the thing behaves, and it is why this one will not move like the others.`
    /**
     * One retry, because a dropped reply is not an opinion about the component.
     *
     * Run over eight real components, the only outright failure was a reply that came back
     * unparseable, and a caller told "no option moved the parts" for that reason has been given a
     * verdict where there was only a hiccup. The second attempt is allowed to think, since the
     * first was probably running under the fast dial, and thinking is the thing that was skipped.
     */
    let reply = await runClaude(core.MOTION_SYSTEM, brief).catch(() => null)
    let raw = reply ? core.grabJson(typeof reply === 'string' ? reply : reply.text ?? '') : null
    if (!raw) {
      reply = await runClaude(core.MOTION_SYSTEM, brief, { thinking: undefined }).catch(() => null)
      raw = reply ? core.grabJson(typeof reply === 'string' ? reply : reply.text ?? '') : null
    }
    const css = raw ? core.safeStyle(raw.css) : ''
    if (!css) return null
    // does it move the parts, and will its selectors still match after somebody edits the markup
    const faults = [...core.unmoved({ html: '', css, note: '' }), ...core.brittle(css)]
    const scope = core.scopeOf(css, raw.scope)
    return { m, css, scope, note: String(raw.note ?? '').slice(0, 90), faults }
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

async function call(name, args, id) {
  if (name === 'studio') return ok(id, await studio(args ?? {}))
  if (name === 'motion') return ok(id, await motion(args ?? {}))
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
  console.log(`\n  Wall ${VERSION}, the motion studio.\n`)
  console.log('  This command is the agent side of it and speaks a protocol rather than English,')
  console.log('  which is why nothing is happening. What you almost certainly want is:\n')
  console.log('    npx wall                      open the studio on the components it ships with')
  console.log('    npx wall http://localhost:3000   open it on your own app\n')
  console.log('  To give it to an agent instead:\n')
  console.log('    claude mcp add --scope user wall -- npx -y wall-mcp\n')
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
          serverInfo: { name: 'wall', version: VERSION },
        },
      })
    } else if (msg.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } })
    } else if (msg.method === 'tools/call') {
      await call(msg.params?.name, msg.params?.arguments, msg.id).catch((e) =>
        fail(msg.id, String(e instanceof Error ? e.message : e).slice(0, 300)),
      )
    } else if (msg.id !== undefined) {
      send({ jsonrpc: '2.0', id: msg.id, result: {} })
    }
  }
})
