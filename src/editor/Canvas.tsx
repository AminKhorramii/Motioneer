import { useEffect, useMemo, useRef, useState } from 'react'
import type { Project, Track } from './project'
import type { Edit } from './useProject'
import { compositionDocument } from './composition'
export function Canvas({project,time,playing,selection,select,edit,begin,compare=false}:{project:Project;time:number;playing:boolean;selection:string[];select:(ids:string[])=>void;edit:Edit;begin:()=>void;compare?:boolean}) {
  const frame=useRef<HTMLIFrameElement>(null), box=useRef<HTMLDivElement>(null), [size,setSize]=useState({w:600,h:400}),[guide,setGuide]=useState(false)
  const initial=useRef(project), html=useMemo(()=>compositionDocument(initial.current),[])
  useEffect(()=>{const node=box.current;if(!node)return;const observer=new ResizeObserver(([entry])=>setSize({w:entry.contentRect.width,h:entry.contentRect.height}));observer.observe(node);return()=>observer.disconnect()},[])
  const scale=Math.min((size.w-64)/project.settings.width,(size.h-56)/project.settings.height)
  useEffect(()=>{frame.current?.contentWindow?.__composition?.update(project)},[project])
  useEffect(()=>{void frame.current?.contentWindow?.__composition?.seek(time,playing)},[time,playing])
  useEffect(()=>{const handler=(e:MessageEvent)=>{if(e.source!==frame.current?.contentWindow||e.data?.motioneer!=='select-track')return;select(e.data.shift?[...new Set([...selection,e.data.id])]:[e.data.id])};window.addEventListener('message',handler);return()=>window.removeEventListener('message',handler)},[selection,select])
  function drag(e:React.PointerEvent,t:Track,resize=false) {
    if(t.locked||compare)return;e.stopPropagation();e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);select([t.id]);begin()
    const x=e.clientX,y=e.clientY,at={...t},width=project.settings.width*scale,height=project.settings.height*scale
    const move=(v:PointerEvent)=>{const dx=(v.clientX-x)/width*100,dy=(v.clientY-y)/height*100
      let changes:Partial<Track>
      if(resize){const w=Math.max(2,Math.min(200,at.width+dx));changes={width:w,height:at.height*w/at.width}}
      else {const snap=(n:number,extent:number)=>{const target=[0,50-extent/2,100-extent].find(a=>Math.abs(a-n)<.6);if(target!==undefined){setGuide(true);return target}return Math.round(n*10)/10};setGuide(false);changes={x:snap(at.x+dx,t.width),y:snap(at.y+dy,t.height)}}
      edit(p=>({...p,tracks:p.tracks.map(n=>n.id===t.id?{...n,...changes}:n)}),false)
    }
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);setGuide(false)};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true})
  }
  return <div className="canvas-area" ref={box} onPointerDown={()=>select([])}>
    <div className="canvas-metadata"><span>{compare?'Arrangement comparison':''}</span><span>{project.settings.width} × {project.settings.height} · {Math.round(scale*100)}%</span></div>
    <div className="canvas-frame" style={{width:project.settings.width*scale,height:project.settings.height*scale}}>
      <iframe title="Film canvas" ref={frame} srcDoc={html} style={{width:project.settings.width,height:project.settings.height,transform:`scale(${scale})`}} onLoad={()=>{frame.current?.contentWindow?.__composition?.update(project);void frame.current?.contentWindow?.__composition?.seek(time,playing)}}/>
      {!compare&&project.tracks.filter(t=>t.kind!=='audio'&&!t.hidden&&selection.includes(t.id)).map(t=><div key={t.id} className={'selection-box'+(t.locked?' locked':'')} style={{left:t.x+'%',top:t.y+'%',width:t.width+'%',height:t.height+'%'}} onPointerDown={e=>drag(e,t)}><span>{t.name}{t.locked?' · Locked':''}</span>{!t.locked&&<button aria-label="Resize selected element" className="resize-handle" onPointerDown={e=>drag(e,t,true)}/>}</div>)}
      {guide&&<><i className="guide vertical"/><i className="guide horizontal"/></>}
    </div>
    {!project.tracks.length&&<div className="canvas-empty"><b>Your story starts here</b><span>Add your UI from Motion, or start with a title.</span></div>}
  </div>
}
