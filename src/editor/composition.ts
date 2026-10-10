import type { Project, Track, Subject } from './project'
import { createFilmMath } from './filmMath'
import { LOOKS } from '../design/looks'
// @ts-expect-error The legacy arithmetic is JavaScript.
import { resolve } from '../../shared/arrange.mjs'
export type Composition = { update: (p: Project) => void; seek: (ms: number, playing?: boolean) => Promise<void>; ready: () => Promise<void> }
declare global { interface Window { __composition?: Composition; __assetSources?: Record<string,string>; __shared?: string[]; __live?: { still: boolean } } }
/** Runs unchanged in the canvas, exported HTML, and the renderer's Chromium page. No closures. */
export function compositionRuntime(initial: Project, assetRoot: string, math: ReturnType<typeof createFilmMath>, art: typeof LOOKS) {
  let project = initial, now = 0
  const stage = document.getElementById('stage')!, camera = document.getElementById('camera')!, ground = document.getElementById('ground')!, fibre = document.getElementById('grain')!
  stage.addEventListener('pointerdown',e=>{if(parent!==window&&(e.target===stage||e.target===camera))parent.postMessage({motioneer:'select-track',id:null},location.origin)})
  const animations = new Map<string, Animation[]>(); const nodes = new Map<string, HTMLElement>(), signatures = new Map<string, string>(), pending = new Set<Promise<void>>()
  const {clamp,ease,position}=math
  const starts=()=>{const at=math.timing(project).at;return new Map(project.tracks.map((t,i)=>[t.id,at[i]]))}
  // a live film stores each repeated font or image once, and a capture reads it back where it is used
  const shared = (text: string) => window.__shared ? text.replace(/motioneer-shared:(\d+)/g, (_, i) => window.__shared![Number(i)] || '') : text
  /**
   * The art layer, drawn rather than loaded: the stock under a printed sheet, the fibre over it, and
   * the product's own faces for type set outside its captures. Nothing here is fetched; the grain is a
   * few hundred bytes of noise and the faces are the ones the captures already carry.
   */
  const arrive = (x: number) => 1 - (1 - x) ** 4
  const noise = (v: number) => 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="260" height="260"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 ' + v + ' 0 0 0 0 ' + v + ' 0 0 0 0 ' + v + ' 0 0 0 .6 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>') + '")'
  ground.style.cssText = 'display:none;background:radial-gradient(ellipse at 45% 40%,transparent 55%,' + art.plate.vignette + '),' + art.plate.stock
  fibre.style.cssText = 'display:none;background-image:' + noise(0.08) + ';opacity:' + art.plate.grain + ';mix-blend-mode:multiply'
  const faceSheet = document.createElement('style'); document.head.append(faceSheet)
  let faceKey = '', faces = { sans: 'system-ui,sans-serif', mono: 'ui-monospace,monospace' }
  function readFaces(p: Project) {
    const key = p.subjects.map(s => s.id + ':' + s.css.length).join()
    if (key === faceKey) return
    faceKey = key
    const blocks = p.subjects.flatMap(s => shared(s.css).match(/@font-face\s*\{[^}]*\}/g) || []).filter(b => /url\(\s*["']?data:/.test(b))
    const family = (b: string) => (/font-family\s*:\s*["']?([^;"']+)/.exec(b)?.[1] || '').trim()
    const counts = new Map<string, number>(); for (const b of blocks) counts.set(family(b), (counts.get(family(b)) || 0) + 1)
    const names = [...counts.keys()].filter(Boolean), mono = names.find(f => /mono|code/i.test(f))
    // the face the product sets itself in is the one its captured roots name first
    const named = p.subjects.map(s => /font-family:\s*(?:&quot;|["'])?([^;,&"']+)/.exec(s.html)?.[1]?.trim()).find(f => f && names.includes(f) && f !== mono)
    const sans = named || names.filter(f => f !== mono).sort((a, b) => counts.get(b)! - counts.get(a)!)[0]
    faceSheet.textContent = blocks.filter(b => [sans, mono].includes(family(b))).join('\n')
    faces = { sans: (sans ? '"' + sans + '",' : '') + 'system-ui,sans-serif', mono: (mono ? '"' + mono + '",' : '') + 'ui-monospace,monospace' }
  }
  /** A title in a look: a label, a headline and a caption, set in the product's faces on the look's grid. */
  function lettering(t: Track, node: HTMLElement, p: Project) {
    const k = p.settings.height / 1080, plate = t.look === 'plate', pad = plate ? 0 : 96 * k
    node.replaceChildren(); node.style.color = t.color
    if (!plate) node.style.background = t.color.toLowerCase() === art.editorial.light ? art.editorial.dark : art.editorial.light
    const line = (type: string, text: string, css: string) => { const d = document.createElement('div'); d.dataset.type = type; d.dataset.full = text; d.textContent = text; d.style.cssText = 'position:absolute;white-space:pre-wrap;' + css; node.append(d); return d }
    if (!plate) line('fibre', '', 'inset:0;background-image:' + noise(0.08) + ';opacity:' + art.editorial.grain + ';mix-blend-mode:multiply')
    if (t.label) line('label', t.label, 'left:' + pad + 'px;top:' + pad + 'px;font:400 ' + art.type.label * k + 'px/1.2 ' + faces.mono + ';letter-spacing:.03em;opacity:.72')
    if (t.text) line('headline', t.text, plate ? 'left:0;right:0;top:50%;transform:translateY(-50%);font:620 ' + t.fontSize + 'px/.96 ' + faces.sans + ';letter-spacing:-.04em' : 'left:' + pad + 'px;right:' + pad + 'px;bottom:' + 190 * k + 'px;font:640 ' + t.fontSize + 'px/.92 ' + faces.sans + ';letter-spacing:-.05em')
    if (!plate) line('rule', '', 'left:' + pad + 'px;right:' + pad + 'px;bottom:' + 150 * k + 'px;height:' + Math.max(1, k) + 'px;background:currentColor;opacity:.2')
    if (t.caption) line('caption', t.caption, 'left:' + pad + 'px;bottom:' + (plate ? 0 : 112 * k) + 'px;font:400 ' + art.type.caption * k + 'px/1.2 ' + faces.mono + ';letter-spacing:.04em;opacity:.62')
    fit(node); void document.fonts.ready.then(() => fit(node))
  }
  /** a long headline steps down until it sits inside its column, measured once its face has loaded */
  function fit(node: HTMLElement) {
    const head = node.querySelector<HTMLElement>('[data-type="headline"]')
    if (!head) return
    const room = node.clientHeight * (node.querySelector('[data-type="rule"]') ? 0.55 : 0.62)
    // too tall for its column, or one word too wide for it
    for (let i = 0; i < 14 && head.scrollHeight > 0 && (head.scrollHeight > room || head.scrollWidth > head.clientWidth + 1); i++) head.style.fontSize = parseFloat(head.style.fontSize) * 0.9 + 'px'
  }
  /**
   * A printed sheet: a plate of the product's own ground under the capture, crop marks and registration
   * targets around it, its real width measured above, and a colour strip below. Drawn once per edit;
   * the seek draws the marks, prints the plate and closes the register.
   */
  function sheet(node: HTMLElement, s: Subject, left: number, top: number, w: number, h: number, p: Project) {
    const k = p.settings.height / 1080, A = art.plate, g = A.markGap * k, L = A.markLength * k, hair = Math.max(1, k)
    let plate = node.querySelector<HTMLElement>('[data-plate]'), marks = node.querySelector<HTMLElement>('[data-marks]')
    if (!plate) { plate = document.createElement('div'); plate.dataset.plate = ''; node.prepend(plate) }
    if (!marks) { marks = document.createElement('div'); marks.dataset.marks = ''; node.append(marks) }
    plate.style.cssText = 'position:absolute;left:' + left + 'px;top:' + top + 'px;width:' + w + 'px;height:' + h + 'px;background:' + p.settings.background
    marks.style.cssText = 'position:absolute;left:' + left + 'px;top:' + top + 'px;width:' + w + 'px;height:' + h + 'px;pointer-events:none;color:' + A.ink
    marks.replaceChildren()
    const bar = (x: number, y: number, bw: number, bh: number, origin: string, axis: string) => { const i = document.createElement('i'); i.dataset.mark = axis; i.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + bw + 'px;height:' + bh + 'px;background:currentColor;transform-origin:' + origin; marks!.append(i) }
    bar(-g - L, 0, L, hair, 'right', 'x'); bar(0, -g - L, hair, L, 'bottom', 'y'); bar(w + g, 0, L, hair, 'left', 'x'); bar(w - hair, -g - L, hair, L, 'bottom', 'y')
    bar(-g - L, h - hair, L, hair, 'right', 'x'); bar(0, h + g, hair, L, 'top', 'y'); bar(w + g, h - hair, L, hair, 'left', 'x'); bar(w - hair, h + g, hair, L, 'top', 'y')
    bar(0, -26 * k, w, hair, 'center', 'x'); bar(0, -31 * k, hair, 11 * k, 'center', 'y'); bar(w - hair, -31 * k, hair, 11 * k, 'center', 'y')
    const size = document.createElement('span'); size.dataset.type = 'measure'; size.dataset.full = s.w + ' px'; size.style.cssText = 'position:absolute;left:' + (w / 2 - 60 * k) + 'px;top:' + -34 * k + 'px;width:' + 120 * k + 'px;text-align:center;background:' + A.stock + ';font:400 ' + 14 * k + 'px/1.2 ' + faces.mono + ';letter-spacing:.03em'; marks.append(size)
    for (const y of [-58 * k, h + 58 * k]) { const target = document.createElement('i'); target.dataset.mark = 'both'; target.style.cssText = 'position:absolute;left:' + (w / 2 - 14 * k) + 'px;top:' + (y - 14 * k) + 'px;width:' + 28 * k + 'px;height:' + 28 * k + 'px;border-radius:50%;box-shadow:inset 0 0 0 ' + hair + 'px currentColor;background:linear-gradient(currentColor,currentColor) center/' + hair + 'px 100% no-repeat,linear-gradient(currentColor,currentColor) center/100% ' + hair + 'px no-repeat;transform-origin:center'; marks.append(target) }
    ;[p.settings.background, ...A.process].forEach((c, n) => { const swatch = document.createElement('i'); swatch.dataset.mark = 'both'; swatch.style.cssText = 'position:absolute;left:' + n * 22 * k + 'px;top:' + (h + 49 * k) + 'px;width:' + 18 * k + 'px;height:' + 18 * k + 'px;background:' + c + ';transform-origin:center'; marks!.append(swatch) })
  }
  function component(t: Track, holder: HTMLElement) {
    const subject = project.subjects.find(s => s.id === t.subjectId), motion = project.motions.find(m => m.id === t.motionId)
    if (!subject) return
    const key = subject.html + subject.css + (motion?.css || '')
    if (signatures.get(t.id) === key) return
    signatures.set(t.id, key)
    holder.replaceChildren()
    const frame = document.createElement('iframe'); frame.title = subject.name; frame.style.cssText = 'border:0;position:absolute;left:0;top:0;transform-origin:top left;pointer-events:none;'
    frame.width = String(subject.w)
    const parsed = new DOMParser().parseFromString(shared(subject.html), 'text/html')
    parsed.querySelectorAll('script,iframe,object,embed,base,meta,link').forEach(el => el.remove())
    parsed.querySelectorAll('*').forEach(el => { for (const attr of [...el.attributes]) if (/^on/i.test(attr.name) || /^(javascript|vbscript):/i.test(attr.value.trim())) el.removeAttribute(attr.name) })
    if (motion && /^data-[\w-]+$/.test(motion.scope)) parsed.body.firstElementChild?.setAttribute(motion.scope, '')
    /**
     * The root of a capture wears no margin here. The picker inlines the element's computed
     * margin along with everything else, and this frame is sized to the element's own box, so a
     * heading with a 16px top margin rendered 16px down in a 28px frame and lost its lower half
     * to overflow. The margin was the page's spacing around the element, not part of it.
     */
    const root = parsed.body.firstElementChild as HTMLElement | null
    if (root) root.style.margin = '0'
    /**
     * A little room below. A site's webfont is often unreadable across origins, and the fallback
     * face runs taller, so a heading measured at 83px on the page needs more here and lost its
     * descenders to the frame's edge. The root may grow, and the frame is a sixth taller than the
     * box it was measured in, with the same width, so the scale the track computes still holds.
     */
    if (root) { root.style.height = 'auto'; root.style.minHeight = subject.h + 'px' }
    // a root was picked because it was seen, so display none inlined on it is a gate's leftover, not a choice
    if (root && root.style.display === 'none') { root.style.display = 'block'; parsed.body.querySelectorAll<HTMLElement>('[style]').forEach(el => { if (el.style.display === 'none') el.style.display = '' }) }
    /**
     * Border-box at the measured width. The picker inlines the computed width, which for a
     * content-box element excludes its padding, so a heading measured 1030 wide came back as
     * width 1030 plus 32 of padding a side, overflowed its 1030 frame by 64, and lost the end of
     * every line. The measured size is the border box, so that is what the root is told it is.
     */
    if (root) { root.style.boxSizing = 'border-box'; root.style.width = subject.w + 'px'; root.style.maxWidth = 'none' }
    /**
     * A captured element is meant to be seen. Pages reveal their content from a script, and slack.com
     * and webflow.com carry every heading at opacity zero until that script runs, which under the
     * proxy it never does; the picker inlines that zero, and the shot is blank. Zero opacity and
     * hidden visibility in an inlined style are a waiting state, not a design, so they are lifted
     * here on the root and everything inside it. Display none is left alone: that is a choice.
     */
    parsed.body.querySelectorAll<HTMLElement>('[style]').forEach(el => {
      if (el.style.opacity === '0') el.style.opacity = '1'
      if (el.style.visibility === 'hidden') el.style.visibility = 'visible'
    })
    /**
     * Hiding written in a stylesheet is lifted too, once the copy has loaded: slack.com holds every
     * heading at opacity zero through a class its reveal script would remove, and seven of eight
     * captures rendered as nothing. Only what no animation targets is lifted, since a motion's
     * own first keyframe is allowed to start from zero.
     */
    frame.height = String(Math.round(subject.h * 1.17))
    const styles = shared(subject.css + '\n' + (motion?.css || '')).replace(/<\/style/gi, '<\\/style')
    let done!: () => void
    const wait = new Promise<void>(resolve => { done = resolve }); pending.add(wait)
    const timeout = setTimeout(() => { done(); pending.delete(wait) }, 15000)
    frame.onload = async () => { try { const d = frame.contentDocument; if (d) {
      animations.set(t.id, (frame.contentWindow as Window & { __animations?: Animation[] })?.__animations || d.getAnimations());
      for (const animation of animations.get(t.id) || []) { animation.pause(); animation.currentTime = 0 }
      await d.fonts.ready;
      for (const image of Array.from(d.images)) await image.decode().catch(() => {})
      for (const animation of d.getAnimations()) { animation.pause(); animation.currentTime = 0 }
    } } finally { clearTimeout(timeout); pending.delete(wait); done(); void seek(now) } }
    frame.srcdoc = '<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent;width:100%;height:100%;overflow:hidden}*{box-sizing:border-box}' + styles + 'html,body{margin:0!important;padding:0!important;display:block!important;background:transparent!important;width:100%!important;height:100%!important;overflow:hidden!important}</style></head><body>' + parsed.body.innerHTML + '<script>window.__animations=document.getAnimations();window.__animations.forEach(a=>{a.pause();a.currentTime=0});for(const el of document.querySelectorAll("*")){const cs=getComputedStyle(el);if((cs.opacity==="0"||cs.visibility==="hidden")&&!el.getAnimations({subtree:false}).length){el.style.setProperty("opacity","1","important");el.style.setProperty("visibility","visible","important")}}</script></body></html>'
    holder.append(frame)
  }
  function update(p: Project) {
    project = p
    stage.style.width = p.settings.width+'px'; stage.style.height = p.settings.height+'px'; stage.style.background = p.settings.background
    if (p.tracks.some(t => t.look)) readFaces(p)
    for (const [id,node] of nodes) if (!p.tracks.some(t => t.id === id)) { (node as HTMLAudioElement).pause?.(); node.remove(); nodes.delete(id); signatures.delete(id) }
    p.tracks.forEach((t,index) => {
      let node = nodes.get(t.id)
      if (!node) { node = document.createElement(t.kind === 'audio' ? 'audio' : 'div'); node.dataset.track = t.id; nodes.set(t.id,node); camera.append(node)
        node.addEventListener('pointerdown', e => { if (parent !== window) parent.postMessage({ motioneer: 'select-track', id: t.id, shift: e.shiftKey, toggle: e.metaKey || e.ctrlKey }, location.origin) }) }
      node.style.cssText = `position:absolute;left:${t.x}%;top:${t.y}%;width:${t.width}%;height:${t.height}%;z-index:${index};transform-origin:center;`
      // a capture that is only a heading is set as type in its look rather than filmed as a strip of pixels
      if (t.kind === 'component' && t.look && t.text) { signatures.delete(t.id); lettering(t, node, p) }
      else if (t.kind === 'component') {
        component(t,node)
        const s = p.subjects.find(s => s.id === t.subjectId), f = node.querySelector('iframe')
        if (s && f) {
          const W = p.settings.width*t.width/100, H = p.settings.height*t.height/100
          let scale = Math.min(W/s.w, H/s.h), left = (W-s.w*scale)/2, top = (H-s.h*scale)/2
          // a passage: enlarged past fitting and placed so its focus sits in the middle, never showing past its edges
          if (t.look === 'editorial') {
            scale *= clamp(t.zoom || 1, 1, 6); const w = s.w*scale, h = s.h*scale
            left = w <= W ? (W-w)/2 : clamp(W/2-clamp(t.focus?.x ?? .5, 0, 1)*w, W-w, 0); top = h <= H ? (H-h)/2 : clamp(H/2-clamp(t.focus?.y ?? .5, 0, 1)*h, H-h, 0)
            node.style.overflow = 'hidden'; node.style.background = p.settings.background
          }
          f.style.transform = `scale(${scale})`; f.style.left = left+'px'; f.style.top = top+'px'
          f.dataset.scale = String(scale); f.dataset.left = String(left); f.dataset.top = String(top)
          if (t.look === 'plate') sheet(node, s, left, top, s.w*scale, s.h*scale, p)
          else { f.style.clipPath = ''; node.querySelectorAll('[data-plate],[data-marks]').forEach(el => el.remove()) }
        }
      } else if (t.kind === 'title' && t.look) lettering(t, node, p)
      else if (t.kind === 'title') { node.textContent = t.text || ''; node.style.font = `600 ${t.fontSize}px/1.12 ui-sans-serif,system-ui,sans-serif`; node.style.color = t.color; node.style.display = 'grid'; node.style.placeItems = 'center'; node.style.textAlign = 'center'; node.style.whiteSpace = 'pre-wrap'; node.style.letterSpacing = '-0.035em' }
      else if (t.kind === 'image') { let img = node.querySelector('img'); if (!img) { img=document.createElement('img'); img.style.cssText='width:100%;height:100%;object-fit:contain;pointer-events:none'; node.append(img) } const url = (window.__assetSources?.[t.assetId!] || assetRoot + t.assetId); if (img.getAttribute('src') !== url) img.src = url }
      else { const audio = node as HTMLAudioElement; const url = (window.__assetSources?.[t.assetId!] || assetRoot+t.assetId); if (audio.getAttribute('src') !== url) audio.src = url; audio.preload = 'auto' }
    })
    void seek(now)
  }
  async function seek(ms: number, playing = false) {
    now = ms
    const still = !!window.__live?.still, offsets = starts(), cam = still ? { x: 0, y: 0, scale: 1 } : position(project.camera,ms)
    camera.style.transform = `translate(${cam.x}%,${cam.y}%) scale(${cam.scale})`
    let printed = false
    for (const t of project.tracks) {
      const node = nodes.get(t.id)!, local = ms-offsets.get(t.id)!, active = !t.hidden && local >= 0 && local < t.duration
      node.style.visibility = active ? 'visible' : 'hidden'
      if (active && t.look === 'plate') printed = true
      if (active && t.look) lookAt(t, node, still ? 1e9 : local)
      if (t.kind === 'audio') { const a = node as HTMLAudioElement, desired=(Math.max(0,local)+t.sourceStart)/1000
        a.volume = clamp(t.volume * Math.min(t.fadeIn ? Math.max(0,local)/t.fadeIn : 1, t.fadeOut ? Math.max(0,t.duration-local)/t.fadeOut : 1, 1),0,1)
        if (!playing || !active) a.pause()
        if (Number.isFinite(a.duration) && Math.abs(a.currentTime-desired) > (playing ? .15 : .01)) a.currentTime = Math.min(a.duration,desired)
        if (playing && active && a.paused) void a.play().catch(() => {})
        continue
      }
      const move = still ? { x: 0, y: 0, scale: 1 } : position(t.moves, ms); node.style.transform = `translate(${move.x}%,${move.y}%) scale(${move.scale})`
      if (t.kind === 'title' && !t.look) { const f=clamp(local/400,0,1); node.style.opacity='1'; node.style.transform += ` translateY(${(1-ease(f,'ease-out'))*16}px)` }
      const d = node.querySelector('iframe')?.contentDocument
      if (d) for (const animation of animations.get(t.id) || d.getAnimations()) { animation.pause(); animation.currentTime = local-t.entrance }
    }
    // the stock and its fibre lie under and over a printed sheet, and the product's own ground shows otherwise
    ground.style.display = fibre.style.display = printed ? 'block' : 'none'
  }
  /**
   * A look's motion at one moment of its shot. On a sheet, the marks draw first, the plate prints from
   * the top, and the cyan and magenta plates close to a hair off register. A passage drifts closer
   * about its middle. Type is set a character at a time and a headline is printed across. Nothing
   * fades in. A viewer who asked for stillness gets every shot settled.
   */
  function lookAt(t: Track, node: HTMLElement, local: number) {
    const T = art.timing, k = project.settings.height / 1080
    if (t.kind === 'title' || t.text) {
      for (const el of Array.from(node.children) as HTMLElement[]) {
        const type = el.dataset.type
        if (type === 'label' || type === 'caption') el.textContent = (el.dataset.full || '').slice(0, Math.max(0, Math.floor((local - (type === 'caption' ? 260 : 0)) / T.perCharacter)))
        if (type === 'headline') el.style.clipPath = 'inset(-10% ' + (1 - arrive(clamp((local - 120) / T.print, 0, 1))) * 110 + '% -10% -2%)'
      }
      return
    }
    const f = node.querySelector<HTMLElement>('iframe'), s = project.subjects.find(x => x.id === t.subjectId)
    if (!f || !s) return
    if (t.look === 'editorial') {
      const e = 1 + art.editorial.drift * clamp(local / t.duration, 0, 1), W = project.settings.width*t.width/100, H = project.settings.height*t.height/100
      f.style.transform = 'scale(' + Number(f.dataset.scale) * e + ')'; f.style.left = W/2 - (W/2 - Number(f.dataset.left)) * e + 'px'; f.style.top = H/2 - (H/2 - Number(f.dataset.top)) * e + 'px'
      return
    }
    const A = art.plate, drawn = arrive(clamp(local / T.marks, 0, 1)), print = arrive(clamp((local - T.marks * 0.4) / T.print, 0, 1)), register = arrive(clamp((local - T.marks * 0.4 - T.print * 0.5) / T.register, 0, 1))
    for (const m of Array.from(node.querySelectorAll<HTMLElement>('[data-mark]'))) m.style.transform = m.dataset.mark === 'x' ? 'scaleX(' + drawn + ')' : m.dataset.mark === 'y' ? 'scaleY(' + drawn + ')' : 'scale(' + drawn + ')'
    const measure = node.querySelector<HTMLElement>('[data-type="measure"]'); if (measure) measure.textContent = (measure.dataset.full || '').slice(0, Math.max(0, Math.floor((local - T.marks * 0.5) / T.perCharacter)))
    const plate = node.querySelector<HTMLElement>('[data-plate]'), d = (A.registerFrom + (A.registerTo - A.registerFrom) * register) * k, room = 40 * k
    if (plate) { const h = plate.offsetHeight; plate.style.clipPath = 'inset(' + -room + 'px ' + -room + 'px ' + ((1 - print) * (h + room) - room) + 'px ' + -room + 'px)'; plate.style.filter = 'drop-shadow(' + -d + 'px 0 0 ' + A.fringe[0] + ') drop-shadow(' + d + 'px ' + d / 2 + 'px 0 ' + A.fringe[1] + ')' }
    f.style.clipPath = 'inset(0 0 ' + Math.max(0, s.h * 1.17 - print * s.h) + 'px 0)'
  }
  const ready = async () => { await Promise.all([...pending]); await document.fonts.ready; await Promise.all(Array.from(document.images).map(i => i.decode().catch(() => {}))); for (const node of nodes.values()) if (node.querySelector('[data-type="headline"]')) fit(node) }
  window.__composition = { update, seek, ready }; update(initial)
}
export function compositionDocument(project: Project, assetRoot = `/__motioneer/projects/${project.id}/assets/`): string {
  const json = (v: unknown) => JSON.stringify(v).replace(/</g,'\\u003c')
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden;background:transparent}#stage{position:relative;overflow:hidden}#camera,#ground,#grain{position:absolute;inset:0}#camera{transform-origin:center}#ground,#grain{pointer-events:none}</style></head><body><div id="stage"><div id="ground"></div><div id="camera"></div><div id="grain"></div></div><script>(${compositionRuntime.toString()})(${json(project)},${json(assetRoot)},(${createFilmMath.toString()})(${resolve.toString()}),${json(LOOKS)})</script></body></html>`
}
