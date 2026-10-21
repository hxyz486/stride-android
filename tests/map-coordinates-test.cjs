'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const sandbox={};
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../app/src/main/assets/map-coordinates.js'),'utf8'),sandbox,{filename:'map-coordinates.js'});
const {wgsToGcj,gcjToWgs,outsideChina}=sandbox.MapCoordinates;
let checks=0;
function near(actual,expected,tolerance,label){
  checks++;assert(Math.abs(actual-expected)<=tolerance,`${label}: ${actual} != ${expected}`);
}
function pointNear(actual,expected,tolerance,label){for(let i=0;i<2;i++)near(actual[i],expected[i],tolerance,`${label} axis ${i}`);}
// Published, independently fixed reference values guard against a transform and
// inverse that agree with each other while sharing the wrong formula.
pointNear(wgsToGcj([116.404,39.915]),[116.41024449916938,39.91640428150164],1e-10,'Beijing reference');
pointNear(wgsToGcj([116.397128,39.916527]),[116.403372494,39.917930749],1e-9,'Forbidden City reference');
pointNear(gcjToWgs([116.41024449916938,39.91640428150164]),[116.404,39.915],1e-8,'inverse Beijing reference');
const mainland=[
  [116.397128,39.916527],[121.4737,31.2304],[112.9388,28.2282],
  [104.0665,30.5723],[87.6168,43.8256],[91.1409,29.6456],
  [113.2644,23.1291],[114.0579,22.5431],[126.5349,45.8038],
  [110.1983,20.044],[103.8343,36.0611],[101.7782,36.6171]
];
for(const point of mainland){
  checks++;assert.equal(outsideChina(point),false);
  const converted=wgsToGcj(point);
  checks++;assert(converted.every(Number.isFinite));
  checks++;assert(Math.hypot(converted[0]-point[0],converted[1]-point[1])>.0001,'Expected mainland display shift');
  pointNear(gcjToWgs(converted),point,1e-7,'mainland WGS round trip');
  pointNear(wgsToGcj(gcjToWgs(point)),point,1e-7,'mainland GCJ round trip');
}
// Exercise the conversion region at fractional coordinates, including either
// side of the transform's x=0 square-root term, rather than only city centers.
for(let lon=75.123;lon<135;lon+=2.773)for(let lat=5.234;lat<53;lat+=2.931){
  const point=[lon,lat];
  pointNear(gcjToWgs(wgsToGcj(point)),point,1e-7,'conversion-region grid round trip');
}
for(const point of [[151.2093,-33.8688],[-74.006,40.7128],[-.1276,51.5072],[139.6917,35.6895],[18.4241,-33.9249],[174.7633,-36.8485],[0,0],[-180,-90],[180,90]]){
  checks++;assert.equal(outsideChina(point),true);
  checks++;assert.deepEqual(Array.from(wgsToGcj(point)),point);
  checks++;assert.deepEqual(Array.from(gcjToWgs(point)),point);
}
for(const convert of [wgsToGcj,gcjToWgs]){
  for(const point of [[116.404,39.915],[151.2093,-33.8688]]){
    const original=point.slice(),converted=convert(point);
    checks++;assert.deepEqual(point,original,'conversion mutated its input');
    checks++;assert.notEqual(converted,point,'conversion must return a fresh array');
    converted[0]=0;checks++;assert.deepEqual(point,original,'output shares input storage');
  }
}
for(const operation of [wgsToGcj,gcjToWgs,outsideChina]){
  for(const invalid of [null,[],[1],[1,2,3],[NaN,30],[116,Infinity],['116',30]]){
    checks++;assert.throws(()=>operation(invalid),error=>error.name==='TypeError');
  }
  for(const invalid of [[181,0],[0,91],[-181,30],[116,-91]]){
    checks++;assert.throws(()=>operation(invalid),error=>error.name==='RangeError');
  }
}
console.log(`PASS: ${checks} map-coordinate checks (fixed references, regional inverse, outside identity, immutability, input validation)`);
