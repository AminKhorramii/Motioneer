/** Seconds on the film clock, derived from the same arrival functions as the visual renderer. */
import {captureArrivalMs} from './source-choreography.mjs'
import {ACTION_PHASES,MECHANISMS} from './product-graphics.mjs'
import {createHash} from 'node:crypto'
/** Stored events describe a particular visual edit, never silently reuse them after edits. */
export function visualClock(project){
 const tracks=project.tracks.filter(t=>t.kind!=='audio').map(({locked,name,...t})=>t)
 return createHash('sha256').update(JSON.stringify({tracks,camera:project.camera,width:project.settings.width,height:project.settings.height,motions:tracks.map(t=>project.motions.find(m=>m.id===t.motionId)?.css),subjects:tracks.map(t=>project.subjects.find(s=>s.id===t.subjectId))})).digest('hex')
}
export function currentEvents(project){
 const current=Boolean(project.direction?.clock&&project.direction.clock===visualClock(project))
 return {status:current?'renderer-clock':'stale-or-unavailable',events:current?project.direction.events:[]}
}
export function filmEvents(shots,scenes,bpm){
 const events=[]
 for(const [i,shot]of shots.entries()){
  const scene=scenes[i],sceneId=shot.sceneId||`scene-${i+1}`
  events.push({id:sceneId+':cut',sceneId,trackId:shot.trackId,at:shot.at,kind:'cut',phase:0})
  if(shot.captureId){const arrival=captureArrivalMs(scene,shot.seconds*1000,bpm)/1000
   for(const [phase,fraction]of [.08,.35,1].entries())events.push({id:sceneId+':'+phase,sceneId,trackId:shot.trackId,objectId:shot.captureId,at:shot.at+arrival*fraction,kind:['reveal','reaction','settle'][phase],phase,mechanism:'integration'})
  }
  if(scene.type==='mechanism'&&MECHANISMS.includes(scene.motif))for(const [phase,fraction]of ACTION_PHASES.entries())events.push({id:sceneId+':'+phase,sceneId,trackId:shot.trackId,at:shot.at+shot.seconds*fraction,kind:['anticipation','action','reaction','settle'][phase],phase,mechanism:scene.motif})
 }
 return events.sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))
}
export const eventCues=events=>events.filter(e=>e.kind!=='cut').map(e=>({...e}))
