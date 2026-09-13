/** First-run diagnostics shared by the terminal and MCP. Never returns model credentials. */
import {access,readFile,writeFile,rename,rm,realpath} from 'node:fs/promises'
import {constants} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {hasClaude} from '../shared/cli.mjs'
import {missing,resolve} from '../shared/model.mjs'
import {renderer,loadChromium} from './editor/render.mjs'
const root=fileURLToPath(new URL('../',import.meta.url))
export const packageInfo=()=>readFile(path.join(root,'package.json'),'utf8').then(JSON.parse)
export async function workspace(dir=process.cwd()){
 const absolute=path.resolve(dir)
 try{await access(absolute,constants.R_OK|constants.W_OK)}catch{throw Error(`Cannot use workspace ${absolute}. Next: choose an existing writable directory with --dir.`)}
 const {stat}=await import('node:fs/promises');if(!(await stat(absolute)).isDirectory())throw Error('Cannot use a file as the workspace. Next: choose a directory with --dir.')
 return realpath(absolute)
}
export async function diagnose({dir=process.cwd(),checkBrowser=true}={}){
 const checks=[],pkg=await packageInfo()
 checks.push({id:'node',ok:Number(process.versions.node.split('.')[0])>=20,message:`Node ${process.versions.node}`,next:'Install Node 20 or newer.'})
 const port=process.env.MOTIONEER_PORT||'4321';checks.push({id:'port',ok:/^\d+$/.test(port)&&+port>=1024&&+port<=65535,message:'Studio port '+port,next:'Choose --port between 1024 and 65535.'})
 let work=path.resolve(dir);try{work=await workspace(dir);checks.push({id:'workspace',ok:true,message:work})}catch(e){checks.push({id:'workspace',ok:false,message:e.message})}
 const assets=['dist-core/core.js','dist-editor/index.html','tools/editor/fonts/syne.woff2','examples/components']
 const absent=[];for(const f of assets)try{await access(path.join(root,f))}catch{absent.push(f)}
 checks.push({id:'package',ok:!absent.length,message:absent.length?'Missing packaged files: '+absent.join(', '):'Studio, renderer code, examples and fonts are packaged.',next:'Reinstall the package, or run npm run build in a source checkout.'})
 const cli=hasClaude();let config=cli?{provider:'claude-cli'}:process.env.ANTHROPIC_API_KEY?{provider:'anthropic',key:process.env.ANTHROPIC_API_KEY}:{provider:'claude-cli'},invalid=false
 try{config={...config,...JSON.parse(await readFile(path.join(work,'.studio/model.json'),'utf8'))}}catch(e){if(e.code!=='ENOENT')invalid=true}
 const model=resolve(config),faults=missing(config),configured=!invalid&&(model.provider==='claude-cli'?cli:!faults.length)
 checks.push({id:'model',ok:configured,provider:model.provider,message:invalid?'The saved model configuration is unreadable.':configured?`${model.label} configured; authentication is checked on the first model request.`:model.provider==='claude-cli'?'Claude Code was not found on PATH.':'Model configuration needs '+faults.join(', '),next:'Sign in to Claude Code, set ANTHROPIC_API_KEY, or choose a provider in studio Settings.'})
 const kit=renderer(),status=await kit.status();let ready=status.state==='ready',message=status.message
 if(ready&&checkBrowser){
  for(let attempt=0;attempt<2;attempt++){let browser
   try{const chromium=await loadChromium();browser=await chromium.launch({channel:'chromium'});const page=await browser.newPage();await page.setContent('<h1>Motioneer</h1>');await page.screenshot();message='Chromium launches and captures; video encoder installed.';break}
   catch(e){if(attempt===1){ready=false;message='Renderer cannot launch: '+e.message.split('\n')[0]+'\n'+e.message.slice(-900)}else await new Promise(r=>setTimeout(r,300))}
   finally{await browser?.close()}
  }
 }
 checks.push({id:'renderer',ok:ready,message,next:'Run npx motioneer setup. On Linux, install Chromium system libraries if the launch error requests them.'})
 return{version:pkg.version,ready:checks.every(c=>c.ok),workspace:work,checks:checks.map(c=>c.ok?(({next,...rest})=>rest)(c):c)}
}
export async function installRenderer(onStep=()=>{}){
 const kit=renderer();if((await kit.status()).state==='ready')return
 onStep('Installing the local renderer: Chromium and FFmpeg. This download is cached for future projects.')
 kit.install();const deadline=Date.now()+10*60*1000;let last='' 
 while(Date.now()<deadline){const state=await kit.status();if(state.state==='ready')return;if(state.message!==last){last=state.message;onStep(last)}if(state.state==='error')throw Error('Cannot install the renderer: '+state.message+'. Next: retry npx motioneer setup.');await new Promise(r=>setTimeout(r,1000))}
 throw Error('Cannot finish renderer setup within ten minutes. Next: retry npx motioneer setup to resume cached downloads.')
}
/** Install through the running studio so its export status and the agent agree. */
export async function prepareRenderer(at,onStep=()=>{}){
 const status=async()=>{const r=await fetch(at+'/__motioneer/renderer',{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Cannot read renderer status. Next: restart the studio with npx motioneer.');return r.json()}
 let current=await status();if(current.state==='ready')return
 onStep('Setting up Chromium and FFmpeg for the first film. Downloads are cached for later projects.')
 const started=await fetch(at+'/__motioneer/renderer',{method:'POST',signal:AbortSignal.timeout(10000)});if(!started.ok)throw Error('Cannot start renderer setup. Next: run npx motioneer setup.')
 const deadline=Date.now()+10*60*1000;let last=''
 while(Date.now()<deadline){current=await status();if(current.state==='ready')return;if(current.state==='error')throw Error('Cannot set up the renderer: '+current.message+'. Next: run npx motioneer setup and retry.');if(current.message!==last){last=current.message;onStep(last)}await new Promise(r=>setTimeout(r,1000))}
 throw Error('Cannot finish renderer setup within ten minutes. Next: run npx motioneer doctor and retry when setup is ready.')
}
export async function mcpConfig(dir){
 const pkg=await packageInfo()
 return{mcpServers:{motioneer:{command:'npx',args:['-y',`motioneer@${pkg.version}`,'mcp'],env:{MOTIONEER_WORKSPACE:await workspace(dir),...(process.env.MOTIONEER_PORT?{MOTIONEER_PORT:process.env.MOTIONEER_PORT}:{})}}}}
}
export async function connectClaude(dir){
 const file=path.join(await workspace(dir),'.mcp.json'),entry=(await mcpConfig(dir)).mcpServers.motioneer;let original=''
 try{original=await readFile(file,'utf8')}catch(e){if(e.code!=='ENOENT')throw e}
 let config;try{config=original?JSON.parse(original):{}}catch{throw Error('Cannot update .mcp.json: it is not valid JSON. Next: repair it or use npx motioneer mcp-config to copy the entry yourself.')}
 if(!config||typeof config!=='object'||Array.isArray(config)||config.mcpServers&&(typeof config.mcpServers!=='object'||Array.isArray(config.mcpServers)))throw Error('Cannot update .mcp.json: expected an object with mcpServers. Next: use npx motioneer mcp-config.')
 const existing=config.mcpServers?.motioneer
 if(existing&&JSON.stringify(existing)!==JSON.stringify(entry))throw Error('Cannot replace the existing motioneer MCP entry automatically. Next: review npx motioneer mcp-config and update that entry.')
 if(existing)return{file,changed:false}
 config.mcpServers={...config.mcpServers,motioneer:entry};const temp=file+'.'+randomUUID()+'.tmp'
 try{await writeFile(temp,JSON.stringify(config,null,2)+'\n',{mode:0o600,flag:'wx'});await rename(temp,file)}finally{await rm(temp,{force:true})}
 return{file,changed:true}
}
