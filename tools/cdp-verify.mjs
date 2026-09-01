// Headless-Chrome verification for the Read tab. The in-app browser pane on
// this machine never composites (document stays hidden, rAF never fires), so
// PDF.js's rAF-scheduled chunked render stalls there. A real headless Chrome
// composites normally, so we drive it over CDP. Dev tool, not shipped.
//
//   node tools/cdp-verify.mjs http://localhost:8743
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

const APP_URL = process.argv[2] || 'http://localhost:8743';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));

// Hard watchdog: never let a stalled step hang the whole run.
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 100000).unref();

function getJSON(url) {
  return new Promise((res, rej) => {
    http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=400,900', 'about:blank',
], { stdio: 'ignore' });

let ws, msgId = 0;
const pending = new Map();
function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}
// Evaluate an async expression in the page and return its value.
async function evalP(expr) {
  const r = await send('Runtime.evaluate', {
    expression: `(async()=>{ ${expr} })()`,
    awaitPromise: true, returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function step(name, expr) {
  console.error('… ' + name);
  const v = await evalP(expr);
  console.error('  ' + name + ' → ' + JSON.stringify(v));
  return v;
}

async function main() {
  // find the page target
  let target;
  for (let i = 0; i < 50; i++) {
    try {
      const list = await getJSON(`http://127.0.0.1:${PORT}/json`);
      target = list.find(t => t.type === 'page');
      if (target && target.webSocketDebuggerUrl) break;
    } catch {}
    await sleep(200);
  }
  if (!target) throw new Error('no page target');
  ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  const events = [];
  ws.on('message', d => {
    const m = JSON.parse(d);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.rej(new Error('CDP ' + JSON.stringify(m.error)));
      else p.res(m.result);
    } else if (m.method) {
      events.push(m.method);
    }
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 800, deviceScaleFactor: 2, mobile: true });
  // Drive the navigation ourselves and wait for load, so no context is
  // destroyed underneath an evaluate.
  await send('Page.navigate', { url: APP_URL });
  for (let i = 0; i < 100 && !events.includes('Page.loadEventFired'); i++) await sleep(100);
  await sleep(500);

  const report = {};

  // wait for boot
  report.boot = await step("boot", `
    for (let i=0;i<60 && !document.getElementById('read-add');i++) await new Promise(r=>setTimeout(r,100));
    await new Promise(r=>setTimeout(r,400));
    const order=[...document.querySelectorAll('#tabbar button')].map(b=>b.dataset.screen);
    return { order, mainErr: window.__mainError||null, rafWorks: await new Promise(res=>{requestAnimationFrame(()=>res(true));setTimeout(()=>res(false),800)}) };
  `);

  // shelf: seed + render
  report.shelf = await step("shelf", `
    document.querySelector('#tabbar button[data-screen="read"]').click();
    await new Promise(r=>setTimeout(r,200));
    const db=await import('/js/db.js');
    const blob=await (await fetch('/__test-book.pdf')).blob();
    await db.addBook({name:'Test Book (5pp)',blob,size:blob.size,cover:null,pageCount:5,page:1,addedAt:Date.now(),openedAt:Date.now()});
    const read=await import('/js/read.js'); await read.refresh();
    await new Promise(r=>setTimeout(r,200));
    return { cards:document.querySelectorAll('#read-grid .read-card').length,
             storage:document.getElementById('read-storage').textContent,
             emptyHidden:document.getElementById('read-empty').classList.contains('hidden') };
  `);

  // open: the continuous scroller renders page 1 into the column (wait until the
  // page indicator populates and the first page's canvas has painted)
  report.open = await step("open", `
    document.querySelector('#read-grid .read-card').click();
    const ind=()=>document.getElementById('read-page-ind').textContent;
    for(let i=0;i<120 && ind().indexOf('/')<0;i++) await new Promise(r=>setTimeout(r,100));
    const c=document.querySelector('#read-col .read-page canvas');
    let painted=false;
    if(c){ try{ const d=c.getContext('2d').getImageData(c.width>>1,c.height>>1,4,4).data; painted=[...d].some(v=>v!==0);}catch(e){painted='err:'+e.message;} }
    const stage=document.getElementById('read-stage'), col=document.getElementById('read-col');
    return { readerVisible:!document.getElementById('read-reader').classList.contains('hidden'),
             pageInd:ind(), painted,
             canvases:document.querySelectorAll('#read-col .read-page canvas').length,
             colTallerThanStage: col.clientHeight>stage.clientHeight,
             loadingHidden:document.getElementById('read-loading').classList.contains('hidden'),
             stageW:stage.clientWidth, stageH:stage.clientHeight, scrollTop:stage.scrollTop };
  `);

  // scrolling forward advances the page indicator (and never changes tab)
  report.turn = await step("turn", `
    const num=()=>parseInt(document.getElementById('read-page-ind').textContent)||0;
    const stage=document.getElementById('read-stage'), col=document.getElementById('read-col');
    const app=await import('/js/app.js');
    const before=num();
    stage.scrollTop=Math.round(stage.clientHeight*1.2); stage.dispatchEvent(new Event('scroll'));
    for(let i=0;i<40 && num()===before;i++) await new Promise(r=>setTimeout(r,80));
    const afterOne=num();
    stage.scrollTop=col.clientHeight; stage.dispatchEvent(new Event('scroll'));   // to the end
    await new Promise(r=>setTimeout(r,400));
    const afterEnd=num();
    return { before, afterOne, afterEnd, advanced: afterOne>before && afterEnd>=afterOne,
             activeScreen: app.activeScreen };
  `);

  // page memory: scroll to a known page (2), close, reopen → resumes there
  report.memory = await step("memory", `
    const num=()=>parseInt(document.getElementById('read-page-ind').textContent)||0;
    const stage=document.getElementById('read-stage');
    const pageEl=document.querySelector('#read-col .read-page');
    const slotH=pageEl.getBoundingClientRect().height + 8;   // page height + gap
    stage.scrollTop=Math.round(slotH*1.2); stage.dispatchEvent(new Event('scroll'));   // lands on page 2
    await new Promise(r=>setTimeout(r,200));
    const noted=num();
    await new Promise(r=>setTimeout(r,500)); // let saveProgress flush
    document.getElementById('read-back').click();
    await new Promise(r=>setTimeout(r,300));
    const shelfBack=!document.getElementById('read-shelf').classList.contains('hidden');
    document.querySelector('#read-grid .read-card').click();
    for(let i=0;i<80 && !document.getElementById('read-loading').classList.contains('hidden');i++) await new Promise(r=>setTimeout(r,100));
    for(let i=0;i<40 && num()===0;i++) await new Promise(r=>setTimeout(r,80));
    const reopened=num();
    return { notedBeforeClose:noted, shelfBack, reopenedAt:reopened, resumed: reopened===noted };
  `);

  // delete frees space (use a big dummy book so estimate actually moves)
  report.space = await step("space", `
    document.getElementById('read-back').click();
    await new Promise(r=>setTimeout(r,200));
    const db=await import('/js/db.js');
    const est=async()=>(await navigator.storage.estimate()).usage;
    const u0=await est();
    const big=new Blob([new Uint8Array(3*1024*1024)]);
    const id=await db.addBook({name:'Big',blob:big,size:big.size,cover:null,pageCount:1,page:1,addedAt:Date.now(),openedAt:Date.now()});
    await new Promise(r=>setTimeout(r,300));
    const u1=await est();
    await db.deleteBook(id);
    await new Promise(r=>setTimeout(r,300));
    const u2=await est();
    return { usedBefore:u0, usedAfterAdd:u1, usedAfterDelete:u2, roseByMB:((u1-u0)/1048576).toFixed(2), fellByMB:((u1-u2)/1048576).toFixed(2) };
  `);

  // quota refusal (fake a tiny quota, import a file that will not fit)
  report.refusal = await step("refusal", `
    const read=await import('/js/read.js');
    const db=await import('/js/db.js');
    const realEst=navigator.storage.estimate.bind(navigator.storage);
    const cur=await realEst();
    navigator.storage.estimate=async()=>({usage:cur.usage, quota:cur.usage}); // 0 free
    // clear any pre-existing modal (e.g. the onboarding welcome on a fresh profile)
    document.querySelectorAll('.modal-back').forEach(b=>b.remove());
    const before=(await db.listBookSummaries()).length;
    const f=new File([new Uint8Array(500000)],'toobig.pdf',{type:'application/pdf'});
    read.importFile(f); // do NOT await — the refusal modal blocks it until the user closes it
    await new Promise(r=>setTimeout(r,500));
    const boxes=[...document.querySelectorAll('.modal-box')];
    const box=boxes[boxes.length-1];  // the refusal modal is the newest
    const modalText=box?box.textContent:'';
    const after=(await db.listBookSummaries()).length;
    // dismiss + restore
    box?.querySelector('.btn.primary')?.click();
    navigator.storage.estimate=realEst;
    return { before, after, savedNothing:before===after, hasModal:!!box,
             mentionsSize: modalText.includes('488'), mentionsFree: modalText.includes('0 B'), text: modalText.slice(0,200) };
  `);

  // theme + 375px geometry (light and dark)
  report.theme = await step("theme", `
    const app=await import('/js/app.js');
    const appr=await import('/js/appearance.js');
    document.querySelector('#read-grid .read-card')?.click?.();
    await new Promise(r=>setTimeout(r,300));
    // ensure on shelf
    if(document.getElementById('read-reader').classList.contains('hidden')===false){document.getElementById('read-back').click();await new Promise(r=>setTimeout(r,200));}
    const read=await import('/js/read.js'); await read.refresh(); await new Promise(r=>setTimeout(r,150));
    const grid=document.getElementById('read-grid');
    const card=grid.querySelector('.read-card');
    const cardRect=card.getBoundingClientRect();
    const out={};
    appr.ColorMode.set('dark'); await new Promise(r=>setTimeout(r,80));
    out.dark={ bg:getComputedStyle(document.body).backgroundColor, bodyClass:[...document.body.classList].filter(c=>c.startsWith('mode-')) };
    appr.ColorMode.set('light'); await new Promise(r=>setTimeout(r,80));
    out.light={ bg:getComputedStyle(document.body).backgroundColor, bodyClass:[...document.body.classList].filter(c=>c.startsWith('mode-')) };
    appr.ColorMode.set('dark');
    out.viewportW=window.innerWidth;
    out.cardW=Math.round(cardRect.width);
    out.cardOverflow=cardRect.right>window.innerWidth+1;
    out.bodyScrollW=document.body.scrollWidth;
    return out;
  `);

  // DB v3→v4 in-place upgrade: build a v3-shaped DB with data, then open it at
  // v4 with db.js's exact upgrade step and confirm it is additive (existing
  // stores/data survive; the new 'books' store appears).
  report.migration = await step("migration", `
    const NAME='mig-test-v3v4';
    indexedDB.deleteDatabase(NAME);
    await new Promise(r=>setTimeout(r,150));
    // create v3 (v1: bases/games/kv ; v3: playHistory) + seed a base and a kv value
    await new Promise((res,rej)=>{
      const rq=indexedDB.open(NAME,3);
      rq.onupgradeneeded=e=>{ const d=rq.result;
        const bases=d.createObjectStore('bases',{keyPath:'id',autoIncrement:true}); bases.createIndex('name','name');
        const games=d.createObjectStore('games',{keyPath:'id',autoIncrement:true}); games.createIndex('baseId','baseId');
        d.createObjectStore('kv');
        d.createObjectStore('playHistory',{keyPath:'id',autoIncrement:true}); };
      rq.onsuccess=()=>{ const d=rq.result; const tx=d.transaction(['bases','kv'],'readwrite');
        tx.objectStore('bases').add({name:'Old base',createdAt:1}); tx.objectStore('kv').put(1234,'puzzleElo');
        tx.oncomplete=()=>{ d.close(); res(); }; tx.onerror=()=>rej(tx.error); };
      rq.onerror=()=>rej(rq.error);
    });
    // open at v4 with the SAME step db.js uses (oldVersion<4 → add 'books')
    const db4=await new Promise((res,rej)=>{
      const rq=indexedDB.open(NAME,4);
      rq.onupgradeneeded=e=>{ const d=rq.result;
        if(e.oldVersion<4){ const b=d.createObjectStore('books',{keyPath:'id',autoIncrement:true}); b.createIndex('openedAt','openedAt'); } };
      rq.onsuccess=()=>res(rq.result); rq.onerror=()=>rej(rq.error);
    });
    const stores=[...db4.objectStoreNames];
    const baseSurvived=await new Promise(res=>{ const r=db4.transaction('bases').objectStore('bases').getAll(); r.onsuccess=()=>res(r.result.length); });
    const kvSurvived=await new Promise(res=>{ const r=db4.transaction('kv').objectStore('kv').get('puzzleElo'); r.onsuccess=()=>res(r.result); });
    db4.close(); indexedDB.deleteDatabase(NAME);
    return { version:db4.version, stores, baseSurvived, kvSurvived, hasBooks:stores.includes('books') };
  `);

  // Offline (network cut): go offline, reload, and confirm the app boots from
  // the service-worker cache, the shelf still shows the book, and it opens.
  await send('Network.enable');
  // one online reload first so the SW is installed and controlling the page
  await send('Page.reload');
  for (let i = 0; i < 100 && !events.filter(e => e === 'Page.loadEventFired').length; i++) await sleep(100);
  await sleep(2500); // let SW install + cache assets
  events.length = 0;
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await send('Page.reload');
  await sleep(4000);
  report.offline = await step("offline", `
    for (let i=0;i<80 && !document.getElementById('read-add');i++) await new Promise(r=>setTimeout(r,100));
    document.querySelector('#tabbar button[data-screen="read"]').click();
    await new Promise(r=>setTimeout(r,400));
    const cards=document.querySelectorAll('#read-grid .read-card').length;
    // open the book offline (cached pdf.min.mjs + worker + IndexedDB blob)
    document.querySelector('#read-grid .read-card')?.click?.();
    const ind=()=>document.getElementById('read-page-ind').textContent;
    for(let i=0;i<120 && ind().indexOf('/')<0;i++) await new Promise(r=>setTimeout(r,100));
    return { bootedOffline: !!document.getElementById('read-add'), mainErr: window.__mainError||null,
             cards, opened: ind() };
  `);
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  // Gesture swipe suppression (HARD requirement): a horizontal touch-swipe on the
  // open book must NOT change tabs. (#read-stage is in SWIPE_SAFE; continuous
  // scroll means the horizontal drag no longer turns pages, but the tab-swipe
  // guarantee is the point of this check.)
  report.swipe = await step("swipe", `
    const app=await import('/js/app.js');
    // make sure a book is open
    if(document.getElementById('read-reader').classList.contains('hidden')){
      document.querySelector('#tabbar button[data-screen="read"]').click();
      await new Promise(r=>setTimeout(r,300));
      document.querySelector('#read-grid .read-card')?.click?.();
    }
    const ind=()=>document.getElementById('read-page-ind').textContent;
    for(let i=0;i<120 && ind().indexOf('/')<0;i++) await new Promise(r=>setTimeout(r,100));
    const screenBefore=app.activeScreen;
    const stage=document.getElementById('read-stage');
    const r=stage.getBoundingClientRect();
    const y=r.top+r.height/2, x0=r.left+r.width*0.8, x1=r.left+r.width*0.2;
    const pe=(type,x)=>new PointerEvent(type,{pointerType:'touch',isPrimary:true,pointerId:7,clientX:x,clientY:y,bubbles:true,cancelable:true});
    stage.dispatchEvent(pe('pointerdown',x0));
    for(let x=x0;x>=x1;x-=20){ stage.dispatchEvent(pe('pointermove',x)); await new Promise(r=>setTimeout(r,8)); }
    stage.dispatchEvent(pe('pointerup',x1));
    await new Promise(r=>setTimeout(r,600));
    return { screenBefore, screenAfter:app.activeScreen, tabUnchanged: screenBefore===app.activeScreen };
  `);

  console.log(JSON.stringify(report, null, 2));
}

main().then(() => { try { ws?.close(); } catch {} chrome.kill(); process.exit(0); })
      .catch(e => { console.error('VERIFY ERROR:', e.message); try { ws?.close(); } catch {} chrome.kill(); process.exit(1); });
