/** Personal Desktop settings stay untouched: all config writes use temporary homes. */
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,readFile,writeFile,readdir,rm,stat,symlink,realpath} from 'node:fs/promises'
import {tmpdir,homedir} from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {desktopLocation,desktopWorkspace,desktopRuntime,desktopConfig,planDesktop,installDesktop,desktopDiagnosis} from '../tools/claude-desktop.mjs'
const temp=await realpath(await mkdtemp(path.join(tmpdir(),'motioneer desktop '))),work=path.join(temp,'Film projects'),file=path.join(temp,'Claude','claude_desktop_config.json'),cli=fileURLToPath(new URL('../tools/cli.mjs',import.meta.url))
try{
 await mkdir(work);await mkdir(path.dirname(file))
 assert.equal(desktopLocation({platform:'darwin',home:'/Users/creator'}),'/Users/creator/Library/Application Support/Claude/claude_desktop_config.json')
 assert.equal(desktopLocation({platform:'win32',home:'C:\\Users\\Creator',env:{APPDATA:'D:\\Roaming'}}),'D:\\Roaming\\Claude\\claude_desktop_config.json')
 assert.equal(desktopLocation({platform:'win32',home:'C:\\Users\\Creator',env:{}}),'C:\\Users\\Creator\\AppData\\Roaming\\Claude\\claude_desktop_config.json')
 assert.throws(()=>desktopLocation({platform:'linux'}),/Linux/)
 const runtime=await desktopRuntime(),options={file,platform:'darwin',runtime,env:{PATH:process.env.PATH,ANTHROPIC_API_KEY:'never-copy-me',MOTIONEER_PORT:'4322'}}
 assert.ok(path.isAbsolute(runtime.command)&&path.isAbsolute(runtime.npmCli));assert.ok(runtime.searchPath.split(path.delimiter).includes(path.dirname(process.execPath)))
 const config=await desktopConfig(work,options),entry=config.mcpServers.motioneer
 assert.ok(!JSON.stringify(entry).includes('never-copy-me'));assert.equal(entry.env.MOTIONEER_WORKSPACE,work);assert.equal(entry.env.MOTIONEER_PORT,'4322');assert.equal(entry.args.at(-1),'mcp');assert.match(entry.args[3],/^--package=motioneer@/)
 // Preserve all other servers, including their credentials, and unrelated Desktop preferences.
 const original=JSON.stringify({mcpServers:{other:{command:'custom',env:{TOKEN:'other-secret'}}},preferences:{theme:'dark'}})
 await writeFile(file,original)
 const result=await installDesktop(await planDesktop(work,options)),saved=JSON.parse(await readFile(file,'utf8'))
 assert.equal(result.changed,true);assert.equal(await readFile(result.backup,'utf8'),original);assert.deepEqual(saved.preferences,{theme:'dark'});assert.equal(saved.mcpServers.other.env.TOKEN,'other-secret');assert.deepEqual(saved.mcpServers.motioneer,entry)
 if(process.platform!=='win32'){assert.equal((await stat(file)).mode&0o777,0o600);assert.equal((await stat(result.backup)).mode&0o777,0o600)}
 const before=await readdir(path.dirname(file));assert.equal((await installDesktop(await planDesktop(work,options))).changed,false);assert.deepEqual(await readdir(path.dirname(file)),before,'rerunning creates no extra backups')
 const updated={...options,runtime:{...runtime,searchPath:runtime.searchPath+path.delimiter+path.join(temp,'new-cli')}}
 const refreshed=await installDesktop(await planDesktop(work,updated));assert.equal(refreshed.changed,true);assert.ok(refreshed.backup);assert.equal(JSON.parse(await readFile(file,'utf8')).mcpServers.motioneer.env.PATH,updated.runtime.searchPath)
 for(const broken of ['','bad JSON','[]','null','{"mcpServers":[]}','{"mcpServers":null}','{"mcpServers":{"motioneer":null}}','{"mcpServers":{"motioneer":{"command":"custom"}}}']){
  await writeFile(file,broken);await assert.rejects(planDesktop(work,options),/Cannot/);assert.equal(await readFile(file,'utf8'),broken)
 }
 await writeFile(file,original);const plan=await planDesktop(work,options);await writeFile(file,'{"newPreference":true}');await assert.rejects(installDesktop(plan),/changed during setup/);assert.equal(await readFile(file,'utf8'),'{"newPreference":true}')
 assert.ok(!(await readdir(path.dirname(file))).some(f=>f.endsWith('.tmp')||f.endsWith('-lock')))
 await writeFile(file,original);await writeFile(file+'.motioneer-lock','');await assert.rejects(installDesktop(await planDesktop(work,options)),/another setup/);await rm(file+'.motioneer-lock')
 await rm(file);await symlink(result.backup,file);await assert.rejects(planDesktop(work,options),/linked/);await rm(file)
 const first=await installDesktop(await planDesktop(work,options));assert.equal(first.changed,true);assert.equal(first.backup,undefined,'first-time setup needs no backup')
 const report=()=>({ready:true,workspace:work,checks:[{id:'model',ok:true,provider:'anthropic'}]})
 assert.equal((await desktopDiagnosis(report())).ready,false)
 await mkdir(path.join(work,'.studio'));await writeFile(path.join(work,'.studio/model.json'),JSON.stringify({provider:'anthropic',key:'private-test-key'}));assert.equal((await desktopDiagnosis(report())).ready,true)
 await writeFile(path.join(work,'.studio/model.json'),JSON.stringify({provider:'ollama',model:'local'}));assert.equal((await desktopDiagnosis({...report(),checks:[{id:'model',ok:true,provider:'ollama'}]})).ready,true)
 // Exercise the actual CLI against an isolated homedir, keeping the real cached renderer.
 const home=path.join(temp,'test-home'),bootstrap=path.join(temp,'test-home.mjs');await mkdir(home)
 await writeFile(bootstrap,`import os from 'node:os';import {syncBuiltinESMExports} from 'node:module';os.homedir=()=>${JSON.stringify(home)};syncBuiltinESMExports();`)
 const env={...process.env,APPDATA:path.join(home,'AppData','Roaming'),MOTIONEER_RENDER_CACHE:process.env.MOTIONEER_RENDER_CACHE||path.join(homedir(),'.cache/motioneer/renderer-1')}
 const run=args=>spawnSync(process.execPath,['--import',bootstrap,cli,...args],{cwd:work,env,encoding:'utf8',timeout:120000})
 const conflict=run(['setup','--claude','--claude-desktop','--json']);assert.equal(conflict.status,1);assert.match(conflict.stdout,/Choose one client/);assert.deepEqual(await readdir(home),[])
 const unknown=run(['setup','--claude-desktop','--unknown','--json']);assert.equal(unknown.status,1);assert.deepEqual(await readdir(home),[])
 if(['darwin','win32'].includes(process.platform)){
  const installed=run(['setup','--claude-desktop','--json']),report=JSON.parse(installed.stdout)
  assert.ok(report.connection,installed.stderr||installed.stdout);assert.equal(report.workspace,desktopWorkspace(home));assert.equal(report.connection.file,desktopLocation({home,env}));assert.equal(report.connection.changed,true);assert.equal(report.checks.find(c=>c.id==='renderer').ok,true)
  assert.equal(JSON.parse(run(['setup','--claude-desktop','--json']).stdout).connection.changed,false)
  const human=run(['setup','--claude-desktop']);assert.match(human.stdout,/Fully quit and reopen Claude Desktop/);assert.ok(!human.stdout.includes('Restart Claude Code in this project'))
  const printed=run(['mcp-config','--claude-desktop','--json']);assert.equal(printed.status,0);assert.deepEqual(JSON.parse(printed.stdout),JSON.parse(await readFile(report.connection.file,'utf8')))
  assert.equal((await readdir(work)).includes('.mcp.json'),false,'Desktop setup never writes a Claude Code project config')
 }
 console.log('Claude Desktop: macOS/Windows paths, absolute launcher, safe merge, backups, idempotence, conflict/race/symlink protection, credential isolation and isolated one-command CLI setup passed.')
}finally{await rm(temp,{recursive:true,force:true})}
