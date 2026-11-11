const until2 = async (expr, ms = 10000) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (await ev(`return !!(${expr});`)) return true; await sleep(100); } return false; };
const CSS = `
.wall-btn{display:flex;align-items:center;gap:12px;width:100%;margin-top:12px;padding:12px 14px;border-radius:var(--radius);
  background:var(--gold-bg);border:1px solid color-mix(in srgb,var(--gold) 45%,transparent);color:var(--text);text-align:left;font:inherit;cursor:pointer}
.wall-btn img{width:40px;height:40px;flex:0 0 auto}
.wall-btn .wb-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.wall-btn b{color:var(--gold);font-size:16px}
.wall-btn small{color:var(--muted);font-size:13px}
.wall-btn .wb-arrow{color:var(--gold);font-size:24px;font-weight:700}
#screen-wall .screen-head h2{display:flex;align-items:center;gap:8px;font-size:21px;white-space:nowrap;min-width:0}
#screen-wall .screen-head h2 img{width:28px;height:28px}
.wall-sub{color:var(--muted);font-size:13px;margin:-2px 0 10px}
.podium{display:grid;grid-template-columns:1fr 1.15fr 1fr;align-items:end;gap:8px;margin:26px 0 14px}
.pod{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0}
.pod-av{position:relative}
.pod-av .avatar-badge{border-radius:50%;box-shadow:0 0 0 3px var(--gold-bg),0 0 0 4px color-mix(in srgb,var(--gold) 55%,transparent)}
.pod.p1 .pod-av .avatar-badge{box-shadow:0 0 0 3px var(--gold),0 0 18px -2px var(--gold-glow)}
.pod-crown{position:absolute;top:-22px;left:50%;transform:translateX(-50%);font-size:20px}
.pod-tier{position:absolute;right:-8px;bottom:-6px;width:30px;height:30px}
.pod-name{font-weight:700;font-size:14px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:6px}
.pod-days{color:var(--gold);font-weight:800;font-size:15px;font-variant-numeric:tabular-nums}
.pod-step{width:100%;border-radius:10px 10px 4px 4px;display:flex;align-items:flex-start;justify-content:center;padding-top:8px;
  font-size:22px;font-weight:800;color:var(--gold);
  background:linear-gradient(to bottom,color-mix(in srgb,var(--gold) 34%,var(--panel)),var(--panel));
  border:1px solid color-mix(in srgb,var(--gold) 40%,transparent);border-bottom:none}
.p1 .pod-step{height:78px}.p2 .pod-step{height:56px}.p3 .pod-step{height:40px}
.wall-list{display:flex;flex-direction:column;gap:6px;padding-bottom:20px}
.wall-val{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-variant-numeric:tabular-nums}
.wall-val img{width:24px;height:24px}
.wall-me-label{color:var(--muted);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin:0 0 6px 4px}
.wall-me{box-shadow:inset 0 0 0 2px var(--accent)!important;background:var(--panel)!important;margin-bottom:14px}
.wall-me .lb-name small{color:var(--muted);font-weight:500;font-size:12px;margin-left:4px}
`;
const TIERS = [[1,'flame1'],[7,'flame2'],[15,'flame3'],[30,'flame4'],[60,'flame5'],[120,'flame6'],[150,'pawn1'],[210,'pawn2'],[240,'pawn3'],[270,'pawn4'],[300,'pawn5'],[360,'pawn6'],[420,'knight1']];
const tierOf = n => TIERS.filter(t => t[0] <= n).pop()[1];
const PEOPLE = [['ReyDeLaNoche','owl',412],['Caissa_92','queen_b',365],['MateEnDos','knight_w',298],['PeónPasado','pawn_b',240],['Tal_fan','eagle',186],
  ['LaTorreFuerte','rook_w',121],['Alfil_Loco','bishop_b',95],['GambitoDama','queen_w',64],['Ana_chess','lion',45],['Enroque','wolf',31],['Zwischenzug','raven',28],['Celda7','bear',24]];
const T = { es: { title: 'Muro de Fuego', sub: 'Las rachas más largas de ahora mismo', now: 'Ahora', rec: 'Récord', back: 'Atrás', d: 'días', pos: 'Estás en el puesto 23 de 412', you: 'tú', mine: 'Tu puesto' },
            en: { title: 'Wall of Flames', sub: 'The longest streaks right now', now: 'Now', rec: 'Record', back: 'Back', d: 'days', pos: 'You are 23rd of 412', you: 'you', mine: 'Your place' } };
