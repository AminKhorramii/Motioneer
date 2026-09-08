# Flows

Every path through Motioneer, from first run to a shipped file, with the code that carries it.
Written so someone who has never opened the app can follow what happens and where to change it.

The one act is compare and choose. Every flow below exists to serve that, so anything that does not
help you pick between motions is either absent or one keystroke away.

---

## 1. The studio

Motion for a component that already exists, several at once, compared side by side.

```
npx motioneer                                  opens on the components it ships with
npx motioneer localhost:3000                   your app, proxied so its dom can be read
npx motioneer ~/app/src/ui --css ~/app/globals.css
```

### Pointing it somewhere

The sidebar begins with an address bar. Type `localhost:3000` or `stripe.com`, press return, and that
page is proxied and pickable; the five most recent addresses stay in the rail with their own favicons
and survive a restart, because retyping the same host every morning is a tax a tool should not charge.
A bare host gets `https` unless it is this machine, since everything else redirects to it and the
redirect used to walk the browser out of the proxy.

Proxying rather than linking is the whole trick. An iframe on another port is another origin and its
dom is closed, so the dev server is served through the studio's own origin: routes under `/__motioneer` so
an app with its own `/api` cannot collide, everything else forwarded, the websocket upgrade passed
through so hot reload survives, and stylesheets named by absolute url pulled back onto this origin so
they can be read. Two sites defend themselves and are handled rather than hidden: one that navigates
its own frame back to its canonical host is reloaded with scripts refused, since the picker wants the
rendered dom and not their javascript, and one behind a bot check is reported as unreachable because a
proxy cannot pass one.

Reading a component out of a `.tsx` is a brace counter and a hope. A rendered dom is the answer, which
is why pointing at something running beats pointing at a file.

### Picking from a page that cannot be proxied

Proxying puts somebody's application on the studio's origin, which is the whole trick and is also
something the application notices. One that signs in against its own api on another host is making a
cross origin request the moment it runs here: that api allows its own site and not localhost, so the
call is refused, the app never authenticates, and it sits on its loading shell. Measured on a real
one, three hundred and eighty nodes and nothing to read. Nothing can be fixed from this side, since
the session belongs to a domain the studio is not.

So the picker goes to the page instead. It is the same picker, kept in a bookmark, and where a
capture goes is the only thing that changes: framed by the studio it posts to the parent as it always
has, and run on the page itself it copies to the clipboard. That is the one road out a content
security policy does not govern, and a site strict enough to need this sends `connect-src 'self'` and
`script-src 'self'`, which forbids both fetching the studio and loading the picker from it. The whole
picker travels in the url for that reason: twenty kilobytes of bookmark is inelegant and is the only
shape that works.

Everything picked in a visit is copied together, so four elements are four clicks and one paste. The
studio takes a paste anywhere rather than into a field, because there is nothing to focus and asking
for a click first is a step that exists only to make the code simpler. Anything else on the clipboard
is left alone.

None of it needs the page to still be open, which is the property that makes this work at all: a
capture already carries the markup, the rules that matched it and a snapshot of how it looked.

### What a pick captures

Two captures, for two readers. The model gets the markup and the rules that actually matched it, so a
selector written against real class names still means something after somebody edits the component.
The preview gets a snapshot: a clone with every computed value written onto it, which needs no
collected rules and cannot be let down by one that was missed. Measured across four sites, a heading
that laid out at 31 percent of its height came back at 100, a button at 57 came back at 100, and
nothing got worse.

A typeface is the exception the snapshot cannot cover, and it takes two fixes because it goes wrong in
two places. A snapshot writes what the browser computed, and what it computed is the name `Inter`; the
`@font-face` rule that turns that name into a typeface names no selector, so nothing inline can carry
it and dropping the sheet drops it. The preview therefore keeps the face rules on their own and drops
the rest, which is safe for the same reason it is necessary: a face rule styles nothing by itself and
is only reachable through a name something else already asked for. The other half is which faces get
captured at all. A page of this era ships every weight of every typeface it might use, and on a real
app that is thirty-nine rules and eight kilobytes against the fifteen hundred characters the picker
allowed the page-level rules — so the survivors were whichever sheet parsed first, and since families
are cut into unicode ranges those seven could be the cyrillic of a typeface whose latin never came.
The faces now get a budget of their own and are filtered to the families the element actually asks
for, read off the computed style of its tree and its pseudo elements, since an icon font sits on a
`::before` and is the case where a missing face reads as a letter where a glyph should be. A filter
that matches nothing keeps everything, because it must never be the reason a capture has no typeface.

The picker stays armed until Escape, since a rail is built from several picks and disarming after each
one made the second click look broken. Each pick reports its own size and node count, and says when it
is a poor subject: a strip too thin to stagger, an element with nothing inside it, an svg cut short,
or most of the page rather than a component.

### Asking

`dealMotions` and `dealErrands` deal each option a different manner and a different job, which is
forty eight combinations from sixteen lines and the reason five options disagree rather than being
five takes on a fade. The errand matters as much as the verb: revealing something is an entrance, but
singling one part out means the rest holds still, and keeping something alive means nothing arrives at
all. Errands that are about one thing say so, and the stagger requirement is lifted for them.

### What judges it

Six gates read the sheet and a seventh renders it.

