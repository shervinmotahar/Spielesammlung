// Schach – Handy-Oberfläche. Spielablauf wie in der Windows-App (F:\Claude\Schach\src\Gui.cs).
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const LEVEL_NAMES = ['', 'Leicht', 'Mittel', 'Schwer'];
  const STYLE_NAMES = ['Klassisch', 'Modern', 'Buchstaben'];
  const SCHEMES = [
    { name: 'Holz', light: '#F0D9B5', dark: '#B58863' },
    { name: 'Grün', light: '#EEEED2', dark: '#769656' },
    { name: 'Blau', light: '#DEE3E6', dark: '#8CA2AD' },
    { name: 'Schiefer', light: '#C9C9C9', dark: '#707070' },
    { name: 'Lila', light: '#E8DDF0', dark: '#8565A8' }
  ];
  const PALETTE = [
    '#FFFFFF', '#F5F5F0', '#E6E6E6', '#CCCCCC', '#B3B3B3', '#999999', '#7A7A7A', '#5C5C5C', '#3D3D3D', '#1C1C1C',
    '#F0D9B5', '#EBD8B7', '#E8CFA0', '#D2B48C', '#C49A6C', '#B58863', '#A0703F', '#8B5A2B', '#6E4421', '#4A2C16',
    '#EEEED2', '#D6E4C2', '#B9D3A0', '#9CBF7E', '#769656', '#5E8A45', '#4A7A3A', '#3A6630', '#2E5228', '#1E3A1C',
    '#DEE3E6', '#C8D6E0', '#A9C1D1', '#8CA2AD', '#7795A8', '#5D7F99', '#4B6A85', '#3A556E', '#2C4257', '#1E2E3D',
    '#F2D5D5', '#E0A8A8', '#C97878', '#A85454', '#8B3A3A', '#E8DDF0', '#C9B5DD', '#A68BC4', '#8565A8', '#5E4580'
  ];
  const DEFAULTS = {
    level: 2, light: '#F0D9B5', dark: '#B58863', white: '#FAFAF8', black: '#1C1C1C', style: 0,
    showMoves: true, showLast: true, showCoords: true, newSide: 1, newTwo: false
  };
  const GLYPH_FONT = '"Noto Sans Symbols 2", "Segoe UI Symbol", "DejaVu Sans", sans-serif';
  const UI_FONT = '"Segoe UI", system-ui, Roboto, sans-serif';

  // ---------------------------------------------------------------- Speicher (im Browser des Geräts)
  function load(key, def) {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch (e) { return def; }
  }
  function store(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* privates Fenster o. Ä. */ }
  }

  let cfg = Object.assign({}, DEFAULTS, load('schach.einstellungen', {}));
  if (!(cfg.style >= 0 && cfg.style < STYLE_NAMES.length)) cfg.style = 0;
  if (!(cfg.level >= 1 && cfg.level <= 3)) cfg.level = 2;
  let stats = load('schach.statistik', []);
  if (!Array.isArray(stats)) stats = [];

  // ---------------------------------------------------------------- Spielzustand
  let pos = Position.start();
  let history = [], sans = [], played = [], redo = [], legal = [];
  let humanSide = 1, flipped = false, thinking = false, hintBusy = false, gameOver = false;
  let resultText = '', note = null, hintText = null, hint = -1, selected = -1, gameId = 0;
  let gameKey = '', endReason = null, hintsUsed = 0, undosUsed = 0, resignedSide = 0, winnerSide = 0;
  let drag = null;

  // ---------------------------------------------------------------- Farben
  function rgb(hex) { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  function rgba(hex, a) { const c = rgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function contrast(hex) {
    const c = rgb(hex);
    return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255 > 0.55 ? '#1C1C1C' : '#F0F0F0';
  }
  function validHex(s) { return /^#?[0-9a-fA-F]{6}$/.test((s || '').trim()); }
  function normHex(s) { s = s.trim().toUpperCase(); return s[0] === '#' ? s : '#' + s; }

  // ---------------------------------------------------------------- Figuren in drei Stilen
  const metrics = {};
  let measureCtx = null;
  function glyphMetrics(ch) {
    if (metrics[ch]) return metrics[ch];
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = '100px ' + GLYPH_FONT;
    const m = measureCtx.measureText(ch);
    return (metrics[ch] = { l: m.actualBoundingBoxLeft, r: m.actualBoundingBoxRight, a: m.actualBoundingBoxAscent, d: m.actualBoundingBoxDescent });
  }

  // Klassisch: gefülltes Zeichen in der Figurenfarbe, bei Weiß das Umrisszeichen in Kontrastfarbe darüber
  function drawGlyph(ctx, pc, x, y, w, h, fill) {
    const t = Math.abs(pc);
    const solid = String.fromCharCode(0x265A + 6 - t), outline = String.fromCharCode(0x2654 + 6 - t);
    const m = glyphMetrics(solid);
    const gh = m.a + m.d;
    if (!(gh > 0)) return;
    const k = h * 1.12 / 100;
    const scale = k * Math.min(1, h * 0.8 / (gh * k));
    ctx.save();
    ctx.font = (100 * scale) + 'px ' + GLYPH_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const bx = x + w / 2 - ((m.r - m.l) / 2) * scale;
    const by = y + h - h * 0.09 - m.d * scale;
    ctx.fillStyle = fill;
    ctx.fillText(solid, bx, by);
    if (pc > 0) { ctx.fillStyle = contrast(fill); ctx.fillText(outline, bx, by); }
    else { ctx.lineWidth = Math.max(1, h / 70); ctx.strokeStyle = rgba(contrast(fill), 0.43); ctx.strokeText(solid, bx, by); }
    ctx.restore();
  }

  // Modern: eigene Formen in einem 100 × 100 großen Feld (gleich wie in der Windows-App)
  const BASE = [['r', 24, 78, 52, 10, 3]];
  const SHAPES = {
    1: { parts: [['e', 38, 18, 24, 24], ['r', 39, 40, 22, 8, 3], ['p', [42, 46, 58, 46, 66, 79, 34, 79]]], lines: [[41, 44, 59, 44]], dots: [] },
    2: { parts: [['p', [33, 79, 35, 64, 43, 52, 38, 50, 31, 54, 25, 52, 22, 45, 29, 36, 39, 26, 41, 14, 48, 21, 55, 17, 64, 23, 71, 35, 74, 52, 70, 79]]],
         lines: [[60, 26, 68, 44]], dots: [[45, 32]] },
    3: { parts: [['e', 44.5, 7, 11, 11], ['e', 35, 16, 30, 42], ['r', 36, 54, 28, 8, 3], ['p', [42, 62, 58, 62, 66, 79, 34, 79]]],
         lines: [[55, 27, 46, 40], [38, 55, 62, 55], [38, 61, 62, 61]], dots: [] },
    4: { parts: [['r', 29, 13, 12, 14, 1.5], ['r', 44, 13, 12, 14, 1.5], ['r', 59, 13, 12, 14, 1.5], ['r', 29, 24, 42, 16, 2],
                 ['p', [35, 40, 65, 40, 67, 79, 33, 79]]], lines: [[32, 40, 68, 40]], dots: [] },
    5: { parts: [['p', [32, 52, 22, 25, 38, 40, 37, 17, 50, 36, 63, 17, 62, 40, 78, 25, 68, 52]], ['e', 18, 19, 9, 9], ['e', 32.5, 11, 9, 9],
                 ['e', 58.5, 11, 9, 9], ['e', 73, 19, 9, 9], ['r', 31, 50, 38, 8, 3], ['p', [36, 58, 64, 58, 68, 79, 32, 79]]],
         lines: [[33, 51, 67, 51], [35, 58, 65, 58]], dots: [] },
    6: { parts: [['r', 46.5, 5, 7, 22, 1.5], ['r', 40, 10, 20, 7, 1.5], ['p', [30, 52, 27, 36, 35, 27, 45, 27, 50, 32, 55, 27, 65, 27, 73, 36, 70, 52]],
                 ['r', 31, 50, 38, 8, 3], ['p', [36, 58, 64, 58, 68, 79, 32, 79]]], lines: [[33, 51, 67, 51], [35, 58, 65, 58]], dots: [] }
  };

  function roundRect(p, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    p.moveTo(x + r, y);
    p.arcTo(x + w, y, x + w, y + h, r);
    p.arcTo(x + w, y + h, x, y + h, r);
    p.arcTo(x, y + h, x, y, r);
    p.arcTo(x, y, x + w, y, r);
    p.closePath();
  }

  function partPath(pt, ox, oy, k) {
    const p = new Path2D();
    if (pt[0] === 'e') p.ellipse(ox + (pt[1] + pt[3] / 2) * k, oy + (pt[2] + pt[4] / 2) * k, pt[3] / 2 * k, pt[4] / 2 * k, 0, 0, Math.PI * 2);
    else if (pt[0] === 'r') roundRect(p, ox + pt[1] * k, oy + pt[2] * k, pt[3] * k, pt[4] * k, pt[5] * k);
    else {
      const a = pt[1];
      p.moveTo(ox + a[0] * k, oy + a[1] * k);
      for (let i = 2; i < a.length; i += 2) p.lineTo(ox + a[i] * k, oy + a[i + 1] * k);
      p.closePath();
    }
    return p;
  }

  function drawShape(ctx, pc, x, y, w, h, fill) {
    const s = SHAPES[Math.abs(pc)];
    const k = h / 100, ox = x + (w - 100 * k) / 2, oy = y;
    const line = contrast(fill);
    const parts = BASE.concat(s.parts).map(pt => partPath(pt, ox, oy, k));
    ctx.save();
    // erst alle Umrisse dick, dann alle Flächen darüber: so bleibt nur der äußere Rand sichtbar
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5 * k;
    ctx.strokeStyle = line;
    for (const p of parts) ctx.stroke(p);
    ctx.fillStyle = fill;
    for (const p of parts) ctx.fill(p);
    ctx.lineWidth = 2.6 * k;
    ctx.lineCap = 'round';
    for (const l of [[28, 79, 72, 79]].concat(s.lines)) {
      ctx.beginPath();
      ctx.moveTo(ox + l[0] * k, oy + l[1] * k);
      ctx.lineTo(ox + l[2] * k, oy + l[3] * k);
      ctx.stroke();
    }
    ctx.fillStyle = line;
    for (const d of s.dots) { ctx.beginPath(); ctx.arc(ox + d[0] * k, oy + d[1] * k, 2.8 * k, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  // Buchstaben: K D T L S B in einer Scheibe
  function drawLetter(ctx, pc, x, y, w, h, fill) {
    const k = h / 100, cx = x + w / 2, cy = y + h / 2, r = 37 * k, line = contrast(fill);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = 3.5 * k; ctx.strokeStyle = line; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r - 7 * k, 0, Math.PI * 2);
    ctx.lineWidth = 1.5 * k; ctx.strokeStyle = rgba(line, 0.35); ctx.stroke();
    const ch = SAN_LETTERS[Math.abs(pc)];
    ctx.font = '700 ' + (48 * k) + 'px ' + UI_FONT;
    let m = ctx.measureText(ch);
    const f = 48 * k * (34 * k / (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent));
    ctx.font = '700 ' + f + 'px ' + UI_FONT;
    m = ctx.measureText(ch);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = line;
    ctx.fillText(ch, cx - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2,
                 cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
    ctx.restore();
  }

  function drawPiece(ctx, pc, x, y, w, h, c) {
    const fill = pc > 0 ? c.white : c.black;
    if (c.style === 1) drawShape(ctx, pc, x, y, w, h, fill);
    else if (c.style === 2) drawLetter(ctx, pc, x, y, w, h, fill);
    else drawGlyph(ctx, pc, x, y, w, h, fill);
  }

  // ---------------------------------------------------------------- Brett zeichnen
  function paintBoard(cv, st) {
    const ctx = cv.getContext('2d');
    const S = cv.width / 8, c = st.cfg, p = st.pos;
    const at = sq => { let r = sq >> 3, col = sq & 7; if (st.flipped) { r = 7 - r; col = 7 - col; } return [col * S, r * S]; };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const lastFrom = st.last >= 0 ? mFrom(st.last) : -1, lastTo = st.last >= 0 ? mTo(st.last) : -1;
    for (let sq = 0; sq < 64; sq++) {
      const [x, y] = at(sq);
      ctx.fillStyle = (((sq >> 3) + (sq & 7)) & 1) === 0 ? c.light : c.dark;
      ctx.fillRect(x, y, S, S);
      if (c.showLast && (sq === lastFrom || sq === lastTo)) { ctx.fillStyle = 'rgba(235,220,70,0.41)'; ctx.fillRect(x, y, S, S); }
      if (sq === st.selected) { ctx.fillStyle = 'rgba(100,170,60,0.49)'; ctx.fillRect(x, y, S, S); }
    }
    if (p.inCheck()) {
      const [x, y] = at(p.kingSq(p.side));
      const g = ctx.createRadialGradient(x + S / 2, y + S / 2, 0, x + S / 2, y + S / 2, S / 2);
      g.addColorStop(0, 'rgba(230,30,30,0.92)');
      g.addColorStop(1, 'rgba(230,30,30,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, S, S);
    }
    if (c.showCoords) {
      ctx.font = '600 ' + Math.max(7, S * 0.17) + 'px ' + UI_FONT;
      for (let i = 0; i < 8; i++) {
        let r = st.flipped ? 7 - i : i, col = st.flipped ? 7 : 0;
        let [x, y] = at(r * 8 + col);
        ctx.fillStyle = ((r + col) & 1) === 0 ? c.dark : c.light;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(String(8 - r), x + S * 0.05, y + S * 0.04);
        r = st.flipped ? 0 : 7; col = st.flipped ? 7 - i : i;
        [x, y] = at(r * 8 + col);
        ctx.fillStyle = ((r + col) & 1) === 0 ? c.dark : c.light;
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText(String.fromCharCode(97 + col), x + S - S * 0.05, y + S - S * 0.03);
      }
    }
    if (c.showMoves && st.selected >= 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.27)';
      ctx.strokeStyle = 'rgba(0,0,0,0.27)';
      ctx.lineWidth = S * 0.08;
      for (const m of st.legal) {
        if (mFrom(m) !== st.selected || (mPromo(m) !== 0 && mPromo(m) !== Q)) continue;
        const [x, y] = at(mTo(m));
        ctx.beginPath();
        if (p.sq[mTo(m)] !== 0 || p.isEnPassant(m)) { ctx.arc(x + S / 2, y + S / 2, S / 2 - S * 0.08, 0, Math.PI * 2); ctx.stroke(); }
        else { ctx.arc(x + S / 2, y + S / 2, S * 0.15, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    for (let sq = 0; sq < 64; sq++) {
      if (p.sq[sq] === 0 || (st.drag && sq === st.drag.from)) continue;
      const [x, y] = at(sq);
      drawPiece(ctx, p.sq[sq], x, y, S, S, c);
    }
    if (st.hint >= 0) {
      const [x1, y1] = at(mFrom(st.hint)), [x2, y2] = at(mTo(st.hint));
      arrow(ctx, x1 + S / 2, y1 + S / 2, x2 + S / 2, y2 + S / 2, S);
    }
    if (st.drag) drawPiece(ctx, p.sq[st.drag.from], st.drag.x - S * 0.55, st.drag.y - S * 0.6, S * 1.1, S * 1.1, c);
  }

  function arrow(ctx, x1, y1, x2, y2, S) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ux = dx / len, uy = dy / len, head = S * 0.38, hw = S * 0.22;
    const ex = x2 - ux * S * 0.12, ey = y2 - uy * S * 0.12, bx = ex - ux * head, by = ey - uy * head;
    ctx.save();
    ctx.fillStyle = ctx.strokeStyle = 'rgba(40,140,70,0.72)';
    ctx.lineWidth = S * 0.16;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(bx, by); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(bx - uy * hw, by + ux * hw); ctx.lineTo(bx + uy * hw, by - ux * hw); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- Hauptbrett
  const cv = $('board'), wrap = $('boardWrap');

  function layoutBoard() {
    const dpr = window.devicePixelRatio || 1;
    const avail = Math.max(120, Math.min(wrap.clientWidth, wrap.clientHeight));
    const S = Math.max(8, Math.floor(avail * dpr / 8));
    cv.width = cv.height = S * 8;
    cv.style.width = cv.style.height = (S * 8 / dpr) + 'px';
    draw();
  }

  function draw() {
    const S = cv.width / 8;
    let d = null;
    if (drag && drag.moved) d = { from: drag.from, x: drag.x, y: drag.y - (drag.touch ? S * 0.45 : 0) };
    paintBoard(cv, { pos, legal, selected, last: played.length ? played[played.length - 1] : -1, hint, flipped, cfg, drag: d });
  }

  function sqAt(e) {
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * 8, y = (e.clientY - r.top) / r.height * 8;
    if (x < 0 || y < 0 || x >= 8 || y >= 8) return -1;
    let c = Math.floor(x), row = Math.floor(y);
    if (flipped) { c = 7 - c; row = 7 - row; }
    return row * 8 + c;
  }
  function canvasPt(e) {
    const r = cv.getBoundingClientRect();
    return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height];
  }
  function canInteract() { return !gameOver && !thinking && (humanSide === 0 || pos.side === humanSide); }
  function isTarget(from, to) { return legal.some(m => mFrom(m) === from && mTo(m) === to); }

  cv.addEventListener('pointerdown', e => {
    if (!canInteract() || e.button > 0) return;
    const sq = sqAt(e);
    if (sq < 0) return;
    if (selected >= 0 && isTarget(selected, sq)) { const f = selected; selected = -1; boardMove(f, sq); return; }
    if (pos.sq[sq] * pos.side > 0) {
      const reclick = sq === selected;
      selected = sq;
      const [x, y] = canvasPt(e);
      drag = { from: sq, x, y, sx: e.clientX, sy: e.clientY, moved: false, touch: e.pointerType !== 'mouse', reclick };
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    } else selected = -1;
    draw();
  });
  cv.addEventListener('pointermove', e => {
    if (!drag) {
      const sq = sqAt(e);
      cv.style.cursor = canInteract() && sq >= 0 && (pos.sq[sq] * pos.side > 0 || (selected >= 0 && isTarget(selected, sq))) ? 'pointer' : 'default';
      return;
    }
    const [x, y] = canvasPt(e);
    drag.x = x; drag.y = y;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
    if (drag.moved) draw();
  });
  cv.addEventListener('pointerup', e => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.moved) {
      const sq = sqAt(e);
      if (sq >= 0 && selected >= 0 && isTarget(selected, sq)) { const f = selected; selected = -1; boardMove(f, sq); return; }
    } else if (d.reclick) selected = -1;     // zweites Antippen derselben Figur hebt die Auswahl auf
    draw();
  });
  cv.addEventListener('pointercancel', () => { drag = null; draw(); });

  // ---------------------------------------------------------------- Rechnen im Hintergrund
  let worker = null, workerFailed = false, searchSeq = 0;
  const pending = new Map();

  function getWorker() {
    if (worker || workerFailed) return worker;
    try {
      worker = new Worker('worker.js');
      worker.onmessage = e => { const r = pending.get(e.data.id); if (r) { pending.delete(e.data.id); r(e.data.move); } };
      worker.onerror = () => {   // z. B. beim Öffnen als Datei: dann auf dem Hauptfaden rechnen
        workerFailed = true; worker = null;
        const jobs = Array.from(pending.entries());
        pending.clear();
        for (const [, r] of jobs) r(-2);
      };
    } catch (err) { workerFailed = true; worker = null; }
    return worker;
  }

  function runSearch(p, depth, time, noise) {
    return new Promise(resolve => {
      const w = getWorker();
      const local = () => setTimeout(() => resolve(new Engine().findBest(p, depth, time, noise)), 20);
      if (!w) { local(); return; }
      const id = ++searchSeq;
      pending.set(id, m => { if (m === -2) local(); else resolve(m); });
      w.postMessage({ id, pos: p.toObj(), depth, time, noise });
    });
  }

  function cancelSearch() {
    if (pending.size === 0) return;
    for (const r of pending.values()) r(-1);
    pending.clear();
    if (worker) { worker.terminate(); worker = null; }
  }

  const delay = ms => new Promise(r => setTimeout(r, ms));

  // ---------------------------------------------------------------- Anzeige
  function afterChange() {
    legal = pos.legalMoves();
    checkGameEnd();
    selected = -1;
    drag = null;
    draw();
    renderMoves();
    renderSide();
  }

  function renderSide() {
    const bottom = flipped ? -1 : 1;
    renderCard($('pBottom'), bottom);
    renderCard($('pTop'), -bottom);
    renderStatus();
    renderButtons();
  }

  function renderCard(el, side) {
    const color = side === 1 ? 'Weiß' : 'Schwarz';
    let title, sub;
    if (humanSide === 0) { title = color; sub = ''; }
    else if (side === humanSide) { title = 'Du'; sub = color; }
    else { title = 'Computer'; sub = color + '  ·  ' + LEVEL_NAMES[cfg.level]; }
    let state = null;
    if (gameOver) state = winnerSide === 0 ? 'Remis' : winnerSide === side ? 'gewinnt' : endReason === 'Aufgabe' ? 'hat aufgegeben' : 'Schachmatt';
    else if (pos.side === side) state = thinking && side !== humanSide ? 'denkt nach …' : pos.inCheck() ? 'am Zug – Schach!' : 'am Zug';
    if (state) sub = sub ? sub + '  ·  ' + state : state;
    const active = !gameOver && pos.side === side;

    // geschlagene Figuren des Gegners und Materialvorsprung
    const mine = [0, 0, 0, 0, 0, 0, 0], theirs = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 64; i++) {
      const pc = pos.sq[i];
      if (pc * side > 0) mine[Math.abs(pc)]++; else if (pc !== 0) theirs[Math.abs(pc)]++;
    }
    const start = [0, 8, 2, 2, 2, 1, 1], worth = [0, 1, 3, 3, 5, 9, 0];
    let adv = 0;
    for (let t = 1; t <= 5; t++) adv += (mine[t] - theirs[t]) * worth[t];
    const taken = [];
    for (const t of [Q, R, B, N, P]) for (let n = Math.max(0, start[t] - theirs[t]); n > 0; n--) taken.push(t);

    el.className = 'player' + (active ? ' active' : '');
    el.innerHTML = '';
    const dot = document.createElement('div');
    dot.className = 'dot';
    dot.style.background = side === 1 ? cfg.white : cfg.black;
    const names = document.createElement('div');
    names.className = 'names';
    names.innerHTML = '<div class="title"></div><div class="sub"></div>';
    names.firstChild.textContent = title;
    names.lastChild.textContent = sub;
    el.append(dot, names);
    if (taken.length) {
      const dpr = window.devicePixelRatio || 1, size = 22, step = 12;
      const w = (taken.length - 1) * step + size;
      const c = document.createElement('canvas');
      c.width = Math.round(w * dpr); c.height = Math.round(size * dpr);
      c.style.width = w + 'px';
      const ctx = c.getContext('2d');
      taken.forEach((t, i) => drawPiece(ctx, -side * t, i * step * dpr, 0, size * dpr, size * dpr, cfg));
      el.append(c);
    }
    if (adv > 0) { const a = document.createElement('div'); a.className = 'adv'; a.textContent = '+' + adv; el.append(a); }
  }

  function renderMoves() {
    const list = $('moveList');
    list.innerHTML = '';
    const total = sans.length + redo.length;
    if (total === 0) {
      list.innerHTML = '<div class="empty">Noch keine Züge – ziehe eine Figur oder tippe Figur und Zielfeld an.</div>';
      return;
    }
    let cur = null;
    for (let i = 0; i < total; i += 2) {
      const row = document.createElement('div');
      row.className = 'mrow';
      const no = document.createElement('span');
      no.className = 'no';
      no.textContent = (i / 2 + 1) + '.';
      row.append(no);
      for (let j = i; j < i + 2 && j < total; j++) {
        const s = document.createElement('span');
        s.className = 'ply' + (j === sans.length - 1 ? ' cur' : '') + (j >= sans.length ? ' redo' : '');
        s.textContent = j < sans.length ? sans[j] : redo[j - sans.length].san;
        row.append(s);
        if (j === sans.length - 1) cur = s;
      }
      list.append(row);
    }
    const target = cur || list.firstChild;
    if (getComputedStyle(list).flexDirection === 'column')
      list.scrollTop = target.offsetTop - list.offsetTop - list.clientHeight / 2;
    else
      list.scrollLeft = target.offsetLeft - list.offsetLeft - list.clientWidth / 2;
  }

  function renderStatus() {
    let s;
    if (thinking) s = 'Der Computer denkt nach …';
    else if (gameOver) s = resultText;
    else if (hintBusy) s = 'Suche einen guten Zug …';
    else if (hintText) s = hintText;
    else if (note) s = note;
    else {
      s = humanSide === 0 ? (pos.side === 1 ? 'Weiß' : 'Schwarz') + ' ist am Zug.'
        : pos.side === humanSide ? 'Du bist am Zug.' : 'Der Computer ist am Zug.';
      if (pos.inCheck()) s += '  Schach!';
    }
    $('status').textContent = s;
    $('info').textContent = humanSide === 0 ? 'Zwei Spieler'
      : 'Computer: ' + LEVEL_NAMES[cfg.level] + '   ·   Du spielst ' + (humanSide === 1 ? 'Weiß' : 'Schwarz');
  }

  function renderButtons() {
    $('bUndo').disabled = history.length === 0;
    $('bRedo').disabled = redo.length === 0;
    $('bHint').disabled = gameOver || thinking || hintBusy || !(humanSide === 0 || pos.side === humanSide);
    $('bResign').disabled = gameOver || played.length === 0;
  }

  // ---------------------------------------------------------------- Spielablauf
  function resetGame(side) {
    stopEngine();
    pos = Position.start();
    history = []; sans = []; played = []; redo = [];
    humanSide = side;
    flipped = side === -1;
    gameOver = false;
    resultText = '';
    note = null;
    clearHint();
    gameKey = new Date().toISOString().replace(/\D/g, '').slice(0, 17);
    hintsUsed = undosUsed = resignedSide = winnerSide = 0;
    endReason = null;
  }

  function startNewGame(side, announce) {
    resetGame(side);
    if (announce) note = side === 0 ? 'Neues Spiel – zwei Spieler. Weiß beginnt.' : 'Neues Spiel – du spielst ' + (side === 1 ? 'Weiß.' : 'Schwarz.');
    afterChange();
    saveGame();
    maybeComputerMove();
  }

  function stopEngine() {
    gameId++;
    cancelSearch();
    thinking = false;
    hintBusy = false;
  }

  function clearHint() { hintText = null; hint = -1; }

  function levelParams() {
    if (cfg.level === 1) return [1, 500, 120];
    if (cfg.level === 3) return [8, 6000, 0];
    return [5, 2500, 0];
  }

  function maybeComputerMove() {
    if (!gameOver && humanSide !== 0 && pos.side !== humanSide) computerMove();
  }

  async function computerMove() {
    const id = ++gameId;
    thinking = true;
    renderSide();
    const p = pos;
    const [depth, time, noise] = levelParams();
    const [m] = await Promise.all([runSearch(p, depth, time, noise), delay(400)]);
    if (id !== gameId) return;      // inzwischen neues Spiel oder Zug zurückgenommen
    thinking = false;
    if (m >= 0) playMove(m); else renderSide();
  }

  async function showHint() {
    if ($('bHint').disabled) return;
    hintBusy = true;
    renderSide();
    const p = pos, id = gameId;
    const m = await runSearch(p, 5, 1500, 0);
    if (!hintBusy || id !== gameId) return;
    hintBusy = false;
    if (p === pos && m >= 0 && !gameOver) {
      hintsUsed++;
      hint = m;
      hintText = 'Tipp: ' + p.san(m) + '  (grüner Pfeil)';
      draw();
      saveGame();
    }
    renderSide();
  }

  async function boardMove(from, to) {
    const cands = legal.filter(m => mFrom(m) === from && mTo(m) === to);
    if (cands.length === 0) { draw(); return; }
    let m = cands[0];
    if (cands.length > 1) {
      draw();
      const t = await askPromotion(pos.side);
      m = cands.find(x => mPromo(x) === t) || cands[0];
    }
    playMove(m);
  }

  function applyMove(m) {
    sans.push(pos.san(m));
    history.push(pos);
    played.push(m);
    pos = pos.make(m);
  }

  function playMove(m) {
    if (hintBusy) { cancelSearch(); hintBusy = false; }
    if (redo.length > 0 && redo[0].m === m) redo.shift(); else redo = [];
    applyMove(m);
    note = null;
    clearHint();
    afterChange();
    saveGame();
    if (gameOver) { recordResult(); setTimeout(showGameEnd, 150); return; }
    maybeComputerMove();
  }

  async function showGameEnd() {
    const r = await message('Partie beendet', resultText, ['Neues Spiel …', 'Statistik', 'Schließen']);
    if (r === 0) askNewGame();
    else if (r === 1) openStats();
  }

  function undo() {
    if (history.length === 0) return;
    stopEngine();
    clearHint();
    undosUsed++;
    resignedSide = 0;          // nach dem Zurücknehmen geht eine aufgegebene Partie weiter
    do {
      redo.unshift({ m: played.pop(), san: sans.pop() });
      pos = history.pop();
    } while (humanSide !== 0 && pos.side !== humanSide && history.length > 0);
    note = 'Zug zurückgenommen.';
    afterChange();
    saveGame();
    maybeComputerMove();
  }

  function redoMove() {
    if (redo.length === 0) return;
    stopEngine();
    clearHint();
    do { applyMove(redo.shift().m); } while (humanSide !== 0 && pos.side !== humanSide && redo.length > 0);
    note = null;
    afterChange();
    saveGame();
    if (gameOver) recordResult();
    maybeComputerMove();
  }

  async function resign() {
    if (gameOver || played.length === 0) return;
    const side = humanSide !== 0 ? humanSide : pos.side;
    const q = humanSide !== 0 ? 'Möchtest du die Partie wirklich aufgeben? Sie zählt dann als Niederlage.'
      : (side === 1 ? 'Weiß' : 'Schwarz') + ' gibt die Partie auf?';
    if (await message('Aufgeben', q, ['Aufgeben', 'Abbrechen']) !== 0) return;
    stopEngine();
    clearHint();
    resignedSide = side;
    note = null;
    afterChange();
    saveGame();
    recordResult();
    setTimeout(showGameEnd, 150);
  }

  function flip() {
    flipped = !flipped;
    draw();
    renderSide();
    saveGame();
  }

  function checkGameEnd() {
    gameOver = true;
    winnerSide = 0;
    if (resignedSide !== 0) {
      winnerSide = -resignedSide;
      endReason = 'Aufgabe';
      const winner = winnerSide === 1 ? 'Weiß' : 'Schwarz';
      resultText = humanSide === 0 ? (resignedSide === 1 ? 'Weiß' : 'Schwarz') + ' gibt auf – ' + winner + ' gewinnt.'
        : resignedSide === humanSide ? 'Du hast aufgegeben – der Computer gewinnt.' : 'Der Computer gibt auf – du gewinnst!';
    } else if (legal.length === 0) {
      if (pos.inCheck()) {
        winnerSide = -pos.side;
        endReason = 'Matt';
        resultText = 'Schachmatt – ' + (winnerSide === 1 ? 'Weiß' : 'Schwarz') + ' gewinnt!';
        if (humanSide !== 0 && winnerSide === humanSide) resultText += '  Glückwunsch!';
      } else { endReason = 'Patt'; resultText = 'Patt – die Partie endet remis.'; }
    } else if (pos.half >= 100) { endReason = '50 Züge'; resultText = 'Remis nach der 50-Züge-Regel.'; }
    else if (repetitionCount() >= 3) { endReason = 'Wiederholung'; resultText = 'Remis durch dreifache Stellungswiederholung.'; }
    else if (pos.insufficientMaterial()) { endReason = 'Material'; resultText = 'Remis – zu wenig Material zum Mattsetzen.'; }
    else { gameOver = false; endReason = null; }
  }

  function repetitionCount() {
    const key = pos.key();
    let n = 1;
    for (const h of history) if (h.key() === key) n++;
    return n;
  }

  // ---------------------------------------------------------------- Spielstand und Statistik
  function saveGame() {
    store('schach.spielstand', {
      modus: humanSide, gedreht: flipped, zuege: played.map(Position.uci), vor: redo.map(r => Position.uci(r.m)),
      id: gameKey, aufgegeben: resignedSide, tipps: hintsUsed, zurueck: undosUsed
    });
  }

  function loadGame() {
    const d = load('schach.spielstand', null);
    if (!d || ![1, -1, 0].includes(d.modus)) return false;
    try {
      resetGame(d.modus);
      flipped = !!d.gedreht;
      if (d.id) gameKey = d.id;
      if (d.aufgegeben === 1 || d.aufgegeben === -1) resignedSide = d.aufgegeben;
      hintsUsed = d.tipps | 0;
      undosUsed = d.zurueck | 0;
      for (const u of d.zuege || []) { const m = pos.parseUci(u); if (m < 0) break; applyMove(m); }
      let p = pos;
      for (const u of d.vor || []) { const m = p.parseUci(u); if (m < 0) break; redo.push({ m, san: p.san(m) }); p = p.make(m); }
      if (played.length > 0) note = 'Spielstand geladen – weiter geht\'s nach ' + played.length + (played.length === 1 ? ' Halbzug.' : ' Halbzügen.');
      afterChange();
      return true;
    } catch (e) { return false; }
  }

  // Eine Partie zählt nur einmal: wird sie nach dem Ende zurückgenommen und anders beendet, gilt das neue Ergebnis.
  function recordResult() {
    if (!gameOver) return;
    const r = {
      id: gameKey, datum: new Date().toISOString(), zwei: humanSide === 0, stufe: cfg.level, farbe: humanSide,
      ergebnis: humanSide === 0 ? winnerSide : winnerSide * humanSide, grund: endReason,
      zuege: Math.floor((played.length + 1) / 2), tipps: hintsUsed, zurueck: undosUsed
    };
    const i = stats.findIndex(x => x.id === r.id);
    if (i >= 0) stats[i] = r; else stats.push(r);
    store('schach.statistik', stats);
  }

  // ---------------------------------------------------------------- Dialoge
  const sheets = [];

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function button(text, cls, onClick) {
    const b = el('button', 'fbtn' + (cls ? ' ' + cls : ''), text);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  // Öffnet ein Blatt; die Zurück-Taste des Handys schließt es. Ergebnis kommt über das Promise.
  function openSheet(title, body, footButtons, wide) {
    return new Promise(resolve => {
      const ov = el('div', 'overlay');
      const sh = el('div', 'sheet' + (wide ? ' wide' : ''));
      const bar = el('div', 'bar');
      bar.append(el('h2', null, title));
      const sheet = { ov, result: undefined, resolve };
      const x = button('×', 'x', () => closeSheet(sheet));
      x.className = 'x';
      x.setAttribute('aria-label', 'Schließen');
      bar.append(x);
      const b = el('div', 'body');
      b.append(body);
      sh.append(bar, b);
      const fb = footButtons ? footButtons(sheet) : [];
      if (fb.length) { const f = el('div', 'foot'); f.append(...fb); sh.append(f); }
      ov.append(sh);
      ov.addEventListener('pointerdown', e => { if (e.target === ov) closeSheet(sheet); });
      document.body.append(ov);
      sheets.push(sheet);
      try { history.pushState({ schachSheet: sheets.length }, ''); } catch (e) { /* ohne Verlauf geht es auch */ }
    });
  }

  function removeTopSheet() {
    const s = sheets.pop();
    if (!s) return;
    s.ov.remove();
    s.resolve(s.result);
  }

  // Blatt sofort schließen; den Verlaufseintrag für die Zurück-Taste still mit entfernen
  let ignorePop = 0;
  function closeSheet(sheet, result) {
    if (sheets[sheets.length - 1] !== sheet) return;
    sheet.result = result;
    removeTopSheet();
    if (history.state && history.state.schachSheet) { ignorePop++; history.back(); }
  }

  // Zurück-Taste des Handys schließt das oberste Blatt
  window.addEventListener('popstate', () => {
    if (ignorePop > 0) { ignorePop--; return; }
    removeTopSheet();
  });

  // Meldung mit Knöpfen; buttons[0] ist der Hauptknopf. Ergebnis: Index, -1 = geschlossen.
  async function message(title, text, buttons) {
    const r = await openSheet(title, el('div', 'msg', text), sheet => {
      const list = [el('div', 'grow')];
      for (let i = buttons.length - 1; i >= 0; i--) list.push(button(buttons[i], i === 0 ? 'primary' : '', () => closeSheet(sheet, i)));
      return list;
    });
    return r === undefined ? -1 : r;
  }

  function choiceRow(labels, current, onPick) {
    const row = el('div', 'choices');
    const btns = labels.map((l, i) => button(l, i === current ? 'on' : '', () => {
      btns.forEach((b, j) => b.classList.toggle('on', j === i));
      onPick(i);
    }));
    row.append(...btns);
    row.setEnabled = on => btns.forEach(b => { b.disabled = !on; });
    return row;
  }

  function hiDpiCanvas(css) {
    const dpr = window.devicePixelRatio || 1;
    const c = document.createElement('canvas');
    c.width = c.height = Math.round(css * dpr);
    return c;
  }

  async function askNewGame() {
    let two = cfg.newTwo, side = cfg.newSide, level = cfg.level;
    const body = el('div');
    const sideRow = choiceRow(['Weiß', 'Schwarz', 'Zufällig'], side === 1 ? 0 : side === -1 ? 1 : 2, i => { side = [1, -1, 2][i]; });
    const levelRow = choiceRow(['Leicht', 'Mittel', 'Schwer'], level - 1, i => { level = i + 1; });
    const sync = () => { sideRow.setEnabled(!two); levelRow.setEnabled(!two); };
    body.append(el('h3', null, 'Gegner'), choiceRow(['Computer', 'Zwei Spieler'], two ? 1 : 0, i => { two = i === 1; sync(); }),
                el('h3', null, 'Du spielst'), sideRow, el('h3', null, 'Stärke des Computers'), levelRow);
    sync();
    const ok = await openSheet('Neues Spiel', body, sheet => [el('div', 'grow'), button('Abbrechen', '', () => closeSheet(sheet)),
                                                               button('Spiel starten', 'primary', () => closeSheet(sheet, true))]);
    if (!ok) return;
    cfg.newTwo = two; cfg.newSide = side; cfg.level = level;
    store('schach.einstellungen', cfg);
    startNewGame(two ? 0 : side === 2 ? (Math.random() < 0.5 ? 1 : -1) : side, true);
  }

  function askPromotion(side) {
    const body = el('div', 'promo');
    const types = [Q, R, B, N], names = ['Dame', 'Turm', 'Läufer', 'Springer'];
    let sheetRef = null;
    types.forEach((t, i) => {
      const b = el('button');
      b.type = 'button';
      const c = hiDpiCanvas(96);
      const ctx = c.getContext('2d');
      ctx.fillStyle = cfg.light;
      ctx.fillRect(0, 0, c.width, c.height);
      drawPiece(ctx, side * t, 0, 0, c.width, c.height, cfg);
      b.append(c, names[i]);
      b.addEventListener('click', () => closeSheet(sheetRef, t));
      body.append(b);
    });
    return openSheet('Bauer umwandeln in', body, sheet => { sheetRef = sheet; return []; }).then(r => r || Q);
  }

  async function openSettings() {
    const work = Object.assign({}, cfg);
    const body = el('div', 'settings-grid');
    const left = el('div'), right = el('div');
    const preview = hiDpiCanvas(320);
    preview.className = 'preview';
    preview.width = preview.height = Math.floor(preview.width / 8) * 8;
    const pv = Position.fromFen('r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 6 5');
    const pvLegal = pv.legalMoves();
    const styleTiles = [], schemeTiles = [];
    let colorBtns = {}, toggles = [], levelRow;

    const refresh = () => {
      paintBoard(preview, { pos: pv, legal: pvLegal, selected: 45, last: mv(6, 21, 0), hint: -1, flipped: false, cfg: work, drag: null });
      styleTiles.forEach((t, i) => { t.classList.toggle('on', work.style === i); paintStyleTile(t.firstChild, i); });
      schemeTiles.forEach((t, i) => t.classList.toggle('on', SCHEMES[i].light === work.light.toUpperCase() && SCHEMES[i].dark === work.dark.toUpperCase()));
      for (const k in colorBtns) { colorBtns[k].sw.style.background = work[k]; colorBtns[k].txt.textContent = work[k].toUpperCase(); }
      toggles.forEach(t => t.btn.classList.toggle('on', !!work[t.key]));
    };

    const paintStyleTile = (c, style) => {
      const ctx = c.getContext('2d'), s = c.width, half = s / 2;
      ctx.clearRect(0, 0, s, s);
      ctx.fillStyle = work.light; ctx.fillRect(0, 0, half, s);
      ctx.fillStyle = work.dark; ctx.fillRect(half, 0, s - half, s);
      const c2 = Object.assign({}, work, { style });
      drawPiece(ctx, K, 0, s * 0.3, half, s * 0.7, c2);
      drawPiece(ctx, -N, half, s * 0.3, s - half, s * 0.7, c2);
    };

    levelRow = choiceRow(['Leicht', 'Mittel', 'Schwer'], work.level - 1, i => { work.level = i + 1; });
    left.append(el('h3', null, 'Stärke des Computers'), levelRow);

    left.append(el('h3', null, 'Figurenstil'));
    const st = el('div', 'tiles');
    STYLE_NAMES.forEach((name, i) => {
      const t = el('button', 'tile');
      t.type = 'button';
      t.append(hiDpiCanvas(72), name);
      t.addEventListener('click', () => { work.style = i; refresh(); });
      styleTiles.push(t);
      st.append(t);
    });
    left.append(st);

    left.append(el('h3', null, 'Farbschema des Bretts'));
    const sc = el('div', 'tiles');
    SCHEMES.forEach(s => {
      const t = el('button', 'tile');
      t.type = 'button';
      const c = hiDpiCanvas(72), ctx = c.getContext('2d'), h = c.width / 2;
      ctx.fillStyle = s.light; ctx.fillRect(0, 0, h, h); ctx.fillRect(h, h, h, h);
      ctx.fillStyle = s.dark; ctx.fillRect(h, 0, h, h); ctx.fillRect(0, h, h, h);
      t.append(c, s.name);
      t.addEventListener('click', () => { work.light = s.light; work.dark = s.dark; refresh(); });
      schemeTiles.push(t);
      sc.append(t);
    });
    left.append(sc);

    left.append(el('h3', null, 'Eigene Farben'));
    const colors = el('div', 'colors');
    [['light', 'Helle Felder'], ['dark', 'Dunkle Felder'], ['white', 'Weiße Figuren'], ['black', 'Schwarze Figuren']].forEach(([key, label]) => {
      const cell = el('div');
      const b = el('button', 'cbtn');
      b.type = 'button';
      const sw = el('span', 'sw'), txt = el('span'), hintEl = el('span', 'hint', 'ändern');
      b.append(sw, txt, hintEl);
      b.addEventListener('click', async () => {
        const c = await pickColor(label, work[key]);
        if (c) { work[key] = c; refresh(); }
      });
      colorBtns[key] = { sw, txt };
      cell.append(el('label', null, label), b);
      colors.append(cell);
    });
    left.append(colors);

    left.append(el('h3', null, 'Anzeige'));
    [['showMoves', 'Mögliche Züge anzeigen'], ['showLast', 'Letzten Zug markieren'], ['showCoords', 'Koordinaten anzeigen']].forEach(([key, label]) => {
      const row = el('div', 'toggle-row');
      const btn = el('button', 'toggle');
      btn.type = 'button';
      btn.setAttribute('aria-label', label);
      row.append(btn, el('span', null, label));
      row.addEventListener('click', () => { work[key] = !work[key]; refresh(); });
      toggles.push({ key, btn });
      left.append(row);
    });

    right.append(el('h3', null, 'Vorschau'), preview);
    body.append(left, right);
    refresh();

    const ok = await openSheet('Einstellungen', body, sheet => [
      button('Standard', 'link', () => {
        Object.assign(work, { light: DEFAULTS.light, dark: DEFAULTS.dark, white: DEFAULTS.white, black: DEFAULTS.black,
                              style: 0, showMoves: true, showLast: true, showCoords: true });
        refresh();
      }),
      el('div', 'grow'),
      button('Abbrechen', '', () => closeSheet(sheet)),
      button('Übernehmen', 'primary', () => closeSheet(sheet, true))
    ], true);
    if (!ok) return;
    cfg = work;
    store('schach.einstellungen', cfg);
    draw();
    renderSide();
  }

  function pickColor(title, start) {
    let value = start.toUpperCase();
    const body = el('div');
    const pal = el('div', 'palette');
    const swatches = PALETTE.map(hex => {
      const b = el('button');
      b.type = 'button';
      b.style.background = hex;
      b.title = hex;
      b.addEventListener('click', () => set(hex, true));
      pal.append(b);
      return b;
    });
    const row = el('div', 'hexrow');
    const input = el('input');
    input.type = 'text'; input.maxLength = 7; input.spellcheck = false;
    const cur = el('div', 'cur');
    const native = el('input');
    native.type = 'color';
    const more = button('Weitere Farben …', 'link', () => native.click());
    row.append(input, cur, more, native);
    body.append(el('h3', null, 'Palette'), pal, el('h3', null, 'Farbwert'), row);

    function set(hex, updateText) {
      value = normHex(hex);
      cur.style.background = value;
      native.value = value.toLowerCase();
      swatches.forEach((b, i) => b.classList.toggle('on', PALETTE[i] === value));
      if (updateText) input.value = value;
    }
    input.addEventListener('input', () => { if (validHex(input.value)) set(input.value, false); });
    native.addEventListener('input', () => set(native.value, true));
    set(value, true);

    return openSheet(title, body, sheet => [el('div', 'grow'), button('Abbrechen', '', () => closeSheet(sheet)),
                                            button('Übernehmen', 'primary', () => closeSheet(sheet, value))]);
  }

  function percent(w, d, total) { return total === 0 ? '–' : Math.round(100 * (w + d * 0.5) / total) + ' %'; }

  function openStats() {
    const body = el('div');
    const fill = () => {
      body.innerHTML = '';
      const comp = stats.filter(r => !r.zwei);
      const count = f => { let w = 0, d = 0, l = 0; for (const r of comp) if (f(r)) { if (r.ergebnis > 0) w++; else if (r.ergebnis < 0) l++; else d++; } return [w, d, l]; };
      const [w, d, l] = count(() => true), total = w + d + l;

      body.append(el('h3', null, 'Gegen den Computer'));
      const tiles = el('div', 'stat-tiles');
      [[total, 'Partien'], [w, 'Siege'], [d, 'Remis'], [l, 'Niederlagen'], [percent(w, d, total), 'Punktequote']].forEach(([v, c]) => {
        const t = el('div', 'stat-tile');
        t.append(el('b', null, String(v)), el('span', null, c));
        tiles.append(t);
      });
      body.append(tiles);

      body.append(el('h3', null, 'Nach Stärke und Farbe'));
      const legend = el('div', 'legend');
      legend.innerHTML = '<span><i style="background:#E6E6E6"></i>Siege</span><span><i style="background:#8A8A8A"></i>Remis</span>' +
                         '<span><i style="background:#4B4B4B"></i>Niederlagen</span>';
      body.append(legend);
      const rows = [['Leicht', r => r.stufe === 1], ['Mittel', r => r.stufe === 2], ['Schwer', r => r.stufe === 3],
                    ['Mit Weiß', r => r.farbe === 1, true], ['Mit Schwarz', r => r.farbe === -1]];
      for (const [label, f, gap] of rows) {
        const [rw, rd, rl] = count(f), t = rw + rd + rl;
        const row = el('div', 'barrow' + (gap ? ' gap' : ''));
        const bar = el('div', 'bar');
        if (t > 0) [[rw, '#E6E6E6'], [rd, '#8A8A8A'], [rl, '#4B4B4B']].forEach(([v, c]) => {
          const i = el('i'); i.style.width = (100 * v / t) + '%'; i.style.background = c; bar.append(i);
        });
        row.append(el('span', null, label), bar, el('small', null, t === 0 ? 'keine Partie' : rw + ' S · ' + rd + ' R · ' + rl + ' N   ' + percent(rw, rd, t)));
        body.append(row);
      }

      let run = 0, best = 0;
      for (const r of comp) { run = r.ergebnis > 0 ? run + 1 : 0; best = Math.max(best, run); }
      body.append(el('p', 'line-text', 'Aktuelle Siegesserie: ' + run + '   ·   Längste Siegesserie: ' + best));

      const two = stats.filter(r => r.zwei);
      body.append(el('h3', null, 'Zwei Spieler'));
      body.append(el('p', 'line-text', two.length === 0 ? 'Noch keine Partie zu zweit beendet.'
        : two.length + (two.length === 1 ? ' Partie' : ' Partien') + ' – Weiß gewinnt ' + two.filter(r => r.ergebnis > 0).length +
          ', Schwarz gewinnt ' + two.filter(r => r.ergebnis < 0).length + ', Remis ' + two.filter(r => r.ergebnis === 0).length));

      body.append(el('h3', null, 'Letzte Partien'));
      const games = el('div', 'games');
      if (stats.length === 0) games.append(el('div', 'empty', 'Noch keine beendeten Partien. Gezählt wird jede Partie, die mit Matt, Remis oder Aufgabe endet.'));
      for (const r of stats.slice().reverse()) {
        const g = el('div', 'game');
        const dt = new Date(r.datum);
        const when = isNaN(dt) ? '' : dt.toLocaleDateString('de-DE') + ', ' + dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        g.append(el('div', 'who', r.zwei ? 'Zwei Spieler' : 'Computer · ' + LEVEL_NAMES[r.stufe] + (r.farbe === 1 ? ' · mit Weiß' : ' · mit Schwarz')));
        let res, cls;
        if (r.zwei) { res = r.ergebnis > 0 ? 'Weiß gewinnt' : r.ergebnis < 0 ? 'Schwarz gewinnt' : 'Remis'; cls = 'draw'; }
        else if (r.ergebnis > 0) { res = 'Sieg'; cls = 'win'; }
        else if (r.ergebnis < 0) { res = 'Niederlage'; cls = 'loss'; }
        else { res = 'Remis'; cls = 'draw'; }
        g.append(el('span', 'pill ' + cls, res));
        g.append(el('div', 'meta', when + '  ·  ' + r.grund + '  ·  ' + r.zuege + (r.zuege === 1 ? ' Zug' : ' Züge')));
        games.append(g);
      }
      body.append(games);
    };
    fill();
    return openSheet('Statistik', body, sheet => [
      button('Statistik zurücksetzen …', 'link', async () => {
        if (stats.length === 0) return;
        if (await message('Statistik zurücksetzen', 'Alle ' + stats.length + ' gespeicherten Partien aus der Statistik löschen? Das lässt sich nicht rückgängig machen.',
                          ['Zurücksetzen', 'Abbrechen']) !== 0) return;
        stats = [];
        store('schach.statistik', stats);
        fill();
      }),
      el('div', 'grow'),
      button('Schließen', 'primary', () => closeSheet(sheet))
    ], true);
  }

  // ---------------------------------------------------------------- Knöpfe und Tasten
  $('bUndo').addEventListener('click', undo);
  $('bRedo').addEventListener('click', redoMove);
  $('bHint').addEventListener('click', showHint);
  $('bFlip').addEventListener('click', flip);
  $('bResign').addEventListener('click', resign);
  $('bStats').addEventListener('click', openStats);
  $('bNew').addEventListener('click', askNewGame);
  $('bSettings').addEventListener('click', openSettings);

  document.addEventListener('keydown', e => {
    if (sheets.length) { if (e.key === 'Escape') closeSheet(sheets[sheets.length - 1]); return; }
    const ctrl = e.ctrlKey || e.metaKey;
    if ((ctrl && e.key === 'z') || e.key === 'ArrowLeft') { e.preventDefault(); undo(); }
    else if ((ctrl && e.key === 'y') || e.key === 'ArrowRight') { e.preventDefault(); redoMove(); }
    else if (ctrl && e.key === 'n') { e.preventDefault(); askNewGame(); }
    else if (ctrl && e.key === 'd') { e.preventDefault(); flip(); }
    else if (ctrl && e.key === 'h') { e.preventDefault(); showHint(); }
  });

  // ---------------------------------------------------------------- Start
  if (!loadGame()) startNewGame(1, false);
  new ResizeObserver(layoutBoard).observe(wrap);
  layoutBoard();
  maybeComputerMove();

  // Schrift für die klassischen Figuren nachladen und dann neu zeichnen
  if (document.fonts && document.fonts.load) {
    document.fonts.load('40px "Noto Sans Symbols 2"', '\u2654\u265A\u265F').then(() => {
      for (const k in metrics) delete metrics[k];
      draw();
      renderSide();
    }).catch(() => {});
  }

  // Offline-Betrieb (nur über http/https, nicht beim Öffnen als Datei)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // nur zum Testen: window.schach.state() liefert den Zustand
  window.schach = { state: () => ({ moves: sans.slice(), redo: redo.length, gameOver, resultText, humanSide, flipped, thinking, stats: stats.length }) };
})();
