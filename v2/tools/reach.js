const puppeteer=require('puppeteer-core');const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
const b=await puppeteer.launch({headless:'new',executablePath:CHROME,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage();await p.setViewport({width:1440,height:900});
await p.goto('http://localhost:8000/v2/control.html?nosync',{waitUntil:'domcontentloaded'});await sleep(1500);
await p.evaluate(()=>{try{localStorage.clear();indexedDB.deleteDatabase('newsmap.assets3d');}catch(e){}});
await p.reload({waitUntil:'domcontentloaded'});await sleep(2600);
await p.evaluate(()=>{try{Store.setMode('build');}catch(e){}});await sleep(300);

// scanner: hit-test every VISIBLE interactive el inside a container; report unreachable/zero-size
const scan = (containerSel,label)=>p.evaluate((containerSel,label)=>{
  const root = containerSel?document.querySelector(containerSel):document.body;
  if(!root) return {label,missing:true};
  const els=[...root.querySelectorAll('button,input,select,textarea,[role=button],.qtool,.qa__tool,.qa__sw,.qa__icon,.cfg-row,.swatch,[data-qid]')];
  const probs=[];
  for(const el of els){
    const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden'||cs.pointerEvents==='none') continue;
    const b=el.getBoundingClientRect(); if(b.width===0&&b.height===0) continue; // not rendered
    if(el.offsetParent===null && cs.position!=='fixed') continue; // hidden ancestor
    let why=null;
    // skip elements scrolled out / in a closed off-screen panel (reachable once scrolled into view — not a bug)
    if(b.right<=0||b.bottom<=0||b.left>=innerWidth||b.top>=innerHeight) continue;
    if(b.width<6||b.height<6) why='zero-size('+Math.round(b.width)+'x'+Math.round(b.height)+')';
    else { const cx=Math.min(Math.max(b.x+b.width/2,2),innerWidth-2), cy=Math.min(Math.max(b.y+b.height/2,2),innerHeight-2);
      const top=document.elementFromPoint(cx,cy); if(top&&!(el===top||el.contains(top)||top.contains(el))) why='covered-by:'+((top.className&&top.className.toString().slice(0,30))||top.tagName); }
    if(why){ const lbl=(el.title||el.textContent||el.dataset.qid||el.placeholder||el.className||'').toString().trim().slice(0,28); probs.push(why+' :: '+lbl); }
  }
  return {label,count:els.length,problems:probs};
},containerSel,label);

const results=[];
results.push(await scan(null,'control/build · whole chrome'));
// open settings drawer
await p.evaluate(()=>{const g=document.querySelector('.cfg-toggle'); g&&g.click();});await sleep(600);
results.push(await scan('.cfg-drawer','control/build · settings drawer (open)'));
// open FAB add menu
await p.evaluate(()=>{const f=document.querySelector('.fab'); f&&f.click();});await sleep(400);
results.push(await scan('.qa','control/build · FAB add menu'));
await p.evaluate(()=>{const f=document.querySelector('.fab'); f&&f.click();});await sleep(200); // close fab
await p.evaluate(()=>{const g=document.querySelector('.cfg-toggle'); g&&g.click();});await sleep(500); // close settings drawer
// toggled operator panels
const clickQ=qid=>p.evaluate(q=>{const el=document.querySelector('.qtool[data-qid='+q+']'); el&&el.click();},qid);
await clickQ('timeline');await sleep(500); results.push(await scan('.tl','control/build · timeline panel (open)'));
await clickQ('timeline');await sleep(150);
await clickQ('mctl');await sleep(500); results.push(await scan('.mctl','control/build · model-control HUD (open)'));
await clickQ('mctl');await sleep(150);
await clickQ('mapstyle');await sleep(400); results.push(await scan('.mapstyle-pop','control/build · map-style popup (open)'));
await p.evaluate(()=>{const b=document.querySelector('.mapstyle-pop'); if(b)b.hidden=true;});
// LIVE mode chrome
await p.evaluate(()=>Store.setMode('live'));await sleep(500);
results.push(await scan(null,'control/LIVE · whole chrome'));
await p.evaluate(()=>Store.setMode('build'));await sleep(300);
// 3D mode chrome (control)
await p.evaluate(()=>{const t=document.querySelector('.qtool[data-qid=mapstyle]'); }); 
await p.evaluate(()=>{ if(window.Map3D&&!Map3D.on){const b=document.querySelector('[data-qid]'); } });
await p.evaluate(()=>{ try{ document.querySelector('.zoomctl') && [...document.querySelectorAll('.zoomctl button')].forEach(()=>{}); }catch(e){} });
await p.evaluate(()=>{ try{ if(window.Map3D&&Map3D.toggle&&!Map3D.on){ const btn=[...document.querySelectorAll('.zoomctl button,.qtool')].find(b=>/3D/.test(b.textContent)); btn&&btn.click(); } }catch(e){} });
await sleep(2500);
results.push(await scan(null,'control/3D · whole chrome'));
results.push(await scan('.d3ctrl','control/3D · lighting panel (.d3ctrl)'));
await p.evaluate(()=>{ try{ window.Map3D&&Map3D.on&&Map3D.toggle&&Map3D.toggle(false); }catch(e){} });await sleep(800);

// PRESENTER window (on-air output)
const pp=await b.newPage();await pp.setViewport({width:1440,height:900});
await pp.goto('http://localhost:8000/v2/index.html?nosync',{waitUntil:'domcontentloaded'});await sleep(2600);
const scanFn=(containerSel,label)=>{
  const root = containerSel?document.querySelector(containerSel):document.body;
  if(!root) return {label,missing:true};
  const els=[...root.querySelectorAll('button,input,select,textarea,[role=button],.qtool,[data-qid]')];
  const probs=[];
  for(const el of els){ const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden'||cs.pointerEvents==='none') continue;
    const b=el.getBoundingClientRect(); if(b.width===0&&b.height===0) continue; if(el.offsetParent===null&&cs.position!=='fixed') continue;
    if(b.right<=0||b.bottom<=0||b.left>=innerWidth||b.top>=innerHeight) continue;
    let why=null; if(b.width<6||b.height<6) why='zero-size'; else { const cx=Math.min(Math.max(b.x+b.width/2,2),innerWidth-2), cy=Math.min(Math.max(b.y+b.height/2,2),innerHeight-2); const top=document.elementFromPoint(cx,cy); if(top&&!(el===top||el.contains(top)||top.contains(el))) why='covered-by:'+((top.className&&top.className.toString().slice(0,30))||top.tagName); }
    if(why){ probs.push(why+' :: '+(el.title||el.textContent||el.dataset.qid||'').toString().trim().slice(0,28)); } }
  return {label,count:els.length,problems:probs};
};
const scanPP=(containerSel,label)=>pp.evaluate(scanFn,containerSel,label);
results.push(await scanPP(null,'presenter/live · whole chrome'));
await pp.close();

for(const r of results){
  console.log('\n=== '+r.label+(r.missing?' [MISSING]':' · '+r.count+' controls · '+r.problems.length+' issues')+' ===');
  (r.problems||[]).slice(0,40).forEach(x=>console.log('  ✗ '+x));
  if(r.problems&&r.problems.length===0) console.log('  ✓ all reachable');
}
await b.close();})();