- `safeStyle` bounds what a sheet may contain at all.
- `unmoved` rejects a transition wearing a costume: no keyframes, or no stagger where the errand
  implies parts arriving.
- `brittle` rejects selectors pinned to utility classes, which stop matching the first time somebody
  changes a spacing.
- `janky` rejects keyframes that animate layout properties, because every one of them has a transform
  spelling that looks identical and costs nothing.
- `unstill` requires a reduced motion query.
- `leaks` rejects a selector that does not start from the scope attribute, because `.card {}` looks
  right in a preview where the only card on screen is the one being previewed and then animates every
  card in the host application.
- The seventh renders the option twice, once held past the end of its motion and once without the
  motion at all, and compares every element's box and opacity. A sheet can satisfy every reading of
  the text and still leave the component twelve pixels down for good, or invisible, or animating
  nothing whatever. Both of those were built and confirmed to pass all six before this was written.

The seventh was wrong twice, and both were found by asking a real model for a shine and watching three
of four good sheets get refused. It counted the animations after seeking them to the end, and an
animation with no fill is removed from the timeline the moment it finishes, so what came back was zero
and the sheet was reported as reaching for parts the markup does not have. That is a false refusal
aimed squarely at correct work: a sweep is short, and the sheets that avoid `fill` are the careful
ones. Every animation is now held at its first frame from the moment the page exists, so counting them
asks about the sheet rather than racing it. Asked again on the same component with the same words,
four of four were kept. The refusal still fires on a sheet whose selectors really do reach for
nothing, which was checked in the same sitting rather than assumed.

The other was the wording. `off` is the largest difference in x, y, width or height across every
element, and the refusal said "sits Npx from where it started" whichever of the four had changed, so a
component ending in the right place at the wrong size was described as displaced. It also named one
cause, a keyframe ending on a transform, when there are two: a sheet that adds `overflow` or
`position` or `display` to make its technique work moves the resting layout without any keyframe being
involved. Both are permanent and they need different fixes, so it says which one it measured and
offers both causes. A refusal nobody can act on is a refusal that gets asked again identically.

`namespaced` fixes rather than complains: every keyframe is renamed to carry the scope, because
`@keyframes` is one flat namespace shared by every stylesheet on a page and a sheet defining `rise`
replaces whatever the host already called `rise`.

Everything here was calibrated against real output before it was enforced. Over 23 options every one
already respected reduced motion, so requiring it costs nothing; only 70 percent landed inside the
timings the prompt asks for and the tail was the errands that are supposed to be slow, so `tempo`
reports and does not enforce. Unscoped selectors turned up about once in thirty, which is what makes
them safe to reject.

### Choosing

Legality has a floor and no ceiling, so the rendered pass also measures three things it does not
reject on: how much of the component takes part, how far anything strays outside its own box, and how
much is invisible at the very first frame. Options are ordered by the last two, because a component
that cannot be seen when you first look at it is worse than one that can. How much takes part is shown
and deliberately not scored, since an emphasis motion stirs three percent and an entrance stirs ninety
and neither is better.

The last card in the row is a field rather than an answer. The decks exist so nobody has to know what
they want, and until this there was nothing to do with knowing: somebody who could say the rows deal
in from the left, the top one first, could only shoot another five and keep whichever landed nearest,
which is a slow way of being ignored. What is typed goes through the same gates as a dealt motion,
deliberately, because a movement asked for by name is not a reason to accept one that never comes
back to rest. Measured on a real list, that sentence came back in six seconds as a 400ms rise with
the rows seventy milliseconds apart, and asking for one that slides away and stays gone came back
turned down, saying it would sit 512px from where it started, permanently. The reason lands under the
field and the sentence stays in it, since a near miss is the thing worth editing. Nothing is written
under the field until there is something to say: a standing note on an empty field is read once and
skipped afterwards, and that is the line a refusal has to arrive on.

Each card also carries a pen, which is the other half of that and a different question. The field at
the end of the row asks for a motion; the pen asks for a change to one that already works, so the
sheet goes into the brief and the model is told to keep it recognisably the same and to leave alone
what was not mentioned. It keeps the scope it was given, the way a refinement does, because a change
is a version of a motion rather than a new one wearing its name. Measured on a real list, changing a
400ms fade of the whole thing so that it is slower and the rows come in from the right came back as
520ms per row, seventy apart, translating 28px, on the same scope.

Three decisions in that, and they are all about not losing your place. The field opens inside the
card rather than in a panel, because what you are changing is playing six inches above it and a
dialog over the top would make you describe it from memory. The change makes a card instead of
overwriting one, which the tune panel had already decided for itself: a motion you cannot get back is
a motion nobody edits twice. And the new card goes in next to the one it came from rather than at the
end of the row, since the difference between a sentence that worked and one that did not is only
visible when the two are adjacent. Escape closes the field, because opening it agreed to nothing.

Two of those measurements were wrong before they were right, and calibration caught both. Bounding box
displacement reported that fifteen of twenty one motions barely moved, including rows typing onto a
page, because a clip-path reveal and a scaleX move no box. And sampling only real elements reported
that nothing took part in a border tracing its own outline, because that is a pseudo element.

`Open` fills the room with one option, since a card three hundred pixels wide is a thumbnail of a
decision rather than the decision. `More like this` keeps the one that nearly worked and varies how it
is carried out. The inspector adjusts a chosen option without asking again: slower, further apart,
landing harder are all arithmetic on numbers already in the sheet, so `retimed` rewrites them and the
original stays beside it.

