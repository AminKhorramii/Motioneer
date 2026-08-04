/**
 * Craft rules.
 *
 * The positive counterpart to slop.ts. Slop names what a model reaches for when it has nothing
 * to say; this names what a page does when it has something to say. Kept separate because the
 * two are used differently: slop runs as a detector over a finished page, while these travel in
 * the system prompt, where they shape the writing before there is anything to detect.
 *
 * Each rule is distilled from studying pages that work rather than invented here: the swap test
 * is the copywriting standard that a claim must be false on a competitor's page, and the
 * structural rules are the inverse of the catalogued generation defaults, since every default
 * names a decision that was skipped.
 */

export interface Rule {
  id: string
  /** the rule, phrased as an instruction a writer can follow */
  rule: string
  /** why it works, because a rule without a reason gets optimised into the letter and out of the spirit */
  why: string
}

export const CRAFT: Rule[] = [
  {
    id: 'swap-test',
    rule: 'Every claim carries a detail a competitor could not paste onto their page without lying: a number, a timeframe, a named thing the product actually does.',
    why: 'A benefit any product in the category could state argues for none of them, so the reader files it as noise.',
  },
  {
    id: 'cta-owns-verb',
    rule: 'The call to action is the product\'s own verb naming what happens next, never an invitation to begin.',
    why: 'A button that names its outcome is an offer, and one that names enthusiasm is furniture.',
  },
  {
    id: 'numbers-in-sentences',
    rule: 'A number lives inside a sentence that says what it cost or saved, never in a row of big statistics.',
    why: 'A stat banner asks to be admired, and a stat inside a claim asks to be believed, which is the response a page wants.',
  },
  {
    id: 'consequence-then-feeling',
    rule: 'State what a feature does to the reader\'s day, not what the feature is called, and let one line say how that day feels.',
    why: 'People buy the consequence. The feature name is the receipt, not the reason.',
  },
  {
    id: 'proof-is-a-story',
    rule: 'Proof is one named person or team and what changed for them, not a count of anonymous users.',
    why: 'An unverifiable total reads as decoration, and one specific witness reads as evidence.',
  },
  {
    id: 'one-focal-decision',
    rule: 'Give each section one thing to be about and let one section dominate the page, rather than three equal columns of everything.',
    why: 'Equal weight everywhere is the layout of not choosing, and the reader can feel that no choice was made.',
  },
  {
    id: 'said-across-a-desk',
    rule: 'Every sentence survives being said aloud to one person: no "not X, it is Y" pivots, no "whether you are A or B", no question the page answers itself.',
    why: 'Constructions nobody speaks are the accent of generated writing, and readers have learned to hear it.',
  },
  {
    id: 'name-the-mechanism',
    rule: 'When the page claims a result, one clause says how the product gets it, naming the mechanism.',
    why: 'A claim with a mechanism can be checked, and checkable is the difference between a fact and a slogan.',
  },
  {
    id: 'plain-punctuation',
    rule: 'Full sentences with plain punctuation: no em dashes, no exclamation marks, and adjectives only where a fact backs them.',
    why: 'These are the marks a writer leans on for energy the words did not earn, and they read as borrowed.',
  },
  {
    id: 'cut-not-fill',
    rule: 'A section with nothing specific to say is cut, never padded.',
    why: 'Filler spends the trust the specific sections earned, because the reader cannot tell which kind they are in next.',
  },
]

/** The rules as prompt text. Static, so it never breaks the prompt cache across a wall. */
export function craftBrief(): string {
  return [
    'Write to these standards, each stated with its reason:',
    ...CRAFT.map((r) => `- ${r.rule} ${r.why}`),
  ].join('\n')
}
