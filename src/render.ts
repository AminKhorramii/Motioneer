/**
 * Rendering a page to standalone HTML. Every value comes from the taste sheet
 * so a page and its variants stay one family. The editable build injects a
 * small script that reports text edits back to the app.
 */

import { alpha, luminance, mix, shift, type Taste } from '@/taste'
import { type Page, type Section } from '@/sections'
import { backdropHtml } from '@/backdrop'
import { worldById, type World } from '@/worlds'
import { blockCss } from '@/design/blocks'
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
    /**
     * A fluid size that answers to the taste sheet's scale.
     *
     * Display type used to be set as clamp(floor, <fixed>vw, scale^n). At the wall's 1280px the
     * middle term is a constant, and it won for every scale at or above 1.30, so the headline,
     * which is the loudest thing in a thumbnail, came out at exactly 77px for the whole top two
     * thirds of the range the model was told it had. Eight worlds asking for eight different
     * type scales rendered three sizes between them.
     *
     * The preferred term carries the scale now, and the ceiling bounds the exponent rather than
     * doing the work. `at13` is the size this had at scale 1.30, so nothing renders differently
     * for a world that was already sitting in the dead band.
     */
    fluid: (at13: number, capRem: number, floorRem: number) =>
      `clamp(${floorRem}rem,${((at13 / 12.8) * (t.scale ** 3 / 1.3 ** 3)).toFixed(2)}vw,${capRem}rem)`,
    ease: t.motion === 'lively' ? 'cubic-bezier(.2,.9,.3,1.3)' : 'cubic-bezier(.25,.8,.3,1)',
  }
}

