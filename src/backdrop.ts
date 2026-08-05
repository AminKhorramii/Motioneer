/**
 * Generative backdrops.
 *
 * A landing page needs something behind the words, and a generated photograph is the wrong
 * material: it is the fastest way to look like every other page, and one image embedded as a
 * data URI is a hundred times the weight of the entire document. These are drawn instead,
 * from the taste sheet, so the art changes when the palette changes and a variant is visibly
 * a variant before you read a word.
 *
 * Everything here ships inside the page: no request, no asset, a couple of kilobytes.
 */

import type { Taste } from '@/taste'

export type Backdrop = 'none' | 'contours' | 'grain' | 'ridge'

export const BACKDROPS: Backdrop[] = ['none', 'contours', 'grain', 'ridge']

export const BACKDROP_NOTE: Record<Backdrop, string> = {
  none: 'flat colour',
  contours: 'drifting topographic lines',
  grain: 'still film grain and vignette',
  ridge: 'a slow ridged field',
}

/** a stable number from the taste sheet, so the same taste always draws the same field */
const seedOf = (t: Taste) =>
  [...`${t.name}${t.bg}${t.accent}${t.accent2}`].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7)

const rgb = (hex: string) => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/**
 * The fragment shader. `ridge` folds the noise so the field reads as ridges rather than
 * blobs, which is the difference between looking drawn and looking like a default gradient.
 */
const FRAG = (ridged: boolean) => `#version 300 es
precision highp float;
uniform vec2 r; uniform float t; uniform float sd;
uniform vec3 bg; uniform vec3 c1; uniform vec3 c2;
out vec4 o;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+sd)*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float s=0.,m=.5;for(int i=0;i<5;i++){${ridged
  ? 'float v=abs(n(p)*2.-1.);s+=m*(1.-v);'
  : 's+=m*n(p);'}p*=2.03;m*=.5;}return s;}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*r)/r.y;
  float f=fbm(uv*2.3+vec2(t*.021,t*.013));
  float band=f*${ridged ? '7.0' : '9.0'};
  float d=abs(fract(band)-.5);
  float w=fwidth(band)*1.15;
  float line=1.-smoothstep(0.,max(w,1e-4),d);
  vec3 col=mix(bg,mix(c1,c2,clamp(f,0.,1.)),line*.5);
  col*=1.-.34*length(uv*vec2(.62,1.));
  o=vec4(col,1.);
}`

/**
 * Returns the markup and script for a backdrop, or an empty string for none.
 * `frozen` draws the single still frame the reduced-motion path already draws, and never
 * starts the loop: a preview cell does not need sixty frames a second of topography.
 */
export function backdropHtml(t: Taste, kind: Backdrop, frozen = false): string {
  if (kind === 'none') return ''
  const seed = seedOf(t)
  const style = `<style>#bd{position:fixed;inset:0;width:100%;height:100vh;z-index:0;
-webkit-mask-image:linear-gradient(#000 45%,transparent 100%);mask-image:linear-gradient(#000 45%,transparent 100%)}
body>*:not(#bd){position:relative;z-index:1}</style>`

  if (kind === 'grain') {
    // still texture, drawn once: no animation loop, nothing to pause, no battery cost
    return `${style}<canvas id="bd"></canvas><script>
(function(){var c=document.getElementById('bd'),x=c.getContext('2d'),s=${seed};
function r(){s=(s*1103515245+12345)%2147483648;return s/2147483648}
function draw(){var w=c.width=innerWidth,h=c.height=innerHeight,d=x.createImageData(w,h),p=d.data;
for(var i=0;i<p.length;i+=4){var v=r()*255|0;p[i]=p[i+1]=p[i+2]=v;p[i+3]=13}
x.putImageData(d,0,0);}
draw();addEventListener('resize',draw);})()
</script>`
  }

  const [br, bg2, bb] = rgb(t.bg)
  const [r1, g1, b1] = rgb(t.accent)
  const [r2, g2, b2] = rgb(t.accent2)
  return `${style}<canvas id="bd"></canvas><script>
(function(){var c=document.getElementById('bd'),g=c.getContext('webgl2');
if(!g){c.style.background='linear-gradient(160deg,${t.accent}22,transparent 60%)';return}
function sh(k,s){var o=g.createShader(k);g.shaderSource(o,s);g.compileShader(o);return o}
var p=g.createProgram();
g.attachShader(p,sh(g.VERTEX_SHADER,'#version 300 es\\nin vec2 a;void main(){gl_Position=vec4(a,0.,1.);}'));
g.attachShader(p,sh(g.FRAGMENT_SHADER,${JSON.stringify(FRAG(kind === 'ridge'))}));
g.linkProgram(p);g.useProgram(p);
var b=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,b);
g.bufferData(g.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),g.STATIC_DRAW);
var a=g.getAttribLocation(p,'a');g.enableVertexAttribArray(a);g.vertexAttribPointer(a,2,g.FLOAT,false,0,0);
var ur=g.getUniformLocation(p,'r'),ut=g.getUniformLocation(p,'t');
g.uniform1f(g.getUniformLocation(p,'sd'),${seed});
g.uniform3f(g.getUniformLocation(p,'bg'),${br.toFixed(3)},${bg2.toFixed(3)},${bb.toFixed(3)});
g.uniform3f(g.getUniformLocation(p,'c1'),${r1.toFixed(3)},${g1.toFixed(3)},${b1.toFixed(3)});
g.uniform3f(g.getUniformLocation(p,'c2'),${r2.toFixed(3)},${g2.toFixed(3)},${b2.toFixed(3)});
function size(){var d=Math.min(devicePixelRatio||1,2);c.width=innerWidth*d;c.height=innerHeight*d;
g.viewport(0,0,c.width,c.height);g.uniform2f(ur,c.width,c.height)}
size();addEventListener('resize',size);
var still=${frozen}||matchMedia('(prefers-reduced-motion:reduce)').matches,run=true;
document.addEventListener('visibilitychange',function(){run=!document.hidden;if(run&&!still)requestAnimationFrame(f)});
function f(n){g.uniform1f(ut,n/1000);g.drawArrays(g.TRIANGLES,0,3);
if(run&&!still)requestAnimationFrame(f)}
if(still){g.uniform1f(ut,12);g.drawArrays(g.TRIANGLES,0,3)}else requestAnimationFrame(f);})()
</script>`
}
