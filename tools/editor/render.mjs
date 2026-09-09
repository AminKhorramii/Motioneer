/** Renderer tools are pinned and installed in a private cache; no dependency on a developer's PATH. */
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { compositionDocument } from '../../dist-core/core.js'
const VERSIONS = { playwright: '1.62.1', 'ffmpeg-static': '5.2.0' }
/** The one place that knows where the renderer's browser lives, so the autofilm driver borrows it rather than adding a second copy of playwright. Returns null when the renderer is not installed yet. */
export async function loadFfmpeg() {
  const ff = path.join(CACHE, 'node_modules/ffmpeg-static/index.js')
  if (!existsSync(ff)) return null
  const { default: ffmpeg } = await import(pathToFileURL(ff).href)
  return ffmpeg && existsSync(ffmpeg) ? ffmpeg : null
}
export async function loadChromium() {
  const mod = path.join(CACHE, 'node_modules/playwright/index.mjs')
  if (!existsSync(mod)) return null
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(CACHE, 'browsers')
  const { chromium } = await import(pathToFileURL(mod).href)
  if (!existsSync(chromium.executablePath())) return null
  return chromium
}
const CACHE = process.env.MOTIONEER_RENDER_CACHE || path.join(homedir(), '.cache', 'motioneer', 'renderer-1')
function command(bin,args,{signal,env}={}) {
  return new Promise((resolve,reject) => { const child=spawn(bin,args,{env:{...process.env,...env},signal,stdio:['ignore','pipe','pipe']});let output='';
    child.stdout.on('data',d=>{output=(output+d).slice(-8000)});child.stderr.on('data',d=>{output=(output+d).slice(-8000)});child.on('error',reject);child.on('exit',code=>code===0?resolve(output):reject(new Error(output || `Renderer command exited ${code}`))) })
}
export function renderer(store) {
  const jobs = new Map(); let setup = { state:'idle', message:'Install the local renderer once to export faithful films.' }, installing=null
  const tools = async () => {
    const mod=path.join(CACHE,'node_modules/playwright/index.mjs'), ff=path.join(CACHE,'node_modules/ffmpeg-static/index.js')
    if (!existsSync(mod)||!existsSync(ff)) return null
    process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(CACHE,'browsers')
    const {chromium}=await import(pathToFileURL(mod).href), {default:ffmpeg}=await import(pathToFileURL(ff).href)
    if (!existsSync(chromium.executablePath()) || !ffmpeg || !existsSync(ffmpeg)) return null
    return {chromium,ffmpeg}
  }
  async function status() { const found=await tools().catch(()=>null);return found?{state:'ready',message:'Local renderer ready'}:setup }
  function install() {
    if (installing) return setup
    setup={state:'installing',message:'Downloading Chromium and the video encoder. This only happens once.'}
    installing=(async()=>{ await mkdir(CACHE,{recursive:true});await writeFile(path.join(CACHE,'package.json'),JSON.stringify({private:true,dependencies:VERSIONS}));
      await command(process.platform==='win32'?'npm.cmd':'npm',['install','--prefix',CACHE,'--no-audit','--no-fund']);
      await command(process.execPath,[path.join(CACHE,'node_modules/playwright/cli.js'),'install','chromium','--no-shell'],{env:{PLAYWRIGHT_BROWSERS_PATH:path.join(CACHE,'browsers')}})
      if (!await tools()) throw new Error('Renderer tools are incomplete. Retry setup.');setup={state:'ready',message:'Local renderer ready'}
    })().catch(e=>{setup={state:'error',message:e.message}}).finally(()=>{installing=null});return setup
  }
  const publicJob = ({ controller, ...job }) => job
  async function run(job,p,origin) {
    const dir=path.join(store.directory(p.id),'renders',job.id), frames=path.join(dir,'frames');let browser
    try {
      const kit=await tools();if(!kit)throw new Error('Set up the local renderer before exporting.');await mkdir(frames,{recursive:true});await writeFile(path.join(dir,'project.json'),JSON.stringify(p))
      job.state='preparing';job.message='Loading captured elements and media';
      browser=await kit.chromium.launch({channel:'chromium'});job.controller.signal.addEventListener('abort',()=>{void browser?.close()},{once:true})
      const page=await browser.newPage({viewport:{width:p.settings.width,height:p.settings.height},deviceScaleFactor:1,reducedMotion:'no-preference'})
      await page.goto(origin+'/__motioneer/render-shell');await page.setContent(compositionDocument(p,`${origin}/__motioneer/projects/${p.id}/assets/`));
      await page.evaluate(()=>window.__composition.ready());job.state='rendering'
      const count=Math.ceil((p.settings.to-p.settings.from)/1000*p.settings.fps);job.total=count
      for(let i=0;i<count;i++){if(job.controller.signal.aborted)throw new Error('Cancelled');await page.evaluate(t=>window.__composition.seek(t),p.settings.from+i*1000/p.settings.fps);await page.screenshot({path:path.join(frames,String(i).padStart(6,'0')+'.png'),animations:'allow'});job.done=i+1;job.message=`Rendering frame ${i+1} of ${count}`}
      await browser.close();browser=null;job.state='encoding';job.message='Encoding picture and mixing sound'
      const args=['-y','-framerate',String(p.settings.fps),'-i',path.join(frames,'%06d.png')],filters=[],inputs=[]
      for(const t of p.tracks.filter(t=>t.kind==='audio'&&!t.hidden)) {
        const left=Math.max(p.settings.from,t.start),right=Math.min(p.settings.to,t.start+t.duration);if(right<=left)continue
        const index=inputs.length+1;args.push('-i',store.assetPath(p.id,t.assetId));const local=(left-t.start)/1000,span=(right-left)/1000,offset=Math.round(left-p.settings.from)
        filters.push(`[${index}:a]atrim=start=${t.sourceStart/1000}:duration=${t.duration/1000},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${Math.max(.001,t.fadeIn/1000)},afade=t=out:st=${Math.max(0,(t.duration-t.fadeOut)/1000)}:d=${Math.max(.001,t.fadeOut/1000)},atrim=start=${local}:duration=${span},asetpts=PTS-STARTPTS,volume=${t.volume},adelay=${offset}|${offset}[a${index}]`);inputs.push(`[a${index}]`)
      }
      if(inputs.length){filters.push(inputs.join('')+`amix=inputs=${inputs.length}:normalize=0,apad[mix]`);args.push('-filter_complex',filters.join(';'),'-map','0:v','-map','[mix]','-c:a','aac','-b:a','192k')}
      args.push('-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-t',String(count/p.settings.fps),'-movflags','+faststart',path.join(dir,'film.mp4'))
      await command(kit.ffmpeg,args,{signal:job.controller.signal});job.state='complete';job.message='Your film is ready';job.url=`/__motioneer/projects/${p.id}/renders/${job.id}/film.mp4`
    }catch(e){job.state=job.controller.signal.aborted?'cancelled':'error';job.message=job.state==='cancelled'?'Export cancelled':e.message}
    finally{await browser?.close().catch(()=>{});await rm(frames,{recursive:true,force:true});await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'job.json'),JSON.stringify(publicJob(job)))}
  }
  return {status,install,
    async start(p,origin){ if(!await tools())throw Object.assign(new Error('Set up the local renderer before exporting.'),{status:409});if([...jobs.values()].some(j=>!['complete','error','cancelled'].includes(j.state)))throw Object.assign(new Error('An export is already running. Wait for it or cancel it first.'),{status:409});const job={id:randomUUID(),projectId:p.id,revision:p.revision,name:p.name,state:'preparing',message:'Preparing your film',done:0,total:0,createdAt:Date.now(),controller:new AbortController()};jobs.set(job.id,job);void run(job,structuredClone(p),origin);return publicJob(job)},
    async list(id){const root=path.join(store.directory(id),'renders'),dirs=await readdir(root).catch(()=>[]);const old=await Promise.all(dirs.map(d=>readFile(path.join(root,d,'job.json'),'utf8').then(JSON.parse).catch(()=>null)));const all=new Map(old.filter(Boolean).map(j=>[j.id,j]));for(const j of jobs.values())if(j.projectId===id)all.set(j.id,publicJob(j));return [...all.values()].sort((a,b)=>b.createdAt-a.createdAt)},
    cancel(id,projectId){const job=jobs.get(id);if(job?.projectId===projectId)job.controller.abort();return {ok:true}},
    async file(id,job){if(!/^[a-zA-Z0-9_-]+$/.test(job))throw new Error('Invalid render identifier.');return readFile(path.join(store.directory(id),'renders',job,'film.mp4'))},
  }
}
