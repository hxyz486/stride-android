const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
const {chromium}=require(process.env.STRIDE_PLAYWRIGHT||'C:/Users/AA/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../app/src/main/assets'),out=path.resolve(__dirname,'../dist/audit-map');
fs.mkdirSync(out,{recursive:true});
// A real decoded image, served entirely by Playwright. No test depends on a public tile service.
const tile='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="#eee"/><path d="M0 65H256M85 0V256" stroke="#fff" stroke-width="16"/><path d="M0 65H256M85 0V256" stroke="#999" stroke-width="1"/><rect x="120" y="110" width="75" height="55" fill="#ccc"/><text x="12" y="240" font-size="12">Controlled map fixture</text></svg>';
const server=http.createServer((req,res)=>{let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch(e){res.writeHead(400).end();return;}const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')||file.endsWith('.geojson')?'application/json':'text/html');res.end(data);});});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.STRIDE_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const results=[],errors=[],requests=[],importedRequests=[],held=new Set();let page,mode='ready',requestNumber=0,delayMs=0;
 const releaseHeld=async()=>{await Promise.all([...held].map(async route=>{held.delete(route);await route.abort().catch(()=>{});}));};
 try{
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  // A synthetic Android bridge enables the imported-map UI; APK/SQLite integration is tested separately.
  await context.addInitScript(()=>{
   window.Native={state:()=>JSON.stringify({status:'idle',gyro:[0,0,0]}),mapInfo:()=>JSON.stringify({available:false}),overlayState:()=>JSON.stringify({enabled:false})};
   if(sessionStorage.getItem('stride-location-fixture')==='enabled'){
    window.__locationCalls=0;window.__locationMode='success';window.__locationPoint=[113.2644,23.1291];
    window.Native.locate=interactive=>{window.__lastLocationInteractive=interactive;window.__locationCalls++;setTimeout(()=>{if(window.__locationMode==='denied')window.nativeEvent('locationError','定位权限未允许，可选择城市后继续使用地图');else window.nativeEvent('location',JSON.stringify({lon:window.__locationPoint[0],lat:window.__locationPoint[1],accuracy:8,provider:'gps',timestamp:Date.now()}));},10);};
   }
  });
  await context.route('**/tiles/**',async route=>{importedRequests.push(route.request().url());await route.fulfill({status:200,contentType:'image/svg+xml',body:tile});});
  // Intercept every external URL: an accidental extra provider must not escape to the network.
  await context.route('https://**/*',async route=>{
   const url=route.request().url();requests.push(url);requestNumber++;
   const parsed=new URL(url),params=parsed.searchParams,z=Number(params.get('z')),x=Number(params.get('x')),y=Number(params.get('y'));
   const canonical=parsed.origin==='https://webrd01.is.autonavi.com'&&parsed.pathname==='/appmaptile'&&params.get('lang')==='zh_cn'&&params.get('size')==='1'&&params.get('scale')==='1'&&params.get('style')==='7'&&[...params.keys()].length===7&&['x','y','z'].every(key=>/^\d+$/.test(params.get(key)||''))&&z<=19&&x<2**z&&y<2**z;
   if(!canonical){errors.push('Unexpected external URL: '+url);await route.abort();return;}
   if(mode==='hold'){held.add(route);return;}
   if(mode==='partial-error'&&requestNumber%2===0){await route.abort();return;}
   if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs));
   await route.fulfill({status:200,contentType:'image/svg+xml',headers:{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'},body:tile}).catch(()=>{});
  });
  page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',error=>errors.push(error.message));
  const check=async(name,fn)=>{const started=Date.now();try{await fn();results.push({name,status:'pass',milliseconds:Date.now()-started});console.log('PASS',name);}catch(error){results.push({name,status:'fail',error:error.message});throw error;}};
  const loaded=async()=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.waitForFunction(()=>typeof mapTiles!=='undefined'&&typeof china!=='undefined'&&china&&lastTileSummary&&lastTileSummary.total>0&&lastTileSummary.ready===lastTileSummary.total&&lastTileSummary.loading===0&&lastTileSummary.failed===0);};
  const openTools=async()=>{
   if(await page.locator('#routeToolsSheet').isVisible())return;
   const before=await page.evaluate(()=>({route:JSON.stringify(route),history:history.length,kind:routeKind})),b=await page.locator('#map').boundingBox();
   await page.mouse.move(b.x+b.width*.45,b.y+b.height*.4);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();
   assert(await page.locator('#routeToolsSheet').isVisible(),'map long press did not open route tools');
   assert.deepEqual(await page.evaluate(()=>({route:JSON.stringify(route),history:history.length,kind:routeKind})),before,'opening tools edited the route');
  };
  const click=async id=>{if(!(await page.locator('#'+id).isVisible()))await openTools();await page.locator('#'+id).click();};
  const select=async id=>{const center=await page.evaluate(()=>JSON.stringify(mapCenter));await click('mapStatus');assert(await page.locator('#mapSourceSheet').isVisible());await page.locator('#'+id).click();assert(!(await page.locator('#mapSourceSheet').isVisible()));assert.equal(await page.evaluate(()=>JSON.stringify(mapCenter)),center,'source selection changed stored WGS84 center');};
  const inputSession=await context.newCDPSession(page);
  const touch=async(type,points)=>inputSession.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({x:p[0],y:p[1],id:i}))});
  await page.goto('http://127.0.0.1:'+server.address().port);
  await check('online is the default and visible tiles decode successfully',async()=>{
   await loaded();assert.equal(await page.evaluate(()=>mapSource),'online');assert(requests.length>0);
   assert((await page.locator('#mapStatusText').textContent()).includes('在线'));
   assert((await page.locator('#mapAttribution').innerText()).includes('高德'));
   assert.equal(await page.evaluate(()=>mapTiles.sourceId),'online-amap');
   assert(await page.locator('#mapNotice').evaluate(e=>e.hidden));
   await page.screenshot({path:path.join(out,'online.png')});
  });
  await check('original map controls remain visible while lower data panels are trimmed',async()=>{
   assert(await page.evaluate(()=>document.body.classList.contains('route-home')));
   assert(await page.locator('#speed').isVisible());assert(await page.locator('#start').isVisible());assert.equal(await page.locator('#speed').inputValue(),'3');
   for(const id of ['homeMove','homeFreehand','homeWaypoints','locateMe','mapStatus','chooseCity'])assert(await page.locator('#'+id).isVisible(),id+' should stay directly on the map');
   assert.equal(await page.locator('#homeMove').getAttribute('aria-pressed'),'true');await click('homeFreehand');
   const b=await page.locator('#map').boundingBox();
   await page.mouse.move(b.x+b.width*.35,b.y+b.height*.42);await page.mouse.down();await page.mouse.move(b.x+b.width*.35+40,b.y+b.height*.42+20,{steps:8});await page.mouse.up();
   assert(await page.evaluate(()=>route.length>=2&&routeKind==='freehand'),'default one-finger input did not draw a route');
   await click('clear');await click('homeWaypoints');
   const points=await page.locator('#map').boundingBox();
   await page.locator('#map').tap({position:{x:points.width*.4,y:points.height*.43}});await page.locator('#map').tap({position:{x:points.width*.6,y:points.height*.48}});
   assert(await page.evaluate(()=>route.length===2&&routeKind==='waypoint'),'homepage waypoint tool did not create numbered points');
   if(await page.evaluate(()=>editing))await click('editorDone');
   await click('clear');await click('homeMove');
   assert.equal(await page.locator('#homeMove').getAttribute('aria-pressed'),'true');
  });
  await check('retina and fractional zoom sample finer tiles without stretching',async()=>{
   await page.evaluate(()=>{zoom=15.25;dirty=true;});await loaded();
   const tiles=await page.evaluate(()=>({dpr,keys:[...mapTiles.cache.keys()],size:256*2**(zoom-Math.ceil(zoom+Math.log2(Math.min(2,dpr))))}));
   assert.equal(tiles.dpr,2);assert(tiles.keys.some(key=>key.startsWith('online-amap/17/')));assert(tiles.size<128,'low-resolution tile is being enlarged');
  });
  await check('physical pixel tile edges and 3x screen sampling stay sharp',async()=>{
   await page.evaluate(()=>{zoom=16;dpr=2;resize();window.__tileRects=[];window.__originalDrawImage=ctx.drawImage;ctx.drawImage=function(img,x,y,w,h){__tileRects.push([x,y,w,h]);return __originalDrawImage.call(this,img,x,y,w,h);};dirty=true;});await loaded();
   const exact=await page.evaluate(()=>__tileRects);assert(exact.length>0);assert(exact.every(rect=>rect.every(v=>Math.abs(v*2-Math.round(v*2))<1e-8)),'tile edges must align to physical pixels');assert(exact.every(rect=>rect[2]*2===256&&rect[3]*2===256),'2x screen must render 256px source without the extra half-pixel stretch');
   await page.evaluate(()=>{dpr=3;resize();dirty=true;});await loaded();
   assert(await page.evaluate(()=>[...mapTiles.cache.keys()].some(key=>key.startsWith('online-amap/18/'))),'3x screen did not load finer tiles');assert(await page.evaluate(()=>mapTiles.cache.size<=96));
   await page.evaluate(()=>{ctx.drawImage=__originalDrawImage;delete window.__originalDrawImage;delete window.__tileRects;dpr=2;resize();dirty=true;});await loaded();
  });
  await check('Amap tiles, route projection, and touch inverse share GCJ02 at zoom 19',async()=>{
   // Independent landmark fixtures keep a missing or double-applied conversion from
   // passing merely because screen() and locationAt() undo the same mistake.
   const gcjCenter=[116.40337249402477,39.91793074924595],gcjPoint=[116.41364225378803,39.90560334316507];
   await page.evaluate(()=>{mapCenter=[116.397128,39.916527];zoom=19;dirty=true;});await loaded();
   const measured=await page.evaluate(()=>({point:screen([116.4074,39.9042]),width,height,center:locationAt(width/2,height/2),errors:[[12,18],[width*.23,height*.71],[width-15,height-21]].map(p=>{const actual=screen(locationAt(...p));return Math.hypot(actual[0]-p[0],actual[1]-p[1]);})}));
   const merc=([lon,lat])=>[(lon+180)/360,(1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2];
   const a=merc(gcjPoint),b=merc(gcjCenter),scale=256*2**19;
   assert(Math.abs(measured.point[0]-((a[0]-b[0])*scale+measured.width/2))<.03,'route longitude does not align with Amap GCJ02 tiles');
   assert(Math.abs(measured.point[1]-((a[1]-b[1])*scale+measured.height/2))<.03,'route latitude does not align with Amap GCJ02 tiles');
   assert(Math.abs(measured.center[0]-116.397128)<1e-8&&Math.abs(measured.center[1]-39.916527)<1e-8,'center was stored in display coordinates');
   assert(measured.errors.every(error=>error<.02),JSON.stringify(measured.errors));
   const tileX=Math.floor(b[0]*2**19),tileY=Math.floor(b[1]*2**19);
   assert(requests.some(url=>{const q=new URL(url).searchParams;return q.get('z')==='19'&&q.get('x')===String(tileX)&&q.get('y')===String(tileY);}),'center tile did not use GCJ02 projection');
  });
  await check('online pan and pinch retain the geographic anchor and never edit route',async()=>{
   await click('demo');await click('openEditor');await loaded();
   await page.evaluate(()=>{mapCenter=[112.9388,28.2282];zoom=17;dirty=true;});await loaded();
   const box=await page.locator('#map').boundingBox(),start=[box.width*.42,box.height*.55],delta=[43,29];
   await click('modeMove');
   const before=await page.evaluate(p=>({route:JSON.stringify(route),history:history.length,anchor:locationAt(...p)}),start);
   await page.mouse.move(box.x+start[0],box.y+start[1]);await page.mouse.down();await page.mouse.move(box.x+start[0]+delta[0],box.y+start[1]+delta[1],{steps:5});await page.mouse.up();await loaded();
   const panned=await page.evaluate(anchor=>({position:screen(anchor),route:JSON.stringify(route),history:history.length}),before.anchor);
   assert(Math.hypot(panned.position[0]-start[0]-delta[0],panned.position[1]-start[1]-delta[1])<.02,'pan shifted the anchor relative to the map');
   assert.equal(panned.route,before.route);assert.equal(panned.history,before.history);
   const mid=[box.width/2,box.height*.55],pinch=await page.evaluate(p=>({anchor:locationAt(...p),zoom,route:JSON.stringify(route),history:history.length}),mid);
   await touch('touchStart',[[box.x+mid[0]-45,box.y+mid[1]]]);await touch('touchStart',[[box.x+mid[0]-45,box.y+mid[1]],[box.x+mid[0]+45,box.y+mid[1]]]);
   await touch('touchMove',[[box.x+mid[0]-75,box.y+mid[1]],[box.x+mid[0]+75,box.y+mid[1]]]);await touch('touchEnd',[]);await loaded();
   const pinched=await page.evaluate(anchor=>({position:screen(anchor),zoom,route:JSON.stringify(route),history:history.length}),pinch.anchor);
   assert(pinched.zoom>pinch.zoom);assert(Math.hypot(pinched.position[0]-mid[0],pinched.position[1]-mid[1])<.02,'pinch moved its geographic anchor');
   assert.equal(pinched.route,pinch.route);assert.equal(pinched.history,pinch.history);
   await click('editorDone');await click('homeMove');
  });
  await check('source buttons preserve exact WGS84 route; overview and import issue no remote requests',async()=>{
   await click('demo');await loaded();
   const before=await page.evaluate(()=>({route:JSON.stringify(route),length:routeLength(),kind:routeKind}));
   await select('sourceOverview');await page.waitForTimeout(120);
   assert.equal(await page.evaluate(()=>mapSource),'overview');
   const overviewRequests=requests.length;
   await click('zoomIn');await click('zoomOut');
   await page.evaluate(()=>{mapCenter=[112.9388,28.2282];dirty=true;});await page.waitForTimeout(160);
   assert.equal(requests.length,overviewRequests,'overview fetched online tiles');
   await page.evaluate(()=>updateMapMeta({available:true,name:'Fixture offline package',size:1024,center:'112.9388,28.2282,14',bounds:'112.8,28.1,113.1,28.4'}));
   await select('sourceImported');await loaded();
   assert.equal(await page.evaluate(()=>mapSource),'imported');const remoteCount=requests.length;
   await click('zoomIn');await loaded();
   assert(importedRequests.length>0,'imported mode did not request local fixtures');
   assert.equal(requests.length,remoteCount,'imported mode fetched online tiles');
   assert.deepEqual(await page.evaluate(()=>({route:JSON.stringify(route),length:routeLength(),kind:routeKind})),before);
   await select('sourceOnline');await loaded();
   assert.equal(await page.evaluate(()=>JSON.stringify(route)),before.route);
  });
  await check('switching sources cancels pan/pinch and rolls back an unfinished freehand stroke',async()=>{
   const box=await page.locator('#map').boundingBox(),start=[box.x+box.width*.4,box.y+box.height*.55];
   await page.evaluate(()=>setMode('move'));
   await page.mouse.move(...start);await page.mouse.down();await page.mouse.move(start[0]+18,start[1]+12,{steps:3});
   await page.evaluate(()=>setMapSource('overview'));const center=await page.evaluate(()=>JSON.stringify(mapCenter));
   await page.mouse.move(start[0]+65,start[1]+40,{steps:4});await page.mouse.up();
   assert.equal(await page.evaluate(()=>JSON.stringify(mapCenter)),center,'stale pointer movement panned a new source');
   await select('sourceOnline');await loaded();
   const mid=[box.x+box.width/2,box.y+box.height*.55];
   await touch('touchStart',[[mid[0]-35,mid[1]]]);await touch('touchStart',[[mid[0]-35,mid[1]],[mid[0]+35,mid[1]]]);
   await touch('touchMove',[[mid[0]-45,mid[1]],[mid[0]+45,mid[1]]]);await page.evaluate(()=>setMapSource('overview'));
   const cancelledPinch=await page.evaluate(()=>({center:JSON.stringify(mapCenter),zoom}));
   await touch('touchMove',[[mid[0]-70,mid[1]],[mid[0]+70,mid[1]]]);await touch('touchEnd',[]);
   assert.deepEqual(await page.evaluate(()=>({center:JSON.stringify(mapCenter),zoom})),cancelledPinch,'stale pinch moved or zoomed a new source');
   await select('sourceOnline');await loaded();await page.evaluate(()=>{setMode('draw');editorMode='freehand';});
   const before=await page.evaluate(()=>({route:JSON.stringify(route),history:history.length,kind:routeKind}));
   await page.mouse.move(...start);await page.mouse.down();await page.mouse.move(start[0]+34,start[1]+20,{steps:5});
   assert.notEqual(await page.evaluate(()=>JSON.stringify(route)),before.route,'freehand setup did not create a stroke');
   await page.evaluate(()=>setMapSource('overview'));
   await page.mouse.move(start[0]+72,start[1]+40,{steps:5});await page.mouse.up();
   assert.deepEqual(await page.evaluate(()=>({route:JSON.stringify(route),history:history.length,kind:routeKind})),before);
   await select('sourceOnline');await loaded();
  });
  await check('malformed imported metadata keeps a valid WGS84 center and can return online',async()=>{
   const center=await page.evaluate(()=>JSON.stringify(mapCenter)),before=await page.evaluate(()=>JSON.stringify(route));
   for(const metadata of [{available:true,name:'Invalid center fixture',center:'500,40,14',bounds:'499,39,501,41'},{available:true,name:'Invalid bounds fixture',center:'',bounds:'112,95,114,96'}]){
    await page.evaluate(metadata=>{updateMapMeta(metadata);showImported();},metadata);await loaded();
    assert.equal(await page.evaluate(()=>JSON.stringify(mapCenter)),center,'invalid metadata replaced the WGS84 map center');
    assert(await page.evaluate(()=>Number.isFinite(zoom)&&mapCenter.every(Number.isFinite)&&Math.abs(mapCenter[0])<=180&&Math.abs(mapCenter[1])<=85.05112878));
    assert.equal(await page.evaluate(()=>JSON.stringify(route)),before);
    await select('sourceOnline');await loaded();assert.equal(await page.evaluate(()=>mapTiles.sourceId),'online-amap');
   }
  });
  await check('partial network failure stays visible and retry recovers all viewport tiles',async()=>{
   mode='partial-error';requestNumber=0;await page.evaluate(()=>{zoom=14;retryMap();});
   await page.waitForFunction(()=>lastTileSummary.ready>0&&lastTileSummary.failed>0&&lastTileSummary.loading===0);
   assert(await page.locator('#mapNotice').evaluate(e=>!e.hidden));assert((await page.locator('#mapNoticeText').textContent()).length>0);
   await page.screenshot({path:path.join(out,'partial-error.png')});
   mode='ready';await click('menuRetryMap');await loaded();
   assert(await page.locator('#mapNotice').evaluate(e=>e.hidden));
  });
  await check('unresponsive image requests time out and can be retried',async()=>{
   mode='hold';await page.evaluate(()=>{mapCenter=[113.5,29];mapTiles.timeoutMs=150;retryMap();});
   await page.waitForFunction(()=>lastTileSummary.failed>0);
   assert(held.size>0);assert(await page.locator('#mapNotice').evaluate(e=>!e.hidden));
   mode='ready';await releaseHeld();await page.evaluate(()=>{mapTiles.timeoutMs=12000;});
   await click('menuRetryMap');await loaded();assert(await page.locator('#mapNotice').evaluate(e=>e.hidden));
  });
  await check('rapid panning and zooming keep downloads and tile cache bounded',async()=>{
   delayMs=25;
   await page.evaluate(()=>{window.__mapBounds={inFlight:0,cache:0};window.__mapSampler=setInterval(()=>{__mapBounds.inFlight=Math.max(__mapBounds.inFlight,mapTiles.inFlight);__mapBounds.cache=Math.max(__mapBounds.cache,mapTiles.cache.size);},1);});
   for(let i=0;i<32;i++){
    await page.evaluate(i=>{mapCenter=[110+i*.31,25+(i%5)*.23];zoom=11+i%6;dirty=true;},i);
    await page.waitForTimeout(28);
   }
   await loaded();delayMs=0;
   // Complete enough distinct viewports to exercise eviction as well as cancellation.
   const beforeEviction=requests.length;
   for(let i=0;i<26;i++){await page.evaluate(i=>{mapCenter=[100+i*.5,30];zoom=14;dirty=true;},i);await loaded();}
   assert(requests.length-beforeEviction>96,'cache pressure did not exceed the 96-entry limit');
   const bounds=await page.evaluate(()=>{clearInterval(__mapSampler);return {...__mapBounds,current:mapTiles.cache.size};});
   assert(bounds.inFlight>0&&bounds.inFlight<=4,JSON.stringify(bounds));
   assert(bounds.cache<=96&&bounds.current<=96,JSON.stringify(bounds));
   assert(Number.isFinite(await page.evaluate(()=>zoom)));
  });
  await check('cold launch returns to online map without changing saved WGS84 route or center',async()=>{
   const routeBefore=await page.evaluate(()=>JSON.stringify(route));
   await select('sourceOverview');const centerBefore=await page.evaluate(()=>JSON.stringify(mapCenter));
   const count=requests.length;await page.reload();await loaded();
   assert.equal(await page.evaluate(()=>mapSource),'online');assert(requests.length>count,'cold launch did not request the default online map');
   assert.equal(await page.evaluate(()=>JSON.stringify(route)),routeBefore);
   assert.equal(await page.evaluate(()=>JSON.stringify(mapCenter)),centerBefore);
   await page.reload();await loaded();assert.equal(await page.evaluate(()=>mapSource),'online');
   assert.equal(await page.evaluate(()=>JSON.stringify(route)),routeBefore);
  });
  await check('source menu offers offline overview after a tile failure',async()=>{
   mode='hold';await page.evaluate(()=>{mapCenter=[119,32];mapTiles.timeoutMs=120;retryMap();});await page.waitForFunction(()=>lastTileSummary.failed>0);
   await select('sourceOverview');assert.equal(await page.evaluate(()=>mapSource),'overview');
   await releaseHeld();const count=requests.length;await click('zoomIn');await page.waitForTimeout(180);
   assert.equal(requests.length,count);assert(await page.locator('#mapNotice').evaluate(e=>e.hidden));
  });
  await check('cold launch automatically locates through native bridge and preserves saved WGS84 route',async()=>{
   mode='ready';await releaseHeld();
   const routeBefore=await page.evaluate(()=>JSON.stringify(route));
   // This bridge delivers a controlled GPS result; no browser/system location
   // permission is requested and no host location is read by the audit.
   await page.evaluate(()=>sessionStorage.setItem('stride-location-fixture','enabled'));
   await page.reload();await page.waitForFunction(()=>window.__locationCalls===1&&Math.abs(mapCenter[0]-113.2644)<1e-6&&Math.abs(mapCenter[1]-23.1291)<1e-6);await loaded();
   assert.equal(await page.evaluate(()=>mapSource),'online');assert.equal(await page.evaluate(()=>JSON.stringify(route)),routeBefore);
   assert.equal(await page.evaluate(()=>window.__lastLocationInteractive),true,'startup must request location permission when needed');assert(await page.evaluate(()=>zoom>=15));assert((await page.locator('#locationStatus').textContent()).includes('定位'));assert(await page.locator('#locationStatus').isVisible(),'original location status should remain on the map');
   await page.screenshot({path:path.join(out,'location-fixture.png')});
  });
  await check('location denial preserves the map and manual retry recenters without changing route',async()=>{
   const before=await page.evaluate(()=>({center:JSON.stringify(mapCenter),route:JSON.stringify(route)}));
   await page.evaluate(()=>{window.__locationMode='denied';});await click('locateMe');
   await page.waitForFunction(()=>window.__locationCalls===2&&(document.getElementById('locationStatus').textContent+' '+document.getElementById('toast').textContent).includes('权限'));
   assert.equal(await page.evaluate(()=>JSON.stringify(mapCenter)),before.center);assert.equal(await page.evaluate(()=>JSON.stringify(route)),before.route);
   assert.equal(await page.evaluate(()=>mapSource),'online');assert(await page.locator('#homeMove').isEnabled());
   await page.evaluate(()=>{window.__locationMode='success';window.__locationPoint=[112.9388,28.2282];});await click('chooseCity');assert.equal(await page.locator('.city-result').first().locator('span').textContent(),'自动定位');assert.equal(await page.locator('.city-result').filter({hasText:'全国概览'}).count(),0);await click('autoLocate');assert(!(await page.locator('#citySheet').isVisible()));
   await page.waitForFunction(()=>window.__locationCalls===3&&Math.abs(mapCenter[0]-112.9388)<1e-6&&Math.abs(mapCenter[1]-28.2282)<1e-6);await loaded();
   assert.equal(await page.evaluate(()=>JSON.stringify(route)),before.route);
  });
  await check('invalid or simulated location is rejected and a late fix respects manual map selection',async()=>{
   const before=await page.evaluate(()=>({center:JSON.stringify(mapCenter),route:JSON.stringify(route)}));
   await page.evaluate(()=>{nativeEvent('location',JSON.stringify({lon:116.4,lat:39.9,mock:true}));nativeEvent('location',JSON.stringify({lon:999,lat:91}));});
   assert.equal(await page.evaluate(()=>JSON.stringify(mapCenter)),before.center);
   await page.evaluate(()=>{requestLocation(true);moveTo(cities.find(c=>c[0]==='上海'));});
   await page.waitForFunction(()=>document.getElementById('locationStatus').textContent.includes('点击定位按钮'));
   assert.equal(await page.evaluate(()=>mapName),'上海');assert.equal(await page.evaluate(()=>JSON.stringify(route)),before.route);await loaded();
  });
  await check('map tools, speed and start remain on the first screen without lower data panels',async()=>{
   for(const [width,height] of [[320,640],[393,852],[480,800],[852,393]]){
    await page.setViewportSize({width,height});await loaded();
    const map=await page.locator('#map').boundingBox();assert(map.height>height*.65,'map did not dominate home '+width+'x'+height);
    for(const id of ['map','speed','start','mapAttribution']){
     const box=await page.locator('#'+id).boundingBox();assert(box&&box.x>=0&&box.y>=0&&box.x+box.width<=width+.5&&box.y+box.height<=height+.5,id+' outside first screen '+width+'x'+height);
    }
    for(const id of ['mapStatus','homeMove','homeFreehand','homeWaypoints','homeClear','locateMe','zoomIn','zoomOut','homeOverlay','help'])assert(await page.locator('#'+id).isVisible(),id+' must remain visible '+width+'x'+height);
    for(const selector of ['.home-secondary','.map-hint','.playback-status','.progress-track'])assert(!(await page.locator(selector).isVisible()),selector+' should stay hidden '+width+'x'+height);
    const overlay=await page.locator('#homeOverlay').boundingBox(),tools=await page.locator('.home-modes').boundingBox();assert(overlay.x>=tools.x+tools.width||overlay.y>=tools.y+tools.height||tools.y>=overlay.y+overlay.height,'floating control overlaps route modes');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(out,`home-${width}x${height}-fixture.png`)});
   }
  });
  assert.deepEqual(errors,[]);console.log('PASS: '+results.length+' deterministic map integration groups; '+requests.length+' tile requests intercepted; no live map requests.');
 }catch(error){if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}
 finally{await releaseHeld();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({date:'2026-10-21',syntheticNativeBridge:true,results,tileRequestsIntercepted:requests.length,importedTileFixtures:importedRequests.length,uncaughtErrors:errors},null,2));await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
