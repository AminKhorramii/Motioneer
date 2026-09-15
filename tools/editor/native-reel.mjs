/** Retained website layers and measured detail-to-interface choreography for the reel driver. */
import {loadChromium} from './render.mjs'
import {sourceDocument,sourceStage,sourceFont,nativeRevealMs} from './source-choreography.mjs'
import {captureLayers} from './layer-capture.mjs'
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export {nativeRevealMs} from './source-choreography.mjs'
export const NATIVE_SCENES=['native-reveal','native-detail']

/** Runs in the source page; semantic cards and real multi-control panels, never nav or testimonials. */
export function discoverNativeComponents(){
 const root=document.querySelector('main')||document.body,all=[]
 for(const e of root.querySelectorAll('article,figure,div,section')){
  const r=e.getBoundingClientRect(),s=getComputedStyle(e),text=e.innerText?.trim()||'',nodes=e.querySelectorAll('*').length
  if(r.width<220||r.width>1400||r.height<100||r.height>850||nodes<5||nodes>700||s.display==='none'||s.visibility==='hidden'||+s.opacity<.1)continue
  if((e.querySelector('article,video,canvas')||(e.tagName!=='ARTICLE'&&e.querySelector('h2')))||e.querySelectorAll('a').length>8)continue
  if(e.closest('nav,header,footer,[role="dialog"]')||e.querySelector('h1')||/testimonial|socialProof|cookie|logoCloud|customer-logo/i.test(e.className))continue
  if(/trusted by|fortune 500|cookies|co-founder|chief executive|based on data/i.test(text))continue
  // Physical keyboard demos depend on 3D lighting/scroll state; prefer the actual command UI.
  if(/^esc\s+F1\s+F2/i.test(text))continue
  const controls=e.querySelectorAll('button,input,kbd,[role="row"],[role="option"]').length,svgs=e.querySelectorAll('svg').length,images=e.querySelectorAll('img').length
  const hint=String(e.className)+' '+e.id
  if(/keyboard/i.test(hint))continue
  const panel=controls>=3&&text.length>30||svgs>=3&&text.length>40
  const card=(e.tagName==='ARTICLE'||/card|bento|panel|window|demo|illustration|preview/i.test(hint))&&images+svgs>0&&text.length>=4&&text.length<850
  if(!panel&&!card)continue
  const score=(panel?40:0)+(e.tagName==='ARTICLE'?25:0)+Math.min(svgs,10)*2+Math.min(controls,12)*3+(r.width*r.height>120000?15:0)+(/window|panel/i.test(hint)?15:0)-(text.length>1500?30:0)
  all.push({e,score})
 }
 const chosen=[]
 for(const item of all.sort((a,b)=>b.score-a.score)){
  if(chosen.some(c=>c.e.contains(item.e)||item.e.contains(c.e)))continue
  chosen.push(item);if(chosen.length===8)break
 }
 return chosen.map(({e},i)=>{e.setAttribute('data-native-candidate',String(i));const heading=e.querySelector('h2,h3,h4');return{selector:`[data-native-candidate="${i}"]`,name:(heading?.innerText||e.innerText).replace(/\s+/g,' ').trim().slice(0,100)}})
}

