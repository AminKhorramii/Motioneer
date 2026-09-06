import { useRef, useState } from 'react'
import type { Project, Track } from './project'
import type { Edit } from './useProject'
import { Icon } from './icons'
// The legacy solver is the source of truth for linked starts, including cycle handling.
// @ts-expect-error The existing arithmetic module is JavaScript.
import { resolve } from '../../shared/arrange.mjs'
export function resolvedStarts(project:Project):number[]{return resolve({cars:project.tracks.map(t=>({key:t.id,at:t.start,after:t.after,motion:{ms:t.duration},tune:null}))}).at}
export function Timeline({project,time,seek,playing,toggle,selection,select,edit,begin}:{project:Project;time:number;seek:(t:number)=>void;playing:boolean;toggle:()=>void;selection:string[];select:(ids:string[])=>void;edit:Edit;begin:()=>void}) {
  const [zoom,setZoom]=useState(1),[height,setHeight]=useState(250), scroll=useRef<HTMLDivElement>(null), ruler=useRef<HTMLDivElement>(null)
  const duration=project.settings.duration, at=resolvedStarts(project), percent=(n:number)=>n/duration*100
  const tick=duration<=15000?1000:duration<=60000?5000:10000
  function drag(e:React.PointerEvent,t:Track,edge?:'left'|'right') {
    if(t.locked)return;e.stopPropagation();e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId)
    const ids=selection.includes(t.id)?selection:[t.id];select(ids);begin();const start=e.clientX, w=ruler.current!.getBoundingClientRect().width, original=project.tracks, index=original.indexOf(t)
    const move=(v:PointerEvent)=>{let delta=(v.clientX-start)/w*duration;const landmarks=[0,time,...at,...original.map((tr,i)=>at[i]+tr.duration)];const snap=landmarks.find(n=>Math.abs(n-(at[index]+delta))<duration/w*7);delta=snap===undefined?Math.round(delta/10)*10:snap-at[index]
      if(edge){const bound=edge==='left'?Math.max(-t.start,Math.min(t.duration-100,delta)):Math.max(100-t.duration,Math.min(duration-at[index]-t.duration,delta));edit(p=>({...p,tracks:p.tracks.map(n=>n.id===t.id?{...n,start:t.start+(edge==='left'?bound:0),duration:t.duration+(edge==='left'?-bound:bound),sourceStart:t.sourceStart+(edge==='left'&&t.kind==='audio'?bound:0)}:n)}),false)}
      else {const movable=original.filter(n=>ids.includes(n.id)&&!n.locked);const min=Math.min(...movable.map(n=>at[original.indexOf(n)])),max=Math.max(...movable.map(n=>at[original.indexOf(n)]+n.duration));delta=Math.max(-min,Math.min(duration-max,delta));edit(p=>({...p,tracks:p.tracks.map(n=>{const o=original.find(o=>o.id===n.id)!;return ids.includes(n.id)&&!n.locked?{...n,start:o.start+delta,after:o.after?{...o.after,gap:o.after.gap+delta}:undefined}:n})}),false)} }
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up)};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true})
  }
  function resize(e:React.PointerEvent){e.preventDefault();const y=e.clientY,h=height;const move=(v:PointerEvent)=>setHeight(Math.max(170,Math.min(window.innerHeight*.55,h+y-v.clientY)));const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up)};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true})}
  return <section className="timeline" style={{height}} aria-label="Film timeline">
    <div role="separator" aria-label="Resize timeline" aria-orientation="horizontal" className="timeline-resize" onPointerDown={resize}/>
    <div className="transport"><div className="transport-controls"><button className="icon-button" aria-label="Back to start" title="Back to start" onClick={()=>seek(0)}><Icon name="skip-back"/></button><button className="icon-button play" aria-label={playing?'Pause':'Play'} title={playing?'Pause (space)':'Play (space)'} onClick={toggle}><Icon name={playing?'pause':'play'}/></button><button className="icon-button" aria-label="Step one frame" title="Step one frame" onClick={()=>seek(Math.min(duration,time+1000/project.settings.fps))}><Icon name="skip-forward"/></button><span className="timecode">{(time/1000).toFixed(2)} <small>/ {(duration/1000).toFixed(1)} s</small></span></div><div className="row"><button className="icon-button" aria-label="Zoom out timeline" title="Zoom out" onClick={()=>setZoom(Math.max(1,zoom-.5))}><Icon name="zoom-out"/></button><span>{Math.round(zoom*100)}%</span><button className="icon-button" aria-label="Zoom in timeline" title="Zoom in" onClick={()=>setZoom(Math.min(8,zoom+.5))}><Icon name="zoom-in"/></button><button onClick={()=>setZoom(1)}>Fit</button></div></div>
    <div className="timeline-scroll" ref={scroll}><div className="timeline-content" style={{width:`max(100%, ${zoom*100}%)`}}>
      <div className="timeline-ruler"><div className="track-label" title="Layers"><Icon name="layers"/><small>{project.tracks.length}</small></div><div className="ruler" ref={ruler} onPointerDown={e=>{const r=e.currentTarget.getBoundingClientRect();seek(Math.max(0,Math.min(duration,(e.clientX-r.left)/r.width*duration)))}}>{Array.from({length:Math.floor(duration/tick)+1},(_,i)=><span key={i} style={{left:percent(i*tick)+'%'}}>{i*tick/1000}s</span>)}<i className="playhead" style={{left:percent(time)+'%'}}/></div></div>
      {project.tracks.map((t,i)=><div key={t.id} className={'track-row'+(selection.includes(t.id)?' selected':'')+(t.hidden?' hidden-track':'')}>
        <button className="track-label" onClick={e=>select(e.metaKey||e.shiftKey?[...new Set([...selection,t.id])]:[t.id])}><span className={'kind '+t.kind}><Icon name={t.kind==='component'?'box':t.kind==='audio'?'music':t.kind==='title'?'type':'image'}/></span><span className="truncate">{t.name}</span>{t.locked&&<small title="Locked"><Icon name="lock"/></small>}</button>
        <div className="track-lane" onPointerDown={e=>{if(e.target!==e.currentTarget)return;const r=e.currentTarget.getBoundingClientRect();seek((e.clientX-r.left)/r.width*duration)}}><div tabIndex={0} role="button" aria-label={`${t.name} clip`} className={'clip '+t.kind} style={{left:percent(at[i])+'%',width:percent(t.duration)+'%'}} onPointerDown={e=>drag(e,t)} onFocus={()=>select([t.id])}>
          <i role="button" aria-label={`Trim start of ${t.name}`} className="trim left" onPointerDown={e=>drag(e,t,'left')}/><span>{t.name}</span>{t.kind==='audio'&&<svg className="waveform" viewBox="0 0 400 32" preserveAspectRatio="none">{(project.assets.find(a=>a.id===t.assetId)?.waveform||[]).map((n,k,a)=><line key={k} x1={k/a.length*400} x2={k/a.length*400} y1={16-n*15} y2={16+n*15}/>)}</svg>}<i role="button" aria-label={`Trim end of ${t.name}`} className="trim right" onPointerDown={e=>drag(e,t,'right')}/>
        </div><i className="lane-playhead" style={{left:percent(time)+'%'}}/></div>
      </div>)}
      {!project.tracks.length&&<p className="timeline-empty">Your components, titles, and sound will appear here.</p>}
    </div></div>
  </section>
}
