import type { Asset, Project } from './project'
export async function importMedia(project:Project,file:File):Promise<Asset> {
  const response=await fetch(`/__motioneer/projects/${project.id}/assets?name=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'content-type':file.type||(/\.wav$/i.test(file.name)?'audio/wav':'audio/mpeg')},body:file})
  const asset=await response.json();if(!response.ok)throw new Error(asset.error)
  const url=URL.createObjectURL(file)
  try {
    if(asset.kind==='image'){const image=new Image();image.src=url;await image.decode();return {...asset,width:image.naturalWidth,height:image.naturalHeight}}
    const context=new AudioContext()
    try {const audio=await context.decodeAudioData(await file.arrayBuffer()),channel=audio.getChannelData(0),waveform=[];const step=Math.max(1,Math.floor(channel.length/160));for(let i=0;i<160;i++){let peak=0;for(let j=i*step;j<Math.min(channel.length,(i+1)*step);j+=16)peak=Math.max(peak,Math.abs(channel[j]));waveform.push(peak)}return {...asset,duration:audio.duration*1000,waveform}}
    finally{await context.close()}
  }finally{URL.revokeObjectURL(url)}
}
