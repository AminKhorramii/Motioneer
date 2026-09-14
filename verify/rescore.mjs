/** Exercise independent soundtrack takes against real project storage and decoded audio. */
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {projectStore} from '../tools/editor/projects.mjs'
import {createRescoreTake} from '../tools/editor/rescore.mjs'
import {readScoreFile} from '../tools/editor/score-file.mjs'
import {scoreWav} from '../tools/editor/soundtrack.mjs'
import {loadFfmpeg} from '../tools/editor/render.mjs'
import {newTrack} from '../dist-core/core.js'

if(!await loadFfmpeg()){console.log('skip: soundtrack file checks need the local renderer');process.exit(0)}
const root=await mkdtemp(path.join(tmpdir(),'motioneer-score-')),store=projectStore(path.join(root,'projects'))
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),parts=url.pathname.split('/').filter(Boolean),id=parts[2],chunks=[]
  for await(const c of req)chunks.push(c)
  const bytes=Buffer.concat(chunks),json=()=>JSON.parse(bytes.toString())
  let result
  if(!id)result=req.method==='POST'?await store.create(json().name):await store.list()
  else if(parts[3]==='assets'){
   if(req.method==='POST')result=await store.importAsset(id,url.searchParams.get('name'),req.headers['content-type'],bytes)
   else {const a=await store.asset(id,parts[4]);res.setHeader('content-type',a.mime);return res.end(a.data)}
  }else result=req.method==='PUT'?await store.save(json()):await store.read(id)
  res.setHeader('content-type','application/json');res.end(JSON.stringify(result))
 }catch(e){res.statusCode=e.status||500;res.end(JSON.stringify({error:e.message}))}
})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
try{
 const at=`http://127.0.0.1:${server.address().port}`,wav=scoreWav({seconds:4,style:'pulse'}).data,file=path.join(root,'finished score.wav')
 await writeFile(file,wav)
 let source=await store.create('Source')
 const score=await store.importAsset(source.id,'Imported music.wav','audio/wav',wav),voice=await store.importAsset(source.id,'Voice.wav','audio/wav',wav),generated=await store.importAsset(source.id,'Motioneer score: pulse.wav','audio/wav',wav)
 source.assets=[score,voice,generated].map(a=>({...a,duration:4000}))
 const title={...newTrack('title','Opening',0),duration:4000,text:'Keep this'},linked={...newTrack('title','Linked',0),duration:500,after:{key:title.id,mode:'after',gap:-2500}}
 const music={...newTrack('audio','Imported music',0),assetId:score.id,duration:4000},speech={...newTrack('audio','Voiceover',0),assetId:voice.id,duration:4000,volume:.4,sourceStart:25},automatic={...newTrack('audio','Generated',0),assetId:generated.id,duration:4000}
 source.tracks=[title,linked,music,speech,automatic];source.settings={...source.settings,duration:4000,from:1000,to:3000}
 source=await store.save(source)
 const original=JSON.stringify(source),count=(await store.list()).length
 await assert.rejects(createRescoreTake({at,projectId:source.id,audioFile:file,music:'glass'}),/choose audioFile/)
 await assert.rejects(createRescoreTake({at,projectId:source.id,audioFile:file,replaceAudioTrackIds:[title.id]}),/existing audio tracks/)
 await assert.rejects(createRescoreTake({at,projectId:source.id,audioFile:'relative.wav'}),/absolute local path/)
 const short=path.join(root,'short.wav');await writeFile(short,scoreWav({seconds:1}).data)
 await assert.rejects(createRescoreTake({at,projectId:source.id,audioFile:short}),/shorter than/)
 const bad=path.join(root,'bad.wav');await writeFile(bad,'not audio')
 await assert.rejects(createRescoreTake({at,projectId:source.id,audioFile:bad}),/Cannot import score/)
 assert.equal((await store.list()).length,count,'invalid input never creates an empty take')
 const decoded=await readScoreFile(file,2),made=await createRescoreTake({at,projectId:source.id,audioFile:file,replaceAudioTrackIds:[music.id],bpm:150}),p=made.project
 assert.equal(made.visual[1].start,1500,'linked timing is resolved against the original edit');assert.equal(made.soundtrack,'imported');assert.equal(made.identity.profile,'imported')
 assert.deepEqual(p.settings,source.settings);assert.deepEqual(p.camera,source.camera)
 assert.deepEqual(p.tracks.filter(t=>t.kind!=='audio'),source.tracks.filter(t=>t.kind!=='audio'))
 assert.equal(p.tracks.filter(t=>t.kind==='audio').length,2,'only the named music and generated score are replaced')
 const preserved=p.tracks.find(t=>t.id===speech.id)
 assert.deepEqual({...preserved,assetId:speech.assetId},speech,'voiceover timing and mix are preserved')
 assert.notEqual(preserved.assetId,speech.assetId)
 assert.deepEqual((await store.asset(p.id,preserved.assetId)).data,wav,'the new take owns its media bytes')
 const t=p.tracks.at(-1),asset=p.assets.find(a=>a.id===t.assetId)
 assert.deepEqual([t.start,t.duration,t.sourceStart,t.volume,t.fadeIn,t.fadeOut],[1000,2000,0,1,0,0])
 assert.equal(asset.waveform.length,120);assert.ok(asset.waveform.some(v=>v>0));assert.equal(asset.duration,2000)
 assert.deepEqual((await store.asset(p.id,t.assetId)).data,decoded.data,'the editable score matches the trimmed master')
 assert.equal(JSON.stringify(await store.read(source.id)),original,'the source project is untouched')
 const again=await createRescoreTake({at,projectId:p.id,music:'glass',replaceAudioTrackIds:[t.id],bpm:150})
 assert.equal(again.soundtrack,'signature');assert.equal(again.identity.profile,'glass')
 assert.equal(again.project.tracks.filter(t=>t.kind==='audio').length,2,'synthesized revisions can replace an imported score too')
 assert.deepEqual(again.project.tracks.filter(t=>t.kind!=='audio'),p.tracks.filter(t=>t.kind!=='audio'))
 await store.remove(source.id)
 assert.deepEqual((await store.asset(p.id,preserved.assetId)).data,wav,'deleting the source cannot break the take')
 console.log('pass: imported and synthesized takes preserve visuals, subranges, voiceover, media independence and original projects')
}finally{await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true})}
