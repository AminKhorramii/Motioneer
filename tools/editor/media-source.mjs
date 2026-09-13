/** Discover published product media at native resolution, including hidden carousel posters. */
import {createProject,newTrack} from '../../dist-core/core.js'
import {loadChromium} from './render.mjs'
export async function websiteMedia({at,url,onStep=()=>{}}){
 const browser=await(await loadChromium()).launch({channel:'chromium'})
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}})
  onStep('Looking for product visuals published on the website.')
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});await page.waitForTimeout(1800)
  const source=page.url(),posters=await page.evaluate(()=>[...new Set([...document.querySelectorAll('video[poster]')].map(v=>v.poster))].filter(p=>/^https?:/.test(p)&&!/customer|testimonial/i.test(p)).slice(0,10))
  let media=posters.map(url=>({url,kind:'video poster'}))
  if(media.length<2){
   for(let y=0;y<10000;y+=1000){await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(120)}
   const images=await page.evaluate(()=>[...document.images].filter(i=>i.naturalWidth>=500&&i.naturalHeight>=300&&i.getBoundingClientRect().width>=200&&!/headshot|testimonial|customer|portrait|logo/i.test(i.alt+' '+i.currentSrc)).map(i=>({url:i.currentSrc,name:i.alt.trim().slice(0,150),kind:'image'})))
   media=[...media,...images].filter((v,i,a)=>/^https?:/.test(v.url)&&a.findIndex(n=>n.url===v.url)===i).slice(0,12)
  }
  const subjects=[]
  for(const item of media){
   const poster=item.url
   try{
    const r=await page.request.get(poster,{timeout:15000});if(!r.ok())continue
    const mime=r.headers()['content-type']?.split(';')[0];if(!mime?.startsWith('image/'))continue
    const raw='data:'+mime+';base64,'+(await r.body()).toString('base64')
    const image=await page.evaluate(async raw=>{const i=new Image();i.src=raw;await i.decode();const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;c.getContext('2d').drawImage(i,0,0);return {w:c.width,h:c.height,data:c.toDataURL('image/png')}},raw)
    if(image.w<400||image.h<200)continue
    const name=item.name||decodeURIComponent(new URL(poster).pathname.split('/').at(-1)).replace(/(@2x)?\.[^.]+$/,'').replace(/^(hp|img|video)-/,'').replaceAll('-',' ')+' product preview'
    subjects.push({id:crypto.randomUUID(),name,html:`<img src="${image.data}" style="display:block;width:100%;height:auto">`,css:'',w:image.w,h:image.h,warnings:[`Source ${item.kind} published on ${source}: ${poster}. Captured pixels; internal layers are flattened.`]})
   }catch(e){onStep('A website preview could not be read; continuing with the available visuals.')}
  }
  if(subjects.length<2)return null
  const fresh=await fetch(at+'/__motioneer/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:new URL(source).hostname+' product previews'})}).then(r=>r.json())
  if(!fresh.id)throw new Error('Cannot save website previews: the studio did not create a project. Next: retry.')
  const p={...createProject(fresh.name),id:fresh.id,revision:fresh.revision,source,subjects,settings:{...fresh.settings,duration:subjects.length*2000,from:0,to:subjects.length*2000},tracks:subjects.map((s,i)=>({...newTrack('component',s.name,i*2000),subjectId:s.id,duration:2000,x:5,y:5,width:90,height:90}))}
  const response=await fetch(`${at}/__motioneer/projects/${p.id}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(p)}),saved=await response.json()
  if(!response.ok||saved.error)throw new Error(`Cannot save website previews: ${saved.error||'save failed'}. Next: retry.`)
  onStep(`Captured ${subjects.length} actual product previews from the website.`)
  return p.id
 }finally{await browser.close()}
}
