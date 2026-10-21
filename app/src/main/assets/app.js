'use strict';
const $=id=>document.getElementById(id), native=window.Native||null;
const ICONS={info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.2"/>',pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',chevron:'<path d="m9 5 7 7-7 7"/>',pen:'<path d="m4 16-1 5 5-1L20 8l-4-4Z M14 6l4 4"/>',hand:'<path d="M8 12V5a2 2 0 0 1 4 0v6-7a2 2 0 0 1 4 0v8-4a2 2 0 0 1 4 0v8c0 4-3 6-6 6h-2c-2 0-4-1-5-3l-4-5a2 2 0 0 1 3-2l2 2"/>',plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',focus:'<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/><circle cx="12" cy="12" r="3"/>',undo:'<path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12h-4"/>',trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',wave:'<path d="M2 12h3l3-8 4 16 4-16 3 8h3"/>',play:'<path d="m8 4 12 8-12 8Z" fill="currentColor" stroke="none"/>',pause:'<path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor" stroke="none"/>',stop:'<rect x="5" y="5" width="14" height="14" rx="1" fill="currentColor" stroke="none"/>',route:'<circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M5 16v-5a4 4 0 0 1 4-4h2m8 1v5a4 4 0 0 1-4 4h-2"/>',activity:'<path d="M2 12h5l3-9 4 18 3-9h5"/>',layers:'<path d="m12 3 10 5-10 5L2 8Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',close:'<path d="m5 5 14 14M5 19 19 5"/>'};
function icon(name){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(ICONS[name]||ICONS.info)+'</svg>';}
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
let toastTimer;function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4400);}
const cities=[['全国概览',105,35.5,2.8],['北京',116.4074,39.9042,12],['上海',121.4737,31.2304,12],['广州',113.2644,23.1291,12],['深圳',114.0579,22.5431,12],['杭州',120.1551,30.2741,12],['长沙',112.9388,28.2282,12],['成都',104.0665,30.5723,12],['重庆',106.5516,29.563,12],['武汉',114.3054,30.5931,12],['南京',118.7969,32.0603,12],['西安',108.9398,34.3416,12],['天津',117.2,39.1333,12],['苏州',120.5853,31.2989,12],['郑州',113.6254,34.7466,12],['济南',117.1205,36.6512,12],['青岛',120.3826,36.0671,12],['厦门',118.0894,24.4798,12],['福州',119.2965,26.0745,12],['合肥',117.2272,31.8206,12],['南昌',115.8582,28.6829,12],['昆明',102.8329,24.8801,12],['贵阳',106.6302,26.647,12],['南宁',108.3669,22.817,12],['海口',110.1983,20.044,12],['哈尔滨',126.5349,45.8038,12],['长春',125.3235,43.8171,12],['沈阳',123.4315,41.8057,12],['大连',121.6147,38.914,12],['石家庄',114.5149,38.0428,12],['太原',112.5489,37.8706,12],['呼和浩特',111.7492,40.8426,12],['兰州',103.8343,36.0611,12],['银川',106.2309,38.4872,12],['西宁',101.7782,36.6171,12],['乌鲁木齐',87.6168,43.8256,12],['拉萨',91.1409,29.6456,12],['香港',114.1694,22.3193,12],['澳门',113.5439,22.1987,12],['台北',121.5654,25.033,12]];
let route=[],history=[],speed=3,pace=180,gyroEnabled=true,mock=!!native,roundTrip=false,mode='move',homeTool='move',editing=false,editorMode='freehand',routeKind='waypoint';
let mapCenter=[105,35.5],zoom=2.8,mapName='全国概览',china=null,mapMeta=null,dirty=true;
let mapSource='online',lastTileSummary={total:0,ready:0,failed:0,loading:0};
const mapTiles=new MapTiles(()=>{dirty=true;});
let state={status:'idle',gyro:[0,0,0]},lastError='',lastOverlayError='',chartSeries=[],lastChart=0,overlayEnabled=false;
let commandPending=false,commandDeadline=0,sensorMode='simulation',measured=null;
let mapInteraction=0,locationRequestInteraction=0,currentLocation=null,locationPending=false;
const canvas=$('map'),ctx=canvas.getContext('2d'),chart=$('gyroChart'),chartCtx=chart.getContext('2d');
let width=0,height=0,dpr=Math.min(devicePixelRatio||1,3);
function merc(p){const lat=Math.max(-85.05112878,Math.min(85.05112878,p[1]))*Math.PI/180;return [(p[0]+180)/360,(1-Math.log(Math.tan(lat)+1/Math.cos(lat))/Math.PI)/2];}
function unmerc(p){return [((p[0]*360)%360+360)%360-180,Math.max(-85.05112878,Math.min(85.05112878,Math.atan(Math.sinh(Math.PI*(1-2*p[1])))*180/Math.PI))];}
// Route storage, export and Android playback stay in WGS84. Only the domestic
// basemap display and inverse screen picking use its GCJ-02 coordinates.
function mapCoordinates(p){return mapSource==='online'?MapCoordinates.wgsToGcj(p):p;}
function mapMerc(p){return merc(mapCoordinates(p));}
function mapUnmerc(p){const coordinate=unmerc(p);return mapSource==='online'?MapCoordinates.gcjToWgs(coordinate):coordinate;}
function screen(p){const a=mapMerc(p),b=mapMerc(mapCenter),s=256*Math.pow(2,zoom);return [(a[0]-b[0])*s+width/2,(a[1]-b[1])*s+height/2];}
function locationAt(x,y){const c=mapMerc(mapCenter),s=256*Math.pow(2,zoom);return mapUnmerc([c[0]+(x-width/2)/s,c[1]+(y-height/2)/s]);}
function distance(a,b){const r=Math.PI/180,d1=(b[1]-a[1])*r,d2=(b[0]-a[0])*r,h=Math.sin(d1/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(d2/2)**2;return 12742017.6*Math.asin(Math.sqrt(Math.min(1,h)));}
function routeLength(points=route){let n=0;for(let i=1;i<points.length;i++)n+=distance(points[i-1],points[i]);return n;}
function playbackRoute(){return roundTrip?route.concat(route.slice(0,-1).reverse()):route.slice();}
function timeLabel(s){s=Math.floor(s||0);return s>=3600?Math.floor(s/3600)+':'+String(Math.floor(s/60)%60).padStart(2,'0')+':'+String(s%60).padStart(2,'0'):String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
function config(){return {route:playbackRoute(),speed,speedUnit:'min/km',mock,gyro:gyroEnabled};}
function persist(){try{localStorage.setItem('stride-v1',JSON.stringify({route,speed,speedUnit:'min/km',gyroEnabled,mock,roundTrip,mapCenter,zoom,mapName,routeKind,mapSource}));}catch(e){}if(native&&overlayEnabled)native.updateOverlayConfig(JSON.stringify(config()));}
function routeSnapshot(){return {route:route.map(p=>p.slice()),roundTrip,routeKind};}
function restoreRoute(saved){route=saved.route;roundTrip=saved.roundTrip;routeKind=saved.routeKind;}
function pushHistory(){history.push(routeSnapshot());if(history.length>40)history.shift();}
function active(){return commandPending||state.status==='running'||state.status==='paused';}
function lockCommand(){commandPending=true;commandDeadline=Date.now()+8000;$('start').disabled=true;}
function unlockCommand(){commandPending=false;$('start').disabled=false;}
function mutable(){if(active()){toast('请先结束当前回放，再修改路线');return false;}return true;}
function updateRoute(){
  const km=routeLength()/1000*(roundTrip?2:1),duration=speed>0?km*speed*60:0;
  $('routeDistance').textContent=km.toFixed(2);$('estimatedTime').textContent=speed>0?timeLabel(duration):'—';
  $('estimatedSteps').textContent=Math.round(duration*Math.min(210,speed>0?1000/speed:0)/60).toLocaleString('zh-CN');
  $('pointCount').textContent=Math.max(0,route.length-1);$('editorDistance').textContent=km.toFixed(2)+' km';
  $('roundTrip').textContent=roundTrip?'往返 ⇄':'单程 ⇄';
  $('undo').disabled=history.length===0;$('editorUndo').disabled=history.length===0;
  $('clear').disabled=!route.length;$('homeClear').disabled=!route.length||active();$('mapHint').hidden=route.length>1;
  $('mapHint').querySelector('span:last-child').textContent=zoom<10?'放大地图，用手指画出你的路线':mapSource==='online'?'在线街道地图 · 可直接绘制路线':mapSource==='imported'?'用手指画出你的路线':'此处为概览底图，可切换在线街道';
  dirty=true;persist();
}
function updateSpeed(){
  pace=speed*60;$('paceValue').textContent=speed>0?pace.toFixed(1)+' 秒/公里':'原地停留';
  $('speedValue').textContent=String(Math.round(speed*10)/10);$('speed').value=speed;
  const f=speed/5*100;$('speed').style.background=`linear-gradient(to right,#242424 ${f}%,#dddddd ${f}%)`;
  $('cadence').textContent=Math.round(Math.min(210,speed>0?1000/speed:0));updateRoute();
}
function syncMode(){
  $('modeDraw').classList.toggle('selected',mode==='draw');$('modeMove').classList.toggle('selected',mode==='move');
  for(const [id,tool] of [['homeMove','move'],['homeFreehand','freehand'],['homeWaypoints','waypoint']]){const selected=homeTool===tool;$(id).classList.toggle('selected',selected);$(id).setAttribute('aria-pressed',String(selected));}
  $('routeCaption').textContent=mode==='move'?'移动模式 · 拖动或双指缩放':!editing&&homeTool==='waypoint'?'选点模式 · 点击添加途经点':'绘制模式 · 双指移动和缩放';
}
function setMode(next){cancelMapGesture();mode=next;if(!editing)homeTool=next==='move'?'move':'freehand';syncMode();}
function setHomeTool(tool){cancelMapGesture();homeTool=tool;mode=tool==='move'?'move':'draw';if(tool!=='move')editorMode=tool==='waypoint'?'waypoint':'freehand';syncMode();}
function setEditorMode(next){editorMode=next;setMode('draw');['setStart','addPoints','freehand'].forEach((id,i)=>$(id).classList.toggle('selected',next===['start','waypoint','freehand'][i]));$('editorHint').textContent=next==='start'?'点击地图设起点，将替换当前路线':next==='freehand'?'拖动画线，双指移动和缩放':'点击地图，添加编号途经点';}
function setEditing(on){if(on&&!mutable())return;cancelMapGesture();editing=on;document.body.classList.toggle('editing',on);mountMapControls(on);if(on){showPage('route');setEditorMode('waypoint');}else setHomeTool(homeTool);requestAnimationFrame(resize);}
function showPage(name){document.body.classList.toggle('route-home',name==='route');document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+name));document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===name));if(name!=='route')mapTiles.suspend();requestAnimationFrame(()=>{resize();drawChart();});document.querySelector('main').scrollTop=0;}
function showSheet(id){closeSheet();$('sheetBackdrop').hidden=false;$(id).show();if(id==='citySheet'){renderCities('');$('citySearch').value='';}}
function closeSheet(){document.querySelectorAll('dialog[open]').forEach(d=>d.close());$('sheetBackdrop').hidden=true;}
window.handleBack=()=>{if(document.querySelector('dialog[open]')){closeSheet();return true;}if(editing){setEditing(false);return true;}if(!$('page-route').classList.contains('active')){showPage('route');return true;}return false;};
function moveTo(city){mapInteraction++;mapName=city[0];mapCenter=[city[1],city[2]];zoom=city[3];$('cityLabel').textContent='中国 · '+mapName;dirty=true;updateRoute();}
function requestLocation(interactive=false){
  locationRequestInteraction=mapInteraction;locationPending=true;$('locationStatus').textContent='正在定位…';$('locateMe').setAttribute('aria-busy','true');
  if(native&&native.locate){try{native.locate(interactive);}catch(e){locationError('定位暂时不可用，可手动选择城市');}}
  else locationError('安装 Android App 后可定位，当前可手动选择城市',interactive);
}
function locationError(message,notify=false){locationPending=false;$('locateMe').removeAttribute('aria-busy');$('locationStatus').textContent=String(message);if(notify)toast(String(message));}
function receiveLocation(value){
  let point;try{point=JSON.parse(value);}catch(e){locationError('定位数据读取失败，请点击定位重试');return;}
  if(!validMapCoordinate([point.lon,point.lat])||point.mock){locationError('暂未获取到真实位置，可选择城市继续');return;}
  currentLocation=point;locationPending=false;$('locateMe').removeAttribute('aria-busy');dirty=true;
  if(locationRequestInteraction!==mapInteraction||pointers.size){$('locationStatus').textContent='已获取当前位置，点击定位按钮可查看';return;}
  mapCenter=[point.lon,point.lat];zoom=point.accuracy>2000?12:point.accuracy>100?14:16;mapName='当前位置';$('cityLabel').textContent=mapName;
  $('locationStatus').textContent=(point.cached?'最近定位':'已定位')+(point.accuracy>0?' · 精度约 '+Math.ceil(point.accuracy)+' 米':'');persist();
}
function renderCities(query){
  const list=$('cityResults');list.textContent='';query=query.trim();
  const coord=query.split(/[,，\s]+/).map(Number);
  if(query&&coord.length===2&&coord.every(Number.isFinite)&&Math.abs(coord[0])<85.05&&Math.abs(coord[1])<=180){const b=document.createElement('button');b.className='city-result';b.textContent='前往 '+coord[0].toFixed(5)+', '+coord[1].toFixed(5);b.onclick=()=>{moveTo(['自定坐标',coord[1],coord[0],15]);closeSheet();};list.append(b);}
  if(!query||'自动定位当前位置'.includes(query)){const b=document.createElement('button');b.id='autoLocate';b.className='city-result';const label=document.createElement('span'),detail=document.createElement('small');label.textContent='自动定位';detail.textContent='定位当前位置 ↗';b.append(label,detail);b.onclick=()=>{closeSheet();requestLocation(true);};list.append(b);}
  cities.filter(c=>c[3]>=4&&(!query||c[0].includes(query))).forEach(c=>{const b=document.createElement('button');b.className='city-result';const s=document.createElement('span'),small=document.createElement('small');s.textContent=c[0];small.textContent=c[3]<4?'全国视图':mapSource==='online'?'查看在线街道 ↗':'离线坐标定位 ↗';b.append(s,small);b.onclick=()=>{moveTo(c);closeSheet();if(c[3]>4&&mapSource==='overview')toast('已定位城市。点击地图左上角，可切换在线街道');};list.append(b);});
  if(!list.children.length){const p=document.createElement('p');p.textContent='未找到城市，可输入“纬度,经度”定位';p.className='note';list.append(p);}
}
function fit(points=route){if(!points.length){moveTo(cities[0]);return;}const projected=points.map(mapMerc);let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(const p of projected){minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);}mapCenter=mapUnmerc([(minX+maxX)/2,(minY+maxY)/2]);const availableWidth=Math.max(80,width-100),availableHeight=Math.max(80,height-(editing?340:120));zoom=Math.max(2,Math.min(18,Math.log2(Math.min(availableWidth/(Math.max(1e-8,maxX-minX)*256),availableHeight/(Math.max(1e-8,maxY-minY)*256)))));dirty=true;persist();}
function demo(){if(!mutable())return;pushHistory();route=[[116.3900,40.0145],[116.3859,40.0129],[116.3864,40.0113],[116.3900,40.0100],[116.3934,40.0111],[116.3943,40.0158],[116.3921,40.0186],[116.3874,40.0183],[116.3838,40.0165],[116.3831,40.0115]];routeKind='waypoint';roundTrip=false;mapName='北京 · 示例路线';$('cityLabel').textContent=mapName;fit();updateRoute();toast(mapSource==='online'?'已载入示例路线，街道地图需联网加载':'已载入示例路线，可切换在线街道查看道路');}
function resize(){const r=canvas.getBoundingClientRect();if(r.width&&r.height){width=r.width;height=r.height;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);dirty=true;}drawChart();}
if(window.ResizeObserver){const observer=new ResizeObserver(()=>resize());observer.observe(canvas);}
window.addEventListener('resize',resize);window.addEventListener('load',resize);
function path(points,close=false){ctx.beginPath();points.forEach((p,i)=>{const [x,y]=screen(p);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});if(close)ctx.closePath();}
function drawChina(){if(!china)return;for(const feature of china.features){const g=feature.geometry;if(!g)continue;let polygons=g.type==='MultiPolygon'?g.coordinates:g.type==='Polygon'?[g.coordinates]:[];ctx.beginPath();for(const polygon of polygons)for(const ring of polygon)ring.forEach((p,i)=>{const s=screen(p);if(i)ctx.lineTo(...s);else ctx.moveTo(...s);});ctx.fillStyle='#eeeeee';ctx.fill('evenodd');ctx.strokeStyle='#c9c9c9';ctx.lineWidth=.8;ctx.stroke();if(zoom<8&&zoom>3.4){const center=feature.properties.centroid||feature.properties.center;if(center){const p=screen(center);ctx.fillStyle='#939393';ctx.font='9px sans-serif';ctx.textAlign='center';ctx.fillText(feature.properties.name.replace(/省|自治区|壮族|回族|维吾尔/g,''),...p);}}}if(zoom<12){for(const c of cities.slice(1)){const p=screen([c[1],c[2]]);if(p[0]<10||p[0]>width-20||p[1]<30||p[1]>height-30)continue;if(zoom<4&&!['北京','上海','广州','长沙','成都','乌鲁木齐','拉萨'].includes(c[0]))continue;ctx.fillStyle='#9b9b9b';ctx.beginPath();ctx.arc(...p,1.7,0,Math.PI*2);ctx.fill();ctx.font='9px sans-serif';ctx.textAlign='left';ctx.fillText(c[0],p[0]+5,p[1]+3);}}}
let tileVersion=0;
function setMapSource(source){
  if(!['online','overview','imported'].includes(source))return;
  if(source==='imported'&&(!mapMeta||!native)){toast('请先导入离线 MBTiles 地图');return;}
  mapInteraction++;cancelMapGesture();
  mapSource=source;mapTiles.clear();lastTileSummary={total:0,ready:0,failed:0,loading:0};closeSheet();updateSourceUI();updateRoute();
}
function updateSourceUI(){
  ['Online','Overview','Imported'].forEach(name=>{const button=$('source'+name),selected=mapSource===name.toLowerCase();button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
  $('sourceImported').disabled=!mapMeta||!native;
  $('map').setAttribute('aria-label',mapSource==='online'?'全国在线街道地图，可绘制路线':mapSource==='overview'?'离线全国概览，可绘制路线':'导入的离线地图，可绘制路线');
  $('mapStatusText').textContent=mapSource==='online'?'高德在线':mapSource==='overview'?'离线概览':'离线地图';
  $('mapStatus').setAttribute('aria-label','切换地图来源，当前'+$('mapStatusText').textContent);
  $('mapNotice').hidden=true;dirty=true;
}
function retryMap(){mapTiles.clear();lastTileSummary={total:0,ready:0,failed:0,loading:0};dirty=true;}
function drawTiles(){
  if(mapSource==='overview')return;
  const source=mapSource==='online'?{id:'online-amap',online:true,url:(z,x,y)=>`https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x=${x}&y=${y}&z=${z}`}:mapMeta&&native?{id:'imported-'+tileVersion,online:false,url:(z,x,y)=>`/tiles/${z}/${x}/${y}`} :null;
  if(!source)return;
  lastTileSummary=mapTiles.draw(ctx,{center:mapCoordinates(mapCenter),zoom,width,height,dpr},source);
}
function updateMapStatus(){
  const online=mapSource==='online',imported=mapSource==='imported',s=lastTileSummary;
  const offline=online&&navigator.onLine===false;
  const failed=(online||imported)&&s.failed>0;
  $('mapStatusText').textContent=online?(offline?'在线 · 网络已断开':s.loading?'在线 · 加载中':failed?'在线 · 加载失败':'高德在线'):imported?'离线地图':'离线概览';
  $('mapStatus').classList.toggle('map-unavailable',offline||failed);
  $('mapStatus').setAttribute('aria-label','切换地图来源，当前'+$('mapStatusText').textContent);
  $('mapNotice').hidden=!(offline||failed);
  if(offline||failed){
    $('mapNoticeText').textContent=online?(offline?'网络已断开，已显示的图块仍可查看。':s.ready?'部分地图未能加载，可重试或切换离线概览。':'在线地图未能加载，请检查网络后重试，或切换离线概览。'):'地图包未包含当前区域或缩放级别，可缩放或返回离线概览。';
    $('retryMap').hidden=offline;
  }
  const credit=$('mapAttribution');
  credit.textContent=online?'© 高德地图':imported?'离线 MBTiles · '+(mapMeta.attribution||mapMeta.name||'本地地图'):'DataV GeoAtlas · 全国行政区概览';
  if(online){credit.href='https://www.amap.com/';credit.setAttribute('aria-label','高德地图数据来源');}
  else{credit.removeAttribute('href');credit.removeAttribute('aria-label');}
}
function drawMap(){
  if(!width||!height)return;ctx.clearRect(0,0,width,height);ctx.fillStyle='#e8e8e8';ctx.fillRect(0,0,width,height);ctx.lineWidth=.4;ctx.strokeStyle='#dfdfdf';
  const gap=52,c=mapMerc(mapCenter),s=256*2**zoom;for(let x=((-c[0]*s)%gap+gap)%gap;x<width;x+=gap){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}for(let y=((-c[1]*s)%gap+gap)%gap;y<height;y+=gap){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();}
  if(mapSource==='overview')drawChina();drawTiles();updateMapStatus();
  if(mapSource==='overview'&&zoom>=11){ctx.font='10px sans-serif';ctx.fillStyle='#777777';ctx.textAlign='center';ctx.fillText('全国概览不含街道细节',width/2,height/2-12);ctx.fillText('点击左上角可切换在线街道',width/2,height/2+6);}
  if(currentLocation){const [x,y]=screen([currentLocation.lon,currentLocation.lat]);ctx.beginPath();ctx.arc(x,y,15,0,Math.PI*2);ctx.fillStyle='#22222218';ctx.fill();ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#222';ctx.lineWidth=2;ctx.stroke();}
  if(route.length){path(route);ctx.strokeStyle='#ffffff';ctx.lineWidth=7;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();ctx.strokeStyle='#232323';ctx.lineWidth=3.8;ctx.stroke();
    const numbered=routeKind==='waypoint'&&route.length<=120;
    const markers=numbered?route.map((p,i)=>[p,i]):[[route[0],0],...(route.length>1?[[route[route.length-1],route.length-1]]:[])];
    for(const [p,i] of markers){const [x,y]=screen(p),r=i===0?12:10;if(x< -30||x>width+30||y< -30||y>height+30)continue;ctx.shadowColor='#00000022';ctx.shadowBlur=4;ctx.beginPath();ctx.arc(x,y,r+2,0,Math.PI*2);ctx.fillStyle='#ffffff';ctx.fill();ctx.shadowBlur=0;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=i===0?'#1a1a1a':'#484848';ctx.fill();ctx.fillStyle='#ffffff';ctx.font=`600 ${i===0?10:9}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(i===0?'起':numbered?i:'终',x,y+.3);ctx.textBaseline='alphabetic';}
  }
  if((active()||state.status==='finished')&&Number.isFinite(state.lon)){const p=screen([state.lon,state.lat]);ctx.beginPath();ctx.arc(...p,15,0,Math.PI*2);ctx.fillStyle='#11111122';ctx.fill();ctx.beginPath();ctx.arc(...p,7,0,Math.PI*2);ctx.fillStyle='#ffffff';ctx.fill();ctx.beginPath();ctx.arc(...p,4.5,0,Math.PI*2);ctx.fillStyle='#111111';ctx.fill();}
  const metersPerPixel=156543.03392*Math.cos(mapCenter[1]*Math.PI/180)/2**zoom,raw=metersPerPixel*50,pow=10**Math.floor(Math.log10(raw)),unit=[1,2,5,10].find(v=>v*pow>=raw)*pow;
  $('mapScale').textContent=unit>=1000?Math.round(unit/1000)+' km':Math.round(unit)+' m';dirty=false;
}
const pointers=new Map();let gesture=null,mapPressTimer=null;
function cancelMapPress(){if(mapPressTimer!==null){clearTimeout(mapPressTimer);mapPressTimer=null;}}
function cancelMapGesture(){
  cancelMapPress();
  if(gesture&&gesture.type==='draw'&&gesture.before){restoreRoute(gesture.before);history=gesture.historyBefore;updateRoute();}
  const captured=[...pointers.keys()];pointers.clear();gesture=null;
  for(const id of captured)try{canvas.releasePointerCapture(id);}catch(e){}
}
function localPointer(e){const r=canvas.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];}
canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0&&e.pointerType==='mouse')return;mapInteraction++;canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,localPointer(e));
  cancelMapPress();if(pointers.size===1)mapPressTimer=setTimeout(()=>{mapPressTimer=null;if(pointers.size===1){cancelMapGesture();showSheet('routeToolsSheet');}},550);
  if(pointers.size===2){if(gesture&&gesture.before){restoreRoute(gesture.before);if(gesture.type==='draw')history=gesture.historyBefore;updateRoute();}const a=[...pointers.values()];gesture={type:'pinch',initialDist:Math.hypot(a[1][0]-a[0][0],a[1][1]-a[0][1]),initialZoom:zoom,anchor:locationAt((a[0][0]+a[1][0])/2,(a[0][1]+a[1][1])/2)};return;}
  if(pointers.size>2)return;const pos=localPointer(e),draw=mode==='draw'&&!active();
  gesture={type:draw?((editing?editorMode!=='freehand':homeTool==='waypoint')?'point':'draw'):'pan',start:pos,last:pos,center:mapMerc(mapCenter),before:routeSnapshot(),historyBefore:history.slice(),moved:false};
  if(gesture.type==='draw'){if(route.length>=10000){gesture.type='pan';toast('路线最多包含 10000 个点，请先撤销或清空');return;}pushHistory();routeKind='freehand';const p=locationAt(...pos);if(!route.length||distance(route[route.length-1],p)>1)route.push(p);updateRoute();}
});
canvas.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId)||!gesture)return;const pos=localPointer(e);pointers.set(e.pointerId,pos);
  if(gesture.type==='pinch'&&pointers.size>=2){const a=[...pointers.values()],mid=[(a[0][0]+a[1][0])/2,(a[0][1]+a[1][1])/2],dist=Math.hypot(a[1][0]-a[0][0],a[1][1]-a[0][1]);zoom=Math.max(2,Math.min(19,gesture.initialZoom+Math.log2(Math.max(1,dist)/Math.max(1,gesture.initialDist))));const anchor=mapMerc(gesture.anchor),s=256*2**zoom;mapCenter=mapUnmerc([anchor[0]-(mid[0]-width/2)/s,anchor[1]-(mid[1]-height/2)/s]);dirty=true;return;}
  if(pointers.size>1)return;
  if(Math.hypot(pos[0]-gesture.start[0],pos[1]-gesture.start[1])>7){gesture.moved=true;cancelMapPress();}
  if(gesture.type==='draw'&&route.length<10000&&Math.hypot(pos[0]-gesture.last[0],pos[1]-gesture.last[1])>=5){const p=locationAt(...pos);if(distance(route[route.length-1],p)>.1){route.push(p);gesture.last=pos;updateRoute();}}
  else if(gesture.type==='pan'||gesture.type==='point'&&gesture.moved){const s=256*2**zoom;mapCenter=mapUnmerc([gesture.center[0]-(pos[0]-gesture.start[0])/s,gesture.center[1]-(pos[1]-gesture.start[1])/s]);mapCenter[1]=Math.max(-85,Math.min(85,mapCenter[1]));mapCenter[0]=Math.max(-180,Math.min(180,mapCenter[0]));dirty=true;}
});
function endPointer(e){
  cancelMapPress();
  if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);
  if(gesture&&gesture.type==='draw'&&e.type==='pointercancel'){restoreRoute(gesture.before);history=gesture.historyBefore;updateRoute();}
  if(gesture&&gesture.type==='point'&&!gesture.moved&&e.type!=='pointercancel'&&!active()){
    pushHistory();const p=locationAt(...localPointer(e));if(editorMode==='start'){route=[p];setEditorMode('waypoint');}else if(route.length<10000){if(!route.length||distance(route[route.length-1],p)>.1)route.push(p);}routeKind='waypoint';updateRoute();
  }
  if(pointers.size===0){gesture=null;persist();}else if(gesture)gesture.type='wait';
}
canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',endPointer);
canvas.addEventListener('contextmenu',e=>{e.preventDefault();cancelMapGesture();showSheet('routeToolsSheet');});
canvas.addEventListener('wheel',e=>{e.preventDefault();mapInteraction++;zoom=Math.max(2,Math.min(19,zoom+(e.deltaY<0?.5:-.5)));dirty=true;persist();},{passive:false});
function undo(){if(!mutable()||!history.length)return;restoreRoute(history.pop());updateRoute();}
function clearRoute(){if(!mutable()||!route.length)return;pushHistory();route=[];roundTrip=false;updateRoute();}
function setMock(value){if(active()){toast('请先结束当前回放，再切换定位模式');return;}if(value&&!native){toast('系统模拟定位需安装 Android APK，浏览器仅提供 App 内预览');return;}mock=value;$('mockMode').classList.toggle('selected',mock);$('previewMode').classList.toggle('selected',!mock);persist();}
function applyState(next){
  const previousState=state;state=next;const running=next.status==='running',paused=next.status==='paused',finished=next.status==='finished';
  if(commandPending&&(['running','paused','finished','error'].includes(next.status)&&next.status!==previousState.status||Date.now()>commandDeadline))unlockCommand();
  if((running||paused)&&Number.isFinite(next.speed)&&speed!==next.speed){speed=Math.max(0,Math.min(5,next.speed));updateSpeed();}
  if((running||paused)&&typeof next.gyroEnabled==='boolean'&&gyroEnabled!==next.gyroEnabled){gyroEnabled=next.gyroEnabled;updateGyroUI();}
  $('startLabel').textContent=running?'暂停模拟':paused?'继续模拟':finished?'再次模拟':'开始模拟';$('start').firstElementChild.innerHTML=icon(running?'pause':'play');
  $('homeClear').disabled=!route.length||running||paused||commandPending;
  $('stop').hidden=!running&&!paused;$('runStatus').textContent=running?(next.mock?'系统模拟定位中':'轨迹预览中'):paused?'回放已暂停':finished?'已抵达终点':next.status==='error'?'启动未完成':'准备好，出发吧';
  $('statusDot').classList.toggle('running',running);const fraction=next.total?Math.min(1,(next.distance||0)/next.total):0;
  $('progressBar').style.width=fraction*100+'%';$('progressLabel').textContent=running||paused||finished?Math.round(fraction*100)+'% COMPLETED':'ROUTE SIMULATOR';
  $('liveDistance').textContent=((next.distance||0)/1000).toFixed(2);$('liveTime').textContent=timeLabel(next.elapsed);$('liveSteps').textContent=(next.steps||0).toLocaleString('zh-CN');
  $('sensorStatus').textContent=running?(gyroEnabled?'模拟中':'已关闭'):paused?'已暂停':'待开始';
  $('locationPublication').textContent=next.mock&&Number.isFinite(next.locationAgeMs)&&next.locationAgeMs>=0?'系统定位已提交 '+next.locationUpdates+' 次 · 最近 '+next.locationAgeMs+' ms 前':next.mock===false?'App 内预览':'等待系统定位更新';
  $('coords').textContent=Number.isFinite(next.lon)?Math.abs(next.lat).toFixed(6)+'° '+(next.lat<0?'S':'N')+', '+Math.abs(next.lon).toFixed(6)+'° '+(next.lon<0?'W':'E'):'等待开始回放';
  const g=next.gyro||[0,0,0];['gx','gy','gz'].forEach((id,i)=>$(id).textContent=Number(g[i]||0).toFixed(3));
  if(sensorMode==='device')renderMeasured();
  if(next.error&&next.error!==lastError){toast(next.error);lastError=next.error;}if(!next.error)lastError='';dirty=dirty||previousState.lon!==next.lon||previousState.lat!==next.lat||previousState.status!==next.status;
}
// Browser-only adapter for inspecting the bundled interface; Android uses RouteEngine in its foreground service.
const browserPlayback={data:null,distance:0,elapsed:0,steps:0,running:false,finished:false,last:0,
  start(c){this.data=JSON.parse(JSON.stringify(c));this.distance=this.elapsed=this.steps=0;this.running=true;this.finished=false;this.last=performance.now();},
  snapshot(){
    if(!this.data)return {status:'idle',gyro:[0,0,0]};
    const now=performance.now(),dt=(now-this.last)/1000;this.last=now;
    const points=this.data.route,total=routeLength(points),velocity=speed>0?1000/(speed*60):0,cadence=Math.min(210,speed>0?1000/speed:0);
    if(this.running){const used=velocity>0?Math.min(dt,(total-this.distance)/velocity):dt;this.distance+=velocity*used;this.elapsed+=used;this.steps+=cadence*used/60;if(velocity>0&&this.distance>=total){this.distance=total;this.running=false;this.finished=true;}}
    let remaining=this.distance,p=points[points.length-1];
    for(let i=1;i<points.length;i++){const d=distance(points[i-1],points[i]);if(remaining<=d){const f=d?remaining/d:0;p=[points[i-1][0]+(points[i][0]-points[i-1][0])*f,points[i-1][1]+(points[i][1]-points[i-1][1])*f];break;}remaining-=d;}
    const ph=this.elapsed*cadence/60*2*Math.PI,g=this.running&&velocity>0&&gyroEnabled?[.22*Math.sin(ph)+.035*Math.sin(2*ph+.6),.16*Math.cos(ph*.5)+.025*Math.sin(ph*2),.11*Math.sin(ph+.9)+.018*Math.cos(ph*.5)]:[0,0,0];
    return {status:this.finished?'finished':this.running?'running':'paused',mock:false,total,distance:this.distance,elapsed:this.elapsed,steps:Math.floor(this.steps),lat:p[1],lon:p[0],gyro:g,speed,speedUnit:'min/km',pace,cadence};
  }};

function start(){
  if(commandPending)return;
  if(active()){if(native){lockCommand();native.toggle();}else{browserPlayback.snapshot();browserPlayback.running=!browserPlayback.running;applyState(browserPlayback.snapshot());}return;}
  const points=playbackRoute(),length=routeLength(points);if(points.length<2||length<1){toast('请先在地图上绘制至少 1 米的路线');return;}if(length>1000000||points.length>10000){toast('路线过长，请控制在 1000 公里、10000 个点以内');return;}
  if(native){lockCommand();native.start(JSON.stringify(config()));}else{browserPlayback.start(config());applyState(browserPlayback.snapshot());}
}
function exportData(){const fallback=JSON.stringify({format:'stride-route-v1',coordinates:'WGS84',route:playbackRoute(),speed,speedUnit:'min/km',sensorSource:'synthetic; app-local only; rad/s',state},null,2);if(native)native.export(fallback);else{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([fallback],{type:'application/json'}));a.href=url;a.download='stride-route.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);toast('已导出路线与当前模拟数据');}}
function drawChart(){const r=chart.getBoundingClientRect();if(!r.width)return;chart.width=Math.round(r.width*dpr);chart.height=Math.round(r.height*dpr);chartCtx.setTransform(dpr,0,0,dpr,0,0);const w=r.width,h=r.height;chartCtx.clearRect(0,0,w,h);chartCtx.strokeStyle='#3b3b3b';chartCtx.lineWidth=.6;chartCtx.setLineDash([2,4]);for(let y=15;y<h;y+=35){chartCtx.beginPath();chartCtx.moveTo(0,y);chartCtx.lineTo(w,y);chartCtx.stroke();}chartCtx.setLineDash([]);['#f9f9f9','#a5a5a5','#6f6f6f'].forEach((color,axis)=>{chartCtx.strokeStyle=color;chartCtx.lineWidth=axis===0?1.5:1;chartCtx.setLineDash(axis===2?[4,3]:[]);chartCtx.beginPath();const data=chartSeries.length?chartSeries:[[0,0,0]];data.forEach((g,i)=>{const x=w-(data.length-1-i)*w/110,y=h/2-g[axis]*h*1.1;if(i)chartCtx.lineTo(x,y);else chartCtx.moveTo(x,y);});chartCtx.stroke();});chartCtx.setLineDash([]);}
function updateMapMeta(meta){mapMeta=meta&&meta.available?meta:null;tileVersion++;mapTiles.clear();if(mapMeta){$('importedName').textContent=mapMeta.name||'已导入离线地图';$('importedDescription').textContent='本地地图 · '+((mapMeta.size||0)/1048576).toFixed(1)+' MB · 完全离线';$('showImported').hidden=false;}else if(mapSource==='imported')mapSource='overview';updateSourceUI();dirty=true;}
function validMapCoordinate(point){return point.length===2&&point.every(Number.isFinite)&&Math.abs(point[0])<=180&&Math.abs(point[1])<=85.05112878;}
function showImported(){
  if(!mapMeta)return;setMapSource('imported');
  const parse=value=>String(value||'').split(',').map(part=>part.trim()?Number(part):NaN),center=parse(mapMeta.center);
  if(center.length>=2&&validMapCoordinate(center.slice(0,2))){mapCenter=center.slice(0,2);zoom=Math.min(19,Math.max(2,Number.isFinite(center[2])?center[2]:14));}
  else{
    const b=parse(mapMeta.bounds);
    if(b.length===4&&validMapCoordinate(b.slice(0,2))&&validMapCoordinate(b.slice(2,4))&&b[0]<=b[2]&&b[1]<=b[3])fit([[b[0],b[1]],[b[2],b[3]]]);
    else toast('地图包未提供有效中心坐标，请在地图上移动到对应区域');
  }
  mapName=mapMeta.name||'本地地图';$('cityLabel').textContent=mapName;showPage('route');dirty=true;persist();
}
window.nativeEvent=(type,value)=>{if(type==='location'){receiveLocation(value);}else if(type==='locationError'){locationError(value);}else if(type==='setup'){unlockCommand();toast(value);showSheet('helpSheet');}else if(type==='error'){unlockCommand();toast(value);}else if(type==='map'){try{updateMapMeta(JSON.parse(value));showImported();toast('离线地图已导入');}catch(e){toast('地图信息读取失败');}}else if(type==='overlay'){overlayEnabled=value==='true';updateOverlayUI();if(overlayEnabled)toast('悬浮控制已开启，返回桌面即可使用');}else toast(value);};
function updateOverlayUI(){$('overlayToggle').classList.toggle('on',overlayEnabled);$('overlayToggle').setAttribute('aria-checked',String(overlayEnabled));$('homeOverlay').classList.toggle('selected',overlayEnabled);$('homeOverlay').setAttribute('aria-pressed',String(overlayEnabled));}
function displayedGyro(){return sensorMode==='device'?(measured&&measured.gyroFresh?measured.gyro:[0,0,0]):state.gyro||[0,0,0];}
function renderMeasured(){
  if(!measured)return;
  const available=measured.gyroAvailable,fresh=measured.gyroFresh;
  $('sensorStatus').textContent=!available?'无陀螺仪':!measured.listening?'前台已停止':fresh?'手机实测':'等待传感器';
  ['gx','gy','gz'].forEach((id,i)=>$(id).textContent=available&&fresh?Number(measured.gyro[i]||0).toFixed(3):'—');
  $('sensorDescription').textContent=(available?measured.gyroName:'设备未提供陀螺仪')+'；'+(!measured.stepAvailable?'设备未提供步伐检测器':!measured.stepPermission?'身体活动权限未允许':measured.stepRegistered?'步伐检测器已启用':'步伐检测器已暂停');
  const stepsAvailable=measured.stepAvailable&&measured.stepPermission;
  $('measuredSteps').textContent=stepsAvailable?String(measured.steps||0):'—';$('measuredCadence').textContent=stepsAvailable&&measured.cadence>0?String(Math.round(measured.cadence)):'—';
}
function setSensorMode(mode){
  if(mode==='device'&&(!native||!native.sensorState)){toast('手机实测需安装 Android App；浏览器仅提供内部模拟');return;}
  sensorMode=mode;chartSeries=[];measured=null;$('sensorDiagnostics').hidden=mode!=='device';
  for(const [id,name] of [['sensorSimulation','simulation'],['sensorDevice','device']]){$(id).classList.toggle('selected',mode===name);$(id).setAttribute('aria-pressed',String(mode===name));}
  if(native&&native.sensorMode)native.sensorMode(mode==='device');
  if(mode==='device'){measured=JSON.parse(native.sensorState());renderMeasured();}else applyState(state);
  drawChart();
}
$('sensorSimulation').onclick=()=>setSensorMode('simulation');$('sensorDevice').onclick=()=>setSensorMode('device');
$('sensorSettings').onclick=()=>{if(native&&native.sensorSettings)native.sensorSettings();};
$('homeOverlay').onclick=()=>{$('overlayToggle').click();};
$('overlayToggle').onclick=()=>{if(!native){toast('悬浮窗需安装 Android APK，并允许“显示在其他应用上层”');return;}native.overlay(!overlayEnabled,JSON.stringify(config()));};
$('speed').oninput=e=>{speed=Math.max(0,Math.min(5,Number(e.target.value)));updateSpeed();if(native&&native.speed)native.speed(speed);};
function updateGyroUI(){$('gyroToggle').classList.toggle('on',gyroEnabled);$('gyroToggle').setAttribute('aria-checked',String(gyroEnabled));$('gyroBadge').textContent=gyroEnabled?'已开启':'已关闭';}
$('gyroToggle').onclick=()=>{gyroEnabled=!gyroEnabled;updateGyroUI();if(native)native.gyro(gyroEnabled);persist();};
document.querySelectorAll('.bottom-nav button').forEach(b=>b.onclick=()=>showPage(b.dataset.page));
$('help').onclick=()=>showSheet('helpSheet');$('chooseCity').onclick=()=>showSheet('citySheet');$('citySearch').oninput=e=>renderCities(e.target.value);$('sheetBackdrop').onclick=closeSheet;document.querySelectorAll('.close-sheet').forEach(b=>b.onclick=closeSheet);
$('modeDraw').onclick=()=>setMode('draw');$('modeMove').onclick=()=>setMode('move');
$('homeMove').onclick=()=>setHomeTool('move');$('homeFreehand').onclick=()=>setHomeTool('freehand');$('homeWaypoints').onclick=()=>setHomeTool('waypoint');$('locateMe').onclick=()=>requestLocation(true);
$('zoomIn').onclick=()=>{mapInteraction++;zoom=Math.min(19,zoom+1);dirty=true;updateRoute();};$('zoomOut').onclick=()=>{mapInteraction++;zoom=Math.max(2,zoom-1);dirty=true;updateRoute();};$('fitRoute').onclick=()=>{mapInteraction++;fit();};
$('homeClear').onclick=clearRoute;$('undo').onclick=undo;$('clear').onclick=clearRoute;$('demo').onclick=demo;$('openEditor').onclick=()=>setEditing(true);$('editorDone').onclick=()=>setEditing(false);$('editorUndo').onclick=undo;$('editorClear').onclick=clearRoute;
$('setStart').onclick=()=>setEditorMode('start');$('addPoints').onclick=()=>setEditorMode('waypoint');$('freehand').onclick=()=>setEditorMode('freehand');$('roundTrip').onclick=()=>{if(mutable()){pushHistory();roundTrip=!roundTrip;updateRoute();}};
$('mockMode').onclick=()=>setMock(true);$('previewMode').onclick=()=>setMock(false);$('openMotion').onclick=()=>showPage('motion');$('start').onclick=start;$('stop').onclick=()=>{if(native)native.stop();else{browserPlayback.data=null;applyState({status:'idle',gyro:[0,0,0]});}};
$('exportSession').onclick=exportData;$('showChina').onclick=()=>{setMapSource('overview');moveTo(cities[0]);showPage('route');};$('showOnline').onclick=()=>{setMapSource('online');showPage('route');};$('importMap').onclick=()=>native?native.importMap():toast('请在 Android App 中通过文件选择器导入 MBTiles');$('showImported').onclick=showImported;
$('mapStatus').onclick=()=>showSheet('mapSourceSheet');$('sourceOnline').onclick=()=>setMapSource('online');$('sourceOverview').onclick=()=>setMapSource('overview');$('sourceImported').onclick=()=>setMapSource('imported');$('retryMap').onclick=retryMap;$('useOverview').onclick=()=>setMapSource('overview');
window.addEventListener('offline',()=>{mapTiles.suspend();dirty=true;});window.addEventListener('online',()=>{if(mapSource==='online')retryMap();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)mapTiles.suspend();else dirty=true;});
$('openSettings').onclick=()=>native?native.developerSettings():toast('请在安装后的 Android App 中打开开发者选项');$('enableNotifications').onclick=()=>native?native.notifications():toast('通知控制在 Android App 中可用');
try{const saved=JSON.parse(localStorage.getItem('stride-v1')||'null');if(saved){if(Array.isArray(saved.route)&&saved.route.length<=10000&&saved.route.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<85.05113))route=saved.route;if(saved.speedUnit==='min/km'&&Number.isFinite(saved.speed))speed=Math.max(0,Math.min(5,saved.speed));gyroEnabled=saved.gyroEnabled!==false;mock=native?saved.mock!==false:false;roundTrip=!!saved.roundTrip;if(Array.isArray(saved.mapCenter)&&saved.mapCenter.length===2&&saved.mapCenter.every(Number.isFinite)&&Math.abs(saved.mapCenter[0])<=180&&Math.abs(saved.mapCenter[1])<=85.05112878)mapCenter=saved.mapCenter;if(Number.isFinite(saved.zoom))zoom=Math.max(2,Math.min(19,saved.zoom));mapName=String(saved.mapName||'全国概览');routeKind=saved.routeKind==='freehand'?'freehand':'waypoint';}}catch(e){}
if(!native&&mapSource==='imported')mapSource='overview';updateSourceUI();$('cityLabel').textContent='中国 · '+mapName;$('gyroToggle').classList.toggle('on',gyroEnabled);$('gyroToggle').setAttribute('aria-checked',String(gyroEnabled));$('gyroBadge').textContent=gyroEnabled?'已开启':'已关闭';setMock(mock);updateSpeed();
fetch('maps/china.geojson').then(r=>r.json()).then(data=>{china=data;dirty=true;}).catch(()=>toast('全国概览加载失败，请重新打开应用'));
if(native){try{updateMapMeta(JSON.parse(native.mapInfo()));overlayEnabled=JSON.parse(native.overlayState()).enabled;updateOverlayUI();}catch(e){} }
const compactMapControls=[document.querySelector('.map-top'),document.querySelector('.map-zoom'),$('fitRoute')];
function mountMapControls(editor){compactMapControls.forEach(node=>canvas.parentElement.append(node));}
function setupRouteTools(){
  const content=$('routeToolsContent');mountMapControls(false);
  content.append(document.querySelector('.home-secondary'));
  const motion=$('openMotion'),gyroBadge=$('gyroBadge');motion.className='outline-button';motion.textContent='运动数据与悬浮控制';gyroBadge.className='sr-only';motion.append(gyroBadge);
  $('openMapLibrary').onclick=()=>showPage('maps');$('menuRetryMap').onclick=retryMap;
  $('routeToolsSheet').querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{if($('routeToolsSheet').open)closeSheet();}));
}
setupRouteTools();syncMode();requestLocation(true);
setInterval(()=>{try{if(sensorMode==='device'&&native&&native.sensorState)measured=JSON.parse(native.sensorState());applyState(native?JSON.parse(native.state()):browserPlayback.snapshot());if(native){const overlay=JSON.parse(native.overlayState()),enabled=!!overlay.enabled;if(enabled!==overlayEnabled){overlayEnabled=enabled;updateOverlayUI();if(enabled)toast('悬浮控制已开启，返回桌面即可使用');}if(overlay.error&&overlay.error!==lastOverlayError)toast(overlay.error);lastOverlayError=overlay.error||'';}}catch(e){if(commandPending&&Date.now()>commandDeadline)unlockCommand();}},150);
function frame(now){if(dirty&&!document.hidden&&$('page-route').classList.contains('active'))drawMap();if(now-lastChart>100){chartSeries.push(displayedGyro());if(chartSeries.length>111)chartSeries.shift();if($('page-motion').classList.contains('active'))drawChart();lastChart=now;}requestAnimationFrame(frame);}requestAnimationFrame(frame);
