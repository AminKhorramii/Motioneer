import assert from 'node:assert/strict'
/** Called by the editor suite on its disposable local project. */
export async function verifyFilmUX(page,request){
  const button=name=>page.getByRole('button',{name,exact:true}),field=name=>page.getByLabel(name,{exact:true})
  const save=async()=>{await page.waitForFunction(()=>document.querySelector('.save-status')?.textContent==='Saved locally');const id=await page.evaluate(()=>localStorage.getItem('motioneer-project'));return (await request('projects/'+id)).data}
  const baseline=await save(),count=baseline.tracks.length
  assert.equal(await button('Clips').getAttribute('aria-pressed'),'true')
  await button('Layers').click();assert.equal(await page.locator('.track-row').count(),count);assert.deepEqual((await save()).tracks,baseline.tracks)
  await button('Clips').click();assert((await page.locator('.track-row').count())<count)
  await button('Back to start').click();await button('Progress clip').click()
  const progress=baseline.tracks.find(t=>t.name==='Progress'),progressStart=progress.start
  assert(Math.abs(Number(await field('Playhead time (s)').inputValue())-progressStart/1000)<.02)
  assert.equal(await field('Layer name').inputValue(),'Progress');assert.equal(await page.locator('.selection-box').count(),1)
  await button('Back to start').click();assert.equal(await page.locator('.selection-box').count(),0,'Inactive clips have no phantom handles')
  await button('Go to clip').click()
  // Compare the overlay to the actual transformed composition node, including camera movement.
  await field('Playhead time (s)').fill(String((progressStart+1000)/1000));await field('Playhead time (s)').press('Enter')
  const geometry=await page.locator('.canvas-frame').first().evaluate((node,id)=>{const iframe=node.querySelector('iframe'),track=iframe.contentDocument.querySelector(`[data-track="${id}"]`),actual=track.getBoundingClientRect(),overlay=node.querySelector('.selection-box').getBoundingClientRect(),outer=node.getBoundingClientRect(),scale=iframe.getBoundingClientRect().width/iframe.offsetWidth;return {dx:Math.abs(overlay.x-outer.x-actual.x*scale),dy:Math.abs(overlay.y-outer.y-actual.y*scale),dw:Math.abs(overlay.width-actual.width*scale)}},progress.id)
  assert(geometry.dx<1&&geometry.dy<1&&geometry.dw<1,JSON.stringify(geometry))
  // A pointer click creates no history; a cancelled drag restores the complete state.
  let before=await save();const overlay=await page.locator('.selection-box').boundingBox()
  await page.mouse.move(overlay.x+15,overlay.y+15);await page.mouse.down();await page.mouse.move(overlay.x+55,overlay.y+35,{steps:5});await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual((await save()).tracks,before.tracks)
  const x=Number(await field('X position %').inputValue())
  await field('X position %').fill('24');await field('X position %').fill('28');await field('X position %').press('Tab');await button('Undo').click();assert.equal(Number(await field('X position %').inputValue()),x);await button('Redo').click();assert.equal(Number(await field('X position %').inputValue()),28);await button('Undo').click()
  await button('Change motion').click();const dialog=page.getByRole('dialog',{name:'Change motion'});assert.equal(await dialog.count(),1)
  const choices=dialog.locator('.motion-choices>button[aria-pressed=false]');await choices.first().click();const replaced=await save(),changed=replaced.tracks.find(t=>t.id===progress.id)
  assert.notEqual(changed.motionId,progress.motionId);assert.deepEqual({...changed,motionId:progress.motionId},progress)
  await button('Undo').click()
  // Modifier selection toggles and mixed values never impersonate a single layer.
  await button('Projects clip').click({modifiers:['Meta']});assert.equal(await page.locator('.clip.selected').count(),2);assert.equal(await page.getByText('2 layers selected',{exact:true}).count(),1);assert.equal(await button('Change motion').count(),0)
  await button('Projects clip').click({modifiers:['Meta']});assert.equal(await page.locator('.clip.selected').count(),1)
  // Library preview and filtering must never create an instance.
  await field('Search library').fill('Projects');await button('Preview Projects').click();assert.equal(await page.locator('.clip').count(),count);await field('Search library').fill('');await button('Close asset preview').click()
  // Manual insertion uses the drop position; title editing is one undoable session.
  await page.locator('.film-asset').filter({has:button('Preview Projects')}).dragTo(page.locator('.track-lane').first())
  assert.equal(await page.locator('.clip').count(),count+1);await button('Undo').click();assert.equal(await page.locator('.clip').count(),count)
  await page.locator('.library').getByRole('button',{name:'Title',exact:true}).click();await field('Title').fill('A fresh title');await field('Title').fill('A clearer story');await field('Title').press('Tab');await button('Undo').click();assert.equal(await field('Title').inputValue(),'Your next great idea');await button('Undo').click();assert.equal(await page.locator('.clip').count(),count)
  // Rebuilding saves the whole previous take and a restore brings its settings back.
  before=await save();await page.locator('.library').getByRole('button',{name:'Create first cut',exact:true}).click();await field('Cut pace').selectOption('fast');await field('Cut length (s)').fill('12')
  await page.keyboard.press('Space');assert.equal(await button('Pause').count(),0,'Space in a dialog cannot start the film')
  await button('Create cut').click();const rebuilt=await save(),backup=rebuilt.arrangements.at(-1)
  assert.equal(rebuilt.settings.duration,12000);assert.deepEqual(backup.settings,before.settings);assert.deepEqual(backup.tracks,before.tracks)
  await button(backup.name).click();assert.equal(await page.getByText('Current cut',{exact:true}).count(),1);assert.equal(await page.getByText(backup.name,{exact:true}).count(),2)
  await button('Use '+backup.name).click();assert.deepEqual((await save()).tracks,before.tracks);assert.deepEqual((await save()).settings,before.settings)
  // Ruler drag is continuous and keyboard stepping respects the chosen frame rate.
  let r=await page.locator('.ruler').boundingBox();await page.mouse.move(r.x+r.width*.2,r.y+15);await page.mouse.down();await page.mouse.move(r.x+r.width*.4,r.y+15,{steps:5});assert(Math.abs(Number(await field('Playhead time (s)').inputValue())-before.settings.duration/1000*.4)<.1);await page.mouse.up()
  for(const fps of [30,60]){await button('Film settings').click();await field('Frame rate').selectOption(String(fps));await button('Back to start').click();await button('Step one frame').click();assert(Math.abs(Number(await field('Playhead time (s)').inputValue())-1/fps)<.006)}
  await field('Frame rate').selectOption(String(before.settings.fps))
  await button('Zoom in timeline').click();r=await page.locator('.ruler').boundingBox();assert(r.width>400);await button('Fit').click()
  await button('Collapse library').click();assert.equal(await page.locator('.library').count(),0);await button('Show library').click();await button('Collapse inspector').click();assert.equal(await page.locator('.inspector').count(),0);await button('Show inspector').click()
  await button('Camera').click();assert.equal(await page.getByRole('heading',{name:'Camera',exact:true}).count(),1)
  // A render failure stays discoverable after the export dialog is closed.
  await page.route('**/__motioneer/projects/*/renders',route=>route.fulfill({json:[{id:'failed-fixture',state:'error',message:'Fixture renderer failed',done:0,total:0,revision:1,name:'Test export'}]}))
  await button('Export failed · Retry').waitFor();await button('Export failed · Retry').click();assert.equal(await page.getByRole('dialog',{name:'Export film',exact:true}).count(),1);await button('Close').click();await page.unroute('**/__motioneer/projects/*/renders')
  console.log('ok: film selection, transformed handles, cancelled gestures, grouped undo, motion replacement, library preview, first-cut snapshots, scrubbing, frame stepping and panels')
}
