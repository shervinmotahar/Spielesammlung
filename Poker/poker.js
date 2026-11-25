// Poker – Texas Hold'em (No Limit), 1:1 aus Regeln.cs der Windows-App (F:\Claude\Spielesammlung\Poker\src\Regeln.cs):
// Handbewertung, Setzrunden, Nebentöpfe, Computer-Spieler. Karte = { r: 2 … 14, s: 0 Pik, 1 Herz, 2 Karo, 3 Kreuz, down }
'use strict';
const PokerGame = (function () {
  const NAMES = ['Höchste Karte', 'Ein Paar', 'Zwei Paare', 'Drilling', 'Straße', 'Flush', 'Full House', 'Vierling', 'Straight Flush'];
  const LABELS = ['', '', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'B', 'D', 'K', 'A'];
  const BOT_NAMES = ['Anna', 'Ben', 'Clara', 'David', 'Emma'];
  const STYLES = [[1.05, 0.55, 0.06], [0.85, 0.35, 0.03], [1.15, 0.75, 0.10], [0.95, 0.5, 0.05], [0.8, 0.65, 0.12]];
  const id = c => (c.r - 2) * 4 + c.s;
  const cardText = c => LABELS[c.r] + '♠♥♦♣'[c.s];

  function straight(mask) {
    if (mask & (1 << 14)) mask |= 1 << 1;
    for (let hi = 14; hi >= 5; hi--) if (((mask >> (hi - 4)) & 31) === 31) return hi;
    return 0;
  }
  function kick(cnt, k, x1, x2) { let v = 0; for (let r = 14; r >= 2 && k > 0; r--) if (cnt[r] > 0 && r !== x1 && r !== x2) { v = v * 16 + r; k--; } return v; }
  const make = (cat, k) => cat * 0x100000 + k;
  // Wert der besten 5 aus n Karten-Ids (0–51); größer = besser
  function evaluate(ids, n) {
    const cnt = new Array(15).fill(0), sc = [0, 0, 0, 0], sm = [0, 0, 0, 0];
    let mask = 0;
    for (let i = 0; i < n; i++) { const r = (ids[i] >> 2) + 2, s = ids[i] & 3; cnt[r]++; sc[s]++; sm[s] |= 1 << r; mask |= 1 << r; }
    for (let s = 0; s < 4; s++) if (sc[s] >= 5) {
      const sf = straight(sm[s]);
      if (sf) return make(8, sf);
      let fl = 0, k = 0;
      for (let r = 14; r >= 2 && k < 5; r--) if (sm[s] & (1 << r)) { fl = fl * 16 + r; k++; }
      return make(5, fl);
    }
    let quad = 0, t1 = 0, t2 = 0, p1 = 0, p2 = 0;
    for (let r = 14; r >= 2; r--) {
      if (cnt[r] === 4) quad = r;
      else if (cnt[r] === 3) { if (!t1) t1 = r; else if (!t2) t2 = r; }
      else if (cnt[r] === 2) { if (!p1) p1 = r; else if (!p2) p2 = r; }
    }
    if (quad) return make(7, quad * 16 + kick(cnt, 1, quad, 0));
    if (t1 && (t2 || p1)) return make(6, t1 * 16 + Math.max(t2, p1));
    const st = straight(mask);
    if (st) return make(4, st);
    if (t1) return make(3, t1 * 256 + kick(cnt, 2, t1, 0));
    if (p2) return make(2, (p1 * 16 + p2) * 16 + kick(cnt, 1, p1, p2));
    if (p1) return make(1, p1 * 4096 + kick(cnt, 3, p1, 0));
    return make(0, kick(cnt, 5, 0, 0));
  }
  const handName = v => NAMES[Math.floor(v / 0x100000)];

  function Game() {
    this.players = []; this.board = []; this.deck = [];
    this.dealer = -1; this.toAct = -1; this.sb = 10; this.bb = 20; this.handNo = 0;
    this.currentBet = 0; this.minRaise = 20; this.street = 'over'; this.rising = true; this.level = 2;
    this.log = []; this.result = ''; this.sbPos = -1; this.bbPos = -1;
  }
  const STREETS = ['preflop', 'flop', 'turn', 'river', 'showdown', 'over'];
  const G = Game.prototype;
  G.human = function () { return this.players.find(p => p.human); };
  G.pot = function () { return this.players.reduce((t, p) => t + p.total, 0); };
  G.activeCount = function () { return this.players.filter(p => !p.out).length; };
  G.inHandCount = function () { return this.players.filter(p => !p.out && !p.folded).length; };
  G.tournamentOver = function () { return this.activeCount() < 2 || this.human().out; };
  G.humanToAct = function () { return STREETS.indexOf(this.street) <= 3 && this.toAct >= 0 && this.players[this.toAct].human; };
  const inHand = p => !p.out && !p.folded, canAct = p => !p.out && !p.folded && !p.allIn;

  G.setup = function (opponents, chips, level, rising) {
    const mk = (name, human, st) => ({ name, human, chips, bet: 0, total: 0, cards: [], folded: false, allIn: false, acted: false, out: false,
                                       tight: st ? st[0] : 1, aggro: st ? st[1] : 0.5, bluff: st ? st[2] : 0.05, last: '', won: 0, hv: -1, place: 0 });
    this.players = [mk('Du', true, null)];
    for (let i = 0; i < opponents; i++) this.players.push(mk(BOT_NAMES[i], false, STYLES[i]));
    this.level = level; this.rising = rising; this.sb = 10; this.bb = 20; this.handNo = 0;
    this.dealer = Math.floor(Math.random() * this.players.length); this.street = 'over'; this.log = [];
  };
  G.next = function (i, f) {
    for (let k = 1; k <= this.players.length; k++) { const j = (i + k) % this.players.length; if (f(this.players[j])) return j; }
    return -1;
  };
  G.startHand = function () {
    this.handNo++;
    if (this.rising && this.handNo > 1 && (this.handNo - 1) % 10 === 0) {
      this.sb = Math.round(this.sb * 1.5 / 5) * 5; this.bb = this.sb * 2;
      this.log.push('Die Blinds steigen auf ' + this.sb + ' / ' + this.bb + '.');
    }
    this.board = []; this.deck = [];
    for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) this.deck.push({ r, s, down: false });
    for (let i = this.deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]]; }
    for (const p of this.players) { p.bet = p.total = 0; p.folded = p.out; p.allIn = false; p.acted = false; p.last = ''; p.won = 0; p.hv = -1; p.cards = []; }
    this.dealer = this.next(this.dealer, p => !p.out);
    const headsUp = this.activeCount() === 2;
    this.sbPos = headsUp ? this.dealer : this.next(this.dealer, p => !p.out);
    this.bbPos = this.next(this.sbPos, p => !p.out);
    for (const p of this.players) if (!p.out) { p.cards = [this.deck.shift(), this.deck.shift()]; if (!p.human) p.cards.forEach(c => { c.down = true; }); }
    this.post(this.players[this.sbPos], this.sb, 'Small Blind');
    this.post(this.players[this.bbPos], this.bb, 'Big Blind');
    this.currentBet = this.bb; this.minRaise = this.bb;
    this.street = 'preflop'; this.result = '';
    this.log.push('— Hand ' + this.handNo + ' —  Blinds ' + this.sb + ' / ' + this.bb + ', Geber: ' + this.players[this.dealer].name);
    this.toAct = this.next(this.bbPos, canAct);
    if (!this.needsAction()) this.toAct = -1;
  };
  G.post = function (p, amount, what) {
    const a = Math.min(amount, p.chips);
    p.chips -= a; p.bet += a; p.total += a;
    if (p.chips === 0) p.allIn = true;
    p.last = what + ' ' + a;
  };
  G.toCall = function (p) { return Math.min(this.currentBet - p.bet, p.chips); };
  G.minRaiseTo = function (p) { return Math.min(this.currentBet + this.minRaise, p.bet + p.chips); };
  G.maxRaiseTo = function (p) { return p.bet + p.chips; };
  G.canRaise = function (p) { return p.chips > this.currentBet - p.bet; };

  G.act = function (a, raiseTo) {
    const p = this.players[this.toAct];
    if (a === 'fold') { p.folded = true; p.last = 'Aussteigen'; this.log.push(p.human ? 'Du steigst aus.' : p.name + ' steigt aus.'); }
    else if (a === 'check') {
      if (this.currentBet > p.bet) return this.act('call');
      p.last = 'Schieben'; this.log.push(p.human ? 'Du schiebst.' : p.name + ' schiebt.');
    } else if (a === 'call') {
      const c = this.toCall(p);
      if (c === 0) return this.act('check');
      p.chips -= c; p.bet += c; p.total += c;
      if (p.chips === 0) p.allIn = true;
      p.last = p.allIn ? 'All-in ' + p.bet : 'Mitgehen ' + c;
      this.log.push((p.human ? 'Du gehst' : p.name + ' geht') + (p.allIn ? ' mit ' + c + ' all-in.' : ' mit (' + c + ').'));
    } else {
      raiseTo = Math.max(this.minRaiseTo(p), Math.min(raiseTo, this.maxRaiseTo(p)));
      if (raiseTo <= this.currentBet) return this.act('call');
      const add = raiseTo - p.bet, wasBet = this.currentBet === 0;
      if (raiseTo - this.currentBet >= this.minRaise) this.minRaise = raiseTo - this.currentBet;
      p.chips -= add; p.bet = raiseTo; p.total += add;
      this.currentBet = raiseTo;
      if (p.chips === 0) p.allIn = true;
      for (const o of this.players) if (o !== p) o.acted = false;
      p.last = (p.allIn ? 'All-in ' : wasBet ? 'Setzt ' : 'Erhöht auf ') + raiseTo;
      this.log.push(p.human ? (p.allIn ? 'Du gehst all-in (' + raiseTo + ').' : wasBet ? 'Du setzt ' + raiseTo + '.' : 'Du erhöhst auf ' + raiseTo + '.')
                            : p.name + (p.allIn ? ' geht all-in (' + raiseTo + ').' : wasBet ? ' setzt ' + raiseTo + '.' : ' erhöht auf ' + raiseTo + '.'));
    }
    p.acted = true;
    if (this.inHandCount() === 1) { this.toAct = -1; return; }
    this.toAct = this.next(this.toAct, q => canAct(q) && (!q.acted || q.bet < this.currentBet));
    if (!this.needsAction()) this.toAct = -1;
  };
  G.needsAction = function () {
    const n = this.players.filter(canAct).length;
    for (const p of this.players) if (canAct(p) && (!p.acted || p.bet < this.currentBet)) return n > 1 || p.bet < this.currentBet;
    return false;
  };

  // Nächster automatischer Schritt; true = etwas ist passiert, false = du bist dran oder die Hand ist vorbei
  G.step = function () {
    if (this.street === 'over') return false;
    if (this.street === 'showdown') { this.showdown(); return true; }
    if (this.inHandCount() === 1) {
      const w = this.players.find(inHand), pot = this.pot();
      w.chips += pot; w.won = pot;
      for (const p of this.players) p.bet = 0;
      this.result = (w.human ? 'Du gewinnst ' : w.name + ' gewinnt ') + pot + ' – alle anderen sind ausgestiegen.';
      this.log.push(this.result);
      this.endHand();
      return true;
    }
    if (this.toAct >= 0) {
      const p = this.players[this.toAct];
      if (p.human) return false;
      const d = decide(this, p);
      this.act(d.act, d.raiseTo);
      return true;
    }
    for (const p of this.players) { p.bet = 0; p.acted = false; }
    this.currentBet = 0; this.minRaise = this.bb;
    if (this.street === 'river') { this.street = 'showdown'; return true; }
    this.street = STREETS[STREETS.indexOf(this.street) + 1];
    const n = this.street === 'flop' ? 3 : 1;
    this.deck.shift();
    for (let i = 0; i < n; i++) this.board.push(this.deck.shift());
    this.log.push((this.street === 'flop' ? 'Flop: ' : this.street === 'turn' ? 'Turn: ' : 'River: ') + this.board.slice(this.street === 'flop' ? 0 : -1).map(cardText).join(' '));
    for (const p of this.players) if (canAct(p)) p.last = '';
    this.toAct = this.next(this.dealer, canAct);
    if (!this.needsAction()) this.toAct = -1;
    return true;
  };
  G.evaluate = function (p) { const ids = p.cards.concat(this.board).map(id); return evaluate(ids, ids.length); };
  G.showdown = function () {
    for (const p of this.players) if (inHand(p)) p.hv = this.evaluate(p);
    const levels = [...new Set(this.players.filter(p => p.total > 0).map(p => p.total))].sort((a, b) => a - b);
    let prev = 0, potNo = 0;
    const lines = [];
    for (const lv of levels) {
      let amount = 0;
      for (const p of this.players) amount += Math.max(0, Math.min(p.total, lv) - prev);
      let elig = this.players.filter(p => inHand(p) && p.total >= lv);
      prev = lv;
      if (!amount) continue;
      if (!elig.length) elig = this.players.filter(inHand);
      const best = Math.max(...elig.map(p => p.hv));
      const winners = elig.filter(p => p.hv === best);
      const share = Math.floor(amount / winners.length), rest = amount - share * winners.length;
      for (const w of winners) { w.chips += share; w.won += share; }
      winners[0].chips += rest; winners[0].won += rest;
      potNo++;
      lines.push((levels.length > 1 ? (potNo === 1 ? 'Haupttopf ' : 'Nebentopf ') : '') + amount + ' an ' + winners.map(w => w.human ? 'dich' : w.name).join(' und ') + ' (' + handName(best) + ')');
    }
    for (const p of this.players) if (inHand(p)) p.cards.forEach(c => { c.down = false; });
    const h = this.human();
    this.result = inHand(h) && h.won > 0 ? (h.won >= this.pot() ? 'Du gewinnst ' : 'Du bekommst ') + h.won + ' (' + handName(h.hv) + ').' : lines.join(' · ') + '.';
    lines.forEach(l => this.log.push(l + '.'));
    this.endHand();
  };
  G.endHand = function () {
    this.street = 'over'; this.toAct = -1;
    const place = this.activeCount();
    const busted = this.players.filter(p => !p.out && p.chips === 0);
    for (const p of busted) { p.out = true; p.place = place; this.log.push(p.name + (p.human ? ' bist' : ' ist') + ' ausgeschieden (Platz ' + place + ').'); }
    if (this.activeCount() === 1) this.players.forEach(p => { if (!p.out) p.place = 1; });
  };
  G.effectiveOpponents = function () { const o = this.inHandCount() - 1; return this.street === 'preflop' ? Math.min(o, 2) : o; };
  // Gewinnchance (Monte-Carlo gegen zufällige Karten der Gegner)
  G.equity = function (p, samples) {
    const opp = this.effectiveOpponents();
    if (opp <= 0) return 1;
    const known = new Set(p.cards.concat(this.board).map(id));
    const deck = [];
    for (let i = 0; i < 52; i++) if (!known.has(i)) deck.push(i);
    const need = 5 - this.board.length, boardIds = this.board.map(id), mine = new Array(7), theirs = new Array(7);
    let score = 0;
    for (let s = 0; s < samples; s++) {
      const take = need + 2 * opp;
      for (let i = 0; i < take; i++) { const j = i + Math.floor(Math.random() * (deck.length - i)); const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
      let n = 0;
      for (const b of boardIds) mine[n++] = b;
      for (let i = 0; i < need; i++) mine[n++] = deck[i];
      const bn = n;
      mine[n++] = id(p.cards[0]); mine[n++] = id(p.cards[1]);
      const me = evaluate(mine, n);
      let better = 0, ties = 0;
      for (let o = 0; o < opp; o++) {
        for (let i = 0; i < bn; i++) theirs[i] = mine[i];
        theirs[bn] = deck[need + 2 * o]; theirs[bn + 1] = deck[need + 2 * o + 1];
        const v = evaluate(theirs, bn + 2);
        if (v > me) { better++; break; }
        if (v === me) ties++;
      }
      if (!better) score += 1 / (ties + 1);
    }
    return score / samples;
  };

  // Computer-Spieler: wie Bot.Decide in Regeln.cs
  function decide(g, p) {
    const eq0 = g.equity(p, g.level === 1 ? 120 : g.level === 2 ? 350 : 800);
    let eq = eq0;
    if (g.level === 1) eq += (Math.random() - 0.5) * 0.25;
    const opp = g.effectiveOpponents(), toCall = g.toCall(p), pot = g.pot();
    const fair = 1 / (opp + 1), potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
    const strong = Math.min(0.85, fair * (g.level === 3 ? 1.7 : 1.6) * p.tight);
    const r = Math.random();
    const size = frac => Math.min(g.maxRaiseTo(p), Math.max(g.minRaiseTo(p), g.currentBet + Math.max(g.minRaise, Math.floor(pot * frac / 10) * 10)));
    if (toCall === 0) {
      if (eq > strong && r < 0.35 + p.aggro * 0.6 && g.canRaise(p)) return { act: 'raise', raiseTo: size(eq > 0.8 ? 0.9 : 0.6) };
      if (r < p.bluff && g.canRaise(p) && opp <= 2) return { act: 'raise', raiseTo: size(0.5) };
      return { act: 'check' };
    }
    const commit = toCall / Math.max(1, p.chips + p.bet);
    const margin = g.level === 1 ? -0.05 : 0.02 + commit * 0.08;
    if (eq < potOdds * p.tight + margin) {
      if (r < p.bluff * 0.5 && g.canRaise(p) && opp === 1 && g.street !== 'river') return { act: 'raise', raiseTo: size(0.8) };
      return { act: 'fold' };
    }
    if (eq > strong && r < 0.25 + p.aggro * 0.55 && g.canRaise(p)) return { act: 'raise', raiseTo: eq > 0.85 ? g.maxRaiseTo(p) : size(eq > 0.7 ? 1 : 0.7) };
    return { act: 'call' };
  }

  return { Game, NAMES, LABELS, handName, cardText, evaluate, id, decide, STREETS };
})();
