// Schach – Regeln und Computergegner. Übertragen aus F:\Claude\Schach\src\Engine.cs (gleiche Logik).
// Brett: Feld 0 = a8 … 63 = h1; Figuren positiv = Weiß, negativ = Schwarz (1 Bauer … 6 König).
// Ein Zug ist eine Zahl: von | nach << 6 | Umwandlung << 12.
'use strict';

const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
const KN_D = [-2, -2, -1, -1, 1, 1, 2, 2], KN_C = [-1, 1, -2, 2, -2, 2, -1, 1];
const KI_D = [-1, -1, -1, 0, 0, 1, 1, 1], KI_C = [-1, 0, 1, -1, 1, -1, 0, 1];
const DIR_D = [-1, 1, 0, 0, -1, -1, 1, 1], DIR_C = [0, 0, -1, 1, -1, 1, -1, 1];   // 0-3 gerade, 4-7 diagonal
const SAN_LETTERS = ' BSLTDK';

function mv(from, to, promo) { return from | (to << 6) | ((promo || 0) << 12); }
function mFrom(m) { return m & 63; }
function mTo(m) { return (m >> 6) & 63; }
function mPromo(m) { return (m >> 12) & 7; }
function squareName(sq) { return String.fromCharCode(97 + (sq & 7)) + String.fromCharCode(56 - (sq >> 3)); }

class Position {
  constructor() {
    this.sq = new Int8Array(64);
    this.side = 1;
    this.wk = false; this.wq = false; this.bk = false; this.bq = false;
    this.ep = -1;
    this.half = 0;
    this.full = 1;
  }

