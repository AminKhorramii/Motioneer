/** A new musical take preserves the complete visual edit and leaves the source project alone. */
import {resolve} from '../../shared/arrange.mjs'
import {MUSIC,musicPlan} from './music.mjs'
import {withSoundtrack} from './soundtrack.mjs'
import {renderProject,proveRender} from './autofilm.mjs'
export async function rescoreFilm({at,projectId,music,direction='',bpm,onStep=()=>{}}){
 if(!projectId)throw new Error('Cannot rescore: a source film is needed. Next: pass its projectId.')
 if(music&&!MUSIC[music])throw new Error('Cannot rescore: that music profile is unknown. Next: choose one of the listed identities.')
 const response=await fetch(`${at}/__motioneer/projects/${projectId}`)
 if(!response.ok)throw new Error('Cannot rescore: the source film was not found. Next: use a projectId from this studio.')
 const source=await response.json(),from=source.settings.from,to=source.settings.to,seconds=(to-from)/1000
 if(!source.tracks.some(t=>t.kind!=='audio'&&!t.hidden))throw new Error('Cannot rescore: the source film has no visible tracks. Next: create a film first.')
 if(bpm!==undefined&&(!Number.isFinite(bpm)||bpm<40||bpm>400))throw new Error('Cannot rescore: tempo must be 40 to 400 BPM. Next: choose a valid tempo.')
 const starts=resolve({cars:source.tracks.map(t=>({key:t.id,at:t.start,after:t.after,motion:{ms:t.duration}}))}).at
 const visual=source.tracks.map((t,i)=>({...t,start:starts[i]})).filter(t=>t.kind!=='audio'&&!t.hidden&&t.start<to&&t.start+t.duration>from).sort((a,b)=>a.start-b.start)
 const tempo=bpm||Math.max(70,Math.min(180,60000/Math.max(300,Math.min(...visual.map(t=>t.duration)))))
 let raw={profile:music}
 if(direction){
  onStep('Composing a musical identity for the existing edit.')
  const reply=await fetch(`${at}/__motioneer/ask`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({system:'You compose short original instrumental phrases for motion films. Return JSON only.',prompt:`Score ${source.name}, ${seconds}s at ${tempo} BPM. Direction: ${direction.slice(0,1800)}. Profiles: ${Object.entries(MUSIC).map(([id,p])=>id+': '+p.description).join('; ')}. ${music?'Required profile: '+music+'.':''} Return {profile,root,motif}: MIDI root 36 to 59, motif 4 to 12 scale degree indices 0 to 14. Make a memorable phrase with repetition and an answer. Harmony, drums, orchestration and the final cadence follow the profile and the existing cut.`,json:true})}).then(r=>r.json())
  if(!reply.json)throw new Error(`Cannot rescore: ${reply.error||'the composer returned no phrase'}. Next: retry the music direction.`)
  raw={...reply.json,...(music?{profile:music}:{})}
 }
 const identity=musicPlan(raw,source.name+' '+direction)
 const fresh=await fetch(at+'/__motioneer/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:source.name+' / '+identity.label})}).then(r=>r.json())
 if(!fresh.id)throw new Error('Cannot rescore: a new take could not be created. Next: retry.')
 let copied={...source,id:fresh.id,revision:fresh.revision,name:fresh.name},serialized=JSON.stringify(copied)
 // Copy asset bytes as well as references so the new take can be opened independently.
 for(const asset of source.assets){
  const bytes=await fetch(`${at}/__motioneer/projects/${projectId}/assets/${asset.id}`)
  if(!bytes.ok)throw new Error('Cannot rescore: a source asset is unavailable. Next: restore the missing asset in the source film.')
  const imported=await fetch(`${at}/__motioneer/projects/${fresh.id}/assets?name=${encodeURIComponent(asset.name)}`,{method:'POST',headers:{'content-type':bytes.headers.get('content-type')||'application/octet-stream'},body:Buffer.from(await bytes.arrayBuffer())}).then(r=>r.json())
  if(!imported.id)throw new Error('Cannot rescore: an asset could not be copied. Next: retry.')
  serialized=serialized.replaceAll(asset.id,imported.id)
 }
 copied=JSON.parse(serialized.replaceAll(`/__motioneer/projects/${projectId}/assets/`,`/__motioneer/projects/${fresh.id}/assets/`))
 const project=await withSoundtrack(copied,{at,style:'signature',music:identity,bpm:tempo,onStep})
 const saved=await fetch(`${at}/__motioneer/projects/${project.id}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(project)}),result=await saved.json()
 if(!saved.ok||result.error)throw new Error(`Cannot rescore: ${result.error||'the new take could not be saved'}. Next: retry.`)
 onStep('Rendering the same visual edit with its new music.')
 const rendered=await renderProject(at,project.id,onStep),cuts=[...new Set(visual.map(t=>t.start-from).filter(t=>t>0&&t<to-from))]
 const proved=await proveRender(rendered.url,{pace:'fast',seconds,cuts})
 const asset=project.assets.at(-1)
 return {projectId:project.id,sourceProjectId:source.id,at,seconds,fps:project.settings.fps,soundtrack:'signature',music:identity,bpm:tempo,file:proved.file,url:rendered.url,proof:proved.proof,audioUrl:`${at}/__motioneer/projects/${project.id}/assets/${asset.id}`,shotList:visual.map((t,i)=>({shot:i+1,at:(Math.max(from,t.start)-from)/1000,seconds:(Math.min(to,t.start+t.duration)-Math.max(from,t.start))/1000,elements:[t.name]}))}
}
