/** An original, deterministic score tied to the cut. Kept as ordinary editable audio. */
import {resolve} from '../../shared/arrange.mjs'
import {musicWav,musicPlan} from './music.mjs'
import { newTrack } from '../../dist-core/core.js'
export const SOUNDTRACKS=['none','ambient','pulse','playful','percussive','signature']
const prefix='Motioneer score: '
const scoreName=project=>project.assets.find(a=>project.tracks.some(t=>t.kind==='audio'&&t.assetId===a.id)&&a.name.startsWith(prefix))?.name.slice(prefix.length).replace(/\.wav$/,'')
export const scoreStyle=project=>scoreName(project)?.startsWith('signature-')?'signature':scoreName(project)
export const scoreMusic=project=>scoreName(project)?.startsWith('signature-')?scoreName(project).slice(10):undefined

export function scoreWav({seconds,style='pulse',seed='film',cuts=[],cues=[],bpm=160,music}) {
  if(style==='signature')return musicWav({seconds,seed,cuts,cues,bpm,music})
  const sr=24000,N=Math.ceil(seconds*sr),L=new Float32Array(N),R=new Float32Array(N),pi=Math.PI
  let state=[...seed].reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,73)
  const key=state%5,noise=()=>{state=(1664525*state+1013904223)>>>0;return state/2147483648-1},midi=n=>440*2**((n-69)/12)
  const add=(at,duration,fn,pan=0)=>{const a=Math.round(at*sr),n=Math.round(duration*sr),l=Math.sqrt((1-pan)/2),r=Math.sqrt((1+pan)/2);for(let i=0;i<n&&a+i<N;i++){if(a+i<0)continue;const v=fn(i/sr,i/n);L[a+i]+=v*l;R[a+i]+=v*r}}
  const chords=style==='playful'?[[48,55,59,64],[45,52,60,64],[41,48,57,60],[43,50,57,62]]:[[45,52,59,64],[41,48,55,60],[48,55,59,64],[43,50,57,62]]
  chords.forEach((notes,k)=>notes.forEach((note,j)=>{const f=midi(note+key),at=k*seconds/4,d=Math.min(seconds/4+1.3,seconds-at);add(at,d,t=>.03*Math.min(1,t/.8)*Math.min(1,(d-t)/1.1)*(Math.sin(2*pi*f*t)+.25*Math.sin(2*pi*f*1.002*t)+.08*Math.sin(2*pi*f*2*t)),(j-1.5)*.32)}))
  const beat=style==='percussive'?60/(Number.isFinite(bpm)&&bpm>0?bpm:160):style==='playful'?.5:.6
  if(style!=='ambient'&&style!=='percussive')for(let b=2;b*beat<seconds-1.5;b++){
    const at=b*beat;if(b%2===0)add(at,.4,t=>.12*Math.sin(2*pi*(48*t+2.1*(1-Math.exp(-t*27))))*Math.exp(-t*13))
    if(b%4===2)add(at,.1,t=>noise()*.018*Math.exp(-t*60),.25)
    if(style==='playful'&&b%2)add(at,.07,t=>noise()*.008*Math.exp(-t*90),-.35)
  }
  if(style==='percussive')for(let b=0;b*beat<seconds-.3;b++){
    const at=b*beat;add(at,.28,t=>.2*Math.sin(2*pi*(48*t+3*(1-Math.exp(-t*32))))*Math.exp(-t*17))
    if(b%2)add(at,.16,t=>noise()*.065*Math.exp(-t*27),.1)
    for(let k=0;k<2;k++)add(at+k*beat/2,.04,t=>noise()*.015*Math.exp(-t*100),k?.55:-.55)
    const f=midi([33,33,36,31][Math.floor(b/8)%4]+key);add(at,.23,t=>.06*Math.tanh(2*Math.sin(2*pi*f*t))*Math.exp(-t*10),-.1)
  }
  const notes=[76,71,64,67,72,67,64,60,76,71,67,64,74,69,67,62],step=style==='percussive'?beat/2:style==='ambient'?2.4:style==='playful'?.75:1.2
  for(let k=0,at=style==='percussive'?beat*2:1.2;at<seconds-1.5;k++,at+=step){const f=midi(notes[k%notes.length]+key);add(at,2.4,t=>.032*(Math.sin(2*pi*f*t)+.12*Math.sin(4*pi*f*t))*Math.min(1,t/.015)*Math.exp(-t*3.6),k%2?.35:-.35);add(at+.3,2,t=>.007*Math.sin(2*pi*f*t)*Math.min(1,t/.02)*Math.exp(-t*3),k%2?-.5:.5)}
  for(const c of cuts.filter(c=>c>1&&c<seconds-1)){let prev=0;add(c-.24,.46,(t,u)=>.018*(prev=.91*prev+.09*noise())*Math.sin(pi*u)**2,-.15)}
  let peak=0,square=0
  for(let i=0;i<N;i++){const env=Math.min(1,i/sr/.3)*Math.min(1,(seconds-i/sr)/1.4);L[i]*=env;R[i]*=env;peak=Math.max(peak,Math.abs(L[i]),Math.abs(R[i]));square+=L[i]**2+R[i]**2}
  const gain=Math.min(.72/(peak||1),.11/Math.sqrt(square/(N*2)||1)),data=Buffer.alloc(44+N*4)
  data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(2,22);data.writeUInt32LE(sr,24);data.writeUInt32LE(sr*4,28);data.writeUInt16LE(4,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(N*4,40)
  const waveform=Array(120).fill(0)
  for(let i=0;i<N;i++){data.writeInt16LE(Math.round(L[i]*gain*32767),44+i*4);data.writeInt16LE(Math.round(R[i]*gain*32767),46+i*4);const b=Math.min(119,Math.floor(i/N*120));waveform[b]=Math.max(waveform[b],Math.abs(L[i]*gain),Math.abs(R[i]*gain))}
  return {data,waveform}
}

