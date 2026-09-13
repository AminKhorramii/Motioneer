/** Discover published product media at native resolution, including hidden carousel posters. */
import {createProject,newTrack} from '../../dist-core/core.js'
import {loadChromium} from './render.mjs'
import {discoverProductPanels,discoverProductImages} from './dom-media.mjs'
export async function websiteMedia({at,url,minimum=2,onStep=()=>{}}){
 const browser=await(await loadChromium()).launch({channel:'chromium'})
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:2})
  onStep('Looking for product visuals published on the website.')
  const navigation=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});if(!navigation?.ok())throw new Error('Cannot read website product visuals: the page did not load. Next: retry with a working website URL.')
  await page.waitForTimeout(1800)
  for(let y=0;y<10000;y+=800){await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(120)}
  await page.evaluate(()=>Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,5000))]))
  const subjects=[]
  for(const panel of await page.evaluate(discoverProductPanels)){
   try{
    const element=page.locator(panel.selector)
    await element.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await page.waitForTimeout(1600)
    const pixels=await element.screenshot({type:'png',timeout:10000})
    subjects.push({id:crypto.randomUUID(),name:panel.name,html:`<img src="data:image/png;base64,${pixels.toString('base64')}" style="display:block;width:100%;height:auto">`,css:'',w:pixels.readUInt32BE(16),h:pixels.readUInt32BE(20),warnings:[`Source rendered DOM product panel on ${page.url()}. Captured pixels; internal HTML and SVG layers are flattened.`]})
   }catch{onStep('A rendered product panel could not be captured; continuing with the available visuals.')}
  }
  const source=page.url(),posters=await page.evaluate(()=>[...new Set([...document.querySelectorAll('video[poster]')].map(v=>v.poster))].filter(p=>/^https?:/.test(p)&&!/customer|testimonial/i.test(p)).slice(0,10))
  let media=posters.map(url=>({url,kind:'video poster'}))
  if(media.length<2){
   const images=await page.evaluate(discoverProductImages)
   media=[...media,...images].filter((v,i,a)=>/^https?:/.test(v.url)&&a.findIndex(n=>n.url===v.url)===i).slice(0,12)
  }
  for(const item of media){
   if(subjects.length>=12)break
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
  if(subjects.length<minimum)return null
  const fresh=await fetch(at+'/__motioneer/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:new URL(source).hostname+' product previews'})}).then(r=>r.json())
  if(!fresh.id)throw new Error('Cannot save website previews: the studio did not create a project. Next: retry.')
  const p={...createProject(fresh.name),id:fresh.id,revision:fresh.revision,source,subjects,settings:{...fresh.settings,duration:subjects.length*2000,from:0,to:subjects.length*2000},tracks:subjects.map((s,i)=>({...newTrack('component',s.name,i*2000),subjectId:s.id,duration:2000,x:5,y:5,width:90,height:90}))}
  const response=await fetch(`${at}/__motioneer/projects/${p.id}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(p)}),saved=await response.json()
  if(!response.ok||saved.error)throw new Error(`Cannot save website previews: ${saved.error||'save failed'}. Next: retry.`)
  onStep(`Captured ${subjects.length} actual product previews from the website.`)
  return p.id
 }finally{await browser.close()}
}
