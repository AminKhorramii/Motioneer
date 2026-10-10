import path from 'node:path'
import {mkdir,copyFile,writeFile} from 'node:fs/promises'
export async function filmCommand(command,args){
 const flags=new Map(),boolean=new Set(['--json','--dry-run']),allowed=new Set(command==='benchmark'?['--manifest','--out','--at','--limit','--json','--dry-run']:['--project','--out','--at','--json',...(command==='refine'?['--tracks','--direction','--lock','--review-passes']:[])])
 for(let i=0;i<args.length;i++){const key=args[i];if(!allowed.has(key)||flags.has(key))throw Error('Unknown or repeated film option: '+key);if(boolean.has(key))flags.set(key,true);else{const value=args[++i];if(!value||value.startsWith('--'))throw Error('Missing value for '+key);flags.set(key,value)}}
 // this workspace's studio, started when there is none, rather than whatever answers on 4321
 const at=flags.get('--at')||(flags.has('--dry-run')?'http://127.0.0.1:4321':await (await import('../mcp/studio-process.mjs')).ensureStudio()),onStep=m=>console.error(m)
 if(!at)throw Error('Cannot start a studio for this workspace. Next: run npx motioneer doctor, or pass --at with a running studio.')
 if(!flags.has('--dry-run')){const {prepareRenderer}=await import('./environment.mjs');await prepareRenderer(at,onStep)}
 let result
 if(command==='benchmark'){const {runBenchmark}=await import('./editor/benchmark.mjs');result=await runBenchmark({manifest:flags.get('--manifest')?path.resolve(flags.get('--manifest')):undefined,out:flags.get('--out')?path.resolve(flags.get('--out')):undefined,at,limit:flags.has('--limit')?Number(flags.get('--limit')):undefined,dryRun:Boolean(flags.get('--dry-run')),onStep})}
 else{const {runFilmTool}=await import('../mcp/film-tools.mjs');result=await runFilmTool(command,{projectId:flags.get('--project'),trackIds:flags.get('--tracks')?.split(','),lockedTrackIds:flags.get('--lock')?.split(',')||[],direction:flags.get('--direction'),reviewPasses:flags.has('--review-passes')?Number(flags.get('--review-passes')):0},{at,onStep});if(flags.has('--out')){const dir=path.resolve(flags.get('--out'));await mkdir(dir,{recursive:true});const file=path.join(dir,result.projectId+'.mp4');await copyFile(result.file,file);result.file=file;if(result.review?.storyboard){const s=result.review.storyboard;await writeFile(path.join(dir,result.projectId+'-storyboard.jpg'),Buffer.from(s.data,'base64'))}}if(result.review){const {storyboard,...review}=result.review;result.review=review}}
 console.log(JSON.stringify(result,null,flags.has('--json')?0:2));if(result.cases?.some(c=>['failed','rendered-with-technical-failures'].includes(c.status)))process.exitCode=1
}

/**
 * One call to Motioneer's own MCP server, run as a child, so the terminal and CI get exactly what an
 * agent gets: the same tools, the same replies, the same files. Progress goes to stderr.
 */
async function callTool(name, args, onStep) {
  const {spawn}=await import('node:child_process'),{fileURLToPath}=await import('node:url')
  const server=spawn(process.execPath,[fileURLToPath(new URL('../mcp/index.mjs',import.meta.url))],{stdio:['pipe','pipe','inherit'],env:process.env})
  let buffer=''
  return new Promise((done,fail)=>{
   server.stdout.on('data',d=>{buffer+=d;const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines){let m;try{m=JSON.parse(line)}catch{continue}
    if(m.method==='notifications/progress')onStep(m.params.message)
    if(m.id===2){server.kill();const s=m.result?.structuredContent||{};m.result?.isError?fail(Error(s.error||m.result.content?.[0]?.text)):done(s)}}})
   server.on('exit',code=>fail(Error(`Cannot finish: the Motioneer server stopped (${code}). Next: run npx motioneer doctor.`)))
   server.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'motioneer-cli',version:'1'}}})+'\n')
   server.stdin.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name,arguments:args,_meta:{progressToken:'cli'}}})+'\n')
  })
}

/**
 * Films from the terminal and from CI: one film, one refresh, or every recipe in a file. A recipe
 * file is how films stay current without anybody asking: CI films the app on each release, and the
 * MP4s and live HTML films come out as artifacts.
 *
 *   npx motioneer film <url> [--mode capture|auto] [--pick words] [--pace fast] [--seconds 12] [--direction words] [--out dir] [--json]
 *   npx motioneer refresh <projectId> [--out dir] [--json]
 *   npx motioneer films <recipes.json> [--out dir] [--json]
 */
export async function filmsCommand(command,args){
 const flags=new Map(),positional=[],strings=['--mode','--pick','--pace','--seconds','--direction','--count','--out']
 for(let i=0;i<args.length;i++){const a=args[i];if(a==='--json'){flags.set(a,true);continue}if(a.startsWith('--')){if(!strings.includes(a)||command!=='film'&&a!=='--out')throw Error(`Cannot read option ${a}. Next: run npx motioneer --help.`);const v=args[++i];if(!v||v.startsWith('--'))throw Error(`Cannot read ${a}. Next: provide its value.`);flags.set(a,v);continue}positional.push(a)}
 if(positional.length!==1)throw Error(`Cannot ${command}: it takes one ${command==='film'?'url':command==='refresh'?'projectId':'recipe file'}. Next: run npx motioneer --help.`)
 const dir=path.resolve(flags.get('--out')||'.'),onStep=m=>console.error(m)
 const recipes=command==='films'?(JSON.parse(await (await import('node:fs/promises')).readFile(path.resolve(positional[0]),'utf8')).films||[]):[command==='refresh'?{refresh:positional[0]}:{url:positional[0],...Object.fromEntries([['mode','--mode'],['pick','--pick'],['pace','--pace'],['direction','--direction']].filter(([,f])=>flags.has(f)).map(([k,f])=>[k,flags.get(f)])),...(flags.has('--seconds')?{seconds:Number(flags.get('--seconds'))}:{}),...(flags.has('--count')?{count:Number(flags.get('--count'))}:{})}]
 if(!recipes.length)throw Error('Cannot film: the recipe file lists no films. Next: add a "films" array of film arguments.')
 const results=[]
 for(const recipe of recipes){
  const {name,...film}=recipe
  try{const r=await callTool('film',{...film,dir},onStep);results.push({name:name||film.url||film.refresh,ok:true,summary:r.summary,projectId:r.projectId,video:r.artifacts?.video||r.file,html:r.artifacts?.html||null,verdict:r.verdict})}
  catch(e){results.push({name:name||film.url||film.refresh,ok:false,error:e.message})}
 }
 if(flags.has('--json'))console.log(JSON.stringify({films:results},null,2))
 else for(const r of results)console.log(`${r.ok?'✓':'!'} ${r.name}\n  ${r.ok?`${r.video}${r.html?'\n  '+r.html:''}\n  ${r.summary}`:r.error}`)
 if(results.some(r=>!r.ok))process.exitCode=1
}
