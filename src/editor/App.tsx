import { useCallback, useEffect, useRef, useState } from 'react'
import { useProject } from './useProject'
import { uid, defaultBrief } from './project'
import type { Subject, Motion } from './project'
import { api } from './api'
import { FilmWorkspace } from './FilmWorkspace'
import { useExportJobs } from './useExportJobs'
import { MotionWorkspace } from './MotionWorkspace'
import { ExportPanel } from './ExportPanel'
import { Settings } from './Settings'
import { Icon } from './icons'
export function App() {
  const state=useProject(),{project,edit}=state,[mode,setMode]=useState<'motion'|'film'>(()=>new URLSearchParams(location.search).get('view')==='film'?'film':'motion'),[selection,setSelection]=useState<string[]>([]),[time,setTime]=useState(0),[playing,setPlaying]=useState(false),[exporting,setExporting]=useState(false),[settings,setSettings]=useState(false),[toast,setToast]=useState(''),[projectMenu,setProjectMenu]=useState(false)
  useEffect(()=>{const url=new URL(location.href);url.searchParams.set('view',mode);window.history.replaceState(null,'',url)},[mode])
  const noticeTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
  const notify=useCallback((message:string)=>{setToast(message);if(noticeTimer.current)clearTimeout(noticeTimer.current);noticeTimer.current=setTimeout(()=>setToast(''),7000)},[])
  const exports=useExportJobs(project?.id)
  const pause=useCallback(()=>setPlaying(false),[])
  const select=useCallback((ids:string[])=>setSelection(ids),[])
  const seek=useCallback((t:number)=>{setPlaying(false);setTime(Math.max(0,Math.min(state.current.current?.settings.duration||0,t)))},[state.current])
  const film=useCallback(()=>{setMode('film');setPlaying(false)},[])
  useEffect(()=>{if(!playing||!project)return;let frame=0,last=performance.now();const tick=(n:number)=>{setTime(t=>{const next=t+n-last;return next>=project.settings.duration?0:next});last=n;frame=requestAnimationFrame(tick)};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame)},[playing,project?.settings.duration])
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(document.querySelector('[role=dialog]'))return;if((e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true]'))return;if(e.code==='Space'&&mode==='film'&&!(e.target as HTMLElement)?.closest('button,[role=button]')){e.preventDefault();setPlaying(p=>!p)}if((e.metaKey||e.ctrlKey)&&e.key==='z'){e.preventDefault();if(e.shiftKey)state.redo();else state.undo()}if(e.key==='Escape'){state.end(true);setProjectMenu(false);setSelection([])}if(mode==='film'&&(e.key==='Backspace'||e.key==='Delete')&&selection.length){e.preventDefault();edit(p=>({...p,tracks:p.tracks.filter(t=>!selection.includes(t.id)||t.locked)}));setSelection([])}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)},[mode,selection,edit,state.undo,state.redo])
  useEffect(()=>{setSelection([]);setTime(0);setPlaying(false)},[project?.id])
  useEffect(()=>{if(project)setTime(t=>Math.min(t,project.settings.duration))},[project?.settings.duration])
  async function migrate(){try{const legacy=await api<{motions:[string,{markup:string;base:string;shot?:string;wide?:number;css:string;scope:string;note:string;file:string}][]}>('legacy-work');const subjects:Subject[]=[],motions:Motion[]=[];for(const [,o] of legacy.motions){if(!o.markup||!o.css||!o.scope)continue;let s=subjects.find(s=>s.html===(o.shot||o.markup));if(!s){s={id:uid(),name:o.file||'Recovered element',html:o.shot||o.markup,css:o.base||'',w:o.wide||600,h:400,warnings:['Recovered capture: check its size before filming.']};subjects.push(s)}motions.push({id:uid(),subjectId:s.id,css:o.css,scope:o.scope,note:o.note||'Recovered motion',brief:{...defaultBrief},treatment:'recovered',duration:1000,saved:true})}if(!subjects.length){notify('No recoverable session motions were found. Existing browser-saved motions remain in the previous studio.');return}edit(p=>({...p,subjects:[...p.subjects,...subjects],motions:[...p.motions,...motions]}));notify(`Recovered ${motions.length} motions. Legacy data was preserved.`)}catch(e){notify((e as Error).message)}}
  if(!project)return <div className="boot"><div className="brand-mark">m</div><h1>Motioneer</h1><p>{state.error||state.status}</p>{state.error&&<button onClick={()=>location.reload()}>Retry opening studio</button>}</div>
  const exportJob=exports.jobs.find(j=>!['complete','error','cancelled'].includes(j.state))||exports.jobs[0]
  const exportLabel=exportJob?(exportJob.state==='complete'?'Export ready':exportJob.state==='error'?'Export failed · Retry':exportJob.state==='cancelled'?'Export cancelled':exportJob.state==='rendering'?`Exporting ${Math.round(exportJob.done/Math.max(1,exportJob.total)*100)}%`:'Preparing export…'):''
  return <div className="studio" onFocusCapture={e=>{if((e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)&&!e.target.closest('[data-local-fields]'))state.begin()}} onBlur={e=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)state.end()}}>
    <header className="app-header"><div className="brand"><div className="brand-mark">m</div><span>motioneer</span></div>
      <div className="project-switch"><button className="project-button" onClick={()=>{setProjectMenu(!projectMenu);void state.refresh()}}><span className={'save-status'+(state.error?' failed':'')} title={state.status}><i/><span className="sr-only">{state.status}</span></span>{project.name}<Icon name="chevron-down"/></button>
        {projectMenu&&<div className="project-menu"><label className="field"><span>Project name</span><input value={project.name} onChange={e=>edit(p=>({...p,name:e.target.value}))}/></label>{state.projects.map(p=><button key={p.id} className={p.id===project.id?'active':''} onClick={()=>void state.open(p.id).then(()=>setProjectMenu(false)).catch(e=>notify(e.message))}>{p.name}</button>)}<button onClick={()=>void state.create().then(()=>setProjectMenu(false)).catch(e=>notify(e.message))}><Icon name="plus"/>New project</button><button onClick={()=>void migrate()}><Icon name="replay"/>Recover previous session</button><a href="/__motioneer/legacy" target="_blank" rel="noreferrer"><Icon name="external"/>Open previous studio</a></div>}
      </div>
      <nav className="workspace-switch" aria-label="Workspace"><button aria-label="Motion" className={mode==='motion'?'active':''} onClick={()=>{pause();setMode('motion')}}><Icon name="sparkles"/>Motion</button><button aria-label="Film" className={mode==='film'?'active':''} onClick={film}><Icon name="film"/>Film</button></nav>
      <div className="header-actions"><button className="icon-button" disabled={!state.history.past} onClick={state.undo} aria-label="Undo" title="Undo (⌘Z)"><Icon name="undo"/></button><button className="icon-button" disabled={!state.history.ahead} onClick={state.redo} aria-label="Redo" title="Redo (⌘⇧Z)"><Icon name="redo"/></button><button className="icon-button" onClick={()=>{pause();setSettings(true)}} aria-label="Settings" title="Model settings"><Icon name="settings"/></button>
        {exportJob&&<button className="export-indicator" aria-label={exportLabel} onClick={()=>{pause();setExporting(true)}} title={exportJob.message}><span role="status">{exportLabel}</span></button>}
        <button className="primary" onClick={()=>{pause();setExporting(true)}} disabled={!project.tracks.length}><Icon name="download"/>Export film</button>
      </div>
    </header>
    {state.error&&<div className="error-banner" role="alert"><span>{state.error}</span><button onClick={()=>void state.flush().catch(e=>notify(e.message))}>Retry save</button><button onClick={()=>void state.recover().catch(e=>notify(e.message))}>Save a copy</button><button onClick={()=>location.reload()}>Reopen saved version</button></div>}
    {mode==='motion'?<MotionWorkspace key={project.id} project={project} edit={edit} toFilm={film} notify={notify}/>:<FilmWorkspace key={project.id} project={project} state={state} selection={selection} select={select} time={time} seek={seek} playing={playing} toggle={()=>setPlaying(!playing)} pause={pause} toMotion={()=>{pause();setMode('motion')}} notify={notify}/>}
    {toast&&<div className="toast" role="status"><span className="status-dot"/>{toast}<button className="icon-button" aria-label="Dismiss message" onClick={()=>setToast('')}><Icon name="x"/></button></div>}
    {exporting&&<ExportPanel jobs={exports.jobs} refreshJobs={exports.refresh} project={project} edit={edit} flush={state.flush} notify={notify} close={()=>setExporting(false)}/>}
    {settings&&<Settings close={()=>setSettings(false)}/>}
  </div>
}
