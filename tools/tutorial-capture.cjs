// Captures the bundled interface for an annotated tutorial. Location is an
// explicitly illustrative fixture; Android system dialogs are never fabricated.
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require(process.env.STRIDE_PLAYWRIGHT||'C:/Users/AA/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../app/src/main/assets'),out=path.resolve(__dirname,'../build/tutorial');
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.geojson')?'application/json':'text/html');res.end(data);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.STRIDE_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>china);
  await page.evaluate(()=>{receiveLocation(JSON.stringify({lon:112.9388,lat:28.2282,accuracy:8,mock:false}));});
  await page.waitForFunction(()=>lastTileSummary.total>0&&lastTileSummary.ready===lastTileSummary.total,{},{timeout:20000});
  const shot=async name=>{await page.evaluate(()=>{document.getElementById('toast').style.display='none';});await page.screenshot({path:path.join(out,name)});};
  await shot('home.png');await page.locator('#help').click();await shot('help.png');await page.locator('#helpSheet .close-sheet').click();
  await page.locator('#chooseCity').click();await shot('city.png');await page.locator('#autoLocate').click();
  await page.evaluate(()=>receiveLocation(JSON.stringify({lon:112.9388,lat:28.2282,accuracy:8,mock:false})));await shot('located.png');
  await page.locator('#homeWaypoints').click();await shot('point0.png');
  const points=[[108,310],[225,350],[245,465],[130,495]];
  for(let i=0;i<points.length;i++){await page.locator('#map').tap({position:{x:points[i][0],y:points[i][1]}});await shot(`point${i+1}.png`);}
  await page.locator('#homeClear').click();await shot('cleared.png');
  for(const point of points)await page.locator('#map').tap({position:{x:point[0],y:point[1]}});
  for(const value of [3,5,0,3]){await page.locator('#speed').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},value);await shot(`pace${value}.png`);}
  await page.locator('#start').click();
  for(let i=0;i<3;i++){await page.waitForTimeout(450);await shot(`running${i}.png`);}
  await page.locator('#start').click();await shot('paused.png');await shot('overlay.png');
  await page.locator('#start').click();await page.locator('[data-page="motion"]').click();await page.waitForTimeout(1400);await shot('motion.png');
  if(errors.length)throw new Error(errors.join('\n'));
  fs.writeFileSync(path.join(out,'capture.json'),JSON.stringify({interfaceVersion:'1.3.4',location:'illustrative fixture',tiles:'actual Amap network',systemDialogs:'instructions only; not recorded',errors},null,2));
  console.log('Tutorial interface captures complete.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
