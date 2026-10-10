#!/usr/bin/env node
/**
 * Motioneer as a tool an agent can call: the protocol and the work.
 *
 * What an agent is shown, the card and the eight tools, lives in tools.mjs. How a reply and a
 * failure are written lives in reply.mjs, and which studio a call talks to in studio-process.mjs.
 * The names the surface used to have still answer here, each mapped onto the tool that now does
 * its job, so an older prompt or doc keeps working.
 *
 * Opening the studio returns as soon as it answers, because a person choosing takes longer than
 * any sensible tool timeout. Filming waits, because a file is what was asked for and there is
 * nothing to hand back until it exists.
 *
 * JSON-RPC over stdio, spoken directly, so this stays dependency free like the rest.
 */

import { runFilmTool, projectShots } from './film-tools.mjs'
import { INSTRUCTIONS, TOOLS } from './tools.mjs'
import { fail, send, cannot, answer } from './reply.mjs'
import { isLocal } from '../shared/guard.mjs'
import { ensureStudio, runningStudio, workspace } from './studio-process.mjs'
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
  if(!path.isAbsolute(process.env.MOTIONEER_WORKSPACE))throw Error('Cannot start MCP: MOTIONEER_WORKSPACE must be an absolute directory. Next: rerun npx motioneer setup --claude or setup --codex in the project.')
  process.chdir(process.env.MOTIONEER_WORKSPACE)
}
const VERSION = await readFile(path.join(ROOT, 'package.json'), 'utf8')
  .then((raw) => JSON.parse(raw).version)
  .catch(() => '0.0.0')





/**
 * Open the motion studio, or say that one is already open.
 *
 * A second studio for the same workspace would only compete with the first for its projects, so
 * this asks first. It waits for the studio to actually answer rather than reporting success on
 * spawn: a studio that failed to start looks exactly like one that started, right up until the
 * person opens the address and finds nothing there.
 */
async function studio({ url, dir }) {
  const running = await runningStudio()
  if (running) {
    return { summary: `A motion studio is already open at ${running}. Tell them to use that one rather than `
      + 'opening another; the address bar at its top left points it somewhere else.', structured: { studio: running, alreadyOpen: true }, ids: { studio: running } }
  }
  const at = await ensureStudio({ url, folder: dir, headless: false })
  if (!at) throw cannot('open the studio: it did not answer within fifteen seconds.', 'ask them to run `npx motioneer` themselves.')
  return { summary: `The motion studio is open at ${at}.${url ? ` It is aimed at ${url}.` : ''} Tell them `
    + 'to pick one or more elements and explore motion, and that several motions come back to '
    + 'compare on one timeline. Choosing takes minutes, so do not wait on it: they keep what they '
    + 'like in the studio itself.', structured: { studio: at, url: url || null }, ids: { studio: at } }
}

/** This workspace's studio for a tool that needs one, started headless when none is running. */
async function studioFor(what, { url } = {}) {
  const at = await ensureStudio({ url })
  if (!at) throw cannot(`${what}: no studio would start for this workspace.`, 'run npx motioneer doctor, then ask again.')
  return at
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
async function open({ target, path: file, projectId }) {
  let what, where
  if (target === 'editor') {
    const at = await studioFor('open the editor')
    what = 'the editor'; where = `${at}/__motioneer/editor/${projectId ? `?project=${encodeURIComponent(projectId)}&view=film` : ''}`
  } else if (target === 'video' || target === 'folder') {
    if (!file || !path.isAbsolute(String(file))) throw cannot(`open the ${target}: it needs the absolute path of the video.`, 'pass the path a film reply returned.')
    const there = await stat(file).then(() => true, () => false)
    if (!there) throw cannot(`open the ${target}: there is no file at ${file}.`, 'pass the path a film reply returned.')
    what = target === 'video' ? 'the video' : 'its folder'; where = target === 'video' ? String(file) : path.dirname(String(file))
  } else throw cannot('open that: open needs a target of editor, video or folder.', 'choose one of those targets.')
  if (process.env.MOTIONEER_NO_OPEN) return { summary: `Would open ${what} at ${where}.`, structured: { opened: target, at: where } }
  const cmd = process.platform === 'darwin' ? ['open', [where]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', where]] : ['xdg-open', [where]]
  const child = spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true })
  child.on('error', () => {}); child.unref()
  return { summary: `Opened ${what} at ${where}.`, structured: { opened: target, at: where } }
}

/**
 * Read a page the way film would, and say what is on it, so the agent can talk about it and the
 * person can point at what they want filmed before a minute of rendering is spent.
 */
async function inspect({ url, dir, language, theme }) {
  if (!url) throw cannot('inspect: inspect needs a url.', 'pass the running site or dev server.')
  const at = await studioFor('inspect', { url })
  const { inspectSite, describe } = await import(pathToFileURL(path.join(ROOT, 'tools', 'editor', 'autofilm.mjs')).href)
  const {prepareRenderer}=await import('../tools/environment.mjs');await prepareRenderer(at)
  const seen = await inspectSite({ at, url, language, theme })
  const lines = seen.candidates.map(describe)
  const summary = `${seen.title || seen.source} has ${seen.candidates.length} things worth filming.`
    + (seen.sheet ? ` The image is a contact sheet of the first ${seen.sheet.tiles}, each tile labelled with its index; describe or show them, and ask which the person wants.` : '')
  return { summary, detail: lines.join('\n'), images: seen.sheet ? [seen.sheet] : [], ids: { source: seen.source },
    structured: { title: seen.title, source: seen.source, background: seen.colours?.background, elements: seen.candidates.map((c) => ({ index: c.i, role: c.role, section: c.section, width: c.w, height: c.h, image: !!c.image, text: c.text || '', alike: c.alike || 0 })) },
    next: [{ tool: 'film', args: { url, mode: 'capture', pick: "<the elements they chose, in their words>" }, why: 'film what they choose' }, { tool: 'film', args: { url, mode: 'auto' }, why: 'make a brand film of the whole site instead' }] }
}

