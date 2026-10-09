import {currentEvents} from '../tools/editor/film-events.mjs'
/** Agent tools for evaluating and refining a saved film without rebuilding its edit. */
import {projectRequest,createRefinementTake} from '../tools/editor/refinement.mjs'
import {renderProject,proveRender,paceOf} from '../tools/editor/autofilm.mjs'
import {reviewAndRefine} from '../tools/editor/film-review.mjs'
import {resolve} from '../shared/arrange.mjs'
export function projectShots(project){
 const starts=resolve({cars:project.tracks.map(t=>({key:t.id,at:t.start,after:t.after,motion:{ms:t.duration}}))}).at
 const metadata=project.direction?.scenes||[]
 return project.tracks.map((t,i)=>({...t,start:starts[i]})).filter(t=>t.kind!=='audio'&&!t.hidden&&t.start<project.settings.to&&t.start+t.duration>project.settings.from).sort((a,b)=>a.start-b.start).map((t,i)=>({sceneId:metadata.find(s=>s.trackId===t.id)?.sceneId||t.id,trackId:t.id,shot:i+1,at:Math.max(0,t.start-project.settings.from)/1000,seconds:(Math.min(t.start+t.duration,project.settings.to)-Math.max(t.start,project.settings.from))/1000,elements:[t.name],locked:t.locked}))
}
export async function runFilmTool(name,args,{at,onStep=()=>{}}){
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(args.projectId||''))throw Error('Choose an existing projectId.')
 const passes=args.reviewPasses??0;if(!Number.isInteger(passes)||passes<0||passes>2)throw Error('Review passes must be 0, 1 or 2.')
 const change=name==='refine'?await createRefinementTake({at,...args,onStep}):{project:await projectRequest(at,'/__motioneer/projects/'+args.projectId),sourceProjectId:args.projectId,changes:[]}
 const project=change.project,shots=projectShots(project),seconds=(project.settings.to-project.settings.from)/1000
 const rendered=await renderProject(at,project.id,onStep),proved=await proveRender(rendered.url,{seconds,pace:paceOf(project),cuts:[...new Set(shots.slice(1).map(s=>s.at*1000))]})
 // looking without critique is a render and a storyboard: no model call, nothing changed
 const result=name==='review'&&args.critique===false?{project,file:proved.file,url:rendered.url,proof:proved.proof,review:{status:'not-requested',issues:[],attempts:[]}}:await reviewAndRefine({at,project,rendered:{file:proved.file,url:rendered.url,proof:proved.proof},shots,seconds,brief:project.direction?.brief,passes:name==='refine'?passes:0,onStep})
 return{projectId:result.project.id,editor:`${at}/__motioneer/editor/?project=${encodeURIComponent(result.project.id)}&view=film`,sourceProjectId:change.sourceProjectId,changes:change.changes,unchanged:change.unchanged||false,seconds,fps:project.settings.fps,file:result.file,url:result.url,proof:result.proof,review:result.review,shotList:shots,brief:project.direction?.brief,events:currentEvents(result.project).events,eventStatus:currentEvents(result.project).status,transitions:(project.direction?.transitions||[]).map(t=>({...t,status:currentEvents(result.project).status})),limitation:'Review assesses sampled exported frames when available; check its status. Human motion and artistic review remain necessary.'}
}
