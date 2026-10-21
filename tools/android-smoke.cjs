// Run against an isolated emulator with build/stride-debug.apk installed.
// ADB and WebView debugging port can be supplied via environment variables.
const {execFileSync}=require('child_process'),fs=require('fs'),path=require('path'),assert=require('assert');
const adbPath=process.env.STRIDE_ADB||'E:/leidian/LDPlayer9/adb.exe',serial=process.env.STRIDE_SERIAL||'emulator-5556';
const out=process.env.STRIDE_ARTIFACT_DIR||path.resolve(__dirname,'../dist'),adb=(...args)=>execFileSync(adbPath,['-s',serial,...args],{encoding:'utf8',maxBuffer:16*1024*1024,timeout:15000}).trim();
fs.mkdirSync(out,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function screenshot(name){fs.writeFileSync(path.join(out,name),execFileSync(adbPath,['-s',serial,'exec-out','screencap','-p'],{maxBuffer:16*1024*1024,timeout:15000}));}
function overlayWindow(){return adb('shell','dumpsys','window','windows').split('Window #').find(win=>win.includes('package=cn.stride.offline appop=SYSTEM_ALERT_WINDOW')&&(win.includes('isVisible=true')||win.includes('isOnScreen=true')));}
async function waitForOverlay(){
  // Slow emulators can resume the launcher several seconds before the App's
  // onStop attaches its overlay. Observe the actual window before interacting.
  const deadline=Date.now()+15000;
  do{if(overlayWindow())return;await pause(200);}while(Date.now()<deadline);
  throw Error('Timed out after 15 seconds waiting for the floating window after HOME');
}
async function main(){
  const pid=adb('shell','pidof','cn.stride.offline');adb('forward','tcp:9223','localabstract:webview_devtools_remote_'+pid);
  const targets=await(await fetch('http://127.0.0.1:9223/json/list')).json();
  const ws=new WebSocket(targets.find(t=>t.url.includes('app.stride.local')).webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let sequence=0;const pending=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const {resolve,reject}=pending.get(m.id);pending.delete(m.id);m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result);}};
  function command(method,params){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
  async function evaluate(expression){const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
  async function until(expression){for(let i=0;i<40;i++){if(await evaluate(expression))return;await pause(150);}throw Error('Timeout: '+expression);}
  const locationMode=adb('shell','settings','get','secure','location_mode');
  try{
    assert.equal(await evaluate('!!window.Native'),true);
    await evaluate("demo();setMock(false);start()");await until("JSON.parse(Native.state()).status==='running'");
    await pause(1200);let s=JSON.parse(await evaluate('Native.state()'));assert(s.distance>2);assert(s.gyro.some(v=>Math.abs(v)>0));
    await evaluate('Native.toggle()');await until("JSON.parse(Native.state()).status==='paused'");s=JSON.parse(await evaluate('Native.state()'));const d=s.distance;await pause(400);assert.equal(JSON.parse(await evaluate('Native.state()')).distance,d);
    adb('shell','appops','set','cn.stride.offline','SYSTEM_ALERT_WINDOW','allow');
    await evaluate('Native.overlay(true,JSON.stringify(config()))');await until('JSON.parse(Native.overlayState()).enabled');
    adb('shell','input','keyevent','3');await waitForOverlay();screenshot('android-overlay-debug.png');
    function overlayTap(part){const win=overlayWindow();assert(win,'floating window visible');const b=win.match(/(?:mFrame=|frame=)\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);assert(b,'overlay bounds available');const x=+b[1],y=+b[2],w=+b[3]-x,h=+b[4]-y;adb('shell','input','tap',String(Math.round(x+w*.39)),String(Math.round(y+h*.73)));}
    overlayTap('▶  继续');await until("JSON.parse(Native.state()).status==='running'");await pause(500);
    screenshot('android-overlay.png');overlayTap('Ⅱ  暂停');await until("JSON.parse(Native.state()).status==='paused'");
    await evaluate('Native.stop()');await until("JSON.parse(Native.state()).status==='idle'");
    // Idle overlay starts the saved route without opening the Activity.
    await pause(600);overlayTap('▶  开始');await until("JSON.parse(Native.state()).status==='running'");await evaluate('Native.stop()');await until("JSON.parse(Native.state()).status==='idle'");
    adb('shell','am','start','-W','-n','cn.stride.offline/.MainActivity');await until("document.visibilityState==='visible'");
    await evaluate('Native.overlay(false,JSON.stringify(config()))');
    adb('shell','pm','grant','cn.stride.offline','android.permission.ACCESS_COARSE_LOCATION');
    adb('shell','pm','grant','cn.stride.offline','android.permission.ACCESS_FINE_LOCATION');
    adb('shell','appops','set','cn.stride.offline','android:mock_location','allow');
    adb('shell','settings','put','secure','location_mode','3');
    await evaluate('setMock(true);start()');await until("JSON.parse(Native.state()).status==='running'");await pause(1000);
    s=JSON.parse(await evaluate('Native.state()'));assert.equal(s.mock,true);assert(s.distance>1);
    const providerState=adb('shell','dumpsys','location');assert(providerState.includes('mock')||providerState.includes('Mock'),'mock provider visible in Android location manager');
    await evaluate("showPage('motion')");await pause(300);screenshot('android-motion.png');
    await evaluate('Native.stop()');await until("JSON.parse(Native.state()).status==='idle'");
    const after=adb('shell','dumpsys','location');assert(!after.includes('mMockProviders={gps=')&&!after.includes('mMockProviders: gps'),'test providers removed');
    await evaluate("showPage('route');setEditing(true);document.getElementById('toast').classList.remove('show')");await pause(300);screenshot('android-editor.png');
    await evaluate('setEditing(false)');
    const log=adb('logcat','-d','--pid='+pid,'-s','AndroidRuntime:E');assert(!log.includes('FATAL EXCEPTION'),log);
    console.log('PASS: Android '+adb('shell','getprop','ro.build.version.release')+' native preview, exact pause/resume, background floating resume/pause/start, GPS mock playback, stop cleanup, no app crash.');
  }finally{
    try{await evaluate('Native.stop();Native.overlay(false,JSON.stringify(config()))');}catch(e){}
    adb('shell','settings','put','secure','location_mode',locationMode);
    ws.close();adb('forward','--remove','tcp:9223');
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
