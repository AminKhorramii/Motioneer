import assert from 'node:assert/strict'
import {SOURCE_LAYOUTS,SOURCE_MOTIONS,sourceDocument,sourceArrivalMs,captureArrivalMs,sourceDirectionReport,renderedSourceMotion} from '../tools/editor/source-choreography.mjs'
import {normalizeReel,reelProject,prepareReelSource} from '../tools/editor/kinetic.mjs'
import {createProject,compositionDocument} from '../dist-core/core.js'
import {loadChromium} from '../tools/editor/render.mjs'

const image='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><path fill="#ee5533" d="M0 0h300v300H0z"/><path fill="#3366ee" d="M300 0h300v300H300z"/></svg>').toString('base64')
const captures=[{id:'wide',name:'Product canvas',w:1200,h:600,data:image,warnings:[]},{id:'tall',name:'Artwork',w:400,h:600,data:image,warnings:[]}]
const raw={concept:'Source direction',motif:'bezier',palette:['#111111','#ee5533','#ffffff'],scenes:[
 {type:'product',capture:0,text:'Discard opening capture'},
 {type:'product',capture:0,text:'Bring it together',layout:'wide',choreography:'assemble',action:'Image bands assemble'},
 {type:'type',text:'Move'}, {type:'product-detail',capture:1,text:'A closer look',layout:'left',choreography:'macro'},
 {type:'poster',text:'Connect'}, {type:'product-split',capture:1,text:'Into place',layout:'right',choreography:'shuttle'},
 {type:'specimen',text:'Ready'}, {type:'product',capture:0,text:'Discard closing capture'}]}
const plan=normalizeReel(raw,{brand:'Example',seconds:18,bpm:140,captures}),made=reelProject(createProject('Source fixture'),plan,captures)
assert.equal(plan.scenes[0].captureId,undefined);assert.equal(plan.scenes.at(-1).captureId,undefined)
assert.equal(sourceDirectionReport(plan.scenes,captures).sourceShots,3)
assert.equal(made.project.settings.duration,18000)
assert.equal(made.shots.at(-1).at+made.shots.at(-1).seconds,18)
assert.equal(made.cues.length,9)
assert.match(made.shots[1].renderedMotion,/Eight raster bands/)
assert.match(renderedSourceMotion({type:'product',choreography:'macro',action:'A cursor draws retained paths'}),/internal controls stay flat/,'renderer facts cannot inherit invented director behavior')
assert.match(renderedSourceMotion({type:'native-reveal',choreography:'shuttle'}),/retained component travels sideways/)
assert.equal(captureArrivalMs({type:'native-reveal'},1800,150),800,'legacy native plans retain their macro clock')
for(const key of ['layout','choreography'])assert.throws(()=>normalizeReel({...raw,scenes:raw.scenes.map((s,i)=>i===1?{...s,[key]:'invented'}:s)},{brand:'Example',captures}),/Cannot stage the source/)
for(const [i,shot]of made.shots.entries())if(shot.captureId){
 const cue=made.cues.filter(c=>c.at>=shot.at&&c.at<shot.at+shot.seconds).at(-1)
 assert.equal(cue.at,shot.at+captureArrivalMs(plan.scenes[i],shot.seconds*1000,made.bpm)/1000*.85)
 assert.ok(captureArrivalMs(plan.scenes[i],shot.seconds*1000,made.bpm)<shot.seconds*1000*.6,'complete sources have time to read')
}
const report=sourceDirectionReport(Array.from({length:3},()=>({captureId:'wide',layout:'wide',choreography:'macro',beats:4})),captures)
assert.equal(report.warnings.length,2);assert.equal(report.visualReviewRequired,true);assert.equal(report.artisticQuality,'not-certified')


const nativeResult={captures:[{id:'retained'}]},brandStyle={family:'Source',palette:raw.palette}
let nativeReads=0,brandReads=0
const readers={readBrand:async()=>{brandReads++;return brandStyle},readNative:async()=>{nativeReads++;return nativeResult}}
const selected=await prepareReelSource({mode:'auto',domain:'example.test',brandMode:'site'},readers)
assert.equal(selected.mode,'native');assert.equal(selected.preparedNative,nativeResult);assert.equal(selected.brandStyle,brandStyle)
assert.equal(nativeReads,1);assert.equal(brandReads,1,'source preparation is reused, not captured again')
const unavailable={readNative:async()=>{throw new Error('Cannot meet the native film bar: fewer than two usable components.')}}
const fallback=await prepareReelSource({mode:'auto',domain:'example.test',brandMode:'expressive'},unavailable)
assert.equal(fallback.mode,'hybrid');assert.equal(fallback.url,'https://example.test');assert.match(fallback.sourceSelection,/honestly labeled source pixels/)
await assert.rejects(prepareReelSource({mode:'auto',url:'https://example.test'}, {readNative:async()=>{throw new Error('Browser crashed')}}),/Browser crashed/)
assert.equal((await prepareReelSource({mode:'auto',projectId:'existing',url:'https://example.test'},readers)).mode,'hybrid')
assert.equal((await prepareReelSource({mode:'auto'},readers)).mode,'graphic')
assert.equal((await prepareReelSource({mode:'native',url:'https://example.test'},unavailable)).mode,'native','explicit native never auto-falls back')
assert.equal(nativeReads,1,'existing projects and explicit choices do not trigger auto discovery')