### Several elements, and the camera

Picks accumulate into a rail: one motion each, played on one timeline. The sequencing costs nothing
because the transport already exists, so each element is held at `t` minus its own offset rather than
having its delays rewritten.

A rail is a composition, and it was being shown as a stack of boxes with the order encoded in an
invisible constant: every car started 420ms after the one above it, and nothing said so or let you
change it. The one thing a rail is for, deciding what happens when, was the one thing you could not
see or touch. So the sequence is drawn under it, a bar per car placed where it starts and as long as
it runs, and dragging a bar moves that car in time. The frame reloads when the drag ends rather than
on every pixel, and the scrubber resizes to whatever the new arrangement needs. A rail can be exported
too, which it could not before.

The camera is nine shots on that same clock, in pairs so the opposite of a choice is also a choice:
flat on and locked, push in and pull out, pan and crane, orbit, drift and sway, with a lens dial that
moves the defocus, the bloom and the vignette together. It used to be one twelve second move set to
infinite, and infinite was the fault: an animation with no end has an endTime of Infinity, the
transport filters that when sizing the scrubber, and dragging it end to end played an eighth of the
move. Every move is finite now and the ruler sizes itself to whichever runs longer.

Flat on is the one that was missing, and it was missing for years of shots. Every move here is built
out of a rotation, so every film Motioneer could make was of software seen at an angle. That is the right
look for a component on a landing page and the wrong one for a demo of a tool: type on a plane turned
eleven degrees is type somebody leans in to read, and a film of a pipeline board whose column
headings are illegible is not a demo of anything. It is also the only shot whose plate fits the frame
rather than overflowing it. The others scale past the edges deliberately, because that overflow is
most of what separates a camera from a screenshot, but doing it to the one shot chosen for legibility
would crop the thing it was chosen to show.

A shot is picked from a grid of chips that each perform a miniature of themselves. It was a list of
five words in the settings menu, which is the one place the choice is hardest to imagine: a camera
move is a motion, and reading the word drift tells you less than two seconds of watching one does.

The shot belongs to the thing being shot. It was one value for the whole room, which is wrong in both
directions: choosing an orbit for one element and then picking another gave the second an orbit
nobody had asked it for, and it followed you between sites. In the chooser it was worse than untidy,
because every car already carries its own shot, chosen from this same grid in the inspector, and the
previews were drawn with the global one instead, so the cards you were choosing between were not
showing the camera that car is set to. A car keeps it on the car, a pick on the pick, and a component
on the left in a lookup, since a file is browsed rather than picked and has no object of its own to
hang one on. The grid reads and writes whichever of those is current.

It is redrawn on the way open rather than from `render`, and that is a constraint rather than a
preference: there is a top level `render()` call above the line `CAMS` is declared on, so a render
that redrew the grid would be reading a const before its line and would take the whole page script
down with it. Opening is enough, because every click shuts the panels, so the element cannot change
underneath an open menu.

Each row also carries its own camera. A camera is a perspective, a moving plate and two blurred
copies of the subject, and every one of those is per subject, so one shared rig could only ever film
the whole rail as a single flat picture. Each car with a shot gets its own rig, which is what lets one
sit locked off while the one below it pushes in.

A rail says which stretch of itself is worth watching. Two handles on the strip mark where the film
starts and stops, snapping to the same targets the bars do, so an in point lands exactly on the beat a
component arrives rather than four pixels before it. This exists because the ruler stopped being
capped at twenty seconds: a minute of composing is rarely a minute worth watching, and the thirty
seconds that matter are somewhere inside it. Nothing is drawn until something is cut, since a control
for a decision nobody has made is noise on every rail, and the shading falls on what is left out so
the part about to be filmed is the part that looks like itself.

The handles are the fine control and they are the wrong place to discover the feature: they are
almost invisible until they have been used once, so trimming was something you had to already know
about. What somebody actually does is scrub to the moment they mean and then look for a way to say
start here, so that is offered in the film panel where the rest of the film is decided, and the panel
names the instant it would use rather than making anybody guess where the playhead ended up. The way
back appears only once there is something to go back from.

The way back on the strip sits in the foot beside fit rather than on the band. Double clicking the band was the
first answer and it is the wrong one: a band that takes clicks has to take them across everything it
shades, and what is under there is the rows you are still composing with. The cut is held on the
arrangement next to the offsets and the markers, so forking a rail carries it, and a rail cut back to
its full length forgets it was ever cut rather than storing a range that happens to match.

Verified by decoding both: the first frame of a film cut to start at four seconds is the same picture
as the whole film at four seconds, two pixels of grain apart, and 12455 pixels away from the whole
film's own first frame.

Each row carries an eye. A rail is a set of decisions about several elements at once, and the way to
find out whether one of them is earning its place is to watch the thing without it. Removing the car
answers that question and charges the arrangement for it: the motion, the offset, the camera and
everything else chosen for that element, with undo the only way back. Left out, the row stays exactly
where it is with its timing intact and comes back on the same click. A car nobody is going to see
also stops holding the film open, so hiding the last one on the rail ends the composition where the
last visible one does.

It travels to the frame as one entry per car rather than by dropping the car from the list, and that
is not tidiness. `data-rail` is what a click on the stage maps back to a row, so filtering a hidden
car out would move every index after it: the same conflation that once handed every car its
neighbour's timing on the way out to an export.

