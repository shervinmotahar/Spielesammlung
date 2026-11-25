// Poker – Handy-Oberfläche. Ablauf wie in der Windows-App (F:\Claude\Spielesammlung\Poker\src\Gui.cs).
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const UI_FONT = '"Segoe UI", system-ui, Roboto, sans-serif';
  const FELTS = [['Grün', '#1E5C3A'], ['Blau', '#1C476A'], ['Rot', '#6A1E2A'], ['Grau', '#3A3A3A'], ['Lila', '#45326A']];
  const BACKS = [['Rot', '#A33232'], ['Blau', '#2D5296'], ['Grün', '#2E6B45'], ['Schwarz', '#2A2A2A'], ['Gold', '#A8843A']];
  const OPPS = [1, 3, 5], CHIPS = [500, 1000, 2000], LEVEL_NAMES = ['', 'Leicht', 'Mittel', 'Schwer'];
  const LOOK = { felt: 0, back: 0, handNames: true, fast: false };
  const DEFAULTS = Object.assign({ opponents: 3, chips: 1000, level: 2, rising: true }, LOOK);
  const N = v => (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('de-DE');
  const signed = v => v > 0 ? '+' + N(v) : v < 0 ? N(v) : '±0';

  function load(key, def) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch (e) { return def; } }
  function store(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* privates Fenster */ } }
  let cfg = Object.assign({}, DEFAULTS, load('poker.einstellungen', {}));
  if (OPPS.indexOf(cfg.opponents) < 0) cfg.opponents = 3;
  if (CHIPS.indexOf(cfg.chips) < 0) cfg.chips = 1000;
  if (!(cfg.level >= 1 && cfg.level <= 3)) cfg.level = 2;
  let stats = load('poker.statistik', { haende: [], turniere: [] });
  if (!stats || !Array.isArray(stats.haende)) stats = { haende: [], turniere: [] };

  let game = new PokerGame.Game(), raiseTo = 0, busy = false, runId = 0, hintText = null, hintAct = null, startChips = null, tourId = '', tourRecorded = false;

  // ---------------------------------------------------------------- Karten und Chips (wie Black Jack)
  const RED = '#C62828', BLACK = '#1C1C1C', FACE = '#FAFAF7';
  const SUIT_PATHS = ['M50 4 C80 26 98 44 98 62 C98 76 87 84 75 84 C65 84 57 79 53 71 L58 96 L42 96 L47 71 C43 79 35 84 25 84 C13 84 2 76 2 62 C2 44 20 26 50 4 Z',
                      'M50 92 C20 70 2 52 2 31 C2 15 14 5 28 5 C38 5 46 11 50 21 C54 11 62 5 72 5 C86 5 98 15 98 31 C98 52 80 70 50 92 Z', 'M50 2 L90 50 L50 98 L10 50 Z', null];
  let suitCache = null;
  function suitPath(s) {
    if (!suitCache) {
      suitCache = SUIT_PATHS.map(d => d ? new Path2D(d) : null);
      const p = new Path2D();
      [[50, 25, 21], [25, 61, 21], [75, 61, 21], [50, 54, 14]].forEach(([x, y, r]) => { p.moveTo(x + r, y); p.arc(x, y, r, 0, Math.PI * 2); });
      p.moveTo(50, 52); p.lineTo(59, 96); p.lineTo(41, 96); p.closePath();
      suitCache[3] = p;
    }
    return suitCache[s];
  }
  function drawSuit(ctx, s, x, y, w, h, color) { ctx.save(); ctx.translate(x, y); ctx.scale(w / 100, h / 100); ctx.fillStyle = color; ctx.fill(suitPath(s)); ctx.restore(); }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawCard(ctx, c, x, y, w, h, back, down) {
    ctx.save();
    const rad = w * 0.075;
    ctx.fillStyle = 'rgba(0,0,0,.27)'; rr(ctx, x + w * 0.015, y + w * 0.03, w, h, rad); ctx.fill();
    rr(ctx, x, y, w, h, rad); ctx.fillStyle = FACE; ctx.fill();
    if (down || !c) {
      const ins = w * 0.07;
      ctx.save(); rr(ctx, x + ins, y + ins, w - 2 * ins, h - 2 * ins, rad * 0.6); ctx.fillStyle = back; ctx.fill(); ctx.clip();
      const step = Math.max(3, w / 9);
      ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = Math.max(1, w / 70); ctx.beginPath();
      for (let px = x - h; px < x + w; px += step) { ctx.moveTo(px, y); ctx.lineTo(px + h, y + h); ctx.moveTo(px, y + h); ctx.lineTo(px + h, y); }
      ctx.stroke(); ctx.restore();
    } else {
      const col = c.s === 1 || c.s === 2 ? RED : BLACK, label = PokerGame.LABELS[c.r];
      const fs = h * (c.r === 10 ? 0.2 : 0.23);
      ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.font = '600 ' + fs + 'px ' + UI_FONT;
      ctx.fillText(label, x + w * 0.08, y + h * 0.04);
      const ss = w * 0.26;
      drawSuit(ctx, c.s, x + w * 0.08, y + h * 0.06 + fs, ss, ss, col);
      if (c.r > 10 && c.r < 14) {
        ctx.font = '300 ' + (h * 0.42) + 'px ' + UI_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, x + w * 0.62, y + h * 0.62);
      } else { const s = w * 0.5; drawSuit(ctx, c.s, x + w * 0.42 - s * 0.3, y + h * 0.5, s, s, col); }
    }
    rr(ctx, x, y, w, h, rad); ctx.strokeStyle = 'rgba(0,0,0,.47)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }
  const CHIP_COLORS = { 5: '#B83A3A', 25: '#2E7D4F', 100: '#262626', 500: '#6E45A8' };
  function drawChip(ctx, cx, cy, d, v, label) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.31)'; ctx.beginPath(); ctx.arc(cx, cy + d * 0.06, d / 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = CHIP_COLORS[v] || '#262626'; ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(245,245,245,.9)'; ctx.lineWidth = d * 0.12;
    for (let i = 0; i < 6; i++) { const a = (i * 60 - 12) * Math.PI / 180; ctx.beginPath(); ctx.arc(cx, cy, d * 0.44, a, a + 24 * Math.PI / 180); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = Math.max(1, d / 30); ctx.beginPath(); ctx.arc(cx, cy, d * 0.3, 0, Math.PI * 2); ctx.stroke();
    if (label && d >= 18) { ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 ' + (d * 0.28) + 'px ' + UI_FONT; ctx.fillText(String(v), cx, cy + 1); }
    ctx.restore();
  }
  function drawStack(ctx, cx, bottom, d, amount) {
    const chips = [];
    let rest = amount;
    for (const v of [500, 100, 25, 5]) while (rest >= v && chips.length < 12) { chips.push(v); rest -= v; }
    if (chips.length > 8) chips.splice(0, chips.length - 8);
    chips.forEach((v, i) => drawChip(ctx, cx, bottom - d / 2 - i * d * 0.11, d, v, i === chips.length - 1));
  }
  function shade(hex, k) {
    const v = parseInt(hex.slice(1), 16), c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map(x => Math.round(Math.max(0, Math.min(255, k >= 0 ? x + (255 - x) * k : x * (1 + k)))));
    return 'rgb(' + c.join(',') + ')';
  }
  function sizeCanvas(c, w, h) {
    const dpr = window.devicePixelRatio || 1, pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
    const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return ctx;
  }

  // ---------------------------------------------------------------- Tisch
  function paintTable(ctx, W, H, g, look, reveal) {
    ctx.clearRect(0, 0, W, H);
    const felt = FELTS[look.felt][1], back = BACKS[look.back][1];
    // Reihen-Anordnung (Hochformat) auf allen schmalen Tischen – das Oval braucht Breite (sonst überlappen die Schilder)
    const portrait = H > W * 1.1 || (W < 620 && W < H * 1.4);
    // Hochformat: abgerundetes Rechteck (Platz in den Ecken für die Schilder), quer: ovaler Tisch
    const ox = W * (portrait ? 0.015 : 0.04), oy = H * (portrait ? 0.015 : 0.07), ow = W - 2 * ox, oh = H - 2 * oy;
    const rad = portrait ? Math.min(ow, oh) * 0.16 : Math.min(ow, oh) / 2;
    rr(ctx, ox, oy, ow, oh, rad); ctx.fillStyle = '#2A1E14'; ctx.fill();
    const ins = Math.max(6, Math.min(W, H) * 0.014);
    const ix = ox + ins, iy = oy + ins, iw = ow - 2 * ins, ih = oh - 2 * ins;
    rr(ctx, ix, iy, iw, ih, rad - ins);
    const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.6);
    grad.addColorStop(0, shade(felt, 0.1)); grad.addColorStop(1, shade(felt, -0.25));
    ctx.fillStyle = grad; ctx.fill(); ctx.strokeStyle = shade(felt, -0.5); ctx.lineWidth = 1; ctx.stroke();

    // Maße: Schild (Name, Chips, Aktion, kleine verdeckte Karten), Kartengröße
    const n = g.players.length, gap = 6;
    const podW = portrait ? Math.min(122, (iw - 4 * gap) / 3) : Math.min(150, Math.max(104, W * 0.17));
    const podH = portrait ? (ih < 340 ? 48 : 54) : 60;
    // Hochformat: Kartengröße aus der Höhe zwischen den Schild-Reihen. Von oben nach unten liegen dort:
    // Einsätze/aufgedeckte Karten der oberen Reihe (0,8·ch), Pot (20), Tischkarten (ch), dein Einsatz (0,3·ch), deine Karten (1,1·ch)
    const T = iy + 6 + podH / 2, B = iy + ih - 6 - podH / 2, mid = B - T - podH;
    const ch = portrait ? Math.max(26, Math.min(H * 0.13, W * 0.16, (mid - 44) / 3.2)) : Math.min(H * 0.16, W * 0.09), cw = ch * 0.7;
    const hkh = ch * 1.1, hkw = cw * 1.1;                                    // deine Karten
    const cx = W / 2;
    // Sitzplätze (Mittelpunkt des Schilds); Platz 0 = du unten in der Mitte, dann im Uhrzeigersinn
    let seats, boardY;
    if (portrait) {
      const L = ix + gap + podW / 2, R = ix + iw - gap - podW / 2, C = cx;
      seats = n === 2 ? [[C, B], [C, T]] : n === 4 ? [[C, B], [L, T], [C, T], [R, T]]
                                       : [[C, B], [L, B], [L, T], [C, T], [R, T], [R, B]];
      const d = Math.max(16, ch * 0.3), zt = Math.max(d + 8, ch * 0.8 + 8);
      const need = zt + 20 + ch + d + 10 + hkh + 6, extra = Math.max(0, mid - need);
      boardY = T + podH / 2 + zt + 20 + extra / 2 + ch / 2;
    } else {
      const rx = iw / 2 - podW / 2 - gap, ry = ih / 2 - podH / 2 - gap;
      seats = g.players.map((p, i) => { const a = Math.PI / 2 + 2 * Math.PI * i / n; return [cx + Math.cos(a) * rx, H / 2 + Math.sin(a) * ry]; });
      boardY = H / 2;
    }
    // niedriger Tisch (Handy quer): deine Karten passen nicht über dein Schild → offen im Schild selbst
    const inline = !portrait && seats[0][1] - podH / 2 - (boardY + ch / 2) < hkh + 16;
    const ikh = podH - 10, ikw = ikh * 0.7;

    // Gemeinschaftskarten und Pot
    const bx = cx - (5 * cw + 4 * cw * 0.12) / 2, by = boardY - ch / 2;
    for (let i = 0; i < 5; i++) {
      const x = bx + i * cw * 1.12;
      if (i < g.board.length) drawCard(ctx, g.board[i], x, by, cw, ch, back, false);
      else { rr(ctx, x, by, cw, ch, cw * 0.075); ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    ctx.fillStyle = 'rgba(255,255,255,.86)'; ctx.font = '600 ' + (portrait ? 13 : 14) + 'px ' + UI_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Pot ' + N(g.pot()), cx, by - 13);

    const fit = (s, maxW) => { if (ctx.measureText(s).width <= maxW) return s; while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1); return s + '…'; };
    const podWidth = pl => pl.human && inline && !pl.out && pl.cards.length === 2 ? podW + ikw * 1.75 + 6 : podW;
    // belegte Flächen [x, y, b, h]: Tischkarten mit Pot, alle Schilder, deine großen Karten – aufgedeckte Karten weichen ihnen aus
    const taken = [[bx - 4, by - 24, 5 * cw * 1.12 + 8, ch + 28]];
    g.players.forEach((pl, i) => {
      const w = podWidth(pl); taken.push([seats[i][0] - w / 2 - 2, seats[i][1] - podH / 2 - 2, w + 4, podH + 4]);
      if (pl.human && !inline) taken.push([seats[i][0] - hkw * 0.9 - 2, seats[i][1] - podH / 2 - 8 - hkh, hkw * 1.8 + 4, hkh + 4]);
    });
    const free = r => r[0] >= 2 && r[1] >= 2 && r[0] + r[2] <= W - 2 && r[1] + r[3] <= H - 2 &&
      taken.every(t => r[0] >= t[0] + t[2] || t[0] >= r[0] + r[2] || r[1] >= t[1] + t[3] || t[1] >= r[1] + r[3]);
    g.players.forEach((pl, i) => {
      const [sx, sy] = seats[i];
      const human = pl.human, cardsIn = human && inline && !pl.out && pl.cards.length === 2;
      const pw = podWidth(pl);
      const left = sx - pw / 2, top = sy - podH / 2;
      // Richtung zur Tischmitte: dort liegen Einsatz bzw. aufgedeckte Karten
      let ux = cx - sx, uy = boardY - sy;
      if (portrait) { ux = 0; uy = sy < boardY ? 1 : -1; }
      const len = Math.hypot(ux, uy) || 1; ux /= len; uy /= len;
      const reach = Math.min(Math.abs(ux) > 0.01 ? pw / 2 / Math.abs(ux) : 1e9, Math.abs(uy) > 0.01 ? podH / 2 / Math.abs(uy) : 1e9);
      const spot = (extra) => [sx + ux * (reach + extra), sy + uy * (reach + extra)];

      // deine Karten groß über deinem Schild
      if (human && !inline && !pl.out && pl.cards.length === 2) {
        const kx = sx - (hkw * 1.8) / 2, ky = top - 6 - hkh;
        pl.cards.forEach((c, k) => {
          drawCard(ctx, c, kx + k * hkw * 0.8, ky + (k === 0 ? hkh * 0.04 : 0), hkw, hkh, back, false);
          if (pl.folded) { rr(ctx, kx + k * hkw * 0.8, ky + (k === 0 ? hkh * 0.04 : 0), hkw, hkh, hkw * 0.075); ctx.fillStyle = 'rgba(20,20,20,.6)'; ctx.fill(); }
        });
      }
      // aufgedeckte Karten der Gegner am Ende der Hand (dort, wo sonst der Einsatz liegt)
      const shown = !human && reveal && !pl.out && !pl.folded && pl.cards.length === 2 && !pl.cards[0].down;
      if (shown) {
        const kw = cw * 0.8, kh = ch * 0.8, bw = kw * 1.95;
        // Kandidaten: Richtung Tischmitte, seitlich zur Mitte, über/unter dem Schild – der erste freie gewinnt
        const sgx = ux > 0.05 ? 1 : ux < -0.05 ? -1 : 0, sgy = sy < boardY ? 1 : -1;
        const cands = [spot(4 + (Math.abs(uy) > 0.7 ? kh / 2 : kw))];
        if (sgx) cands.push([sx + sgx * (pw / 2 + 5 + bw / 2), sy]);
        cands.push([sx, sy + sgy * (podH / 2 + 5 + kh / 2)], [sx, sy - sgy * (podH / 2 + 5 + kh / 2)]);
        if (sgx) cands.push([sx - sgx * (pw / 2 + 5 + bw / 2), sy]);
        let pos = cands[0];
        for (const c of cands) { const r = [c[0] - bw / 2, c[1] - kh / 2, bw, kh]; if (free(r)) { pos = c; break; } }
        const [px, py] = pos;
        taken.push([px - bw / 2 - 2, py - kh / 2 - 2, bw + 4, kh + 4]);
        pl.cards.forEach((c, k) => drawCard(ctx, c, px - bw / 2 + k * kw * 0.95, py - kh / 2, kw, kh, back, false));
      }

      // Schild
      const active = g.toAct === i && PokerGame.STREETS.indexOf(g.street) <= 3;
      const won = pl.won > 0 && g.street === 'over';
      ctx.save();
      if (pl.out || pl.folded) ctx.globalAlpha = 0.6;
      rr(ctx, left, top, pw, podH, 8); ctx.fillStyle = 'rgba(18,18,18,.88)'; ctx.fill();
      ctx.strokeStyle = active || won ? '#E6E6E6' : 'rgba(255,255,255,.3)'; ctx.lineWidth = active || won ? 2 : 1; ctx.stroke();
      let tx = left + 9;
      if (cardsIn) {
        pl.cards.forEach((c, k) => drawCard(ctx, c, left + 5 + k * ikw * 0.75, top + 5, ikw, ikh, back, false));
        tx = left + 5 + ikw * 1.75 + 6;
      }
      if (!human && !pl.out && pl.cards.length === 2 && !pl.folded && !shown) {
        const mh = Math.min(podH - 22, 30), mw = mh * 0.68, my = top + (podH - mh) / 2;
        drawCard(ctx, null, left + 5, my, mw, mh, back, true);
        drawCard(ctx, null, left + 5 + mw * 0.35, my, mw, mh, back, true);
        tx = left + 5 + mw * 1.35 + 6;
      }
      const tagR = portrait ? 8 : 9, tags = [];
      if (i === g.dealer) tags.push(['D', '#FFFFFF', '#161616']);
      if (g.street !== 'over' && i === g.sbPos) tags.push(['SB', '#4B4B4B', '#FFFFFF']);
      else if (g.street !== 'over' && i === g.bbPos) tags.push(['BB', '#4B4B4B', '#FFFFFF']);
      const textW = left + pw - 7 - tx;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#EDEDED'; ctx.font = '600 ' + (portrait ? 12.5 : 13.5) + 'px ' + UI_FONT;
      ctx.fillText(fit(pl.name, textW), tx, top + podH * 0.24);
      ctx.fillStyle = '#CFCFCF'; ctx.font = (portrait ? 12 : 13) + 'px ' + UI_FONT;
      ctx.fillText(fit(pl.out ? '–' : N(pl.chips), textW - tags.length * (tagR * 2 + 3)), tx, top + podH * 0.51);
      let status = pl.out ? 'Platz ' + pl.place : won ? 'gewinnt ' + N(pl.won) : pl.folded ? 'ausgestiegen' : pl.allIn ? 'all-in' : pl.last;
      if (g.street === 'over' && pl.hv >= 0 && look.handNames && (reveal || human) && !pl.folded) status = PokerGame.handName(pl.hv);
      ctx.fillStyle = won ? '#E6E6E6' : '#9E9E9E'; ctx.font = (portrait ? 10.5 : 11.5) + 'px ' + UI_FONT;
      // passt „Mitgehen 20“ nicht, Betrag weglassen (er liegt ohnehin als Chips auf dem Tisch)
      if (status && ctx.measureText(status).width > textW) status = status.replace(/\s[\d.]+$/, '');
      ctx.fillText(fit(status || '', textW), tx, top + podH * 0.78);
      // D / SB / BB rechts in der Chips-Zeile
      let gx = left + pw - 6 - tagR;
      for (const [s, bg, fg] of tags) {
        ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(gx, top + podH * 0.51, tagR, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.font = '600 ' + (tagR * (s.length > 1 ? 0.95 : 1.2)) + 'px ' + UI_FONT;
        ctx.fillText(s, gx, top + podH * 0.51 + 0.5);
        gx -= tagR * 2 + 3;
      }
      ctx.restore();

      // Einsatz dieser Runde: Chips und Betrag zwischen Schild und Tischmitte (bei dir neben deinen Karten)
      if (pl.bet > 0) {
        const d = Math.max(16, ch * 0.3);
        let ex, ey;
        if (human && !inline) { ex = sx; ey = top - 6 - hkh - 8 - d * 0.5; }     // über deinen Karten
        else [ex, ey] = spot(6 + d * 0.6);
        drawStack(ctx, ex - d * 0.55, ey + d / 2, d, pl.bet);
        ctx.fillStyle = '#fff'; ctx.font = '600 12px ' + UI_FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(N(pl.bet), ex + d * 0.05, ey);
      }
    });
  }
  const cv = $('table'), wrap = $('tableWrap');
  function draw() {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (w < 40 || h < 40) return;
    paintTable(sizeCanvas(cv, w, h), w, h, game, cfg, game.street === 'over');
  }

  // ---------------------------------------------------------------- Anzeige
  function el_(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function infoCard(el, kind, title, sub, val, cap, active) {
    el.innerHTML = '';
    el.classList.toggle('active', !!active);
    const c = document.createElement('canvas');
    c.style.width = c.style.height = '26px';
    drawChip(sizeCanvas(c, 26, 26), 13, 12.5, 24, kind === 'table' ? 500 : 100, false);
    const names = el_('div', 'names'); names.append(el_('div', 'title', title), el_('div', 'sub', sub));
    const v = el_('div', 'val'); v.append(el_('b', null, val), el_('span', null, cap));
    el.append(c, names, v);
  }
  function render() {
    const h = game.human(), my = game.humanToAct() && !busy, over = game.street === 'over';
    infoCard($('pTable'), 'table', 'Tisch', 'Hand ' + game.handNo + ' · Blinds ' + game.sb + ' / ' + game.bb + ' · ' + LEVEL_NAMES[game.level], N(game.pot()), 'Pot', false);
    infoCard($('pYou'), 'you', 'Du', h.out ? 'ausgeschieden' : game.humanToAct() ? (game.toCall(h) > 0 ? 'am Zug · zu zahlen ' + N(game.toCall(h)) : 'am Zug') :
             h.folded && !over ? 'ausgestiegen' : h.allIn ? 'all-in' : 'wartet', N(h.chips), 'Chips', game.humanToAct());
    const list = $('roundList');
    list.innerHTML = '';
    for (const s of game.log.slice(-80)) list.append(el_('div', 'lrow' + (s.startsWith('— ') ? ' head' : s.startsWith('Du ') ? ' me' : ''), s));
    list.scrollTop = list.scrollHeight;
    // Knöpfe
    const fold = $('aFold'), call = $('aCall'), raise = $('aRaise');
    if (over) { fold.textContent = game.tournamentOver() ? 'Turnier beendet' : 'Nächste Hand'; fold.className = 'btn primary'; fold.disabled = busy || game.tournamentOver(); }
    else { fold.textContent = 'Aussteigen'; fold.className = 'btn'; fold.disabled = !my || game.toCall(h) === 0; }
    const c = game.toCall(h);
    call.textContent = c === 0 ? 'Schieben' : c >= h.chips ? 'All-in ' + N(c) : 'Mitgehen ' + N(c);
    call.className = 'btn' + (my ? ' primary' : ''); call.disabled = !my;
    const can = my && game.canRaise(h);
    if (can) raiseTo = Math.max(game.minRaiseTo(h), Math.min(raiseTo, game.maxRaiseTo(h)));
    raise.textContent = !can ? (game.currentBet === 0 ? 'Setzen' : 'Erhöhen') : raiseTo >= game.maxRaiseTo(h) ? 'All-in ' + N(raiseTo) : (game.currentBet === 0 ? 'Setzen ' : 'Auf ') + N(raiseTo);
    raise.className = 'btn'; raise.disabled = !can;
    $('aMinus').disabled = !can || raiseTo <= game.minRaiseTo(h);
    $('aPlus').disabled = !can || raiseTo >= game.maxRaiseTo(h);
    $('aAllIn').disabled = !my || h.chips === 0; $('aAllIn').className = 'btn';
    $('aHint').disabled = !my;
    if (my && hintAct) ({ fold, call, raise, allin: $('aAllIn') })[hintAct].classList.add('marked');
    $('bNew').classList.toggle('primary', game.tournamentOver());
    $('mNew').classList.toggle('primary', game.tournamentOver()); $('menuBtn').classList.toggle('marked', game.tournamentOver());
    // Status
    let s;
    if (game.tournamentOver() && over) s = h.out ? 'Du bist ausgeschieden (Platz ' + h.place + ' von ' + game.players.length + '). Starte ein neues Turnier.' : 'Du hast das Turnier gewonnen!  Glückwunsch!';
    else if (hintText) s = hintText;
    else if (over) s = (game.result ? game.result + '  ' : '') + 'Weiter mit „Nächste Hand“.';
    else if (game.humanToAct()) {
      s = 'Du bist dran' + (c > 0 ? ' – ' + N(c) + ' zum Mitgehen.' : ' – schieben oder setzen.');
      if (game.board.length >= 3 && cfg.handNames) s += ' Dein Blatt: ' + PokerGame.handName(game.evaluate(h)) + '.';
    } else if (game.toAct >= 0) s = game.players[game.toAct].name + ' überlegt …';
    else s = '…';
    $('status').textContent = s;
    $('info').textContent = game.activeCount() + ' von ' + game.players.length + ' Spielern im Turnier';
    draw();
  }

  // ---------------------------------------------------------------- Ablauf
  const delay = ms => new Promise(r => setTimeout(r, ms));
  function newTournament(announce) {
    runId++; busy = false;
    game = new PokerGame.Game();
    game.setup(cfg.opponents, cfg.chips, cfg.level, cfg.rising);
    tourId = String(Date.now()); tourRecorded = false;
    hintText = hintAct = null;
    if (announce) game.log.push('Neues Turnier mit ' + cfg.opponents + (cfg.opponents === 1 ? ' Gegner' : ' Gegnern') + ', je ' + N(cfg.chips) + ' Chips.');
    nextHand();
  }
  function nextHand() {
    if (busy || game.street !== 'over' || game.tournamentOver()) return;
    hintText = hintAct = null;
    startChips = game.players.map(p => p.chips);
    game.startHand();
    raiseTo = game.minRaiseTo(game.human());
    saveGame();
    cont();
  }
  function humanAct(a) {
    if (!game.humanToAct() || busy) return;
    const h = game.human();
    if (a === 'fold' && game.toCall(h) === 0) return;
    if (a === 'call' && game.toCall(h) === 0) a = 'check';
    if (a === 'raise' && !game.canRaise(h)) return;
    hintText = hintAct = null;
    game.act(a, raiseTo);
    cont();
  }
  function allIn() {
    const h = game.human();
    if (!game.humanToAct() || busy) return;
    if (game.canRaise(h)) { raiseTo = game.maxRaiseTo(h); humanAct('raise'); } else humanAct('call');
  }
  function changeRaise(dir) {
    const h = game.human();
    if (!game.humanToAct() || !game.canRaise(h)) return;
    raiseTo = Math.max(game.minRaiseTo(h), Math.min(game.maxRaiseTo(h), raiseTo + dir * game.bb));
    render();
  }
  function showHint() {
    const h = game.human();
    if (!game.humanToAct() || busy) return;
    const eq = game.equity(h, 1500), opp = game.effectiveOpponents(), c = game.toCall(h), pot = game.pot();
    const odds = c > 0 ? c / (pot + c) : 0, strong = Math.min(0.85, 1.6 / (opp + 1)), pct = Math.round(eq * 100) + ' %';
    let why;
    if (c === 0) { if (eq > strong) { hintAct = 'raise'; why = 'Setzen – dein Blatt ist stark'; } else { hintAct = 'call'; why = 'Schieben – kostenlos weiterspielen'; } }
    else if (eq < odds) { hintAct = 'fold'; why = 'Aussteigen – Mitgehen kostet ' + Math.round(odds * 100) + ' % des Pots'; }
    else if (eq > strong) { hintAct = 'raise'; why = 'Erhöhen – du bist klar vorne'; }
    else { hintAct = 'call'; why = 'Mitgehen – die Gewinnchance reicht'; }
    if (eq > 0.85 && opp === 1) hintAct = 'allin';
    hintText = 'Tipp: Gewinnchance etwa ' + pct + '. ' + why + '.';
    render();
  }
  async function cont() {
    if (busy) return;
    const id = runId;
    busy = true; render();
    try {
      while (true) {
        const botTurn = game.toAct >= 0 && !game.players[game.toAct].human && PokerGame.STREETS.indexOf(game.street) <= 3;
        if (botTurn) { render(); await delay(cfg.fast ? 250 : 650); if (id !== runId) return; }
        const before = game.street;
        const did = game.step();
        if (id !== runId) return;
        if (!did) break;
        render();
        if (game.street !== before && game.street !== 'over') { await delay(cfg.fast ? 350 : 800); if (id !== runId) return; }
      }
    } finally { if (id === runId) busy = false; }
    if (game.street === 'over') handFinished();
    if (game.humanToAct()) raiseTo = game.minRaiseTo(game.human());
    saveGame(); render();
  }
  async function handFinished() {
    const h = game.human();
    if (h.cards.length === 2) {
      let outcome;
      if (h.folded) outcome = 'Ausgestiegen';
      else if (h.won === 0) outcome = 'Verloren';
      else outcome = game.players.some(p => p !== h && p.won > 0 && p.hv >= 0 && p.hv === h.hv) ? 'Geteilt' : 'Gewonnen';
      const [a, b] = h.cards;
      stats.haende.push({ id: tourId + '-' + game.handNo, datum: new Date().toISOString(), einsatz: h.total, ergebnis: h.won - h.total, ausgang: outcome,
                          blatt: h.hv >= 0 && !h.folded ? PokerGame.handName(h.hv) : '',
                          start: a.r === b.r ? 'Paar' : a.s === b.s ? 'Gleichfarbig' : a.r === 14 || b.r === 14 ? 'Mit Ass' : 'Sonstige',
                          gegner: game.players.length - 1, showdown: h.hv >= 0 && !h.folded, chips: h.chips });
      if (stats.haende.length > 2000) stats.haende.splice(0, stats.haende.length - 2000);
    }
    let showEnd = false;
    if (game.tournamentOver() && !tourRecorded) {
      tourRecorded = true;
      stats.turniere.push({ id: tourId, datum: new Date().toISOString(), platz: h.out ? h.place : 1, spieler: game.players.length, haende: game.handNo, stufe: game.level });
      showEnd = true;
    }
    store('poker.statistik', stats);
    if (showEnd) {
      const msg = h.out ? 'Du bist auf Platz ' + h.place + ' von ' + game.players.length + ' ausgeschieden.' : 'Du hast alle Chips gewonnen – Turniersieg nach ' + game.handNo + ' Händen!';
      if (await message('Turnier beendet', msg, ['Neues Turnier …', 'Schließen']) === 0) askNewGame();
    }
  }

  // ---------------------------------------------------------------- Spielstand (Stand zu Beginn der laufenden Hand)
  function saveGame() {
    const mid = game.street !== 'over' && startChips;
    store('poker.spielstand', { gegner: game.players.length - 1, stufe: game.level, steigen: game.rising,
                                chips: game.players.map((p, i) => mid ? startChips[i] : p.chips), plaetze: game.players.map(p => p.place),
                                geber: mid ? (game.dealer - 1 + game.players.length) % game.players.length : game.dealer,
                                hand: mid ? game.handNo - 1 : game.handNo, sb: game.sb, id: tourId, erfasst: tourRecorded });
  }
  function loadGame() {
    const d = load('poker.spielstand', null);
    if (!d || OPPS.indexOf(d.gegner) < 0 || !Array.isArray(d.chips) || d.chips.length !== d.gegner + 1) return false;
    game = new PokerGame.Game();
    game.setup(d.gegner, 0, d.stufe || 2, d.steigen !== false);
    game.players.forEach((p, i) => { p.chips = d.chips[i] || 0; p.out = p.chips <= 0; p.place = (d.plaetze || [])[i] || 0; });
    game.dealer = (d.geber || 0) % game.players.length;
    game.handNo = d.hand || 0;
    game.sb = Math.max(10, d.sb || 10); game.bb = game.sb * 2;
    tourId = d.id || String(Date.now()); tourRecorded = !!d.erfasst;
    game.log.push('Turnier geladen – Hand ' + (game.handNo + 1) + ' folgt.');
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
      try { window.history.pushState({ pokerSheet: sheets.length }, ''); } catch (e) { /* ohne Verlauf */ }
    });
  }
  function removeTopSheet() { const s = sheets.pop(); if (!s) return; s.ov.remove(); s.resolve(s.result); }
  let ignorePop = 0;
  function closeSheet(sheet, result) {
    if (sheets[sheets.length - 1] !== sheet) return;
    sheet.result = result; removeTopSheet();
    if (window.history.state && window.history.state.pokerSheet) { ignorePop++; window.history.back(); }
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
    let opp = cfg.opponents, level = cfg.level, chips = cfg.chips, rising = cfg.rising;
    const body = el_('div');
    body.append(el_('h3', null, 'Gegner am Tisch'), choiceRow(['1', '3', '5'], OPPS.indexOf(opp), i => { opp = OPPS[i]; }),
                el_('h3', null, 'Stärke der Gegner'), choiceRow(['Leicht', 'Mittel', 'Schwer'], level - 1, i => { level = i + 1; }),
                el_('h3', null, 'Startchips'), choiceRow(['500', '1.000', '2.000'], CHIPS.indexOf(chips), i => { chips = CHIPS[i]; }),
                el_('h3', null, 'Blinds'), toggleRow('Blinds steigen alle 10 Hände', rising, v => { rising = v; }));
    const ok = await openSheet('Neues Turnier', body, sheet => [el_('div', 'grow'), button('Abbrechen', '', () => closeSheet(sheet)), button('Turnier starten', 'primary', () => closeSheet(sheet, true))]);
    if (!ok) return;
    Object.assign(cfg, { opponents: opp, level, chips, rising });
    store('poker.einstellungen', cfg);
    newTournament(true);
  }

  function openSettings() {
    const work = Object.assign({}, cfg);
    const body = el_('div', 'settings-grid'), left = el_('div'), right = el_('div');
    const pv = document.createElement('canvas'); pv.className = 'preview';
    const demo = new PokerGame.Game();
    demo.setup(3, 1000, 2, true); demo.startHand();
    demo.board = [{ r: 14, s: 1 }, { r: 9, s: 0 }, { r: 4, s: 2 }];
    const syncs = [];
    const paintPreview = () => { const w = pv.clientWidth || 300, h = Math.round(w * 0.75); paintTable(sizeCanvas(pv, w, h), w, h, demo, work, false); };
    function tiles(list, isBack, key) {
      const w = el_('div', 'tiles');
      const items = list.map(([name, color], i) => {
        const t = el_('button', 'tile'); t.type = 'button';
        const c = document.createElement('canvas'), ctx = sizeCanvas(c, 72, 60);
        if (isBack) drawCard(ctx, null, 17, 2, 38, 54, color, true); else { ctx.fillStyle = color; ctx.fillRect(0, 0, 72, 60); }
        t.append(c, el_('span', null, name));
        t.addEventListener('click', () => { work[key] = i; sync(); });
        w.append(t);
        return t;
      });
      syncs.push(() => items.forEach((t, i) => t.classList.toggle('on', work[key] === i)));
      return w;
    }
    const tg = (text, key) => { const r = toggleRow(text, work[key], v => { work[key] = v; sync(); }); syncs.push(() => r.set(work[key])); return r; };
    left.append(el_('h3', null, 'Tischfarbe'), tiles(FELTS, false, 'felt'), el_('h3', null, 'Kartenrückseite'), tiles(BACKS, true, 'back'),
                el_('h3', null, 'Anzeige'), tg('Namen der Blätter anzeigen', 'handNames'), tg('Schnell spielen (kürzere Pausen)', 'fast'));
    right.append(el_('h3', null, 'Vorschau'), pv);
    body.append(left, right);
    function sync() { syncs.forEach(f => f()); paintPreview(); }
    const p = openSheet('Einstellungen', body, sheet => [button('Standard', 'link', () => { Object.assign(work, LOOK); sync(); }), el_('div', 'grow'),
                                                          button('Abbrechen', '', () => closeSheet(sheet)), button('Übernehmen', 'primary', () => closeSheet(sheet, true))], true);
    requestAnimationFrame(sync);
    p.then(ok => { if (!ok) return; cfg = Object.assign(cfg, work); store('poker.einstellungen', cfg); render(); });
  }

  function openRules() {
    const sections = [
      ['Ziel', 'Gewinne die Chips im Pot – mit dem besten Blatt aus deinen zwei Karten und den fünf Gemeinschaftskarten, oder indem alle anderen aussteigen. Das Turnier gewinnt, wer am Ende alle Chips hat.'],
      ['Ablauf', 'Vor jeder Hand setzen zwei Spieler links vom Geber die Blinds. Jeder bekommt zwei verdeckte Karten, dann folgen Setzrunden vor dem Flop, nach dem Flop (3 Karten), dem Turn (4.) und dem River (5.). In jeder Runde: aussteigen, schieben (wenn nichts zu bezahlen ist), mitgehen, setzen oder erhöhen.'],
      ['Blätter', 'Von hoch nach niedrig: Straight Flush, Vierling, Full House, Flush, Straße, Drilling, Zwei Paare, Ein Paar, Höchste Karte. Wer all-in ist, kann nur den Teil des Pots gewinnen, den er selbst abgedeckt hat (Nebentöpfe).']
    ];
    const body = el_('div', 'rules');
    sections.forEach(([h, t]) => body.append(el_('h3', null, h), el_('p', null, t)));
    return openSheet('Regeln', body, sheet => [el_('div', 'grow'), button('Schließen', 'primary', () => closeSheet(sheet))]);
  }

  function openStats() {
    const percent = (w, d, t) => t === 0 ? '–' : Math.round(100 * (w + d * 0.5) / t) + ' %';
    const body = el_('div');
    const fill = () => {
      body.innerHTML = '';
      const H = stats.haende;
      const count = f => { let w = 0, d = 0, l = 0; for (const r of H) if (f(r)) { if (r.ausgang === 'Gewonnen') w++; else if (r.ausgang === 'Geteilt') d++; else l++; } return [w, d, l]; };
      const [w, d, l] = count(() => true), total = w + d + l;
      body.append(el_('h3', null, 'Alle Hände'));
      const tiles = el_('div', 'stat-tiles');
      [[total, 'Hände'], [w, 'Gewonnen'], [d, 'Geteilt'], [l, 'Verloren'], [percent(w, d, total), 'Gewinnquote']].forEach(([v, c]) => {
        const t = el_('div', 'stat-tile'); t.append(el_('b', null, String(v)), el_('span', null, c)); tiles.append(t);
      });
      body.append(tiles);
      let sum = 0, best = 0, sd = 0, sdw = 0;
      for (const r of H) { sum += r.ergebnis; best = Math.max(best, r.ergebnis); if (r.showdown) { sd++; if (r.ergebnis > 0) sdw++; } }
      const T = stats.turniere, won = T.filter(t => t.platz === 1).length, bestPlace = T.length ? Math.min(...T.map(t => t.platz)) : 0;
      body.append(el_('p', 'line-text', 'Bilanz: ' + signed(sum) + '   ·   Größter Pot: ' + signed(best) + '   ·   Showdowns gewonnen: ' + sdw + ' von ' + sd),
                  el_('p', 'line-text', T.length ? 'Turniere: ' + T.length + '   ·   gewonnen: ' + won + '   ·   bester Platz: ' + bestPlace : 'Noch kein Turnier beendet.'));
      body.append(el_('h3', null, 'Nach Startblatt und Anzahl Gegner'));
      const legend = el_('div', 'legend');
      legend.innerHTML = '<span><i style="background:#E6E6E6"></i>Gewonnen</span><span><i style="background:#8A8A8A"></i>Geteilt</span><span><i style="background:#4B4B4B"></i>Verloren</span>';
      body.append(legend);
      for (const [label, f, gap] of [['Paar', r => r.start === 'Paar'], ['Gleichfarbig', r => r.start === 'Gleichfarbig'], ['Mit Ass', r => r.start === 'Mit Ass'],
                                     ['Sonstige', r => r.start === 'Sonstige'], ['1 Gegner', r => r.gegner === 1, true], ['3 Gegner', r => r.gegner === 3], ['5 Gegner', r => r.gegner === 5]]) {
        const [rw, rd, rl] = count(f), t = rw + rd + rl;
        const row = el_('div', 'barrow' + (gap ? ' gap' : '')), bar = el_('div', 'bar');
        if (t > 0) [[rw, '#E6E6E6'], [rd, '#8A8A8A'], [rl, '#4B4B4B']].forEach(([v, c]) => { const i = el_('i'); i.style.width = (100 * v / t) + '%'; i.style.background = c; bar.append(i); });
        row.append(el_('span', null, label), bar, el_('small', null, t === 0 ? 'keine Hand' : rw + ' G · ' + rd + ' T · ' + rl + ' V   ' + percent(rw, rd, t)));
        body.append(row);
      }
      body.append(el_('h3', null, 'Letzte Hände'));
      const games = el_('div', 'games');
      if (!H.length) games.append(el_('div', 'empty', 'Noch keine gespielten Hände.'));
      for (const r of H.slice(-100).reverse()) {
        const g = el_('div', 'game'), dt = new Date(r.datum);
        const when = isNaN(dt) ? '' : dt.toLocaleDateString('de-DE') + ', ' + dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        g.append(el_('div', 'who', r.blatt || r.start), el_('span', 'pill ' + (r.ergebnis > 0 ? 'win' : r.ergebnis < 0 ? 'loss' : 'draw'), r.ausgang + ' ' + signed(r.ergebnis)),
                 el_('div', 'meta', when + '  ·  Einsatz ' + N(r.einsatz) + '  ·  ' + r.gegner + ' Gegner'));
        games.append(g);
      }
      body.append(games);
    };
    fill();
    return openSheet('Statistik', body, sheet => [
      button('Statistik zurücksetzen …', 'link', async () => {
        if (!stats.haende.length && !stats.turniere.length) return;
        if (await message('Statistik zurücksetzen', 'Alle gespeicherten Hände und Turniere löschen? Das lässt sich nicht rückgängig machen.', ['Zurücksetzen', 'Abbrechen']) !== 0) return;
        stats = { haende: [], turniere: [] }; store('poker.statistik', stats); fill();
      }), el_('div', 'grow'), button('Schließen', 'primary', () => closeSheet(sheet))], true);
  }

  // ---------------------------------------------------------------- Knöpfe und Tasten
  $('aFold').addEventListener('click', () => { if (game.street === 'over') nextHand(); else humanAct('fold'); });
  $('aCall').addEventListener('click', () => humanAct('call'));
  $('aRaise').addEventListener('click', () => humanAct('raise'));
  $('aMinus').addEventListener('click', () => changeRaise(-1));
  $('aPlus').addEventListener('click', () => changeRaise(1));
  $('aAllIn').addEventListener('click', allIn);
  $('aHint').addEventListener('click', showHint);
  $('bStats').addEventListener('click', openStats);
  $('bRules').addEventListener('click', openRules);
  $('bNew').addEventListener('click', askNewGame);
  $('bSettings').addEventListener('click', openSettings);
  // Menü oben rechts (Handy hochkant): Einträge lösen die Knöpfe der unteren Reihe aus
  const menu = $('menu'), menuBtn = $('menuBtn');
  const showMenu = on => { menu.hidden = !on; menuBtn.setAttribute('aria-expanded', on ? 'true' : 'false'); };
  menuBtn.addEventListener('click', e => { e.stopPropagation(); showMenu(menu.hidden); });
  menu.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { showMenu(false); $(b.dataset.for).click(); }));
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) showMenu(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) showMenu(false); });
  window.addEventListener('resize', () => showMenu(false));
  document.addEventListener('keydown', e => {
    if (sheets.length) { if (e.key === 'Escape') closeSheet(sheets[sheets.length - 1]); return; }
    const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (ctrl && k === 'n') { e.preventDefault(); askNewGame(); return; }
    if (ctrl || e.altKey) return;
    if (k === ' ' || k === 'enter') { e.preventDefault(); if (game.street === 'over') nextHand(); }
    else if (k === 'f') humanAct('fold'); else if (k === 'c') humanAct('call'); else if (k === 'r') humanAct('raise');
    else if (k === 'a') allIn(); else if (k === 'h') showHint();
    else if (k === '+') changeRaise(1); else if (k === '-') changeRaise(-1);
  });

  // ---------------------------------------------------------------- Start
  if (loadGame()) { render(); nextHand(); } else newTournament(false);
  new ResizeObserver(draw).observe(wrap);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    // neue Version sofort zeigen: übernimmt ein neuer Service Worker (Update, nicht Erstinstallation), einmal neu laden –
    // nur kurz nach dem Start, damit keine laufende Hand verloren geht
    const hadController = !!navigator.serviceWorker.controller, started = Date.now();
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && Date.now() - started < 15000) location.reload(); });
    navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(() => {});
  }

  window.poker = { state: () => ({ street: game.street, hand: game.handNo, toAct: game.toAct, human: game.humanToAct(), chips: game.players.map(p => p.chips),
                                    pot: game.pot(), busy, status: $('status').textContent, stats: stats.haende.length }),
                   act: humanAct, next: nextHand };
})();
