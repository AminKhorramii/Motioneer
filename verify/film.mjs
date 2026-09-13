/**
 * The autonomous film path, from a url to an MP4, with no network and a fake model.
 *
 * It drives the real thing: a real studio proxying a local site, the real editor headless, the
 * real gates, and the real renderer. Only the site and the model are stand-ins, so what this
 * proves is the orchestration in tools/editor/autofilm.mjs rather than a fixture of it. It needs
 * the renderer installed, the same as an export does, and it is not part of verify:all for that
 * reason; run it with `node verify/film.mjs`.
 */
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import assert from 'node:assert'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { autofilm, inspectSite, renderProject, revise as reviseFilm } from '../tools/editor/autofilm.mjs'
import { candidates, reveal } from '../tools/editor/survey.mjs'
import { componentBrief, briefStyles } from '../shared/component-brief.mjs'
import { reviewFilm } from '../tools/editor/review.mjs'
import {websiteBrand,publicBrand} from '../tools/editor/brand.mjs'
import {ART,artStyles} from '../tools/editor/art-direction.mjs'
import {MUSIC,musicWav} from '../tools/editor/music.mjs'
import {rescoreFilm} from '../tools/editor/rescore.mjs'
import { withSoundtrack, scoreStyle, scoreWav } from '../tools/editor/soundtrack.mjs'
import { loadChromium } from '../tools/editor/render.mjs'
import {normalizeReel,reelProject,kineticReel} from '../tools/editor/kinetic.mjs'
import {websiteMedia} from '../tools/editor/media-source.mjs'
import {captureInventory} from '../tools/editor/hybrid.mjs'
import {SCENES} from '../tools/editor/kinetic-scenes.mjs'
import { proveFilm } from '../tools/editor/proof.mjs'
import { firstCut, createProject, compositionDocument } from '../dist-core/core.js'

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)))
if (!(await loadChromium())) { console.log('skip: the local renderer is not installed, so the film path cannot be exercised here'); process.exit(0) }

// Musical identities must sound different with the same notes, and a 20-second score must resolve.
{
  const scores=Object.keys(MUSIC).map(profile=>musicWav({seconds:4,seed:'same phrase',bpm:120,cuts:[1,2,3.3],music:{profile,root:45,motif:[0,2,4,1]}}))
  for(const score of scores){
    assert.equal(score.data.readUInt32LE(24),48000,'signature scores use 48 kHz stereo audio')
    assert.ok(score.analysis.peak<=.861&&score.analysis.rms>.03,'the score is audible and has peak headroom')
    assert.equal(score.data.readInt16LE(44),0,'the entrance starts without a discontinuity')
    assert.ok(Math.abs(score.data.readInt16LE(score.data.length-4))<10,'the cadence tail reaches silence')
  }
  for(let i=0;i<scores.length;i++)for(let j=0;j<i;j++)assert.notDeepEqual(scores[i].data,scores[j].data,'different orchestration changes the actual audio')
  assert.deepEqual(scores[0].data,musicWav({seconds:4,seed:'same phrase',bpm:120,cuts:[1,2,3.3],music:{profile:'glass',root:45,motif:[0,2,4,1]}}).data,'a saved phrase renders deterministically')
  const techno=musicWav({seconds:4,seed:'same phrase',bpm:156,cuts:[1,2,3.3],music:{profile:'acidline',root:45,motif:[0,2,4,1]}})
  assert.ok(techno.data.equals(musicWav({seconds:4,seed:'same phrase',bpm:156,cuts:[1,2,3.3],music:{profile:'acidline',root:45,motif:[0,2,4,1]}}).data),'techno repeats the exact saved phrase')
  assert.ok(!techno.data.equals(musicWav({seconds:4,seed:'same phrase',bpm:144,cuts:[1,2,3.3],music:{profile:'acidline',root:45,motif:[0,2,4,1]}}).data),'tempo changes the performed groove')
  const extended=musicWav({seconds:20,seed:'twenty',bpm:120,cuts:[2,4,8,12,18],music:{profile:'prism'}})
  assert.equal(extended.data.length,44+20*48000*4,'twenty seconds includes the whole final tail')
  assert.equal(extended.events.at(-1).at,18,'the cadence lands on the closing scene')
  assert.ok(extended.waveform.slice(108).some(v=>v>.1),'the longer score has a composed ending rather than silent padding')
  let delivered
  const upload=createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);delivered=Buffer.concat(chunks);res.setHeader('content-type','application/json');res.end(JSON.stringify({id:'score',name:new URL(req.url,'http://local').searchParams.get('name'),kind:'audio',mime:'audio/wav'}))})
  await new Promise(r=>upload.listen(0,'127.0.0.1',r))
  try{
    const p=createProject('range');p.settings={...p.settings,duration:8000,from:2000,to:7000};p.source='range'
    p.tracks=[{id:'a',kind:'component',start:0,duration:4000},{id:'b',kind:'component',start:0,duration:3000,after:{key:'a',mode:'after',gap:0}}]
    const take=await withSoundtrack(p,{at:`http://127.0.0.1:${upload.address().port}`,style:'signature',bpm:120,music:{profile:'glass'}})
    assert.equal(take.tracks.at(-1).start,2000);assert.equal(take.tracks.at(-1).duration,5000)
    assert.equal(delivered.length,44+5*48000*4,'an exported subrange receives exactly its own audio duration')
    const expected=musicWav({seconds:5,seed:'range',bpm:120,cuts:[-2,2],music:{profile:'glass'}})
    assert.deepEqual(delivered,expected.data,'musical accents follow resolved linked timing inside the export range')
  }finally{await new Promise(r=>upload.close(r))}
  console.log('ok: twenty-two musical identities render distinct, deterministic stereo scores with a complete 20-second cadence')
}