const killPop = `document.querySelectorAll('body *').forEach(e => { const cs = getComputedStyle(e); if (cs.position === 'fixed' && /LOGRO|BADGE|ACHIEVEMENT|Racha: 1|Streak: 1/i.test(e.textContent) && e.textContent.length < 200) e.remove(); });`;
for (const lang of ['es', 'en']) for (const scheme of ['light', 'dark']) {
  const L = T[lang], tag = `${lang}-${scheme}`;
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 760, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  await send('Page.navigate', { url: `http://127.0.0.1:${WEB}/` }); await sleep(1500);
  await ev(`localStorage.setItem('lang','${lang}'); const db = await import('/js/db.js'); const d = new Date(); const ds = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    await db.kvSet('tourDone','completed'); await db.kvSet('onboardingDone', true); await db.kvSet('remindInvite',{never:true}); await db.kvSet('avatarId','pawn_w');
    await db.kvSet('streakCount', 23); await db.kvSet('streakLastDate', ds); await db.kvSet('bestStreak', 23); await db.kvSet('profileName','Zugzwang'); return true;`);
  await send('Page.reload', {}); await until2(`document.getElementById('btn-profile')`); await sleep(2500);
  await ev(`document.querySelectorAll('.modal-back,#tour-root').forEach(e=>e.remove()); document.getElementById('btn-profile').click(); return true;`); await sleep(1200);
  await ev(`document.querySelectorAll('.modal-back,#tour-root').forEach(e=>e.remove());
    const st = document.createElement('style'); st.textContent = ${JSON.stringify(CSS)}; document.head.appendChild(st);
    const b = document.createElement('button'); b.className = 'wall-btn';
    b.innerHTML = ${JSON.stringify(`<img src="streaks/flame3.png" alt=""><span class="wb-txt"><b>${L.title}</b><small>${L.pos}</small></span><span class="wb-arrow">›</span>`)};
    document.getElementById('profile-streak-ladder').after(b);
    const card = b.closest('.profile-card'); const m = document.querySelector('main'); m.scrollTop += card.getBoundingClientRect().top - 70; return true;`);
  await ev(killPop + 'return true;'); await sleep(500); await shot(`${tag}-1-button`);
  const av = (id, s) => `<div class="avatar-badge" style="width:${s}px;height:${s}px"><img src="avatars/${id}.png" alt="" width="${s}" height="${s}"></div>`;
  const pod = (p, cls, crown) => `<div class="pod ${cls}"><div class="pod-av">${crown ? '<span class="pod-crown">👑</span>' : ''}${av(p[1], cls === 'p1' ? 72 : 58)}<img class="pod-tier" src="streaks/${tierOf(p[2])}.png" alt=""></div>
    <div class="pod-name">${p[0]}</div><div class="pod-days">${p[2]} ${L.d}</div><div class="pod-step">${cls[1]}</div></div>`;
  const rows = PEOPLE.slice(3).map((p, i) => `<button class="lb-row ${i + 4 <= 10 ? 'tier-top10' : 'tier-top100'}"><span class="lb-rank">${i + 4}</span>${av(p[1], 36)}<span class="lb-name">${p[0]}</span><span class="wall-val"><img src="streaks/${tierOf(p[2])}.png" alt="">${p[2]}</span></button>`).join('');
  const html = `<img src="icons/logo-mark.png" class="watermark" alt=""><div class="row screen-head"><button class="btn">${L.back}</button><h2><img src="streaks/flame1.png" alt="">${L.title}</h2></div>
    <div class="wall-sub">${L.sub}</div>
    <div class="seg"><button class="on">🔥 ${L.now}</button><button>🏆 ${L.rec}</button></div>
    <div class="podium">${pod(PEOPLE[1], 'p2')}${pod(PEOPLE[0], 'p1', true)}${pod(PEOPLE[2], 'p3')}</div>
    <div class="wall-me-label">${L.mine}</div>
    <button class="lb-row wall-me"><span class="lb-rank">23</span>${av('pawn_w', 36)}<span class="lb-name">Zugzwang<small>(${L.you})</small></span><span class="wall-val"><img src="streaks/flame3.png" alt="">23</span></button>
    <div class="wall-list list">${rows}</div>`;
  await ev(`document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const s = document.createElement('section'); s.id = 'screen-wall'; s.className = 'screen'; s.innerHTML = ${JSON.stringify(html)};
    document.getElementById('screen-profile').after(s); const tn = document.getElementById('app-title-name'); if (tn) tn.textContent = ${JSON.stringify(L.title)}; document.querySelector('main').scrollTop = 0; return true;`);
  await sleep(900); await ev(killPop + 'return true;'); await shot(`${tag}-2-wall`);
  console.log(tag, await ev(`return [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && e.offsetParent).slice(0,6).map(e => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right));`));
  console.log(tag, 'horizontal overflow px:', await ev(`return document.documentElement.scrollWidth - innerWidth;`));
}
console.log(errors.length ? errors.slice(0, 5).join('\n') : 'no page errors');
ws.close(); chrome.kill(); server.close(); process.exit(0);