A fourth puts one motion on the rest of them. A film is often the same movement on many things at
different times, and every one of those was its own model call: eight elements meant eight asks and
eight sets of five to choose between, when what somebody wanted to say was that one, on these too.
Nothing has to be generated for it, because the sheet already exists.

It cannot simply hand a car the source's motion id. An id names a sheet and the element it was
written for together, so railview would look it up and draw the source's markup twice; what is minted
instead is each target's own capture wearing the source's sheet. The scope travels with it, which is
safe because railview already gives every car its own tag and rewrites the sheet into it, so two cars
sharing a scope was always the ordinary case rather than a collision. Measured on three elements with
three different motions: after one press all three run the same keyframes, and held at 700ms they sit
at three different points in it, which is the whole shape of a launch film in one gesture.

The sheet was written against the source's markup, so on an element built differently some of it will
match nothing. That is worth allowing rather than preventing: it costs a click to find out, the row
says what it is playing, and what it had is still in its own list to cycle back to. Applying is a
bulk assignment and not a live link, for the reason the tune panel and the pen already give: every
edit here is local, and a change that silently moved seven other rows would be coupling with nothing
on screen to show it.

Three operations act on a set of rows rather than on one bar: cascade, spread and reverse. A launch
film is eight things arriving a beat apart and later leaving in the other order, and composed by hand
that is eight drags against a ruler, with the tell being that the gaps are never quite equal. Cascade
puts ninety milliseconds between them in row order, starting where the earliest already is, because a
gap much wider stops reading as one gesture and starts reading as separate events; it is a starting
point rather than a verdict, since the bars are still draggable afterwards. Spread divides the span
they already cover, moving what is between the ends. Reverse hands the same instants out the other
way up. Each is one operation on the arrangement, so each is one step of undo instead of a run of
nudges, and each goes through `moved` so a car pinned to another keeps its link and has its gap
adjusted rather than quietly coming loose.

They appear with the selection and are shown by `paintSel` rather than written into the strip, for
the reason that function already exists: a selection deliberately does not rebuild the timeline,
because reloading the rail frame to light up a row would restart every motion on it.

Rows carry a grip and can be dragged into a different order. Order and offset are different
decisions, so reordering swaps places in the rail and leaves each car's own offset alone: two cars can
begin together and still need one above the other.

### An arrangement is a value

`cars` was a global that five handlers edited in place, and the timeline drew from a filtered copy of
it that shared its objects, so dragging a bar reached through a view and changed state nothing owned.
It also wrote positions in the filtered list into the markup and read them back as indices into the
real one, which agree exactly until a pick fails to move. An arrangement is a value now, in
`shared/arrange.mjs`, and every edit returns a new one: rows carry the index of the car they draw, and
undo stops copying, because the arrangement an edit replaced already is the snapshot. The motions
cars point at are frozen, which turns "nothing writes through a shared record" from an agreement
between call sites into a throw at the moment one breaks it.

That module is served to the page the way `raster.mjs` and `mp4.mjs` already are rather than written
into the template literal, so the arithmetic has one definition and node can check it without a
browser. It is served from beside the file rather than from the working directory, which is what the
other two were doing: they existed only when the studio was started from the repository root, so the
agent tool's studio could not load its own encoder.

### The timeline

Rows can be selected, shift for a range and the platform modifier to toggle, and dragging any
selected bar moves all of them, clamped as a group so the earliest meets zero with the shape intact
rather than the set piling up on the start. Bars snap to zero, to the playhead, to their neighbours'
edges, to markers and to a coarse grid, with alt to defeat it, read live so a magnet can be escaped
and then let go of to land clean. The threshold is seven pixels converted to milliseconds at the
ruler being dragged on, because a fixed millisecond figure is twenty two pixels of magnet on a short
rail and under two on a long one.

There was no playhead. The element was drawn and never written to while the comment above it claimed
it was the scrubber. It and the ruler now measure a real track instead of repeating a hand matched
270px that four column widths had to keep agreeing with. The drawn ruler is sticky and `fit` resets
it: sizing it to its contents meant the scale moved under the hand, and since the grid is chosen from
that scale, five presses of the same key moved a selection 100, 100, 250, 250 and 250ms.

Arrows nudge, cmd-A takes the rail, backspace removes and cmd-D duplicates. A held arrow repeats
thirty times a second, so a run collapses into one undo step.

### Choosing, which is what a rail was missing

`options` was asked for two motions per car, judged both, stored both, and handed back one. That made
the rail the single place in a tool about comparison where you could not compare, and it cost a field
on the response rather than a model call to fix. A row says which motion it is playing and how many
it has, lists them on hover, and cycles; the offset is left alone when it does, because swapping
alternatives is choosing a different performance of the same beat. `More like this` works per car
through the refine path, and the variations join that car's set rather than replacing what it plays.

The count stays at two. The command line provider allows eight sessions at once, so eight cars at two
goes each is already two waves rather than the one the code claimed, and a third would make it three.

### Cars tied to other cars

A car can follow another rather than the clock: drag from the end of its bar onto the row it should
follow, alt to start them together, drop it anywhere else to cut it loose. A ring is refused as it is
made and says which link already points the other way; the solver survives one either way, falling
back to the absolute offset every car still keeps, but a rail that quietly ignores what you asked is
worse than one that says no.

