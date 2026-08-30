/**
 * What a motion is asked to be, and the two decks that stop several of them agreeing.
 *
 * Lifted out of design/prompts.ts and design/directions.ts, which are both about landing pages. The
 * studio needed four things from those two files, and reaching for them brought the page model along
 * with it: a copy limiter, a block contract, a menu of page kinds and a table of faces, none of
 * which has anything to say about moving a component somebody has already built.
 *
 * The decks are the reason several options disagree instead of being several takes on a fade.
 * MOTIONS answers in what manner, ERRANDS answers what for, and pairing them gives sixty four
 * combinations out of sixteen entries.
 */

/**
 * How the thing moves, taken from what the object does rather than from a library of easings.
 *
 * The looks already carry motion as still, soft or lively, which is an intensity: it says how much
 * and never says what. What an object does is specific and it is already written into the deck. A
 * departures board flips. A till roll prints a line at a time and the machine jerks between them. A
 * riso lays a second ink over the first and comes into register. A terminal types. A stamp is
 * cancelled once and stays cancelled. None of those is a fade, and a fade is what eight independent
 * calls will otherwise produce, for the same reason eight of them drew one watch dial.
 *
 * Written as what happens rather than as a curve, because a caller that is handed cubic-bezier has
 * been given a knob and a caller handed "the way a second ink lands on the first" has been given
 * the reason for one. The timing follows from the object: a press is stepped, a settle overshoots.
 */
const MOTIONS = [
  'printing out a line at a time, the way paper leaves a machine, stepped rather than smooth',
  'flipping over on its own axis and settling past true, the way a split flap turns',
  'arriving in two passes that come into register, the second ink offset and closing on the first',
  'drawing itself, the way a leader line extends to the part it names and stops there',
  'typing, a character at a time, with something still blinking on the last one',
  'being cancelled: one mark landing across it, once, and staying',
  'scanning: a single bar crossing it and leaving what it passed lit',
  'winding: one part turning at its own rate while everything around it holds still',
]

/** parts says whether this errand has several things arriving in order, which is the only case
    where a stagger is the point rather than an invention to satisfy a check */
const ERRANDS: { does: string; parts: boolean }[] = [
  { does: 'to reveal it, as though this is the first moment it exists', parts: true },
  { does: 'to walk the eye through it in the order it should be read', parts: true },
  { does: 'to settle it, as though it arrived a moment ago and is still coming to rest', parts: true },
  { does: 'to single out the one part that matters most and leave everything else still', parts: false },
  { does: 'to keep it alive: nothing arrives and nothing leaves, it simply is not dead', parts: false },
  { does: 'to show one value changing: the old one leaving and the new one taking its place', parts: false },
  { does: 'to answer a press, the way a real control acknowledges being used and then stops', parts: false },
  { does: 'to mark it as the current one among several of its kind', parts: false },
]

export function dealErrands(n: number): { does: string; parts: boolean }[] {
  const deck = [...ERRANDS]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return Array.from({ length: n }, (_, i) => deck[i % deck.length])
}

export function dealMotions(n: number): string[] {
  const deck = [...MOTIONS]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return Array.from({ length: n }, (_, i) => deck[i % deck.length])
}

/**
 * The same drawing, moving, which is a different instruction rather than an extra one.
 *
 * Appended to the mark prompt rather than replacing it, because everything above still holds: the
 * thing has to be drawn before there is anything to move, and a page that animates a hollow box is
 * worse than a still one. What this adds is the part a video model cannot do, which is move the
 * exact drawing in the exact palette with no artefact and a source somebody can edit afterwards.
 *
 * The parts, not the whole. A wrapper can slide a finished picture around and that is a transition;
 * moving what the picture is made of is the thing worth having, and it is only available to whoever
 * wrote the markup, which on this path is the same call. That is the entire argument for asking for
 * the drawing and the movement together rather than animating a mark afterwards.
 */
export const MOTION = `Then move it, and move the parts rather than the whole.

Sliding or fading the finished picture is a transition, and a transition is what everything already does. What is worth having is the drawing assembling itself the way the object it came from actually behaves: rows turning one after another, a line extending to the label it points at, a second ink closing onto the first, a needle sweeping while the dial holds still.

Write it as CSS keyframes on the elements inside your drawing. Stagger them with animation-delay rather than animating a parent, because things that happen at slightly different times read as mechanism and things that happen at once read as a slideshow.

Take the timing from the object and not from a default. A press is stepped, so use steps() and let it jerk. A flap overshoots and settles. A pen draws at a constant rate and stops dead. An ink lands once. Nothing here should ease-in-out over 300ms, which is the house style of every generated interface.

Loop it, and make the loop close. It will be watched over and over with no beginning, so the last frame has to hand back to the first without a jump, and no moment in it should be blank: a viewer arriving mid loop must find the thing already there and already legible.

Keep the whole cycle between two and five seconds, and let something rest. Movement everywhere at once is noise, and one part moving against a still ground is what reads as designed.`

