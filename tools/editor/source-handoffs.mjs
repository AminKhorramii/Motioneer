/** Carry a retained source object between two measured, settled source frames. No raster UI invention. */
import {newTrack} from '../../dist-core/core.js'
import {sourceStage,captureArrivalMs} from './source-choreography.mjs'
const fail=message=>{throw new Error('Cannot carry source object: '+message)}
export function normalizeHandoffs(raw,scenes,captures){
 const links=[]
 for(const [i,s]of scenes.entries()){
  const requested=raw[i]?.carry
  // Repeated native detail is an opportunity for continuity, never a mandate to add ornament.
  const next=scenes.findIndex((n,j)=>j>i&&n.type.startsWith('native-'))
  const automatic=!requested&&s.type.startsWith('native-')&&next>i&&next-i<=2&&scenes[next].captureId===s.captureId&&scenes[next].anchor===s.anchor
  if(!requested&&!automatic)continue
  const j=requested?scenes.findIndex(n=>n.id===requested.to):next,to=scenes[j]
  if(j<=i||j-i>2||!s.type.startsWith('native-')||!to?.type.startsWith('native-')){if(requested)fail('connect native source scenes in order, separated by at most one graphic beat.');continue}
  const c=captures.find(c=>c.id===s.captureId),target=captures.find(c=>c.id===to.captureId),a=c?.anchors?.find(a=>a.index===(requested?.anchor??s.anchor)),b=target?.anchors?.find(a=>a.index===(requested?.targetAnchor??to.anchor))
  if(!a?.html||!b?.html||c.id!==target.id||a.index!==b.index){if(requested)fail('both endpoints must name the same retained capture and anchor with a portable fragment.');continue}
  if(!['svg','text'].includes(a.kind)){if(requested)fail('only retained vector or text anchors can travel.');continue}
  links.push({id:`carry-${s.id}-${to.id}`,from:s.id,to:to.id,captureId:c.id,anchor:a.index,objectId:`${c.id}:anchor:${a.index}`})
 }
 return links
}
export function applyHandoffs(project,plan,captures,shots,bpm){
 const events=[],transitions=[],visibility=new Map()
 for(const link of plan.handoffs||[]){
  const from=shots.find(s=>s.sceneId===link.from),to=shots.find(s=>s.sceneId===link.to),capture=captures.find(c=>c.id===link.captureId),a=capture?.anchors?.find(a=>a.index===link.anchor)
  if(!from||!to||!a?.html)fail('the saved endpoints or source fragment are missing.')
  const fromScene=plan.scenes.find(s=>s.id===link.from),toScene=plan.scenes.find(s=>s.id===link.to),start=Math.round((from.at+from.seconds)*1000)-250,end=Math.round(to.at*1000+captureArrivalMs(toScene,to.seconds*1000,bpm)),duration=end-start
  const f=sourceStage(capture,fromScene.layout),t=sourceStage(capture,toScene.layout),point=stage=>({x:stage.x+(a.x+a.w/2)*stage.fit,y:stage.y+(a.y+a.h/2)*stage.fit}),p=point(f),q=point(t),bend=Math.max(80,Math.abs(q.x-p.x)*.4),path=`M ${p.x} ${p.y} C ${p.x+bend} ${p.y-90} ${q.x-bend} ${q.y-90} ${q.x} ${q.y}`
  const subjectId=crypto.randomUUID(),motionId=crypto.randomUUID(),track={...newTrack('component','Carry / '+a.text,start),subjectId,motionId,duration,x:0,y:0,width:100,height:100,entrance:0}
  const rootToken=/data-capture-root="([a-zA-Z0-9-]+)"/.exec(capture.html)?.[1]||''
  const html=`<div class="carry-object"><div class="carry-fit" data-capture-root="${rootToken}">${a.html}</div></div>`
  const css=capture.css+(plan.brandStyle?.css||'')+`.carry-object{position:absolute;left:0;top:0;width:${a.w*f.fit}px;height:${a.h*f.fit}px;offset-path:path('${path}');offset-rotate:0deg;transform-origin:center;animation:carry-flight ${duration}ms cubic-bezier(.65,0,.2,1) both}.carry-fit{width:${a.w}px;height:${a.h}px;transform:scale(${f.fit});transform-origin:0 0}.carry-fit::before,.carry-fit::after{content:none!important}.carry-fit>*{position:relative!important;left:auto!important;right:auto!important;top:auto!important;bottom:auto!important;margin:0!important;transform:none!important;translate:none!important;rotate:none!important;scale:none!important;width:${a.w}px!important;height:${a.h}px!important}@keyframes carry-flight{from{offset-distance:0%;transform:scale(1)}to{offset-distance:100%;transform:scale(${t.fit/f.fit})}}@media(prefers-reduced-motion:reduce){.carry-object{display:none}}`
  project.subjects.push({id:subjectId,name:track.name,html,css:'',w:1920,h:1080,warnings:['A retained source object travels between measured endpoints. This is authored choreography, not a live product interaction.']})
  project.motions.push({id:motionId,subjectId,css,scope:'data-kinetic',note:link.id,treatment:'bold',brief:{purpose:'interaction',intensity:'bold',duration,direction:'Carry the original source anchor between scenes.'},duration,saved:true})
  project.tracks.push(track)
  for(const [shot,kind,ms]of [[from,'out',start-from.at*1000],[to,'in',end-to.at*1000]]){
   const key=shot.trackId+':'+a.selector,gate=visibility.get(key)||{shot,selector:a.selector,in:0,out:shot.seconds*1000}
   gate[kind]=ms;visibility.set(key,gate)
  }
  const transition={...link,trackId:track.id,start:start/1000,end:end/1000,fromPoint:p,toPoint:q,renderedMotion:'The same retained text or vector fragment follows a curved path; its source copies hide during the transfer.'};transitions.push(transition)
  for(const [kind,at,phase]of [['release',start/1000,0],['settle',end/1000,3]])events.push({id:link.id+':'+kind,sceneId:link.to,trackId:track.id,objectId:link.objectId,kind,at,phase,mechanism:'integration'})
 }
 // One visibility animation per object, including a middle scene that both receives and releases it.
 for(const [index,gate]of [...visibility.values()].entries()){
  const tr=project.tracks.find(t=>t.id===gate.shot.trackId),motion=project.motions.find(m=>m.id===tr.motionId),name='carry-visibility-'+index,selector=`.native-scene ${gate.selector},.source-scene ${gate.selector}`,duration=gate.shot.seconds*1000
  if(gate.in>=gate.out)fail('the middle scene needs a visible hold between arrival and departure.')
  const frames=`0%{visibility:${gate.in?'hidden':'visible'}}${gate.in?`${gate.in/duration*100}%{visibility:visible}`:''}${gate.out<duration?`${gate.out/duration*100}%{visibility:hidden}`:''}100%{visibility:${gate.out<duration?'hidden':'visible'}}`
  motion.css+=`${selector}{animation:${name} ${duration}ms steps(1,end) both!important}@keyframes ${name}{${frames}}@media(prefers-reduced-motion:reduce){${selector}{visibility:visible!important;animation:none!important}}`
 }
 return{transitions,events}
}