Two silent faults came out of building it. Dragging a tied bar wrote its absolute offset, which is
not what puts it anywhere, so the bar sprang back and the arrangement had changed underneath; a tie
is retimed by its gap now. And links were keyed by motion id, when a car's motion is the one thing
about it that changes: cycling onto an alternative renamed the car and cut loose everything following
it, which fell back to offsets it had been ignoring. The rail kept playing, at the wrong times,
having dropped a decision without a word. Cars have a key of their own now.

### Comparing arrangements

Fork what you have, change one thing, watch both at the same instant, keep one. This is the wall
applied to time rather than to layout. The transport needed nothing: `hold` already posts to every
visible frame with its index, which is how a grid of five options has always been driven.

Measured before the layout was settled. A rail of five cars is 30 animations a frame and 95 with a
camera on every one, because a rig clones its subject twice. One frame costs a median 8.3ms and a p95
of 8.4; two or three cost the same median and a p95 of 16.7, one dropped frame in twenty. The cost
arrives at the second frame rather than the third, so three is affordable and three is the cap. Film
refuses while several are on screen rather than filming whichever is on the left, which is the trap a
grid of five options already had.

Markers are dropped by double clicking a track and taken away by clicking them, and bars snap onto
them. The strip says what the composition does with its time: how many cars, when the last lands, and
where it goes quiet. That reports and does not judge, because whether a two second hole is a fault
depends on what the thing is for.

### Where each component sits

A rail opened as a stack of equal rows in the order the picks happened, which is not what any of
these compositions looks like: a header sits above a row of cards and a chart sits beside them. Every
component can be dragged to where it belongs and sized by the handle on its edge, and anything nobody
has touched keeps sharing what is left, so the stack is what it opens on and the stage is what a hand
makes. Places are kept in per cent, so an arrangement survives the frame being resized and a film at
1080 square shows what was arranged in whatever the window was. Where and when stay separate
decisions, the way order and offset already were.

The frame reports and does not decide. It is rebuilt from the arrangement on every change, so a
placement it kept to itself would be lost on the next render and would disagree with undo until then.

Each row also wears a picture of its element. The selection has drawn a thumbnail of every pick since
the picker existed and the rail never used one, so a row read `div.something` when it could show the
thing. Naming was its own fault: the label was cut at the first dot, and nearly everything on a page
is a `div`, so two picks read identically and the row was named after its motion rather than after
what the motion moves.

### Restarting under an open page

`npm run studio` watches its own sources, so an edit bounces the process in about half a second while
the tab carries on with the javascript it loaded. A dynamic import is cached for the life of a
document, so a change to `arrange.mjs` or `raster.mjs` is not in that tab at all and the studio and
the page it served disagree with nothing saying so. That is how a fix can land, be checked, and still
not be what somebody is looking at, which is the stale process warning one process along.

The page reloads when the boot answering it changes, which is only bearable because the work is left
with the server first: the picks, the arrangement, every offset, link and placement come back with
it. The options survived a restart and the composition did not, which was the wrong way round. The
blob is opaque on the server, because the page is the only thing that knows what an arrangement
means, and it is revived rather than trusted on the way back, since everything here leans on the
motions being frozen and json carries values and not that promise.

### From a rail to an editor

A car was an element with exactly one motion welded to it. The bar's position was when that motion
started and the bar's length was the motion's own span, which nothing could change. That is a
comparison instrument that grew a timeline, and it cannot say the thing a product demo is made of:
this element appears here, does something there, moves aside, and leaves.

Four changes turn it into one, and each is separately useful.

**A component has a life.** When it comes on and when it goes, drawn behind its motion on the same
row and draggable at either end. Both defaults are derived rather than stored: it arrives when its
motion starts, because that is what putting the motion there meant, and it stays unless told
otherwise. Writing either into every car at birth would freeze a decision nobody made and go stale
the moment the motion moved. This is also what made a rail look like nothing was happening, since
every car was in the document from the first frame and a light component showed its own white box
for the whole composition while only its contents staggered in.

**A bar can be trimmed.** Dragging its end retimes the motion through the same `retimed` the
inspector uses, so the idea is kept and only the clock changes, and the gates still run on the
result. A retime replaces the retime before it rather than being appended, or a row's alternatives
become a record of every drag instead of the set of real choices they exist to be.

**A component can be sent somewhere.** Alt drag it on the stage and it travels there, arriving at
wherever the clock is. Where it sits and where it goes are different decisions, so a plain drag still
places it. Each journey renders as one keyframe track spanning the whole composition rather than one
animation per leg, because several animations on one element fight: a later one held before its own
start still applies its first frame and overrides whatever the leg before it finished at, so a
component that moved twice would snap back in between. The track's delay is minus the car's own
offset, which is what puts a journey written in composition time back onto the car's own clock.

**The stage is part of the editor.** Clicking a component selects its row and the row lights the
component, because a selection that is only true in one of the two places somebody is looking is not
a selection. And the playhead can be put where you want it by clicking the strip, since an editor's
whole interaction is to put the clock where something should happen and then do the thing. That
needed a life to become a backdrop rather than a target: a car that never leaves has one the width
of the whole track, and while it was clickable there was nowhere left to put the playhead.