function head(t: Taste, title: string, editable: boolean, w: World, still: boolean) {
  const { gap, surface, line, s, fluid, ease } = tokens(t)
  // a bundled face rides inside the page, but only when this page actually wears it
  const faces = TYPEFACES.filter((f) => t.display.includes(f.family) || t.body.includes(f.family))
    .map((f) => `@font-face{font-family:'${f.family}';src:url(${f.dataUrl}) format('woff2-variations');font-weight:100 900;font-display:swap}`)
    .join('\n')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
${faces}
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:${t.bg};--ink:${t.ink};--dim:${t.dim};--accent:${t.accent};--accent2:${t.accent2};
--surface:${surface};--line:${line};--r:${t.radius}px;--gap:${(gap * 2 + 1).toFixed(2)}rem;
${/* Every measurement a block is allowed to have, in one place. A block reads these; it
   never writes a width of its own, which is what keeps one page to one column. */ ''}
--page:${w.structure.bleed ? 'none' : '1080px'};
--edge:${w.structure.numbered ? 'clamp(2.8rem,5vw,4rem)' : w.structure.bleed ? '6vw' : 'clamp(1.2rem,4vw,2.4rem)'};
--measure:${w.structure.measure}ch;--headline:20ch;--subhead:24ch;
--split:1.05fr .95fr;--tile:15rem;
--rowsplit:minmax(9rem,15rem) 1fr;--rule:1px;--stack:1.05rem;--beat:1;
--btn-fill:var(--accent);--btn-ink:${luminance(t.accent) > 0.6 ? '#101216' : '#fff'}}
body{background:var(--bg);color:var(--ink);font-family:${t.body};font-size:16.5px;
line-height:${(1.45 + gap * 0.28).toFixed(2)};-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
h1,h2,h3{font-family:${t.display};font-weight:${t.weight};line-height:1.07;letter-spacing:-.022em}
h1{font-size:${fluid(77, 11, 2.3)}}h2{font-size:${fluid(41, 6, 1.4)}}h3{font-size:${s(1)}}
${/* Type of two sizes cannot share one column. A measure right for 16px body is 11 characters
   of a 48px headline, which is where the headline stacked into a column of two-word lines: it
   was not the headline that was wrong, it was the column it had been given. Each register is
   measured in its own type, so a heading gets its characters per line and body copy gets its
   own, and both still begin on the same edge. */ ''}
p{color:var(--dim);hyphens:auto;text-wrap:pretty;max-width:var(--measure)}
h1{max-width:var(--headline)}h2{max-width:var(--subhead)}
h1,h2{text-wrap:balance}
${/* The frame and the blocks, from the library. Layout lives there as data so a world can
   restyle a page by naming a block, and so the design prompt can be generated from the same
   list rather than describing hooks that have drifted from the ones that exist. */ ''}
${blockCss()}
${/* what the taste sheet does to the blocks: the sizes and faces this page is set in */ ''}
.lead{font-size:1.14rem}
.display{font-size:${fluid(83, 13, 2.6)}}
.mid{font-size:${fluid(46, 7, 1.9)}}
.quote{font-size:${fluid(43, 6.5, 1.7)};line-height:1.22;color:var(--ink)}
.quoted{font-size:${fluid(38, 5.5, 1.5)};color:var(--ink);font-family:${t.display};line-height:1.35}
.price{font-family:${t.display};font-weight:${t.weight};color:var(--ink);
font-size:clamp(2.6rem,6.6vw,4.4rem);font-variant-numeric:tabular-nums}
.name{font-family:${t.display};font-weight:${t.weight};opacity:.65;font-size:1.05rem}
.num{color:var(--accent);font-family:${t.display}}
.foot{color:var(--dim);font-size:.85rem}
.prompt{color:var(--accent)}
.feature{font-size:.94rem;color:var(--dim)}
.smallhead{font-size:${s(3)}}
.plan .planprice{font-size:2rem;color:var(--ink);font-family:${t.display};font-variant-numeric:tabular-nums}
.card.pick{background:${alpha(t.accent, 0.09)}}
.ctas{display:flex;gap:.7rem;flex-wrap:wrap;margin-top:calc(var(--gap)*.5)}
.eyebrow{font-size:.8rem;letter-spacing:.08em;color:var(--dim);font-weight:500;
${t.caps ? 'text-transform:uppercase;' : ''}font-family:${t.body}}
.btn{display:inline-block;padding:.82em 1.5em;border-radius:var(--r);font-weight:600;font-size:.95rem;
font-family:${t.body};transition:transform .18s ${ease},filter .18s ease}
.btn:hover{transform:translateY(-2px);filter:brightness(1.08)}
.btn-small{padding:.58em 1.1em;font-size:.88rem}
${/* the fill and its ink move together. A world that wanted the action to be a text link set
   only the colour, the fill it did not know about stayed, and the page shipped a button of
   accent on accent with nothing readable in it. One property carries both. */ ''}
.btn-primary{background:var(--btn-fill);color:var(--btn-ink)}
.link{color:var(--dim);font-size:.95rem;text-decoration:underline;text-underline-offset:4px;align-self:center}
.link:hover{color:var(--ink)}
${/* the entrance belongs to the finished page: the editable paper repaints per streamed
   section and per keystroke, and a page that settles on every repaint reads as flicker */ ''}
${!editable && !still && t.motion !== 'still' ? `@media (prefers-reduced-motion:no-preference){
@keyframes settle{from{opacity:0;transform:translateY(${t.motion === 'lively' ? 16 : 9}px)}to{opacity:1;transform:none}}
section{animation:settle ${t.motion === 'lively' ? '.55s' : '.75s'} ${ease} both}
${Array.from({ length: 12 }, (_, i) => `section:nth-of-type(${i + 1}){animation-delay:${i * (t.motion === 'lively' ? 60 : 85)}ms}`).join('')}
}` : ''}
${w.structure.rules ? 'section+section{border-top:var(--rule) solid var(--line)}' : ''}
${/* a world that counts its own sections gets to keep its counter, because two numbering
   systems on one page is not a design, it is two designs arguing */ ''}
${w.structure.numbered && !/counter-increment|counter\(/.test(w.css ?? '') ? `body{counter-reset:sec}
${/* the masthead orients rather than argues, so the argument's numbering starts under it */ ''}
section:not([data-role="masthead"]){counter-increment:sec}
section[data-role="masthead"]>.wrap::before{content:none}
section>.wrap{position:relative}
section>.wrap::before{content:counter(sec,decimal-leading-zero);position:absolute;left:0;top:.2rem;
font-size:.72rem;letter-spacing:.14em;color:var(--dim);font-variant-numeric:tabular-nums}
@container wrap (max-width:30rem){section>.wrap::before{display:none}}` : ''}
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
  // the frame is drawn against the ink rather than the hairline token, because a figure that
  // has to hold an image needs an edge a reader can find, where a rule between sections does not
  const edge = `1px solid ${alpha(t.ink, 0.2)}`
  const frame = treatment === 'plain'
    ? `border:${edge}`
    : treatment === 'bleed'
      ? 'border:0;border-radius:0'
      : `border:${edge};border-radius:var(--r)`
  if (img) {
    return `<div style="overflow:hidden;${frame};aspect-ratio:${ratio}">
<img src="${img}" alt="" style="width:100%;height:100%;object-fit:cover;display:block"></div>`
  }
  // A wireframe of a product screen rather than abstract art. Orbs and stripe textures are
  // the decoration a generator reaches for; a sketched interface could only belong to a product.
  //
  // It used to be drawn at four to nine percent off the background, which on a dark ground made
  // the largest block on the page a rectangle of nothing, and a page whose biggest element says
  // nothing reads as broken rather than as restrained. It is drawn at strengths a reader can
  // actually see now, and it has a chrome, a rail and a content column, so it resolves into an
  // interface at a glance instead of into faint marks.
  const r = (n: number) => Math.abs(Math.sin(seed * 3301 + n * 7919)) % 1
  const dark = luminance(t.bg) < 0.5
  const ink = (a: number) => alpha(t.ink, a)
  const bar = (x: string, y: string, w: string, h: number, a: number) =>
    `<div style="position:absolute;${x};top:${y};width:${w};height:${h}px;background:${ink(a)};border-radius:1px"></div>`
  const chrome = (9 + r(7) * 4).toFixed(0)
  // the rail: what a product has and a poster does not
  const rail = Array.from({ length: 4 }, (_, i) =>
    bar('left:5%', `${(Number(chrome) + 9 + i * 9).toFixed(0)}%`, `${(9 + r(i + 9) * 7).toFixed(0)}%`, 6, i === 0 ? 0.3 : 0.15)).join('')
  const rows = Array.from({ length: 3 + Math.round(r(1) * 2) }, (_, i) =>
    `<div style="position:absolute;left:47%;right:7%;top:${(30 + i * 12).toFixed(0)}%;height:1px;background:${ink(0.16)}"></div>
${bar('right:7%', `${(26 + i * 12).toFixed(0)}%`, `${(6 + r(i + 4) * 8).toFixed(0)}%`, 7, 0.24)}`).join('')
  return `<div style="position:relative;overflow:hidden;${frame};
aspect-ratio:${ratio};background:${mix(t.bg, dark ? '#fff' : '#000', 0.07)}">
<div style="position:absolute;left:0;top:0;right:0;height:${chrome}%;
background:${ink(0.06)};border-bottom:1px solid ${ink(0.2)}"></div>
<div style="position:absolute;left:0;top:${chrome}%;bottom:0;width:26%;border-right:1px solid ${ink(0.14)}"></div>
${rail}
${bar('left:31%', '26%', '30%', 11, 0.34)}
${bar('left:31%', `${(34).toFixed(0)}%`, `${(16 + r(2) * 12).toFixed(0)}%`, 9, 0.18)}
${rows}
<div style="position:absolute;left:31%;bottom:13%;width:${(16 + r(3) * 9).toFixed(0)}%;height:30px;
background:${alpha(t.accent, 0.92)};border-radius:2px"></div></div>`
}

export function renderSection(
  sec: Section, t: Taste, seed: number, w: World,
  { beat = 1, first = true }: { beat?: number; first?: boolean } = {},
): string {
  const c = sec.content as Record<string, string>
  // a generated image replaces the drawn placeholder wherever a section shows a figure
  const img = typeof c.image === 'string' && c.image.startsWith('data:') ? c.image : undefined
  // The world's rhythm paces the page: uniform air on every section is the deepest tell of one
  // treatment applied to all content, so adjacent sections never breathe the same. It arrives
  // as a custom property rather than a padding, so a world that wants to repace the whole page
  // can still write one rule for section and have it win.
  //
  // A role names the section, but a world may argue the same role twice, and two elements with
  // one id is invalid html and paints a world's one committed move on both. The id marks the
  // first of a role, so #substance still means what it always meant, and [data-role] reaches
  // every one of them.
  // a row of names is a strip rather than a section, so it takes a fraction of whatever air
  // the world is giving, which keeps it tight without leaving the rhythm
  const strip = (sec.role === 'proof' && sec.form === 'list') || sec.role === 'masthead'
  const air = strip ? beat * 0.45 : beat
  const open = `<section data-section="${sec.id}" data-form="${sec.form}" data-role="${sec.role}"${
    first ? ` id="${sec.role}"` : ''}${air === 1 ? '' : ` style="--beat:${air.toFixed(2)}"`}>`
  // one primary action and one quiet link. Two buttons of equal weight is the formula every
  // generated hero wears, and it makes the page argue with itself about what happens next
  const ctas = `<div class="ctas"><a class="btn btn-primary" ${ed(sec.id, 'cta')}>${esc(c.cta)}</a>
<a class="link" ${ed(sec.id, 'cta2')}>${esc(c.cta2)}</a></div>`
  const items = (sec.content.items as { title: string; body: string }[]) ?? []
  const qa = (sec.content.items as { q: string; a: string }[]) ?? []
  const plans = (sec.content.plans as { name: string; price: string; line: string; features: string[] }[]) ?? []

  switch (sec.role) {
    case 'masthead': {
      const links = (sec.content.links as string[]) ?? []
      const nav = links.map((n, i) => `<a class="navlink" ${ed(sec.id, `links.${i}`)}>${esc(n)}</a>`).join('')
      // the masthead sits on the wide column, so the mark lines up with the headline under it
      return sec.form === 'statement'
        ? `${open}<div class="wrap"><div class="masthead wide center">
<a class="mark" ${ed(sec.id, 'product')}>${esc(c.product)}</a>
<nav class="nav">${nav}</nav></div></div></section>`
        : `${open}<div class="wrap"><div class="masthead wide">
<a class="mark" ${ed(sec.id, 'product')}>${esc(c.product)}</a>
<nav class="nav">${nav}</nav>
<a class="btn btn-primary btn-small" ${ed(sec.id, 'cta')}>${esc(c.cta)}</a></div></div></section>`
    }

    case 'claim': {
      switch (sec.form) {
        // set off axis on purpose: the centered stack with a badge on top is the opening move
        // of every generated page, so the plain claim leads from the left and leaves air
        case 'prose': return `${open}<div class="wrap"><div class="stack wide">
<h1 ${ed(sec.id, 'headline')}>${esc(c.headline)}</h1>
<p class="lead" ${ed(sec.id, 'sub')}>${esc(c.sub)}</p>${ctas}</div>
<div class="figure wide">${figure(t, seed, '21/9', img, w.structure.figure)}</div></div></section>`
        case 'marginalia': return `${open}<div class="wrap"><div class="split leadside wide">
<div class="stack"><h1 ${ed(sec.id, 'headline')}>${esc(c.headline)}</h1>
<p class="lead" ${ed(sec.id, 'sub')}>${esc(c.sub)}</p>${ctas}</div>
<div class="figure">${figure(t, seed, '4/5', img, w.structure.figure)}</div></div></div></section>`
        case 'statement': return `${open}<div class="wrap">
<h1 class="display wide" ${ed(sec.id, 'headline')}>${esc(c.headline)}</h1>
<div class="split halves ruled wide">
<p class="lead" ${ed(sec.id, 'sub')}>${esc(c.sub)}</p>
<div class="stack"><p class="ink" ${ed(sec.id, 'eyebrow')}>${esc(c.eyebrow)}</p>${ctas}</div></div>
${img ? `<div class="figure wide">${figure(t, seed, '16/10', img, w.structure.figure)}</div>` : ''}</div></section>`
        // a transcript, not a drawing of a window: the traffic light dots promise a real
        // window and deliver a prop
        default: return `${open}<div class="wrap"><div class="card mono wide"><div class="stack">
<p class="small"><span class="prompt">$</span> <span ${ed(sec.id, 'eyebrow')}>${esc(c.eyebrow)}</span></p>
<h1 class="mid" ${ed(sec.id, 'headline')}>${esc(c.headline)}</h1>
<p ${ed(sec.id, 'sub')}>${esc(c.sub)}</p>${ctas}</div></div>
<div class="figure wide">${figure(t, seed, '16/10', img, w.structure.figure)}</div></div></section>`
      }
    }

    case 'proof': {
      if (sec.form === 'list') {
        const names = (sec.content.names as string[]) ?? []
        return `${open}<div class="wrap"><div class="stack wide center">
<p class="eyebrow" ${ed(sec.id, 'label')}>${esc(c.label)}</p>
<div class="names">${names
          .map((n, i) => `<span class="name" ${ed(sec.id, `names.${i}`)}>${esc(n)}</span>`)
          .join('')}</div></div></div></section>`
      }
      if (sec.form === 'statement') {
        return `${open}<div class="wrap"><div class="stack">
<h2 class="quote" ${ed(sec.id, 'quote')}>${esc(c.quote)}</h2>
<p><b ${ed(sec.id, 'name')}>${esc(c.name)}</b>, <span ${ed(sec.id, 'role')}>${esc(c.role)}</span></p></div></div></section>`
      }
      return `${open}<div class="wrap"><div class="stack wide center">
<p class="quoted" ${ed(sec.id, 'quote')}>\u201C${esc(c.quote)}\u201D</p>
<p><span ${ed(sec.id, 'name')}>${esc(c.name)}</span>, <span ${ed(sec.id, 'role')}>${esc(c.role)}</span></p>
</div></div></section>`
    }

    case 'substance': {
      if (sec.form === 'figure') {
        return `${open}<div class="wrap"><div class="split figside wide">
<div class="stack"><h2 ${ed(sec.id, 'title')}>${esc(c.title)}</h2>
<p ${ed(sec.id, 'caption')}>${esc(c.caption)}</p></div>
<div class="figure">${figure(t, seed + 3, '4/3', img, w.structure.figure)}</div></div></div></section>`
      }
      if (sec.form === 'prose') {
        return `${open}<div class="wrap"><div class="stack">
<h2 ${ed(sec.id, 'title')}>${esc(c.title)}</h2>
${items.map((f, i) => `<p>
<b class="ink" ${ed(sec.id, `items.${i}.title`)}>${esc(f.title)}.</b> <span ${ed(sec.id, `items.${i}.body`)}>${esc(f.body)}</span></p>`).join('')}
</div></div></section>`
      }
      if (sec.form === 'table') {
        return `${open}<div class="wrap"><div class="stack wide"><h2 ${ed(sec.id, 'title')}>${esc(c.title)}</h2>
<div class="rows closed">${items.map((f, i) => `<div class="row">
<h3 ${ed(sec.id, `items.${i}.title`)}>${esc(f.title)}</h3>
<p ${ed(sec.id, `items.${i}.body`)}>${esc(f.body)}</p></div>`).join('')}</div></div></div></section>`
      }
      return `${open}<div class="wrap"><div class="stack wide">
<h2 ${ed(sec.id, 'title')}>${esc(c.title)}</h2>
<div class="rows open numbered">${items
        .map((f, i) => `<div class="row">
<span class="num">${String(i + 1).padStart(2, '0')}</span>
<div class="stack"><h3 ${ed(sec.id, `items.${i}.title`)}>${esc(f.title)}</h3>
<p ${ed(sec.id, `items.${i}.body`)}>${esc(f.body)}</p></div></div>`)
        .join('')}</div></div></div></section>`
    }

    case 'offer': {
      if (sec.form === 'statement') {
        const p1 = plans[1] ?? plans[0] ?? { name: 'Pro', price: '', line: '', features: [] }
        const idx = plans[1] ? 1 : 0
        return `${open}<div class="wrap"><div class="stack">
<p class="eyebrow" ${ed(sec.id, 'title')}>${esc(c.title)}</p>
<p class="price" ${ed(sec.id, `plans.${idx}.price`)}>${esc(p1.price)}</p>
<p class="lead"><b class="ink" ${ed(sec.id, `plans.${idx}.name`)}>${esc(p1.name)}</b>, <span ${ed(sec.id, `plans.${idx}.line`)}>${esc(p1.line)}</span>. ${(p1.features ?? [])
          .map((f, j) => `<span ${ed(sec.id, `plans.${idx}.features.${j}`)}>${esc(f)}</span>`)
          .join(' \u00B7 ')}</p>
<div class="ctas"><a class="btn btn-primary">Choose ${esc(p1.name)}</a></div></div></div></section>`
      }
      if (sec.form === 'prose') {
        return `${open}<div class="wrap"><div class="stack">
<h2 ${ed(sec.id, 'title')}>${esc(c.title)}</h2>
${plans.map((p, i) => `<p>
<b class="ink" ${ed(sec.id, `plans.${i}.name`)}>${esc(p.name)}</b> is <span class="tabular" ${ed(sec.id, `plans.${i}.price`)}>${esc(p.price)}</span> <span ${ed(sec.id, `plans.${i}.line`)}>${esc(p.line)}</span>: ${(p.features ?? []).map((f, j) => `<span ${ed(sec.id, `plans.${i}.features.${j}`)}>${esc(f)}</span>`).join(', ')}.</p>`).join('')}
<div class="ctas"><a class="btn btn-primary">Choose ${esc((plans[1] ?? plans[0])?.name ?? '')}</a></div></div></div></section>`
      }
      if (sec.form === 'transcript') {
        return `${open}<div class="wrap"><div class="card mono wide"><div class="stack">
<p class="eyebrow" ${ed(sec.id, 'title')}>${esc(c.title)}</p>
${plans.map((p, i) => `<p class="tabular"><span class="prompt">$</span> <b class="ink" ${ed(sec.id, `plans.${i}.name`)}>${esc(p.name.toLowerCase())}</b> \u00B7 <span ${ed(sec.id, `plans.${i}.price`)}>${esc(p.price)}</span> <span ${ed(sec.id, `plans.${i}.line`)}>${esc(p.line)}</span></p>`).join('')}
<div class="ctas"><a class="btn btn-primary">Choose ${esc((plans[1] ?? plans[0])?.name ?? '')}</a></div></div></div></div></section>`
      }
      return `${open}<div class="wrap"><h2 class="center wide" ${ed(sec.id, 'title')}>${esc(c.title)}</h2>
<div class="grid wide">
${plans
        .map((p, i) => `<div class="card plan${i === 1 ? ' pick' : ''}">
<h3 ${ed(sec.id, `plans.${i}.name`)}>${esc(p.name)}</h3>
<p class="planprice" ${ed(sec.id, `plans.${i}.price`)}>${esc(p.price)}</p>
<p ${ed(sec.id, `plans.${i}.line`)}>${esc(p.line)}</p>
<div class="features">
${(p.features ?? []).map((f, j) => `<span class="feature" ${ed(sec.id, `plans.${i}.features.${j}`)}>${esc(f)}</span>`).join('')}</div>
${i === 1 ? `<a class="btn btn-primary">Choose ${esc(p.name)}</a>` : `<a class="link">Choose ${esc(p.name)}</a>`}</div>`)
        .join('')}</div></div></section>`
    }

    case 'objections': {
      // one column reads as a conversation and two as a reference, so the form decides which
      const pairs = qa
        .map((f, i) => `<div class="qa">
<h3 ${ed(sec.id, `items.${i}.q`)}>${esc(f.q)}</h3>
<p ${ed(sec.id, `items.${i}.a`)}>${esc(f.a)}</p></div>`)
        .join('')
      return sec.form === 'prose'
        ? `${open}<div class="wrap"><div class="stack">
<h2 ${ed(sec.id, 'title')}>${esc(c.title)}</h2>${pairs}</div></div></section>`
        : `${open}<div class="wrap"><div class="stack wide">
<h2 ${ed(sec.id, 'title')}>${esc(c.title)}</h2>
<div class="grid pairs">${pairs}</div></div></div></section>`
    }

    case 'invitation':
      return sec.form === 'statement'
        ? `${open}<div class="wrap"><div class="stack wide center">
<h2 ${ed(sec.id, 'headline')}>${esc(c.headline)}</h2>
<p ${ed(sec.id, 'sub')}>${esc(c.sub)}</p>
<div class="ctas"><a class="btn btn-primary" ${ed(sec.id, 'cta')}>${esc(c.cta)}</a></div>
</div></div></section>`
        : `${open}<div class="wrap"><div class="band wide">
<div class="stack"><h2 class="smallhead" ${ed(sec.id, 'headline')}>${esc(c.headline)}</h2>
<p ${ed(sec.id, 'sub')}>${esc(c.sub)}</p></div>
<a class="btn btn-primary" ${ed(sec.id, 'cta')}>${esc(c.cta)}</a></div></div></section>`

    case 'credits': {
      // a colophon when nothing else is said: apparatus is the cheapest sign of editorial
      // hands, because generators never credit their own typography
      const face = (stack: string) => stack.split(',')[0].replace(/['"]/g, '').trim()
      const note = c.note || `Set in ${face(t.display)}${face(t.body) !== face(t.display) ? ` and ${face(t.body)}` : ''}.`
      const groups = (sec.content.groups as { title: string; links: string[] }[]) ?? []
      if (sec.form === 'table' && groups.length) {
        return `${open}<div class="wrap"><div class="stack wide">
<div class="grid cols">${groups
          .map((g, i) => `<div class="stack colgroup">
<h3 class="colhead" ${ed(sec.id, `groups.${i}.title`)}>${esc(g.title)}</h3>
${(g.links ?? []).map((l, j) => `<a class="navlink" ${ed(sec.id, `groups.${i}.links.${j}`)}>${esc(l)}</a>`).join('')}</div>`)
          .join('')}</div>
<div class="band foot">
<span ${ed(sec.id, 'product')}>\u00A9 ${new Date().getFullYear()} ${esc(c.product)}</span>
<span ${ed(sec.id, 'note')}>${esc(note)}</span></div></div></div></section>`
      }
      return `${open}<div class="wrap"><div class="band foot wide">
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
  const seen = new Set<string>()
  const body = page.sections
    .filter((s) => s.on)
    .map((s, i) => {
      const first = !seen.has(s.role)
      seen.add(s.role)
      return renderSection(s, page.taste, seed + i * 11, world, {
        beat: beat?.length ? beat[i % beat.length] : 1,
        first,
      })
    })
    .join('\n')
  // the backdrop goes first so it sits behind the content without needing a stacking hack
  const art = backdropHtml(page.taste, page.backdrop ?? 'none', !!opts.still)
  return `${head(page.taste, opts.title ?? 'Landing', !!opts.editable, world, !!opts.still)}${art}${body}${opts.editable ? EDIT_SCRIPT : ''}</body></html>`
}

