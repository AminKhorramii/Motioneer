/**
 * How a reply and a failure are written, in one place.
 *
 * A failure reads "Cannot <what> … Next: <what to do>", and an agent is told to relay it as given.
 * The 300 character cap cut the Next off long ones, and a third of the throws never had the shape,
 * so raw errors from deep in a render reached the agent as if they were advice.
 */
const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n')

/** A failure in the house shape. */
export const cannot = (what, next) => new Error(`Cannot ${what} Next: ${next}`)

/**
 * The text of a failure, at most a thousand characters, keeping its Next.
 *
 * An error that is not in the house shape gets one, so an agent never relays a stack fragment as
 * the next step.
 */
export function failure(error, { projectId } = {}) {
  let text = String(error instanceof Error ? error.message : error).trim() || 'Cannot finish: the call failed without a reason.'
  if (!/^Cannot /.test(text)) text = `Cannot finish: ${text.replace(/\s+/g, ' ')}`
  if (!/Next:/.test(text)) text += ' Next: check doctor, then retry once.'
  if (projectId && !text.includes(projectId)) text = text.replace(/ Next:/, ` What was made so far is kept in project ${projectId}. Next:`)
  if (text.length <= 1000) return text
  const at = text.lastIndexOf('Next:'), next = text.slice(at).slice(0, 300)
  return text.slice(0, 1000 - next.length - 2) + '… ' + next
}

/**
 * A reply is words first, then pictures, then a structured copy of the same facts. Claude Code
 * gives the model only the structured copy when there is one, so nothing the agent needs may live
 * only in the words.
 */
export const ok = (id, reply) => {
  const r = typeof reply === 'string' ? { text: reply } : reply
  const content = [{ type: 'text', text: r.text }, ...(r.images || []).filter((i) => i && i.data).map((i) => ({ type: 'image', data: i.data, mimeType: i.mime || 'image/jpeg' }))]
  send({ jsonrpc: '2.0', id, result: { content, ...(r.structured ? { structuredContent: r.structured } : {}) } })
}

/** A failure, as tool content so the agent reports it, with the same text in the structured copy. */
export const fail = (id, error, extra = {}) => {
  const text = failure(error, extra)
  send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text }], structuredContent: { error: text, ...(extra.projectId ? { projectId: extra.projectId } : {}) } } })
}

/**
 * A finished call. The summary and the next calls go inside the structured copy, since that is all
 * Claude Code shows the model; the same summary, any detail, and every identifier another call needs
 * go in the words, since those are all some other clients show.
 *
 * @param summary   what happened, in a few sentences, including the verified line for a film
 * @param detail    lines for clients that read only the words, such as a page's element list
 * @param ids       identifiers and paths another call needs, repeated in the words
 * @param next      [{tool, args, why}], the calls that make sense from here
 */
export const answer = (id, { summary, detail = '', structured = {}, next = [], images = [], ids = {} }) => {
  const facts = Object.entries(ids).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
  const then = next.length ? 'Possible next calls: ' + next.map((n) => `${n.tool} ${JSON.stringify(n.args)} to ${n.why}`).join('; ') : ''
  ok(id, { text: [summary, detail, facts.join('\n'), then].filter(Boolean).join('\n\n'), images, structured: { summary, ...structured, next } })
}

export { send }