// Product carousel posters remain real source assets even when their slides are hidden.
{
  let saved
  const source=createServer(async(req,res)=>{
    if(req.url==='/brand-font.woff2'){res.setHeader('content-type','font/woff2');return res.end(await readFile(new URL('../tools/editor/fonts/syne.woff2',import.meta.url)))}
    if(req.url==='/brand'){res.setHeader('content-type','text/html');return res.end(`<style>@font-face{font-family:SourceBrand;src:url('/brand-font.woff2');font-weight:100 900}:root{--color-accent:#7788ff}body{background:#0b0b0f;color:#f6f6fa;font-family:SourceBrand}h1{font-weight:530}</style><h1>Source typography</h1>`)}
    if(req.url==='/a.svg'||req.url==='/b.svg'){res.setHeader('content-type','image/svg+xml');return res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="white"/><rect x="70" y="60" width="500" height="280" fill="${req.url==='/a.svg'?'#8855dd':'#228866'}"/><text x="120" y="210" font-size="50" fill="white">Product preview</text></svg>`)}
    if(req.method==='POST'){res.setHeader('content-type','application/json');return res.end(JSON.stringify(createProject('poster fixture')))}
    if(req.method==='PUT'){let body='';for await(const c of req)body+=c;saved=JSON.parse(body);res.setHeader('content-type','application/json');return res.end(JSON.stringify(saved))}
    if(req.url==='/images'){res.setHeader('content-type','text/html');return res.end('<img src="/a.svg" alt="Vector editing canvas" style="width:500px"><img src="/b.svg" alt="Brush controls" style="width:500px"><img src="/b.svg" alt="Customer headshot" style="width:500px">')}
    res.setHeader('content-type','text/html');res.end('<video poster="/a.svg"></video><video style="display:none" poster="/b.svg"></video><video poster="/customer-story.svg"></video>')
  })
  await new Promise(r=>source.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${source.address().port}`
  try{
    const id=await websiteMedia({at:origin,url:origin})
    assert.equal(id,saved.id);assert.equal(saved.subjects.length,2,'hidden product previews are discovered while customer stories are excluded')
    assert.ok(saved.subjects.every(s=>s.html.includes('data:image/png;base64,')&&s.warnings[0].includes(origin)),'source pixels and original media URLs survive the import')
    const inventory=await captureInventory(saved,{at:origin})
    assert.equal(inventory.captures.length,2,'imported product previews survive composition snapshotting')
    const blank={...createProject('blank'),subjects:[{id:'blank',name:'Empty white card',html:'<div style="background:white;width:640px;height:400px"></div>',css:'',w:640,h:400,warnings:[]} ]}
    await assert.rejects(()=>captureInventory(blank,{at:origin}),/render empty/,'a uniformly empty source card cannot become a hybrid product shot')
    const imageProject=await websiteMedia({at:origin,url:origin+'/images'})
    assert.equal(imageProject,saved.id);assert.equal(saved.subjects.length,2)
    assert.deepEqual(saved.subjects.map(s=>s.name),['Vector editing canvas','Brush controls'],'published images retain semantic names and skip portraits')
    const identity=await websiteBrand({url:origin+'/brand'})
    assert.equal(identity.family,'SourceBrand');assert.equal(identity.weight,'530');assert.deepEqual(identity.palette,['#0b0b0f','#7788ff','#f6f6fa']);assert.ok(identity.css.includes('data:font/woff2;base64,'));assert.ok(!('css' in publicBrand(identity)),'font payload stays out of agent-facing brand metadata')
    const rawBrand={palette:['#111111','#ff8844','#eeeeee'],motif:'orbit',scenes:SCENES.map(type=>({type,text:'Source',beats:2}))}
    const matched=normalizeReel(rawBrand,{brand:'Source',brandStyle:identity,art:'editorial'})
    assert.deepEqual(matched.palette,identity.palette,'source palette wins over invented director colors')
    assert.deepEqual(normalizeReel(rawBrand,{brand:'Source',brandStyle:identity,palette:rawBrand.palette}).palette,rawBrand.palette,'an explicit palette remains an intentional override')
    const branded=reelProject(createProject('Brand'),matched);assert.ok(branded.project.motions.every(m=>m.css.includes(identity.css)),'source typography wins over art presets in the composition')
    console.log('ok: hidden website product posters retain their source pixels, and empty captures are rejected')
  }finally{await new Promise(r=>source.close(r))}
}

// Concurrent prompts keep their saved creative work while the shared export slot is busy.
{
  let starts=0, cancelled=false
  const queue=createServer((req,res)=>{
    res.setHeader('content-type','application/json')
    if(!req.url.endsWith('/renders'))return res.end(JSON.stringify({tracks:[{kind:'component',motionId:'graphic'}],motions:[{id:'graphic',scope:'data-kinetic'}]}))
    if(req.method==='POST'){
      if(++starts===1){res.statusCode=409;return res.end(JSON.stringify({error:'An export is already running. Wait for it or cancel it first.'}))}
      return res.end(JSON.stringify({id:'export'}))
    }
    res.end(JSON.stringify([{id:'export',state:cancelled?'cancelled':'complete',url:'/film.mp4',done:1,total:1}]))
  })
  await new Promise(r=>queue.listen(0,'127.0.0.1',r))
  const origin=`http://127.0.0.1:${queue.address().port}`,steps=[]
  try {
    const rendered=await renderProject(origin,'saved-project',m=>steps.push(m))
    assert.equal(starts,2);assert.equal(rendered.url,origin+'/film.mp4')
    assert.ok(steps.some(s=>s.includes('Your film is saved')),'queue feedback explains that generation is preserved')
    cancelled=true
    await assert.rejects(()=>renderProject(origin,'saved-project'),/export was cancelled/)
    await assert.rejects(()=>reviseFilm({at:origin,projectId:'saved-project',pace:'fast'}),/authored graphic reel/)
    assert.equal(starts,3,'capture revision refuses an authored reel before a save or export')
    console.log('ok: competing prompts wait for export capacity and cancellation reports immediately')
  } finally {await new Promise(r=>queue.close(r))}
}

// Linear's frozen pixels and mobile copy occupied the prompt before its desktop panels appeared.
{
  const markup='<div><div style="display:none"><p>Hidden mobile copy</p></div><img src="data:image/png;base64,'+'a'.repeat(50000)+'"><svg><path d="'+'x'.repeat(50000)+'"></path></svg><section class="desktop"><h2 title="a > b">Visible review panels</h2><p>Actual product content</p></section></div>'
  const brief=componentBrief(markup)
  assert.ok(brief.includes('Visible review panels')&&brief.includes('Actual product content')&&!brief.includes('Hidden mobile copy')&&!brief.includes('data:image'),'the model sees the visible content after embedded assets')
  assert.ok(brief.length<1000 && brief.endsWith('</div>'))
  assert.ok(briefStyles('@font-face{src:url("data:font/woff2;base64,'+'a'.repeat(9000)+'")} .desktop{color:red}').includes('.desktop{color:red}'))
  const browser=await(await loadChromium()).launch({channel:'chromium'})
  try {
    const page=await browser.newPage({viewport:{width:1280,height:900}})
    await page.setContent(`<body style="margin:0"><h1>Product for teams</h1><div style="display:flex;flex-wrap:wrap">${Array.from({length:55},(_,i)=>`<article class="card" style="width:210px;height:115px"><h3>Issue ${i}</h3><p>Small task</p></article>`).join('')}</div><section><h2>Planning and monitoring</h2><div class="product-illustration" style="width:1000px;height:620px"><p>Roadmap</p><p>Milestones</p><p>Cycle time</p><svg></svg></div></section><section><h2>AI and automations</h2><div class="agent-preview" style="width:1000px;height:620px"><p>Agent one</p><p>Agent two</p><p>Review</p></div></section></body>`)
    const found=await candidates(page)
    assert.ok(found.some(c=>c.scene&&c.text==='Planning and monitoring product interface'),'a complete scene is found after more than forty cards')
    assert.ok(found.some(c=>c.scene&&c.text==='AI and automations product interface'),'later sections receive attention')
    assert.ok(found.some(c=>c.scene&&c.matchText==='Roadmap Milestones Cycle time'),'a scene keeps its actual text so it can be found after the page rerenders')
    assert.ok(found.length<=32 && found.filter(c=>c.text==='Cycle time').length===0,'inner controls do not replace a complete scene')
    // A brand reel is authored scene animation, with safe copy and deterministic scrubbing.
    const raw={concept:'Connected ideas',motif:'nodes',palette:['#101319','#aaff77','#fff8ee'],scenes:SCENES.map((type,i)=>({type,text:i===1?'Build <script>':'Build together',beats:2,tone:'dark'}))}
    const named=normalizeReel(raw,{brand:'Figma',concept:'Paper &amp; Ink',seconds:20,art:'editorial'})
    const fast=normalizeReel(raw,{brand:'Linear',seconds:20,bpm:153,music:'fracture'})
    const timed=reelProject(createProject('Tempo'),fast)
    assert.equal(timed.bpm,153);assert.equal(timed.shots.at(-1).at+timed.shots.at(-1).seconds,20)
    for(const shot of timed.shots)assert.ok(Math.abs(shot.at*153/60-Math.round(shot.at*153/60))<.01,'cuts stay on whole musical beats')
    assert.throws(()=>normalizeReel(raw,{brand:'Linear',seconds:20,bpm:0}),/tempo/)
    const sourceClips=[{id:'source'}],hybridRaw={...raw,scenes:raw.scenes.map((s,i)=>[3,6,9].includes(i)?{...s,type:'product',capture:0}:s)}
    const synced=normalizeReel(hybridRaw,{brand:'Linear',seconds:20,bpm:159,captures:sourceClips})
    assert.ok(synced.scenes.filter(s=>s.type==='product').every(s=>s.beats>=4),'fast music leaves readable source holds')
    assert.throws(()=>normalizeReel(hybridRaw,{brand:'Linear',seconds:6,bpm:80,captures:sourceClips}),/Cannot fit/)
    assert.equal(named.concept,'Paper & Ink');assert.equal(named.scenes[0].text,'Figma');assert.equal(named.scenes.at(-1).text,'Figma','a collection title never replaces its brand cards')
    const wordless=normalizeReel({...raw,scenes:raw.scenes.map(s=>({...s,text:s.type==='echo'?'':s.text}))},{brand:'Example',seconds:6})
    assert.equal(wordless.scenes.find((_,i)=>raw.scenes[i].type==='echo').type,'grid','a wordless type beat becomes visible geometry rather than an empty frame')
    const reelPlan=normalizeReel(raw,{brand:'Example',domain:'example.com',seconds:6})
    const made=reelProject(createProject('fixture'),reelPlan)
    const longer=reelProject(createProject('twenty'),normalizeReel(raw,{brand:'Example',seconds:20,music:'prism'}))
    assert.equal(longer.project.tracks.at(-1).start+longer.project.tracks.at(-1).duration,20000,'twenty-second reels preserve a complete closing scene')
    assert.equal(made.project.settings.fps,60);assert.equal(made.shots.length,SCENES.length)
    assert.equal(made.project.tracks.at(-1).start+made.project.tracks.at(-1).duration,6000,'authored scenes fill the requested duration exactly')
    assert.throws(()=>normalizeReel(raw,{brand:'Example',seconds:6,palette:['red']}),/three hex colors/)
    assert.ok(made.project.subjects[1].html.includes('&lt;script&gt;'),'creative copy is escaped as text')
    await page.setContent(compositionDocument(made.project))
    await page.evaluate(()=>window.__composition.ready())
    const sample=async t=>{await page.evaluate(t=>window.__composition.seek(t),t);await page.waitForTimeout(40);return page.screenshot()}
    // Art direction has to reach the composition, including portable fonts and new geometry.
    for(const art of Object.keys(ART)){
      const styled=reelProject(createProject(art),normalizeReel(raw,{brand:'Figma',seconds:20,art}))
      assert.ok(styled.project.motions.every(m=>m.css.includes('data:font/woff2;base64,')),'display fonts travel with every authored scene')
      assert.notEqual(artStyles(art),artStyles('missing'),'each valid direction has a real material and type treatment')
    }
    const early=await sample(40),late=await sample(240),again=await sample(40)
    assert.notDeepEqual(early,late,'graphic scenes visibly animate inside a shot')
    assert.deepEqual(early,again,'scrubbing a graphic scene returns to the same pixels')
    assert.equal(await page.locator('[data-track]').count(),SCENES.length,'each scene remains an editable timeline clip')
    const rhythm=scoreWav({seconds:2,style:'percussive',seed:'Example',cuts:[.4,.8,1.2],bpm:150})
    assert.ok(rhythm.waveform.some(v=>v>.1)&&rhythm.waveform.every(v=>v<=.73),'percussion is audible without clipping')
    console.log('ok: kinetic scenes animate and scrub deterministically, escape copy, fill the timeline and carry a bounded percussion score')
    await page.setContent('<style>@keyframes entry{from{translate:0 80px}to{translate:0 0}}#panel{animation:entry 5s both}</style><div id="panel">A settling interface</div>')
    await reveal(page.locator('#panel'))
    assert.equal(await page.locator('#panel').evaluate(el=>getComputedStyle(el).translate),'0px','capture waits for a finite source entrance to reach its resting state')
    const missingAt=Date.now();await reveal(page.locator('#removed-by-rerender'))
    assert.ok(Date.now()-missingAt<1500,'a removed reference does not spend the default locator timeout per candidate')
  } finally {await browser.close()}
  console.log('ok: complete product scenes survive a long page and the model reads visible structure instead of embedded pixels')
}

// the cut's rhythm, before any browser: fast means many short shots and short titles
{
  const p = createProject('pace'); p.subjects = [{ id: 'a', name: 'A', html: '<b>a</b>', css: '', w: 100, h: 50, warnings: [] }, { id: 'b', name: 'B', html: '<b>b</b>', css: '', w: 100, h: 50, warnings: [] }]
  p.motions = [{ id: 'ma', subjectId: 'a', css: '', scope: 'x', note: '', brief: p.brief, treatment: 'subtle', duration: 500, saved: true }, { id: 'mb', subjectId: 'b', css: '', scope: 'x', note: '', brief: p.brief, treatment: 'subtle', duration: 500, saved: true }]
  const calm = firstCut(p), fast = firstCut(p, { pace: 'fast', seconds: 12, opening: 'Hello', closing: 'Bye' })
  const light = firstCut(p, { background: '#f7f7f8' }), dark = firstCut(p, { background: '#0b0c10' })
  assert.equal(light.settings.background, '#f7f7f8'); assert.equal(light.tracks[0].color, '#111318', 'dark ink on a light ground')
  assert.equal(dark.tracks[0].color, '#f4f4f5', 'light ink on a dark ground'); assert.equal(calm.settings.background, p.settings.background, 'no background given leaves the project\'s own')
  const shotsOf = (c) => c.tracks.filter((t) => t.kind === 'component')
  assert.equal(shotsOf(calm).length, 2, 'calm places each kept motion once')
  assert.ok(shotsOf(fast).length >= 7, `fast fills 12 seconds with short shots, got ${shotsOf(fast).length}`)
  assert.ok(shotsOf(fast).every((t) => t.duration <= 1800), 'every fast shot is under 1.8 seconds')
  assert.equal(fast.tracks[0].text, 'Hello'); assert.equal(fast.tracks.at(-1).text, 'Bye')
  assert.ok(fast.tracks[0].duration <= 1200 && fast.settings.duration === 12000, 'fast titles are short and the length is what was asked')
  assert.notDeepEqual([shotsOf(fast)[0].x, shotsOf(fast)[0].width], [shotsOf(fast)[2].x, shotsOf(fast)[2].width], 'a repeated element is framed differently so it cuts rather than freezes')
  assert.ok(shotsOf(fast).every((t) => t.moves.length === 1 && t.moves[0].duration === t.duration), 'every fast shot keeps moving across its whole length')
  assert.ok(shotsOf(calm).every((t) => t.moves.length === 0), 'a calm shot holds still, the way the editor\'s button always did')
  {
    // sized like real elements, since the cut refuses to blow a tiny one up into a blur
    const real = { ...p, subjects: p.subjects.map((x) => ({ ...x, w: 900, h: 500 })) }
    const scened = firstCut(real, { pace: 'fast', seconds: 12, scenes: [{ ids: ['a'], layout: 'full', hold: 'long' }, { ids: ['a', 'b'], layout: 'pair' }, { ids: ['b', 'a'], layout: 'stack', hold: 'short' }, { ids: ['b'], layout: 'detail' }] })
    const comps = shotsOf(scened), starts = [...new Set(comps.map((t) => t.start))]
    assert.ok(comps.length > starts.length, 'a pair or a stack puts two elements in one shot')
    const pair = comps.filter((t) => t.start === starts[1])
    assert.equal(pair.length, 2, 'the second scene is a pair'); assert.ok(pair[0].x < 50 && pair[1].x >= 50, 'a pair sits side by side'); assert.equal(pair[1].entrance, 160, 'the second of a pair arrives a beat later')
    const first = comps.filter((t) => t.start === starts[0])[0], third = comps.filter((t) => t.start === starts[2])[0]
    assert.ok(first.duration > third.duration, 'a long hold outlasts a short one')
    assert.ok(comps.some((t) => t.width > 80), 'a detail scene is framed close')
    const big = createProject('cap'); big.subjects = [{ id: 'tiny', name: 'T', html: '<b>t</b>', css: '', w: 200, h: 100, warnings: [] }]; big.motions = [{ id: 'mt', subjectId: 'tiny', css: '', scope: 'x', note: '', brief: big.brief, treatment: 'subtle', duration: 500, saved: true }]
    const capped = shotsOf(firstCut(big))[0]
    assert.ok(capped.width * 1920 / 100 <= 200 * 2.4 + 1, `a small element is not blown up past 2.4 times, box was ${capped.width}%`)
    const eight = Array.from({ length: 8 }, (_, k) => ({ ids: [k % 2 ? 'b' : 'a'], layout: 'full' }))
    const trusted = firstCut(real, { pace: 'fast', seconds: 15, scenes: eight }), padded = firstCut(real, { pace: 'fast', seconds: 15, scenes: eight.slice(0, 3) })
    assert.equal(new Set(shotsOf(trusted).map((t) => t.start)).size, 8, 'a plan near the beat count keeps its scenes rather than repeating')
    assert.ok(new Set(shotsOf(padded).map((t) => t.start)).size >= 9, 'a plan well short of the beat cycles to fill the length')
    assert.ok(shotsOf(trusted).every((t) => t.duration <= 1800), 'stretched shots stay fast')
    console.log('ok: scenes cut into layouts and holds, a pair sits side by side, a small element is not blown up into a blur, and a full plan is not padded with repeats')
  }
  console.log('ok: the cut is paced: calm places each motion once, fast fills the length with short shots and short titles')
}

const port = Number(process.env.MOTIONEER_PORT || 4397), at = `http://localhost:${port}`
const temp = await mkdtemp(path.join(tmpdir(), 'motioneer-film-'))
await mkdir(path.join(temp, '.studio'), { recursive: true })

// how many model turns carried a picture, since the planner is meant to see the page
let sheets = 0, refusedCalls = 0, recoveredCalls = 0

const prompts = []
const model = createServer(async (req, res) => {
  let body = ''; for await (const b of req) body += b
  const turn = JSON.parse(body).messages.at(-1).content
  // a turn with pictures is an array of parts; the words are the text part, and the pictures are counted for the check below
  const prompt = typeof turn === 'string' ? turn : turn.filter((p) => p.type === 'text').map((p) => p.text).join('\n')
  if (Array.isArray(turn) && turn.some((p) => p.type === 'image_url')) sheets++
  prompts.push(prompt)
  if (/"opening"/.test(prompt)) {
    // the plan: the second and first candidates, words taken from the page, a direction for each
    // the card and the block, which is what a real page offers: things with area, not thin lines of text
    // chosen by what the lines say rather than by position, since the page's order is not the point being tested
    const lines = prompt.split('\n').map((l) => /^(\d+): (.*)$/.exec(l)).filter(Boolean)
    const card = Number(lines.find((m) => /Everything in one place/.test(m[2]))?.[1]), block = Number(lines.find((m) => /hero in/.test(m[2]) && /520x220/.test(m[2]))?.[1])
    const plan = { indices: [card, block], product: 'a board for shipping teams', opening: 'Ship it with confidence', closing: 'Get started today', directions: { [card]: 'the heading lands, then the button settles last', [block]: 'the block rises as one piece' },
      scenes: [{ elements: [card], layout: 'full', hold: 'long' }, { elements: [card, block], layout: 'pair', hold: 'normal' }, { elements: [block], layout: 'detail', hold: 'short' }] }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    return res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: JSON.stringify(plan) } }] }) + '\n\ndata: [DONE]\n\n')
  }
  const kind = /Treatment: bold/.test(prompt) ? 'bold' : /Treatment: subtle/.test(prompt) ? 'subtle' : 'expressive'
  // the root arrives and its parts follow, the way a gated motion does; a sheet that moved only children would leave a childless block popping in
  let css = '@media (prefers-reduced-motion: no-preference){[data-mn]{animation:rise 900ms ease-out both}[data-mn] > *{animation:rise 900ms ease-out both}'
    + '[data-mn] > :nth-child(2){animation-delay:120ms}[data-mn] > :nth-child(3){animation-delay:240ms}@keyframes rise{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}}'
  // Both server attempts fail first. The editor retry must wait for its new task, not read the old failure.
  if (/Everything in one place/.test(prompt) && refusedCalls < 2) {
    refusedCalls++
    css = '@media (prefers-reduced-motion: no-preference){:root{animation:bad 900ms both}@keyframes bad{from{opacity:0}to{opacity:1}}}'
  } else if (/A previous attempt was refused/.test(prompt)) { recoveredCalls++; await new Promise(r=>setTimeout(r,800)) }
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: JSON.stringify({ css, scope: 'data-mn', note: kind + ' rise' }) } }] }) + '\n\ndata: [DONE]\n\n')
})
await new Promise((r) => model.listen(0, '127.0.0.1', r))
const modelAt = `http://127.0.0.1:${model.address().port}`

