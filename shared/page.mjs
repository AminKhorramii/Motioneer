/**
 * The studio page.
 *
 * Lifted out of tools/studio.mjs, which was three and a half thousand lines and half of them this.
 * Two reasons. The house rule asks for files far from a thousand lines and that one was not close.
 * And a worker has to serve this same page while having no filesystem to read a component folder
 * from and no shell to run a command in, so the page had to stop being part of a node program.
 *
 * It takes what it varies by rather than reading it from module scope: an address, whether anything
 * here can write, whether there is a folder of components to offer, and the palettes. Everything
 * else in here is the same wherever it is served from.
 *
 * WATCH THE BACKSLASHES. This is one template literal, so a regex written inside it loses its
 * escapes before a browser ever sees it: /[^\\w-]+/ arrives as /[^w-]+/ and quietly matches almost
 * nothing you meant. That has cost this file seven bugs. Write the character class out in full, or
 * double the backslash, and the guard in studio.mjs will tell you if you forget.
 */
export const page = ({ AIM = '', CAN_WRITE = false, HAS_FOLDER = false, PRESETS = [] } = {}) =>
`<html><head><meta charset="utf-8"><title>motion studio</title><style>
:root{--bg:#08090a;--panel:#0f1011;--raised:#141516;--line:rgba(255,255,255,.07);
  --line2:rgba(255,255,255,.11);--ink:#e6e6e6;--dim:#8a8f98;--faint:#5c6068;--accent:#5e6ad2}
*{box-sizing:border-box}
body{margin:0;height:100vh;display:grid;grid-template-columns:250px 1fr;background:var(--bg);
  color:var(--ink);font:13px/1.5 ui-sans-serif,-apple-system,"Inter",sans-serif}
aside{border-right:1px solid var(--line);background:var(--panel);display:flex;flex-direction:column;min-height:0}
.head{padding:11px 11px 12px;border-bottom:1px solid var(--line);display:grid;gap:7px}
.head span{color:var(--faint);font-size:11px;word-break:break-all;padding:0 3px;line-height:1.5}
.away{color:var(--faint);font-size:10.5px;padding:0 3px;text-decoration:none;line-height:1.5;
  border-bottom:1px solid transparent}
.away:hover{color:var(--dim);border-bottom-color:var(--line2)}
/* an app being refused by its own api is not an error in the address, so it is said in the colour
   of a warning rather than a failure: the aim worked and the app will not run here */
#aimnote[data-state=refused]{color:#c2925f}
#aimnote[data-state=refused] b{color:var(--ink);font-weight:500}
.aim{display:flex;align-items:center;gap:6px;height:30px;padding:0 4px 0 8px;background:var(--bg);
  border:1px solid var(--line2);border-radius:7px;transition:border-color 120ms ease,box-shadow 120ms ease}
.aim:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px rgba(94,106,210,.18)}
.aim img{width:14px;height:14px;border-radius:3px;flex:none;display:none}
.aim img[src]{display:block}
.aim input{flex:1;min-width:0;background:none;border:0;outline:none;color:var(--ink);
  font:inherit;font-size:12.5px;padding:0}
.aim input::placeholder{color:var(--faint)}
.enter{display:grid;place-items:center;width:22px;height:22px;flex:none;background:var(--raised);
  color:var(--dim);border:1px solid var(--line2);border-radius:5px;font-size:12px;cursor:pointer;
  padding:0;line-height:1;transition:color 120ms ease,background 120ms ease}
.enter:hover{color:var(--ink);background:#1a1b1d}
.aim:focus-within .enter{border-color:rgba(94,106,210,.5);color:var(--ink)}
.files{overflow:auto;padding:6px;flex:0 1 auto}.files:empty{padding:0}
#sel{overflow:auto;padding-bottom:10px}
.file{display:block;width:100%;text-align:left;background:none;border:0;color:var(--dim);
  padding:6px 9px;border-radius:5px;font:inherit;font-size:12px;cursor:pointer;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.railhead{margin:10px 9px 4px;font-size:10.5px;letter-spacing:.06em;color:var(--faint)}
.railhead:first-child{margin-top:4px}
.site{display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:none;border:0;
  color:var(--dim);padding:6px 9px;border-radius:5px;font:inherit;cursor:pointer;min-width:0}
.site:hover{background:var(--raised);color:var(--ink)}
.site img{width:13px;height:13px;border-radius:3px;flex:none;opacity:0}
.site img[src]{opacity:1}
.site span{display:grid;min-width:0;gap:1px}
.site b{font-weight:400;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.site i{font-style:normal;font-size:10.5px;color:var(--faint);overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.file:hover{background:var(--raised);color:var(--ink)}
.file[aria-current=true]{background:var(--raised);color:var(--ink)}
main{display:flex;flex-direction:column;min-width:0;min-height:0}
header{display:flex;align-items:center;gap:12px;height:48px;padding:0 14px;
  border-bottom:1px solid var(--line);background:var(--panel);flex:none}
.btn{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 11px;background:var(--raised);
  color:var(--ink);border:1px solid var(--line2);border-radius:6px;font:inherit;font-size:12.5px;
  cursor:pointer;transition:background 100ms ease}
.btn:hover{background:#1a1b1d}.btn:disabled{opacity:.45;cursor:default}
.btn.go{border-color:rgba(94,106,210,.55)}
.sep{width:1px;height:18px;background:var(--line)}
.clock{display:inline-flex;align-items:baseline;gap:5px;font-variant-numeric:tabular-nums;font-size:12.5px}
.clock b{font-weight:400;min-width:34px;text-align:right}
.clock i{font-style:normal;color:var(--faint);font-size:11px}
.clock em{font-style:normal;width:5px;height:5px;border-radius:50%;background:var(--line2);
  align-self:center;transition:background 160ms ease}
.clock em[data-ok=yes]{background:#4f9d69}.clock em[data-ok=no]{background:#d29d6b}
.icon{display:grid;place-items:center;width:28px;height:28px;padding:0;background:var(--raised);
  color:var(--dim);border:1px solid var(--line2);border-radius:6px;font:inherit;font-size:11px;
  cursor:pointer;transition:color 120ms ease,background 120ms ease}
.icon:hover{color:var(--ink);background:#1a1b1d}
.split{display:inline-flex;align-items:stretch}
.split .go{border-radius:6px 0 0 6px;border-right:0}
.split select{border-radius:0 6px 6px 0;padding:0 4px 0 7px;color:var(--dim)}
.menu[hidden]{display:none}
.menu{position:absolute;top:44px;right:14px;z-index:20;display:grid;gap:9px;padding:12px;width:214px;
  background:var(--panel);border:1px solid var(--line2);border-radius:9px;
  box-shadow:0 12px 34px rgba(0,0,0,.5)}
.menu label{display:flex;align-items:center;justify-content:space-between;gap:10px;
  font-size:12px;color:var(--dim)}
.menu label.row{justify-content:flex-start;gap:8px}
.menu select{flex:1;max-width:118px}
.menu input{flex:1;max-width:150px;min-width:0;height:24px;padding:0 7px;background:var(--bg);
  color:var(--ink);border:1px solid var(--line);border-radius:5px;font:inherit;font-size:11.5px}
.menu input:focus{outline:none;border-color:var(--accent)}
.menu .btn{width:100%}
.mrow{display:flex;gap:5px}.mrow .btn{flex:1}
.menu .keys{margin:2px 0 0;padding-top:9px;border-top:1px solid var(--line);
  font-size:10.5px;color:var(--faint);line-height:1.7}
.menu.wide{width:262px}
.menu.reel{width:340px;gap:8px}
.menu.reel video{width:100%;border-radius:6px;background:#000;display:block}
#reelget{width:100%;justify-content:center;text-decoration:none;text-align:center}
.ihead{margin:0;font-size:12px;color:var(--dim)}
.ihead em{font-style:normal;color:var(--ink)}
.ifacts{margin:-3px 0 3px;font-size:11px;color:var(--faint);font-variant-numeric:tabular-nums;line-height:1.6}
#tapply{width:100%;justify-content:center;margin-top:2px}
figure.chosen{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
figure{cursor:pointer}
figure .row button{cursor:pointer}
header{position:relative}
.unit{color:var(--faint);font-size:11px;margin-left:1px}.unit b{font-weight:400}
#scrub{flex:1;height:3px;-webkit-appearance:none;background:var(--line2);border-radius:2px;cursor:pointer}
#scrub::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;
  background:var(--accent);border:2px solid var(--panel)}
select,label.f{color:var(--dim);font-size:12px;display:inline-flex;align-items:center;gap:6px}
select{height:28px;background:var(--raised);color:var(--ink);border:1px solid var(--line2);
  border-radius:6px;font:inherit;font-size:12.5px;padding:0 6px}
.status{font-size:12px;color:var(--dim);font-variant-numeric:tabular-nums}
/* smaller than the ones in the shortcut list, and quieter: it sits inside a button that is already
   lit, so a second bright thing next to the word would compete with it rather than support it */
.cap{display:inline-flex;align-items:center;justify-content:center;min-width:19px;height:15px;
  padding:0 4px;margin-left:6px;border:1px solid var(--line2);border-top-color:rgba(255,255,255,.18);
  border-radius:4px;background:rgba(255,255,255,.05);font:inherit;font-size:9.5px;line-height:1;
  color:var(--dim);box-shadow:0 1px 0 rgba(0,0,0,.35);vertical-align:middle}
.pick.on .cap{color:var(--ink)}
kbd{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:19px;padding:0 5px;
  background:var(--raised);border:1px solid var(--line2);border-radius:4px;font-size:10.5px;color:var(--faint)}
.grid{flex:1;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));
  gap:12px;padding:14px;align-content:start}
figure{margin:0;background:var(--panel);border:1px solid var(--line);border-radius:8px;overflow:hidden;
  display:flex;flex-direction:column}
iframe{width:100%;height:280px;border:0;background:#0b0c0d;display:block}
.solo{grid-column:1/-1}.solo iframe{height:min(58vh,460px)}
figcaption{padding:10px 12px;border-top:1px solid var(--line);display:grid;gap:4px;font-size:12px}
figcaption b{font-weight:500}.note{color:var(--dim)}.verb{color:var(--faint);font-size:11px;line-height:1.5}
.facts{color:var(--dim);font-size:11px;font-variant-numeric:tabular-nums;letter-spacing:.01em}
.seen{color:var(--faint);font-size:11px;font-variant-numeric:tabular-nums}
.grid.solo{grid-template-columns:1fr}
.grid.solo figure:not(.up){display:none}
.grid.solo figure.up iframe{height:calc(100vh - 210px)}
.backer{grid-column:1/-1;display:flex;justify-content:flex-end;margin:-4px 2px 0}
.row{display:flex;gap:6px;margin-top:4px}
.whenplaying{display:flex;align-items:center;gap:12px;flex:1;min-width:0}
header.bare .whenplaying{display:none}
.btn.pick svg{opacity:.65}
.btn.pick.on{border-color:rgba(94,106,210,.7)}
.btn.pick.on svg{opacity:1;color:var(--accent)}
/* the arm light. A field evaluated per pixel into the button rather than a css gradient sweeping
   across it, because a sweep repeats on a loop you can count and a field does not */
#ask{position:relative;overflow:hidden;isolation:isolate}
#askfield{position:absolute;inset:0;width:100%;height:100%;opacity:0;pointer-events:none;
  transition:opacity 500ms ease;filter:blur(7px) saturate(1.5);mix-blend-mode:screen;z-index:0}
#ask .lbl{position:relative;z-index:1}
#ask.armed{border-color:rgba(94,106,210,.8);
  box-shadow:0 0 0 1px rgba(94,106,210,.2),0 6px 22px -8px rgba(94,106,210,.75)}
@media (prefers-reduced-motion:reduce){#askfield{display:none}}
.foot{margin-top:auto;border-top:1px solid var(--line);padding:6px;display:grid;gap:2px;flex:none}
.foothit{display:flex;align-items:center;gap:8px;width:100%;height:28px;padding:0 8px;background:none;
  border:0;border-radius:6px;color:var(--dim);font:inherit;font-size:12px;cursor:pointer;text-align:left}
.foothit:hover,.foothit.on{background:var(--raised);color:var(--ink)}
.foothit i{margin-left:auto;font-style:normal;font-size:10.5px;color:var(--faint);
  background:var(--bg);border-radius:20px;padding:1px 6px;min-width:18px;text-align:center}
.foothit i:empty{display:none}
.icb{display:grid;place-items:center;width:26px;height:26px;background:var(--raised);color:var(--faint);
  border:1px solid var(--line);border-radius:6px;cursor:pointer;padding:0;transition:color 90ms ease}
.icb:hover{color:var(--ink);border-color:var(--line2)}
/**
 * A request in flight, on a button with no room for a word.
 *
 * Two things at once, because either alone reads wrong. The sparkle turning and breathing says
 * this control is busy; a light going round the border says something is being waited for. The
 * sparkle without the sweep looks like a hover, and the sweep without the sparkle looks like the
 * button is merely disabled.
 *
 * The ring is drawn under a plate the size of the button's inside, so what shows is a moving edge
 * rather than a wedge across the middle. On the timeline button, which has no border to sweep,
 * only the sparkle turns.
 */
.icb.working,.tlmore.working{color:var(--accent);cursor:default;position:relative}
/* clipped to the button, or the cone escapes at the corner radius and reads as a blob stuck to
   one side rather than as a light going round */
.icb.working{overflow:hidden;border-color:rgba(94,106,210,.35)}
.icb.working svg,.tlmore.working svg{position:relative;z-index:2;
  animation:sparking 2.2s cubic-bezier(.4,0,.6,1) infinite}
.icb.working::after{content:'';position:absolute;inset:-45%;z-index:0;
  background:conic-gradient(from 0turn,transparent 0deg,rgba(120,132,240,.95) 50deg,transparent 125deg);
  animation:circling 1.35s linear infinite}
/* the plate that turns a filled cone into a moving edge, one pixel wide */
.icb.working::before{content:'';position:absolute;inset:1px;border-radius:5px;z-index:1;
  background:var(--raised)}
@keyframes sparking{0%,100%{transform:rotate(0deg) scale(1);opacity:.7}
  50%{transform:rotate(90deg) scale(1.16);opacity:1}}
@keyframes circling{to{transform:rotate(1turn)}}
@media (prefers-reduced-motion:reduce){
  .icb.working svg,.tlmore.working svg,.icb.working::after{animation:none}
  .icb.working,.tlmore.working{opacity:.65}}
.icb.on{color:var(--accent);border-color:rgba(94,106,210,.5)}
.mini{height:24px;padding:0 9px;font-size:11.5px;background:var(--raised);color:var(--dim);
  border:1px solid var(--line2);border-radius:5px;cursor:pointer;font-family:inherit}
.mini:hover{color:var(--ink)}
.mini.keep{border-color:rgba(94,106,210,.5);color:var(--ink)}
.empty{padding:40px;color:var(--faint);text-align:center;grid-column:1/-1;line-height:1.8}
.wait{grid-column:1/-1;display:grid;place-items:center;padding:16vh 0 0}
.field{font:11px/1.15 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--ink);
  letter-spacing:3px;user-select:none;white-space:nowrap}
.field i{font-style:normal;opacity:0}

.selhead{margin:12px 12px 6px;font-size:10.5px;text-transform:none;letter-spacing:.06em;color:var(--faint)}
.pill.on{border-color:var(--accent);background:rgba(94,106,210,.13)}
.pill[data-pick]{cursor:pointer;transition:border-color 120ms ease,background 120ms ease}
.pill[data-pick]:hover{border-color:var(--line2)}
.pill{display:flex;align-items:center;gap:8px;margin:5px 10px;padding:6px 6px 6px 7px;background:var(--raised);
  border:1px solid var(--line);border-radius:7px;font-size:11.5px;color:var(--dim)}
.shot{flex:none;width:86px;height:52px;border-radius:4px;overflow:hidden;background:#0b0c0d;
  border:1px solid var(--line);position:relative}
.shot iframe{width:100%;height:100%;border:0;display:block;pointer-events:none}
.pill .who em{font-style:normal;color:var(--ink);font-size:11.5px}
.pill .who u{text-decoration:none;color:#d29d6b;font-size:10px;line-height:1.35}
.pill b{display:grid;place-items:center;width:15px;height:15px;flex:none;border-radius:4px;
  background:var(--accent);color:#fff;font-size:9.5px;font-weight:500}
.pill .who{display:grid;gap:2px;min-width:0;overflow:hidden;flex:1}
.pill .who i{font-style:normal;color:var(--faint);font-size:10px;font-variant-numeric:tabular-nums}
.pill button{margin-left:auto;background:none;border:0;color:var(--faint);cursor:pointer;
  font-size:14px;line-height:1;padding:0 2px}
.pill button:hover{color:var(--ink)}
.appwrap{grid-column:1/-1;height:calc(100vh - 116px);border:1px solid var(--line);border-radius:8px;
  overflow:hidden;background:#fff}
/* the rail and its sequence share the height: the timeline used to be laid out below the frame and
   therefore below the fold, which is a poor place for the one thing that explains what you are
   watching */
.grid.railed .appwrap{height:calc(100vh - 116px - var(--tl, 170px))}
.appwrap iframe{width:100%;height:100%}
.tl{grid-column:1/-1;margin:10px 0 0;padding:11px 12px 9px;background:var(--panel);
  border:1px solid var(--line);border-radius:8px;position:relative}
.tlhead{font-size:10.5px;color:var(--faint);letter-spacing:.06em;margin-bottom:8px}
.tlrow{display:flex;align-items:center;gap:10px;margin:5px 0}
/* two lines: which element this row is, and what it is doing. The element leads, because a row is
   one of the things you picked and the motion is what you are choosing for it */
/* the element itself, small. A row is one of the things you picked and a picture of it is quicker to
   read than any name could be */
.tlface{width:44px;height:26px;flex:none;border:1px solid var(--line);border-radius:4px;
  overflow:hidden;background:#0b0c0d;display:block}
.tlface iframe{width:100%;height:100%;border:0;display:block;pointer-events:none}
.tlname{display:block;width:172px;flex:none;font-size:11.5px;color:var(--dim);overflow:hidden}
.tlname b{display:block;font-weight:400;color:var(--ink);font-size:11px;
  overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.tlcam{flex:none;width:74px;font-size:10px;color:var(--faint);text-align:right;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tlcam.on{color:var(--accent)}
.tlshot{height:20px;flex:none;width:88px;background:var(--raised);color:var(--dim);
  border:1px solid var(--line2);border-radius:5px;font:inherit;font-size:10.5px;padding:0 3px}
.grip{width:14px;flex:none;color:var(--faint);font-size:9px;letter-spacing:-2px;cursor:grab;
  user-select:none;touch-action:none;line-height:1}
.grip:active{cursor:grabbing;color:var(--ink)}
.tlrow.lifting{opacity:.55}
.tlrow{border-radius:6px;padding:2px 4px;cursor:pointer}
.tlrow.on{background:rgba(94,106,210,.13);outline:1px solid rgba(94,106,210,.4)}
/* a camera move is a motion and a dropdown of five words cannot show one, so each choice performs
   a miniature of itself and you read it in a glance instead of applying it to find out */
.cams{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin:1px 0 4px}
/* the same grid in the settings menu, which is narrower than the inspector and would otherwise put
   ten chips on one line of forty pixels each */
.menu .cams{grid-template-columns:repeat(4,1fr)}
.menu .camwrap{display:grid;gap:3px;margin:0 0 2px}
.menu .camwrap>span{color:var(--dim);font-size:11px}
.camchip{background:var(--raised);border:1px solid var(--line);border-radius:7px;padding:5px 3px 4px;
  display:grid;gap:4px;justify-items:center;cursor:pointer;color:var(--dim);font-family:inherit}
.camchip:hover{border-color:var(--line2);color:var(--ink)}
.camchip.on{border-color:var(--accent);color:var(--ink);background:rgba(94,106,210,.14)}
.camchip em{font-style:normal;font-size:9.5px;line-height:1.15;text-align:center}
.papers{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin:1px 0 4px}
.paperchip{background:var(--raised);border:1px solid var(--line);border-radius:7px;padding:5px 3px 4px;
  display:grid;gap:4px;justify-items:center;cursor:pointer;color:var(--dim);font-family:inherit}
.paperchip:hover{border-color:var(--line2);color:var(--ink)}
.paperchip.on{border-color:var(--accent);color:var(--ink);background:rgba(94,106,210,.14)}
.paperchip em{font-style:normal;font-size:9.5px;line-height:1.15;text-align:center}
.papbox{width:100%;height:18px;border-radius:4px;display:block;border:1px solid var(--line2)}
.pap-as{background:linear-gradient(120deg,#fff 0 50%,#0b0c0d 50% 100%)}
.pap-light{background:#fff}
.pap-dark{background:#0b0c0d}
.pap-none{background:repeating-linear-gradient(45deg,#232427 0 4px,#161719 4px 8px)}
.cambox{width:100%;height:24px;border-radius:4px;background:#000;overflow:hidden;position:relative;
  display:block;perspective:60px}
.cambox i{position:absolute;left:50%;top:50%;width:17px;height:10px;margin:-5px 0 0 -8.5px;
  border-radius:2px;background:linear-gradient(120deg,#7079ea,#3a3f8f)}
.cam-none i{opacity:.3}
/* flat on and locked off both hold still, so the miniature has to say which stillness: one is square
   to the frame and the other is the angle, and a chip that showed neither moving would read as two
   of the same thing */
.cam-flat i{transform:scale(1.25)}
.cam-locked i{transform:rotateY(-24deg) rotateX(8deg) scale(1.1)}
.cam-push i{animation:cpush 2.4s ease-in-out infinite alternate}
.cam-pull i{animation:cpull 2.4s ease-in-out infinite alternate}
.cam-pan i{animation:cpan 2.6s ease-in-out infinite alternate}
.cam-crane i{animation:ccrane 2.6s ease-in-out infinite alternate}
.cam-drift i{animation:cdrift 2.8s ease-in-out infinite alternate}
.cam-orbit i{animation:corbit 2.8s ease-in-out infinite alternate}
.cam-sway i{animation:csway 3.2s ease-in-out infinite alternate}
@keyframes cpush{from{transform:scale(.7)}to{transform:scale(1.4)}}
@keyframes cpull{from{transform:scale(1.4)}to{transform:scale(.7)}}
@keyframes cpan{from{transform:translateX(-5px) rotateY(-16deg) scale(1.1)}
  to{transform:translateX(5px) rotateY(16deg) scale(1.1)}}
@keyframes ccrane{from{transform:translateY(4px) rotateX(16deg) scale(1.1)}
  to{transform:translateY(-4px) rotateX(-10deg) scale(1.1)}}
@keyframes cdrift{from{transform:translate(-4px,2px) scale(1.18)}to{transform:translate(4px,-2px) scale(.88)}}
@keyframes corbit{from{transform:rotateY(-34deg) scale(1.05)}to{transform:rotateY(34deg) scale(1.05)}}
@keyframes csway{from{transform:translate(-1px,.6px) rotateZ(-1.5deg) scale(1.12)}
  to{transform:translate(1px,-.6px) rotateZ(1.5deg) scale(1.18)}}
@media (prefers-reduced-motion:reduce){.cambox i{animation:none}}
.takes{display:flex;flex-wrap:wrap;gap:4px;margin:0}
.take{background:var(--raised);border:1px solid var(--line);color:var(--dim);border-radius:5px;
  padding:2px 7px;font-size:10.5px;cursor:pointer;font-family:inherit}
.take.on{border-color:var(--accent);color:var(--ink)}
.tltrack{position:relative;flex:1;height:20px;background:var(--bg);border-radius:5px;
  border:1px solid var(--line)}
/* the rows and the playhead share one positioned box, so the line can be laid over the tracks
   without anybody having to know how wide the labels are. The two numbers are measured off the
   first track after a draw rather than written down twice, which is what the foot used to do */
.tlgrid{position:relative}
.tlplay{position:absolute;top:0;bottom:0;left:var(--tlx,270px);width:var(--tlw,0);
  pointer-events:none;overflow:hidden}
.tlplay i{position:absolute;top:0;bottom:0;left:0;width:1px;background:var(--accent);opacity:.6;
  transform:translateX(var(--t,0px))}
.tlplay.off{display:none}
/* beats to align to, laid over the tracks the same way the playhead is so neither has to know how
   wide the label columns are */
.tlmarks{position:absolute;top:0;bottom:0;left:var(--tlx,270px);width:var(--tlw,0);pointer-events:none}
.tlmark{position:absolute;top:0;bottom:0;width:1px;margin-left:-0.5px;background:var(--faint);
  opacity:.7;pointer-events:auto;cursor:pointer}
.tlmark:hover{background:var(--accent);opacity:1;width:2px}
.tlfoot span:first-child{color:var(--dim)}
/* the lead of a selection keeps the outline it always had; the rest of the set is filled. With one
   row selected the two land on the same row and it looks exactly as it did */
.tlrow.sel{background:rgba(94,106,210,.09)}
.tlbar.sel{background:rgba(94,106,210,.62)}
.tlsnap{position:absolute;top:-2px;bottom:-2px;width:1px;background:var(--accent);opacity:.85;
  pointer-events:none}
.tlhint{color:var(--accent)}
.tlfit{height:16px;padding:0 6px;margin-right:7px;background:var(--raised);color:var(--dim);
  border:1px solid var(--line2);border-radius:4px;font:inherit;font-size:9.5px;cursor:pointer}
.tlfit:hover{color:var(--ink);border-color:var(--accent)}
/* every motion judged for this car, reachable. The rail generates them and used to show one */
.tlalt{flex:none;width:34px;height:18px;padding:0;background:var(--raised);color:var(--dim);
  border:1px solid var(--line2);border-radius:4px;font:inherit;font-size:10px;
  font-variant-numeric:tabular-nums;cursor:pointer}
.tlalt:hover{color:var(--ink);border-color:var(--accent)}
.tlalt.one{opacity:.34;cursor:default}
.tlmore{flex:none;width:20px;height:18px;padding:0;background:none;color:var(--faint);border:0;
  border-radius:4px;cursor:pointer;display:grid;place-items:center}
.tlmore:hover{color:var(--accent)}
.tlmore svg{width:12px;height:12px}
/* when a component is on the stage, drawn behind when it moves: two decisions sharing one row */
/* a backdrop, not a target: a car that never leaves has a life the width of the whole track, so
   leaving it clickable meant there was no empty track left to put the playhead on */
.tllife{position:absolute;top:4px;bottom:4px;background:rgba(255,255,255,.05);border-radius:3px;
  border:1px solid rgba(255,255,255,.08);pointer-events:none}
.tlrow:hover .tllife,.tlrow.on .tllife{background:rgba(255,255,255,.085)}
.lin,.lout{position:absolute;top:-2px;bottom:-2px;width:7px;cursor:ew-resize;border-radius:3px;
  touch-action:none;pointer-events:auto}
.lin{left:-3px}.lout{right:-3px}
.tlrow:hover .lin,.tlrow:hover .lout{background:rgba(255,255,255,.3)}
.lin:hover,.lout:hover{background:var(--accent)}
.tlbar{z-index:2}
/* where a component was sent, on the same row as what it does and plainly not the same thing: one
   is what the model wrote and happens once, the other is a decision that can happen all afternoon */
.tlgo{position:absolute;top:6px;bottom:6px;background:rgba(58,143,111,.55);border-radius:3px;
  border:1px solid rgba(88,190,150,.85);cursor:pointer;z-index:3}
.tlgo:hover{background:rgba(58,143,111,.85)}
/* a car can be pinned to another rather than to the clock, so changing one duration stops meaning
   dragging everything after it back into place by hand */
.tlbar.tied{background:rgba(94,106,210,.32);border-style:dashed}
.tlbar.knot{border-color:#c2603f;background:rgba(194,96,63,.28)}
/* the left half of the bar's right edge trims it, the knob past it ties it to another row. Two
   different questions about the same end of the same bar, so they are two targets rather than one */
.tltrim{position:absolute;right:5px;top:0;bottom:0;width:8px;cursor:ew-resize;border-radius:2px;
  opacity:0;background:rgba(255,255,255,.5);touch-action:none}
.tlrow:hover .tltrim{opacity:.55}
.tltrim:hover{opacity:1!important;background:#fff}
.tlbar.working{opacity:.6}
.tltie{position:absolute;right:-4px;top:50%;width:9px;height:9px;margin-top:-4.5px;border-radius:50%;
  background:var(--accent);border:1.5px solid var(--panel);cursor:crosshair;opacity:0}
.tlrow:hover .tltie,.tlbar.tied .tltie{opacity:1}
.tlrow.tying{outline:1px solid var(--accent)}
.tlties{display:block;font-style:normal;font-size:9.5px;color:var(--faint);text-decoration:none;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tlties.knot{color:#c2603f}
/* several arrangements of the same elements, on one clock: the wall, applied to time */
/* named apart from the film reel's takes, which is a different list of a different thing and owns
   .takes, #takes and data-take already. One of them collided and the page stopped parsing */
/**
 * Choosing a motion for each element, before any of them are composed.
 *
 * The cards are the ones the single element path has always shown, at the same size, because a card
 * three hundred pixels wide is a thumbnail of a decision rather than the decision. What is new is
 * only the strip that says which element you are choosing for.
 */
.chooser{grid-column:1/-1;display:flex;flex-direction:column;gap:10px;min-height:0}
.chhead{display:flex;align-items:center;gap:10px}
.chwho{display:flex;gap:6px;flex:1;min-width:0;overflow:auto;padding-bottom:2px}
.chtab{display:flex;align-items:center;gap:7px;background:var(--panel);border:1px solid var(--line);
  border-radius:8px;padding:5px 9px 5px 5px;cursor:pointer;color:var(--dim);font-family:inherit;
  flex:none;transition:border-color 120ms ease,color 120ms ease,background 120ms ease}
.chtab:hover{border-color:var(--line2);color:var(--ink)}
.chtab.on{border-color:var(--accent);color:var(--ink);background:rgba(94,106,210,.13)}
.chtab em{font-style:normal;font-size:11.5px;white-space:nowrap}
.chface{width:38px;height:24px;border-radius:4px;overflow:hidden;background:#0b0c0d;
  border:1px solid var(--line);flex:none;display:block}
.chface iframe{width:100%;height:100%;border:0;display:block;pointer-events:none}
.chgo{flex:none;height:30px;padding:0 14px}
.chsay{margin:0;font-size:12px;color:var(--faint)}
.chgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px;
  align-content:start;overflow:auto;min-height:0;padding-bottom:4px}
/* one option filling the room, for the same reason the single element grid does it: a card three
   hundred pixels wide is a thumbnail of a decision rather than the decision */
.chgrid.solo{grid-template-columns:1fr}
.chgrid.solo figure:not(.up){display:none}
.chgrid.solo figure.up iframe{height:calc(100vh - 268px)}
.chgrid figure{margin:0;background:var(--panel);border:1px solid var(--line);border-radius:8px;
  overflow:hidden;display:flex;flex-direction:column;
  transition:border-color 140ms ease,transform 140ms ease}
.chgrid figure.chosen{border-color:var(--accent)}
.chgrid figure iframe{width:100%;height:280px;border:0;background:#0b0c0d;display:block}
/* the room changing hands, said rather than swapped. Cheap, once, and it is the difference between
   a tool that moves and one that blinks */
@keyframes roomin{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.chooser,.grid.railed .rails,.grid.railed .tl{animation:roomin 180ms cubic-bezier(.2,.7,.3,1) both}
@media (prefers-reduced-motion:reduce){
  .chooser,.grid.railed .rails,.grid.railed .tl{animation:none}}
/* the room is a grid of option cards, and the stage is not one of the cards. Everything that stands
   in for the whole view says so: the timeline does, the app frame did, and when the frames were
   wrapped so several arrangements could sit side by side, the wrapper became the grid item and
   inherited a single 330px column while the timeline under it stayed full width */
.rails{grid-column:1/-1;height:100%}
.rails.many{display:flex;gap:8px;height:100%}
.rails.many .appwrap{flex:1 1 0;min-width:0;position:relative;border:1px solid var(--line);
  border-radius:8px;overflow:hidden}
.rails.many .appwrap.on{border-color:var(--accent)}
.railby{position:absolute;left:7px;top:6px;font-size:10px;color:var(--faint);letter-spacing:.04em;
  background:rgba(8,9,10,.72);padding:2px 6px;border-radius:4px;pointer-events:none}
.rails.many .appwrap.on .railby{color:var(--ink)}
.tltop{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.tltop .tlhead{margin:0;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tlrails{display:flex;gap:4px;flex:none}
.railtab{height:18px;padding:0 8px;background:var(--raised);color:var(--dim);
  border:1px solid var(--line2);border-radius:4px;font:inherit;font-size:10px;cursor:pointer}
.railtab:hover{color:var(--ink);border-color:var(--accent)}
.railtab.on{border-color:var(--accent);color:var(--ink);background:rgba(94,106,210,.16)}
.railtab.keep{color:var(--accent)}
.tlrow.working .tlalt{color:var(--faint)}
.tlrow.working .tlbar{animation:tlwork 1.1s ease-in-out infinite}
@keyframes tlwork{0%,100%{opacity:1}50%{opacity:.45}}
@media (prefers-reduced-motion:reduce){.tlrow.working .tlbar{animation:none;opacity:.7}}
.tlbar{position:absolute;top:2px;bottom:2px;background:rgba(94,106,210,.5);
  border:1px solid var(--accent);border-radius:4px;cursor:grab;display:flex;align-items:center;
  padding:0 5px;touch-action:none}
.tlbar:active{cursor:grabbing;background:rgba(94,106,210,.72)}
.tlbar i{font-style:normal;font-size:9.5px;color:#fff;font-variant-numeric:tabular-nums;
  white-space:nowrap;pointer-events:none}
.tlfoot{display:flex;justify-content:space-between;font-size:10px;color:var(--faint);
  margin:6px 0 0;padding-left:270px;font-variant-numeric:tabular-nums}
#pick[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}
.chip{display:block;margin:10px;padding:8px 10px;background:var(--raised);border:1px solid var(--line2);
  border-radius:6px;font-size:11.5px;color:var(--ink);word-break:break-all}
.chip span{color:var(--faint)}
.drops{padding:0 14px 14px;color:var(--faint);font-size:11.5px;line-height:1.7}
</style></head><body>
<aside>
  <div class="head">
    <form class="aim" id="aimform" autocomplete="off">
      <img id="fav" alt="" width="14" height="14">
      <input id="url" spellcheck="false" placeholder="localhost:3000" value="${AIM ?? ''}">
      <button class="enter" id="go" title="Aim the studio here" type="submit">&#9166;</button>
    </form>
    <!-- data-state, not the words: two verifications used to grep this sentence to decide whether
         a site had loaded, which made a line of copy load bearing and unchangeable -->
    <span id="aimnote" data-state="${AIM ? 'ok' : 'empty'}">${AIM ? ''
      : HAS_FOLDER ? 'or pick a component below' : 'type where your app is running'}</span>
    <!-- an app behind a sign in cannot be proxied, so there is a way to pick without proxying -->
    <a class="away" href="/__wall/bookmarklet" target="_blank" rel="noopener"
      title="for an app that needs an account, where proxying cannot work">or pick behind a sign in</a>
  </div>
  <div class="files" id="files"></div>
  <div id="sel"></div>
  <div class="foot">
    <button class="foothit" id="savedbtn" title="Motions you kept">
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor"
        stroke-width="1.4" stroke-linejoin="round"><path d="M4 2.6h8v11.2l-4-2.7-4 2.7z"/></svg>
      <span>Saved</span><i id="savedn"></i></button>
    <button class="foothit" id="setbtn" title="Which model writes the motion">
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor"
        stroke-width="1.4" stroke-linecap="round"><path d="M2 4.5h12M2 11.5h12"/>
        <circle cx="6" cy="4.5" r="1.7"/><circle cx="10.5" cy="11.5" r="1.7"/></svg>
      <span>Settings</span></button>
  </div>
</aside>
<main>
  <!--
    Four things, grouped by what they act on: the source on the left, the transport in the middle,
    everything occasional behind one button on the right.

    It held eleven controls in a row before, three of them dropdowns, and a diagnostic readout and a
    permanent row of keyboard hints. Scrubbing is what this tool does all day and it was competing
    with a palette picker for attention. The occasional settings are still one click away, and the
    keyboard hints moved in there with them, where they are read once rather than looked past
    constantly.
  -->
  <header>
    <button class="btn pick" id="pick" title="Click elements on the page to select them">
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor"
        stroke-width="1.5" stroke-linecap="round"><path d="M8 1.6v3.1M8 11.3v3.1M1.6 8h3.1M11.3 8h3.1"/>
        <circle cx="8" cy="8" r="2.9"/></svg><span class="lbl">Pick</span></button>
    <button class="btn go" id="ask"><canvas id="askfield" aria-hidden="true"></canvas>
      <span class="lbl">Give it motion</span></button>
    <span class="whenplaying">
      <span class="sep"></span>
      <button class="icon" id="play" title="Play or pause (space)"><span id="glyph">❚❚</span><span id="word" hidden></span></button>
      <span class="clock"><b id="at">0.00</b><i id="span">4.2s</i><em id="driven" title="how many previews the scrubber is driving"></em></span>
      <input id="scrub" type="range" min="0" max="4200" value="0" step="10">
      <span class="sep"></span>
      <button class="icon" id="inspect" title="Adjust the chosen one">&#9707;</button>
      <button class="icon" id="more" title="Speed, palette, camera, film shape">&#183;&#183;&#183;</button>
      <button class="btn" id="film" title="Render what is on screen frame by frame">Film</button>
      <button class="btn" id="save">Export</button>
    </span>
    <div class="menu reel" id="reel" hidden>
      <p class="ihead">Film <em id="reeltag"></em></p>
      <video id="reelvid" controls loop muted playsinline></video>
      <p class="ifacts" id="reelfacts"></p>
      <a class="btn go" id="reelget" download>Download the mp4</a>
      <div class="takes" id="takes"></div>
      <p class="keys" id="reelnote"></p>
    </div>
    <div class="menu wide" id="inspector" hidden>
      <p class="ihead">Adjust <em id="itag">nothing chosen</em></p>
      <p class="ifacts" id="ifacts">Click an option below to choose it.</p>
      <label>Speed<select id="tdur">
        <option value="0.5">twice as fast</option><option value="0.75">a little faster</option>
        <option value="1" selected>as written</option><option value="1.5">a little slower</option>
        <option value="2">half speed</option></select></label>
      <label>Spacing<select id="tstag">
        <option value="0.5">tighter</option><option value="1" selected>as written</option>
        <option value="1.5">looser</option><option value="2">twice as far apart</option></select></label>
      <label>Easing<select id="tease">
        <option value="">as written</option>
        <option value="cubic-bezier(.16,1,.3,1)">arrive and settle</option>
        <option value="cubic-bezier(.34,1.56,.64,1)">overshoot</option>
        <option value="steps(6,end)">stepped</option>
        <option value="cubic-bezier(.4,0,1,1)">leave</option></select></label>
      <div id="icam" hidden><p class="ihead">Camera</p><div class="cams" id="cams"></div>
        <p class="ihead">Shown against</p><div class="papers" id="papers"></div></div>
      <button class="btn go" id="tapply">Add as a new option</button>
      <p class="keys" id="inote">The original stays. Adjusting makes another one beside it.</p>
    </div>
    <div class="menu wide" id="models" hidden>
      <p class="ihead">Writing with <em id="mtag">the default</em></p>
      <label>Service<select id="mprov"></select></label>
      <p class="ifacts" id="mnote"></p>
      <label>Model<input id="mmodel" list="mlist" spellcheck="false" placeholder="default"></label>
      <datalist id="mlist"></datalist>
      <label id="mbaserow">Endpoint<input id="mbase" spellcheck="false" placeholder="default"></label>
      <label id="mkeyrow">Key<input id="mkey" type="password" spellcheck="false" placeholder="not set"></label>
      <span class="mrow"><button class="btn go" id="msave">Use this</button>
        <button class="btn" id="mtest">Test it</button>
        <button class="btn" id="mforget" title="Remove the stored key">Forget key</button></span>
      <p class="keys" id="mout">The key is kept in .studio on this machine and never sent to the page.</p>
    </div>
    <div class="menu" id="menu" hidden>
      <label>How many<select id="count" title="how many options each ask returns">
        <option>3</option><option>4</option><option selected>5</option><option>6</option></select></label>
      <label>Speed<select id="rate"><option>0.25x</option><option>0.5x</option>
        <option selected>1x</option><option>2x</option></select></label>
      <label>Palette<select id="palette">
        ${PRESETS.map((p, i) => `<option${i === 1 ? ' selected' : ''}>${p.name}</option>`).join('')}
      </select></label>
      <!-- a hidden input rather than a select, so everything that reads cam.value keeps reading it
           while the thing you actually choose from is the grid of moving chips below -->
      <div class="camwrap"><span>Shot</span>
        <input type="hidden" id="cam" value="">
        <div class="cams" id="camgrid"></div></div>
      <label>Shape<select id="shape">
        <option value="wide" selected>wide 1280</option>
        <option value="square">square 1080</option>
        <option value="tall">tall 1080</option></select></label>
      <label>Lens<select id="depth">
        <option value="0.4">shallow</option><option value="1" selected>as shot</option>
        <option value="1.6">heavy</option></select></label>
      <button class="btn" id="modelbtn">Model and service</button>
      <p class="keys"><kbd>Space</kbd> play <kbd>&larr;</kbd><kbd>&rarr;</kbd> step <kbd>Esc</kbd> stop picking
        <kbd>&#8984;Z</kbd> undo <kbd>&#8984;&#8679;Z</kbd> redo</p>
    </div>
  </header>
  <div class="grid" id="grid"><div class="empty">${CAN_WRITE
    ? 'Type where your site is running, up on the left, then pick something on it.'
    : 'No <b>claude</b> command on PATH, so nothing can be written here.<br>'
      + 'Start the studio from a shell where <b>claude</b> runs.'}</div></div>
  <div class="drops" id="drops"></div>
</main>
<script>
const grid=document.getElementById('grid'),drops=document.getElementById('drops')
const scrub=document.getElementById('scrub'),at=document.getElementById('at'),link=document.getElementById('driven')
const play=document.getElementById('play'),ask=document.getElementById('ask'),cam=document.getElementById('cam')
const palette=document.getElementById('palette')
let file=null, opts=[], running=true, t=0, last=performance.now(), held=new Map()
let ends=new Map(), span=4200, rate=1
/* the frames the scrubber drives, which is not every frame in the room. The timeline's row
   thumbnails live inside .grid too, and counting them would post hold to a still picture and, far
   worse, shift the index every rail frame is addressed by, since held and ends are keyed by position */
const DRIVEN='.grid .appwrap iframe, .grid figure iframe'
/* declared up here with the rest of the state, not beside keepWork at the foot of the file: render
   runs once during boot, render leaves the work, and a let read before its line has run kills the
   whole page script and takes every listener below it with it */
let keeping=null
let opened=null   // the option filling the room, or null for the grid
let aimN=0   // bumped on every aim so the frame refetches instead of reusing the last page
let quietMode=false
/* a frame that has navigated to somebody else's origin is one we can no longer read, and the only
   answer that works is to load it again with its scripts refused */
/* which of the app's own hosts refused it, if any, kept until the frame has had time to render */
let turnedAway=null
function watchFrame(){
  const f=grid.querySelector('.appwrap iframe'); if(!f) return
  let tries=0
  const check=()=>{
    if(!document.contains(f)) return
    let ours=true, alive=0, reads=0
    try{ ours = f.contentWindow.location.host===location.host
      const d=f.contentWindow.document
      alive = d && d.documentElement ? d.querySelectorAll('*').length : 0
      /* what is actually on the page rather than how many nodes it has: an app shell waiting on an
         api it cannot reach is hundreds of nodes and nothing to read */
      reads = d && d.body ? (d.body.innerText||'').trim().length : 0
    }catch(_){ ours=false }
    /* both, and only after it has had a fair chance to render */
    if(ours && tries>4 && reads<40 && turnedAway && !quietMode){
      const note=document.getElementById('aimnote')
      if(note && note.dataset.state!=='refused'){
        note.dataset.state='refused'
        note.innerHTML='nothing rendered, and this app is being refused by <b>'+esc(turnedAway)
          +'</b>. On this origin its own back end is a different site, so it cannot sign in and sits '
          +'on its loading screen. A page that does not need an account will proxy fine.'
      }
    }
    /* two ways a page refuses to be looked at: it takes the frame somewhere else, or it destroys its
       own document where it stands. railway does the second, deciding it has hit a server error and
       emptying itself, which leaves the frame ours and completely blank. Both want the same answer */
    if((!ours || (tries>2 && alive<20)) && !quietMode){
      quietMode=true; aimN++
      document.getElementById('aimnote').dataset.state='ok'
      document.getElementById('aimnote').innerHTML=(ours
        ? 'that page emptied itself when its own scripts ran, '
        : 'that site moves its own frame back to its origin, ')
        +'so it is loaded again with <b>scripts refused</b>: the markup and styles are still there'
      render(); return
    }
    if(++tries<14) setTimeout(check,700)
  }
  setTimeout(check,1400)
}
let APP=${AIM ? 'true' : 'false'}
const CAN_WRITE=${CAN_WRITE ? 'true' : 'false'}
let chosen=null   // the most recent pick
let picks=[]      // everything selected, in the order it was picked
let arr=null      // the arrangement, once each element has been given a motion
/**
 * The composition's arithmetic, fetched rather than written here.
 *
 * The same reason raster and mp4 are fetched: this file is one template literal, so a regex written
 * in it loses its escapes before a browser sees it, and a second copy of a measurement is how 3.2s
 * came to be read as 2s. One definition, in shared/arrange.mjs, which node imports directly to check.
 *
 * Eagerly, unlike those two, because the timeline reads it on every draw rather than when a button is
 * pressed. It is awaited at the one place an arrangement can be born, which already waits minutes on
 * a model call, so nothing downstream has to ask whether it arrived.
 */
let ARR=null
const arriving=import('/__wall/arrange.mjs').then(m=>{ARR=m}).catch(()=>{})
/* one question, asked in five places before this, each its own chance to answer differently */
const railed=()=>!!(ARR&&arr&&ARR.live(arr).length)
/**
 * Which rows are selected, and which one of them the inspector speaks for.
 *
 * A set of car indices, and a lead that is also a car index rather than a motion id. It has to be an
 * index: duplicating a car gives two cars the same motion, and an id could not say which of them you
 * meant. chosenOpt is still written alongside, because the inspector and the options grid share it
 * and both of them are asking a question about a motion rather than about a place in the rail.
 *
 * One writer keeps the invariant, rather than each of the readers deriving it: the lead is a member
 * of the set, or the set is empty and there is no lead.
 *
 * anchor is where a shift range measures from, which is the row last clicked without a modifier.
 * The range runs over rows rather than over time, because rows are what you can see and a range that
 * jumped to cars you never dragged across would be astonishing.
 */
let sel=new Set(), anchor=null, lead=null
/**
 * The drawn ruler, which only ever grows while you are working.
 *
 * Sizing the strip to its contents means the scale changes under the hand. Nudge a car to the right
 * and the rail gets longer, so every other bar shrinks and slides left although nothing about them
 * changed; worse, the coarse grid is chosen from that scale, so five presses of the same key moved a
 * selection 100, 100, 250, 250 and 250ms. A step that is not the same twice is not a step.
 *
 * So the drawn span is sticky and Fit is how you ask for it back.
 */
let zoom=0
const ruler=()=>{ zoom=ARR.viewSpan(arr,zoom); return zoom }
/**
 * Several arrangements of the same elements, on one clock.
 *
 * This is the wall applied to time instead of to layout: fork what you have, change one thing, and
 * watch both at the same instant rather than trying to remember the first while you look at the
 * second. Keeping one and dropping the rest is the same act the wall of pages already asks for.
 *
 * arr stays the one being edited and every operation keeps writing to it; the list is brought back
 * into step in render, which is the single place every change already ends. Two variables that must
 * agree, updated in one place, rather than twenty assignments each remembering to update a list.
 *
 * Three is allowed and two is the default. Measured on a rail of five cars with a camera on every
 * one: 30 animations a frame without cameras and 95 with, since a rig clones its subject twice, so
 * three of them is 285 live animations. Driving one frame costs a median 8.3ms and a p95 of 8.4;
 * driving two or three costs the same median and a p95 of 16.7, which is one dropped frame in
 * twenty. Three is affordable and is not free, and the cost arrives at the second frame rather than
 * at the third.
 */
let rails=[], railN=0
const comparing=()=>rails.length>1
/**
 * Choosing, before composing.
 *
 * One element got the whole room: five motions side by side, open one bigger, ask for more like it,
 * keep the one that lands. Several elements skipped all of that and went straight to a rail with
 * whichever motion happened to be judged best for each, so the moment a composition had two things
 * in it the tool stopped doing the one thing it is for.
 *
 * So the ask lands here instead. The same grid, one element at a time, and the rail is what you go
 * to when you have chosen. Nothing is thrown away by moving between them: both are views of the same
 * arrangement, and every alternative stays reachable from the row afterwards.
 */
let stage=null      // 'choosing', or null for the rail
let subjectN=0      // which picked element the grid is showing the motions for
/* whether a pick is the one being chosen for, so the sidebar and the room say the same thing */
const onSubject=(i)=>{
  if(stage!=='choosing'||!ARR||!arr) return false
  const on=ARR.live(arr); const at=on[Math.min(subjectN,on.length-1)]
  return !!at&&at.i===i
}
/* the cars that carry a motion, each with the index it sits at, since a dead car still owns a row */
const onRail=()=>(railed()?ARR.live(arr):[])
let verdict=null  // why the last ask produced nothing, so the grid can say so
let dbp=null      // the saved shelf, opened on first use
let kept=new Set()// which options are on it, so a card can show its bookmark filled
let viewing=null  // 'saved' when the shelf has the room instead of the options
let glowing=0     // the arm light's frame handle, read by drawSel before its own line runs

/**
 * Undo, kept over the composition rather than over the dom.
 *
 * Everything here a hand can change is a handful of small fields: which elements are picked, which
 * options exist, which one is chosen, and for a rail, the order of the cars and when each one starts
 * and what films it. So a step is a snapshot of those fields rather than a description of an edit.
 * A snapshot cannot fall out of step with the thing it describes, and there is no inverse operation
 * to write once per action and get wrong in one of them.
 *
 * The heavy fields are shared rather than copied. An option's markup and css never change after it is
 * written, so copying them into every step would spend megabytes preserving something already
 * immutable. Cars are replaced rather than copied: every edit returns a new arrangement, so the one
 * it replaced already is the snapshot and there is nothing here to keep in step with it. A step that
 * has to remember to copy a field is a step that stops working the day a field is added, and the
 * motions those cars point at are frozen so that sharing them cannot go wrong.
 */
const HIST=60
let past=[], ahead=[]
/* the selection travels with the step. Undoing a reorder and being left holding whichever car has
   now slid into that index is a small thing that feels like the tool losing your place */
const snap=()=>({ picks:picks.slice(), opts:opts.slice(), chosen, arr, opened, chosenOpt,
  sel:[...sel], lead, anchor, zoom, rails:rails.slice(), railN })
function restore(st){
  picks=st.picks.slice(); opts=st.opts.slice(); chosen=st.chosen
  arr=st.arr; opened=st.opened; chosenOpt=st.chosenOpt
  sel=new Set(st.sel||[]); lead=st.lead===undefined?null:st.lead; anchor=st.anchor??null; zoom=st.zoom||0; rails=(st.rails||[]).slice(); railN=st.railN||0
  held.clear(); ends.clear(); drawSel(); render(); drawInspector(); drawHistory()
}
/* called before the change, so what lands on the stack is the state to come back to */
function mark(what){
  past.push({ ...snap(), what }); if(past.length>HIST) past.shift()
  ahead=[]; drawHistory()
}
function undo(){
  if(!past.length) return
  const step=past.pop(); ahead.push({ ...snap(), what:step.what })
  restore(step); drops.textContent='Undid '+step.what+'.'
}
function redo(){
  if(!ahead.length) return
  const step=ahead.pop(); past.push({ ...snap(), what:step.what })
  restore(step); drops.textContent='Redid '+step.what+'.'
}
function drawHistory(){
  const u=document.getElementById('undo'), r=document.getElementById('redo')
  if(!u||!r) return
  u.disabled=!past.length; r.disabled=!ahead.length
  u.title=past.length?'Undo '+past[past.length-1].what:'Nothing to undo'
  r.title=ahead.length?'Redo '+ahead[ahead.length-1].what:'Nothing to redo'
}
addEventListener('keydown',e=>{
  /* a field with a cursor in it has an undo of its own and the browser's is the better one there,
     so this only answers when the keystroke was aimed at the room rather than at a control */
  const t=e.target, tag=t&&t.tagName
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(t&&t.isContentEditable)) return
  if(railKey(e)) return
  if(!(e.metaKey||e.ctrlKey)) return
  const k=String(e.key).toLowerCase()
  if(k==='z'&&!e.shiftKey){ e.preventDefault(); undo() }
  else if((k==='z'&&e.shiftKey)||k==='y'){ e.preventDefault(); redo() }
})
/**
 * The keys the timeline answers, which is only ever while it has rows selected.
 *
 * Before the modifier gate above, because an arrow and a backspace carry none. The rule the whole
 * thing expresses is that the arrows belong to whatever you last touched: with rows selected they
 * nudge those rows, and with nothing selected they scrub, which is what they have always done. That
 * is why this stops the event reaching the transport rather than the two of them both answering.
 *
 * A held arrow repeats about thirty times a second and each repeat is an edit, so a run of them
 * collapses into one step. Sixty history entries recording one gesture is an undo stack that cannot
 * undo anything you would want back.
 */
let nudgeTill=0
function railKey(e){
  if(!railed()||!sel.size) return false
  const k=e.key
  const rows=[...document.querySelectorAll('.tlrow')].map(r=>Number(r.dataset.row))
  if(k==='ArrowLeft'||k==='ArrowRight'){
    e.preventDefault(); e.stopImmediatePropagation()
    const total=ruler()
    const track=document.querySelector('.tltrack')
    const step=e.altKey?1:ARR.gridStep(total,track?track.getBoundingClientRect().width:700)
    const by=(k==='ArrowLeft'?-1:1)*step*(e.shiftKey?10:1)
    const now=performance.now()
    if(now>nudgeTill) mark(sel.size>1?'nudging '+sel.size+' cars':'nudging '+nameOf(arr.cars[[...sel][0]].motion))
    nudgeTill=now+700
    arr=ARR.shifted(arr,[...sel],by)
    held.clear(); ends.clear(); render()
    return true
  }
  if(k==='ArrowUp'||k==='ArrowDown'){
    e.preventDefault(); e.stopImmediatePropagation()
    const seat=rows.indexOf(lead)
    const to=rows[Math.max(0,Math.min(rows.length-1,seat+(k==='ArrowUp'?-1:1)))]
    if(to===undefined) return true
    if(e.shiftKey){ const next=new Set(sel); next.add(to); choose([...next],to) }
    else { anchor=to; choose([to],to) }
    return true
  }
  if((e.metaKey||e.ctrlKey)&&String(k).toLowerCase()==='a'){
    e.preventDefault(); e.stopImmediatePropagation()
    nudgeTill=0; choose(rows, rows[rows.length-1]); return true
  }
  if(k==='Backspace'||k==='Delete'){
    e.preventDefault(); e.stopImmediatePropagation()
    nudgeTill=0
    mark(sel.size>1?'removing '+sel.size+' cars from the rail':'removing a car from the rail')
    /* the cars go and the picks stay. Removing a voice from a composition is not the same as
       un choosing the element, and the pills have their own remove button that means that. It also
       keeps this honest: a car has a copy of what its pick looked like rather than an index into
       picks, and after a reorder or a duplicate there is no index left to trust */
    arr={...arr, cars:arr.cars.filter((_,i)=>!sel.has(i))}
    choose([]); anchor=null
    if(!ARR.live(arr).length) arr=null
    held.clear(); ends.clear(); render()
    return true
  }
  if((e.metaKey||e.ctrlKey)&&String(k).toLowerCase()==='d'){
    e.preventDefault(); e.stopImmediatePropagation()
    nudgeTill=0
    mark(sel.size>1?'duplicating '+sel.size+' cars':'duplicating a car')
    /* the copy is given a name of its own, and does not inherit what the original follows. Two cars
       answering to one key means anything tied to that key follows whichever the solver reached
       last, which is a decision nobody made */
    const cars=[], made=[]
    arr.cars.forEach((c,i)=>{
      cars.push(c)
      if(sel.has(i)){ made.push(cars.length); cars.push({...c, key:ARR.freshKey({cars}), after:null}) }
    })
    arr={...arr, cars}
    // the copies are what you now have hold of, so duplicate then nudge is one gesture
    choose(made, made[made.length-1])
    held.clear(); ends.clear(); render()
    return true
  }
  return false
}

/**
 * A capture pasted in from somewhere the studio cannot go.
 *
 * An application behind a sign in cannot be proxied, so the picker runs on the real page in your own
 * browser and the capture comes back on the clipboard. Arriving that way it is exactly what the
 * picker sends over postMessage, because it is the same picker: a capture carries its own markup,
 * the rules that matched it and a snapshot, so it never needed the page it came from to be open.
 *
 * On the document rather than on a field, because there is nothing to focus and asking somebody to
 * click a box first is a step that exists only to make the code simpler.
 */
/* the same arrival as a paste, by a shorter road: a page whose policy allows it hands the capture
   straight over, and the only difference is that nobody had to carry it */
async function takeInbox(){
  try{
    const got=await fetch('/__wall/inbox').then(r=>r.json())
    if(got&&Array.isArray(got.picks)&&got.picks.length) tookPicks(got.picks,'picked')
  }catch(_){}
}
/**
 * The stylesheets the page would not let the picker read, fetched from the one side that can.
 *
 * A sheet served from another origin without cors headers cannot be read from a script running on
 * the page, which on a real app is nearly always its typefaces: three of them on the one this was
 * built against. The studio has no origin to be refused by, so it fetches them itself, and what
 * comes back is appended to the capture that lost them.
 *
 * Only the parts worth having. A font sheet is font-face rules and a variable sheet is custom
 * properties, and neither is large; anything else is left where it is rather than doubling a
 * capture with rules that were never going to match.
 */
async function mendSheets(pick){
  if(!pick.shut||!pick.shut.length) return pick
  const got=[]
  for(const href of pick.shut.slice(0,6)){
    try{
      const css=await fetch('/__wall/asset?u='+encodeURIComponent(href)).then(r=>r.ok?r.text():'')
      if(!css) continue
      /* the pieces a lifted component actually needs from a page level sheet */
      let keep=''
      for(const bit of css.split('}')){
        const head=bit.slice(0,bit.indexOf('{')).trim()
        if(!head) continue
        if(head.indexOf('@font-face')===0||head===':root'||head==='html') keep+=bit+'}'
        if(keep.length>9000) break
      }
      if(keep) got.push(keep)
    }catch(_){}
  }
  if(!got.length) return pick
  return {...pick, css:got.join('')+pick.css, mended:got.length}
}
/* one way in, whether it was pasted or handed over */
function tookPicks(some,how){
  let n=0
  mark(some.length>1?'taking in '+some.length+' picks':'taking in a pick')
  for(const one of some){
    if(!one||!one.html) continue
    picks.push({html:one.html,css:one.css||'',shot:one.shot||'',label:one.label||'element',
      w:one.w,h:one.h,n:one.n,cut:one.cut,opaque:one.opaque,weak:one.weak,shut:one.shut||[]})
    n++
  }
  if(!n) return 0
  /* after they are in, since fetching a stylesheet is slower than showing what arrived */
  Promise.all(picks.slice(-n).map(async (k,i)=>{
    const mended=await mendSheets(k)
    if(mended!==k){ picks[picks.length-n+i]=mended; return mended.mended }
    return 0
  })).then(counts=>{
    const won=counts.reduce((a,c)=>a+c,0)
    if(won){ drops.textContent+=' '+won+' stylesheet'+(won>1?'s':'')
      +' the page would not let it read were fetched here instead.'
      drawSel() }
  }).catch(()=>{})
  chosen=picks[picks.length-1]
  opts=[]; verdict=null; arr=null
  drops.textContent=n+(n===1?' element ':' elements ')
    +(how==='picked'?'came in from the page you picked on':'pasted in, from wherever you picked them')
    +'. Give them motion when you are ready.'
  drawSel(); render()
  return n
}
addEventListener('paste',e=>{
  const t=e.target, tag=t&&t.tagName
  if(tag==='INPUT'||tag==='TEXTAREA'||(t&&t.isContentEditable)) return
  const said=(e.clipboardData||window.clipboardData); if(!said) return
  let got=null
  try{ got=JSON.parse(said.getData('text')||'') }catch(_){ return }
  if(!got||got.wall!=='wall-capture'||!Array.isArray(got.picks)||!got.picks.length) return
  e.preventDefault()
  tookPicks(got.picks,'pasted')
})

const pickBtn=document.getElementById('pick')
pickBtn.onclick=()=>{
  const want=pickBtn.getAttribute('aria-pressed')!=='true'
  pickBtn.setAttribute('aria-pressed',want)
  const f=document.querySelector('.appwrap iframe')
  if(f) f.contentWindow.postMessage({wall:want?'pick':'nopick'},'*')
}
/* aiming somewhere new: the frame reloads, the selection is somebody else's page now, and the
   favicon is asked for once the target has actually changed rather than optimistically */
const aimform=document.getElementById('aimform'), urlbox=document.getElementById('url')
aimform.onsubmit=async e=>{
  e.preventDefault()
  const said=urlbox.value.trim(); if(!said) return
  const note=document.getElementById('aimnote')
  note.dataset.state='reaching'; note.textContent='reaching it…'
  const r=await fetch('/__wall/target',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({url:said})}).then(x=>x.json()).catch(e=>({error:String(e)}))
  if(r.error){ note.dataset.state='error'; note.textContent=r.error; return }
  /**
   * The picks survive going somewhere else.
   *
   * A pick carries the markup it was captured with, the rules that matched it and a snapshot of how
   * it looked, so nothing about it needs the page it came from to still be open. Throwing them away
   * on every aim was the tidiest thing to do when a rail was one page's elements, and it makes the
   * one composition worth building out of two products impossible: a header from your app beside a
   * chart from theirs is exactly the demo somebody wants, and it cost a line to forbid.
   *
   * The options go, because they were written against the elements of a page you have left, and the
   * arrangement goes with them. The selection stays, and each pill still has its own way out.
   */
  urlbox.value=r.at; APP=true; aimN++; quietMode=false; opts=[]; verdict=null; arr=null
  if(picks.length) drops.textContent=picks.length+' picked so far, kept. '
    +'Anything picked here joins them, and a pill takes one out.'
  // the folder list is about somewhere else now
  drawRail(r.recent||[])
  // nothing to say once it is up: the page is right there and it says it better
  note.dataset.state='ok'; note.textContent=''
  document.getElementById('fav').src='/__wall/favicon?t='+Date.now()
  pickBtn.style.display=''
  drawSel(); render()
}
if(APP){ document.getElementById('fav').src='/__wall/favicon' } else { pickBtn.style.display='none' }
render()
/**
 * The rail lists where this has been, and falls back to the components in the repo when it has been
 * nowhere yet. Both are labelled, because a list of addresses and a list of files are different
 * things and an unlabelled mixture of the two would be worse than either.
 */
let files=[]
function drawRail(recent){
  const rail=document.getElementById('files')
  const rows=[]
  if(recent.length) rows.push('<p class="railhead">Recent</p>'
    +recent.map(r=>'<button class="site" data-go="'+r.href+'">'
      +'<img src="/__wall/favicon?host='+encodeURIComponent(r.href)+'" alt="" width="13" height="13">'
      +'<span><b>'+r.host+'</b>'+(r.path?'<i>'+r.path.slice(0,26)+'</i>':'')+'</span></button>').join(''))
  if(files.length && !recent.length) rows.push('<p class="railhead">In this repo</p>'
    +files.map(f=>'<button class="file" data-f="'+f+'">'+f.split('/').slice(-2).join('/')+'</button>').join(''))
  rail.innerHTML=rows.join('')
  rail.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{
    urlbox.value=b.dataset.go; aimform.requestSubmit()
  })
  rail.querySelectorAll('.file').forEach(b=>b.onclick=()=>{
    file=b.dataset.f
    rail.querySelectorAll('.file').forEach(x=>x.setAttribute('aria-current',x===b))
    opts=[]; verdict=null; arr=null; held.clear(); drops.textContent=''; render()
  })
}
Promise.all([fetch('/__wall/list').then(r=>r.json()), fetch('/__wall/recent').then(r=>r.json())])
  .then(([fs,rs])=>{ files=fs; drawRail(rs) })

/**
 * Why nothing came back.
 *
 * Falling back to the untouched preview is the worst thing this could do, because it looks exactly
 * like the state before the button was pressed. The two reasons are entirely different problems: a
 * model that never answered is usually the claude command missing, which no amount of trying again
 * will fix, while a gate rejecting every attempt is about this particular component and is worth
 * another go with a different verb.
 */
function explain(){
  const d=verdict.dropped||[]
  const silent=d.length&&d.every(x=>x.kind==='model')
  let body
  if(verdict.error) body='<b>The studio errored.</b><br>'+verdict.error
  else if(!CAN_WRITE||silent) body='<b>The model did not answer.</b><br>'
    +(CAN_WRITE
      ? 'Each attempt was made three times with a pause between, and every one came back with:<br><br>'
        +d.slice(0,3).map(x=>'&middot; '+x.why).join('<br>')
        +'<br><br>That is upstream rather than about this component. Worth pressing again in a moment.'
      : 'There is no claude command on PATH, so there is nothing for the button to call. '
        +'Start the studio from a shell where <b>claude</b> runs.')
  else body='<b>Every option was turned down by a gate.</b><br>'
    +d.map(x=>'&middot; '+x.why).join('<br>')
    +'<br><br>That is usually a component with nothing in it that wants to move separately. '
    +'Try one with repeated parts, or press again for different verbs.'
  grid.innerHTML='<div class="empty" style="text-align:left;max-width:640px;margin:24px auto">'+body+'</div>'
  paint()
}

/**
 * The waiting state, which is the one piece of motion in here the studio wrote itself.
 *
 * "Asking for 5 motions. About thirty seconds." was a sentence in a large empty room, and it broke
 * two of the rules this tool enforces on everything else: nothing moved, and what little it said was
 * a guess at a duration rather than a report of anything. A tool about motion showing a still while
 * it works is the wrong advertisement.
 *
 * So it is a stepped wave and a braille turn, and it obeys the same craft the gates demand: only
 * transform and opacity, delays forty milliseconds apart, a steps() timing that jerks the way a
 * mechanism does rather than easing the way a default does. The glyph is animated through the content
 * property, which is the only honest way to do ascii in css.
 */
const WAITER = () => '<div class="wait"><div class="field" id="field"></div></div>'

/**
 * The waiting state is a small shader written in characters.
 *
 * Two sine fields crossing at different rates, sampled per cell, mapped onto a ramp that runs from
 * nothing to a full block. It is the oldest trick in graphics and it still reads better than a
 * spinner, because a spinner says only that something is happening while a field says the thing
 * happening is continuous and has a shape.
 *
 * Sparse on purpose. The ramp starts with two blank steps so most of the grid is empty at any moment
 * and what remains is a drifting suggestion rather than a wall of glyphs, which is the difference
 * between this and every terminal loading animation.
 */
const SHADER = [
  '(function(){',
  "var host=document.getElementById('field'); if(!host) return",
  'var COLS=64, ROWS=16, N=COLS*ROWS',
  /* Built once and then only its opacity changes.
     A ramp of glyphs steps between characters, and steps are what made the last one read as a
     terminal animation rather than a field. One glyph everywhere with a continuous brightness is the
     smooth version of the same idea, and opacity is the one property that costs nothing to change. */
  "var frag=document.createDocumentFragment(), cells=[]",
  'for(var i=0;i<N;i++){',
  "  var c=document.createElement('i')",
  "  c.textContent='\u00b7'",
  '  frag.appendChild(c); cells.push(c)',
  "  if(i%COLS===COLS-1) frag.appendChild(document.createElement('br'))",
  '}',
  'host.appendChild(frag)',
  'var t=0',
  'function frame(){',
  '  if(!document.body.contains(host)) return',
  '  t+=0.055',
  '  for(var y=0;y<ROWS;y++){',
  '    for(var x=0;x<COLS;x++){',
  /* one field folded into the next, which is what stops it looking like a grid of sine waves */
  '      var q=Math.sin(x*0.13+t*0.9)+Math.cos(y*0.21-t*0.6)',
  '      var r=Math.sin((x*0.07+y*0.11)+q*0.8+t*0.5)',
  '      var v=Math.sin(x*0.05-y*0.08+r*1.6+t*0.35)',
  '      var a=(v+1)/2',
  '      a=a*a*(3-2*a)',
  /* raised to a power so most of the grid falls away and only the crests are lit: a field where
     every cell is half on reads as a grey rectangle rather than as something moving through */
  '      a=a*a*a',
  /* and a soft round falloff, because the edge of the grid is not part of the picture */
  '      var dx=(x/COLS-0.5)*2.05, dy=(y/ROWS-0.5)*2.05',
  '      var d=Math.sqrt(dx*dx+dy*dy)',
  '      var m=1-Math.min(1,Math.max(0,(d-0.25)/0.85))',
  '      m=m*m*(3-2*m)',
  '      cells[y*COLS+x].style.opacity=(a*m).toFixed(3)',
  '    }',
  '  }',
  '  requestAnimationFrame(frame)',
  '}',
  'frame()',
  '})()',
].join(String.fromCharCode(10))

/**
 * What a motion is actually made of, read off its own stylesheet.
 *
 * The note names the idea and the card showed nothing else, so choosing between five of them meant
 * watching each in turn and holding the differences in your head. Every fact worth knowing is already
 * in the css: how many parts move, how far apart they start, how long one takes, and which properties
 * are touched. That last one is the difference between motion that holds sixty frames and motion that
 * does not, and it is the first thing anybody experienced would ask.
 */
/**
 * The facts come from the server, which computes them with the same tested function the gates use.
 *
 * There were two implementations of this: tempo() in typescript and a regex copy in this page. The
 * copy shipped two bugs on its own, reading 3.2s as 2s because its pattern could not see a decimal
 * point, and throwing on load because a backslash in a template literal is eaten before the browser
 * sees it. One implementation, measured once.
 */
/* what the rendering saw, beside what the sheet says: the two answer different questions */
const seenLine = (o)=>{
  const v=o.seen; if(!v) return ''
  const bits=[v.stir+'% of it moves']
  if(v.blank) bits.push(v.blank+'% blank at the first frame')
  if(v.escape) bits.push('strays '+v.escape+'px outside')
  return bits.join(' &middot; ')
}
const factLine = (o)=>{
  const t=o.tempo; if(!t) return ''
  const bits=[]
  const parts=(t.gaps?t.gaps.length:0)+1
  bits.push(parts>1?parts+' parts':'one part')
  if(t.gaps&&t.gaps.length) bits.push(Math.round(t.gaps.reduce((a,b)=>a+b,0)/t.gaps.length)+'ms apart')
  if(t.durations&&t.durations.length) bits.push(Math.round(Math.max.apply(null,t.durations))+'ms each')
  if(t.span) bits.push('over in '+(t.span/1000).toFixed(1)+'s')
  if(t.paints&&t.paints.length) bits.push(t.paints.slice(0,3).join(', '))
  return bits.join(' &middot; ')
}


/** the component as it is, so the left rail is a thing you browse rather than a thing you submit */
function peek(){
  const lens=document.getElementById('depth').value
  const q='?file='+encodeURIComponent(file)+'&palette='+encodeURIComponent(palette.value)
    +(cam.value?'&camera='+cam.value+'&depth='+lens:'')
  grid.innerHTML='<figure class="solo"><iframe data-i="0" src="/__wall/peek'+q+'"></iframe><figcaption>'
    +'<b>'+file.split('/').pop()+'</b><span class="verb">as written, nothing added yet. '
    +'Press <b>Give it motion</b> for options.</span></figcaption></figure>'
}

/* a request that never comes back would leave the button reading Writing for as long as the tab is
   open, so every ask carries its own deadline and says so if it runs out */
let inflight=null
async function post(where, body, ms){
  if(inflight) inflight.abort()
  const c=new AbortController(); inflight=c
  const bell=setTimeout(()=>c.abort(), ms)
  try{
    const r=await fetch(where,{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify(body),signal:c.signal})
    if(!r.ok) throw new Error('the studio answered '+r.status)
    return await r.json()
  }finally{ clearTimeout(bell); if(inflight===c) inflight=null }
}
/**
 * What there is to write motion for, which is not the same question as where the studio is aimed.
 *
 * These guards were written when a pick could only come from an app the studio was proxying, so
 * asking whether one was aimed at answered it. A capture picked on a page the studio could never
 * reach arrives without any of that, and the button then said to pick a component first while
 * holding two of them and offering to give them motion.
 *
 * So it asks what it has. Several picks are a rail however they arrived, one is one, and a file is
 * what is left when there are no picks at all.
 */
ask.onclick=async()=>{
  if(!picks.length && !file) return alert(APP
    ? 'Press Pick element, then click something in your app.'
    : 'Nothing to give motion to yet. Aim at a site and pick something, open a component on the '
      + 'left, or pick on a page you are signed into and paste it in.')
  if(ask.disabled) return
  verdict=null
  ask.disabled=true; askSays('Writing…')
  if(picks.length>1){
    grid.innerHTML=WAITER(); runShader()
    drops.textContent=''
    try{
      const r=await post('/__wall/rail',{picks,palette:palette.value},420000)
      /* the one place an arrangement is born, and so the one place worth waiting for the module. It
         has already waited minutes on the model, so this costs nothing and every synchronous reader
         below it can stop asking whether the import landed */
      await arriving
      arr=ARR.fromRail(r.cars||[], picks); zoom=0; sel=new Set(); lead=null; anchor=null; rails=[]; railN=0
      /* choosing first, composing second, which is the order the single element path has always had
         and the several element path skipped entirely */
      stage='choosing'; subjectN=0
      opts=[]; held.clear(); ends.clear(); render()
      const moved=ARR.live(arr).length
      const lost=arr.cars.filter(c=>!c.motion)
      drops.innerHTML=moved+' of '+arr.cars.length+' moved.'
        +(moved?' They begin a beat apart, and the sequence below can be dragged.':'')
        +(lost.length?'<br>'+lost.map(c=>'<b>'+c.pick.label+'</b> did not: '+String(c.why||'')).join('<br>'):'')
    }catch(e){ verdict={dropped:[],error:String(e && e.message||e)}; render() }
    ask.disabled=false; drawSel(); return
  }
  chosen=picks[picks.length-1]||chosen
  grid.innerHTML=WAITER(); runShader()
  drops.textContent=''
  try{
    const r=await post('/__wall/motion',
      /* a pick if there is one, whatever brought it, and the file only when there is not */
      Object.assign({count:Number(document.getElementById('count').value)},
        picks.length?chosen:{file}), 360000)
    opts=r.kept||[]; arr=null; opened=null; held.clear(); ends.clear()
    verdict = opts.length ? null : {dropped:r.dropped||[], error:r.error}
    render()
    drops.textContent=(r.dropped&&r.dropped.length&&opts.length? r.dropped.length+' dropped: '
      +r.dropped.map(d=>d.why.split('.')[0]).join('; ')+'. ' : '')
      +(r.styled?'Styled with '+r.styled+'.':'')
  }catch(e){
    verdict={dropped:[],error: e && e.name==='AbortError'
      ? 'The studio did not answer within six minutes. It may still be working: the terminal says what it is doing.'
      : String(e && e.message ? e.message : e)}
    opts=[]; render() }
  ask.disabled=false; askSays('Give it motion')
}
/* the shot is chosen by the chip grid now, which renders itself; a hidden input fires no change
   event of its own, so drawCamMenu does the rendering where the select used to */
document.getElementById('depth').onchange=render
palette.onchange=render
const menu=document.getElementById('menu'), moreBtn=document.getElementById('more')
const insp=document.getElementById('inspector'), inspBtn=document.getElementById('inspect')
let chosenOpt=null   // the option the inspector is pointed at
const reel=document.getElementById('reel'), models=document.getElementById('models')
const PANELS=[menu,insp,reel,models]
const pop=(panel)=>{ for(const q of PANELS) q.hidden = q!==panel || !q.hidden }
const shut=()=>{ for(const q of PANELS) q.hidden=true }
moreBtn.onclick=e=>{ e.stopPropagation(); pop(menu) }

/**
 * The model panel.
 *
 * The catalogue is fetched rather than written into this page, because the list of places a request
 * can go is knowledge and belongs with the rest of it, and because a worker serving this same page
 * would offer a different list: no command line there, and no localhost either.
 */
const byId=(id)=>document.getElementById(id)
let CAT=[], CUR=null
async function loadModels(){
  const r=await fetch('/__wall/model').then(r=>r.json()).catch(()=>null)
  if(!r) return
  CAT=r.providers||[]; CUR=r.current||null
  byId('mprov').innerHTML=CAT.map(p=>'<option value="'+p.id+'"'
    +(CUR&&p.id===CUR.provider?' selected':'')+'>'+p.label+'</option>').join('')
  drawModelForm(true)
}
function drawModelForm(saved){
  const p=CAT.find(x=>x.id===byId('mprov').value)||CAT[0]; if(!p) return
  const same=!!CUR&&CUR.provider===p.id
  byId('mtag').textContent=CUR?(CUR.label+(CUR.model?', '+CUR.model:'')):'the default'
  byId('mnote').textContent=(p.note||'')
    +(p.browser?' A page is allowed to call it directly, so on a deployment the key can stay in the browser.':'')
  byId('mlist').innerHTML=(p.models||[]).map(m=>'<option value="'+m+'">').join('')
  byId('mmodel').placeholder=(p.models&&p.models[0])||'model name'
  byId('mbase').placeholder=p.base||'https://your endpoint'
  /* offered by every provider that talks over http, not only the ones that demand it: a gateway or
     a self hosted endpoint usually wants a key even though nothing here can know that it does */
  byId('mkeyrow').hidden=p.shape==='cli'
  byId('mkey').title=(p.needs||[]).includes('key')?'required':'optional for this one'
  byId('mforget').hidden=!same||!CUR.hasKey
  byId('mkey').placeholder=(same&&CUR.hasKey)?'set, leave blank to keep it'
    :((p.needs||[]).includes('key')?'required':'optional')
  if(saved&&same){ byId('mmodel').value=CUR.model||''; byId('mbase').value=CUR.base||'' }
  if(!same){ byId('mmodel').value=''; byId('mbase').value=''; byId('mkey').value='' }
}
const modelForm=()=>({ provider:byId('mprov').value, model:byId('mmodel').value.trim(),
  base:byId('mbase').value.trim(), key:byId('mkey').value||undefined })
byId('modelbtn').onclick=e=>{ e.stopPropagation(); pop(models); loadModels() }
byId('setbtn').onclick=e=>{ e.stopPropagation(); shut(); models.hidden=false; loadModels() }
byId('savedbtn').onclick=e=>{
  e.stopPropagation(); shut()
  viewing = viewing==='saved' ? null : 'saved'
  byId('savedbtn').classList.toggle('on', viewing==='saved')
  render()
}

byId('mprov').onchange=()=>drawModelForm(false)
byId('msave').onclick=async()=>{
  const b=byId('msave'); b.disabled=true; b.textContent='Saving'
  const r=await fetch('/__wall/model',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify(modelForm())}).then(r=>r.json()).catch(e=>({error:String(e.message||e)}))
  b.disabled=false; b.textContent='Use this'
  if(r.error){ byId('mout').textContent=r.error; return }
  CUR=r.current; byId('mkey').value=''
  byId('mout').textContent='Saved. Motion is written with '+CUR.label
    +(CUR.model?', '+CUR.model:'')+' from now on.'
  drawModelForm(true)
}
byId('mtest').onclick=async()=>{
  const b=byId('mtest'); b.disabled=true; b.textContent='Testing'
  byId('mout').textContent='Asking it for one word.'
  const r=await fetch('/__wall/model/check',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify(modelForm())}).then(r=>r.json()).catch(e=>({ok:false,why:String(e.message||e)}))
  b.disabled=false; b.textContent='Test it'
  byId('mout').textContent=r.ok
    ? 'Answered in '+(r.ms/1000).toFixed(1)+' seconds, saying: '+r.said
    : 'It did not answer. '+r.why
}
byId('mforget').onclick=async()=>{
  const r=await fetch('/__wall/model',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({ ...modelForm(), key:null })}).then(r=>r.json()).catch(e=>({error:String(e.message||e)}))
  if(r.error){ byId('mout').textContent=r.error; return }
  CUR=r.current; byId('mkey').value=''
  byId('mout').textContent='The stored key is gone.'
  drawModelForm(true)
}
inspBtn.onclick=e=>{ e.stopPropagation(); pop(insp); drawInspector() }
menu.onclick=e=>e.stopPropagation()
insp.onclick=e=>e.stopPropagation()
reel.onclick=e=>e.stopPropagation()
models.onclick=e=>e.stopPropagation()
addEventListener('click',shut)
addEventListener('keydown',e=>{ if(e.key==='Escape') shut() })

/**
 * What the inspector is looking at.
 *
 * There were two rooms for this and they did not know about each other. The inspector adjusted an
 * option's speed and spacing and easing; the timeline row set a car's offset and its camera. So on a
 * rail you could say when a car started and what filmed it but not how fast it moved, and the
 * inspector sat there still showing whichever option you had opened before you built the rail. The
 * controls were never missing. They were in a room you had left.
 *
 * So a row on the timeline is a selection, and the inspector points at whatever is selected, car or
 * option. One subject at a time, one place that edits it, and the timeline stays a timeline instead
 * of growing a control panel on every row.
 */
/* the car is handed back beside its motion, and o still means the thing with an id and a note, so
   everything reading o.id or o.note is unchanged and only when-it-starts and what-films-it moved */
function subject(){
  if(railed()&&lead!==null&&arr.cars[lead]&&arr.cars[lead].motion){
    return { kind:'car', car:arr.cars[lead], i:lead, o:arr.cars[lead].motion }
  }
  const o=opts.find(x=>x.id===chosenOpt)
  return o ? { kind:'opt', o } : null
}
const nameOf = (o) => String((o&&(o.note||o.label))||(o&&o.pick&&o.pick.label)||'untitled')
  .split(',')[0].slice(0,28)

/* Paired, and in the order somebody reaches for them: nothing, the two held shots, in and out,
   across and up, then the two that never quite settle. The opposite of every choice is next to it,
   because the question is usually which way rather than whether. */
const CAMS=[['','none'],['flat','flat on'],['locked','locked'],['push','push in'],
  ['pull','pull out'],['pan','pan'],['crane','crane'],['orbit','orbit'],['drift','drift'],
  ['sway','sway']]
/* what a component is shown against. As picked is first, because the page's own answer is right
   until it is not, and guessing on its behalf is worse than asking */
const PAPERS=[['','as picked'],['light','light'],['dark','dark'],['none','the stage']]
function drawPapers(now){
  const box=document.getElementById('papers'); if(!box) return
  box.innerHTML=PAPERS.map(k=>'<button class="paperchip'+(k[0]===now?' on':'')
    +'" data-paper="'+k[0]+'"><span class="papbox pap-'+(k[0]||'as')+'"></span><em>'
    +k[1]+'</em></button>').join('')
  box.querySelectorAll('[data-paper]').forEach(b=>b.onclick=()=>{
    const s=subject(); if(!s||s.kind!=='car') return
    if((s.car.paper||'')===b.dataset.paper) return
    mark('what '+nameOf(s.o)+' is shown against')
    arr=ARR.papered(arr,s.i,b.dataset.paper)
    held.clear(); ends.clear(); render(); drawInspector()
  })
}
/* One grid in two homes. The inspector aims at one car and the settings menu aims at whatever is on
   screen, but it is the same question and showing it as chips in one place and a list of words in
   the other made the menu look like a different, worse feature. */
function camMarkup(now){
  return CAMS.map(c=>'<button class="camchip'+(c[0]===now?' on':'')+'" data-campick="'+c[0]
    +'" title="'+c[1]+'"><span class="cambox cam-'+(c[0]||'none')+'"><i></i></span><em>'
    +c[1]+'</em></button>').join('')
}
function drawCamMenu(){
  const box=document.getElementById('camgrid'); if(!box) return
  box.innerHTML=camMarkup(cam.value||'')
  box.querySelectorAll('[data-campick]').forEach(b=>b.onclick=()=>{
    if(cam.value===b.dataset.campick) return
    cam.value=b.dataset.campick
    drawCamMenu(); render()
  })
}
function drawCams(now){
  const box=document.getElementById('cams')
  box.innerHTML=camMarkup(now)
  box.querySelectorAll('[data-campick]').forEach(b=>b.onclick=()=>{
    const s=subject(); if(!s||s.kind!=='car') return
    if((s.car.shot||'')===b.dataset.campick) return
    mark('the camera on '+nameOf(s.o))
    arr=ARR.retimed(arr,s.i,{shot:b.dataset.campick})
    held.clear(); ends.clear(); render(); drawInspector()
  })
}
/* drawn here rather than beside the rest of the menu wiring, because CAMS is a const declared above
   this line and reading it from up there is a page that stops running at boot with every listener
   below the fault silently missing */
drawCamMenu()
function drawInspector(){
  const s=subject()
  const tag=document.getElementById('itag'), facts=document.getElementById('ifacts')
  const btn=document.getElementById('tapply'), camrow=document.getElementById('icam')
  const note=document.getElementById('inote')
  if(!s){
    tag.textContent='nothing chosen'
    facts.innerHTML = railed()
      ? 'Click a row in the sequence below to adjust that one.'
      : 'Click an option below to choose it.'
    btn.disabled=true; camrow.hidden=true; return
  }
  const o=s.o
  tag.textContent=nameOf(o)
  btn.disabled=false
  if(s.kind==='car'){
    /* when it starts is the resolved answer rather than the stored one, or a car pinned to another
       would report the offset it is no longer using */
    const at=ARR.resolve(arr).at[s.i]
    facts.innerHTML='Starts at '+(at/1000).toFixed(2)+'s and runs '+((o.ms||600)/1000).toFixed(2)+'s.'
    btn.textContent='Apply to this one'
    note.textContent='Changes this car where it sits. The others are left alone.'
    camrow.hidden=false; drawCams(s.car.shot||''); drawPapers(s.car.paper||'')
  } else {
    facts.innerHTML=factLine(o)
    btn.textContent='Add as a new option'
    note.textContent='The original stays. Adjusting makes another one beside it.'
    camrow.hidden=true
  }
}
document.getElementById('tapply').onclick=async()=>{
  const s=subject(); if(!s) return
  const o=s.o, was=document.getElementById('tapply').textContent
  const btn=document.getElementById('tapply'); btn.disabled=true; btn.textContent='Adjusting…'
  const r = await post('/__wall/tune',{ id:o.id,
    duration:Number(document.getElementById('tdur').value),
    stagger:Number(document.getElementById('tstag').value),
    ease:document.getElementById('tease').value }, 20000).catch(e=>({error:String(e.message||e)}))
  btn.disabled=false; btn.textContent=was
  if(r.error){ document.getElementById('inote').textContent=r.error.slice(0,120); return }
  if(s.kind==='car'){
    /* a car is one voice in a composition, so retiming it replaces it where it stands. Adding a
       sixth car nobody asked for would be answering a different question.
       The tuned motion joins the ones this car already has rather than replacing the record in
       place: writing through a motion would leave every history step holding the tuned id, so
       undoing a tune would hand back the tune. It also means a car's alternatives are one list
       however a motion got there, dealt or refined or tuned. */
    mark('adjusting '+nameOf(o))
    const tune={ duration:Number(document.getElementById('tdur').value),
      stagger:Number(document.getElementById('tstag').value),
      ease:document.getElementById('tease').value }
    const grown=ARR.offered(arr,s.i,[{ ...o, id:r.id, tempo:r.tempo,
      ms:(r.tempo&&r.tempo.span)||o.ms, note:o.note }])
    arr=ARR.retimed(ARR.swapped(grown,s.i,
      grown.cars[s.i].alternatives.findIndex(m=>m.id===r.id)),s.i,{tune})
    chosenOpt=r.id
    held.clear(); ends.clear(); render(); drawInspector()
    document.getElementById('inote').textContent='Applied. Undo puts it back the way it was.'
    return
  }
  // beside the one it came from, so the two can be held at the same instant and compared
  mark('adjusting '+nameOf(o))
  const at = opts.findIndex(x=>x.id===o.id)
  opts.splice(at+1, 0, { ...o, id:r.id, css:r.css, note:o.note+' (adjusted)' })
  chosenOpt=r.id; held.clear(); ends.clear(); render(); drawInspector()
  document.getElementById('inote').textContent='Added beside the original, which is untouched.'
}
/**
 * What Film is pointed at, said out loud rather than guessed.
 *
 * It used to take the first iframe in the grid. On a rail that is the rail, which is right, but on a
 * grid of five options that is option one, and it filmed it without ever saying so: you pressed Film
 * on a wall of five and got a film of whichever happened to be first. A wrong result delivered
 * confidently is worse than a refusal, so a grid of several asks you to open one first.
 */
function filmable(){
  if(railed()){
    /* several arrangements on screen is the same trap a grid of five options already was: taking the
       first frame would film take one and never say it had chosen. Keep one, then film it */
    if(comparing()) return { why:'Several arrangements are on screen. Keep the one you want first, so '
      +'the film is of something you chose rather than of whichever happens to be on the left.' }
    const f=grid.querySelector('.appwrap iframe')
    return f ? { frame:f, what:'the rail' } : { why:'the rail is not on screen yet' }
  }
  if(!opts.length){
    const f=grid.querySelector('.appwrap iframe')
    return f ? { frame:f, what:'the page' } : { why:'Nothing on screen to film.' }
  }
  if(opts.length>1 && !opened)
    return { why:'Open one option first. Film takes one thing at a time, and from the grid it would '
      +'quietly take the first of '+opts.length+'.' }
  const o = opened ? opts.find(x=>x.id===opened) : opts[0]
  if(!o) return { why:'That option is gone.' }
  const f=grid.querySelector('iframe[data-i="'+opts.indexOf(o)+'"]')
  return f ? { frame:f, what:nameOf(o) } : { why:'That option is not on screen.' }
}
/**
 * Filming, in the page.
 *
 * There were two of these for a while, and a setting to choose between them, which was the wrong
 * answer to a real question. The other one drove a second headless browser to screenshot the frame
 * ninety times and shelled out to ffmpeg, and it rendered exactly what chromium renders, which
 * sounds like the one to keep until you check whether it runs: playwright is a development
 * dependency and absent from the published package, and ffmpeg is something a person may happen to
 * have. On a clean install that path produced no film at all. A path that is not installed is not
 * more faithful than one that is, and offering two means trusting neither.
 *
 * So this is the only one. The frame is already on screen, the browser has encoded h264 since 2021,
 * and the clock is stepped by hand rather than recorded, so a frame in the file is still the frame
 * you were looking at and the same arrangement gives the same film every time.
 *
 * Its limits are real and they are specific. Drawing the dom means going through an svg
 * foreignObject, which cannot draw a nested frame, a canvas, a shadow root, a backdrop filter or a
 * blend mode. Measured against the headless path on four real pages the difference was between 0.02
 * and 0.46 percent of pixels and all of it was antialiasing, so the honest thing is not a warning on
 * every film. It is to look at this document for the five things that actually break, and say so on
 * the one film where they are present.
 */
async function filmHere(frame, want, say){
  const doc=frame.contentDocument
  if(!doc) throw new Error('that frame cannot be read from here, so the server has to film it')
  const [R,M]=await Promise.all([import('/__wall/raster.mjs'),import('/__wall/mp4.mjs')])
  if(!M.supported()) throw new Error('this browser has no video encoder, so the server has to film it')
  /* the preview drives its own clock and would fight the raster, so it is held first */
  try{ frame.contentWindow.postMessage({wall:'hold',t:0,i:0},'*') }catch{}
  await new Promise(r=>setTimeout(r,120))
  const total=Math.max(1,Math.round(want.ms/1000*want.fps))
  say('Reading what it needs')
  // once for the whole film: refetching a font ninety times is most of the wall clock
  const inlined=await R.inline(doc,{fetchVia:(u)=>fetch('/__wall/asset?u='+encodeURIComponent(u))})
  async function* stream(){
    for(let i=0;i<total;i++){
      yield await R.rasterize(doc,{width:want.w,height:want.h,
        ms:Math.round(i/want.fps*1000),inlined})
    }
  }
  // streamed rather than collected: ninety canvases at 1280 by 720 is a third of a gigabyte held
  // for no reason, when the encoder only ever looks at one of them
  const bytes=await M.encode(stream(),{width:want.w,height:want.h,fps:want.fps,
    onProgress:(done)=>say('Drawing frame '+done+' of '+total)})
  return {bytes,total,notes:(inlined&&inlined.notes)||[],limits:R.limits(doc)}
}
const SHAPES={wide:{w:1280,h:720},square:{w:1080,h:1080},tall:{w:1080,h:1350}}
let takes=[]
/* every take kept and switchable, because comparing two is the only reason to shoot a second */
function showReel(t){
  document.getElementById('reeltag').textContent=t.name
  document.getElementById('reelfacts').textContent=t.facts
  document.getElementById('reelvid').src=t.url
  const get=document.getElementById('reelget')
  get.href=t.url; get.setAttribute('download',t.name+'.mp4')
  document.getElementById('reelnote').textContent=t.note||''
  const box=document.getElementById('takes')
  box.innerHTML=takes.length>1?takes.map((x,i)=>'<button class="take'+(x===t?' on':'')
    +'" data-take="'+i+'">'+esc(x.name)+'</button>').join(''):''
  box.querySelectorAll('[data-take]').forEach(b=>b.onclick=()=>showReel(takes[Number(b.dataset.take)]))
  shut(); reel.hidden=false
}
document.getElementById('film').onclick=async()=>{
  const aim=filmable()
  if(aim.why){ drops.textContent=aim.why; return }
  const frame=aim.frame
  const btn=document.getElementById('film'); btn.disabled=true
  /* The transport stops for the length of the film. Filming copies this document once per frame,
     and the rAF loop was going on seeking the original in between the copies: holdAt writes what
     gets drawn and wins, so the picture was never visibly wrong, but it is a document being changed
     while it is read, and it is the whole transport running for the length of a render that nobody
     is watching. It is put back the way it was found, because pressing Film should not also be a
     way of pausing. */
  const wasRunning=running
  running=false; face()
  const say=(m)=>{ btn.textContent=m; drops.textContent=m }
  const base=(APP?(chosen&&chosen.label)||'element':(file||'film')).split('/').pop().replace(/[^A-Za-z0-9_-]+/g,'-')
  const n=takes.filter(t=>t.name===base||t.name.startsWith(base+' ')).length
  const name=n?base+' '+(n+1):base
  const shape=document.getElementById('shape').value
  const size=SHAPES[shape]||SHAPES.wide
  const ms=Math.max(1200, span+400), fps=30
  try{
    say('Filming')
    const {bytes,total,notes,limits}=await filmHere(frame,{ms,fps,w:size.w,h:size.h},say)
    const url=URL.createObjectURL(new Blob([bytes],{type:'video/mp4'}))
    /* said only when it applies. A film of a component with no canvas and no blend mode in it has
       nothing to warn about, and a standing disclaimer on every one of them teaches you to skip
       the line that will one day matter */
    const trouble=(limits||[]).map(l=>l.n+' '+l.what).join('. ')
    takes.push({ name, url,
      facts:total+' frames at '+fps+'fps, '+(total/fps).toFixed(1)+'s, '+size.w+' by '+size.h
        +', of '+aim.what,
      note:(notes.length?notes.length+' asset'+(notes.length>1?'s':'')+' would not load. ':'')
        +(trouble?'This one has '+trouble+', so check the film against the preview.'
          :'Drawn here, so nothing was installed and nothing was uploaded.') })
    showReel(takes[takes.length-1]); drops.textContent=''
  }catch(e){
    // said rather than swallowed: the browser path refuses for reasons a person can act on
    drops.textContent=String(e && e.message||e)
  }
  running=wasRunning; face()
  btn.disabled=false; btn.textContent='Film'
}
document.getElementById('save').onclick=async()=>{
  // a rail is a thing worth handing over too, and it was the one result you could not export
  /* lastIndexOf rather than a pattern. The regex here was /\.[^.]+$/ written inside a template
     literal, which delivers the browser an unescaped dot that matches any character, so a file
     called my.component.tsx came back as my.componen */
  const stem=(v)=>{const k=String(v||'').lastIndexOf('.'); return k>0?String(v).slice(0,k):String(v||'')}
  /* a rail is a composition, so what it hands over is the sequencing as well as the motions. Sending
     the ids alone exported every car starting together, which is the one decision a rail records */
  const rail = !opts.length && railed()
  const rows = rail ? ARR.live(arr) : []
  const when = rail ? ARR.resolve(arr).at : []
  const ids = opts.length ? opts.map(o=>o.id) : rows.map(x=>x.car.motion.id)
  if(!ids.length) return
  const btn=document.getElementById('save'); btn.textContent='Writing…'
  const r=await fetch('/__wall/export',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({ids,palette:palette.value,
      at: rail ? rows.map(x=>Math.round(when[x.i])) : [],
      shots: rail ? rows.map(x=>x.car.shot||'') : [],
      place: rail ? rows.map(x=>x.car.place
        ? Math.round(x.car.place.x)+'_'+Math.round(x.car.place.y)+'_'+Math.round(x.car.place.w) : '') : [],
      name:stem((APP?(chosen&&chosen.label):file||'').split('/').pop())})}).then(r=>r.json())
  btn.textContent='Export'
  /* said rather than assumed. Every one of these was dropped on the way out at some point, and each
     time the file looked complete, so the line names what actually travelled */
  const shot = rail && rows.some(x=>x.car.shot)
  const put = rail && rows.some(x=>x.car.place)
  drops.textContent='Wrote '+r.at+', '+r.kb+'kb. One file, opens anywhere, no requests.'
    +(rail?' The cars keep their offsets'+(put?', where you put them':'')
      +(shot?' and their cameras':'')+'.':'')
}
document.getElementById('rate').onchange=e=>{rate=parseFloat(e.target.value)}

function render(){
  dressHeader()
  /* every change ends in a render, so this is the one place worth leaving the work from */
  keepWork()
  if(viewing==='saved'){ drawSaved(); return }
  /**
   * The room, choosing a motion for one picked element at a time.
   *
   * The same cards the single element path has always shown, because they are the thing that makes
   * this a tool for choosing rather than a generator with a preview. The strip above them says which
   * element you are choosing for and how far through you are; the button below appears once every
   * one of them has something, and takes the whole set to the rail.
   */
  if(stage==='choosing'&&railed()){
    const on=ARR.live(arr)
    const at=Math.min(subjectN,on.length-1)
    const seat=on[at], car=seat.car
    /* before the markup rather than after it: an opened card belonging to the element you were on a
       moment ago would otherwise put the grid into its one card view with no card to show */
    if(opened&&!car.alternatives.some(m=>m.id===opened)) opened=null
    const lens=document.getElementById('depth').value
    const q='?palette='+encodeURIComponent(palette.value)
      +(cam.value?'&camera='+cam.value+'&depth='+lens:'')
    const done=on.filter(x=>x.car.alternatives.length<2||ARR.chosenAlt(x.car)>=0).length
    grid.innerHTML='<div class="chooser">'
      + '<div class="chhead"><div class="chwho">'
      + on.map((x,k)=>'<button class="chtab'+(k===at?' on':'')+'" data-subject="'+k+'">'
          +'<span class="chface"><iframe data-face="'+x.i+'" scrolling="no" tabindex="-1"></iframe></span>'
          +'<em>'+esc(subjectOf(x.car.pick.label))+'</em></button>').join('')
      + '</div>'
      + '<button class="btn go chgo" id="chmake">Make a film</button></div>'
      + '<p class="chsay">Choosing for <b>'+esc(subjectOf(car.pick.label))+'</b>. '
      + car.alternatives.length+' motion'+(car.alternatives.length>1?'s':'')+' for it, '
      + 'and the one you keep is what it plays on the timeline.</p>'
      + '<div class="chgrid'+(opened?' solo':'')+'">'
      + car.alternatives.map((m,k)=>'<figure class="'
          +(car.motion&&car.motion.id===m.id?'chosen ':'')+(opened===m.id?'up':'')+'">'
          +'<iframe data-i="'+k+'" src="/__wall/preview/'+m.id+q+'"></iframe>'
          +'<figcaption><b title="timing from '+esc(m.verb)+'. '+esc(m.scope)+'">'
          +esc(m.note||'untitled')+'</b>'
          +'<span class="facts">'+factLine(m)+'</span>'
          +'<span class="seen">'+seenLine(m)+'</span>'
          +'<span class="row">'
          /* the same three a single element's cards have always had. A card three hundred pixels
             wide is a thumbnail of a decision rather than the decision, and that is as true of one
             of several elements as it was of the only one */
          +'<button class="icb" data-open-alt="'+m.id+'" title="'
          +(opened===m.id?'Close it':'Open it bigger')+'">'
          +(opened===m.id?ICON.shut:ICON.open)+'</button>'
          +'<button class="icb" data-pick-alt="'+k+'" title="Keep this one for this element">'
          +(car.motion&&car.motion.id===m.id?ICON.kept:ICON.mark)+'</button>'
          +'<button class="icb" data-more-alt="'+k+'" title="More like this one">'+ICON.more+'</button>'
          +'</span></figcaption></figure>').join('')
      + '</div></div>'
    grid.classList.remove('railed')
    grid.style.removeProperty('--tl')
    paintFaces()
    for(const t of document.querySelectorAll('[data-subject]')) t.onclick=()=>{
      subjectN=Number(t.dataset.subject); held.clear(); ends.clear(); render(); drawSel() }
    for(const bK of document.querySelectorAll('[data-pick-alt]')) bK.onclick=()=>{
      mark('the motion for '+subjectOf(car.pick.label))
      arr=ARR.swapped(arr,seat.i,Number(bK.dataset.pickAlt))
      held.clear(); ends.clear(); render() }
    for(const bM of document.querySelectorAll('[data-more-alt]')) bM.onclick=()=>
      moreLikeCar(seat.i, Number(bM.dataset.moreAlt))
    for(const bO of document.querySelectorAll('[data-open-alt]')) bO.onclick=()=>{
      opened = opened===bO.dataset.openAlt ? null : bO.dataset.openAlt
      held.clear(); ends.clear(); render() }
    const go=document.getElementById('chmake')
    if(go) go.onclick=()=>{ stage=null; held.clear(); ends.clear(); render(); drawSel(); drawInspector() }
    drops.textContent=done+' of '+on.length+' chosen.'
    return
  }
  if(railed()){
    const live=ARR.live(arr)
    /* the one place every change already ends, so it is the one place the list is brought back into
       step with the arrangement being edited */
    if(rails.length) rails[railN]=arr
    /* the frame is asked for by the module rather than by a string built here, which is what keeps a
       car pinned to another one from ever reaching the server: it resolves to plain offsets first */
    const frames = comparing()
      ? rails.map((t,n)=>'<div class="appwrap'+(n===railN?' on':'')+'" data-arr="'+n+'">'
          +'<iframe data-i="'+n+'" src="'+ARR.urlOf(t,palette.value)+'"></iframe>'
          +'<span class="railby">'+(n===railN?'editing ':'')+esc('take '+(n+1))+'</span></div>').join('')
      : '<div class="appwrap"><iframe data-i="0" src="'+ARR.urlOf(arr,palette.value)+'"></iframe></div>'
    grid.innerHTML='<div class="rails'+(comparing()?' many':'')+'">'+frames+'</div>' + timeline(live)
    grid.classList.add('railed')
    // the strip is as tall as it needs to be, and the frame gives up exactly that much
    const strip=document.getElementById('tl')
    if(strip) grid.style.setProperty('--tl', (strip.getBoundingClientRect().height+14)+'px')
    wireTimeline(live)
    /* after the strip has a height, or the track is measured before it has been laid out and the
       playhead and the ruler both align to nothing */
    paintFaces()
    placePlayhead(); markPlayhead(Number(scrub.value)||0)
    return
  }
  if(!opts.length && verdict) return explain()
  if(!opts.length && APP){
    /* Rebuilding this markup restarts the navigation, and a heavy site loading two hundred assets
       responds to that by aborting all of them: measured on vercel, three navigations in a row left
       the frame on chrome's error page. So the frame is only replaced when the aim has actually
       changed, and every other render leaves it loading in peace. */
    const have=grid.querySelector('.appwrap iframe')
    if(have && have.dataset.n===String(aimN)) return
    grid.innerHTML='<div class="appwrap"><iframe data-n="'+aimN+'" src="/__wall/app?n='+aimN
      +(quietMode?'&quiet=1':'')+'"></iframe></div>'
    watchFrame()
    return }
  if(!opts.length){ if(file) return peek()
    grid.innerHTML='<div class="empty">Type a site or a local address on the left to start.</div>'
    return }
  const lens=document.getElementById('depth').value
  const q='?palette='+encodeURIComponent(palette.value)
    +(cam.value?'&camera='+cam.value+'&depth='+lens:'')
  grid.innerHTML=opts.map((o,i)=>
    '<figure><iframe data-i="'+i+'" src="/__wall/preview/'+o.id+q+'"></iframe>'+
    /* the verb and the scope moved into the title. Both are worth having and neither helps you
       choose between five of these, which is the only thing this card is for */
    '<figcaption><b title="timing from '+esc(o.verb)+'. '+esc(o.scope)+'">'+esc(o.note||'untitled')+'</b>'+
    '<span class="facts">'+factLine(o)+'</span>'+
    '<span class="seen">'+seenLine(o)+'</span>'+
    '<span class="row">'+
    '<button class="icb" data-open="'+o.id+'" title="'+(opened===o.id?'Close it':'Open it bigger')+'">'
      +(opened===o.id?ICON.shut:ICON.open)+'</button>'+
    '<button class="icb" data-more="'+o.id+'" title="More like this one">'+ICON.more+'</button>'+
    '<button class="icb'+(kept.has(o.id)?' on':'')+'" data-keep="'+o.id+'" title="'
      +(kept.has(o.id)?'Saved':'Save it')+'">'+(kept.has(o.id)?ICON.kept:ICON.mark)+'</button>'+
    '</span></figcaption></figure>').join('')
  grid.classList.remove('railed')
  grid.classList.toggle('solo', !!opened)
  if(opened && !opts.some(o=>o.id===opened)) opened=null
  document.querySelectorAll('figure').forEach((f,i)=>{
    if(opts[i] && opts[i].id===opened) f.classList.add('up')
    if(opts[i] && opts[i].id===chosenOpt) f.classList.add('chosen')
    f.onclick=e=>{
      if(e.target.closest('button')) return
      chosenOpt = opts[i] ? opts[i].id : null
      document.querySelectorAll('figure').forEach(x=>x.classList.remove('chosen'))
      f.classList.add('chosen')
      drawInspector()
    }
  })
  /* one option filling the room, because a card three hundred pixels wide is a thumbnail of a
     decision rather than the decision. Escape comes back, and the transport keeps driving it */
  document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{
    opened = opened===b.dataset.open ? null : b.dataset.open
    held.clear(); ends.clear(); render()
  })
  document.querySelectorAll('[data-more]').forEach(b=>b.onclick=async()=>{
    const keep=opts.find(x=>x.id===b.dataset.more)
    /**
     * The icon stays and works.
     *
     * This wrote the word "Varying" into the button, which on a twenty six pixel square meant the
     * sparkle was replaced by three clipped letters. The icon is the label here, and a sparkle that
     * is visibly working says the same thing without needing room for it. Same mistake the ask
     * button made with its canvas, one control over.
     */
    b.classList.add('working')
    for (const other of document.querySelectorAll('[data-more]')) other.disabled = true
    ask.disabled=true
    try{
      const r=await post('/__wall/refine',{id:keep.id,count:3},360000)
      // the one you liked stays on screen, with its variations beside it, so the comparison is real
      opts=[keep].concat(r.kept); held.clear(); ends.clear(); render()
      drops.textContent=r.dropped.length? r.dropped.length+' variation'+(r.dropped.length>1?'s':'')
        +' dropped: '+r.dropped.map(d=>d.why.split('.')[0]).join('; ') : 'Variations of the kept motion.'
    }catch(e){ drops.textContent = e && e.name==='AbortError'
      ? 'That took too long and was given up on. The terminal says what it was doing.'
      : String(e && e.message ? e.message : e) }
    // the grid is rebuilt on success, so this button is usually gone by now, which is harmless
    b.classList.remove('working')
    for (const other of document.querySelectorAll('[data-more]')) other.disabled = false
    ask.disabled=false
  })
  document.querySelectorAll('[data-keep]').forEach(b=>b.onclick=async(e)=>{
    e.stopPropagation()
    const o=opts.find(x=>x.id===b.dataset.keep); if(!o) return
    if(kept.has(o.id)){ await shelfDrop(o.id); kept.delete(o.id) }
    else { await shelfPut(record(o)); kept.add(o.id) }
    b.classList.toggle('on',kept.has(o.id))
    b.title=kept.has(o.id)?'Saved':'Save it'
    b.innerHTML=kept.has(o.id)?ICON.kept:ICON.mark
    countSaved()
  })
}

addEventListener('message',e=>{const d=e.data||{}
  /**
   * A component moved to where it belongs on the stage.
   *
   * The frame reports and does not decide, because it is rebuilt from the arrangement on every
   * change: a placement it kept to itself would be lost on the next render, and would disagree with
   * undo until then. While the drag is live the car's own box is moved by hand, exactly as a bar on
   * the timeline is, and the arrangement is written once at the end, because rebuilding the frame per
   * pointermove would reload the document under the cursor sixty times a second.
   */
  /* data-rail counts the cars that move, and a car index counts every row. They agree until one
     pick fails, which is exactly the conflation the timeline already had and had to be taken out of */
  if(d.wall==='chose'&&railed()){
    const x=ARR.live(arr)[Number(d.i)]
    if(x){ anchor=x.i; choose([x.i],x.i); shut(); insp.hidden=false }
    return
  }
  /**
   * A component sent somewhere by a moment in time.
   *
   * Where it sits is one decision and where it goes is another, so alt on the drag says which one is
   * being made. The leg ends at the playhead, because the playhead is where you already put the
   * clock to decide this, and starts a little before it, which is the shortest thing worth watching.
   */
  if(d.wall==='travelled'&&railed()){
    const seat=ARR.live(arr)[Number(d.i)]; if(!seat) return
    const base=seat.car.place||{x:0,y:0,w:100}
    const lands=Math.max(120,Math.round(Number(scrub.value)||0))
    const ms=Math.min(900,Math.max(200,Math.round(lands-ARR.resolve(arr).at[seat.i])))
    mark('sending '+nameOf(seat.car.motion)+' across the stage')
    arr=ARR.travels(arr,seat.i,{ at:Math.max(0,lands-ms), ms,
      x:Number(d.x)-base.x, y:Number(d.y)-base.y, scale:1, ease:'ease' })
    held.clear(); ends.clear(); render(); drawInspector()
    return
  }
  /**
   * The camera sent somewhere, which is a component's journey applied to everything at once.
   *
   * Alt on the stage background, the way alt on a component sends that component: the same gesture
   * at two levels, because a camera move and a component move turned out to be the same shape.
   */
  if(d.wall==='panned'&&railed()&&!d.keep){
    const lands=Math.max(200,Math.round(Number(scrub.value)||0))
    const ms=Math.min(1200,Math.max(300,lands))
    const now=(arr.camera||[]).reduce((v,m)=>({x:m.x,y:m.y,scale:m.scale}),{x:0,y:0,scale:1})
    mark('moving the camera')
    arr=ARR.filmed(arr,{ at:Math.max(0,lands-ms), ms,
      x:now.x+Number(d.x), y:now.y+Number(d.y), scale:now.scale, ease:'ease' })
    held.clear(); ends.clear(); render(); drawInspector()
    return
  }
  if(d.wall==='placed'&&railed()){
    const seat=ARR.live(arr)[Number(d.i)]; if(!seat) return
    const at=seat.i, car=seat.car
    if(!d.done){
      const f=grid.querySelector('.appwrap.on iframe')||grid.querySelector('.appwrap iframe')
      const box=f&&f.contentDocument&&f.contentDocument.querySelector('[data-rail="'+Number(d.i)+'"]')
      if(box){
        const stage=f.contentDocument.querySelector('.rail')
        if(stage) stage.classList.add('staged')
        box.classList.add('put')
        box.style.left=d.x+'%'; box.style.top=d.y+'%'; box.style.width=d.w+'%'
      }
      return
    }
    mark('moving '+nameOf(car.motion)+' on the stage')
    arr=ARR.placed(arr,at,{x:d.x,y:d.y,w:d.w})
    held.clear(); ends.clear(); render()
    return
  }
  if(d.wall==='held'){held.set(d.i,d.n)
    // a motion that runs six seconds cannot be scrubbed to its end on a four second ruler, and the
    // only thing that knows how long it runs is the animation itself
    if(d.end>0){ends.set(d.i,d.end); const want=Math.max(1200,Math.min(20000,Math.max(...ends.values())+300))
      if(Math.abs(want-span)>60){span=want;scrub.max=span;document.getElementById('span').textContent=(span/1000).toFixed(1)+'s'}}
    paint()}
  /**
   * The app saying its own api will not talk to it here.
   *
   * Proxying puts somebody's application on this origin, and an application that calls its own api
   * on another host is making a cross origin request the moment it runs here. That api allows its
   * own site and not this one, so the call is refused, the app never authenticates and it sits on
   * its shell. Nothing is broken and nothing can be fixed from here, so what matters is saying it:
   * a dark empty frame with no explanation is the tool looking broken on the app's behalf.
   */
  /**
   * The app saying its own back end will not talk to it here.
   *
   * Kept rather than announced. Plenty of healthy sites have a call refused on this origin and do
   * not care: stripe.com renders every one of its two and a half thousand nodes while its own
   * telemetry host is turned away, and telling somebody their app is broken because a beacon failed
   * would be worse than saying nothing. What makes this worth saying is the two together, a page
   * with nothing on it and its own back end refusing it, which is the difference between an app
   * that cannot run here and an app that simply does not need that request.
   */
  if(d.wall==='refused'&&d.host){ turnedAway=String(d.host); return }
  if(d.wall==='armed'||d.wall==='disarmed'){
    const pb=document.getElementById('pick')
    pb.setAttribute('aria-pressed',d.wall==='armed')
    /* the label only: setting textContent here used to replace the icon along with the word.
       And the key is drawn as a key. "Picking, esc to stop" is a sentence you read; a cap sitting
       in the button is a thing you recognise without reading it, which is what you want from a
       state you are only in for a couple of seconds */
    const lbl=pb.querySelector('.lbl')
    if(d.wall==='armed') lbl.innerHTML='Picking<kbd class="cap">esc</kbd>'
    else lbl.textContent='Pick'
    pb.classList.toggle('on',d.wall==='armed')
  }
  if(d.wall==='picked'){
    chosen={html:d.html,css:d.css,shot:d.shot,label:d.label,w:d.w,h:d.h,n:d.n,
      cut:d.cut,opaque:d.opaque,weak:d.weak}
    picks.push(chosen)
    drawSel()
    paint()
  }})

/**
 * The pill shows the element rather than naming it.
 *
 * A generated class name is not a description of anything: div.MwJdiW_container.qM tells you which
 * element the studio thinks you meant only if you happen to know that hash, and on a site built with
 * css modules or styled components every name looks like that. The element itself is unambiguous, it
 * is already here with the rules that matched it, and it costs one small frame each.
 *
 * Written into the frame rather than handed over as srcdoc, because the markup is full of quotes and
 * escaping it into an attribute is a bug waiting for the first component with a data attribute in it.
 */
const tagOf = (label) => String(label || '').split('.')[0] || 'element'
/**
 * An element named so it can be told apart from the one above it.
 *
 * The tag alone is not a name. Two picks off the same page are nearly always both a div, so a
 * selection of them read "div" and "div", and the rail showed each row by what its motion was called,
 * which says what the motion does rather than what it does it to. With one pick that is fine. With
 * two there was nothing on screen saying which row was which element.
 *
 * So the tag keeps a class, and which class it keeps matters. A css module writes the file and a hash
 * after the name and neither identifies anything to a person. A utility stack is all layout words
 * that every second element on the page carries, and the first is no more telling than the fifth, so
 * those are passed over when there is anything else and used when there is not.
 *
 * Plain string work rather than a pattern, deliberately: this file is one template literal and a
 * regex written in it loses its escapes before a browser ever sees it.
 */
const DULL=new Set(['flex','grid','block','inline','contents','relative','absolute','fixed','sticky',
  'flex-row','flex-col','items-center','items-start','justify-center','justify-between','w-full',
  'h-full','container','wrapper','inner','content','row','col','box','group','root'])
function subjectOf(label){
  const said=String(label||'')
  const dot=said.indexOf('.')
  const tag=(dot<0?said:said.slice(0,dot))||'element'
  if(dot<0) return tag
  const trim=(one)=>{
    const cuts=[one.indexOf('__'),one.indexOf('-module')].filter(i=>i>0)
    return cuts.length?one.slice(0,Math.min.apply(null,cuts)):one
  }
  const names=said.slice(dot+1).split('.').filter(Boolean).map(trim).filter(Boolean)
  const told=names.find(one=>!DULL.has(one))||names[0]
  return told?tag+'.'+told.slice(0,22):tag
}
const esc = (v) => String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')
const svg = (d,fill) => '<svg viewBox="0 0 16 16" width="13" height="13" fill="'+(fill||'none')
  +'" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">'
  +'<path d="'+d+'"/></svg>'
const ICON={
  open: svg('M6.2 2.4H2.4v3.8M9.8 13.6h3.8v-3.8M13.6 6.2V2.4H9.8M2.4 9.8v3.8h3.8'),
  shut: svg('M2.4 6.2h3.8V2.4M13.6 9.8H9.8v3.8M9.8 2.4v3.8h3.8M6.2 13.6V9.8H2.4'),
  more: svg('M8 1.9l1.5 4 4 1.5-4 1.5L8 12.9 6.5 8.9l-4-1.5 4-1.5z'),
  mark: svg('M4 2.6h8v11.2l-4-2.7-4 2.7z'),
  kept: svg('M4 2.6h8v11.2l-4-2.7-4 2.7z','currentColor'),
  down: svg('M8 2.6v8.1M4.9 7.6L8 10.7l3.1-3.1M3 13.2h10'),
  drop: svg('M4.6 4.6l6.8 6.8M11.4 4.6l-6.8 6.8'),
  code: svg('M5.6 5.2L2.6 8l3 2.8M10.4 5.2L13.4 8l-3 2.8M9.2 3.4l-2.4 9.2'),
}
/* one place that puts bytes on somebody's disk, since three buttons wanted it and each writing its
   own anchor is three chances to leak an object url */
function give(text, name, type){
  const url=URL.createObjectURL(new Blob([text],{type}))
  const a=document.createElement('a')
  a.href=url; a.download=name; a.click()
  setTimeout(()=>URL.revokeObjectURL(url),4000)
}
const slug=(v)=>String(v||'motion').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase()

/**
 * Motions you kept, in the browser.
 *
 * These belong to you rather than to the session, so they outlive the server: restart the studio,
 * aim it somewhere else, come back tomorrow, and what you saved is still there. In IndexedDB rather
 * than localStorage because a saved motion carries the element's markup and its css, which is tens
 * of kilobytes each, and forty of them would fill the five megabytes localStorage allows.
 *
 * Every record is self contained on purpose. Rendering one asks the server for nothing, so a saved
 * motion still plays when whatever produced it is long gone, and the whole shelf is a folder of
 * finished work rather than a list of ids that used to mean something.
 */
const DB='wall', SHELF='saved'
function shelf(){
  if(dbp) return dbp
  dbp=new Promise((ok,no)=>{
    const rq=indexedDB.open(DB,1)
    rq.onupgradeneeded=()=>{ const d=rq.result
      if(!d.objectStoreNames.contains(SHELF)) d.createObjectStore(SHELF,{keyPath:'id'}) }
    rq.onsuccess=()=>ok(rq.result); rq.onerror=()=>no(rq.error)
  })
  return dbp
}
const shelfDo=(mode,fn)=>shelf().then(d=>new Promise((ok,no)=>{
  const t=d.transaction(SHELF,mode), r=fn(t.objectStore(SHELF))
  t.oncomplete=()=>ok(r&&r.result); t.onerror=()=>no(t.error)
}))
const shelfPut=(rec)=>shelfDo('readwrite',st=>st.put(rec))
const shelfDrop=(id)=>shelfDo('readwrite',st=>st.delete(id))
const shelfAll=()=>shelfDo('readonly',st=>st.getAll())
  .then(l=>(l||[]).sort((a,b)=>b.at-a.at))

/* what has to travel with a motion for it to still be one later */
const record=(o)=>({
  id:o.id, note:o.note||'untitled', css:o.css, scope:o.scope, verb:o.verb,
  tempo:o.tempo, seen:o.seen, at:Date.now(), palette:palette.value,
  from:(chosen&&chosen.label)||file||'',
  src:{ shot:(chosen&&chosen.shot)||'', html:(chosen&&chosen.html)||'',
    css:(chosen&&chosen.css)||'', w:(chosen&&chosen.w)||0 },
})

/**
 * One document, no requests, built here rather than asked for.
 *
 * The snapshot is preferred over the markup for the same reason the server's preview prefers it: it
 * carries every computed value on the element, so it cannot be let down by a rule that was not
 * collected, and it needs no stylesheet from the page it came from.
 */
function standalone(r){
  const body=(r.src&&(r.src.shot||r.src.html))||''
  const cut=body.indexOf('>')
  // the attribute the css is scoped to, put on the first tag, which is what the server does too
  const scoped=(r.scope&&cut>0)?body.slice(0,cut)+' '+r.scope+body.slice(cut):body
  const sheet=((r.src&&r.src.shot)?'':((r.src&&r.src.css)||''))+' '+(r.css||'')
  return '<!doctype html><meta charset="utf-8"><style>'
    +'html,body{margin:0;height:100%;background:#0f1011;overflow:hidden}'
    +'#w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:'
    +((r.src&&r.src.w)||600)+'px}'
    +sheet+'</style><div id="w">'+scoped+'</div>'
    +'<scr'+'ipt>var w=document.getElementById("w"),b=w.getBoundingClientRect(),'
    +'s=Math.min(1,(innerWidth-16)/Math.max(b.width,1),(innerHeight-16)/Math.max(b.height,1));'
    +'w.style.transform="translate(-50%,-50%) scale("+s.toFixed(3)+")";'
    /* played on a loop with a pause between passes. A motion runs once and is over in under a
       second, so a shelf of them was a shelf of finished states: you had to reload the page to see
       what you had saved. The pause matters as much as the repeat, because a motion restarting the
       instant it lands reads as a stutter rather than as the same move happening again. */
    /* a motion written to repeat forever is left alone. Restarting one every second and a half
       would cut it off mid pass, which is the opposite of the problem this solves */
    +'function span(){var e=0,forever=false;document.getAnimations().forEach(function(a){'
    +'var t=a.effect&&a.effect.getComputedTiming();if(!t)return;'
    +'if(!isFinite(t.endTime)){forever=true;return}e=Math.max(e,t.endTime)});'
    +'return e?e:(forever?0:900)}'
    +'function again(){document.getAnimations().forEach(function(a){'
    +'try{a.currentTime=0;a.play()}catch(_){}})}'
    +'setTimeout(function(){var d=span();if(d)setInterval(again,d+700)},60);</scr'+'ipt>'
}
async function countSaved(){
  const n=(await shelfAll().catch(()=>[])).length
  const badge=document.getElementById('savedn'); if(badge) badge.textContent=n||''
}
async function drawSaved(){
  const list=await shelfAll().catch(()=>[])
  kept=new Set(list.map(r=>r.id))
  const badge=document.getElementById('savedn'); if(badge) badge.textContent=list.length||''
  grid.classList.remove('railed'); grid.classList.remove('solo')
  grid.innerHTML=list.length
    ? list.map(r=>'<figure><iframe data-kept="'+esc(r.id)+'" scrolling="no"></iframe>'
      +'<figcaption><b title="'+esc(r.from)+'">'+esc(r.note)+'</b>'
      +'<span class="facts">'+(r.tempo?factLine(r):'')+'</span>'
      +'<span class="seen">'+(r.seen?seenLine(r):'')+'</span>'
      +'<span class="row">'
      +'<button class="icb" data-gethtml="'+esc(r.id)+'" title="Download it as one file that '
      +'opens anywhere">'+ICON.down+'</button>'
      +'<button class="icb" data-getcss="'+esc(r.id)+'" title="Download just the css">'+ICON.code+'</button>'
      +'<button class="icb" data-forget="'+esc(r.id)+'" title="Remove it from saved">'+ICON.drop+'</button>'
      +'</span></figcaption></figure>').join('')
    : '<div class="empty">Nothing saved yet. The bookmark on a motion keeps it here, '
      +'and it stays after the studio is restarted.</div>'
  // srcdoc after the markup exists, never while it is being built
  for(const f of grid.querySelectorAll('[data-kept]')){
    const r=list.find(x=>x.id===f.dataset.kept); if(r) f.srcdoc=standalone(r)
  }
  grid.querySelectorAll('[data-forget]').forEach(b=>b.onclick=async()=>{
    await shelfDrop(b.dataset.forget); kept.delete(b.dataset.forget); drawSaved()
  })
  /* written here rather than fetched: the whole record is already in this page, so asking a server
     to hand back something it does not have any more would only be a way for this to stop working */
  /**
   * Downloaded as the thing itself.
   *
   * The same document the tile is playing, which is one file that opens anywhere and asks the
   * network for nothing. A stylesheet is the right handoff to an agent and the wrong one to a
   * person who wanted to keep what they were just looking at, so both are offered and the file is
   * the one on the left.
   */
  grid.querySelectorAll('[data-gethtml]').forEach(b=>b.onclick=()=>{
    const r=list.find(x=>x.id===b.dataset.gethtml); if(!r) return
    give(standalone(r), slug(r.note)+'.html', 'text/html')
  })
  grid.querySelectorAll('[data-getcss]').forEach(b=>b.onclick=()=>{
    const r=list.find(x=>x.id===b.dataset.getcss); if(!r) return
    give('/* '+r.note+String.fromCharCode(10)+'   add '+r.scope+' to the root element */'
      +String.fromCharCode(10)+r.css, slug(r.note)+'.css', 'text/css')
  })
}

/**
 * The arm light.
 *
 * An interference field evaluated per pixel and blurred into the button, rather than a gradient
 * swept across it: a sweep repeats on a period you start counting after the third pass, and a field
 * does not repeat. It runs only while something is selected, which is the moment the button is worth
 * looking at, and stops when the tab is hidden so it is not a battery cost for a background window.
 */
function armGlow(on){
  const c=document.getElementById('askfield'); if(!c) return
  document.getElementById('ask').classList.toggle('armed',!!on)
  if(!on){ if(glowing) cancelAnimationFrame(glowing); glowing=0; c.style.opacity=0; return }
  if(glowing) return
  const W=44,H=11,g=c.getContext('2d')
  c.width=W; c.height=H
  const img=g.createImageData(W,H), d=img.data
  let t=0
  const step=()=>{
    if(!document.body.contains(c)||document.hidden){ glowing=0; c.style.opacity=0; return }
    t+=0.03
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const q=Math.sin(x*0.19+t*1.05)+Math.cos(y*0.44-t*0.72)
      const r=Math.sin((x*0.1+y*0.22)+q*0.9+t*0.6)
      let a=(Math.sin(x*0.07-y*0.14+r*1.7+t*0.42)+1)/2
      a=a*a*(3-2*a); a=a*a
      const i=(y*W+x)*4
      d[i]=110+a*130; d[i+1]=120+a*120; d[i+2]=238; d[i+3]=a*170
    }
    g.putImageData(img,0,0); c.style.opacity=1
    glowing=requestAnimationFrame(step)
  }
  glowing=requestAnimationFrame(step)
}

/**
 * The header, carrying only what there is something to do with.
 *
 * A transport, an inspector, a film button and an export sitting above an empty room are four
 * controls that do nothing yet, and they were the first thing anybody saw. With nothing to play,
 * the only two things worth offering are picking something and asking for motion.
 */
function dressHeader(){
  const playing = opts.length>0 || railed()
  document.querySelector('header').classList.toggle('bare', !playing || viewing==='saved')
}

/* innerHTML does not run a script tag, so the field is driven by a function the page already has */
function runShader(){ try { eval(SHADER) } catch(e) { /* the wait is cosmetic, never fatal */ } }

/**
 * Each rail row wearing a picture of the element it belongs to.
 *
 * The same trick the selection pills use, pointed at the cars instead of the picks, because after a
 * reorder or a duplicate a row's position is no longer an index into picks and the car is the only
 * thing that still knows what it was made from.
 */
function paintFaces(){
  for (const f of document.querySelectorAll('[data-face]')){
    const car = arr && arr.cars[Number(f.dataset.face)]; if(!car) continue
    const p = car.pick; if(!p || !(p.shot||p.html)) continue
    const d = f.contentDocument; if(!d) continue
    d.open()
    d.write('<html><head><meta charset="utf-8"><style>'
      + 'html,body{margin:0;height:100%;overflow:hidden}'
      + '#s{position:absolute;left:50%;top:50%;transform-origin:center center;width:'
      + (p.w||600) + 'px}'
      + (p.shot ? '' : p.css)
      + '</style></head><body><div id="s">' + (p.shot || p.html) + '</div><scr' + 'ipt>'
      + 'var el=document.getElementById("s");'
      + 'var k=el.firstElementChild;'
      + 'if(k){var c=getComputedStyle(k);'
      + 'if(c.position==="fixed"||c.position==="absolute"||c.position==="sticky"){'
      + 'k.style.position="relative";k.style.inset="auto"}}'
      + 'var r=el.getBoundingClientRect();'
      + 'var s=Math.min(1,(innerWidth-2)/Math.max(r.width,1),(innerHeight-2)/Math.max(r.height,1));'
      + 'el.style.transform="translate(-50%,-50%) scale("+s.toFixed(4)+")";'
      + '</scr' + 'ipt></body></html>')
    d.close()
  }
}
function paintShots(){
  for (const f of document.querySelectorAll('[data-shot]')){
    const p = picks[Number(f.dataset.shot)]; if(!p) continue
    const d = f.contentDocument; if(!d) continue
    d.open()
    d.write('<html><head><meta charset="utf-8"><style>'
      + 'html,body{margin:0;height:100%;overflow:hidden}'
      + '#s{position:absolute;left:50%;top:50%;transform-origin:center center;width:'
      + (p.w||600) + 'px}'
      + (p.shot ? '' : p.css)
      + '</style></head><body><div id="s">' + (p.shot || p.html) + '</div><scr' + 'ipt>'
      + 'var el=document.getElementById("s");'
      + 'var k=el.firstElementChild;'
      + 'if(k){var c=getComputedStyle(k);'
      + 'if(c.position==="fixed"||c.position==="absolute"||c.position==="sticky"){'
      + 'k.style.position="relative";k.style.inset="auto"}}'
      + 'var r=el.getBoundingClientRect();'
      + 'var s=Math.min(1,(innerWidth-4)/Math.max(r.width,1),(innerHeight-4)/Math.max(r.height,1));'
      + 'el.style.transform="translate(-50%,-50%) scale("+s.toFixed(4)+")";'
      + '</scr' + 'ipt></body></html>')
    d.close()
  }
}

/**
 * The sequence, drawn.
 *
 * A rail is a composition and it was being presented as a stack of boxes, with the order encoded in
 * an invisible constant: every car started 420ms after the one above it and nothing said so or let
 * you change it. Which is to say the one thing a rail is actually for, deciding what happens when,
 * was the one thing you could not see or touch.
 *
 * So each car is a bar, placed where it starts and as long as it runs. Drag one and that car moves in
 * time. The playhead is the same scrubber that drives the previews, so what you read here and what
 * you watch above it are the same clock.
 */
/**
 * Every row carries the index of the car it draws, not its position among the rows that survived.
 *
 * The two are the same number until a pick fails to move, and then they are not. The old draw filtered
 * the dead cars out and then wrote the position in the filtered list into data-row, which the handlers
 * read back as an index into the real list. It happened to work because the filtered array shared its
 * objects with the real one, which is the alias this whole change exists to remove: dragging a bar
 * wrote through a view and edited state nobody had said could be edited.
 */
function timeline(live){
  const total=ruler()
  const solved=ARR.resolve(arr), at=solved.at, cyclic=solved.cyclic
  const life=arr.cars.map((_,k)=>ARR.lifeOf(arr,k))
  /* what a car follows, by the name of the row rather than by an id nobody chose or can read */
  const follows=(car)=>{
    if(!car.after) return ''
    const to=arr.cars.find(c=>String(c.key)===String(car.after.key))
    if(!to) return ''
    return (car.after.mode==='with'?'with ':'after ')+nameOf(to.motion)
  }
  return '<div class="tl" id="tl">'
    + '<div class="tltop"><div class="tlhead" id="tlsay">Sequence &middot; click a row to adjust it, '
    + 'shift or cmd to take several, drag a bar to move them in time</div>'
    + '<div class="tlrails">'
    + (comparing()? rails.map((t,n)=>'<button class="railtab'+(n===railN?' on':'')+'" data-arr-to="'+n+'">'
        +esc('take '+(n+1))+'</button>').join('') : '')
    + '<button class="railtab" id="tlback" title="back to the cards, to choose a different motion for'
      +' any of these">choosing</button>'
    + (rails.length<3
        ? '<button class="railtab add" id="tlfork" title="a copy of this arrangement, so one thing can'
          +' be changed and both watched at the same instant">fork</button>' : '')
    + (comparing()? '<button class="railtab keep" id="tlkeep" title="keep the one being edited and'
        +' drop the others, which is the whole point of having made them">keep this</button>' : '')
    + '</div></div><div class="tlgrid" id="tlgrid">'
    + '<div class="tlplay off" id="tlplay"><i></i></div>'
    + live.map(({car,i})=>'<div class="tlrow'+(i===lead?' on':'')
        +(sel.has(i)?' sel':'')+'" data-row="'+i+'">'
        +'<span class="grip" data-grip="'+i+'" title="drag to reorder">&#8942;&#8942;</span>'
        /* the element, rather than a description of it. The selection has shown a thumbnail of every
           pick since the picker existed and the rail never used one, so a row read div.something
           when it could show the thing */
        +((car.pick.shot||car.pick.html)
          ?'<span class="tlface"><iframe data-face="'+i+'" scrolling="no" tabindex="-1"></iframe></span>'
          :'')
        /* the element first and what it is doing underneath. A row is one of the things you picked,
           and naming it by its motion meant two rows off the same page read the same */
        +'<span class="tlname" title="'+esc(car.pick.label+' · '+(car.motion.note||''))+'">'
        +'<b>'+esc(subjectOf(car.pick.label))+'</b>'
        +'<u class="tlties'+(cyclic.includes(car.key)?' knot':'')+'">'
        +esc(car.after
          ? (cyclic.includes(car.key)?'follows itself':follows(car))
          : nameOf(car.motion))+'</u>'
        +'</span>'
        +'<span class="tlcam'+(car.shot?' on':'')+'">'
        +(CAMS.find(x=>x[0]===(car.shot||''))||CAMS[0])[1]+'</span>'
        +'<button class="tlalt'+(car.alternatives.length>1?'':' one')+'" data-alt="'+i+'" tabindex="-1"'
        +' title="'+esc(altTitle(car))+'">'
        +(ARR.chosenAlt(car)+1)+'/'+car.alternatives.length+'</button>'
        +'<button class="tlmore" data-more-car="'+i+'" tabindex="-1"'
        +' title="more like this one, for this car only">'+ICON.more+'</button>'
        +'<span class="tltrack" data-track="'+i+'">'
        /**
         * The life behind the bar: when this component is on the stage at all.
         *
         * A car used to be there from the first frame and stay for good, so a rail of three opened as
         * three boxes and only their contents arrived in order. The bar is when it moves; this is
         * when it exists, and the two are different decisions that happen to share a row. Drawn
         * behind, because the motion is the thing you are usually aiming at.
         */
        +'<b class="tllife" data-life="'+i+'" style="left:'+(life[i].from/total*100).toFixed(2)+'%;'
        +'width:'+Math.max(0.4,((life[i].until===null?total:life[i].until)-life[i].from)/total*100).toFixed(2)+'%"'
        +' title="on stage from '+(life[i].from/1000).toFixed(2)+'s'
        +(life[i].until===null?' and stays':' until '+(life[i].until/1000).toFixed(2)+'s')
        +'. Drag either end to change it">'
        +'<i class="lin" data-lin="'+i+'"></i><i class="lout" data-lout="'+i+'"></i></b>'
        +'<span class="tlbar'+(sel.has(i)?' sel':'')+(car.after?' tied':'')
        +(cyclic.includes(car.key)?' knot':'')+'" data-bar="'+i+'" style="left:'
        +(at[i]/total*100).toFixed(2)+'%;'
        +'width:'+Math.max(2,car.motion.ms/total*100).toFixed(2)+'%">'
        +'<i>'+(at[i]/1000).toFixed(2)+'s</i>'
        /* the bar's length was the motion's own span and nothing could change it, so the one thing a
           bar looks like it should do was the one thing it would not */
        +'<b class="tltrim" data-trim="'+i+'" title="drag to make this motion longer or shorter. It'
        +' is retimed rather than regenerated, so the idea is kept and only the clock changes"></b>'
        +'<b class="tltie" data-tie="'+i+'" title="drag onto another row to start this one when that'
        +' one finishes, or drop it here to cut the link"></b>'
        +'</span>'
        /* the journey, on the same row and plainly not the motion: one is what the model wrote and
           happens once, the other is where you sent the thing and can happen all afternoon */
        +(car.moves||[]).map((m,k)=>'<b class="tlgo" data-go="'+i+'" data-leg="'+k+'" style="left:'
          +(m.at/total*100).toFixed(2)+'%;width:'+Math.max(1.2,m.ms/total*100).toFixed(2)+'%"'
          +' title="travels here over '+(m.ms/1000).toFixed(2)+'s. Click to take this leg away">'
          +'</b>').join('')
        +'</span></div>').join('')
    + '<div class="tlmarks" id="tlmarks">'
    + (arr.markers||[]).map(m=>'<b class="tlmark" data-mark="'+m+'" title="a beat to align to, and a'
        +' thing bars snap onto. Click to take it away" style="left:'
        +(m/total*100).toFixed(3)+'%"></b>').join('')
    + '</div>'
    + '</div><div class="tlfoot"><span>'+shape()+'</span><span>'
    + (ARR.viewSpan(arr,0)<total-1
        ? '<button class="tlfit" id="tlfit" title="the ruler only grows while you work, so this brings'
          +' it back to what the composition needs">fit</button>' : '')
    + (total/1000).toFixed(1)+'s</span></div></div>'
}
/**
 * Where the track column actually is, measured rather than written down.
 *
 * The foot's ruler was aligned to the tracks by a hand matched padding of 270px, which is the grip
 * plus the name plus the camera plus three gaps. Every one of those is a number in the stylesheet, so
 * the alignment was four numbers agreeing by hand and it would have quietly parted the first time a
 * column changed width. The playhead needs the same two numbers, so both read them off a real track.
 */
function placePlayhead(){
  const strip=document.getElementById('tl'), track=document.querySelector('.tltrack')
  const line=document.getElementById('tlplay')
  if(!strip||!track||!line) return
  const a=document.getElementById('tlgrid').getBoundingClientRect(), b=track.getBoundingClientRect()
  strip.style.setProperty('--tlx',(b.left-a.left)+'px')
  strip.style.setProperty('--tlw',b.width+'px')
  const foot=strip.querySelector('.tlfoot'); if(foot) foot.style.paddingLeft=(b.left-a.left)+'px'
}
/* the playhead is the transport's clock, so it is moved from hold rather than kept in step by hand */
function markPlayhead(ms){
  const line=document.getElementById('tlplay'); if(!line||!railed()) return
  const total=ruler(), w=parseFloat(getComputedStyle(line).width)||0
  const past=ms>total
  line.classList.toggle('off',past)
  if(!past) line.style.setProperty('--t',(ms/total*w).toFixed(1)+'px')
}
/* the one writer, so the lead can never drift out of the set it is supposed to lead */
function choose(indices, head){
  sel=new Set(indices.filter(i=>arr&&arr.cars[i]&&arr.cars[i].motion))
  lead = head!==undefined && sel.has(head) ? head : [...sel][sel.size-1]
  if(lead===undefined) lead=null
  chosenOpt = lead===null ? null : arr.cars[lead].motion.id
  paintSel(); drawInspector()
}
/* classes only, so a selection change costs no frame reload: the rail iframe is showing the same
   cars at the same offsets and reloading it would restart every motion to light up a row */
function paintSel(){
  for(const r of document.querySelectorAll('.tlrow')){
    const i=Number(r.dataset.row)
    r.classList.toggle('sel', sel.has(i))
    r.classList.toggle('on', i===lead)
    const bar=r.querySelector('.tlbar'); if(bar) bar.classList.toggle('sel', sel.has(i))
  }
  /* reached into rather than reloaded, because the frame is showing the same cars at the same
     offsets and rebuilding it to light one up would restart every motion in it */
  try{
    const f=grid.querySelector('.appwrap.on iframe')||grid.querySelector('.appwrap iframe')
    const d=f&&f.contentDocument
    const on=ARR.live(arr)
    if(d) for(const car of d.querySelectorAll('.car')){
      const seat=on[Number(car.dataset.rail)]
      car.classList.toggle('chosen', !!seat&&seat.i===lead)
    }
  }catch(_){ /* a frame still loading has nothing to mark */ }
}
/**
 * What the composition does with its time, said out loud.
 *
 * A tool that can measure its own output is in a position to criticise it, and everything landing in
 * the first fifth of a rail then two seconds of nothing is a real criticism. It reports and does not
 * judge: which of those is a fault depends on what the thing is for, and the house rule is that a
 * gate is calibrated against real output before it is enforced rather than tuned by taste.
 */
function shape(){
  const d=ARR.density(arr); if(!d) return '0s'
  const s=(ms)=>(ms/1000).toFixed(2)+'s'
  if(d.cars<2) return '0s'
  const hole=d.hole>=400?', then nothing for '+s(d.hole)+' after '+s(d.holeAt):''
  return '0s &middot; '+d.cars+' cars, all landed by '+s(d.settledBy)+hole
}
/* the chip says what it is showing and what else it has, so it is legible before you press it */
function altTitle(car){
  const n=ARR.chosenAlt(car)
  if(car.alternatives.length<2) return 'the only motion that survived the gates for this element'
  /* the separator is built rather than written: a backslash-n inside this template arrives at the
     browser as a real newline in the middle of a string literal, which is a syntax error and is the
     escaping hazard this whole file is a monument to */
  return car.alternatives.map((m,k)=>(k===n?'showing: ':'')+(m.note||'untitled')
    +(m.verb?' ('+m.verb.split(',')[0]+')':'')).join(String.fromCharCode(10))
}
/**
 * A row, cycled onto another of the motions already generated for it.
 *
 * The offset is left alone. Swapping alternatives is choosing a different performance of the same
 * beat, so moving the thing being judged would answer a question nobody asked, and cycling forward
 * through three and back would not return you to where you started.
 *
 * A full render here, unlike a drag or a nudge: a different motion means a different id in the frame
 * url, so the frame has to reload, and restarting is what you want because you are about to watch
 * the new one from the top.
 */
function cycleAlt(i, dir){
  const car=arr.cars[i]; if(!car||car.alternatives.length<2) return
  mark('the motion on '+nameOf(car.motion))
  arr=ARR.swapped(arr,i,ARR.chosenAlt(car)+dir)
  chosenOpt=arr.cars[i].motion.id
  held.clear(); ends.clear(); render(); drawInspector()
}
/**
 * More like the one this car is playing.
 *
 * They join that car's alternatives rather than replacing what it plays: you asked for more choices,
 * not for a different rail, and the frame is left alone so nothing restarts while you wait.
 *
 * One at a time, because post() keeps a single request in flight and aborts the last one on every
 * call, so a second row asked while the first was working would silently kill it.
 */
let varying=null
async function moreLikeCar(i, from){
  if(varying!==null) return
  const car=arr.cars[i]; if(!car||!car.motion) return
  /* varied from the card that was pressed rather than from whatever the row happens to be playing,
     since in the chooser you are asking about one of several on screen */
  const base=from===undefined?car.motion:(car.alternatives[from]||car.motion)
  varying=i
  const row=document.querySelector('.tlrow[data-row="'+i+'"]')
  if(row) row.classList.add('working')
  const pressed=document.querySelector('[data-more-car="'+i+'"]')
  if(pressed) pressed.classList.add('working')
  document.querySelectorAll('[data-more-car]').forEach(b=>{ b.disabled=Number(b.dataset.moreCar)!==i })
  try{
    const r=await post('/__wall/refine',{id:base.id,count:3},360000)
    mark('varying '+nameOf(base))
    arr=ARR.offered(arr,i,r.kept||[])
    drops.textContent=(r.kept&&r.kept.length? r.kept.length+' more for '+nameOf(base)+'. ':'')
      +((r.dropped&&r.dropped.length)? r.dropped.length+' dropped: '
        +r.dropped.map(d=>String(d.why).split('.')[0]).join('; ') : '')
    held.clear(); ends.clear(); render(); drawInspector()
  }catch(e){
    drops.textContent = e && e.name==='AbortError'
      ? 'That took too long and was given up on. The terminal says what it was doing.'
      : String(e && e.message || e)
    if(row) row.classList.remove('working')
    if(pressed) pressed.classList.remove('working')
    document.querySelectorAll('[data-more-car]').forEach(b=>{ b.disabled=false })
  }
  varying=null
}
function selectRow(i, e){
  const car=arr&&arr.cars[i]; if(!car||!car.motion) return
  const rows=[...document.querySelectorAll('.tlrow')].map(r=>Number(r.dataset.row))
  if(e&&e.shiftKey&&anchor!==null&&rows.includes(anchor)){
    const a=rows.indexOf(anchor), b=rows.indexOf(i)
    choose(rows.slice(Math.min(a,b),Math.max(a,b)+1), anchor)
  }else if(e&&(e.metaKey||e.ctrlKey)){
    const next=new Set(sel)
    if(next.has(i)) next.delete(i); else next.add(i)
    anchor=i
    choose([...next], next.has(i)?i:undefined)
  }else{
    anchor=i
    choose([i], i)
  }
  shut(); insp.hidden=false
}
function wireTimeline(live){
  const total=ruler()
  const fit=document.getElementById('tlfit')
  if(fit) fit.onclick=e=>{ e.stopPropagation(); zoom=0; render() }
  /* a marker is dropped by double clicking the track it belongs on, which is where you are already
     looking, and taken away by clicking it. Bars snap onto them, so this is how a beat gets
     something to be aligned to rather than being lined up against another bar by eye */
  for (const track of document.querySelectorAll('.tltrack')){
    track.ondblclick=e=>{
      e.stopPropagation()
      const box=track.getBoundingClientRect()
      const at=Math.max(0,Math.round((e.clientX-box.left)/box.width*total))
      mark('a marker at '+(at/1000).toFixed(2)+'s')
      arr={...arr, markers:(arr.markers||[]).concat(at).sort((a,b)=>a-b)}
      render()
    }
  }
  for (const m of document.querySelectorAll('[data-mark]')){
    m.onclick=e=>{
      e.stopPropagation()
      const at=Number(m.dataset.mark)
      mark('taking a marker away')
      arr={...arr, markers:(arr.markers||[]).filter(v=>v!==at)}
      render()
    }
  }
  const back=document.getElementById('tlback')
  if(back) back.onclick=e=>{ e.stopPropagation()
    stage='choosing'; held.clear(); ends.clear(); render(); drawSel() }
  const fork=document.getElementById('tlfork')
  if(fork) fork.onclick=e=>{ e.stopPropagation()
    mark(rails.length?'forking the arrangement':'comparing two arrangements')
    if(!rails.length) rails=[arr]
    rails[railN]=arr
    rails.push(ARR.forked(arr,'a'+(rails.length+1)))
    railN=rails.length-1; arr=rails[railN]
    /* the frames are all being replaced and their acks are counted by position, so what the maps
       remember is about a set of frames that no longer exists */
    held.clear(); ends.clear(); render() }
  for (const tab of document.querySelectorAll('[data-arr-to]')){
    tab.onclick=e=>{ e.stopPropagation()
      const n=Number(tab.dataset.arrTo); if(n===railN) return
      rails[railN]=arr; railN=n; arr=rails[railN]
      /* the selection is indices into the arrangement being edited, and this is a different one */
      sel=new Set(); lead=null; anchor=null
      render(); drawInspector() }
  }
  const keep=document.getElementById('tlkeep')
  if(keep) keep.onclick=e=>{ e.stopPropagation()
    mark('keeping one arrangement and dropping the others')
    rails=[]; railN=0
    held.clear(); ends.clear(); render() }
  for (const leg of document.querySelectorAll('[data-go]')){
    leg.onclick=e=>{
      e.stopPropagation()
      const i=Number(leg.dataset.go), k=Number(leg.dataset.leg)
      mark('taking a leg out of '+nameOf(arr.cars[i].motion)+' journey')
      arr=ARR.routed(arr,i,(arr.cars[i].moves||[]).filter((_,n)=>n!==k))
      held.clear(); ends.clear(); render()
    }
  }
  for (const chip of document.querySelectorAll('[data-alt]')){
    chip.onclick=e=>{ e.stopPropagation(); cycleAlt(Number(chip.dataset.alt), e.shiftKey?-1:1) }
  }
  /**
   * A motion made longer or shorter by dragging the end of its bar.
   *
   * The bar's length was the motion's own span and nothing could change it, so the one thing a bar
   * looks like it ought to do was the one thing it would not. This is a retime rather than another
   * ask: retimed() scales the durations and the delays separately, because a slower move is not a
   * longer wait, and the gates still run on the result, so one that flattens a stagger to nothing is
   * refused the way any other change would be.
   *
   * The width follows the pointer and the server is asked once, on release. It is a model free call,
   * but a request per pixel is still a request per pixel.
   */
  /**
   * The playhead, driven from the strip.
   *
   * It was drawn and read only, which makes it a readout rather than a cursor. An editor's whole
   * interaction is to put the clock where you want something to happen and then do the thing, and
   * that is not available when the only way to move the clock is a slider in the header, above and
   * away from the rows being aimed at.
   *
   * On the empty part of a track, so it never argues with a bar, a life, or any of their handles.
   */
  for (const track of document.querySelectorAll('.tltrack')){
    track.onpointerdown=e=>{
      if(e.target.closest('.tlbar, .lin, .lout')) return
      e.preventDefault(); e.stopPropagation()
      const box=track.getBoundingClientRect()
      const to=ev=>{
        const want=Math.max(0,Math.min(total,(ev.clientX-box.left)/box.width*total))
        running=false; face(); hold(Math.round(want))
      }
      const up=()=>{ window.removeEventListener('pointermove',to)
        window.removeEventListener('pointerup',up) }
      to(e)
      window.addEventListener('pointermove',to); window.addEventListener('pointerup',up)
    }
  }
  for (const grip of document.querySelectorAll('[data-trim]')){
    grip.onpointerdown=e=>{
      e.preventDefault(); e.stopPropagation()
      const i=Number(grip.dataset.trim)
      const bar=grip.closest('.tlbar'), track=bar.parentElement
      const w=track.getBoundingClientRect().width
      const was=arr.cars[i].motion.ms, from=e.clientX
      const targets=ARR.edges(arr,[i],running?null:Number(scrub.value))
      const tol=(7/w)*total, gridTol=(4/w)*total, step=ARR.gridStep(total,w)
      const start=ARR.resolve(arr).at[i]
      let want=was, stepped=false
      const move=ev=>{
        stepped=true
        const raw=Math.max(60, was + (ev.clientX-from)/w*total)
        /* snapped by where the bar would end, since lining an ending up with somebody else's start is
           most of the reason to drag one of these */
        const got=ev.altKey?{at:start+raw,hit:null}:ARR.snapTo(start+raw,targets,tol,step,gridTol)
        want=Math.max(60,Math.round(got.at-start))
        bar.style.width=Math.max(2,want/total*100).toFixed(2)+'%'
        const say=document.getElementById('tlsay')
        if(say) say.innerHTML=(got.hit?'Ends on <b class="tlhint">'+esc(got.hit)+'</b>, ':'')
          +'running '+(want/1000).toFixed(2)+'s. Alt sets it freely.'
      }
      const up=async()=>{
        window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up)
        if(!stepped||want===was) return render()
        const base=arr.cars[i].motion
        bar.classList.add('working')
        try{
          const r=await post('/__wall/tune',{ id:base.origin||base.id,
            duration:want/was, stagger:1 }, 20000)
          if(r.error){ drops.textContent=r.error.slice(0,140); return render() }
          mark('the length of '+nameOf(base))
          arr=ARR.trimmed(arr,i,{ ...base, id:r.id, tempo:r.tempo, origin:base.origin||base.id,
            ms:(r.tempo&&r.tempo.span)||want })
          held.clear(); ends.clear(); render(); drawInspector()
        }catch(err){ drops.textContent=String(err&&err.message||err); render() }
      }
      window.addEventListener('pointermove',move); window.addEventListener('pointerup',up)
    }
  }
  /**
   * When a component comes on and when it leaves, dragged.
   *
   * The same snapping the bars get, because an entrance landing on the instant another thing finishes
   * is the whole reason to place one by hand. Dragging the out point past the end of the ruler means
   * it never leaves, which is the default and is worth being able to get back to without a control
   * that says so.
   */
  for (const end of document.querySelectorAll('[data-lin],[data-lout]')){
    const isIn=end.dataset.lin!==undefined
    const i=Number(isIn?end.dataset.lin:end.dataset.lout)
    end.onpointerdown=e=>{
      e.preventDefault(); e.stopPropagation()
      const track=end.closest('.tltrack')
      const w=track.getBoundingClientRect().width, box=track.getBoundingClientRect()
      const targets=ARR.edges(arr,[i],running?null:Number(scrub.value))
      const tol=(7/w)*total, gridTol=(4/w)*total, step=ARR.gridStep(total,w)
      let stepped=false, now=ARR.lifeOf(arr,i)
      const move=ev=>{
        if(!stepped){ stepped=true; mark((isIn?'when ':'how long ')+nameOf(arr.cars[i].motion)
          +(isIn?' comes on':' stays')) }
        const want=Math.max(0,(ev.clientX-box.left)/w*total)
        const got=ev.altKey?{at:want,hit:null}:ARR.snapTo(want,targets,tol,step,gridTol)
        const life=ARR.lifeOf(arr,i)
        /* dragged past the end of the ruler it stops being an exit, which is how you get back to the
           default without a control whose only job is to say never */
        const gone=!isIn&&got.at>=total*0.985
        arr=ARR.living(arr,i, isIn
          ? { from:Math.min(got.at, life.until===null?got.at:life.until), until:life.until }
          : { from:life.from, until:gone?null:Math.max(life.from,got.at) })
        const say=document.getElementById('tlsay')
        if(say) say.innerHTML = gone ? 'Stays for the rest of the composition.'
          : (got.hit?'Snapped to <b class="tlhint">'+esc(got.hit)+'</b>. Alt places it freely.'
            :(isIn?'Comes on at ':'Leaves at ')+(got.at/1000).toFixed(2)+'s')
        /* the strip only, while the drag is live: the frame is rebuilt on release, because reloading
           it per pointermove would restart every motion under the cursor */
        const el=document.querySelector('[data-life="'+i+'"]')
        const fresh=ARR.lifeOf(arr,i)
        if(el){ el.style.left=(fresh.from/total*100).toFixed(2)+'%'
          el.style.width=Math.max(0.4,((fresh.until===null?total:fresh.until)-fresh.from)/total*100).toFixed(2)+'%' }
      }
      const up=()=>{
        window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up)
        if(!stepped) return
        held.clear(); ends.clear(); render()
      }
      window.addEventListener('pointermove',move); window.addEventListener('pointerup',up)
    }
  }
  /**
   * Tying one car to another, by dragging from the end of its bar onto the row it should follow.
   *
   * Absolute offsets mean that making one motion slower is followed by dragging every bar after it
   * back into place by hand, which is the sort of work a tool should be doing. A tie says the thing
   * you actually meant: this starts when that one finishes.
   *
   * Dropped on its own row, or anywhere that is not a row, it cuts the link and the car keeps the
   * instant it was resolved to, so undoing a tie does not also move the car.
   */
  for (const tie of document.querySelectorAll('[data-tie]')){
    tie.onpointerdown=e=>{
      e.preventDefault(); e.stopPropagation()
      const from=Number(tie.dataset.tie)
      const rows=[...document.querySelectorAll('.tlrow')]
      let onto=null
      const move=ev=>{
        const row=document.elementFromPoint(ev.clientX,ev.clientY)
        const hit=row&&row.closest?row.closest('.tlrow'):null
        onto=hit&&Number(hit.dataset.row)!==from?Number(hit.dataset.row):null
        rows.forEach(r=>r.classList.toggle('tying', onto!==null&&Number(r.dataset.row)===onto))
        const say=document.getElementById('tlsay')
        if(say) say.textContent = onto===null
          ? 'Drop on a row to follow it, or here to cut the link.'
          : 'Follows '+nameOf(arr.cars[onto].motion)+', starting when it finishes.'
      }
      const up=ev=>{
        window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up)
        rows.forEach(r=>r.classList.remove('tying'))
        const car=arr.cars[from]
        if(onto===null){
          if(!car.after) return render()
          mark('cutting '+nameOf(car.motion)+' loose')
          /* it keeps where it had been resolved to, or cutting a link would also move the car and
             one gesture would be two changes */
          arr=ARR.retimed(ARR.moved(arr,from,ARR.resolve(arr).at[from]),from,{after:null})
        }else{
          mark('following '+nameOf(arr.cars[onto].motion))
          const to=arr.cars[onto]
          arr=ARR.retimed(arr,from,{after:{key:to.key,mode:ev.altKey?'with':'after',gap:0}})
          const knots=ARR.resolve(arr).cyclic
          if(knots.includes(car.key)){
            /* a ring resolves rather than hanging, and every car in it falls back to its own offset,
               but a rail that quietly ignores what you just asked for is worse than one that says no */
            arr=ARR.retimed(arr,from,{after:null})
            drops.textContent='That would make a ring, so the link was not made: '
              +nameOf(arr.cars[onto].motion)+' already waits on '+nameOf(car.motion)+'.'
          }
        }
        held.clear(); ends.clear(); render()
      }
      window.addEventListener('pointermove',move); window.addEventListener('pointerup',up)
    }
  }
  for (const b of document.querySelectorAll('[data-more-car]')){
    b.onclick=e=>{ e.stopPropagation(); moreLikeCar(Number(b.dataset.moreCar)) }
  }
  /**
   * Order, dragged.
   *
   * Offsets say when a car starts and order says where it sits in the film, and they are not the same
   * decision: two cars can begin together and still need one above the other. Reordering swaps their
   * places in the rail and leaves each one's offset alone, so moving a car does not silently retime it.
   */
  /**
   * Clicking a row aims the inspector at that car, which is where its camera and its timing both
   * live now.
   *
   * The bar is not excluded from this even though the bar is also the drag handle. It is the most
   * obvious thing in the row to click, it sits across the middle of it, and a first version that
   * ignored clicks landing on it meant aiming at the centre of a row did nothing at all. A press
   * that never moves is a click and selects; one that moves is a drag and retimes.
   */
  for (const row of document.querySelectorAll('.tlrow')){
    row.onclick=e=>{
      // always, or the document listener below closes the panel this just opened
      e.stopPropagation()
      if(e.target.closest('[data-grip]')) return
      selectRow(Number(row.dataset.row), e)
    }
  }
  for (const grip of document.querySelectorAll('[data-grip]')){
    grip.onpointerdown=e=>{
      e.preventDefault()
      /* two different indices, and conflating them is what the old draw did. seat is where the row
         sits on screen, which is what a pointer is compared against; data-grip is which car it
         draws. They part company the moment one pick fails to move */
      const rows=[...document.querySelectorAll('.tlrow')]
      const seat=rows.indexOf(grip.closest('.tlrow'))
      const tops=rows.map(r=>r.getBoundingClientRect().top+r.getBoundingClientRect().height/2)
      rows[seat].classList.add('lifting')
      let to=seat
      const move=ev=>{
        to=tops.reduce((best,t,i)=>Math.abs(ev.clientY-t)<Math.abs(ev.clientY-tops[best])?i:best,seat)
        rows.forEach((r,i)=>r.style.outline = i===to&&i!==seat ? '1px solid var(--accent)' : '')
      }
      const up=()=>{
        window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up)
        rows[seat].classList.remove('lifting'); rows.forEach(r=>r.style.outline='')
        if(to!==seat){
          mark('reordering the rail')
          /* a car that did not move keeps its place rather than being swept to the bottom, which is
             what rebuilding the list as movers-then-failures used to do on every reorder */
          const was=Number(rows[seat].dataset.row), now=Number(rows[to].dataset.row)
          arr=ARR.reordered(arr, was, now)
          /* every index after the move means a different car, so the selection is re-aimed at the
             row that was dragged rather than left pointing at whatever slid into its place */
          sel=new Set([now]); lead=now; anchor=now
          held.clear(); ends.clear(); render()
        }
      }
      window.addEventListener('pointermove',move); window.addEventListener('pointerup',up)
    }
  }
  for (const bar of document.querySelectorAll('[data-bar]')){
    bar.onpointerdown=e=>{
      e.preventDefault()
      const i=Number(bar.dataset.bar), track=bar.parentElement
      const w=track.getBoundingClientRect().width, from=e.clientX
      const when=ARR.resolve(arr).at
      /* dragging a bar that is part of a selection moves the whole selection, and dragging one that
         is not takes the selection with it rather than moving something you cannot see */
      const moving = sel.has(i) && sel.size>1 ? [...sel] : [i]
      if(!sel.has(i)) { anchor=i; choose([i],i) }
      const wases=new Map(moving.map(k=>[k,when[k]]))
      /**
       * The threshold is pixels, converted here to milliseconds at the ruler this drag is happening
       * on. A fixed millisecond figure is twenty two pixels of magnet on a short rail, where nothing
       * can be placed off a target at all, and under two on a long one, where it may as well not
       * exist. The grid is offered a narrower one, which is the whole priority rule: a named edge
       * wins over a grid line near it because the grid simply misses more often.
       */
      const tol=(7/w)*total, gridTol=(4/w)*total, step=ARR.gridStep(total,w)
      const targets=ARR.edges(arr,moving,running?null:Number(scrub.value))
      let stepped=false, delta=0, hit=null
      const bars=new Map(moving.map(k=>[k,document.querySelector('[data-bar="'+k+'"]')]))
      const move=ev=>{
        if(!stepped){ stepped=true
          mark(moving.length>1 ? 'moving '+moving.length+' cars in time'
            : 'moving '+nameOf(arr.cars[i].motion)+' in time') }
        let want=Math.max(0, wases.get(i) + (ev.clientX-from)/w*total)
        /* alt is read live rather than at pointerdown, so a magnet can be escaped and then let go of
           to land clean, which is what holding it is for */
        const free=ev.altKey
        const got=free?{at:want,hit:null}:ARR.snapTo(want,targets,tol,step,gridTol)
        hit=got.hit
        delta=ARR.clampDelta(got.at-wases.get(i), moving.map(k=>wases.get(k)))
        for(const k of moving){
          const b=bars.get(k); if(!b) continue
          const to=wases.get(k)+delta
          b.style.left=(to/total*100).toFixed(2)+'%'
          b.querySelector('i').textContent=(to/1000).toFixed(2)+'s'
        }
        const say=document.getElementById('tlsay')
        if(say) say.innerHTML = hit
          ? 'Snapped to <b class="tlhint">'+esc(hit)+'</b>. Hold alt to place it freely.'
          : (moving.length>1?moving.length+' cars moving together.':'Dragging freely.')
      }
      const up=ev=>{
        window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up)
        /* a press that never moved is a click and the row's own handler is about to answer it. This
           selected here as well, which was invisible while selecting was idempotent and became a bug
           the moment cmd-click started toggling: the row was taken out and put straight back in */
        if(!stepped) return
        /* the bars are moved by hand while the drag is live and the arrangement is written once at
           the end, because rebuilding it per pointermove would rebuild the frame sixty times a
           second. The old code got the same effect by writing through a filtered view of the state */
        arr=ARR.shifted(arr,moving,delta)
        // only reload the frame when the drag ends, or every pixel would restart the page
        held.clear(); ends.clear(); render()
      }
      /* on the window rather than on the bar with a pointer capture: the cursor leaves a twelve
         pixel bar within one frame of any real drag, and capture was not holding it. Synthetic
         events fired straight at the bar worked, which is exactly the shape of bug that passes a
         unit test and fails a hand */
      window.addEventListener('pointermove',move); window.addEventListener('pointerup',up)
    }
  }
}

/* the selection, which is the thing a rail is built out of */
/**
 * The label, never the button.
 *
 * Writing textContent onto the button removes the canvas the arm light draws into and the span
 * every other caller writes to, so the first ask cost the button its light for the rest of the
 * session and every drawSel after it threw on a null and stopped halfway. Four call sites want
 * this and three of them got it wrong, which is what a helper is for.
 */
function askSays(t){ const l = ask.querySelector('.lbl'); if (l) l.textContent = t }

function drawSel(){
  const el=document.getElementById('sel')
  if(!picks.length){ el.innerHTML=''; askSays('Give it motion')
    armGlow(false); return }
  el.innerHTML='<p class="selhead">Selection'+(picks.length>1?' &middot; '+picks.length:'')+'</p>'
    /* the pill is the element, so pressing it should go to that element's motions. It was inert
       except for its own remove button, which meant the sidebar could name what you had picked and
       do nothing whatever about it */
    +picks.map((p,i)=>'<span class="pill'+(onSubject(i)?' on':'')+'" data-pick="'+i+'"'
      +(arr&&arr.cars[i]&&arr.cars[i].motion?' title="choose the motion for this one"':'')+'><b>'+(i+1)+'</b>'
      +'<span class="shot"><iframe data-shot="'+i+'" scrolling="no" tabindex="-1"></iframe></span>'
      /* the whole label in the title, since a class stack is worth having and not worth showing */
      +'<span class="who" title="'+esc(p.label)+'"><em>'+esc(subjectOf(p.label))
      +'</em><i>'+p.w+'&times;'+p.h
      +(p.cut?' &middot; trimmed':'')+'</i>'
      +(p.weak?'<u>'+p.weak+'</u>':'')
      +(p.opaque?'<u>'+p.opaque+' sheet'+(p.opaque>1?'s':'')+' unreadable</u>':'')+'</span>'
      +'<button data-drop="'+i+'" title="remove">&times;</button></span>').join('')
  // after the markup exists, not in the middle of building it
  paintShots()
  el.querySelectorAll('[data-pick]').forEach(pill=>pill.onclick=e=>{
    if(e.target.closest('[data-drop]')) return
    const i=Number(pill.dataset.pick)
    const car=arr&&arr.cars[i]
    if(!car){ drops.textContent='Nothing has been written for these yet. '
      +'Press Give them motion first.'; return }
    if(!car.motion){ drops.textContent=subjectOf(picks[i].label)+' did not move: '
      +String(car.why||'nothing came back'); return }
    const at=ARR.live(arr).findIndex(x=>x.i===i)
    if(at<0) return
    /* to the cards rather than to the row, because the pill is the element and what you want from an
       element you are looking at is what it could be doing */
    stage='choosing'; subjectN=at
    held.clear(); ends.clear(); render(); drawSel()
  })
  el.querySelectorAll('[data-drop]').forEach(b=>b.onclick=()=>{
    mark('removing '+tagOf(picks[Number(b.dataset.drop)].label))
    picks.splice(Number(b.dataset.drop),1); chosen=picks[picks.length-1]||null
    arr=null; opts=[]; drawSel(); render() })
  askSays(picks.length>1?'Give them motion':'Give it motion')
  armGlow(picks.length>0)
}
function paint(){
  /* only the previews in the grid: the sidebar thumbnails and the proxied app are iframes too, and
     counting them made the readout say 3 of 5 driven when all five were fine. That is the wandering
     number I could not pin down all session, and it was this */
  /* a preview inside a hidden figure stops running and stops replying, so counting it says one of
     two are driven when the one you are looking at is fine */
  const frames=[...document.querySelectorAll(DRIVEN)].filter(f=>f.offsetParent!==null)
  if(!opts.length&&!railed()){
    link.removeAttribute('data-ok'); link.title='nothing to drive yet'; return }
  /* counted over the frames that are actually on screen rather than over everything the map still
     remembers, or closing an opened option reports five of one */
  const live=frames.filter((f,i)=>(held.get(i)||0)>0).length
  const all=live===frames.length
  link.setAttribute('data-ok', all?'yes':'no')
  link.title=live+' of '+frames.length+' previews are being driven by the scrubber'
}
function hold(ms){
  ;[...document.querySelectorAll(DRIVEN)].filter(f=>f.offsetParent!==null).forEach((f,i)=>{
    try{f.contentWindow.postMessage({wall:'hold',t:ms,i},'*')}catch(_){}
  })
  scrub.value=ms; at.textContent=(ms/1000).toFixed(2)
  markPlayhead(ms)
}
function face(){document.getElementById('glyph').textContent=running?'❚❚':'▶'
  play.title=running?'Pause (space)':'Play (space)'}
/* last, because everything below reads state and functions declared throughout this script, and
   three separate dead zone faults in one sitting all came from booting something too early */
shelfAll().then(l=>{ kept=new Set(l.map(r=>r.id))
  const badge=document.getElementById('savedn'); if(badge) badge.textContent=l.length||''
  if(opts.length) render()
}).catch(()=>{})

/**
 * The composition left with the server so a restart does not cost it, and the page reloading itself
 * when the studio underneath it has moved.
 *
 * npm run studio watches its own sources, so editing one bounces the process in about half a second
 * while this tab carries on with the javascript it already loaded. That is worse than it sounds: a
 * dynamic import is cached for the life of a document, so a change to arrange or raster is simply
 * not in a tab that was open when it landed, and the studio and the page it served disagree with
 * nothing saying so. It is the fault CLAUDE.md warns about for processes, one process along.
 *
 * So the page reloads when the boot answering it changes, and the work is put back afterwards.
 * Reloading without that would trade a silent wrongness for a loud loss.
 */
function keepWork(){
  if(keeping) return
  keeping=setTimeout(()=>{
    keeping=null
    try{ fetch('/__wall/work',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({picks,arr,rails,railN,zoom,chosenOpt})}).catch(()=>{}) }catch(_){}
  },600)
}
async function putBack(){
  try{
    const was=await fetch('/__wall/work').then(r=>r.json())
    if(!was||!was.picks||!was.picks.length) return
    await arriving
    picks=was.picks; chosen=picks[picks.length-1]||null
    arr=was.arr?ARR.revive(was.arr):null
    rails=(was.rails||[]).map(t=>ARR.revive(t)).filter(Boolean)
    railN=Math.min(Number(was.railN)||0,Math.max(0,rails.length-1))
    zoom=Number(was.zoom)||0; chosenOpt=was.chosenOpt===undefined?null:was.chosenOpt
    sel=new Set(); lead=null; anchor=null
    /* an arrangement points at motions by id and the store keeps the last eighty, so one that has
       been evicted would ask for a frame the server answers with gone. Said, rather than shown as
       an empty room somebody has to work out for themselves */
    if(arr&&ARR.live(arr).length){
      const on=ARR.live(arr)
      const there=await Promise.all(on.map(x=>fetch('/__wall/preview/'+x.car.motion.id)
        .then(r=>r.ok).catch(()=>false)))
      const lost=there.filter(v=>!v).length
      if(lost===on.length){ arr=null; rails=[]
        drops.textContent='The motions from before are past the studio memory, so the rail is gone. '
          +'The picks are still here, so asking again is one press.' }
      else if(lost) drops.textContent=lost+' of '+on.length
        +' motions are past the studio memory, so those rows will not play.'
    }
    drawSel(); render(); drawInspector()
  }catch(_){ /* nothing to put back is the ordinary case, and not worth saying */ }
}
putBack()
/* a different process answering is the only reliable sign that the code under this page moved */
try{
  const watch=new EventSource('/__wall/live')
  let born=null, caughtAt=0
  watch.onmessage=(e)=>{
    try{
      const said=JSON.parse(e.data||'{}')
      /* something picked on a page the studio could not reach, handed in and waiting. Fetched rather
         than carried on the stream, since a capture is a snapshot and a heartbeat is not the place */
      if(said.caught&&said.at&&said.at!==caughtAt){ caughtAt=said.at; takeInbox(); return }
      if(born===null){ born=said.boot; return }
      if(said.boot&&said.boot!==born){ watch.close(); location.reload() }
    }catch(_){}
  }
}catch(_){}

requestAnimationFrame(function tick(now){const s=now-last;last=now
  if(running){t=(t+s*rate)%span;hold(t)} requestAnimationFrame(tick)})
play.onclick=()=>{running=!running;face()}
scrub.oninput=()=>{running=false;face();t=Number(scrub.value);hold(t)}
addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'&&e.target.type!=='range')return
  // escape leaves pick mode from either side: the frame has its own handler, but the pointer being
  // over the frame does not mean the frame has focus, and a key that works only sometimes reads broken
  if(e.key==='Escape'&&opened){ opened=null; held.clear(); ends.clear(); render(); return }
  if(e.key==='Escape'&&document.getElementById('pick').getAttribute('aria-pressed')==='true'){
    const f=document.querySelector('.appwrap iframe')
    if(f) f.contentWindow.postMessage({wall:'nopick'},'*')
    return
  }
  if(e.target.tagName==='INPUT'&&e.target.type==='range')return
  if(e.key===' '){e.preventDefault();play.click()}
  if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();running=false;face()
    t=Math.max(0,Math.min(span,t+(e.key==='ArrowRight'?100:-100)));hold(t)}})
<\/script></body></html>`