async function film({ url, dir, language, theme, captureMode, seconds, fps, soundtrack, background, ink, look, count, pick, pace, direction }, progress = () => {}) {
  if (!url) throw cannot('film: film needs a url.', 'pass a running site or dev server like http://localhost:3000.')
  const at = await studioFor('film', { url })

  const {prepareRenderer}=await import('../tools/environment.mjs');await prepareRenderer(at,progress)

  const { autofilm } = await import(pathToFileURL(path.join(ROOT, 'tools', 'editor', 'autofilm.mjs')).href)
  const steps = [], made = {}
  const wantPace = ['calm', 'brisk', 'fast'].includes(pace) ? pace : 'brisk'
  const wantSeconds = Number(seconds) || (wantPace === 'fast' ? 12 : 20)
  // a fast film wants many elements; a calm one a few. the cap is what a render can carry in a few minutes
  const max = Math.max(1, Math.min(12, Number(count) || (wantPace === 'fast' ? 8 : wantPace === 'brisk' ? 5 : 3)))
  const result = await autofilm({ at, url, language, theme, captureMode, background, ink, pick: String(pick || '').slice(0, 600), direction: String(direction || '').slice(0, 1400), seconds: wantSeconds, fps: fps ?? 60, soundtrack: soundtrack ?? (wantPace === 'calm' ? 'ambient' : 'pulse'), look: look || (wantPace === 'calm' ? 'subtle' : 'expressive'), pace: wantPace, max, onStep: (m) => {steps.push(m);progress(m)}, onProject: (id) => { made.projectId = id } }).catch((e) => { e.projectId = made.projectId; throw e })
  const file = await keepFile(result, dir, `${new URL(url).host}-${wantPace}`)
  const review = await reviewResult(result,file,progress)
  const buf = { length: (await stat(file)).size }
  const { proofLine } = await import(pathToFileURL(path.join(ROOT, 'tools', 'editor', 'proof.mjs')).href)
  const verified = proofLine(result.proof)
  const style = await styleOf(at, result.projectId, result.proof)
  const structured = { ...shape(result, file, wantPace), assembled: style, found: Number(/Found (\d+) things/.exec(steps.join(' '))?.[1]) || null }
  const mended = result.repairs?.length ? ` It mended itself once before the final render: ${result.repairs.join('; ')}.` : ''
  const fates = result.elements.filter((e) => e.status !== 'filmed')
  const leftOut = fates.length ? ` Left out: ${fates.map((e) => `${e.name} (${e.status})`).join('; ')}.` : ''
  return { structured, images: review ? [review] : [], ids: { projectId: result.projectId, video: file, storyboard: result.storyboard },
    summary: `Filmed ${result.distinct} of ${result.elements.length} selected element${result.elements.length === 1 ? '' : 's'} from ${url}${result.product ? `, "${result.product}",` : ''} into a ${Math.round(result.seconds)} second ${wantPace} film`
      + `${result.opening ? ` titled "${result.opening}"` : ''}: ${result.shots} shots of ${result.distinct} distinct element${result.distinct === 1 ? '' : 's'} in ${result.layouts} layout${result.layouts === 1 ? '' : 's'}, saved to ${file} (${(buf.length / 1e6).toFixed(1)} MB). ${verified}${mended}${leftOut}${styleLine(style)}`,
    next: filmNext(result.projectId, result.proof, false) }
}

