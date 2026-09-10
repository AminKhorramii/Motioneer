/** Film editing arithmetic, exercised independently of pointer event wiring. */
import assert from 'node:assert/strict'
import { build } from 'vite'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createProject, validateProject } from '../dist-core/core.js'
const output=await mkdtemp(path.join(tmpdir(),'motioneer-editing-'))
await build({configFile:false,logLevel:'error',build:{ssr:'src/editor/filmEditing.ts',outDir:output}})
const {clipRows,moveClips,trimClip,nearestSnap}=await import(pathToFileURL(path.join(output,'filmEditing.js')))
await build({configFile:false,logLevel:'error',build:{ssr:'src/editor/filmMath.ts',outDir:output,emptyOutDir:false}})
const {filmMath,resolvedStarts}=await import(pathToFileURL(path.join(output,'filmMath.js')))
const clip=(id,start,duration,extra={})=>({id,start,duration,kind:'component',name:id,x:10,y:10,width:40,height:30,hidden:false,locked:false,moves:[],sourceStart:0,...extra})
let p=createProject();p.settings.duration=10000;p.tracks=[clip('a',0,1000),clip('b',1000,1000),clip('c',1000,500),clip('sound',0,3000,{kind:'audio'})]
assert.deepEqual(clipRows(p,'clips'),[['a','b'],['c'],['sound']]);assert.deepEqual(clipRows(p,'layers'),[['a'],['b'],['c'],['sound']]);assert.equal(p.tracks[1].start,1000)
p.tracks=[clip('a',1000,1000),clip('b',0,1000,{after:{key:'a',mode:'after',gap:200},moves:[{at:2200,duration:500,x:0,y:0,scale:1.1,ease:'linear'}]}),clip('c',0,500,{after:{key:'b',mode:'with',gap:100}})]
let moved=moveClips(p,['a','b'],500);assert.deepEqual(resolvedStarts(moved),[1500,2700,2800]);assert.equal(moved.tracks[1].after.gap,200);assert.equal(moved.tracks[1].moves[0].at,2700)
moved=moveClips(p,['b'],300);assert.deepEqual(resolvedStarts(moved),[1000,2500,2600]);assert.equal(moved.tracks[1].after.gap,500)
moved=moveClips(p,['a','b'],10000);assert.equal(resolvedStarts(moved)[1]+moved.tracks[1].duration,10000)
moved=moveClips(p,['a','b'],-10000);assert.equal(resolvedStarts(moved)[0],0)
p.tracks[1].locked=true;moved=moveClips(p,['a','b'],500);assert.equal(resolvedStarts(moved)[1],2200);assert.equal(moved.tracks[1].moves[0].at,2200);assert.equal(resolvedStarts(moved)[2],2300)
p.tracks=[clip('a',1000,1000,{after:{key:'b',mode:'after',gap:0}}),clip('b',2500,1000,{after:{key:'a',mode:'after',gap:0}}),clip('c',4000,1000,{after:{key:'b',mode:'after',gap:0}})]
assert.deepEqual(resolvedStarts(p),[1000,2500,4000]);assert.deepEqual(resolvedStarts(moveClips(p,['a','b'],250)),[1250,2750,4000])
p.tracks=[clip('missing',300,1000,{after:{key:'absent',mode:'after',gap:5}})];assert.deepEqual(resolvedStarts(p),[300])
p.assets=[{id:'audio',duration:3000}];p.tracks=[clip('sound',1000,1500,{kind:'audio',assetId:'audio',sourceStart:500})]
let trimmed=trimClip(p,'sound','left',-5000);assert.equal(trimmed.tracks[0].start,500);assert.equal(trimmed.tracks[0].sourceStart,0);assert.equal(trimmed.tracks[0].duration,2000)
trimmed=trimClip(p,'sound','right',5000);assert.equal(trimmed.tracks[0].duration,2500)
trimmed=trimClip(p,'sound','left',5000);assert.equal(trimmed.tracks[0].duration,100)
p.tracks=[clip('a',2000,1000),clip('b',0,1000,{after:{key:'a',mode:'after',gap:0}})];trimmed=trimClip(p,'b','left',-500);assert.equal(resolvedStarts(trimmed)[1],2500);assert.equal(trimmed.tracks[1].duration,1500)
assert.equal(nearestSnap(98,[100,99],7),99);assert.equal(nearestSnap(98,[110],7),undefined)
p.settings.width=1000;p.settings.height=500;p.camera=[{at:0,duration:1000,x:10,y:0,scale:2,ease:'linear'}];p.tracks=[clip('a',0,2000,{moves:[{at:0,duration:1000,x:10,y:0,scale:1.5,ease:'linear'}]})]
const g=filmMath.geometry(p,p.tracks[0],1000,0);assert.equal(g.width,1200);assert.equal(g.height,450);assert.equal(g.x,-320);assert.equal(g.y,-225);assert(g.active);assert(!filmMath.geometry(p,p.tracks[0],2000,0).active)
console.log('ok: compact lanes, linked groups, locks, cycles, movement offsets, source trims, snapping and camera geometry')

const legacy=createProject('Legacy arrangement');legacy.arrangements=[{id:'old',name:'Old take',tracks:[],camera:[]}];assert.doesNotThrow(()=>validateProject(legacy));legacy.arrangements[0].settings={...legacy.settings};assert.doesNotThrow(()=>validateProject(legacy));legacy.arrangements[0].settings.fps=120;assert.throws(()=>validateProject(legacy),/settings/);console.log('ok: legacy arrangements remain readable and saved settings are validated')
