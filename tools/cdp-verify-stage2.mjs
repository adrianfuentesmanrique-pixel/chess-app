// Headless-Chrome verification for Read tab STAGE 2 (diagram → FEN). Same reason
// as cdp-verify.mjs: the in-app pane never composites, so we drive a real
// headless Chrome over CDP. Dev tool, not shipped.
//
//   node tools/cdp-verify-stage2.mjs http://localhost:8811
//
// It draws real chess diagrams (the app's own figurine SVGs on a shaded board)
// onto a canvas and runs js/diagram.js against them — a faithful per-book
// template-matching scenario — then exercises the real long-press → Setup path.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

const APP_URL = process.argv[2] || 'http://localhost:8811';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp2-'));
const OUT = path.join(process.cwd(), 'tools', 'stage2-shots');
try { fs.mkdirSync(OUT, { recursive: true }); } catch {}

setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 120000).unref();

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
async function evalP(expr) {
  const r = await send('Runtime.evaluate', {
    expression: `(async()=>{ ${expr} })()`,
    awaitPromise: true, returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
  return r.result.value;
}
async function step(name, expr) {
  console.error('… ' + name);
  const v = await evalP(expr);
  console.error('  ' + name + ' → ' + JSON.stringify(v));
  return v;
}
async function shot(name) {
  try {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
  } catch (e) { console.error('  shot ' + name + ' failed: ' + e.message); }
}

// The board-drawing helper, injected once as a page global so every step reuses it.
const DRAW_HELPERS = `
window.__mid = [
 ['r','','b','q','k','b','n','r'],
 ['p','p','p','p','','p','p','p'],
 ['','','n','','','','',''],
 ['','B','','','p','','',''],
 ['','','','','P','','',''],
 ['','','','','','N','',''],
 ['P','P','P','P','','P','P','P'],
 ['R','N','B','Q','K','','','R']];
window.__pieceMap = {r:'bR',n:'bN',b:'bB',q:'bQ',k:'bK',p:'bP',R:'wR',N:'wN',B:'wB',Q:'wQ',K:'wK',P:'wP'};
window.__loadImg = src => new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error(src));i.src=src;});
// Draw an 8x8 shaded board with the app's figurine SVGs, into ctx at (ox,oy) with
// the given cell size. Awaits every glyph so the pixels are final on return.
window.__drawBoardInto = async (ctx, placement, ox, oy, cell, set) => {
  set = set || 'pieces';
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    ctx.fillStyle=((r+c)%2===0)?'#efd9b4':'#b58863';
    ctx.fillRect(ox+c*cell, oy+r*cell, cell, cell);
  }
  const pad=Math.round(cell*0.09);
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const code=placement[r][c]; if(!code) continue;
    const im=await window.__loadImg('/'+set+'/'+window.__pieceMap[code]+'.svg');
    ctx.drawImage(im, ox+c*cell+pad, oy+r*cell+pad, cell-2*pad, cell-2*pad);
  }
};
// A standalone page-like canvas with a diagram + surrounding "book" text.
window.__makePageCanvas = async (placement, set) => {
  const cell=44, ox=48, oy=150, W=440, H=620;
  const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
  const x=cv.getContext('2d',{willReadFrequently:true});
  x.fillStyle='#fff'; x.fillRect(0,0,W,H);
  x.fillStyle='#222'; x.font='17px Georgia, serif';
  x.fillText('12   The Ruy Lopez, Main Line', 44, 54);
  x.font='14px Georgia, serif';
  x.fillText('After 3.Bb5 White pins the knight. White to move and', 44, 96);
  x.fillText('now the classic battle for the centre begins in earnest.', 44, 118);
  x.fillText('This paragraph mimics a real book page under the board so', 44, 560);
  x.fillText('the detector has to ignore ordinary text, not just paper.', 44, 582);
  await window.__drawBoardInto(x, placement, ox, oy, cell, set);
  return { cv, cx: ox+4*cell, cy: oy+4*cell };
};
true;
`;

async function main() {
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
    } else if (m.method) events.push(m.method);
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 800, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: APP_URL });
  for (let i = 0; i < 100 && !events.includes('Page.loadEventFired'); i++) await sleep(100);
  await sleep(500);

  const report = {};

  report.boot = await step('boot', `
    for (let i=0;i<60 && !document.getElementById('read-add');i++) await new Promise(r=>setTimeout(r,100));
    await new Promise(r=>setTimeout(r,300));
    ${DRAW_HELPERS}
    return { ready: !!document.getElementById('read-add'), mainErr: window.__mainError||null,
             rafWorks: await new Promise(res=>{requestAnimationFrame(()=>res(true));setTimeout(()=>res(false),800)}) };
  `);

  // Pure CV: detect + calibrate (start) + classify (start & a real midgame).
  report.cv = await step('cv', `
    const diag=await import('/js/diagram.js');
    const START=diag.START_GRID;
    const s=await window.__makePageCanvas(START);
    const simg=s.cv.getContext('2d').getImageData(0,0,s.cv.width,s.cv.height);
    const b1=diag.detectBoard(simg, s.cx, s.cy);
    const templates=b1?diag.buildTemplates(simg,b1):null;
    const startRes=(b1&&templates)?diag.classifyBoard(simg,b1,templates):null;
    const m=await window.__makePageCanvas(window.__mid);
    const mimg=m.cv.getContext('2d').getImageData(0,0,m.cv.width,m.cv.height);
    const b2=diag.detectBoard(mimg, m.cx, m.cy);
    const midRes=(b2&&templates)?diag.classifyBoard(mimg,b2,templates):null;
    const expectStart='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1';
    const expectMid='r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w - - 0 1';
    window.__templates=templates;   // reuse in the persistence check
    return {
      boardFound:!!b1, cell:b1?Math.round(b1.cw):null, x0:b1?Math.round(b1.x0):null, y0:b1?Math.round(b1.y0):null,
      startFen:startRes&&startRes.fen, startOk:!!startRes&&startRes.fen===expectStart, startConfident:startRes&&startRes.confident,
      startMaxD1:startRes&&startRes.maxD1, startMinMargin:startRes&&startRes.minMargin,
      midFound:!!b2, midFen:midRes&&midRes.fen, midOk:!!midRes&&midRes.fen===expectMid,
      midConfident:midRes&&midRes.confident, midUncertain:midRes&&midRes.uncertain, midKingsOk:midRes&&midRes.kingsOk,
      midMaxD1:midRes&&midRes.maxD1, midMinMargin:midRes&&midRes.minMargin
    };
  `);

  // HONEST DEGRADATION: templates learned from one book's figurines, used on a
  // diagram drawn in a DIFFERENT style (the app's second piece set). The board is
  // still found, but the classifier must know it is unsure — confident=false — so
  // the app opens Setup with a warning rather than asserting a wrong position.
  report.crossStyle = await step('crossStyle', `
    const diag=await import('/js/diagram.js');
    const a=await window.__makePageCanvas(diag.START_GRID, 'pieces');
    const aimg=a.cv.getContext('2d').getImageData(0,0,a.cv.width,a.cv.height);
    const ba=diag.detectBoard(aimg,a.cx,a.cy);
    const templates=diag.buildTemplates(aimg,ba);
    const b=await window.__makePageCanvas(diag.START_GRID, 'pieces2');
    const bimg=b.cv.getContext('2d').getImageData(0,0,b.cv.width,b.cv.height);
    const bb=diag.detectBoard(bimg,b.cx,b.cy);
    const res=diag.classifyBoard(bimg,bb,templates);
    return { boardStillFound:!!bb, confident:res.confident, uncertain:res.uncertain,
             maxD1:res.maxD1, degradesHonestly: !!bb && res.confident===false, fenReturned: typeof res.fen==='string' };
  `);

  // No false positive: a plain white area must yield no board.
  report.blankArea = await step('blankArea', `
    const diag=await import('/js/diagram.js');
    const cv=document.createElement('canvas'); cv.width=400; cv.height=400;
    const x=cv.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,400,400);
    x.fillStyle='#222'; x.font='16px serif';
    x.fillText('Just a paragraph of ordinary book text with no', 20, 100);
    x.fillText('diagram anywhere near the point being pressed.', 20, 130);
    const img=x.getImageData(0,0,400,400);
    const b=diag.detectBoard(img,200,200);
    return { board: b, rejected: b===null };
  `);

  // Open a real book so the reader (and its gestures) are live.
  report.open = await step('open', `
    // dismiss any onboarding welcome modal so it can't be mistaken for ours
    document.querySelectorAll('.modal-back').forEach(b=>b.remove());
    document.querySelector('#tabbar button[data-screen="read"]').click();
    await new Promise(r=>setTimeout(r,200));
    const db=await import('/js/db.js');
    // fresh: clear any prior test books
    for (const bk of await db.listBookSummaries()) await db.deleteBook(bk.id);
    const blob=await (await fetch('/__test-book.pdf')).blob();
    window.__bookId=await db.addBook({name:'Stage2 Book',blob,size:blob.size,cover:null,pageCount:5,page:1,addedAt:Date.now(),openedAt:Date.now()});
    const read=await import('/js/read.js'); await read.refresh();
    await new Promise(r=>setTimeout(r,150));
    document.querySelector('#read-grid .read-card').click();
    const ind=()=>document.getElementById('read-page-ind').textContent;
    for(let i=0;i<120 && ind().indexOf('/')<0;i++) await new Promise(r=>setTimeout(r,100));
    return { pageInd:ind(), readerVisible:!document.getElementById('read-reader').classList.contains('hidden') };
  `);

  // HONEST no-diagram: long-press on the plain PDF page → toast, no modal, stay in Read.
  report.lpNoBoard = await step('lpNoBoard', `
    const app=await import('/js/app.js');
    const canvas=document.getElementById('read-canvas'), stage=document.getElementById('read-stage');
    const rect=stage.getBoundingClientRect();
    const cx=rect.left+rect.width/2, cy=rect.top+rect.height/2;
    const pe=t=>new PointerEvent(t,{pointerType:'touch',isPrimary:true,pointerId:11,clientX:cx,clientY:cy,bubbles:true,cancelable:true});
    const modalsBefore=document.querySelectorAll('.modal-box').length;
    canvas.dispatchEvent(pe('pointerdown'));
    await new Promise(r=>setTimeout(r,700));            // hold past the 500ms threshold
    const modalsAfter=document.querySelectorAll('.modal-box').length;
    canvas.dispatchEvent(pe('pointerup'));
    await new Promise(r=>setTimeout(r,100));
    const toastEl=document.getElementById('toast');
    return { screen:app.activeScreen, noModal:modalsAfter===modalsBefore,
             toastShown:!toastEl.classList.contains('hidden'), toast:toastEl.textContent.slice(0,60) };
  `);

  // A quick tap must NOT open a diagram.
  report.quickTap = await step('quickTap', `
    const canvas=document.getElementById('read-canvas'), stage=document.getElementById('read-stage');
    const rect=stage.getBoundingClientRect();
    const cx=rect.left+rect.width/2, cy=rect.top+rect.height/2;
    const pe=t=>new PointerEvent(t,{pointerType:'touch',isPrimary:true,pointerId:12,clientX:cx,clientY:cy,bubbles:true,cancelable:true});
    const before=document.querySelectorAll('.modal-box').length;
    canvas.dispatchEvent(pe('pointerdown'));
    await new Promise(r=>setTimeout(r,120));
    canvas.dispatchEvent(pe('pointerup'));
    await new Promise(r=>setTimeout(r,200));
    return { noModal:document.querySelectorAll('.modal-box').length===before };
  `);

  // INTEGRATION: paint a START board onto the live reader canvas, long-press it,
  // confirm the calibration modal, then confirm it lands in Setup with the start.
  report.lpCalibrate = await step('lpCalibrate', `
    const app=await import('/js/app.js');
    const canvas=document.getElementById('read-canvas'), stage=document.getElementById('read-stage');
    const rect=stage.getBoundingClientRect();
    const cx=rect.left+rect.width/2, cy=rect.top+rect.height/2;
    // map the stage-centre client point to a canvas pixel, then centre a board there
    const tr=canvas.style.transform;
    const mm=tr.match(/translate\\(([-0-9.]+)px,\\s*([-0-9.]+)px\\)\\s*scale\\(([-0-9.]+)\\)/);
    const tx=+mm[1], ty=+mm[2], z=+mm[3];
    const baseW=parseFloat(canvas.style.width), baseH=parseFloat(canvas.style.height);
    const cssX=(cx-rect.left-tx)/z, cssY=(cy-rect.top-ty)/z;
    const px=cssX*(canvas.width/baseW), py=cssY*(canvas.height/baseH);
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    const size=Math.floor(Math.min(canvas.width,canvas.height)*0.62);
    const cell=Math.floor(size/8);
    const ox=Math.round(px-cell*4), oy=Math.round(py-cell*4);
    const diag=await import('/js/diagram.js');
    await window.__drawBoardInto(ctx, diag.START_GRID, ox, oy, cell);
    const pe=t=>new PointerEvent(t,{pointerType:'touch',isPrimary:true,pointerId:13,clientX:cx,clientY:cy,bubbles:true,cancelable:true});
    document.querySelectorAll('.modal-back').forEach(b=>b.remove());  // clear any stray modal
    canvas.dispatchEvent(pe('pointerdown'));
    await new Promise(r=>setTimeout(r,700));
    const modal=[...document.querySelectorAll('.modal-box')].pop();
    const modalText=modal?modal.textContent.slice(0,90):'';
    window.__calibModal=!!modal;
    return { modalShown:!!modal, isCalib: modalText.includes('inicial'), modalText };
  `);

  await shot('calib-dark');
  await evalP(`const a=await import('/js/appearance.js'); a.ColorMode.set('light'); await new Promise(r=>setTimeout(r,120)); return true;`);
  await shot('calib-light');
  await evalP(`const a=await import('/js/appearance.js'); a.ColorMode.set('dark'); return true;`);

  report.calibConfirm = await step('calibConfirm', `
    const app=await import('/js/app.js');
    // click "Yes, it is" on the calibration modal
    const box=[...document.querySelectorAll('.modal-box')].pop();
    const yes=[...box.querySelectorAll('button')].find(b=>b.classList.contains('primary'));
    yes.click();
    // finish the swallowed long-press pointer
    const canvas=document.getElementById('read-canvas');
    canvas.dispatchEvent(new PointerEvent('pointerup',{pointerType:'touch',pointerId:13,bubbles:true}));
    await new Promise(r=>setTimeout(r,300));
    const db=await import('/js/db.js');
    const rec=await db.getBook(window.__bookId);
    const fen=app.Setup.buildFen ? app.Setup.buildFen() : null;
    return { screen:app.activeScreen, setupPlacement:fen?fen.split(' ')[0]:null,
             startPlacement:'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR',
             placementOk: fen && fen.split(' ')[0]==='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR',
             templatesSaved: !!(rec && rec.templates && rec.templates.pieces) };
  `);
  await shot('setup-after-calib');

  // TAP-TO-TEACH, CV level: a book that opens on a NON-start diagram is taught by
  // tapping its pieces. buildTemplatesFromGrid must learn from that midgame layout
  // and then read a LATER (start) diagram in the same style to the exact FEN.
  report.teachCV = await step('teachCV', `
    const diag=await import('/js/diagram.js');
    const m=await window.__makePageCanvas(window.__mid,'pieces');
    const mimg=m.cv.getContext('2d').getImageData(0,0,m.cv.width,m.cv.height);
    const bm=diag.detectBoard(mimg,m.cx,m.cy);
    const tpl=bm?diag.buildTemplatesFromGrid(mimg,bm,window.__mid):null;
    const s=await window.__makePageCanvas(diag.START_GRID,'pieces');
    const simg=s.cv.getContext('2d').getImageData(0,0,s.cv.width,s.cv.height);
    const bs=diag.detectBoard(simg,s.cx,s.cy);
    const res=(bs&&tpl)?diag.classifyBoard(simg,bs,tpl):null;
    const expectStart='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1';
    return { taught:!!tpl, codesLearned: tpl?Object.keys(tpl.pieces).sort().join(''):null,
             allTwelve: tpl?Object.keys(tpl.pieces).length===12:false,
             startFromTaught: res&&res.fen, laterDiagramOk: !!res&&res.fen===expectStart,
             confident: res&&res.confident };
  `);

  // TAP-TO-TEACH, integration: reopen a FRESH (no-templates) book, paint a midgame
  // on the live reader canvas, long-press, answer "No" → the teach modal appears.
  report.teachOpen = await step('teachOpen', `
    const app=await import('/js/app.js');
    const db=await import('/js/db.js');
    await db.updateBookMeta(window.__bookId,{templates:null});   // forget the calib → re-asks
    document.querySelector('#tabbar button[data-screen="read"]').click();
    // wait for the shelf (showScreen refreshes it) before touching the card
    for(let i=0;i<60 && !document.querySelector('#read-grid .read-card');i++) await new Promise(r=>setTimeout(r,100));
    document.querySelector('#read-grid .read-card').click();
    // wait until the reader is actually visible, sized, and the page is drawn —
    // a refresh race can otherwise leave the stage collapsed to 0 width.
    const stage=document.getElementById('read-stage'), canvas=document.getElementById('read-canvas');
    const rx=/translate\\(([-0-9.]+)px,\\s*([-0-9.]+)px\\)\\s*scale\\(([-0-9.]+)\\)/;
    let mm=null;
    for(let i=0;i<80;i++){
      const shown=!document.getElementById('read-reader').classList.contains('hidden');
      mm=canvas.style.transform.match(rx);
      if(shown && stage.clientWidth>10 && mm) break; else mm=null;
      await new Promise(r=>setTimeout(r,100));
    }
    if(!mm) return { teachModalShown:false, err:'reader not ready', transform:canvas.style.transform,
                     stageW:stage.clientWidth, hidden:document.getElementById('read-reader').classList.contains('hidden') };
    // paint a MIDGAME board centred on the tap point
    const rect=stage.getBoundingClientRect();
    const cx=rect.left+rect.width/2, cy=rect.top+rect.height/2;
    const tx=+mm[1], ty=+mm[2], z=+mm[3];
    const baseW=parseFloat(canvas.style.width), baseH=parseFloat(canvas.style.height);
    const px=((cx-rect.left-tx)/z)*(canvas.width/baseW), py=((cy-rect.top-ty)/z)*(canvas.height/baseH);
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    const size=Math.floor(Math.min(canvas.width,canvas.height)*0.62), cell=Math.floor(size/8);
    const ox=Math.round(px-cell*4), oy=Math.round(py-cell*4);
    const diag=await import('/js/diagram.js');
    await window.__drawBoardInto(ctx, window.__mid, ox, oy, cell);
    const dImg=ctx.getImageData(0,0,canvas.width,canvas.height);
    const dBoard=diag.detectBoard(dImg, px, py);
    document.querySelectorAll('.modal-back').forEach(b=>b.remove());
    const pe=t=>new PointerEvent(t,{pointerType:'touch',isPrimary:true,pointerId:14,clientX:cx,clientY:cy,bubbles:true,cancelable:true});
    canvas.dispatchEvent(pe('pointerdown'));
    await new Promise(r=>setTimeout(r,700));                 // hold → calibration modal
    const app2=await import('/js/app.js');
    let calib=[...document.querySelectorAll('.modal-box')].pop();
    const toastEl=document.getElementById('toast');
    if(!calib){ return { teachModalShown:false, err:'no calib modal after long-press',
                         screen:app2.activeScreen, toast:toastEl?toastEl.textContent.slice(0,60):null,
                         cw:canvas.width, ch:canvas.height, cell, px:Math.round(px), py:Math.round(py),
                         directDetect:!!dBoard, z, baseW }; }
    // answer "No" → teachPieces opens its own modal
    const no=[...calib.querySelectorAll('.row button')].find(b=>!b.classList.contains('primary'));
    no.click();
    await new Promise(r=>setTimeout(r,250));
    const box=[...document.querySelectorAll('.modal-box')].pop();
    return { teachModalShown: !!box && !!box.querySelector('.read-teach-grid'),
             cells: box?box.querySelectorAll('.read-teach-grid button').length:0,
             palBtns: box?box.querySelectorAll('.read-teach-pal .pal-btn').length:0 };
  `);

  await shot('teach-dark');
  await evalP(`const a=await import('/js/appearance.js'); a.ColorMode.set('light'); await new Promise(r=>setTimeout(r,120)); return true;`);
  await shot('teach-light');
  await evalP(`const a=await import('/js/appearance.js'); a.ColorMode.set('dark'); return true;`);

  // Fill the teach grid from the midgame layout, submit, and confirm it lands in
  // Setup with that exact position AND that the templates were saved to the book.
  report.teachFill = await step('teachFill', `
    const app=await import('/js/app.js');
    const box=[...document.querySelectorAll('.modal-box')].pop();
    const pal=box.querySelector('.read-teach-pal');
    const cells=box.querySelectorAll('.read-teach-grid button');
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){
      const code=window.__mid[r][c]; if(!code) continue;
      pal.querySelector('.pal-btn[data-piece="'+code+'"]').click();
      cells[r*8+c].click();
    }
    const done=[...box.querySelectorAll('.row button')].find(b=>b.classList.contains('primary'));
    done.click();
    const canvas=document.getElementById('read-canvas');
    canvas.dispatchEvent(new PointerEvent('pointerup',{pointerType:'touch',pointerId:14,bubbles:true}));
    await new Promise(r=>setTimeout(r,300));
    const db=await import('/js/db.js');
    const rec=await db.getBook(window.__bookId);
    const fen=app.Setup.buildFen ? app.Setup.buildFen() : null;
    const expect='r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R';
    return { screen:app.activeScreen, placement: fen?fen.split(' ')[0]:null, expected:expect,
             placementOk: !!fen && fen.split(' ')[0]===expect,
             templatesSaved: !!(rec && rec.templates && rec.templates.pieces) };
  `);
  await shot('setup-after-teach');

  // BOARD FLIP (the orientation answer): flipping the start position rotates it
  // 180°, so the back rank's king and queen swap files and colours change ends.
  report.flip = await step('flip', `
    const app=await import('/js/app.js');
    app.Setup.open('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1');
    await new Promise(r=>setTimeout(r,80));
    const before=app.Setup.buildFen().split(' ')[0];
    app.Setup.flip();
    const after=app.Setup.buildFen().split(' ')[0];
    const expect='RNBKQBNR/PPPPPPPP/8/8/8/8/pppppppp/rnbkqbnr';
    // flip is its own inverse: flipping twice returns the original
    app.Setup.flip();
    const back=app.Setup.buildFen().split(' ')[0];
    return { before, after, expect, flipOk: after===expect, involution: back===before };
  `);

  console.log(JSON.stringify(report, null, 2));
}

main().then(() => { try { ws?.close(); } catch {} chrome.kill(); process.exit(0); })
      .catch(e => { console.error('VERIFY ERROR:', e.message); try { ws?.close(); } catch {} chrome.kill(); process.exit(1); });
