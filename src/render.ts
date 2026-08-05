/**
 * Rendering a page to standalone HTML. Every value comes from the taste sheet
 * so a page and its variants stay one family. The editable build injects a
 * small script that reports text edits back to the app.
 */

import { alpha, luminance, mix, shift, type Taste } from '@/taste'
import { type Page, type Section } from '@/sections'
import { backdropHtml } from '@/backdrop'
import { worldById, type World } from '@/worlds'
import { TYPEFACES } from '@/typefaces'

const esc = (s: unknown) =>
  String(s ?? '').replace(/[<>&]/g, (m) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[m]!)

/** editable text: the preview turns these into contenteditable and reports changes */
const ed = (sid: string, path: string) => `data-edit="${sid}.${path}"`

// ——— rendering ———

function tokens(t: Taste) {
  const gap = 1 - t.density
  const dark = luminance(t.bg) < 0.5
  return {
    gap,
    dark,
    surface: dark ? shift(t.bg, 10) : shift(t.bg, -6),
    line: alpha(t.ink, dark ? 0.13 : 0.11),
    s: (n: number) => `${(t.scale ** n).toFixed(2)}rem`,
    ease: t.motion === 'lively' ? 'cubic-bezier(.2,.9,.3,1.3)' : 'cubic-bezier(.25,.8,.3,1)',
  }
}