async function reel({brand,domain,projectId,url,mode='auto',direction,seconds=18,palette,music,art,concept,bpm,brandMode='site',referenceUrls=[],soundKit,reviewPasses=1,dir},progress=()=>{}) {
  const at=await studioFor('make a reel',{url:url||(domain?'https://'+domain:undefined)}),made={}
  const {prepareRenderer}=await import('../tools/environment.mjs');await prepareRenderer(at,progress)
  const {kineticReel}=await import(pathToFileURL(path.join(ROOT,'tools/editor/kinetic.mjs')).href)
  const result=await kineticReel({at,brand,domain,projectId,url,mode,direction,seconds,palette,music,art,concept,bpm,brandMode,referenceUrls,soundKit,reviewPasses,onStep:progress,onProject:id=>{made.projectId=id}}).catch(e=>{e.projectId=made.projectId;throw e})
  const file=await keepFile(result,dir,`${brand}-${result.plan.concept||result.mode}`),review=await reviewResult(result,file,progress)
  const sourceSheet=result.sourceSheet?file.replace(/\.mp4$/,'-sources.jpg'):null
  if(sourceSheet)await writeFile(sourceSheet,Buffer.from(result.sourceSheet.data,'base64'))
  const reviewed=result.review?.status==='unavailable'?'Visual review unavailable: '+result.review.error:'Sampled-frame review '+result.review?.status+': '+(result.review?.issues?.length||0)+' unresolved observations; artistic quality is not certified.'
  const {proofLine}=await import(pathToFileURL(path.join(ROOT,'tools','editor','proof.mjs')).href),style=await styleOf(at,result.projectId,result.proof)
  return {images:review?[review]:[],ids:{projectId:result.projectId,video:file,storyboard:result.storyboard,sources:sourceSheet,trackIds:result.shotList.map(s=>s.trackId)},
    structured:{projectId:result.projectId,editor:`${at}/__motioneer/editor/?project=${encodeURIComponent(result.projectId)}&view=film`,studio:at,file,seconds,fps:60,style:result.mode==='native'?'native':result.mode==='hybrid'?'hybrid':'kinetic',sourceSelection:result.sourceSelection,soundtrack:result.soundtrack,music:{profile:result.music?.profile,label:result.music?.label},bpm:result.bpm,concept:result.plan.concept,
      shots:result.shotList.map(s=>({shot:s.shot,trackId:s.trackId,sceneId:s.sceneId,at:s.at,seconds:s.seconds,elements:s.elements,layout:s.layout,choreography:s.choreography,...(s.renderedMotion?{renderedMotion:s.renderedMotion}:{})})),
      sourceProjectId:result.sourceProjectId,artifacts:{video:file,storyboard:result.storyboard||null,sources:sourceSheet},reviewError:result.reviewError||null,verdict:{ok:!!result.proof?.ok,notes:result.proof?.notes||[],cuts:result.proof?.cuts,arriveMs:result.proof?.arriveMs,blank:result.proof?.blank},quality:{warnings:result.quality?.warnings||[]},
      review:result.review?{status:result.review.status,summary:result.review.summary,issues:result.review.issues||[],attempts:result.review.attempts||[],error:result.review.error}:null,assembled:style,eventStatus:result.eventStatus,transitions:(result.transitions||[]).length,captureSkipped:result.captureSkipped||[],limitation:result.limitation},
    summary:`Created ${brand}: ${result.plan.concept}. ${result.shotList.length} scenes in ${seconds} seconds at 60 fps, with original ${result.music.label} music, saved to ${file}. ${proofLine(result.proof)} ${reviewed} ${result.limitation||''}`.trim(),
    next:filmNext(result.projectId,result.proof,true,result.shotList)}
}

async function rescore(args,progress=()=>{}){
  const at=await studioFor('rescore')
  const {prepareRenderer}=await import('../tools/environment.mjs');await prepareRenderer(at,progress)
  const {rescoreFilm}=await import(pathToFileURL(path.join(ROOT,'tools/editor/rescore.mjs')).href)
  const result=await rescoreFilm({...args,at,onStep:progress})
  const file=await keepFile(result,args.dir,`${result.music.label}-score`),review=await reviewResult(result,file,progress),audio=file.replace(/\.mp4$/,'-score.wav')
  const response=await fetch(result.audioUrl)
  if(!response.ok)throw cannot('deliver the score: its audio file is unavailable.','export the saved take from the studio.')
  await writeFile(audio,Buffer.from(await response.arrayBuffer()))
  return {images:review?[review]:[],ids:{projectId:result.projectId,video:file,audio,storyboard:result.storyboard},
    structured:{projectId:result.projectId,editor:`${at}/__motioneer/editor/?project=${encodeURIComponent(result.projectId)}&view=film`,sourceProjectId:result.sourceProjectId,studio:at,file,seconds:result.seconds,fps:result.fps,soundtrack:result.soundtrack,music:{profile:result.music?.profile,label:result.music?.label},bpm:result.bpm,shots:result.shotList,verdict:{ok:!!result.proof?.ok,notes:result.proof?.notes||[]},artifacts:{video:file,audio,storyboard:result.storyboard||null}},
    summary:`Made a new take with ${result.soundtrack==='imported'?'the supplied soundtrack':`an original ${result.music.label} score`}: ${result.music.description} The visuals and the original film are unchanged. Video ${file}, audio ${audio}.`,
    next:[{tool:'change',args:{projectId:result.projectId,music:{identity:'<another identity>'}},why:'try a different musical identity on the same edit'},{tool:'open',args:{target:'editor',projectId:result.projectId},why:'only if they ask to open the editor'}]}
}

/** The house style report for a saved film, read from the studio that made it. */
async function styleOf(at, projectId, proof) {
  const { assembledReport } = await import(pathToFileURL(path.join(ROOT, 'tools', 'editor', 'autofilm.mjs')).href)
  const project = await fetch(`${at}/__motioneer/projects/${encodeURIComponent(projectId)}`).then((r) => r.ok ? r.json() : null).catch(() => null)
  return project ? assembledReport(project, proof) : null
}
const styleLine = (style) => style && !style.ok ? ` House style notes: ${style.notes.join('; ')}.` : ''

/**
 * The rendered file, moved from where the driver measured it to where the person works.
 *
 * Into a motioneer folder rather than the project root, which had collected fifty timestamped files
 * in one repository, under a name that says what the film is, and recorded beside the project so
 * projects can say where every take was written.
 */
