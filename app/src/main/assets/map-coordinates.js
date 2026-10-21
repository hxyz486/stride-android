/*
 * WGS84 / GCJ-02 display conversion for the online map. Route storage and the
 * Android location API continue to use WGS84; convert only at the map boundary.
 *
 * Forward transform adapted from coordtransform 2.1.2 by Wandergis:
 * https://github.com/wandergis/coordtransform
 * https://www.npmjs.com/package/coordtransform/v/2.1.2
 * Iterative inverse, array API, validation, and tests added for STRIDE.
 *
 * The MIT License (MIT)
 * Copyright (c) 2015 记忆的残骸
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
'use strict';
(function(root){
  const PI=Math.PI,A=6378245,EE=0.00669342162296594323;
  function validate(point){
    if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite))throw new TypeError('Expected finite [longitude, latitude] coordinates');
    if(Math.abs(point[0])>180||Math.abs(point[1])>90)throw new RangeError('Coordinates are outside longitude/latitude limits');
  }
  // The source algorithm uses this coarse conversion rectangle. It is not a
  // political boundary test and is discontinuous at the rectangle's edges.
  function outside(lon,lat){return !(lon>73.66&&lon<135.05&&lat>3.86&&lat<53.55);}
  function outsideChina(point){validate(point);return outside(point[0],point[1]);}
  function forward(lon,lat){
    const x=lon-105,y=lat-35;
    const common=(20*Math.sin(6*x*PI)+20*Math.sin(2*x*PI))*2/3;
    let dLat=-100+2*x+3*y+.2*y*y+.1*x*y+.2*Math.sqrt(Math.abs(x))+common;
    dLat+=(20*Math.sin(y*PI)+40*Math.sin(y/3*PI))*2/3;
    dLat+=(160*Math.sin(y/12*PI)+320*Math.sin(y*PI/30))*2/3;
    let dLon=300+x+2*y+.1*x*x+.1*x*y+.1*Math.sqrt(Math.abs(x))+common;
    dLon+=(20*Math.sin(x*PI)+40*Math.sin(x/3*PI))*2/3;
    dLon+=(150*Math.sin(x/12*PI)+300*Math.sin(x/30*PI))*2/3;
    const rad=lat*PI/180,sin=Math.sin(rad),magic=1-EE*sin*sin,sqrt=Math.sqrt(magic);
    return [lon+dLon*180/(A/sqrt*Math.cos(rad)*PI),lat+dLat*180/(A*(1-EE)/(magic*sqrt)*PI)];
  }
  function wgsToGcj(point){
    validate(point);
    return outside(point[0],point[1])?point.slice():forward(point[0],point[1]);
  }
  function gcjToWgs(point){
    validate(point);
    if(outside(point[0],point[1]))return point.slice();
    let lon=point[0],lat=point[1];
    // Solve forward(candidate) = requested GCJ coordinate. A single subtraction
    // leaves meter-scale errors that become visible when editing at street zoom.
    for(let i=0;i<16;i++){
      const shifted=forward(lon,lat),dx=shifted[0]-point[0],dy=shifted[1]-point[1];
      lon-=dx;lat-=dy;
      if(Math.max(Math.abs(dx),Math.abs(dy))<1e-10)break;
    }
    return [lon,lat];
  }
  root.MapCoordinates=Object.freeze({wgsToGcj,gcjToWgs,outsideChina});
})(globalThis);
