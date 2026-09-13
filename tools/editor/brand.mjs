/** Brand evidence comes from the rendered source, never a guessed company-to-font table. */
import {loadChromium} from './render.mjs'
export const publicBrand=kit=>kit?Object.fromEntries(Object.entries(kit).filter(([key])=>key!=='css')):null
export async function websiteBrand({url,onStep=()=>{}}){
 const browser=await(await loadChromium()).launch({channel:'chromium'})
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),loaded=new Set(),styles=[]
  await page.addInitScript(()=>{window.__brandFaces=[];window.FontFace=new Proxy(window.FontFace,{construct(target,args){if(typeof args[1]==='string')window.__brandFaces.push({family:args[0],src:args[1],...args[2]});return Reflect.construct(target,args)}})})
  page.on('response',r=>{if(r.request().resourceType()==='font'&&r.ok())loaded.add(r.url());if(r.request().resourceType()==='stylesheet'&&r.ok())styles.push(r.text().then(text=>({text,url:r.url()})).catch(()=>null))})
  onStep('Reading the source website typography and brand colors.')
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});await page.waitForTimeout(1800)
  const source=page.url(),sample=await page.evaluate(()=>{
   const heading=document.querySelector('h1')||document.querySelector('h2')||document.body,s=getComputedStyle(heading),body=getComputedStyle(document.body),root=getComputedStyle(document.documentElement)
   const family=s.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g,''),rules=[]
   const walk=sheet=>{try{for(const r of sheet.cssRules){if(r.type===CSSRule.FONT_FACE_RULE)rules.push({text:r.cssText,url:sheet.href||location.href});else if(r.styleSheet)walk(r.styleSheet)}}catch{}}
   for(const sheet of document.styleSheets)walk(sheet)
   return {dynamic:window.__brandFaces||[],family,weight:s.fontWeight,style:s.fontStyle,text:s.color,background:body.backgroundColor==='rgba(0, 0, 0, 0)'?root.backgroundColor:body.backgroundColor,rules,sheets:[...document.styleSheets].map(s=>s.href).filter(Boolean),tokens:[...root].filter(n=>/^--.*(?:brand|accent)/i.test(n)&&!/font|size|radius|shadow/i.test(n)).map(n=>[n,root.getPropertyValue(n).trim()])}
  })
  const colors=new Map()
  for(const y of [0,800,1700,2800,4200,5800]){
   await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(150)
   const swatches=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d'),out=[]
    for(const e of [...document.querySelectorAll('body,main,section,div,header,button,a')].slice(0,3500)){
     const r=e.getBoundingClientRect();if(r.width<40||r.height<20||r.bottom<=0||r.top>=innerHeight||r.right<=0||r.left>=innerWidth)continue
     const s=getComputedStyle(e);if(s.visibility==='hidden'||+s.opacity===0)continue
     ctx.clearRect(0,0,1,1);ctx.fillStyle=s.backgroundColor;ctx.fillRect(0,0,1,1);const p=ctx.getImageData(0,0,1,1).data;if(p[3]<240)continue
     out.push({hex:'#'+[...p.slice(0,3)].map(n=>n.toString(16).padStart(2,'0')).join(''),area:Math.min(r.width,innerWidth)*Math.min(r.height,innerHeight)})
    }return out
   })
   for(const {hex,area} of swatches)colors.set(hex,(colors.get(hex)||0)+area)
  }
  const normalize=value=>{const m=/^#([\da-f]{3}|[\da-f]{6})$/i.exec(value);if(m)return '#'+(m[1].length===3?[...m[1]].map(c=>c+c).join(''):m[1]).toLowerCase();const rgb=/^rgb[a]?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);return rgb?'#'+rgb.slice(1,4).map(n=>(+n).toString(16).padStart(2,'0')).join(''):null}
  const channels=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)),light=c=>channels(c).reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0)/255,chroma=c=>Math.max(...channels(c))-Math.min(...channels(c))
  const text=normalize(sample.text),background=normalize(sample.background)
  if(text)colors.set(text,(colors.get(text)||0)+1)
  if(background)colors.set(background,(colors.get(background)||0)+1)
  const observed=[...colors].sort((a,b)=>b[1]-a[1]).map(([c])=>c),neutral=observed.filter(c=>chroma(c)<35)
  const dark=neutral.find(c=>light(c)<.12)||'#111111',paper=neutral.find(c=>light(c)>.9)||'#ffffff'
  const contrast=c=>{const l=channels(c).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);return (l+.05)/.05}
  const token=sample.tokens.filter(([name])=>/--(?:color-)?(?:brand-bg|brand|accent|primary)$/.test(name)).map(([,v])=>normalize(v)).find(c=>c&&chroma(c)>40)
  let accents=[...new Set([token,...observed.filter(c=>chroma(c)>55&&light(c)>.16&&light(c)<.86)].filter(Boolean))].slice(0,8)
  let accentSource=accents.length?'site CSS':'neutral'
  if(!accents.length){
   // Image-led sites may put all their color in published artwork rather than CSS surfaces.
   await page.evaluate(()=>scrollTo(0,1800));await page.waitForTimeout(250)
   const pixels=(await page.screenshot()).toString('base64')
   const sampled=await page.evaluate(async data=>{const im=new Image();im.src='data:image/png;base64,'+data;await im.decode();const c=document.createElement('canvas');c.width=240;c.height=150;const g=c.getContext('2d');g.drawImage(im,0,0,240,150);const p=g.getImageData(0,0,240,150).data,buckets=new Map();for(let i=0;i<p.length;i+=4){const rgb=[p[i],p[i+1],p[i+2]],max=Math.max(...rgb),min=Math.min(...rgb);if(max-min<80||max<100)continue;const key=rgb.map(n=>Math.floor(n/32)).join(',');const old=buckets.get(key)||{count:0,hex:'#'+rgb.map(n=>n.toString(16).padStart(2,'0')).join('')};old.count++;buckets.set(key,old)}return [...buckets.values()].sort((a,b)=>b.count-a.count).filter(b=>b.count>40).slice(0,8).map(b=>b.hex)},pixels)
   accents=sampled.filter(c=>contrast(c)>=4.5);accentSource=accents.length?'rendered site artwork':'neutral'
  }
  // Cross-origin CSS cannot always be read through CSSOM. Read the published stylesheets as well.
  const rules=[...sample.rules]
  for(const result of await Promise.allSettled(styles)){if(result.status!=='fulfilled'||!result.value||result.value.text.length>3000000)continue;for(const m of result.value.text.matchAll(/@font-face\s*\{([^}]+)\}/g))rules.push({text:m[1],url:result.value.url})}
  for(const face of sample.dynamic)rules.push({text:`font-family:${face.family};src:${face.src};font-weight:${face.weight||'400'};font-style:${face.style||'normal'};`,url:source})
  const prop=(css,name)=>new RegExp('(?:^|[;{])\\s*'+name+'\\s*:\\s*([^;}]+)','i').exec(css)?.[1]?.trim()
  const faces=[]
  for(const rule of rules){
   const family=prop(rule.text,'font-family')?.replace(/^["']|["']$/g,'');if(family!==sample.family)continue
   const src=prop(rule.text,'src');if(!src)continue
   for(const m of src.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)){
    const href=new URL(m[1],rule.url).href;if(!/^https?:/.test(href))continue
    faces.push({url:href,weight:prop(rule.text,'font-weight')||'400',style:prop(rule.text,'font-style')||'normal',range:prop(rule.text,'unicode-range')})
   }
  }
  const ordered=faces.sort((a,b)=>Number(loaded.has(b.url))-Number(loaded.has(a.url))),chosen=[],seen=new Set()
  for(const face of ordered){
   if(seen.has(face.url)||chosen.length>=4||face.style!==sample.style)continue
   // Prefer faces actually used by the page; otherwise include the matching declared face.
   if(chosen.length&&!loaded.has(face.url))continue
   try{const r=await page.request.get(face.url,{timeout:15000});if(!r.ok())continue;const bytes=await r.body();if(bytes.length<100||bytes.length>2000000)continue;const magic=bytes.subarray(0,4).toString();if(!['wOF2','wOFF','OTTO','\u0000\u0001\u0000\u0000'].includes(magic))continue
    const format=magic==='wOF2'?'woff2':magic==='wOFF'?'woff':'opentype';chosen.push({...face,data:bytes.toString('base64'),format});seen.add(face.url)
   }catch{}
  }
  if(!chosen.length)throw new Error(`No usable published font face was found for ${sample.family}. Supply an accessible brand source or explicitly choose brandMode expressive.`)
  const family='Motioneer Source',css=chosen.map(f=>`@font-face{font-family:'${family}';src:url(data:font/${f.format};base64,${f.data}) format('${f.format}');font-weight:${f.weight};font-style:${f.style};${f.range?'unicode-range:'+f.range+';':''}font-display:block}`).join('')+`.scene,.scene *,.product-scene,.product-scene *{font-family:'${family}',sans-serif;font-style:${sample.style}}.scene .punch,.scene .resolve-title,.scene .type-lines>div,.scene .poster-title,.scene .specimen-type span,.scene .echo>div,.scene .graphic-title,.scene .stack b,.product-scene .product-title{font-weight:${sample.weight};font-style:${sample.style};font-family:'${family}',sans-serif}`
  const kit={source,family:sample.family,weight:sample.weight,style:sample.style,palette:[dark,accents[0]||paper,paper],accents,accentSource,theme:text&&light(text)>.6?'dark':'light',fonts:chosen.map(({data,...f})=>f),css,observedAt:new Date().toISOString()}
  onStep(`Brand source: ${kit.family}; ${kit.palette.join(', ')}. Source fonts travel with the film.`)
  return kit
 }finally{await browser.close()}
}
