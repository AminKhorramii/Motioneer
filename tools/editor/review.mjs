/** A storyboard decoded from the delivered MP4, so an agent can judge its own result. */
import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { loadChromium, loadFfmpeg } from './render.mjs'

export async function reviewFilm(file, {shots = [], seconds = 20, maxSamples = 20} = {}) {
  const ffmpeg = await loadFfmpeg(), chromium = await loadChromium()
  if (!ffmpeg || !chromium) throw new Error('The local renderer is unavailable for the storyboard.')
  // Read each shot late enough to judge its content. A fixed 700 ms sample caught deliberate
  // entrances halfway through and made sound captures look permanently cropped to the agent.
  const shotPoints=shots.map(s=>({at:s.at + Math.max(0,Math.min(s.seconds-.1,s.seconds*.75)),label:`${s.shot}. ${s.elements.join(' + ')}`}))
  // Reels already include their opening and closing. Show every authored scene so a product
  // reveal cannot disappear from the agent's review because a uniform sampler skipped it.
  const complete=shots.length&&shots[0].at===0&&Math.abs(shots.at(-1).at+shots.at(-1).seconds-seconds)<.1
  const points=complete?shotPoints:[{at:Math.min(.9,seconds/4),label:'Opening'},...shotPoints,{at:Math.max(0,seconds-.5),label:'Closing'}]
  const chosen=points.length<=maxSamples?points:Array.from({length:maxSamples},(_,i)=>points[Math.round(i*(points.length-1)/(maxSamples-1))])
  const tiles = []
  for (const point of chosen) {
    const data = await new Promise((resolve,reject)=>{
      const chunks=[],child=spawn(ffmpeg,['-v','error','-ss',String(point.at),'-i',file,'-frames:v','1','-vf','scale=480:270','-f','image2pipe','-vcodec','mjpeg','pipe:1'],{stdio:['ignore','pipe','pipe']})
      let error='';const timer=setTimeout(()=>child.kill('SIGKILL'),20000)
      child.stdout.on('data',d=>chunks.push(d));child.stderr.on('data',d=>error+=d)
      child.on('error',e=>{clearTimeout(timer);reject(e)})
      child.on('exit',code=>{clearTimeout(timer);code===0&&chunks.length?resolve(Buffer.concat(chunks).toString('base64')):reject(new Error(error.slice(-180)||'Could not decode a review frame.'))})
    })
    tiles.push({...point,data})
  }
  const browser = await chromium.launch({channel:'chromium'})
  try {
    const page = await browser.newPage()
    const data = await page.evaluate(async tiles=>{
      const w=480,h=306,cols=3,canvas=document.createElement('canvas');canvas.width=w*cols;canvas.height=h*Math.ceil(tiles.length/cols)
      const g=canvas.getContext('2d');g.fillStyle='#101114';g.fillRect(0,0,canvas.width,canvas.height)
      for(let i=0;i<tiles.length;i++){const t=tiles[i],img=new Image();img.src='data:image/jpeg;base64,'+t.data;await img.decode();const x=(i%cols)*w,y=Math.floor(i/cols)*h;g.drawImage(img,x,y,w,270);g.fillStyle='#c9cbd2';g.font='14px system-ui';g.fillText(`${t.at.toFixed(1)}s  ${t.label}`.slice(0,62),x+10,y+293)}
      return canvas.toDataURL('image/jpeg',.82).split(',')[1]
    },tiles)
    const path=file.replace(/\.mp4$/i,'')+'-storyboard.jpg'
    await writeFile(path,Buffer.from(data,'base64'))
    return {path,mime:'image/jpeg',data,samples:chosen}
  } finally {await browser.close()}
}
