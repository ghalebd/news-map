// ui-audit.js — REAL user-level UI test: actual clicks, real mouse drags, screenshots
const puppeteer=require('puppeteer-core');
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const R=[];const rec=(n,ok,i)=>R.push({name:n,ok:!!ok,info:i||''});
(async()=>{
const b=await puppeteer.launch({headless:'new',executablePath:CHROME,
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:1440,height:900});
p.on('dialog',d=>d.accept().catch(()=>{}));
const er=[];p.on('pageerror',e=>er.push(''+e));
await p.goto('http://localhost:8000/v2/control.html',{waitUntil:'networkidle2'});
await p.evaluate(()=>{localStorage.clear();});
await p.reload({waitUntil:'networkidle2'});await sleep(2500);
// REAL USER STEP: switch to PRESENTER (live) mode via the actual mode button
await p.evaluate(()=>{const b=[...document.querySelectorAll('.modesw__btn')].find(x=>x.dataset.mode==='live');b&&b.click();});
await sleep(600);
const modeOk=await p.evaluate(()=>({mode:Store.state.mode,qtoolsShown:getComputedStyle(document.querySelector('.qtools')).display!=='none'}));
rec('mode switch PREP→PRESENTER shows toolbar', modeOk.mode==='live'&&modeOk.qtoolsShown, JSON.stringify(modeOk));

// ===== A) Inventory every visible interactive control =====
const inv=await p.evaluate(()=>{
 const vis=el=>{const r=el.getBoundingClientRect();const cs=getComputedStyle(el);
   return r.width>2&&r.height>2&&cs.display!=='none'&&cs.visibility!=='hidden'&&cs.opacity!=='0';};
 const out=[];document.querySelectorAll('button,[role=button],.qtool,.tool,[data-tool],[data-qid]').forEach(el=>{
   if(!vis(el))return;const r=el.getBoundingClientRect();
   out.push({sel:el.className.toString().slice(0,40),id:el.id||'',qid:el.dataset.qid||el.dataset.tool||'',
     title:el.title||el.textContent.trim().slice(0,20),x:Math.round(r.x),y:Math.round(r.y),
     w:Math.round(r.width),h:Math.round(r.height),
     off:(r.right>innerWidth||r.bottom>innerHeight||r.x<0||r.y<0)&&!el.closest('.panel,[class*=cfg]')});
 });return {count:out.length, offscreen:out.filter(o=>o.off), all:out};});
rec('UI inventory', inv.count>10, inv.count+' visible controls');
rec('no off-screen controls', inv.offscreen.length===0, JSON.stringify(inv.offscreen.slice(0,5)));

// ===== B) Overlap detection between major panels =====
const ov=await p.evaluate(()=>{
 const sels=['.qbar','.lbar','.status','.tl','.mctl','.cfg-flyout','.locator','.bcast-banner','.bcast-ticker','.compass'];
 const boxes=[];sels.forEach(s=>{const el=document.querySelector(s);if(!el)return;
   const cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden'||el.hidden)return;
   const r=el.getBoundingClientRect();if(r.width<3||r.height<3)return;boxes.push({s,r:{x:r.x,y:r.y,w:r.width,h:r.height}});});
 const hits=[];for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
   const a=boxes[i].r,c=boxes[j].r;
   const x=Math.max(0,Math.min(a.x+a.w,c.x+c.w)-Math.max(a.x,c.x));
   const y=Math.max(0,Math.min(a.y+a.h,c.y+c.h)-Math.max(a.y,c.y));
   if(x>8&&y>8)hits.push(boxes[i].s+'×'+boxes[j].s+' '+Math.round(x)+'x'+Math.round(y));}
 return hits;});
rec('no panel overlaps (wide)', ov.length===0, ov.join(' | '));

// ===== C) REAL mouse drawing on the map canvas =====
async function realDrag(x1,y1,x2,y2){await p.mouse.move(x1,y1);await p.mouse.down();
 for(let i=1;i<=6;i++){await p.mouse.move(x1+(x2-x1)*i/6,y1+(y2-y1)*i/6);await sleep(25);}
 await p.mouse.up();await sleep(150);}
async function clickToolBtn(qid){
 const found=await p.evaluate(q=>{
  const el=document.querySelector(`[data-qid="${q}"],[data-tool="${q}"]`);
  if(!el)return null;const r=el.getBoundingClientRect();
  return {x:r.x+r.width/2,y:r.y+r.height/2,vis:r.width>2};},qid);
 if(!found||!found.vis)return false;
 await p.mouse.click(found.x,found.y);await sleep(120);return true;}
const elCount=()=>p.evaluate(()=>Store.activeScene().elements.length);

// which draw tools exist as visible buttons?
const toolBtns=await p.evaluate(()=>[...document.querySelectorAll('[data-qid]')].map(e=>e.dataset.qid));
console.log('QBAR BUTTONS:',JSON.stringify(toolBtns));

const drawTools=['marker','arrow','curve','ring','circle','polygon','sketch','measure','frontline','tarrow','text'];
// real-user prerequisite: enable all tool buttons from settings (defaults hide several)
await p.evaluate(()=>Store.setQbar({hidden:[]}));await sleep(400);
for(const t of drawTools){
 const hasBtn=await clickToolBtn(t);
 if(!hasBtn){rec('btn:'+t+' visible in UI',false,'button not found/visible');continue;}
 const active=await p.evaluate(tt=>window.Draw&&Draw.tool===tt,t);
 const before=await elCount();
 if(t==='marker'||t==='text'){await p.mouse.click(720,450);await sleep(200);}
 else await realDrag(620,420,840,520);
 if(t==='text'){await p.keyboard.type('TEST');await p.keyboard.press('Enter');await sleep(200);}
 const after=await elCount();
 rec('user-draw:'+t, active&&after>before, 'btnActive='+active+' el '+before+'→'+after);
}
// erase via real click on an element
await clickToolBtn('erase');
const beforeE=await elCount();
const pt=await p.evaluate(()=>{const e=Store.activeScene().elements[0];if(!e)return null;
 const ll=e.ll||(e.pts&&e.pts[0]);if(!ll)return null;const pp=GameMap.map.latLngToContainerPoint(L.latLng(ll[0],ll[1]));return {x:pp.x,y:pp.y};});
if(pt){await p.mouse.click(pt.x,pt.y);await sleep(250);}
rec('user-erase removes element', pt&&(await elCount())<beforeE, 'el '+beforeE+'→'+(await elCount()));
await p.evaluate(()=>Store.clearElements());

// ===== D) Integration sequences (cross-tool) =====
// D1: draw in 2D → enter 3D → element survives → exit → still there
await p.evaluate(()=>{Store.clearElements();Store.addElement({type:'marker',ll:[33,53],color:'#fff'});});
await p.evaluate(()=>Map3D.enter());await sleep(4000);
const in3d=await p.evaluate(()=>({on:Map3D.on,el:Store.activeScene().elements.length}));
await p.evaluate(()=>Map3D.exit());await sleep(1200);
const out3d=await p.evaluate(()=>({on:Map3D.on,el:Store.activeScene().elements.length,
 visible:!!document.querySelector('.leaflet-marker-icon,.leaflet-interactive')}));
rec('integration: 2D element survives 3D roundtrip', in3d.el===1&&out3d.el===1&&!out3d.on, JSON.stringify({in3d,out3d}));

// D2: scene switch while drawing tool active — no stuck state
await p.evaluate(()=>{Store.addScene(undefined,{title:'S2'});});
await clickToolBtn('arrow');
await p.evaluate(()=>{const sc=Store.scenes();Store.setActive(sc[sc.length-1].id);});
await sleep(300);
const d2=await p.evaluate(()=>({tool:Draw.tool,els:Store.activeScene().elements.length}));
await realDrag(600,400,800,500);
const d2b=await p.evaluate(()=>Store.activeScene().elements.length);
rec('integration: tool usable after scene switch', d2b>d2.els, 'tool='+d2.tool+' el '+d2.els+'→'+d2b);
await p.evaluate(()=>{Store.clearElements();const sc=Store.scenes();if(sc.length>1)Store.removeScene(sc[sc.length-1].id);});

// D3: undo via keyboard shortcut (real user)
await p.evaluate(()=>{Store.clearElements();Store.addElement({type:'marker',ll:[30,50],color:'#fff'});});
await p.keyboard.down('Meta');await p.keyboard.press('z');await p.keyboard.up('Meta');await sleep(250);
const d3=await p.evaluate(()=>Store.activeScene().elements.length);
rec('integration: Cmd+Z undo shortcut', d3===0, 'el='+d3);

// D4: timeline + model route playing simultaneously
const d4=await p.evaluate(async()=>{
 const it=MODELS3D_CATALOG[0];Store.addModel3d({src:'assets3d/'+it.file,name:'T',lat:25,lng:50,scale:3,mode:'both',on:true});
 await new Promise(r=>setTimeout(r,1800));
 const id=Store.models3d()[0].id;
 Store.updateModel3d(id,{route:{pts:[[25,50],[27,55]],dur:4}});
 ModelsAnim.play(id);
 Store.setTimeline({dur:6,head:0,cam:[{t:0,lat:25,lng:50,zoom:5,pitch:0,bearing:0},{t:6,lat:30,lng:60,zoom:5,pitch:0,bearing:0}],models:{}});
 Timeline.toggle(true);Timeline.play();
 await new Promise(r=>setTimeout(r,1500));
 const mk=Models3D.marker(id);const c=GameMap.map.getCenter();
 Timeline.stop();ModelsAnim.stop(id);
 return {modelMoved:mk&&Math.abs(mk.getLatLng().lng-50)>0.3, camMoved:c.lng>50.3};});
rec('integration: timeline+route concurrent', d4.modelMoved&&d4.camMoved, JSON.stringify(d4));
await p.evaluate(()=>{if(Store.clearModels3d)Store.clearModels3d();Store.setTimeline({cam:[],head:0});Timeline.toggle(false);});

// ===== E) Screenshots wide + portrait, control + presenter =====
await p.evaluate(()=>{Store.clearElements();});
await p.screenshot({path:'/tmp/v2_control_wide.png'});
await p.setViewport({width:680,height:1320});await sleep(900);
const ovP=await p.evaluate(()=>{
 const sels=['.qbar','.lbar','.status','.tl','.mctl','.cfg-flyout','.locator','.compass'];
 const boxes=[];sels.forEach(s=>{const el=document.querySelector(s);if(!el)return;
  const cs=getComputedStyle(el);if(cs.display==='none'||el.hidden)return;
  const r=el.getBoundingClientRect();if(r.width<3)return;boxes.push({s,r});});
 const hits=[];for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
  const a=boxes[i].r,c=boxes[j].r;
  const x=Math.max(0,Math.min(a.right,c.right)-Math.max(a.x,c.x));
  const y=Math.max(0,Math.min(a.bottom,c.bottom)-Math.max(a.y,c.y));
  if(x>8&&y>8)hits.push(boxes[i].s+'×'+boxes[j].s);}
 const off=boxes.filter(b=>b.r.right>innerWidth+2||b.r.x<-2).map(b=>b.s);
 return {hits,off};});
rec('no overlaps (portrait 680x1320)', ovP.hits.length===0, ovP.hits.join(' | '));
rec('no off-screen panels (portrait)', ovP.off.length===0, ovP.off.join(' | '));
await p.screenshot({path:'/tmp/v2_control_portrait.png'});
await p.setViewport({width:1440,height:900});await sleep(500);

const pres=await b.newPage();await pres.setViewport({width:1440,height:900});
await pres.goto('http://localhost:8000/v2/index.html',{waitUntil:'domcontentloaded'});await sleep(2500);
await pres.screenshot({path:'/tmp/v2_presenter_wide.png'});
await pres.close();

// ===== REPORT =====
console.log('\n================ UI AUDIT REPORT ================');
let fail=0;R.forEach(r=>{if(!r.ok)fail++;console.log((r.ok?'✓':'✗')+' '+r.name+(r.ok?'':('   << '+r.info)));});
console.log('-----------------------------------------------');
console.log('TOTAL '+R.length+' · PASS '+(R.length-fail)+' · FAIL '+fail);
console.log('PAGE ERRORS: '+er.length+(er.length?'\n  '+er.slice(0,8).join('\n  '):''));
await b.close();})().catch(e=>{console.error('FATAL',e);process.exit(1);});