const site = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' })
  if(req.url==='/missing')return res.end('<html><title>Not found</title><body><h1>Page not found</h1><p>This is an error page with enough words to look like normal content. Try the homepage for the real product.</p></body></html>')
  if(req.url==='/dutch')return res.end('<html lang="nl-NL"><body><h1>Een product voor teams</h1><a href="/en-nl">English</a><p>Dit is een Nederlandse pagina voor een product, met een bestaande link naar de Engelse versie van dezelfde website.</p></body></html>')
  if(req.url==='/en-nl')return res.end('<html lang="en-NL"><title>English product</title><style>@media(prefers-color-scheme:dark){body{background:#101319;color:white}}</style><body><h1>A product for teams</h1><p>The English product page, linked from the Dutch page. A reliable film follows the existing language link instead of guessing a URL that might not exist.</p></body></html>')
  res.end(`<!doctype html><html><body style="margin:0;padding:40px;background:#eef1f6;font:16px system-ui;color:#1a2233">
    <h1 style="font-size:44px;margin:0 0 24px">Ship it with confidence</h1>
    <article class="card" style="width:520px;padding:28px;background:#fff;border-radius:16px;box-shadow:0 20px 60px #0002;margin-bottom:24px">
      <style>@keyframes card-surface-in { from { opacity: 1; transform: scale(0.98); } }</style>
      <h2 style="margin:0 0 10px">Everything in one place</h2><p style="color:#5b6472">Your team's work, on one board.</p>
      <button style="margin-top:12px;background:#4f56d6;color:#fff;border:0;padding:12px 22px;border-radius:10px">Get started</button>
    </article>
    <div class="hero-image" style="width:520px;height:220px;margin:18px 0 0;border-radius:16px;background:linear-gradient(135deg,#6b73e6,#c98bb0)"></div>
    <article class="card" style="position:relative;width:520px;margin-top:24px;padding:24px;background:#fff;border-radius:12px"><h3 style="margin:0">Triage feedback</h3><a class="cardAnchor" aria-label="Open" href="#" style="position:absolute;inset:0">&nbsp;</a></article>
    <div style="width:300px;margin-top:24px;padding:24px;background:#151821;border-radius:12px"><div class="cardContent" style="color:#fff"><h3 style="margin:0">White on dark</h3><p style="margin:8px 0 0;color:#cfd3dc">Reads only on its ground.</p></div></div>
  </body></html>`)
})
await new Promise((r) => site.listen(0, '127.0.0.1', r))
const siteAt = `http://127.0.0.1:${site.address().port}`