**And the camera is one of those journeys applied to everything at once.** Alt drag the stage itself
rather than a component and the whole picture travels, which is the same gesture one level up. The
four presets and the rig per car stay, because a rig per car is what lets one component sit still
while the one below it pushes in, and that is a different question from where the whole picture
goes. One reader and one track builder serve both, so a camera cannot drift away from a journey in
how it composes or how it is filmed.

Still to do here: a bezier editor, since four easing presets is a ceiling on taste.

### Handing it over

`Export` writes one html file with every option in it, the transport included, no requests at all.
The options share a document rather than sitting in iframes, which they can only do because each sheet
is already scoped: option two gets `data-motion-fold-2` and its selectors are rewritten to match.

Two different artifacts come out of that one button and they were being written as one. Several
motions for a single component is a comparison, so it is a grid of captioned cards held at the same
instant, which is the whole point of looking at them together. A rail is a composition, so it is one
stage with the cars in the order they were arranged and each held at `t` minus its own offset. Until
this was split, a rail exported as the first of those: every component starting together, in a stack,
with the sequencing gone. Nothing in the file looked wrong, because every id was there and every
sheet was correct, and the one decision a rail records was simply not written down. The offsets now
travel with the ids, and the exported transport finds which car an animation belongs to the same way
the rail frame does, by walking up to the nearest `data-rail`.

Three things had to be added to that one at a time, and the order is the lesson. The offsets went
first. Then the placement, once components could be put where they belong, because sending the ids
and the offsets alone lost the layout exactly the way sending the ids alone had lost the timing. Then
the cameras, which arrived locked off. Every time the file looked complete: every id present, every
sheet correct, one decision quietly not written down. The status line now names what actually
travelled rather than saying the file was written and leaving you to find out.

`railView` had the same fault a step further in. It drops ids the store has evicted and then read the
offsets and cameras at the position each car ended up in rather than the one it was asked for, so a
single missing option handed every car after it its neighbour's timing.

`Film` renders whatever is on screen frame by frame, the rail with its offsets and cameras included,
and plays the result in a panel with somewhere to take it away, because a path printed in a status
line is a thing you then have to go and find.

That sentence was false for as long as it had been written. The transport holds each car at `t` minus
its own offset, which is an operation on live animations, and filming does not watch a document, it
copies one: a copy carries declarations and not clocks, so `holdAt` writes the instant into each
element's own `animation-delay`. It wrote one instant into all of them, so a filmed rail came out with
every car starting together, the same loss the export had and for the same underlying reason. A
document with more than one clock in it now says so in the markup, `data-motioneer-at` on each car, and
`holdAt` reads the nearest one rather than assuming there is only the document's. A car whose turn has
not come sits at a negative instant, which is what leaves it holding its first frame instead of being
dragged forward to it. Stepped rather than recorded: a recording hopes the machine keeps up and
produces a different file every run, while setting the clock by hand produces the same film every
time. Measured on a real option, 48 frames at 1280 by 720 in under a second.

The typefaces are declared once for a rail rather than once for every car in it. A face rule is not
scoped to a car the way a selector is, and every car carries its own copy of the sheet it was captured
from, so a rail of thirty picks off one app declared the same three typefaces six hundred and ninety
times. On a page that costs nothing, because a browser fetches each url once however often it is
named; in a frame the bytes are embedded at every mention, so it was 28105kb of a 28805kb frame. The
payload was growing by 962kb a car and is now flat: thirty cars went from 28805kb to 1515kb, a frame
from 653ms to 104ms, and a minute at sixty frames a second from thirty nine minutes to six. The
picture is unchanged, checked pixel by pixel across six cars mid cascade.

The walk happens once for the whole film too. Whether an element animates, what its base delays are,
which clock it sits on and when it is on stage are all questions about the document rather than about
the instant, and holdAt was asking every one of them per frame: every element and both its pseudo
elements, which on thirty components is eighteen hundred computed style reads a frame and six and a
half million across a minute at sixty. Split in two, a plan that walks and a rule builder that is
arithmetic over it, a frame of thirty components went from 104ms to 27ms. holdAt still does both and
behaves exactly as it did; the film path plans once and never touches the document again, because the
copy each frame goes into was taken already and names its elements by attributes that stay put. They
come off with the strip rather than frame by frame, which is what its release is for.

Together with the typefaces those two take a rail of thirty components from 653ms a frame to 27, and
a minute of it at sixty frames a second from thirty nine minutes to a hundred seconds.

A film serializes the document once rather than once a frame. Broken down on a real capture at 1280
by 720, a frame cost 33ms: 5.6ms serializing, 8.9ms in base64, 12.3ms of the browser parsing the
copy, and the rest drawing. The fonts were 937kb of the 966kb frame, and between two instants of the
same film not one of those bytes differs. What differs is the hold sheet, which is a couple of
kilobytes and sits after everything expensive.

So the copy is made once, cut in two at the hold sheet's own text, and the front half is base64
encoded once and kept. Each frame recomputes the rules, encodes the short back half and joins the
two strings. That join is exact rather than approximate: base64 encodes in three byte groups, so a
front half padded to a multiple of three encodes independently of whatever follows it, which is the
only reason this is allowed to be string work at all. A frame went from 31ms to 14ms, and a minute of
film from 56 seconds to 25.