function head(t: Taste, title: string, editable: boolean, w: World, still: boolean) {
  const { gap, surface, line, s, ease } = tokens(t)
  // a bundled face rides inside the page, but only when this page actually wears it
  const faces = TYPEFACES.filter((f) => t.display.includes(f.family) || t.body.includes(f.family))
    .map((f) => `@font-face{font-family:'${f.family}';src:url(${f.dataUrl}) format('woff2-variations');font-weight:100 900;font-display:swap}`)
    .join('\n')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
${faces}
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:${t.bg};--ink:${t.ink};--dim:${t.dim};--accent:${t.accent};--accent2:${t.accent2};
--surface:${surface};--line:${line};--r:${t.radius}px;--gap:${(gap * 2 + 1).toFixed(2)}rem}
body{background:var(--bg);color:var(--ink);font-family:${t.body};font-size:16.5px;
line-height:${(1.45 + gap * 0.28).toFixed(2)};-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
h1,h2,h3{font-family:${t.display};font-weight:${t.weight};line-height:1.07;letter-spacing:-.022em}
h1{font-size:clamp(2.3rem,6vw,${s(6)})}h2{font-size:clamp(1.5rem,3.2vw,${s(4)})}h3{font-size:${s(1)}}
p{color:var(--dim);hyphens:auto;text-wrap:pretty}
.wrap{max-width:1080px;margin:0 auto;padding:0 clamp(1.2rem,4vw,2.4rem)}
h1,h2{text-wrap:balance}
.eyebrow{font-size:.8rem;letter-spacing:.08em;color:var(--dim);font-weight:500;
${t.caps ? 'text-transform:uppercase;' : ''}font-family:${t.body}}
.btn{display:inline-block;padding:.82em 1.5em;border-radius:var(--r);font-weight:600;font-size:.95rem;
font-family:${t.body};transition:transform .18s ${ease},filter .18s ease}
.btn:hover{transform:translateY(-2px);filter:brightness(1.08)}
.btn-primary{background:var(--accent);color:${luminance(t.accent) > 0.6 ? '#101216' : '#fff'}}
.link{color:var(--dim);font-size:.95rem;text-decoration:underline;text-underline-offset:4px;align-self:center}
.link:hover{color:var(--ink)}
section{padding:calc(var(--gap)*2.2) 0}
.card{background:var(--surface);border-radius:var(--r);padding:calc(var(--gap)*.95)}
.grid{display:grid;gap:calc(var(--gap)*.8)}
.ctas{display:flex;gap:.7rem;flex-wrap:wrap;margin-top:calc(var(--gap)*.9)}
${/* the entrance belongs to the finished page: the editable paper repaints per streamed
   section and per keystroke, and a page that settles on every repaint reads as flicker */ ''}
${!editable && !still && t.motion !== 'still' ? `@media (prefers-reduced-motion:no-preference){
@keyframes settle{from{opacity:0;transform:translateY(${t.motion === 'lively' ? 16 : 9}px)}to{opacity:1;transform:none}}
section{animation:settle ${t.motion === 'lively' ? '.55s' : '.75s'} ${ease} both}
${Array.from({ length: 12 }, (_, i) => `section:nth-of-type(${i + 1}){animation-delay:${i * (t.motion === 'lively' ? 60 : 85)}ms}`).join('')}
}` : ''}
${w.structure.rules ? 'section+section{border-top:1px solid var(--line)}' : ''}
${w.structure.numbered ? `body{counter-reset:sec}
section{counter-increment:sec}
section>.wrap{position:relative}
section>.wrap::before{content:counter(sec,decimal-leading-zero);position:absolute;left:-2.6rem;top:.2rem;
font-size:.72rem;letter-spacing:.14em;color:var(--dim);font-variant-numeric:tabular-nums}
@media(max-width:1100px){section>.wrap::before{display:none}}` : ''}
${w.structure.bleed ? '.wrap{max-width:none;padding-left:6vw;padding-right:6vw}' : ''}
p{max-width:${w.structure.measure}ch}
${w.css ? `\n/* world */\n${w.css}\n` : ''}
${editable ? `[data-edit]{outline:0;transition:box-shadow .15s ease;border-radius:3px}
[data-edit]:hover{box-shadow:0 0 0 1px ${alpha(t.accent, 0.45)}}
[data-edit]:focus{box-shadow:0 0 0 2px ${t.accent};background:${alpha(t.accent, 0.06)}}` : ''}
</style></head><body>`
}

/**
 * The editable build. Text is edited in place, and whole sections are dragged in place, so
 * the page itself is the control surface rather than a list beside it. Both report back to
 * the app, which owns the page: nothing here mutates state on its own, or the paper and the
 * model would drift apart.
 */
const EDIT_SCRIPT = `<style>
[data-section]{position:relative}
[data-section].wall-over{box-shadow:inset 0 3px 0 -1px currentColor}
[data-section].wall-over-end{box-shadow:inset 0 -3px 0 -1px currentColor}
[data-section].wall-lift{opacity:.35}
.wall-grip{position:absolute;left:10px;top:10px;z-index:9;display:flex;gap:3px;align-items:center;
padding:5px 8px;border-radius:7px;font:500 11px/1 ui-sans-serif,system-ui;letter-spacing:.02em;
background:rgba(128,128,128,.16);color:inherit;opacity:0;transition:opacity .12s ease;cursor:grab;
-webkit-user-select:none;user-select:none}
[data-section]:hover>.wall-grip{opacity:.75}
.wall-grip:active{cursor:grabbing}
.wall-grip i{width:9px;height:1.5px;background:currentColor;display:block;border-radius:1px}
.wall-grip span{margin-left:3px}
</style><script>
document.querySelectorAll('[data-section]').forEach(function(sec){
  var g=document.createElement('div');
  g.className='wall-grip';g.draggable=true;
  g.innerHTML='<i></i><i></i><span>drag to move</span>';
  sec.insertBefore(g,sec.firstChild);
  g.addEventListener('dragstart',function(e){
    e.dataTransfer.effectAllowed='move';
    e.dataTransfer.setData('text/plain',sec.getAttribute('data-section'));
    e.dataTransfer.setDragImage(sec,40,20);
    sec.classList.add('wall-lift');
  });
  g.addEventListener('dragend',function(){
    sec.classList.remove('wall-lift');
    document.querySelectorAll('[data-section]').forEach(function(s){
      s.classList.remove('wall-over');s.classList.remove('wall-over-end');
    });
  });
});
function mark(el,after){
  document.querySelectorAll('[data-section]').forEach(function(s){
    s.classList.remove('wall-over');s.classList.remove('wall-over-end');
  });
  el.classList.add(after?'wall-over-end':'wall-over');
}
document.addEventListener('dragover',function(e){
  var s=e.target.closest&&e.target.closest('[data-section]');
  if(!s)return;
  e.preventDefault();e.dataTransfer.dropEffect='move';
  var r=s.getBoundingClientRect();
  mark(s,e.clientY>r.top+r.height/2);
});
document.addEventListener('drop',function(e){
  var s=e.target.closest&&e.target.closest('[data-section]');
  if(!s)return;
  e.preventDefault();
  var id=e.dataTransfer.getData('text/plain');
  var r=s.getBoundingClientRect();
  document.querySelectorAll('[data-section]').forEach(function(x){
    x.classList.remove('wall-over');x.classList.remove('wall-over-end');
  });
  if(id&&id!==s.getAttribute('data-section')){
    parent.postMessage({wall:'move',id:id,onto:s.getAttribute('data-section'),
      after:e.clientY>r.top+r.height/2},'*');
  }
});
document.querySelectorAll('[data-edit]').forEach(function(el){
  el.setAttribute('contenteditable','plaintext-only');
  el.addEventListener('blur',function(){
    parent.postMessage({wall:'edit',path:el.getAttribute('data-edit'),value:el.innerText.trim()},'*');
  });
  el.addEventListener('keydown',function(e){ if(e.key==='Enter'){e.preventDefault();el.blur();} });
});
document.addEventListener('click',function(e){
  var s=e.target.closest('[data-section]');
  if(s) parent.postMessage({wall:'select',id:s.getAttribute('data-section')},'*');
},true);
</script>`

function figure(t: Taste, seed: number, ratio = '16/10', img?: string, treatment: World['structure']['figure'] = 'framed') {
  const frame = treatment === 'plain'
    ? 'border:1px solid var(--line)'
    : treatment === 'bleed'
      ? 'border:0;border-radius:0'
      : 'border:1px solid var(--line);border-radius:var(--r)'
  if (img) {
    return `<div style="overflow:hidden;${frame};aspect-ratio:${ratio}">
<img src="${img}" alt="" style="width:100%;height:100%;object-fit:cover;display:block"></div>`
  }
  // A wireframe of a product screen rather than abstract art. Orbs and stripe textures are
  // the decoration a generator reaches for; a sketched interface could only belong to a product.
  const r = (n: number) => Math.abs(Math.sin(seed * 3301 + n * 7919)) % 1
  const dark = luminance(t.bg) < 0.5
  const rows = Array.from({ length: 3 + Math.round(r(1) * 2) }, (_, i) =>
    `<div style="position:absolute;left:52%;right:8%;top:${(24 + i * 11).toFixed(0)}%;height:1px;background:${alpha(t.ink, 0.1)}"></div>
<div style="position:absolute;right:8%;top:${(20 + i * 11).toFixed(0)}%;width:${(6 + r(i + 4) * 8).toFixed(0)}%;height:7px;background:${alpha(t.ink, 0.12)}"></div>`).join('')
  return `<div style="position:relative;overflow:hidden;${frame};
aspect-ratio:${ratio};background:${mix(t.bg, dark ? '#fff' : '#000', 0.04)}">
<div style="position:absolute;left:0;top:0;right:0;height:${(9 + r(7) * 4).toFixed(0)}%;border-bottom:1px solid ${alpha(t.ink, 0.09)}"></div>
<div style="position:absolute;left:8%;top:24%;width:34%;height:10px;background:${alpha(t.ink, 0.16)}"></div>
<div style="position:absolute;left:8%;top:33%;width:${(20 + r(2) * 14).toFixed(0)}%;height:10px;background:${alpha(t.ink, 0.09)}"></div>
${rows}
<div style="position:absolute;left:8%;bottom:14%;width:${(18 + r(3) * 10).toFixed(0)}%;height:32px;background:${alpha(t.accent, 0.9)};border-radius:2px"></div></div>`
}

export function renderSection(sec: Section, t: Taste, seed: number, w: World, pad = 1): string {
  const c = sec.content as Record<string, string>
  // a generated image replaces the drawn placeholder wherever a section shows a figure
  const img = typeof c.image === 'string' && c.image.startsWith('data:') ? c.image : undefined
  // the world's rhythm paces the page: uniform air on every section is the deepest tell of
  // one treatment applied to all content, so adjacent sections never breathe the same
  const open = `<section data-section="${sec.id}" data-form="${sec.form}" id="${sec.role}"${pad === 1 ? '' : ` style="padding:calc(var(--gap)*${(2.2 * pad).toFixed(2)}) 0"`}>`
  // one primary action and one quiet link. Two buttons of equal weight is the formula every
  // generated hero wears, and it makes the page argue with itself about what happens next
  const ctas = `<div class="ctas"><a class="btn btn-primary" ${ed(sec.id, 'cta')}>${esc(c.cta)}</a>
<a class="link" ${ed(sec.id, 'cta2')}>${esc(c.cta2)}</a></div>`
  const items = (sec.content.items as { title: string; body: string }[]) ?? []
  const qa = (sec.content.items as { q: string; a: string }[]) ?? []
  const plans = (sec.content.plans as { name: string; price: string; line: string; features: string[] }[]) ?? []

  switch (sec.role) {
    case 'claim': {
      switch (sec.form) {
        // set off axis on purpose: the centered stack with a badge on top is the opening move
        // of every generated page, so the plain claim leads from the left and leaves air
        case 'prose': return `${open}<div class="wrap"><div style="max-width:58%;min-width:min(34rem,100%)">
<h1 style="margin:0 0 1.1rem;max-width:16ch" ${ed(sec.id, 'headline')}>${esc(c.headline)}</h1>
<p style="font-size:1.16rem;max-width:52ch" ${ed(sec.id, 'sub')}>${esc(c.sub)}</p>${ctas}</div>
<div style="margin-top:calc(var(--gap)*1.6)">${figure(t, seed, '21/9', img, w.structure.figure)}</div></div></section>`
        case 'marginalia': return `${open}<div class="wrap" style="display:grid;grid-template-columns:1.05fr .95fr;gap:calc(var(--gap)*1.4);align-items:center">
<div><h1 style="margin:0 0 1rem" ${ed(sec.id, 'headline')}>${esc(c.headline)}</h1>
<p style="font-size:1.1rem;max-width:46ch" ${ed(sec.id, 'sub')}>${esc(c.sub)}</p>${ctas}</div>
<div>${figure(t, seed, '4/5', img, w.structure.figure)}</div></div></section>`
        case 'statement': return `${open}<div class="wrap" style="max-width:900px">
<h1 style="font-size:clamp(2.6rem,7.4vw,5.2rem);max-width:16ch" ${ed(sec.id, 'headline')}>${esc(c.headline)}</h1>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:calc(var(--gap)*1.2);margin-top:calc(var(--gap)*1.2);
border-top:1px solid var(--line);padding-top:calc(var(--gap)*.9)">
<p style="font-size:1.12rem" ${ed(sec.id, 'sub')}>${esc(c.sub)}</p>
<div><p style="color:var(--ink)" ${ed(sec.id, 'eyebrow')}>${esc(c.eyebrow)}</p>${ctas}</div></div>
${img ? `<div style="margin-top:calc(var(--gap)*1.2)">${figure(t, seed, '16/10', img, w.structure.figure)}</div>` : ''}</div></section>`
        // a transcript, not a drawing of a window: the traffic light dots promise a real
        // window and deliver a prop
        default: return `${open}<div class="wrap" style="max-width:900px"><div class="card" style="font-family:ui-monospace,Menlo,monospace">
<p style="color:var(--dim);font-size:.92rem"><span style="color:var(--accent)">$</span> <span ${ed(sec.id, 'eyebrow')}>${esc(c.eyebrow)}</span></p>
<h1 style="font-size:clamp(1.9rem,4.4vw,2.9rem);margin:1rem 0" ${ed(sec.id, 'headline')}>${esc(c.headline)}</h1>
<p style="max-width:58ch" ${ed(sec.id, 'sub')}>${esc(c.sub)}</p>${ctas}</div>
<div style="margin-top:calc(var(--gap)*1.2)">${figure(t, seed, '16/10', img, w.structure.figure)}</div></div></section>`
      }
    }

    case 'proof': {
      if (sec.form === 'list') {
        const names = (sec.content.names as string[]) ?? []
        return `${open}<div class="wrap" style="text-align:center;padding:calc(var(--gap)*.4) 0">
<p class="eyebrow" style="margin-bottom:1.1rem" ${ed(sec.id, 'label')}>${esc(c.label)}</p>
<div style="display:flex;gap:calc(var(--gap)*1.3);justify-content:center;flex-wrap:wrap;align-items:center">${names
          .map((n, i) => `<span ${ed(sec.id, `names.${i}`)} style="font-family:${t.display};font-weight:${t.weight};opacity:.65;font-size:1.05rem">${esc(n)}</span>`)
          .join('')}</div></div></section>`
      }
      if (sec.form === 'statement') {
        return `${open}<div class="wrap" style="max-width:880px">
<h2 style="font-size:clamp(1.7rem,3.8vw,2.7rem);line-height:1.22;color:var(--ink)" ${ed(sec.id, 'quote')}>${esc(c.quote)}</h2>
<p style="margin-top:1.2rem"><b ${ed(sec.id, 'name')}>${esc(c.name)}</b>, <span ${ed(sec.id, 'role')}>${esc(c.role)}</span></p></div></section>`
      }
      return `${open}<div class="wrap" style="max-width:860px;text-align:center">
<p style="font-size:clamp(1.5rem,3.4vw,2.2rem);color:var(--ink);font-family:${t.display};line-height:1.35" ${ed(sec.id, 'quote')}>\u201C${esc(c.quote)}\u201D</p>
<p style="margin-top:1.2rem"><span ${ed(sec.id, 'name')}>${esc(c.name)}</span>, <span ${ed(sec.id, 'role')}>${esc(c.role)}</span></p>
</div></section>`
    }

    case 'substance': {
      if (sec.form === 'figure') {
        return `${open}<div class="wrap" style="display:grid;grid-template-columns:.8fr 1.2fr;gap:calc(var(--gap)*1.2);align-items:center">
<div><h2 ${ed(sec.id, 'title')}>${esc(c.title)}</h2>
<p style="margin-top:.6rem;max-width:48ch" ${ed(sec.id, 'caption')}>${esc(c.caption)}</p></div>
<div>${figure(t, seed + 3, '4/3', img, w.structure.figure)}</div></div></section>`
      }
      if (sec.form === 'prose') {
        return `${open}<div class="wrap" style="max-width:${Math.min(w.structure.measure + 10, 84)}ch">
<h2 ${ed(sec.id, 'title')}>${esc(c.title)}</h2>
${items.map((f, i) => `<p style="margin-top:${i ? '1.1rem' : '1.5rem'};font-size:1.06rem">
<b style="color:var(--ink)" ${ed(sec.id, `items.${i}.title`)}>${esc(f.title)}.</b> <span ${ed(sec.id, `items.${i}.body`)}>${esc(f.body)}</span></p>`).join('')}
</div></section>`
      }
      if (sec.form === 'table') {
        return `${open}<div class="wrap"><h2 ${ed(sec.id, 'title')}>${esc(c.title)}</h2>
<div style="margin-top:calc(var(--gap)*.8)">${items.map((f, i) => `<div style="display:grid;grid-template-columns:minmax(9rem,15rem) 1fr;gap:1.3rem;padding:.75rem 0;border-top:1px solid var(--line);${i === items.length - 1 ? 'border-bottom:1px solid var(--line)' : ''}">
<h3 style="font-size:1rem" ${ed(sec.id, `items.${i}.title`)}>${esc(f.title)}</h3>
<p ${ed(sec.id, `items.${i}.body`)}>${esc(f.body)}</p></div>`).join('')}</div></div></section>`
      }
      return `${open}<div class="wrap">
<h2 ${ed(sec.id, 'title')}>${esc(c.title)}</h2>
<div style="margin-top:calc(var(--gap)*.9)">${items
        .map((f, i) => `<div style="display:grid;grid-template-columns:3.4rem 1fr;gap:1.3rem;padding:calc(var(--gap)*.7) 0;${i ? 'border-top:1px solid var(--line)' : ''}">
<span style="color:var(--accent);font-family:${t.display}">${String(i + 1).padStart(2, '0')}</span>
<div><h3 ${ed(sec.id, `items.${i}.title`)}>${esc(f.title)}</h3>
<p style="margin-top:.35rem;max-width:60ch" ${ed(sec.id, `items.${i}.body`)}>${esc(f.body)}</p></div></div>`)
        .join('')}</div></div></section>`
    }

    case 'offer': {
      if (sec.form === 'statement') {
        const p1 = plans[1] ?? plans[0] ?? { name: 'Pro', price: '', line: '', features: [] }
        const idx = plans[1] ? 1 : 0
        return `${open}<div class="wrap" style="max-width:760px">
<p class="eyebrow" ${ed(sec.id, 'title')}>${esc(c.title)}</p>
<p style="font-family:${t.display};font-weight:${t.weight};color:var(--ink);font-size:clamp(2.6rem,6.6vw,4.4rem);margin:.9rem 0 .4rem;font-variant-numeric:tabular-nums" ${ed(sec.id, `plans.${idx}.price`)}>${esc(p1.price)}</p>
<p style="font-size:1.1rem"><b style="color:var(--ink)" ${ed(sec.id, `plans.${idx}.name`)}>${esc(p1.name)}</b>, <span ${ed(sec.id, `plans.${idx}.line`)}>${esc(p1.line)}</span>. ${(p1.features ?? [])
          .map((f, j) => `<span ${ed(sec.id, `plans.${idx}.features.${j}`)}>${esc(f)}</span>`)
          .join(' \u00B7 ')}</p>
<div class="ctas"><a class="btn btn-primary">Choose ${esc(p1.name)}</a></div></div></section>`
      }
      if (sec.form === 'prose') {
        return `${open}<div class="wrap" style="max-width:${Math.min(w.structure.measure + 6, 80)}ch">
<h2 ${ed(sec.id, 'title')}>${esc(c.title)}</h2>
${plans.map((p, i) => `<p style="margin-top:${i ? '1rem' : '1.4rem'};font-size:1.05rem">
<b style="color:var(--ink)" ${ed(sec.id, `plans.${i}.name`)}>${esc(p.name)}</b> is <span style="font-variant-numeric:tabular-nums" ${ed(sec.id, `plans.${i}.price`)}>${esc(p.price)}</span> <span ${ed(sec.id, `plans.${i}.line`)}>${esc(p.line)}</span>: ${(p.features ?? []).map((f, j) => `<span ${ed(sec.id, `plans.${i}.features.${j}`)}>${esc(f)}</span>`).join(', ')}.</p>`).join('')}
<div class="ctas"><a class="btn btn-primary">Choose ${esc((plans[1] ?? plans[0])?.name ?? '')}</a></div></div></section>`
      }
      if (sec.form === 'transcript') {
        return `${open}<div class="wrap" style="max-width:820px"><div class="card" style="font-family:ui-monospace,Menlo,monospace">
<p class="eyebrow" style="margin-bottom:.9rem" ${ed(sec.id, 'title')}>${esc(c.title)}</p>
${plans.map((p, i) => `<p style="margin-top:.45rem;font-variant-numeric:tabular-nums"><span style="color:var(--accent)">$</span> <b style="color:var(--ink)" ${ed(sec.id, `plans.${i}.name`)}>${esc(p.name.toLowerCase())}</b> \u00B7 <span ${ed(sec.id, `plans.${i}.price`)}>${esc(p.price)}</span> <span ${ed(sec.id, `plans.${i}.line`)}>${esc(p.line)}</span></p>`).join('')}
<div class="ctas"><a class="btn btn-primary">Choose ${esc((plans[1] ?? plans[0])?.name ?? '')}</a></div></div></div></section>`
      }
      return `${open}<div class="wrap"><h2 style="text-align:center" ${ed(sec.id, 'title')}>${esc(c.title)}</h2>
<div class="grid" style="grid-template-columns:repeat(${plans.length || 1},minmax(0,1fr));margin-top:calc(var(--gap)*1)">
${plans
        .map((p, i) => `<div class="card"${i === 1 ? ` style="background:${alpha(t.accent, 0.09)}"` : ''}>
<h3 ${ed(sec.id, `plans.${i}.name`)}>${esc(p.name)}</h3>
<p style="font-size:2rem;color:var(--ink);font-family:${t.display};margin:.5rem 0 .2rem;font-variant-numeric:tabular-nums" ${ed(sec.id, `plans.${i}.price`)}>${esc(p.price)}</p>
<p ${ed(sec.id, `plans.${i}.line`)}>${esc(p.line)}</p>
<div style="margin:1rem 0 1.2rem;display:flex;flex-direction:column;gap:.4rem">
${(p.features ?? []).map((f, j) => `<span style="font-size:.94rem;color:var(--dim)" ${ed(sec.id, `plans.${i}.features.${j}`)}>${esc(f)}</span>`).join('')}</div>
${i === 1 ? `<a class="btn btn-primary">Choose ${esc(p.name)}</a>` : `<a class="link">Choose ${esc(p.name)}</a>`}</div>`)
        .join('')}</div></div></section>`
    }

    case 'objections': {
      const cols = sec.form === 'prose' ? 1 : 2
      return `${open}<div class="wrap"${cols === 1 ? ` style="max-width:${Math.min(w.structure.measure + 6, 80)}ch"` : ''}><h2 ${ed(sec.id, 'title')}>${esc(c.title)}</h2>
<div class="grid" style="grid-template-columns:repeat(${cols},minmax(0,1fr));margin-top:calc(var(--gap)*.9)">
${qa
        .map(
          (f, i) => `<div style="border-top:1px solid var(--line);padding-top:.9rem">
<h3 style="font-size:1.05rem" ${ed(sec.id, `items.${i}.q`)}>${esc(f.q)}</h3>
<p style="margin-top:.4rem" ${ed(sec.id, `items.${i}.a`)}>${esc(f.a)}</p></div>`,
        )
        .join('')}</div></div></section>`
    }

    case 'invitation':
      return sec.form === 'statement'
        ? `${open}<div class="wrap" style="text-align:center;max-width:720px">
<h2 ${ed(sec.id, 'headline')}>${esc(c.headline)}</h2>
<p style="margin-top:.7rem" ${ed(sec.id, 'sub')}>${esc(c.sub)}</p>
<div class="ctas" style="justify-content:center"><a class="btn btn-primary" ${ed(sec.id, 'cta')}>${esc(c.cta)}</a></div>
</div></section>`
        : `${open}<div class="wrap"><div style="border-top:1px solid var(--line);padding-top:calc(var(--gap)*1.1);
display:flex;justify-content:space-between;align-items:flex-end;gap:1.4rem;flex-wrap:wrap">
<div><h2 style="font-size:${tokens(t).s(3)}" ${ed(sec.id, 'headline')}>${esc(c.headline)}</h2>
<p style="margin-top:.4rem" ${ed(sec.id, 'sub')}>${esc(c.sub)}</p></div>
<a class="btn btn-primary" ${ed(sec.id, 'cta')}>${esc(c.cta)}</a></div></div></section>`

    case 'credits': {
      // a colophon when nothing else is said: apparatus is the cheapest sign of editorial
      // hands, because generators never credit their own typography
      const face = (stack: string) => stack.split(',')[0].replace(/['"]/g, '').trim()
      const note = c.note || `Set in ${face(t.display)}${face(t.body) !== face(t.display) ? ` and ${face(t.body)}` : ''}.`
      return `${open}<div class="wrap"><div style="border-top:1px solid var(--line);padding:2rem 0;display:flex;
justify-content:space-between;gap:1rem;flex-wrap:wrap;color:var(--dim);font-size:.85rem">
<span ${ed(sec.id, 'product')}>\u00A9 ${new Date().getFullYear()} ${esc(c.product)}</span>
<span ${ed(sec.id, 'note')}>${esc(note)}</span></div></div></section>`
    }
  }
}

/**
 * `still` renders the page without its entrance and with a frozen backdrop. The in-app
 * views use it for every paper that is not being read full size: an aside that replays its
 * entrance on every streamed section reads as flicker, and nine preview cells each running
 * a shader loop is a heater, not a wall.
 */
export function renderPage(page: Page, opts: { editable?: boolean; title?: string; still?: boolean } = {}): string {
  const world = worldById(page.world)
  const seed = page.sections.length * 17 + page.taste.radius
  const beat = world.structure.rhythm
  const body = page.sections
    .filter((s) => s.on)
    .map((s, i) => renderSection(s, page.taste, seed + i * 11, world, beat?.length ? beat[i % beat.length] : 1))
    .join('\n')
  // the backdrop goes first so it sits behind the content without needing a stacking hack
  const art = backdropHtml(page.taste, page.backdrop ?? 'none', !!opts.still)
  return `${head(page.taste, opts.title ?? 'Landing', !!opts.editable, world, !!opts.still)}${art}${body}${opts.editable ? EDIT_SCRIPT : ''}</body></html>`
}

