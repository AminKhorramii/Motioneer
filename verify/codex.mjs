/** Exercise provider process boundaries and setup without model access or personal config writes. */
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,readFile,rm,realpath,stat,readdir,symlink,mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {runCodex} from '../shared/codex.mjs'
import {connectCodex,codexConfig,defaultModel} from '../tools/environment.mjs'
import {missing,resolve} from '../shared/model.mjs'
const dir=await mkdtemp(path.join(tmpdir(),'motioneer codex "quoted" ')),fake=path.join(dir,'codex')
try{
 assert.equal(missing({provider:'codex-cli'}).length,0);assert.equal(resolve({provider:'codex-cli'}).model,'')
 const config=await codexConfig(dir),connection=await connectCodex(dir)
 assert.equal(connection.changed,true);assert.equal((await connectCodex(dir)).changed,false)
 assert.match(config,/tool_timeout_sec = 1200/);assert.match(config,/MOTIONEER_PROVIDER = "codex-cli"/)
 assert.ok(config.includes(JSON.stringify(await realpath(dir))));assert.equal((await stat(connection.file)).mode&0o777,0o600)
 for(const content of ['model = "custom"\n', '[mcp_servers."motioneer"]\ncommand="mine"\n', 'broken [toml']){
  await writeFile(connection.file,content);await assert.rejects(connectCodex(dir),/Cannot replace existing/);assert.equal(await readFile(connection.file,'utf8'),content)
 }
 assert.deepEqual(await readdir(path.dirname(connection.file)),['config.toml'])

 const linked=path.join(dir,'linked'),destination=path.join(dir,'destination');await mkdir(linked);await mkdir(destination);await symlink(destination,path.join(linked,'.codex'),'dir');await assert.rejects(connectCodex(linked),/symlinked/);assert.deepEqual(await readdir(destination),[])
 const old=process.env.MOTIONEER_PROVIDER;try{process.env.MOTIONEER_PROVIDER='codex-cli';assert.equal(defaultModel().provider,'codex-cli')}finally{if(old===undefined)delete process.env.MOTIONEER_PROVIDER;else process.env.MOTIONEER_PROVIDER=old}
 await writeFile(fake,`#!${process.execPath}
import fs from 'node:fs';import assert from 'node:assert/strict';
const args=process.argv.slice(2),value=k=>args[args.indexOf(k)+1];
assert.equal(value('--sandbox'),'read-only');assert.ok(args.includes('--ignore-user-config'));assert.ok(args.includes('--ephemeral'));assert.ok(args.includes('features.shell_tool=false'));assert.ok(args.includes('features.apps=false'));assert.ok(args.includes('features.hooks=false'));assert.ok(args.includes('mcp_servers={}'));assert.equal(value('--model'),'test-model');
const instructions=JSON.parse(args.find(a=>a.startsWith('model_instructions_file=')).split('=').slice(1).join('='));assert.equal(fs.readFileSync(instructions,'utf8'),'system-test');assert.equal(fs.readFileSync(value('--image'),'utf8'),'image-test');
let input='';process.stdin.on('data',d=>input+=d);process.stdin.on('end',()=>{assert.equal(input,'user-test');if(process.env.TEST_WAIT)return setTimeout(()=>{},30000);if(process.env.TEST_FAIL){console.error('secret-do-not-print');process.exit(1)}fs.writeFileSync(value('-o'),'ready');fs.writeFileSync(process.env.TEST_RECORD,process.cwd())});
`,{mode:0o700})
 const opts={bin:fake,model:'test-model',images:[{mime:'image/png',data:Buffer.from('image-test').toString('base64')}],env:{...process.env,TEST_RECORD:path.join(dir,'record')}}
 let delta='';const reply=await runCodex('system-test','user-test',{...opts,onDelta:s=>delta+=s});assert.deepEqual(reply,{text:'ready'});assert.equal(delta,'ready')
 const temporary=await readFile(path.join(dir,'record'),'utf8');await assert.rejects(stat(temporary),{code:'ENOENT'})
 const failed=await runCodex('system-test','user-test',{...opts,env:{...opts.env,TEST_FAIL:'1'}});assert.ok(failed.error);assert.ok(!failed.error.includes('secret-do-not-print'))
 const timed=await runCodex('system-test','user-test',{...opts,env:{...opts.env,TEST_WAIT:'1'},callMs:150});assert.match(timed.error,/timed out/)
 const controller=new AbortController();const waiting=runCodex('system-test','user-test',{...opts,env:{...opts.env,TEST_WAIT:'1'},signal:controller.signal});setTimeout(()=>controller.abort(),150);assert.equal((await waiting).error,'Cancelled')
 assert.equal((await runCodex('','',{signal:AbortSignal.abort()})).error,'Cancelled')
 assert.match((await runCodex('','',{bin:path.join(dir,'absent')})).error,/Cannot start Codex/)
 console.log('Codex: project config preservation, private completion files, images, model choice, auth error redaction, timeout, cancellation and cleanup passed.')
}finally{await rm(dir,{recursive:true,force:true})}
