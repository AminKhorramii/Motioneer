import { useEffect, useMemo, useRef, useState } from 'react'
import { compositionDocument } from './composition'
import { createProject, newTrack } from './project'
import type { Subject, Motion } from './project'
export function Preview({subject,motion,time=0}:{subject:Subject;motion?:Motion;time?:number}) {
  const frame=useRef<HTMLIFrameElement>(null),box=useRef<HTMLDivElement>(null),[scale,setScale]=useState(1)
  const html=useMemo(()=>{const p=createProject('Preview');p.settings.width=subject.w;p.settings.height=subject.h;p.subjects=[subject];p.motions=motion?[motion]:[];p.tracks=[{...newTrack('component',subject.name),subjectId:subject.id,motionId:motion?.id,x:0,y:0,width:100,height:100,duration:120000}];p.settings.background='#f7f7f8';return compositionDocument(p)},[subject,motion])
  useEffect(()=>{const node=box.current;if(!node)return;const r=new ResizeObserver(([e])=>setScale(Math.min((e.contentRect.width-24)/subject.w,(e.contentRect.height-24)/subject.h)));r.observe(node);return()=>r.disconnect()},[subject.w,subject.h])
  useEffect(()=>{void frame.current?.contentWindow?.__composition?.seek(time)},[time])
  return <div className="preview" ref={box}><iframe title={motion?`${motion.treatment} motion preview`:`${subject.name} capture`} ref={frame} srcDoc={html} style={{width:subject.w,height:subject.h,transform:`translate(-50%,-50%) scale(${scale})`}} onLoad={()=>{void frame.current?.contentWindow?.__composition?.seek(time)}}/></div>
}