  static start() { return Position.fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'); }

  static fromFen(fen) {
    const p = new Position();
    const parts = fen.split(' ');
    let r = 0, c = 0;
    for (const ch of parts[0]) {
      if (ch === '/') { r++; c = 0; }
      else if (ch >= '1' && ch <= '8') c += +ch;
      else {
        const t = 'pnbrqk'.indexOf(ch.toLowerCase()) + 1;
        p.sq[r * 8 + c] = ch === ch.toUpperCase() ? t : -t;
        c++;
      }
    }
    p.side = parts[1] === 'b' ? -1 : 1;
    const cr = parts[2] || '-';
    p.wk = cr.includes('K'); p.wq = cr.includes('Q'); p.bk = cr.includes('k'); p.bq = cr.includes('q');
    if (parts[3] && parts[3] !== '-') p.ep = (56 - parts[3].charCodeAt(1)) * 8 + (parts[3].charCodeAt(0) - 97);
    if (parts[4]) p.half = +parts[4];
    if (parts[5]) p.full = +parts[5];
    return p;
  }

  clone() {
    const p = new Position();
    p.sq.set(this.sq);
    p.side = this.side;
    p.wk = this.wk; p.wq = this.wq; p.bk = this.bk; p.bq = this.bq;
    p.ep = this.ep; p.half = this.half; p.full = this.full;
    return p;
  }

  toObj() {
    return { sq: Array.from(this.sq), side: this.side, wk: this.wk, wq: this.wq, bk: this.bk, bq: this.bq, ep: this.ep, half: this.half, full: this.full };
  }

  static fromObj(o) {
    const p = new Position();
    p.sq.set(o.sq);
    p.side = o.side; p.wk = o.wk; p.wq = o.wq; p.bk = o.bk; p.bq = o.bq; p.ep = o.ep; p.half = o.half; p.full = o.full;
    return p;
  }

  kingSq(side) {
    for (let i = 0; i < 64; i++) if (this.sq[i] === side * K) return i;
    return -1;
  }

  inCheck() {
    const k = this.kingSq(this.side);
    return k >= 0 && this.attacked(k, -this.side);
  }

  // Wird Feld sq von Seite "by" angegriffen?
  attacked(sq, by) {
    const s = this.sq, r = sq >> 3, c = sq & 7;
    const pr = r + (by === 1 ? 1 : -1);
    if (pr >= 0 && pr < 8) {
      if (c > 0 && s[pr * 8 + c - 1] === by * P) return true;
      if (c < 7 && s[pr * 8 + c + 1] === by * P) return true;
    }
    for (let i = 0; i < 8; i++) {
      let rr = r + KN_D[i], cc = c + KN_C[i];
      if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && s[rr * 8 + cc] === by * N) return true;
      rr = r + KI_D[i]; cc = c + KI_C[i];
      if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && s[rr * 8 + cc] === by * K) return true;
    }
    for (let d = 0; d < 8; d++) {
      let rr = r + DIR_D[d], cc = c + DIR_C[d];
      while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
        const pc = s[rr * 8 + cc];
        if (pc !== 0) {
          const t = pc * by;
          if (t === Q || (d < 4 && t === R) || (d >= 4 && t === B)) return true;
          break;
        }
        rr += DIR_D[d]; cc += DIR_C[d];
      }
    }
    return false;
  }

  static addPawn(list, from, to, promo) {
    if (promo) { list.push(mv(from, to, Q), mv(from, to, N), mv(from, to, R), mv(from, to, B)); }
    else list.push(mv(from, to, 0));
  }

  addCastles(list, sq) {
    const s = this.sq;
    if (this.side === 1 && sq === 60) {
      if (this.wk && s[61] === 0 && s[62] === 0 && s[63] === R &&
          !this.attacked(60, -1) && !this.attacked(61, -1) && !this.attacked(62, -1)) list.push(mv(60, 62, 0));
      if (this.wq && s[59] === 0 && s[58] === 0 && s[57] === 0 && s[56] === R &&
          !this.attacked(60, -1) && !this.attacked(59, -1) && !this.attacked(58, -1)) list.push(mv(60, 58, 0));
    } else if (this.side === -1 && sq === 4) {
      if (this.bk && s[5] === 0 && s[6] === 0 && s[7] === -R &&
          !this.attacked(4, 1) && !this.attacked(5, 1) && !this.attacked(6, 1)) list.push(mv(4, 6, 0));
      if (this.bq && s[3] === 0 && s[2] === 0 && s[1] === 0 && s[0] === -R &&
          !this.attacked(4, 1) && !this.attacked(3, 1) && !this.attacked(2, 1)) list.push(mv(4, 2, 0));
    }
  }

  // Züge ohne Prüfung, ob der eigene König danach im Schach steht
  pseudoMoves(capturesOnly) {
    const list = [];
    const s = this.sq, side = this.side;
    for (let sq = 0; sq < 64; sq++) {
      const t = s[sq] * side;
      if (t <= 0) continue;
      const r = sq >> 3, c = sq & 7;
      if (t === P) {
        const dir = side === 1 ? -1 : 1;
        const r1 = r + dir;
        if (r1 < 0 || r1 > 7) continue;
        const promo = r1 === 0 || r1 === 7;
        const fwd = r1 * 8 + c;
        if (s[fwd] === 0 && (!capturesOnly || promo)) {
          Position.addPawn(list, sq, fwd, promo);
          const start = side === 1 ? 6 : 1;
          if (r === start && !capturesOnly && s[fwd + dir * 8] === 0) list.push(mv(sq, fwd + dir * 8, 0));
        }
        for (let dc = -1; dc <= 1; dc += 2) {
          const cc = c + dc;
          if (cc < 0 || cc > 7) continue;
          const to = r1 * 8 + cc;
          if (s[to] * side < 0 || to === this.ep) Position.addPawn(list, sq, to, promo);
        }
      } else if (t === N || t === K) {
        const dr = t === N ? KN_D : KI_D, dcs = t === N ? KN_C : KI_C;
        for (let i = 0; i < 8; i++) {
          const rr = r + dr[i], cc = c + dcs[i];
          if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
          const to = rr * 8 + cc, target = s[to] * side;
          if (target > 0) continue;
          if (capturesOnly && target === 0) continue;
          list.push(mv(sq, to, 0));
        }
        if (t === K && !capturesOnly) this.addCastles(list, sq);
      } else {
        const d0 = t === B ? 4 : 0, d1 = t === R ? 4 : 8;
        for (let d = d0; d < d1; d++) {
          let rr = r + DIR_D[d], cc = c + DIR_C[d];
          while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
            const to = rr * 8 + cc, target = s[to] * side;
            if (target > 0) break;
            if (target < 0) { list.push(mv(sq, to, 0)); break; }
            if (!capturesOnly) list.push(mv(sq, to, 0));
            rr += DIR_D[d]; cc += DIR_C[d];
          }
        }
      }
    }
    return list;
  }

  legalMoves() {
    const res = [];
    for (const m of this.pseudoMoves(false)) {
      const np = this.make(m);
      if (!np.attacked(np.kingSq(this.side), np.side)) res.push(m);
    }
    return res;
  }

  isEnPassant(m) {
    const f = mFrom(m), t = mTo(m);
    return Math.abs(this.sq[f]) === P && t === this.ep && (f & 7) !== (t & 7);
  }

  make(m) {
    const p = this.clone();
    const from = mFrom(m), to = mTo(m), promo = mPromo(m);
    const pc = this.sq[from], type = Math.abs(pc);
    let captured = this.sq[to];
    p.sq[to] = pc;
    p.sq[from] = 0;
    if (type === P) {
      if (this.isEnPassant(m)) { p.sq[to + (this.side === 1 ? 8 : -8)] = 0; captured = -this.side * P; }
      if (promo !== 0) p.sq[to] = this.side * promo;
    }
    p.ep = (type === P && Math.abs(to - from) === 16) ? (from + to) / 2 : -1;
    if (type === K) {
      if (to - from === 2) { p.sq[from + 1] = p.sq[from + 3]; p.sq[from + 3] = 0; }
      else if (from - to === 2) { p.sq[from - 1] = p.sq[from - 4]; p.sq[from - 4] = 0; }
      if (this.side === 1) { p.wk = false; p.wq = false; } else { p.bk = false; p.bq = false; }
    }
    if (from === 63 || to === 63) p.wk = false;
    if (from === 56 || to === 56) p.wq = false;
    if (from === 7 || to === 7) p.bk = false;
    if (from === 0 || to === 0) p.bq = false;
    p.half = (type === P || captured !== 0) ? 0 : this.half + 1;
    if (this.side === -1) p.full++;
    p.side = -this.side;
    return p;
  }

  insufficientMaterial() {
    let minors = 0;
    for (let i = 0; i < 64; i++) {
      const t = Math.abs(this.sq[i]);
      if (t === P || t === R || t === Q) return false;
      if (t === N || t === B) minors++;
    }
    return minors <= 1;
  }

  // Schlüssel für Stellungswiederholungen
  key() {
    return this.sq.join(',') + (this.side === 1 ? 'w' : 'b') + (this.wk ? 'K' : '-') + (this.wq ? 'Q' : '-') +
           (this.bk ? 'k' : '-') + (this.bq ? 'q' : '-') + this.ep;
  }

  // Deutsche Kurznotation: K König, D Dame, T Turm, L Läufer, S Springer
  san(m) {
    const from = mFrom(m), to = mTo(m), promo = mPromo(m);
    const pc = Math.abs(this.sq[from]);
    let s;
    if (pc === K && Math.abs(to - from) === 2) s = to > from ? 'O-O' : 'O-O-O';
    else {
      const capture = this.sq[to] !== 0 || this.isEnPassant(m);
      s = '';
      if (pc === P) { if (capture) s += String.fromCharCode(97 + (from & 7)); }
      else {
        s += SAN_LETTERS[pc];
        let ambig = false, sameFile = false, sameRank = false;
        for (const o of this.legalMoves()) {
          const of = mFrom(o);
          if (mTo(o) !== to || of === from || Math.abs(this.sq[of]) !== pc) continue;
          ambig = true;
          if ((of & 7) === (from & 7)) sameFile = true;
          if ((of >> 3) === (from >> 3)) sameRank = true;
        }
        if (ambig) {
          const n = squareName(from);
          s += !sameFile ? n[0] : !sameRank ? n[1] : n;
        }
      }
      if (capture) s += 'x';
      s += squareName(to);
      if (promo !== 0) s += '=' + SAN_LETTERS[promo];
    }
    const np = this.make(m);
    if (np.inCheck()) s += np.legalMoves().length === 0 ? '#' : '+';
    return s;
  }

  // Zug als Text für den Spielstand, z. B. "e2e4" oder "e7e8q"
  static uci(m) {
    let s = squareName(mFrom(m)) + squareName(mTo(m));
    if (mPromo(m) !== 0) s += ' pnbrqk'[mPromo(m)];
    return s;
  }

  parseUci(s) {
    for (const m of this.legalMoves()) if (Position.uci(m) === s) return m;
    return -1;
  }
}

