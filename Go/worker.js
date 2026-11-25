// Go – Computer rechnet im Hintergrund (Zug, Tipp oder tote Steine), damit die Oberfläche flüssig bleibt.
importScripts('go.js');
self.onmessage = e => {
  const { id, kind, board, playouts, time } = e.data;
  const b = GoGame.fromJSON(board);
  let result;
  if (kind === 'think') result = GoGame.think(b, playouts, time);
  else if (kind === 'hint') result = GoGame.findBest(b, playouts, time);
  else result = Array.from(GoGame.guessDead(b));
  self.postMessage({ id, result });
};