async function keepFile(result, dir, hint = 'film') {
  const base = dir && path.isAbsolute(dir) ? dir : process.cwd(), outDir = path.join(base, 'motioneer')
  await mkdir(outDir, { recursive: true })
  await writeFile(path.join(outDir, '.gitignore'), '# Motioneer renders are output, not source. Delete this file to commit them.\n*\n', { flag: 'wx' }).catch(() => {})
  const slug = String(hint).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'film'
  let n = 1
  while (await stat(path.join(outDir, `${slug}-${n}.mp4`)).then(() => true, () => false)) n++
  const file = path.join(outDir, `${slug}-${n}.mp4`)
  const buf = result.file ? await readFile(result.file).catch(() => null) : null
  await writeFile(file, buf || Buffer.from(await (await fetch(result.url)).arrayBuffer()))
  if (result.projectId) {
    const record = path.join(await workspace(), '.studio', 'projects', String(result.projectId), 'outputs.json')
    const was = JSON.parse(await readFile(record, 'utf8').catch(() => '[]'))
    await writeFile(record, JSON.stringify([...was, { file, at: Date.now() }].slice(-50))).catch(() => {})
  }
  return file
}

async function reviewResult(result,file,progress) {
  progress('Inspecting frames from the finished video.')
  try {
    if(result.review?.storyboard){const review=result.review.storyboard;result.storyboard=file.replace(/\.mp4$/,'-storyboard.jpg');await writeFile(result.storyboard,Buffer.from(review.data,'base64'));return review}
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
  }
}

/**
 * A film changed rather than remade. The studio that made it is still open with the project,
 * so this goes straight to the cut and the render, and comes back in the time a render takes.
 */
async function revise({ projectId, dir, pace, seconds, opening, closing, drop, order, motionDirection, motionElements, fps, soundtrack, background, ink, sourceProjectId }, progress = () => {}) {
  if (!projectId) throw cannot('revise: revise needs the projectId a film returned.', 'pass it, or film first.')
  const at = await studioFor('revise')
  const {prepareRenderer}=await import('../tools/environment.mjs');await prepareRenderer(at,progress)
  const { revise: reviseFilm } = await import(pathToFileURL(path.join(ROOT, 'tools', 'editor', 'autofilm.mjs')).href)
  const steps = []
  const result = await reviseFilm({ at, projectId: String(projectId), pace, seconds, opening, closing, drop, order, motionDirection, motionElements, fps, soundtrack, background, ink, onStep: (m) => {steps.push(m);progress(m)} })
  const file = await keepFile(result, dir, `${new URL(result.source || 'http://film').host}-${result.pace}-take`)
  const review=await reviewResult(result,file,progress)
  const { proofLine } = await import(pathToFileURL(path.join(ROOT, 'tools', 'editor', 'proof.mjs')).href)
  const style = await styleOf(at, result.projectId, result.proof)
  return { structured: { ...shape(result, file, result.pace), assembled: style, ...(sourceProjectId ? { sourceProjectId } : {}) }, images: review ? [review] : [], ids: { projectId: result.projectId, video: file, storyboard: result.storyboard },
    summary: `${sourceProjectId ? 'Made a new take' : 'Revised the film'}: ${result.changes.join('; ') || 'cut again as it was'}. Now ${result.shots} shots of ${result.distinct} element${result.distinct === 1 ? '' : 's'} in ${Math.round(result.seconds)} seconds, ${result.pace}, saved to ${file}. ${proofLine(result.proof)}${styleLine(style)}`,
    next: filmNext(result.projectId, result.proof, false) }
}

/**
 * Motion for a component somebody else built, handed back as stylesheets and nothing else.
 *
 * Several at once, each dealt a different verb from the deck, so they disagree by construction:
 * asked once, every call reaches for the same easing. They are written by the studio's own
 * /generate, the path the editor and every film use, so an agent's options pass the same gates and
 * the same rendered check that the motion comes back to rest. This tool then enforces what its
 * description promises: an option that only slides the finished component is dropped, because a
 * caller handed four options where one is a fade has to do the judging this tool exists to do.
 */
