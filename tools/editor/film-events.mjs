/** Seconds on the film clock, derived from the same arrival functions as the visual renderer. */
import {captureArrivalMs} from './source-choreography.mjs'
import {ACTION_PHASES,MECHANISMS} from './product-graphics.mjs'
import {createHash} from 'node:crypto'
import {tempo} from '../../dist-core/core.js'
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
/**
 * When each part of a capture film lands, read from the timing its own motion declares.
 *
 * A capture film has no authored events, so its arrivals are its clock: a staggered part lands when
 * the arrival curve has carried it most of the way, about two fifths into its motion, and the last
 * part to land settles the shot. Parts under 40ms apart share one cue, because closer sounds smear
 * into one, and a shot keeps at most eight, so a long list prints rather than buzzes.
 *
 * @param starts  each track's resolved start in ms, by track id
 * @returns cues in seconds on the film clock, each with the verb its part moved by
 */
export function arrivalCues(project,starts){
 const cues=[]
 for(const t of project.tracks){
  const motion=t.kind==='component'&&!t.hidden&&starts.has(t.id)&&project.motions.find(m=>m.id===t.motionId)
  if(!motion)continue
  const {delays,durations}=tempo(motion.css||'')
  if(!durations.length)continue
  const part=[...durations].sort((a,b)=>a-b)[Math.floor(durations.length/2)],from=starts.get(t.id)+t.entrance,kept=[]
  for(const d of [...new Set([0,...delays])].sort((a,b)=>a-b)){const at=from+d+part*.4;if(at<starts.get(t.id)+t.duration&&(!kept.length||at-kept.at(-1)>=40))kept.push(at)}
  kept.slice(0,8).forEach((at,i,list)=>cues.push({at:at/1000,phase:i===list.length-1?3:i%3,kind:'arrival',trackId:t.id,verb:motion.verb||null}))
 }
 return cues.sort((a,b)=>a.at-b.at)
}
