import { useEffect, useMemo, useRef, useState } from 'react'
import { compositionDocument } from './composition'
import { createProject, newTrack } from './project'
import type { Subject, Motion } from './project'
/** One element in its own frame, scaled to fit whatever box it is given. The box decides the shape: a card takes the element's own aspect so no grey surrounds it, a thumbnail is fixed, the stage is the window. */
export function Preview({subject,motion,time=0,inset=8,shaped=false}:{subject:Subject;motion?:Motion;time?:number;inset?:number;shaped?:boolean}) {
  const frame=useRef<HTMLIFrameElement>(null),box=useRef<HTMLDivElement>(null),[scale,setScale]=useState(1)
  const html=useMemo(()=>{const p=createProject('Preview');p.settings.width=subject.w;p.settings.height=subject.h;p.subjects=[subject];p.motions=motion?[motion]:[];p.tracks=[{...newTrack('component',subject.name),subjectId:subject.id,motionId:motion?.id,x:0,y:0,width:100,height:100,duration:120000}];p.settings.background='#f7f7f8';return compositionDocument(p)},[subject,motion])
  useEffect(()=>{const node=box.current;if(!node)return;const r=new ResizeObserver(([e])=>setScale(Math.min((e.contentRect.width-inset*2)/subject.w,(e.contentRect.height-inset*2)/subject.h)));r.observe(node);return()=>r.disconnect()},[subject.w,subject.h,inset])
  useEffect(()=>{void frame.current?.contentWindow?.__composition?.seek(time)},[time])
  return <div className="preview" ref={box} style={shaped?{aspectRatio:`${subject.w}/${subject.h}`}:undefined}><iframe title={motion?`${motion.treatment} motion preview`:`${subject.name} capture`} ref={frame} srcDoc={html} style={{width:subject.w,height:subject.h,transform:`translate(-50%,-50%) scale(${scale})`}} onLoad={()=>{void frame.current?.contentWindow?.__composition?.seek(time)}}/></div>
}
