/** Exercise the npm artifact away from the checkout, without development dependencies or model calls. */
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {spawn} from 'node:child_process'
import {createServer} from 'node:net'
const root=fileURLToPath(new URL('../',import.meta.url)),scratch=await mkdtemp(path.join(tmpdir(),'motioneer package ')),install=path.join(scratch,'install'),work=path.join(scratch,'workspace'),pkg=JSON.parse(await readFile(path.join(root,'package.json')))
const npm=process.platform==='win32'?'npm.cmd':'npm',children=[]
const run=(bin,args,options={})=>new Promise((resolve,reject)=>{const p=spawn(bin,args,{cwd:work,env:{...process.env,MOTIONEER_NO_OPEN:'1'},...options,stdio:['ignore','pipe','pipe']}),timer=setTimeout(()=>{p.kill();reject(Error('Timed out: '+bin))},120000);let stdout='',stderr='';p.stdout.on('data',d=>stdout+=d);p.stderr.on('data',d=>stderr+=d);p.on('error',e=>{clearTimeout(timer);reject(e)});p.on('exit',code=>{clearTimeout(timer);resolve({code,stdout,stderr})})})
try{
 await mkdir(install);await mkdir(work)
 const packed=await run(npm,['pack','--ignore-scripts','--json','--pack-destination',scratch],{cwd:root});assert.equal(packed.code,0,packed.stderr);const pack=JSON.parse(packed.stdout)[0],tarball=path.join(scratch,pack.filename),files=pack.files.map(f=>f.path)
 for(const name of ['tools/cli.mjs','mcp/index.mjs','dist-core/core.js','dist-editor/index.html','tools/editor/native-reel.mjs','tools/editor/fonts/syne.woff2','tools/editor/fonts/syne-LICENSE.txt','docs/setup.md'])assert.ok(files.includes(name),name+' ships')
 assert.ok(!files.some(f=>/(^|\/)(?:\.studio|\.context|\.env|node_modules)(?:\/|$)/.test(f)),'no workspace state or dependencies are bundled')
 const installed=await run(npm,['install','--prefix',install,'--omit=dev','--ignore-scripts','--no-audit','--no-fund',tarball]);assert.equal(installed.code,0,installed.stderr)
 const local=path.join(install,'node_modules/motioneer'),cli=path.join(local,'tools/cli.mjs')
 const version=await run(npm,['exec','--offline','--prefix',install,'--','motioneer','--version']);assert.equal(version.code,0,version.stderr);assert.equal(version.stdout.trim(),pkg.version)
 const help=await run(process.execPath,[cli,'--help']);assert.match(help.stdout,/setup --claude/)
 const diagnosis=await run(process.execPath,[cli,'doctor','--json']);const report=JSON.parse(diagnosis.stdout);assert.equal(report.checks.find(c=>c.id==='package').ok,true);assert.equal(report.checks.find(c=>c.id==='renderer').ok,true,'Run npx motioneer setup before the package render smoke test.')
 const setup=await run(process.execPath,[cli,'setup','--claude','--json']);const prepared=JSON.parse(setup.stdout);assert.ok(prepared.connection.file.endsWith('.mcp.json'));assert.ok(prepared.checks.find(c=>c.id==='renderer').ok);const connection=JSON.parse(await readFile(path.join(work,'.mcp.json')));assert.equal(connection.mcpServers.motioneer.args[1],'motioneer@'+pkg.version)
 const mcp=spawn(process.execPath,[cli,'mcp'],{cwd:work,env:{...process.env,MOTIONEER_WORKSPACE:work},stdio:['pipe','pipe','pipe']});children.push(mcp);let buffer='',sequence=0;const pending=new Map();mcp.stdout.on('data',d=>{buffer+=d;const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines){let reply;try{reply=JSON.parse(line)}catch{throw Error('Non-protocol output on MCP stdout: '+line)}pending.get(reply.id)?.(reply);pending.delete(reply.id)}})
 const rpc=(method,params)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>reject(Error('MCP timeout')),15000);pending.set(id,r=>{clearTimeout(timer);resolve(r)});mcp.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n')})
 const hello=await rpc('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'package-test',version:'1'}});assert.equal(hello.result.serverInfo.version,pkg.version);const listing=await rpc('tools/list',{});assert.ok(listing.result.tools.some(t=>t.name==='doctor'));assert.ok(listing.result.tools.find(t=>t.name==='reel').inputSchema.properties.mode.enum.includes('native'))
 const doctor=await rpc('tools/call',{name:'doctor',arguments:{dir:work}});assert.ok(doctor.result.structuredContent.checks.find(c=>c.id==='package').ok)
 const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));const at='http://localhost:'+port
 const studio=spawn(process.execPath,[cli,'--no-open','--port',String(port)],{cwd:work,env:{...process.env,MOTIONEER_NO_OPEN:'1'},stdio:'ignore'});children.push(studio)
 let serving=false;for(let i=0;i<60;i++){try{serving=(await fetch(at+'/__motioneer/model',{signal:AbortSignal.timeout(500)})).ok}catch{}if(serving)break;await new Promise(r=>setTimeout(r,200))}assert.ok(serving,'packed studio starts away from the repo');assert.equal((await fetch(at+'/__motioneer/editor/')).status,200)
 const core=await import(pathToFileURL(path.join(local,'dist-core/core.js')).href),{withSoundtrack}=await import(pathToFileURL(path.join(local,'tools/editor/soundtrack.mjs')).href)
 let project=await fetch(at+'/__motioneer/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Package smoke'})}).then(r=>r.json());project.settings={...project.settings,width:320,height:180,fps:30,duration:1000,from:0,to:1000};project.tracks=[{...core.newTrack('title','Packaged film',0),text:'Motioneer',duration:1000,fontSize:40}];project=await withSoundtrack(project,{at,style:'signature',music:{profile:'warehouse'},bpm:144})
 const saved=await fetch(at+'/__motioneer/projects/'+project.id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(project)});assert.ok(saved.ok)
 const {renderProject}=await import(pathToFileURL(path.join(local,'tools/editor/autofilm.mjs')).href),render=await renderProject(at,project.id),video=await fetch(render.url),bytes=Buffer.from(await video.arrayBuffer());assert.ok(video.ok&&bytes.length>1000);assert.equal(bytes.toString('ascii',4,8),'ftyp');await writeFile(path.join(work,'package-smoke.mp4'),bytes)
 // Keep the exact reviewed tarball and evidence in the workspace's ignored release folder.
 const {copyFile}=await import('node:fs/promises');const output=path.join(root,'.context/launch');await mkdir(output,{recursive:true});await copyFile(tarball,path.join(output,pack.filename));await copyFile(path.join(work,'package-smoke.mp4'),path.join(output,'package-smoke.mp4'));await writeFile(path.join(output,'package-report.json'),JSON.stringify({version:pkg.version,tarball:pack.filename,integrity:pack.integrity,unpackedSize:pack.unpackedSize,files:files.length,npx:true,mcp:true,studio:true,render:true,modelRequest:false},null,2))
 console.log(`Package ${pkg.version}: isolated npx, CLI diagnostics, MCP, studio and a rendered MP4 with music passed. ${files.length} files, ${(pack.unpackedSize/1e6).toFixed(2)} MB unpacked.`)
}finally{for(const c of children)c.kill('SIGTERM');await new Promise(r=>setTimeout(r,250));await rm(scratch,{recursive:true,force:true})}
