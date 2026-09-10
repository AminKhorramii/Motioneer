import type { Project, Track } from './project'
import { filmMath, resolvedStarts } from './filmMath'
export const clamp=filmMath.clamp
export function selectIds(ids:string[],id:string,mods:{shiftKey?:boolean;metaKey?:boolean;ctrlKey?:boolean}) {
  return mods.metaKey||mods.ctrlKey?ids.includes(id)?ids.filter(n=>n!==id):[...ids,id]:mods.shiftKey?[...new Set([...ids,id])]:[id]
}
export function clipRows(p:Project,view:'clips'|'layers'):string[][] {
  if(view==='layers')return p.tracks.map(t=>[t.id])
  const at=resolvedStarts(p), rows:string[][]=[]
  for(const audio of [false,true]){
    const group:{end:number;ids:string[]}[]=[]
    p.tracks.map((t,i)=>({t,i})).filter(({t})=>(t.kind==='audio')===audio).sort((a,b)=>at[a.i]-at[b.i]||a.i-b.i).forEach(({t,i})=>{
      let row=group.find(r=>r.end<=at[i]);if(!row){row={end:0,ids:[]};group.push(row)}row.ids.push(t.id);row.end=at[i]+t.duration
    });rows.push(...group.map(r=>r.ids))
  }
  return rows
}
/** Shift linked descendants once. Unselected descendants continue following their parent. */
export function moveClips(p:Project,ids:string[],requested:number):Project {
  const {at,cyclic}=filmMath.timing(p),selected=new Set(p.tracks.filter(t=>ids.includes(t.id)&&!t.locked).map(t=>t.id))
  if(!selected.size)return p
  const follows=(t:Track,seen=new Set<string>()):boolean=>{
    if(t.locked)return false
    if(selected.has(t.id))return true
    if(!t.after||cyclic.includes(t.id)||seen.has(t.id))return false
    seen.add(t.id);const parent=p.tracks.find(n=>n.id===t.after!.key);return !!parent&&follows(parent,seen)
  }
  // A locked dependent must remain in place, even when its parent moves.
  const affected=p.tracks.filter(t=>!t.locked&&follows(t)), indexes=affected.map(t=>p.tracks.indexOf(t))
  const lo=-Math.min(...indexes.map(i=>at[i])),hi=p.settings.duration-Math.max(...indexes.map(i=>at[i]+p.tracks[i].duration))
  const delta=clamp(requested,Math.min(0,lo),Math.max(0,hi));if(!delta)return p
  const moving=new Set(affected.map(t=>t.id))
  return {...p,tracks:p.tracks.map((t,i)=>{
    const parent=t.after&&p.tracks.find(n=>n.id===t.after!.key),parentMoves=!!parent&&moving.has(parent.id)&&!cyclic.includes(t.id)
    if(t.locked&&parentMoves)return {...t,after:{...t.after!,gap:t.after!.gap-delta}}
    if(!moving.has(t.id))return t
    const linked=!!parent&&!cyclic.includes(t.id)
    return {...t,start:Math.max(0,t.start+delta),after:linked?{...t.after!,gap:t.after!.gap+(parentMoves?0:delta)}:t.after,moves:t.moves.map(m=>({...m,at:clamp(m.at+delta,0,120000)})),...(linked?{}:{start:at[i]+delta})}
  })}
}
export function trimClip(p:Project,id:string,edge:'left'|'right',requested:number):Project {
  const t=p.tracks.find(t=>t.id===id);if(!t||t.locked)return p
  const at=resolvedStarts(p)[p.tracks.indexOf(t)],source=p.assets.find(a=>a.id===t.assetId)?.duration
  const min=Math.min(100,t.duration)
  const low=edge==='left'?Math.max(-at,t.kind==='audio'?-t.sourceStart:-at):min-t.duration
  const high=edge==='left'?t.duration-min:Math.min(p.settings.duration-at-t.duration,t.kind==='audio'&&source!==undefined?source-t.sourceStart-t.duration:Infinity)
  const delta=clamp(requested,Math.min(0,low),Math.max(0,high));if(!delta)return p
  const next={...t,duration:t.duration+(edge==='left'?-delta:delta)}
  if(edge==='left'){
    next.start=Math.max(0,t.start+delta)
    if(t.after)next.after={...t.after,gap:t.after.gap+delta}
    if(t.kind==='audio')next.sourceStart=t.sourceStart+delta
  }
  return {...p,tracks:p.tracks.map(n=>n.id===id?next:n)}
}
export function nearestSnap(value:number,targets:number[],distance:number):number|undefined {
  return targets.filter(n=>Math.abs(n-value)<=distance).sort((a,b)=>Math.abs(a-value)-Math.abs(b-value))[0]
}
export function snapshot(p:Project,name:string){return {id:crypto.randomUUID(),name,tracks:structuredClone(p.tracks),camera:structuredClone(p.camera),settings:{...p.settings}}}
