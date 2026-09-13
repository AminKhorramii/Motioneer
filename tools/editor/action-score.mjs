/** Dry, edit-led miniature scores. Product actions have audible causes and consequences. */
export const ACTION_MUSIC={
 keystroke:{label:'Type / build',description:'Prepared-key percussion, irregular typing clusters, hollow bass knocks and a hard final latch.',pattern:[0,3,7,10,14],voice:'wood',cycle:7,base:170,decay:28},
 relay:{label:'Relay logic',description:'A clockwork relay: alternating electrical clicks, low membrane hits and four-step switching answers.',pattern:[0,4,6,10,13],voice:'relay',cycle:5,base:310,decay:45},
 tabulator:{label:'Data press',description:'A punch-card rhythm: brushed ratchets, tuned dry blocks, row-by-row accents and a closing stamp.',pattern:[0,2,5,8,11,15],voice:'ratchet',cycle:3,base:210,decay:36},
 postmark:{label:'Inbox percussion',description:'Folded-paper swipes, envelope taps, two-part notification answers and low muted knocks.',pattern:[0,5,7,11,14],voice:'paper',cycle:6,base:420,decay:23},
 handshake:{label:'Request / response',description:'Stereo question-and-answer pings, clipped digital ticks and syncopated rubber bass with deliberate gaps.',pattern:[0,3,6,9,14],voice:'ping',cycle:7,base:520,decay:30},
 release:{label:'Launch mechanism',description:'Spring tension, descending mechanical ticks, a restrained pulse and a decisive release impact.',pattern:[0,4,7,10,12],voice:'spring',cycle:5,base:125,decay:17}
}
const hash=s=>[...String(s)].reduce((h,c)=>(Math.imul(h,31)+c.charCodeAt(0))>>>0,73)
export function actionWav({seconds,seed,bpm,cuts=[],cues=[],plan}){
 const p=ACTION_MUSIC[plan.profile],sr=48000,N=Math.ceil(seconds*sr),L=new Float32Array(N),R=new Float32Array(N),tau=Math.PI*2,beat=60/bpm,step=beat/4
 let state=hash(seed+plan.profile+plan.motif.join(','));const noise=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2147483648-1}
 const add=(at,d,fn,gain,pan=0)=>{const start=Math.round(at*sr),count=Math.ceil(d*sr);for(let i=Math.max(0,-start);i<count&&start+i<N;i++){const t=i/sr,v=fn(t)*gain*Math.min(1,t/.001)*Math.min(1,(d-t)/.015);L[start+i]+=v*Math.sqrt((1-pan)/2);R[start+i]+=v*Math.sqrt((1+pan)/2)}}
 const sound=(at,variant=0,gain=.15,pan=0)=>{
  const f=p.base*2**((plan.root-45+plan.motif[variant%plan.motif.length]%7)/12)
  let low=0,prev=0
  add(at,.32,t=>{
   const n=noise();low+=.15*(n-low);const high=n-prev;prev=n
   let v
   if(p.voice==='wood')v=Math.sin(tau*f*t)+.42*Math.sin(tau*f*2.76*t)*Math.exp(-t*22)
   else if(p.voice==='relay')v=high*.55+Math.sin(tau*f*t)*.3
   else if(p.voice==='ratchet')v=low*2*(.35+.65*Math.cos(tau*65*t)**8)+Math.sin(tau*f*t)*.28
   else if(p.voice==='paper')v=low*2+Math.sin(tau*f*t)*.18
   else if(p.voice==='ping')v=Math.sin(tau*f*t+1.8*Math.exp(-t*35)*Math.sin(tau*f*2*t))
   else v=Math.sin(tau*f*t+4*Math.exp(-t*16)*Math.sin(tau*f*1.43*t))
   return v*Math.exp(-t*p.decay)
  },gain,pan)
 }
 const bass=(at,gain=.35)=>add(at,.32,t=>Math.sin(tau*(48*t+1.8*(1-Math.exp(-t*50))))*Math.exp(-t*17),gain)
 const boundaries=[...new Set([0,...cuts.filter(t=>Number.isFinite(t)&&t>0&&t<seconds)])].sort((a,b)=>a-b),end=boundaries.at(-1)>seconds*.75?boundaries.at(-1):seconds-1.5
 // A cut changes the rhythmic phrase. Brief pre-cut silences make the action read.
 for(let i=0;i*step<end;i++){
  const at=i*step,section=Math.max(0,boundaries.findLastIndex(t=>t<=at)),next=boundaries[section+1]??end
  if(next-at<.075||section%5===3&&i%4!==0)continue
  const slot=i%16,degree=(i+section)%plan.motif.length
  if(p.pattern.includes(slot))bass(at,slot===0?.35:.19)
  if((i+section)%p.cycle===0||p.pattern.includes((slot+section)%16))sound(at,degree,.16,i%2?.45:-.45)
  if(p.voice==='wood'&&slot===7)for(let k=1;k<4;k++)sound(at+k*.032,k,.08,k%2?.3:-.3)
  if(p.voice==='ping'&&slot===6)sound(at+step*.75,degree+2,.12,.65)
 }
 const events=[]
 for(const [i,c] of boundaries.entries()){sound(c,i,.22,i%2?.25:-.25);events.push({at:c,kind:'cut'})}
 for(const c of cues.filter(c=>Number.isFinite(c.at)&&c.at>=0&&c.at<seconds&&Number.isInteger(c.phase))){
  sound(c.at,c.phase,.20,(c.phase-1.5)*.3);if(c.phase===3)bass(c.at,.22);events.push({...c,kind:'action'})
 }
 // A short three-part logo cadence ends with silence, never a stock ambient tail.
 bass(end,.42);sound(end+.09,0,.25,-.2);sound(end+.21,2,.23,.2);sound(end+.39,4,.28,0)
 let peak=0,square=0;for(let i=0;i<N;i++){const fade=Math.min(1,(seconds-i/sr)/.08);L[i]=Math.tanh(L[i])*fade;R[i]=Math.tanh(R[i])*fade;peak=Math.max(peak,Math.abs(L[i]),Math.abs(R[i]));square+=L[i]**2+R[i]**2}
 const rms=Math.sqrt(square/(N*2)),gain=Math.min(.86/(peak||1),.15/(rms||1)),data=Buffer.alloc(44+N*4),waveform=Array(120).fill(0)
 data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(2,22);data.writeUInt32LE(sr,24);data.writeUInt32LE(sr*4,28);data.writeUInt16LE(4,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(N*4,40)
 for(let i=0;i<N;i++){data.writeInt16LE(Math.round(L[i]*gain*32767),44+i*4);data.writeInt16LE(Math.round(R[i]*gain*32767),46+i*4);const b=Math.min(119,Math.floor(i/N*120));waveform[b]=Math.max(waveform[b],Math.abs(L[i]*gain),Math.abs(R[i]*gain))}
 return {data,waveform,music:plan,events,analysis:{sampleRate:sr,peak:peak*gain,rms:rms*gain}}
}
