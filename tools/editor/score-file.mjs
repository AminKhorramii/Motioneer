/** A finished soundtrack becomes ordinary project audio, without changing its tempo or gain. */
import {stat} from 'node:fs/promises'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {loadFfmpeg} from './render.mjs'

export async function readScoreFile(file,seconds){
 if(typeof file!=='string'||!path.isAbsolute(file))throw new Error('Cannot import score: audioFile must be an absolute local path. Next: supply the full path to the soundtrack.')
 if(!Number.isFinite(seconds)||seconds<=0||seconds>120)throw new Error('Cannot import score: the export duration is invalid. Next: choose a duration greater than zero and at most 120 seconds.')
 const info=await stat(file).catch(()=>null)
 if(!info?.isFile()||info.size>100*1024*1024)throw new Error('Cannot import score: the file is missing, is not a file, or exceeds 100 MB. Next: choose an existing audio file smaller than 100 MB.')
 const ffmpeg=await loadFfmpeg()
 if(!ffmpeg)throw new Error('Cannot import score: the audio decoder is unavailable. Next: set up the local renderer.')
 const frames=Math.round(seconds*48000),expected=frames*4
 const pcm=await new Promise((resolve,reject)=>{
  const child=spawn(ffmpeg,['-v','error','-protocol_whitelist','file,pipe','-i',file,'-map','0:a:0','-t',String(seconds),'-ar','48000','-ac','2','-f','s16le','pipe:1'],{stdio:['ignore','pipe','pipe']})
  const chunks=[];let size=0,error='',failure
  const timer=setTimeout(()=>{failure='audio decoding timed out';child.kill()},30000)
  child.stdout.on('data',b=>{size+=b.length;if(size>expected+192000){failure='decoded audio exceeded the export range';child.kill()}else chunks.push(b)})
  child.stderr.on('data',b=>{error=(error+b).slice(-400)})
  child.on('error',e=>{clearTimeout(timer);reject(e)})
  child.on('close',code=>{clearTimeout(timer);if(code!==0||failure)reject(new Error(`Cannot import score: ${failure||error||'the file has no readable audio'}. Next: supply a readable local audio file.`));else resolve(Buffer.concat(chunks))})
 })
 if(pcm.length<expected)throw new Error(`Cannot import score: the audio is shorter than the ${seconds}-second export. Next: supply a complete soundtrack; it will not be looped or stretched.`)
 const data=Buffer.alloc(44+expected),waveform=Array(120).fill(0)
 data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(2,22);data.writeUInt32LE(48000,24);data.writeUInt32LE(192000,28);data.writeUInt16LE(4,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(expected,40);pcm.copy(data,44,0,expected)
 for(let i=0;i<frames;i++){const b=Math.min(119,Math.floor(i/frames*120));waveform[b]=Math.max(waveform[b],Math.abs(pcm.readInt16LE(i*4))/32768,Math.abs(pcm.readInt16LE(i*4+2))/32768)}
 return {data,waveform,name:(path.basename(file,path.extname(file))+'.wav').replace(/^Motioneer score: /,'Imported score: '),duration:frames/48}
}
