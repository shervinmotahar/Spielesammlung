// Dame – Handy-Oberfläche. Ablauf wie in der Windows-App (F:\Claude\Spielesammlung\Dame\src\Gui.cs).
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const LEVEL_NAMES = ['', 'Leicht', 'Mittel', 'Schwer'];
  const BOARDS = [['Holz', '#F0D9B5', '#B58863'], ['Grün', '#EEEED2', '#769656'], ['Blau', '#DEE3E6', '#8CA2AD'], ['Schiefer', '#C9C9C9', '#707070'], ['Lila', '#E8DDF0', '#8565A8']];
  const STONES = [['Klassisch', '#F4F1EA', '#2A2A2A'], ['Rot', '#F4F1EA', '#B23A3A'], ['Holz', '#E8C99A', '#5A3A22'], ['Blau', '#EDEDED', '#2F5A96'], ['Grau', '#D6D6D6', '#555555']];
  const LOOK = { board: 0, stones: 0, showMoves: true, showLast: true, showNumbers: false };
  const DEFAULTS = Object.assign({ level: 2, newSide: 1, newTwo: false, variant: 0 }, LOOK);
  const UI_FONT = '"Segoe UI", system-ui, Roboto, sans-serif';

  function load(key, def) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch (e) { return def; } }
  function store(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* privates Fenster */ } }

  let cfg = Object.assign({}, DEFAULTS, load('dame.einstellungen', {}));
  if (!(cfg.level >= 1 && cfg.level <= 3)) cfg.level = 2;
  if (!(cfg.board >= 0 && cfg.board < BOARDS.length)) cfg.board = 0;
  if (!(cfg.stones >= 0 && cfg.stones < STONES.length)) cfg.stones = 0;
  if (!(cfg.variant >= 0 && cfg.variant < Dame.VARIANTS.length)) cfg.variant = 0;
  let stats = load('dame.statistik', []);
  if (!Array.isArray(stats)) stats = [];

  // ---------------------------------------------------------------- Spielzustand
  let pos = Dame.start(0), history = [], played = [], redo = [], legal = [];
  let humanSide = 1, flipped = false, thinking = false, hintBusy = false, gameOver = false;
  let resultText = '', note = null, hintText = null, hint = null, selected = -1, gameId = 0;
  let gameKey = '', endReason = null, hintsUsed = 0, undosUsed = 0, resignedSide = 0, winnerSide = 0;
  let drag = null;

  // ---------------------------------------------------------------- Farben und Steine
  function rgb(hex) { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  function mix(hex, to, k) { const a = rgb(hex), b = rgb(to); return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',') + ')'; }
  const isLight = hex => { const c = rgb(hex); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255 > 0.55; };

  // Stein als flache Scheibe mit Rillen; Dame mit Krone (wie PieceArt.Draw)
  function drawStone(ctx, pc, x0, y0, w, h, white, black) {
    if (!pc) return;
    const c = pc > 0 ? white : black, light = isLight(c);
    const edge = light ? mix(c, '#000000', 0.35) : mix(c, '#FFFFFF', 0.3);
    const d = Math.min(w, h) * 0.8, x = x0 + (w - d) / 2, y = y0 + (h - d) / 2 - d * 0.03, th = d * 0.08;
    const ell = (ex, ey, ew) => { ctx.beginPath(); ctx.ellipse(ex + ew / 2, ey + ew / 2, ew / 2, ew / 2, 0, 0, Math.PI * 2); };
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.27)'; ell(x + d * 0.02, y + th + d * 0.05, d); ctx.fill();
    ctx.fillStyle = mix(c, '#000000', light ? 0.3 : 0.45); ell(x, y + th, d); ctx.fill();
    ctx.fillStyle = c; ell(x, y, d); ctx.fill();
    ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1, d / 40);
    ell(x, y, d); ctx.stroke();
    ell(x + d * 0.14, y + d * 0.14, d * 0.72); ctx.stroke();
    ell(x + d * 0.26, y + d * 0.26, d * 0.48); ctx.stroke();
    if (Math.abs(pc) === 2) {
      const cx = x + d / 2, cy = y + d / 2, cw = d * 0.46, ch = d * 0.3;
      ctx.fillStyle = c; ell(x + d * 0.15, y + d * 0.15, d * 0.7); ctx.fill();
      ctx.fillStyle = light ? mix(c, '#000000', 0.6) : mix(c, '#FFFFFF', 0.75);
      ctx.beginPath();
      [[-cw / 2, ch / 2], [-cw / 2, -ch / 2], [-cw / 4, 0], [0, -ch * 0.7], [cw / 4, 0], [cw / 2, -ch / 2], [cw / 2, ch / 2]]
        .forEach(([px, py], i) => i ? ctx.lineTo(cx + px, cy + py) : ctx.moveTo(cx + px, cy + py));
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function sizeCanvas(c, w, h) {
    const dpr = window.devicePixelRatio || 1;
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  // ---------------------------------------------------------------- Brett zeichnen
  // st = { pos, legal, last, selected, hint, flipped, drag, look }
  function paintBoard(ctx, size, st) {
    const s = size / 8, look = st.look;
    const [, light, darkC] = BOARDS[look.board];
    const [, white, black] = STONES[look.stones];
    const rc = i => { let r = i >> 3, c = i & 7; if (st.flipped) { r = 7 - r; c = 7 - c; } return [c * s, r * s]; };
    for (let i = 0; i < 64; i++) { const [x, y] = rc(i); ctx.fillStyle = Dame.dark(i) ? darkC : light; ctx.fillRect(x, y, s, s); }
    if (look.showLast && st.last) {
      ctx.fillStyle = 'rgba(255,220,80,.35)';
      [st.last.from, ...st.last.path].forEach(i => { const [x, y] = rc(i); ctx.fillRect(x, y, s, s); });
    }
    if (st.selected >= 0) { const [x, y] = rc(st.selected); ctx.fillStyle = 'rgba(255,255,255,.43)'; ctx.fillRect(x, y, s, s); }
    ctx.font = '600 ' + Math.max(9, s * 0.15) + 'px ' + UI_FONT;
    for (let i = 0; i < 64; i++) {
      const [x, y] = rc(i), d = Dame.dark(i);
      ctx.fillStyle = d ? light : darkC;
      if (look.showNumbers) {
        if (d) { ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(String(Dame.num(i)), x + 3, y + 2); }
      } else {
        const r = i >> 3, c = i & 7;
        if (st.flipped ? c === 7 : c === 0) { ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(String(8 - r), x + 3, y + 2); }
        if (st.flipped ? r === 0 : r === 7) { ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('abcdefgh'[c], x + s - 2, y + s - 1); }
      }
    }
    for (let i = 0; i < 64; i++) {
      if (!st.pos.sq[i] || (st.drag && st.drag.moved && st.drag.from === i)) continue;
      const [x, y] = rc(i);
      drawStone(ctx, st.pos.sq[i], x, y, s, s, white, black);
    }
    if (look.showMoves && st.selected >= 0)
      for (const m of st.legal) {
        if (m.from !== st.selected) continue;
        const [x, y] = rc(Dame.to(m));
        ctx.fillStyle = 'rgba(20,20,20,.47)';
        ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(220,60,60,.8)'; ctx.lineWidth = Math.max(2, s / 18);
        for (const c of m.caps) {
          const [cx, cy] = rc(c);
          ctx.beginPath();
          ctx.moveTo(cx + s * 0.3, cy + s * 0.3); ctx.lineTo(cx + s * 0.7, cy + s * 0.7);
          ctx.moveTo(cx + s * 0.7, cy + s * 0.3); ctx.lineTo(cx + s * 0.3, cy + s * 0.7);
          ctx.stroke();
        }
      }
    if (st.hint) {
      const pts = [st.hint.from, ...st.hint.path].map(i => { const [x, y] = rc(i); return [x + s / 2, y + s / 2]; });
      ctx.strokeStyle = 'rgba(40,160,70,.8)'; ctx.fillStyle = 'rgba(40,160,70,.8)';
      ctx.lineWidth = s * 0.13; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const [ex, ey] = pts[pts.length - 1], [px, py] = pts[pts.length - 2];
      const a = Math.atan2(ey - py, ex - px), hl = s * 0.32;
      ctx.beginPath();
      pts.forEach(([x, y], i) => {
        if (i === pts.length - 1) { x -= Math.cos(a) * hl * 0.6; y -= Math.sin(a) * hl * 0.6; }
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - Math.cos(a - 0.5) * hl, ey - Math.sin(a - 0.5) * hl);
      ctx.lineTo(ex - Math.cos(a + 0.5) * hl, ey - Math.sin(a + 0.5) * hl);
      ctx.closePath(); ctx.fill();
    }
    if (st.drag && st.drag.moved) drawStone(ctx, st.pos.sq[st.drag.from], st.drag.x - s / 2, st.drag.y - s / 2, s, s, white, black);
  }

  // ---------------------------------------------------------------- Hauptbrett
  const cv = $('board'), wrap = $('boardWrap');
  let boardSize = 0;
  function layoutBoard() {
    const size = Math.max(160, Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight) / 8) * 8);
    cv.style.width = cv.style.height = size + 'px';
    boardSize = size;
    draw();
  }
  function draw() {
    const ctx = sizeCanvas(cv, boardSize, boardSize);
    paintBoard(ctx, boardSize, { pos, legal: gameOver ? [] : legal, last: played.length ? played[played.length - 1] : null, selected, hint,
                                 flipped, drag, look: cfg });
  }
  function sqAt(e) {
    const r = cv.getBoundingClientRect(), s = r.width / 8;
    let c = Math.floor((e.clientX - r.left) / s), row = Math.floor((e.clientY - r.top) / s);
    if (c < 0 || c > 7 || row < 0 || row > 7) return -1;
    if (flipped) { c = 7 - c; row = 7 - row; }
    return row * 8 + c;
  }
  function canInteract() { return !gameOver && !thinking && (humanSide === 0 || pos.side === humanSide); }
  function findMove(from, to) {
    let best = null;
    for (const m of legal) if (m.from === from && Dame.to(m) === to && (!best || m.caps.length > best.caps.length)) best = m;
    return best;
  }
  cv.addEventListener('pointerdown', e => {
    if (!canInteract()) return;
    const i = sqAt(e);
    if (i < 0) return;
    if (selected >= 0) { const m = findMove(selected, i); if (m) { selected = -1; playMove(m); return; } }
    if (legal.some(m => m.from === i)) {
      selected = i;
      const r = cv.getBoundingClientRect();
      drag = { from: i, x: e.clientX - r.left, y: e.clientY - r.top, sx: e.clientX, sy: e.clientY, moved: false };
      cv.setPointerCapture(e.pointerId);
    } else selected = -1;
    draw();
  });
  cv.addEventListener('pointermove', e => {
    if (!drag) return;
    const r = cv.getBoundingClientRect();
    drag.x = e.clientX - r.left; drag.y = e.clientY - r.top;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
    if (drag.moved) draw();
  });
  cv.addEventListener('pointerup', e => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.moved) { const m = findMove(d.from, sqAt(e)); if (m) { selected = -1; playMove(m); return; } }
    draw();
  });
  cv.addEventListener('pointercancel', () => { drag = null; draw(); });

  // ---------------------------------------------------------------- Rechnen im Hintergrund
  let worker = null, workerFailed = false, seq = 0;
  const pending = new Map();
  function getWorker() {
    if (worker || workerFailed) return worker;
    try {
      worker = new Worker('worker.js');
      worker.onmessage = e => { const f = pending.get(e.data.id); if (f) { pending.delete(e.data.id); f(e.data.move); } };
      worker.onerror = () => { workerFailed = true; worker = null; pending.forEach(f => f(undefined)); pending.clear(); };
    } catch (e) { workerFailed = true; worker = null; }
    return worker;
  }
  function runSearch(p, depth, time, noise) {
    const w = getWorker();
    if (!w) return new Promise(r => setTimeout(() => r(Dame.findBest(p, depth, time, noise)), 30));
    return new Promise(resolve => {
      const id = ++seq;
      pending.set(id, m => resolve(m === undefined ? Dame.findBest(p, depth, time, noise) : m));
      w.postMessage({ id, pos: p, depth, time, noise });
    });
  }
  const delay = ms => new Promise(r => setTimeout(r, ms));

  // ---------------------------------------------------------------- Anzeige
  function afterChange() {
    legal = Dame.legalMoves(pos);
    checkGameEnd();
    selected = -1;
    renderMoves();
    renderSide();
  }
  function renderSide() {
    const b = flipped ? -1 : 1;
    renderCard($('pBottom'), b);
    renderCard($('pTop'), -b);
    renderStatus();
    renderButtons();
    $('sub').textContent = 'Regeln: ' + Dame.VARIANTS[pos.v].name;
    draw();
  }
  function renderCard(el, side) {
    const color = side === 1 ? 'Weiß' : 'Schwarz';
    let title, sub;
    if (humanSide === 0) { title = color; sub = ''; }
    else if (side === humanSide) { title = 'Du'; sub = color; }
    else { title = 'Computer'; sub = color + ' · ' + LEVEL_NAMES[cfg.level]; }
    let state = null;
    if (gameOver) state = winnerSide === 0 ? 'Remis' : winnerSide === side ? 'gewinnt' : endReason === 'Aufgabe' ? 'hat aufgegeben' : 'verloren';
    else if (pos.side === side) state = thinking && side !== humanSide ? 'denkt nach …' : legal.length && legal[0].caps.length ? 'am Zug – muss schlagen' : 'am Zug';
    if (state) sub = sub ? sub + ' · ' + state : state;
    el.innerHTML = '';
    el.classList.toggle('active', !gameOver && pos.side === side);
    const [, white, black] = STONES[cfg.stones];
    const dot = document.createElement('canvas');
    dot.style.width = dot.style.height = '30px';
    drawStone(sizeCanvas(dot, 30, 30), side, 0, 0, 30, 30, white, black);
    const names = el_('div', 'names');
    names.append(el_('div', 'title', title), el_('div', 'sub', sub));
    el.append(dot, names);
    const taken = 12 - Dame.count(pos, -side).n;
    if (taken > 0) {
      const c = document.createElement('canvas');
      c.style.width = c.style.height = '22px';
      drawStone(sizeCanvas(c, 22, 22), -side, 0, 0, 22, 22, white, black);
      el.append(c, el_('span', 'adv', '× ' + taken));
    }
  }
  function renderMoves() {
    const list = $('moveList');
    list.innerHTML = '';
    const all = played.map(Dame.notation).concat(redo.map(Dame.notation));
    if (!all.length) { list.append(el_('div', 'empty', 'Noch keine Züge. Tippe einen Stein und dann das Zielfeld an.')); return; }
    let cur = null;
    for (let i = 0; i < all.length; i += 2) {
      const row = el_('div', 'mrow');
      row.append(el_('span', 'no', (i / 2 + 1) + '.'));
      for (let k = i; k < Math.min(i + 2, all.length); k++) {
        const p = el_('span', 'ply' + (k === played.length - 1 ? ' cur' : '') + (k >= played.length ? ' redo' : ''), all[k]);
        if (k === played.length - 1) cur = p;
        row.append(p);
      }
      list.append(row);
    }
    if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  function renderStatus() {
    let s;
    if (thinking) s = 'Der Computer denkt nach …';
    else if (gameOver) s = resultText;
    else if (hintBusy) s = 'Suche einen guten Zug …';
    else if (hintText) s = hintText;
    else if (note) s = note;
    else {
      s = humanSide === 0 ? (pos.side === 1 ? 'Weiß' : 'Schwarz') + ' ist am Zug.' : pos.side === humanSide ? 'Du bist am Zug.' : 'Der Computer ist am Zug.';
      if (legal.length && legal[0].caps.length) s += '  Schlagzwang!';
    }
    $('status').textContent = s;
    $('info').textContent = humanSide === 0 ? 'Zwei Spieler' : 'Computer: ' + LEVEL_NAMES[cfg.level] + '   ·   Du spielst ' + (humanSide === 1 ? 'Weiß' : 'Schwarz');
  }
  function renderButtons() {
    $('bUndo').disabled = history.length === 0;
    $('bRedo').disabled = redo.length === 0;
    $('bHint').disabled = gameOver || thinking || hintBusy || !(humanSide === 0 || pos.side === humanSide);
    $('bResign').disabled = gameOver || played.length === 0;
  }

  // ---------------------------------------------------------------- Spielablauf
  function resetGame(side, variant) {
    stopEngine();
    pos = Dame.start(variant);
    history = []; played = []; redo = [];
    humanSide = side; flipped = side === -1; gameOver = false;
    resultText = ''; note = null; clearHint();
    gameKey = String(Date.now());
    hintsUsed = undosUsed = resignedSide = winnerSide = 0; endReason = null;
  }
  function startNewGame(side, variant, announce) {
    resetGame(side, variant);
    if (announce) note = (side === 0 ? 'Neues Spiel – zwei Spieler.' : 'Neues Spiel – du spielst ' + (side === 1 ? 'Weiß.' : 'Schwarz.')) +
                         '  ' + (Dame.VARIANTS[variant].blackFirst ? 'Schwarz' : 'Weiß') + ' beginnt.  Regeln: ' + Dame.VARIANTS[variant].name;
    afterChange();
    saveGame();
    maybeComputerMove();
  }
  function stopEngine() { gameId++; thinking = false; }
  function clearHint() { hintText = null; hint = null; }
  function levelParams() { return cfg.level === 1 ? [2, 400, 70] : cfg.level === 3 ? [16, 4000, 0] : [7, 1500, 0]; }
  function maybeComputerMove() { if (!gameOver && humanSide !== 0 && pos.side !== humanSide) computerMove(); }
  async function computerMove() {
    const id = ++gameId;
    thinking = true;
    renderSide();
    const [d, t, n] = levelParams();
    const p = pos;
    const [m] = await Promise.all([runSearch(p, d, t, n), delay(450)]);
    if (id !== gameId) return;
    thinking = false;
    if (m) playMove(m); else renderSide();
  }
  async function showHint() {
    if ($('bHint').disabled) return;
    hintBusy = true; renderSide();
    const p = pos;
    const m = await runSearch(p, 9, 1500, 0);
    hintBusy = false;
    if (p === pos && m && !gameOver) { hintsUsed++; hint = m; hintText = 'Tipp: ' + Dame.notation(m) + '  (grüner Pfeil)'; }
    renderSide();
  }
  function applyMove(m) { history.push(pos); played.push(m); pos = Dame.make(pos, m); }
  function playMove(m) {
    if (gameOver) return;
    if (redo.length && Dame.same(redo[0], m)) redo.shift(); else redo = [];
    applyMove(m);
    note = null; clearHint();
    afterChange();
    saveGame();
    if (gameOver) { recordResult(); setTimeout(showGameEnd, 60); return; }
    maybeComputerMove();
  }
  async function showGameEnd() {
    const r = await message('Partie beendet', resultText, ['Neues Spiel …', 'Statistik', 'Schließen']);
    if (r === 0) askNewGame(); else if (r === 1) openStats();
  }
  async function resign() {
    if (gameOver || !played.length) return;
    const side = humanSide !== 0 ? humanSide : pos.side;
    const q = humanSide !== 0 ? 'Möchtest du die Partie wirklich aufgeben? Sie zählt dann als Niederlage.' : (side === 1 ? 'Weiß' : 'Schwarz') + ' gibt die Partie auf?';
    if (await message('Aufgeben', q, ['Aufgeben', 'Abbrechen']) !== 0) return;
    stopEngine(); clearHint();
    resignedSide = side; note = null;
    afterChange(); saveGame(); recordResult();
    setTimeout(showGameEnd, 60);
  }
  function undo() {
    if (!history.length) return;
    stopEngine(); clearHint();
    undosUsed++; resignedSide = 0;
    do { redo.unshift(played.pop()); pos = history.pop(); } while (humanSide !== 0 && pos.side !== humanSide && history.length);
    note = 'Zug zurückgenommen.';
    afterChange(); saveGame(); maybeComputerMove();
  }
  function redoMove() {
    if (!redo.length) return;
    stopEngine(); clearHint();
    do { applyMove(redo.shift()); } while (humanSide !== 0 && pos.side !== humanSide && redo.length);
    note = null;
    afterChange(); saveGame();
    if (gameOver) recordResult();
    maybeComputerMove();
  }
  function flip() { flipped = !flipped; renderSide(); saveGame(); }
  function checkGameEnd() {
    gameOver = true; winnerSide = 0;
    const name = pos.side === 1 ? 'Weiß' : 'Schwarz';
    if (resignedSide) {
      winnerSide = -resignedSide; endReason = 'Aufgabe';
      const w = winnerSide === 1 ? 'Weiß' : 'Schwarz';
      resultText = humanSide === 0 ? (resignedSide === 1 ? 'Weiß' : 'Schwarz') + ' gibt auf – ' + w + ' gewinnt.'
        : resignedSide === humanSide ? 'Du hast aufgegeben – der Computer gewinnt.' : 'Der Computer gibt auf – du gewinnst!';
    } else if (!legal.length) {
      winnerSide = -pos.side; endReason = 'Keine Züge';
      resultText = (Dame.count(pos, pos.side).n === 0 ? name + ' hat keine Steine mehr' : name + ' kann nicht mehr ziehen') +
                   ' – ' + (winnerSide === 1 ? 'Weiß' : 'Schwarz') + ' gewinnt!' + (humanSide !== 0 && winnerSide === humanSide ? '  Glückwunsch!' : '');
    } else if (pos.quiet >= 50) { endReason = '25 Züge'; resultText = 'Remis – 25 Züge lang nur Damen bewegt, ohne zu schlagen.'; }
    else if (history.filter(h => Dame.key(h) === Dame.key(pos)).length >= 2) { endReason = 'Wiederholung'; resultText = 'Remis durch dreifache Stellungswiederholung.'; }
    else { gameOver = false; endReason = null; }
  }

  // ---------------------------------------------------------------- Spielstand und Statistik
  function saveGame() {
    store('dame.spielstand', { modus: humanSide, regeln: pos.v, gedreht: flipped, zuege: played.map(Dame.notation), vor: redo.map(Dame.notation),
                               id: gameKey, aufgegeben: resignedSide, tipps: hintsUsed, zurueckgenommen: undosUsed });
  }
  function loadGame() {
    const d = load('dame.spielstand', null);
    if (!d || [1, -1, 0].indexOf(d.modus) < 0) return false;
    resetGame(d.modus, d.regeln >= 0 && d.regeln < Dame.VARIANTS.length ? d.regeln : 0);
    flipped = !!d.gedreht;
    if (d.id) gameKey = d.id;
    if (d.aufgegeben === 1 || d.aufgegeben === -1) resignedSide = d.aufgegeben;
    hintsUsed = d.tipps || 0; undosUsed = d.zurueckgenommen || 0;
    for (const t of d.zuege || []) { const m = Dame.parse(pos, t); if (!m) break; applyMove(m); }
    let p = pos;
    for (const t of d.vor || []) { const m = Dame.parse(p, t); if (!m) break; redo.push(m); p = Dame.make(p, m); }
    if (played.length) note = 'Spielstand geladen – weiter geht\'s nach ' + played.length + (played.length === 1 ? ' Halbzug.' : ' Halbzügen.');
    afterChange();
    return true;
  }
  function recordResult() {
    if (!gameOver) return;
    const rec = { id: gameKey, datum: new Date().toISOString(), zwei: humanSide === 0, stufe: cfg.level, farbe: humanSide,
                  ergebnis: humanSide === 0 ? winnerSide : winnerSide * humanSide, grund: endReason, zuege: Math.ceil(played.length / 2),
                  tipps: hintsUsed, zurueckgenommen: undosUsed, regeln: pos.v };
    const i = stats.findIndex(r => r.id === gameKey);
    if (i >= 0) stats[i] = rec; else stats.push(rec);
    store('dame.statistik', stats);
  }

  // ---------------------------------------------------------------- Dialoge
  const sheets = [];
  function el_(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
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
      try { window.history.pushState({ dameSheet: sheets.length }, ''); } catch (e) { /* ohne Verlauf */ }
    });
  }
  function removeTopSheet() { const s = sheets.pop(); if (!s) return; s.ov.remove(); s.resolve(s.result); }
  let ignorePop = 0;
  function closeSheet(sheet, result) {
    if (sheets[sheets.length - 1] !== sheet) return;
    sheet.result = result;
    removeTopSheet();
    if (window.history.state && window.history.state.dameSheet) { ignorePop++; window.history.back(); }
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
    let two = cfg.newTwo, side = cfg.newSide, level = cfg.level, variant = cfg.variant;
    const body = el_('div');
    const sideRow = choiceRow(['Weiß', 'Schwarz', 'Zufällig'], side === 1 ? 0 : side === -1 ? 1 : 2, i => { side = [1, -1, 2][i]; });
    const levelRow = choiceRow(['Leicht', 'Mittel', 'Schwer'], level - 1, i => { level = i + 1; });
    const desc = el_('p', null, Dame.DESCRIPTIONS[variant]);
    desc.style.cssText = 'color:var(--muted);font-size:14px;line-height:1.45;margin:10px 0 0';
    const sync = () => { sideRow.setEnabled(!two); levelRow.setEnabled(!two); desc.textContent = Dame.DESCRIPTIONS[variant]; };
    body.append(el_('h3', null, 'Gegner'), choiceRow(['Computer', 'Zwei Spieler'], two ? 1 : 0, i => { two = i === 1; sync(); }),
                el_('h3', null, 'Du spielst'), sideRow, el_('h3', null, 'Stärke des Computers'), levelRow,
                el_('h3', null, 'Regeln'), choiceRow(Dame.ORDER.map(i => Dame.VARIANTS[i].short), Dame.ORDER.indexOf(variant), i => { variant = Dame.ORDER[i]; sync(); }), desc);
    body.querySelectorAll('.choices')[3].classList.add('four');
    sync();
    const ok = await openSheet('Neues Spiel', body, sheet => [el_('div', 'grow'), button('Abbrechen', '', () => closeSheet(sheet)),
                                                               button('Spiel starten', 'primary', () => closeSheet(sheet, true))]);
    if (!ok) return;
    Object.assign(cfg, { newTwo: two, newSide: side, level, variant });
    store('dame.einstellungen', cfg);
    startNewGame(two ? 0 : side === 2 ? (Math.random() < 0.5 ? 1 : -1) : side, variant, true);
  }

  function openSettings() {
    const work = Object.assign({}, cfg);
    const body = el_('div', 'settings-grid'), left = el_('div'), right = el_('div');
    const pv = document.createElement('canvas'); pv.className = 'preview';
    let demo = Dame.start(0);
    demo.sq[Dame.fromNum(22)] = 0; demo.sq[Dame.fromNum(17)] = 1; demo.sq[Dame.fromNum(11)] = 0; demo.sq[Dame.fromNum(15)] = -1;
    demo.sq[Dame.fromNum(2)] = 0; demo.sq[Dame.fromNum(30)] = 0; demo.sq[Dame.fromNum(6)] = 2; demo.side = -1;
    const demoLegal = Dame.legalMoves(demo);
    const syncs = [];
    function paintPreview() {
      const w = pv.clientWidth || 300;
      paintBoard(sizeCanvas(pv, w, w), w, { pos: demo, legal: demoLegal, last: { from: Dame.fromNum(22), path: [Dame.fromNum(17)], caps: [] },
                                            selected: demoLegal.length ? demoLegal[0].from : -1, hint: null, flipped: false, drag: null, look: work });
    }
    function tiles(list, key, paint) {
      const w = el_('div', 'tiles');
      const items = list.map((item, i) => {
        const t = el_('button', 'tile'); t.type = 'button';
        const c = document.createElement('canvas');
        paint(sizeCanvas(c, 72, 72), item);
        t.append(c, el_('span', null, item[0]));
        t.addEventListener('click', () => { work[key] = i; sync(); });
        w.append(t);
        return t;
      });
      syncs.push(() => items.forEach((t, i) => t.classList.toggle('on', work[key] === i)));
      return w;
    }
    const lvl = choiceRow(['Leicht', 'Mittel', 'Schwer'], work.level - 1, i => { work.level = i + 1; });
    const tg = (text, key) => { const r = toggleRow(text, work[key], v => { work[key] = v; sync(); }); syncs.push(() => r.set(work[key])); return r; };
    left.append(el_('h3', null, 'Stärke des Computers'), lvl,
      el_('h3', null, 'Farbe des Bretts'), tiles(BOARDS, 'board', (ctx, [, a, b]) => { [[0, 0, a], [36, 0, b], [0, 36, b], [36, 36, a]].forEach(([x, y, c]) => { ctx.fillStyle = c; ctx.fillRect(x, y, 36, 36); }); }),
      el_('h3', null, 'Farbe der Steine'), tiles(STONES, 'stones', (ctx, [, a, b]) => { ctx.fillStyle = '#B58863'; ctx.fillRect(0, 0, 72, 72); drawStone(ctx, 1, 0, 0, 44, 44, a, b); drawStone(ctx, -2, 28, 28, 44, 44, a, b); }),
      el_('h3', null, 'Anzeige'), tg('Mögliche Züge anzeigen', 'showMoves'), tg('Letzten Zug markieren', 'showLast'), tg('Feldnummern statt Koordinaten', 'showNumbers'));
    right.append(el_('h3', null, 'Vorschau'), pv);
    body.append(left, right);
    function sync() { syncs.forEach(f => f()); lvl.pick(work.level - 1); paintPreview(); }
    const p = openSheet('Einstellungen', body, sheet => [button('Standard', 'link', () => { Object.assign(work, LOOK); sync(); }), el_('div', 'grow'),
                                                          button('Abbrechen', '', () => closeSheet(sheet)), button('Übernehmen', 'primary', () => closeSheet(sheet, true))], true);
    requestAnimationFrame(sync);
    p.then(ok => { if (!ok) return; cfg = Object.assign(cfg, work); store('dame.einstellungen', cfg); renderSide(); });
  }

  function percent(w, d, total) { return total === 0 ? '–' : Math.round(100 * (w + d * 0.5) / total) + ' %'; }
  function openStats() {
    const body = el_('div');
    const fill = () => {
      body.innerHTML = '';
      const comp = stats.filter(r => !r.zwei);
      const count = f => { let w = 0, d = 0, l = 0; for (const r of comp) if (f(r)) { if (r.ergebnis > 0) w++; else if (r.ergebnis < 0) l++; else d++; } return [w, d, l]; };
      const [w, d, l] = count(() => true), total = w + d + l;
      body.append(el_('h3', null, 'Gegen den Computer'));
      const tiles = el_('div', 'stat-tiles');
      [[total, 'Partien'], [w, 'Siege'], [d, 'Remis'], [l, 'Niederlagen'], [percent(w, d, total), 'Punktequote']].forEach(([v, c]) => {
        const t = el_('div', 'stat-tile'); t.append(el_('b', null, String(v)), el_('span', null, c)); tiles.append(t);
      });
      body.append(tiles, el_('h3', null, 'Nach Stärke und Farbe'));
      const legend = el_('div', 'legend');
      legend.innerHTML = '<span><i style="background:#E6E6E6"></i>Siege</span><span><i style="background:#8A8A8A"></i>Remis</span><span><i style="background:#4B4B4B"></i>Niederlagen</span>';
      body.append(legend);
      for (const [label, f, gap] of [['Leicht', r => r.stufe === 1], ['Mittel', r => r.stufe === 2], ['Schwer', r => r.stufe === 3],
                                     ['Mit Weiß', r => r.farbe === 1, true], ['Mit Schwarz', r => r.farbe === -1]]) {
        const [rw, rd, rl] = count(f), t = rw + rd + rl;
        const row = el_('div', 'barrow' + (gap ? ' gap' : '')), bar = el_('div', 'bar');
        if (t > 0) [[rw, '#E6E6E6'], [rd, '#8A8A8A'], [rl, '#4B4B4B']].forEach(([v, c]) => { const i = el_('i'); i.style.width = (100 * v / t) + '%'; i.style.background = c; bar.append(i); });
        row.append(el_('span', null, label), bar, el_('small', null, t === 0 ? 'keine Partie' : rw + ' S · ' + rd + ' R · ' + rl + ' N   ' + percent(rw, rd, t)));
        body.append(row);
      }
      let run = 0, best = 0;
      for (const r of comp) { run = r.ergebnis > 0 ? run + 1 : 0; best = Math.max(best, run); }
      body.append(el_('p', 'line-text', 'Aktuelle Siegesserie: ' + run + '   ·   Längste Siegesserie: ' + best));
      const two = stats.filter(r => r.zwei);
      body.append(el_('h3', null, 'Zwei Spieler'), el_('p', 'line-text', two.length === 0 ? 'Noch keine Partie zu zweit beendet.'
        : two.length + (two.length === 1 ? ' Partie' : ' Partien') + ' – Weiß gewinnt ' + two.filter(r => r.ergebnis > 0).length +
          ', Schwarz gewinnt ' + two.filter(r => r.ergebnis < 0).length + ', Remis ' + two.filter(r => r.ergebnis === 0).length));
      body.append(el_('h3', null, 'Letzte Partien'));
      const games = el_('div', 'games');
      if (!stats.length) games.append(el_('div', 'empty', 'Noch keine beendeten Partien. Gezählt wird jede Partie, die mit Sieg, Remis oder Aufgabe endet.'));
      for (const r of stats.slice().reverse()) {
        const g = el_('div', 'game'), dt = new Date(r.datum);
        const when = isNaN(dt) ? '' : dt.toLocaleDateString('de-DE') + ', ' + dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        g.append(el_('div', 'who', r.zwei ? 'Zwei Spieler' : 'Computer · ' + LEVEL_NAMES[r.stufe] + (r.farbe === 1 ? ' · mit Weiß' : ' · mit Schwarz')));
        let res, cls;
        if (r.zwei) { res = r.ergebnis > 0 ? 'Weiß gewinnt' : r.ergebnis < 0 ? 'Schwarz gewinnt' : 'Remis'; cls = 'draw'; }
        else if (r.ergebnis > 0) { res = 'Sieg'; cls = 'win'; } else if (r.ergebnis < 0) { res = 'Niederlage'; cls = 'loss'; } else { res = 'Remis'; cls = 'draw'; }
        g.append(el_('span', 'pill ' + cls, res), el_('div', 'meta', when + '  ·  ' + r.grund + '  ·  ' + r.zuege + (r.zuege === 1 ? ' Zug' : ' Züge')));
        games.append(g);
      }
      body.append(games);
    };
    fill();
    return openSheet('Statistik', body, sheet => [
      button('Statistik zurücksetzen …', 'link', async () => {
        if (!stats.length) return;
        if (await message('Statistik zurücksetzen', 'Alle ' + stats.length + ' gespeicherten Partien aus der Statistik löschen? Das lässt sich nicht rückgängig machen.', ['Zurücksetzen', 'Abbrechen']) !== 0) return;
        stats = []; store('dame.statistik', stats); fill();
      }), el_('div', 'grow'), button('Schließen', 'primary', () => closeSheet(sheet))], true);
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
  if (!loadGame()) startNewGame(1, cfg.variant, false);
  new ResizeObserver(layoutBoard).observe(wrap);
  layoutBoard();
  maybeComputerMove();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

  window.dame = { state: () => ({ moves: played.map(Dame.notation), legal: legal.map(Dame.notation), gameOver, resultText, humanSide, thinking, stats: stats.length }),
                  play: t => { const m = Dame.parse(pos, t); if (m) playMove(m); return !!m; } };
})();