export async function nativeInventory({url,brandStyle,onStep=()=>{}}){
 if(!/^https?:\/\//.test(url||''))throw new Error('Cannot capture native layers: an HTTP website URL is required. Next: pass the brand landing-page url.')
 const b=await(await loadChromium()).launch({channel:'chromium'}),captures=[],skipped=[]
 try{
  const page=await b.newPage({viewport:{width:1440,height:1000}}),preview=await b.newPage({viewport:{width:1440,height:1000}})
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000})
  for(const y of[0,900,1800,2800,4200,5800,7500,9500]){await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(250)}
  const candidates=await page.evaluate(discoverNativeComponents)
  const faces=(brandStyle?.css||'').match(/@font-face\{[^}]+\}/g)?.join('')||''
  const fontCSS=faces+faces.replaceAll("'Motioneer Source'",JSON.stringify(brandStyle?.family||'Motioneer Source'))
  for(const candidate of candidates){
   try{
    const root=page.locator(candidate.selector)
    await root.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await page.waitForTimeout(350)
    await root.locator('img').evaluateAll(async imgs=>{for(const i of imgs)i.loading='eager';await Promise.race([Promise.all(imgs.map(i=>i.decode().catch(()=>{}))),new Promise(r=>setTimeout(r,2500))])})
    const images=await root.locator('img').evaluateAll(imgs=>imgs.map(i=>{const r=i.getBoundingClientRect(),s=getComputedStyle(i);return{w:r.width,h:r.height,natural:i.naturalWidth,blur:s.filter.includes('blur('),opacity:+s.opacity}}).filter(i=>i.w>150&&i.h>120&&i.opacity>.1))
    if(images.length&&images.every(i=>i.natural<100||i.blur))throw Error('only blurred or unresolved image placeholders are visible')
    await root.evaluate(root=>{
     const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>=8&&r.height>=8&&s.display!=='none'&&s.visibility!=='hidden'&&+s.opacity>.1}
     const anchors=[]
     for(const e of [...root.querySelectorAll('svg'),...root.querySelectorAll('h2,h3,h4,kbd,button,input,span,p')]){
      if(!visible(e)||/^(?:pause|play|previous slide|next slide|slide [0-9]|[0-9] of [0-9]|browse all)/i.test((e.innerText||e.getAttribute('aria-label')||'').trim())||e.closest('a')?.innerText.match(/explore|learn more|read more|download|get started/i))continue
      const r=e.getBoundingClientRect(),text=(e.innerText||e.getAttribute('aria-label')||e.getAttribute('placeholder')||'').trim()
      const svg=e.tagName.toLowerCase()==='svg'&&r.width<=180&&r.height<=180&&e.querySelector('path')&&!e.querySelector('use,image')
      if(svg&&e.closest('a'))continue
      if(!svg&&(!text||text.length>48||e.children.length>3||r.width>600||r.height>120))continue
      if(anchors.some(a=>a.contains(e)||e.contains(a)))continue
      if(!svg&&!/[a-z0-9]{3}/i.test(text))continue
      let target=e
      if(!svg&&text.length>24&&e.childNodes.length===1&&e.firstChild.nodeType===Node.TEXT_NODE){
       const node=e.firstChild,match=/(?:[A-Za-z0-9’-]+[ ,.!?—–]*){1,2}$/.exec(node.textContent.trimEnd())
       if(match&&match[0].trim().length>=4){const range=document.createRange();range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);target=document.createElement('span');range.surroundContents(target)}
      }
      if(svg){let context=e.getAttribute('aria-label')||'';for(let p=e.parentElement,n=0;!context&&p&&p!==root&&n<3;p=p.parentElement,n++){const t=(p.innerText||'').trim();if(t.length>=3&&t.length<90)context=t}target.setAttribute('data-native-context',context||'source icon')}
      target.setAttribute('data-native-anchor',String(anchors.length));anchors.push(target);if(anchors.length===8)break
     }
     const parts=[...root.querySelectorAll('img,h2,h3,h4,p,button,[role="row"],[role="option"]')].filter(e=>visible(e)&&!anchors.some(a=>a===e||e.contains(a)||a.contains(e)))
     parts.filter(e=>!parts.some(a=>a!==e&&a.contains(e))).slice(0,10).forEach(e=>e.setAttribute('data-native-part',''))
    })
    if(!await root.locator('[data-native-anchor]').count())throw Error('no meaningful native anchor')
    const layers={detail:'[data-native-anchor]'};if(await root.locator('[data-native-part]').count())layers.parts='[data-native-part]'
    onStep('Retaining native layers: '+candidate.name.slice(0,60))
    const c=await captureLayers(page,{...candidate,layers,fontCSS})
    await preview.setViewportSize({width:Math.ceil(c.w),height:Math.ceil(c.h)})
    await preview.setContent(`<style>html,body{margin:0;background:${brandStyle?.theme==='light'?brandStyle.palette[2]:brandStyle?.palette[0]||'#111'}}${c.css}</style>${c.html}`)
    await preview.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))})
    const anchors=await preview.locator('[data-motion-layer="detail"]').evaluateAll(els=>els.map((e,index)=>{const r=e.getBoundingClientRect();return{index,selector:`[data-motion-layer="detail"][data-motion-index="${index}"]`,x:r.x,y:r.y,w:r.width,h:r.height,kind:e.tagName.toLowerCase()==='svg'?'svg':'text',text:(e.getAttribute('data-native-context')||e.textContent||e.getAttribute('placeholder')||e.getAttribute('aria-label')||'source icon').trim().slice(0,65)}}).filter(a=>a.x>=0&&a.y>=0&&a.w>0&&a.h>0))
    if(!anchors.length)throw Error('anchors did not survive isolation')
    const data='data:image/png;base64,'+(await preview.screenshot()).toString('base64')
    const visibility=await preview.evaluate(async data=>{const im=new Image();im.src=data;await im.decode();const c=document.createElement('canvas');c.width=c.height=100;const g=c.getContext('2d');g.drawImage(im,0,0,100,100);const p=g.getImageData(0,0,100,100).data;let variance=0;for(let ch=0;ch<3;ch++){let sum=0,sq=0,n=0;for(let i=ch;i<p.length;i+=4){sum+=p[i];sq+=p[i]*p[i];n++}variance+=sq/n-(sum/n)**2}return{variance:variance/3}},data)
    if(visibility.variance<80)throw Error('isolated source is too empty or low-contrast to read')
    captures.push({...c,id:crypto.randomUUID(),data,anchors,visibility,captureMode:'dom',sourceKind:'landing',sourceUrl:c.source})
   }catch(e){skipped.push({name:candidate.name,reason:e.message});onStep('Skipping native component: '+candidate.name.slice(0,40)+' ('+e.message.slice(0,90)+')')}
  }
  if(captures.length<2)throw new Error('Cannot meet the native film bar: fewer than two usable components with real detail anchors were found. Next: use a product page with accessible DOM/SVG or choose hybrid for honestly labeled flattened captures.')
  const sheet=await preview.evaluate(async captures=>{const c=document.createElement('canvas');c.width=1440;c.height=Math.ceil(captures.length/3)*350;const g=c.getContext('2d');g.fillStyle='#17181c';g.fillRect(0,0,c.width,c.height);for(let i=0;i<captures.length;i++){const a=captures[i],im=new Image();im.src=a.data;await im.decode();const x=i%3*480,y=Math.floor(i/3)*350,k=Math.min(450/im.width,260/im.height);g.drawImage(im,x+15+(450-im.width*k)/2,y+10,im.width*k,im.height*k);g.fillStyle='#fff';g.font='15px Arial';g.fillText(`${i}: ${a.name}`.slice(0,60),x+15,y+290);g.fillStyle='#b8bac4';g.font='12px Arial';g.fillText(a.anchors.map(a=>a.index+':'+a.text).join(' / ').slice(0,68),x+15,y+318)}return c.toDataURL('image/jpeg',.88).split(',')[1]},captures)
  return{captures,sheet:{mime:'image/jpeg',data:sheet},skipped}
 }finally{await b.close()}
}

