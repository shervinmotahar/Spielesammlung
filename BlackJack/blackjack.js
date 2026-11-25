// Black Jack – Regeln, 1:1 aus Karten.cs der Windows-App übertragen (F:\Claude\Spielesammlung\BlackJack\src\Karten.cs).
// Karte = { r: 1 (Ass) … 13 (König), s: 0 Pik, 1 Herz, 2 Karo, 3 Kreuz, down: verdeckt }
'use strict';
const BJ = (function () {
  const LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'B', 'D', 'K'];
  const CODES = '?A23456789TJQK', SUITS = 'SHDC';
  const MIN_BET = 10, CHIPS = [10, 50, 100, 500];

  const value = c => c.r >= 10 ? 10 : c.r;
  const isRed = c => c.s === 1 || c.s === 2;
  const hiLo = c => c.r >= 2 && c.r <= 6 ? 1 : c.r >= 7 && c.r <= 9 ? 0 : -1;
  const code = c => CODES[c.r] + SUITS[c.s] + (c.down ? '*' : '');
  function parse(s) {
    if (!s || s.length < 2) return null;
    const r = CODES.indexOf(s[0]), su = SUITS.indexOf(s[1]);
    if (r < 1 || su < 0) return null;
    return { r, s: su, down: s.length > 2 && s[2] === '*' };
  }

  // ---------------------------------------------------------------- Hand
  function newHand(bet) {
    return { cards: [], bet: bet || 0, doubled: false, done: false, splitAces: false, fromSplit: false, surrendered: false, net: 0, outcome: null };
  }
  function totalInfo(h) {
    let t = 0, ace = false;
    for (const c of h.cards) { if (c.down) continue; t += value(c); if (c.r === 1) ace = true; }
    const soft = ace && t + 10 <= 21;
    return { t: soft ? t + 10 : t, soft };
  }
  const total = h => totalInfo(h).t;
  function trueTotal(h) {
    let t = 0, ace = false;
    for (const c of h.cards) { t += value(c); if (c.r === 1) ace = true; }
    return ace && t + 10 <= 21 ? t + 10 : t;
  }
  const busted = h => total(h) > 21;
  const isBlackjack = h => h.cards.length === 2 && !h.fromSplit && !h.cards[0].down && !h.cards[1].down && total(h) === 21;
  function scoreText(h) {
    if (h.cards.length === 0) return '';
    if (isBlackjack(h)) return 'Blackjack';
    const { t, soft } = totalInfo(h);
    if (t > 21) return t + ' – überkauft';
    return soft && t < 21 ? (t - 10) + ' / ' + t : String(t);
  }
  const codes = h => h.cards.map(code).join(' ');

  // ---------------------------------------------------------------- Spiel
  function Game() {
    this.shoe = []; this.shoeTotal = 0; this.decks = 6; this.runningCount = 0;
    this.hitSoft17 = false; this.allowSurrender = true; this.offerInsurance = true;
    this.bankroll = 1000; this.startBankroll = 1000; this.bet = 50;
    this.phase = 'betting';            // betting, dealing, insurance, player, dealer, over
    this.hands = []; this.dealer = newHand(0); this.active = 0; this.insurance = 0;
    this.shuffled = false; this.note = null; this.roundNet = 0;
  }
  const P = Game.prototype;

  P.newShoe = function () {
    const s = [];
    for (let d = 0; d < this.decks; d++) for (let su = 0; su < 4; su++) for (let r = 1; r <= 13; r++) s.push({ r, s: su, down: false });
    for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = s[i]; s[i] = s[j]; s[j] = t; }
    this.shoe = s; this.shoeTotal = s.length; this.runningCount = 0;
  };
  P.needsShuffle = function () { return this.shoe.length < Math.max(20, Math.floor(this.shoeTotal / 4)) || this.shoeTotal !== this.decks * 52; };
  P.current = function () { return this.active >= 0 && this.active < this.hands.length ? this.hands[this.active] : null; };
  P.up = function () { return this.dealer.cards[0] || null; };
  P.isBetting = function () { return this.phase === 'betting' || this.phase === 'over'; };
  P.canDeal = function () { return this.isBetting() && this.bet >= MIN_BET && this.bet <= this.bankroll; };
  P.broke = function () { return this.isBetting() && this.bankroll < MIN_BET; };
  P.fitBet = function () {
    if (this.bet > this.bankroll) this.bet = Math.floor(this.bankroll / 10) * 10;
    if (this.bet < MIN_BET && this.bankroll >= MIN_BET) this.bet = MIN_BET;
  };

  P.startRound = function () {
    this.shuffled = false;
    if (this.needsShuffle()) { this.newShoe(); this.shuffled = true; }
    this.hands = [newHand(this.bet)];
    this.dealer = newHand(0);
    this.bankroll -= this.bet;
    this.active = 0; this.insurance = 0; this.roundNet = 0;
    this.note = this.shuffled ? 'Die Karten wurden neu gemischt.' : null;
    this.phase = 'dealing';
  };

  P.draw = function () { if (this.shoe.length === 0) this.newShoe(); return this.shoe.shift(); };
  P.give = function (h, down) {
    const c = this.draw();
    c.down = !!down;
    if (!down) this.runningCount += hiLo(c);
    h.cards.push(c);
  };

  // Nächster automatischer Schritt. true = es ist etwas passiert (kurz warten, erneut aufrufen).
  P.step = function () {
    switch (this.phase) {
      case 'dealing': {
        const n = this.hands[0].cards.length + this.dealer.cards.length;
        if (n === 0 || n === 2) this.give(this.hands[0], false);
        else if (n === 1) this.give(this.dealer, false);
        else if (n === 3) this.give(this.dealer, true);
        else {
          if (this.offerInsurance && this.up().r === 1 && this.bankroll >= Math.floor(this.hands[0].bet / 2)) { this.phase = 'insurance'; return false; }
          this.peek();
        }
        return true;
      }
      case 'player': {
        const h = this.current();
        if (!h) { this.phase = 'dealer'; return true; }
        if (h.cards.length === 1) {
          this.give(h, false);
          if (h.splitAces || total(h) === 21) h.done = true;
          return true;
        }
        if (h.done) {
          this.active++;
          if (this.active >= this.hands.length) { this.active = this.hands.length - 1; this.phase = 'dealer'; }
          return true;
        }
        return false;
      }
      case 'dealer': {
        const hole = this.dealer.cards[1];
        if (hole && hole.down) { hole.down = false; this.runningCount += hiLo(hole); return true; }
        if (this.anyLiveHand() && this.dealerMustHit()) { this.give(this.dealer, false); return true; }
        this.settle();
        return false;
      }
    }
    return false;
  };

  P.anyLiveHand = function () {
    if (isBlackjack(this.dealer)) return false;
    return this.hands.some(h => !busted(h) && !h.surrendered && !isBlackjack(h));
  };
  P.dealerMustHit = function () {
    const { t, soft } = totalInfo(this.dealer);
    return t < 17 || (t === 17 && soft && this.hitSoft17);
  };
  P.takeInsurance = function (yes) {
    if (this.phase !== 'insurance') return;
    if (yes) { this.insurance = Math.floor(this.hands[0].bet / 2); this.bankroll -= this.insurance; }
    this.peek();
  };
  P.peek = function () {
    const p = this.hands[0], up = this.up();
    const dealerBj = trueTotal(this.dealer) === 21 && (up.r === 1 || value(up) === 10);
    if (dealerBj) { this.phase = 'dealer'; this.note = 'Die Bank hat Blackjack.'; return; }
    if (this.insurance > 0) this.note = 'Die Bank hat keinen Blackjack – die Versicherung ist verloren.';
    if (isBlackjack(p)) { p.done = true; this.phase = 'dealer'; return; }
    this.phase = 'player';
  };

  // ---------------------------------------------------------------- Aktionen
  P.canHit = function () { const h = this.current(); return this.phase === 'player' && !!h && !h.done && h.cards.length >= 2; };
  P.canDouble = function () { const h = this.current(); return this.canHit() && h.cards.length === 2 && !h.splitAces && this.bankroll >= h.bet; };
  P.canSplit = function () {
    const h = this.current();
    return this.canHit() && h.cards.length === 2 && value(h.cards[0]) === value(h.cards[1]) && this.hands.length < 4 && this.bankroll >= h.bet && !h.splitAces;
  };
  P.canSurrender = function () { const h = this.current(); return this.allowSurrender && this.canHit() && this.hands.length === 1 && h.cards.length === 2 && !h.fromSplit; };
  P.can = function (a) {
    switch (a) {
      case 'hit': case 'stand': return this.canHit();
      case 'double': return this.canDouble();
      case 'split': return this.canSplit();
      default: return this.canSurrender();
    }
  };
  P.act = function (a) {
    if (!this.can(a)) return;
    const h = this.current();
    this.note = null;
    if (a === 'hit') { this.give(h, false); if (total(h) >= 21) h.done = true; }
    else if (a === 'stand') h.done = true;
    else if (a === 'double') { this.bankroll -= h.bet; h.bet *= 2; h.doubled = true; this.give(h, false); h.done = true; }
    else if (a === 'split') {
      this.bankroll -= h.bet;
      const h2 = newHand(h.bet);
      h2.fromSplit = true;
      h2.cards.push(h.cards.pop());
      h.fromSplit = true;
      if (h.cards[0].r === 1) { h.splitAces = true; h2.splitAces = true; }
      this.hands.splice(this.active + 1, 0, h2);
    } else { h.surrendered = true; h.done = true; }
  };

  P.settle = function () {
    const dealer = total(this.dealer), dealerBj = isBlackjack(this.dealer), dealerBust = dealer > 21;
    let net = 0;
    for (const h of this.hands) {
      let ret;
      if (h.surrendered) { ret = Math.floor(h.bet / 2); h.outcome = 'Aufgegeben'; }
      else if (busted(h)) { ret = 0; h.outcome = 'Überkauft'; }
      else if (isBlackjack(h)) { ret = dealerBj ? h.bet : h.bet + Math.floor(h.bet * 3 / 2); h.outcome = dealerBj ? 'Unentschieden' : 'Blackjack'; }
      else if (dealerBj) { ret = 0; h.outcome = 'Verloren'; }
      else if (dealerBust || total(h) > dealer) { ret = 2 * h.bet; h.outcome = 'Gewonnen'; }
      else if (total(h) === dealer) { ret = h.bet; h.outcome = 'Unentschieden'; }
      else { ret = 0; h.outcome = 'Verloren'; }
      h.net = ret - h.bet;
      this.bankroll += ret;
      net += h.net;
    }
    if (this.insurance > 0) {
      if (dealerBj) { this.bankroll += 3 * this.insurance; net += 2 * this.insurance; }
      else net -= this.insurance;
    }
    this.roundNet = net;
    this.phase = 'over';
  };

  P.roundOutcome = function () {
    if (this.hands.length === 1) return this.hands[0].outcome === 'Verloren' && isBlackjack(this.dealer) ? 'Bank Blackjack' : this.hands[0].outcome;
    return this.roundNet > 0 ? 'Gewonnen' : this.roundNet < 0 ? 'Verloren' : 'Unentschieden';
  };
  P.playerScores = function () { return this.hands.map(h => h.surrendered ? 'aufg.' : isBlackjack(h) ? 'BJ' : String(total(h))).join(' / '); };
  P.dealerScore = function () { return isBlackjack(this.dealer) ? 'BJ' : String(total(this.dealer)); };
  P.totalWagered = function () { return this.hands.reduce((s, h) => s + h.bet, this.insurance); };
  P.trueCount = function () { return this.runningCount / Math.max(0.5, this.shoe.length / 52); };

  // ---------------------------------------------------------------- Grundstrategie (Tipp)
  function splitPair(v, up) {
    switch (v) {
      case 1: case 8: return true;
      case 10: case 5: return false;
      case 9: return up <= 9 && up !== 7;
      case 7: return up <= 7;
      case 6: return up <= 6;
      case 4: return up === 5 || up === 6;
      default: return up <= 7;
    }
  }
  function pairName(c) { return c.r === 1 ? 'Asse' : value(c) === 10 ? 'Zehner' : value(c) + 'er'; }

  function advise(g) {
    const h = g.current();
    const up = g.up().r === 1 ? 11 : value(g.up());
    const upName = up === 11 ? 'ein Ass' : up === 10 ? 'eine Zehn' : 'eine ' + up;
    const { t, soft } = totalInfo(h);
    const h17 = g.hitSoft17;
    const pair = h.cards.length === 2 && value(h.cards[0]) === value(h.cards[1]);
    if (pair && g.canSplit() && splitPair(value(h.cards[0]), up))
      return { act: 'split', reason: 'ein Paar ' + pairName(h.cards[0]) + ', die Bank zeigt ' + upName };
    if (g.canSurrender() && !soft && !pair &&
        ((t === 16 && up >= 9) || (t === 15 && (up === 10 || (h17 && up === 11))) || (h17 && t === 17 && up === 11)))
      return { act: 'surrender', reason: 'harte ' + t + ' gegen ' + upName + ' verliert meistens' };
    let a, kind;
    if (soft) {
      kind = 'weiche ' + t;
      if (t >= 20) a = 'stand';
      else if (t === 19) a = h17 && up === 6 ? 'double' : 'stand';
      else if (t === 18) a = up >= 2 && up <= 6 && (h17 || up >= 3) ? 'double' : up <= 8 ? 'stand' : 'hit';
      else if (t === 17) a = up >= 3 && up <= 6 ? 'double' : 'hit';
      else if (t >= 15) a = up >= 4 && up <= 6 ? 'double' : 'hit';
      else a = up >= 5 && up <= 6 ? 'double' : 'hit';
      if (a === 'double' && !g.canDouble()) a = t >= 18 ? 'stand' : 'hit';
    } else {
      kind = 'harte ' + t;
      if (t >= 17) a = 'stand';
      else if (t >= 13) a = up <= 6 ? 'stand' : 'hit';
      else if (t === 12) a = up >= 4 && up <= 6 ? 'stand' : 'hit';
      else if (t === 11) a = up === 11 && !h17 ? 'hit' : 'double';
      else if (t === 10) a = up <= 9 ? 'double' : 'hit';
      else if (t === 9) a = up >= 3 && up <= 6 ? 'double' : 'hit';
      else a = 'hit';
      if (a === 'double' && !g.canDouble()) a = 'hit';
    }
    return { act: a, reason: kind + ' gegen ' + upName };
  }
  const ACT_NAMES = { hit: 'Karte ziehen', stand: 'Stehen bleiben', double: 'Verdoppeln', split: 'Teilen', surrender: 'Aufgeben' };

  return { Game, LABELS, MIN_BET, CHIPS, ACT_NAMES, value, isRed, code, parse, newHand, total, totalInfo, busted, isBlackjack, scoreText, codes, advise };
})();
