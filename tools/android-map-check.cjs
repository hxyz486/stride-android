const {execFileSync}=require('child_process'),assert=require('assert');
const adb=(...args)=>execFileSync(process.env.STRIDE_ADB||'E:/leidian/LDPlayer9/adb.exe',['-s',process.env.STRIDE_SERIAL||'emulator-5556',...args],{encoding:'utf8'}).trim();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const targets=await(await fetch('http://127.0.0.1:9223/json/list')).json();const ws=new WebSocket(targets.find(t=>t.url.includes('app.stride.local')).webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
 async function evaluate(expression){const r=await new Promise(resolve=>{pending.set(++id,resolve);ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));});if(r.error||r.result.exceptionDetails)throw Error(JSON.stringify(r));return r.result.result.value;}
 function nodes(){adb('shell','uiautomator','dump','/sdcard/stride-document-test.xml');return [...adb('shell','cat','/sdcard/stride-document-test.xml').matchAll(/<node\b[^>]*>/g)].map(m=>m[0]);}
 function tap(node){const b=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);adb('shell','input','tap',String(Math.round((+b[1]+ +b[3])/2)),String(Math.round((+b[2]+ +b[4])/2)));}
 try{
  await evaluate('Native.importMap()');await wait(800);let list=nodes();let file=list.find(n=>n.includes('text="stride-test.mbtiles"'));
  if(!file){let menu=list.find(n=>n.includes('content-desc="显示根目录"')||n.includes('content-desc="Show roots"'));if(menu){tap(menu);await wait(300);list=nodes();const downloads=list.find(n=>n.includes('text="下载"')||n.includes('text="Downloads"'));if(downloads){tap(downloads);await wait(300);file=nodes().find(n=>n.includes('text="stride-test.mbtiles"'));}}}
  if(!file)throw Error('Fixture is not visible in system picker: '+JSON.stringify(list));tap(file);await wait(1000);
  const meta=JSON.parse(await evaluate('Native.mapInfo()'));assert(meta.available);assert.equal(meta.name,'STRIDE import fixture');
  const result=await evaluate("new Promise(resolve=>{const i=new Image();i.onload=()=>resolve({ok:true,width:i.naturalWidth});i.onerror=()=>resolve({ok:false});i.src='/tiles/15/26978/12403'})");assert(result.ok);assert.equal(result.width,1);
  console.log('PASS: Android system document picker → MBTiles validation/copy → metadata → TMS row conversion → decoded offline tile.');
 }finally{ws.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
