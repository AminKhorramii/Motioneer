/** A bounded text/image completion through the user's signed-in Codex CLI. */
import {spawn} from 'node:child_process'
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {hasClaude} from './cli.mjs'

export const hasCodex=()=>hasClaude('codex')

export async function runCodex(system,user,{model,bin='codex',onDelta,signal,callMs=240000,env=process.env,images=[]}={}){
 if(signal?.aborted)return{error:'Cancelled'}
 const dir=await mkdtemp(path.join(tmpdir(),'motioneer-codex-'))
 try{
  const instructions=path.join(dir,'instructions.txt'),output=path.join(dir,'reply.txt')
  await writeFile(instructions,system,{mode:0o600})
  // Keep local project instructions, user MCP servers and hooks out of a generation call.
  // Authentication remains in Codex's normal credential store; we never copy it.
  const args=['exec','--ephemeral','--ignore-user-config','--skip-git-repo-check','--sandbox','read-only','--color','never',
   '-c','approval_policy="never"','-c','features.shell_tool=false','-c','features.apps=false','-c','features.hooks=false',
   '-c','features.memories=false','-c','features.multi_agent=false','-c','web_search="disabled"','-c','mcp_servers={}',
   '-c','project_doc_max_bytes=0','-c',`model_instructions_file=${JSON.stringify(instructions)}`,'-o',output]
  if(model)args.push('--model',model)
  for(const [i,pic] of images.entries()){
   if(!pic?.data)continue
   const ext=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'})[pic.mime||pic.media_type||pic.type]
   if(!ext)return{error:'Codex images must be PNG, JPEG or WebP.'}
   const file=path.join(dir,`image-${i}.${ext}`);await writeFile(file,Buffer.from(pic.data,'base64'),{mode:0o600});args.push('--image',file)
  }
  args.push('-')
  return await new Promise(resolve=>{
   const child=spawn(bin,args,{cwd:dir,env,stdio:['pipe','ignore','pipe']});let stderr='',reason='',done=false,hardStop
   const stop=why=>{reason=why;child.kill('SIGTERM');hardStop??=setTimeout(()=>child.kill('SIGKILL'),1000)}
   const abort=()=>stop('Cancelled'),timer=setTimeout(()=>stop('Codex timed out. Retry or increase the model call timeout.'),callMs)
   const finish=async error=>{
    if(done)return;done=true;clearTimeout(timer);clearTimeout(hardStop);signal?.removeEventListener('abort',abort)
    if(error)return resolve({error})
    try{const text=(await readFile(output,'utf8')).trim();if(!text)return resolve({error:'Codex returned an empty reply.'});onDelta?.(text);resolve({text})}
    catch{resolve({error:'Codex did not write a final reply. Update Codex and run codex login, then retry.'})}
   }
   child.stderr.on('data',d=>{stderr=(stderr+d).slice(-8000)})
   child.stdin.on('error',()=>{})
   child.on('error',()=>finish('Cannot start Codex. Install the Codex CLI and run codex login.'))
   child.on('close',code=>finish(reason||(code!==0?(/unexpected argument|unknown option/.test(stderr)?'Update Codex: this provider requires codex exec --ignore-user-config and --ephemeral.':'Codex could not complete the request. Check codex login status and your model access, then retry.'):null)))
   signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()
   child.stdin.end(user)
  })
 }catch{return{error:'Cannot prepare a Codex completion. Check access to the temporary directory.'}}
 finally{await rm(dir,{recursive:true,force:true})}
}
