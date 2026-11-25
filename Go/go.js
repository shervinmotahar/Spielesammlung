// Go – Regeln, Auszählung und Computer (Monte-Carlo-Baumsuche mit RAVE), 1:1 aus Regeln.cs der Windows-App
// (F:\Claude\Spielesammlung\Go\src\Regeln.cs). Brett mit Rand: p = (y + 1) * W + x + 1; 0 leer, 1 Schwarz, 2 Weiß, 3 Rand.
'use strict';
const GoGame = (function () {
  const PASS = -1, COLS = 'ABCDEFGHJKLMNOPQRST';

  function Board(n, komi) {
    this.N = n; this.W = n + 2; this.komi = komi;
    this.b = new Uint8Array(this.W * this.W).fill(3);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) this.b[this.pt(x, y)] = 0;
    this.toMove = 1; this.ko = -1; this.passes = 0; this.caps = [0, 0, 0];
    this.dir = [-this.W, 1, this.W, -1];
    this.mark = new Int32Array(this.W * this.W); this.gen = 0; this.stack = new Int32Array(this.W * this.W);
  }
  const B = Board.prototype;
  B.pt = function (x, y) { return (y + 1) * this.W + x + 1; };
  B.x = function (p) { return p % this.W - 1; };
  B.y = function (p) { return Math.floor(p / this.W) - 1; };
  B.copy = function () {
    const c = new Board(this.N, this.komi);
    c.b.set(this.b); c.toMove = this.toMove; c.ko = this.ko; c.passes = this.passes; c.caps = this.caps.slice();
    return c;
  };
  B.copyFrom = function (o) { this.b.set(o.b); this.toMove = o.toMove; this.ko = o.ko; this.passes = o.passes; this.caps = o.caps.slice(); this.komi = o.komi; };
  B.name = function (p) { return p === PASS ? 'pass' : COLS[this.x(p)] + (this.N - this.y(p)); };
  B.parse = function (s) {
    if (s === 'pass') return PASS;
    const x = COLS.indexOf((s[0] || '').toUpperCase()), row = parseInt(s.slice(1), 10);
    if (x < 0 || x >= this.N || !(row >= 1 && row <= this.N)) return -2;
    return this.pt(x, this.N - row);
  };
  B.hasLiberty = function (p) {
    const g = ++this.gen, color = this.b[p], st = this.stack, b = this.b, d = this.dir;
    let sp = 0;
    st[sp++] = p; this.mark[p] = g;
    while (sp > 0) {
      const q = st[--sp];
      for (let k = 0; k < 4; k++) {
        const r = q + d[k];
        if (b[r] === 0) return true;
        if (b[r] === color && this.mark[r] !== g) { this.mark[r] = g; st[sp++] = r; }
      }
    }
    return false;
  };
  B.liberties = function (p, max) {
    const g = ++this.gen, color = this.b[p], st = this.stack, libs = new Set();
    let sp = 0;
    st[sp++] = p; this.mark[p] = g;
    while (sp > 0) {
      const q = st[--sp];
      for (let k = 0; k < 4; k++) {
        const r = q + this.dir[k];
        if (this.b[r] === 0) { libs.add(r); if (libs.size >= max) return libs.size; }
        else if (this.b[r] === color && this.mark[r] !== g) { this.mark[r] = g; st[sp++] = r; }
      }
    }
    return libs.size;
  };
  B.remove = function (p) {
    const color = this.b[p], st = this.stack;
    let sp = 0, n = 0;
    st[sp++] = p; this.b[p] = 0;
    while (sp > 0) {
      const q = st[--sp]; n++;
      for (let k = 0; k < 4; k++) { const r = q + this.dir[k]; if (this.b[r] === color) { this.b[r] = 0; st[sp++] = r; } }
    }
    return n;
  };
  B.play = function (p) {
    const me = this.toMove, opp = 3 - me;
    if (p === PASS) { this.ko = -1; this.passes++; this.toMove = opp; return true; }
    if (this.b[p] !== 0 || p === this.ko) return false;
    this.b[p] = me;
    let captured = 0, lastCap = -1;
    for (let k = 0; k < 4; k++) {
      const q = p + this.dir[k];
      if (this.b[q] === opp && !this.hasLiberty(q)) { captured += this.remove(q); lastCap = q; }
    }
    if (captured === 0 && !this.hasLiberty(p)) { this.b[p] = 0; return false; }
    this.caps[me] += captured;
    this.ko = -1;
    if (captured === 1) {
      let single = true;
      for (let k = 0; k < 4; k++) if (this.b[p + this.dir[k]] === me) single = false;
      if (single && this.liberties(p, 2) === 1) this.ko = lastCap;
    }
    this.passes = 0; this.toMove = opp;
    return true;
  };
  B.isLegal = function (p) {
    if (p === PASS) return true;
    if (p < 0 || this.b[p] !== 0 || p === this.ko) return false;
    const me = this.toMove, opp = 3 - me;
    for (let k = 0; k < 4; k++) if (this.b[p + this.dir[k]] === 0) return true;
    this.b[p] = me;
    let ok = this.hasLiberty(p);
    for (let k = 0; k < 4 && !ok; k++) { const q = p + this.dir[k]; if (this.b[q] === opp && !this.hasLiberty(q)) ok = true; }
    this.b[p] = 0;
    return ok;
  };
  B.isEye = function (p, color) {
    const b = this.b, W = this.W;
    for (let k = 0; k < 4; k++) { const v = b[p + this.dir[k]]; if (v !== color && v !== 3) return false; }
    let opp = 0, edge = 0;
    for (const d of [-W - 1, -W + 1, W - 1, W + 1]) { const v = b[p + d]; if (v === 3) edge = 1; else if (v === 3 - color) opp++; }
    return opp + edge < 2;
  };
  // Auszählung nach Gebiet; dead = tote Steine, owner wird gefüllt. Rückgabe: Schwarz − Weiß − Komi
  B.score = function (dead, owner) {
    const b = Uint8Array.from(this.b);
    if (dead) for (let p = 0; p < b.length; p++) if (dead[p] && b[p] < 3) b[p] = 0;
    const own = owner || new Int8Array(b.length), seen = new Uint8Array(b.length);
    let black = 0, white = 0;
    for (let p = 0; p < b.length; p++) {
      if (b[p] === 3) continue;
      if (b[p] === 1) { black++; own[p] = 1; continue; }
      if (b[p] === 2) { white++; own[p] = 2; continue; }
      if (seen[p]) continue;
      const region = [], st = [p];
      let touch = 0;
      seen[p] = 1;
      while (st.length) {
        const q = st.pop(); region.push(q);
        for (let k = 0; k < 4; k++) {
          const r = q + this.dir[k];
          if (b[r] === 0) { if (!seen[r]) { seen[r] = 1; st.push(r); } } else if (b[r] === 1) touch |= 1; else if (b[r] === 2) touch |= 2;
        }
      }
      const o = touch === 1 ? 1 : touch === 2 ? 2 : 0;
      for (const q of region) own[q] = o;
      if (o === 1) black += region.length; else if (o === 2) white += region.length;
    }
    return black - white - this.komi;
  };
  B.group = function (p) {
    const res = [], color = this.b[p];
    if (color === 0 || color === 3) return res;
    const g = ++this.gen, st = [p];
    this.mark[p] = g;
    while (st.length) {
      const q = st.pop(); res.push(q);
      for (let k = 0; k < 4; k++) { const r = q + this.dir[k]; if (this.b[r] === color && this.mark[r] !== g) { this.mark[r] = g; st.push(r); } }
    }
    return res;
  };
  B.key = function () { return this.b.join('') + this.toMove; };
  B.toJSON = function () { return { N: this.N, komi: this.komi, b: Array.from(this.b), toMove: this.toMove, ko: this.ko, passes: this.passes, caps: this.caps }; };
  function fromJSON(o) { const c = new Board(o.N, o.komi); c.b.set(o.b); c.toMove = o.toMove; c.ko = o.ko; c.passes = o.passes; c.caps = o.caps.slice(); return c; }

  // ---------------------------------------------------------------- Computer
  let empties = null;
  function fastScore(bd) {
    const b = bd.b, d = bd.dir;
    let s = 0;
    for (let p = 0; p < b.length; p++) {
      const v = b[p];
      if (v === 1) s++; else if (v === 2) s--;
      else if (v === 0) {
        let t = 0;
        for (let k = 0; k < 4; k++) { const n = b[p + d[k]]; if (n === 1) t |= 1; else if (n === 2) t |= 2; }
        if (t === 1) s++; else if (t === 2) s--;
      }
    }
    return s - bd.komi;
  }
  function playout(bd, played) {
    if (!empties || empties.length < bd.b.length) empties = new Int32Array(bd.b.length);
    const limit = bd.N * bd.N * 3;
    let passes = bd.passes;
    for (let m = 0; m < limit && passes < 2; m++) {
      let ne = 0;
      for (let p = 0; p < bd.b.length; p++) if (bd.b[p] === 0) empties[ne++] = p;
      const color = bd.toMove;
      let chosen = -1;
      while (ne > 0) {
        const k = Math.floor(Math.random() * ne), p = empties[k];
        if (!bd.isEye(p, color) && bd.play(p)) { chosen = p; break; }
        empties[k] = empties[--ne];
      }
      if (chosen < 0) { bd.play(PASS); passes++; }
      else { passes = 0; if (played && played[chosen] === 0) played[chosen] = color; }
    }
    return fastScore(bd);
  }

  function expand(node, bd) {
    node.children = [];
    const c = bd.toMove;
    for (let p = 0; p < bd.b.length; p++) if (bd.b[p] === 0 && !bd.isEye(p, c) && bd.isLegal(p)) node.children.push({ move: p, v: 0, w: 0, rv: 0, rw: 0, children: null });
    if (node.children.length < bd.N * bd.N / 3) node.children.push({ move: PASS, v: 0, w: 0, rv: 0, rw: 0, children: null });
  }
  function select(node) {
    let best = null, bestV = -Infinity;
    for (const ch of node.children) {
      const q = ch.v > 0 ? ch.w / ch.v : 0.5, rq = ch.rv > 0 ? ch.rw / ch.rv : 0.5;
      const beta = Math.sqrt(1000 / (3 * ch.v + 1000));
      let v = (1 - beta) * q + beta * rq + (ch.v === 0 ? 0.3 + Math.random() * 0.01 : 0);
      if (ch.move === PASS) v -= 0.1;
      if (v > bestV) { bestV = v; best = ch; }
    }
    return best;
  }
  // Bester Zug für board.toMove; Rückgabe { move, winRate, playouts }
  function findBest(board, maxPlayouts, timeMs) {
    const end = Date.now() + timeMs;
    const root = { move: PASS, v: 0, w: 0, rv: 0, rw: 0, children: null };
    expand(root, board);
    if (!root.children.length) return { move: PASS, winRate: 0.5, playouts: 0 };
    const work = board.copy(), played = new Uint8Array(board.b.length), path = [];
    let n = 0;
    while (n < maxPlayouts && ((n & 15) !== 0 || Date.now() < end)) {
      work.copyFrom(board); played.fill(0); path.length = 0;
      let node = root;
      path.push(node);
      while (node.children && node.children.length) {
        node = select(node);
        const c = work.toMove;
        if (!work.play(node.move)) { node.v++; break; }
        if (node.move >= 0 && played[node.move] === 0) played[node.move] = c;
        path.push(node);
        if (work.passes >= 2) break;
      }
      if (!node.children && node.v >= 2 && work.passes < 2) expand(node, work);
      const winner = playout(work, played) > 0 ? 1 : 2;
      let color = board.toMove;
      for (let i = 1; i < path.length; i++) { const nd = path[i]; nd.v++; if (winner === color) nd.w++; color = 3 - color; }
      color = board.toMove;
      for (let i = 0; i < path.length; i++) {
        const nd = path[i];
        if (nd.children) for (const ch of nd.children) if (ch.move >= 0 && played[ch.move] === color) { ch.rv++; if (winner === color) ch.rw++; }
        color = 3 - color;
      }
      n++;
    }
    let best = null;
    for (const ch of root.children) if (!best || ch.v > best.v) best = ch;
    return { move: best.move, winRate: best.v > 0 ? best.w / best.v : 0.5, playouts: n };
  }
  function ownership(board, n) {
    const own = new Float32Array(board.b.length), b = board.copy(), o = new Int8Array(board.b.length);
    for (let i = 0; i < n; i++) {
      b.copyFrom(board); b.passes = 0;
      playout(b, null);
      b.score(null, o);
      for (let p = 0; p < own.length; p++) own[p] += o[p] === 1 ? 1 : o[p] === 2 ? -1 : 0;
    }
    for (let p = 0; p < own.length; p++) own[p] /= n;
    return own;
  }
  function guessDead(board) {
    const own = ownership(board, board.N <= 9 ? 400 : board.N <= 13 ? 250 : 150);
    const dead = new Uint8Array(board.b.length), done = new Uint8Array(board.b.length);
    for (let p = 0; p < own.length; p++) {
      if (board.b[p] === 1 && own[p] < -0.5) dead[p] = 1;
      if (board.b[p] === 2 && own[p] > 0.5) dead[p] = 1;
    }
    for (let p = 0; p < own.length; p++) {
      if (done[p] || board.b[p] === 0 || board.b[p] === 3) continue;
      const g = board.group(p);
      let d = 0;
      for (const q of g) { done[q] = 1; if (dead[q]) d++; }
      for (const q of g) dead[q] = d * 2 > g.length ? 1 : 0;
    }
    return dead;
  }
  // Entscheidung des Computers wie Think() in Gui.cs: mitpassen, wenn vorne; aufgeben, wenn hoffnungslos
  function think(board, maxPlayouts, timeMs) {
    const me = board.toMove;
    if (board.passes === 1) {
      const sc = board.score(guessDead(board), null);
      if ((me === 1 && sc > 0) || (me === 2 && sc < 0)) return { move: PASS, resign: false };
    }
    const r = findBest(board, maxPlayouts, timeMs);
    let stones = 0;
    for (const v of board.b) if (v === 1 || v === 2) stones++;
    return { move: r.move, resign: r.winRate < 0.06 && r.playouts > 500 && stones > board.N * board.N / 3 };
  }

  return { PASS, Board, fromJSON, findBest, guessDead, think };
})();
