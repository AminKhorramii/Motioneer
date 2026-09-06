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
  css=rewrite(css);html=parsed.body.innerHTML
  const frame=document.createElement('iframe');frame.style.cssText='position:fixed;width:1px;height:1px;left:-20000px;top:0;visibility:hidden';frame.setAttribute('aria-hidden','true')
  const loaded=new Promise<void>(resolve=>{frame.onload=()=>resolve()});frame.srcdoc=`<!doctype html><html><head><style>${css.replace(/<\/style/gi,'')}</style></head><body>${html}</body></html>`;document.body.append(frame)
  try {
    await loaded;const doc=frame.contentDocument!;await doc.fonts.ready
    const frozen=await inline(doc,{fetchVia:(url:string)=>fetch('/__motioneer/asset?u='+encodeURIComponent(url))}),map=new Map<string,string>([...frozen.fonts,...frozen.images])
    for(const [url,data] of map){html=html.split(url).join(data);css=css.split(url).join(data)}
    return {html,css:css+'\n'+(frozen.css||''),warnings:(frozen.notes||[]) as string[]}
  }finally{frame.remove()}
}
