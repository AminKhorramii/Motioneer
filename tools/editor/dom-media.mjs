/** Runs in the source page. Recognize rendered product panels without site-specific selectors. */
export function discoverProductPanels(){
 const root=document.querySelector('main')||document.body
 const candidates=[...root.querySelectorAll('div,figure,section')].filter(e=>{
  const r=e.getBoundingClientRect(),style=getComputedStyle(e)
  if(r.width<500||r.height<250||r.width>1800||r.height>1100||style.display==='none'||style.visibility==='hidden')return false
  if(e.closest('header,footer,nav,[role="dialog"]')||e.querySelector('h1,h2'))return false
  const hint=e.className+' '+e.id+' '+(e.getAttribute('data-testid')||'')
  if(!/(?:^|[_\s-])(?:illustration|stage|frame|panel|product-preview|product-demo)(?:$|[_\s-])/i.test(hint))return false
  return e.innerText.trim().length>=40&&e.querySelectorAll('*').length>=12&&e.querySelectorAll('svg,button,[role="button"],input,[role="row"],li').length>=3
 })
 // Keep the complete illustration, not every nested panel or each row within it.
 return candidates.filter(e=>!candidates.some(parent=>parent!==e&&parent.contains(e))).slice(0,6).map((e,index)=>{
  e.setAttribute('data-motioneer-product-panel',String(index))
  let heading=e.querySelector('h3,h4')
  if(!heading){
   const before=[...root.querySelectorAll('h2')].filter(h=>(h.compareDocumentPosition(e)&Node.DOCUMENT_POSITION_FOLLOWING)&&h.getBoundingClientRect().top<=e.getBoundingClientRect().top)
   heading=before.at(-1)
  }
  const label=heading?.innerText.replace(/\s+/g,' ').trim().slice(0,100)||e.innerText.replace(/\s+/g,' ').trim().slice(0,70)
  return {selector:`[data-motioneer-product-panel="${index}"]`,name:label+' — website product interface'}
 })
}

/** Runs in the source page. Decorative backgrounds are not evidence of product UI. */
export function discoverProductImages(){
 return [...document.images].filter(i=>{
  const r=i.getBoundingClientRect(),description=i.alt+' '+i.currentSrc+' '+i.className+' '+i.parentElement?.className
  return i.naturalWidth>=500&&i.naturalHeight>=300&&r.width>=200&&!i.closest('[aria-hidden="true"]')&&!/(?:headshot|testimonial|portrait|logo|glow|grain|shine|shade|shadow|gradient|background)/i.test(description)
 }).map(i=>({url:i.currentSrc,name:i.alt.trim().slice(0,150),kind:'image'}))
}