export function nativeDocument(scene,plan,capture){
 if(scene.choreography&&scene.choreography!=='macro')return sourceDocument(scene,plan,capture,{native:true})
 const a=capture.anchors.find(a=>a.index===scene.anchor)
 if(!a)throw new Error('Cannot choreograph native reveal: the selected anchor is missing. Next: choose an anchor from the source inventory.')
 const [dark,accent,paper]=plan.palette,light=plan.brandStyle?.theme==='light',background=light?paper:dark,ink=light?dark:paper
 const stage=sourceStage(capture,scene.layout),{fit,x:left,y:top}=stage
 const cx=scene.entry==='left'?680:scene.entry==='right'?1210:960,cy=520
 const macro=Math.min(34,2*Math.min(cx-96,1824-cx)/a.w,800/a.h,Math.max(fit*2.4,Math.min(780/a.w,390/a.h)))
 const x=cx-left-(a.x+a.w/2)*macro,y=cy-top-(a.y+a.h/2)*macro,pad=a.kind==='svg'?2:3
 const inset=`${Math.max(0,a.y-pad)}px ${Math.max(0,capture.w-a.x-a.w-pad)}px ${Math.max(0,capture.h-a.y-a.h-pad)}px ${Math.max(0,a.x-pad)}px`
 const reveal=nativeRevealMs(scene.ms,scene.bpm),anchor=a.selector
 let html=capture.html
 // A real SVG anchor is drawn using its retained path geometry, not a replacement symbol.
 if(a.kind==='svg')html=html.replace(/<path\b([^>]*)>/g,(_,attrs)=>{
  const style=/style="([^"]*)"/.exec(attrs)?.[1]||'',property=(key,fallback)=>new RegExp('(?:^|;)'+key+':([^;]+)').exec(style)?.[1]||fallback
  const vars=';--mn-stroke:'+property('stroke','none')+';--mn-width:'+property('stroke-width','1px')+';--mn-dash:'+property('stroke-dasharray','none')+';--mn-opacity:'+property('fill-opacity','1')
  return '<path '+attrs.replace(/pathLength="[^"]*"/g,'').replace(/style="[^"]*"/,'')+' pathLength="1" style="'+style+vars+'">'
 })
 const css=capture.css+`\n.native-scene{position:relative;width:1920px;height:1080px;background:${background};color:${ink};overflow:hidden;font-family:${sourceFont(plan)};font-style:${plan.brandStyle?.style||'normal'}}.native-scene h1{position:absolute;left:${stage.titleX}px;top:${stage.titleY}px;margin:0;font-size:${stage.titleSize}px;font-weight:${plan.brandStyle?.weight||500};line-height:1;overflow-wrap:anywhere;letter-spacing:-.055em;max-width:${stage.titleWidth}px;animation:native-title .25s ${reveal*.58}ms both}.native-camera{position:absolute;left:${left}px;top:${top}px;transform-origin:0 0;animation:native-camera ${reveal}ms cubic-bezier(.65,0,.2,1) both}.native-window{width:${capture.w}px;height:${capture.h}px;animation:native-window ${reveal}ms cubic-bezier(.65,0,.2,1) both}.native-scene [data-motion-layer="parts"]{animation:native-part .3s ${reveal*.6}ms both}.native-scene [data-motion-layer="parts"][data-motion-index="1"]{animation-delay:${reveal*.68}ms}.native-scene [data-motion-layer="parts"][data-motion-index="2"]{animation-delay:${reveal*.74}ms}.native-scene ${anchor}{position:relative;z-index:1}.native-scene ${anchor} path{animation:native-draw ${Math.min(420,reveal*.4)}ms both}
@keyframes native-camera{0%,13%{transform:translate(${x}px,${y}px) scale(${macro})}100%{transform:translate(0,0) scale(${fit})}}
@keyframes native-window{0%,13%{clip-path:inset(${inset} round 2px)}85%,100%{clip-path:inset(0)}}
@keyframes native-draw{0%{stroke:${ink};stroke-width:.12;stroke-dasharray:1;stroke-dashoffset:.75;fill-opacity:0}45%{stroke:${ink};stroke-width:.12;stroke-dasharray:1;stroke-dashoffset:0;fill-opacity:0}100%{stroke:var(--mn-stroke);stroke-width:var(--mn-width);stroke-dasharray:var(--mn-dash);stroke-dashoffset:0;fill-opacity:var(--mn-opacity)}}
@keyframes native-part{from{opacity:0;translate:0 10px}to{opacity:1;translate:0 0}}
@keyframes native-title{from{opacity:0;translate:0 18px}to{opacity:1;translate:0 0}}`
 return{html:`<div class="native-scene"><div class="native-camera"><div class="native-window">${html}</div></div><h1>${esc(scene.text)}</h1></div>`,css}
}

export function nativeFinish(plan){return{html:`<div class="native-finish"><h1>${esc(plan.brand)}</h1></div>`,css:`.native-finish{width:1920px;height:1080px;display:grid;place-items:center;background:${plan.palette[0]};color:${plan.palette[2]};font-family:${sourceFont(plan)};font-style:${plan.brandStyle?.style||'normal'}}.native-finish h1{margin:0;font-size:180px;font-weight:${plan.brandStyle?.weight||500};letter-spacing:-.055em}`}}
