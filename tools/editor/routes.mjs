import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { projectStore } from './projects.mjs'
import { renderer } from './render.mjs'
import { compositionDocument } from '../../dist-core/core.js'
const BUILD = fileURLToPath(new URL('../../dist-editor/', import.meta.url))
/**
 * A project carries every captured element with its stylesheet and its fonts inlined, about a
 * megabyte each on a site like mongodb.com, and a film of twelve elements passed twenty-five
 * megabytes; every save after that was refused as too large, so no kept motion ever reached the
 * cut. The studio runs on the person's own machine, so a body is limited only against a runaway.
 */
async function body(req, limit = 400*1024*1024) { const chunks=[]; let size=0;for await(const d of req){size+=d.length;if(size>limit)throw Object.assign(new Error('This file is too large.'),{status:413});chunks.push(d)}return Buffer.concat(chunks) }
const jsonBody = async req => JSON.parse((await body(req)).toString('utf8') || '{}')
export function editorRoutes(hooks) {
  const store=projectStore(path.join(hooks.work,'projects')), render=renderer(store)
  return async (req,res,url) => {
    const p=url.pathname, parts=p.split('/').filter(Boolean)
    const send=(data,code=200,mime='application/json')=>{res.writeHead(code,{'content-type':mime,'cache-control':'no-store'});res.end(mime==='application/json'?JSON.stringify(data):data);return true}
    try {
      if(p==='/__motioneer/render-shell')return send('<!doctype html><html><body></body></html>',200,'text/html')
      if(p==='/__motioneer/editor' || p.startsWith('/__motioneer/editor/')) {
        const relative=p.replace(/^\/__motioneer\/editor\/?/,'') || 'index.html', file=path.resolve(BUILD,relative)
        if(!file.startsWith(BUILD))return send({error:'Not found'},404)
        const data=await readFile(file);const mime=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html';return send(data,200,mime)
      }
      if(p==='/__motioneer/editor-source'){const html=await hooks.source(url.searchParams.get('file'));return send(html,200,'text/html')}
      if(p==='/__motioneer/editor-config')return send(hooks.config())
      if(p==='/__motioneer/legacy-work')return send(await hooks.legacy())
      if(p==='/__motioneer/generate' && req.method==='POST') {
        const request=await jsonBody(req), controller=new AbortController();res.on('close',()=>controller.abort())
        return send(await hooks.generate(request,controller.signal))
      }
      if(p==='/__motioneer/renderer')return send(req.method==='POST'?render.install():await render.status())
      if(parts[1]!=='projects')return false
      const id=parts[2]
      if(!id){if(req.method==='GET')return send(await store.list());if(req.method==='POST')return send(await store.create((await jsonBody(req)).name),201)}
      if(parts.length===3){
        if(req.method==='GET')return send(await store.read(id))
        if(req.method==='PUT'){const data=await jsonBody(req);if(data.id!==id)return send({error:'Project identifier does not match.'},400);return send(await store.save(data))}
        if(req.method==='DELETE'){await store.remove(id);return send({ok:true})}
      }
      if(parts[3]==='assets') {
        if(req.method==='POST')return send(await store.importAsset(id,url.searchParams.get('name') || 'Asset',req.headers['content-type']?.split(';')[0],await body(req,100*1024*1024)),201)
        const asset=await store.asset(id,parts[4]);return send(asset.data,200,asset.mime)
      }
      if(parts[3]==='renders'){
        if(parts[5]==='film.mp4')return send(await render.file(id,parts[4]),200,'video/mp4')
        if(req.method==='DELETE')return send(render.cancel(parts[4],id))
        if(req.method==='POST'){const project=await store.read(id);const origin=`http://127.0.0.1:${req.socket.localPort}`;return send(await render.start(project,origin),202)}
        return send(await render.list(id))
      }
      if(parts[3]==='html'){
        const project=await store.read(id)
        let html=compositionDocument(project)
        for(const a of project.assets){const {data,mime}=await store.asset(id,a.id);const url=`/__motioneer/projects/${id}/assets/${a.id}`;html=html.split(url).join(`data:${mime};base64,${data.toString('base64')}`)}
        // The runtime builds URLs from the root and id. A map keeps the exported document offline.
        const sources={};for(const a of project.assets){const {data,mime}=await store.asset(id,a.id);sources[a.id]=`data:${mime};base64,${data.toString('base64')}`}
        html=html.replace('assetRoot + t.assetId','(assetRoot + t.assetId)')
        html=html.replace('</body>',`<script>window.__assetSources=${JSON.stringify(sources).replace(/</g,'\\u003c')};window.__composition.update(${JSON.stringify(project).replace(/</g,'\\u003c')});let t=0,last=performance.now(),playing=true;document.body.addEventListener('click',()=>playing=!playing);requestAnimationFrame(function tick(n){if(playing)t=(t+n-last)%${project.settings.duration};last=n;window.__composition.seek(t,playing);requestAnimationFrame(tick)});</script></body>`)
        res.setHeader('content-disposition',`attachment; filename="motioneer.html"`);return send(html,200,'text/html')
      }
      return send({error:'Not found'},404)
    }catch(e){return send({error:e.message},e.status || (e.code==='ENOENT'?404:400))}
  }
}
