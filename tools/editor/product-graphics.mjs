/** Product mechanisms, intentionally illustrative. Their action clock also drives the score. */
export const MECHANISMS=['workflow','records','inbox','publish','checkout','integration']
export const ACTION_PHASES=[.08,.32,.58,.8]
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function productGraphic(kind,accent,ink,labels=[]){
 const defaults={workflow:['Trigger','Condition','Action','Result'],records:['Import','Fields','Records','Save'],inbox:['Arrive','Read','Route','Reply'],publish:['Draft','Preview','Check','Publish'],checkout:['Choose','Checkout','Payment','Receipt'],integration:['Request','Connect','Transform','Use']}
 if(!MECHANISMS.includes(kind))return ''
 const words=defaults[kind].map((s,i)=>esc(labels[i]||s))
 const phase=(i,extra='')=>`class="mechanism-step ${extra}" style="--phase:${ACTION_PHASES[i]}"`
 const text=(x,y,s,size=36)=>`<text x="${x}" y="${y}" fill="${ink}" font-size="${size}" text-anchor="middle">${s}</text>`
 const rect=(x,y,w,h,fill='none',r=22)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${accent}" stroke-width="3"/>`
 const path=d=>`<path d="${d}" fill="none" stroke="${accent}" stroke-width="5" stroke-linecap="round"/>`
 const badge=(i,x,y)=>`<g ${phase(i)}><circle cx="${x}" cy="${y}" r="26" fill="${accent}"/>${text(x,y+10,String(i+1),28)}</g>`
 let body=''
 if(kind==='workflow'){
  body=path('M 480 530 H 760 M 1040 530 H 1300 M 900 390 V 240 H 1430 V 390')
  body+=`<g ${phase(0)}>${rect(160,390,320,280)}${text(320,545,words[0])}</g><g ${phase(1)}><path d="M900 350 1080 530 900 710 720 530Z" fill="none" stroke="${accent}" stroke-width="4"/>${text(900,540,words[1],32)}</g><g ${phase(2)}>${rect(1300,390,430,280)}${text(1515,540,words[2])}</g><g ${phase(3)}>${path('M 1450 605 l 30 30 65 -80')}${text(900,815,words[3],42)}</g>`
 }else if(kind==='records'){
  body=`<g ${phase(0)}>${[0,1,2].map(i=>rect(160+i*20,260+i*80,280,160)).join('')}${text(320,690,words[0])}</g>${path('M 500 490 H 670')}`
  body+=`<g ${phase(1)}>${rect(710,240,1010,500)}${[1,2,3,4].map(i=>path(`M 710 ${240+i*100} H 1720`)).join('')}${[1,2].map(i=>path(`M ${710+i*335} 240 V 740`)).join('')}${text(885,305,words[1])}${text(1220,305,words[2])}${text(1555,305,words[3])}</g>`
  body+=`<g ${phase(2)}>${[0,1,2].map(i=>`<rect x="745" y="${375+i*100}" width="230" height="14" rx="7" fill="${ink}" opacity=".7"/><circle cx="1555" cy="${380+i*100}" r="14" fill="${accent}"/>`).join('')}</g><g ${phase(3)}>${path('M 1070 600 l 35 35 65 -85')}</g>`
 }else if(kind==='inbox'){
  body=`<g ${phase(0,'mail-arrival')}>${rect(160,330,390,270)}${path('M 180 355 L 355 485 530 355')}${text(355,690,words[0])}</g>`
  body+=`<g ${phase(1)}>${rect(760,250,350,480)}${path('M 805 340 H 1060 M 805 400 H 1060 M 805 460 H 985')}${text(935,680,words[1])}</g>`
  body+=`<g ${phase(2)}>${path('M 550 470 H 745 M 1110 470 H 1370')}${text(1225,430,words[2],28)}</g><g ${phase(3)}>${rect(1390,365,350,230)}${path('M 1470 445 H 1635 l -40 -40 M 1635 445 l -40 40')}${text(1565,680,words[3])}</g>`
 }else if(kind==='publish'){
  body=`<g ${phase(0)}>${rect(160,290,520,360)}${path('M 160 355 H 680')}${text(420,520,words[0],55)}</g><g ${phase(1)}>${rect(830,240,860,490)}${path('M 830 315 H 1690')}${rect(880,370,300,290)}${rect(1210,370,420,120)}${rect(1210,520,420,140)}${text(1260,820,words[1],44)}</g><g ${phase(2)}>${path('M 620 490 H 810')}${text(720,435,words[2],28)}</g><g ${phase(3)}><rect x="1270" y="535" width="330" height="110" rx="55" fill="${accent}"/>${text(1435,605,words[3],40)}</g>`
 }else if(kind==='checkout'){
  body=`<g ${phase(0)}>${rect(180,280,450,420)}${rect(230,335,350,180)}${text(405,620,words[0],46)}</g><g ${phase(1)}>${rect(780,340,460,290)}${path('M 780 420 H 1240')}${text(1010,540,words[1],44)}</g><g ${phase(2)}>${path('M 640 490 H 760 M 1250 490 H 1340')}${text(1000,745,words[2],36)}</g><g ${phase(3)}>${rect(1370,260,340,450)}${path('M 1450 390 l 50 50 90 -110 M 1430 530 H 1640 M 1430 580 H 1600')}${text(1540,790,words[3],42)}</g>`
 }else{
  body=`<g ${phase(0)}>${rect(140,350,420,280)}${text(350,510,words[0],46)}</g><g ${phase(1)}>${path('M 580 490 H 790 M 1110 490 H 1370')}<circle cx="960" cy="490" r="155" fill="none" stroke="${accent}" stroke-width="4"/>${text(960,500,words[1],40)}</g><g ${phase(2)}>${[-1,0,1].map((i)=>`<circle class="data-packet" style="--packet:${i+1}" cx="${650+i*60}" cy="490" r="12" fill="${ink}"/>`).join('')}${text(960,740,words[2],36)}</g><g ${phase(3)}>${rect(1390,300,370,390)}${path('M 1440 395 H 1710 M 1440 470 H 1650 M 1440 545 H 1690')}${text(1575,790,words[3],42)}</g>`
 }
 return `<g class="mechanism-graphic" data-mechanism="${kind}">${body}${[0,1,2,3].map((i)=>badge(i,810+i*100,910)).join('')}</g>`
}
export const mechanismCSS=`.mechanism-step{animation:mechanism-arrive calc(var(--d)*.12) cubic-bezier(.16,1,.3,1) calc(var(--d)*var(--phase)) both}.mechanism-graphic text{letter-spacing:-.02em}.data-packet{animation:data-packet calc(var(--d)*.2) linear calc(var(--d)*.58 + var(--packet)*70ms) both}.mechanism-stage{position:absolute;inset:0}.mechanism-heading{position:absolute;left:100px;top:100px;font-size:84px!important;max-width:1650px;animation:rise .25s ease-out both}.mechanism-note{position:absolute;right:80px;bottom:48px;font-size:18px;opacity:.55}@keyframes mechanism-arrive{from{opacity:0;translate:0 24px}to{opacity:1;translate:0 0}}@keyframes data-packet{from{translate:0 0}to{translate:730px 0}}`
