import type { Project, Move, Track } from './project'
// @ts-expect-error The legacy arithmetic is JavaScript.
import { resolve } from '../../shared/arrange.mjs'
/** Self-contained so the exact same arithmetic can travel into an exported composition. */
export function createFilmMath(solve: (arr: unknown) => {at:number[];cyclic:string[]}) {
  const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n))
  const ease=(x:number,kind:string)=>kind==='linear'?x:kind==='ease-in'?x*x:kind==='ease-out'?1-(1-x)*(1-x):x*x*(3-2*x)
  const timing=(p:Project)=>solve({cars:p.tracks.map(t=>({key:t.id,at:t.start,after:t.after,motion:{ms:t.duration}}))})
  function position(moves:Move[],time:number) {
    let last={x:0,y:0,scale:1}
    for(const m of [...moves].sort((a,b)=>a.at-b.at)){
      if(time<m.at)break
      const r=ease(clamp((time-m.at)/m.duration,0,1),m.ease)
      const value={x:last.x+(m.x-last.x)*r,y:last.y+(m.y-last.y)*r,scale:last.scale+(m.scale-last.scale)*r}
      if(time<m.at+m.duration)return value
      last=value
    }
    return last
  }
  function geometry(p:Project,t:Track,time:number,start:number) {
    const cam=position(p.camera,time),move=position(t.moves,time),w=p.settings.width,h=p.settings.height
    const width=t.width*w/100,height=t.height*h/100
    const titleY=t.kind==='title'?(1-ease(clamp((time-start)/400,0,1),'ease-out'))*16*move.scale:0
    const left=t.x*w/100+width*(1-move.scale)/2+width*move.x/100
    const top=t.y*h/100+height*(1-move.scale)/2+height*move.y/100+titleY
    return {x:(left-w/2)*cam.scale+w/2+w*cam.x/100,y:(top-h/2)*cam.scale+h/2+h*cam.y/100,width:width*move.scale*cam.scale,height:height*move.scale*cam.scale,cameraScale:cam.scale,scale:cam.scale*move.scale,active:!t.hidden&&time>=start&&time<start+t.duration}
  }
  return {clamp,ease,timing,position,geometry}
}
export const filmMath=createFilmMath(resolve)
export const resolvedStarts=(p:Project)=>filmMath.timing(p).at
