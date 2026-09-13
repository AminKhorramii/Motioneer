/** First-run behavior: no source checkout assumptions, no secret output, no config clobbering. */
import assert from 'node:assert/strict'
import {mkdtemp,realpath,readFile,writeFile,readdir,rm,mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {createServer} from 'node:http'
import {withInstallLock} from '../tools/editor/render-install.mjs'
import {connectClaude,mcpConfig,prepareRenderer} from '../tools/environment.mjs'
const dir=await realpath(await mkdtemp(path.join(tmpdir(),'motioneer launch '))),cli=fileURLToPath(new URL('../tools/cli.mjs',import.meta.url))
const run=args=>spawnSync(process.execPath,[cli,...args],{cwd:dir,encoding:'utf8',env:{...process.env,PATH:'',ANTHROPIC_API_KEY:'',MOTIONEER_RENDER_CACHE:path.join(dir,'missing-renderer')}})
try{
 assert.match(run(['--help']).stdout,/setup --claude/);assert.equal(run(['--version']).status,0);assert.deepEqual(await readdir(dir),[],'help and version do not create studio state')
 const doctor=run(['doctor','--json']);assert.equal(doctor.status,1);const report=JSON.parse(doctor.stdout);assert.equal(report.ready,false);assert.equal(report.checks.find(c=>c.id==='model').ok,false);assert.equal(report.checks.find(c=>c.id==='renderer').ok,false);assert.deepEqual(await readdir(dir),[],'doctor is read-only')
 assert.equal(run(['--port','abc']).status,1);assert.equal(run(['--dir']).status,1);assert.equal(run(['--unknown']).status,1)
 const config=JSON.parse(run(['mcp-config']).stdout);assert.match(config.mcpServers.motioneer.args[1],/^motioneer@\d+\.\d+\.\d+$/);assert.equal(config.mcpServers.motioneer.env.MOTIONEER_WORKSPACE,dir)
 const file=path.join(dir,'.mcp.json');await writeFile(file,JSON.stringify({mcpServers:{other:{command:'leave-me'}},custom:true}));assert.equal((await connectClaude(dir)).changed,true);const connected=JSON.parse(await readFile(file,'utf8'));assert.equal(connected.mcpServers.other.command,'leave-me');assert.equal(connected.custom,true);assert.equal((await connectClaude(dir)).changed,false)
 await writeFile(file,JSON.stringify({mcpServers:{motioneer:{command:'custom'}}}));const before=await readFile(file,'utf8');await assert.rejects(connectClaude(dir),/existing motioneer/);assert.equal(await readFile(file,'utf8'),before);await writeFile(file,'bad JSON');await assert.rejects(connectClaude(dir),/not valid JSON/)
 await mkdir(path.join(dir,'.studio'));await writeFile(path.join(dir,'.studio/model.json'),JSON.stringify({provider:'anthropic',key:'secret-do-not-print'}));const keyed=run(['doctor','--json']);assert.ok(!keyed.stdout.includes('secret-do-not-print'));assert.equal(JSON.parse(keyed.stdout).checks.find(c=>c.id==='model').ok,true)
 let calls=0,installed=false,error=false
 const server=createServer((req,res)=>{res.setHeader('content-type','application/json');if(req.method==='POST'){calls++;installed=true}res.end(JSON.stringify(error?{state:'error',message:'download failed'}:{state:installed?'ready':'idle'}))});await new Promise(r=>server.listen(0,'127.0.0.1',r))
 try{const at='http://127.0.0.1:'+server.address().port;await prepareRenderer(at);assert.equal(calls,1);await prepareRenderer(at);assert.equal(calls,1,'a ready renderer is reused');error=true;await assert.rejects(prepareRenderer(at),/download failed.*Next:/)}finally{await new Promise(r=>server.close(r))}
 const cache=path.join(dir,'locked-cache');let active=0,peak=0
 await Promise.all([1,2,3].map(()=>withInstallLock(cache,async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,25));active--})));assert.equal(peak,1,'shared-cache installers are serialized')
 await assert.rejects(withInstallLock(cache,async()=>{throw Error('installation failed')}),/installation failed/);await withInstallLock(cache,async()=>{});
 // Importing a half-unpacked dependency poisons Node's module cache even after npm finishes.
 const render=fileURLToPath(new URL('../tools/editor/render.mjs',import.meta.url)),lockModule=fileURLToPath(new URL('../tools/editor/render-install.mjs',import.meta.url))
 const regression=spawnSync(process.execPath,['--input-type=module','-e',`
  import assert from 'node:assert/strict';import{mkdir,writeFile}from'node:fs/promises';import{pathToFileURL}from'node:url';
  const cache=process.env.MOTIONEER_RENDER_CACHE,{withInstallLock}=await import(pathToFileURL(${JSON.stringify(lockModule)})),{loadChromium,renderer}=await import(pathToFileURL(${JSON.stringify(render)}));
  await withInstallLock(cache,async()=>{await mkdir(cache+'/node_modules/playwright',{recursive:true});await writeFile(cache+'/node_modules/playwright/index.mjs','throw Error("partially unpacked")');assert.equal(await loadChromium(),null);assert.equal((await renderer().status()).state,'installing');await writeFile(cache+'/browser','fixture');await writeFile(cache+'/node_modules/playwright/index.mjs','export const chromium={executablePath:()=>'+JSON.stringify(cache+'/browser')+'}')});
  assert.ok(await loadChromium());
 `],{encoding:'utf8',env:{...process.env,MOTIONEER_RENDER_CACHE:cache}});assert.equal(regression.status,0,regression.stderr)
 console.log('Launch: read-only diagnostics, missing setup, secret redaction, pinned MCP configuration, idempotent safe merging and automatic renderer preparation verified.')
}finally{await rm(dir,{recursive:true,force:true})}
