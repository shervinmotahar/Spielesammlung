// Go – Handy-Oberfläche. Ablauf wie in der Windows-App (F:\Claude\Spielesammlung\Go\src\Gui.cs).
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const PASS = GoGame.PASS;
  const LEVEL_NAMES = ['', 'Leicht', 'Mittel', 'Schwer'];
  const BOARDS = [['Kaya', '#DCB35C'], ['Hell', '#E8CD96'], ['Dunkel', '#B98B4E'], ['Grau', '#B4B4B4'], ['Grün', '#8DAA7E']];
  const SIZES = [9, 13, 19], KOMIS = [7.5, 6.5, 0.5];
  const LOOK = { boardColor: 0, showCoords: true, showLast: true };
  const DEFAULTS = Object.assign({ level: 2, newSide: 1, newTwo: false, size: 9, komi: 7.5 }, LOOK);
  const UI_FONT = '"Segoe UI", system-ui, Roboto, sans-serif';
  const NUM = v => v.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  function load(key, def) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch (e) { return def; } }
  function store(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* privates Fenster */ } }

  let cfg = Object.assign({}, DEFAULTS, load('go.einstellungen', {}));
  if (!(cfg.level >= 1 && cfg.level <= 3)) cfg.level = 2;
  if (SIZES.indexOf(cfg.size) < 0) cfg.size = 9;
  if (KOMIS.indexOf(cfg.komi) < 0) cfg.komi = 7.5;
  if (!(cfg.boardColor >= 0 && cfg.boardColor < BOARDS.length)) cfg.boardColor = 0;
  let stats = load('go.statistik', []);
  if (!Array.isArray(stats)) stats = [];

  // ---------------------------------------------------------------- Zustand (Seite 1 = Schwarz, −1 = Weiß)
  let pos = new GoGame.Board(cfg.size, cfg.komi), history = [], moves = [], redo = [];
  let humanSide = 1, thinking = false, hintBusy = false, gameOver = false, scoring = false, dead = null, owner = null, score = 0;
  let resultText = '', note = null, hintText = null, hint = -2, hover = -1, gameId = 0;
  let gameKey = '', endReason = null, hintsUsed = 0, undosUsed = 0, resignedSide = 0, winnerSide = 0;
  const colorOf = side => side === 1 ? 1 : 2, sideOf = color => color === 1 ? 1 : -1, sideName = s => s === 1 ? 'Schwarz' : 'Weiß';

  // ---------------------------------------------------------------- Zeichnen
  function sizeCanvas(c, w, h) {
    const dpr = window.devicePixelRatio || 1, pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }
  function drawStone(ctx, color, cx, cy, d, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = 'rgba(0,0,0,.24)';
    ctx.beginPath(); ctx.arc(cx + d * 0.04, cy + d * 0.07, d / 2, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(cx - d * 0.15, cy - d * 0.2, d * 0.02, cx, cy, d * 0.55);
    if (color === 1) { g.addColorStop(0, '#5A5A5A'); g.addColorStop(1, '#1C1C1C'); }
    else { g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#D2D2D2'); }
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2); ctx.fill();
    if (color === 2) { ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = Math.max(1, d / 40); ctx.stroke(); }
    ctx.restore();
  }
  // st = { pos, last, hint, hover, scoring, dead, owner, look }
  function paintBoard(ctx, size, st) {
    const b = st.pos, n = b.N, look = st.look;
    const edge = look.showCoords ? size / (n + 1.6) * 0.95 : size / (n + 1) * 0.6, cell = (size - 2 * edge) / (n - 1);
    const at = (x, y) => [edge + x * cell, edge + y * cell];
    ctx.fillStyle = BOARDS[look.boardColor][1]; ctx.fillRect(0, 0, size, size);
    const line = 'rgba(40,30,20,.8)';
    ctx.strokeStyle = line; ctx.lineWidth = Math.max(1, cell / 28);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const [x0, y0] = at(0, i), [x1] = at(n - 1, i); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0);
      const [a0, b0] = at(i, 0), [, b1] = at(i, n - 1); ctx.moveTo(a0, b0); ctx.lineTo(a0, b1);
    }
    ctx.stroke();
    const stars = n === 19 ? [3, 9, 15] : n === 13 ? [3, 6, 9] : [2, 4, 6];
    ctx.fillStyle = line;
    for (const sx of stars) for (const sy of stars) {
      if (n === 9 && (sx === 4) !== (sy === 4)) continue;
      if (n === 13 && (sx === 6) !== (sy === 6)) continue;
      const [x, y] = at(sx, sy);
      ctx.beginPath(); ctx.arc(x, y, Math.max(2, cell * 0.08), 0, Math.PI * 2); ctx.fill();
    }
    if (look.showCoords) {
      ctx.fillStyle = 'rgba(40,30,20,.75)'; ctx.font = '600 ' + Math.max(8, Math.min(13, cell * 0.36)) + 'px ' + UI_FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < n; i++) {
        const col = 'ABCDEFGHJKLMNOPQRST'[i], row = String(n - i), [x] = at(i, 0), [, y] = at(0, i);
        ctx.fillText(col, x, edge * 0.42); ctx.fillText(col, x, size - edge * 0.42);
        ctx.fillText(row, edge * 0.42, y); ctx.fillText(row, size - edge * 0.42, y);
      }
    }
    const d = cell * 0.94;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const p = b.pt(x, y), v = b.b[p], [cx, cy] = at(x, y);
      if (v === 1 || v === 2) drawStone(ctx, v, cx, cy, d, st.scoring && st.dead && st.dead[p] ? 0.43 : 1);
      if (st.scoring && st.owner && (st.owner[p] === 1 || st.owner[p] === 2) && (v === 0 || (st.dead && st.dead[p]))) {
        const t = cell * 0.3;
        ctx.fillStyle = st.owner[p] === 1 ? '#1C1C1C' : '#F2F2F2'; ctx.fillRect(cx - t / 2, cy - t / 2, t, t);
        ctx.strokeStyle = 'rgba(0,0,0,.47)'; ctx.lineWidth = 1; ctx.strokeRect(cx - t / 2, cy - t / 2, t, t);
      }
    }
    if (look.showLast && st.last >= 0 && !st.scoring && b.b[st.last]) {
      const [cx, cy] = at(b.x(st.last), b.y(st.last));
      ctx.strokeStyle = b.b[st.last] === 1 ? '#fff' : '#000'; ctx.lineWidth = Math.max(1.5, cell / 16);
      ctx.beginPath(); ctx.arc(cx, cy, d * 0.26, 0, Math.PI * 2); ctx.stroke();
    }
    if (st.hint >= 0) {
      const [cx, cy] = at(b.x(st.hint), b.y(st.hint));
      ctx.strokeStyle = 'rgba(40,160,70,.86)'; ctx.lineWidth = Math.max(2.5, cell / 9);
      ctx.beginPath(); ctx.arc(cx, cy, d * 0.42, 0, Math.PI * 2); ctx.stroke();
    }
    if (st.hover >= 0 && !st.scoring) { const [cx, cy] = at(b.x(st.hover), b.y(st.hover)); drawStone(ctx, b.toMove, cx, cy, d, 0.43); }
    return { edge, cell };
  }

  const cv = $('board'), wrap = $('boardWrap');
  let boardSize = 0, geo = { edge: 0, cell: 1 };
  function layoutBoard() {
    boardSize = Math.max(160, Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight)));
    cv.style.width = cv.style.height = boardSize + 'px';
    draw();
  }
  function draw() {
    geo = paintBoard(sizeCanvas(cv, boardSize, boardSize), boardSize,
      { pos, last: moves.length ? moves[moves.length - 1] : -2, hint, hover, scoring, dead, owner, look: cfg });
  }
  function pointAt(e) {
    const r = cv.getBoundingClientRect();
    const x = Math.round((e.clientX - r.left - geo.edge) / geo.cell), y = Math.round((e.clientY - r.top - geo.edge) / geo.cell);
    if (x < 0 || y < 0 || x >= pos.N || y >= pos.N) return -1;
    return pos.pt(x, y);
  }
  const canInteract = () => scoring ? !thinking : !gameOver && !thinking && (humanSide === 0 || sideOf(pos.toMove) === humanSide);
  cv.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const p = pointAt(e);
    const h = p >= 0 && canInteract() && !scoring && pos.isLegal(p) ? p : -1;
    if (h !== hover) { hover = h; draw(); }
  });
  cv.addEventListener('pointerleave', () => { if (hover >= 0) { hover = -1; draw(); } });
  cv.addEventListener('pointerdown', e => {
    if (!canInteract()) return;
    const p = pointAt(e);
    if (p < 0) return;
    hover = -1;
    onPoint(p);
  });

  // ---------------------------------------------------------------- Rechnen im Hintergrund
  let worker = null, workerFailed = false, seq = 0;
  const pending = new Map();
  function getWorker() {
    if (worker || workerFailed) return worker;
    try {
      worker = new Worker('worker.js');
      worker.onmessage = e => { const f = pending.get(e.data.id); if (f) { pending.delete(e.data.id); f(e.data.result); } };
      worker.onerror = () => { workerFailed = true; worker = null; pending.forEach(f => f(undefined)); pending.clear(); };
    } catch (e) { workerFailed = true; }
    return worker;
  }
  function local(kind, b, playouts, time) {
    if (kind === 'think') return GoGame.think(b, playouts, time);
    if (kind === 'hint') return GoGame.findBest(b, playouts, time);
    return Array.from(GoGame.guessDead(b));
  }
  function compute(kind, b, playouts, time) {
    const w = getWorker();
    if (!w) return new Promise(r => setTimeout(() => r(local(kind, b.copy(), playouts, time)), 30));
    return new Promise(resolve => {
      const id = ++seq;
      pending.set(id, res => resolve(res === undefined ? local(kind, b.copy(), playouts, time) : res));
      w.postMessage({ id, kind, board: b.toJSON(), playouts, time });
    });
  }
  const delay = ms => new Promise(r => setTimeout(r, ms));

  // ---------------------------------------------------------------- Anzeige
  function el_(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function render() {
    renderCard($('pBottom'), humanSide === -1 ? -1 : 1);
    renderCard($('pTop'), humanSide === -1 ? 1 : -1);
    renderMoves(); renderStatus(); renderButtons();
    $('sub').textContent = pos.N + ' × ' + pos.N + ' · Komi ' + NUM(pos.komi) + (humanSide === 0 ? ' · zu zweit' : '');
    draw();
  }
  function renderCard(el, side) {
    let title, sub;
    if (humanSide === 0) { title = sideName(side); sub = ''; }
    else if (side === humanSide) { title = 'Du'; sub = sideName(side); }
    else { title = 'Computer'; sub = sideName(side) + ' · ' + LEVEL_NAMES[cfg.level]; }
    let state = null;
    if (gameOver) state = winnerSide === side ? 'gewinnt' : endReason === 'Aufgabe' && resignedSide === side ? 'hat aufgegeben' : 'verloren';
    else if (scoring) state = 'Auszählen';
    else if (sideOf(pos.toMove) === side) state = thinking && side !== humanSide ? 'denkt nach …' : 'am Zug';
    if (state) sub = sub ? sub + ' · ' + state : state;
    let val, cap;
    if (scoring || (gameOver && endReason !== 'Aufgabe' && owner)) {
      let pts = 0;
      if (owner) for (let p = 0; p < owner.length; p++) if (owner[p] === colorOf(side)) pts++;
      val = side === -1 ? NUM(pts + pos.komi) : String(pts); cap = 'Punkte';
    } else { val = String(pos.caps[colorOf(side)]); cap = 'Gefangene'; }
    el.innerHTML = '';
    el.classList.toggle('active', !gameOver && !scoring && sideOf(pos.toMove) === side);
    const dot = document.createElement('canvas');
    dot.style.width = dot.style.height = '28px';
    drawStone(sizeCanvas(dot, 28, 28), colorOf(side), 14, 13, 26);
    const names = el_('div', 'names'); names.append(el_('div', 'title', title), el_('div', 'sub', sub));
    const v = el_('div', 'val'); v.append(el_('b', null, val), el_('span', null, cap));
    el.append(dot, names, v);
  }
  function renderMoves() {
    const list = $('moveList');
    list.innerHTML = '';
    const all = moves.concat(redo);
    if (!all.length) { list.append(el_('div', 'empty', 'Noch keine Züge. Tippe auf einen Schnittpunkt.')); return; }
    let cur = null;
    for (let i = 0; i < all.length; i += 2) {
      const row = el_('div', 'mrow');
      row.append(el_('span', 'no', (i + 1) + '.'));
      for (let k = i; k < Math.min(i + 2, all.length); k++) {
        const p = el_('span', 'ply' + (k === moves.length - 1 ? ' cur' : '') + (k >= moves.length ? ' redo' : ''), (k % 2 === 0 ? '● ' : '○ ') + (all[k] === PASS ? 'Passen' : pos.name(all[k])));
        if (k === moves.length - 1) cur = p;
        row.append(p);
      }
      list.append(row);
    }
    if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  const scoreText = sc => sc > 0 ? 'Schwarz führt mit ' + NUM(sc) + ' Punkten' : 'Weiß führt mit ' + NUM(-sc) + ' Punkten';
  function renderStatus() {
    let s;
    if (thinking) s = scoring ? 'Tote Steine werden geschätzt …' : 'Der Computer denkt nach …';
    else if (gameOver) s = resultText;
    else if (scoring) s = 'Auszählen: Tippe Gruppen an, um sie als tot oder lebend zu markieren. ' + scoreText(score) + '.';
    else if (hintBusy) s = 'Suche einen guten Punkt …';
    else if (hintText) s = hintText;
    else if (note) s = note;
    else {
      s = humanSide === 0 ? sideName(sideOf(pos.toMove)) + ' ist am Zug.' : sideOf(pos.toMove) === humanSide ? 'Du bist am Zug.' : 'Der Computer ist am Zug.';
      if (pos.passes === 1) s += ' ' + sideName(-sideOf(pos.toMove)) + ' hat gepasst – passt du auch, wird ausgezählt.';
    }
    $('status').textContent = s;
    $('info').textContent = humanSide === 0 ? 'Zwei Spieler' : 'Computer: ' + LEVEL_NAMES[cfg.level] + '   ·   Du spielst ' + sideName(humanSide);
  }
  function renderButtons() {
    const myTurn = !gameOver && !thinking && (humanSide === 0 || sideOf(pos.toMove) === humanSide);
    $('bPass').querySelector('span').textContent = scoring ? 'Übernehmen' : 'Passen';
    $('bPass').classList.toggle('primary', scoring);
    $('bPass').disabled = scoring ? thinking : !myTurn;
    $('bHint').querySelector('span').textContent = scoring ? 'Weiterspielen' : 'Tipp';
    $('bHint').disabled = scoring ? thinking : !myTurn || hintBusy;
    $('bUndo').disabled = !history.length || thinking;
    $('bRedo').disabled = !redo.length || scoring;
    $('bResign').disabled = gameOver || !moves.length;
    $('bNew').classList.toggle('primary', !scoring);
  }

  // ---------------------------------------------------------------- Spielablauf
  function resetGame(side, size, komi) {
    stopEngine();
    pos = new GoGame.Board(size, komi);
    history = []; moves = []; redo = [];
    humanSide = side; gameOver = scoring = false; dead = owner = null;
    resultText = ''; note = null; clearHint();
    gameKey = String(Date.now());
    hintsUsed = undosUsed = resignedSide = winnerSide = 0; endReason = null;
  }
  function startNewGame(side, size, komi, announce) {
    resetGame(side, size, komi);
    if (announce) note = (side === 0 ? 'Neues Spiel – zwei Spieler.' : 'Neues Spiel – du spielst ' + sideName(side) + '.') + ' Schwarz beginnt.';
    render(); saveGame(); maybeComputerMove();
  }
  function stopEngine() { gameId++; thinking = false; }
  function clearHint() { hintText = null; hint = -2; }
  function levelParams() {
    const n = pos.N;
    return cfg.level === 1 ? [n <= 9 ? 400 : 300, 600] : cfg.level === 3 ? [1e9, n <= 9 ? 4000 : n <= 13 ? 6000 : 8000] : [1e9, n <= 9 ? 1500 : n <= 13 ? 2500 : 3500];
  }
  function maybeComputerMove() { if (!gameOver && !scoring && humanSide !== 0 && sideOf(pos.toMove) !== humanSide) computerMove(); }
  async function computerMove() {
    const id = ++gameId;
    thinking = true; render();
    const [pl, t] = levelParams();
    const [r] = await Promise.all([compute('think', pos, pl, t), delay(400)]);
    if (id !== gameId) return;
    thinking = false;
    if (r.resign) { doResign(sideOf(pos.toMove)); return; }
    playMove(r.move);
  }
  async function hintOrResume() {
    if (scoring) { resumeFromScoring(); return; }
    if ($('bHint').disabled) return;
    hintBusy = true; render();
    const key = pos.key();
    const r = await compute('hint', pos, 1e9, 1500);
    hintBusy = false;
    if (!gameOver && !scoring && pos.key() === key) {
      hintsUsed++; hint = r.move;
      hintText = r.move === PASS ? 'Tipp: Passen – es gibt nichts Wichtiges mehr zu holen.' : 'Tipp: ' + pos.name(r.move) + '  (grüner Kreis)';
    }
    render();
  }
  function onPoint(p) {
    if (scoring) {
      if (pos.b[p] !== 1 && pos.b[p] !== 2) return;
      const now = dead[p] ? 0 : 1;
      for (const q of pos.group(p)) dead[q] = now;
      rescore(); render(); saveGame();
      return;
    }
    if (!pos.isLegal(p)) { note = 'Dort darfst du nicht setzen (besetzt, Selbstmord oder Ko).'; render(); return; }
    playMove(p);
  }
  function passOrAccept() { if (scoring) { finishScoring(true); return; } if (!$('bPass').disabled) playMove(PASS); }
  function playMove(m) {
    if (gameOver || scoring) return;
    if (redo.length && redo[0] === m) redo.shift(); else redo = [];
    const before = pos.copy();
    if (!pos.play(m)) return;
    history.push(before); moves.push(m);
    note = m === PASS ? sideName(-sideOf(pos.toMove)) + ' passt.' : null;
    clearHint();
    if (pos.passes >= 2) { enterScoring(); return; }
    render(); saveGame(); maybeComputerMove();
  }
  async function enterScoring() {
    scoring = true; thinking = true; render();
    const id = gameId;
    const d = await compute('dead', pos, 0, 0);
    if (id !== gameId || !scoring) return;
    thinking = false;
    dead = Uint8Array.from(d);
    rescore(); render(); saveGame();
  }
  function rescore() { owner = new Int8Array(pos.b.length); score = pos.score(dead, owner); }
  function resumeFromScoring() {
    scoring = false; dead = owner = null; pos.passes = 0;
    note = 'Es wird weitergespielt – ' + sideName(sideOf(pos.toMove)) + ' ist am Zug.';
    render(); saveGame(); maybeComputerMove();
  }
  function finishScoring(show) {
    scoring = false; gameOver = true;
    winnerSide = score > 0 ? 1 : -1;
    const pts = NUM(Math.abs(score));
    endReason = 'Auszählung ' + pts;
    resultText = humanSide === 0 ? sideName(winnerSide) + ' gewinnt mit ' + pts + ' Punkten.'
      : winnerSide === humanSide ? 'Du gewinnst mit ' + pts + ' Punkten!  Glückwunsch!' : 'Der Computer gewinnt mit ' + pts + ' Punkten.';
    render();
    if (show) { saveGame(); recordResult(); setTimeout(showGameEnd, 60); }
  }
  async function showGameEnd() {
    const r = await message('Partie beendet', resultText, ['Neues Spiel …', 'Statistik', 'Schließen']);
    if (r === 0) askNewGame(); else if (r === 1) openStats();
  }
  async function resign() {
    if (gameOver || !moves.length) return;
    const side = humanSide !== 0 ? humanSide : sideOf(pos.toMove);
    const q = humanSide !== 0 ? 'Möchtest du die Partie wirklich aufgeben? Sie zählt dann als Niederlage.' : sideName(side) + ' gibt die Partie auf?';
    if (await message('Aufgeben', q, ['Aufgeben', 'Abbrechen']) !== 0) return;
    doResign(side);
  }
  function doResign(side) {
    stopEngine(); clearHint(); scoring = false;
    resignedSide = side; winnerSide = -side; gameOver = true; endReason = 'Aufgabe';
    resultText = humanSide === 0 ? sideName(side) + ' gibt auf – ' + sideName(-side) + ' gewinnt.'
      : side === humanSide ? 'Du hast aufgegeben – der Computer gewinnt.' : 'Der Computer gibt auf – du gewinnst!';
    render(); saveGame(); recordResult();
    setTimeout(showGameEnd, 60);
  }
  function recordResult() {
    if (!gameOver) return;
    const rec = { id: gameKey, datum: new Date().toISOString(), zwei: humanSide === 0, stufe: cfg.level, farbe: humanSide, groesse: pos.N,
                  ergebnis: humanSide === 0 ? winnerSide : winnerSide * humanSide, grund: endReason, zuege: moves.length, tipps: hintsUsed, zurueckgenommen: undosUsed };
    const i = stats.findIndex(r => r.id === gameKey);
    if (i >= 0) stats[i] = rec; else stats.push(rec);
    store('go.statistik', stats);
  }
  function undo() {
    if (!history.length || thinking) return;
    stopEngine(); clearHint();
    undosUsed++; gameOver = scoring = false; dead = owner = null; resignedSide = 0;
    do { redo.unshift(moves.pop()); pos = history.pop(); } while (humanSide !== 0 && sideOf(pos.toMove) !== humanSide && history.length);
    note = 'Zug zurückgenommen.';
    render(); saveGame(); maybeComputerMove();
  }
  function redoMove() {
    if (!redo.length || scoring) return;
    stopEngine(); clearHint();
    do { const m = redo.shift(); history.push(pos.copy()); pos.play(m); moves.push(m); }
    while (humanSide !== 0 && sideOf(pos.toMove) !== humanSide && redo.length && pos.passes < 2);
    note = null;
    if (pos.passes >= 2) { enterScoring(); return; }
    render(); saveGame(); maybeComputerMove();
  }

  // ---------------------------------------------------------------- Spielstand
  function saveGame() {
    const deadList = [];
    if (dead) for (let p = 0; p < dead.length; p++) if (dead[p]) deadList.push(pos.name(p));
    store('go.spielstand', { modus: humanSide, groesse: pos.N, komi: pos.komi, zuege: moves.map(m => pos.name(m)), vor: redo.map(m => pos.name(m)),
                             id: gameKey, aufgegeben: resignedSide, tipps: hintsUsed, zurueckgenommen: undosUsed,
                             auszaehlen: scoring, ende: gameOver && !resignedSide, tot: deadList });
  }
  function loadGame() {
    const d = load('go.spielstand', null);
    if (!d || [1, -1, 0].indexOf(d.modus) < 0 || SIZES.indexOf(d.groesse) < 0) return false;
    resetGame(d.modus, d.groesse, KOMIS.indexOf(d.komi) >= 0 ? d.komi : 7.5);
    if (d.id) gameKey = d.id;
    hintsUsed = d.tipps || 0; undosUsed = d.zurueckgenommen || 0;
    for (const t of d.zuege || []) { const m = pos.parse(t); if (m === -2) break; const before = pos.copy(); if (!pos.play(m)) break; history.push(before); moves.push(m); }
    for (const t of d.vor || []) { const m = pos.parse(t); if (m === -2) break; redo.push(m); }
    if (d.ende || d.auszaehlen) {
      dead = new Uint8Array(pos.b.length);
      for (const t of d.tot || []) { const p = pos.parse(t); if (p >= 0) dead[p] = 1; }
      rescore(); scoring = true;
      if (d.ende) finishScoring(false);
    } else if (d.aufgegeben === 1 || d.aufgegeben === -1) {
      resignedSide = d.aufgegeben; winnerSide = -resignedSide; gameOver = true; endReason = 'Aufgabe';
      resultText = humanSide === 0 ? sideName(resignedSide) + ' hat aufgegeben.' : resignedSide === humanSide ? 'Du hast aufgegeben.' : 'Der Computer hat aufgegeben.';
    }
    if (moves.length && !gameOver) note = 'Spielstand geladen – weiter geht\'s nach ' + moves.length + (moves.length === 1 ? ' Zug.' : ' Zügen.');
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
      try { window.history.pushState({ goSheet: sheets.length }, ''); } catch (e) { /* ohne Verlauf */ }
    });
  }
  function removeTopSheet() { const s = sheets.pop(); if (!s) return; s.ov.remove(); s.resolve(s.result); }
  let ignorePop = 0;
  function closeSheet(sheet, result) {
    if (sheets[sheets.length - 1] !== sheet) return;
    sheet.result = result; removeTopSheet();
    if (window.history.state && window.history.state.goSheet) { ignorePop++; window.history.back(); }
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
    let two = cfg.newTwo, side = cfg.newSide, level = cfg.level, size = cfg.size, komi = cfg.komi;
    const body = el_('div');
    const sideRow = choiceRow(['Schwarz', 'Weiß', 'Zufällig'], side === 1 ? 0 : side === -1 ? 1 : 2, i => { side = [1, -1, 2][i]; });
    const levelRow = choiceRow(['Leicht', 'Mittel', 'Schwer'], level - 1, i => { level = i + 1; });
    const sync = () => { sideRow.setEnabled(!two); levelRow.setEnabled(!two); };
    body.append(el_('h3', null, 'Gegner'), choiceRow(['Computer', 'Zwei Spieler'], two ? 1 : 0, i => { two = i === 1; sync(); }),
      el_('h3', null, 'Du spielst'), sideRow, el_('h3', null, 'Stärke des Computers'), levelRow,
      el_('h3', null, 'Brettgröße'), choiceRow(['9 × 9', '13 × 13', '19 × 19'], SIZES.indexOf(size), i => { size = SIZES[i]; }),
      el_('h3', null, 'Komi (Punkte für Weiß)'), choiceRow(['7,5', '6,5', '0,5'], KOMIS.indexOf(komi), i => { komi = KOMIS[i]; }),
      el_('p', 'note', 'Schwarz beginnt. Auf großen Brettern rechnet der Computer langsamer und spielt schwächer als auf 9 × 9.'));
    sync();
    const ok = await openSheet('Neues Spiel', body, sheet => [el_('div', 'grow'), button('Abbrechen', '', () => closeSheet(sheet)), button('Spiel starten', 'primary', () => closeSheet(sheet, true))]);
    if (!ok) return;
    Object.assign(cfg, { newTwo: two, newSide: side, level, size, komi });
    store('go.einstellungen', cfg);
    startNewGame(two ? 0 : side === 2 ? (Math.random() < 0.5 ? 1 : -1) : side, size, komi, true);
  }

  function openSettings() {
    const work = Object.assign({}, cfg);
    const body = el_('div', 'settings-grid'), left = el_('div'), right = el_('div');
    const pv = document.createElement('canvas'); pv.className = 'preview';
    const demo = new GoGame.Board(9, 7.5);
    'E5 C4 G4 D6 F6 C6 E3 D3'.split(' ').forEach(m => demo.play(demo.parse(m)));
    const syncs = [];
    const paintPreview = () => { const w = pv.clientWidth || 300; paintBoard(sizeCanvas(pv, w, w), w, { pos: demo, last: demo.parse('D3'), hint: -2, hover: -1, scoring: false, look: work }); };
    const tilesEl = el_('div', 'tiles');
    const items = BOARDS.map(([name, color], i) => {
      const t = el_('button', 'tile'); t.type = 'button';
      const c = document.createElement('canvas'), ctx = sizeCanvas(c, 72, 72);
      ctx.fillStyle = color; ctx.fillRect(0, 0, 72, 72);
      ctx.strokeStyle = 'rgba(40,30,20,.8)'; ctx.beginPath();
      for (let k = 1; k <= 3; k++) { ctx.moveTo(k * 18, 9); ctx.lineTo(k * 18, 63); ctx.moveTo(9, k * 18); ctx.lineTo(63, k * 18); }
      ctx.stroke(); drawStone(ctx, 1, 18, 36, 16); drawStone(ctx, 2, 36, 18, 16);
      t.append(c, el_('span', null, name));
      t.addEventListener('click', () => { work.boardColor = i; sync(); });
      tilesEl.append(t);
      return t;
    });
    syncs.push(() => items.forEach((t, i) => t.classList.toggle('on', work.boardColor === i)));
    const lvl = choiceRow(['Leicht', 'Mittel', 'Schwer'], work.level - 1, i => { work.level = i + 1; });
    const tg = (text, key) => { const r = toggleRow(text, work[key], v => { work[key] = v; sync(); }); syncs.push(() => r.set(work[key])); return r; };
    left.append(el_('h3', null, 'Stärke des Computers'), lvl, el_('h3', null, 'Farbe des Bretts'), tilesEl,
                el_('h3', null, 'Anzeige'), tg('Koordinaten anzeigen', 'showCoords'), tg('Letzten Zug markieren', 'showLast'));
    right.append(el_('h3', null, 'Vorschau'), pv);
    body.append(left, right);
    function sync() { syncs.forEach(f => f()); lvl.pick(work.level - 1); paintPreview(); }
    const p = openSheet('Einstellungen', body, sheet => [button('Standard', 'link', () => { Object.assign(work, LOOK); sync(); }), el_('div', 'grow'),
                                                          button('Abbrechen', '', () => closeSheet(sheet)), button('Übernehmen', 'primary', () => closeSheet(sheet, true))], true);
    requestAnimationFrame(sync);
    p.then(ok => { if (!ok) return; cfg = Object.assign(cfg, work); store('go.einstellungen', cfg); render(); });
  }

  function openRules() {
    const sections = [
      ['Ziel', 'Mit deinen Steinen mehr Gebiet umschließen als der Gegner. Gezählt werden am Ende deine Steine auf dem Brett plus die leeren Punkte, die nur du umschließt (Gebietswertung). Weiß bekommt dazu Komi als Ausgleich für den Anzug.'],
      ['Züge', 'Schwarz beginnt, dann abwechselnd: einen Stein auf einen freien Schnittpunkt setzen oder passen. Steine ohne freie Nachbarpunkte (Freiheiten) werden geschlagen. Selbstmord ist verboten, ebenso das sofortige Zurückschlagen im Ko.'],
      ['Ende', 'Passen beide nacheinander, wird ausgezählt. Der Computer schlägt tote Steine vor; Antippen einer Gruppe schaltet sie zwischen lebend und tot um. „Übernehmen“ beendet die Partie, „Weiterspielen“ setzt sie fort.']
    ];
    const body = el_('div', 'rules');
    sections.forEach(([h, t]) => body.append(el_('h3', null, h), el_('p', null, t)));
    return openSheet('Regeln', body, sheet => [el_('div', 'grow'), button('Schließen', 'primary', () => closeSheet(sheet))]);
  }

  function openStats() {
    const percent = (w, total) => total === 0 ? '–' : Math.round(100 * w / total) + ' %';
    const body = el_('div');
    const fill = () => {
      body.innerHTML = '';
      const comp = stats.filter(r => !r.zwei);
      const count = f => { let w = 0, l = 0; for (const r of comp) if (f(r)) { if (r.ergebnis > 0) w++; else l++; } return [w, l]; };
      const [w, l] = count(() => true), total = w + l;
      body.append(el_('h3', null, 'Gegen den Computer'));
      const tiles = el_('div', 'stat-tiles');
      [[total, 'Partien'], [w, 'Siege'], [l, 'Niederlagen'], [percent(w, total), 'Siegquote']].forEach(([v, c]) => {
        const t = el_('div', 'stat-tile'); t.append(el_('b', null, String(v)), el_('span', null, c)); tiles.append(t);
      });
      body.append(tiles, el_('h3', null, 'Nach Stärke, Farbe und Brett'));
      const legend = el_('div', 'legend');
      legend.innerHTML = '<span><i style="background:#E6E6E6"></i>Siege</span><span><i style="background:#4B4B4B"></i>Niederlagen</span>';
      body.append(legend);
      for (const [label, f, gap] of [['Leicht', r => r.stufe === 1], ['Mittel', r => r.stufe === 2], ['Schwer', r => r.stufe === 3],
                                     ['Mit Schwarz', r => r.farbe === 1, true], ['Mit Weiß', r => r.farbe === -1],
                                     ['9 × 9', r => r.groesse === 9, true], ['13 × 13', r => r.groesse === 13], ['19 × 19', r => r.groesse === 19]]) {
        const [rw, rl] = count(f), t = rw + rl;
        const row = el_('div', 'barrow' + (gap ? ' gap' : '')), bar = el_('div', 'bar');
        if (t > 0) [[rw, '#E6E6E6'], [rl, '#4B4B4B']].forEach(([v, c]) => { const i = el_('i'); i.style.width = (100 * v / t) + '%'; i.style.background = c; bar.append(i); });
        row.append(el_('span', null, label), bar, el_('small', null, t === 0 ? 'keine Partie' : rw + ' S · ' + rl + ' N   ' + percent(rw, t)));
        body.append(row);
      }
      const two = stats.filter(r => r.zwei);
      body.append(el_('h3', null, 'Zwei Spieler'), el_('p', 'line-text', two.length === 0 ? 'Noch keine Partie zu zweit beendet.'
        : two.length + (two.length === 1 ? ' Partie' : ' Partien') + ' – Schwarz gewinnt ' + two.filter(r => r.ergebnis > 0).length + ', Weiß gewinnt ' + two.filter(r => r.ergebnis < 0).length));
      body.append(el_('h3', null, 'Letzte Partien'));
      const games = el_('div', 'games');
      if (!stats.length) games.append(el_('div', 'empty', 'Noch keine beendeten Partien. Gezählt wird jede Partie, die ausgezählt oder aufgegeben wurde.'));
      for (const r of stats.slice().reverse()) {
        const g = el_('div', 'game'), dt = new Date(r.datum);
        const when = isNaN(dt) ? '' : dt.toLocaleDateString('de-DE') + ', ' + dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        g.append(el_('div', 'who', (r.zwei ? 'Zwei Spieler' : 'Computer · ' + LEVEL_NAMES[r.stufe] + (r.farbe === 1 ? ' · mit Schwarz' : ' · mit Weiß')) + ' · ' + r.groesse + '×' + r.groesse));
        const res = r.zwei ? (r.ergebnis > 0 ? 'Schwarz gewinnt' : 'Weiß gewinnt') : r.ergebnis > 0 ? 'Sieg' : 'Niederlage';
        g.append(el_('span', 'pill ' + (r.zwei ? 'draw' : r.ergebnis > 0 ? 'win' : 'loss'), res), el_('div', 'meta', when + '  ·  ' + r.grund + '  ·  ' + r.zuege + ' Züge'));
        games.append(g);
      }
      body.append(games);
    };
    fill();
    return openSheet('Statistik', body, sheet => [
      button('Statistik zurücksetzen …', 'link', async () => {
        if (!stats.length) return;
        if (await message('Statistik zurücksetzen', 'Alle ' + stats.length + ' gespeicherten Partien aus der Statistik löschen? Das lässt sich nicht rückgängig machen.', ['Zurücksetzen', 'Abbrechen']) !== 0) return;
        stats = []; store('go.statistik', stats); fill();
      }), el_('div', 'grow'), button('Schließen', 'primary', () => closeSheet(sheet))], true);
  }

  // ---------------------------------------------------------------- Knöpfe und Tasten
  $('bPass').addEventListener('click', passOrAccept);
  $('bHint').addEventListener('click', hintOrResume);
  $('bUndo').addEventListener('click', undo);
  $('bRedo').addEventListener('click', redoMove);
  $('bResign').addEventListener('click', resign);
  $('bStats').addEventListener('click', openStats);
  $('bNew').addEventListener('click', askNewGame);
  $('bSettings').addEventListener('click', openSettings);
  $('bRules').addEventListener('click', openRules);
  document.addEventListener('keydown', e => {
    if (sheets.length) { if (e.key === 'Escape') closeSheet(sheets[sheets.length - 1]); return; }
    const ctrl = e.ctrlKey || e.metaKey;
    if ((ctrl && e.key === 'z') || e.key === 'ArrowLeft') { e.preventDefault(); undo(); }
    else if ((ctrl && e.key === 'y') || e.key === 'ArrowRight') { e.preventDefault(); redoMove(); }
    else if (ctrl && e.key === 'n') { e.preventDefault(); askNewGame(); }
    else if (ctrl && e.key === 'h') { e.preventDefault(); if (!scoring) hintOrResume(); }
    else if (!ctrl && (e.key === 'p' || e.key === 'P') && !scoring) passOrAccept();
  });

  // ---------------------------------------------------------------- Start
  if (!loadGame()) startNewGame(1, cfg.size, cfg.komi, false); else render();
  new ResizeObserver(layoutBoard).observe(wrap);
  layoutBoard();
  if (scoring && !gameOver && !dead) enterScoring();
  maybeComputerMove();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

  window.go = { state: () => ({ moves: moves.map(m => pos.name(m)), toMove: pos.toMove, scoring, gameOver, resultText, thinking, score, stats: stats.length }),
                play: t => { const p = pos.parse(t); if (p === -2 || !canInteract()) return false; onPoint(p); return true; }, pass: passOrAccept };
})();
