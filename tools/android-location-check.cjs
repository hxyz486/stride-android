// Isolated Android 15 regression for the homepage's real-location flow.
// Requires build/stride-debug.apk installed. Uses the supported ADB emulator
// GPS input and the app's existing public mock-location controls for testing.
const {execFileSync}=require('child_process'),fs=require('fs'),path=require('path'),assert=require('assert');
const adbPath=process.env.STRIDE_ADB||'E:/codex/anti-fraud-workstation/.toolchain/android-sdk/platform-tools/adb.exe';
const serial=process.env.STRIDE_SERIAL||'emulator-5582',transport=process.env.STRIDE_TRANSPORT_SERIAL||serial,pkg='cn.stride.offline',port=9225;
const adbPrefix=process.env.STRIDE_ADB_PORT?['-P',process.env.STRIDE_ADB_PORT]:[];
const out=path.resolve(__dirname,'../dist/audit-location-android');fs.mkdirSync(out,{recursive:true});
const adb=(...args)=>execFileSync(adbPath,[...adbPrefix,'-s',transport,...args],{encoding:'utf8',timeout:20000,maxBuffer:16*1024*1024}).trim();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const report={date:'2026-10-21',serial,tests:[]};
let ws,evaluate,originalLocationMode;
function screenshot(name){fs.writeFileSync(path.join(out,name),execFileSync(adbPath,[...adbPrefix,'-s',transport,'exec-out','screencap','-p'],{timeout:15000,maxBuffer:16*1024*1024}));}
function nodes(){adb('shell','uiautomator','dump','/sdcard/stride-location-check.xml');return [...adb('shell','cat','/sdcard/stride-location-check.xml').matchAll(/<node\b[^>]*>/g)].map(match=>match[0]);}
function tap(node){const b=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);assert(b,'UI element bounds');adb('shell','input','tap',String(Math.round((+b[1]+ +b[3])/2)),String(Math.round((+b[2]+ +b[4])/2)));}
function clearDenialFlags(){for(const permission of ['ACCESS_FINE_LOCATION','ACCESS_COARSE_LOCATION'])adb('shell','pm','clear-permission-flags',pkg,'android.permission.'+permission,'user-set','user-fixed');}
function permissionGranted(permission){const text=adb('shell','dumpsys','package',pkg);return new RegExp('android\\.permission\\.'+permission+': granted=true').test(text);}
async function until(expression,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(expression))return;await pause(150);}throw Error('Timeout: '+expression);}
async function permissionButton(kind){
 const end=Date.now()+8000;
 do{const list=nodes(),match=list.find(node=>kind==='deny'?/permission_deny(?:_and_dont_ask_again)?_button/.test(node):/permission_allow_foreground_only_button/.test(node));if(match)return match;await pause(200);}while(Date.now()<end);
 throw Error('Location permission '+kind+' button did not appear');
}
async function connect(){
 const pid=adb('shell','pidof',pkg);adb('forward','tcp:'+port,'localabstract:webview_devtools_remote_'+pid);
 let target;for(let attempt=0;attempt<40&&!target;attempt++){try{const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();target=targets.find(item=>item.url.startsWith('https://app.stride.local/'));}catch(error){}if(!target)await pause(150);}
 assert(target,'homepage WebView debugging target');
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 let sequence=0;const pending=new Map();
 ws.onmessage=event=>{const message=JSON.parse(event.data),item=pending.get(message.id);if(item){pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(Error(JSON.stringify(message.error))):item.resolve(message.result);}};
 const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP command timed out: '+method));},15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 evaluate=async expression=>{const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 await until("typeof requestLocation==='function'&&typeof window.nativeEvent==='function'");
 return pid;
}
async function main(){
 assert.equal(serial,'emulator-5582','This destructive permission regression is reserved for emulator-5582');
 assert(transport===serial||transport==='127.0.0.1:5583','Only emulator-5582 or its same-device TCP alias is allowed');
 report.transport=transport;
 report.android=adb('shell','getprop','ro.build.version.release');assert.equal(report.android,'15');
 originalLocationMode=adb('shell','settings','get','secure','location_mode');
 adb('shell','am','force-stop',pkg);
 adb('shell','appops','set',pkg,'android:mock_location','deny');
 adb('shell','settings','put','secure','location_mode','3');
 for(const permission of ['ACCESS_FINE_LOCATION','ACCESS_COARSE_LOCATION']){try{adb('shell','pm','revoke',pkg,'android.permission.'+permission);}catch(error){}}
 clearDenialFlags();
 adb('shell','am','start','-W','-n',pkg+'/.MainActivity');
 const pid=await connect();
 // A prior denial is remembered by the app. On a first request Android may
 // instead show its permission dialog; exercise denial in either case.
 const initialNodes=nodes(),startupDeny=initialNodes.find(node=>/permission_deny(?:_and_dont_ask_again)?_button/.test(node));
 if(startupDeny)tap(startupDeny);
 await until("!locationPending&&document.getElementById('locationStatus').textContent.includes('未获得定位权限')");
 assert.equal(await evaluate('mapSource'),'online');
 const originalRoute=await evaluate('JSON.stringify(route)');
 report.tests.push({name:'Startup defaults to online; permission denial leaves usable map',firstPermissionDialog:!!startupDeny,status:await evaluate("document.getElementById('locationStatus').textContent")});
 screenshot('startup-denied.png');
 await evaluate("window.__locationEvents=[];window.__locationErrors=[];window.__locationOriginalHandler=window.nativeEvent;window.nativeEvent=(type,value)=>{if(type==='location')window.__locationEvents.push(JSON.parse(value));if(type==='locationError')window.__locationErrors.push(value);window.__locationOriginalHandler(type,value);}");

 clearDenialFlags();
 await evaluate('requestLocation(true);requestLocation(true);requestLocation(true)');
 tap(await permissionButton('deny'));
 await until("!locationPending&&document.getElementById('locationStatus').textContent.includes('未获得定位权限')");
 assert.equal(await evaluate('JSON.stringify(route)'),originalRoute);
 report.tests.push({name:'Manual retry requests permission; repeated taps settle after one denial'});

 clearDenialFlags();await evaluate('requestLocation(true)');
 await permissionButton('allow');
 const approximate=nodes().find(node=>/permission_location_accuracy_radio_coarse/.test(node)||/text="(?:Approximate|大致位置|模糊位置)"/.test(node));
 assert(approximate,'Android approximate location choice');tap(approximate);tap(await permissionButton('allow'));
 assert(permissionGranted('ACCESS_COARSE_LOCATION'),'approximate permission granted');assert(!permissionGranted('ACCESS_FINE_LOCATION'),'precise permission remains denied');
 await until('!locationPending',23000);
 report.tests.push({name:'Approximate-only grant completes or gives bounded fallback without another permission dialog',status:await evaluate("document.getElementById('locationStatus').textContent")});
 assert.equal(await evaluate('JSON.stringify(route)'),originalRoute);

 adb('shell','pm','grant',pkg,'android.permission.ACCESS_FINE_LOCATION');assert(permissionGranted('ACCESS_FINE_LOCATION'));
 await evaluate('window.__locationEvents=[];requestLocation(true)');
 adb('emu','geo','fix','113.264385','23.129112');
 await until('currentLocation&&!currentLocation.mock&&Math.abs(currentLocation.lon-113.264385)<0.00002&&Math.abs(currentLocation.lat-23.129112)<0.00002',12000);
 const measured=await evaluate('({point:currentLocation,center:mapCenter,status:document.getElementById("locationStatus").textContent,events:window.__locationEvents})');
 assert(Math.abs(measured.center[0]-113.264385)<.00002&&Math.abs(measured.center[1]-23.129112)<.00002,'real WGS84 fix centers map');
 assert.equal(await evaluate('JSON.stringify(route)'),originalRoute);
 report.tests.push({name:'Precise emulator GPS fix centers homepage without editing the route',...measured});screenshot('precise-location.png');

 // This uses the app's existing public mock-location mode on this isolated
 // emulator. No provider flags are altered to make test data appear real.
 adb('shell','appops','set',pkg,'android:mock_location','allow');
 await evaluate('Native.start(JSON.stringify({route:[[114.0579,22.5431],[114.0679,22.5431]],pace:290,mock:true,gyro:false}))');
 await until("JSON.parse(Native.state()).status==='running'&&JSON.parse(Native.state()).mock===true");await pause(500);
 const beforeMock=await evaluate('JSON.stringify(mapCenter)');
 await evaluate('window.__locationEvents=[];window.__locationErrors=[];requestLocation(true)');await pause(1300);
 assert.equal(await evaluate('window.__locationEvents.length'),0,'cached and fresh mock fixes ignored');
 assert.equal(await evaluate('JSON.stringify(mapCenter)'),beforeMock,'mock route does not recenter homepage');
 const providerState=adb('shell','dumpsys','location');fs.writeFileSync(path.join(out,'mock-provider-state.txt'),providerState);
 assert(/mock/i.test(providerState),'test provider exists for rejection test');
 adb('shell','input','keyevent','3');await pause(1300);
 adb('shell','am','start','-W','-n',pkg+'/.MainActivity');
 await until("document.visibilityState==='visible'");
 await until('!locationPending&&window.__locationErrors.length>0',23000);
 assert.equal(await evaluate('window.__locationEvents.length'),0,'mock fixes remain ignored across resume');
 assert.equal(await evaluate('JSON.stringify(mapCenter)'),beforeMock);
 assert.equal(await evaluate('JSON.stringify(route)'),originalRoute);
 report.tests.push({name:'Official mock fixes rejected; background and resume settle with timeout instead of hanging',status:await evaluate("document.getElementById('locationStatus').textContent")});screenshot('mock-location-ignored.png');
 await evaluate('Native.stop()');await until("JSON.parse(Native.state()).status==='idle'");
 adb('shell','appops','set',pkg,'android:mock_location','deny');
 await evaluate('requestLocation(true)');adb('emu','geo','fix','113.264385','23.129112');
 await until('!locationPending&&currentLocation&&!currentLocation.mock&&Math.abs(currentLocation.lon-113.264385)<.00002');
 const log=adb('logcat','-d','--pid='+pid,'-s','AndroidRuntime:E');assert(!log.includes('FATAL EXCEPTION'),log);
 report.tests.push({name:'Mock service stopped, real location recovers, route retained, no AndroidRuntime crash'});
 report.passed=true;console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{report.passed=false;report.error=error.stack||String(error);console.error(report.error);process.exitCode=1;}).finally(async()=>{
 if(evaluate)try{await evaluate('Native.stop();Native.overlay(false,JSON.stringify(config()))');}catch(error){}
 try{adb('shell','appops','set',pkg,'android:mock_location','deny');}catch(error){}
 for(const permission of ['ACCESS_COARSE_LOCATION','ACCESS_FINE_LOCATION'])try{adb('shell','pm','grant',pkg,'android.permission.'+permission);}catch(error){}
 if(originalLocationMode&&originalLocationMode!=='null')try{adb('shell','settings','put','secure','location_mode',originalLocationMode);}catch(error){}
 if(ws)ws.close();try{adb('forward','--remove','tcp:'+port);}catch(error){}
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
});