Both halves of that are the kind of shortcut that is either exactly right or quietly wrong, so what
is checked is not that it is faster. Eight instants of a rail with three clocks, a life window, a
camera and pseudo elements were drawn both ways and compared pixel by pixel: zero differ, and the
frames still differ from each other rather than the cache handing back one picture. The guard in the
code is the number of elements holdAt marked, since that walk is instant independent; if it ever
moves, that frame is serialized in full instead of having new rules spliced into a document they no
longer describe.

What decides whether it is that or a minute is the typefaces, and for a while it was the second. The
assets are gathered once for the whole film, because refetching a font ninety times is most of the
wall clock, but the gathering asked the font loader which *families* the page had used and then
carried every face each of those families declared. An app of this era ships every weight it might
use and draws with two, so a capture off a real one carried twenty-three faces where three had ever
been loaded, and since each is a whole woff2 written into every frame as base64 that was 8162kb of an
8190kb frame, for a document of thirty-two nodes. Filming it took 298ms a frame and 21.5 seconds for
2.4 seconds of film. The loader knows which faces it went and got, not just which families, so asking
it that instead leaves 966kb and 35ms a frame: the same picture to the pixel, 0 of 921600 differing,
in an eighth of the time. The key is family, weight and style and deliberately not unicode-range,
because a loaded face reports the normalised `U+0-10FFFF` where the rule that made it left the
descriptor unset, and a key that includes it matches nothing and strips every face in the document.
That failure is a fast film in the fallback typeface, so the narrowing only ever narrows inside a
family that was used at all, and a family whose faces do not line up is carried whole.

The decisions that make a film sit on the button that makes one, and say what they add up to before
it is pressed. They were in the settings menu next to how many options an ask returns, which is a
different question asked at a different moment, and neither a tail nor a cut means anything until it
is read as the seconds it produces. The panel says the whole answer in one line, frames and length
and size and what it is of, and it moves as the controls do. A film now takes long enough that being
surprised by its length afterwards is a real cost rather than a small one.

Progress is shown in proportion rather than as a count. "Drawing frame 412 of 1671" is honest and
unreadable: nobody converts it into a feeling about whether to wait. The Film button fills behind its
own label, which is the thing already being looked at because it is also the way to stop, and the
seconds remaining are computed from the frames already drawn rather than guessed at from the machine.

What a film is shaped like is now asked rather than assumed. The frame rate and the length were
numbers in the script: thirty a second always, and a film that ended the instant the last keyframe
fired. Sixty is offered because a frame stopped being expensive and a push at thirty judders on a
large screen, and a tail is offered because a demo that cuts on the landing gives nobody time to read
what it landed on, and a clip that loops needs somewhere to loop from that is not mid gesture. The
tail is frames rather than time: the same last instant drawn again, so holding longer never changes
the motion, only how long you sit with what it left. 1920 joined the shapes for the same reason
sixty did, and 1280 stays the default because most of these are posted rather than projected.

Filming is also the one thing here long enough to want back, so the button that starts it becomes the
way out of it, and a film that is stopped is not kept. A disabled button reading Film is a button
that looks broken for a minute, and there is only ever one thing to do while a film is drawing.

The reel outlives the tab, which matters more than it sounds because this tab is reloaded constantly:
the page reloads itself whenever a different studio answers it, and the studio watches its own
sources, so a save on any source file used to throw away every film shot that session. An object url
dies with the document that made it, so the bytes go into the browser's own store on this machine.
That keeps what the reel says about nothing being uploaded literally true, lets the browser answer
for the quota rather than leaving video in a folder after the studio is closed, and every call into
it swallows its own failure, because a studio that will not film since it could not remember a film
is worse than one that forgets. Twelve are kept and the oldest go first, url handed back rather than
merely dropped, since dropping the reference is not what frees the bytes.

Three things had to agree before the film was the thing on screen. The camera length was computed
from the motion for the preview and written as a flat 3000ms for the rail and the export, so any
motion longer than about 1.9 seconds was approved with one camera and filmed with another; it is one
number now and it lives in one place, beside the shots. The transport used to keep running for the
whole render, seeking the document between the copies being taken of it: the drawn frame was right
because a hold wins, but it was a document being changed while it was read, and it stops for the
length of a film now and starts again after. And `limits` looked for five things and said nothing
about two more that are just as silent: a transition in flight, which is a clock and cannot be
written into a copy that carries declarations, and a stylesheet the document may not read, whose
rules are absent from the picture rather than wrong in it. It is asked by whether a transition is
running rather than by whether one is declared, because every document written this decade declares
one and a warning that fires on all of them is a warning nobody reads.

It draws in the browser rather than on the machine serving the page. There were two of these and a
setting to choose between them, which was the wrong answer: the headless one rendered exactly what
chromium renders, but it needed playwright and ffmpeg, and playwright is a development dependency
absent from the published package while ffmpeg is something a person may happen to have. On a clean
install it produced no film at all, and a path that is not installed is not more faithful than one
that is. What the browser path cannot draw is specific and short, so `limits()` looks for those five
things in the document being filmed and says so on the film where they are present.

### Getting in

There are two doors and only one of them was open. The package exposed a single command, the agent
side, which speaks JSON-RPC on stdio: run by a person it printed nothing, exited never, and looked
exactly like a program that had hung. Meanwhile every instruction for opening the studio by hand was
`npm run studio`, which needs a checkout, so somebody who installed it from npm could not reach the
room at all. The studio shipped in the package the whole time with no command to start it.

