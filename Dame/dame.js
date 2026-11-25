// Dame – Regeln und Computergegner, 1:1 aus Regeln.cs der Windows-App (F:\Claude\Spielesammlung\Dame\src\Regeln.cs).
// Brett = Array(64), Feld 0 = a8. Steine: 1 weißer Stein, 2 weiße Dame, −1/−2 Schwarz. Weiß spielt nach oben und beginnt.
// Zug = { from, path: [Landefelder], caps: [geschlagene Felder] }
'use strict';
const Dame = (function () {
  // Reihenfolge fest (Index im Spielstand): 0 Deutsch, 1 Brasilianisch, 2 Checkers, 3 Russisch; ORDER = Anzeige im Dialog
  const VARIANTS = [
    { name: 'Deutsche Dame', short: 'Deutsch', flying: true, back: false, max: false, blackFirst: false, crown: false },
    { name: 'Brasilianische Dame', short: 'Brasilianisch', flying: true, back: true, max: true, blackFirst: false, crown: false },
    { name: 'Checkers', short: 'Checkers', flying: false, back: false, max: false, blackFirst: true, crown: false },
    { name: 'Russische Dame', short: 'Russisch', flying: true, back: true, max: false, blackFirst: false, crown: true }
  ];
  const ORDER = [0, 3, 1, 2];
  const DESCRIPTIONS = [
    'Damen ziehen beliebig weit, einfache Steine ziehen und schlagen nur vorwärts, Schlagzwang mit freier Wahl. Verbreitete Hausregel – einheitliche offizielle Regeln gibt es nicht.',
    'Internationale Regeln auf 8 × 8: Damen ziehen weit, Steine schlagen auch rückwärts, und es muss der Schlag mit den meisten Steinen gewählt werden.',
    'Englische Regeln: Schwarz beginnt, Damen ziehen nur ein Feld, Steine schlagen nur vorwärts, Schlagzwang mit freier Wahl.',
    'Damen ziehen weit, Steine schlagen auch rückwärts, freie Wahl beim Schlagen. Wer beim Schlagen die letzte Reihe erreicht, wird sofort Dame und schlägt als Dame weiter.'
  ];
  const DR = [-1, -1, 1, 1], DC = [-1, 1, -1, 1];
  const dark = i => ((i >> 3) + (i & 7)) % 2 === 1;
  const num = i => (i >> 3) * 4 + ((i & 7) >> 1) + 1;
  function fromNum(n) { n--; const r = Math.floor(n / 4), c = (n % 4) * 2 + (r % 2 === 0 ? 1 : 0); return r * 8 + c; }

  function start(variant) {
    const sq = new Array(64).fill(0);
    for (let i = 0; i < 64; i++) if (dark(i)) { const r = i >> 3; if (r <= 2) sq[i] = -1; else if (r >= 5) sq[i] = 1; }
    return { sq, side: VARIANTS[variant].blackFirst ? -1 : 1, quiet: 0, v: variant };
  }

  function legalMoves(p) {
    const R = VARIANTS[p.v];
    let caps = [];
    for (let i = 0; i < 64; i++) if (p.sq[i] * p.side > 0) captures(p, i, caps);
    if (caps.length) {
      if (R.max) { const m = Math.max(...caps.map(c => c.caps.length)); caps = caps.filter(c => c.caps.length === m); }
      return caps;
    }
    const res = [];
    for (let i = 0; i < 64; i++) {
      const pc = p.sq[i];
      if (pc * p.side <= 0) continue;
      const king = Math.abs(pc) === 2;
      for (let d = 0; d < 4; d++) {
        if (!king && DR[d] !== -p.side) continue;
        let r = (i >> 3) + DR[d], c = (i & 7) + DC[d];
        while (r >= 0 && r < 8 && c >= 0 && c < 8 && p.sq[r * 8 + c] === 0) {
          res.push({ from: i, path: [r * 8 + c], caps: [] });
          if (!king || !R.flying) break;
          r += DR[d]; c += DC[d];
        }
      }
    }
    return res;
  }

  function hasCapture(p) {
    const l = [];
    for (let i = 0; i < 64; i++) if (p.sq[i] * p.side > 0) { captures(p, i, l); if (l.length) return true; }
    return false;
  }

  function captures(p, from, res) {
    const b = p.sq.slice();
    const pc = b[from];
    b[from] = 0;
    dfs(p, b, from, from, Math.abs(pc) === 2, false, [], [], res);
  }

  function dfs(p, b, from, at, king, crowned, path, caps, res) {
    const R = VARIANTS[p.v], side = p.side, lastRow = side === 1 ? 0 : 7;
    let any = false;
    const ar = at >> 3, ac = at & 7;
    for (let d = 0; d < 4; d++) {
      if (!king && !R.back && DR[d] !== -side) continue;
      if (king && R.flying) {
        let r = ar + DR[d], c = ac + DC[d];
        while (r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === 0) { r += DR[d]; c += DC[d]; }
        if (r < 0 || r > 7 || c < 0 || c > 7) continue;
        const s = r * 8 + c;
        if (b[s] * side >= 0 || caps.includes(s)) continue;
        let r2 = r + DR[d], c2 = c + DC[d];
        while (r2 >= 0 && r2 < 8 && c2 >= 0 && c2 < 8 && b[r2 * 8 + c2] === 0) {
          const t = r2 * 8 + c2;
          any = true;
          caps.push(s); path.push(t);
          dfs(p, b, from, t, true, crowned, path, caps, res);
          caps.pop(); path.pop();
          r2 += DR[d]; c2 += DC[d];
        }
      } else {
        const r = ar + DR[d], c = ac + DC[d], r2 = ar + 2 * DR[d], c2 = ac + 2 * DC[d];
        if (r2 < 0 || r2 > 7 || c2 < 0 || c2 > 7) continue;
        const s = r * 8 + c, t = r2 * 8 + c2;
        if (b[s] * side >= 0 || caps.includes(s) || b[t] !== 0) continue;
        any = true;
        caps.push(s); path.push(t);
        const crown = !king && R.crown && (t >> 3) === lastRow;       // russisch: sofort Dame
        dfs(p, b, from, t, king || crown, crowned || crown, path, caps, res);
        caps.pop(); path.pop();
      }
    }
    if (!any && caps.length) res.push({ from, path: path.slice(), caps: caps.slice(), crowned });
  }

  const to = m => m.path[m.path.length - 1];

  function make(p, m) {
    const sq = p.sq.slice();
    let pc = sq[m.from];
    sq[m.from] = 0;
    for (const c of m.caps) sq[c] = 0;
    const lastRow = p.side === 1 ? 0 : 7;
    if (Math.abs(pc) === 1 && ((to(m) >> 3) === lastRow || m.crowned)) pc *= 2;
    sq[to(m)] = pc;
    return { sq, side: -p.side, quiet: Math.abs(p.sq[m.from]) === 2 && !m.caps.length ? p.quiet + 1 : 0, v: p.v };
  }

  function notation(m) {
    if (!m.caps.length) return num(m.from) + '-' + num(to(m));
    return num(m.from) + m.path.map(t => 'x' + num(t)).join('');
  }
  function parse(p, s) { return legalMoves(p).find(m => notation(m) === s) || null; }
  const key = p => p.sq.join(',') + (p.side > 0 ? 'w' : 'b');
  function count(p, side) { let n = 0, k = 0; for (const v of p.sq) if (v * side > 0) { n++; if (Math.abs(v) === 2) k++; } return { n, k }; }
  const same = (a, b) => !!a && !!b && a.from === b.from && a.path.join() === b.path.join();

  // ---------------------------------------------------------------- Computer
  function evaluate(p) {
    const kingVal = VARIANTS[p.v].flying ? 330 : 190;
    let score = 0, n = 0;
    for (let i = 0; i < 64; i++) {
      const pc = p.sq[i];
      if (!pc) continue;
      n++;
      const side = pc > 0 ? 1 : -1, r = i >> 3, c = i & 7;
      let v;
      if (Math.abs(pc) === 2) v = kingVal + (c >= 2 && c <= 5 && r >= 2 && r <= 5 ? 10 : 0);
      else {
        const adv = side === 1 ? 7 - r : r;
        v = 100 + adv * adv;
        if (adv === 0) v += 12;
        if (c >= 2 && c <= 5) v += 4;
      }
      score += side * v;
    }
    if (score > 150) score += (24 - n) * 6; else if (score < -150) score -= (24 - n) * 6;
    return score * p.side;
  }

  function findBest(p, maxDepth, timeMs, noise) {
    const deadline = Date.now() + timeMs;
    let stop = false, nodes = 0;
    function search(q, depth, alpha, beta, ply) {
      if ((++nodes & 1023) === 0 && Date.now() > deadline) stop = true;
      if (stop) return 0;
      let moves;
      if (depth <= 0) {
        if (ply > 40 || !hasCapture(q)) return evaluate(q);
      }
      moves = legalMoves(q);
      if (!moves.length) return -100000 + ply;
      if (q.quiet >= 50) return 0;
      for (const m of moves) {
        const sc = -search(make(q, m), depth - 1, -beta, -alpha, ply + 1);
        if (stop) return 0;
        if (sc > alpha) { alpha = sc; if (alpha >= beta) break; }
      }
      return alpha;
    }
    const moves = legalMoves(p);
    if (!moves.length) return null;
    if (moves.length === 1) return moves[0];
    let best = moves[0];
    for (let depth = 1; depth <= maxDepth; depth++) {
      let alpha = -1000000, bestNow = null, bestScore = -1000000;
      for (const m of moves) {
        let sc = -search(make(p, m), depth - 1, -1000000, -alpha, 1);
        if (stop) break;
        if (noise > 0) sc += Math.floor(Math.random() * noise);
        if (sc > bestScore) { bestScore = sc; bestNow = m; }
        if (sc > alpha) alpha = sc;
      }
      if (stop) break;
      if (bestNow) best = bestNow;
      moves.splice(moves.indexOf(best), 1); moves.unshift(best);
      if (Math.abs(bestScore) > 90000) break;
      if (Date.now() > deadline - timeMs / 3 && depth >= 2) break;
    }
    return best;
  }

  return { VARIANTS, ORDER, DESCRIPTIONS, dark, num, fromNum, start, legalMoves, make, notation, parse, key, count, same, to, findBest };
})();
if (typeof module !== 'undefined') module.exports = Dame;
