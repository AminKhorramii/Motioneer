import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {nativeInventory,nativeRevealMs,discoverNativeComponents} from '../tools/editor/native-reel.mjs'
import {normalizeReel,reelProject,requireNativeProof} from '../tools/editor/kinetic.mjs'
import {createProject,compositionDocument} from '../dist-core/core.js'
import {loadChromium} from '../tools/editor/render.mjs'
const brandStyle={family:'Arial',weight:'500',style:'normal',theme:'light',palette:['#111111','#ee5533','#ffffff'],css:''}
const server=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end(`<style>body{margin:0;background:white}.card{width:560px;height:260px;padding:24px;background:#eee;margin:20px}svg{width:32px;height:32px}p{font:24px Arial}</style><main><nav><article class="card"><p>Navigation</p></article></nav>${['Receive request','Assign work'].map(t=>`<article class="card"><svg viewBox="0 0 16 16"><path d="M2 8H14M8 2V14" stroke="black" stroke-width="2"/></svg><h3>${t}</h3><p>Real source content</p><button>Open</button><button>Close</button></article>`).join('')}<article class="card" style="color:white;background:white"><svg viewBox="0 0 16 16"><path d="M2 8H14" stroke="white"/></svg><h3>Invisible source</h3><p>Not readable in isolation</p><span>Hidden words</span></article><article class="card keyboardRow"><svg viewBox="0 0 16 16"><path d="M2 8H14" stroke="black"/></svg><h3>Keyboard demo</h3><p>Partial lighting state</p><button>Key</button></article><article class="card testimonial"><h3>Trusted by everyone</h3><p>Unrelated testimonial</p></article></main>`)})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const b=await(await loadChromium()).launch({channel:'chromium'})
try{
 const url=`http://127.0.0.1:${server.address().port}`,inventory=await nativeInventory({url,brandStyle})
 assert.equal(inventory.captures.length,2);assert.ok(inventory.skipped.some(s=>s.reason.includes('low-contrast')),'unreadable isolated captures are rejected');assert.ok(inventory.captures.every(c=>c.captureMode==='dom'&&c.anchors.length>=2&&!/Navigation|Trusted/.test(c.name)))
 const raw={concept:'Requests become work',motif:'integration',palette:brandStyle.palette,scenes:[{type:'impact',text:'Demo'}, {type:'native-detail',capture:0,anchor:0,text:'Receive',beats:4},{type:'type',text:'Connect'},{type:'native-reveal',capture:1,anchor:1,text:'Assign',beats:4},{type:'poster',text:'Together'},{type:'native-reveal',capture:0,anchor:1,text:'One place',beats:4},{type:'mechanism',motif:'integration',labels:['Request','Connect','Transform','Use'],beats:3},{type:'type',text:'Ready'},{type:'echo',text:'Go'},{type:'resolve',text:'Demo'}]}
 const options={brand:'Demo',seconds:20,bpm:144,native:true,captures:inventory.captures,brandStyle}
 assert.throws(()=>normalizeReel({...raw,scenes:raw.scenes.map(s=>s.type==='native-reveal'?{...s,type:'product'}:s)},options),/native film bar/)
 assert.throws(()=>normalizeReel({...raw,scenes:raw.scenes.map(s=>s.type==='native-detail'?{...s,anchor:99}:s)},options),/unknown detail anchor/)
 requireNativeProof({ok:true},{at:'http://localhost',projectId:'fixture'});assert.throws(()=>requireNativeProof({ok:false,notes:['empty shot']},{at:'http://localhost',projectId:'fixture'}),/empty shot.*project=fixture.*repair/)
 const plan=normalizeReel(raw,options),made=reelProject(createProject('Fixture'),plan,inventory.captures)
 assert.equal(made.project.subjects.length,raw.scenes.length+2,'raw native captures remain in the library')
 assert.equal(made.cues.length,13,'three native action cues per reveal plus mechanism actions')
 assert.equal(nativeRevealMs(2500,144),120000/144,'reveals follow two musical beats')
 assert.equal(made.cues[2].at,made.shots[1].at+nativeRevealMs(made.shots[1].seconds*1000,made.bpm)/1000*.85,'settle accent uses the actual clipping completion time')
 const page=await b.newPage({viewport:{width:1920,height:1080}});await page.route('**/*',r=>r.abort());await page.setContent(compositionDocument(made.project));await page.evaluate(()=>window.__composition.ready())
 for(const [i,s]of plan.scenes.entries())if(s.type.startsWith('native-')){
  await page.evaluate(t=>window.__composition.seek(t),made.shots[i].at*1000+20)
  const bounds=await page.locator('iframe').nth(i).evaluate((f,index)=>{const r=f.contentDocument.querySelector('[data-motion-layer="detail"][data-motion-index="'+index+'"]').getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom}},s.anchor)
  assert.ok(bounds.left>=95&&bounds.right<=1825&&bounds.top>=0&&bounds.bottom<=1080,'macro anchors remain inside the composition')
 }
 const shot=made.shots[1],samples=[]
 for(const offset of[100,shot.seconds*1000-100]){await page.evaluate(t=>window.__composition.seek(t),shot.at*1000+offset);samples.push(await page.locator('iframe').nth(1).evaluate(f=>{const d=f.contentDocument,w=d.defaultView,path=d.querySelector('[data-motion-layer="detail"] path');return{clip:w.getComputedStyle(d.querySelector('.native-window')).clipPath,stroke:w.getComputedStyle(path).stroke,fillOpacity:w.getComputedStyle(path).fillOpacity,title:d.querySelector('h1').textContent}}))}
 assert.notEqual(samples[0].clip,samples[1].clip);assert.notEqual(samples[0].stroke,'rgba(0, 0, 0, 0)');assert.equal(samples[0].fillOpacity,'0');assert.equal(samples[1].fillOpacity,'1');assert.equal(samples[1].stroke,'rgb(0, 0, 0)','stroke-only source icons remain visible after drawing');assert.equal(samples[1].clip,'inset(0px)')
 await page.evaluate(()=>window.__composition.seek(19500));const end=await page.locator('iframe').last().evaluate(f=>({text:f.contentDocument.body.innerText.trim(),children:f.contentDocument.querySelector('.native-finish').children.length,graphics:f.contentDocument.querySelectorAll('svg,img,canvas').length}));assert.deepEqual(end,{text:'Demo',children:1,graphics:0})
 for(const type of ['impact','poster','specimen']){
  const wordless={...plan,scenes:plan.scenes.map((s,i)=>i===2?{...s,type,text:''}:s)},film=reelProject(createProject('Wordless'),wordless,inventory.captures)
  await page.setContent(compositionDocument(film.project));await page.evaluate(()=>window.__composition.ready());await page.evaluate(t=>window.__composition.seek(t),(film.shots[2].at+.35)*1000)
  const art=await page.locator('iframe').nth(2).evaluate((f,type)=>{const w=f.contentWindow,el=f.contentDocument.querySelector('.'+type+'-art,.'+type+'-mark'),style=w.getComputedStyle(el);return{display:style.display,opacity:+style.opacity,shapes:el.querySelectorAll('svg *').length}},type)
  assert.notEqual(art.display,'none',type+' wordless art must survive native cleanup');assert.ok(art.opacity>.1&&art.shapes>0)
 }
 console.log('Native discovery excludes navigation/testimonials; plans require real anchors and distinct sources; offline source paths draw, reveal and settle in the shared renderer with synchronized cues and a clean finish.')
}finally{await b.close();await new Promise(r=>server.close(r))}
