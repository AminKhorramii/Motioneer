// @ts-expect-error The capture asset inliner is shared with the existing browser export.
import { inline } from '../../shared/raster.mjs'
/** Freeze assets while their source is still reachable, so reopening never depends on that server. */
export async function freezeCapture(html:string,css:string,source:string) {
  const parsed=new DOMParser().parseFromString(html,'text/html')
  parsed.querySelectorAll('script,iframe,object,embed,link,base,meta').forEach(e=>e.remove())
  parsed.querySelectorAll('*').forEach(el=>{for(const a of [...el.attributes])if(/^on/i.test(a.name)||/^(javascript|vbscript):/i.test(a.value.trim()))el.removeAttribute(a.name)})
  const absolute=(raw:string)=>{try{return new URL(raw,source||location.href).href}catch{return raw}}
  for(const img of parsed.querySelectorAll('img')){img.src=absolute(img.getAttribute('src')||'');img.removeAttribute('srcset');img.removeAttribute('loading')}
  const rewrite=(text:string)=>text.replace(/url\(\s*(["']?)(.*?)\1\s*\)/gi,(_,_q,url)=>`url("${url.startsWith('#')||url.startsWith('data:')?url:absolute(url)}")`)
  parsed.querySelectorAll('[style]').forEach(el=>el.setAttribute('style',rewrite(el.getAttribute('style')||'')))
  /**
   * A rule that hides everything is a gate, not a style. slack.com ships body * { display: none !important }
   * for browsers without its script, the picker copied it into every capture, and seven of eight
   * captures drew as nothing. A selector of everything with display none is dropped whole.
   */
  const gate=/(^|[{},])\s*(?:html|body)?\s*\*\s*\{[^{}]*display\s*:\s*none[^{}]*\}/g
  if(gate.test(css)){css=css.replace(gate,'$1');parsed.querySelectorAll<HTMLElement>('[style]').forEach(el=>{if(el.style.display==='none')el.style.display=''})}
  css=rewrite(css);html=parsed.body.innerHTML
  const frame=document.createElement('iframe');frame.style.cssText='position:fixed;width:1px;height:1px;left:-20000px;top:0;visibility:hidden';frame.setAttribute('aria-hidden','true')
  const loaded=new Promise<void>(resolve=>{frame.onload=()=>resolve()});frame.srcdoc=`<!doctype html><html><head><style>${css.replace(/<\/style/gi,'')}</style></head><body>${html}</body></html>`;document.body.append(frame)
  try {
    await loaded;const doc=frame.contentDocument!;await doc.fonts.ready
    /**
     * A url already on this origin is the proxy's own, a font or an image the site served through it,
     * and it is fetched as it stands. Sent back through the asset route it names localhost, which the
     * guard refuses, and every proxied webfont was lost that way: stripe's headings then rendered in a
     * wider fallback face and were cut mid-word at the edge of the box they had been measured in.
     */
    const fetchVia=(url:string)=>url.startsWith(location.origin)?fetch(url):fetch('/__motioneer/asset?u='+encodeURIComponent(url))
    const frozen=await inline(doc,{fetchVia}),map=new Map<string,string>([...frozen.fonts,...frozen.images])
    for(const [url,data] of map){html=html.split(url).join(data);css=css.split(url).join(data)}
    return {html,css:css+'\n'+(frozen.css||''),warnings:(frozen.notes||[]) as string[]}
  }finally{frame.remove()}
}

const FILLER: Record<number, string[]> = { 1: ['a'], 2: ['to', 'on'], 3: ['the', 'new'], 4: ['plan', 'team'], 5: ['notes', 'tasks'], 6: ['review', 'status'], 7: ['project', 'roadmap'], 8: ['schedule', 'customer'], 9: ['workspace', 'quarterly'], 10: ['operations', 'onboarding'] }
const AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#8a8f98"/></svg>')
/**
 * A capture with the personal details taken out, for a film made from a page somebody is signed into.
 *
 * Text keeps its length and shape, so the layout and the motion measured on it do not change: an
 * address becomes another address, a long number keeps its separators with other digits, a handle
 * becomes a neutral one and an avatar a plain tile. Names cannot be told from other words, so
 * `every` replaces each word with filler of the same length for a page full of them.
 *
 * @returns the markup, and how many details were replaced
 */
export function redact(html: string, every = false) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  let changed = 0
  const swap = (text: string) => {
    let n = 0
    const next = every
      ? text.replace(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu, (word) => { n++; const pick = FILLER[Math.min(10, word.length)], fill = pick[n % pick.length].padEnd(word.length, 'e').slice(0, word.length); return /^\p{Lu}/u.test(word) ? fill[0].toUpperCase() + fill.slice(1) : fill })
      : text.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, () => { n++; return 'person@example.com' })
        .replace(/(^|[\s(])@[A-Za-z0-9_]{2,}/g, (_, lead) => { n++; return lead + '@member' })
        .replace(/\+?\d[\d\s().-]{6,}\d/g, (run) => { n++; return run.replace(/\d/g, (d) => String((Number(d) * 7 + 3) % 10)) })
    changed += n
    return next
  }
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (!node.parentElement?.closest('style,script')) node.textContent = swap(node.textContent || '')
  for (const el of doc.body.querySelectorAll('[alt],[title],[aria-label],[placeholder],input[value]')) for (const name of ['alt', 'title', 'aria-label', 'placeholder', 'value']) { const v = el.getAttribute(name); if (v) el.setAttribute(name, swap(v)) }
  for (const img of doc.body.querySelectorAll('img')) if (/avatar|profile|portrait|headshot|user/i.test(`${img.className} ${img.alt} ${img.getAttribute('src')}`)) { img.src = AVATAR; img.removeAttribute('srcset'); changed++ }
  return { html: doc.body.innerHTML, changed }
}
