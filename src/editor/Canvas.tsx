import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Project, Track } from './project'
import type { Edit } from './useProject'
import { compositionDocument } from './composition'
import { filmMath, resolvedStarts } from './filmMath'
import { clamp, nearestSnap, selectIds } from './filmEditing'
import { pointerGesture, usePreference } from './interactions'
import type { Gesture } from './interactions'
import { Icon } from './icons'
type Props={project:Project;time:number;playing:boolean;selection:string[];select:(ids:string[])=>void;edit:Edit;gesture:Gesture;pause:()=>void;compare?:boolean;label?:string;empty?:ReactNode}
export function Canvas({project,time,playing,selection,select,edit,gesture,pause,compare=false,label='',empty}:Props) {
  const frame=useRef<HTMLIFrameElement>(null),box=useRef<HTMLDivElement>(null),[size,setSize]=useState({w:600,h:400}),[guides,setGuides]=useState<{x?:number;y?:number}>({})
  const [zoom,setZoom]=usePreference<number>('canvas-zoom',1),initial=useRef(project),html=useMemo(()=>compositionDocument(initial.current),[])
  useEffect(()=>{const node=box.current;if(!node)return;const observer=new ResizeObserver(([entry])=>setSize({w:entry.contentRect.width,h:entry.contentRect.height}));observer.observe(node);return()=>observer.disconnect()},[])
  const fit=Math.max(.01,Math.min((size.w-64)/project.settings.width,(size.h-90)/project.settings.height)),scale=fit*(compare?1:clamp(zoom,.5,4)),at=resolvedStarts(project)
  useEffect(()=>{frame.current?.contentWindow?.__composition?.update(project)},[project])
  useEffect(()=>{void frame.current?.contentWindow?.__composition?.seek(time,playing)},[time,playing])
  useEffect(()=>{const handler=(e:MessageEvent)=>{if(compare||e.source!==frame.current?.contentWindow||e.data?.motioneer!=='select-track')return;pause();box.current?.focus({preventScroll:true});select(e.data.id?selectIds(selection,e.data.id,{shiftKey:e.data.shift,metaKey:e.data.toggle}):[])};window.addEventListener('message',handler);return()=>window.removeEventListener('message',handler)},[selection,select,pause,compare])
  function drag(e:React.PointerEvent,t:Track,resize=false){
    e.stopPropagation();pause();if(compare)return
    if(e.shiftKey||e.metaKey||e.ctrlKey){select(selectIds(selection,t.id,e));return}
    const ids=selection.includes(t.id)?selection:[t.id];select(ids);if(t.locked)return
    const x=e.clientX,y=e.clientY,g=filmMath.geometry(project,t,time,at[project.tracks.indexOf(t)]),w=project.settings.width,h=project.settings.height
    pointerGesture(e,gesture,v=>{
      let dx=(v.clientX-x)/scale/g.cameraScale,dy=(v.clientY-y)/scale/g.cameraScale
      if(resize){
        const move=filmMath.position(t.moves,time),rx=1+(v.clientX-x)/scale/g.width,ry=1+(v.clientY-y)/scale/g.height,ratio=clamp(Math.abs(rx-1)>Math.abs(ry-1)?rx:ry,Math.max(1/t.width,1/t.height),Math.min(300/t.width,300/t.height))
        const dw=t.width*(ratio-1),dh=t.height*(ratio-1)
        // Keep the displayed top-left fixed, including the move's scale and translation.
        edit(p=>({...p,tracks:p.tracks.map(n=>n.id===t.id?{...n,width:t.width*ratio,height:t.height*ratio,x:clamp(t.x-dw*((1-move.scale)/2+move.x/100),-300,300),y:clamp(t.y-dh*((1-move.scale)/2+move.y/100),-300,300)}:n)}),false)
      }else{
        const left=g.x+dx*g.cameraScale,top=g.y+dy*g.cameraScale
        const xs=[0,w/2,w],ys=[0,h/2,h],threshold=7/scale
        let gx:number|undefined,gy:number|undefined
        if(!v.altKey){
          const nx=[left,left+g.width/2,left+g.width].map(n=>({n,target:nearestSnap(n,xs,threshold)})).filter(v=>v.target!==undefined).sort((a,b)=>Math.abs(a.target!-a.n)-Math.abs(b.target!-b.n))[0]
          const ny=[top,top+g.height/2,top+g.height].map(n=>({n,target:nearestSnap(n,ys,threshold)})).filter(v=>v.target!==undefined).sort((a,b)=>Math.abs(a.target!-a.n)-Math.abs(b.target!-b.n))[0]
          if(nx){dx+=(nx.target!-nx.n)/g.cameraScale;gx=nx.target}
          if(ny){dy+=(ny.target!-ny.n)/g.cameraScale;gy=ny.target}
        }
        const movable=project.tracks.filter(n=>ids.includes(n.id)&&!n.locked&&n.kind!=='audio')
        const px=clamp(dx/w*100,Math.max(...movable.map(n=>-300-n.x)),Math.min(...movable.map(n=>300-n.x))),py=clamp(dy/h*100,Math.max(...movable.map(n=>-300-n.y)),Math.min(...movable.map(n=>300-n.y)))
        setGuides({x:gx,y:gy});edit(p=>({...p,tracks:p.tracks.map(n=>{const old=project.tracks.find(o=>o.id===n.id)!;return ids.includes(n.id)&&!n.locked&&n.kind!=='audio'?{...n,x:old.x+px,y:old.y+py}:n})}),false)
      }
    },()=>setGuides({}))
  }
  return <div className="canvas-area" ref={box} tabIndex={-1} role="region" aria-label={label||'Film stage'} onPointerDown={()=>{if(!compare)select([])}}>
    <div className="canvas-metadata"><span>{label}</span><span>{project.settings.width} × {project.settings.height} · {Math.round(scale*100)}%</span></div>
    {!compare&&<div className="canvas-zoom" onPointerDown={e=>e.stopPropagation()}><button className="icon-button" aria-label="Zoom out canvas" title="Zoom out canvas" disabled={zoom<=.5} onClick={()=>setZoom(clamp(zoom-.25,.5,4))}><Icon name="zoom-out"/></button><button onClick={()=>setZoom(1)} aria-label="Fit canvas">Fit</button><button className="icon-button" aria-label="Zoom in canvas" title="Zoom in canvas" disabled={zoom>=4} onClick={()=>setZoom(clamp(zoom+.25,.5,4))}><Icon name="zoom-in"/></button></div>}
    <div className="canvas-viewport"><div className="canvas-frame" style={{width:project.settings.width*scale,height:project.settings.height*scale}}>
      <iframe title={compare?'Arrangement canvas':'Film canvas'} ref={frame} srcDoc={html} style={{width:project.settings.width,height:project.settings.height,transform:`scale(${scale})`}} onLoad={()=>{frame.current?.contentWindow?.__composition?.update(project);void frame.current?.contentWindow?.__composition?.seek(time,playing)}}/>
      {!compare&&project.tracks.filter(t=>t.kind!=='audio'&&selection.includes(t.id)).map(t=>{const g=filmMath.geometry(project,t,time,at[project.tracks.indexOf(t)]);return !g.active?null:<div key={t.id} data-selection-id={t.id} className={'selection-box'+(t.locked?' locked':'')} style={{left:g.x*scale,top:g.y*scale,width:g.width*scale,height:g.height*scale}} onPointerDown={e=>drag(e,t)}><span>{t.name}{t.locked?' · Locked':''}</span>{!t.locked&&<button aria-label="Resize selected element" className="resize-handle" onPointerDown={e=>drag(e,t,true)}/>}</div>})}
      {guides.x!==undefined&&<i className="guide vertical" style={{left:guides.x*scale}}/>}{guides.y!==undefined&&<i className="guide horizontal" style={{top:guides.y*scale}}/>}
    </div></div>
    {!project.tracks.length&&<div className="canvas-empty"><b>Your story starts here</b><span>Add your UI, a title, or media to start your film.</span>{empty}</div>}
  </div>
}
