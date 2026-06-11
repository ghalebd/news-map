// soak.js — 10-minute full-feature endurance loop with leak detection (SAFE: watchdog)
const puppeteer=require('puppeteer-core');
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const HARD=setTimeout(()=>{console.log('WATCHDOG EXIT');process.exit(2);},720000);
let browser=null;process.on('exit',()=>{try{browser&&browser.process()&&browser.process().kill('SIGKILL');}catch(e){}});
(async()=>{
browser=await puppeteer.launch({headless:'new',executablePath:CHROME,
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--js-flags=--max-old-space-size=1200']});
const p=await browser.newPage();await p.setViewport({width:1280,height:840});
p.on('dialog',d=>d.accept().catch(()=>{}));
p.on('error',e=>console.log('PAGE CRASHED:',''+e));
const errs=[];p.on('pageerror',e=>errs.push((''+e).slice(0,140)));
await p.goto('http://localhost:8000/v2/control.html',{waitUntil:'networkidle2'});
await p.evaluate(()=>localStorage.clear());await p.reload({waitUntil:'networkidle2'});await sleep(2500);
await p.evaluate(()=>{
 [...document.querySelectorAll('.modesw__btn')].find(x=>x.dataset.mode==='live').click();
 GameMap.map.setView([26.5,56],7,{animate:false});
 window.__maxTask=0;new PerformanceObserver(l=>{l.getEntries().forEach(e=>{if(e.duration>window.__maxTask)window.__maxTask=e.duration;});}).observe({entryTypes:['longtask']});
 // stub external tracking endpoints (synthetic data only)
 const RW=window.WebSocket;window.WebSocket=function(u){if(/aisstream/.test(u))return{readyState:1,send(){},close(){},set onopen(f){setTimeout(f,10);},onmessage:null,onerror:null,onclose:null,binaryType:''};return new RW(u);};
 const rf=window.fetch;window.fetch=(u,o)=>/airplanes|opensky|codetabs/.test(''+u)?Promise.resolve(new Response('{\"ac\":[]}',{status:200})):rf(u,o);
});
const sample=async tag=>{try{const d=await p.evaluate(()=>({heap:Math.round(performance.memory.usedJSHeapSize/1048576),task:Math.round(window.__maxTask),els:Store.activeScene()?Store.activeScene().elements.length:0,m3d:Store.models3d().length,ships:window.Tracking?Tracking.Ships.ships.size:0}));console.log(tag,JSON.stringify(d));return d;}catch(e){console.log(tag,'DEAD',(''+e).slice(0,80));process.exit(1);}};
const CYCLES=6;   // ~100s each ≈ 10 min
for(let c=1;c<=CYCLES;c++){
 console.log('---- CYCLE '+c+'/'+CYCLES+' ----');
 // 1) draw all tools programmatically + erase
 await p.evaluate(async()=>{const m=GameMap.map,LL=a=>L.latLng(a[0],a[1]);
  const drag=(t,a,b)=>{Draw.setTool(t);m.fire('mousedown',{latlng:LL(a)});m.fire('mousemove',{latlng:LL(b)});m.fire('mouseup',{latlng:LL(b)});};
  ['arrow','curve','ring','circle','polygon','sketch','measure','frontline','tarrow'].forEach((t,i)=>drag(t,[25+i*.3,52],[25.5+i*.3,54]));
  Draw.setTool('marker');m.fire('click',{latlng:LL([27,55])});
  await new Promise(r=>setTimeout(r,300));Store.clearElements();Draw.setTool('select');});
 // 2) scenes churn
 await p.evaluate(()=>{for(let i=0;i<3;i++)Store.addScene(undefined,{title:'C'+i});Store.nextScene();Store.prevScene();const sc=Store.scenes();while(sc.length>1)Store.removeScene(sc[sc.length-1].id);});
 // 3) models: add 2, route, play briefly, remove
 await p.evaluate(async()=>{const a=MODELS3D_CATALOG[0],b=MODELS3D_CATALOG[5]||MODELS3D_CATALOG[1];
  Store.addModel3d({src:'assets3d/'+a.file,name:'A',lat:25.5,lng:53,scale:4,mode:'both',on:true});
  Store.addModel3d({src:'assets3d/'+b.file,name:'B',lat:26.5,lng:55,scale:4,mode:'both',on:true});
  await new Promise(r=>setTimeout(r,1500));
  const id=Store.models3d()[0].id;Store.updateModel3d(id,{route:{pts:[[25.5,53],[26,54],[26.5,55]],dur:3}});
  ModelsAnim.play(id);await new Promise(r=>setTimeout(r,2000));ModelsAnim.stop(id);});
 // 4) tracking burst: 200 ships x 30 msg/s for 15s + pans
 await p.evaluate(()=>{document.querySelector('[data-qid=ships]').classList.contains('is-on')||document.querySelector('[data-qid=ships]').click();
  window.__seed=window.__seed||Array.from({length:200},(_,i)=>({mmsi:'8'+(100000+i),lat:24.5+Math.random()*4,lng:53.5+Math.random()*4,course:Math.random()*360,speed:8}));
  window.__pump=setInterval(()=>{for(let k=0;k<30;k++){const s=window.__seed[(Math.random()*200)|0];s.lat+=.001;s.course=(s.course+2)%360;
   Tracking.Ships.handle({MetaData:{MMSI:s.mmsi,ShipName:'S'+s.mmsi},Message:{PositionReport:{Latitude:s.lat,Longitude:s.lng,TrueHeading:Math.round(s.course),Sog:s.speed}}});}},1000);});
 for(let i=0;i<3;i++){await sleep(5000);await p.evaluate(()=>GameMap.map.panBy([90,40],{animate:false}));}
 await p.evaluate(()=>{clearInterval(window.__pump);});
 // 5) 3D roundtrip with models + tracking on
 await p.evaluate(()=>Map3D.enter());await sleep(5000);
 await sample('  3D c'+c);
 await p.evaluate(()=>{Store.setThreeD({globe:true});});await sleep(1500);
 await p.evaluate(()=>{Store.setThreeD({globe:false});});await sleep(1000);
 await p.evaluate(()=>Map3D.exit());await sleep(1500);
 // 6) overlays + broadcast churn
 await p.evaluate(async()=>{const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const o=Store.addOverlay({name:'S'+Date.now(),url:PNG,bounds:[[24,52],[27,56]]});
  Store.setBanner({on:true,text:'SOAK'});Store.setTicker({on:true,text:'soak run'});
  await new Promise(r=>setTimeout(r,400));
  Store.setBanner({on:false});Store.setTicker({on:false});Store.removeOverlay(o.id);
  Store.clearModels3d();Store.clearElements();});
 await sample('END c'+c);
}
console.log('SOAK COMPLETE · pageerrors='+errs.length);errs.slice(0,6).forEach(e=>console.log('  ',e));
await browser.close();clearTimeout(HARD);process.exit(0);})();
