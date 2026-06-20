// stress.js — synthetic AIS message-storm soak (SAFE: hard watchdog + capped duration)
const puppeteer=require('puppeteer-core');
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const HARD_EXIT=setTimeout(()=>{console.log('WATCHDOG: hard exit');process.exit(2);},150000);
let browser=null;
process.on('exit',()=>{try{browser&&browser.process()&&browser.process().kill('SIGKILL');}catch(e){}});
(async()=>{
browser=await puppeteer.launch({headless:'new',executablePath:CHROME,
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--js-flags=--max-old-space-size=900']});
const p=await browser.newPage();await p.setViewport({width:1280,height:840});
p.on('error',e=>console.log('PAGE CRASHED:',''+e));
p.on('pageerror',e=>console.log('PAGEERR:',(''+e).slice(0,150)));
await p.goto('http://localhost:8000/v2/control.html?nosync',{waitUntil:'networkidle2'});
await sleep(2000);
await p.evaluate(()=>{
 GameMap.map.setView([26.5,56.0],7,{animate:false});
 [...document.querySelectorAll('.modesw__btn')].find(x=>x.dataset.mode==='live').click();
 // long-task observer
 window.__longTasks=[];window.__maxTask=0;
 new PerformanceObserver(l=>{l.getEntries().forEach(e=>{window.__longTasks.push(e.duration);if(e.duration>window.__maxTask)window.__maxTask=e.duration;});}).observe({entryTypes:['longtask']});
 // turn tracking layers ON but block real sockets: stub WebSocket + fetch for tracking endpoints
 const RealWS=window.WebSocket;
 window.WebSocket=function(u){if(/aisstream/.test(u)){return {readyState:1,send(){},close(){},set onopen(f){setTimeout(f,10);},onmessage:null,onerror:null,onclose:null,binaryType:''};}return new RealWS(u);};
 const rf=window.fetch;window.fetch=(u,o)=>{if(/airplanes|opensky|codetabs/.test(''+u))return Promise.resolve(new Response(JSON.stringify({ac:[]}),{status:200}));return rf(u,o);};
 document.querySelector('[data-qid=ships]').click();
 document.querySelector('[data-qid=flights]').click();
});
await sleep(800);
// seed 400 ships (half with destinations near Jebel Ali) + simulate message storm
await p.evaluate(()=>{
 window.__seed=[];
 for(let i=0;i<400;i++){const lat=24.5+Math.random()*4,lng=53.5+Math.random()*4.5;
  window.__seed.push({mmsi:'9'+String(100000+i),lat,lng,course:Math.random()*360,speed:5+Math.random()*15,name:'TEST '+i,dest:i%2?'JEBEL ALI':''});}
 window.__pump=setInterval(()=>{
  for(let k=0;k<50;k++){const s=window.__seed[(Math.random()*window.__seed.length)|0];
   s.lat+=(Math.random()-0.5)*0.002;s.lng+=(Math.random()-0.5)*0.002;s.course=(s.course+(Math.random()-0.5)*4+360)%360;
   Tracking.Ships.handle({MetaData:{MMSI:s.mmsi,ShipName:s.name},Message:{PositionReport:{Latitude:s.lat,Longitude:s.lng,TrueHeading:Math.round(s.course),Cog:s.course,Sog:s.speed}}});
   if(s.dest&&Math.random()<0.02)Tracking.Ships.handle({MetaData:{MMSI:s.mmsi},Message:{ShipStaticData:{Destination:s.dest,Name:s.name}}});
  }},1000);
});
console.log('storm running: 400 ships, ~50 msg/s, panning every 5s, 60s total');
for(let t=5;t<=60;t+=5){
 await sleep(5000);
 try{
  if(t%10===5)await p.evaluate(()=>GameMap.map.panBy([120,60],{animate:false}));
  const d=await p.evaluate(()=>({ships:Tracking.Ships.ships.size,
   heapMB:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):-1,
   maxTaskMs:Math.round(window.__maxTask),tasks:window.__longTasks.length,
   routes:Tracking.Ships.route?Tracking.Ships.route.getLayers().length:0}));
  console.log('t='+t+'s',JSON.stringify(d));
  if(t===30)await p.evaluate(()=>{window.__maxTask=0;window.__longTasks=[];});// reset for steady-state window
 }catch(e){console.log('t='+t+'s PAGE DEAD:',(''+e).slice(0,90));process.exit(1);}
}
// 3D phase: enter 3D with the storm still running
console.log('-- entering 3D under load --');
try{
 await p.evaluate(()=>Map3D.enter());await sleep(6000);
 const d3=await p.evaluate(()=>({on:Map3D.on,counts:Tracking3D._counts(),heapMB:Math.round(performance.memory.usedJSHeapSize/1048576),maxTaskMs:Math.round(window.__maxTask)}));
 console.log('3D under storm:',JSON.stringify(d3));
 await p.screenshot({path:'/tmp/v2_3d_storm.png'});
 await sleep(8000);
 const d3b=await p.evaluate(()=>({counts:Tracking3D._counts(),heapMB:Math.round(performance.memory.usedJSHeapSize/1048576),alive:true}));
 console.log('3D +8s:',JSON.stringify(d3b));
}catch(e){console.log('3D PHASE DEAD:',(''+e).slice(0,120));process.exit(1);}
await p.evaluate(()=>clearInterval(window.__pump));
console.log('RESULT: SURVIVED 60s storm + 3D');
await browser.close();clearTimeout(HARD_EXIT);process.exit(0);})();