await writeFile(path.join(temp, '.studio/model.json'), JSON.stringify({ provider: 'openai', base: modelAt + '/v1', model: 'fixture', key: 'fixture', chosen: true }))
// started on nothing on purpose: a studio left open on a folder is the state that once made a film time out
const studio = spawn(process.execPath, [path.join(root, 'tools', 'studio.mjs')],
  { cwd: temp, env: { ...process.env, MOTIONEER_PORT: String(port), MOTIONEER_NO_OPEN: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''; studio.stdout.on('data', (b) => log += b); studio.stderr.on('data', (b) => log += b)

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${at}/__motioneer/model`)).ok) break } catch {} await new Promise((r) => setTimeout(r, 100)) }
  await fetch(`${at}/__motioneer/renderer`, { method: 'POST' })
  for (let i = 0; i < 120; i++) { const s = await (await fetch(`${at}/__motioneer/renderer`)).json(); if (s.state === 'ready') break; assert.notEqual(s.state, 'error', s.message); await new Promise((r) => setTimeout(r, 2000)) }

  const steps = []
  const before = await (await fetch(`${at}/__motioneer/editor-config`)).json()
  assert.equal(before.source, null, 'the studio should start aimed at nothing, so the aim is what is being proved')
  const result = await autofilm({ at, url: siteAt, seconds: 12, soundtrack: 'pulse', look: 'subtle', pace: 'fast', max: 2, pick: 'the card and the headline', direction: 'calm confidence, every arrival settles like paper on a desk', onStep: (m) => { steps.push(m); if (process.env.MOTIONEER_STEPS) console.log('  step', m) } })
  assert.equal(result.captured, 2, 'both chosen elements should be captured')
  assert.equal(refusedCalls,2); assert.ok(recoveredCalls>0 && result.elements.every(e=>e.status==='filmed'),'a delayed retry must reach the final cut')
  assert.ok(result.byModel, 'the plan should have come from the model through the studio, not the fallback')
  assert.ok(sheets >= 1, 'the planner should have been shown a contact sheet of the candidates')
  assert.equal(result.opening, 'Ship it with confidence', 'the opening title should be the model\'s words')
  const planPrompt = prompts.find((p) => /"opening"/.test(p))
  assert.ok(planPrompt && /the card and the headline/.test(planPrompt), 'the person\'s pick should reach the model')
  assert.ok(planPrompt && /card in (hero|body|nav)/.test(planPrompt), 'candidates should be described by role and section')
  {
    // every candidate is something a viewer would see: an invisible stretched link stands for its card, a content box for its dark container
    const lines = planPrompt.split('\n').filter((l) => /^\d+: /.test(l))
    assert.ok(lines.every((l) => /with an image|a painted block|"[^"]+"/.test(l)), `no candidate should be an invisible box: ${lines.filter((l) => !/with an image|a painted block|"[^"]+"/.test(l)).join(' | ')}`)
    assert.ok(lines.filter((l) => /Triage feedback/.test(l)).length === 1, 'the overlay anchor should resolve to its card once, not twice')
    const dark = lines.find((l) => /White on dark/.test(l))
    assert.ok(dark && /div in/.test(dark), `the white-on-dark content box should resolve to its dark container: ${dark}`)
  }
  /**
   * A candidate's text is what a reader sees, not what the node contains. The card carries its
   * own <style>, and read with textContent it described itself to the model as a keyframes block,
   * so the model named the product after css and wrote titles about it. Read with innerText the
   * style tag is not rendered and does not count.
   */
  assert.ok(planPrompt && !/@keyframes/.test(planPrompt), 'a candidate\'s own <style> must not be read as its text')
  assert.ok(planPrompt && /Everything in one place/.test(planPrompt), 'the card should describe itself by its heading')
  assert.ok(prompts.some((p) => /settles last|rises as one piece/.test(p)), 'the model\'s direction should reach the motion prompt')
  assert.ok(planPrompt && /settles like paper/.test(planPrompt), 'the film\'s direction should reach the plan')
  assert.ok(prompts.filter((p) => /settles like paper/.test(p) && !/"opening"/.test(p)).length >= 2, 'the film\'s direction should reach every motion prompt')
  const saved = await (await fetch(`${at}/__motioneer/projects/${result.projectId}`)).json()
  assert.equal(scoreStyle(saved),'pulse')
  const audio=saved.tracks.find(t=>t.kind==='audio'),asset=saved.assets.find(a=>a.id===audio?.assetId)
  assert.ok(audio&&asset.duration===saved.settings.duration&&asset.waveform.some(v=>v>.01),'the original score is an editable, non-silent audio asset filling the cut')
  const wav=scoreWav({seconds:1,style:'ambient',seed:'check'}).data
  assert.equal(wav.readUInt32LE(40),24000*4)
  assert.equal(wav.readInt16LE(44),0,'the score starts without a click')
  /**
   * A captured root sits flush in its frame. The block was captured with an 18px top margin, and a
   * frame sized to its box once rendered it 18px down and clipped its foot. Rendered through the
   * same composition the film uses, its top must be at 0.
   */
  {
    const block = saved.subjects.find((x) => /margin:18px/.test(x.html)) || saved.subjects.find((x) => /hero-image/.test(x.html))
    assert.ok(block, 'the block with the top margin should have been captured')
    const one = createProject('flush'); one.settings.width = block.w; one.settings.height = block.h; one.subjects = [block]
    one.tracks = [{ ...firstCut(one).tracks[0], kind: 'component', name: 'b', subjectId: block.id, motionId: undefined, x: 0, y: 0, width: 100, height: 100, start: 0, duration: 5000 }]
    const chromium = await loadChromium(); const browser = await chromium.launch({ channel: 'chromium' })
    try {
      const page = await browser.newPage({ viewport: { width: block.w + 20, height: block.h + 20 } })
      await page.setContent(compositionDocument(one), { waitUntil: 'load' }); await page.waitForTimeout(800)
      const top = await page.evaluate(() => { const f = document.querySelector('iframe'); const root = f.contentDocument.body.firstElementChild; return root.getBoundingClientRect().top })
      assert.ok(Math.abs(top) < 1, `a captured root should sit flush at the top of its frame, it sat at ${top}px`)
      console.log('ok: a captured root sits flush in its frame, its page margin dropped')
    } finally { await browser.close() }
  }
  const titles = saved.tracks.filter((t) => t.kind === 'title').map((t) => t.text)
  assert.deepEqual(titles, ['Ship it with confidence', 'Get started today'], 'both title tracks should carry the model\'s words')
  assert.equal(saved.settings.background, '#eef1f6', 'the film should stand on the site\'s own background')
  assert.ok(saved.tracks.filter((t) => t.kind === 'title').every((t) => t.color === '#111318'), 'titles on a light ground should be dark')
  assert.equal(result.background, '#eef1f6', 'the driver should report the background it matched')
  assert.ok(saved.tracks.filter((t) => t.kind === 'component').length >= 7, 'a fast cut should carry many shots, not one per element')
  {
    const comps = saved.tracks.filter((t) => t.kind === 'component'), starts = new Set(comps.map((t) => t.start))
    assert.ok(comps.length > starts.size, 'the plan\'s pair scene should put two elements in one shot')
    assert.ok(result.layouts >= 3 && result.distinct === 2, `the film should report its shape, got ${result.layouts} layouts of ${result.distinct} elements`)
  }
  console.log('ok: the model planned it: chose by the person\'s pick, wrote the titles, and directed each motion')
  /**
   * Inspect reads the same page without filming it. It went out referring to a name it never
   * bound and threw on every call, which nothing here noticed because nothing here called it.
   */
  {
    const seen = await inspectSite({ at, url: siteAt })
    assert.ok(seen.candidates.length >= 2, `inspect should list what is filmable, got ${seen.candidates.length}`)
    assert.equal(seen.colours.background, '#eef1f6', 'inspect should report the page\'s own ground')
    assert.ok(seen.candidates.some((c) => /Everything in one place/.test(c.text)), 'inspect should carry each candidate\'s rendered text')
    assert.ok(!seen.candidates.some((c) => /@keyframes/.test(c.text)), 'inspect should not read a <style> as an element\'s text')
    console.log(`ok: inspect lists ${seen.candidates.length} candidates on ${seen.colours.background} without filming`)
  }
  const buf = Buffer.from(await (await fetch(result.url)).arrayBuffer())
  assert.ok(buf.length > 20000, `the film should be a real mp4, got ${buf.length} bytes`)
  assert.equal(buf.slice(4, 8).toString(), 'ftyp', 'the file should start with an mp4 box')
  assert.ok(result.components >= 1, 'the film should carry a captured component, not just titles')
  console.log(`ok: url to mp4, ${result.captured} elements, ${result.components} in the cut, ${Math.round(result.seconds)}s, ${(buf.length / 1e6).toFixed(1)}MB`)

  // the film must not be blank: decode two frames with the renderer's own ffmpeg and require that
  // something is actually on screen. this is the check that would have caught an empty first cut.
  const mp4 = path.join(temp, 'out.mp4'); await writeFile(mp4, buf)
  const ffPath = (await import(pathToFileURL(path.join(process.env.MOTIONEER_RENDER_CACHE || path.join(process.env.HOME, '.cache/motioneer/renderer-1'), 'node_modules/ffmpeg-static/index.js')).href)).default
  const grab = (sec) => new Promise((res, rej) => {
    const rgb = path.join(temp, `f${sec}.rgb`)
    const p = spawn(ffPath, ['-y', '-ss', String(sec), '-i', mp4, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', rgb], { stdio: 'ignore' })
    p.on('error', rej); p.on('exit', () => readFileFn(rgb).then(res).catch(rej))
  })
  const { readFile: readFileFn } = await import('node:fs/promises')
  const lit = (frame) => { let on = 0; for (let i = 0; i < frame.length; i += 3) { if (frame[i] > 40 || frame[i + 1] > 40 || frame[i + 2] > 40) on++ } return on / (frame.length / 3) }
  const [a, b] = [await grab(1.5), await grab(Math.max(2.5, result.seconds / 2))]
  assert.ok(lit(a) > 0.002, `the opening title should be on screen, only ${(lit(a) * 100).toFixed(2)}% of it was lit`)
  assert.ok(lit(b) > 0.002, `a component should be on screen mid-film, only ${(lit(b) * 100).toFixed(2)}% of it was lit`)
  console.log(`ok: the film is not blank (opening ${(lit(a) * 100).toFixed(1)}% lit, middle ${(lit(b) * 100).toFixed(1)}% lit)`)
  // the verifier, on the real file: a fast film must measure as fast off its own frames
  assert.ok(Array.isArray(result.cutTimes) && result.cutTimes.length >= 7, `the driver should hand back where it cut, got ${JSON.stringify(result.cutTimes)}`)
  const proof = await proveFilm({ file: mp4, pace: 'fast', seconds: 12, cuts: result.cutTimes })
  assert.equal(proof.cuts, result.cutTimes.length, `every planned cut should show in the frames: ${proof.notes.join('; ')}`)
  assert.ok(proof.ok, `the proof should pass for a fast film: ${proof.notes.join('; ')}`)
  assert.ok(proof.cuts >= 6, `a fast 12 second film should show at least 6 cuts, measured ${proof.cuts}`)
  assert.ok(proof.arriveMs >= 200, `elements should visibly arrive rather than pop, measured ${proof.arriveMs}ms`)
  assert.equal(proof.lateShots, 0, 'no shot should still be empty a third of a second in')
  // the driver measured the film itself and says what became of every element, so an agent reasons on fields rather than a paragraph
  assert.ok(result.proof && result.proof.ok, `the driver should carry its own verdict: ${JSON.stringify(result.proof?.notes)}`)
  assert.ok(Array.isArray(result.elements) && result.elements.length === 2 && result.elements.every((e) => e.status === 'filmed'), `every chosen element should be reported filmed, got ${JSON.stringify(result.elements)}`)
  assert.ok(Array.isArray(result.shotList) && result.shotList.length === result.shots && result.shotList[0].elements.length >= 1, 'the shots should be listed with their elements')
  const calmVerdict = await proveFilm({ file: mp4, pace: 'calm', seconds: 12, cuts: result.cutTimes })
  assert.ok(calmVerdict.ok, 'the same film passes a calm verdict, which asks less')

  /**
   * A film revised rather than remade: the shots read back from the cut, one dropped, a new
   * length, cut and rendered again in the time a render takes, and measured. The revision must
   * keep what the plan decided about layouts, since a person asking for "shorter" did not ask
   * for a slideshow.
   */
  const { revise } = await import('../tools/editor/autofilm.mjs')
  const revised = await revise({ at, projectId: result.projectId, seconds: 9, drop: ['1','2'], order:[4,3], background:'#101319',ink:'#3ecf8e', onStep: (m) => { if (process.env.MOTIONEER_STEPS) console.log('  step', m) } })
  const colored=await(await fetch(`${at}/__motioneer/projects/${result.projectId}`)).json()
  assert.equal(colored.settings.background,'#101319');assert.ok(colored.tracks.filter(t=>t.kind==='title').every(t=>t.color==='#3ecf8e'),'a requested palette reaches the saved film and title tracks')
  assert.equal(revised.shots,result.shots-2,'multiple numbered drops address the original cut without shifting later indices')
  assert.deepEqual(revised.shotList[0].elements,result.shotList[3].elements,'order uses the same original shot numbers as drop')
  assert.ok(revised.changes.some((c) => /dropped shot 1/.test(c)) && revised.changes.some((c) => /9 seconds/.test(c)), `the revision should say what it changed, got ${JSON.stringify(revised.changes)}`)
  assert.ok(Math.abs(revised.seconds - 9) < 1.5, `the revised film should be about 9 seconds, got ${revised.seconds}`)
  assert.ok(revised.shots < result.shots, `dropping a shot of a short film should leave fewer shots, ${result.shots} became ${revised.shots}`)
  assert.ok(revised.layouts >= 2, `the revision should keep the plan's layouts, got ${revised.layouts}`)
  assert.ok(revised.proof && revised.proof.cuts === revised.cutTimes.length, `every cut of the revision should show in its frames: ${JSON.stringify(revised.proof?.notes)}`)
  console.log(`ok: revised to ${revised.shots} shots in ${revised.seconds}s with ${revised.layouts} layouts, ${revised.changes.join('; ')}`)
  // A motion note preserves the hand edit and creates a recoverable new version, without recapturing.
  let hand = await (await fetch(`${at}/__motioneer/projects/${result.projectId}`)).json()
  hand.camera=[{at:0,duration:9000,x:.1,y:0,scale:1.01,ease:'linear'}];hand.settings.fps=60
  const selected=hand.tracks.find(t=>t.kind==='component');selected.x+=1
  const alternative={...hand.motions.find(m=>m.id===selected.motionId),id:crypto.randomUUID(),treatment:'bold'}
  hand.motions.push(alternative)
  const alternateTrack={...selected,id:crypto.randomUUID(),motionId:alternative.id,start:selected.start+100,duration:Math.max(200,selected.duration-100),x:selected.x+2}
  const hiddenTrack={...selected,id:crypto.randomUUID(),hidden:true}
  hand.tracks.push(alternateTrack,hiddenTrack)
  hand=await(await fetch(`${at}/__motioneer/projects/${hand.id}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(hand)})).json()
  await assert.rejects(()=>revise({at,projectId:hand.id,motionDirection:'glide gently',motionElements:['a missing element']}),/none of those elements/)
  assert.equal((await(await fetch(`${at}/__motioneer/projects/${hand.id}`)).json()).revision,hand.revision,'an unmatched note must not save')
  const refined=await revise({at,projectId:hand.id,motionDirection:'a slower paper glide, preserve the structure',motionElements:[selected.subjectId]})
  const after=await(await fetch(`${at}/__motioneer/projects/${hand.id}`)).json()
  const withoutMotion=tracks=>tracks.map(({motionId,...t})=>t)
  assert.deepEqual(withoutMotion(after.tracks),withoutMotion(hand.tracks),'motion refinement preserves every placement and timing value')
  assert.deepEqual(after.camera,hand.camera);assert.deepEqual(after.settings,hand.settings)
  assert.ok(after.motions.length>hand.motions.length && after.tracks.find(t=>t.id===selected.id).motionId!==selected.motionId)
  const revisedMotion=t=>after.motions.find(m=>m.id===after.tracks.find(n=>n.id===t.id).motionId)
  assert.equal(revisedMotion(selected).parentId,selected.motionId)
  assert.equal(revisedMotion(alternateTrack).parentId,alternative.id,'each used treatment refines its own previous version')
  assert.notEqual(revisedMotion(selected).id,revisedMotion(alternateTrack).id,'different treatments remain different')
  assert.equal(after.tracks.find(t=>t.id===hiddenTrack.id).motionId,hiddenTrack.motionId,'hidden layers keep their motion')
  for(const m of hand.motions)assert.equal(after.motions.find(n=>n.id===m.id).css,m.css,'existing generated CSS stays immutable')
  assert.deepEqual(after.arrangements.at(-1).tracks,hand.tracks);assert.deepEqual(after.arrangements.at(-1).settings,hand.settings)
  assert.equal(after.tracks.filter(t=>t.kind==='audio').length,1,'recutting and refinement do not duplicate the score')
  const silent=await withSoundtrack({...after,tracks:[...after.tracks,{...audio,id:crypto.randomUUID(),assetId:'custom-audio'}]},{at,style:'none'})
  assert.deepEqual(silent.tracks.filter(t=>t.kind==='audio').map(t=>t.assetId),['custom-audio'],'silence removes the generated score without removing imported audio')
  const review=await reviewFilm(refined.file,{shots:refined.shotList,seconds:refined.seconds})
  assert.ok((await stat(review.path)).size>5000 && review.data && review.samples.length>=3,'the agent receives a storyboard from the rendered MP4')
  console.log('ok: motion notes preserve the edit, save the previous arrangement, and return a rendered storyboard')


  /**
   * The verdict mends before it reports. Handed a proof that calls the first shot empty, the
   * driver asks for that element's motion again or drops the shot, cuts and renders once more,
   * and says what it did; the second verdict is the one that comes back. The fault is injected
   * because a mock motion never hides its root, and a real one does about one film in five.
   */
  const { proveRender } = await import('../tools/editor/autofilm.mjs')
  let verdicts = 0
  const lying = async (url, opts) => { const real = await proveRender(url, opts); verdicts++; return verdicts === 1 ? { ...real, proof: { ...real.proof, ok: false, late: [opts.cuts[0]], notes: ['1 shot still empty a third of a second in'] } } : real }
  const mendSteps = []
  const mended = await autofilm({ at, url: siteAt, seconds: 12, look: 'subtle', pace: 'fast', max: 2, pick: 'the card and the headline', captureMode:'pixels', prove: lying, onStep: (m) => { mendSteps.push(m); if (process.env.MOTIONEER_STEPS) console.log('  mend', m) } })
  const photographed=await(await fetch(`${at}/__motioneer/projects/${mended.projectId}`)).json()
  assert.ok(photographed.subjects.every(s=>s.html.includes('data:image/png;base64,')&&s.warnings.some(w=>w.includes('pixels'))),'pixel capture preserves source appearance with an explicit flattening warning')
  assert.equal(verdicts, 2, 'a failed verdict should lead to one more render and one more verdict')
  assert.ok(mended.repairs.length === 1 && /rewrote|dropped/.test(mended.repairs[0]), `the film should say what it mended, got ${JSON.stringify(mended.repairs)}`)
  assert.ok(mendSteps.some((m) => /^Mending the film/.test(m)) && mendSteps.filter((m) => /^Rendering/.test(m)).length === 2, 'it should say it is mending and render twice')
  assert.ok(mended.proof.ok, `the verdict returned should be the second one: ${JSON.stringify(mended.proof.notes)}`)
  console.log(`ok: a failed verdict was mended: ${mended.repairs[0]}`)
  console.log(`ok: measured off the frames: ${proof.cuts} cuts, shots ${(proof.avgShotMs / 1000).toFixed(1)}s on average, elements arriving over ${proof.arriveMs}ms, ${Math.round(proof.blank * 100)}% blank`)
  console.log('ok: it reported each step:', steps.length, 'steps')
  const localized=await inspectSite({at,url:siteAt+'/dutch',language:'en',theme:'dark'})
  assert.ok(localized.source.endsWith('/en-nl')&&localized.title==='English product','locale selection follows a real link on the site')
  assert.equal(localized.colours.background,'#101319','requested dark appearance survives the locale redirect')
  await assert.rejects(()=>inspectSite({at,url:siteAt+'/missing'}),/page-not-found/,'an error page is refused before generating a film')
  console.log('ok: locale selection follows existing links and page-not-found screens cannot become films')
  // Hybrid delivery must carry actual source pixels, while leaving the source edit untouched.
  const beforeHybrid=await(await fetch(`${at}/__motioneer/projects/${result.projectId}`)).json()
  const hybridRaw={concept:'Work comes alive',motif:'nodes',palette:['#101319','#88ddaa','#fff8ee'],scenes:SCENES.map((type,i)=>({type:[2,5,8].includes(i)?['product','product-detail','product-split'][[2,5,8].indexOf(i)]:type,text:'Build',capture:i===5?1:0,beats:2,tone:'dark'}))}
  const hybrid=await kineticReel({at,brand:'Example',domain:'example.com',projectId:result.projectId,mode:'hybrid',seconds:6,brandMode:'expressive',plan:hybridRaw})
  const blended=await(await fetch(`${at}/__motioneer/projects/${hybrid.projectId}`)).json()
  assert.notEqual(hybrid.projectId,result.projectId,'blending creates a separate edit')
  assert.deepEqual(await(await fetch(`${at}/__motioneer/projects/${result.projectId}`)).json(),beforeHybrid,'snapshotting source content does not mutate the original film')
  assert.equal(hybrid.shotList.filter(s=>s.captureId).length,3,'actual captures occupy multiple shots among the graphics')
  assert.equal(new Set(hybrid.shotList.filter(s=>s.captureId).map(s=>s.captureId)).size,2,'the product montage uses distinct source captures')
  assert.ok(blended.subjects.filter(s=>s.html.includes('class="product-scene"')).every(s=>s.html.includes('data:image/png;base64,')),'the portable film carries the source pixels, not temporary asset URLs')
  assert.ok(hybrid.sourceSheet.data && hybrid.captures.length>=2,'the agent can inspect provenance alongside the result')
  assert.equal(hybrid.proof.cuts,hybrid.shotList.length-1,'graphic and product scenes both appear in the exported cut')
  await assert.rejects(()=>kineticReel({at,brand:'Example',mode:'hybrid'}),/source project or website URL/)
  console.log('ok: hybrid film exports source pixels and graphics together, returns provenance, and preserves the source')
  const rescored=await rescoreFilm({at,projectId:hybrid.projectId,music:'liquid',bpm:hybrid.bpm})
  const take=await(await fetch(`${at}/__motioneer/projects/${rescored.projectId}`)).json()
  assert.notEqual(take.id,blended.id,'a music audition is a new project')
  assert.deepEqual(take.tracks.filter(t=>t.kind!=='audio'),blended.tracks.filter(t=>t.kind!=='audio'),'rescoring preserves the visual edit exactly')
  assert.deepEqual(take.camera,blended.camera);assert.deepEqual(take.settings,blended.settings)
  assert.deepEqual(await(await fetch(`${at}/__motioneer/projects/${blended.id}`)).json(),blended,'the previous musical take remains unchanged')
  assert.equal(take.tracks.filter(t=>t.kind==='audio').length,1,'the new score replaces the old generated audio')
  assert.equal(scoreStyle(take),'signature')
  assert.equal(rescored.music.profile,'liquid')
  assert.equal(rescored.proof.cuts,hybrid.proof.cuts,'all visual cuts survive the new music export')
  for(const asset of take.assets)assert.ok((await fetch(`${at}/__motioneer/projects/${take.id}/assets/${asset.id}`)).ok,'the new take owns readable copies of its audio assets')
  console.log('ok: music-only revision preserves the complete visual edit, copies assets, and exports an independent musical take')
  console.log('film verification passed')
} catch (e) {
  console.error(log.slice(-3000)); throw e
} finally {
  studio.kill('SIGTERM'); model.close(); site.close()
}
