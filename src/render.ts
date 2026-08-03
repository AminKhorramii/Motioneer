/**
 * Rendering a page to standalone HTML. Every value comes from the taste sheet
 * so a page and its variants stay one family. The editable build injects a
 * small script that reports text edits back to the app.
 */

import { alpha, luminance, mix, shift, type Taste } from '@/taste'
import { type Page, type Section } from '@/sections'

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

function head(t: Taste, title: string, editable: boolean) {
  const { gap, surface, line, s, ease } = tokens(t)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:${t.bg};--ink:${t.ink};--dim:${t.dim};--accent:${t.accent};--accent2:${t.accent2};
--surface:${surface};--line:${line};--r:${t.radius}px;--gap:${(gap * 2 + 1).toFixed(2)}rem}
body{background:var(--bg);color:var(--ink);font-family:${t.body};font-size:16.5px;
line-height:${(1.45 + gap * 0.28).toFixed(2)};-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
h1,h2,h3{font-family:${t.display};font-weight:${t.weight};line-height:1.07;letter-spacing:-.022em}
h1{font-size:clamp(2.3rem,6vw,${s(6)})}h2{font-size:clamp(1.5rem,3.2vw,${s(4)})}h3{font-size:${s(1)}}
p{color:var(--dim)}
.wrap{max-width:1080px;margin:0 auto;padding:0 clamp(1.2rem,4vw,2.4rem)}
.eyebrow{font-size:.76rem;letter-spacing:.24em;color:var(--accent);font-weight:600;
${t.caps ? 'text-transform:uppercase;' : ''}font-family:${t.body}}
.btn{display:inline-block;padding:.82em 1.5em;border-radius:var(--r);font-weight:600;font-size:.95rem;
font-family:${t.body};transition:transform .18s ${ease},filter .18s ease}
.btn:hover{transform:translateY(-2px);filter:brightness(1.08)}
.btn-primary{background:var(--accent);color:${luminance(t.accent) > 0.6 ? '#101216' : '#fff'}}
.btn-ghost{border:1px solid var(--line)}
section{padding:calc(var(--gap)*2.2) 0}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:calc(var(--gap)*.95)}
.grid{display:grid;gap:calc(var(--gap)*.8)}
.ctas{display:flex;gap:.7rem;flex-wrap:wrap;margin-top:calc(var(--gap)*.9)}
${editable ? `[data-edit]{outline:0;transition:box-shadow .15s ease;border-radius:3px}
[data-edit]:hover{box-shadow:0 0 0 1px ${alpha(t.accent, 0.45)}}
[data-edit]:focus{box-shadow:0 0 0 2px ${t.accent};background:${alpha(t.accent, 0.06)}}` : ''}
</style></head><body>`
}

const EDIT_SCRIPT = `<script>
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

function figure(t: Taste, seed: number, ratio = '16/10') {
  const r = (n: number) => Math.abs(Math.sin(seed * 3301 + n * 7919)) % 1
  const blobs = Array.from({ length: 4 }, (_, i) => {
    const c = i % 2 ? t.accent2 : t.accent
    return `radial-gradient(${(30 + r(i) * 40).toFixed(0)}% ${(28 + r(i + 9) * 36).toFixed(0)}% at ${(12 + r(i + 3) * 76).toFixed(0)}% ${(14 + r(i + 5) * 72).toFixed(0)}%,${alpha(c, 0.5 - i * 0.08)} 0%,transparent 70%)`
  }).join(',')
  const dark = luminance(t.bg) < 0.5
  return `<div style="position:relative;border-radius:var(--r);overflow:hidden;border:1px solid var(--line);
aspect-ratio:${ratio};background:${blobs},${mix(t.bg, dark ? '#fff' : '#000', 0.05)}">
<div style="position:absolute;inset:0;background:repeating-linear-gradient(115deg,${alpha(t.ink, 0.05)} 0 1px,transparent 1px 7px)"></div>
<div style="position:absolute;left:8%;top:13%;right:8%;height:9px;border-radius:99px;background:${alpha(t.ink, 0.14)}"></div>
<div style="position:absolute;left:8%;top:23%;width:44%;height:9px;border-radius:99px;background:${alpha(t.ink, 0.1)}"></div>
<div style="position:absolute;left:8%;bottom:14%;width:32%;height:34px;border-radius:var(--r);background:${alpha(t.accent, 0.45)}"></div></div>`
}

