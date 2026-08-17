/**
 * What is being launched, and the words a page for it starts from.
 *
 * Every default in this app was written for one kind of thing. A brief for Grand Theft Auto VI
 * came back as a page with "What it does" over three feature rows, "Simple pricing" over Free at
 * nothing, Pro at nineteen dollars a month and Team at forty nine, a testimonial from a founder
 * somewhere, and a logo wall reading "used by teams at". Nine papers, nine designs, one argument,
 * and the argument was business software. No amount of type, colour, length or arrangement
 * reaches that, because it is not how the page looks. It is what the page is made of.
 *
 * So the roles stay, because they are genuinely general: something claims, something proves,
 * something has substance, something is offered, something invites. What changes is what each of
 * those means. An offer is a price for software, an edition for a game, a format for a book, a
 * date and a place for an event. Proof is a customer for software and a review for a film. The
 * shape of the page is the same and the vocabulary is not, which is why this is data rather than
 * eight more templates.
 *
 * Only the differences are written down. Anything a kind does not say is the software wording,
 * which is where all of this started and is still right for most of what people launch.
 */

import type { Role } from '@/sections'

export type Kind = 'software' | 'game' | 'film' | 'book' | 'music' | 'event' | 'hardware' | 'prelaunch'

/** the words a kind puts in a role, over the base. A function, because the name goes in them. */
type Words = (product: string) => Record<string, unknown>

