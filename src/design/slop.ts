/**
 * The slop catalogue: the patterns a model reaches for when it has nothing specific to say,
 * named the way a designer would name them. Design knowledge, not machinery: add a tell,
 * retire one, sharpen a why, and the detector in src/slop.ts picks it up unchanged.
 *
 * The split rule: a tell that is a pattern lives here as data; a tell that has to count or
 * compare, cards on a page, typefaces in play, text sizes, lives as code in the detector,
 * because a counting mini-language would be harder to read than the count.
 */

/** found in the copy: tried against every string on the page, trimmed */
export interface CopyTell {
  id: string
  find: RegExp
  /** only strings under this content key, when set */
  key?: string
  label: (match: string) => string
  why: string
}

/** found in the rendered page: every expression must match the HTML and CSS */
export interface MarkupTell {
  id: string
  find: RegExp[]
  label: string
  why: string
}

export const COPY_TELLS: CopyTell[] = [
  {
    id: 'hollow-word',
    find: /\b(revolutionary|seamless|unlock|empower|transform|elevate|effortless|powerful|cutting[- ]edge|game[- ]?chang\w*|supercharge|unleash|next[- ]generation|leverage|streamline|robust|innovative|best[- ]in[- ]class|world[- ]class)\b/i,
    label: (m) => `hollow word: ${m.toLowerCase()}`,
    why: 'It describes nothing, so a reader cannot tell what the product does from it.',
  },
  {
    id: 'emoji',
    find: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u,
    label: () => 'emoji in the copy',
    why: 'It stands in for a tone the words are not carrying on their own.',
  },
  {
    id: 'generic-cta',
    key: 'cta',
    find: /^(get started|start free|learn more|sign up|try it now|get started free|start now|join now|contact us)$/i,
    label: (m) => `generic call to action: ${m}`,
    why: 'It names no outcome, so it reads as a button rather than an offer.',
  },
  {
    id: 'interchangeable-claim',
    find: /\b(save time|grow your business|boost (?:your )?productivity|work smarter|built for scale|lightning[- ]fast|blazing(?:ly)? fast|all[- ]in[- ]one|the future of|10x your)\b/i,
    label: (m) => `interchangeable claim: ${m.toLowerCase()}`,
    why: "It would be as true on any competitor's page, so it argues for nobody in particular.",
  },
  {
    id: 'placeholder-proof',
    find: /\b(?:trusted|loved|used) by [\d,.]+\s*[km]?\+?\s*(?:users|teams|companies|developers|customers)\b/i,
    label: () => 'unverifiable user count',
    why: 'A total nobody can check reads as decoration, where one named witness would read as evidence.',
  },
  /**
   * The two halves of a witness nobody has met.
   *
   * A page asked for a testimonial and given no customer invents one, and it invents it in the
   * open: a real recorded wall shipped the quote "i stopped rebuilding context i already had"
   * signed "a real person", "founder, somewhere", and every check the house had let it through.
   * The count above was the only proof tell there was, and a made up total is the mistake a page
   * makes when it has numbers. This is the one it makes when it has nobody.
   *
   * Scoped to the attribution rather than the quote, because the quote is often the one honest
   * sentence in the section and only the name under it is fiction.
   */
  {
    id: 'invented-witness',
    key: 'name',
    find: /^(?:(?:a|the) )?(?:real |happy |satisfied |delighted )?(?:customer|user|client|person|founder|someone)$|^(?:jane|john) (?:doe|smith)$|^(?:your|customer|full|company) name(?: here)?$|^name here$/i,
    label: (m) => `an invented witness: ${m.toLowerCase()}`,
    why: 'A quote signed by nobody is weaker than no quote, because it tells the reader the page had to invent its own evidence.',
  },
  {
    id: 'nowhere-company',
    key: 'role',
    find: /\b(?:somewhere|anywhere|a company|some company|a startup|a business|your company|company name|acme(?: (?:inc|corp|co))?|example(?: (?:inc|corp|co))?)\b/i,
    label: (m) => `a witness from nowhere: ${m.toLowerCase()}`,
    why: 'An employer the reader cannot look up is a stand-in left in the page, so the whole quote reads as filler.',
  },
  {
    id: 'love-tagline',
    find: /(?:built|made|crafted) with (?:love|❤|passion)/iu,
    label: () => 'made with love',
    why: 'It is the sign-off every generated page reaches for, and it tells the reader nothing they can use.',
  },
  {
    id: 'not-x-but-y',
    find: /\b(?:it'?s|this is|we'?re) not (?:just )?(?:a |an |about )?[^,.;]{2,40}[,;.]?\s+(?:it'?s|but|this is)\b/i,
    label: () => 'the "not X, it is Y" pivot',
    why: 'Nobody says it across a desk, so the sentence sounds like the model rather than the product.',
  },
  {
    id: 'whether-youre',
    find: /\bwhether you'?re\b[^.]{0,80}\bor\b/i,
    label: () => 'whether you are A or B',
    why: 'Addressing everyone at once addresses nobody, where naming one reader makes the page theirs.',
  },
  {
    id: 'ai-phrase',
    find: /\b(?:in today'?s (?:fast[- ]paced |digital |modern |ever[- ]changing )?(?:world|landscape|market|economy)|look no further|delve|dive (?:deep )?into|at the end of the day|to the next level|say goodbye to|say hello to|we'?ve got you covered|the possibilities are endless)\b/i,
    label: (m) => `stock phrase: ${m.toLowerCase()}`,
    why: 'It is filler every generated page shares, so it marks the copy as written by nobody.',
  },
  {
    id: 'fake-logos',
    find: /\b(?:acme|globex|initech|umbrella corp|stark industries|wayne enterprises|hooli|vandelay|cyberdyne|massive dynamic)\b/i,
    label: () => 'placeholder company names',
    why: 'A made up logo row promises proof and delivers a prop, which costs more trust than an empty row.',
  },
  /**
   * The other end of the logo row: the instruction to fill it in, left in the page.
   *
   * The row above is what a page does when it invents customers. This is what it does when it
   * leaves ours. The default row reads "Replace these with real names", which is the honest thing
   * for a blank page to say and the worst thing for a shipped one, and the writing call is handed
   * the page as it stands and does not always touch a field it has nothing to put in.
   */
  {
    id: 'unfilled-logos',
    key: 'names',
    find: /^(?:replace|these|with|real|names|your|logo|logos|company|customer|brand|here|placeholder)$/i,
    label: (m) => `an unfilled logo row: ${m.toLowerCase()}`,
    why: 'It is the instruction to put something here, still sitting where the something goes.',
  },
]

export const MARKUP_TELLS: MarkupTell[] = [
  {
    id: 'gradient-text',
    find: [/background-clip:\s*text|-webkit-background-clip:\s*text/],
    label: 'gradient filled text',
    why: 'It is the decoration a page reaches for when the words are not carrying it.',
  },
  {
    id: 'shouting-body',
    find: [/\bp\s*\{[^}]*text-transform:\s*uppercase/],
    label: 'body copy in capitals',
    why: 'Capitals remove the word shapes people read by, so a paragraph becomes a wall.',
  },
  {
    id: 'glassmorphism',
    find: [/backdrop-filter/],
    label: 'glassmorphism',
    why: 'Frosted panels read as a period effect rather than a decision, and they cost contrast.',
  },
  {
    id: 'generic-shadow',
    find: [/box-shadow:\s*0 4px 6px|0 1px 3px rgba\(0,\s*0,\s*0,\s*0?\.1\)/],
    label: 'default drop shadow',
    why: 'It is the framework default, so it adds depth without saying anything about the product.',
  },
  {
    id: 'pulsing-dot',
    find: [/border-radius:\s*50%/, /animation:[^;}]*infinite/],
    label: 'a pulsing dot',
    why: 'A small thing blinking forever takes attention it never gives back. Motion that runs once, an entrance, is a different thing from motion that never stops.',
  },
  {
    id: 'nested-cards',
    find: [/class="card[^"]*"[^>]*>(?:(?!<\/)[\s\S]){0,400}?class="card/],
    label: 'cards inside cards',
    why: 'Two borders around the same content divide attention without adding structure.',
  },
  {
    id: 'purple-gradient',
    find: [/linear-gradient\([^)]*(?:#(?:7c3aed|8b5cf6|a78bfa|6366f1|4f46e5|9333ea)|\bpurple\b|\bviolet\b|\bindigo\b)/i],
    label: 'the purple gradient',
    why: "It is the colour move a model makes when no palette was chosen, so it reads as nobody's brand.",
  },
  {
    id: 'transition-all',
    find: [/transition:\s*all\b/],
    label: 'transition on everything',
    why: 'Motion that names no property is the framework default, so it decorates every hover instead of meaning one.',
  },
  {
    id: 'accent-border-card',
    find: [/border-left:\s*[2-8]px solid/],
    label: 'the coloured left border',
    why: 'It is the template shorthand for importance, so it reads as the framework speaking rather than the brand.',
  },
  {
    id: 'glow-text',
    find: [/text-shadow:\s*[^;}]*\b\d{2,}px/],
    label: 'glowing text',
    why: 'A glow stands in for contrast the palette did not provide, and it costs the letterforms their edges.',
  },
]

