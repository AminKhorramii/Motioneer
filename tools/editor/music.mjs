/** Musical identities: different harmony, orchestration and grooves, not just new random seeds. */
import {ACTION_MUSIC,actionWav} from './action-score.mjs'
import {TECHNO,technoWav} from './techno.mjs'
export const MUSIC={
 glass:{label:'Glass circuits',description:'Precise minimal electronica: glass arpeggios, soft sub, tight micro percussion.',voice:'glass',scale:[0,2,3,7,10],chords:[[0,7,14,15],[8,15,19,22],[3,10,14,19],[10,17,22,26]],kick:[0,6,8,14],snare:[4,12],hat:[2,4,7,10,12,15],bass:[0,7,0,10],swing:0},
 liquid:{label:'Liquid rails',description:'Swung garage: warm electric keys, syncopated bass, shuffling hats and liquid echoes.',voice:'keys',scale:[0,2,3,5,7,10],chords:[[0,7,10,14],[5,12,15,19],[8,15,19,22],[10,17,20,24]],kick:[0,7,10],snare:[4,12],hat:[0,2,3,6,8,10,11,14],bass:[0,0,7,10],swing:.18},
 paper:{label:'Paper instruments',description:'Intimate chamber groove: felt-like keys, plucked wood, brushed clicks and a warm round bass.',voice:'felt',scale:[0,2,4,7,9],chords:[[0,7,11,14],[9,16,19,23],[5,12,16,19],[7,14,17,21]],kick:[0,10],snare:[6,14],hat:[3,7,11,15],bass:[0,7,4,9],swing:.09},
 monolith:{label:'Monolith',description:'Sparse cinematic electro: deep sub pulses, metallic resonances, dark drones and sharp air cuts.',voice:'metal',scale:[0,1,5,7,8],chords:[[0,7,12],[1,8,13],[5,12,17],[0,7,19]],kick:[0,3,10],snare:[8],hat:[2,7,11,14],bass:[0,0,1,7],swing:0},
 elastic:{label:'Elastic playground',description:'Bouncy electro funk: rubber bass, mallet answers, colorful chord stabs and playful syncopation.',voice:'marimba',scale:[0,2,4,7,9],chords:[[0,7,9,16],[2,9,12,16],[5,12,16,21],[7,14,17,21]],kick:[0,6,11],snare:[4,12],hat:[0,3,6,8,11,14],bass:[0,12,7,9],swing:.12},
 voltage:{label:'Red voltage',description:'Fast broken electro: clipped acid bass, gritty syncopated drums, short laser gestures and stop-start fills.',voice:'acid',scale:[0,3,5,6,7,10],chords:[[0,7,12],[3,10,15],[6,13,18],[5,12,17]],kick:[0,3,6,10,14],snare:[4,12,15],hat:[0,2,3,5,6,8,10,11,13,14],bass:[0,12,6,3],swing:0},
 current:{label:'Emerald current',description:'Dub techno: submerged chord stabs, deep rolling bass, rim clicks and wide dotted echoes.',voice:'dub',scale:[0,2,3,7,10],chords:[[0,7,10,14],[5,12,15,19],[3,10,14,17],[10,17,20,24]],kick:[0,4,8,12],snare:[6,14],hat:[2,6,10,14],bass:[0,7,10,7],swing:.04},
 branch:{label:'Branch counterpoint',description:'Melodic digital breaks: soft chip tones trade a counter-melody over crisp drums and a moving bass line.',voice:'chip',scale:[0,2,3,5,7,10],chords:[[0,7,15,19],[8,15,19,22],[3,10,14,17],[10,17,22,26]],kick:[0,7,8,14],snare:[4,12],hat:[0,2,6,8,10,14,15],bass:[0,7,3,10],swing:.02},
 prism:{label:'Prism afterglow',description:'Luminous melodic electronica: wide soft pads, rising plucks, pulsing bass and a spacious final bloom.',voice:'prism',scale:[0,2,4,7,9,11],chords:[[0,7,11,18],[7,14,18,21],[9,16,19,23],[5,12,16,23]],kick:[0,4,8,12],snare:[4,12],hat:[2,6,10,14],bass:[0,7,9,5],swing:0},
 conversation:{label:'Call and response',description:'Warm playful broken soul: rounded plucks, electric chords, claps and answering melodies with a human swing.',voice:'pluck',scale:[0,2,4,7,9],chords:[[0,7,9,16],[5,12,16,19],[2,9,12,16],[7,14,17,21]],kick:[0,5,10],snare:[4,12],hat:[2,3,6,10,11,14],bass:[0,4,7,9],swing:.16},
 ...ACTION_MUSIC,
 ...TECHNO
}
const hash=s=>[...String(s)].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,73)
export function musicPlan(raw={},seed='film'){
 const keys=Object.keys(MUSIC),profile=keys.includes(raw.profile)?raw.profile:keys[hash(seed)%keys.length]
 const h=hash(seed+profile),root=Number.isInteger(raw.root)&&raw.root>=36&&raw.root<=59?raw.root:43+h%9
 const motif=Array.isArray(raw.motif)&&raw.motif.length>=4&&raw.motif.length<=12&&raw.motif.every(n=>Number.isInteger(n)&&n>=0&&n<=14)?raw.motif:[0,2+h%2,4,1,3,6,4,2]
 return {profile,root,motif,label:MUSIC[profile].label,description:MUSIC[profile].description}
}

