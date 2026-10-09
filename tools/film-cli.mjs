import path from 'node:path'
import {mkdir,copyFile,writeFile} from 'node:fs/promises'
export async function filmCommand(command,args){
 const flags=new Map(),boolean=new Set(['--json','--dry-run']),allowed=new Set(command==='benchmark'?['--manifest','--out','--at','--limit','--json','--dry-run']:['--project','--out','--at','--json',...(command==='refine'?['--tracks','--direction','--lock','--review-passes']:[])])
 for(let i=0;i<args.length;i++){const key=args[i];if(!allowed.has(key)||flags.has(key))throw Error('Unknown or repeated film option: '+key);if(boolean.has(key))flags.set(key,true);else{const value=args[++i];if(!value||value.startsWith('--'))throw Error('Missing value for '+key);flags.set(key,value)}}
 const at=flags.get('--at')||'http://localhost:4321',onStep=m=>console.error(m)
 if(!flags.has('--dry-run')){const {prepareRenderer}=await import('./environment.mjs');await prepareRenderer(at,onStep)}
 let result
 if(command==='benchmark'){const {runBenchmark}=await import('./editor/benchmark.mjs');result=await runBenchmark({manifest:flags.get('--manifest')?path.resolve(flags.get('--manifest')):undefined,out:flags.get('--out')?path.resolve(flags.get('--out')):undefined,at,limit:flags.has('--limit')?Number(flags.get('--limit')):undefined,dryRun:Boolean(flags.get('--dry-run')),onStep})}
 else{const {runFilmTool}=await import('../mcp/film-tools.mjs');result=await runFilmTool(command,{projectId:flags.get('--project'),trackIds:flags.get('--tracks')?.split(','),lockedTrackIds:flags.get('--lock')?.split(',')||[],direction:flags.get('--direction'),reviewPasses:flags.has('--review-passes')?Number(flags.get('--review-passes')):0},{at,onStep});if(flags.has('--out')){const dir=path.resolve(flags.get('--out'));await mkdir(dir,{recursive:true});const file=path.join(dir,result.projectId+'.mp4');await copyFile(result.file,file);result.file=file;if(result.review?.storyboard){const s=result.review.storyboard;await writeFile(path.join(dir,result.projectId+'-storyboard.jpg'),Buffer.from(s.data,'base64'))}}if(result.review){const {storyboard,...review}=result.review;result.review=review}}
 console.log(JSON.stringify(result,null,flags.has('--json')?0:2));if(result.cases?.some(c=>['failed','rendered-with-technical-failures'].includes(c.status)))process.exitCode=1
}
