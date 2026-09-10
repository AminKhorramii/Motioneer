import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Project, Track } from './project'
import type { Edit } from './useProject'
import { Icon } from './icons'
import { resolvedStarts } from './filmMath'
import { clamp, clipRows, moveClips, nearestSnap, selectIds, trimClip } from './filmEditing'
import { pointerGesture, usePreference } from './interactions'
import type { Gesture } from './interactions'
import { Thumbnail } from './FilmLibrary'
export { resolvedStarts } from './filmMath'
type Props={project:Project;time:number;seek:(t:number)=>void;playing:boolean;toggle:()=>void;selection:string[];select:(ids:string[])=>void;focusClip:(t:Track,ids:string[])=>void;edit:Edit;gesture:Gesture;insert:(id:string,at:number)=>void}
export function Timeline({project,time,seek,playing,toggle,selection,focusClip,edit,gesture,insert}:Props) {
  const [zoom,setZoom]=usePreference('timeline-zoom',1),[height,setHeight]=usePreference('timeline-height',280),[view,setView]=usePreference<'clips'|'layers'>('timeline-view','clips')
  const [details,setDetails]=useState(false),[frozen,setFrozen]=useState<string[][]|null>(null),[snap,setSnap]=useState<number>(),[width,setWidth]=useState(600)
  const scroll=useRef<HTMLDivElement>(null),ruler=useRef<HTMLDivElement>(null),zoomAnchor=useRef<number|null>(null),[draft,setDraft]=useState<string|null>(null),cancelTimecode=useRef(false)
  const duration=project.settings.duration,at=resolvedStarts(project),percent=(n:number)=>n/duration*100,rows=frozen||clipRows(project,view),frame=1000/project.settings.fps
  const tick=[100,200,500,1000,2000,5000,10000,15000,30000,60000].find(n=>n/duration*width>=64)||60000
  useEffect(()=>{if(!ruler.current)return;const observer=new ResizeObserver(([e])=>setWidth(e.contentRect.width));observer.observe(ruler.current);return()=>observer.disconnect()},[])
  useLayoutEffect(()=>{if(zoomAnchor.current===null||!scroll.current||!ruler.current)return;const r=ruler.current.getBoundingClientRect(),s=scroll.current.getBoundingClientRect();scroll.current.scrollLeft+=r.left-s.left+time/duration*r.width-zoomAnchor.current;zoomAnchor.current=null},[zoom,time,duration])
  useEffect(()=>{if(!playing||!scroll.current||!ruler.current)return;const r=ruler.current.getBoundingClientRect(),s=scroll.current.getBoundingClientRect(),x=r.left+time/duration*r.width;if(x>s.right-32||x<Math.max(s.left,r.left)+12)scroll.current.scrollLeft+=x-(s.left+s.width*.45)},[time,playing,duration])
  function changeZoom(next:number){if(scroll.current&&ruler.current){const s=scroll.current.getBoundingClientRect(),r=ruler.current.getBoundingClientRect();zoomAnchor.current=clamp(r.left-s.left+time/duration*r.width,180,s.width-32)}setZoom(clamp(next,1,8))}
  function choose(t:Track,e:{shiftKey?:boolean;metaKey?:boolean;ctrlKey?:boolean},preserve=false){const ids=preserve&&selection.includes(t.id)&&!e.shiftKey&&!e.metaKey&&!e.ctrlKey?selection:selectIds(selection,t.id,e);focusClip(t,ids);return ids}
  function scrub(e:React.PointerEvent){if(!ruler.current)return;const r=ruler.current.getBoundingClientRect(),read=(x:number)=>seek(clamp((x-r.left)/r.width*duration,0,duration));read(e.clientX);pointerGesture(e,{begin:()=>{},end:cancel=>{if(cancel)seek(time)}},v=>read(v.clientX))}
  function drag(e:React.PointerEvent,t:Track,edge?:'left'|'right'){
    e.stopPropagation();const ids=choose(t,e,true);if(t.locked||!ids.includes(t.id)||e.metaKey||e.ctrlKey||e.shiftKey)return
    const x=e.clientX,w=ruler.current!.getBoundingClientRect().width,index=project.tracks.indexOf(t),origin=at[index]+(edge==='right'?t.duration:0)
    const moving=edge?[t.id]:ids,landmarks=[0,duration,time,...project.tracks.flatMap((n,i)=>moving.includes(n.id)?[]:[at[i],at[i]+n.duration])]
    setFrozen(rows)
    pointerGesture(e,gesture,v=>{
      const raw=(v.clientX-x)/w*duration
      const candidates=(edge?[origin]:[origin,origin+t.duration]).map(edgeAt=>({edgeAt,target:v.altKey?undefined:nearestSnap(edgeAt+raw,landmarks,duration/w*7)})).filter(c=>c.target!==undefined).sort((a,b)=>Math.abs(a.target!-a.edgeAt-raw)-Math.abs(b.target!-b.edgeAt-raw))
      const match=candidates[0],target=match?.target,delta=match?target!-match.edgeAt:raw
      const next=edge?trimClip(project,t.id,edge,delta):moveClips(project,ids,delta)
      const actual=resolvedStarts(next)[index]+(edge==='right'||(!edge&&match?.edgeAt===origin+t.duration)?next.tracks[index].duration:0)
      setSnap(target!==undefined&&Math.abs(actual-target)<.01?target:undefined);edit(()=>next,false)
    },()=>{setFrozen(null);setSnap(undefined)})
  }
  function boundary(dir:number){const points=[0,duration,...at,...project.tracks.map((t,i)=>at[i]+t.duration)].sort((a,b)=>a-b);seek(dir<0?[...points].reverse().find(n=>n<time-.01)??0:points.find(n=>n>time+.01)??duration)}
  function keyClip(e:React.KeyboardEvent,t:Track,edge?:'left'|'right'){
    if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();choose(t,e);return}
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();const delta=(e.key==='ArrowLeft'?-1:1)*frame*(e.shiftKey?10:1);edit(p=>edge?trimClip(p,t.id,edge,delta):moveClips(p,selection.includes(t.id)?selection:[t.id],delta))}
  }
  const movements=[...project.camera.map((m,i)=>({m,name:`Camera ${i+1}`})),...project.tracks.filter(t=>selection.includes(t.id)).flatMap(t=>t.moves.map((m,i)=>({m,name:`${t.name} move ${i+1}`})))]
  return <section className="timeline" style={{height:clamp(height,190,window.innerHeight*.55)}} aria-label="Film timeline">
    <div role="separator" tabIndex={0} aria-label="Resize timeline" aria-orientation="horizontal" aria-valuenow={height} className="timeline-resize" onKeyDown={e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();setHeight(clamp(height+(e.key==='ArrowUp'?20:-20),190,window.innerHeight*.55))}}} onPointerDown={e=>{const y=e.clientY,h=height;pointerGesture(e,{begin:()=>{},end:cancel=>{if(cancel)setHeight(h)}},v=>setHeight(clamp(h+y-v.clientY,190,window.innerHeight*.55)))}}/>
    <div className="transport"><div className="transport-controls">
      <button className="icon-button" aria-label="Back to start" title="Back to start" onClick={()=>seek(0)}><Icon name="skip-back"/></button>
      <button className="icon-button boundary-control" aria-label="Previous clip boundary" title="Previous clip boundary" onClick={()=>boundary(-1)}><Icon name="arrow-left"/></button>
      <button className="icon-button" aria-label="Previous frame" title="Previous frame" onClick={()=>seek(Math.max(0,time-frame))}><Icon name="arrow-left"/></button>
      <button className="icon-button play" aria-label={playing?'Pause':'Play'} title="Play or pause (space)" onClick={toggle}><Icon name={playing?'pause':'play'}/></button>
      <button className="icon-button" aria-label="Step one frame" title="Next frame" onClick={()=>seek(Math.min(duration,time+frame))}><Icon name="arrow-right"/></button>
      <button className="icon-button boundary-control" aria-label="Next clip boundary" title="Next clip boundary" onClick={()=>boundary(1)}><Icon name="skip-forward"/></button>
      <label className="timecode"><input aria-label="Playhead time (s)" value={draft??(time/1000).toFixed(2)} onFocus={()=>{cancelTimecode.current=false;setDraft((time/1000).toFixed(2))}} onChange={e=>setDraft(e.target.value)} onBlur={()=>{if(!cancelTimecode.current&&draft!==null&&draft.trim()&&Number.isFinite(Number(draft)))seek(clamp(Number(draft)*1000,0,duration));setDraft(null)}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){cancelTimecode.current=true;setDraft(null);e.currentTarget.blur()}}}/><small>/ {(duration/1000).toFixed(1)} s</small></label>
    </div><div className="timeline-options"><div className="tabs" aria-label="Timeline view">{(['clips','layers'] as const).map(v=><button key={v} aria-pressed={view===v} className={view===v?'active':''} onClick={()=>setView(v)}>{v==='clips'?'Clips':'Layers'}</button>)}</div>
      <button className={'icon-button'+(details?' active':'')} aria-label="Show movement timing" aria-pressed={details} title="Show camera and selected layer movement" onClick={()=>setDetails(!details)}><Icon name="curve"/></button>
      <button className="icon-button" aria-label="Zoom out timeline" title="Zoom out" disabled={zoom<=1} onClick={()=>changeZoom(zoom-.5)}><Icon name="zoom-out"/></button><span className="zoom-value">{Math.round(zoom*100)}%</span><button className="icon-button" aria-label="Zoom in timeline" title="Zoom in" disabled={zoom>=8} onClick={()=>changeZoom(zoom+.5)}><Icon name="zoom-in"/></button><button onClick={()=>changeZoom(1)}>Fit</button>
    </div></div>
    <div className="timeline-scroll" ref={scroll}><div className="timeline-content" style={{width:`${zoom*100}%`}}>
      <div className="timeline-ruler"><div className="track-label"><Icon name="layers"/><small>{project.tracks.length}</small></div><div className="ruler" ref={ruler} role="slider" tabIndex={0} aria-label="Playhead" aria-valuemin={0} aria-valuemax={duration/1000} aria-valuenow={time/1000} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();seek(e.key==='Home'?0:e.key==='End'?duration:clamp(time+(e.key==='ArrowLeft'?-frame:frame)*(e.shiftKey?10:1),0,duration))}}} onPointerDown={scrub}>{Array.from({length:Math.floor(duration/tick)+1},(_,i)=><span key={i} style={{left:percent(i*tick)+'%'}}>{i*tick/1000}s</span>)}<i className="playhead" style={{left:percent(time)+'%'}}/></div></div>
      {rows.map((ids,row)=>{const tracks=ids.map(id=>project.tracks.find(t=>t.id===id)!).filter(Boolean),one=view==='layers'?tracks[0]:undefined;return <div key={row} className={'track-row'+(ids.some(id=>selection.includes(id))?' selected':'')}>
        {one?<button className="track-label" onClick={e=>choose(one,e)}><Icon name={one.kind==='audio'?'music':one.kind==='title'?'type':'box'}/><span className="truncate">{one.name}</span>{one.locked&&<Icon name="lock"/>}</button>:<div className="track-label"><Icon name={tracks[0]?.kind==='audio'?'music':'film'}/><span>{tracks[0]?.kind==='audio'?'Audio':'Visual'} {rows.slice(0,row+1).filter(ids=>(project.tracks.find(t=>t.id===ids[0])?.kind==='audio')===(tracks[0]?.kind==='audio')).length}</span></div>}
        <div className="track-lane" onPointerDown={e=>{if(e.target===e.currentTarget)scrub(e)}} onDragOver={e=>{if(e.dataTransfer.types.includes('application/x-motioneer-asset')){e.preventDefault();e.dataTransfer.dropEffect='copy'}}} onDrop={e=>{e.preventDefault();const r=ruler.current!.getBoundingClientRect();insert(e.dataTransfer.getData('application/x-motioneer-asset'),clamp((e.clientX-r.left)/r.width*duration,0,duration))}}>
          {tracks.map(t=>{const i=project.tracks.indexOf(t),wide=t.duration/duration*width>110;return <div key={t.id} data-track-id={t.id} tabIndex={0} role="button" aria-pressed={selection.includes(t.id)} aria-label={`${t.name} clip`} className={'clip '+t.kind+(selection.includes(t.id)?' selected':'')+(t.hidden?' hidden-track':'')+(t.locked?' locked':'')} style={{left:percent(at[i])+'%',width:percent(t.duration)+'%'}} onPointerDown={e=>drag(e,t)} onKeyDown={e=>keyClip(e,t)}>
            <i role="button" tabIndex={t.locked?-1:0} aria-label={`Trim start of ${t.name}`} className="trim left" onPointerDown={e=>drag(e,t,'left')} onKeyDown={e=>keyClip(e,t,'left')}/>
            {wide&&t.kind!=='audio'&&t.kind!=='title'&&<Thumbnail project={project} id={t.subjectId||t.assetId||''}/>}
            <span>{t.kind==='title'?t.text||t.name:t.name}</span>{t.locked&&<Icon name="lock"/>}
            {t.kind==='audio'&&<svg className="waveform" viewBox="0 0 400 32" preserveAspectRatio="none">{(()=>{const a=project.assets.find(a=>a.id===t.assetId),wave=a?.waveform||[],total=a?.duration||t.duration;return wave.map((n,k)=>{const x=(k/wave.length*total-t.sourceStart)/t.duration*400;return x<0||x>400?null:<line key={k} x1={x} x2={x} y1={16-n*15} y2={16+n*15}/>})})()}</svg>}
            <i role="button" tabIndex={t.locked?-1:0} aria-label={`Trim end of ${t.name}`} className="trim right" onPointerDown={e=>drag(e,t,'right')} onKeyDown={e=>keyClip(e,t,'right')}/>
          </div>})}<i className="lane-playhead" style={{left:percent(time)+'%'}}/>{snap!==undefined&&<i className="snap-line" style={{left:percent(snap)+'%'}}/>}
        </div></div>})}
      {details&&movements.map(({m,name},i)=><div className="movement-row track-row" key={name+i}><div className="track-label"><Icon name="curve"/><span className="truncate">{name}</span></div><div className="track-lane"><button className="movement-span" aria-label={`Go to ${name}`} style={{left:percent(m.at)+'%',width:percent(m.duration)+'%'}} onClick={()=>seek(m.at)}>{(m.duration/1000).toFixed(1)}s</button></div></div>)}
      {!project.tracks.length&&<div className="timeline-empty" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();insert(e.dataTransfer.getData('application/x-motioneer-asset'),time)}}>Drop a component or media here to add it to the film.</div>}
    </div></div>
  </section>
}
