/** A storyboard decoded from the delivered MP4, so an agent can judge its own result. */
import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { loadChromium, loadFfmpeg } from './render.mjs'

export async function reviewFilm(file, {shots = [], seconds = 20} = {}) {
  const ffmpeg = await loadFfmpeg(), chromium = await loadChromium()
  if (!ffmpeg || !chromium) throw new Error('The local renderer is unavailable for the storyboard.')
  const points = [{at:Math.min(.7,seconds/4),label:'Opening'}, ...shots.map(s=>({at:s.at + Math.min(.7,s.seconds*.55),label:`${s.shot}. ${s.elements.join(' + ')}`})),{at:Math.max(0,seconds-.7),label:'Closing'}]
  const chosen = points.length <= 12 ? points : Array.from({length:12},(_,i)=>points[Math.round(i*(points.length-1)/11)])
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
