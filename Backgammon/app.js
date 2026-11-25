// Backgammon – Handy-Oberfläche. Ablauf wie in der Windows-App (F:\Claude\Spielesammlung\Backgammon\src\Gui.cs).
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const UI_FONT = '"Segoe UI", system-ui, Roboto, sans-serif';
  const LEVEL_NAMES = ['', 'Leicht', 'Mittel', 'Schwer'];
  const BOARDS = [['Holz', '#4A2F1C', '#DCC29A', '#9C3D2E', '#3C3C3C'], ['Grün', '#3A2A1C', '#2F6B45', '#D8C9A3', '#8C2F2F'],
                  ['Blau', '#26303A', '#2B4F72', '#DCDCDC', '#9B3B3B'], ['Grau', '#2A2A2A', '#4A4A4A', '#BDBDBD', '#777777'],
                  ['Rot', '#3A1E1E', '#6E2A2A', '#E0D0B0', '#2E2E2E']];
  const STONES = [['Klassisch', '#F4F1EA', '#2A2A2A'], ['Rot', '#F4F1EA', '#B23A3A'], ['Holz', '#E8C99A', '#5A3A22'], ['Blau', '#EDEDED', '#2F5A96'], ['Grau', '#D6D6D6', '#555555']];
  const LOOK = { board: 0, stones: 0, pips: true, moves: true, auto: false };
  const DEFAULTS = Object.assign({ level: 2, two: false, cube: true }, LOOK);
  const BAR = 100, OFF = 200;

  function load(k, def) { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : def; } catch (e) { return def; } }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* privates Fenster */ } }
  let cfg = Object.assign({}, DEFAULTS, load('backgammon.einstellungen', {}));
  if (!(cfg.level >= 1 && cfg.level <= 3)) cfg.level = 2;
  if (!(cfg.board >= 0 && cfg.board < BOARDS.length)) cfg.board = 0;
  if (!(cfg.stones >= 0 && cfg.stones < STONES.length)) cfg.stones = 0;
  let stats = load('backgammon.statistik', []);
  if (!Array.isArray(stats)) stats = [];

  // ---------------------------------------------------------------- Zustand (Seite 0 = unten, 1 = oben)
  let board = BG.start(), turnStart = null, phase = 'opening', turn = 0, d1 = 0, d2 = 0, remaining = [], turnSteps = [];
  let cube = 1, cubeOwner = -1, score = [0, 0], log = [], two = false, cubeOn = true, level = 2, thinking = false, runId = 0;
  let selected = -1, targets = new Map(), winner = -1, points = 0, kind = '', note = null, hintText = null, hintArrows = [];
  let gameKey = '', hints = 0, undos = 0, turns = 0;
  const human = side => two || side === 0;
  const sideName = side => two ? (side === 0 ? 'Unten' : 'Oben') : side === 0 ? 'Du' : 'Computer';
  const spotOf = (side, rel) => rel === 25 ? BAR : rel === 0 ? OFF : BG.abs(side, rel);
  const relOf = (side, spot) => spot === BAR ? 25 : spot === OFF ? 0 : side === 0 ? spot : 25 - spot;
  const allowedNow = () => phase === 'move' ? BG.allowed(board, turn, remaining) : [];

  // ---------------------------------------------------------------- Zeichnen
  function rgb(hex) { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  function mix(hex, to, k) { const a = rgb(hex), b = rgb(to); return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',') + ')'; }
  const isLight = hex => { const c = rgb(hex); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255 > 0.55; };
  function sizeCanvas(c, w, h) {
    const dpr = window.devicePixelRatio || 1, pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
    const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return ctx;
  }
  // Stein wie bei Dame: Scheibe mit Rillen; (cx, cy) Mitte, d Durchmesser
  function drawStone(ctx, cx, cy, d, c) {
    const light = isLight(c), edge = light ? mix(c, '#000000', 0.35) : mix(c, '#FFFFFF', 0.3), th = d * 0.08, x = cx - d / 2, y = cy - d / 2;
    const ell = (ex, ey, ew) => { ctx.beginPath(); ctx.ellipse(ex + ew / 2, ey + ew / 2, ew / 2, ew / 2, 0, 0, Math.PI * 2); };
    ctx.fillStyle = 'rgba(0,0,0,.27)'; ell(x + d * 0.02, y + th + d * 0.05, d); ctx.fill();
    ctx.fillStyle = mix(c, '#000000', light ? 0.3 : 0.45); ell(x, y + th, d); ctx.fill();
    ctx.fillStyle = c; ell(x, y, d); ctx.fill();
    ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1, d / 40);
    ell(x, y, d); ctx.stroke(); ell(x + d * 0.14, y + d * 0.14, d * 0.72); ctx.stroke(); ell(x + d * 0.26, y + d * 0.26, d * 0.48); ctx.stroke();
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const PIPS = [null, [.5, .5], [.27, .27, .73, .73], [.25, .25, .5, .5, .75, .75], [.27, .27, .73, .27, .27, .73, .73, .73],
                [.25, .25, .75, .25, .5, .5, .25, .75, .75, .75], [.27, .24, .73, .24, .27, .5, .73, .5, .27, .76, .73, .76]];
  function drawDie(ctx, v, x, y, s, face, pip, alpha) {
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,.27)'; rr(ctx, x + s * 0.03, y + s * 0.06, s, s, s * 0.18); ctx.fill();
    rr(ctx, x, y, s, s, s * 0.18); ctx.fillStyle = face; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.43)'; ctx.lineWidth = Math.max(1, s / 40); ctx.stroke();
    if (v >= 1) { ctx.fillStyle = pip; const p = PIPS[v]; for (let i = 0; i < p.length; i += 2) { ctx.beginPath(); ctx.arc(x + p[i] * s, y + p[i + 1] * s, s * 0.085, 0, Math.PI * 2); ctx.fill(); } }
    ctx.restore();
  }

  // Maße des Bretts für Breite W, Höhe H
  function geometry(W, H) {
    const fx = Math.max(5, W * 0.018), fy = Math.max(11, H * 0.055), tw = W * 0.075;
    const area = { x: fx, y: fy, w: W - 3 * fx - tw, h: H - 2 * fy };
    const bw = area.w * 0.075, hw = (area.w - bw) / 2, pw = hw / 6;
    const g = { W, H, area, bw, pw, leftX: area.x, barX: area.x + hw, rightX: area.x + hw + bw, tray: { x: area.x + area.w + fx, y: area.y, w: tw, h: area.h },
                mid: area.y + area.h / 2 };
    g.d = Math.min(pw * 0.94, (area.h / 2 - 6) / 5.4);
    return g;
  }
  function column(g, p) {
    let x, top;
    if (p <= 6) { x = g.rightX + (6 - p) * g.pw; top = false; } else if (p <= 12) { x = g.leftX + (12 - p) * g.pw; top = false; }
    else if (p <= 18) { x = g.leftX + (p - 13) * g.pw; top = true; } else { x = g.rightX + (p - 19) * g.pw; top = true; }
    return { x, top, y: top ? g.area.y : g.mid };
  }
  function slot(g, p, i) { const c = column(g, p), k = Math.min(i, 4); return [c.x + g.pw / 2, c.top ? g.area.y + g.d / 2 + k * g.d : g.area.y + g.area.h - g.d / 2 - k * g.d]; }
  function spotAt(g, x, y) {
    const t = g.tray, a = g.area;
    if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) return OFF;
    if (x < a.x || x > a.x + a.w || y < a.y || y > a.y + a.h) return -1;
    if (x >= g.barX && x < g.rightX) return BAR;
    const right = x >= g.rightX, col = Math.max(0, Math.min(5, Math.floor((x - (right ? g.rightX : g.leftX)) / g.pw))), top = y < g.mid;
    return right ? (top ? 19 + col : 6 - col) : (top ? 13 + col : 12 - col);
  }

  // st = { b, turn, dice, used, cube, owner, cubeOn, sources, targets, selected, hint, last, center, look }
  function paintBoard(ctx, W, H, st) {
    const g = geometry(W, H), a = g.area, t = BOARDS[st.look.board], [, myC, opC] = STONES[st.look.stones];
    const [, frame, felt, triA, triB] = t;
    ctx.clearRect(0, 0, W, H);
    rr(ctx, 0, 0, W, H, 8); ctx.fillStyle = frame; ctx.fill();
    ctx.fillStyle = felt; ctx.fillRect(g.leftX, a.y, g.barX - g.leftX, a.h); ctx.fillRect(g.rightX, a.y, a.x + a.w - g.rightX, a.h);
    ctx.fillStyle = mix(frame, '#FFFFFF', 0.12); ctx.fillRect(g.barX, a.y, g.bw, a.h);
    ctx.fillStyle = mix(frame, '#000000', 0.25); ctx.fillRect(g.tray.x, g.tray.y, g.tray.w, g.tray.h);
    const th = a.h * 0.42;
    ctx.font = '600 ' + Math.max(8, Math.min(11, g.pw * 0.38)) + 'px ' + UI_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let p = 1; p <= 24; p++) {
      const c = column(g, p);
      ctx.fillStyle = p % 2 === 0 ? triA : triB;
      ctx.beginPath();
      if (c.top) { ctx.moveTo(c.x + 1, a.y); ctx.lineTo(c.x + g.pw - 1, a.y); ctx.lineTo(c.x + g.pw / 2, a.y + th); }
      else { ctx.moveTo(c.x + 1, a.y + a.h); ctx.lineTo(c.x + g.pw - 1, a.y + a.h); ctx.lineTo(c.x + g.pw / 2, a.y + a.h - th); }
      ctx.fill();
      if (st.last.has(p)) { ctx.fillStyle = 'rgba(255,220,80,.27)'; ctx.fillRect(c.x, c.y, g.pw, a.h / 2); }
      if (st.look.moves && st.sources.has(p) && st.selected < 0) { ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(c.x, c.y, g.pw, a.h / 2); }
      if (st.selected === p) { ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(c.x, c.y, g.pw, a.h / 2); }
      ctx.fillStyle = mix(frame, '#FFFFFF', 0.55);
      ctx.fillText(String(p), c.x + g.pw / 2, c.top ? a.y / 2 : a.y + a.h + (H - a.y - a.h) / 2);
    }
    const cnt = (x, y, n, col) => { ctx.fillStyle = isLight(col) ? '#1C1C1C' : '#FFFFFF'; ctx.font = '600 ' + Math.max(9, g.d * 0.4) + 'px ' + UI_FONT; ctx.fillText(String(n), x, y); };
    for (let p = 1; p <= 24; p++) {
      const v = st.b.pts[p];
      if (!v) continue;
      const n = Math.abs(v), col = v > 0 ? myC : opC;
      for (let i = 0; i < Math.min(n, 5); i++) { const [x, y] = slot(g, p, i); drawStone(ctx, x, y, g.d, col); }
      if (n > 5) { const [x, y] = slot(g, p, 4); cnt(x, y, n, col); }
    }
    for (let side = 0; side < 2; side++) for (let i = 0; i < Math.min(st.b.bar[side], 4); i++) {
      const y = side === 0 ? g.mid + g.d * 0.7 + i * g.d : g.mid - g.d * 0.7 - i * g.d, col = side === 0 ? myC : opC;
      drawStone(ctx, g.barX + g.bw / 2, y, g.d, col);
      if (i === 3 && st.b.bar[side] > 4) cnt(g.barX + g.bw / 2, y, st.b.bar[side], col);
    }
    if (st.selected === BAR) { ctx.fillStyle = 'rgba(255,255,255,.27)'; ctx.fillRect(g.barX, a.y, g.bw, a.h); }
    const sh = a.h * 0.42 / 15;
    for (let side = 0; side < 2; side++) for (let i = 0; i < st.b.off[side]; i++) {
      const y = side === 0 ? a.y + a.h - (i + 1) * sh : a.y + i * sh;
      ctx.fillStyle = side === 0 ? myC : opC; ctx.fillRect(g.tray.x + g.tray.w * 0.12, y + 0.5, g.tray.w * 0.76, sh - 1);
      ctx.strokeStyle = 'rgba(0,0,0,.47)'; ctx.lineWidth = 1; ctx.strokeRect(g.tray.x + g.tray.w * 0.12, y + 0.5, g.tray.w * 0.76, sh - 1);
    }
    for (const s of st.targets) {
      if (s === OFF) { ctx.strokeStyle = '#E6E6E6'; ctx.lineWidth = 2; ctx.strokeRect(g.tray.x + 2, g.tray.y + 2, g.tray.w - 4, g.tray.h - 4); continue; }
      if (s < 1 || s > 24) continue;
      const own = st.b.pts[s] * (st.turn === 0 ? 1 : -1), [x, y] = slot(g, s, Math.max(0, own));
      ctx.beginPath(); ctx.arc(x, y, g.d * 0.22, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
      ctx.strokeStyle = 'rgba(30,30,30,.8)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    const hx = st.turn === 0 ? g.rightX + (a.x + a.w - g.rightX) / 2 : g.leftX + (g.barX - g.leftX) / 2;
    if (st.dice.length) {
      const ds = Math.min(g.pw * 0.8, g.d * 0.95), gap = ds * 0.25, total = st.dice.length * ds + (st.dice.length - 1) * gap;
      const face = st.turn === 0 ? myC : opC, pip = isLight(face) ? '#1C1C1C' : '#F2F2F2';
      st.dice.forEach((v, i) => drawDie(ctx, v, hx - total / 2 + i * (ds + gap), g.mid - ds / 2, ds, face, pip, i < st.used ? 0.35 : 1));
    } else if (st.center) {
      ctx.font = '600 ' + Math.max(11, Math.min(15, g.pw * 0.45)) + 'px ' + UI_FONT;
      const w = ctx.measureText(st.center).width + 22, h = Math.max(22, g.pw * 0.75);
      rr(ctx, hx - w / 2, g.mid - h / 2, w, h, h / 2); ctx.fillStyle = 'rgba(0,0,0,.67)'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(st.center, hx, g.mid + 1);
    }
    if (st.cubeOn) {
      const cs = g.bw * 0.78;
      let cy = st.owner === 0 ? a.y + a.h - cs - 4 : st.owner === 1 ? a.y + 4 : g.mid - cs / 2;
      if (st.owner < 0 && (st.b.bar[0] || st.b.bar[1])) cy = a.y + a.h * 0.12;
      drawDie(ctx, 0, g.barX + (g.bw - cs) / 2, cy, cs, '#EDEDED', '#000', 1);
      ctx.fillStyle = '#1C1C1C'; ctx.font = '600 ' + (cs * 0.42) + 'px ' + UI_FONT; ctx.fillText(st.cube <= 1 ? '64' : String(st.cube), g.barX + g.bw / 2, cy + cs / 2 + 1);
    }
    if (st.hint.length) {
      const end = (spot, from) => {
        if (spot === OFF) return [g.tray.x + g.tray.w / 2, st.turn === 0 ? a.y + a.h * 0.8 : a.y + a.h * 0.2];
        if (spot === BAR) return [g.barX + g.bw / 2, st.turn === 0 ? g.mid + g.d * 1.2 : g.mid - g.d * 1.2];
        const n = Math.abs(st.b.pts[spot]);
        return slot(g, spot, from ? Math.max(0, n - 1) : (st.b.pts[spot] * (st.turn === 0 ? 1 : -1) > 0 ? n : 0));
      };
      ctx.strokeStyle = 'rgba(40,160,70,.82)'; ctx.fillStyle = 'rgba(40,160,70,.82)'; ctx.lineWidth = Math.max(3, g.d * 0.16); ctx.lineCap = 'round';
      st.hint.forEach(([f, to], i) => {
        const off = (i % 2 === 0 ? 1 : -1) * Math.floor(i / 2) * g.d * 0.18;
        const [x1, y1] = end(f, true), [x2, y2] = end(to, false), an = Math.atan2(y2 - y1, x2 - x1), hl = g.d * 0.5;
        ctx.beginPath(); ctx.moveTo(x1 + off, y1); ctx.lineTo(x2 + off - Math.cos(an) * hl * 0.6, y2 - Math.sin(an) * hl * 0.6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x2 + off, y2);
        ctx.lineTo(x2 + off - Math.cos(an - 0.5) * hl, y2 - Math.sin(an - 0.5) * hl); ctx.lineTo(x2 + off - Math.cos(an + 0.5) * hl, y2 - Math.sin(an + 0.5) * hl);
        ctx.closePath(); ctx.fill();
      });
    }
    return g;
  }

  const cv = $('board'), wrap = $('boardWrap');
  let geo = null, lastTo = new Set();
  function draw() {
    const W0 = wrap.clientWidth, H0 = wrap.clientHeight;
    if (W0 < 60 || H0 < 40) return;
    const W = Math.floor(Math.min(W0, H0 * 1.35)), H = Math.floor(W / 1.35);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const my = phase === 'move' && human(turn) && !thinking;
    const sources = new Set(), tg = new Set();
    if (my) { for (const s of allowedNow()) sources.add(spotOf(turn, s.from)); if (selected >= 0) for (const k of targets.keys()) tg.add(spotOf(turn, k)); }
    geo = paintBoard(sizeCanvas(cv, W, H), W, H, {
      b: board, turn, dice: phase === 'move' ? turnSteps.map(s => s.die).concat(remaining) : [], used: turnSteps.length, cube, owner: cubeOwner, cubeOn,
      sources, targets: tg, selected: my && selected >= 0 ? spotOf(turn, selected) : -1, hint: hintArrows, last: lastTo,
      center: phase === 'opening' ? 'Eröffnungswurf' : phase === 'roll' && human(turn) ? 'Würfeln' : null, look: cfg
    });
  }
  cv.addEventListener('pointerdown', e => {
    if (!geo || phase !== 'move' || !human(turn) || thinking) return;
    const r = cv.getBoundingClientRect(), s = spotAt(geo, e.clientX - r.left, e.clientY - r.top);
    if (s >= 0) onSpot(s);
  });

  // ---------------------------------------------------------------- Anzeige
  function el_(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function render() {
    for (const side of [0, 1]) {
      const el = side === 0 ? $('pBottom') : $('pTop');
      el.innerHTML = '';
      el.classList.toggle('active', phase !== 'over' && phase !== 'opening' && turn === side);
      const c = document.createElement('canvas'); c.style.width = c.style.height = '30px';
      const ctx = sizeCanvas(c, 30, 30); drawStone(ctx, 15, 14, 24, side === 0 ? STONES[cfg.stones][1] : STONES[cfg.stones][2]);
      const st = phase === 'over' ? (winner === side ? 'gewinnt ' + points : 'verliert') :
                 turn === side && phase !== 'opening' ? (thinking && !human(side) ? 'denkt nach …' : phase === 'roll' ? 'würfelt' : 'zieht') : '';
      const title = two ? (side === 0 ? 'Spieler unten' : 'Spieler oben') : side === 0 ? 'Du' : 'Computer';
      const sub = (two || side === 0 ? '' : LEVEL_NAMES[level] + ' · ') + score[side] + (score[side] === 1 ? ' Punkt' : ' Punkte') + (st ? ' · ' + st : '');
      const names = el_('div', 'names'); names.append(el_('div', 'title', title), el_('div', 'sub', sub));
      el.append(c, names);
      if (cfg.pips) { const v = el_('div', 'val'); v.append(el_('b', null, String(BG.pips(board, side))), el_('span', null, 'Pips')); el.append(v); }
    }
    const list = $('moveList');
    list.innerHTML = '';
    if (!log.length) list.append(el_('div', 'empty', 'Noch keine Züge.'));
    const shown = log.slice(-60);
    shown.forEach((s, i) => { const r = el_('div', 'mrow'); r.append(el_('span', 'ply' + (i === shown.length - 1 ? ' cur' : ''), s)); list.append(r); });
    if (list.lastChild) list.lastChild.scrollIntoView({ block: 'nearest', inline: 'end' });
    $('sub').textContent = sideName(0) + ' ' + score[0] + ' : ' + score[1] + ' ' + sideName(1) + (cubeOn ? ' · Doppler ' + cube : '');
    renderButtons(); renderStatus(); draw();
  }
  const canDouble = side => cubeOn && phase === 'roll' && turn === side && (cubeOwner < 0 || cubeOwner === side) && cube < 64;
  function renderButtons() {
    const h = human(turn) && !thinking, done = phase === 'move' && allowedNow().length === 0, main = $('bMain');
    let text = 'Würfeln', on = false;
    if (phase === 'opening') { text = 'Eröffnung'; on = !thinking; } else if (phase === 'roll') { on = h; }
    else if (phase === 'move') { text = 'Zug beenden'; on = h && done; } else { text = 'Nächste Partie'; on = true; }
    main.querySelector('span').textContent = text; main.disabled = !on; main.classList.toggle('primary', on);
    $('bDouble').disabled = !(h && canDouble(turn));
    $('bUndo').disabled = !(h && phase === 'move' && turnSteps.length > 0);
    $('bHint').disabled = !(h && phase === 'move' && !done);
    $('bResign').disabled = phase === 'over' || phase === 'opening' || thinking || (two ? false : false);
  }
  function renderStatus() {
    let s;
    if (phase === 'over') s = (two ? sideName(winner) + ' gewinnt ' : winner === 0 ? 'Du gewinnst ' : 'Der Computer gewinnt ') + points + (points === 1 ? ' Punkt' : ' Punkte') + ' (' + kind + ').';
    else if (thinking) s = 'Der Computer ' + (phase === 'roll' ? 'überlegt …' : 'zieht …');
    else if (hintText) s = hintText;
    else if (note) s = note;
    else if (phase === 'opening') s = 'Beide würfeln je einen Würfel – wer höher wirft, beginnt.';
    else if (phase === 'roll') s = (two ? sideName(turn) + ' ist dran: ' : 'Du bist dran: ') + 'würfeln' + (canDouble(turn) ? ' oder verdoppeln.' : '.');
    else {
      const al = allowedNow();
      if (!al.length) s = (turnSteps.length ? '' : 'Kein Zug möglich. ') + '„Zug beenden“ oder „Zurück“.';
      else if (selected >= 0) s = 'Tippe auf ein Ziel (heller Punkt).';
      else s = board.bar[turn] > 0 ? 'Erst den Stein von der Bar einsetzen.' : 'Tippe auf einen Stein (hell hinterlegt).';
    }
    $('status').textContent = s;
    $('info').textContent = two ? 'Zwei Spieler' : 'Computer: ' + LEVEL_NAMES[level] + (cubeOn ? '   ·   mit Doppler' : '');
  }

  // ---------------------------------------------------------------- Ablauf
  const delay = ms => new Promise(r => setTimeout(r, ms));
  function newGame(t, withCube, lvl, announce) {
    runId++; thinking = false;
    two = t; cubeOn = withCube; level = lvl;
    board = BG.start(); phase = 'opening'; turn = 0; remaining = []; turnSteps = [];
    cube = 1; cubeOwner = -1; winner = -1; points = 0; kind = ''; selected = -1; targets = new Map();
    hints = undos = turns = 0; hintText = null; hintArrows = []; lastTo = new Set();
    note = announce ? 'Neue Partie.' : null;
    gameKey = String(Date.now());
    log.push('— Neue Partie' + (cubeOn ? ' mit Doppler' : '') + ' —');
    saveGame();
  }
  function mainAction() {
    if (thinking) return;
    if (phase === 'opening') openingRoll();
    else if (phase === 'roll') { if (human(turn)) { roll(); render(); } }
    else if (phase === 'move') { if (human(turn) && !allowedNow().length) endTurn(); }
    else { newGame(two, cubeOn, level, true); render(); }
  }
  const die = () => 1 + Math.floor(Math.random() * 6);
  function openingRoll() {
    const a = die(), b = die();
    if (a === b) { note = 'Beide werfen ' + a + ' – noch einmal würfeln.'; render(); return; }
    turn = a > b ? 0 : 1;
    log.push('Eröffnung: ' + sideName(0) + ' ' + a + ', ' + sideName(1) + ' ' + b + ' – ' + sideName(turn) + (turn === 0 && !two ? ' beginnst.' : ' beginnt.'));
    note = null;
    startMove(Math.max(a, b), Math.min(a, b));
    render();
    if (!human(turn)) computerMoves();
  }
  function roll() { startMove(die(), die()); }
  function startMove(a, b) {
    d1 = a; d2 = b; remaining = BG.diceList(a, b); turnSteps = []; turnStart = BG.copy(board);
    phase = 'move'; selected = -1; targets = new Map(); hintText = null; hintArrows = []; note = null;
    saveGame();
    if (human(turn) && !allowedNow().length) note = 'Mit ' + a + '-' + b + ' ist kein Zug möglich.';
  }
  function buildTargets(fromRel) {
    const res = new Map();
    (function explore(b, dice, from, path) {
      for (const s of BG.allowed(b, turn, dice)) {
        if (s.from !== from) continue;
        const p = path.concat([s]);
        if (!res.has(s.to) || res.get(s.to).length > p.length) res.set(s.to, p);
        if (s.to === 0) continue;
        const c = BG.copy(b); BG.apply(c, turn, s);
        const rest = dice.slice(); rest.splice(rest.indexOf(s.die), 1);
        explore(c, rest, s.to, p);
      }
    })(board, remaining, fromRel, []);
    return res;
  }
  function onSpot(spot) {
    const rel = relOf(turn, spot);
    if (selected >= 0 && targets.has(rel)) { doSteps(targets.get(rel)); return; }
    const src = allowedNow().some(s => s.from === rel);
    if (src && rel !== selected) { selected = rel; targets = buildTargets(rel); } else { selected = -1; targets = new Map(); }
    render();
  }
  function doSteps(steps) {
    for (const s of steps) { BG.apply(board, turn, s); remaining.splice(remaining.indexOf(s.die), 1); turnSteps.push(s); }
    selected = -1; targets = new Map(); hintText = null; hintArrows = []; note = null;
    if (board.off[turn] === 15 || (!allowedNow().length && cfg.auto)) { endTurn(); return; }
    render();
  }
  function undo() {
    if (phase !== 'move' || !human(turn) || !turnSteps.length) return;
    board = BG.copy(turnStart); remaining = BG.diceList(d1, d2); turnSteps = [];
    selected = -1; targets = new Map(); hintText = null; hintArrows = []; undos++; note = 'Zug zurückgesetzt.';
    render();
  }
  function moveText() { return d1 + '-' + d2 + ': ' + (turnSteps.length ? turnSteps.map(BG.stepText).join(' ') : 'kein Zug möglich'); }
  function endTurn() {
    log.push(sideName(turn) + '  ' + moveText());
    lastTo = new Set(turnSteps.filter(s => s.to > 0).map(s => BG.abs(turn, s.to)));
    turns++;
    if (board.off[turn] === 15) { const k = BG.winKind(board, turn); gameOver(turn, k * cube, ['', 'Einfach', 'Gammon', 'Backgammon'][k]); return; }
    turn = 1 - turn; phase = 'roll'; remaining = []; turnSteps = [];
    selected = -1; targets = new Map(); hintText = null; hintArrows = []; note = null;
    saveGame(); render();
    if (!human(turn)) computerTurn();
  }
  async function gameOver(w, pts, what) {
    winner = w; points = pts; kind = what; score[w] += pts; phase = 'over'; thinking = false;
    log.push('→ ' + sideName(w) + (w === 0 && !two ? ' gewinnst ' : ' gewinnt ') + pts + (pts === 1 ? ' Punkt' : ' Punkte') + ' (' + what + ')');
    const rec = { id: gameKey, datum: new Date().toISOString(), zwei: two, stufe: level, ergebnis: w === 0 ? 1 : -1, punkte: pts, art: what, doppler: cube, zuege: turns, tipps: hints, zurueck: undos };
    stats.push(rec); store('backgammon.statistik', stats);
    saveGame(); render();
    const msg = (two ? sideName(w) + ' gewinnt ' : w === 0 ? 'Du gewinnst ' : 'Der Computer gewinnt ') + pts + (pts === 1 ? ' Punkt' : ' Punkte') + ' (' + what + '). Spielstand ' +
                sideName(0) + ' ' + score[0] + ' : ' + score[1] + ' ' + sideName(1) + '.';
    if (await message('Partie beendet', msg, ['Nächste Partie', 'Schließen']) === 0) { newGame(two, cubeOn, level, true); render(); }
  }
  async function humanDouble() {
    if (!human(turn) || !canDouble(turn) || thinking) return;
    const side = turn, other = 1 - turn;
    const take = two ? await message('Verdoppeln', sideName(side) + ' verdoppelt auf ' + cube * 2 + '. ' + sideName(other) + ': annehmen oder aufgeben?', ['Annehmen', 'Aufgeben']) === 0
                     : BG.accepts(board, other, level);
    if (take) {
      cube *= 2; cubeOwner = other; log.push(sideName(side) + ' verdoppelt auf ' + cube + ' – angenommen.');
      note = two ? null : 'Der Computer nimmt an. Der Doppler steht jetzt auf ' + cube + '.';
      saveGame(); render();
    } else { log.push(sideName(side) + ' verdoppelt – ' + sideName(other) + ' gibt auf.'); gameOver(side, cube, 'Abgelehnt'); }
  }

  // ---------------------------------------------------------------- Computer (im Worker)
  let worker = null, workerFailed = false, seq = 0;
  const pending = new Map();
  function getWorker() {
    if (worker || workerFailed) return worker;
    try {
      worker = new Worker('backgammon.js');
      worker.onmessage = e => { const f = pending.get(e.data.id); if (f) { pending.delete(e.data.id); f(e.data.steps); } };
      worker.onerror = () => { workerFailed = true; worker = null; pending.forEach(f => f(undefined)); pending.clear(); };
    } catch (e) { workerFailed = true; }
    return worker;
  }
  function bestAsync(b, side, dice, lv) {
    const w = getWorker();
    if (!w) return new Promise(r => setTimeout(() => r(BG.best(b, side, dice, lv)), 20));
    return new Promise(resolve => { const id = ++seq; pending.set(id, s => resolve(s === undefined ? BG.best(b, side, dice, lv) : s)); w.postMessage({ id, board: b, side, dice, level: lv }); });
  }
  async function computerTurn() {
    if (two || phase !== 'roll' || turn !== 1) return;
    const id = runId;
    thinking = true; render();
    await delay(500);
    if (id !== runId) return;
    if (canDouble(1) && BG.wantsDouble(board, 1, level)) {
      thinking = false; render();
      const take = await message('Verdoppeln', 'Der Computer verdoppelt auf ' + cube * 2 + '. Nimmst du an? Sonst verlierst du jetzt ' + cube + (cube === 1 ? ' Punkt.' : ' Punkte.'), ['Annehmen', 'Aufgeben']) === 0;
      if (id !== runId) return;
      if (!take) { log.push('Computer verdoppelt – du gibst auf.'); gameOver(1, cube, 'Abgelehnt'); return; }
      cube *= 2; cubeOwner = 0; log.push('Computer verdoppelt auf ' + cube + ' – angenommen.');
      thinking = true;
    }
    roll(); render();
    await delay(700);
    if (id !== runId) return;
    computerMoves();
  }
  async function computerMoves() {
    const id = runId;
    thinking = true; render();
    const steps = await bestAsync(BG.copy(board), turn, remaining.slice(), level);
    if (id !== runId) return;
    for (const s of steps) {
      BG.apply(board, turn, s); remaining.splice(remaining.indexOf(s.die), 1); turnSteps.push(s);
      render(); await delay(450);
      if (id !== runId) return;
    }
    thinking = false;
    endTurn();
  }
  async function showHint() {
    if ($('bHint').disabled) return;
    const id = runId;
    thinking = true; render();
    const side = turn, steps = await bestAsync(BG.copy(board), side, remaining.slice(), 3);
    thinking = false;
    if (id !== runId) return;
    hints++;
    hintArrows = steps.map(s => [spotOf(side, s.from), spotOf(side, s.to)]);
    hintText = steps.length ? 'Tipp: ' + steps.map(BG.stepText).join(' ') + ' (grüne Pfeile)' : 'Tipp: kein Zug möglich.';
    render();
  }
  async function resign() {
    if (phase === 'over' || phase === 'opening' || thinking) return;
    const side = two ? turn : 0;
    if (await message('Aufgeben', (two ? sideName(side) + ' gibt auf?' : 'Möchtest du die Partie aufgeben?') + ' Das kostet ' + cube + (cube === 1 ? ' Punkt.' : ' Punkte.'), ['Aufgeben', 'Abbrechen']) !== 0) return;
    runId++;
    log.push(sideName(side) + (side === 0 && !two ? ' gibst auf.' : ' gibt auf.'));
    gameOver(1 - side, cube, 'Aufgabe');
  }

  // ---------------------------------------------------------------- Spielstand (Stand zu Beginn des laufenden Zugs)
  function saveGame() {
    const b = phase === 'move' && turnStart ? turnStart : board;
    store('backgammon.spielstand', { zwei: two, stufe: level, doppler: cubeOn, wert: cube, besitzer: cubeOwner, punkte: score, phase, am: turn, wuerfel: [d1, d2],
                                     brett: b, id: gameKey, tipps: hints, zurueck: undos, zuege: turns, gewinner: winner, wertung: points, art: kind, verlauf: log.slice(-60) });
  }
  function loadGame() {
    const d = load('backgammon.spielstand', null);
    if (!d || !d.brett || !Array.isArray(d.brett.pts) || ['opening', 'roll', 'move', 'over'].indexOf(d.phase) < 0) return false;
    two = !!d.zwei; level = d.stufe || 2; cubeOn = d.doppler !== false; cube = d.wert || 1; cubeOwner = d.besitzer == null ? -1 : d.besitzer;
    score = Array.isArray(d.punkte) ? d.punkte : [0, 0]; turn = d.am === 1 ? 1 : 0; board = d.brett; gameKey = d.id || String(Date.now());
    hints = d.tipps || 0; undos = d.zurueck || 0; turns = d.zuege || 0; winner = d.gewinner == null ? -1 : d.gewinner; points = d.wertung || 0; kind = d.art || '';
    log = Array.isArray(d.verlauf) ? d.verlauf : [];
    phase = d.phase;
    if (phase === 'move') { const [a, b] = d.wuerfel || []; if (a >= 1 && a <= 6 && b >= 1 && b <= 6) startMove(a, b); else phase = 'roll'; }
    if (phase !== 'over') note = 'Spielstand geladen.';
    return true;
  }

  // ---------------------------------------------------------------- Dialoge
  const sheets = [];
  function button(text, cls, onClick) { const b = el_('button', 'fbtn' + (cls ? ' ' + cls : ''), text); b.type = 'button'; if (onClick) b.addEventListener('click', onClick); return b; }
  function openSheet(title, body, footButtons, wide) {
    return new Promise(resolve => {
      const ov = el_('div', 'overlay'), sh = el_('div', 'sheet' + (wide ? ' wide' : '')), bar = el_('div', 'bar');
      bar.append(el_('h2', null, title));
      const sheet = { ov, result: undefined, resolve };
      const x = button('×', '', () => closeSheet(sheet)); x.className = 'x'; x.setAttribute('aria-label', 'Schließen');
      bar.append(x);
      const b = el_('div', 'body'); b.append(body);
      sh.append(bar, b);
      const fb = footButtons ? footButtons(sheet) : [];
      if (fb.length) { const f = el_('div', 'foot'); f.append(...fb); sh.append(f); }
      ov.append(sh);
      ov.addEventListener('pointerdown', e => { if (e.target === ov) closeSheet(sheet); });
      document.body.append(ov);
      sheets.push(sheet);
      try { window.history.pushState({ bgSheet: sheets.length }, ''); } catch (e) { /* ohne Verlauf */ }
    });
  }
  function removeTopSheet() { const s = sheets.pop(); if (!s) return; s.ov.remove(); s.resolve(s.result); }
  let ignorePop = 0;
  function closeSheet(sheet, result) {
    if (sheets[sheets.length - 1] !== sheet) return;
    sheet.result = result; removeTopSheet();
    if (window.history.state && window.history.state.bgSheet) { ignorePop++; window.history.back(); }
  }
  window.addEventListener('popstate', () => { if (ignorePop > 0) { ignorePop--; return; } removeTopSheet(); });
  async function message(title, text, buttons) {
    const r = await openSheet(title, el_('div', 'msg', text), sheet => {
      const list = [el_('div', 'grow')];
      for (let i = buttons.length - 1; i >= 0; i--) list.push(button(buttons[i], i === 0 ? 'primary' : '', () => closeSheet(sheet, i)));
      return list;
    });
    return r === undefined ? -1 : r;
  }
  function choiceRow(labels, current, onPick) {
    const row = el_('div', 'choices');
    const btns = labels.map((l, i) => button(l, i === current ? 'on' : '', () => { btns.forEach((b, j) => b.classList.toggle('on', j === i)); onPick(i); }));
    row.append(...btns);
    row.setEnabled = on => btns.forEach(b => { b.disabled = !on; });
    row.pick = i => btns.forEach((b, j) => b.classList.toggle('on', j === i));
    return row;
  }
  function toggleRow(text, on, onChange) {
    const row = el_('div', 'toggle-row'), t = el_('button', 'toggle' + (on ? ' on' : ''));
    t.type = 'button'; t.setAttribute('role', 'switch');
    row.append(t, el_('span', null, text));
    row.addEventListener('click', () => { const v = !t.classList.contains('on'); t.classList.toggle('on', v); onChange(v); });
    row.set = v => t.classList.toggle('on', v);
    return row;
  }

  async function askNewGame() {
    let t = cfg.two, lv = cfg.level, cb = cfg.cube, reset = false;
    const body = el_('div');
    const lvl = choiceRow(['Leicht', 'Mittel', 'Schwer'], lv - 1, i => { lv = i + 1; });
    body.append(el_('h3', null, 'Gegner'), choiceRow(['Computer', 'Zwei Spieler'], t ? 1 : 0, i => { t = i === 1; lvl.setEnabled(!t); }),
                el_('h3', null, 'Stärke des Computers'), lvl, el_('h3', null, 'Regeln'), toggleRow('Mit Verdopplungswürfel', cb, v => { cb = v; }),
                toggleRow('Punktestand auf 0 setzen (jetzt ' + score[0] + ' : ' + score[1] + ')', false, v => { reset = v; }));
    lvl.setEnabled(!t);
    const ok = await openSheet('Neues Spiel', body, sheet => [el_('div', 'grow'), button('Abbrechen', '', () => closeSheet(sheet)), button('Spiel starten', 'primary', () => closeSheet(sheet, true))]);
    if (!ok) return;
    Object.assign(cfg, { two: t, level: lv, cube: cb });
    store('backgammon.einstellungen', cfg);
    if (reset || t !== two) { score = [0, 0]; log = []; }
    newGame(t, cb, lv, true); render();
  }

  function openSettings() {
    const work = Object.assign({}, cfg);
    const body = el_('div', 'settings-grid'), left = el_('div'), right = el_('div');
    const pv = document.createElement('canvas'); pv.className = 'preview';
    pv.style.aspectRatio = '1.35';
    const demo = BG.start();
    demo.pts[13] = 4; demo.pts[8] = 2; demo.pts[5] = 2; demo.pts[6] = 4; demo.pts[24] = 1; demo.pts[22] = 1; demo.pts[12] = -4; demo.pts[1] = -1; demo.bar[1] = 1;
    const syncs = [];
    const paintPreview = () => { const w = pv.clientWidth || 300, h = Math.round(w / 1.35);
      paintBoard(sizeCanvas(pv, w, h), w, h, { b: demo, turn: 0, dice: [5, 3], used: 1, cube: 1, owner: -1, cubeOn: true, sources: new Set([13, 24]), targets: new Set([10]),
                                              selected: 13, hint: [], last: new Set(), center: null, look: work }); };
    function tiles(list, key, paint) {
      const w = el_('div', 'tiles');
      const items = list.map((item, i) => {
        const t = el_('button', 'tile'); t.type = 'button';
        const c = document.createElement('canvas'); paint(sizeCanvas(c, 72, 72), item);
        t.append(c, el_('span', null, item[0]));
        t.addEventListener('click', () => { work[key] = i; sync(); });
        w.append(t); return t;
      });
      syncs.push(() => items.forEach((t, i) => t.classList.toggle('on', work[key] === i)));
      return w;
    }
    const lvl = choiceRow(['Leicht', 'Mittel', 'Schwer'], work.level - 1, i => { work.level = i + 1; });
    const tg = (text, key) => { const r = toggleRow(text, work[key], v => { work[key] = v; sync(); }); syncs.push(() => r.set(work[key])); return r; };
    left.append(el_('h3', null, 'Stärke des Computers'), lvl,
      el_('h3', null, 'Farbe des Bretts'), tiles(BOARDS, 'board', (ctx, [, frame, felt, a, b]) => {
        ctx.fillStyle = frame; ctx.fillRect(0, 0, 72, 72); ctx.fillStyle = felt; ctx.fillRect(4, 4, 64, 64);
        for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? b : a; ctx.beginPath(); ctx.moveTo(4 + i * 16, 68); ctx.lineTo(20 + i * 16, 68); ctx.lineTo(12 + i * 16, 40); ctx.fill();
          ctx.beginPath(); ctx.moveTo(4 + i * 16, 4); ctx.lineTo(20 + i * 16, 4); ctx.lineTo(12 + i * 16, 32); ctx.fill(); } }),
      el_('h3', null, 'Farbe der Steine'), tiles(STONES, 'stones', (ctx, [, a, b]) => { ctx.fillStyle = BOARDS[0][2]; ctx.fillRect(0, 0, 72, 72); drawStone(ctx, 24, 24, 36, a); drawStone(ctx, 48, 48, 36, b); }),
      el_('h3', null, 'Anzeige'), tg('Pips (Augen bis zum Ziel) anzeigen', 'pips'), tg('Mögliche Züge zeigen', 'moves'), tg('Zug ohne Bestätigung beenden', 'auto'));
    right.append(el_('h3', null, 'Vorschau'), pv);
    body.append(left, right);
    function sync() { syncs.forEach(f => f()); lvl.pick(work.level - 1); paintPreview(); }
    const p = openSheet('Einstellungen', body, sheet => [button('Standard', 'link', () => { Object.assign(work, LOOK); sync(); }), el_('div', 'grow'),
                                                          button('Abbrechen', '', () => closeSheet(sheet)), button('Übernehmen', 'primary', () => closeSheet(sheet, true))], true);
    requestAnimationFrame(sync);
    p.then(ok => { if (!ok) return; cfg = Object.assign(cfg, work); if (!two) level = cfg.level; store('backgammon.einstellungen', cfg); render(); });
  }

  function openRules() {
    const sections = [
      ['Ziel', 'Bring alle 15 Steine in dein Heimfeld (unten rechts, Punkte 1–6) und trage sie dann ab. Wer zuerst alle abgetragen hat, gewinnt.'],
      ['Züge', 'Jeder Würfel ist ein eigener Zug eines Steins; ein Pasch zählt vierfach. Du darfst auf freie Punkte, eigene Punkte und auf Punkte mit genau einem gegnerischen Stein ziehen – der wird geschlagen und muss auf die Bar. Steine auf der Bar müssen zuerst wieder hinein. Du musst so viele Würfel nutzen wie möglich; geht nur einer, dann der höhere.'],
      ['Abtragen', 'Erst wenn alle Steine im Heimfeld sind. Mit genauer Augenzahl, oder mit höherer, wenn auf höheren Punkten kein Stein mehr steht.'],
      ['Wertung', 'Einfacher Sieg 1 Punkt, Gammon (Gegner hat noch keinen Stein abgetragen) 2, Backgammon (zusätzlich ein Stein auf der Bar oder in deinem Heimfeld) 3 – jeweils mal dem Wert des Verdopplungswürfels. Wer eine Verdopplung ablehnt, verliert sofort den bisherigen Wert.']
    ];
    const body = el_('div', 'rules');
    sections.forEach(([h, t]) => body.append(el_('h3', null, h), el_('p', null, t)));
    return openSheet('Regeln', body, sheet => [el_('div', 'grow'), button('Schließen', 'primary', () => closeSheet(sheet))]);
  }

  function openStats() {
    const percent = (w, t) => t === 0 ? '–' : Math.round(100 * w / t) + ' %';
    const body = el_('div');
    const fill = () => {
      body.innerHTML = '';
      const comp = stats.filter(r => !r.zwei);
      const count = f => { let w = 0, l = 0; for (const r of comp) if (f(r)) { if (r.ergebnis > 0) w++; else l++; } return [w, l]; };
      const [w, l] = count(() => true), total = w + l;
      const pts = comp.reduce((s, r) => s + r.ergebnis * r.punkte, 0);
      body.append(el_('h3', null, 'Gegen den Computer'));
      const tiles = el_('div', 'stat-tiles');
      [[total, 'Partien'], [w, 'Siege'], [l, 'Niederlagen'], [(pts > 0 ? '+' : '') + pts, 'Punkte'], [percent(w, total), 'Siegquote']].forEach(([v, c]) => {
        const t = el_('div', 'stat-tile'); t.append(el_('b', null, String(v)), el_('span', null, c)); tiles.append(t);
      });
      body.append(tiles);
      const gw = comp.filter(r => r.ergebnis > 0 && (r.art === 'Gammon' || r.art === 'Backgammon')).length, gl = comp.filter(r => r.ergebnis < 0 && (r.art === 'Gammon' || r.art === 'Backgammon')).length;
      body.append(el_('p', 'line-text', 'Gammons/Backgammons: gewonnen ' + gw + ', verloren ' + gl));
      body.append(el_('h3', null, 'Nach Stärke und Doppler'));
      const legend = el_('div', 'legend');
      legend.innerHTML = '<span><i style="background:#E6E6E6"></i>Siege</span><span><i style="background:#4B4B4B"></i>Niederlagen</span>';
      body.append(legend);
      for (const [label, f, gap] of [['Leicht', r => r.stufe === 1], ['Mittel', r => r.stufe === 2], ['Schwer', r => r.stufe === 3],
                                     ['Ohne Verdopplung', r => r.doppler <= 1, true], ['Mit Verdopplung', r => r.doppler > 1]]) {
        const [rw, rl] = count(f), t = rw + rl;
        const row = el_('div', 'barrow' + (gap ? ' gap' : '')), bar = el_('div', 'bar');
        if (t > 0) [[rw, '#E6E6E6'], [rl, '#4B4B4B']].forEach(([v, c]) => { const i = el_('i'); i.style.width = (100 * v / t) + '%'; i.style.background = c; bar.append(i); });
        row.append(el_('span', null, label), bar, el_('small', null, t === 0 ? 'keine Partie' : rw + ' S · ' + rl + ' N   ' + percent(rw, t)));
        body.append(row);
      }
      const tw = stats.filter(r => r.zwei);
      body.append(el_('h3', null, 'Zwei Spieler'), el_('p', 'line-text', tw.length ? tw.length + (tw.length === 1 ? ' Partie' : ' Partien') + ' – unten gewinnt ' + tw.filter(r => r.ergebnis > 0).length + ', oben gewinnt ' + tw.filter(r => r.ergebnis < 0).length : 'Noch keine Partie zu zweit beendet.'));
      body.append(el_('h3', null, 'Letzte Partien'));
      const games = el_('div', 'games');
      if (!stats.length) games.append(el_('div', 'empty', 'Noch keine beendeten Partien.'));
      for (const r of stats.slice(-100).reverse()) {
        const g = el_('div', 'game'), dt = new Date(r.datum);
        const when = isNaN(dt) ? '' : dt.toLocaleDateString('de-DE') + ', ' + dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        g.append(el_('div', 'who', r.zwei ? 'Zwei Spieler' : 'Computer · ' + LEVEL_NAMES[r.stufe]),
                 el_('span', 'pill ' + (r.zwei ? 'draw' : r.ergebnis > 0 ? 'win' : 'loss'), r.zwei ? (r.ergebnis > 0 ? 'Unten +' : 'Oben +') + r.punkte : (r.ergebnis > 0 ? 'Sieg +' : 'Niederlage −') + r.punkte),
                 el_('div', 'meta', when + '  ·  ' + r.art + (r.doppler > 1 ? ' · Doppler ' + r.doppler : '') + '  ·  ' + r.zuege + ' Züge'));
        games.append(g);
      }
      body.append(games);
    };
    fill();
    return openSheet('Statistik', body, sheet => [
      button('Statistik zurücksetzen …', 'link', async () => {
        if (!stats.length) return;
        if (await message('Statistik zurücksetzen', 'Alle ' + stats.length + ' gespeicherten Partien löschen? Das lässt sich nicht rückgängig machen.', ['Zurücksetzen', 'Abbrechen']) !== 0) return;
        stats = []; store('backgammon.statistik', stats); fill();
      }), el_('div', 'grow'), button('Schließen', 'primary', () => closeSheet(sheet))], true);
  }

  // ---------------------------------------------------------------- Knöpfe und Tasten
  $('bMain').addEventListener('click', mainAction);
  $('bDouble').addEventListener('click', humanDouble);
  $('bUndo').addEventListener('click', undo);
  $('bHint').addEventListener('click', showHint);
  $('bResign').addEventListener('click', resign);
  $('bStats').addEventListener('click', openStats);
  $('bNew').addEventListener('click', askNewGame);
  $('bSettings').addEventListener('click', openSettings);
  $('bRules').addEventListener('click', openRules);
  document.addEventListener('keydown', e => {
    if (sheets.length) { if (e.key === 'Escape') closeSheet(sheets[sheets.length - 1]); return; }
    const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (ctrl && k === 'n') { e.preventDefault(); askNewGame(); }
    else if ((ctrl && k === 'z') || k === 'backspace') { e.preventDefault(); undo(); }
    else if (ctrl || e.altKey) return;
    else if (k === ' ' || k === 'enter') { e.preventDefault(); mainAction(); }
    else if (k === 'd') humanDouble();
    else if (k === 'h') showHint();
  });

  // ---------------------------------------------------------------- Start
  if (!loadGame()) newGame(cfg.two, cfg.cube, cfg.level, false);
  render();
  new ResizeObserver(draw).observe(wrap);
  if (phase === 'roll' && !human(turn)) computerTurn(); else if (phase === 'move' && !human(turn)) computerMoves();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

  // nur zum Testen
  window.bg = {
    state: () => ({ phase, turn, remaining: remaining.slice(), steps: turnSteps.map(BG.stepText), pips: [BG.pips(board, 0), BG.pips(board, 1)], cube, score: score.slice(),
                    thinking, winner, kind, log: log.slice(-3), status: $('status').textContent,
                    checkers: [0, 1].map(s => board.bar[s] + board.off[s] + board.pts.reduce((t, v) => t + (s === 0 ? Math.max(0, v) : Math.max(0, -v)), 0)) }),
    main: mainAction, allowed: () => allowedNow().map(s => [spotOf(turn, s.from), s]), click: onSpot, targets: () => [...targets.keys()].map(k => spotOf(turn, k))
  };
})();

