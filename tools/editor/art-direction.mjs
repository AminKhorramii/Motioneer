/** Portable display typography and material treatments for authored motion films. */
import {readFileSync} from 'node:fs'
export const ART={
 studio:{font:'syne',description:'Sculptural vector studio: generous type, curved paths, quiet margins and deliberate scale changes.'},
 editorial:{font:'bodoni-moda',description:'Fashion editorial: high-contrast serif display, fine rules, asymmetric poster layouts and paper-like surfaces.'},
 playful:{font:'bricolage-grotesque',description:'Expressive design playground: oversized rounded type, elastic shapes, tight graphic crops and confident color.'},
 chrome:{font:'syne',description:'Luminous material study: fine display type, reflective gradients, liquid contours and dark spacious compositions.'},
 technical:{font:'archivo',description:'Precision design lab: structured typography, hairline grids, measured alignments and wireframe depth.'},
 print:{font:'archivo',description:'Graphic print studio: compressed bold typography, optical stripes, hard edges and offset color fields.'}
}
const fonts=new Map()
export function artStyles(art){
 if(!ART[art])return ''
 const file=ART[art].font
 if(!fonts.has(file))fonts.set(file,readFileSync(new URL(`./fonts/${file}.woff2`,import.meta.url)).toString('base64'))
 const family=`Motion-${file}`
 const base=`@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${fonts.get(file)}) format('woff2');font-weight:100 900;font-style:normal;font-display:block}.scene,.product-scene{font-family:'${family}',sans-serif}.scene .folio{font-size:17px;opacity:.6}.scene .graphic-detail{font-size:18px}.scene .resolve-title{font-weight:650}.product-scene .product-title{font-weight:600;letter-spacing:-.055em;line-height:1.02}.scene .echo>div{font-size:170px}.scene .split-copy h1{font-size:125px}.scene .graphic-title{font-size:140px}`
 const styles={
 studio:'.scene .punch{font-weight:650;letter-spacing:-.06em}.scene .type-lines>div{font-weight:600}.scene .impact-mark{opacity:.35}.product-scene .product-window{border-radius:4px;box-shadow:none}.product-scene .product-geometry{opacity:.12}',
 editorial:'.scene .punch,.scene .resolve-title,.scene .type-lines>div{font-weight:500;letter-spacing:-.055em}.scene .type-lines>div{line-height:1.04}.scene .echo>div{font-weight:500;font-style:italic;letter-spacing:-.03em}.scene .rule{height:1px}.scene .graphic-title{font-style:italic}.scene .stack>div{border-radius:0;box-shadow:none}.product-scene .product-window{border-radius:0;border:0;box-shadow:none}.product-scene .product-title{font-weight:500;font-style:italic}.product-scene .product-geometry{opacity:.07}',
 playful:'.scene .punch,.scene .resolve-title,.scene .type-lines>div{font-weight:800}.scene .impact-mark{opacity:.35}.scene .stack>div{border-radius:36px;border-width:3px}.product-scene .product-window{border-radius:32px;box-shadow:18px 22px 0 #0002}.product-scene .product-title{font-weight:750}',
 chrome:'.scene .punch,.scene .resolve-title,.scene .type-lines>div{font-weight:500;letter-spacing:-.055em}.scene .impact-mark,.scene .resolve-art{opacity:.7}.scene .rule{height:1px}.scene .folio{opacity:.4}.product-scene .product-window{border-radius:12px;border-color:#ffffff50;box-shadow:0 25px 80px #0008}.product-scene .product-geometry{opacity:.4}.product-scene .product-title{font-weight:500}',
 technical:'.scene{background-image:linear-gradient(#80808012 1px,transparent 1px),linear-gradient(90deg,#80808012 1px,transparent 1px);background-size:80px 80px}.scene .punch,.scene .resolve-title{font-weight:600;letter-spacing:-.055em}.scene .rule{height:2px}.scene .stack>div{border-radius:0;box-shadow:none}.scene .diagram-tags span{border-width:1px}.product-scene .product-window{border-radius:0;box-shadow:none}.product-scene .product-title{font-weight:600}',
 print:'.scene .punch,.scene .resolve-title,.scene .type-lines>div{font-weight:900;letter-spacing:-.065em}.scene .echo{transform:rotate(0)}.scene .echo>div{font-weight:900;-webkit-text-stroke-width:1px}.scene .impact-mark{opacity:.55}.scene .rule{height:14px}.scene .stack>div{border-radius:0;box-shadow:20px 20px 0 #0003}.product-scene .product-window{border-radius:0;border-width:4px;box-shadow:20px 20px 0 #0003}.product-scene .product-title{font-weight:900}'
 }
 return base+styles[art]
}