export const KINDS: Record<Kind, { note: string; roles: Partial<Record<Role, Words>> }> = {
  software: {
    note: 'a tool, an app or a service somebody signs up for or installs',
    // the base wording lives in defaultContent, because this is the kind it was written for
    roles: {},
  },

  game: {
    note: 'a game, played on a console, a computer or a phone',
    roles: {
      masthead: (p) => ({ links: ['Game', 'World', 'News'], cta: `Preorder ${p}` }),
      claim: () => ({ cta: 'Preorder now', cta2: 'Watch the trailer' }),
      proof: () => ({
        quote: 'The most alive open world I have played in years.',
        name: 'A reviewer', role: 'games press',
        label: 'from the studio behind', names: ['their', 'previous', 'titles'],
      }),
      substance: () => ({
        title: 'The world',
        caption: 'A moment from the game.',
        items: [
          { title: 'The city', body: 'One line about what it is like to be in it.' },
          { title: 'The people', body: 'One line about who you meet there.' },
          { title: 'The freedom', body: 'One line about what you are allowed to do.' },
        ],
      }),
      offer: () => ({
        title: 'Editions',
        plans: [
          { name: 'Standard', price: '', line: 'the game', features: ['The full game'] },
          { name: 'Deluxe', price: '', line: 'the game and more', features: ['The full game', 'Early access', 'In game extras'] },
          { name: 'Collector', price: '', line: 'for the shelf', features: ['The full game', 'Early access', 'A physical edition'] },
        ],
      }),
      objections: () => ({
        title: 'Before you preorder',
        items: [
          { q: 'When does it come out?', a: 'The date, plainly, with no countdown.' },
          { q: 'What can I play it on?', a: 'The platforms, named.' },
          { q: 'Do I need to be online?', a: 'Say so either way.' },
        ],
      }),
      invitation: () => ({ headline: 'Preorder before it launches.', sub: 'Cancel any time before release.', cta: 'Preorder' }),
      credits: () => ({ groups: [
        { title: 'Game', links: ['The world', 'Editions', 'News'] },
        { title: 'Studio', links: ['About', 'Careers'] },
        { title: 'Legal', links: ['Privacy', 'Terms'] },
      ] }),
    },
  },

  film: {
    note: 'a film or a series, watched in a cinema or at home',
    roles: {
      masthead: () => ({ links: ['Film', 'Cast', 'Watch'], cta: 'Watch now' }),
      claim: () => ({ cta: 'Watch the trailer', cta2: 'Find a screening' }),
      proof: () => ({
        quote: 'The kind of film you argue about on the way home.',
        name: 'A critic', role: 'a paper worth quoting',
        label: 'from the director of', names: ['their', 'earlier', 'films'],
      }),
      substance: () => ({
        title: 'The story',
        caption: 'A still from the film.',
        items: [
          { title: 'The premise', body: 'One line a stranger would understand.' },
          { title: 'The cast', body: 'Who is in it, named.' },
          { title: 'The making', body: 'One thing about how it was made.' },
        ],
      }),
      offer: () => ({
        title: 'Where to watch',
        plans: [
          { name: 'In cinemas', price: '', line: 'from the release date', features: ['Find a screening'] },
          { name: 'At home', price: '', line: 'to rent or buy', features: ['Digital'] },
          { name: 'On disc', price: '', line: 'for the shelf', features: ['With the extras'] },
        ],
      }),
      objections: () => ({
        title: 'Details',
        items: [
          { q: 'When is it out?', a: 'The date, and where first.' },
          { q: 'How long is it?', a: 'The running time.' },
          { q: 'Who is it for?', a: 'The rating, and what earns it.' },
        ],
      }),
      invitation: () => ({ headline: 'See it on the big screen.', sub: 'Screenings from the release date.', cta: 'Find a screening' }),
      credits: () => ({ groups: [
        { title: 'Film', links: ['The story', 'Cast', 'Watch'] },
        { title: 'Studio', links: ['About', 'Press'] },
        { title: 'Legal', links: ['Privacy', 'Terms'] },
      ] }),
    },
  },

  book: {
    note: 'a book, read on paper, on a screen or aloud',
    roles: {
      masthead: () => ({ links: ['Book', 'Author', 'Read'], cta: 'Buy the book' }),
      claim: () => ({ cta: 'Buy the book', cta2: 'Read an extract' }),
      proof: () => ({
        quote: 'I finished it in two sittings and started it again.',
        name: 'A reader', role: 'a review worth quoting',
        label: 'also by the author of', names: ['their', 'other', 'books'],
      }),
      substance: () => ({
        title: 'What is inside',
        caption: 'A page from the book.',
        items: [
          { title: 'The argument', body: 'One line on what it is about.' },
          { title: 'The shape', body: 'How it is arranged, and how long.' },
          { title: 'The author', body: 'Why they are the one writing it.' },
        ],
      }),
      offer: () => ({
        title: 'Formats',
        plans: [
          { name: 'Hardback', price: '', line: 'the printed edition', features: ['First edition'] },
          { name: 'Ebook', price: '', line: 'read anywhere', features: ['No waiting'] },
          { name: 'Audiobook', price: '', line: 'read aloud', features: ['Unabridged'] },
        ],
      }),
      objections: () => ({
        title: 'Questions',
        items: [
          { q: 'When is it published?', a: 'The date, plainly.' },
          { q: 'How long is it?', a: 'The page count.' },
          { q: 'Where can I buy it?', a: 'Say where, including the independents.' },
        ],
      }),
      invitation: () => ({ headline: 'Read the first chapter.', sub: 'No sign up to read it.', cta: 'Read an extract' }),
      credits: () => ({ groups: [
        { title: 'Book', links: ['Inside', 'Formats', 'Extract'] },
        { title: 'Author', links: ['About', 'Events'] },
        { title: 'Legal', links: ['Privacy', 'Terms'] },
      ] }),
    },
  },

  music: {
    note: 'a record, an album or a single, listened to',
    roles: {
      masthead: () => ({ links: ['Album', 'Songs', 'Live'], cta: 'Listen' }),
      claim: () => ({ cta: 'Listen now', cta2: 'See tour dates' }),
      proof: () => ({
        quote: 'The record they have been circling for a decade.',
        name: 'A reviewer', role: 'a paper worth quoting',
        label: 'after', names: ['their', 'earlier', 'records'],
      }),
      substance: () => ({
        title: 'The record',
        caption: 'A photograph from the sessions.',
        items: [
          { title: 'The songs', body: 'How many, and how long.' },
          { title: 'The sound', body: 'One line a stranger would understand.' },
          { title: 'The making', body: 'Where and with whom.' },
        ],
      }),
      offer: () => ({
        title: 'Where to listen',
        plans: [
          { name: 'Streaming', price: '', line: 'everywhere', features: ['All the usual places'] },
          { name: 'Vinyl', price: '', line: 'pressed', features: ['With the sleeve'] },
          { name: 'Download', price: '', line: 'yours to keep', features: ['Lossless'] },
        ],
      }),
      objections: () => ({
        title: 'Details',
        items: [
          { q: 'When is it out?', a: 'The date.' },
          { q: 'Is there a tour?', a: 'Where and when.' },
          { q: 'Where does the money go?', a: 'Say plainly if it matters.' },
        ],
      }),
      invitation: () => ({ headline: 'Hear it first.', sub: 'Out on the release date.', cta: 'Listen' }),
      credits: () => ({ groups: [
        { title: 'Record', links: ['Songs', 'Listen', 'Vinyl'] },
        { title: 'Artist', links: ['About', 'Live'] },
        { title: 'Legal', links: ['Privacy', 'Terms'] },
      ] }),
    },
  },

  event: {
    note: 'a conference, a festival or a show, attended on a date',
    roles: {
      masthead: () => ({ links: ['Event', 'Programme', 'Tickets'], cta: 'Get tickets' }),
      claim: () => ({ cta: 'Get tickets', cta2: 'See the programme' }),
      proof: () => ({
        quote: 'The one week of the year I clear my calendar for.',
        name: 'Someone who came last time', role: 'and is coming again',
        label: 'previously at', names: ['the', 'venues', 'before'],
      }),
      substance: () => ({
        title: 'The programme',
        caption: 'A photograph from last time.',
        items: [
          { title: 'Who is speaking', body: 'Named, not teased.' },
          { title: 'What happens', body: 'The shape of the days.' },
          { title: 'Where it is', body: 'The place, and how to reach it.' },
        ],
      }),
      offer: () => ({
        title: 'Tickets',
        plans: [
          { name: 'Early', price: '', line: 'while they last', features: ['Full access'] },
          { name: 'Standard', price: '', line: 'the usual price', features: ['Full access'] },
          { name: 'Day', price: '', line: 'one day only', features: ['One day'] },
        ],
      }),
      objections: () => ({
        title: 'Before you book',
        items: [
          { q: 'When and where?', a: 'The dates and the place.' },
          { q: 'Can I get a refund?', a: 'Say plainly, including transfers.' },
          { q: 'Is it accessible?', a: 'Say what is provided, not that you care.' },
        ],
      }),
      invitation: () => ({ headline: 'Book before the early tickets go.', sub: 'The dates, once more.', cta: 'Get tickets' }),
      credits: () => ({ groups: [
        { title: 'Event', links: ['Programme', 'Tickets', 'Venue'] },
        { title: 'Organiser', links: ['About', 'Contact'] },
        { title: 'Legal', links: ['Privacy', 'Terms'] },
      ] }),
    },
  },

  hardware: {
    note: 'a physical thing, bought once and delivered',
    roles: {
      masthead: () => ({ links: ['Product', 'Specifications', 'Buy'], cta: 'Buy now' }),
      claim: () => ({ cta: 'Buy now', cta2: 'See the specifications' }),
      proof: () => ({
        quote: 'It replaced three things on my desk and I stopped thinking about it.',
        name: 'An owner', role: 'six months in',
        label: 'made with', names: ['the', 'materials', 'named'],
      }),
      substance: () => ({
        title: 'How it is made',
        caption: 'A photograph of the thing itself.',
        items: [
          { title: 'The material', body: 'What it is made of, named.' },
          { title: 'The measurements', body: 'Size and weight, in numbers.' },
          { title: 'What is in the box', body: 'Everything, listed.' },
        ],
      }),
      offer: () => ({
        title: 'Models',
        plans: [
          { name: 'Standard', price: '', line: 'the one most people want', features: ['In the usual finish'] },
          { name: 'Larger', price: '', line: 'more of it', features: ['The bigger size'] },
          { name: 'Set', price: '', line: 'the pair', features: ['Both, together'] },
        ],
      }),
      objections: () => ({
        title: 'Before you buy',
        items: [
          { q: 'When does it ship?', a: 'The lead time, plainly.' },
          { q: 'Can I return it?', a: 'The window, and who pays postage.' },
          { q: 'How long does it last?', a: 'The guarantee, and what it covers.' },
        ],
      }),
      invitation: () => ({ headline: 'Order one.', sub: 'Shipping times, stated.', cta: 'Buy' }),
      credits: () => ({ groups: [
        { title: 'Product', links: ['Specifications', 'Buy', 'Support'] },
        { title: 'Maker', links: ['About', 'Contact'] },
        { title: 'Legal', links: ['Privacy', 'Returns'] },
      ] }),
    },
  },

  /**
   * A thing that does not exist yet, which is a different argument from a thing you can buy.
   *
   * hardware above is retail: buy now, returns, a guarantee, three models. Every one of those
   * answers is unavailable before a run is made, and the page still has to be written. An interest
   * check, a group buy and a campaign pre-launch are all the same artifact under different names,
   * and it is a real separately budgeted deliverable rather than a category invented here: it is
   * posted with a run size, a spec and a date, and its whole job is to find out whether enough
   * people want the thing to justify making it.
   *
   * The proof role is the reason this could not be a variation on hardware. Retail proof is an
   * owner, and a pre-launch has no owners, so the wording hardware ships, "An owner, six months
   * in", is a fabrication by construction on this page. What a reader is actually weighing is
   * whether these people can deliver, so the honest proof is who is making it, what they made
   * before, and how far along it is. That is checkable and a testimonial would not be.
   *
   * The objections are the ones people really have about paying for something unbuilt, and they
   * are the ones a page most wants to skip.
   */
  prelaunch: {
    note: 'a run, a group buy or a campaign for something not made yet, which people register for before it exists',
    roles: {
      masthead: () => ({ links: ['The run', 'Specification', 'Register'], cta: 'Register interest' }),
      claim: () => ({ cta: 'Register interest', cta2: 'Read the specification' }),
      proof: (p) => ({
        /**
         * No quote, and no witness under it either.
         *
         * A kind's words are merged over the base rather than replacing it, so clearing only the
         * quote left the base's stand-in witness and its unfilled logo row underneath: measured,
         * this kind tripped invented-witness, nowhere-company and unfilled-logos while hardware
         * tripped none, which made the one kind written never to fabricate proof the only one
         * carrying a fabricated one. Every field the witness is made of is cleared here, because
         * empty is the true state of them before anything has shipped, and a slot that cannot
         * honestly be filled is worse than absent.
         *
         * What stands in for proof is the state of the thing and the record of the people making
         * it, both of which a reader can go and check.
         */
        title: 'Where it is up to',
        quote: '', name: '', role: '', label: '', names: [],
        items: [
          { title: 'Made before', body: `What the people behind ${p} have shipped, and how many.` },
          { title: 'The prototype', body: 'Which revision exists, and what is still being changed.' },
          { title: 'The maker', body: 'Who is manufacturing it, named.' },
        ],
      }),
      substance: () => ({
        title: 'The specification',
        caption: 'The thing as it stands, photographed or drawn.',
        items: [
          { title: 'The material', body: 'What it is made of, named.' },
          { title: 'The measurements', body: 'Size and weight, in numbers.' },
          { title: 'What is in the box', body: 'Everything, listed.' },
        ],
      }),
      offer: () => ({
        title: 'The run',
        plans: [
          { name: 'The run', price: '', line: 'how many are being made', features: ['The number', 'What it costs', 'When it opens'] },
          { name: 'The date', price: '', line: 'when registration closes', features: ['The closing date', 'When it ships'] },
          { name: 'The floor', price: '', line: 'what has to be reached', features: ['The number it needs', 'What happens if it is not reached'] },
        ],
      }),
      objections: () => ({
        title: 'Before you register',
        items: [
          { q: 'What if it does not reach the number?', a: 'Say plainly whether it is cancelled and whether anybody is charged.' },
          { q: 'When am I actually charged?', a: 'At registration or at production, stated, with the date.' },
          { q: 'What happens if it is late?', a: 'The honest answer, and how you will say so.' },
        ],
      }),
      invitation: () => ({
        headline: 'Register before it closes.',
        sub: 'Registering is not an order, and the date it closes is stated.',
        cta: 'Register interest',
      }),
      credits: () => ({ groups: [
        { title: 'The run', links: ['Specification', 'Register', 'Updates'] },
        { title: 'Maker', links: ['About', 'Previous runs', 'Contact'] },
        { title: 'Legal', links: ['Privacy', 'Terms'] },
      ] }),
    },
  },
}

export const KIND_IDS = Object.keys(KINDS) as Kind[]

/** the kind a brief did not name. Most of what people launch is still software. */
export const DEFAULT_KIND: Kind = 'software'

export const asKind = (v: unknown): Kind =>
  KIND_IDS.includes(v as Kind) ? (v as Kind) : DEFAULT_KIND

/** the list handed to whoever is reading a brief, so the names and the meanings travel together */
export const kindMenu = () =>
  KIND_IDS.map((k) => `${k}, ${KINDS[k].note}`).join('; ')
