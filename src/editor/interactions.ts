import { useEffect, useRef, useState } from 'react'
export type Gesture={begin:()=>void;end:(cancel?:boolean)=>void}
/** A cancelled or interrupted pointer gesture always removes its listeners and rolls back. */
export function pointerGesture(e:React.PointerEvent,gesture:Gesture,move:(e:PointerEvent)=>void,finish:()=>void=()=>{}) {
  e.preventDefault();e.stopPropagation();const target=e.currentTarget,pointer=e.pointerId;target.setPointerCapture(pointer);const x=e.clientX,y=e.clientY;let started=false
  const onMove=(v:PointerEvent)=>{if(!started&&Math.hypot(v.clientX-x,v.clientY-y)<2)return;if(!started){gesture.begin();started=true}move(v)}
  const stop=(cancel=false)=>{target.removeEventListener('lostpointercapture',cancelled);if(target.hasPointerCapture(pointer))target.releasePointerCapture(pointer);window.removeEventListener('pointermove',onMove);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancelled);window.removeEventListener('keydown',key,true);window.removeEventListener('blur',cancelled);if(started)gesture.end(cancel);finish()}
  const up=()=>stop(),cancelled=()=>stop(true),key=(v:KeyboardEvent)=>{if(v.key==='Escape'){v.preventDefault();v.stopImmediatePropagation();stop(true)}}
  target.addEventListener('lostpointercapture',cancelled,{once:true});window.addEventListener('pointermove',onMove);window.addEventListener('pointerup',up,{once:true});window.addEventListener('pointercancel',cancelled,{once:true});window.addEventListener('keydown',key,true);window.addEventListener('blur',cancelled,{once:true})
}
export function usePreference<T>(key:string,fallback:T) {
  const [value,set]=useState<T>(()=>{try{const v=JSON.parse(localStorage.getItem('motioneer-film-'+key)||'null');return v===null||typeof v!==typeof fallback||(typeof v==='number'&&!Number.isFinite(v))?fallback:v}catch{return fallback}})
  useEffect(()=>{try{localStorage.setItem('motioneer-film-'+key,JSON.stringify(value))}catch{}},[key,value]);return [value,set] as const
}
export function useDialog(close:()=>void) {
  const ref=useRef<HTMLElement>(null),latest=useRef(close);latest.current=close
  useEffect(()=>{
    const node=ref.current;if(!node)return;const previous=document.activeElement as HTMLElement|null
    const focusable=()=>Array.from(node.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')).filter(n=>n.getClientRects().length)
    focusable()[0]?.focus()
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();latest.current()}else if(e.key==='Tab'){const all=focusable(),first=all[0],last=all.at(-1);if(!all.length){e.preventDefault();return}if(e.shiftKey&&(document.activeElement===first||!node.contains(document.activeElement))){e.preventDefault();last?.focus()}else if(!e.shiftKey&&(document.activeElement===last||!node.contains(document.activeElement))){e.preventDefault();first?.focus()}}}
    document.addEventListener('keydown',key,true);return()=>{document.removeEventListener('keydown',key,true);previous?.focus()}
  },[]);return ref
}
