// Backgammon – Regeln und Computer, 1:1 aus Regeln.cs der Windows-App (F:\Claude\Spielesammlung\Backgammon\src\Regeln.cs).
// Brett aus Sicht von Spieler 0 (unten): pts[1..24] > 0 = Spieler 0, < 0 = Spieler 1. Relativ: Bar = 25, abgetragen = 0.
// Schritt = { from, to, die, hit } (relativ zum Ziehenden)
'use strict';
const BG = (function () {
  function start() {
    const pts = new Array(26).fill(0);
    pts[24] = 2; pts[13] = 5; pts[8] = 3; pts[6] = 5; pts[1] = -2; pts[12] = -5; pts[17] = -3; pts[19] = -5;
    return { pts, bar: [0, 0], off: [0, 0] };
  }
  const empty = () => ({ pts: new Array(26).fill(0), bar: [0, 0], off: [0, 0] });
  const copy = b => ({ pts: b.pts.slice(), bar: b.bar.slice(), off: b.off.slice() });
  const abs = (side, r) => side === 0 ? r : 25 - r;
  function at(b, side, r) { if (r === 25) return b.bar[side]; const v = b.pts[abs(side, r)]; return side === 0 ? v : -v; }
  function add(b, side, r, n) { if (r === 25) b.bar[side] += n; else if (r === 0) b.off[side] += n; else b.pts[abs(side, r)] += side === 0 ? n : -n; }
  function allHome(b, side) { if (b.bar[side] > 0) return false; for (let r = 7; r <= 24; r++) if (at(b, side, r) > 0) return false; return true; }
  function canStep(b, side, from, d) {
    if (at(b, side, from) <= 0) return null;
    if (b.bar[side] > 0 && from !== 25) return null;
    const to = from - d;
    if (to <= 0) {
      if (!allHome(b, side)) return null;
      if (to < 0) for (let r = from + 1; r <= 6; r++) if (at(b, side, r) > 0) return null;
      return { from, to: 0, die: d, hit: false };
    }
    const v = at(b, side, to);
    if (v < -1) return null;
    return { from, to, die: d, hit: v === -1 };
  }
  function apply(b, side, s) {
    add(b, side, s.from, -1);
    if (s.hit) { b.pts[abs(side, s.to)] = 0; b.bar[1 - side]++; }
    add(b, side, s.to, 1);
  }
  function pips(b, side) { let p = b.bar[side] * 25; for (let r = 1; r <= 24; r++) { const v = at(b, side, r); if (v > 0) p += v * r; } return p; }
  const key = b => b.pts.join(',') + '|' + b.bar.join(',') + '|' + b.off.join(',');
  function winKind(b, w) {
    if (b.off[w] < 15) return 0;
    const l = 1 - w;
    if (b.off[l] > 0) return 1;
    if (b.bar[l] > 0) return 3;
    for (let r = 19; r <= 24; r++) if (at(b, l, r) > 0) return 3;
    return 2;
  }
  const stepText = s => (s.from === 25 ? 'bar' : s.from) + '/' + (s.to === 0 ? 'off' : s.to) + (s.hit ? '*' : '');
  const diceList = (a, b) => a === b ? [a, a, a, a] : [a, b];

  // ---------------------------------------------------------------- Zugregeln
  function maxUsable(b, side, dice, memo) {
    if (!dice.length) return 0;
    const k = key(b) + '#' + side + '#' + dice.join(',');
    if (memo.has(k)) return memo.get(k);
    let best = 0;
    const tried = new Set();
    for (let i = 0; i < dice.length && best < dice.length; i++) {
      const d = dice[i];
      if (tried.has(d)) continue;
      tried.add(d);
      for (let from = 25; from >= 1 && best < dice.length; from--) {
        const s = canStep(b, side, from, d);
        if (!s) continue;
        const c = copy(b); apply(c, side, s);
        const rest = dice.slice(); rest.splice(i, 1);
        best = Math.max(best, 1 + maxUsable(c, side, rest, memo));
      }
    }
    memo.set(k, best);
    return best;
  }
  function allowed(b, side, dice) {
    const res = [];
    if (!dice.length) return res;
    const memo = new Map(), total = maxUsable(b, side, dice, memo);
    if (!total) return res;
    const seen = new Set();
    for (let i = 0; i < dice.length; i++) {
      const d = dice[i];
      for (let from = 25; from >= 1; from--) {
        const s = canStep(b, side, from, d);
        if (!s) continue;
        const sk = from + '>' + s.to + ':' + d;
        if (seen.has(sk)) continue;
        seen.add(sk);
        const c = copy(b); apply(c, side, s);
        const rest = dice.slice(); rest.splice(i, 1);
        if (1 + maxUsable(c, side, rest, memo) === total) res.push(s);
      }
    }
    if (total === 1 && dice.length === 2 && dice[0] !== dice[1]) {
      const hi = Math.max(dice[0], dice[1]);
      if (res.some(s => s.die === hi)) return res.filter(s => s.die === hi);
    }
    return res;
  }
  function plays(b, side, dice) {
    const res = [], seen = new Set();
    (function expand(bd, ds, path) {
      const next = allowed(bd, side, ds);
      if (!next.length) { const k = key(bd); if (!seen.has(k)) { seen.add(k); res.push({ board: bd, steps: path.slice() }); } return; }
      const local = new Set();
      for (const s of next) {
        const c = copy(bd); apply(c, side, s);
        const rest = ds.slice(); rest.splice(rest.indexOf(s.die), 1);
        const k = key(c) + '|' + rest.length, pk = 'p' + path.length + ':' + k;
        if (local.has(k) || seen.has(pk)) continue;
        local.add(k); seen.add(pk);
        path.push(s); expand(c, rest, path); path.pop();
      }
    })(b, dice, []);
    return res;
  }

  // ---------------------------------------------------------------- Computer
  const POINT_VALUE = [0, 4, 6, 8, 11, 14, 12, 10, 7, 5, 4, 3, 2, 2, 2, 2, 2, 2, 4, 5, 9, 8, 5, 3, 2];
  function shots(b, side, r) {
    const dists = [], opp = 1 - side;
    if (b.bar[opp] > 0) dists.push(r);
    for (let q = 1; q < r; q++) if (at(b, side, q) < 0) dists.push(r - q);
    if (!dists.length) return 0;
    let n = 0;
    for (let d1 = 1; d1 <= 6; d1++) for (let d2 = 1; d2 <= 6; d2++)
      if (dists.some(x => d1 === x || d2 === x || d1 + d2 === x || (d1 === d2 && (3 * d1 === x || 4 * d1 === x)))) n++;
    return n;
  }
  // Gewichte wie Ai.Default / Ai.Tuned in Regeln.cs: 0 Punkte, 1 Prime, 2 Stapel, 3 Blots, 4 Blot-Grundwert, 5 Bar-Grundwert,
  // 6 Bar gegen Heimfeld, 7 gegnerische Heimfeldpunkte, 8 Stapel im Rennen, 9 abgetragene Steine, 10 Anker, 11 hintere Steine
  const DEFAULT_W = [1, 7, 1.5, 1, 10, 4, 1.2, 0.5, 0.6, 4, 0, 0];
  const TUNED_W = [1, 7, 1.5, 1, 0, 4, 1.2, 0.884, 0.6, 4, 0, 0];      // per Selbstspiel abgestimmt („Schwer“)
  function evaluate(b, side, w) {
    w = w || DEFAULT_W;
    const opp = 1 - side;
    let score = pips(b, opp) - pips(b, side) + w[9] * (b.off[side] - b.off[opp]);
    let myBack = 0, oppFront = 25;
    for (let r = 25; r >= 1; r--) if (at(b, side, r) > 0) { myBack = r; break; }
    if (b.bar[opp] > 0) oppFront = 0; else for (let r = 1; r <= 24; r++) if (at(b, side, r) < 0) { oppFront = r; break; }
    if (myBack < oppFront) {
      for (let r = 1; r <= 6; r++) { const v = at(b, side, r); if (v > 0) score -= Math.max(0, v - 3) * w[8]; }
      return score;
    }
    let run = 0, back = b.bar[side];
    for (let r = 1; r <= 24; r++) {
      const v = at(b, side, r);
      if (v >= 2) { score += POINT_VALUE[r] * w[0]; run++; if (run >= 3) score += w[1]; if (v > 3) score -= (v - 3) * w[2]; if (r >= 19) score += w[10]; } else run = 0;
      if (v > 0 && r >= 19) back += v;
      if (v <= -2 && r >= 19) score -= POINT_VALUE[25 - r] * w[7];
    }
    score -= back * w[11];
    let oppHome = 0, myHome = 0;
    for (let r = 19; r <= 24; r++) if (at(b, side, r) <= -2) oppHome++;
    for (let r = 1; r <= 6; r++) if (at(b, side, r) >= 2) myHome++;
    score -= b.bar[side] * (w[5] + oppHome * oppHome * w[6]);
    score += b.bar[opp] * (w[5] + myHome * myHome * w[6]);
    for (let r = 1; r <= 24; r++) {
      if (at(b, side, r) !== 1) continue;
      const s = shots(b, side, r);
      if (s > 0) score -= s / 36 * (25 - r + w[4]) * w[3];
    }
    return score;
  }
  function winChance(b, side, onRoll) {
    const e = evaluate(b, side) + (onRoll ? 8 : -8), avg = (pips(b, 0) + pips(b, 1)) / 2;
    return 1 / (1 + Math.exp(-e / (0.12 * Math.max(40, avg) + 4)));
  }
  function best(b, side, dice, level) {
    const w = level === 3 ? TUNED_W : DEFAULT_W;
    const ps = plays(b, side, dice);
    if (!ps.length) return [];
    const scored = ps.map((p, i) => {
      let v = evaluate(p.board, side, w);
      if (p.board.off[side] === 15) v += 1000;
      if (level === 1) v += (Math.random() - 0.5) * 30;
      return { v, i };
    }).sort((x, y) => y.v - x.v);
    // wie in Regeln.cs: kein Vorausrechnen (brachte im Test nichts), „Schwer“ = abgestimmte Gewichte
    return ps[scored[0].i].steps;
  }
  const wantsDouble = (b, side, level) => { if (level === 1) return false; const p = winChance(b, side, true); return p >= 0.7 && p < 0.92; };
  const accepts = (b, side, level) => winChance(b, side, false) >= (level === 1 ? 0.18 : 0.25);

  return { start, empty, copy, abs, at, canStep, apply, pips, key, winKind, stepText, diceList, allowed, plays, best, wantsDouble, accepts, evaluate };
})();
if (typeof self !== 'undefined' && typeof window === 'undefined') {
  // im Worker: Computerzug oder Tipp berechnen
  self.onmessage = e => { const { id, board, side, dice, level } = e.data; self.postMessage({ id, steps: BG.best(board, side, dice, level) }); };
}
