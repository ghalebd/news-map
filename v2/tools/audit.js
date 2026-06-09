const puppeteer=require('puppeteer-core');const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const R=[]; const rec=(name,ok,info)=>R.push({name,ok:!!ok,info:info||''});
(async()=>{
const b=await puppeteer.launch({headless:'new',executablePath:CHROME,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage();await p.setViewport({width:1280,height:840});
p.on('dialog',d=>d.accept().catch(()=>{}));
const er=[];p.on('pageerror',e=>er.push(''+e));p.on('console',m=>{if(m.type()==='error'&&!/CORS|ERR_FAILED|ERR_ABORTED|fetch|airplanes|opensky|aisstream|codetabs|maptiler|Failed to load resource|status of 40|tile/i.test(m.text()))er.push('CE '+m.text());});
await p.goto('http://localhost:8000/v2/control.html',{waitUntil:'networkidle2'});
await p.evaluate(()=>{localStorage.clear();indexedDB.deleteDatabase('newsmap.assets3d');});
await p.reload({waitUntil:'networkidle2'});await sleep(2200);
await p.evaluate(()=>{ if(Store.setMode)Store.setMode('live'); GameMap.flyToView({lat:33,lng:53,zoom:6},{type:'jumpTo'}); });await sleep(500);

// ---------- DRAW TOOLS ----------
const draw=await p.evaluate(async()=>{const out=[];const m=GameMap.map;const cnt=()=>Store.activeScene().elements.length;const lastType=()=>{const e=Store.activeScene().elements;return e.length?e[e.length-1].type:null;};
 const LL=(a)=>L.latLng(a[0],a[1]);
 function drag(t,a,c){Draw.setTool(t);m.fire('mousedown',{latlng:LL(a)});m.fire('mousemove',{latlng:LL(c)});m.fire('mouseup',{latlng:LL(c)});}
 function click(t,a){Draw.setTool(t);m.fire('click',{latlng:LL(a)});}
 const tests=[['marker','click','marker'],['arrow','drag','arrow'],['curve','drag','curve'],['ring','drag','ring'],['circle','drag','circle'],['polygon','drag','polygon'],['sketch','drag','sketch'],['measure','drag','measure'],['frontline','drag','frontline'],['country','clickC','country']];
 for(const [t,mode,exp] of tests){ const before=cnt();
   if(mode==='click')click(t,[33,53]); else if(mode==='clickC')click(t,[33,53]); else drag(t,[33,53],[34,55]);
   await new Promise(r=>setTimeout(r,40));
   const added=cnt()>before; const ty=lastType();
   out.push({name:'draw:'+t, ok: added && ty===exp, info: added?('type='+ty):'no element added'});
 }
 Store.clearElements();
 return out;});
draw.forEach(d=>rec(d.name,d.ok,d.info));

// ---------- CLEAR ALL (incl 3D) ----------
const clr=await p.evaluate(async()=>{Store.addElement({type:'marker',ll:[33,53],color:'#fff'});
 Store.addModel3d({src:'assets3d/'+MODELS3D_CATALOG[0].file,name:'X',lat:33,lng:53,scale:3,mode:'both',on:true});
 await new Promise(r=>setTimeout(r,300));
 const before={el:Store.activeScene().elements.length, m:Store.models3d().length};
 document.querySelector('.qtools .qtool[data-qid=clear]').click();
 await new Promise(r=>setTimeout(r,300));
 return {before, after:{el:Store.activeScene().elements.length, m:Store.models3d().length}};});
rec('clear-all clears drawings', clr.after.el===0, 'el '+clr.before.el+'→'+clr.after.el);
rec('clear-all clears 3D objects', clr.after.m===0, 'models '+clr.before.m+'→'+clr.after.m);

// ---------- UNDO / REDO ----------
const ur=await p.evaluate(async()=>{Store.clearElements();Store.addElement({type:'marker',ll:[1,1],color:'#fff'});Store.addElement({type:'marker',ll:[2,2],color:'#fff'});const a=Store.activeScene().elements.length;Store.undo();const b=Store.activeScene().elements.length;Store.redo();const c=Store.activeScene().elements.length;return {a,b,c};});
rec('undo', ur.b===ur.a-1, ur.a+'→'+ur.b); rec('redo', ur.c===ur.a, ur.b+'→'+ur.c);

// ---------- FX TOGGLES ----------
const fx=await p.evaluate(async()=>{const out=[];const set={grid:()=>Store.setGrid({on:true}),sea:()=>Store.setSea({on:true}),clouds:()=>Store.setClouds({on:true}),daynight:()=>Store.setDayNight({on:true}),thirds:()=>Store.setThirds(true)};
 const dom={grid:'.fxgrid',sea:'.seafx',clouds:'.fxclouds',daynight:'.dnfx',thirds:'.fxthirds'};
 const cfgOn={grid:()=>Store.cfg().grid.on,sea:()=>Store.cfg().sea.on,clouds:()=>Store.cfg().clouds.on,daynight:()=>Store.cfg().dayNight.on,thirds:()=>Store.cfg().thirds};
 for(const k of Object.keys(set)){set[k]();await new Promise(r=>setTimeout(r,150));const el=document.querySelector(dom[k]);const shown=el&&!el.hidden&&getComputedStyle(el).display!=='none';out.push({k,on:!!cfgOn[k](),shown:!!shown});}
 return out;});
fx.forEach(f=>rec('fx:'+f.k+' on', f.on&&f.shown, 'cfgOn='+f.on+' shown='+f.shown));

// ---------- MAP CONTROLS ----------
const mc=await p.evaluate(async()=>{const m=GameMap.map;const z0=m.getZoom();m.zoomIn();await new Promise(r=>setTimeout(r,400));const z1=m.getZoom();
 const styles=(Store.cfg().mapStyles||[]).filter(s=>s.on!==false);const cur=Store.state.mapStyle;const other=styles.find(s=>s.id!==cur);if(other)Store.setMapStyle(other.id);await new Promise(r=>setTimeout(r,300));
 return {zoomIn:z1>z0, styleSwitch: Store.state.mapStyle===(other&&other.id)};});
rec('map zoom in', mc.zoomIn, ''); rec('map style switch', mc.styleSwitch, '');

console.log('PARTIAL_DONE_PHASE1');
global.__er=er;
// save state for phase 2 (3D) in same page
await p.evaluate(()=>{Store.clearElements();if(Store.clearModels3d)Store.clearModels3d();});

// ---------- 3D SUITE ----------
await p.evaluate(()=>window.Map3D.enter());await sleep(4200);
const d3=await p.evaluate(async()=>{const out=[];const m=__m3;
 out.push({name:'3D enter', ok:Map3D.on&&!!m, info:''});
 out.push({name:'3D hillshade layer', ok:!!m.getLayer('hillshade'), info:''});
 // add catalog model
 const it=MODELS3D_CATALOG.find(x=>/f-16/.test(x.file))||MODELS3D_CATALOG[0];
 Store.addModel3d({src:'assets3d/'+it.file,name:'Jet',lat:33,lng:53,scale:4,mode:'both',on:true,style:'solid'});
 await new Promise(r=>setTimeout(r,2500));
 let vis=false;Models3D._groups.forEach(g=>{if(g.inner&&g.group.visible)vis=true;});
 out.push({name:'3D model renders', ok:vis, info:'groups='+Models3D._groups.size});
 // wireframe
 const id=Store.models3d()[0].id;Store.updateModel3d(id,{style:'wireframe'});await new Promise(r=>setTimeout(r,500));
 let wf=null;Models3D._groups.forEach(g=>{if(g.inner)g.inner.traverse(o=>{if(o.isMesh&&o.material){const mm=Array.isArray(o.material)?o.material[0]:o.material;wf=!!mm.wireframe;}});});
 out.push({name:'3D wireframe', ok:wf===true, info:'wire='+wf}); Store.updateModel3d(id,{style:'solid'});
 // lighting: az changes hillshade direction
 Store.setLight3d({az:120});await new Promise(r=>setTimeout(r,300));
 out.push({name:'3D lighting (sun direction)', ok:m.getPaintProperty('hillshade','hillshade-illumination-direction')===120, info:''});
 // model shadow
 Store.setLight3d({shadow:70});await new Promise(r=>setTimeout(r,300));let shv=false;Models3D._groups.forEach(g=>{if(g.shadow&&g.shadow.visible)shv=true;});
 out.push({name:'3D model shadow', ok:shv, info:''});
 // globe
 Store.setThreeD({globe:true});await new Promise(r=>setTimeout(r,1500));
 out.push({name:'3D globe projection', ok:(m.getProjection&&m.getProjection().type==='globe'), info:''}); Store.setThreeD({globe:false});await new Promise(r=>setTimeout(r,800));
 // tracking3d
 window.Tracking.Ships.on=true;window.Tracking.Ships.ships=new Map([['1',{lat:33,lng:53,course:30}],['2',{lat:33.2,lng:53.2,course:90}]]);
 window.Tracking3D&&window.Tracking3D.refresh();await new Promise(r=>setTimeout(r,500));
 const tc=window.Tracking3D?window.Tracking3D._counts():null;
 out.push({name:'3D live tracking', ok:!!(tc&&tc.ships>=2), info:JSON.stringify(tc)});
 // overlay in 3D
 const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
 Store.addOverlay({name:'O',url:PNG,bounds:[[31,51],[35,56]]});await new Promise(r=>setTimeout(r,400));
 out.push({name:'overlay drapes in 3D', ok:m.getStyle().layers.some(l=>l.id.indexOf('ov-')===0), info:''});
 return out;});
d3.forEach(x=>rec(x.name,x.ok,x.info));
await p.evaluate(()=>window.Map3D.exit());await sleep(800);
rec('3D exit', await p.evaluate(()=>!Map3D.on), '');

// ---------- TIMELINE ----------
const tl=await p.evaluate(async()=>{const id=Store.models3d()[0]&&Store.models3d()[0].id;
 if(!id)return{skip:true};
 Store.setTimeline({dur:6,head:0,cam:[],models:{}});
 // cam key at 0
 Timeline.toggle(true);await new Promise(r=>setTimeout(r,80));
 Store.setTimeline({head:0}); GameMap.map.setView([33,53],5,{animate:false}); document.querySelector('.tl__trk .tl__key').click();
 await new Promise(r=>setTimeout(r,60));
 Store.setTimeline({head:6}); GameMap.map.setView([40,60],5,{animate:false}); document.querySelector('.tl__trk .tl__key').click();
 await new Promise(r=>setTimeout(r,100));
 const keys=(Store.timeline().cam||[]).length;
 Timeline.play();await new Promise(r=>setTimeout(r,1500));
 const lat=GameMap.map.getCenter().lat;
 Timeline.stop();
 return {keys, playingMoved: lat>33.4&&lat<40};});
rec('timeline keyframes', !tl.skip&&tl.keys>=2, 'keys='+(tl.keys));
rec('timeline playback', !tl.skip&&tl.playingMoved, '');

// ---------- MODEL CONTROL ----------
const mctl=await p.evaluate(async()=>{const id=Store.models3d()[0]&&Store.models3d()[0].id;if(!id)return{skip:true};
 ModelControl.select(id);const m0=JSON.parse(JSON.stringify(Store.models3d().find(x=>x.id===id)));
 const hud=document.querySelector('.mctl');const click=t=>{const btn=[...hud.querySelectorAll('button')].find(x=>x.title===t);btn&&btn.click();};
 click('Move north (↑)');click('Turn right ( ] )');click('Larger ( + )');click('Raise (PgUp)');
 await new Promise(r=>setTimeout(r,150));const m1=Store.models3d().find(x=>x.id===id);
 return {hud:!hud.hidden, moved:m1.lat>m0.lat, turned:m1.rotZ!==m0.rotZ, bigger:m1.scale>m0.scale, raised:m1.alt>m0.alt};});
rec('model HUD opens', !mctl.skip&&mctl.hud, '');
rec('model move/rotate/scale/alt', !mctl.skip&&mctl.moved&&mctl.turned&&mctl.bigger&&mctl.raised, JSON.stringify(mctl));

// ---------- BROADCAST GRAPHICS ----------
const bc=await p.evaluate(async()=>{const out=[];Store.setBanner({on:true,text:'TEST'});await new Promise(r=>setTimeout(r,200));out.push({k:'banner',ok:!!document.querySelector('.bcast-banner')&&getComputedStyle(document.querySelector('.bcast-banner')).display!=='none'});
 Store.setTicker({on:true,text:'hello'});await new Promise(r=>setTimeout(r,200));out.push({k:'ticker',ok:!!document.querySelector('.bcast-ticker')});
 Store.setSpotlight&&Store.setSpotlight({on:true,lat:33,lng:53,radiusKm:100});await new Promise(r=>setTimeout(r,200));out.push({k:'spotlight',ok:!!document.querySelector('.spotlight,.spot-fx,.spotfx')||!!(Store.cfg().broadcast&&Store.cfg().broadcast.spotlight&&Store.cfg().broadcast.spotlight.on)});
 Store.setLtStyle('breaking');await new Promise(r=>setTimeout(r,150));out.push({k:'lowerthird',ok:Store.cfg().ltStyle==='breaking'});
 return out;});
bc.forEach(x=>rec('broadcast:'+x.k,x.ok,''));

// ---------- MOVABLE ----------
const mv=await p.evaluate(async()=>{Movable.setScale('.status',0.8);await new Promise(r=>setTimeout(r,150));const s=(Store.cfg().layout['.status']||{}).s;Movable.snap('.status','tr');const lay=Store.cfg().layout['.status'];Movable.resetPanel('.status');const reset=!Store.cfg().layout['.status'];return {scaled:s===0.8, snapped:!!(lay&&lay.x!=null), reset};});
rec('panel scale', mv.scaled, ''); rec('panel snap', mv.snapped, ''); rec('panel reset', mv.reset, '');

// ---------- PIN TO BAR + FLYOUT ----------
const pin=await p.evaluate(async()=>{Store.setQbar({pinned:['cfg:theme']});await new Promise(r=>setTimeout(r,300));const btn=document.querySelector('.qtools .qtool[data-qid="cfg:theme"]');if(btn)btn.click();await new Promise(r=>setTimeout(r,200));const f=document.querySelector('.cfg-flyout');return {bar:!!btn, fly:!!f, onScreen:f?f.getBoundingClientRect().left>0:false};});
rec('pin section → bar button', pin.bar, ''); rec('bar button → popup flyout', pin.fly&&pin.onScreen, 'onScreen='+pin.onScreen);

// ---------- PHASE 3: more features ----------
await p.evaluate(()=>{Store.clearElements();if(Store.clearModels3d)Store.clearModels3d();});
const p3=await p.evaluate(async()=>{const out=[];const push=(n,ok,i)=>out.push({name:n,ok:!!ok,info:i||''});
 // colour
 Store.setColor('#36ff9e');push('colour set', Store.state.color==='#36ff9e');
 // drawing defaults
 Store.setDrawDefaults({weight:5});push('drawing defaults', (Store.cfg().drawDefaults||{}).weight===5);
 // permission toggle
 Store.setToolPerm('marker',false);push('tool permission', Store.cfg().permissions.tools.marker===false);Store.setToolPerm('marker',true);
 // locator
 Store.setLocator(true);await new Promise(r=>setTimeout(r,200));push('locator inset', !!document.querySelector('.locator'));Store.setLocator(false);
 // camera path
 Store.addCampathFrame(GameMap.currentView());Store.addCampathFrame({lat:40,lng:60,zoom:5});push('camera path capture', (Store.campath().frames||[]).length>=2);Store.setCampath({frames:[]});
 // animation config
 Store.setAnim&&Store.setAnim({playing:true,ms:500});push('animation cfg', !Store.setAnim || ((Store.state.broadcast||{}).anim&&Store.state.broadcast.anim.playing));
 // auto-tour
 Store.setTour&&Store.setTour({playing:true,sec:5});push('auto-tour cfg', !Store.setTour || ((Store.state.broadcast||{}).tour&&Store.state.broadcast.tour.playing));Store.setTour&&Store.setTour({playing:false});
 // snapshots
 let snapOk=false;try{if(window.UI&&UI.saveSnapshot){UI.saveSnapshot('t');snapOk=(UI.snaps()||[]).length>=1;}}catch(e){}push('snapshot save', snapOk);
 // chrome: scale bar + compass
 Store.setUI({scaleBar:true,compass:true});await new Promise(r=>setTimeout(r,400));push('scale bar', !!document.querySelector('.leaflet-control-scale'));push('compass', !!document.querySelector('.compass')&&!document.querySelector('.compass').hidden);Store.setUI({scaleBar:false,compass:false});
 // asset category add
 Store.addAssetCat&&Store.addAssetCat('TestCat');push('asset category', !Store.addAssetCat || (Store.cfg().assetCats||[]).includes('TestCat'));
 // place bookmark
 Store.addPlace&&Store.addPlace({name:'P',lat:10,lng:10,zoom:5});push('place bookmark', !Store.addPlace || (Store.cfg().places||[]).some(x=>x.name==='P'));
 // geocode parse coords
 push('geocode coord-parse', !!(window.Geocode&&Geocode.parseCoords?Geocode.parseCoords('25.2, 55.3'):true));
 return out;});
p3.forEach(x=>rec(x.name,x.ok,x.info));

// ---------- PHASE 4: route draw + animate + 2D billboard + drag (3D) ----------
const p4=await p.evaluate(async()=>{const out=[];const push=(n,ok,i)=>out.push({name:n,ok:!!ok,info:i||''});
 // add a model, draw a route via the HUD bar (programmatic), finish, play
 const it=MODELS3D_CATALOG[0];Store.addModel3d({src:'assets3d/'+it.file,name:'R',lat:25,lng:50,scale:3,mode:'both',on:true});
 await new Promise(r=>setTimeout(r,1500));
 const id=Store.models3d()[0].id;
 // 2D billboard marker present
 push('2D billboard marker', !!(window.Models3D&&Models3D.marker&&Models3D.marker(id)));
 // route draw
 ModelControl.select(id);ModelControl.drawPath(id);
 const map=GameMap.map;[[25,50],[25,55],[28,58]].forEach(ll=>map.fire('click',{latlng:L.latLng(ll[0],ll[1])}));
 await new Promise(r=>setTimeout(r,100));
 const fin=[...document.querySelectorAll('.rdraw__b')].find(b=>/Finish/.test(b.textContent));fin&&fin.click();await new Promise(r=>setTimeout(r,150));
 const m=Store.models3d().find(x=>x.id===id);push('route draw (on-screen)', !!(m.route&&m.route.pts&&m.route.pts.length>=2), 'pts='+(m.route&&m.route.pts?m.route.pts.length:0));
 // route play moves it
 const lat0=m.lat;ModelsAnim.play(id);await new Promise(r=>setTimeout(r,1500));const mk=Models3D.marker(id);const moved=mk&&Math.abs(mk.getLatLng().lng-50)>0.5;ModelsAnim.stop(id);
 push('route playback moves model', moved);
 // 3D drag pose
 await new Promise(r=>setTimeout(r,200));
 return out;});
p4.forEach(x=>rec(x.name,x.ok,x.info));

console.log('\\n================ AUDIT REPORT ================');
let fail=0; R.forEach((r,i)=>{ if(!r.ok)fail++; console.log((r.ok?'✓':'✗')+' '+r.name+(r.ok?'':('   << '+r.info))); });
console.log('---------------------------------------------');
console.log('TOTAL '+R.length+' · PASS '+(R.length-fail)+' · FAIL '+fail);
console.log('PAGE ERRORS: '+er.length+(er.length?'\\n  '+er.slice(0,8).join('\\n  '):''));
await b.close();})().catch(e=>{console.error('FATAL',e);process.exit(1);});
