const puppeteer=require('puppeteer-core');const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',executablePath:CHROME,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
async function load(url){const p=await b.newPage();await p.setViewport({width:1280,height:840});p.on('dialog',d=>d.accept().catch(()=>{}));await p.goto(url,{waitUntil:'domcontentloaded'});await sleep(1000);await p.evaluate(()=>{try{localStorage.clear();}catch(e){}});await p.reload({waitUntil:'domcontentloaded'});await sleep(2400);return p;}

// FIX A: control claims TSKEY immediately on a local edit (room-independent)
const c=await load('http://localhost:8000/v2/control.html?room=autotest-ctl');
const a=await c.evaluate(()=>{const TSKEY='newsmap.v3.syncts';if(!Store.scenes().length)Store.addScene({lat:31,lng:47,zoom:6});const t0=Date.now();Store.addModel3d({src:'x',name:'M',lat:31,lng:47,scale:3,mode:'2d',on:true});const ts=parseInt(localStorage.getItem(TSKEY)||'0',10);const t1=Date.now();return {claimedImmediately: ts>=t0 && ts<=t1, ts_minus_t0: ts-t0};});
console.log('FIX A · control claims TSKEY synchronously on edit:', a.claimedImmediately, '(ts-t0='+a.ts_minus_t0+'ms)');
await c.close();

// FIX B: presenter (index.html) is receive-only — never claims TSKEY / never sends on a local edit
const pr=await load('http://localhost:8000/v2/index.html?room=autotest-pre');
const bb=await pr.evaluate(()=>{const TSKEY='newsmap.v3.syncts';const before=localStorage.getItem(TSKEY);if(!Store.scenes().length)Store.addScene({lat:31,lng:47,zoom:6});Store.addModel3d({src:'x',name:'M',lat:31,lng:47,scale:3,mode:'2d',on:true});return {role:window.APP_ROLE||'(presenter)', tsBefore:before, tsAfter:localStorage.getItem(TSKEY)};});
console.log('FIX B · presenter does NOT claim/send (TSKEY unchanged):', bb.tsBefore===bb.tsAfter, '(role='+bb.role+')');
await pr.close();
await b.close();})();
