/** Six club arrangements: dedicated drums, restrained motifs, low-end ducking and beat delays. */
export const TECHNO={
 hypnosis:{label:'Hypnotic pressure',description:'Deep hypnotic techno: four-on-the-floor kick, rolling sub, three-step muted pulses and slow filter movement.',voice:'pulse',scale:[0,3,5,7,10],kick:[0,4,8,12],bass:[2,5,7,10,13,15],phrase:3,drive:1.3,rumble:.10,delay:.75,swing:0},
 warehouse:{label:'Concrete warehouse',description:'Fast warehouse techno: saturated low kick, a dark rumble bed, dry industrial clacks and sparse minor stabs.',voice:'industrial',scale:[0,1,5,7,8],kick:[0,4,8,12],bass:[2,6,10,14],phrase:8,drive:2.8,rumble:.23,delay:.5,swing:0},
 submerge:{label:'Submerged dub',description:'Deep driving dub techno: low round kicks, submerged minor chords, offbeat sub and wide filtered tape echoes.',voice:'dub',scale:[0,2,3,7,10],kick:[0,4,8,12],bass:[2,6,10,14],phrase:6,drive:1.1,rumble:.08,delay:.75,swing:.04},
 acidline:{label:'Acid trajectory',description:'Fast acid techno: accented resonant sequences, sliding low notes, clipped four-on-the-floor drums and rising filter tension.',voice:'acid',scale:[0,1,3,7,10],kick:[0,4,8,12],bass:[0,2,3,6,7,8,10,11,14,15],phrase:2,drive:1.8,rumble:.08,delay:.375,swing:0},
 fracture:{label:'Broken momentum',description:'Deep broken techno: syncopated heavy kicks, shuffled ghost percussion, a dark reese bass and fragmented FM answers.',voice:'reese',scale:[0,2,3,6,7],kick:[0,3,6,10,12,15],bass:[1,4,7,9,13],phrase:5,drive:1.7,rumble:.12,delay:.625,swing:.12},
 alloy:{label:'Metallic ritual',description:'Fast percussive techno: heavy straight kicks, five-step metallic resonators, low toms and shifting stereo machine rhythm.',voice:'metal',scale:[0,1,5,7,11],kick:[0,4,8,12],bass:[2,6,9,14],phrase:5,drive:1.5,rumble:.14,delay:.5,swing:0}
}
const hash=s=>[...String(s)].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,73)
export function technoWav({seconds,seed,bpm,cuts,plan}){
 const p=TECHNO[plan.profile],sr=48000,N=Math.ceil(seconds*sr),tau=Math.PI*2,beat=60/bpm,step=beat/4
 const L=new Float32Array(N),R=new Float32Array(N),wetL=new Float32Array(N),wetR=new Float32Array(N),drums=new Float32Array(N),kicks=[]
 const cues=[...new Set(cuts.filter(t=>Number.isFinite(t)&&t>0&&t<seconds))].sort((a,b)=>a-b)
 const end=cues.at(-1)>seconds*.75?cues.at(-1):seconds-Math.min(1.6,seconds*.12)
 let state=hash(seed+plan.profile);const noise=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2147483648-1}
 const midi=n=>440*2**((n-69)/12),degree=n=>p.scale[n%p.scale.length]+12*Math.floor(n/p.scale.length)
 const add=(at,d,fn,amp,pan=0,send=.2,drum=false)=>{
  const start=Math.round(at*sr),count=Math.ceil(d*sr),l=Math.sqrt((1-pan)/2),r=Math.sqrt((1+pan)/2)
  for(let i=Math.max(0,-start);i<count&&start+i<N;i++){
   const t=i/sr,u=i/count,v=fn(t,u)*amp*Math.min(1,t/.001)*Math.min(1,(d-t)/.018),ix=start+i
   if(drum)drums[ix]+=v;else {L[ix]+=v*l;R[ix]+=v*r;wetL[ix]+=v*l*send;wetR[ix]+=v*r*send}
  }
 }
 const kick=(at,energy=1)=>{
  kicks.push(at)
  add(at,.65,t=>Math.tanh(p.drive*(Math.sin(tau*(46*t+2.3*(1-Math.exp(-t*42))))*Math.exp(-t*(p.voice==='industrial'?9:13))+noise()*.055*Math.exp(-t*180))),.42*energy,0,0,true)
  // A low-passed room response sits behind the transient, rather than doubling its click.
  let low=0
  add(at+.055,beat*1.7,(t,u)=>{const x=Math.tanh(Math.sin(tau*46*t+Math.sin(tau*71*t))*.9)+noise()*.12;low+=.024*(x-low);return low*Math.sin(Math.PI*u)*Math.exp(-t*4)},p.rumble*energy,0,.16)
 }
 const hat=(at,amp,open=false,pan=.25)=>{let prev=0,low=0;add(at,open?.19:.055,t=>{const n=noise(),hi=n-prev;prev=n;low+=.35*(hi-low);return low*Math.exp(-t*(open?22:85))},amp,pan,.09)}
 const clap=(at,amp)=>{let low=0;add(at,.16,t=>{low+=.17*(noise()-low);const bursts=Math.exp(-t*30)+.5*Math.exp(-Math.abs(t-.018)*150)+.3*Math.exp(-Math.abs(t-.033)*180);return low*bursts+Math.sin(tau*190*t)*.08*Math.exp(-t*60)},amp,-.1,.25)}
 const tone=(at,n,d,amp,kind=p.voice,pan=0,accent=false,from=n)=>{
  let phase=0,low=0,band=0
  add(at,d,(t,u)=>{
   const f=midi(n+(from-n)*Math.exp(-t*45));phase+=tau*f/sr
   let v
   if(kind==='acid'){
    let saw=0;for(let h=1;h<=9;h++)saw+=Math.sin(phase*h)/h
    const cutoff=Math.min(8500,180+(accent?5300:2600)*Math.exp(-t*15)),coeff=2*Math.sin(Math.PI*cutoff/sr)
    low+=coeff*band;const high=saw-low-.65*band;band+=coeff*high;v=Math.tanh(low*1.6)
   }else if(kind==='reese')v=(Math.sin(phase)+.45*Math.sin(phase*1.008)+.23*Math.sin(phase*3))*.6
   else if(kind==='metal')v=Math.sin(phase+2.6*Math.exp(-t*15)*Math.sin(phase*1.414))*.7
   else if(kind==='industrial')v=Math.tanh(Math.sin(phase+Math.sin(phase*2.76))*2)*.65
   else if(kind==='dub')v=Math.sin(phase)+.28*Math.sin(phase*2)+.12*Math.sin(phase*3)
   else v=Math.sin(phase+1.2*Math.exp(-t*17)*Math.sin(phase*2))
   return v*Math.min(1,t/.006)*Math.exp(-t*(kind==='dub'?5:kind==='metal'?14:9))
  },amp,pan,kind==='dub'?.65:.3)
 }
 const events=[{at:0,kind:'opening'}]
 for(let s=0;s*step<end-.05;s++){
  const slot=s%16,bar=Math.floor(s/16),at=s*step+(s%2?p.swing*step:0),progress=at/end
  const space=progress>.48&&progress<.60,lift=progress>=.60,energy=progress<.09?.82:space?.66:lift?1:.9
  // The opening has weight immediately; the central breath removes percussion, not all low end.
  if(p.kick.includes(slot)&&(!space||slot%8===0))kick(at,energy)
  if(!space&&slot%4===2)hat(at,.075*energy,true,s%8===2?.45:-.35)
  if(!space&&(slot%2===0||lift&&slot%4===3))hat(at,.035*energy,false,slot%3===0?-.6:.5)
  if((slot===4||slot===12)&&!space&&progress>.08)clap(at,(p.voice==='industrial'?.25:.15)*energy)
  if(p.voice==='reese'&&[5,11,14].includes(slot))clap(at,.07*energy)
  if(p.bass.includes(slot)){
   const index=(s+bar)%plan.motif.length,n=plan.root-12+(p.voice==='acid'?degree(plan.motif[index])%12:slot===14?7:0)
   const previous=plan.root-12+degree(plan.motif[(index+plan.motif.length-1)%plan.motif.length])%12
   tone(at,n,beat*.8,(p.voice==='acid'?.19:.21)*energy,p.voice==='metal'?'pulse':p.voice,0,slot%3===0,previous)
  }
  if(s%p.phrase===0&&(!space||s%12===0)){
   const index=Math.floor(s/p.phrase),n=plan.root+12+degree(plan.motif[index%plan.motif.length])%19
   if(p.voice==='dub')for(const [j,offset] of [0,3,7,10].entries())tone(at,n+offset,beat*2,.037*energy,'dub',(j-1.5)*.3)
   else tone(at,n,beat*1.4,(p.voice==='acid'?.027:.068)*energy,p.voice,index%2?.45:-.45,index%3===0)
  }
  if(p.voice==='metal'&&s%7===0)tone(at,plan.root,beat,.14,'metal',s%2?.3:-.3)
  if(lift&&slot===15){hat(at+step*.5,.042,false,-.5);if(p.voice==='industrial')clap(at+step*.5,.10)}
 }
 // Only a few filtered reverse swells articulate the cut, leaving the main rhythm intact.
 for(const [i,c] of cues.entries())if(i%4===2){let low=0;add(c-.16,.19,(t,u)=>{low+=.07*(noise()-low);return low*Math.sin(Math.PI*u)**2},.22,i%2?.45:-.45,.55)}
 kick(end,.9)
 for(const [i,n] of [0,7,12].entries())tone(end+i*.014,plan.root+12+n,seconds-end,.09,p.voice==='acid'?'dub':p.voice,(i-1)*.4)
 events.push({at:Number((end*.48).toFixed(3)),kind:'space'},{at:Number((end*.60).toFixed(3)),kind:'lift'},{at:Number(end.toFixed(3)),kind:'resolve'})
 // Cross-channel filtered echoes. Sidechain ducking keeps bass and room below each kick.
 for(const [multiple,gain] of [[p.delay,.40],[p.delay*2,.24],[p.delay*3,.12],[.19,.13]]){
  const delay=Math.round(beat*multiple*sr);let l=0,r=0
  for(let i=delay;i<N;i++){l+=.1*(wetR[i-delay]-l);r+=.1*(wetL[i-delay]-r);L[i]+=l*gain;R[i]+=r*gain}
 }
 let peak=0,square=0,k=0
 for(let i=0;i<N;i++){
  const t=i/sr;while(k+1<kicks.length&&kicks[k+1]<=t)k++
  const elapsed=t-kicks[k],duck=elapsed>=0?1-.72*Math.exp(-elapsed/Math.min(.12,beat*.3)):1
  const fade=Math.min(1,t/.005)*Math.min(1,(seconds-t)/.18)
  L[i]=Math.tanh((L[i]*duck+drums[i]*.707)*1.1)*fade;R[i]=Math.tanh((R[i]*duck+drums[i]*.707)*1.1)*fade
  peak=Math.max(peak,Math.abs(L[i]),Math.abs(R[i]));square+=L[i]**2+R[i]**2
 }
 const rms=Math.sqrt(square/(N*2)),gain=Math.min(.86/(peak||1),.18/(rms||1)),data=Buffer.alloc(44+N*4),waveform=Array(120).fill(0)
 data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(2,22);data.writeUInt32LE(sr,24);data.writeUInt32LE(sr*4,28);data.writeUInt16LE(4,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(N*4,40)
 for(let i=0;i<N;i++){data.writeInt16LE(Math.round(L[i]*gain*32767),44+i*4);data.writeInt16LE(Math.round(R[i]*gain*32767),46+i*4);const b=Math.min(119,Math.floor(i/N*120));waveform[b]=Math.max(waveform[b],Math.abs(L[i]*gain),Math.abs(R[i]*gain))}
 return {data,waveform,music:plan,events,analysis:{sampleRate:sr,peak:peak*gain,rms:rms*gain}}
}
