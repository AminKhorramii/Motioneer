import { useCallback, useRef, useState } from 'react'
import type { Project, Track } from './project'
import { newTrack } from './project'
import type { useProject } from './useProject'
import { Canvas } from './Canvas'
import { Timeline } from './Timeline'
import { Inspector } from './Inspector'
import type { InspectorContext } from './Inspector'
import { FilmLibrary } from './FilmLibrary'
import { FirstCut } from './FirstCut'
import { Icon } from './icons'
import { usePreference } from './interactions'
import { clamp } from './filmEditing'
import { resolvedStarts } from './filmMath'
import { importMedia } from './Media'
type Props={project:Project;state:ReturnType<typeof useProject>;selection:string[];select:(ids:string[])=>void;time:number;seek:(v:number)=>void;playing:boolean;toggle:()=>void;pause:()=>void;toMotion:()=>void;notify:(s:string)=>void}
export function FilmWorkspace({project,state,selection,select,time,seek,playing,toggle,pause,toMotion,notify}:Props){
  const {edit}=state,[context,setContext]=useState<InspectorContext>('film'),[cut,setCut]=useState(false),[comparison,setComparison]=useState(''),[importing,setImporting]=useState(false),[left,setLeft]=usePreference('library-open',true),[right,setRight]=usePreference('inspector-open',true),upload=useRef<HTMLInputElement>(null)
  const gesture={begin:state.begin,end:state.end}
  const choose=useCallback((ids:string[])=>{select(ids);if(ids.length){setContext('selection');setRight(true)}},[select,setRight])
  function focusClip(t:Track,ids:string[]){choose(ids);pause();const at=resolvedStarts(project)[project.tracks.indexOf(t)];if(time<at||time>=at+t.duration)seek(Math.min(at,project.settings.duration))}
  function add(t:Track,at=time){const start=clamp(at,0,Math.max(0,project.settings.duration-100)),next={...t,start,duration:Math.max(1,Math.min(t.duration,project.settings.duration-start))};edit(p=>({...p,tracks:[...p.tracks,next]}));choose([next.id]);seek(start)}
  function insert(id:string,at=time){const s=project.subjects.find(s=>s.id===id),a=project.assets.find(a=>a.id===id);if(s){const m=[...project.motions].reverse().find(m=>m.subjectId===s.id&&m.saved)||project.motions.find(m=>m.subjectId===s.id);add({...newTrack('component',s.name),subjectId:id,motionId:m?.id},at)}else if(a)add({...newTrack(a.kind,a.name),assetId:id,duration:a.kind==='audio'?a.duration||5000:5000},at)}
  function title(){add({...newTrack('title','Title'),text:'Your next great idea',x:10,y:35,width:80,height:25})}
  async function files(files:FileList|null){if(!files)return;setImporting(true);try{await state.flush();for(const file of Array.from(files)){const a=await importMedia(project,file);const start=clamp(time,0,project.settings.duration-100),track={...newTrack(a.kind,a.name,start),assetId:a.id,duration:Math.min(a.kind==='audio'?a.duration||5000:5000,project.settings.duration-start)};edit(p=>({...p,assets:[...p.assets,a],tracks:[...p.tracks,track]}));choose([track.id]);seek(start)}notify('Media imported and saved with the project.')}catch(e){notify((e as Error).message)}finally{setImporting(false);if(upload.current)upload.current.value=''}}
  function restore(id:string){const a=project.arrangements.find(a=>a.id===id);if(!a)return;edit(p=>({...p,tracks:structuredClone(a.tracks),camera:structuredClone(a.camera),settings:a.settings?{...a.settings}:p.settings}));setComparison('');select([]);seek(0)}
  const compared=project.arrangements.find(a=>a.id===comparison),other:Project|undefined=compared?{...project,tracks:compared.tracks,camera:compared.camera,settings:compared.settings||project.settings}:undefined
  const actions=<section className="library-actions"><button onClick={toMotion} title="Capture a component from your app"><Icon name="plus"/>Capture</button><button onClick={title} title="Add a title"><Icon name="type"/>Title</button><button disabled={importing} onClick={()=>upload.current?.click()} title="Import an image or sound"><Icon name="image"/>{importing?'Importing…':'Media'}</button></section>
  return <div className={'workspace film-workspace'+(!left?' library-collapsed':'')+(!right?' inspector-collapsed':'')}>
    <input hidden type="file" ref={upload} multiple accept="image/png,image/jpeg,image/webp,audio/*" onChange={e=>void files(e.target.files)}/>
    {left&&<FilmLibrary project={project} edit={edit} insert={insert} actions={actions} firstCut={()=>{pause();setCut(true)}} comparison={comparison} compare={id=>{pause();setComparison(id)}} restore={restore}/>}
    <main className="film-center"><div className="film-toolbar"><button className="icon-button" aria-label={left?'Collapse library':'Show library'} title={left?'Collapse library':'Show library'} onClick={()=>setLeft(!left)}><Icon name="layers"/></button><span className="muted">{comparison?'Compare arrangements':''}</span><div className="row"><button className={'icon-button'+(context==='camera'&&right?' active':'')} aria-label="Camera" title="Camera" onClick={()=>{setContext('camera');setRight(true)}}><Icon name="camera"/></button><button className={'icon-button'+(context==='film'&&right?' active':'')} aria-label="Film settings" title="Film settings" onClick={()=>{setContext('film');setRight(true)}}><Icon name="sliders"/></button><button className="icon-button" aria-label={right?'Collapse inspector':'Show inspector'} title={right?'Collapse inspector':'Show inspector'} onClick={()=>setRight(!right)}><Icon name="minimize"/></button></div></div>
      <div className={'canvases'+(other?' comparing':'')}><Canvas key={project.id} project={project} time={time} playing={playing} selection={selection} select={choose} edit={edit} gesture={gesture} pause={pause} label={other?'Current cut':''} empty={<div className="empty-actions">{actions}{project.motions.some(m=>m.saved)&&<button onClick={()=>setCut(true)}><Icon name="sparkles"/>Create first cut</button>}</div>}/>{other&&<Canvas key={comparison} project={other} time={time} playing={false} selection={[]} select={()=>{}} edit={()=>{}} gesture={{begin:()=>{},end:()=>{}}} pause={()=>{}} compare label={compared!.name}/>}</div>
      <Timeline project={project} time={time} seek={seek} playing={playing} toggle={toggle} selection={selection} select={choose} focusClip={focusClip} edit={edit} gesture={gesture} insert={insert}/>
    </main>{right&&<Inspector project={project} selection={selection} time={time} edit={edit} gesture={gesture} pause={pause} context={context} setContext={setContext} seek={seek} select={choose}/>}
    {cut&&<FirstCut project={project} edit={edit} close={()=>setCut(false)} done={()=>{select([]);seek(0);setComparison('');notify('First cut created. Select a clip to make it yours.')}}/>}
  </div>
}
