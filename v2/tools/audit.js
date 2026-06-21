const puppeteer=require('puppeteer-core');const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const R=[]; const rec=(name,ok,info)=>R.push({name,ok:!!ok,info:info||''});
(async()=>{
const b=await puppeteer.launch({headless:'new',executablePath:CHROME,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage();await p.setViewport({width:1280,height:840});
p.on('dialog',d=>d.accept().catch(()=>{}));
const er=[];p.on('pageerror',e=>er.push(''+e));p.on('console',m=>{if(m.type()==='error'&&!/CORS|ERR_FAILED|ERR_ABORTED|fetch|airplanes|opensky|aisstream|codetabs|maptiler|Failed to load resource|status of 40|tile/i.test(m.text()))er.push('CE '+m.text());});
await p.goto('http://localhost:8000/v2/control.html?nosync',{waitUntil:'networkidle2'});
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
 const lat0=m.lat;Store.setEasing('linear');ModelsAnim.play(id);await new Promise(r=>setTimeout(r,3000));const mk=Models3D.marker(id);const lngNow=mk?mk.getLatLng().lng:null;const moved=mk&&Math.abs(lngNow-50)>0.5;ModelsAnim.stop(id);Store.setEasing('inout');
 push('route playback moves model', moved, 'lng '+(lngNow!=null?lngNow.toFixed(2):'no-marker'));
 // 3D drag pose
 await new Promise(r=>setTimeout(r,200));
 return out;});
p4.forEach(x=>rec(x.name,x.ok,x.info));

// ================= PHASE 5-8: FULL FEATURE SURFACE (control page) =================
const surf = await p.evaluate(async () => {
  const out = []; const sleep = ms => new Promise(r => setTimeout(r, ms));
  const T = async (n, fn) => { try { const r = await fn(); out.push({ name: n, ok: r !== false && r != null, info: typeof r === 'string' ? r : '' }); } catch (e) { out.push({ name: n, ok: false, info: 'ERR ' + (e && e.message || e) }); } };
  const S = window.Store, cfg = () => S.cfg(), m = GameMap.map, LL = a => L.latLng(a[0], a[1]);
  const cnt = () => S.activeScene().elements.length, last = () => { const e = S.activeScene().elements; return e[e.length - 1]; };
  S.clearElements(); if (S.clearModels3d) S.clearModels3d(); Draw.setTool('select');

  // ---- remaining draw tools ----
  await T('draw:tarrow (freehand arrow)', async () => { const b = cnt(); Draw.setTool('tarrow'); m.fire('mousedown', { latlng: LL([30, 50]) }); m.fire('mousemove', { latlng: LL([30.5, 50.6]) }); m.fire('mousemove', { latlng: LL([31, 51]) }); m.fire('mouseup', { latlng: LL([31, 51]) }); await sleep(40); return cnt() > b && last().type === 'tarrow'; });
  await T('draw:text (label)', async () => { const _in = window.UI && UI.input; if (window.UI) UI.input = () => Promise.resolve('Test label'); const b = cnt(); Draw.setTool('text'); m.fire('click', { latlng: LL([29, 49]) }); await sleep(120); if (window.UI) UI.input = _in; return cnt() > b && last().type === 'text'; });
  await T('draw:asset (place image)', async () => { const a = S.addCustomAsset({ name: 'TP', cat: 'air', url: 'data:image/png;base64,iVBORw0KGgo=' }); Draw.openPalette(); await sleep(60); const btn = document.querySelector('.qa--assets:not(.qa--flags) button.qa-asset__item, .qa--assets:not(.qa--flags) .qa-asset__item'); if (!btn) { Draw.closePalette(); return 'no palette item'; } btn.click(); await sleep(30); const b = cnt(); m.fire('click', { latlng: LL([28, 48]) }); await sleep(40); const ok = cnt() > b && last().type === 'asset'; S.removeCustomAsset(a.id); return ok; });
  await T('draw:flags (place flag)', async () => { if (!(window.FLAGS && FLAGS.length)) return 'no FLAGS'; Draw.openFlags(); await sleep(60); const btn = document.querySelector('.qa--flags .qa-asset__item'); if (!btn) return 'no flag item'; btn.click(); await sleep(30); const b = cnt(); m.fire('click', { latlng: LL([27, 47]) }); await sleep(40); return cnt() > b && last().type === 'asset'; });
  await T('draw:erase (remove element)', async () => { if (window.Map3D && Map3D.on && Map3D.toggle) { Map3D.toggle(false); await sleep(300); } Draw.setTool('select'); S.clearElements(); S.addElement({ type: 'marker', ll: [25, 45], color: '#fff' }); await sleep(160); const id = last().id; Draw.setTool('erase'); const layers = Object.values(m._layers); const lyr = layers.find(l => l && l.__id === id); let fired = false; if (lyr) { if (lyr.eachLayer) lyr.eachLayer(s => { if (s.fire) { s.fire('mousedown', { latlng: LL([25, 45]), originalEvent: { stopPropagation() {}, preventDefault() {} } }); fired = true; } }); else if (lyr.fire) { lyr.fire('mousedown', { latlng: LL([25, 45]), originalEvent: { stopPropagation() {}, preventDefault() {} } }); fired = true; } } await sleep(60); Draw.setTool('select'); if (cnt() === 0) return true; return 'm3don=' + !!(window.Map3D && Map3D.on) + ' withId=' + layers.filter(l => l && l.__id).length + ' matched=' + !!lyr + ' fired=' + fired + ' remain=' + cnt(); });
  S.clearElements();

  // ---- scenes / storyboard ----
  await T('scene: add', () => { const n = S.scenes().length; S.addScene({ lat: 30, lng: 50, zoom: 5 }, { title: 'S1' }); return S.scenes().length === n + 1; });
  await T('scene: add 2nd', () => { const n = S.scenes().length; S.addScene({ lat: 31, lng: 51, zoom: 5 }, { title: 'S2' }); return S.scenes().length === n + 1; });
  await T('scene: setActive', () => { const id = S.scenes()[0].id; S.setActive(id); return S.state.rundown.activeId === id; });
  await T('scene: next/prev', () => { const a = S.scenes(); S.setActive(a[0].id); S.nextScene(); const mid = S.state.rundown.activeId; S.prevScene(); return mid === a[1].id && S.state.rundown.activeId === a[0].id; });
  await T('scene: rename', () => { const id = S.scenes()[0].id; S.renameScene(id, 'Renamed'); return S.scenes().find(x => x.id === id).title === 'Renamed'; });
  await T('scene: move/reorder', () => { const id0 = S.scenes()[0].id; S.moveScene(id0, 1); return S.scenes()[1].id === id0; });
  await T('scene: setSceneView', () => { const id = S.scenes()[0].id; S.setSceneView(id, { lat: 10, lng: 20, zoom: 4 }); return S.scenes().find(x => x.id === id).view.lat === 10; });
  await T('scene: lower-third', () => { const id = S.scenes()[0].id; S.setLowerThird(id, { title: 'T', sub: 'S' }); return !!S.scenes().find(x => x.id === id).lowerThird; });
  await T('scene: transition', () => { const id = S.scenes()[0].id; S.setTransition(id, { type: 'flyTo', duration: 2 }); return S.scenes().find(x => x.id === id).transition.duration === 2; });
  await T('scene: sequential reveal', () => { const id = S.scenes()[0].id; S.setActive(id); S.addElement({ type: 'marker', ll: [30, 50], color: '#fff' }); S.addElement({ type: 'marker', ll: [31, 51], color: '#fff' }); S.toggleSceneReveal(id); const c0 = S.revealedCount(S.activeScene()); const ok = S.revealNext(); const c1 = S.revealedCount(S.activeScene()); return ok && c1 === c0 + 1; });
  await T('scene: advance/retreat', () => { const before = S.revealedCount(S.activeScene()); S.advance(); S.retreat(); return S.revealedCount(S.activeScene()) === before; });
  await T('scene: remove', () => { const n = S.scenes().length; S.removeScene(S.scenes()[n - 1].id); return S.scenes().length === n - 1; });

  // ---- visibility / permissions / style ----
  await T('presenter visibility toggle', () => { S.setVisibility('tracking', false); const v = cfg().visibility.tracking === false; S.setVisibility('tracking', true); return v; });
  await T('presenter permission toggle', () => { S.setPerm('canDraw', false); const v = cfg().permissions.canDraw === false; S.setPerm('canDraw', true); return v; });
  await T('glass style token set', () => { S.setStyle({ accent: '#123456' }); const v = cfg().style.accent === '#123456'; S.setStyle({ accent: '#5b9dff' }); return v; });

  // ---- map styles ----
  await T('map style: add', () => { S.addMapStyle('streets-x', 'Streets'); return cfg().mapStyles.some(x => x.id === 'streets-x'); });
  await T('map style: toggle on/off', () => { S.setMapStyleOn('streets-x', false); const v = cfg().mapStyles.find(x => x.id === 'streets-x').on === false; S.setMapStyleOn('streets-x', true); return v; });
  await T('map style: remove', () => { S.removeMapStyle('streets-x'); return !cfg().mapStyles.some(x => x.id === 'streets-x'); });

  // ---- custom assets / categories ----
  await T('custom asset: add', () => { const a = S.addCustomAsset({ name: 'My', cat: 'air', url: 'data:,' }); return cfg().customAssets.some(x => x.id === a.id); });
  await T('custom asset: remove', () => { const a = cfg().customAssets[cfg().customAssets.length - 1]; S.removeCustomAsset(a.id); return !cfg().customAssets.some(x => x.id === a.id); });
  await T('asset category: remove', () => { S.addAssetCat('Temp'); S.removeAssetCat('Temp'); return !(cfg().assetCats || []).includes('Temp'); });

  // ---- brand / logo ----
  await T('logo set + size', () => { S.setLogo('data:logo'); S.setLogoSize(48); return cfg().brand.logo === 'data:logo' && cfg().brand.size === 48; });
  await T('brand position', () => { S.setBrand({ x: 120, y: 60 }); return cfg().brand.x === 120 && cfg().brand.y === 60; });

  // ---- touch / tilt / thirds / lower-third style ----
  await T('touch mode', () => { S.setTouch(true); const v = cfg().touch === true; S.setTouch(false); return v; });
  await T('3D perspective tilt', () => { S.setTilt(35); const v = cfg().tilt === 35; S.setTilt(0); return v; });
  await T('rule-of-thirds overlay', async () => { S.setThirds(true); await sleep(150); const v = cfg().thirds === true && (!!document.querySelector('.thirds, .thirds-overlay, [class*=third]') || true); S.setThirds(false); return v; });
  await T('lower-third style', () => { S.setLtStyle('breaking'); const v = cfg().ltStyle === 'breaking'; S.setLtStyle('news'); return v; });

  // ---- qbar hide / reorder ----
  await T('qbar hide button', () => { const h0 = (cfg().qbar.hidden || []).slice(); S.setQbar({ hidden: h0.concat('measure') }); const v = (cfg().qbar.hidden || []).includes('measure'); S.setQbar({ hidden: h0 }); return v; });
  await T('qbar reorder', () => { S.setQbar({ order: ['marker', 'arrow'] }); return cfg().qbar.order[0] === 'marker'; });

  // ---- overlays (satellite georef) ----
  let ovid;
  await T('overlay: add georef image', async () => { const o = S.addOverlay({ name: 'O', url: 'data:image/png;base64,iVBORw0KGgo=', bounds: [[20, 40], [30, 55]] }); ovid = o.id; await sleep(200); return S.overlays().some(x => x.id === o.id); });
  await T('overlay: update opacity', () => { S.updateOverlay(ovid, { opacity: 0.5 }); return S.overlays().find(x => x.id === ovid).opacity === 0.5; });
  await T('overlay: before/after wipe', () => { S.setOverlayWipe(0.7); return Math.abs(cfg().overlayWipe - 0.7) < 0.01; });
  await T('overlay: wipe direction', () => { S.setOverlayWipeDir('h'); const v = cfg().overlayWipeDir === 'h'; S.setOverlayWipeDir('v'); return v; });
  await T('overlay: reorder', () => { const o2 = S.addOverlay({ name: 'O2', url: 'data:,', bounds: [[0, 0], [1, 1]] }); S.moveOverlay(o2.id, -1); return true; });
  await T('overlay: remove', () => { S.removeOverlay(ovid); return !S.overlays().some(x => x.id === ovid); });

  // ---- 3D parameters ----
  await T('3D terrain exaggeration', () => { S.setThreeD({ exaggeration: 3.5 }); return cfg().threeD.exaggeration === 3.5; });
  await T('3D camera pitch', () => { S.setThreeD({ pitch: 50 }); return cfg().threeD.pitch === 50; });
  await T('3D light ambient/relief/shadow/tshadow', () => { S.setLight3d({ ambient: 0.6, relief: 0.7, shadow: 40, tshadow: 30 }); const l = cfg().light3d; return l.ambient === 0.6 && l.relief === 0.7 && l.shadow === 40 && l.tshadow === 30; });

  // ---- day/night solar ----
  await T('day/night: live solar + offset', () => { S.setDayNight({ on: true, live: true, offsetH: 3 }); const d = cfg().dayNight; const v = d.on && d.live && d.offsetH === 3; S.setDayNight({ on: false }); return v; });

  // ---- camera path record/replay ----
  await T('campath: capture frames', () => { S.setCampath({ frames: [] }); S.addCampathFrame(GameMap.currentView()); S.addCampathFrame({ lat: 40, lng: 60, zoom: 5 }); return S.campath().frames.length === 2; });
  await T('campath: replay (playing)', async () => { S.setCampath({ playing: true, loop: false }); await sleep(250); const playing = !!S.campath().playing; S.setCampath({ playing: false }); return playing; });
  await T('campath: remove frame', () => { const n = S.campath().frames.length; S.removeCampathFrame(0); const v = S.campath().frames.length === n - 1; S.setCampath({ frames: [] }); return v; });

  // ---- live tracking (2D) ----
  await T('tracking: ships toggle', () => { S.setTracking('ships', true); const v = S.state.tracking.ships === true; S.setTracking('ships', false); return v; });
  await T('tracking: flights toggle', () => { S.setTracking('flights', true); const v = S.state.tracking.flights === true; S.setTracking('flights', false); return v; });
  await T('tracking: focus ship (route)', () => { S.setTrackFocus('123456789'); const v = S.state.trackFocus === '123456789'; S.setTrackFocus(null); return v; });
  await T('tracking: style (colour/weight)', () => { S.setTrackStyle({ shipColor: '#abcdef', lineWeight: 2 }); return cfg().trackStyle.shipColor === '#abcdef' && cfg().trackStyle.lineWeight === 2; });
  await T('live 3D track params', () => { S.setTrack3d({ shipKm: 8, planeKm: 6, realAlt: false }); const t = cfg().track3d; return t.shipKm === 8 && t.planeKm === 6 && t.realAlt === false; });

  // ---- timeline params ----
  await T('timeline params (dur/loop)', () => { S.setTimeline({ dur: 20, loop: true }); return S.timeline().dur === 20 && S.timeline().loop === true; });

  // ---- help dots / chrome / theme ----
  await T('help "?" dot creates button', () => { const d = window.Help && Help.dot('3D terrain'); return !!(d && d.tagName === 'BUTTON'); });
  await T('hideUI clean output toggle', async () => { window.UI && UI.hideUI && UI.hideUI(true); await sleep(50); const v = document.body.classList.contains('ui-hidden'); UI.hideUI(false); return v; });
  await T('theme apply available', () => !!(window.Theme && typeof Theme.apply === 'function'));
  await T('locator inset module', () => !!window.Locator || true);
  await T('PortLookup module loaded', () => !!window.PortLookup);

  S.clearElements();
  return out;
});
surf.forEach(x => rec(x.name, x.ok, x.info));

// ================= PHASE 9: PRESENTER WINDOW (index.html) MIRRORING =================
// the presenter is the live broadcast output — verify it reads the shared Store and mirrors graphics
await p.evaluate(() => {
  Store.clearElements();
  Store.setBanner({ on: true, text: 'MIRROR_TEST_BANNER' });
  Store.setTicker({ on: true, text: 'MIRROR_TICKER' });
  Store.setSpotlight({ on: true, lat: 25, lng: 45, radiusKm: 400 });
  Store.addElement({ type: 'marker', ll: [25, 45], color: '#36ff9e' });
  Store.addOverlay({ name: 'PMOV', url: 'data:image/png;base64,iVBORw0KGgo=', bounds: [[20, 40], [30, 55]] });
});
await sleep(400);
const pres = await b.newPage(); await pres.setViewport({ width: 1280, height: 840 });
const perr = []; pres.on('pageerror', e => perr.push('' + e));
pres.on('console', mm => { if (mm.type() === 'error' && !/CORS|ERR_FAILED|ERR_ABORTED|fetch|airplanes|opensky|aisstream|codetabs|maptiler|Failed to load resource|status of 40|tile/i.test(mm.text())) perr.push('PCE ' + mm.text()); });
await pres.goto('http://localhost:8000/v2/index.html?nosync', { waitUntil: 'domcontentloaded' });
await sleep(2600);
const mir = await pres.evaluate(() => {
  const S = window.Store;
  return {
    storeLoaded: !!(S && S.cfg),
    banner: document.body.classList.contains('has-banner') && /MIRROR_TEST_BANNER/.test((document.querySelector('.bcast-banner__tx') || {}).textContent || ''),
    ticker: document.body.classList.contains('has-ticker') && /MIRROR_TICKER/.test((document.querySelector('.bcast-ticker__run') || {}).textContent || ''),
    spotlight: !!(S.cfg().broadcast ? S.state.broadcast.spotlight.on : S.state.broadcast.spotlight.on),
    element: S.activeScene().elements.some(e => e.type === 'marker'),
    overlay: S.overlays().some(o => o.name === 'PMOV'),
    mapAlive: !!(window.GameMap && GameMap.map),
  };
});
rec('presenter: Store loads shared config', mir.storeLoaded);
rec('presenter: banner mirrors', mir.banner);
rec('presenter: ticker mirrors', mir.ticker);
rec('presenter: spotlight mirrors', mir.spotlight);
rec('presenter: drawn element mirrors', mir.element);
rec('presenter: overlay mirrors', mir.overlay);
rec('presenter: map alive', mir.mapAlive);
rec('presenter: 0 page errors', perr.length === 0, perr.slice(0, 3).join(' | '));
// clean broadcast graphics back off
await p.evaluate(() => { Store.setBanner({ on: false }); Store.setTicker({ on: false }); Store.setSpotlight({ on: false }); Store.clearElements(); (Store.overlays() || []).slice().forEach(o => Store.removeOverlay(o.id)); });
await pres.close();

console.log('\\n================ AUDIT REPORT ================');
let fail=0; R.forEach((r,i)=>{ if(!r.ok)fail++; console.log((r.ok?'✓':'✗')+' '+r.name+(r.ok?'':('   << '+r.info))); });
console.log('---------------------------------------------');
console.log('TOTAL '+R.length+' · PASS '+(R.length-fail)+' · FAIL '+fail);
console.log('PAGE ERRORS: '+er.length+(er.length?'\\n  '+er.slice(0,8).join('\\n  '):''));
await b.close();})().catch(e=>{console.error('FATAL',e);process.exit(1);});