export async function withSoundtrack(project,{at,style,bpm,music,cues=[],onStep=()=>{}}) {
  if(!SOUNDTRACKS.includes(style))throw new Error('Cannot score: choose none, ambient, pulse, playful, percussive, or signature. Next: pass a supported soundtrack.')
  const generated=new Set(project.assets.filter(a=>a.name.startsWith(prefix)).map(a=>a.id))
  const tracks=project.tracks.filter(t=>t.kind!=='audio'||!generated.has(t.assetId))
  if(style==='none')return {...project,tracks}
  const identity=style==='signature'?musicPlan(music||{profile:scoreMusic(project)},project.source||project.name):null
  onStep(`Scoring the cut with original ${identity?.label||style} music.`)
  const from=identity?project.settings.from:0,to=identity?project.settings.to:project.settings.duration,seconds=(to-from)/1000
  const starts=resolve({cars:tracks.map(t=>({key:t.id,at:t.start,after:t.after,motion:{ms:t.duration}}))}).at
  const cuts=[...new Set(tracks.flatMap((t,i)=>t.kind!=='audio'&&!t.hidden?[(starts[i]-from)/1000]:[]))]
  const {data,waveform}=scoreWav({seconds,style,seed:project.source||project.name,cuts,cues,bpm,music:identity})
  const name=prefix+(identity?'signature-'+identity.profile:style)+'.wav',response=await fetch(`${at}/__motioneer/projects/${project.id}/assets?name=${encodeURIComponent(name)}`,{method:'POST',headers:{'content-type':'audio/wav'},body:data}),asset=await response.json()
  if(!response.ok||asset.error)throw new Error(`Cannot score: ${asset.error||'audio import failed'}. Next: retry the soundtrack.`)
  return {...project,assets:[...project.assets,{...asset,duration:to-from,waveform}],tracks:[...tracks,{...newTrack('audio',name,from),assetId:asset.id,duration:to-from,volume:.8,fadeIn:100,fadeOut:300}]}
}