async function motion(args) {
  const html = String(args?.html ?? '')
  if (!html.trim()) throw cannot('write motion: motion needs the component markup, so the keyframes can name its parts.', 'send the component markup as html.')
  const want = Math.max(1, Math.min(6, Number(args?.options) || 3))
  const core = await import(pathToFileURL(path.join(ROOT, 'dist-core', 'core.js')).href)
  const brief = core.motionBrief(args), verbs = core.dealVerbs(want)
  const treatments = Array.from({ length: want }, (_, i) => brief.intensity === 'range' ? ['subtle', 'expressive', 'bold'][i % 3] : brief.intensity)
  const at = await studioFor('write motion')
  const subject = { id: 'component', name: 'Component', html: html.slice(0, 60000), css: String(args?.css || '').slice(0, 60000), w: 960, h: 540, warnings: [] }
  const tried = await Promise.all(treatments.map(async (treatment, i) => {
    const made = await fetch(`${at}/__motioneer/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subject, brief, treatment, verb: verbs[i] }) }).then((r) => r.json()).catch((e) => ({ error: e.message }))
    if (made.error || !made.css) return { verb: verbs[i], treatment, faults: [made.error || 'No usable CSS came back.'] }
    // parts arriving at different times is the difference between a mechanism and a slideshow
    const judged = core.judgeMotion({ css: made.css, scope: made.scope, note: made.note }, made.scope, brief.purpose === 'entrance')
    return judged.css ? { ...made, faults: [] } : { verb: verbs[i], treatment, faults: [judged.why] }
  }))
  const kept = tried.filter((t) => !t.faults.length), dropped = tried.filter((t) => t.faults.length)
  if (!kept.length) {
    /**
     * A component with one part cannot have a mechanism, and saying otherwise is unhelpful. Over
     * eight real shadcn components the button alone failed: an icon and a label have nothing to
     * arrive in sequence. Counting its elements separates "this did not work" from "there is
     * nothing here to stagger", and only the first is worth retrying.
     */
    const parts = (html.match(/<(?!\/)(?!br|hr|img|input|meta|link)[a-zA-Z]/g) ?? []).length
    const why = dropped[0]?.faults[0] ?? 'no usable reply came back'
    if (parts < 5 && dropped.some((d) => d.faults.some((f) => f.includes('at once')))) throw cannot(`give this component staggered motion: it has ${parts} element${parts === 1 ? '' : 's'}, so motion on it can only move the whole, which is the transition it already has.`, 'send a component with parts that can arrive in sequence, such as rows, cards, fields or cells.')
    throw cannot(`write motion that moves the parts: ${why}`, 'try a more specific direction, or send the component\'s css as well.')
  }
  const why = [...new Set(dropped.flatMap((d) => d.faults.map((f) => String(f).split('.')[0])))]
  const watched = kept.every((k) => k.checked)
  const options = kept.map((k) => ({ verb: k.verb, errand: k.errand, note: k.note || 'untitled', treatment: k.treatment, scope: k.scope, css: k.css, assembled: k.assembled, watched: !!k.checked }))
  return { structured: { options, dropped: dropped.length, droppedBecause: why },
    summary: `${kept.length} motion${kept.length === 1 ? '' : 's'} for this component, each taking its timing from a different real object (${options.map((o) => o.verb).join(', ')})${dropped.length ? `, after ${dropped.length} written and dropped (${why.join('; ')})` : ''}. For each, put its scope attribute on the component's outermost element and append its css. ${watched ? 'Each was rendered on the component and seen to come back to rest.' : 'Some were checked by reading the css only, because no browser is installed here.'}`,
    detail: kept.map((k, i) => `## ${i + 1}. ${k.note || 'untitled'} (${k.verb})\n\n` + (k.scope ? `Put \`${k.scope}\` on the component's outermost element, then append:\n\n` : 'Append:\n\n') + `\`\`\`css\n${k.css}\n\`\`\``).join('\n\n'), next: [] }
}

/** What makes sense after a film or a take, filled in with its own projectId. */
function filmNext(projectId, proof, authored, shots = []) {
  const weak = proof?.notes?.length ? `fix what the verdict found: ${proof.notes[0]}` : 'drop a weak shot, named by its number'
  return [
    authored
      ? { tool: 'change', args: { projectId, motion: { direction: '<what should move differently>', trackIds: [shots[1]?.trackId || '<trackId>'] } }, why: 'change how one scene moves; timing and music are kept' }
      : { tool: 'change', args: { projectId, cut: { drop: ['<shot number>'] } }, why: weak },
    authored
      ? { tool: 'change', args: { projectId, music: { identity: '<identity>' } }, why: 'try another score on the same edit' }
      : { tool: 'change', args: { projectId, motion: { direction: '<what should move differently>', elements: ['<shot number or element>'] } }, why: 'change how elements move; the cut and audio are kept' },
    { tool: 'open', args: { target: 'editor', projectId }, why: 'only if they ask to open the editor' },
  ]
}

const hostOf = (url) => { try { return new URL(/^[a-z]+:\/\//i.test(url) ? url : `http://${url}`).hostname } catch { return '' } }
/** The product's name as an address spells it: linear.app is Linear. */
const brandOf = (url) => { const h = hostOf(url).replace(/^www\./, ''); if (!h || isLocal(h)) return ''; const name = h.split('.').slice(-2)[0]; return name.charAt(0).toUpperCase() + name.slice(1) }

/**
 * One tool for every film. A demo of named elements, or anything on a dev server, is the capture
 * film; a site's launch or brand film is authored; an idea with no site is graphic. The mode can be
 * given, and is otherwise read from what was asked for.
 */
async function filmTool(args, progress) {
  const a = { ...args }
  const mode = a.mode || (a.pick || a.count || a.pace || a.treatment || (a.url && isLocal(hostOf(a.url))) ? 'capture' : a.url || a.projectId ? 'auto' : 'graphic')
  if (!['auto', 'capture', 'native', 'hybrid', 'graphic'].includes(mode)) throw cannot(`film in mode ${mode}.`, 'choose auto, capture, native, hybrid or graphic.')
  // the person's own words decide silence even when the call left the soundtrack out
  if (a.soundtrack === undefined && /\b(silent|silence|no music|no sound|without (music|sound)|mute)\b/i.test(a.direction || '')) a.soundtrack = 'none'
  if (mode === 'capture') return film({ ...a, look: a.treatment ?? a.look }, progress)
  const brand = String(a.brand || brandOf(a.url || '') || '').slice(0, 24)
  if (!brand) throw cannot('make an authored film without a name: there is no site to read one from.', 'pass brand, the product\'s name.')
  return reel({ ...a, mode, brand }, progress)
}

/**
 * Every change to a film, as a new take. A capture film is forked first and the fork recut, so a
 * person who has the original open in the editor never finds it changed under them. An authored
 * reel's scenes are designed together, so its motion is refined by track and its cut is left alone.
 */
async function changeTool({ projectId, dir, cut, motion: moving, music }, progress) {
  if (!projectId) throw cannot('change a film without its projectId.', 'pass the projectId a film, change or projects reply carried, or call projects to find it.')
  if (!cut && !moving && !music) throw cannot('change nothing: give cut, motion or music.', 'say what should change.')
  if (music && music.identity === 'none' && !cut && !moving) return changeTool({ projectId, dir, cut: { soundtrack: 'none' } }, progress)
  if (music && (cut || moving)) throw cannot('change the music in the same call as the cut or the motion.', 'change the cut or motion first, then the music of the take it returns.')
  const at = await studioFor('change')
  const project = await fetch(`${at}/__motioneer/projects/${encodeURIComponent(projectId)}`).then((r) => r.ok ? r.json() : null).catch(() => null)
  if (!project || project.error || !Array.isArray(project.tracks)) throw cannot(`change ${projectId}: there is no such film in this workspace.`, 'call projects to find the film, or film again.')
  if (music) return rescore({ projectId, dir, music: music.identity, direction: music.direction, bpm: music.bpm, audioFile: music.audioFile, replaceAudioTrackIds: music.replaceAudioTrackIds }, progress)
  const authored = !!project.direction || project.motions.some((m) => m.scope === 'data-kinetic')
  if (authored) {
    if (cut) throw cannot('recut an authored reel: its scenes are designed together, so shots cannot be dropped or reordered.', 'change its motion with trackIds, or its music, or film again with a new direction.')
    const shots = projectShots(project)
    const trackIds = moving.trackIds?.length ? moving.trackIds : (moving.elements || []).flatMap((v) => /^\d+$/.test(String(v)) ? [shots[Number(v) - 1]?.trackId] : shots.filter((s) => s.elements.join(' ').toLowerCase().includes(String(v).toLowerCase())).map((s) => s.trackId)).filter(Boolean)
    if (!trackIds.length) throw cannot('change a reel\'s motion without knowing which scenes.', 'pass trackIds from its shots, or shot numbers in elements.')
    return refineTool({ projectId, dir, trackIds, lockedTrackIds: moving.lockedTrackIds || [], direction: moving.direction, reviewPasses: moving.reviewPasses ?? 0 }, progress)
  }
  const { forkProject } = await import(pathToFileURL(path.join(ROOT, 'tools', 'editor', 'refinement.mjs')).href)
  const { shotList } = await import(pathToFileURL(path.join(ROOT, 'tools', 'editor', 'autofilm.mjs')).href)
  const shots = shotList(project)
  const elements = [...(moving?.elements || []).flatMap((v) => /^\d+$/.test(String(v)) && shots[Number(v) - 1] ? shots[Number(v) - 1].ids : [String(v)]), ...(moving?.trackIds || []).map((tid) => project.tracks.find((t) => t.id === tid)?.subjectId).filter(Boolean)]
  progress('Making a new take, so the original stays as it is.')
  const take = await forkProject(at, project, `${project.name} / Take`, { tool: 'change', request: JSON.stringify({ cut, motion: moving }).slice(0, 2000) })
  return revise({ projectId: take.id, dir, ...(cut || {}), motionDirection: moving?.direction || '', motionElements: elements, sourceProjectId: projectId }, progress)
}

/** A reel's scoped motion refinement, as a take of its own. */
async function refineTool(args, progress) {
  const at = await studioFor('refine')
  const { prepareRenderer } = await import('../tools/environment.mjs'); await prepareRenderer(at, progress)
  const result = await runFilmTool('refine', args, { at, onStep: progress }), file = await keepFile(result, args.dir, 'refined-take'), image = await reviewResult(result, file, progress)
  const { proofLine } = await import(pathToFileURL(path.join(ROOT, 'tools', 'editor', 'proof.mjs')).href)
  return { images: image ? [image] : [], ids: { projectId: result.projectId, video: file, storyboard: result.storyboard },
    structured: { projectId: result.projectId, sourceProjectId: result.sourceProjectId, editor: `${at}/__motioneer/editor/?project=${result.projectId}&view=film`, file, seconds: result.seconds, changes: result.changes, unchanged: result.unchanged, shots: result.shotList, verdict: { ok: !!result.proof?.ok, notes: result.proof?.notes || [] }, review: { status: result.review?.status, issues: result.review?.issues || [], attempts: result.review?.attempts || [] }, eventStatus: result.eventStatus, artifacts: { video: file, storyboard: result.storyboard || null } },
    summary: `${result.unchanged ? 'No motion changed, so the source take stands' : `Made a new take refining ${result.changes.length} track${result.changes.length === 1 ? '' : 's'}`}, saved to ${file}. ${proofLine(result.proof)} Review ${result.review?.status}: ${result.review?.issues?.length ?? 0} unresolved observations.`,
    next: filmNext(result.projectId, result.proof, true, result.shotList) }
}

/** A saved film rendered and shown, never changed. */
async function reviewTool({ projectId, critique = false }, progress) {
  if (!projectId) throw cannot('look at a film without its projectId.', 'pass the projectId, or call projects to find it.')
  const at = await studioFor('look at the film')
  const { prepareRenderer } = await import('../tools/environment.mjs'); await prepareRenderer(at, progress)
  const result = await runFilmTool('review', { projectId, critique }, { at, onStep: progress })
  const image = await reviewResult(result, result.file, progress)
  const { proofLine } = await import(pathToFileURL(path.join(ROOT, 'tools', 'editor', 'proof.mjs')).href)
  const issues = result.review?.issues || []
  return { images: image ? [image] : [], ids: { projectId, render: result.file, storyboard: result.storyboard },
    structured: { projectId, editor: `${at}/__motioneer/editor/?project=${projectId}&view=film`, seconds: result.seconds, shots: result.shotList, verdict: { ok: !!result.proof?.ok, notes: result.proof?.notes || [] }, review: { status: result.review?.status, summary: result.review?.summary, issues }, eventStatus: result.eventStatus, artifacts: { render: result.file, storyboard: result.storyboard || null } },
    summary: `Rendered ${projectId} to look at it; nothing was changed. ${proofLine(result.proof)}${critique ? ` The model reviewed the sampled frames: ${issues.length} observation${issues.length === 1 ? '' : 's'}${result.review?.status === 'unavailable' ? `, because the review was unavailable: ${result.review.error}` : ''}.` : ''}`,
    next: issues.slice(0, 3).map((i) => ({ tool: 'change', args: { projectId, motion: { direction: i.suggestion || i.detail, trackIds: [i.trackId] } }, why: i.detail })) }
}

/** Looking at a page or at a film, which is the same question asked before and after. */
async function lookTool({ url, projectId, critique, theme, language }, progress) {
  if (url && projectId) throw cannot('look at a page and a film in one call.', 'pass url or projectId.')
  if (url) return inspect({ url, language, theme })
  if (!projectId) throw cannot('look at nothing: look needs a url or a projectId.', 'pass the running site to see what is on it, or a film\'s projectId to see its frames.')
  return reviewTool({ projectId, critique: critique === true }, progress)
}

/** The films and takes this workspace already has, read from disk with no studio needed. */
async function projectsTool({ projectId, limit }) {
  const root = path.join(await workspace(), '.studio', 'projects')
  const { projectStore } = await import(pathToFileURL(path.join(ROOT, 'tools', 'editor', 'projects.mjs')).href)
  const store = projectStore(root)
  if (!projectId) {
    const all = await store.list(), shown = all.slice(0, Math.max(1, Math.min(100, Number(limit) || 20)))
    return { summary: all.length ? `${all.length} film${all.length === 1 ? '' : 's'} and takes in this workspace; the newest ${shown.length} are listed, newest first.` : 'There are no films in this workspace yet.',
      detail: shown.map((p) => `${p.id}  ${p.name}  ${p.kind}${p.pace ? ', ' + p.pace : ''}, ${p.seconds}s, ${p.shots} shots${p.origin ? `, a ${p.origin.tool} take of ${p.origin.sourceProjectId}` : ''}`).join('\n'),
      structured: { workspace: path.dirname(path.dirname(root)), total: all.length, projects: shown.map((p) => ({ ...p, updatedAt: new Date(p.updatedAt).toISOString() })) },
      next: shown[0] ? [{ tool: 'projects', args: { projectId: shown[0].id }, why: 'see one film\'s shots, track IDs and files' }] : [{ tool: 'film', args: { url: '<their site>' }, why: 'make the first one' }] }
  }
  const p = await store.read(String(projectId)).catch(() => null)
  if (!p) throw cannot(`find project ${projectId} in this workspace.`, 'call projects without a projectId to list what is here.')
  const { shotList } = await import(pathToFileURL(path.join(ROOT, 'tools', 'editor', 'autofilm.mjs')).href)
  const authored = !!p.direction || p.motions.some((m) => m.scope === 'data-kinetic')
  const shots = authored ? projectShots(p) : shotList(p).map((s) => ({ ...s, trackIds: p.tracks.filter((t) => t.kind === 'component' && !t.hidden && Math.round(t.start) / 1000 === s.at).map((t) => t.id) }))
  const outputs = JSON.parse(await readFile(path.join(root, p.id, 'outputs.json'), 'utf8').catch(() => '[]'))
  return { summary: `${p.name}: a ${authored ? 'reel' : 'capture film'} of ${p.source || 'no site'}, ${Math.round((p.settings.to - p.settings.from) / 100) / 10} seconds in ${shots.length} shots.${outputs.length ? ` Last written to ${outputs.at(-1).file}.` : ''}`,
    ids: { projectId: p.id, files: outputs.map((o) => o.file) },
    structured: { projectId: p.id, name: p.name, kind: authored ? 'reel' : 'film', source: p.source, pace: p.film?.pace || null, origin: p.film?.origin || null, seconds: Math.round((p.settings.to - p.settings.from) / 100) / 10, shots, locked: p.tracks.filter((t) => t.locked).map((t) => t.id), outputs, eventStatus: undefined },
    next: [{ tool: 'look', args: { projectId: p.id }, why: 'render it and see its frames' }, { tool: 'change', args: { projectId: p.id, ...(authored ? { motion: { direction: '<change>', trackIds: ['<trackId>'] } } : { cut: { drop: ['<shot number>'] } }) }, why: 'make a new take of it' }] }
}

/**
 * One call, answered once. A cancelled call stops at its next stage, since every stage reports
 * progress and progress refuses to continue, and it sends no reply: the client has stopped waiting.
 */
async function call(name, args, id, meta, job = { cancelled: false }) {
  let step=0
  const progress=message=>{
    if(job.cancelled)throw cannot('finish: the call was cancelled.','nothing; the person stopped it.')
    if(typeof meta?.progressToken==='string'||typeof meta?.progressToken==='number')send({jsonrpc:'2.0',method:'notifications/progress',params:{progressToken:meta.progressToken,progress:step++,message}})
  }
  const answerOnce = (reply) => { if (!job.cancelled) answer(id, reply) }
  const a = args ?? {}
  if (['film', 'change', 'look', 'reel', 'revise', 'refine', 'rescore', 'review', 'inspect'].includes(name)) progress('Preparing the film workspace.')
  if (name === 'doctor') { const { diagnose } = await import('../tools/environment.mjs'); const report = await diagnose(a); return answerOnce({ structured: report, summary: report.ready ? 'Motioneer is configured and its renderer works. Model authentication is checked on the first model request.' : report.checks.filter((c) => !c.ok).map((c) => c.message + ' ' + (c.next || '')).join(' ') }) }
  if (name === 'film') return answerOnce(await filmTool(a, progress))
  if (name === 'change') return answerOnce(await changeTool(a, progress))
  if (name === 'look') return answerOnce(await lookTool(a, progress))
  if (name === 'projects') return answerOnce(await projectsTool(a))
  if (name === 'motion') return answerOnce(await motion(a))
  if (name === 'studio') return answerOnce(await studio(a))
  if (name === 'open') return answerOnce(await open(a))
  // the names the surface used to have, each onto the tool that does its job now
  if (name === 'reel') return answerOnce(await filmTool({ ...a, mode: a.mode || 'auto', url: a.url || (a.domain ? `https://${a.domain}` : undefined) }, progress))
  if (name === 'inspect') return answerOnce(await inspect(a))
  if (name === 'review') return answerOnce(await reviewTool({ projectId: a.projectId, critique: true }, progress))
  if (name === 'revise') return answerOnce(await changeTool({ projectId: a.projectId, dir: a.dir, cut: Object.fromEntries(Object.entries({ pace: a.pace, seconds: a.seconds, opening: a.opening, closing: a.closing, drop: a.drop, order: a.order, fps: a.fps, soundtrack: a.soundtrack, background: a.background, ink: a.ink }).filter(([, v]) => v !== undefined)), ...(a.motionDirection ? { motion: { direction: a.motionDirection, elements: a.motionElements } } : {}) }, progress))
  if (name === 'refine') return answerOnce(await changeTool({ projectId: a.projectId, dir: a.dir, motion: { direction: a.direction, trackIds: a.trackIds, lockedTrackIds: a.lockedTrackIds, reviewPasses: a.reviewPasses } }, progress))
  if (name === 'rescore') return answerOnce(await changeTool({ projectId: a.projectId, dir: a.dir, music: { identity: a.music, direction: a.direction, bpm: a.bpm, audioFile: a.audioFile, replaceAudioTrackIds: a.replaceAudioTrackIds } }, progress))
  /**
   * A name nobody serves is answered rather than ignored.
   *
   * This fell through and sent nothing at all, which is not a small thing over a protocol where the
   * caller is waiting on an id: the agent does not get an error it can report, it gets silence, and
   * it waits until whatever timeout it happens to have. Naming the tools that do exist also covers
   * the usual cause, which is a model reaching for a tool it read about somewhere else.
   */
  return fail(id, cannot(`call ${name}: there is no tool by that name.`, `use one of ${TOOLS.map((t) => t.name).join(', ')}.`))
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
  console.log('    npx motioneer setup --claude      connect this Claude Code project\n')
  console.log('    npx motioneer setup --codex     connect a trusted Codex project\n')
  process.exit(0)
}

/**
 * Every request is handled on its own rather than in the order its lines arrived.
 *
 * The loop used to await each call before reading the next line, so a doctor or projects call sent
 * while a film rendered waited minutes for it. Calls that drive the studio's one proxy target and
 * one render slot still run one after another, because two films at once raced on the proxy;
 * everything else answers at once.
 */
const LONG = new Set(['film', 'change', 'look', 'reel', 'revise', 'refine', 'rescore', 'review', 'inspect'])
const running = new Map()
let queue = Promise.resolve()
let buffer = ''
process.stdin.on('data', (chunk) => {
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
      const job = { cancelled: false }
      running.set(msg.id, job)
      const run = () => call(msg.params?.name, msg.params?.arguments, msg.id, msg.params?._meta, job)
        .catch((e) => { if (!job.cancelled) fail(msg.id, e, { projectId: e?.projectId }) })
        .finally(() => running.delete(msg.id))
      if (LONG.has(msg.params?.name)) queue = queue.then(run, run)
      else run()
    } else if (msg.method === 'notifications/cancelled') {
      const job = running.get(msg.params?.requestId)
      if (job) job.cancelled = true
    } else if (msg.method === 'ping') {
      send({ jsonrpc: '2.0', id: msg.id, result: {} })
    } else if (msg.id !== undefined) {
      // a method nobody serves is said to be one, so a client does not take silence or {} as an answer
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Motioneer does not serve ${msg.method}.` } })
    }
  }
})