/**
 * The numbers the detector counts to.
 *
 * They were literals inside the checks, which meant the page was measured against limits the
 * writer was never told. Measured on a real wall, one of them accounted for five flags on nine
 * papers: the line under the headline came back at thirty to thirty-five words every time, and
 * the prompt said only "keep them short". A limit worth enforcing is worth stating, and stating
 * it from here is what stops the two drifting apart.
 */
export const LIMITS = {
  /** words in the line under the headline, which is read before anyone has decided to read */
  heroSubWords: 28,
  /** em dashes on a page, over which it reads as performed rather than said */
  emDashes: 2,
  /** bare figures in a row before it is a statistics banner rather than evidence */
  bareStats: 3,
  /** words in a headline that names nothing specific */
  vagueHeadlineWords: 7,
  /** words in a nav link, past which it is a description rather than a place */
  navLinkWords: 2,
}

/** The same numbers, said to whoever is about to write the copy rather than only counted after. */
export const copyLimits = () =>
  `The page is checked against these after you write it, so writing to them costs less than being asked twice. ` +
  `The line under the headline is at most ${LIMITS.heroSubWords} words, because it is read before the reader has ` +
  `decided to read anything, so a paragraph there is spent rather than saved. A headline that names nothing ` +
  `specific, no number and no proper noun, stays under ${LIMITS.vagueHeadlineWords + 1} words, because a long vague ` +
  `line is a long way of saying nothing. Use at most one em dash on the page and never ${LIMITS.bareStats} or more ` +
  `bare figures in a row, because both are the shape of a page performing rather than saying. Nav links are one or ` +
  `${LIMITS.navLinkWords} words naming a place, because a phrase there takes a fixation the headline needed. And no ` +
  `headline ends in a question mark or opens with "tired of", "struggling" or "ready to", because asking the reader ` +
  `to supply the problem is what a page does when it cannot state one.`
