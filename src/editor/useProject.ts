import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import type { Project, Asset } from './project'
export function useProject() {
  const [project, setProject] = useState<Project | null>(null), [status, setStatus] = useState('Opening projects'), [error,setError] = useState('')
  const [history,setHistory] = useState({past:0,ahead:0}), [projects,setProjects] = useState<{id:string;name:string}[]>([])
  const current=useRef<Project|null>(null), past=useRef<Project[]>([]), ahead=useRef<Project[]>([]), revision=useRef(0), dirty=useRef(false), pending=useRef<Promise<void>|null>(null), blocked=useRef(false)
  const transaction=useRef<{before:Project;recorded:boolean;past:Project[];ahead:Project[]}|null>(null)
  const publish = useCallback((p:Project) => { current.current=p;setProject(p) },[])
  const refresh = useCallback(async()=>{const list=await api<{id:string;name:string}[]>('projects');setProjects(list);return list},[])
  const flush = useCallback(async function flushNow(){
    if (pending.current) await pending.current
    if (blocked.current) throw new Error('Resolve the save conflict or save a copy before continuing.')
    if (!dirty.current || !current.current) return
    const snapshot={...current.current,revision:revision.current};dirty.current=false;setStatus('Saving')
    pending.current=api<Project>(`projects/${snapshot.id}`,snapshot,'PUT').then(saved=>{ if(current.current?.id===saved.id){revision.current=saved.revision;current.current={...current.current,revision:saved.revision};setStatus(dirty.current?'Unsaved changes':'Saved locally');setError('')} }).catch(e=>{dirty.current=true;blocked.current=e.status===409;setStatus(e.status===409?'Save conflict':'Save failed');setError(e.message);throw e}).finally(()=>{pending.current=null})
    await pending.current
    if(dirty.current) await flushNow()
  },[])
  const open=useCallback(async(id:string)=>{await flush();if(dirty.current)throw new Error('Resolve the unsaved changes before opening another project.');const p=await api<Project>(`projects/${id}`);revision.current=p.revision;blocked.current=false;publish(p);past.current=[];ahead.current=[];setHistory({past:0,ahead:0});setError('');setStatus('Saved locally');localStorage.setItem('motioneer-project',id)},[flush,publish])
  const create=useCallback(async()=>{await flush();if(dirty.current)throw new Error('Resolve unsaved changes first.');const p=await api<Project>('projects',{name:'Untitled film'});revision.current=p.revision;publish(p);past.current=[];ahead.current=[];setHistory({past:0,ahead:0});setStatus('Saved locally');localStorage.setItem('motioneer-project',p.id);await refresh()},[flush,publish,refresh])
  useEffect(()=>{let live=true;void(async()=>{try{const list=await refresh();if(!live)return;const last=localStorage.getItem('motioneer-project');if(list.length)await open(list.find(p=>p.id===last)?.id||list[0].id);else await create()}catch(e){setError((e as Error).message)}})();return()=>{live=false}},[refresh,open,create])
  const end=useCallback((cancel=false)=>{
    const tx=transaction.current;transaction.current=null
    if(!tx?.recorded)return
    const unchanged=JSON.stringify({...current.current,revision:0})===JSON.stringify({...tx.before,revision:0})
    if(cancel||unchanged){past.current=tx.past;ahead.current=tx.ahead;publish({...tx.before,revision:revision.current});dirty.current=true;setStatus('Unsaved changes');setHistory({past:past.current.length,ahead:ahead.current.length})}
  },[publish])
  const begin=useCallback(()=>{end();if(current.current)transaction.current={before:current.current,recorded:false,past:[...past.current],ahead:[...ahead.current]}},[end])
  const edit=useCallback((fn:(p:Project)=>Project, checkpoint=true)=>{
    const p=current.current;if(!p)return;const next=fn(p);if(next===p||Object.entries(next).every(([key,value])=>{const old=p[key as keyof Project];return value===old||(Array.isArray(value)&&Array.isArray(old)&&value.length===old.length&&value.every((item,i)=>item===old[i]))||(key==='settings'&&Object.entries(value).every(([k,v])=>v===p.settings[k as keyof Project['settings']]))}))return
    const tx=transaction.current
    if(tx?!tx.recorded:checkpoint){past.current=[...past.current.slice(-59),tx?.before||p];ahead.current=[];if(tx)tx.recorded=true}
    publish(next);dirty.current=true;setStatus('Unsaved changes');setHistory({past:past.current.length,ahead:ahead.current.length})
  },[publish])
  const undo=useCallback(()=>{end();const p=past.current.pop();if(!p||!current.current)return;ahead.current.push(current.current);publish({...p,revision:revision.current});dirty.current=true;setStatus('Unsaved changes');setHistory({past:past.current.length,ahead:ahead.current.length})},[publish,end])
  const redo=useCallback(()=>{end();const p=ahead.current.pop();if(!p||!current.current)return;past.current.push(current.current);publish({...p,revision:revision.current});dirty.current=true;setStatus('Unsaved changes');setHistory({past:past.current.length,ahead:ahead.current.length})},[publish,end])
  useEffect(()=>{if(!project)return;const timer=setTimeout(()=>{void flush().catch(()=>{})},600);return()=>clearTimeout(timer)},[project,flush])
  useEffect(()=>{const listener=(e:BeforeUnloadEvent)=>{if(dirty.current||pending.current){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',listener);return()=>window.removeEventListener('beforeunload',listener)},[])
  const recover=useCallback(async()=>{if(!current.current)return;const old=current.current;const fresh=await api<Project>('projects',{name:old.name+' copy'});const assets:Asset[]=[];for(const a of old.assets){const r=await fetch(`/__motioneer/projects/${old.id}/assets/${a.id}`);const f=await fetch(`/__motioneer/projects/${fresh.id}/assets?name=${encodeURIComponent(a.name)}`,{method:'POST',headers:{'content-type':a.mime},body:await r.blob()});if(!f.ok)throw new Error('Could not copy project assets.');assets.push({...a,...await f.json()})}const remap=new Map(old.assets.map((a,i)=>[a.id,assets[i].id]));const tracks=(ts:Project['tracks'])=>ts.map(t=>({...t,assetId:t.assetId?remap.get(t.assetId):undefined}));const copy={...old,id:fresh.id,revision:fresh.revision,name:fresh.name,assets,tracks:tracks(old.tracks),arrangements:old.arrangements.map(a=>({...a,tracks:tracks(a.tracks)}))};revision.current=copy.revision;blocked.current=false;publish(copy);dirty.current=true;setError('');await flush();await refresh()},[flush,publish,refresh])
  return {project,status,error,setError,projects,refresh,open,create,edit,begin,end,undo,redo,history,flush,current,recover}
}
export type Edit = (fn:(p:Project)=>Project, checkpoint?:boolean)=>void
