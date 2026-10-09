/** An incrementally saved evidence report, not a self-awarded artistic score. Real exports require explicit execution. */
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises'
import path from 'node:path'
import {connectedTracks,projectRequest} from './refinement.mjs'
import {kineticReel} from './kinetic.mjs'
import {runFilmTool} from '../../mcp/film-tools.mjs'
export function validateBenchmark(raw){
 if(raw?.version!==1||!Array.isArray(raw.cases)||!raw.cases.length||raw.cases.length>30||!Array.isArray(raw.revisions)||raw.revisions.length!==3||raw.revisions.some(s=>typeof s!=='string'||!s.trim()))throw Error('Benchmark needs 1 to 30 cases and exactly three revision prompts.')
 const ids=new Set();for(const c of raw.cases){if(!/^[a-z0-9-]{1,60}$/.test(c.id)||ids.has(c.id)||!c.brand?.trim()||typeof c.direction!=='string'||!/^https?:\/\//.test(c.url))throw Error('Each benchmark needs a unique ID, brand, HTTP URL and direction.');ids.add(c.id)}return raw
}
export async function runBenchmark({manifest=new URL('../../docs/benchmarks/products.json',import.meta.url),out,at='http://localhost:4321',limit,dryRun=false,onStep=()=>{}},{reel=kineticReel,refine=runFilmTool,getProject=projectRequest}={}){
 const suite=validateBenchmark(JSON.parse(await readFile(manifest,'utf8')))
 if(limit!==undefined&&(!Number.isInteger(limit)||limit<1||limit>suite.cases.length))throw Error('Benchmark limit must select at least one available case.')
 const cases=suite.cases.slice(0,limit??suite.cases.length),report={version:1,startedAt:new Date().toISOString(),mode:dryRun?'dry-run':'live',cases:[],humanPreference:'unrated',modelCost:null,costNote:'Provider cost is not reported by this workflow; do not infer it from elapsed time.'}
 if(dryRun)return{...report,cases:cases.map(c=>({...c,revisions:suite.revisions,status:'not-run'}))}
 if(!out||!path.isAbsolute(out))throw Error('Live benchmark needs an absolute output directory.')
 await mkdir(out,{recursive:true})
 for(const c of cases){
  const record={...c,revisions:[],humanScores:{sourceFidelity:null,productRelevance:null,choreography:null,music:null,overallPreference:null}},start=Date.now();report.cases.push(record)
  try{
   onStep('Benchmark '+c.id)
   let result=await reel({at,...c,seconds:18,reviewPasses:1,onStep})
   const file=path.join(out,c.id+'.mp4');await copyFile(result.file,file)
   Object.assign(record,{projectId:result.projectId,file,proof:result.proof,review:stripReview(result.review),quality:result.quality,sourceSelection:result.sourceSelection})
   const shots=result.shotList,target=shots.find(s=>s.captureId&&!s.locked)||shots.find((s,j)=>j>0&&!s.locked)
   if(!target)throw Error('No unlocked motion track is available for benchmark revisions.')
   const project=await getProject(at,'/__motioneer/projects/'+result.projectId),trackIds=connectedTracks(project,[target.trackId])
   for(const [i,direction]of suite.revisions.entries()){
    const before=result.projectId;result=await refine('refine',{projectId:before,trackIds,direction,reviewPasses:0},{at,onStep})
    const file=path.join(out,`${c.id}-revision-${i+1}.mp4`);await copyFile(result.file,file)
    record.revisions.push({prompt:direction,projectId:result.projectId,sourceProjectId:before,file,changes:result.changes,proof:result.proof,review:stripReview(result.review)})
   }
   record.status=record.proof?.ok&&record.revisions.every(r=>r.proof?.ok)?'rendered-awaiting-human-review':'rendered-with-technical-failures'
  }catch(e){record.status='failed';record.error=e.message}
  record.elapsedMs=Date.now()-start;await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2))
 }
 report.completedAt=new Date().toISOString();await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));return report
}
const stripReview=review=>{if(!review)return null;const {storyboard,...rest}=review;return rest}