// ---------------------------------------------------------------- Menü oben rechts (Handy hochkant)
// Die Einträge werden aus den vorhandenen Knöpfen gebaut (gleiches Symbol, gleicher Text, gleiche Aktion);
// beim Öffnen wird übernommen, ob ein Knopf gerade gesperrt ist. Reihenfolge und Auswahl: data-items im Kopf.
(() => {
  const menu = document.getElementById('menu'), btn = document.getElementById('menuBtn');
  if (!menu || !btn) return;
  const RULES_ICON = '<svg viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M9 8h6M9 12h6"/></svg>';
  const items = [];
  const show = on => {
    if (on) items.forEach(([b, src]) => { b.disabled = src.disabled; });
    menu.hidden = !on; btn.setAttribute('aria-expanded', on ? 'true' : 'false');
  };
  menu.dataset.items.split(',').forEach(id => {
    if (id === '|') { const s = document.createElement('div'); s.className = 'sep'; menu.appendChild(s); return; }
    const src = document.getElementById(id);
    if (!src) return;
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'menuitem');
    const svg = src.querySelector('svg');
    b.innerHTML = svg ? svg.outerHTML : RULES_ICON;
    b.appendChild(document.createTextNode(src.textContent.trim()));
    b.addEventListener('click', () => { show(false); src.click(); });
    menu.appendChild(b); items.push([b, src]);
  });
  btn.addEventListener('click', e => { e.stopPropagation(); show(menu.hidden); });
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) show(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) show(false); });
  window.addEventListener('resize', () => show(false));
})();
