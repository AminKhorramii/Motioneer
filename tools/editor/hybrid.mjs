/** Faithful source pixels inside authored choreography, with traceable capture IDs. */
import {createProject,newTrack,compositionDocument} from '../../dist-core/core.js'
import {loadChromium} from './render.mjs'
export const PRODUCT_SCENES=['product','product-detail','product-split']
export async function captureInventory(source,{at,onStep=()=>{}}){
 const used=new Set(source.tracks.filter(t=>t.kind==='component'&&!t.hidden).map(t=>t.subjectId))
 const subjects=source.subjects.filter(s=>s.w>=200&&s.h>=150&&!source.motions.some(m=>m.subjectId===s.id&&m.scope==='data-kinetic')).sort((a,b)=>Number(used.has(b.id))-Number(used.has(a.id))).slice(0,12)
 if(!subjects.length)throw new Error('Cannot blend the film: this project has no substantial website captures. Next: use film on the site first, then pass its projectId to reel.')
 const browser=await(await loadChromium()).launch({channel:'chromium'}),captures=[]
 try{
  const page=await browser.newPage()
  for(const subject of subjects){
   onStep(`Preparing source capture ${captures.length+1}: ${subject.name.slice(0,65)}.`)
   const width=Math.round(subject.w),height=Math.round(subject.h)
   const p={...createProject('Capture reference'),id:source.id,subjects:[subject],settings:{...source.settings,width,height,from:0,to:1000,duration:1000},tracks:[{...newTrack('component',subject.name),subjectId:subject.id,x:0,y:0,width:100,height:100,duration:1000}]}
   await page.setViewportSize({width,height});await page.goto(at+'/__motioneer/render-shell')
   await page.setContent(compositionDocument(p,`${at}/__motioneer/projects/${source.id}/assets/`))
   await page.evaluate(()=>window.__composition.ready());await page.evaluate(()=>window.__composition.seek(900));await page.waitForTimeout(60)
   const data=await page.screenshot({type:'png'})
   const visible=await page.evaluate(async data=>{const i=new Image();i.src=data;await i.decode();const c=document.createElement('canvas');c.width=c.height=48;const g=c.getContext('2d');g.drawImage(i,0,0,48,48);const p=g.getImageData(0,0,48,48).data;let variance=0;for(let channel=0;channel<3;channel++){let n=0,sum=0,sq=0;for(let k=channel;k<p.length;k+=4){n++;sum+=p[k];sq+=p[k]*p[k]}variance+=sq/n-(sum/n)**2}return variance/3>8},'data:image/png;base64,'+data.toString('base64'))
   if(!visible){onStep(`Skipping empty source capture: ${subject.name.slice(0,65)}.`);continue}
   captures.push({id:subject.id,name:subject.name,w:width,h:height,data:'data:image/png;base64,'+data.toString('base64'),warnings:subject.warnings||[]})
  }
  if(!captures.length)throw new Error('Cannot blend the film: the captured elements render empty. Next: provide url to capture fresh website visuals.')
  const sheet=await page.evaluate(async captures=>{
   const c=document.createElement('canvas');c.width=1200;c.height=Math.ceil(captures.length/3)*280;const g=c.getContext('2d');g.fillStyle='#15161b';g.fillRect(0,0,c.width,c.height)
   for(let i=0;i<captures.length;i++){const a=captures[i],im=new Image();im.src=a.data;await im.decode();const x=i%3*400,y=Math.floor(i/3)*280,k=Math.min(380/im.width,230/im.height);g.drawImage(im,x+10+(380-im.width*k)/2,y+10,im.width*k,im.height*k);g.fillStyle='#eee';g.font='14px Arial';g.fillText(`${i}: ${a.name}`.slice(0,51),x+10,y+263)}
   return c.toDataURL('image/jpeg',.85).split(',')[1]
  },captures)
  return {captures,sheet:{mime:'image/jpeg',data:sheet}}
 }finally{await browser.close()}
}
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function productDocument(scene,plan,capture,graphic){
 const split=scene.type==='product-split'||capture.w/capture.h<.95,detail=scene.type==='product-detail'
 const [dark,accent,paper]=plan.palette,ink=scene.tone==='dark'?paper:dark
 // Fit a complete capture before a deliberate detail crop. Narrow cards stay recognizable.
 const box=split?{x:810,y:170,w:990,h:800}:{x:150,y:235,w:1620,h:745}
 const scale=Math.min(box.w/capture.w,box.h/capture.h)
 const w=capture.w*scale,h=capture.h*scale
 const x=box.x+(box.w-w)/2,y=box.y+(box.h-h)/2
 const title=esc(scene.text),body=`<div class="product-geometry">${graphic.html}</div><div class="product-window" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><img src="${capture.data}" alt="${esc(capture.name)}"/></div><h1 class="product-title">${title}</h1><span class="product-domain">${esc(plan.domain)}</span>`
 const css=graphic.css+`\n.product-scene{position:relative;width:1920px;height:1080px;overflow:hidden;background:${scene.tone==='paper'?paper:scene.tone==='accent'?accent:dark};color:${ink};font-family:Arial,Helvetica,sans-serif}.product-geometry{position:absolute;inset:0;opacity:.22}.product-geometry .folio,.product-geometry h1,.product-geometry .graphic-detail{display:none}.product-window{position:absolute;overflow:hidden;border:1px solid ${accent}66;border-radius:18px;box-shadow:0 35px 110px #0006;transform-origin:center;animation:product-arrive .5s cubic-bezier(.16,1,.3,1) both}.product-window img{display:block;width:100%;height:100%;animation:product-drift var(--duration) linear both}.product-title{position:absolute;margin:0;left:${split?100:150}px;top:${split?300:105}px;max-width:${split?640:1650}px;font-size:${split?118:104}px;letter-spacing:-.06em;line-height:.98;animation:product-type .4s cubic-bezier(.16,1,.3,1) both}.product-domain{position:absolute;left:60px;bottom:40px;font:17px monospace;opacity:.7}@keyframes product-arrive{from{clip-path:inset(0 0 100% 0);transform:translateY(70px) rotate(3deg)}to{clip-path:inset(0);transform:translateY(0) rotate(0)}}@keyframes product-drift{from{transform:scale(${detail?1.28:1}) translateX(${detail?'-1%':'0'})}to{transform:scale(${detail?1.36:1.025}) translateX(${detail?'1%':'0'})}}@keyframes product-type{from{opacity:0;transform:translateY(45px)}to{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){.product-scene *{animation:none!important}}`
 return {html:`<div class="product-scene" style="--duration:${scene.ms}ms">${body}</div>`,css}
}
