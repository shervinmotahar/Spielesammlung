// Black Jack – Handy-Oberfläche. Ablauf wie in der Windows-App (F:\Claude\Spielesammlung\BlackJack\src\Gui.cs).
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const UI_FONT = '"Segoe UI", system-ui, Roboto, sans-serif';
  const FELTS = [['Grün', '#1E5C3A'], ['Blau', '#1C476A'], ['Rot', '#6A1E2A'], ['Grau', '#3A3A3A'], ['Lila', '#45326A']];
  const BACKS = [['Rot', '#A33232'], ['Blau', '#2D5296'], ['Grün', '#2E6B45'], ['Schwarz', '#2A2A2A'], ['Gold', '#A8843A']];
  const DECKS = [1, 2, 6, 8], STARTS = [500, 1000, 5000, 10000];
  const LOOK = { felt: 0, back: 0, decks: 6, h17: false, surrender: true, insurance: true, scores: true, count: false, animate: true };
  const DEFAULTS = Object.assign({ start: 1000 }, LOOK);

  // ---------------------------------------------------------------- Speicher (im Browser des Geräts)
  function load(key, def) {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch (e) { return def; }
  }
  function store(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* privates Fenster o. Ä. */ }
  }

  let cfg = Object.assign({}, DEFAULTS, load('blackjack.einstellungen', {}));
  if (!(cfg.felt >= 0 && cfg.felt < FELTS.length)) cfg.felt = 0;
  if (!(cfg.back >= 0 && cfg.back < BACKS.length)) cfg.back = 0;
  if (DECKS.indexOf(cfg.decks) < 0) cfg.decks = 6;
  if (STARTS.indexOf(cfg.start) < 0) cfg.start = 1000;
  let stats = load('blackjack.statistik', []);
  if (!Array.isArray(stats)) stats = [];

  // ---------------------------------------------------------------- Zustand
  const game = new BJ.Game();
  let rounds = [], roundId = '', roundHints = 0, busy = false, runId = 0, hintText = null, hintAct = null;

  function applyRules() {
    game.decks = cfg.decks; game.hitSoft17 = cfg.h17; game.allowSurrender = cfg.surrender; game.offerInsurance = cfg.insurance;
  }
  applyRules();

  // ---------------------------------------------------------------- Zahlen
  const N = v => (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('de-DE');
  const signed = v => v > 0 ? '+' + N(v) : v < 0 ? N(v) : '±0';
  const dec = v => (v >= 0 ? '+' : '−') + Math.abs(v).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  // ---------------------------------------------------------------- Farben
  function rgb(hex) { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  function shade(hex, k) {
    const c = rgb(hex).map(v => Math.round(Math.max(0, Math.min(255, k >= 0 ? v + (255 - v) * k : v * (1 + k)))));
    return 'rgb(' + c.join(',') + ')';
  }

  // ---------------------------------------------------------------- Karten und Chips zeichnen
  const RED = '#C62828', BLACK = '#1C1C1C', FACE = '#FAFAF7';
  const SUIT_PATHS = [
    'M50 4 C80 26 98 44 98 62 C98 76 87 84 75 84 C65 84 57 79 53 71 L58 96 L42 96 L47 71 C43 79 35 84 25 84 C13 84 2 76 2 62 C2 44 20 26 50 4 Z',
    'M50 92 C20 70 2 52 2 31 C2 15 14 5 28 5 C38 5 46 11 50 21 C54 11 62 5 72 5 C86 5 98 15 98 31 C98 52 80 70 50 92 Z',
    'M50 2 L90 50 L50 98 L10 50 Z',
    null
  ];
  let suitCache = null;
  function suitPath(s) {
    if (!suitCache) {
      suitCache = SUIT_PATHS.map(d => d ? new Path2D(d) : null);
      const p = new Path2D();                 // Kreuz: drei Kreise, Mitte und Stiel
      [[50, 25, 21], [25, 61, 21], [75, 61, 21], [50, 54, 14]].forEach(([x, y, r]) => { p.moveTo(x + r, y); p.arc(x, y, r, 0, Math.PI * 2); });
      p.moveTo(50, 52); p.lineTo(59, 96); p.lineTo(41, 96); p.closePath();
      suitCache[3] = p;
    }
    return suitCache[s];
  }
  function drawSuit(ctx, s, x, y, w, h, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(w / 100, h / 100);
    ctx.fillStyle = color;
    ctx.fill(suitPath(s), 'nonzero');
    ctx.restore();
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  const PIPS = [null, null,
    [1, 0, 1, 1], [1, 0, 1, .5, 1, 1], [0, 0, 2, 0, 0, 1, 2, 1], [0, 0, 2, 0, 1, .5, 0, 1, 2, 1],
    [0, 0, 2, 0, 0, .5, 2, .5, 0, 1, 2, 1], [0, 0, 2, 0, 1, .25, 0, .5, 2, .5, 0, 1, 2, 1],
    [0, 0, 2, 0, 1, .25, 0, .5, 2, .5, 1, .75, 0, 1, 2, 1],
    [0, 0, 2, 0, 0, 1 / 3, 2, 1 / 3, 1, .5, 0, 2 / 3, 2, 2 / 3, 0, 1, 2, 1],
    [0, 0, 2, 0, 1, 1 / 6, 0, 1 / 3, 2, 1 / 3, 0, 2 / 3, 2, 2 / 3, 1, 5 / 6, 0, 1, 2, 1]];

  // Karte in (x, y, w, h); sx < 1 für das Umdrehen (Mitte bleibt stehen)
  function drawCard(ctx, c, x, y, w, h, back, down, sx) {
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(Math.max(0.01, sx == null ? 1 : sx), 1);
    const X = -w / 2, Y = -h / 2, rad = w * 0.075;
    ctx.fillStyle = 'rgba(0,0,0,.27)';
    rr(ctx, X + w * 0.015, Y + w * 0.03, w, h, rad); ctx.fill();
    rr(ctx, X, Y, w, h, rad);
    ctx.fillStyle = FACE; ctx.fill();
    if (down) {
      const ins = w * 0.07, ix = X + ins, iy = Y + ins, iw = w - 2 * ins, ih = h - 2 * ins;
      ctx.save();
      rr(ctx, ix, iy, iw, ih, rad * 0.6);
      ctx.fillStyle = back; ctx.fill();
      ctx.clip();
      const step = Math.max(3, w / 9);
      ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = Math.max(1, w / 70);
      ctx.beginPath();
      for (let px = ix - ih; px < ix + iw; px += step) { ctx.moveTo(px, iy); ctx.lineTo(px + ih, iy + ih); ctx.moveTo(px, iy + ih); ctx.lineTo(px + ih, iy); }
      ctx.stroke();
      ctx.restore();
      rr(ctx, ix, iy, iw, ih, rad * 0.6);
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = Math.max(1, w / 60); ctx.stroke();
    } else if (c) drawFace(ctx, c, X, Y, w, h);
    rr(ctx, X, Y, w, h, rad);
    ctx.strokeStyle = 'rgba(0,0,0,.47)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }

  function drawFace(ctx, c, X, Y, w, h) {
    const col = BJ.isRed(c) ? RED : BLACK, label = BJ.LABELS[c.r];
    const fs = h * (c.r === 10 ? 0.135 : 0.155);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = '600 ' + fs + 'px ' + UI_FONT;
    for (let k = 0; k < 2; k++) {
      ctx.save();
      if (k === 1) ctx.rotate(Math.PI);
      const cx = X + w * 0.13 + (c.r === 10 ? w * 0.03 : 0);
      ctx.fillStyle = col;
      ctx.fillText(label, cx, Y + h * 0.04);
      const ss = w * 0.15;
      drawSuit(ctx, c.s, X + w * 0.13 - ss / 2, Y + h * 0.04 + fs * 1.05, ss, ss, col);
      ctx.restore();
    }
    if (c.r === 1) { const s = w * 0.46; drawSuit(ctx, c.s, -s / 2, -s / 2, s, s, col); }
    else if (c.r > 10) {
      const mx = X + w * 0.25, my = Y + h * 0.15, mw = w * 0.5, mh = h * 0.7;
      rr(ctx, mx, my, mw, mh, w * 0.04);
      ctx.globalAlpha = BJ.isRed(c) ? 0.1 : 0.08; ctx.fillStyle = col; ctx.fill();
      ctx.globalAlpha = 0.6; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, w / 70); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.font = '300 ' + (h * 0.3) + 'px ' + UI_FONT; ctx.textBaseline = 'middle'; ctx.fillStyle = col;
      ctx.fillText(label, 0, -h * 0.06);
      const s = w * 0.2;
      drawSuit(ctx, c.s, -s / 2, my + mh - s - h * 0.06, s, s, col);
    } else if (w < 46) { const s = w * 0.42; drawSuit(ctx, c.s, -s / 2, -s / 2 + h * 0.04, s, s, col); }
    else {
      const pts = PIPS[c.r], ps = w * 0.18;
      const x0 = X + w * 0.335, dx = w * 0.165, y0 = Y + h * 0.2, dy = h * 0.6;
      for (let i = 0; i < pts.length; i += 2) {
        ctx.save();
        ctx.translate(x0 + pts[i] * dx, y0 + pts[i + 1] * dy);
        if (pts[i + 1] > 0.5) ctx.rotate(Math.PI);
        drawSuit(ctx, c.s, -ps / 2, -ps / 2, ps, ps, col);
        ctx.restore();
      }
    }
  }

  const CHIP_COLORS = { 10: '#2F6FB0', 50: '#B83A3A', 100: '#262626', 500: '#6E45A8' };
  function drawChip(ctx, cx, cy, d, v, label) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.31)';
    ctx.beginPath(); ctx.arc(cx, cy + d * 0.06, d / 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = CHIP_COLORS[v] || '#262626';
    ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(245,245,245,.9)'; ctx.lineWidth = d * 0.12;
    for (let i = 0; i < 6; i++) {
      const a = (i * 60 - 12) * Math.PI / 180;
      ctx.beginPath(); ctx.arc(cx, cy, d * 0.44, a, a + 24 * Math.PI / 180); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = Math.max(1, d / 30);
    ctx.beginPath(); ctx.arc(cx, cy, d * 0.3, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.43)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2); ctx.stroke();
    if (label && d >= 18) {
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '600 ' + (d * (v >= 100 ? 0.24 : 0.3)) + 'px ' + UI_FONT;
      ctx.fillText(String(v), cx, cy + d * 0.02);
    }
    ctx.restore();
  }
  function drawStack(ctx, cx, bottom, d, amount) {
    const chips = [];
    let rest = amount;
    for (let i = BJ.CHIPS.length - 1; i >= 0; i--) while (rest >= BJ.CHIPS[i] && chips.length < 12) { chips.push(BJ.CHIPS[i]); rest -= BJ.CHIPS[i]; }
    if (chips.length > 8) chips.splice(0, chips.length - 8);
    chips.forEach((v, i) => drawChip(ctx, cx, bottom - d / 2 - i * d * 0.11, d, v, i === chips.length - 1));
  }

  // ---------------------------------------------------------------- Spieltisch
  let dealtAt = new Map(), flipAt = new Map(), lastDown = new Map();
  const ANIM = 240;
  function allCards(g) { const l = g.dealer.cards.slice(); g.hands.forEach(h => l.push(...h.cards)); return l; }
  function skipAnimations() {
    dealtAt = new Map(); flipAt = new Map(); lastDown = new Map();
    for (const c of allCards(game)) { dealtAt.set(c, 0); lastDown.set(c, c.down); }
  }

  function badge(ctx, s, cx, cy, kind) {
    if (!s) return;
    ctx.font = '600 13px ' + UI_FONT;
    const w = ctx.measureText(s).width + 16, h = 22;
    rr(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
    ctx.fillStyle = kind === 1 ? '#E6E6E6' : kind === 2 ? 'rgba(90,90,90,.8)' : 'rgba(0,0,0,.67)';
    ctx.fill();
    ctx.fillStyle = kind === 1 ? '#161616' : '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(s, cx, cy + 1);
  }

  // Zeichnet den Tisch für Spiel g in die Leinwand (W × H in CSS-Pixeln). Rückgabe: Animation läuft noch.
  function paintTable(ctx, W, H, g, look, preview, now) {
    ctx.clearRect(0, 0, W, H);
    const pad = Math.max(10, Math.min(16, W * 0.03));
    const ch = Math.min(H * (preview ? 0.2 : 0.235), W * (W < 600 ? 0.25 : 0.2)), cw = ch * 0.7;
    const chipD = ch * 0.34, badgeH = 22;
    const dealerY = pad + 4, playerY = H - pad - chipD * 1.5 - 10 - ch;
    const shoe = { x: W - pad - cw * 0.8, y: pad, w: cw * 0.8, h: ch * 0.8 };
    const felt = FELTS[look.felt][1], back = BACKS[look.back][1];
    let running = false;

    rr(ctx, 0.5, 0.5, W - 1, H - 1, 14);
    const grad = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.max(W, H) * 0.75);
    grad.addColorStop(0, shade(felt, 0.10)); grad.addColorStop(1, shade(felt, -0.18));
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = shade(felt, -0.45); ctx.lineWidth = 1; ctx.stroke();

    const text = 'rgba(255,255,255,.47)';
    function animated(c, x, y, w, h, rotate) {
      let t0 = dealtAt.get(c);
      if (t0 === undefined) { t0 = look.animate && !preview ? now : 0; dealtAt.set(c, t0); }
      if (lastDown.get(c) === true && !c.down && look.animate) flipAt.set(c, now);
      lastDown.set(c, c.down);
      let rx = x, ry = y;
      const k = t0 === 0 ? 1 : Math.min(1, (now - t0) / ANIM);
      if (k < 1) { running = true; const e = 1 - Math.pow(1 - k, 3); rx = shoe.x + (x - shoe.x) * e; ry = shoe.y + (y - shoe.y) * e; }
      let down = c.down, sx = 1;
      const f0 = flipAt.get(c);
      if (f0 !== undefined) {
        const kf = Math.min(1, (now - f0) / ANIM);
        if (kf < 1) { running = true; if (kf < 0.5) { down = true; sx = 1 - kf * 2; } else sx = kf * 2 - 1; } else flipAt.delete(c);
      }
      if (rotate) {
        ctx.save();
        ctx.translate(rx + h / 2, ry + h * 0.62);
        ctx.rotate(Math.PI / 2);
        drawCard(ctx, c, -w / 2, -h / 2, w, h, back, down, sx);
        ctx.restore();
      } else drawCard(ctx, c, rx, ry, w, h, back, down, sx);
    }

    if (!preview) {
      const my = dealerY + ch + badgeH + 14, py = playerY - badgeH - 12;
      if (py - my > 46) {
        const cy = (my + py) / 2;
        ctx.strokeStyle = 'rgba(255,255,255,.27)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(W / 2, cy - H * 0.45 - 18, W * 0.36, H * 0.45, 0, 35 * Math.PI / 180, 145 * Math.PI / 180); ctx.stroke();
        ctx.fillStyle = text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '600 ' + (W < 500 ? 11.5 : 13) + 'px ' + UI_FONT;
        ctx.fillText('BLACKJACK ZAHLT 3 ZU 2', W / 2, cy - 2);
        ctx.font = (W < 500 ? 10.5 : 11.5) + 'px ' + UI_FONT;
        ctx.fillText(look.h17 ? 'Die Bank zieht bis 16 und bei weicher 17' : 'Die Bank zieht bis 16 und steht ab 17', W / 2, cy + 16);
      }
      for (let i = 2; i >= 0; i--) drawCard(ctx, null, shoe.x - i * 2, shoe.y + i * 2, shoe.w, shoe.h, back, true, 1);
      ctx.fillStyle = text; ctx.font = '11.5px ' + UI_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(g.shoe.length + ' Karten', shoe.x + shoe.w / 2, shoe.y + shoe.h + 8);
      if (look.count) {
        ctx.fillStyle = 'rgba(255,255,255,.67)'; ctx.textAlign = 'left';
        ctx.fillText('Zähler ' + signed(g.runningCount), pad, pad);
        ctx.fillText('wahr ' + dec(g.trueCount()), pad, pad + 16);
      }
    }

    // Bank
    {
      const d = g.dealer, step = cw * 0.34;
      const x = (W - (cw + Math.max(0, d.cards.length - 1) * step)) / 2;
      d.cards.forEach((c, i) => animated(c, x + i * step, dealerY, cw, ch));
      if (look.scores && d.cards.length) badge(ctx, BJ.scoreText(d), W / 2, dealerY + ch + 8 + badgeH / 2, 0);
    }

    // Spielerhände
    if (g.hands.length) {
      let step = cw * 0.34;
      const gap = cw * 0.55;
      const hw = h => cw + Math.max(0, h.cards.length - 1) * step + (h.doubled && h.cards.length > 2 ? ch - cw : 0);
      let total = g.hands.reduce((s, h) => s + hw(h), 0) + (g.hands.length - 1) * gap;
      const scale = Math.min(1, (W - 2 * pad) / total);
      let x = (W - total * scale) / 2;
      const y = playerY + ch * (1 - scale);
      g.hands.forEach((h, hi) => {
        const width = hw(h) * scale, st = step * scale;
        h.cards.forEach((c, i) => animated(c, x + i * st, y, cw * scale, ch * scale, h.doubled && i === 2));
        const cx = x + width / 2;
        const active = g.phase === 'player' && hi === g.active && g.hands.length > 1;
        if (g.phase === 'over' && h.outcome)
          badge(ctx, h.outcome === 'Unentschieden' ? 'Unentschieden' : h.outcome + '  ' + signed(h.net), cx, y - 8 - badgeH / 2, h.net > 0 ? 1 : h.net < 0 ? 0 : 2);
        else if (look.scores && h.cards.length)
          badge(ctx, h.surrendered ? 'aufgegeben' : BJ.scoreText(h), cx, y - 8 - badgeH / 2, active ? 1 : 0);
        drawStack(ctx, cx, H - pad - chipD * 0.25, chipD, h.bet);
        if (active) { ctx.fillStyle = '#E6E6E6'; ctx.fillRect(x, y + ch * scale + 6, width, 3); }
        x += width + gap * scale;
      });
      if (g.insurance > 0) {
        const ix = Math.max(pad + chipD / 2, (W - total * scale) / 2 - chipD * 1.4);
        drawStack(ctx, ix, H - pad - chipD * 0.25, chipD * 0.8, g.insurance);
        ctx.fillStyle = text; ctx.font = '11.5px ' + UI_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText('Versicherung', ix, H - pad - chipD * 1.4);
      }
    } else if (!preview) {
      if (g.bet > 0) drawStack(ctx, W / 2, H - pad - chipD * 0.25, chipD, g.bet);
      ctx.fillStyle = text; ctx.font = '600 13px ' + UI_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(g.broke() ? 'Kein Guthaben mehr – starte ein neues Spiel.' : 'Wähle deinen Einsatz und tippe auf „Austeilen“.', W / 2, playerY + ch * 0.4);
    }
    return running && look.animate;
  }

  const cv = $('table'), wrap = $('tableWrap');
  let rafPending = false;
  function sizeCanvas(c, w, h) {
    const dpr = window.devicePixelRatio || 1;
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }
  function drawTable() {
    rafPending = false;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (w < 40 || h < 40) return;
    const ctx = sizeCanvas(cv, w, h);
    if (paintTable(ctx, w, h, game, cfg, false, performance.now()) && !rafPending) { rafPending = true; requestAnimationFrame(drawTable); }
  }
  function draw() { if (!rafPending) { rafPending = true; requestAnimationFrame(drawTable); } }

  // ---------------------------------------------------------------- Anzeige
  function iconCanvas(kind) {
    const c = document.createElement('canvas');
    const ctx = sizeCanvas(c, 26, 26);
    if (kind === 'bank') drawCard(ctx, null, 5, 1, 17, 24, BACKS[cfg.back][1], true, 1);
    else drawChip(ctx, 13, 12.5, 24, 100, false);
    return c;
  }
  function renderCard(el, kind, title, sub, val, cap, active) {
    el.innerHTML = '';
    el.classList.toggle('active', !!active);
    const names = document.createElement('div');
    names.className = 'names';
    names.innerHTML = '<div class="title"></div><div class="sub"></div>';
    names.children[0].textContent = title; names.children[1].textContent = sub;
    const v = document.createElement('div');
    v.className = 'val';
    v.innerHTML = '<b></b><span></span>';
    v.children[0].textContent = val; v.children[1].textContent = cap;
    el.append(iconCanvas(kind), names, v);
  }

  function renderSide() {
    const ph = game.phase, d = game.dealer;
    let bsub = (cfg.h17 ? 'zieht bei weicher 17' : 'steht ab 17') + '  ·  ' + game.decks + (game.decks === 1 ? ' Deck' : ' Decks');
    if (ph === 'dealer' && busy) bsub = 'zieht …';
    const open = d.cards.length > 0;
    const bval = !open ? '' : d.cards.length > 1 && d.cards[1].down ? BJ.total(d) + ' + ?' : String(BJ.total(d));
    const bcap = !open ? '' : BJ.isBlackjack(d) ? 'Blackjack' : BJ.total(d) > 21 ? 'überkauft' : 'Punkte';
    renderCard($('pBank'), 'bank', 'Bank', bsub, bval, bcap, ph === 'dealer');

    let sub;
    if (game.isBetting()) sub = 'Einsatz ' + N(game.bet) + '  ·  ' + (game.broke() ? 'pleite' : 'setzen');
    else if (ph === 'player') sub = 'Einsatz ' + N(game.totalWagered()) + '  ·  am Zug' + (game.hands.length > 1 ? ' (Hand ' + (game.active + 1) + '/' + game.hands.length + ')' : '');
    else if (ph === 'insurance') sub = 'Einsatz ' + N(game.totalWagered()) + '  ·  Versicherung?';
    else sub = 'Einsatz ' + N(game.totalWagered());
    renderCard($('pYou'), 'you', 'Du', sub, N(game.bankroll), 'Guthaben', ph !== 'dealer' && ph !== 'dealing');
    renderButtons();
    renderStatus();
    draw();
  }

  const PLAY = ['hit', 'stand', 'double', 'split', 'surrender'];
  function renderButtons() {
    const b = [0, 1, 2, 3, 4, 5].map(i => $('a' + i));
    if (game.isBetting()) {
      BJ.CHIPS.forEach((v, i) => { b[i].textContent = '+ ' + v; b[i].className = 'btn'; b[i].disabled = busy || game.bet + v > game.bankroll; });
      b[4].textContent = 'Löschen'; b[4].className = 'btn'; b[4].disabled = busy || game.bet === 0;
      b[5].textContent = 'Austeilen'; b[5].className = 'btn primary'; b[5].disabled = busy || !game.canDeal();
    } else {
      ['Karte ziehen', 'Stehen', 'Verdoppeln', 'Teilen', 'Aufgeben'].forEach((t, i) => {
        b[i].textContent = t;
        b[i].className = 'btn' + (i === 0 ? ' primary' : '') + (hintAct === PLAY[i] ? ' marked' : '');
        b[i].disabled = busy || !game.can(PLAY[i]);
      });
      b[5].textContent = 'Tipp'; b[5].className = 'btn'; b[5].disabled = busy || !game.canHit();
    }
    $('bNew').disabled = busy && !(game.phase === 'dealing' || game.phase === 'dealer');
  }

  function resultText() {
    let head;
    const net = game.roundNet;
    if (game.hands.length === 1) {
      const h = game.hands[0], t = BJ.total(h), dt = BJ.total(game.dealer);
      switch (h.outcome) {
        case 'Blackjack': head = 'Blackjack! Du gewinnst ' + N(h.net) + '.'; break;
        case 'Gewonnen': head = dt > 21 ? 'Die Bank hat sich überkauft – du gewinnst ' + N(h.net) + '.' : 'Du gewinnst ' + N(h.net) + ' mit ' + t + ' gegen ' + dt + '.'; break;
        case 'Unentschieden': head = 'Unentschieden – du bekommst deinen Einsatz zurück.'; break;
        case 'Überkauft': head = 'Überkauft mit ' + t + ' – der Einsatz ist verloren.'; break;
        case 'Aufgegeben': head = 'Aufgegeben – die Hälfte des Einsatzes kommt zurück.'; break;
        default: head = BJ.isBlackjack(game.dealer) ? 'Die Bank hat Blackjack – verloren.' : 'Verloren mit ' + t + ' gegen ' + dt + '.';
      }
    } else head = net > 0 ? 'Du gewinnst insgesamt ' + N(net) + '.' : net < 0 ? 'Du verlierst insgesamt ' + N(-net) + '.' : 'Insgesamt ausgeglichen.';
    if (game.insurance > 0) head += BJ.isBlackjack(game.dealer) ? '  Die Versicherung zahlt ' + N(2 * game.insurance) + '.' : '  Versicherung verloren.';
    if (game.broke()) head += '  Kein Guthaben mehr – starte ein neues Spiel.';
    return head;
  }

  function renderStatus() {
    const ph = game.phase;
    let s;
    if (hintText) s = hintText;
    else if (ph === 'over') s = resultText();
    else if (ph === 'betting') s = game.broke() ? 'Kein Guthaben mehr – starte ein neues Spiel.' : game.note || 'Wähle deinen Einsatz und tippe auf „Austeilen“.';
    else if (ph === 'dealing') s = game.note || 'Die Karten werden ausgeteilt …';
    else if (ph === 'insurance') s = 'Die Bank zeigt ein Ass – Versicherung?';
    else if (ph === 'dealer') s = game.note || 'Die Bank ist dran …';
    else {
      const h = game.current();
      s = (game.note ? game.note + '  ' : '') + (game.hands.length > 1 ? 'Hand ' + (game.active + 1) + ': ' : '') + 'Du hast ' + BJ.scoreText(h) + '.';
    }
    $('status').textContent = s;
    $('info').textContent = 'Mindesteinsatz ' + BJ.MIN_BET + '   ·   ' + game.shoe.length + ' Karten im Schuh';
  }

  function renderRounds() {
    const list = $('roundList');
    list.innerHTML = '';
    if (rounds.length === 0) { list.append(el('div', 'empty', 'Noch keine Runde gespielt.')); return; }
    for (let i = rounds.length - 1; i >= 0; i--) {
      const r = rounds[i];
      const row = el('div', 'rrow');
      row.append(el('span', 'no', r.no + '.'), el('span', 'sc', r.du + ' : ' + r.bank), el('span', 'oc', r.ausgang),
                 el('span', 'net' + (r.net < 0 ? ' minus' : r.net === 0 ? ' zero' : ''), signed(r.net)));
      list.append(row);
    }
    list.scrollLeft = 0; list.scrollTop = 0;
  }

  // ---------------------------------------------------------------- Spielablauf
  function newGame(bankroll, announce) {
    runId++;
    busy = false;
    applyRules();
    game.startBankroll = game.bankroll = bankroll;
    game.bet = Math.min(50, bankroll);
    game.hands = []; game.dealer = BJ.newHand(0); game.insurance = 0;
    game.newShoe();
    game.phase = 'betting';
    game.note = announce ? 'Neues Spiel mit ' + N(bankroll) + ' Guthaben – die Karten sind frisch gemischt.' : null;
    rounds = [];
    clearHint();
    renderRounds();
    skipAnimations();
    saveGame();
    renderSide();
  }

  function clearHint() { hintText = null; hintAct = null; }

  function addChip(v) {
    if (busy || !game.isBetting() || game.bet + v > game.bankroll) return;
    game.bet += v; game.note = null;
    renderSide();
  }
  function deal() {
    if (busy || !game.canDeal()) return;
    clearHint();
    roundId = String(Date.now());
    roundHints = 0;
    game.startRound();
    skipAnimations();
    cont();
  }
  function play(a) {
    if (busy || !game.can(a)) return;
    clearHint();
    game.act(a);
    cont();
  }
  function showHint() {
    if (busy || !game.canHit()) return;
    const r = BJ.advise(game);
    roundHints++;
    hintAct = r.act;
    hintText = 'Tipp: ' + BJ.ACT_NAMES[r.act] + ' – ' + r.reason + '.';
    renderSide();
  }
  function onAction(i) {
    if (busy) return;
    if (game.isBetting()) { if (i < 4) addChip(BJ.CHIPS[i]); else if (i === 4) { game.bet = 0; renderSide(); } else deal(); }
    else if (i < 5) play(PLAY[i]);
    else showHint();
  }

  const delay = ms => new Promise(r => setTimeout(r, ms));

  // Automatische Schritte mit kurzer Pause, bis der Spieler dran ist oder die Runde endet
  async function cont() {
    if (busy) return;
    const id = runId;
    busy = true;
    renderSide();
    try {
      while (true) {
        const before = game.phase;
        const did = game.step();
        if (id !== runId) return;
        if (!did) break;
        saveGame();
        renderSide();
        let ms = before === 'dealer' ? 620 : before === 'dealing' ? 330 : 280;
        if (!cfg.animate) ms = Math.min(ms, 150);
        await delay(ms);
        if (id !== runId) return;
      }
    } finally { if (id === runId) busy = false; }

    if (game.phase === 'insurance') {
      renderSide();
      const r = await message('Versicherung', 'Die Bank zeigt ein Ass. Möchtest du dich für ' + N(Math.floor(game.hands[0].bet / 2)) +
        ' gegen einen Blackjack der Bank versichern? Die Versicherung zahlt 2 zu 1.', ['Nicht versichern', 'Versichern']);
      if (id !== runId) return;
      game.takeInsurance(r === 1);
      cont();
      return;
    }
    if (game.phase === 'over') recordRound();
    saveGame();
    renderSide();
    if (game.phase === 'over' && game.broke()) {
      if (await message('Kein Guthaben mehr', 'Dein Guthaben reicht nicht mehr für den Mindesteinsatz von ' + BJ.MIN_BET + '. Möchtest du ein neues Spiel beginnen?',
                        ['Neues Spiel …', 'Schließen']) === 0) askNewGame();
    }
  }

  function recordRound() {
    if (rounds.some(r => r.id === roundId)) return;
    game.fitBet();
    rounds.push({ no: rounds.length + 1, id: roundId, du: game.playerScores(), bank: game.dealerScore(), ausgang: game.roundOutcome(), net: game.roundNet });
    renderRounds();
    let flags = '';
    if (game.hands.some(h => h.doubled)) flags += 'D';
    if (game.hands.length > 1) flags += 'T';
    if (game.insurance > 0) flags += 'V';
    if (game.hands[0].surrendered) flags += 'A';
    const up = game.up();
    const rec = { id: roundId, datum: new Date().toISOString(), einsatz: game.totalWagered(), ergebnis: game.roundNet, ausgang: game.roundOutcome(),
                  du: game.playerScores(), bank: game.dealerScore(), bankkarte: up.r === 1 ? 11 : BJ.value(up), besonderheiten: flags,
                  tipps: roundHints, guthaben: game.bankroll };
    const i = stats.findIndex(r => r.id === roundId);
    if (i >= 0) stats[i] = rec; else stats.push(rec);
    store('blackjack.statistik', stats);
  }

  // ---------------------------------------------------------------- Spielstand
  function saveGame() {
    const hand = h => ({ bet: h.bet, flags: (h.doubled ? 'D' : '') + (h.splitAces ? 'A' : '') + (h.fromSplit ? 'S' : '') + (h.surrendered ? 'X' : '') + (h.done ? 'F' : ''),
                         cards: BJ.codes(h), outcome: h.outcome || '', net: h.net });
    store('blackjack.spielstand', {
      guthaben: game.bankroll, startguthaben: game.startBankroll, einsatz: game.bet, phase: game.phase, bank: BJ.codes(game.dealer),
      haende: game.hands.map(hand), aktiv: game.active, versicherung: game.insurance, ergebnis: game.roundNet, id: roundId, tipps: roundHints,
      zaehler: game.runningCount, schuhGesamt: game.shoeTotal, schuh: game.shoe.map(BJ.code).join(' '), runden: rounds
    });
  }
  const parseCards = s => (s || '').split(' ').map(BJ.parse).filter(c => c);
  function loadGame() {
    const d = load('blackjack.spielstand', null);
    if (!d || typeof d.guthaben !== 'number' || ['betting', 'dealing', 'insurance', 'player', 'dealer', 'over'].indexOf(d.phase) < 0) return false;
    try {
      game.bankroll = d.guthaben; game.startBankroll = d.startguthaben || 1000; game.bet = d.einsatz || 0;
      game.active = d.aktiv || 0; game.insurance = d.versicherung || 0; game.roundNet = d.ergebnis || 0;
      game.runningCount = d.zaehler || 0; game.shoeTotal = d.schuhGesamt || 0;
      roundHints = d.tipps || 0; roundId = d.id || '';
      game.shoe = parseCards(d.schuh);
      if (game.shoe.length === 0) game.newShoe();
      game.dealer = BJ.newHand(0); game.dealer.cards = parseCards(d.bank);
      game.hands = (d.haende || []).map(x => {
        const h = BJ.newHand(x.bet);
        const f = x.flags || '';
        h.doubled = f.includes('D'); h.splitAces = f.includes('A'); h.fromSplit = f.includes('S'); h.surrendered = f.includes('X'); h.done = f.includes('F');
        h.cards = parseCards(x.cards); h.outcome = x.outcome || null; h.net = x.net || 0;
        return h;
      });
      let ph = d.phase;
      if (game.hands.length === 0 && ph !== 'betting' && ph !== 'over') ph = 'betting';
      game.phase = ph;
      if (game.active >= game.hands.length) game.active = Math.max(0, game.hands.length - 1);
      rounds = Array.isArray(d.runden) ? d.runden : [];
      if (!game.isBetting()) game.note = 'Spielstand geladen – die Runde geht weiter.';
      else if (rounds.length) game.note = 'Spielstand geladen – Guthaben ' + N(game.bankroll) + '.';
      return true;
    } catch (e) { return false; }
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
      try { history.pushState({ bjSheet: sheets.length }, ''); } catch (e) { /* ohne Verlauf geht es auch */ }
    });
  }
  function removeTopSheet() {
    const s = sheets.pop();
    if (!s) return;
    s.ov.remove();
    s.resolve(s.result);
  }
  let ignorePop = 0;
  function closeSheet(sheet, result) {
    if (sheets[sheets.length - 1] !== sheet) return;
    sheet.result = result;
    removeTopSheet();
    if (history.state && history.state.bjSheet) { ignorePop++; history.back(); }
  }
  window.addEventListener('popstate', () => {
    if (ignorePop > 0) { ignorePop--; return; }
    removeTopSheet();
  });
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
    row.pick = i => btns.forEach((b, j) => b.classList.toggle('on', j === i));
    return row;
  }
  function toggleRow(text, on, onChange) {
    const row = el('div', 'toggle-row');
    const t = el('button', 'toggle' + (on ? ' on' : ''));
    t.type = 'button';
    t.setAttribute('role', 'switch');
    row.append(t, el('span', null, text));
    row.addEventListener('click', () => { const v = !t.classList.contains('on'); t.classList.toggle('on', v); onChange(v); });
    row.set = v => t.classList.toggle('on', v);
    return row;
  }

  async function askNewGame() {
    if ($('bNew').disabled) return;
    let start = cfg.start;
    const body = el('div');
    body.append(el('p', 'note', 'Ein neues Spiel beginnt mit frisch gemischten Karten und neuem Guthaben. Dein jetziges Guthaben (' +
                    N(game.bankroll) + ') verfällt; die Statistik bleibt erhalten.'),
                el('h3', null, 'Startguthaben'), choiceRow(STARTS.map(N), Math.max(0, STARTS.indexOf(start)), i => { start = STARTS[i]; }));
    const ok = await openSheet('Neues Spiel', body, sheet => [el('div', 'grow'), button('Abbrechen', '', () => closeSheet(sheet)),
                                                               button('Spiel starten', 'primary', () => closeSheet(sheet, true))]);
    if (!ok) return;
    cfg.start = start;
    store('blackjack.einstellungen', cfg);
    newGame(start, true);
  }

  function openSettings() {
    const work = Object.assign({}, cfg);
    const body = el('div', 'settings-grid');
    const left = el('div'), right = el('div');
    const pv = document.createElement('canvas');
    pv.className = 'preview';
    // Beispielrunde für die Vorschau
    const demo = new BJ.Game();
    demo.dealer.cards = [{ r: 13, s: 1, down: false }, { r: 5, s: 3, down: true }];
    const dh = BJ.newHand(50); dh.cards = [{ r: 1, s: 0, down: false }, { r: 7, s: 2, down: false }];
    demo.hands = [dh]; demo.phase = 'player';
    const tileRows = [];
    function paintPreview() {
      const w = pv.clientWidth || 300, h = pv.clientHeight || 225;
      paintTable(sizeCanvas(pv, w, h), w, h, demo, work, true, 0);
    }
    function tiles(list, isBack, key) {
      const wrapEl = el('div', 'tiles');
      const items = list.map(([name, color], i) => {
        const t = el('button', 'tile');
        t.type = 'button';
        const c = document.createElement('canvas');
        const ctx = sizeCanvas(c, 72, 60);
        if (isBack) drawCard(ctx, null, 36 - 19, 2, 38, 54, color, true, 1);
        else { ctx.fillStyle = color; ctx.fillRect(0, 0, 72, 60); ctx.strokeStyle = shade(color, -0.4); ctx.strokeRect(0.5, 0.5, 71, 59); }
        t.append(c, el('span', null, name));
        t.addEventListener('click', () => { work[key] = i; sync(); });
        wrapEl.append(t);
        return t;
      });
      tileRows.push(() => items.forEach((t, i) => t.classList.toggle('on', work[key] === i)));
      return wrapEl;
    }
    const decks = choiceRow(DECKS.map(String), DECKS.indexOf(work.decks), i => { work.decks = DECKS[i]; });
    const toggles = [];
    const tg = (text, key) => { const r = toggleRow(text, work[key], v => { work[key] = v; sync(); }); toggles.push(() => r.set(work[key])); return r; };
    left.append(el('h3', null, 'Tischfarbe'), tiles(FELTS, false, 'felt'), el('h3', null, 'Kartenrückseite'), tiles(BACKS, true, 'back'),
                el('h3', null, 'Kartendecks im Schuh'), decks,
                el('h3', null, 'Regeln'), tg('Bank zieht bei weicher 17', 'h17'), tg('Aufgeben erlauben (halber Einsatz zurück)', 'surrender'),
                tg('Versicherung anbieten, wenn die Bank ein Ass zeigt', 'insurance'));
    right.append(el('h3', null, 'Vorschau'), pv, el('h3', null, 'Anzeige'), tg('Punktzahl anzeigen', 'scores'),
                 tg('Kartenzähler anzeigen (Hi-Lo)', 'count'), tg('Karten bewegt austeilen', 'animate'));
    body.append(left, right);
    function sync() {
      tileRows.forEach(f => f());
      toggles.forEach(f => f());
      decks.pick(DECKS.indexOf(work.decks));
      paintPreview();
    }
    const p = openSheet('Einstellungen', body, sheet => [
      button('Standard', 'link', () => { Object.assign(work, LOOK); sync(); }),
      el('div', 'grow'),
      button('Abbrechen', '', () => closeSheet(sheet)),
      button('Übernehmen', 'primary', () => closeSheet(sheet, true))
    ], true);
    requestAnimationFrame(sync);
    p.then(ok => {
      if (!ok) return;
      const decksChanged = work.decks !== cfg.decks;
      cfg = Object.assign(cfg, work);
      store('blackjack.einstellungen', cfg);
      applyRules();
      if (decksChanged && game.decks * 52 !== game.shoeTotal) game.note = 'Die neue Anzahl Decks gilt ab der nächsten Runde (dann wird neu gemischt).';
      clearHint();
      renderSide();
    });
  }

  function openRules() {
    const sections = [
      ['Ziel', 'Komm mit deinen Karten näher an 21 als die Bank, ohne 21 zu überschreiten. Zahlenkarten zählen ihren Wert, Bube, Dame und König zählen 10, das Ass 1 oder 11.'],
      ['Ablauf', 'Setze deinen Einsatz und teile aus. Du bekommst zwei offene Karten, die Bank eine offene und eine verdeckte. Dann ziehst du Karten oder bleibst stehen. Danach deckt die Bank auf und zieht bis 16; ab 17 bleibt sie stehen.'],
      ['Spielzüge', 'Verdoppeln: Einsatz verdoppeln, genau eine Karte dazu. Teilen: zwei gleichwertige Karten werden zu zwei Händen (bis zu vier Hände; geteilte Asse bekommen nur je eine Karte). Aufgeben: nur mit den ersten zwei Karten, du bekommst den halben Einsatz zurück.'],
      ['Auszahlung', 'Gewonnen 1 zu 1, Blackjack (Ass + Zehn mit den ersten zwei Karten) 3 zu 2, Unentschieden: Einsatz zurück. Zeigt die Bank ein Ass, kannst du dich mit dem halben Einsatz versichern – sie zahlt 2 zu 1, wenn die Bank Blackjack hat.'],
      ['Tasten (PC)', 'Z ziehen · S stehen · V verdoppeln · T teilen · A aufgeben · H Tipp · Leertaste austeilen · 1 – 4 Chips setzen · Entf Einsatz löschen · Strg+N neues Spiel']
    ];
    const body = el('div', 'rules');
    sections.forEach(([h, t]) => body.append(el('h3', null, h), el('p', null, t)));
    return openSheet('Regeln', body, sheet => [el('div', 'grow'), button('Schließen', 'primary', () => closeSheet(sheet))]);
  }

  function percent(w, d, total) { return total === 0 ? '–' : Math.round(100 * (w + d * 0.5) / total) + ' %'; }
  function flagText(f) {
    const p = [];
    if (f.includes('D')) p.push('verdoppelt'); if (f.includes('T')) p.push('geteilt');
    if (f.includes('V')) p.push('versichert'); if (f.includes('A')) p.push('aufgegeben');
    return p.join(', ');
  }

  function openStats() {
    const body = el('div');
    const fill = () => {
      body.innerHTML = '';
      const count = f => { let w = 0, d = 0, l = 0; for (const r of stats) if (f(r)) { if (r.ergebnis > 0) w++; else if (r.ergebnis < 0) l++; else d++; } return [w, d, l]; };
      const [w, d, l] = count(() => true), total = w + d + l;
      body.append(el('h3', null, 'Alle Runden'));
      const tiles = el('div', 'stat-tiles');
      [[total, 'Runden'], [w, 'Gewonnen'], [d, 'Unentschieden'], [l, 'Verloren'], [percent(w, d, total), 'Gewinnquote']].forEach(([v, c]) => {
        const t = el('div', 'stat-tile');
        t.append(el('b', null, String(v)), el('span', null, c));
        tiles.append(t);
      });
      body.append(tiles);
      let sum = 0, best = 0, bj = 0, wag = 0, high = 0, run = 0, longest = 0;
      for (const r of stats) {
        sum += r.ergebnis; wag += r.einsatz; best = Math.max(best, r.ergebnis); high = Math.max(high, r.guthaben);
        if (r.ausgang === 'Blackjack') bj++;
        run = r.ergebnis > 0 ? run + 1 : 0; longest = Math.max(longest, run);
      }
      body.append(el('p', 'line-text', 'Bilanz: ' + signed(sum) + '   ·   Gesetzt: ' + N(wag) + '   ·   Blackjacks: ' + bj),
                  el('p', 'line-text', 'Größter Gewinn: ' + signed(best) + '   ·   Höchstes Guthaben: ' + N(high) + '   ·   Gewinnserie: ' + run + ' (längste ' + longest + ')'));

      body.append(el('h3', null, 'Nach Spielzug und Karte der Bank'));
      const legend = el('div', 'legend');
      legend.innerHTML = '<span><i style="background:#E6E6E6"></i>Gewonnen</span><span><i style="background:#8A8A8A"></i>Unentschieden</span>' +
                         '<span><i style="background:#4B4B4B"></i>Verloren</span>';
      body.append(legend);
      const rows = [['Ohne Sonderzug', r => !r.besonderheiten], ['Verdoppelt', r => (r.besonderheiten || '').includes('D')],
                    ['Geteilt', r => (r.besonderheiten || '').includes('T')], ['Bank zeigt 2 – 6', r => r.bankkarte >= 2 && r.bankkarte <= 6, true],
                    ['Bank zeigt 7 – 9', r => r.bankkarte >= 7 && r.bankkarte <= 9], ['Bank zeigt 10 oder Ass', r => r.bankkarte >= 10]];
      for (const [label, f, gap] of rows) {
        const [rw, rd, rl] = count(f), t = rw + rd + rl;
        const row = el('div', 'barrow' + (gap ? ' gap' : ''));
        const bar = el('div', 'bar');
        if (t > 0) [[rw, '#E6E6E6'], [rd, '#8A8A8A'], [rl, '#4B4B4B']].forEach(([v, c]) => {
          const i = el('i'); i.style.width = (100 * v / t) + '%'; i.style.background = c; bar.append(i);
        });
        row.append(el('span', null, label), bar, el('small', null, t === 0 ? 'keine Runde' : rw + ' G · ' + rd + ' U · ' + rl + ' V   ' + percent(rw, rd, t)));
        body.append(row);
      }

      body.append(el('h3', null, 'Letzte Runden'));
      const games = el('div', 'games');
      if (stats.length === 0) games.append(el('div', 'empty', 'Noch keine gespielten Runden. Gezählt wird jede Runde, die abgerechnet wurde.'));
      for (const r of stats.slice().reverse()) {
        const g = el('div', 'game');
        const dt = new Date(r.datum);
        const when = isNaN(dt) ? '' : dt.toLocaleDateString('de-DE') + ', ' + dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        g.append(el('div', 'who', 'Du ' + r.du + ' · Bank ' + r.bank));
        const res = r.ergebnis === 0 ? 'Unentschieden' : (r.ausgang === 'Blackjack' ? 'Blackjack ' : r.ergebnis > 0 ? 'Gewonnen ' : 'Verloren ') + signed(r.ergebnis);
        g.append(el('span', 'pill ' + (r.ergebnis > 0 ? 'win' : r.ergebnis < 0 ? 'loss' : 'draw'), res));
        const ft = flagText(r.besonderheiten || '');
        g.append(el('div', 'meta', when + '  ·  Einsatz ' + N(r.einsatz) + (ft ? '  ·  ' + ft : '')));
        games.append(g);
      }
      body.append(games);
    };
    fill();
    return openSheet('Statistik', body, sheet => [
      button('Statistik zurücksetzen …', 'link', async () => {
        if (stats.length === 0) return;
        if (await message('Statistik zurücksetzen', 'Alle ' + stats.length + ' gespeicherten Runden aus der Statistik löschen? Das lässt sich nicht rückgängig machen.',
                          ['Zurücksetzen', 'Abbrechen']) !== 0) return;
        stats = [];
        store('blackjack.statistik', stats);
        fill();
      }),
      el('div', 'grow'),
      button('Schließen', 'primary', () => closeSheet(sheet))
    ], true);
  }

  // ---------------------------------------------------------------- Knöpfe und Tasten
  for (let i = 0; i < 6; i++) $('a' + i).addEventListener('click', () => onAction(i));
  $('bStats').addEventListener('click', openStats);
  $('bRules').addEventListener('click', openRules);
  $('bNew').addEventListener('click', askNewGame);
  $('bSettings').addEventListener('click', openSettings);

  document.addEventListener('keydown', e => {
    if (sheets.length) { if (e.key === 'Escape') closeSheet(sheets[sheets.length - 1]); return; }
    const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (ctrl && k === 'n') { e.preventDefault(); askNewGame(); return; }
    if (ctrl || e.altKey) return;
    if (k === ' ' || k === 'enter') { e.preventDefault(); if (game.isBetting()) deal(); }
    else if (k === 'z') play('hit');
    else if (k === 's') play('stand');
    else if (k === 'v') play('double');
    else if (k === 't') play('split');
    else if (k === 'a') play('surrender');
    else if (k === 'h') showHint();
    else if (k >= '1' && k <= '4') addChip(BJ.CHIPS[+k - 1]);
    else if ((k === 'delete' || k === 'backspace') && game.isBetting() && !busy) { game.bet = 0; renderSide(); }
  });

  // ---------------------------------------------------------------- Start
  if (!loadGame()) newGame(cfg.start, false);
  skipAnimations();
  renderRounds();
  renderSide();
  new ResizeObserver(draw).observe(wrap);
  cont();

  // Offline-Betrieb (nur über http/https, nicht beim Öffnen als Datei)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // nur zum Testen: window.blackjack.state() liefert den Zustand
  window.blackjack = {
    state: () => ({ phase: game.phase, bankroll: game.bankroll, bet: game.bet, hands: game.hands.map(BJ.codes), dealer: BJ.codes(game.dealer),
                    net: game.roundNet, busy, rounds: rounds.length, stats: stats.length, status: $('status').textContent }),
    stack: codes => { game.newShoe(); codes.slice().reverse().forEach(c => game.shoe.unshift(BJ.parse(c))); game.shoeTotal = game.decks * 52; }
  };
})();
