'use strict';
// Only tiles intersecting the visible viewport are requested. HTTP caching is
// handled by the browser/WebView, including the server's cache expiry headers.
class MapTiles {
  constructor(onChange) {
    this.onChange=onChange;this.cache=new Map();this.inFlight=0;
    this.timeoutMs=12000;this.maxEntries=96;this.maxRequests=4;this.sourceId=null;
  }
  cancel(entry) {
    if(entry.status!=='loading')return;
    clearTimeout(entry.timer);entry.img.onload=entry.img.onerror=null;
    entry.img.src='';entry.status='queued';this.inFlight--;
  }
  clear() {
    for(const entry of this.cache.values())this.cancel(entry);
    this.cache.clear();this.inFlight=0;
  }
  suspend() {
    for(const entry of this.cache.values())this.cancel(entry);
  }
  load(entry,url) {
    entry.status='loading';entry.img=new Image();this.inFlight++;
    const finish=ok=>{
      if(entry.status!=='loading')return;
      clearTimeout(entry.timer);entry.img.onload=entry.img.onerror=null;
      entry.status=ok?'ready':'failed';this.inFlight--;
      if(!ok)entry.img.src='';
      this.onChange();
    };
    entry.img.onload=()=>finish(entry.img.naturalWidth>0);
    entry.img.onerror=()=>finish(false);
    entry.timer=setTimeout(()=>finish(false),this.timeoutMs);
    entry.img.src=url;
  }
  draw(ctx,view,source) {
    if(this.sourceId!==source.id){this.clear();this.sourceId=source.id;}
    const {center,zoom,width,height}=view,z=Math.max(0,Math.min(19,Math.floor(zoom)));
    const size=256*2**(zoom-z),n=2**z,c=merc(center),specs=[];
    const minX=Math.floor(c[0]*n-width/2/size),maxX=Math.ceil(c[0]*n+width/2/size)-1;
    const minY=Math.max(0,Math.floor(c[1]*n-height/2/size)),maxY=Math.min(n-1,Math.ceil(c[1]*n+height/2/size)-1);
    for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){
      const wrappedX=((x%n)+n)%n;
      specs.push({key:`${source.id}/${z}/${wrappedX}/${y}`,z,x,y,wrappedX});
    }
    const visible=new Set(specs.map(s=>s.key));
    for(const [key,entry] of this.cache)if(!visible.has(key)&&entry.status!=='ready'){
      this.cancel(entry);this.cache.delete(key);
    }
    // Request the center first so a slow connection shows useful detail early.
    specs.sort((a,b)=>(a.x+.5-c[0]*n)**2+(a.y+.5-c[1]*n)**2-((b.x+.5-c[0]*n)**2+(b.y+.5-c[1]*n)**2));
    const result={total:visible.size,ready:0,failed:0,loading:0};
    const counted=new Set();
    for(const spec of specs){
      let entry=this.cache.get(spec.key);
      if(!entry){entry={status:'queued'};this.cache.set(spec.key,entry);}
      else{this.cache.delete(spec.key);this.cache.set(spec.key,entry);}
      if(entry.status==='queued'&&this.inFlight<this.maxRequests&&(!source.online||navigator.onLine!==false))this.load(entry,source.url(spec.z,spec.wrappedX,spec.y));
      if(!counted.has(spec.key)){
        counted.add(spec.key);
        if(entry.status==='ready')result.ready++;else if(entry.status==='failed')result.failed++;else result.loading++;
      }
      if(entry.status==='ready'){
        ctx.save();
        ctx.drawImage(entry.img,(spec.x-c[0]*n)*size+width/2,(spec.y-c[1]*n)*size+height/2,size+.5,size+.5);
        ctx.restore();
      }
    }
    for(const [key,entry] of this.cache){
      if(this.cache.size<=this.maxEntries)break;
      if(!visible.has(key)){this.cancel(entry);this.cache.delete(key);}
    }
    return result;
  }
}