/**
 * Moving something somebody else already built, which is the job an agent actually has.
 *
 * The mark path draws and moves in one call because it owns the markup. This one owns nothing: the
 * component exists, it is in somebody's repository, and it works. So the reply is stylesheet only.
 * Markup that comes back rewritten is markup somebody has to review, and a tool that hands an agent
 * a modified component has asked for more trust than it needs: keyframes appended to a file cannot
 * break a render, and they can be deleted in one line.
 *
 * It is handed the markup all the same, because the whole value is in animating the parts. A
 * selector can only stagger rows that it can name, and the class names are in the component rather
 * than in any convention this repository could assume.
 */
export const MOTION_SYSTEM = `You are given a component somebody has already built, and you are writing the motion for it. Nothing else.

Return JSON shaped as {"note": "...", "css": "..."}.

- note: one short line naming the movement, the way you would name a piece of choreography.
- scope: one data attribute name for the caller to put on the component's outermost element, like "data-motion-flap". Invent it from what the movement is.
- css: keyframes and animation rules only, scoped to that attribute.

Never return markup. The component is not yours and it works: your stylesheet is appended after theirs, so it may add animation, transform, opacity, clip-path and filter, and it may not change layout, colour, type or spacing. Anything that moves the component to a different place on the page when the animation is not running is a bug rather than a design.

Every selector starts from the scope attribute and then reaches the parts by structure: [data-motion-flap] > div > article:nth-child(2), or [data-motion-flap] h3, or [data-motion-flap] article > span. Never chain the component's own classes. Markup written in utility classes will offer you a stack like .flex .w-72 .flex-col .gap-3 .rounded-lg run together, and a selector built from that is pinned to every spacing and width decision in the file: it matches today and stops matching, silently, the first time somebody changes gap-3 to gap-4. Child combinators, element names, nth-child and roles survive that. Utility stacks do not.

Move the parts, not the whole. Sliding or fading the finished component is a transition, and a transition is what every interface already does. What is worth having is the parts behaving separately: rows arriving one after another, a rule drawing itself across, a figure counting up, a status settling into place.

An entrance is only one of the things motion is for, and it is the one everybody reaches for first. The brief names the errand, and the errand decides what kind of movement this is: revealing something is an entrance, but singling out one part means everything else is already there and holds still, keeping something alive means nothing arrives or leaves at all, showing a value change means the old one goes and the new one takes its place, and answering a press means one short movement and then nothing. If the errand is not an entrance, do not write an entrance. A component that has already arrived does not arrive again.

When several parts are arriving, stagger them with animation-delay, or with the delay in the animation shorthand. Things that happen at slightly different times read as mechanism; things that happen at once read as a slideshow, and that is the difference between motion somebody notices and motion somebody ignores. When the errand is about one thing rather than many, there is nothing to stagger and inventing a second delay to look busy is worse than one movement done well.

Take the timing from the object rather than from a default. A press is stepped, so use steps() and let it jerk. A flap overshoots and settles. A pen draws at a constant rate and stops dead. Nothing here should ease-in-out over 300ms, which is the house style of every generated interface.

Animate transform and opacity and nothing else. Those two are the only properties the compositor can carry on its own; width, height, top, left, margin and padding all make the browser lay the whole page out again on every frame, which is where dropped frames come from on anything the size of a dashboard. Every effect worth having has a transform spelling that looks identical: a bar that fills is scaleX from a transform-origin, a thing that grows is scale, a thing that arrives is translate. Set transform-origin deliberately whenever you rotate or scale, because the default centre is rarely where the movement is actually hinged.

Numbers, because this is where polish lives and defaults are what make motion look generated:

- One part moves for 240ms to 520ms. Under 150ms reads as a glitch, over 700ms reads as slow.
- Consecutive parts start 40ms to 90ms apart. That is the interval that reads as one mechanism rather than as a queue; 200ms apart is a slideshow, 10ms apart is a single blur.
- The whole thing is over inside 1.4s, however many parts there are. If eight parts at 70ms would run past that, overlap them harder rather than making the reader wait.
- Easing is asymmetric and named as a curve: cubic-bezier(.16,1,.3,1) for something arriving and settling, cubic-bezier(.4,0,1,1) for something leaving, steps(n,end) for anything mechanical. Never ease, ease-in-out, or linear on a movement, which are the three defaults every generated interface already wears.

Respect a reader who does not want it: put everything inside @media (prefers-reduced-motion: no-preference) so the component is untouched for anybody who has asked for stillness.

If it loops, close the loop, and let no frame be blank: this will be watched from the middle, so the component must be legible at every instant including the first one somebody sees.

Respond with the JSON object alone, because the reply is parsed directly.`

/**
 * Correcting a world, which is not the same job as designing one.
 *
 * The design prompt is long because it is deciding what a thing is. This one is handed a
 * finished object and told exactly what is wrong with it, so it is short, and it is told twice
 * to change nothing else: a repair that redesigns is a second opinion, and the wall already has
 * eight of those.
 */