// ------------------------------------------------------------------ Computergegner
const INF = 10000000, MATE = 1000000;
const VAL = [0, 100, 320, 330, 500, 900, 0];
const ORDER_VAL = [0, 1, 3, 3, 5, 9, 20];
const PAWN_T = [
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0];
const KNIGHT_T = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50];
const BISHOP_T = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20];
const ROOK_T = [
    0,  0,  0,  0,  0,  0,  0,  0,
    5, 10, 10, 10, 10, 10, 10,  5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
    0,  0,  0,  5,  5,  0,  0,  0];
const QUEEN_T = [
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5,  5,  5,  5,  0,-10,
   -5,  0,  5,  5,  5,  5,  0, -5,
    0,  0,  5,  5,  5,  5,  0, -5,
  -10,  5,  5,  5,  5,  5,  0,-10,
  -10,  0,  5,  0,  0,  0,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20];
const KING_MID_T = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
   20, 20,  0,  0,  0,  0, 20, 20,
   20, 30, 10,  0,  0, 10, 30, 20];
const KING_END_T = [
  -50,-40,-30,-20,-20,-30,-40,-50,
  -30,-20,-10,  0,  0,-10,-20,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-30,  0,  0,  0,  0,-30,-30,
  -50,-30,-30,-30,-30,-30,-30,-50];
const PST = [null, PAWN_T, KNIGHT_T, BISHOP_T, ROOK_T, QUEEN_T, KING_MID_T];

