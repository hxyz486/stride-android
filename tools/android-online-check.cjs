// Run only against an isolated emulator with build/stride-debug.apk installed.
// Records real network failure/success separately from controlled tile decoding.
const {execFileSync}=require('child_process'),fs=require('fs'),path=require('path'),assert=require('assert');
const adbPath=process.env.STRIDE_ADB||'E:/codex/anti-fraud-workstation/.toolchain/android-sdk/platform-tools/adb.exe';
const serial=process.env.STRIDE_SERIAL||'emulator-5582',out=path.resolve(__dirname,'../dist/audit-map-android');
fs.mkdirSync(out,{recursive:true});
const adb=(...args)=>execFileSync(adbPath,['-s',serial,...args],{encoding:'utf8',timeout:15000}).trim();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const screenshot=name=>fs.writeFileSync(path.join(out,name),execFileSync(adbPath,['-s',serial,'exec-out','screencap','-p'],{timeout:15000,maxBuffer:8*1024*1024}));
(async()=>{
 adb('shell','am','start','-W','-n','cn.stride.offline/.MainActivity');
 const pid=adb('shell','pidof','cn.stride.offline');adb('forward','tcp:9224','localabstract:webview_devtools_remote_'+pid);
 let target;
 for(let attempt=0;attempt<30&&!target;attempt++){
  try{const targets=await(await fetch('http://127.0.0.1:9224/json/list')).json();target=targets.find(t=>t.url.includes('app.stride.local'));}catch(error){}
  if(!target)await sleep(100);
 }
 assert(target,'local app WebView target');
 const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 let id=0;const pending=new Map(),requests=[],responses=[];let phase='live';
 const command=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});ws.send(JSON.stringify({id:next,method,params}));});
 const tile='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eee"/><path d="M0 65H256M85 0V256" stroke="#fff" stroke-width="16"/><text x="10" y="230" font-size="14">CONTROLLED TEST TILE</text></svg>';
 ws.onmessage=event=>{
  const message=JSON.parse(event.data);
  if(message.id&&pending.has(message.id)){const p=pending.get(message.id);pending.delete(message.id);message.error?p.reject(Error(JSON.stringify(message.error))):p.resolve(message.result);}
  if(message.method==='Network.requestWillBeSent'&&message.params.request.url.startsWith('https://')&&!message.params.request.url.startsWith('https://app.stride.local/'))requests.push({phase,url:message.params.request.url});
  if(message.method==='Network.responseReceived'&&message.params.response.url.startsWith('https://')&&!message.params.response.url.startsWith('https://app.stride.local/'))responses.push({phase,url:message.params.response.url,status:message.params.response.status,mimeType:message.params.response.mimeType});
  if(message.method==='Fetch.requestPaused')command('Fetch.fulfillRequest',{requestId:message.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'image/svg+xml'},{name:'Cache-Control',value:'max-age=3600'}],body:Buffer.from(tile).toString('base64')}).catch(()=>{});
 };
 const evaluate=async expression=>{const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const until=async(expression,timeout=10000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(expression))return;await sleep(100);}throw Error('Timeout '+expression);};
 const canonical=url=>{const parsed=new URL(url),q=parsed.searchParams,z=Number(q.get('z'));return parsed.origin==='https://webrd01.is.autonavi.com'&&parsed.pathname==='/appmaptile'&&q.get('lang')==='zh_cn'&&q.get('size')==='1'&&q.get('scale')==='1'&&q.get('style')==='7'&&[...q.keys()].length===7&&['x','y','z'].every(key=>/^\d+$/.test(q.get(key)||''))&&z<=19&&Number(q.get('x'))<2**z&&Number(q.get('y'))<2**z;};
 const finished='lastTileSummary.total>0&&lastTileSummary.loading===0&&lastTileSummary.ready+lastTileSummary.failed===lastTileSummary.total';
 const loaded='lastTileSummary.total>0&&lastTileSummary.ready===lastTileSummary.total&&lastTileSummary.loading===0&&lastTileSummary.failed===0';
 const viewportLoaded=async()=>{await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await until(loaded);};
 const report={date:'2026-10-21',android:adb('shell','getprop','ro.build.version.release'),network:null,controlledTests:[]};
 try{
  await command('Network.enable');
  await until("typeof showPage==='function'&&typeof mapTiles!=='undefined'&&typeof china!=='undefined'&&china",15000);
  assert((await evaluate('navigator.userAgent')).includes('Stride/1.3.3'));
  await evaluate("showPage('route');setMapSource('online');moveTo(cities.find(c=>c[0]==='长沙'));zoom=16;retryMap()");
  // Let the entire viewport settle before observing the outcome. One decoded
  // tile cannot establish that a usable street map appeared on the device.
  await until(finished,90000);
  report.network=await evaluate('({summary:lastTileSummary,notice:document.getElementById("mapNoticeText").textContent,noticeVisible:!document.getElementById("mapNotice").hidden,source:mapSource,sourceId:mapTiles.sourceId,attribution:document.getElementById("mapAttribution").textContent})');
  const liveRequests=requests.filter(r=>r.phase==='live');
  assert(liveRequests.length>0,'no real map requests were observed');
  assert(liveRequests.every(r=>canonical(r.url)),JSON.stringify(liveRequests));
  assert.equal(report.network.sourceId,'online-amap');assert(report.network.attribution.includes('高德'));
  report.network.canonicalRequests=liveRequests.length;
  report.network.requestHosts=[...new Set(liveRequests.map(r=>new URL(r.url).hostname))];
  report.network.requests=liveRequests.map(r=>r.url);
  report.network.responses=responses.filter(r=>r.phase==='live');
  report.network.liveTileDecoded=report.network.summary.ready>0;
  report.network.allVisibleTilesDecoded=report.network.summary.ready===report.network.summary.total&&report.network.summary.failed===0;
  if(report.network.allVisibleTilesDecoded)assert.equal(report.network.noticeVisible,false);
  await sleep(250);
  report.network.screenshot=report.network.allVisibleTilesDecoded?'live-online.png':report.network.liveTileDecoded?'live-partial.png':'live-unavailable.png';
  screenshot(report.network.screenshot);
  // Fixtures start only after real traffic has finished and its screenshot was
  // captured. They verify WebView rendering and controls independently of DNS.
  phase='controlled';
  await command('Fetch.enable',{patterns:[{urlPattern:'https://webrd01.is.autonavi.com/appmaptile*'}]});
  await evaluate('retryMap()');
  await viewportLoaded();
  assert.equal(await evaluate('document.getElementById("mapNotice").hidden'),true);
  report.controlledTests.push('Canonical Amap HTTPS tile requests pass native allowlist, decode controlled fixtures in WebView, and render all visible tiles');
  await evaluate('demo()');await viewportLoaded();
  const route=await evaluate('JSON.stringify(route)');
  await evaluate("setMapSource('overview')");await sleep(100);const count=requests.length;
  await evaluate('zoom=15;dirty=true');await sleep(200);assert.equal(requests.length,count);
  assert.equal(await evaluate('JSON.stringify(route)'),route);
  report.controlledTests.push('Offline overview issues no remote tile requests and preserves exact WGS84 route');
  await evaluate("document.getElementById('mapStatus').click()");assert(await evaluate('document.getElementById("mapSourceSheet").open'));
  await evaluate("document.getElementById('sourceOnline').click()");await viewportLoaded();
  assert.equal(await evaluate('JSON.stringify(route)'),route);
  report.controlledTests.push('Source selector restores online map without changing route');
  await evaluate('mapCenter=[116.397128,39.916527];zoom=19;dirty=true');await viewportLoaded();
  const inverseErrors=await evaluate('[[18,22],[width*.31,height*.62],[width-20,height-20]].map(p=>{const actual=screen(locationAt(...p));return Math.hypot(actual[0]-p[0],actual[1]-p[1]);})');
  assert(inverseErrors.every(error=>error<.02),JSON.stringify(inverseErrors));
  assert.equal(await evaluate('JSON.stringify(route)'),route);
  report.controlledTests.push('GCJ02 display and WGS84 touch coordinates round-trip within 0.02 pixels at zoom 19');
  assert(requests.every(r=>canonical(r.url)),JSON.stringify(requests));
  report.controlledTileRequests=requests.filter(r=>r.phase==='controlled').length;
  await sleep(250);screenshot('controlled-tiles.png');
  const log=adb('logcat','-d','--pid='+pid,'-s','AndroidRuntime:E');assert(!log.includes('FATAL EXCEPTION'),log);
  report.controlledTests.push('No app AndroidRuntime crash');
  console.log(JSON.stringify(report,null,2));
 }catch(error){report.error=error.message;throw error;}
 finally{
  await evaluate("setMapSource('overview')").catch(()=>{});
  await command('Fetch.disable').catch(()=>{});ws.close();adb('forward','--remove','tcp:9224');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