const browser=await(await loadChromium()).launch({channel:'chromium'})
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}})
 await page.route('**/*',r=>r.abort())
 for(const capture of captures)for(const layout of SOURCE_LAYOUTS)for(const choreography of SOURCE_MOTIONS){
  const scene={type:'product',layout,choreography,ms:1800,bpm:150,text:'A precise product workflow',tone:'paper'}
  const doc=sourceDocument(scene,plan,capture)
  await page.setContent(`<style>body{margin:0}${doc.css}</style>${doc.html}`)
  await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())))
  const seek=ms=>page.evaluate(t=>document.getAnimations().forEach(a=>{a.pause();a.currentTime=t}),ms)
  await seek(80)
  const moving=await page.locator('.source-art').evaluate(e=>getComputedStyle(e).transform)
  if(choreography==='assemble'){
   const transforms=await page.locator('.source-strip').evaluateAll(es=>es.map(e=>getComputedStyle(e).transform))
   assert.equal(transforms.length,8);assert.ok(new Set(transforms).size>2,'bands move independently')
  }
  await seek(sourceArrivalMs(1800,150)+100)
  const settled=await page.evaluate(()=>{
   const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}}
   return {stage:rect('.source-stage'),title:rect('h1'),art:getComputedStyle(document.querySelector('.source-art')).transform,complete:document.querySelector('.source-complete')?getComputedStyle(document.querySelector('.source-complete')).opacity:null}
  })
  assert.notEqual(moving,settled.art);assert.ok(['none','matrix(1, 0, 0, 1, 0, 0)'].includes(settled.art))
  const {stage,title}=settled
  assert.ok(stage.x>=0&&stage.y>=0&&stage.right<=1920&&stage.bottom<=1080)
  assert.ok(title.x>=0&&title.y>=0&&title.right<=1920&&title.bottom<=1080)
  assert.ok(title.right<=stage.x||title.x>=stage.right||title.bottom<=stage.y||title.y>=stage.bottom,layout+' keeps the title outside the source')
  if(choreography==='assemble')assert.equal(settled.complete,'1','complete source covers band seams after arrival')
 }
 const native={...captures[0],html:'<div style="width:1200px;height:600px"><svg width="100" height="100" data-motion-layer="parts" data-motion-index="1"><path d="M0 0h100v100H0z" fill="#ee5533"/></svg><p data-motion-layer="parts" data-motion-index="2">Original source text</p></div>',css:''}
 const doc=sourceDocument({layout:'wide',choreography:'assemble',ms:1800,bpm:150,text:'Assemble',tone:'dark'},plan,native,{native:true})
 await page.setContent(`<style>body{margin:0}${doc.css}</style>${doc.html}`)
 await page.evaluate(()=>document.getAnimations().forEach(a=>{a.pause();a.currentTime=1000}))
 assert.equal(await page.locator('.source-fit p').innerText(),'Original source text')
 assert.equal(await page.locator('.source-fit path').getAttribute('d'),'M0 0h100v100H0z')
 assert.equal(await page.locator('.source-fit p').evaluate(e=>getComputedStyle(e).opacity),'1')
 await page.emulateMedia({reducedMotion:'reduce'})
 assert.equal(await page.evaluate(()=>document.getAnimations().length),0)
 await page.emulateMedia({reducedMotion:'no-preference'})
 await page.setContent(compositionDocument(made.project));await page.evaluate(()=>window.__composition.ready())
 await page.evaluate(()=>window.__composition.seek(17500))
 const ending=await page.locator('iframe').last().evaluate(f=>({text:f.contentDocument.body.innerText.trim(),graphics:f.contentDocument.querySelectorAll('svg,img,canvas').length,background:f.contentWindow.getComputedStyle(f.contentDocument.querySelector('.native-finish')).backgroundColor}))
 assert.deepEqual(ending,{text:'Example',graphics:0,background:'rgb(17, 17, 17)'})
 console.log('Source choreography: 18 source compositions settle inside the canvas, titles remain separate, bands and retained parts animate, reduced motion holds, 18-second timing and cue clocks match, and the hybrid finish is clean. Quality stays advisory.')
}finally{await browser.close()}
