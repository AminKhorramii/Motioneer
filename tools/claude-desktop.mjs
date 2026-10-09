/** Desktop launches outside a login shell. Keep its command, workspace and PATH explicit. */
import {access,readFile,writeFile,rename,rm,mkdir,lstat,realpath,open,link} from 'node:fs/promises'
import {constants} from 'node:fs'
import {homedir} from 'node:os'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
import {missing} from '../shared/model.mjs'
import {packageInfo,workspace} from './environment.mjs'

export function desktopLocation({platform=process.platform,home=homedir(),env=process.env}={}){
 if(platform==='darwin')return path.posix.join(home,'Library/Application Support/Claude/claude_desktop_config.json')
 if(platform==='win32')return path.win32.join(env.APPDATA||path.win32.join(home,'AppData/Roaming'),'Claude/claude_desktop_config.json')
 throw Error('Cannot configure Claude Desktop on this platform. Next: use setup --claude or setup --codex on Linux.')
}
export const desktopWorkspace=(home=homedir())=>path.join(home,'Motioneer')
const exists=async file=>{try{await access(file,constants.R_OK);return true}catch{return false}}

/** Resolve npm's JS entry point so Windows .cmd wrappers and GUI PATH rules do not matter. */
export async function desktopRuntime({env=process.env,node=process.execPath}={}){
 const bins=[path.dirname(node),...(env.PATH||env.Path||'').split(path.delimiter).filter(p=>path.isAbsolute(p))]
 const candidates=[]
 if(env.npm_execpath)candidates.push(path.join(path.dirname(env.npm_execpath),'npm-cli.js'))
 for(const bin of bins){
  candidates.push(path.join(bin,'node_modules/npm/bin/npm-cli.js'),path.join(bin,'../lib/node_modules/npm/bin/npm-cli.js'))
  for(const name of ['npm','npx'])try{candidates.push(path.join(path.dirname(await realpath(path.join(bin,name))),'npm-cli.js'))}catch{}
 }
 for(const candidate of candidates)if(path.isAbsolute(candidate)&&await exists(candidate)){
  try{if(JSON.parse(await readFile(path.join(path.dirname(candidate),'../package.json'),'utf8')).name!=='npm')continue}catch{continue}
  return{command:node,npmCli:path.resolve(candidate),searchPath:[...new Set(bins)].join(path.delimiter)}
 }
 throw Error('Cannot find the npm launcher for Claude Desktop. Next: install Node.js with npm, then rerun npx motioneer setup --claude-desktop.')
}
export async function desktopConfig(dir,{env=process.env,runtime,platform=process.platform,home=homedir()}={}){
 desktopLocation({platform,home,env})
 runtime??=await desktopRuntime({env})
 const pkg=await packageInfo()
 return{mcpServers:{motioneer:{command:runtime.command,args:[runtime.npmCli,'exec','--yes','--package=motioneer@'+pkg.version,'--','motioneer','mcp'],env:{PATH:runtime.searchPath,MOTIONEER_WORKSPACE:await workspace(dir),...(['claude-cli','codex-cli'].includes(env.MOTIONEER_PROVIDER)?{MOTIONEER_PROVIDER:env.MOTIONEER_PROVIDER}:{}),...(env.MOTIONEER_PORT?{MOTIONEER_PORT:env.MOTIONEER_PORT}:{}),...(env.MOTIONEER_RENDER_CACHE?{MOTIONEER_RENDER_CACHE:path.resolve(env.MOTIONEER_RENDER_CACHE)}:{})}}}}
}
const readConfig=async file=>{
 try{const info=await lstat(file);if(info.isSymbolicLink()||!info.isFile())throw Error('Cannot update a linked or non-file Claude Desktop config. Next: edit its Motioneer entry in Desktop Settings > Developer.');return await readFile(file,'utf8')}
 catch(e){if(e.code==='ENOENT')return null;throw e}
}
/** Preflight is read-only, so a conflict is caught before renderer downloads begin. */
export async function planDesktop(dir,options={}){
 const file=options.file||desktopLocation(options),entry=(await desktopConfig(dir,options)).mcpServers.motioneer,original=await readConfig(file)
 let config
 try{config=original===null?{}:JSON.parse(original)}catch{throw Error('Cannot update Claude Desktop: its config is not valid JSON. Next: repair it in Settings > Developer > Edit Config; the file was left unchanged.')}
 if(!config||typeof config!=='object'||Array.isArray(config)||('mcpServers' in config&&(!config.mcpServers||typeof config.mcpServers!=='object'||Array.isArray(config.mcpServers))))throw Error('Cannot update Claude Desktop: expected an object with mcpServers. Next: repair the config in Desktop Settings > Developer.')
 if(config.mcpServers&&Object.hasOwn(config.mcpServers,'motioneer')){
  if(isDeepStrictEqual(config.mcpServers.motioneer,entry))return{file,entry,original,changed:false}
  // Running from a different terminal can change PATH without changing the connection.
  const withoutPath=e=>({...e,env:{...e?.env,PATH:undefined}})
  if(!isDeepStrictEqual(withoutPath(config.mcpServers.motioneer),withoutPath(entry)))throw Error('Cannot replace the existing Motioneer connection in Claude Desktop. Next: review it in Settings > Developer > Edit Config, or print the proposed entry with npx motioneer mcp-config --claude-desktop.')
 }
 return{file,entry,original,changed:true,config:{...config,mcpServers:{...config.mcpServers,motioneer:entry}}}
}
export async function installDesktop(plan){
 const {file,original,changed,config}=plan,folder=path.dirname(file)
 await mkdir(folder,{recursive:true})
 if((await lstat(folder)).isSymbolicLink())throw Error('Cannot update a linked Claude Desktop config folder. Next: edit the configuration in Desktop Settings > Developer.')
 const lock=file+'.motioneer-lock',temp=file+'.'+randomUUID()+'.tmp'
 let handle,backup
 try{handle=await open(lock,'wx',0o600)}catch(e){if(e.code==='EEXIST')throw Error('Cannot configure Claude Desktop while another setup holds its lock. Next: wait for setup to finish; if it was interrupted, remove '+lock+' and retry.');throw e}
 try{
  if(await readConfig(file)!==original)throw Error('Cannot update Claude Desktop: its config changed during setup. Next: rerun setup to preserve the newer settings.')
  if(!changed)return{file,changed:false}
  if(original!==null){backup=file+'.backup-'+randomUUID()+'.json';await writeFile(backup,original,{mode:0o600,flag:'wx'})}
  await writeFile(temp,JSON.stringify(config,null,2)+'\n',{mode:0o600,flag:'wx'})
  if(await readConfig(file)!==original)throw Error('Cannot update Claude Desktop: its config changed during setup. Next: rerun setup to preserve the newer settings.')
  if(original===null){try{await link(temp,file)}catch(e){if(e.code==='EEXIST')throw Error('Cannot update Claude Desktop: its config appeared during setup. Next: rerun setup to preserve it.');throw e}}else await rename(temp,file)
  return{file,changed:true,...(backup?{backup}:{})}
 }finally{await handle.close();await rm(temp,{force:true});await rm(lock,{force:true})}
}

/** Shell API keys are intentionally not copied into Desktop's global JSON config. */
export async function desktopDiagnosis(report){
 const check=report.checks.find(c=>c.id==='model')
 if(!check||['claude-cli','codex-cli'].includes(check.provider))return report
 let saved={};try{saved=JSON.parse(await readFile(path.join(report.workspace,'.studio/model.json'),'utf8'))}catch{}
 if(!saved.provider||missing(saved).length){check.ok=false;check.message='Claude Desktop cannot inherit a model API key from this terminal.';check.next='Configure an API provider in this workspace’s Motioneer studio Settings, or install and sign in to Claude Code.';report.ready=false}
 return report
}
