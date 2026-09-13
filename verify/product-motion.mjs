import {balanceCaptureSources} from '../tools/editor/hybrid.mjs'
import {createServer} from 'node:http'
import {productReferences} from '../tools/editor/product-reference.mjs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createProject,compositionDocument} from '../dist-core/core.js'
import {reelProject,normalizeReel} from '../tools/editor/kinetic.mjs'
import {MECHANISMS,ACTION_PHASES} from '../tools/editor/product-graphics.mjs'
import {TECHNO} from '../tools/editor/techno.mjs'
import {ACTION_MUSIC} from '../tools/editor/action-score.mjs'
import {musicWav} from '../tools/editor/music.mjs'
import {loadChromium} from '../tools/editor/render.mjs'
const chromium=await loadChromium();if(!chromium){console.log('skip: the local renderer is not installed');process.exit(0)}
const server=createServer((req,res)=>{res.setHeader('content-type','text/html');if(req.url==='/missing'){res.statusCode=404;return res.end('Missing')}res.end('<title>Product docs</title><main><h1>Inbox</h1><p>Received mail becomes a record.</p></main>')})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
try{const url=`http://127.0.0.1:${server.address().port}`;const refs=await productReferences([url]);assert.equal(refs[0].title,'Product docs');assert.match(refs[0].text,/Received mail becomes a record/);await assert.rejects(productReferences([url+'/missing']),/Cannot read product reference/);await assert.rejects(productReferences(['file:\/\/tmp\/test']),/HTTP documentation/)}finally{await new Promise(r=>server.close(r))}
const primary=createProject('Landing'),reference=createProject('Docs')
primary.subjects=Array.from({length:20},(_,i)=>({id:'landing-'+i,w:1200,h:800,name:'Landing '+i}))
reference.subjects=Array.from({length:20},(_,i)=>({id:'docs-'+i,w:1200,h:800,name:'Docs '+i}))
const before=JSON.stringify([primary,reference]),balanced=balanceCaptureSources(primary,[reference])
assert.equal(balanced.subjects.length,12);assert.equal(balanced.subjects.filter(s=>s.id.startsWith('landing-')).length,6);assert.equal(balanced.subjects.filter(s=>s.id.startsWith('docs-')).length,6)
assert.equal(JSON.stringify([primary,reference]),before,'building a contact sheet never mutates the source projects')
assert.equal(balanceCaptureSources(primary,[primary]).subjects.length,12,'repeated source projects do not duplicate entries')
const raw={concept:'Cause and effect',motif:'workflow',palette:['#000000','#e066d9','#ffffff'],scenes:[{type:'impact',text:'Example'},...MECHANISMS.map(motif=>({type:'mechanism',motif,text:'Make it work',labels:['Input','Process','Output','Done'],beats:4})),{type:'type',text:'Ready'},{type:'poster',text:'Run'},{type:'resolve',text:'Example'}]}
const plan=normalizeReel(raw,{brand:'Example',seconds:20}),made=reelProject(createProject('Mechanisms'),plan)
assert.equal(made.cues.length,24)
const mostlyStatic={...raw,scenes:raw.scenes.map((s,i)=>s.type==='mechanism'&&i>1?{...s,type:'diagram'}:s)}
assert.throws(()=>normalizeReel(mostlyStatic,{brand:'Example',minimumMechanisms:2}),/too few timed mechanism scenes/)
assert.doesNotThrow(()=>normalizeReel(raw,{brand:'Example',minimumMechanisms:2}))
for(let i=0;i<6;i++)for(let n=0;n<4;n++)assert.equal(made.cues[i*4+n].at,made.shots[i+1].at+made.shots[i+1].seconds*ACTION_PHASES[n])
const hashes=new Set()
for(const profile of Object.keys({...ACTION_MUSIC,...TECHNO})){
 const args={seconds:4,seed:'same',bpm:144,cuts:[0,1,2,3.5],cues:[{at:1.23,phase:2,mechanism:'workflow'}],music:{profile,root:44,motif:[0,2,4,1]}},score=musicWav(args)
 assert.equal(score.data.length,44+4*48000*4);assert.ok(score.analysis.peak<=.89&&score.analysis.rms>.01)
 assert.deepEqual(score.data,musicWav(args).data)
 assert.notDeepEqual(score.data,musicWav({...args,cues:[{at:1.63,phase:2,mechanism:'workflow'}]}).data,'moving an action changes its audible cue')
 assert.ok(score.events.some(e=>e.kind==='action'&&e.at===1.23))
 hashes.add(createHash('sha256').update(score.data).digest('hex'))
}
assert.equal(hashes.size,12,'action and techno profiles have distinct scores')
const b=await chromium.launch({channel:'chromium'})
try{const page=await b.newPage({viewport:{width:1920,height:1080}});await page.setContent(compositionDocument(made.project));await page.evaluate(()=>window.__composition.ready());for(let i=0;i<6;i++){
 const shot=made.shots[i+1];await page.evaluate(t=>window.__composition.seek(t),(shot.at+shot.seconds*.96)*1000)
 // Inspect the rendered subject iframe, including its paused CSS animations.
 const states=await page.locator('iframe').nth(i+1).evaluate(f=>{const d=f.contentDocument;return [...d.querySelectorAll('.mechanism-step')].map(e=>({opacity:+d.defaultView.getComputedStyle(e).opacity,kind:e.closest('[data-mechanism]')?.getAttribute('data-mechanism')}))})
 const active=states.filter(s=>s.kind===MECHANISMS[i]);assert.ok(active.length>=4&&active.every(s=>s.opacity>.9),MECHANISMS[i]+' completes all actions before the final hold')
 }console.log('Product mechanisms render in the shared composition; all 24 action times and twelve distinct deterministic stereo scores verified.')}finally{await b.close()}
