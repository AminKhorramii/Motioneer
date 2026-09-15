/** Reusable staging learned from directed source films, without a brand-specific template. */
import {ART} from './art-direction.mjs'
export const sourceFont=plan=>plan.brandStyle?"'Motioneer Source',sans-serif":ART[plan.art]?"'Motion-"+ART[plan.art].font+"',sans-serif":'sans-serif'
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export const SOURCE_LAYOUTS=['wide','left','right']
export const SOURCE_MOTIONS=['macro','assemble','shuttle']
export const nativeRevealMs=(ms,bpm)=>Math.min(1200,ms*.58,Number.isFinite(bpm)&&bpm>0?120000/bpm:1200)
export const sourceArrivalMs=(ms,bpm)=>Math.min(760,ms*.42,Number.isFinite(bpm)&&bpm>0?90000/bpm:760)
export const captureArrivalMs=(scene,ms,bpm)=>scene.type.startsWith('native-')&&(!scene.choreography||scene.choreography==='macro')?nativeRevealMs(ms,bpm):sourceArrivalMs(ms,bpm)
export function sourceStage(capture,layout){
 const tall=capture.w/capture.h<.95
 layout=SOURCE_LAYOUTS.includes(layout)?layout:tall?'right':'wide'
 const box=layout==='wide'?{x:140,y:285,w:1640,h:695}:layout==='left'?{x:110,y:115,w:880,h:850}:{x:930,y:115,w:880,h:850}
 const fit=Math.min(box.w/capture.w,box.h/capture.h)
 return{layout,fit,x:box.x+(box.w-capture.w*fit)/2,y:box.y+(box.h-capture.h*fit)/2,w:capture.w*fit,h:capture.h*fit,titleX:layout==='left'?1080:110,titleY:layout==='wide'?92:360,titleWidth:layout==='wide'?1700:730,titleSize:layout==='wide'?92:112}
}
export function sourceDocument(scene,plan,capture,{native=false}={}){
 const stage=sourceStage(capture,scene.layout),arrival=sourceArrivalMs(scene.ms,scene.bpm),assembly=scene.choreography==='assemble',macro=scene.choreography==='macro'
 const [dark,accent,paper]=plan.palette,light=scene.tone==='paper'||scene.tone!=='dark'&&scene.tone!=='accent'&&plan.brandStyle?.theme==='light'
 const background=scene.tone==='accent'?accent:light?paper:dark
 // Choose readable title contrast even when a site's accent is pale yellow or saturated blue.
 const rgb=background.slice(1).match(/../g).map(v=>{const c=parseInt(v,16)/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4}),luma=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722,ink=luma>.4?dark:paper
 const picture=`<img src="${esc(capture.data)}" alt="${esc(capture.name)}">`
 const art=native?`<div class="source-fit" style="width:${capture.w}px;height:${capture.h}px;transform:scale(${stage.fit})">${capture.html}</div>`:assembly?Array.from({length:8},(_,i)=>`<div class="source-strip" style="--i:${i};--sign:${i%2?1:-1};clip-path:inset(0 ${87.5-i*12.5}% 0 ${i*12.5}%)">${picture}</div>`).join('')+`<div class="source-complete">${picture}</div>`:picture
 const sign=stage.layout==='left'?1:-1,dist=stage.layout==='wide'?160:500
 const html=`<div class="source-scene" data-source-layout="${stage.layout}" data-source-choreography="${scene.choreography}"><div class="source-stage"><div class="source-art">${art}</div></div><h1>${esc(scene.text)}</h1></div>`
 const css=(native?capture.css:'')+`\n.source-scene{position:relative;width:1920px;height:1080px;overflow:hidden;background:${background};color:${ink};font-family:${sourceFont(plan)};font-style:${plan.brandStyle?.style||'normal'}}.source-stage{overflow:${macro?'hidden':'visible'};position:absolute;left:${stage.x}px;top:${stage.y}px;width:${stage.w}px;height:${stage.h}px;perspective:1800px}.source-art{position:absolute;inset:0;transform-origin:center;animation:source-seat ${arrival}ms cubic-bezier(.16,1,.3,1) both}.source-fit{transform-origin:0 0}.source-art img{display:block;width:100%;height:100%;object-fit:contain}.source-strip,.source-complete{position:absolute;inset:0}.source-strip{animation:source-strip ${arrival*.65}ms cubic-bezier(.16,1,.3,1) calc(var(--i)*${arrival*.035}ms) both}.source-complete{animation:source-complete 1ms ${arrival}ms both}.source-scene h1{position:absolute;left:${stage.titleX}px;top:${stage.titleY}px;max-width:${stage.titleWidth}px;margin:0;font-size:${stage.titleSize}px;font-weight:${plan.brandStyle?.weight||500};line-height:1;overflow-wrap:anywhere;letter-spacing:-.055em;animation:source-title ${arrival*.55}ms cubic-bezier(.16,1,.3,1) ${arrival*.22}ms both}.source-scene [data-motion-layer="parts"]{animation:source-part ${arrival*.5}ms cubic-bezier(.16,1,.3,1) ${arrival*.25}ms both}.source-scene [data-motion-layer="parts"][data-motion-index="1"]{animation-delay:${arrival*.32}ms}.source-scene [data-motion-layer="parts"][data-motion-index="2"]{animation-delay:${arrival*.39}ms}
@keyframes source-seat{0%{transform:translate(${assembly||macro?0:sign*dist}px,${macro?0:assembly?60:15}px) rotateY(${macro?0:assembly?-12:sign*22}deg) scale(${macro?1.45:assembly?.93:1.14})}78%{transform:translate(${assembly?0:-sign*2}px,-1px) rotateY(0) scale(1.002)}100%{transform:none}}
@keyframes source-strip{from{transform:translateY(calc(var(--sign)*110px)) rotateX(calc(var(--sign)*25deg));opacity:0}to{transform:none;opacity:1}}
@keyframes source-complete{from{opacity:0}to{opacity:1}}
@keyframes source-part{from{opacity:0;translate:${sign*18}px 12px}to{opacity:1;translate:0 0}}
@keyframes source-title{from{opacity:0;transform:translate(${sign*35}px,20px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.source-scene *{animation:none!important}.source-complete{opacity:1}}`
 return{html,css}
}
export const SOURCE_DIRECTION=`SOURCE CHOREOGRAPHY: Direct the source material rather than placing every capture in the same card. For every capture scene return layout wide (headline above a large source), left (source left, headline right), or right (source right, headline left), and choreography macro (measured detail reveal), assemble (retained DOM parts or eight raster bands seat), or shuttle (the source travels across the canvas and settles). Choose from source shape and product meaning; a wide UI usually needs wide, a tall artwork can use left or right. Vary both layout and choreography across the cut. Do not merely alternate scene names with identical staging. Return action describing the source reveal that the selected choreography can actually render, and handoff describing a compositional relationship to the next shot. These are directing notes, not executable animation or on-screen copy. Raster scenes only transform the complete image or eight bands: never describe their cursors, controls or paths as moving independently. Native assemble and shuttle move named parts; only native macro draws retained SVG paths. Connected-object transitions require additional authored motion and review; a handoff note does not implement them. Use short product headings, readable complete-source holds, and one or two accent-color punctuation beats when justified by the brand. No persistent decorative backgrounds or generic diagrams beneath source images. A red frame, 909 techno, bitmap fragmentation or a ribbon is not a universal brand template. Preserve each source's own visual language. A deliberate quiet hold can be stronger than extra effects. Keep a brand-only dark finish. Structural checks and this vocabulary do not certify artistic quality; inspect arrival, action and settled frames before delivery.`
/** Renderer facts stay separate from model-authored action and handoff intentions. */
export function renderedSourceMotion(scene){
 const native=scene.type.startsWith('native-'),motion=scene.choreography||'macro'
 if(!native&&!scene.choreography)return 'The captured image arrives through a clipped window and drifts as a flat image.'
 return native?({macro:'The measured native anchor expands into the full captured component; retained paths and neighboring parts animate where present.',assemble:'The retained component enters with staggered named parts.',shuttle:'The retained component travels sideways and settles with staggered named parts.'}[motion]):({macro:'The complete raster image scales down from a central crop; its internal controls stay flat.',assemble:'Eight raster bands arrive, then an opaque complete image holds; its internal controls stay flat.',shuttle:'The complete raster image travels sideways and settles; its internal controls stay flat.'}[motion])
}
export function sourceDirectionReport(scenes,captures){
 const source=scenes.filter(s=>s.captureId),total=scenes.reduce((n,s)=>n+s.beats,0),warnings=[]
 if(source.length>=3&&new Set(source.map(s=>s.layout+':'+s.choreography)).size<2)warnings.push('Source scenes repeat the same staging and movement; consider a different composition or explain the deliberate repetition.')
 for(const s of source){const c=captures.find(c=>c.id===s.captureId);if(c&&c.w/c.h>2.4&&s.layout!=='wide')warnings.push('Wide source '+c.name+' is in a side composition; inspect legibility and consider wide staging.')}
 if(source.length&&source.some(s=>!s.action))warnings.push('Some source shots lack a concrete product action in the directing notes.')
 return{profile:'source-direction-v2',sourceShots:source.length,sourceComponents:new Set(source.map(s=>s.captureId)).size,sourceBeatShare:total?source.reduce((n,s)=>n+s.beats,0)/total:0,staging:[...new Set(source.map(s=>s.layout+':'+s.choreography))],sourceFidelity:captures.some(c=>c.captureMode==='dom')?'retained-dom-with-raster-images':captures.length?'raster-captures':'illustrative',warnings,visualReviewRequired:true,artisticQuality:'not-certified',directionNotes:'Action and handoff are planning notes, not evidence of rendered product behavior or connected transitions.'}
}
