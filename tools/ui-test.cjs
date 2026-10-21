const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
const {chromium}=require(process.env.STRIDE_PLAYWRIGHT||'C:/Users/AA/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../app/src/main/assets'),output=path.resolve(__dirname,'../dist');
const server=http.createServer((req,res)=>{const name=decodeURIComponent(req.url.split('?')[0]);const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('json')?'application/json':'text/html');res.end(data);});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.STRIDE_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await page.route('https://**/*',route=>route.abort());
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const openTools=async()=>{
   if(await page.locator('#routeToolsSheet').isVisible())return;
   const before=await page.evaluate(()=>({route:JSON.stringify(route),history:history.length,kind:routeKind})),b=await page.locator('#map').boundingBox();
   await page.mouse.move(b.x+b.width*.45,b.y+b.height*.4);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();
   assert(await page.locator('#routeToolsSheet').isVisible(),'map long press did not open route tools');
   assert.deepEqual(await page.evaluate(()=>({route:JSON.stringify(route),history:history.length,kind:routeKind})),before,'opening tools edited the route');
  };
  const click=async id=>{if(!(await page.locator('#'+id).isVisible()))await openTools();await page.locator('#'+id).click();};
  const go=async name=>{if(await page.locator('#page-'+name).evaluate(e=>e.classList.contains('active')))return;if(await page.locator('body').evaluate(e=>e.classList.contains('route-home')))await click(name==='motion'?'openMotion':'openMapLibrary');else await page.locator('[data-page="'+name+'"]').click();};
  const speed=async value=>page.locator('#speed').evaluate((e,value)=>{e.value=String(value);e.dispatchEvent(new Event('input',{bubbles:true}));},value);
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>typeof china!=='undefined'&&china);await page.evaluate(()=>setMapSource('overview'));
  assert.equal(await page.locator('#speed').inputValue(),'3');assert.equal(await page.locator('#speed').getAttribute('min'),'0');assert.equal(await page.locator('#speed').getAttribute('max'),'5');
  assert.equal(await page.locator('#routeDistance').textContent(),'0.00');
  await click('demo');await page.waitForTimeout(150);await page.evaluate(()=>document.getElementById('toast').classList.remove('show'));
  const sampleLength=parseFloat(await page.locator('#routeDistance').textContent());assert(sampleLength>1&&sampleLength<10);
  await page.screenshot({path:path.join(output,'preview-home.png'),fullPage:true});
  await click('openEditor');assert(await page.locator('body').evaluate(e=>e.classList.contains('editing')));
  await page.screenshot({path:path.join(output,'preview-editor.png')});
  const initialCount=parseInt(await page.locator('#pointCount').innerText());
  await page.locator('#map').tap({position:{x:260,y:420}});assert.equal(parseInt(await page.locator('#pointCount').innerText()),initialCount+1);
  await click('editorUndo');assert.equal(parseInt(await page.locator('#pointCount').innerText()),initialCount);
  await click('roundTrip');assert(Math.abs(parseFloat(await page.locator('#editorDistance').innerText())-sampleLength*2)<.02);
  await click('roundTrip');await click('editorDone');
  await speed(0);assert.equal(Number(await page.locator('#speedValue').textContent()),0);await click('start');await page.waitForTimeout(700);
  assert.equal(await page.evaluate(()=>state.status),'running');assert.equal(await page.evaluate(()=>state.distance),0);assert.equal(await page.evaluate(()=>state.steps),0);
  await speed(5);assert.equal(Number(await page.locator('#speedValue').textContent()),5);await page.waitForTimeout(450);assert((await page.evaluate(()=>state.distance))>.8,'5 min/km did not move at the declared speed');
  await speed(0);await page.waitForTimeout(180);const stopped=await page.evaluate(()=>({distance:state.distance,steps:state.steps}));await page.waitForTimeout(350);assert.deepEqual(await page.evaluate(()=>({distance:state.distance,steps:state.steps})),stopped,'zero speed advanced distance or steps');
  await speed(3);await page.waitForTimeout(300);assert((await page.evaluate(()=>state.distance))>stopped.distance);
  await click('start');await page.waitForTimeout(180);const paused=await page.evaluate(()=>state.distance);await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>state.distance),paused);
  await click('start');await page.waitForTimeout(300);assert((await page.evaluate(()=>state.distance))>paused);
  await go('motion');await page.waitForTimeout(300);await page.screenshot({path:path.join(output,'preview-motion.png'),fullPage:true});
  await click('gyroToggle');await page.waitForTimeout(180);assert.equal(await page.locator('#gx').innerText(),'0.000');await click('gyroToggle');
  await click('stop');await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>state.status),'idle');
  await go('maps');await page.screenshot({path:path.join(output,'preview-maps.png'),fullPage:true});
  await page.locator('.backup-maps summary').click();await click('showChina');await click('chooseCity');await page.locator('#citySearch').fill('长沙');assert.equal(await page.locator('.city-result').count(),1);await page.locator('.city-result').click();assert((await page.locator('#cityLabel').textContent()).includes('长沙'));
  await click('chooseCity');await page.locator('#citySearch').fill('28.2282,112.9388');await page.locator('.city-result').click();assert((await page.locator('#cityLabel').textContent()).includes('自定坐标'));
  await page.reload();await page.waitForFunction(()=>typeof china!=='undefined'&&china);await page.evaluate(()=>setMapSource('overview'));assert(Math.abs(parseFloat(await page.locator('#routeDistance').textContent())-sampleLength)<.01);assert.equal(await page.locator('#speed').inputValue(),'3');
  for(const width of [320,393,480]){await page.setViewportSize({width,height:852});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'horizontal overflow '+width);}
  assert.deepEqual(errors,[]);
  console.log('PASS: long-press route tools, editing, waypoints, undo, round trip, 0–5 min/km speed/default 3, zero-speed standstill, live speed changes, pause/resume, gyro, city search, persistence and mobile widths; no uncaught errors.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
