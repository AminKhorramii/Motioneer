/** A graphic brand film, separate from the faithful page-capture edit. No new document schema. */
import {createProject,newTrack,validateProject} from '../../dist-core/core.js'
import {SCENES,MOTIFS,sceneDocument} from './kinetic-scenes.mjs'
import {MUSIC,musicPlan} from './music.mjs'
import {withSoundtrack} from './soundtrack.mjs'
import {websiteMedia} from './media-source.mjs'
import {PRODUCT_SCENES,captureInventory,productDocument} from './hybrid.mjs'
import {autofilm,renderProject,proveRender} from './autofilm.mjs'
const clean=(v,max=60)=>String(v??'').replace(/[\x00-\x1f]/g,' ').trim().slice(0,max)
export function normalizeReel(raw,{brand,domain,seconds=12,palette,captures=[],music}={}){
 if(!brand?.trim())throw new Error('Cannot make a reel: a brand name is needed. Next: name the company.')
 if(!Number.isFinite(seconds)||seconds<6||seconds>30)throw new Error('Cannot make a reel: choose 6 to 30 seconds. Next: pass a short duration.')
 const colors=palette||raw.palette
 if(!Array.isArray(colors)||colors.length!==3||!colors.every(c=>/^#[0-9a-f]{6}$/i.test(c)))throw new Error('Cannot make a reel: palette needs three hex colors, dark, accent, paper. Next: pass three six-digit hex colors.')
 if(!Array.isArray(raw.scenes)||raw.scenes.length<8||raw.scenes.length>20)throw new Error('Cannot make a reel: the plan needs 8 to 20 scenes. Next: retry the creative plan.')
 const motif=MOTIFS.includes(raw.motif)?raw.motif:'orbit'
 const scenes=raw.scenes.map((s,i)=>({type:[...SCENES,...PRODUCT_SCENES].includes(s.type)?s.type:'type',captureId:captures[Number(s.capture)]?.id,motif:MOTIFS.includes(s.motif)?s.motif:motif,tone:['dark','paper','accent'].includes(s.tone)?s.tone:'dark',text:clean(s.text,36),detail:clean(s.detail,35),labels:Array.isArray(s.labels)?s.labels.slice(0,4).map(x=>clean(x,18)):[],beats:[1,2,3,4].includes(s.beats)?s.beats:2}))
 // A wordless beat still needs an image; empty type would render only the background.
 for(const scene of scenes)if(!scene.text&&(['type','echo'].includes(scene.type)||(scene.type==='stack'&&!scene.labels.some(Boolean))))scene.type='grid'
 for(const scene of scenes)if(PRODUCT_SCENES.includes(scene.type)){if(!scene.captureId)throw new Error('Cannot blend the film: a scene names a missing capture. Next: retry with a capture from the contact sheet.');scene.beats=Math.max(4,scene.beats)}
 scenes[0]={...scenes[0],type:'impact',text:brand};scenes[scenes.length-1]={...scenes.at(-1),type:'resolve',text:brand,beats:4}
 if(new Set(scenes.map(s=>s.type)).size<5)throw new Error('Cannot make a reel: the plan repeats too few visual ideas. Next: include at least five scene types.')
 if(captures.length&&scenes.filter(s=>PRODUCT_SCENES.includes(s.type)).length<3)throw new Error('Cannot blend the film: the plan needs at least three actual capture scenes. Next: retry with more product reveals.')
 return {brand:clean(brand,24),domain:clean(domain||raw.domain,60),concept:clean(raw.concept,45),motif,palette:colors,seconds,scenes,music:musicPlan({...raw.music,...(music?{profile:music}:{})},brand+' '+clean(raw.concept,45))}
}
export function reelProject(base,plan,captures=[]){
 const p={...createProject(`${plan.brand} / ${plan.concept||'Kinetic reel'}`),id:base.id,revision:base.revision,source:base.source||'',settings:{...base.settings,width:1920,height:1080,fps:60,duration:Math.round(plan.seconds*1000),from:0,to:Math.round(plan.seconds*1000),background:plan.palette[0]}}
 const units=plan.scenes.reduce((n,s)=>n+s.beats,0),beat=p.settings.duration/units,shots=[];let at=0
 plan.scenes.forEach((scene,i)=>{
  const end=i===plan.scenes.length-1?p.settings.duration:Math.round(at+scene.beats*beat),duration=end-at
  const capture=PRODUCT_SCENES.includes(scene.type)?captures.find(c=>c.id===scene.captureId):null
  if(PRODUCT_SCENES.includes(scene.type)&&!capture)throw new Error('Cannot build the film: its source capture is missing. Next: rebuild from the source project.')
  const graphic=sceneDocument(capture?{...scene,type:'orbit',text:'',detail:''}:scene,plan,i,duration)
  const {html,css}=capture?productDocument({...scene,ms:duration},plan,capture,graphic):graphic,subjectId=crypto.randomUUID(),motionId=crypto.randomUUID()
  p.subjects.push({id:subjectId,name:`${String(i+1).padStart(2,'0')} ${scene.type}: ${scene.text}`,html,css:'',w:1920,h:1080,warnings:capture?[`Website capture ${capture.id}: ${capture.name}. Source pixels are flattened inside authored graphics.`,...capture.warnings]:['Authored brand graphics; diagrams are illustrative, not captured product interfaces.']})
  p.motions.push({id:motionId,subjectId,css,scope:'data-kinetic',note:scene.detail||scene.type,treatment:'bold',brief:{purpose:'entrance',intensity:'bold',duration,direction:plan.concept},duration,saved:true})
  p.tracks.push({...newTrack('component',scene.text,at),subjectId,motionId,duration,x:0,y:0,width:100,height:100,moves:[]})
  shots.push({shot:i+1,at:at/1000,seconds:duration/1000,elements:[capture?.name||scene.text||scene.motif],layout:scene.type,...(capture?{captureId:capture.id}:{} )});at=end
 })
 return {project:validateProject(p),shots,bpm:60000/beat}
}
export async function kineticReel({at,brand,domain,projectId,url,mode='graphic',direction='',seconds=12,palette,music,plan:provided,onStep=()=>{}}){
 if(music&&!MUSIC[music])throw new Error('Cannot score: that musical identity is unknown. Next: choose a music profile listed by reel.')
 if(!['graphic','hybrid'].includes(mode))throw new Error('Cannot make a reel: mode must be graphic or hybrid. Next: choose one of those modes.')
 if(mode==='hybrid'&&!projectId){if(!url)throw new Error('Cannot blend the film: a source project or website URL is needed. Next: pass projectId or url.');onStep('Capturing the website for the hybrid film.');projectId=await websiteMedia({at,url,onStep}).catch(e=>{onStep('Website preview discovery was unavailable; using the normal capture flow.');return null});if(!projectId){const captured=await autofilm({at,url,seconds:12,max:6,fps:60,captureMode:'pixels',pace:'brisk',soundtrack:'none',direction,onStep});projectId=captured.projectId}}
 let source=null
 if(projectId){const r=await fetch(`${at}/__motioneer/projects/${projectId}`);if(!r.ok)throw new Error('Cannot make a reel: that source project was not found. Next: use a project ID from this studio.');source=await r.json()}
 const inventory=mode==='hybrid'?await captureInventory(source,{at,onStep}):{captures:[],sheet:null}
 onStep('Directing a kinetic brand film: visual metaphors, typography, rhythm, and a clear finish.')
 const prompt=`Design a ${seconds}-second art-directed graphic film for ${brand}. Domain ${domain||source?.source||''}.\nCreative brief: ${direction}\nKnown product content: ${(source?.subjects||[]).map(s=>s.name).join('; ').slice(0,1800)}\nReference language: a bold brand identity film that transforms a mark into type, diagrams, and spatial systems. Snap typography into place, zoom through graphic structures, alternate bursts with composed holds. This is an original graphic brand film, not a page slideshow. Avoid invented metrics, endorsements, or claims.\nPalette dark/accent/paper: ${palette?JSON.stringify(palette):'choose three six-digit hex colors appropriate to the brand'}. Choose one conceptual motif from ${MOTIFS.join(', ')} and vary the choreography.\nGive concept a concise title of at most 35 characters. Plan 12 to 16 scenes with a mixture of one-beat bursts, two-beat scenes and composed three/four-beat holds, not uniform shot lengths. Leave text empty for some purely graphic scenes; do not repeat the brand on them. Each scene: type from ${SCENES.join(', ')}, text 1 to 3 short words (max 24 characters; type permits up to 4 words), detail max 25 characters, labels 2 to 4 short labels for diagram/stack scenes, motif, tone dark/paper/accent, beats 1/2/3/4. Aim 30 to 36 beats total. Use at least 6 different scene types. Change visual SCALE as well as scene type. No more than two scenes in a row with the same layout. Resolve with a four-beat brand/domain hold. No gratuitous full-screen flashes. Each company should have a distinct concept rooted in what it does.\nReturn JSON only: {concept,motif,palette,domain,scenes:[...]}`
 const musicPrompt=`\nMUSIC: Compose a distinct sonic identity that supports this brand metaphor. Choose profile from ${Object.entries(MUSIC).map(([id,p])=>id+': '+p.description).join('; ')}. ${music?'Required profile: '+music+'.':''} Return music:{profile,root,motif} alongside the scene plan. root is a MIDI tonic from 36 to 59. motif is 4 to 12 scale-degree indices from 0 to 14, a memorable original phrase with repetition and an answer. Avoid an arbitrary random note stream. Music and scene beats share a clock; the final chord lands on the closing scene. For a 20-second film build a complete phrase with a quieter middle and a decisive finish.`
 const hybridPrompt=mode==='hybrid'?`\nHYBRID FILM: You MUST combine authored graphic beats with real website capture scenes. The attached sheet shows the actual captures. Inventory: ${inventory.captures.map((c,i)=>`${i}: ${c.name}`).join('; ')}. Pick visually strong UI, feature cards or source artwork; avoid customer photos, empty captures, navigation and tiny labels. Do not choose a plain text headline when usable product visuals exist. Narrow cards look best in product-split scenes. Use 4 to 5 capture scenes, at least 3, interleaved through the film, with type product, product-detail or product-split and capture as the numeric sheet index. Use at least two different captures when usable product visuals are available. Reframe one strong UI rather than including a testimonial or plain text to meet a count. For these scenes use short editorial text (1 to 3 words), 4 beats each so product content can be recognized. Alternate a complete reveal with a detail or a split featuring a different capture. Product scenes should occupy about half the film. The other scenes remain fast graphic bursts, and opening/closing are graphic brand holds. Do not invent product screenshots: source pixels will be used as shown. Return the same JSON schema, plus capture on product scenes.`:''
 const reply=provided?{json:provided}:await fetch(`${at}/__motioneer/ask`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({system:'You are a motion design director. Deliver a precise, original graphic film plan as JSON.',prompt:prompt+hybridPrompt+musicPrompt,json:true,images:inventory.sheet?[inventory.sheet]:[]})}).then(r=>r.json())
 if(!reply.json)throw new Error(`Cannot direct the reel: ${reply.error||'no plan returned'}. Next: retry the brief.`)
 const plan=normalizeReel(reply.json,{brand,domain,seconds,palette,captures:inventory.captures,music})
 const fresh=await fetch(`${at}/__motioneer/projects`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:`${brand} kinetic`})}).then(r=>r.json())
 if(!fresh.id)throw new Error('Cannot save the reel: no project was created. Next: retry.')
 fresh.source=source?.source||(domain?'https://'+domain:'')
 const made=reelProject(fresh,plan,inventory.captures)
 onStep(`${plan.concept}: ${made.shots.length} graphic scenes, ${Math.round(made.bpm)} BPM.`)
 const project=await withSoundtrack(made.project,{at,style:'signature',bpm:made.bpm,music:plan.music,onStep})
 const saved=await fetch(`${at}/__motioneer/projects/${project.id}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(project)}).then(r=>r.json())
 if(saved.error)throw new Error(`Cannot save the reel: ${saved.error}. Next: retry.`)
 onStep('Rendering the authored graphic scenes at 60 fps.')
 const rendered=await renderProject(at,project.id,onStep),cuts=made.shots.slice(1).map(s=>s.at*1000)
 const proved=await proveRender(rendered.url,{pace:'fast',seconds,cuts})
 return {projectId:project.id,at,file:proved.file,url:rendered.url,proof:proved.proof,seconds,fps:60,soundtrack:'signature',music:plan.music,shotList:made.shots,plan,bpm:made.bpm,sourceProjectId:projectId||null,mode,sourceSheet:inventory.sheet,captures:inventory.captures.map(({data,...c})=>c),limitation:mode==='hybrid'?'Actual website captures mixed with authored graphics. Captured pixels are flattened; diagrams remain illustrative.':'Original illustrative brand graphics, not captured product UI.'}
}
