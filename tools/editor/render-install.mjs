/** Serialize shared-cache installation; reclaim locks only when their owner has exited. */
import {mkdir,readFile,writeFile,stat,rm} from 'node:fs/promises'
import path from 'node:path'
export const installLock=cache=>path.join(cache,'.installing')
export async function withInstallLock(cache,install){
 await mkdir(cache,{recursive:true});const lock=installLock(cache),deadline=Date.now()+10*60*1000
 while(true){
  try{await mkdir(lock);break}catch(e){if(e.code!=='EEXIST')throw e}
  let stale=false
  try{const owner=JSON.parse(await readFile(path.join(lock,'owner.json'),'utf8'));if(!Number.isInteger(owner.pid)||owner.pid<=0)throw Error('Invalid renderer lock owner');try{process.kill(owner.pid,0)}catch(e){if(e.code==='ESRCH')stale=true;else if(e.code!=='EPERM')throw e}}
  catch(e){if(e.code==='ENOENT'||e instanceof SyntaxError){try{stale=Date.now()-(await stat(lock)).mtimeMs>30000}catch(e){if(e.code==='ENOENT')continue;throw e}}else throw e}
  if(stale){await rm(lock,{recursive:true,force:true});continue}
  if(Date.now()>deadline)throw Error('Another renderer setup is still running. Wait for it to finish and retry.')
  await new Promise(r=>setTimeout(r,250))
 }
 try{await writeFile(path.join(lock,'owner.json'),JSON.stringify({pid:process.pid}));return await install()}
 finally{await rm(lock,{recursive:true,force:true})}
}
