import assert from 'node:assert/strict'
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {createProject,compositionDocument,newTrack} from '../dist-core/core.js'
import {normalizeReel,reelProject} from '../tools/editor/kinetic.mjs'
import {productBrief,groundStory,captureCapabilities} from '../tools/editor/product-brief.mjs'
import {normalizeHandoffs} from '../tools/editor/source-handoffs.mjs'
import {applyMotionPatches,refinementScope,forkProject,connectedTracks} from '../tools/editor/refinement.mjs'
import {normalizeCritique,reviewAndRefine} from '../tools/editor/film-review.mjs'
import {currentEvents,visualClock} from '../tools/editor/film-events.mjs'
import {sampledScore,readSoundKit} from '../tools/editor/sampled-score.mjs'
import {runBenchmark} from '../tools/editor/benchmark.mjs'
import {loadChromium} from '../tools/editor/render.mjs'
import {projectStore} from '../tools/editor/projects.mjs'
import {createServer} from 'node:http'
const temp=await mkdtemp(path.join(tmpdir(),'motioneer-agentic-'))
const fragment='<svg data-motion-layer="detail" data-motion-index="0" style="position:absolute;left:80px;top:70px;width:100px;height:80px" viewBox="0 0 100 80"><path d="M5 40L35 65L95 10" fill="none" stroke="#ff6677" stroke-width="8"/></svg>'
const c={id:'source-a',name:'Review a request',w:900,h:500,captureMode:'dom',css:'',html:`<div style="width:900px;height:500px;background:#223344;position:relative">${fragment}<p data-motion-layer="parts" data-motion-index="0" style="position:absolute;left:230px;top:100px;color:white">A real request</p></div>`,data:'data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="500"><rect width="900" height="500" fill="#223344"/></svg>').toString('base64'),layers:[{id:'target-a',name:'detail',index:0,kind:'vector',tag:'SVG'}],anchors:[{index:0,kind:'svg',selector:'[data-motion-layer="detail"][data-motion-index="0"]',html:fragment,x:80,y:70,w:100,h:80,text:'Review'}],warnings:[]}
const captures=[c,{...c,id:'source-b',name:'Another product component'}],brief=productBrief({brand:'Example',direction:'Make the request travel',captures,references:[{url:'https://example.test/docs',title:'Docs',text:'Requests can be reviewed before work starts. This is a source fact long enough to retain.'}]})
assert.equal(brief.objects[0].capabilities.editableVectors,true);assert.equal(captureCapabilities({data:c.data}).representation,'raster');assert.equal(captureCapabilities({data:c.data}).independentTargets.length,0)
assert.deepEqual(groundStory({steps:[{action:'Claim',evidenceIds:['unknown']}]},brief).steps[0].evidenceIds,[])
const raw={palette:['#112233','#ff6677','#f9f6ef'],scenes:[{id:'open',type:'impact',text:'Example'},{id:'detail',type:'native-reveal',capture:0,anchor:0,text:'Review',layout:'left',choreography:'assemble'},{id:'beat',type:'type',text:'Move'},{id:'result',type:'native-reveal',capture:0,anchor:0,text:'In context',layout:'right',choreography:'assemble'},{id:'pause',type:'poster',text:'Ready'},{id:'other',type:'native-detail',capture:1,anchor:0,text:'Next',layout:'wide',choreography:'macro'},{id:'gesture',type:'grid',text:''},{id:'end',type:'resolve',text:'Example'}]}
const plan=normalizeReel(raw,{brand:'Example',seconds:18,bpm:150,captures}),made=reelProject(createProject('Carry fixture'),plan,captures)
assert.equal(made.transitions.length,1);assert.equal(made.events.filter(e=>e.objectId===made.transitions[0].objectId).length,2)
assert.throws(()=>normalizeHandoffs(raw.scenes.map((s,i)=>i===1?{...s,carry:{to:'other',anchor:0,targetAnchor:0}}:s),plan.scenes,captures),/Cannot carry source object/)
const t=made.project.tracks[1],patches=[{trackId:t.id,css:'.native-scene{opacity:.99}',reason:'Subtle'}]
const group=connectedTracks(made.project,[t.id]),changed=applyMotionPatches(made.project,patches,{trackIds:group});assert.equal(changed.changes.length,1)
assert.deepEqual(changed.project.settings,made.project.settings);assert.deepEqual(changed.project.camera,made.project.camera);assert.deepEqual(changed.project.subjects,made.project.subjects);assert.deepEqual(changed.project.tracks.filter(x=>x.id!==t.id),made.project.tracks.filter(x=>x.id!==t.id));assert.equal(changed.project.motions.length,made.project.motions.length+1);assert.deepEqual(changed.project.motions.slice(0,-1),made.project.motions)
assert.throws(()=>applyMotionPatches(made.project,[{trackId:'unknown',css:'.x{}'}],{trackIds:group}),/unselected/)
assert.throws(()=>applyMotionPatches(made.project,[{trackId:t.id,css:'.x{background:url(https://invalid.test)}'}],{trackIds:group}),/portable/)
assert.throws(()=>refinementScope(made.project,[t.id],[t.id]),/locked/)
made.project.direction.brief=brief;assert.throws(()=>refinementScope(made.project,[t.id]),/both endpoint/)
assert.equal(currentEvents(made.project).status,'renderer-clock');assert.equal(currentEvents(changed.project).status,'stale-or-unavailable')
assert.ok(changed.project.motions.at(-1).css.includes('@media (prefers-reduced-motion: no-preference)'))
assert.throws(()=>applyMotionPatches(made.project,[{trackId:t.id,css:'.x::after{content:"Invented claim"}'}],{trackIds:group}),/portable/)
const retimed=structuredClone(made.project);retimed.tracks[1].start+=100;assert.equal(currentEvents(retimed).events.length,0)
const samples=[{at:made.shots[1].at+.2,label:'Detail'}],issue={trackId:t.id,sampleIndex:0,kind:'clipping',severity:'blocking',detail:'The label is clipped',suggestion:'Reduce its scale'}
assert.equal(normalizeCritique({issues:[{...issue,sampleIndex:99}]},made.shots,samples).status,'incomplete');assert.equal(normalizeCritique({issues:[issue]},made.shots,samples).issues.length,1)
assert.equal(normalizeCritique({issues:[{...issue,trackId:undefined}]},made.shots,[{...samples[0],sampleIndex:0,trackId:t.id}]).issues[0].trackId,t.id)
assert.equal(normalizeCritique({issues:[{...issue,trackId:'incorrect'}]},made.shots,[{...samples[0],trackId:t.id}]).status,'incomplete')
assert.equal(normalizeCritique({issues:[issue]},made.shots,[{...samples[0],phase:'arrival'}]).issues[0].severity,'advisory')
let critiques=0
const result=await reviewAndRefine({at:'fixture',project:made.project,rendered:{file:'old',proof:{ok:true}},shots:made.shots,passes:2},{critique:async()=>({status:'sampled-review-complete',issues:critiques++?[ ]:[issue]}),refine:async()=>({project:made.project,changes:[{}]}),fork:async()=>({...made.project,id:'candidate'}),render:async()=>({url:'new'}),prove:async()=>({file:'new',proof:{ok:true}})})
assert.equal(result.project.id,'candidate');assert.equal(result.review.attempts.length,1)
const failed=await reviewAndRefine({at:'fixture',project:made.project,rendered:{file:'old'},shots:made.shots,passes:2},{critique:async()=>({status:'sampled-review-complete',issues:[issue]}),refine:async()=>({project:made.project,changes:[{}]}),fork:async()=>({...made.project,id:'rejected'}),render:async()=>({url:'new'}),prove:async()=>({file:'bad',proof:{ok:false}})})
assert.equal(failed.file,'old');assert.equal(failed.review.attempts.length,2);assert.equal(failed.review.attempts[0].projectId,'rejected')
const kit={name:'Fixture',provenance:'Generated test tones, no third party recording.',samples:Object.fromEntries(['kick','snare','hat','accent'].map((n,k)=>[n,Float32Array.from({length:4800},(_,i)=>Math.sin(i*(k+1)*.03)*Math.exp(-i/500))]))}
const score=sampledScore({seconds:18,bpm:150,cues:made.cues,cuts:made.shots.map(s=>s.at),kit})
assert.equal(score.data.readUInt32LE(24),48000);assert.equal(score.data.length,44+18*48000*4);assert.ok(score.analysis.peak<=.88);assert.ok(made.cues.every(c=>score.events.some(e=>e.at===c.at)))
assert.deepEqual(sampledScore({seconds:18,bpm:150,cues:made.cues,cuts:made.shots.map(s=>s.at),kit}).data,score.data)
await writeFile(path.join(temp,'sample.wav'),score.data);await writeFile(path.join(temp,'kit.json'),JSON.stringify({name:kit.name,provenance:kit.provenance,samples:{kick:'sample.wav',snare:'sample.wav',hat:'sample.wav',accent:'sample.wav'}}));assert.equal((await readSoundKit(path.join(temp,'kit.json'))).name,'Fixture')
const dry=await runBenchmark({dryRun:true});assert.equal(dry.cases.length,20);assert.ok(dry.cases.every(c=>c.status==='not-run'&&c.revisions.length===3));assert.equal(dry.humanPreference,'unrated')
// The benchmark revises the same target through all three takes, even when later results omit capture metadata.
const benchmarkFile=path.join(temp,'orchestration-fixture.mp4');await writeFile(benchmarkFile,'fixture, not a rendered film');const requested=[]
const benchmark=await runBenchmark({out:path.join(temp,'benchmark'),limit:1},{reel:async()=>({file:benchmarkFile,projectId:made.project.id,proof:{ok:true},shotList:made.shots}),getProject:async()=>made.project,refine:async(name,args)=>{requested.push(args.trackIds);return{file:benchmarkFile,projectId:'take-'+requested.length,shotList:[{trackId:'different'}],proof:{ok:true},changes:[]}}})
assert.equal(benchmark.cases[0].revisions.length,3);assert.deepEqual(requested,[group,group,group]);assert.equal(benchmark.cases[0].humanScores.choreography,null)
// Exercise the same independent asset-copy boundary as a real refinement.
const store=projectStore(path.join(temp,'projects')),server=createServer(async(req,res)=>{try{const parts=req.url.split('?')[0].split('/').filter(Boolean);const chunks=[];for await(const chunk of req)chunks.push(chunk);let body=Buffer.concat(chunks);const id=parts[2];res.setHeader('content-type','application/json');if(req.method==='POST'&&parts.length===2)return res.end(JSON.stringify(await store.create(JSON.parse(body).name)));if(parts[3]==='assets'){if(req.method==='GET'){const a=await store.asset(id,parts[4]);res.setHeader('content-type',a.mime);return res.end(a.data)}return res.end(JSON.stringify(await store.importAsset(id,'score.wav','audio/wav',body)))}if(req.method==='PUT')return res.end(JSON.stringify(await store.save(JSON.parse(body))));res.end(JSON.stringify(await store.read(id)))}catch(e){res.statusCode=500;res.end(e.message)}})
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser
try{
 const original=await store.create('Preserve audio'),asset=await store.importAsset(original.id,'Original voice.wav','audio/wav',score.data),source=await store.save({...made.project,id:original.id,revision:original.revision,assets:[asset],tracks:[...made.project.tracks,{...newTrack('audio','Original voice'),assetId:asset.id,duration:18000}]})
 const copy=await forkProject(`http://127.0.0.1:${server.address().port}`,source);assert.notEqual(copy.id,source.id);assert.deepEqual((await store.asset(copy.id,copy.assets[0].id)).data,score.data);assert.equal(JSON.stringify(await store.read(source.id)),JSON.stringify(source))
 browser=await(await loadChromium()).launch({channel:'chromium'});const page=await browser.newPage({viewport:{width:1920,height:1080}});await page.route('**/*',r=>r.abort());await page.setContent(compositionDocument(made.project));await page.evaluate(()=>window.__composition.ready())
 const link=made.transitions[0],iframe=page.locator('iframe').last()
 for(const [time,point]of [[link.start+.001,link.fromPoint],[link.end-.001,link.toPoint]]){await page.evaluate(t=>window.__composition.seek(t*1000),time);const rect=await iframe.evaluate(f=>{const r=f.contentDocument.querySelector('.carry-object').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}});assert.ok(Math.hypot(rect.x-point.x,rect.y-point.y)<2,JSON.stringify({rect,point}))}
 await page.evaluate(t=>window.__composition.seek(t*1000),(link.start+link.end)/2);const shown=await iframe.evaluate(f=>+f.contentWindow.getComputedStyle(f.contentDocument.querySelector('.carry-object')).opacity);assert.equal(shown,1)
 // A middle source must stay hidden until receipt, hold, then hide again on departure.
 const chainRaw=structuredClone(raw);chainRaw.scenes[5]={...chainRaw.scenes[5],capture:0,choreography:'macro'}
 const chainPlan=normalizeReel(chainRaw,{brand:'Example',seconds:18,bpm:150,captures}),chain=reelProject(createProject('Chained carry'),chainPlan,captures)
 assert.equal(chain.transitions.length,2)
 await page.setContent(compositionDocument(chain.project));await page.evaluate(()=>window.__composition.ready())
 const middle=chain.shots[3],incoming=chain.transitions[0],outgoing=chain.transitions[1],middleFrame=page.locator('iframe').nth(3)
 for(const [time,expected]of [[middle.at+.02,'hidden'],[incoming.end+.03,'visible'],[outgoing.start+.03,'hidden']]){await page.evaluate(t=>window.__composition.seek(t*1000),time);assert.equal(await middleFrame.evaluate(f=>f.contentWindow.getComputedStyle(f.contentDocument.querySelector('[data-motion-layer="detail"]')).visibility),expected)}
 for(const link of chain.transitions)for(const [sceneId,time,point]of [[link.from,link.start-.01,link.fromPoint],[link.to,link.end+.01,link.toPoint]]){
  await page.evaluate(t=>window.__composition.seek(t*1000),time)
  const frame=page.locator('iframe').nth(chain.shots.findIndex(s=>s.sceneId===sceneId)),rect=await frame.evaluate(f=>{const r=f.contentDocument.querySelector('[data-motion-layer="detail"]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})
  assert.ok(Math.hypot(rect.x-point.x,rect.y-point.y)<2,'carry endpoint agrees with the actual source element '+JSON.stringify({rect,point}))
 }
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(t=>window.__composition.seek(t*1000),middle.at+.02)
 assert.equal(await middleFrame.evaluate(f=>f.contentWindow.getComputedStyle(f.contentDocument.querySelector('[data-motion-layer="detail"]')).visibility),'visible')
 console.log('Agentic film: source evidence, immutable scoped edits, locks, recorded cues, bounded review rollback, 20-case benchmark, byte-identical asset copies and measured carry endpoints passed.')
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));await rm(temp,{recursive:true,force:true})}