export function renderSection(sec: Section, t: Taste, seed: number): string {
  const c = sec.content as Record<string, string>
  const v = sec.variant
  const open = `<section data-section="${sec.id}" id="${sec.kind}">`
  const ctas = `<div class="ctas"><a class="btn btn-primary" ${ed(sec.id, 'cta')}>${esc(c.cta)}</a>
<a class="btn btn-ghost" ${ed(sec.id, 'cta2')}>${esc(c.cta2)}</a></div>`

  switch (sec.kind) {
    case 'hero': {
      const body = {
        0: `<div class="wrap" style="max-width:820px;text-align:center">
<span class="eyebrow" ${ed(sec.id, 'eyebrow')}>${esc(c.eyebrow)}</span>
<h1 style="margin:1rem 0 1.1rem" ${ed(sec.id, 'headline')}>${esc(c.headline)}</h1>
<p style="font-size:1.16rem;max-width:56ch;margin:0 auto" ${ed(sec.id, 'sub')}>${esc(c.sub)}</p>
<div class="ctas" style="justify-content:center"><a class="btn btn-primary" ${ed(sec.id, 'cta')}>${esc(c.cta)}</a>
<a class="btn btn-ghost" ${ed(sec.id, 'cta2')}>${esc(c.cta2)}</a></div>
<div style="margin-top:calc(var(--gap)*1.6)">${figure(t, seed)}</div></div>`,
        1: `<div class="wrap" style="display:grid;grid-template-columns:1.05fr .95fr;gap:calc(var(--gap)*1.4);align-items:center">
<div><span class="eyebrow" ${ed(sec.id, 'eyebrow')}>${esc(c.eyebrow)}</span>
<h1 style="margin:.9rem 0 1rem" ${ed(sec.id, 'headline')}>${esc(c.headline)}</h1>
<p style="font-size:1.1rem;max-width:46ch" ${ed(sec.id, 'sub')}>${esc(c.sub)}</p>${ctas}</div>
<div>${figure(t, seed, '4/5')}</div></div>`,
        2: `<div class="wrap" style="max-width:900px">
<h1 style="font-size:clamp(2.6rem,7.4vw,5.2rem);max-width:16ch" ${ed(sec.id, 'headline')}>${esc(c.headline)}</h1>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:calc(var(--gap)*1.2);margin-top:calc(var(--gap)*1.2);
border-top:1px solid var(--line);padding-top:calc(var(--gap)*.9)">
<p style="font-size:1.12rem" ${ed(sec.id, 'sub')}>${esc(c.sub)}</p>
<div><p style="color:var(--ink)" ${ed(sec.id, 'eyebrow')}>${esc(c.eyebrow)}</p>${ctas}</div></div></div>`,
        3: `<div class="wrap" style="max-width:900px"><div class="card" style="font-family:ui-monospace,Menlo,monospace">
<div style="display:flex;gap:6px;margin-bottom:1.1rem">${['#ff5f57', '#febc2e', '#28c840'].map((x) => `<i style="width:11px;height:11px;border-radius:50%;background:${x};display:block"></i>`).join('')}</div>
<p style="color:var(--accent);font-size:.92rem" ${ed(sec.id, 'eyebrow')}>${esc(c.eyebrow)}</p>
<h1 style="font-size:clamp(1.9rem,4.4vw,2.9rem);margin:1rem 0" ${ed(sec.id, 'headline')}>${esc(c.headline)}</h1>
<p style="max-width:58ch" ${ed(sec.id, 'sub')}>${esc(c.sub)}</p>${ctas}</div>
<div style="margin-top:calc(var(--gap)*1.2)">${figure(t, seed)}</div></div>`,
      }[v % 4]
      return `${open}${body}</section>`
    }

    case 'logos': {
      const names = (sec.content.names as string[]) ?? []
      const items = names
        .map((n, i) => `<span ${ed(sec.id, `names.${i}`)} style="font-family:${t.display};font-weight:${t.weight};
opacity:${v === 0 ? 0.75 : 0.5};font-size:1.05rem">${esc(n)}</span>`)
        .join('')
      return `${open}<div class="wrap" style="text-align:center;padding:calc(var(--gap)*.4) 0">
${v === 0 ? `<p class="eyebrow" style="margin-bottom:1.1rem" ${ed(sec.id, 'label')}>${esc(c.label)}</p>` : ''}
<div style="display:flex;gap:calc(var(--gap)*1.3);justify-content:center;flex-wrap:wrap;align-items:center">${items}</div>
</div></section>`
    }

    case 'features': {
      const items = (sec.content.items as { title: string; body: string }[]) ?? []
      if (v === 2) {
        return `${open}<div class="wrap">
<h2 ${ed(sec.id, 'title')}>${esc(c.title)}</h2>
<div style="margin-top:calc(var(--gap)*.9)">${items
          .map(
            (f, i) => `<div style="display:grid;grid-template-columns:3.4rem 1fr;gap:1.3rem;padding:calc(var(--gap)*.7) 0;${i ? 'border-top:1px solid var(--line)' : ''}">
<span style="color:var(--accent);font-family:${t.display}">${String(i + 1).padStart(2, '0')}</span>
<div><h3 ${ed(sec.id, `items.${i}.title`)}>${esc(f.title)}</h3>
<p style="margin-top:.35rem;max-width:60ch" ${ed(sec.id, `items.${i}.body`)}>${esc(f.body)}</p></div></div>`,
          )
          .join('')}</div></div></section>`
      }
      if (v === 1) {
        return `${open}<div class="wrap"><h2 ${ed(sec.id, 'title')}>${esc(c.title)}</h2>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:calc(var(--gap)*.7);margin-top:calc(var(--gap)*.9)">
<div class="card" style="grid-column:span 2;grid-row:span 2;display:flex;flex-direction:column;justify-content:space-between">
<div><h3 ${ed(sec.id, 'items.0.title')}>${esc(items[0]?.title)}</h3>
<p style="margin-top:.4rem" ${ed(sec.id, 'items.0.body')}>${esc(items[0]?.body)}</p></div>
<div style="height:130px;border-radius:var(--r);margin-top:1rem;background:linear-gradient(135deg,${alpha(t.accent, 0.4)},${alpha(t.accent2, 0.16)})"></div></div>
${items.slice(1).map((f, i) => `<div class="card"><h3 ${ed(sec.id, `items.${i + 1}.title`)}>${esc(f.title)}</h3>
<p style="margin-top:.35rem;font-size:.95rem" ${ed(sec.id, `items.${i + 1}.body`)}>${esc(f.body)}</p></div>`).join('')}
</div></div></section>`
      }
      return `${open}<div class="wrap"><h2 ${ed(sec.id, 'title')}>${esc(c.title)}</h2>
<div class="grid" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-top:calc(var(--gap)*.9)">
${items
        .map(
          (f, i) => `<div class="card">
<div style="width:34px;height:34px;border-radius:${t.radius > 8 ? '50%' : 'var(--r)'};background:${i % 2 ? alpha(t.accent2, 0.22) : alpha(t.accent, 0.22)};margin-bottom:.9rem"></div>
<h3 ${ed(sec.id, `items.${i}.title`)}>${esc(f.title)}</h3>
<p style="margin-top:.45rem" ${ed(sec.id, `items.${i}.body`)}>${esc(f.body)}</p></div>`,
        )
        .join('')}</div></div></section>`
    }

    case 'showcase':
      return `${open}<div class="wrap" ${v === 1 ? 'style="display:grid;grid-template-columns:.8fr 1.2fr;gap:calc(var(--gap)*1.2);align-items:center"' : ''}>
<div><h2 ${ed(sec.id, 'title')}>${esc(c.title)}</h2>
<p style="margin-top:.6rem;max-width:48ch" ${ed(sec.id, 'caption')}>${esc(c.caption)}</p></div>
<div style="margin-top:${v === 1 ? '0' : 'calc(var(--gap)*1)'}">${figure(t, seed + 3, v === 1 ? '4/3' : '16/9')}</div>
</div></section>`

    case 'quote':
      return v === 1
        ? `${open}<div class="wrap"><div class="card" style="max-width:760px;margin:0 auto">
<p style="font-size:1.3rem;color:var(--ink);font-family:${t.display};line-height:1.5" ${ed(sec.id, 'quote')}>“${esc(c.quote)}”</p>
<p style="margin-top:1rem"><b ${ed(sec.id, 'name')}>${esc(c.name)}</b> · <span ${ed(sec.id, 'role')}>${esc(c.role)}</span></p>
</div></div></section>`
        : `${open}<div class="wrap" style="max-width:860px;text-align:center">
<p style="font-size:clamp(1.5rem,3.4vw,2.2rem);color:var(--ink);font-family:${t.display};line-height:1.35" ${ed(sec.id, 'quote')}>“${esc(c.quote)}”</p>
<p style="margin-top:1.2rem"><span ${ed(sec.id, 'name')}>${esc(c.name)}</span>, <span ${ed(sec.id, 'role')}>${esc(c.role)}</span></p>
</div></section>`

    case 'pricing': {
      const plans = (sec.content.plans as { name: string; price: string; line: string; features: string[] }[]) ?? []
      const shown = v === 1 ? plans.slice(1, 2) : plans
      return `${open}<div class="wrap"><h2 style="text-align:center" ${ed(sec.id, 'title')}>${esc(c.title)}</h2>
<div class="grid" style="grid-template-columns:repeat(${shown.length},minmax(0,1fr));margin-top:calc(var(--gap)*1);max-width:${shown.length === 1 ? '420px' : '100%'};margin-left:auto;margin-right:auto">
${shown
        .map((p, i) => {
          const idx = v === 1 ? 1 : i
          return `<div class="card"${idx === 1 ? ` style="border-color:${alpha(t.accent, 0.5)}"` : ''}>
<h3 ${ed(sec.id, `plans.${idx}.name`)}>${esc(p.name)}</h3>
<p style="font-size:2rem;color:var(--ink);font-family:${t.display};margin:.5rem 0 .2rem" ${ed(sec.id, `plans.${idx}.price`)}>${esc(p.price)}</p>
<p ${ed(sec.id, `plans.${idx}.line`)}>${esc(p.line)}</p>
<div style="margin:1rem 0 1.2rem;display:flex;flex-direction:column;gap:.4rem">
${(p.features ?? []).map((f, j) => `<span style="font-size:.94rem;color:var(--dim)" ${ed(sec.id, `plans.${idx}.features.${j}`)}>${esc(f)}</span>`).join('')}</div>
<a class="btn ${idx === 1 ? 'btn-primary' : 'btn-ghost'}">Choose ${esc(p.name)}</a></div>`
        })
        .join('')}</div></div></section>`
    }

    case 'faq': {
      const items = (sec.content.items as { q: string; a: string }[]) ?? []
      return `${open}<div class="wrap"><h2 ${ed(sec.id, 'title')}>${esc(c.title)}</h2>
<div class="grid" style="grid-template-columns:repeat(${v === 0 ? 2 : 1},minmax(0,1fr));margin-top:calc(var(--gap)*.9)">
${items
        .map(
          (f, i) => `<div style="border-top:1px solid var(--line);padding-top:.9rem">
<h3 style="font-size:1.05rem" ${ed(sec.id, `items.${i}.q`)}>${esc(f.q)}</h3>
<p style="margin-top:.4rem" ${ed(sec.id, `items.${i}.a`)}>${esc(f.a)}</p></div>`,
        )
        .join('')}</div></div></section>`
    }

    case 'cta':
      return v === 1
        ? `${open}<div class="wrap" style="text-align:center;max-width:720px">
<h2 ${ed(sec.id, 'headline')}>${esc(c.headline)}</h2>
<p style="margin-top:.7rem" ${ed(sec.id, 'sub')}>${esc(c.sub)}</p>
<div class="ctas" style="justify-content:center"><a class="btn btn-primary" ${ed(sec.id, 'cta')}>${esc(c.cta)}</a></div>
</div></section>`
        : `${open}<div class="wrap"><div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:1.4rem;flex-wrap:wrap;
background:linear-gradient(120deg,${alpha(t.accent, 0.16)},${alpha(t.accent2, 0.08)})">
<div><h2 style="font-size:${tokens(t).s(3)}" ${ed(sec.id, 'headline')}>${esc(c.headline)}</h2>
<p style="margin-top:.4rem" ${ed(sec.id, 'sub')}>${esc(c.sub)}</p></div>
<a class="btn btn-primary" ${ed(sec.id, 'cta')}>${esc(c.cta)}</a></div></div></section>`

    case 'footer':
      return `${open}<div class="wrap"><div style="border-top:1px solid var(--line);padding:2rem 0;display:flex;
justify-content:space-between;gap:1rem;flex-wrap:wrap;color:var(--dim);font-size:.85rem">
<span ${ed(sec.id, 'product')}>© ${new Date().getFullYear()} ${esc(c.product)}</span>
<span ${ed(sec.id, 'note')}>${esc(c.note)}</span></div></div></section>`
  }
}

export function renderPage(page: Page, opts: { editable?: boolean; title?: string } = {}): string {
  const seed = page.sections.length * 17 + page.taste.radius
  const body = page.sections
    .filter((s) => s.on)
    .map((s, i) => renderSection(s, page.taste, seed + i * 11))
    .join('\n')
  return `${head(page.taste, opts.title ?? 'Landing', !!opts.editable)}${body}${opts.editable ? EDIT_SCRIPT : ''}</body></html>`
}