export function musicWav({seconds,seed='film',bpm=128,cuts=[],cues:actionCues=[],music={}}){
 if(!Number.isFinite(seconds)||seconds<=0||seconds>120)throw new Error('Cannot score: length must be between 0 and 120 seconds. Next: choose a valid film length.')
 const plan=musicPlan(music,seed)
 if(ACTION_MUSIC[plan.profile])return actionWav({seconds,seed,bpm:Number.isFinite(bpm)&&bpm>=40&&bpm<=400?bpm:140,cuts,cues:actionCues,plan})
 if(TECHNO[plan.profile])return technoWav({seconds,seed,bpm:Number.isFinite(bpm)&&bpm>=40&&bpm<=400?bpm:150,cuts,cues:actionCues,plan})
 const p=MUSIC[plan.profile],sr=48000,N=Math.ceil(seconds*sr),L=new Float32Array(N),R=new Float32Array(N),sendL=new Float32Array(N),sendR=new Float32Array(N),tau=Math.PI*2
 let rng=hash(seed+plan.profile);const noise=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/2147483648-1}
 const midi=n=>440*2**((n-69)/12),beat=60/(Number.isFinite(bpm)&&bpm>=40&&bpm<=400?bpm:128),step=beat/4
 const cues=[...new Set(cuts.filter(c=>Number.isFinite(c)&&c>0&&c<seconds))].sort((a,b)=>a-b),end=cues.at(-1)>seconds*.75?cues.at(-1):seconds-Math.min(1.8,seconds*.15)
 const events=[]
 const add=(at,d,fn,amp=1,pan=0,send=.15)=>{
  const start=Math.round(at*sr),count=Math.ceil(d*sr),l=Math.sqrt((1-pan)/2),r=Math.sqrt((1+pan)/2)
  for(let i=Math.max(0,-start);i<count&&start+i<N;i++){const t=i/sr,v=fn(t,i/count)*amp,ix=start+i;L[ix]+=v*l;R[ix]+=v*r;sendL[ix]+=v*l*send;sendR[ix]+=v*r*send}
 }
 const oscillator=(f,t,kind)=>{
  const s=Math.sin(tau*f*t)
  if(kind==='glass')return s+.33*Math.sin(tau*f*2.01*t)*Math.exp(-t*8)+.12*Math.sin(tau*f*3.98*t)*Math.exp(-t*14)
  if(kind==='metal')return s*.5+Math.sin(tau*f*1.414*t)*.22+Math.sin(tau*f*2.76*t)*.13
  if(kind==='marimba')return s+.4*Math.sin(tau*f*4*t)*Math.exp(-t*19)+.13*Math.sin(tau*f*10*t)*Math.exp(-t*40)
  if(kind==='keys'||kind==='felt')return Math.sin(tau*f*t+(.7*Math.exp(-t*5))*Math.sin(tau*f*2*t))+.12*Math.sin(tau*f*3*t)*Math.exp(-t*9)
  if(kind==='chip')return s+.22*Math.sin(tau*f*3*t)+.09*Math.sin(tau*f*5*t)
  if(kind==='acid'){let v=0;for(let k=1;k<=7;k++)v+=Math.sin(tau*f*k*t)*Math.exp(-k*(.13+t*2.2))/k;return Math.tanh(v*1.5)*.75}
  if(kind==='dub')return s+.23*Math.sin(tau*f*2*t)+.12*Math.sin(tau*f*3*t)
  if(kind==='prism')return (s+Math.sin(tau*f*1.003*t))*.5+.18*Math.sin(tau*f*2*t)
  return s+.35*Math.sin(tau*f*2*t)*Math.exp(-t*9)+.08*Math.sin(tau*f*5*t)*Math.exp(-t*25)
 }
 const note=(at,n,d,kind,amp=.07,pan=0,decay=5)=>{
  const f=midi(n);add(at,d,(t,u)=>oscillator(f,t,kind)*Math.min(1,t/(kind==='prism'?.03:.006))*Math.exp(-t*decay)*Math.min(1,(1-u)*d/.06),amp,pan,kind==='metal'?.4:.25)
 }
 const kick=(at,amp)=>add(at,.45,t=>Math.sin(tau*(43*t+2.4*(1-Math.exp(-t*38))))*Math.exp(-t*12)+noise()*.08*Math.exp(-t*140),amp,0,.025)
 const snare=(at,amp)=>{let prev=0;add(at,.22,t=>{const n=noise(),high=n-prev;prev=n;return high*.46*Math.exp(-t*24)+Math.sin(tau*185*t)*.25*Math.exp(-t*35)},amp,.06,.1);if(plan.profile==='conversation'||plan.profile==='elastic')for(let k=1;k<4;k++)add(at+k*.011,.055,t=>noise()*Math.exp(-t*55),amp*.3,-.12,.2)}
 const hat=(at,amp,pan)=>{let prev=0;add(at,.065,t=>{const n=noise(),high=n-prev;prev=n;return high*Math.exp(-t*75)*Math.min(1,t/.001)},amp,pan,.08)}
 const degree=n=>p.scale[n%p.scale.length]+12*Math.floor(n/p.scale.length)
 // Four harmonic chapters and a final tonic turn the short score into a complete phrase.
 for(let bar=0;bar*beat*4<end;bar++){
  const at=bar*beat*4,section=Math.min(3,Math.floor(at/end*4)),chord=p.chords[section],d=Math.min(beat*4+.8,seconds-at)
  for(let j=0;j<chord.length;j++){
   const f=midi(plan.root+chord[j]+12)
   if(['glass','prism','monolith'].includes(plan.profile))add(at,d,(t,u)=>oscillator(f,t,'prism')*Math.min(1,t/.35)*Math.sin(Math.PI*u)**.6,.023,(j-1.5)*.4,.48)
   else for(const offset of [0,1.5,3])note(at+offset*beat,plan.root+chord[j]+12,beat*1.5,p.voice,.025,(j-1.5)*.35,plan.profile==='current'?5:3.8)
  }
 }
 const total=Math.ceil(end/step)
 for(let s=0;s<total;s++){
  const slot=s%16,bar=Math.floor(s/16),swing=s%2?p.swing*step:0,at=s*step+swing
  if(at>=end-.07)continue
  const progress=at/end,chapter=progress<.13?'intro':progress<.5?'groove':progress<.65?'space':'lift'
  const energy=chapter==='intro'?.6:chapter==='space'?.65:chapter==='lift'?1: .85
  if(p.kick.includes(slot)&&(chapter!=='intro'||slot===0)&&(chapter!=='space'||slot%8===0))kick(at,.30*energy)
  if(p.snare.includes(slot)&&chapter!=='intro')snare(at,(plan.profile==='paper'?.065:.14)*energy)
  if(p.hat.includes(slot)&&chapter!=='space')hat(at,.023*energy*(s%3===0?.65:1),s%2?.55:-.45)
  if(chapter==='lift'&&s%8===7){hat(at+step*.5,.018,.65);if(plan.profile==='voltage')snare(at+step*.5,.075)}
  if(slot%4===0||(plan.profile==='liquid'&&slot===7)||(plan.profile==='elastic'&&slot===11)){
   const c=p.chords[Math.min(3,Math.floor(progress*4))][0],n=plan.root-12+c+(slot===12?p.bass[bar%4]:0)
   note(at,n,beat*.8,plan.profile==='voltage'?'acid':'dub',.15*energy,0,plan.profile==='current'?4:7)
  }
  const interval=['glass','voltage','branch'].includes(plan.profile)?2:plan.profile==='monolith'?8:4
  if(s%interval===0&&(chapter!=='space'||s%8===0)){
   const i=Math.floor(s/interval),rotation=bar>=2?2:0,n=plan.root+24+degree(plan.motif[(i+rotation)%plan.motif.length])
   note(at,n,Math.min(1.6,beat*3),p.voice,(plan.profile==='monolith'?.04:.065)*energy,i%2?.32:-.32,plan.profile==='prism'?3:plan.profile==='paper'?4:6)
   if(['branch','conversation'].includes(plan.profile)&&i%4===2)note(at+beat*.75,plan.root+24+degree(plan.motif[(i+3)%plan.motif.length]),beat*1.5,plan.profile==='branch'?'glass':'keys',.045,-.48,6)
  }
 }
 // Sparse cut cues support the edit, while the closing chord lands on the actual brand hold.
 for(let i=0;i<cues.length-1;i++){
  const c=cues[i];if(i%3===1){let smooth=0;add(c-.11,.16,(t,u)=>(smooth=.78*smooth+.22*noise())*Math.sin(Math.PI*u)**2,.1,i%2?.4:-.4,.25)}
  else note(c,plan.root+36+degree(plan.motif[i%plan.motif.length]),.5,p.voice,.023,i%2?.55:-.55,10)
 }
 kick(end,.28);for(const [j,n] of p.chords[0].entries())note(end+j*.018,plan.root+n+12,seconds-end,p.voice,.075,(j-1.5)*.3,2.2)
 events.push({at:0,kind:'opening'},{at:Number((end*.13).toFixed(3)),kind:'groove'},{at:Number((end*.5).toFixed(3)),kind:'space'},{at:Number((end*.65).toFixed(3)),kind:'lift'},{at:Number(end.toFixed(3)),kind:'resolve'})
 // Beat echoes and a short stereo diffusion field are printed into the editable WAV.
 const taps=[[beat*.75,.28],[beat*1.5,.16],[.071,.17],[.113,.14],[.173,.12],[.239,.09],[.337,.07]]
 for(const [time,gain] of taps){const delay=Math.round(time*sr);for(let i=delay;i<N;i++){L[i]+=sendR[i-delay]*gain;R[i]+=sendL[i-delay]*gain}}
 let peak=0,square=0
 for(let i=0;i<N;i++){const t=i/sr,env=Math.min(1,t/.008)*Math.min(1,(seconds-t)/.22);L[i]=Math.tanh(L[i]*1.2)*env;R[i]=Math.tanh(R[i]*1.2)*env;peak=Math.max(peak,Math.abs(L[i]),Math.abs(R[i]));square+=L[i]**2+R[i]**2}
 const gain=Math.min(.86/(peak||1),.16/Math.sqrt(square/(N*2)||1)),data=Buffer.alloc(44+N*4),waveform=Array(120).fill(0)
 data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(2,22);data.writeUInt32LE(sr,24);data.writeUInt32LE(sr*4,28);data.writeUInt16LE(4,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(N*4,40)
 for(let i=0;i<N;i++){data.writeInt16LE(Math.round(L[i]*gain*32767),44+i*4);data.writeInt16LE(Math.round(R[i]*gain*32767),46+i*4);const b=Math.min(119,Math.floor(i/N*120));waveform[b]=Math.max(waveform[b],Math.abs(L[i]*gain),Math.abs(R[i]*gain))}
 return {data,waveform,music:plan,events,analysis:{sampleRate:sr,peak:peak*gain,rms:Math.sqrt(square/(N*2))*gain}}
}
