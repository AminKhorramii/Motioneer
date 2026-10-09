/** A user-supplied recorded kit, arranged against the film's semantic event clock. No downloads. */
import {readFile,stat} from 'node:fs/promises'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {loadFfmpeg} from './render.mjs'
const names=['kick','snare','hat','accent'],sr=48000
export async function readSoundKit(file){
 if(!path.isAbsolute(file))throw Error('Sound kit manifest must be an absolute local path.')
 if((await stat(file)).size>32768)throw Error('Sound kit manifest is too large.')
 const raw=JSON.parse(await readFile(file,'utf8'))
 if(typeof raw.name!=='string'||!raw.name.trim()||typeof raw.provenance!=='string'||!raw.provenance.trim())throw Error('Sound kit needs a name and provenance describing the recorded samples and their usage rights.')
 const ffmpeg=await loadFfmpeg(),samples={}
 for(const name of names){
  if(typeof raw.samples?.[name]!=='string')throw Error('Sound kit needs local kick, snare, hat and accent WAV paths.')
  const source=path.resolve(path.dirname(file),raw.samples[name]);if(!/\.wav$/i.test(source)||(await stat(source)).size>16000000)throw Error('Each sound kit sample must be a WAV file under 16 MB.')
  const bytes=await new Promise((resolve,reject)=>{const chunks=[],child=spawn(ffmpeg,['-v','error','-i',source,'-t','4','-ac','1','-ar',String(sr),'-f','f32le','pipe:1'],{stdio:['ignore','pipe','pipe']});let error='';const timer=setTimeout(()=>child.kill('SIGKILL'),15000);child.stdout.on('data',d=>chunks.push(d));child.stderr.on('data',d=>error+=d);child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('exit',code=>{clearTimeout(timer);code===0?resolve(Buffer.concat(chunks)):reject(Error('Cannot decode sound kit sample: '+error.slice(-200)))})})
  if(bytes.length<sr*.005*4)throw Error('Sound kit sample is empty or shorter than 5 ms.')
  const values=new Float32Array(bytes.length/4);let peak=0;for(let i=0;i<values.length;i++){values[i]=bytes.readFloatLE(i*4);if(!Number.isFinite(values[i]))throw Error('Sound kit contains invalid audio.');peak=Math.max(peak,Math.abs(values[i]))}if(peak<.0001)throw Error('Sound kit contains a silent sample.');for(let i=0;i<values.length;i++)values[i]/=peak;samples[name]=values
 }
 return{name:raw.name.slice(0,80),provenance:raw.provenance.slice(0,1200),samples}
}
export function sampledScore({seconds,bpm=150,seed='film',cues=[],cuts=[],kit}){
 if(!Number.isFinite(seconds)||seconds<=0||seconds>120||!Number.isFinite(bpm)||bpm<40||bpm>400)throw Error('Cannot compose sampled music: invalid duration or tempo.')
 const N=Math.ceil(seconds*sr),L=new Float32Array(N),R=new Float32Array(N),beat=60/bpm,events=[],h=[...seed].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,31),root=34+h%7
 const add=(name,at,gain,pan=0,duration=.2)=>{const sample=kit.samples[name],start=Math.round(at*sr),count=Math.min(sample.length,Math.round(duration*sr));for(let j=0;j<count&&start+j<N;j++){if(start+j<0)continue;const v=sample[j]*gain*Math.min(1,(count-j)/240);L[start+j]+=v*Math.sqrt((1-pan)/2);R[start+j]+=v*Math.sqrt((1+pan)/2)}events.push({at,kind:'sample',sample:name})}
 const end=cuts.filter(t=>t>seconds*.7&&t<seconds).at(-1)??seconds-1
 for(let b=0;b*beat<end;b++){
  const t=b*beat,section=cuts.filter(c=>c<=t).length,rest=section%5===3&&b%4===2
  if(!rest)add('kick',t,.75,0,.28)
  if(b%2)add('snare',t,.2,.05,.14)
  add('hat',t+beat/2,.12,.28,.06);if((b+h)%3!==0)add('hat',t+beat*.75,.065,-.28,.04)
  if((b+section+h)%3===0)add('accent',t+beat*.75,.14,b%2?.35:-.35,.09)
  if(!rest){const start=Math.round((t+beat*.3)*sr),f=440*2**((root+(b%4===3?7:0)-69)/12);for(let j=0;j<sr*.16&&start+j<N;j++){const u=j/sr,v=Math.sin(2*Math.PI*f*u)*Math.exp(-u*17)*Math.min(1,u/.003)*.19;L[start+j]+=v;R[start+j]+=v}}
 }
 for(const cue of cues)if(Number.isFinite(cue.at)&&cue.at>=0&&cue.at<seconds)add('accent',cue.at,cue.kind==='settle'?.19:.12,(cue.phase%3-1)*.3,.1)
 add('kick',end,.8,0,.35);add('accent',end+.07,.2,0,.13)
 let peak=0,sum=0;for(let i=0;i<N;i++){const fade=Math.min(1,(N-i)/(sr*.06));L[i]=Math.tanh(L[i])*fade;R[i]=Math.tanh(R[i])*fade;peak=Math.max(peak,Math.abs(L[i]),Math.abs(R[i]));sum+=L[i]**2+R[i]**2}
 const gain=Math.min(.88/(peak||1),.16/(Math.sqrt(sum/(N*2))||1)),data=Buffer.alloc(44+N*4),waveform=Array(120).fill(0)
 data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(2,22);data.writeUInt32LE(sr,24);data.writeUInt32LE(sr*4,28);data.writeUInt16LE(4,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(N*4,40)
 for(let i=0;i<N;i++){data.writeInt16LE(Math.round(L[i]*gain*32767),44+i*4);data.writeInt16LE(Math.round(R[i]*gain*32767),46+i*4);const bin=Math.min(119,Math.floor(i/N*120));waveform[bin]=Math.max(waveform[bin],Math.abs(L[i]*gain),Math.abs(R[i]*gain))}
 return{data,waveform,events,analysis:{sampleRate:sr,peak:peak*gain},provenance:kit.provenance,name:kit.name}
}
