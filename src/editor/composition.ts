import type { Project, Track, Move } from './project'
export type Composition = { update: (p: Project) => void; seek: (ms: number, playing?: boolean) => Promise<void>; ready: () => Promise<void> }
declare global { interface Window { __composition?: Composition; __assetSources?: Record<string,string> } }
/** Runs unchanged in the canvas, exported HTML, and the renderer's Chromium page. No closures. */
export function compositionRuntime(initial: Project, assetRoot: string) {
  let project = initial, now = 0
  const stage = document.getElementById('stage')!, camera = document.getElementById('camera')!
  const animations = new Map<string, Animation[]>(); const nodes = new Map<string, HTMLElement>(), signatures = new Map<string, string>(), pending = new Set<Promise<void>>()
  const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))
  const ease = (x: number, kind: string) => kind === 'linear' ? x : kind === 'ease-in' ? x*x : kind === 'ease-out' ? 1-(1-x)*(1-x) : x*x*(3-2*x)
  function position(moves: Move[], time: number) {
    let last = { x: 0, y: 0, scale: 1 }
    for (const m of [...moves].sort((a,b) => a.at-b.at)) {
      if (time < m.at) break
      const ratio = ease(clamp((time-m.at)/m.duration, 0, 1), m.ease)
      const value = { x: last.x+(m.x-last.x)*ratio, y: last.y+(m.y-last.y)*ratio, scale: last.scale+(m.scale-last.scale)*ratio }
      if (time < m.at+m.duration) return value
      last = value
    }
    return last
  }
  function starts() {
    const values = new Map<string,number>(), visiting = new Set<string>()
    const one = (t: Track): number => {
      if (values.has(t.id)) return values.get(t.id)!
      if (visiting.has(t.id)) return t.start
      visiting.add(t.id)
      const parent = t.after && project.tracks.find(x => x.id === t.after!.key)
      const at = parent ? clamp(one(parent)+(t.after!.mode === 'after' ? parent.duration : 0)+t.after!.gap, 0, 120000) : t.start
      visiting.delete(t.id); values.set(t.id, at); return at
    }
    project.tracks.forEach(one); return values
  }
  function component(t: Track, holder: HTMLElement) {
    const subject = project.subjects.find(s => s.id === t.subjectId), motion = project.motions.find(m => m.id === t.motionId)
    if (!subject) return
    const key = subject.html + subject.css + (motion?.css || '')
    if (signatures.get(t.id) === key) return
    signatures.set(t.id, key)
    holder.replaceChildren()
    const frame = document.createElement('iframe'); frame.title = subject.name; frame.style.cssText = 'border:0;position:absolute;left:0;top:0;transform-origin:top left;pointer-events:none;'
    frame.width = String(subject.w); frame.height = String(subject.h)
    const parsed = new DOMParser().parseFromString(subject.html, 'text/html')
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
    const styles = (subject.css + '\n' + (motion?.css || '')).replace(/<\/style/gi, '<\\/style')
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
    frame.srcdoc = '<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent;width:100%;height:100%;overflow:hidden}*{box-sizing:border-box}' + styles + 'html,body{margin:0!important;padding:0!important;display:block!important;background:transparent!important;width:100%!important;height:100%!important;overflow:hidden!important}</style></head><body>' + parsed.body.innerHTML + '<script>window.__animations=document.getAnimations();window.__animations.forEach(a=>{a.pause();a.currentTime=0})</script></body></html>'
    holder.append(frame)
  }
  function update(p: Project) {
    project = p
    stage.style.width = p.settings.width+'px'; stage.style.height = p.settings.height+'px'; stage.style.background = p.settings.background
    for (const [id,node] of nodes) if (!p.tracks.some(t => t.id === id)) { (node as HTMLAudioElement).pause?.(); node.remove(); nodes.delete(id); signatures.delete(id) }
    p.tracks.forEach((t,index) => {
      let node = nodes.get(t.id)
      if (!node) { node = document.createElement(t.kind === 'audio' ? 'audio' : 'div'); node.dataset.track = t.id; nodes.set(t.id,node); camera.append(node)
        node.addEventListener('pointerdown', e => { if (parent !== window) parent.postMessage({ motioneer: 'select-track', id: t.id, shift: e.shiftKey || e.metaKey }, location.origin) }) }
      node.style.cssText = `position:absolute;left:${t.x}%;top:${t.y}%;width:${t.width}%;height:${t.height}%;z-index:${index};transform-origin:center;`
      if (t.kind === 'component') {
        component(t,node)
        const s = p.subjects.find(s => s.id === t.subjectId), f = node.querySelector('iframe')
        if (s && f) { const scale = Math.min(p.settings.width*t.width/100/s.w, p.settings.height*t.height/100/s.h); f.style.transform = `scale(${scale})`; f.style.left = (p.settings.width*t.width/100-s.w*scale)/2+'px'; f.style.top = (p.settings.height*t.height/100-s.h*scale)/2+'px' }
      } else if (t.kind === 'title') { node.textContent = t.text || ''; node.style.font = `600 ${t.fontSize}px/1.12 ui-sans-serif,system-ui,sans-serif`; node.style.color = t.color; node.style.display = 'grid'; node.style.placeItems = 'center'; node.style.textAlign = 'center'; node.style.whiteSpace = 'pre-wrap'; node.style.letterSpacing = '-0.035em' }
      else if (t.kind === 'image') { let img = node.querySelector('img'); if (!img) { img=document.createElement('img'); img.style.cssText='width:100%;height:100%;object-fit:contain;pointer-events:none'; node.append(img) } const url = (window.__assetSources?.[t.assetId!] || assetRoot + t.assetId); if (img.getAttribute('src') !== url) img.src = url }
      else { const audio = node as HTMLAudioElement; const url = (window.__assetSources?.[t.assetId!] || assetRoot+t.assetId); if (audio.getAttribute('src') !== url) audio.src = url; audio.preload = 'auto' }
    })
    void seek(now)
  }
  async function seek(ms: number, playing = false) {
    now = ms
    const offsets = starts(), cam = position(project.camera,ms)
    camera.style.transform = `translate(${cam.x}%,${cam.y}%) scale(${cam.scale})`
    for (const t of project.tracks) {
      const node = nodes.get(t.id)!, local = ms-offsets.get(t.id)!, active = !t.hidden && local >= 0 && local < t.duration
      node.style.visibility = active ? 'visible' : 'hidden'
      if (t.kind === 'audio') { const a = node as HTMLAudioElement, desired=(Math.max(0,local)+t.sourceStart)/1000
        a.volume = clamp(t.volume * Math.min(t.fadeIn ? Math.max(0,local)/t.fadeIn : 1, t.fadeOut ? Math.max(0,t.duration-local)/t.fadeOut : 1, 1),0,1)
        if (!playing || !active) a.pause()
        if (Number.isFinite(a.duration) && Math.abs(a.currentTime-desired) > (playing ? .15 : .01)) a.currentTime = Math.min(a.duration,desired)
        if (playing && active && a.paused) void a.play().catch(() => {})
        continue
      }
      const move = position(t.moves, ms); node.style.transform = `translate(${move.x}%,${move.y}%) scale(${move.scale})`
      if (t.kind === 'title') { const f=clamp(local/400,0,1); node.style.opacity='1'; node.style.transform += ` translateY(${(1-ease(f,'ease-out'))*16}px)` }
      const d = node.querySelector('iframe')?.contentDocument
      if (d) for (const animation of animations.get(t.id) || d.getAnimations()) { animation.pause(); animation.currentTime = local-t.entrance }
    }
  }
  const ready = async () => { await Promise.all([...pending]); await document.fonts.ready; await Promise.all(Array.from(document.images).map(i => i.decode().catch(() => {}))) }
  window.__composition = { update, seek, ready }; update(initial)
}
export function compositionDocument(project: Project, assetRoot = `/__motioneer/projects/${project.id}/assets/`): string {
  const json = (v: unknown) => JSON.stringify(v).replace(/</g,'\\u003c')
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden;background:transparent}#stage{position:relative;overflow:hidden}#camera{position:absolute;inset:0;transform-origin:center}</style></head><body><div id="stage"><div id="camera"></div></div><script>(${compositionRuntime.toString()})(${json(project)},${json(assetRoot)})</script></body></html>`
}