// Bewertung aus Sicht der Seite am Zug (in Hundertstel Bauern)
function evaluate(p) {
  const s = p.sq;
  let nonPawn = 0;
  for (let i = 0; i < 64; i++) { const t = Math.abs(s[i]); if (t >= 2 && t <= 5) nonPawn += VAL[t]; }
  const endgame = nonPawn <= 2600;
  let score = 0, wb = 0, bb = 0;
  for (let i = 0; i < 64; i++) {
    const pc = s[i];
    if (pc === 0) continue;
    const t = pc > 0 ? pc : -pc;
    const idx = pc > 0 ? i : ((7 - (i >> 3)) << 3) | (i & 7);
    const table = (t === K && endgame) ? KING_END_T : PST[t];
    const v = VAL[t] + table[idx];
    if (pc > 0) score += v; else score -= v;
    if (t === B) { if (pc > 0) wb++; else bb++; }
  }
  if (wb >= 2) score += 30;
  if (bb >= 2) score -= 30;
  return p.side === 1 ? score : -score;
}

// Schlagzüge zuerst (wertvolles Opfer, billiger Angreifer), Umwandlungen ganz vorn
function orderMoves(p, list) {
  const keyed = new Array(list.length);
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    const victim = Math.abs(p.sq[mTo(m)]), att = Math.abs(p.sq[mFrom(m)]);
    let k = 0;
    if (victim !== 0) k = 100 + ORDER_VAL[victim] * 10 - ORDER_VAL[att];
    else if (p.isEnPassant(m)) k = 109;
    if (mPromo(m) !== 0) k += 200 + ORDER_VAL[mPromo(m)];
    keyed[i] = k * 32768 + m;
  }
  keyed.sort((a, b) => b - a);
  for (let i = 0; i < keyed.length; i++) keyed[i] = keyed[i] & 32767;
  return keyed;
}

class Engine {
  constructor() { this.nodes = 0; this.abort = false; this.lastScore = 0; this.lastDepth = 0; }

  findBest(pos, maxDepth, timeMs, noise) {
    this.t0 = Date.now();
    this.limit = timeMs;
    this.nodes = 0;
    this.abort = false;
    const legal = pos.legalMoves();
    if (legal.length === 0) return -1;
    const root = orderMoves(pos, legal);
    let best = root[0];
    if (root.length === 1) return best;

    for (let depth = 1; depth <= maxDepth; depth++) {
      const bi = root.indexOf(best);
      if (bi > 0) { root.splice(bi, 1); root.unshift(best); }
      let alpha = -INF, iterBest = best, complete = true;
      for (const m of root) {
        const np = pos.make(m);
        let sc;
        if (noise > 0) sc = -this.search(np, depth - 1, -INF, INF, 1) + Math.floor(Math.random() * noise);
        else sc = -this.search(np, depth - 1, -INF, -alpha, 1);
        if (this.abort) { complete = false; break; }
        if (sc > alpha) { alpha = sc; iterBest = m; }
      }
      if (!complete) break;
      best = iterBest;
      this.lastScore = alpha;
      this.lastDepth = depth;
      if (alpha >= MATE - 200) break;                       // Matt gefunden
      if ((Date.now() - this.t0) * 3 > this.limit) break;   // nächste Tiefe würde zu lange dauern
    }
    return best;
  }

  timeUp() {
    if ((++this.nodes & 1023) === 0 && Date.now() - this.t0 > this.limit) this.abort = true;
    return this.abort;
  }

  search(p, depth, alpha, beta, ply) {
    if (this.timeUp()) return 0;
    if (p.half >= 100) return 0;
    const inCheck = p.inCheck();
    if (inCheck && ply < 30) depth++;               // Schachgebote verlängern
    if (depth <= 0) return this.quiesce(p, alpha, beta, ply);
    const moves = orderMoves(p, p.pseudoMoves(false));
    let legal = 0;
    for (const m of moves) {
      const np = p.make(m);
      if (np.attacked(np.kingSq(p.side), np.side)) continue;
      legal++;
      const sc = -this.search(np, depth - 1, -beta, -alpha, ply + 1);
      if (this.abort) return 0;
      if (sc >= beta) return beta;
      if (sc > alpha) alpha = sc;
    }
    if (legal === 0) return inCheck ? -MATE + ply : 0;
    return alpha;
  }

  quiesce(p, alpha, beta, ply) {
    if (this.timeUp()) return 0;
    const stand = evaluate(p);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    const moves = orderMoves(p, p.pseudoMoves(true));
    for (const m of moves) {
      const np = p.make(m);
      if (np.attacked(np.kingSq(p.side), np.side)) continue;
      const sc = -this.quiesce(np, -beta, -alpha, ply + 1);
      if (this.abort) return 0;
      if (sc >= beta) return beta;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }
}
