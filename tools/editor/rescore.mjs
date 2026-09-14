/** A new musical take preserves the complete visual edit and leaves the source project alone. */
import {resolve} from '../../shared/arrange.mjs'
import {MUSIC,musicPlan} from './music.mjs'
import {withSoundtrack} from './soundtrack.mjs'
import {renderProject,proveRender} from './autofilm.mjs'
import {newTrack} from '../../dist-core/core.js'
import {readScoreFile} from './score-file.mjs'
export async function createRescoreTake({at,projectId,music,direction='',bpm,audioFile,replaceAudioTrackIds=[],onStep=()=>{}}){
 if(!projectId)throw new Error('Cannot rescore: a source film is needed. Next: pass its projectId.')
 if(audioFile!==undefined&&(music||direction))throw new Error('Cannot rescore: audioFile cannot be combined with a synthesized music direction. Next: choose audioFile or music and direction.')
 if(music&&!MUSIC[music])throw new Error('Cannot rescore: that music profile is unknown. Next: choose one of the listed identities.')
 const response=await fetch(`${at}/__motioneer/projects/${projectId}`)
 if(!response.ok)throw new Error('Cannot rescore: the source film was not found. Next: use a projectId from this studio.')
 const source=await response.json(),from=source.settings.from,to=source.settings.to,seconds=(to-from)/1000
 if(!source.tracks.some(t=>t.kind!=='audio'&&!t.hidden))throw new Error('Cannot rescore: the source film has no visible tracks. Next: create a film first.')
 if(bpm!==undefined&&(!Number.isFinite(bpm)||bpm<40||bpm>400))throw new Error('Cannot rescore: tempo must be 40 to 400 BPM. Next: choose a valid tempo.')
 if(!Array.isArray(replaceAudioTrackIds)||replaceAudioTrackIds.some(id=>typeof id!=='string'||!source.tracks.some(t=>t.id===id&&t.kind==='audio')))throw new Error('Cannot rescore: replaceAudioTrackIds must identify existing audio tracks in the source project. Next: use audio track IDs from that project.')
 // Validate and decode before creating a take, so a bad file cannot leave a partial project.
 const importedScore=audioFile!==undefined?await readScoreFile(audioFile,seconds):null
 const starts=resolve({cars:source.tracks.map(t=>({key:t.id,at:t.start,after:t.after,motion:{ms:t.duration}}))}).at
 const visual=source.tracks.map((t,i)=>({...t,start:starts[i]})).filter(t=>t.kind!=='audio'&&!t.hidden&&t.start<to&&t.start+t.duration>from).sort((a,b)=>a.start-b.start)
 if(!visual.length)throw new Error('Cannot rescore: no visual tracks overlap the export range. Next: choose a range containing the film.')
 const tempo=importedScore?(bpm??null):bpm||Math.max(70,Math.min(180,60000/Math.max(300,Math.min(...visual.map(t=>t.duration)))))
 let raw={profile:music}
 if(direction){
  onStep('Composing a musical identity for the existing edit.')
  const reply=await fetch(`${at}/__motioneer/ask`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({system:'You compose short original instrumental phrases for motion films. Return JSON only.',prompt:`Score ${source.name}, ${seconds}s at ${tempo} BPM. Direction: ${direction.slice(0,1800)}. Profiles: ${Object.entries(MUSIC).map(([id,p])=>id+': '+p.description).join('; ')}. ${music?'Required profile: '+music+'.':''} Return {profile,root,motif}: MIDI root 36 to 59, motif 4 to 12 scale degree indices 0 to 14. Make a memorable phrase with repetition and an answer. Harmony, drums, orchestration and the final cadence follow the profile and the existing cut.`,json:true})}).then(r=>r.json())
  if(!reply.json)throw new Error(`Cannot rescore: ${reply.error||'the composer returned no phrase'}. Next: retry the music direction.`)
  raw={...reply.json,...(music?{profile:music}:{})}
 }
 const identity=importedScore?{profile:'imported',label:importedScore.name.replace(/\.wav$/i,''),description:'A supplied soundtrack, trimmed to the export range without looping, stretching or changing its gain.'}:musicPlan(raw,source.name+' '+direction)
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
 copied.tracks=copied.tracks.filter(t=>!replaceAudioTrackIds.includes(t.id))
 let project
 if(importedScore){
  onStep('Importing the finished soundtrack into the new take.')
  copied=await withSoundtrack(copied,{at,style:'none'})
  const response=await fetch(`${at}/__motioneer/projects/${copied.id}/assets?name=${encodeURIComponent(importedScore.name)}`,{method:'POST',headers:{'content-type':'audio/wav'},body:importedScore.data}),asset=await response.json()
  if(!response.ok||!asset.id)throw new Error('Cannot rescore: the supplied soundtrack could not be imported. Next: retry.')
  project={...copied,assets:[...copied.assets,{...asset,duration:importedScore.duration,waveform:importedScore.waveform}],tracks:[...copied.tracks,{...newTrack('audio',importedScore.name,from),assetId:asset.id,duration:to-from,sourceStart:0,volume:1,fadeIn:0,fadeOut:0}]}
 }else project=await withSoundtrack(copied,{at,style:'signature',music:identity,bpm:tempo,onStep})
 const saved=await fetch(`${at}/__motioneer/projects/${project.id}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(project)}),result=await saved.json()
 if(!saved.ok||result.error)throw new Error(`Cannot rescore: ${result.error||'the new take could not be saved'}. Next: retry.`)
 return {project:result,source,visual,identity,tempo,soundtrack:importedScore?'imported':'signature'}
}

export async function rescoreFilm(options){
 const {at,onStep=()=>{}}=options,{project,source,visual,identity,tempo,soundtrack}=await createRescoreTake(options)
 const from=source.settings.from,to=source.settings.to,seconds=(to-from)/1000
 onStep('Rendering the same visual edit with its new music.')
 const rendered=await renderProject(at,project.id,onStep),cuts=[...new Set(visual.map(t=>t.start-from).filter(t=>t>0&&t<to-from))]
 const proved=await proveRender(rendered.url,{pace:'fast',seconds,cuts})
 const asset=project.assets.at(-1)
 return {projectId:project.id,sourceProjectId:source.id,at,seconds,fps:project.settings.fps,soundtrack,music:identity,bpm:tempo,file:proved.file,url:rendered.url,proof:proved.proof,audioUrl:`${at}/__motioneer/projects/${project.id}/assets/${asset.id}`,shotList:visual.map((t,i)=>({shot:i+1,at:(Math.max(from,t.start)-from)/1000,seconds:(Math.min(to,t.start+t.duration)-Math.max(from,t.start))/1000,elements:[t.name]}))}
}
