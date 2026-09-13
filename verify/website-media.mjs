import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {createProject} from '../dist-core/core.js'
import {websiteMedia} from '../tools/editor/media-source.mjs'
const rows='<ul>'+['Incoming request','Choose the team','Ready to build'].map(t=>`<li><span>${t}</span><span>Open</span><button>View</button></li>`).join('')+'</ul>'
const fixture=`<style>body{margin:0;line-height:20px}h1,h2{margin:0} .frame,.panel,.illustration,.hashed_illustration{width:800px;height:400px;background:#181818;color:#fff} .panel{width:600px;height:300px} img{width:600px} .hidden{display:none}</style><main><h1>Product</h1><h2>Intake</h2><div class="hashed_illustration"><div class="illustration"><div class="panel">${rows}</div></div></div><h2>Project planning</h2><div class="frame">${rows}</div><div class="panel hidden">${rows}</div><div class="panel"><h2>Marketing copy</h2>${rows}</div><div class="background"><img src="/opaque.svg" alt=""></div><div class="hashed_shade"><img src="/shade.svg" alt=""></div><img src="/photo.svg" alt="Presenter portrait"><img src="/real.svg" alt="Issue composer"><video poster="/poster.svg"></video><video poster="/poster-two.svg"></video></main>`
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#25232a"/><text x="80" y="90" fill="white" font-size="32">Actual product screenshot</text></svg>'
let saved
const server=createServer(async(req,res)=>{
 if(req.url==='/missing'){res.writeHead(404);return res.end('Missing')}
 if(req.url.endsWith('.svg')){res.setHeader('content-type','image/svg+xml');return res.end(svg)}
 if(req.method==='POST'){res.setHeader('content-type','application/json');return res.end(JSON.stringify(createProject('Fixture')))}
 if(req.method==='PUT'){let body='';for await(const chunk of req)body+=chunk;saved=JSON.parse(body);res.setHeader('content-type','application/json');return res.end(JSON.stringify(saved))}
 res.setHeader('content-type','text/html');res.end(fixture)
})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
try{
 const url=`http://127.0.0.1:${server.address().port}`
 const id=await websiteMedia({at:url,url,minimum:5})
 assert.equal(id,saved.id)
 assert.equal(saved.subjects.length,5,'two complete DOM panels, a native image and two video posters')
 assert.deepEqual(saved.subjects.slice(0,2).map(s=>s.name),['Intake — website product interface','Project planning — website product interface'])
 for(const s of saved.subjects.slice(0,2)){assert.equal(s.w,1600);assert.equal(s.h,800);assert.match(s.html,/data:image\/png;base64/);assert.match(s.warnings[0],/flattened/)}
 assert.equal(saved.subjects[2].name,'Issue composer','actual screenshots precede tutorial video posters')
 assert.ok(saved.subjects.some(s=>s.warnings[0].includes('video poster')))
 assert.ok(!saved.subjects.some(s=>/opaque|portrait|Marketing/.test(s.name)))
 await assert.rejects(websiteMedia({at:url,url:url+'/missing'}),/page did not load/)
 console.log('Website media: complete DOM panels, nested/hidden/decorative exclusions, source labels, native images, posters and HTTP errors verified.')
}finally{await new Promise(r=>server.close(r))}
