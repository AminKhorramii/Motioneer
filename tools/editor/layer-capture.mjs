/** Capture an editable DOM/SVG subtree and explicitly named animation targets. */
export async function captureLayers(page,{selector,name,layers={},fontCSS=''}){
 const element=page.locator(selector).first()
 await element.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}))
 await page.waitForTimeout(1000)
 const token="capture-"+crypto.randomUUID()
 const result=await element.evaluate((root,{name,layers,token})=>{
  if(root.matches('script,style,iframe,object,embed,link,meta,base,canvas'))throw new Error('Cannot capture layers: select a visible DOM/SVG component.')
  const clone=root.cloneNode(true),from=[root,...root.querySelectorAll('*')],to=[clone,...clone.querySelectorAll('*')],css=[],fonts=new Set(),assets=new Set(),targets=[]
  if(from.length>1500)throw new Error('Cannot capture layers: select a smaller product component. Next: capture its individual panels.')
  const collect=style=>{for(const m of style.matchAll(/url\(["']?(https?:[^"')]+)["']?\)/g))assets.add(m[1])}
  const styleText=(style)=>[...style].filter(k=>!k.startsWith('--')&&!/^animation|^transition/.test(k)).map(k=>k+':'+style.getPropertyValue(k)).join(';')
  for(let i=0;i<from.length;i++){
   const source=from[i],copy=to[i],style=getComputedStyle(source);copy.setAttribute('style',styleText(style));copy.setAttribute('data-capture-node',String(i));fonts.add(style.fontFamily);collect(styleText(style))
   for(const pseudo of ['::before','::after']){const s=getComputedStyle(source,pseudo);if(s.content&&s.content!=='none'&&s.content!=='normal')css.push(`${i===0?`[data-capture-root="${token}"]`:`[data-capture-root="${token}"] [data-capture-node="${i}"]`}${pseudo}{${styleText(s)}}`)}
   if(copy.tagName==='IMG'){copy.setAttribute('src',source.currentSrc||source.src);copy.removeAttribute('srcset');copy.removeAttribute('loading')}
   if(copy.tagName.toLowerCase()==='image'){const href=source.href?.baseVal;if(href){copy.setAttribute('href',new URL(href,location.href).href);copy.removeAttribute('xlink:href');if(/^https?:/.test(copy.getAttribute('href')))assets.add(copy.getAttribute('href'))}}
   if(copy.tagName==='INPUT')copy.setAttribute('value',source.value)
   if(copy.tagName==='TEXTAREA')copy.textContent=source.value
   for(const a of [...copy.attributes])if(/^on/i.test(a.name)||/^(?:javascript|vbscript):/i.test(a.value.trim())||['action','formaction','autoplay'].includes(a.name))copy.removeAttribute(a.name)
   if(copy.tagName.toLowerCase()!=='image'&&copy.hasAttribute('href')&&!copy.getAttribute('href').startsWith('#'))copy.removeAttribute('href')
  }
  for(const [key,selector]of Object.entries(layers)){
   if(!/^[a-z][a-z0-9-]*$/.test(key))throw new Error('Cannot capture layers: use simple layer names. Next: use letters, numbers and hyphens.')
   const matches=[...root.querySelectorAll(selector)]
   if(!matches.length)throw new Error('Cannot capture layers: a named target was not found: '+key+'. Next: inspect the component selectors.')
   matches.forEach((source,index)=>{const copied=to[from.indexOf(source)];copied.setAttribute('data-motion-layer',key);copied.setAttribute('data-motion-index',String(index));targets.push({name:key,index,tag:source.tagName,text:(source.textContent||'').trim().slice(0,120)})})
  }
  clone.querySelectorAll('script,style,iframe,object,embed,link,meta,base').forEach(e=>e.remove())
  clone.setAttribute('data-capture-root',token)
  const box=root.getBoundingClientRect();Object.assign(clone.style,{position:'relative',left:'auto',right:'auto',top:'auto',bottom:'auto',margin:'0',transform:'none',translate:'none',rotate:'none',scale:'none',width:box.width+'px',height:box.height+'px',boxSizing:'border-box'})
  let html=clone.outerHTML,text=html+'\n'+css.join('\n')
  for(const img of [clone,...clone.querySelectorAll('img[src]')].filter(e=>e.tagName==='IMG'))if(/^https?:/.test(img.src))assets.add(img.src)
  for(const match of text.matchAll(/url\(["']?(https?:[^"')]+)["']?\)/g))assets.add(match[1])
  return {name,html,css:css.join('\n'),w:box.width,h:box.height,layers:targets,fonts:[...fonts],assets:[...assets],source:location.href}
 },{name,layers,token})
 for(const url of result.assets){const response=await page.request.get(url,{timeout:15000});if(!response.ok())throw new Error('Cannot capture layers: a source image is unavailable. Next: retry the capture.');const mime=response.headers()['content-type']?.split(';')[0];if(!mime?.startsWith('image/'))throw new Error('Cannot capture layers: an asset was not an image. Next: inspect the source component.');const data=`data:${mime};base64,${(await response.body()).toString('base64')}`;result.html=result.html.split(url.replaceAll('&','&amp;')).join(data).split(url).join(data);result.css=result.css.split(url).join(data)}
 result.css=fontCSS+'\n'+result.css
 result.warnings=[`Live DOM/SVG captured from ${result.source}. Named inner elements remain editable; motion is authored. Source scripts, canvas and shadow roots are not retained.`]
 return result
}
