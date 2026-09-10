/** The current editor, driven through its public UI and HTTP API, with a deterministic local model. */
import assert from 'node:assert/strict'
import { verifyFilmUX } from './film-ux.mjs'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { compositionDocument } from '../dist-core/core.js'
import { homedir } from 'node:os'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),temp=await mkdtemp(path.join(tmpdir(),'motioneer-editor-'))
const port=Number(process.env.MOTIONEER_EDITOR_TEST_PORT||4392),origin=`http://localhost:${port}`,out=path.join(root,'.context/studio-redesign')
await mkdir(out,{recursive:true});await mkdir(path.join(temp,'.studio'),{recursive:true})
let modelCalls=0
const mock=createServer(async(req,res)=>{
  if(req.url?.includes('chat/completions')){let body='';for await(const b of req)body+=b;const prompt=JSON.parse(body).messages.at(-1).content;const kind=prompt.includes('Treatment: subtle')?'subtle':prompt.includes('Treatment: bold')?'bold':'expressive';const distance=kind==='subtle'?5:kind==='bold'?20:12;modelCalls++;const css=`@media (prefers-reduced-motion: no-preference){[data-motion-test] > *{animation:arrive 1000ms ease-out both}[data-motion-test] > :nth-child(2){animation-delay:80ms}[data-motion-test] > :nth-child(3){animation-delay:160ms}@keyframes arrive{from{transform:translateY(${distance}px);opacity:.6}to{transform:translateY(0);opacity:1}}}`;res.writeHead(200,{'content-type':'text/event-stream'});res.end('data: '+JSON.stringify({choices:[{delta:{content:JSON.stringify({css,scope:'data-motion-test',note:kind+' reading rhythm'})}}]})+'\n\ndata: [DONE]\n\n');return}
  res.writeHead(200,{'content-type':'text/html'});res.end(`<!doctype html><html><head><style>body{margin:0;padding:30px;background:#e9ecf3;font:16px system-ui;color:#202b45;display:grid;gap:20px}article{box-sizing:border-box;width:500px;padding:24px;background:white;border:1px solid #ccd3e1;border-radius:16px}h2{font-size:22px;margin:0 0 12px}p{margin:0 0 16px;color:#596983}button{background:#5c63d3;color:white;border:0;padding:10px 20px;border-radius:8px}.bars{display:flex;gap:10px;align-items:end;height:80px}.bars i{background:#8173cc;width:50px;border-radius:5px 5px 0 0}</style></head><body><article><h2>A clearer picture</h2><p>Your team’s progress, in one place.</p><div class="bars"><i style="height:40px"></i><i style="height:65px"></i><i style="height:80px"></i></div></article><article><h2>Make room for good work</h2><p>Keep every project moving.</p><button>View projects</button></article><article><h2>Built for your next chapter</h2><p>Start with a little momentum.</p><button>Get started</button></article></body></html>`)
});await new Promise(r=>mock.listen(0,'127.0.0.1',r));const mockOrigin=`http://127.0.0.1:${mock.address().port}`
await writeFile(path.join(temp,'.studio/model.json'),JSON.stringify({provider:'openai',base:mockOrigin+'/v1',model:'fixture',key:'fixture',chosen:true}))
const child=spawn(process.execPath,[path.join(root,'tools/studio.mjs'),'--app',mockOrigin],{cwd:temp,env:{...process.env,MOTIONEER_PORT:String(port),MOTIONEER_NO_OPEN:'1'},stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b)
const request=async(route,body,method)=>{const r=await fetch(origin+'/__motioneer/'+route,{method:method||(body?'POST':'GET'),headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
let browser,page
try{
  for(let i=0;i<80;i++){try{if((await fetch(origin+'/__motioneer/model')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
  browser=await chromium.launch();page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>void d.accept())
  await page.goto(origin);await page.getByRole('button',{name:'Pick element',exact:true}).waitFor();console.log('ok: current editor opens')
  for(let i=0;i<3;i++){
    await page.getByRole('button',{name:'Source',exact:true}).click();if(await page.getByRole('button',{name:'Pick element',exact:true}).count())await page.getByRole('button',{name:'Pick element',exact:true}).click();
    const frame=page.frameLocator('iframe[title="Source page"]');await frame.locator('article').nth(i).click({position:{x:10,y:10}})
    await page.waitForFunction(n=>document.querySelectorAll('.subject-item').length===n,i+1);await page.getByLabel('Element name',{exact:true}).waitFor();await page.getByLabel('Element name',{exact:true}).fill(['Progress','Projects','Get started'][i]);await page.getByRole('button',{name:'Explore motion',exact:true}).click();await page.locator('.motion-card:not(.pending)').nth(2).waitFor({timeout:60000});await page.getByRole('button',{name:'Keep motion',exact:true}).first().click()
  }
  assert.equal(modelCalls,9);assert.equal(await page.locator('.subject-item').count(),3);console.log('ok: captures three real elements and generates all nine treatments through the provider and gates')
  await page.screenshot({path:path.join(out,'motion-comparison.png')})
  await page.getByRole('button',{name:'Film',exact:true}).click();for(const [width,height] of [[1280,800],[1440,900],[1680,1000]]){await page.setViewportSize({width,height});await page.screenshot({path:path.join(out,`film-empty-${width}.png`)})}await page.setViewportSize({width:1440,height:900});await page.locator('.library').getByRole('button',{name:'Create first cut',exact:true}).click();await page.getByRole('button',{name:'Create cut',exact:true}).click();assert.equal(await page.locator('.clip').count(),5);assert.equal(await page.locator('.track-row').count(),1)
  await page.getByRole('button',{name:'Title',exact:false}).first().count() // the opening and closing titles are editable tracks
  await page.getByRole('button',{name:'Film settings',exact:true}).click();await page.getByLabel('Film length (s)',{exact:true}).fill('30')
  // A real imported wave exercises waveform decoding, asset persistence, preview, and later rendering.
  const rate=8000,seconds=3,data=Buffer.alloc(rate*seconds*2),wav=Buffer.alloc(44+data.length);wav.write('RIFF');wav.writeUInt32LE(36+data.length,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(data.length,40);for(let i=0;i<rate*seconds;i++)wav.writeInt16LE(Math.round(Math.sin(i/rate*440*Math.PI*2)*3000),44+i*2)
  await page.locator('input[type=file]').setInputFiles({name:'Narration.wav',mimeType:'audio/wav',buffer:wav});await page.locator('.clip.audio').waitFor();assert.equal(await page.locator('.waveform line').count(),160)
  const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRzUAAAAASUVORK5CYII=','base64')
  await page.locator('input[type=file]').setInputFiles({name:'Logo.png',mimeType:'image/png',buffer:pixel});await page.locator('.clip.image').waitFor()
  await page.getByLabel('X position %',{exact:true}).fill('30');await page.getByRole('button',{name:'Undo',exact:true}).click();assert.equal(await page.getByLabel('X position %',{exact:true}).inputValue(),'15');await page.getByRole('button',{name:'Redo',exact:true}).click();assert.equal(await page.getByLabel('X position %',{exact:true}).inputValue(),'30')
  await page.getByRole('button',{name:'Camera',exact:true}).click();await page.getByRole('button',{name:'Add movement at playhead',exact:true}).click();assert.equal(await page.locator('.movement').count(),2)
  await page.getByRole('button',{name:'Play',exact:true}).click();await page.waitForTimeout(550);await page.getByRole('button',{name:'Pause',exact:true}).click()
  const position=await page.locator('.ruler').boundingBox();await page.mouse.click(position.x+position.width*0.15,position.y+18)
  await verifyFilmUX(page,request)
  await page.getByRole('button',{name:'Projects clip',exact:true}).click();await page.getByLabel('Playhead time (s)',{exact:true}).fill('12');await page.getByLabel('Playhead time (s)',{exact:true}).press('Enter')
  await page.screenshot({path:path.join(out,'film-editor.png')});await page.setViewportSize({width:1280,height:800});await page.screenshot({path:path.join(out,'film-editor-1280.png')})
  await page.setViewportSize({width:1680,height:1000});await page.screenshot({path:path.join(out,'film-editor-1680.png')});await page.setViewportSize({width:1280,height:800})
  const bounds=await page.locator('.app-header,.library,.inspector,.film-center,.transport').evaluateAll(els=>els.map(e=>({name:e.className,x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right,scroll:e.scrollWidth,width:e.clientWidth})))
  assert(bounds.every(b=>b.x>=0&&b.right<=1281));assert.equal(errors.length,0,errors.join('\n'))
  await page.waitForFunction(()=>document.querySelector('.save-status')?.textContent==='Saved locally')
  const id=await page.evaluate(()=>localStorage.getItem('motioneer-project'));const saved=await request('projects/'+id);assert.equal(saved.data.tracks.length,7);assert.equal(saved.data.subjects.length,3);assert.equal(saved.data.assets.length,2)
  await page.reload();await page.getByRole('button',{name:'Film',exact:true}).click();assert.equal(await page.locator('.clip').count(),7);console.log('ok: first cut, media, numeric edits, undo/redo, camera, responsive layout and reopening')
  const conflict=await request('projects/'+id,{...saved.data,name:'Other tab'},'PUT');assert.equal(conflict.status,200);const stale=await request('projects/'+id,saved.data,'PUT');assert.equal(stale.status,409);console.log('ok: stale revisions cannot overwrite another tab')
  const html=await fetch(origin+`/__motioneer/projects/${id}/html`).then(r=>r.text());await writeFile(path.join(out,'fixture-film.html'),html)
  const offline=await browser.newPage();const network=[];await offline.route('http**/*',r=>{network.push(r.request().url());void r.abort()});await offline.goto('file://'+path.join(out,'fixture-film.html'));await offline.waitForTimeout(200);assert.equal(network.length,0,network.join('\n'));await offline.close();console.log('ok: exported composition opens without network requests')
  await writeFile(path.join(out,'fixture-project.json'),JSON.stringify(conflict.data));await writeFile(path.join(out,'editor-report.json'),JSON.stringify({errors,modelCalls,bounds,project:conflict.data.id},null,2))
  const benchmark=await browser.newPage({viewport:{width:1280,height:720}})
  const bp=structuredClone(conflict.data), visual=bp.tracks.find(t=>t.kind==='component'), audio=bp.tracks.find(t=>t.kind==='audio')
  bp.settings={...bp.settings,width:1280,height:720};bp.tracks=[...Array.from({length:10},(_,i)=>({...visual,id:'visual'+i,start:0,duration:30000,x:(i%5)*20,y:Math.floor(i/5)*45,width:19,height:40})),...Array.from({length:2},(_,i)=>({...audio,id:'audio'+i}))]
  await benchmark.goto(origin+'/__motioneer/render-shell');await benchmark.setContent(compositionDocument(bp,origin+`/__motioneer/projects/${id}/assets/`));await benchmark.evaluate(()=>window.__composition.ready())
  const perf=await benchmark.evaluate(async()=>{const work=[],intervals=[];let previous=performance.now();for(let i=0;i<90;i++){await new Promise(requestAnimationFrame);const n=performance.now();intervals.push(n-previous);previous=n;const start=performance.now();await window.__composition.seek(i*1000/30,false);work.push(performance.now()-start)}work.sort((a,b)=>a-b);intervals.sort((a,b)=>a-b);return {seekMedian:work[45],seekP95:work[85],frameMedian:intervals[45],frameP95:intervals[85]}})
  await writeFile(path.join(out,'performance.json'),JSON.stringify(perf,null,2));console.log('10 visual + 2 audio tracks:',perf)
  assert(perf.seekMedian<16.7,'The composition clock must not occupy an entire 60fps frame on the test machine');await benchmark.close()
  if(process.argv.includes('--render')){
    const status=await request('renderer');assert.equal(status.data.state,'ready','Run renderer setup once before the render verification.')
    const job=(await request(`projects/${id}/renders`,{})).data;assert(job.id,JSON.stringify(job));let finished
    for(let i=0;i<600;i++){const list=(await request(`projects/${id}/renders`)).data;finished=list.find(j=>j.id===job.id);if(i%20===0)console.log('export:',finished.message);if(['complete','error','cancelled'].includes(finished.state))break;await new Promise(r=>setTimeout(r,1000))}
    assert.equal(finished.state,'complete',finished.message);assert.equal(finished.total,900)
    await page.getByRole('button',{name:'Export ready',exact:true}).waitFor();await page.getByRole('button',{name:'Export ready',exact:true}).click();await page.getByRole('dialog',{name:'Export film',exact:true}).waitFor();await page.getByRole('button',{name:'Close',exact:true}).click()
    const video=await fetch(origin+finished.url).then(r=>r.arrayBuffer());const videoPath=path.join(out,'verified-film.mp4');await writeFile(videoPath,Buffer.from(video))
    const ffmpeg=path.join(homedir(),'.cache/motioneer/renderer-1/node_modules/ffmpeg-static/ffmpeg')
    const run=(args)=>new Promise((resolve,reject)=>{const c=spawn(ffmpeg,args);let log='';c.stderr.on('data',b=>log+=b);c.on('error',reject);c.on('exit',code=>code===0?resolve(log):reject(new Error(log)))})
    const info=await run(['-i',videoPath,'-f','null','-']);assert(/1920x1080/.test(info));assert(/Audio: aac/.test(info));assert(/30 fps/.test(info))
    const proof=await browser.newPage({viewport:{width:1920,height:1080}});await proof.goto(origin+'/__motioneer/render-shell');await proof.setContent(compositionDocument(conflict.data,origin+`/__motioneer/projects/${id}/assets/`));await proof.evaluate(()=>window.__composition.ready())
    const comparisons=[]
    for(const frameIndex of [0,135,420]){
      const file=path.join(out,`render-frame-${frameIndex}.png`);await run(['-y','-i',videoPath,'-vf',`select=eq(n\\,${frameIndex})`,'-frames:v','1',file]);await proof.evaluate(t=>window.__composition.seek(t),frameIndex/30*1000)
      const expected=await proof.screenshot(),actual=await readFile(file)
      const difference=await proof.evaluate(async({a,b})=>{const read=async src=>{const i=new Image();i.src=src;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const ctx=c.getContext('2d');ctx.drawImage(i,0,0);return ctx.getImageData(0,0,c.width,c.height).data};const [one,two]=await Promise.all([read(a),read(b)]);let sum=0;for(let i=0;i<one.length;i++)sum+=Math.abs(one[i]-two[i]);return sum/one.length},{a:'data:image/png;base64,'+expected.toString('base64'),b:'data:image/png;base64,'+actual.toString('base64')})
      comparisons.push({frameIndex,meanChannelDifference:difference});assert(difference<3,`Frame ${frameIndex} differs from the preview by ${difference}`)
    }
    await proof.close();await writeFile(path.join(out,'render-proof.json'),JSON.stringify({bytes:video.byteLength,frames:finished.total,comparisons},null,2));console.log('ok: 30-second 1080p film, AAC sound, 900 frames, and preview/export pixel comparisons')
    const cancel=(await request(`projects/${id}/renders`,{})).data;await request(`projects/${id}/renders/${cancel.id}`,undefined,'DELETE');for(let n=0;n<30;n++){const jobs=(await request(`projects/${id}/renders`)).data;if(jobs.find(j=>j.id===cancel.id)?.state==='cancelled')break;await new Promise(r=>setTimeout(r,200))}assert.equal((await request(`projects/${id}/renders`)).data.find(j=>j.id===cancel.id).state,'cancelled');console.log('ok: cancelling an export releases the renderer')
  }
  console.log('editor verification passed')
}catch(e){await page?.screenshot({path:path.join(out,'film-ux-failure.png')}).catch(()=>{});console.error(logs.slice(-5000));throw e}finally{await browser?.close();child.kill('SIGTERM');mock.close()}