It has one now, and the folder it opens on is resolved against the package rather than against
wherever it was started: that default was a relative path, so installed into somebody's project and
run there it went looking for a folder of that name under their app and threw on the way up. The
examples are published with it, because a first run with an empty sidebar is a worse first run than
one with seven things to animate. A bare address is aimed at rather than looked for as a directory,
since `motioneer localhost:3000` opening an empty room that advises typing an address into the sidebar is
the tool ignoring what was just typed. And the agent command, run by a person, now says what it is
and what they probably wanted instead: a terminal on stdin is the one signal that cannot be faked by
the thing that should be there.

### Proving it

```
node verify/studio-sites.mjs            twenty real sites: reachable, readable, pickable
node verify/studio-capture.mjs --deep   what survives being picked, by kind of element
node verify/studio-capture.mjs --rail   the composition, with no site and no key
```

The rail leg is in the capture suite rather than in one of its own, and it skips the site loop, so it
needs neither the network nor a model. The composition's arithmetic is a pure module, and the export
is checked by seeding the studio's own session store with three motions and then opening the file it
writes: the failure worth catching there is a silent one, since a rail with its offsets dropped still
plays and still looks like a composition somebody chose. That is why it is the one studio leg inside
`verify:all`, which is the command people actually run.

The other two need the network and both are worth the minutes, because every proxy bug so far was
invisible to a fixture. Nineteen of twenty sites work end to end; npm sits behind a bot check. Capture keeps tree
and shape for 67 of 89 elements, and svg is the weakest kind at 5 of 11, which is the next thing to
chase.

It opens on port 4321, and a port already answering steps to the next free one and says so, because
two studios at once is a reasonable pair to want. `PORT=0` still means whatever is free, which the
suites rely on. Kill by port rather than by name when scripting against it.

---

## 2. Development flows

```
npm run studio         # the room, watching its own sources
npm run build          # the headless core the studio imports its gates from
npm run verify:all     # everything that needs no network
```

`npm run build` builds the headless core, since `dist-core/core.js` is what the studio imports its
gates from and a stale one would answer for a detector nobody is running.

### Verifying

In order of how much they prove:

```
npm run verify         # the app in a real browser against a mock model, and the house gate
npm run verify:server  # the real server against a recorded upstream, asserting the visitor holds no key
npm run verify:stream  # the real streaming path, no mock anywhere
npm run verify:hard    # copy that fights back: markup, braces, other scripts, other alphabets
npm run verify:beat    # the thinking beat, and that none of it reaches the reply
npm run verify:cli     # what a failed local session says it failed for
npm run verify:image   # the image pipeline, no browser and no Rust needed
npm run verify:tauri   # the desktop shell's own commands, in Rust, with no window
npm run verify:mcp     # the agent path over the real protocol, brief to spec
npm run verify:oneline # the same path on a machine with nothing installed
npm run verify:update  # what the published tarball carries, and how it is cached
npm run verify:all     # all of them
```

`npm run verify` is the house gate and runs `verify/layout.mjs` inside itself, which renders
every built in world on every look at three widths and fails if Motioneer's own output trips its own
slop catalogue. There is no separate command for it, because a geometry check nobody runs is a
geometry check nobody has. It also opens no browser for its first three sections: the house gate,
the escaping check, and the two node level checks on the taste log, one feeding it a hostile file
and one proving the deal stays wild under a log biased as hard as a log can be.

The two agent suites stand in for the local Claude with `verify/fakebin/claude`, which they put
on PATH along with a do-nothing `open`. Both are in the repository rather than in a temporary
directory, because a fixture a reboot can take away does not fail loudly when it goes: the suite
starts calling the real model instead, which is slow, costs money, and on a machine with no
session fails fast enough that a wall of unwritten drafts reads as a pass.

`verify:image` reads the committed wasm rather than the crate's build output, because that is
what ships, and builds its own input with zlib rather than loading a fixture, because a suite
with a binary to explain is a suite that rots. The input is low frequency colour with grain over
it rather than static: pure noise is the one thing JPEG cannot compress and no model produces, so
a suite built on it would measure the worst case and report it as the normal one.

`verify:stream` runs the app against a local server speaking Anthropic's wire format, so the
reader loop, SSE framing, split frames, fenced JSON, the partial JSON walk and the progressive
repaint are all exercised. It asserts that papers appear while the models are still writing,
that the wall never exceeds nine (which is the one id per stream upsert holding), that the eight
angles produce eight distinct headlines, and that a wall spans distinct worlds and distinct
looks. Eight pages quietly converging is a test failure rather than something noticed months
later.

Copy rules are asserted too: no all caps, no em dashes, no decorative symbols. A regression fails
the suite rather than shipping.

### Capturing a real run

```
MOTIONEER_KEY=$(cat ~/.motioneer-test-key) npm run capture
```

This drives the real app against the real API through a recording proxy and writes every byte of
every stream, with chunk timing, into `fixtures/`. `verify:stream` replays those captures at
their recorded pace, so the streaming path stays covered forever without a key and without
spending tokens. Pace is recorded because a replay that dumps everything at once would prove
nothing about whether papers visibly fill in.

The fixtures hold response bodies only. No request headers are recorded, so no key can end up in
them. Section ids are rewritten on replay to match the incoming request, since the app merges
replies by id, and with no fixtures present the server falls back to a synthetic stream so the
suite runs on a fresh clone.
