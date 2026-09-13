/** Model-facing markup: keep the visible structure, not megabytes of frozen pixels and styles. */
export function componentBrief(html, limit = 18000) {
  const clean = String(html || '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[^]*?-->/g, '')
    .replace(/(<svg\b[^>]*>)[\s\S]*?<\/svg\s*>/gi, '$1</svg>')
  const voids = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'])
  const stack = [], out = []
  let size = 0, omitted = false
  for (const token of clean.match(/<(?:"[^"]*"|'[^']*'|[^'">])*>|[^<]+/g) || []) {
    const close = /^<\/([\w-]+)/.exec(token)
    if (close) {
      const idx = stack.map(x=>x.tag).lastIndexOf(close[1].toLowerCase())
      if (idx < 0) continue
      const items = stack.splice(idx)
      for (const item of items.reverse()) if (item.written) out.push(`</${item.tag}>`)
      continue
    }
    const open = /^<([\w-]+)\b/.exec(token)
    if (open) {
      const tag = open[1].toLowerCase(), style = /\bstyle=("[^"]*"|'[^']*')/i.exec(token)?.[1]?.slice(1,-1) || ''
      const hidden = stack.some(x=>x.hidden) || /(?:^|;)\s*display\s*:\s*none\b/i.test(style) || /\shidden(?:\s|=|>)/i.test(token)
      let short = token.replace(/\sstyle=("[^"]*"|'[^']*')/gi, '').replace(/\s(?:srcset|d|points)=("[^"]*"|'[^']*')/gi, '').replace(/\b(src|poster)=(['"])data:[\s\S]*?\2/gi, '$1="embedded"')
      const rest = style.split(';').filter(s=>/^\s*(?:transform|opacity|display)\s*:/.test(s)).join(';')
      if(rest)short=short.replace(/\s*\/?>$/,` style="${rest.replace(/"/g,'&quot;')}">`)
      const written = !hidden && size + short.length < limit
      if(written){out.push(short);size+=short.length}else if(!hidden)omitted=true
      if(!voids.has(tag)&&!token.endsWith('/>'))stack.push({tag,hidden:hidden||!written,written})
    } else if (!stack.some(x=>x.hidden)) {
      const text = token.replace(/\s+/g,' ')
      if(size+text.length<limit){out.push(text);size+=text.length}else omitted=true
    }
  }
  for(const item of stack.reverse())if(item.written)out.push(`</${item.tag}>`)
  return out.join('') + (omitted?'\n<!-- Further descendants omitted. Use only selectors grounded in the structure shown. -->':'')
}

export const briefStyles = css => String(css || '').replace(/url\(\s*(['"]?)data:[\s\S]*?\1\s*\)/gi,'url(embedded)').slice(0,6000)
