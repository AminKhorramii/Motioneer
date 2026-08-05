/**
 * The editorial positions a wall argues from, one page each. Design knowledge, not
 * machinery: a wall is only worth scanning if the pages disagree, so each angle argues a
 * different reason to care rather than rephrasing the same one. Add an angle and the next
 * wall can take it.
 */

export const ANGLES: { name: string; instruction: string }[] = [
  { name: 'the pain', instruction: 'Open by naming the problem the reader has today, in their words, before mentioning the product. Someone who recognises their own situation keeps reading.' },
  { name: 'the outcome', instruction: 'Lead with the state the reader ends up in, described concretely enough to picture. Skip how it works until later sections.' },
  { name: 'proof first', instruction: 'Lead with evidence: numbers, scale, and what real usage looks like. Keep claims to ones a sceptical reader could check.' },
  { name: 'plain and specific', instruction: 'Say exactly what the product does in the fewest words, with no framing or persuasion. Specificity is the argument.' },
  { name: 'the one line', instruction: 'Build the page around a single short sentence that would work on a billboard, and let every other section support that one line.' },
  { name: 'for the sceptic', instruction: 'Write for a reader who assumes this is overpromised. Address the obvious objection early and answer it with detail.' },
  { name: 'the before', instruction: 'Contrast the old way with this one throughout, so the reader measures the difference themselves instead of being told it.' },
  { name: 'the craft', instruction: 'Argue from how carefully it is built: the decisions, the constraints honoured, what was deliberately left out.' },
]
