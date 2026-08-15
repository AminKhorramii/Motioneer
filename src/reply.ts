/**
 * A model's reply, and getting a usable object out of it.
 *
 * Nothing here is about composing a page. It is about the fact that a reply arrives a few
 * characters at a time, can stop in the middle of a sentence, and is written by something that
 * does not always produce valid JSON: a literal newline inside a string, a fence around the
 * object, a closing brace inside a headline. Every model call in the app goes through this, so it
 * lived in compose.ts by accident of being written there first, and it took that file past a
 * thousand lines while having nothing to do with the rest of it.
 *
 * The two halves are the same job at two moments. scanSections reads objects out of a reply that
 * is still arriving, which is what puts a paper on the wall before the call ends and what rescues
 * a reply that was cut off. grabJson reads one that has finished, twice if the first reading
 * fails, because a design reply carrying forty lines of CSS is routinely not JSON any more.
 */

/**
 * Pull the section objects that have finished arriving out of a partial JSON reply. The walk
 * tracks strings and brace depth, so a closing brace inside a headline does not end an object
 * early.
 *
 * It resumes from a cursor rather than re-reading the buffer, because copy full of braces
 * makes almost every delta trigger a scan, and re-reading turns one page into quadratic work.
 * With several pages streaming at once that is enough to stall the app.
 */
export function scanSections(buf: string, from: number, key = '"sections"') {
  const out: { id: string; content: Record<string, unknown> }[] = []
  let cursor = from
  if (from === 0) {
    const at = buf.indexOf(key)
    const open = at < 0 ? -1 : buf.indexOf('[', at)
    if (open < 0) return { out, cursor }
    cursor = open + 1
  }
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false
  let done = cursor
  for (let i = cursor; i < buf.length; i++) {
    const ch = buf[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        try {
          const obj = JSON.parse(buf.slice(start, i + 1)) as { id?: string; content?: Record<string, unknown> }
          if (obj.id !== undefined || obj.content !== undefined || key !== '"sections"') {
            out.push(obj as { id: string; content: Record<string, unknown> })
          }
        } catch {
          // an object that fails to parse is simply not finished yet
        }
        start = -1
        done = i + 1
      }
    }
  }
  return { out, cursor: done }
}

/**
 * The control characters a model leaves loose inside its own strings, escaped.
 *
 * A world carries thirty to sixty lines of CSS in one JSON string, and a reply that writes those
 * lines as actual lines is not JSON any more. Neither reader here could take it: the parse fails
 * outright and the brace walk, which finds the object boundaries correctly, then fails on the
 * same slice for the same reason. Measured across the four shapes a reply arrives in, this is the
 * one that lost the whole answer while nothing was wrong with the answer.
 */
const looseJson = (s: string) => {
  let out = ''
  let inString = false
  let escaped = false
  for (const ch of s) {
    if (!inString) {
      if (ch === '"') inString = true
      out += ch
      continue
    }
    if (escaped) {
      escaped = false
      out += ch
      continue
    }
    if (ch === '\\') {
      escaped = true
      out += ch
      continue
    }
    if (ch === '"') {
      inString = false
      out += ch
      continue
    }
    out += ch === '\n' ? '\\n' : ch === '\r' ? '\\r' : ch === '\t' ? '\\t' : ch
  }
  return out
}

export const grabJson = (text: string) => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  const cut = text.slice(start, end + 1)
  try {
    return JSON.parse(cut) as Record<string, unknown>
  } catch {
    // a second reading, with the loose newlines inside its strings tied down
    try {
      return JSON.parse(looseJson(cut)) as Record<string, unknown>
    } catch {
      return null
    }
  }
}
